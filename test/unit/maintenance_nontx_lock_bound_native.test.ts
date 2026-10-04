/**
 * THE LOCK-WAIT BOUND OF `runWithoutStatementTimeout` (OPS-6/PERF-11 review, S2).
 *
 * THE DEFECT. The non-transactional maintenance lane (startup
 * `statement_timeout` 0) carried NO `lock_timeout`, on the stated ground that
 * "its waits block neither reads nor writes". True for the CONCURRENTLY forms and
 * plain VACUUM / ANALYZE (SHARE UPDATE EXCLUSIVE — no reader or writer conflicts
 * with it, queued or granted). FALSE for what the db-assets recreate actually
 * sends through it — `ar_maintenance`'s `REINDEX TABLE matrix_dd` (SHARE: blocks
 * writers) and `VACUUM FULL … matrix_dd` (ACCESS EXCLUSIVE: blocks everything).
 * Queued behind a long reader (a pg_dump holds ACCESS SHARE on every table for
 * hours), such a statement waited without limit, and PostgreSQL grants locks in
 * queue order — every LATER reader of the table queued behind it for the
 * reader's whole span.
 *
 * THE LAW (measured here, on a scratch table):
 *  (a) a strong-lock statement queued behind a long reader gives up within the
 *      MAINTENANCE_LOCK_TIMEOUT bound, so a reader issued AFTER it gets through
 *      while the long reader still holds its lock; once the long reader ends the
 *      statement's own retry applies it;
 *  (b) past its retries the escape is the typed, retryable `db.lock_timeout`
 *      (SQLSTATE 55P03 kept as cause) — REINDEX TABLE behind a WRITER too;
 *  (c) the weak class keeps NO bound: a plain VACUUM queued behind a SHARE
 *      UPDATE EXCLUSIVE holder is still waiting past the bound and completes
 *      once the holder ends — a CONCURRENTLY build cancelled by a lock bound
 *      would leave an INVALID index behind;
 *  (d) the routing is observable: the strong statement waits on the
 *      MAINTENANCE pool's identity (cancelled at shutdown — it rolls back
 *      cleanly), the weak one on the NON-TRANSACTIONAL identity (spared);
 *  (e) the classifier over every statement the engine sends the lane (the
 *      ar_maintenance sentences read from the definitions, the db-assets and
 *      database_info forms) — an unrecognised statement is strong.
 *
 * SURFACES. Lane SUITE database only (assertTestDatabase first); one scratch
 * table `dedalo_ts_test_ntx_<pid>`, dropped in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	nonTransactionalLockClass,
	runWithoutStatementTimeout,
	sql,
	sqlStateOf,
} from '../../src/core/db/postgres.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

const SCRATCH = `dedalo_ts_test_ntx_${process.pid}`;

type Reserved = Awaited<ReturnType<typeof sql.reserve>>;

beforeAll(async () => {
	await assertTestDatabase('maintenance_nontx_lock_bound_native');
	await sql.unsafe(
		`CREATE TABLE IF NOT EXISTS "${SCRATCH}" (id serial PRIMARY KEY, tag text NOT NULL)`,
		[],
	);
	await sql.unsafe(`INSERT INTO "${SCRATCH}" (tag) VALUES ('a'), ('b')`, []);
});

afterAll(async () => {
	await sql.unsafe(`DROP TABLE IF EXISTS "${SCRATCH}"`, []);
});

/** Open a transaction on a reserved connection that holds `lockSql`'s lock until `end()`. */
async function holdLock(lockSql: string): Promise<{ end: () => Promise<void> }> {
	const holder: Reserved = await sql.reserve();
	await holder.unsafe('BEGIN', []);
	await holder.unsafe(lockSql, []);
	let ended = false;
	return {
		end: async () => {
			if (ended) return;
			ended = true;
			await holder.unsafe('ROLLBACK', []);
			holder.release();
		},
	};
}

/** The application_name of the backend currently waiting on a lock with `statement`. */
async function waiterApplicationName(statementPrefix: string): Promise<string | null> {
	const rows = (await sql.unsafe(
		`SELECT application_name FROM pg_stat_activity
		  WHERE datname = current_database() AND wait_event_type = 'Lock'
		    AND query LIKE $1`,
		[`${statementPrefix}%`],
	)) as { application_name: string }[];
	return rows[0]?.application_name ?? null;
}

/** Poll until a backend waits on a lock with `statementPrefix`, or the budget runs out. */
async function waitForWaiter(statementPrefix: string, budgetMs: number): Promise<string | null> {
	const deadline = Date.now() + budgetMs;
	while (Date.now() < deadline) {
		const name = await waiterApplicationName(statementPrefix);
		if (name !== null) return name;
		await Bun.sleep(50);
	}
	return null;
}

/** A settled-state probe for a promise (never rejects). */
function track<T>(promise: Promise<T>): {
	settled: () => boolean;
	outcome: Promise<{ ok: true; value: T } | { ok: false; error: unknown }>;
} {
	let settled = false;
	const outcome = promise.then(
		(value) => {
			settled = true;
			return { ok: true as const, value };
		},
		(error: unknown) => {
			settled = true;
			return { ok: false as const, error };
		},
	);
	return { settled: () => settled, outcome };
}

