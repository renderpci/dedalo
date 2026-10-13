/**
 * The two row-lock primitives the tree's lock law is built on
 * (src/core/db/matrix_write.ts) — gated DIRECTLY, not only through
 * relations/parent.ts, whose own transaction refusals and child-row
 * `FOR UPDATE` would otherwise mask a weakened primitive (measured: with only
 * the tree gates, dropping the primitive's transaction guard, weakening
 * `FOR SHARE` to `FOR KEY SHARE`, or dropping the `ORDER BY` of the batch lock
 * all stayed green).
 *
 *   K1  lockMatrixRowsForUpdate / readMatrixKeyForShare outside a transaction
 *       refuse (internal.invariant) — even for an empty set
 *   K2  a non-integer section_id in a lock batch refuses (internal.invariant)
 *   K2b a table outside the matrix allowlist refuses BEFORE any SQL — the batch
 *       interpolates the table name into its statement (identifier allowlist)
 *   K3  STRENGTH: a share read WAITS behind a plain UPDATE (the implicit
 *       `FOR NO KEY UPDATE` a lock-less writer takes) and answers the version
 *       that writer committed — `FOR KEY SHARE` would read straight past it
 *   K4  ORDER: the batch locks rows in section_id order WHATEVER the plan —
 *       under a forced sequential scan whose physical order is the reverse of
 *       the id order, the lower id is already locked while the batch waits on
 *       the higher one
 *   K5  GROUP ORDER: a batch spanning two sections locks them in ONE section
 *       order whatever order the caller lists them — two batches naming the
 *       same two rows in opposite orders, plain transactions → no deadlock
 *   K6  WRITER STRENGTH (lock-law rule 1): a held `readMatrixKeyForUpdate` —
 *       the save engine's lockComponentKey, the writeKeys before-image, every
 *       parent.ts mutation — makes BOTH a second writer's locked read and a
 *       cycle walk's share read WAIT, and each then answers the committed value.
 *       A share-strength writer lock would let two read-modify-writers both
 *       read, then both try to upgrade: 40P01 — hidden by the tree doors' retry,
 *       a failed save at the save door, which has none
 *
 * SITUATION: scratch TLD `zzrlk` (test/helpers/tree_lock_situation.ts), records
 * created at runtime, swept with the TLD. Postgres is the clock (lock_wait.ts).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	lockMatrixRowsForUpdate,
	readMatrixKeyForShare,
	readMatrixKeyForUpdate,
} from '../../src/core/db/matrix_write.ts';
import { sql, sqlStateOf, withTransaction } from '../../src/core/db/postgres.ts';
import { isDedaloError } from '../../src/core/errors/index.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import {
	currentBackendPid,
	holdRows,
	settle,
	waitForLockWaiters,
	waitUntilBlockedBy,
} from '../helpers/lock_wait.ts';
import {
	dropTreeSituation,
	ensureTreeSituation,
	newNodes,
	parentIds,
	parentLink,
	seedLinks,
	treeSituation,
} from '../helpers/tree_lock_situation.ts';

const TREE = treeSituation('zzrlk');
const PLAIN = TREE.plain;
const ORDERED = TREE.ordered;
const WAIT_MS = 15_000;

beforeAll(async () => {
	await ensureTreeSituation(TREE);
}, 60_000);

afterAll(async () => {
	expect(await dropTreeSituation(TREE)).toBe(0);
}, 60_000);

function isInvariant(error: unknown): boolean {
	return isDedaloError(error) && error.code === 'internal.invariant';
}

async function refusal(run: () => Promise<unknown>): Promise<unknown> {
	try {
		await run();
	} catch (error) {
		return error;
	}
	return null;
}

/** The physical position of a row (ctid as [page, offset]). */
async function physicalPosition(id: number): Promise<[number, number]> {
	const rows = (await sql.unsafe(
		`SELECT ctid::text AS c FROM "${PLAIN.table}" WHERE section_tipo = $1 AND section_id = $2`,
		[PLAIN.section, id],
	)) as { c: string }[];
	const [page, offset] = (rows[0]?.c ?? '(0,0)').replace(/[()]/g, '').split(',').map(Number);
	return [page ?? 0, offset ?? 0];
}

