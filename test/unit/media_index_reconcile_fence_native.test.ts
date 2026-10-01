/**
 * DIFF-2 — THE MEDIA-INDEX DOORS NEVER UNLINK A MARKER A LIVE BATCH IS WRITING:
 * not the reconcile apply (even for a batch publishing into a database the store
 * has never seen), not the rebuild.
 *
 * THE FINDINGS (closure review, 2026-09-30 / 2026-10-01).
 *  - The apply took the publication-target fence of the databases that had a
 *    `dbs/<db>` subtree when it LISTED them, before any lock was held. A runner
 *    making the FIRST publication into a database holds `sql:<db>` and writes
 *    `dbs/<db>/<table>/K`, then `pub/K`. The diff reads dbs/ first and pub/
 *    second: a pair landing between the two reads put K in pub/ but not in the
 *    truth, and K was unlinked as stray. The first fix re-ran the apply with the
 *    new database fenced — the marker came BACK, but only after a round that had
 *    already unlinked it (a transient public 404), and the old gate, measuring
 *    only the final state, stayed green on it.
 *  - The rebuild SELECTed a database's published ids, then diff-synced its
 *    markers, holding no fence: a runner batch landing row K + marker K after
 *    the SELECT had its marker unlinked as "not published", and pub/K with it.
 *
 * THE SITUATIONS ARE BUILT, deterministically, on a scratch marker store (the
 * module's temp-dir seam). The WRITER IS MODELLED UNDER ITS LOCK, as a runner
 * batch is: it takes `sql:<db>` from ANOTHER Postgres session, writes the dbs/
 * marker, yields, writes the pub/ marker, and only then releases. A spy on the
 * store's unlink/rm records every removal WHILE the door runs.
 *
 * WHAT IS ASSERTED — outcomes, over the whole run, not just the end state:
 *  - reconcile: the writer's pub/ marker is NEVER unlinked, and the apply's own
 *    write (the stray it heals) happens only AFTER the writer released — the
 *    applying round held the new database's fence;
 *  - rebuild: the row the writer lands after the SELECT keeps its dbs/ AND pub/
 *    markers at every instant, and the writer could not land inside the
 *    rebuild's window (it waited on the fence).
 * Non-degenerate: every interleaving is asserted to have fired, and each door
 * has real work of its own (a stray / a stale marker) so it is never a no-op.
 *
 * The sibling DIFF-2 exclusion leg for a database the store ALREADY holds is
 * test/unit/media_index_store.test.ts "the reconcile APPLY holds every marker
 * database's publication-target fence".
 *
 * WRITES: a temp directory only (the marker store seam); advisory locks on the
 * lane database, released.
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import * as nodeFs from 'node:fs';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from '../../src/core/db/postgres.ts';
import { MEDIA_INDEX_RECONCILE } from '../../src/diffusion/api/reconcile.ts';
import {
	applyTableState,
	overrideMediaIndexBaseForTests,
	rebuildMediaIndexStore,
} from '../../src/diffusion/targets/mediastore/media_index.ts';

/** The fence's two-int advisory key space: (class, hashtext(target key)). */
const DIFFUSION_TARGET_LOCK_CLASS = 17580002;

let base: string;

beforeEach(() => {
	base = mkdtempSync(join(tmpdir(), 'dedalo_media_index_fence_'));
	overrideMediaIndexBaseForTests(base);
});

afterEach(() => {
	overrideMediaIndexBaseForTests(null);
	rmSync(base, { recursive: true, force: true });
});

/** Take `key`'s publication-target fence from ANOTHER session (a runner's batch). */
async function takeTargetLock(key: string): Promise<{ release: () => Promise<void> }> {
	const connection = await sql.reserve();
	await connection.unsafe('SELECT pg_advisory_lock($1::int, hashtext($2))', [
		DIFFUSION_TARGET_LOCK_CLASS,
		key,
	]);
	let released = false;
	return {
		release: async () => {
			if (released) return;
			released = true;
			try {
				await connection.unsafe('SELECT pg_advisory_unlock($1::int, hashtext($2))', [
					DIFFUSION_TARGET_LOCK_CLASS,
					key,
				]);
			} finally {
				connection.release();
			}
		},
	};
}

function touch(path: string): void {
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, '');
}