describe('runWithoutStatementTimeout: a strong-lock statement is lock-bounded', () => {
	test('(a)+(d) VACUUM FULL behind a long reader gives up within the bound: a LATER reader gets through while the long reader still holds; the retry applies it once the reader ends', async () => {
		const longReader = await holdLock(`SELECT count(*) FROM "${SCRATCH}"`);
		try {
			const vacuum = track(runWithoutStatementTimeout(`VACUUM FULL "${SCRATCH}"`));
			const waiter = await waitForWaiter('VACUUM FULL', 3000);
			// (d) the strong statement waits on the MAINTENANCE pool's identity.
			expect(waiter ?? '').toMatch(/^dedalo_maintenance:\d+:/);
			// The later reader: its own lock wait bounded at 15s so a regression
			// fails here instead of hanging the file.
			const reader: Reserved = await sql.reserve();
			const startedAt = performance.now();
			let readerError: unknown = null;
			try {
				await reader.unsafe('BEGIN', []);
				await reader.unsafe(`SET LOCAL lock_timeout = '15s'`, []);
				await reader.unsafe(`SELECT count(*) FROM "${SCRATCH}"`, []);
				await reader.unsafe('COMMIT', []);
			} catch (error) {
				readerError = error;
				await reader.unsafe('ROLLBACK', []).catch(() => {});
			} finally {
				reader.release();
			}
			expect(readerError).toBeNull();
			// Through within the 5s bound (+ margin), not after the long reader ended.
			expect(performance.now() - startedAt).toBeLessThan(9000);
			expect(vacuum.settled()).toBe(false); // still retrying behind the long reader
			await longReader.end();
			const outcome = await vacuum.outcome;
			expect(outcome.ok, JSON.stringify(outcome)).toBe(true);
		} finally {
			await longReader.end();
		}
	}, 60000);

	test('(b) REINDEX TABLE behind a WRITER: past its retries the escape is the typed db.lock_timeout, SQLSTATE 55P03 kept', async () => {
		const writer = await holdLock(`INSERT INTO "${SCRATCH}" (tag) VALUES ('w')`);
		try {
			const startedAt = performance.now();
			let caught: unknown = null;
			await runWithoutStatementTimeout(`REINDEX TABLE "${SCRATCH}"`, [], {
				lockRetryDelaysMs: [],
			}).catch((error: unknown) => {
				caught = error;
			});
			expect((caught as { code?: string } | null)?.code).toBe('db.lock_timeout');
			expect(sqlStateOf(caught)).toBe('55P03');
			expect(performance.now() - startedAt).toBeLessThan(9000);
		} finally {
			await writer.end();
		}
		// Positive control: unblocked, the same statement runs.
		await runWithoutStatementTimeout(`REINDEX TABLE "${SCRATCH}"`);
	}, 30000);
});

describe('runWithoutStatementTimeout: the weak class keeps no lock bound', () => {
	for (const [label, prefix] of [
		['a plain VACUUM', 'VACUUM ANALYZE'],
		['a REINDEX TABLE CONCURRENTLY', 'REINDEX TABLE CONCURRENTLY'],
	] as const) {
		test(`(c)+(d) ${label} queued behind a SHARE UPDATE EXCLUSIVE holder still waits past the bound, on the non-transactional identity, and completes once the holder ends`, async () => {
			const holder = await holdLock(`LOCK TABLE "${SCRATCH}" IN SHARE UPDATE EXCLUSIVE MODE`);
			try {
				const statement = track(runWithoutStatementTimeout(`${prefix} "${SCRATCH}"`));
				const waiter = await waitForWaiter(prefix, 3000);
				expect(waiter ?? '').toMatch(/^dedalo_maintenance:nontx:\d+:/);
				await Bun.sleep(6500); // past the 5s MAINTENANCE_LOCK_TIMEOUT
				expect(statement.settled()).toBe(false);
				await holder.end();
				const outcome = await statement.outcome;
				expect(outcome.ok, JSON.stringify(outcome)).toBe(true);
			} finally {
				await holder.end();
			}
		}, 30000);
	}

	test("(e) the classification of every statement the engine hands the lane: ar_maintenance's REINDEX TABLE / VACUUM FULL are strong; the CONCURRENTLY / plain VACUUM / ANALYZE forms are weak; an unknown form is strong", async () => {
		const { default: definitions } = await import('../../src/core/db/db_pg_definitions.json');
		const maintenance = (definitions as { ar_maintenance: string[] }).ar_maintenance;
		const strongSentences = maintenance.filter((sentence) =>
			/^(REINDEX TABLE matrix_dd|VACUUM FULL)/.test(sentence),
		);
		expect(strongSentences).toHaveLength(2);
		for (const sentence of maintenance) {
			expect([sentence, nonTransactionalLockClass(sentence)]).toEqual([
				sentence,
				strongSentences.includes(sentence) ? 'strong' : 'weak',
			]);
		}
		for (const weak of [
			'VACUUM ANALYZE',
			'ANALYZE "a", "b"',
			'REINDEX TABLE CONCURRENTLY "matrix"',
			'REINDEX (VERBOSE) TABLE CONCURRENTLY "matrix"',
			'DROP INDEX CONCURRENTLY IF EXISTS "public"."x_ccnew"',
			'CREATE UNIQUE INDEX CONCURRENTLY i ON t (c)',
			'/* lead */ VACUUM "full_name_table"',
			'VACUUM "full"',
		]) {
			expect([weak, nonTransactionalLockClass(weak)]).toEqual([weak, 'weak']);
		}
		for (const strong of [
			'VACUUM FULL',
			'VACUUM (FULL, ANALYZE) t',
			'REINDEX INDEX i',
			'REINDEX TABLE "concurrently"',
			'CLUSTER t',
			'VACUUM t; VACUUM FULL t',
			"VACUUM 'unterminated",
		]) {
			expect([strong, nonTransactionalLockClass(strong)]).toEqual([strong, 'strong']);
		}
	});
});