function physicallyBefore(a: [number, number], b: [number, number]): boolean {
	return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
}

describe('matrix row-lock primitives: the transaction contract', () => {
	test('K1 outside a transaction both primitives refuse (internal.invariant)', async () => {
		const [x] = await newNodes(PLAIN, 1);
		expect(isInvariant(await refusal(() => lockMatrixRowsForUpdate([])))).toBe(true);
		expect(
			isInvariant(
				await refusal(() =>
					lockMatrixRowsForUpdate([
						{ table: PLAIN.table, sectionTipo: PLAIN.section, sectionId: x },
					]),
				),
			),
		).toBe(true);
		expect(
			isInvariant(
				await refusal(() =>
					readMatrixKeyForShare(PLAIN.table, PLAIN.section, x, 'relation', PLAIN.parent),
				),
			),
		).toBe(true);
	});

	test('K2 a non-integer section_id in a lock batch refuses (internal.invariant)', async () => {
		const error = await refusal(() =>
			withTransaction(() =>
				lockMatrixRowsForUpdate([
					{ table: PLAIN.table, sectionTipo: PLAIN.section, sectionId: Number.NaN },
				]),
			),
		);
		expect(isInvariant(error)).toBe(true);
	});

	test('K2b a table outside the matrix allowlist refuses (internal.invariant) before any SQL', async () => {
		// pg_class exists, so without the allowlist the batch would reach Postgres
		// and fail there (no section_tipo column): a SQL error, never the invariant.
		const error = await refusal(() =>
			withTransaction(() =>
				lockMatrixRowsForUpdate([
					{ table: PLAIN.table, sectionTipo: PLAIN.section, sectionId: 1 },
					{ table: 'pg_class', sectionTipo: PLAIN.section, sectionId: 1 },
				]),
			),
		);
		expect(isInvariant(error)).toBe(true);
		expect(isDedaloError(error) && error.coordinates?.table).toBe('pg_class');
	});
});