/** Record every unlink / rm the store makes while `work` runs (path + instant). */
async function recordingRemovals<T>(
	work: () => Promise<T>,
): Promise<{ value: T; removals: { path: string; at: number }[] }> {
	const removals: { path: string; at: number }[] = [];
	const unlinkSpy = spyOn(nodeFs.promises, 'unlink').mockImplementation((async (
		target: nodeFs.PathLike,
	) => {
		removals.push({ path: String(target), at: performance.now() });
		// The sync call, not the spied promise one (the spy wraps in place).
		nodeFs.unlinkSync(target);
	}) as typeof nodeFs.promises.unlink);
	const rmSpy = spyOn(nodeFs.promises, 'rm').mockImplementation((async (
		target: nodeFs.PathLike,
		options?: nodeFs.RmOptions,
	) => {
		removals.push({ path: String(target), at: performance.now() });
		nodeFs.rmSync(target, options);
	}) as typeof nodeFs.promises.rm);
	try {
		return { value: await work(), removals };
	} finally {
		unlinkSpy.mockRestore();
		rmSpy.mockRestore();
	}
}

/** Did any recorded removal take `path` (or a directory holding it)? */
function removed(removals: { path: string }[], path: string): boolean {
	return removals.some((entry) => path === entry.path || path.startsWith(`${entry.path}/`));
}

describe('media_index reconcile — a first publication into a new database keeps its pub/ marker', () => {
	const OLD_DB = 'zzmif_old_db';
	const FRESH_DB = 'zzmif_fresh_db';
	const TABLE = 'zzmif_t';
	const OLD_KEY = 'zzmif1_2';
	const FRESH_KEY = 'zzmif1_1';
	const STRAY_KEY = 'zzmif1_9';

	test('the writer lands its pair (under sql:<fresh>) between the diff’s dbs/ walk and its pub/ read: pub/K is never unlinked, and the apply writes only after the writer released', async () => {
		touch(join(base, 'dbs', OLD_DB, TABLE, OLD_KEY));
		touch(join(base, 'pub', OLD_KEY));
		// A stray of the apply's own (no truth owns it): the run is not a no-op.
		touch(join(base, 'pub', STRAY_KEY));
		const freshPub = join(base, 'pub', FRESH_KEY);

		// The runner's batch, as it runs: fence → dbs/ truth → yield → pub/ union
		// → hold a little longer (the batch's tail) → release.
		let releaseRequestedAt = Number.POSITIVE_INFINITY;
		let pairWritten!: () => void;
		const pairWrittenSignal = new Promise<void>((resolve) => {
			pairWritten = resolve;
		});
		// Started OUTSIDE the apply's transaction context (a runner is another
		// process); the readdir spy only tells it when to go.
		let go!: () => void;
		const goSignal = new Promise<void>((resolve) => {
			go = resolve;
		});
		const writer = (async () => {
			await goSignal;
			const lock = await takeTargetLock(`sql:${FRESH_DB}`);
			try {
				touch(join(base, 'dbs', FRESH_DB, TABLE, FRESH_KEY));
				await Bun.sleep(0);
				touch(freshPub);
				pairWritten();
				await Bun.sleep(800);
			} finally {
				releaseRequestedAt = performance.now();
				await lock.release();
			}
		})();

		const realReaddir = nodeFs.promises.readdir;
		let walkedTable = false;
		let fired = false;
		let finishedBeforeRelease = false;
		const readdirSpy = spyOn(nodeFs.promises, 'readdir').mockImplementation((async (
			dir: nodeFs.PathLike,
			...rest: unknown[]
		) => {
			const target = String(dir);
			if (target === join(base, 'dbs', OLD_DB, TABLE)) walkedTable = true;
			if (target === join(base, 'pub')) {
				if (!fired && walkedTable) {
					fired = true;
					// Exactly between the diff's dbs/ walk and its pub/ read.
					go();
					await pairWrittenSignal;
				}
			}
			return (realReaddir as (...args: unknown[]) => Promise<unknown>)(dir, ...rest);
		}) as typeof nodeFs.promises.readdir);

		let run: Awaited<ReturnType<typeof recordingRemovals<unknown>>>;
		try {
			run = await recordingRemovals(async () => {
				const report = await MEDIA_INDEX_RECONCILE.run({ apply: true });
				finishedBeforeRelease = releaseRequestedAt === Number.POSITIVE_INFINITY;
				return report;
			});
		} finally {
			readdirSpy.mockRestore();
			go();
			await writer;
		}

		expect(fired, 'the interleaving never happened — the leg proves nothing').toBe(true);
		expect(
			removed(run.removals, freshPub),
			"the apply unlinked the pub/ marker a live batch had just written — the record's media 404s, even if a later round re-derives it",
		).toBe(false);
		const strayUnlink = run.removals.find((entry) => entry.path === join(base, 'pub', STRAY_KEY));
		expect(strayUnlink, 'the apply healed nothing').toBeDefined();
		expect(
			(strayUnlink as { at: number }).at,
			'the apply wrote pub/ while the new database’s writer still held its fence',
		).toBeGreaterThan(releaseRequestedAt);
		expect(finishedBeforeRelease, 'the apply finished before the writer released').toBe(false);
		expect(existsSync(freshPub)).toBe(true);
		expect(existsSync(join(base, 'pub', OLD_KEY))).toBe(true);
		expect(existsSync(join(base, 'pub', STRAY_KEY))).toBe(false);
	}, 30_000);
});

describe('media_index rebuild — a row a runner lands after the SELECT keeps its markers', () => {
	const DB = 'zzmif_rb_db';
	const TABLE = 'zzmif_rb_t';
	const TIPO = 'zzmif3';
	const KEPT_ID = 1;
	const STALE_ID = 9; // a marker no published row owns: the rebuild's own work
	const LANDED_ID = 5;

	test('the rebuild fences each database: the writer waits, then lands; dbs/K and pub/K are never removed', async () => {
		const published = new Set<number>([KEPT_ID]);
		touch(join(base, 'dbs', DB, TABLE, `${TIPO}_${KEPT_ID}`));
		touch(join(base, 'pub', `${TIPO}_${KEPT_ID}`));
		touch(join(base, 'dbs', DB, TABLE, `${TIPO}_${STALE_ID}`));
		touch(join(base, 'pub', `${TIPO}_${STALE_ID}`));
		const landedDbs = join(base, 'dbs', DB, TABLE, `${TIPO}_${LANDED_ID}`);
		const landedPub = join(base, 'pub', `${TIPO}_${LANDED_ID}`);

		// The runner's batch: started OUTSIDE the rebuild's transaction context,
		// released by the SELECT seam. Under its fence it inserts the row, writes
		// the dbs/ marker through the store's real writer (which derives pub/).
		let go!: () => void;
		const goSignal = new Promise<void>((resolve) => {
			go = resolve;
		});
		let attempting!: () => void;
		const attemptingSignal = new Promise<void>((resolve) => {
			attempting = resolve;
		});
		let landed = false;
		const writer = (async () => {
			await goSignal;
			const lockPromise = takeTargetLock(`sql:${DB}`);
			attempting();
			const lock = await lockPromise;
			try {
				published.add(LANDED_ID);
				await applyTableState(DB, TABLE, TIPO, [LANDED_ID], []);
				landed = true;
			} finally {
				await lock.release();
			}
		})();

		let selects = 0;
		let landedInsideWindow = false;
		const fetchIds = async (database: string): Promise<number[]> => {
			if (database !== DB) return [];
			selects++;
			const snapshot = [...published]; // what the SELECT saw
			if (selects === 1) {
				go();
				await attemptingSignal;
				// The window between the SELECT and the marker sweep: a runner that
				// is not held off lands here.
				const deadline = Date.now() + 1_000;
				while (!landed && Date.now() < deadline) await Bun.sleep(20);
				landedInsideWindow = landed;
			}
			return snapshot;
		};

		let run: Awaited<ReturnType<typeof recordingRemovals<unknown>>>;
		try {
			run = await recordingRemovals(() =>
				rebuildMediaIndexStore(
					[{ database_name: DB, table_name: TABLE, section_tipo: TIPO }],
					fetchIds,
				),
			);
		} finally {
			await writer;
		}

		expect(selects, 'the rebuild never SELECTed the target — the leg proves nothing').toBe(1);
		expect(landed, 'the writer never landed its row').toBe(true);
		expect(
			landedInsideWindow,
			'the writer landed between the rebuild’s SELECT and its marker sweep — the rebuild held no fence',
		).toBe(false);
		expect(
			removed(run.removals, landedDbs),
			'the rebuild unlinked a just-published dbs/ marker',
		).toBe(false);
		expect(
			removed(run.removals, landedPub),
			'the rebuild unlinked a just-published pub/ marker',
		).toBe(false);
		expect(existsSync(landedDbs)).toBe(true);
		expect(existsSync(landedPub)).toBe(true);
		// The rebuild's own work happened: the stale marker went, the kept one stayed.
		expect(existsSync(join(base, 'dbs', DB, TABLE, `${TIPO}_${STALE_ID}`))).toBe(false);
		expect(existsSync(join(base, 'pub', `${TIPO}_${STALE_ID}`))).toBe(false);
		expect(existsSync(join(base, 'pub', `${TIPO}_${KEPT_ID}`))).toBe(true);
	}, 30_000);
});