describe('matrix row-lock primitives: strength and order', () => {
	test('K3 a share read waits behind a lock-less UPDATE and answers its committed value', async () => {
		const [x, p1, p2] = await newNodes(PLAIN, 3);
		await seedLinks(PLAIN, x, [{ parent: p1, itemId: 1 }]);
		await assertTestDatabase('matrix_row_lock K3 writer');

		// A writer that takes NO explicit row lock: a plain UPDATE, held open.
		let releaseWriter: () => void = () => {};
		const writerGate = new Promise<void>((resolve) => {
			releaseWriter = resolve;
		});
		let wrote: (pid: number) => void = () => {};
		const written = new Promise<number>((resolve) => {
			wrote = resolve;
		});
		const writer = withTransaction(async () => {
			const pid = await currentBackendPid();
			await sql.unsafe(
				`UPDATE "${PLAIN.table}"
				    SET relation = jsonb_set(relation, ARRAY[$3::text], $4::text::jsonb)
				  WHERE section_tipo = $1 AND section_id = $2`,
				[PLAIN.section, x, PLAIN.parent, JSON.stringify([parentLink(PLAIN, p2, 1)])],
			);
			wrote(pid);
			await writerGate;
		});
		const writerPid = await written;

		const read = settle(
			withTransaction(() =>
				readMatrixKeyForShare(PLAIN.table, PLAIN.section, x, 'relation', PLAIN.parent),
			),
		);
		const waited = await waitUntilBlockedBy(writerPid, 1, WAIT_MS);
		releaseWriter();
		await writer;
		const outcome = await read;

		expect(waited, 'the share read did not wait on the uncommitted UPDATE').toBe(true);
		expect(outcome.status).toBe('fulfilled');
		const items = outcome.status === 'fulfilled' ? (outcome.value ?? []) : [];
		expect(items.map((item) => Number((item as { section_id: unknown }).section_id))).toEqual([p2]);
		expect(await parentIds(PLAIN, x)).toEqual([p2]);
	}, 60_000);

	test('K4 the batch locks in section_id order even when the plan scans the reverse', async () => {
		await assertTestDatabase('matrix_row_lock K4 relocation');
		// PRECONDITION: a pair whose LOWER id is stored physically AFTER the higher
		// one, so a plan-order lock would take `high` first. Placement is the
		// heap's choice (free-space map, line-pointer reuse — other gates' teardown
		// deletes leave free pages anywhere), so it is not steered: a FRESH pair is
		// drawn until one is reversed. Each pair is checked as created, then after
		// up to 4 rewrites of its lower row (a rewrite re-places the row: a new
		// line pointer after its neighbour's on a shared page, or another page when
		// its own is full). Rewriting ONE row of ONE pair is not enough — a row
		// with room on its page never leaves it (measured: 500 rewrites, never
		// reversed, in the 10-file run). Measured with fresh pairs: ≤ 5 pairs over
		// 60 draws after the tree gates' churn; bounded, and asserted.
		const reversedPair = (low: number, high: number): Promise<boolean> =>
			Promise.all([physicalPosition(low), physicalPosition(high)]).then(([pl, ph]) =>
				physicallyBefore(ph, pl),
			);
		let pair: [number, number] | null = null;
		for (let draw = 0; pair === null && draw < 100; draw++) {
			const [a, b] = await newNodes(PLAIN, 2);
			for (let rewrite = 0; pair === null && rewrite <= 4; rewrite++) {
				if (await reversedPair(a, b)) pair = [a, b];
				else if (rewrite < 4) {
					await sql.unsafe(
						`UPDATE "${PLAIN.table}"
						    SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{zzrlk_k4_pad}',
						        to_jsonb((SELECT string_agg(md5(random()::text), '') FROM generate_series(1, $3::int))))
						  WHERE section_tipo = $1 AND section_id = $2`,
						[PLAIN.section, a, 40 + rewrite * 5],
					);
				}
			}
		}
		expect(pair, 'precondition: a lower id stored physically after a higher one').not.toBeNull();
		const [low, high] = pair ?? [0, 0];

		const holder = await holdRows([
			{ table: PLAIN.table, sectionTipo: PLAIN.section, sectionId: high },
		]);
		let releaseLocker: () => void = () => {};
		const lockerGate = new Promise<void>((resolve) => {
			releaseLocker = resolve;
		});
		const locker = settle(
			withTransaction(async () => {
				// Force the plan whose natural row order is PHYSICAL.
				await sql.unsafe('SET LOCAL enable_indexscan = off');
				await sql.unsafe('SET LOCAL enable_bitmapscan = off');
				await sql.unsafe('SET LOCAL enable_indexonlyscan = off');
				await lockMatrixRowsForUpdate([
					{ table: PLAIN.table, sectionTipo: PLAIN.section, sectionId: high },
					{ table: PLAIN.table, sectionTipo: PLAIN.section, sectionId: low },
				]);
				await lockerGate;
			}),
		);
		const blocked = await waitUntilBlockedBy(holder.pid, 1, WAIT_MS);

		// While the batch waits on `high`, `low` must ALREADY be locked by it.
		let lowState = 'free';
		try {
			await sql.unsafe(
				`SELECT section_id FROM "${PLAIN.table}"
				  WHERE section_tipo = $1 AND section_id = $2 FOR UPDATE NOWAIT`,
				[PLAIN.section, low],
			);
		} catch (error) {
			lowState = sqlStateOf(error) === '55P03' ? 'locked' : `error ${String(sqlStateOf(error))}`;
		}
		await holder.release();
		releaseLocker();
		const outcome = await locker;

		expect(blocked, 'the batch never waited on the held higher id').toBe(true);
		expect(lowState, 'the lower id was not locked before the higher one').toBe('locked');
		expect(outcome.status).toBe('fulfilled');
	}, 60_000);

	test('K5 a two-section batch locks its sections in ONE order, whatever the caller lists', async () => {
		// One row in each section of the situation (same table). Batch B lists
		// (ordered, plain), batch A (plain, ordered). With the sections taken in
		// caller order, B (queued first on the held `ordered` row) would get it and
		// then wait on `plain`, which A took before queuing behind B: 40P01.
		const [inOrdered] = await newNodes(ORDERED, 1);
		const [inPlain] = await newNodes(PLAIN, 1);
		const orderedRow = { table: ORDERED.table, sectionTipo: ORDERED.section, sectionId: inOrdered };
		const plainRow = { table: PLAIN.table, sectionTipo: PLAIN.section, sectionId: inPlain };
		// The canonical order is the section tipo's code-unit order; the HELD row
		// must be the one that order takes first, so a sorted batch holds nothing
		// while it waits.
		const [first, second] =
			ORDERED.section < PLAIN.section ? [orderedRow, plainRow] : [plainRow, orderedRow];

		const holder = await holdRows([first]);
		const batch = (rows: (typeof first)[]) =>
			settle(
				withTransaction(async () => {
					await lockMatrixRowsForUpdate(rows);
				}),
			);
		const queuedFirst = batch([first, second]);
		const queued = await waitUntilBlockedBy(holder.pid, 1, WAIT_MS);
		const reversed = batch([second, first]);
		const bothWaiting = await waitForLockWaiters(2, [holder.pid], WAIT_MS);
		await holder.release();
		const outcomes = await Promise.all([queuedFirst, reversed]);

		expect(queued, 'the first batch never queued on the held row').toBe(true);
		expect(bothWaiting, 'the interleave did not happen: both batches must be waiting').toBe(true);
		const deadlocked = outcomes.filter(
			(o) => o.status === 'rejected' && sqlStateOf(o.reason) === '40P01',
		).length;
		expect(deadlocked, 'two batches over the same rows deadlocked (40P01)').toBe(0);
		expect(outcomes.map((o) => o.status)).toEqual(['fulfilled', 'fulfilled']);
	}, 60_000);
});

describe('matrix row-lock primitives: the writer lock is exclusive', () => {
	/**
	 * Hold `readMatrixKeyForUpdate` on (PLAIN, x) in an open transaction that
	 * then rewrites the key to `nextParent` — the read-modify-writer under test.
	 */
	async function holdWriter(x: number, nextParent: number) {
		let releaseGate: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			releaseGate = resolve;
		});
		let lockedSignal: (pid: number) => void = () => {};
		const locked = new Promise<number>((resolve) => {
			lockedSignal = resolve;
		});
		const writer = settle(
			withTransaction(async () => {
				const pid = await currentBackendPid();
				const read = await readMatrixKeyForUpdate(
					PLAIN.table,
					PLAIN.section,
					x,
					'relation',
					PLAIN.parent,
				);
				expect(read, 'the writer read no row').not.toBeNull();
				lockedSignal(pid);
				await gate;
				await assertTestDatabase('matrix_row_lock K6 writer');
				await sql.unsafe(
					`UPDATE "${PLAIN.table}"
					    SET relation = jsonb_set(relation, ARRAY[$3::text], $4::text::jsonb)
					  WHERE section_tipo = $1 AND section_id = $2`,
					[PLAIN.section, x, PLAIN.parent, JSON.stringify([parentLink(PLAIN, nextParent, 1)])],
				);
			}),
		);
		return { pid: await locked, release: releaseGate, done: writer };
	}

	const idsOf = (items: unknown[] | null | undefined): number[] =>
		(items ?? []).map((item) => Number((item as { section_id: unknown }).section_id));

	for (const [label, read] of [
		['a cycle walk’s share read', readMatrixKeyForShare],
		['a second writer’s locked read', readMatrixKeyForUpdate],
	] as const) {
		test(`K6 a held readMatrixKeyForUpdate makes ${label} WAIT, then answer the committed value`, async () => {
			const [x, p1, p2] = await newNodes(PLAIN, 3);
			await seedLinks(PLAIN, x, [{ parent: p1, itemId: 1 }]);
			const writer = await holdWriter(x, p2);

			const second = settle(
				withTransaction(() => read(PLAIN.table, PLAIN.section, x, 'relation', PLAIN.parent)),
			);
			const waited = await waitUntilBlockedBy(writer.pid, 1, WAIT_MS);
			writer.release();
			const [writerOutcome, outcome] = await Promise.all([writer.done, second]);

			expect(waited, `${label} read straight past the held writer lock`).toBe(true);
			expect(writerOutcome.status).toBe('fulfilled');
			expect(outcome.status).toBe('fulfilled');
			expect(idsOf(outcome.status === 'fulfilled' ? outcome.value : null)).toEqual([p2]);
		}, 60_000);
	}
});
