/**
 * AN INTERRUPTED CONCURRENT REINDEX LEAVES NOTHING BEHIND (review 2026-09-30,
 * the S2 on the maintenance shutdown cancel).
 *
 * THE DEFECT. `REINDEX TABLE CONCURRENTLY` is not a transaction: cancelled
 * mid-build (an operator's pg_cancel_backend, a shutdown cancel, a server-side
 * abort on client disconnect) it leaves an INVALID `<index>_ccnew` behind. Every
 * write keeps maintaining it, and the next `REINDEX TABLE CONCURRENTLY` SKIPS
 * invalid indexes — nothing in the engine ever dropped it, so one interrupted
 * optimize left a permanent write-cost on the table. (The shutdown half — the
 * non-transactional maintenance lane is never cancelled — is pinned in
 * statement_ceiling_scope_native's shutdown leg.)
 *
 * THE LAW. database_info.optimize_tables sweeps the tables it optimizes first:
 * every invalid index PostgreSQL itself named `_ccnew[N]` / `_ccold[N]` is
 * dropped CONCURRENTLY — never one whose table has an index build IN PROGRESS
 * (a live REINDEX's `_ccnew` is invalid too).
 *
 * SITUATION (built, never read from the ambient DB): a scratch table
 * `dedalo_ts_test_ccnew_<pid>` on the lane SUITE database (assertTestDatabase
 * first) whose one index calls a deliberately SLOW immutable function, so a
 * REINDEX CONCURRENTLY build is long enough to interrupt. Dropped in afterAll.
 *
 * Mutation map: the sweep call removed from the optimize door → (1); the
 * in-progress exclusion dropped → (2) (the live build's `_ccnew` is dropped
 * under it).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	databaseInfoOptimizeTables,
	sweepInvalidConcurrentIndexes,
} from '../../src/core/area_maintenance/widgets/database_info.ts';
import { runWithoutStatementTimeout, sql } from '../../src/core/db/postgres.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

const PID = process.pid;
const TABLE = `dedalo_ts_test_ccnew_${PID}`;
const SLOW = `dedalo_ts_test_ccnew_slow_${PID}`;
const INDEX = `${TABLE}_slow_idx`;

/** Every index of the scratch table, with its validity. */
async function indexesOf(): Promise<{ name: string; valid: boolean }[]> {
	return (await sql.unsafe(
		`SELECT ic.relname AS name, i.indisvalid AS valid
		   FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
		  WHERE i.indrelid = to_regclass($1) ORDER BY ic.relname`,
		[`public."${TABLE}"`],
	)) as { name: string; valid: boolean }[];
}

/** Poll until the concurrent build's `_ccnew` exists (the build is under way). */
async function waitForCcnew(budgetMs: number): Promise<boolean> {
	const deadline = performance.now() + budgetMs;
	while (performance.now() < deadline) {
		if ((await indexesOf()).some((index) => /_ccnew\d*$/.test(index.name))) return true;
		await Bun.sleep(25);
	}
	return false;
}

/** Start a REINDEX TABLE CONCURRENTLY on the scratch table; resolves to 'completed' or the SQLSTATE. */
function startReindex(): Promise<string> {
	return runWithoutStatementTimeout(`REINDEX TABLE CONCURRENTLY "${TABLE}"`).then(
		() => 'completed',
		(error: unknown) => String((error as { errno?: string }).errno ?? error),
	);
}

beforeAll(async () => {
	await assertTestDatabase('optimize_concurrent_leftover_native');
	await sql.unsafe(
		`CREATE OR REPLACE FUNCTION "${SLOW}"(value int) RETURNS int IMMUTABLE LANGUAGE plpgsql
		 AS $$BEGIN PERFORM pg_sleep(0.4); RETURN value; END$$`,
		[],
	);
	await sql.unsafe(`CREATE TABLE IF NOT EXISTS "${TABLE}" (id int NOT NULL)`, []);
	await sql.unsafe(`INSERT INTO "${TABLE}" (id) SELECT generate_series(1, 4)`, []);
	await runWithoutStatementTimeout(
		`CREATE INDEX IF NOT EXISTS "${INDEX}" ON "${TABLE}" ("${SLOW}"(id))`,
	);
}, 60000);

afterAll(async () => {
	await sql.unsafe(`DROP TABLE IF EXISTS "${TABLE}"`, []);
	await sql.unsafe(`DROP FUNCTION IF EXISTS "${SLOW}"(int)`, []);
});

describe('an interrupted REINDEX CONCURRENTLY leaves no invalid index behind', () => {
	test('(1) cancelled mid-build → an invalid _ccnew exists; the next optimize_tables drops it, and the table ends with its one valid index', async () => {
		const reindex = startReindex();
		expect(await waitForCcnew(10000), 'the concurrent build never started (vacuous leg)').toBe(
			true,
		);
		await sql.unsafe(
			`SELECT pg_cancel_backend(pid) FROM pg_stat_activity
			  WHERE pid <> pg_backend_pid() AND state = 'active'
			    AND position($1 in query) > 0 AND query ILIKE 'REINDEX%'`,
			[TABLE],
		);
		expect(await reindex, 'the REINDEX was not interrupted (vacuous leg)').toBe('57014');
		// Non-vacuity: the leftover this gate is about really exists now.
		const leftovers = (await indexesOf()).filter((index) => !index.valid);
		expect(leftovers.map((index) => index.name)).toEqual([`${INDEX}_ccnew`]);

		const response = await databaseInfoOptimizeTables({ tables: [TABLE] });
		expect(response.errors ?? [], JSON.stringify(response)).toEqual([]);
		expect(await indexesOf()).toEqual([{ name: INDEX, valid: true }]);
	}, 60000);

	test('(2) a build IN PROGRESS is never swept: its _ccnew survives the sweep and the REINDEX completes', async () => {
		const reindex = startReindex();
		expect(await waitForCcnew(10000), 'the concurrent build never started (vacuous leg)').toBe(
			true,
		);
		const report = await sweepInvalidConcurrentIndexes([TABLE]);
		expect(report).toEqual({ dropped: [], errors: [] });
		expect(await reindex).toBe('completed');
		expect(await indexesOf()).toEqual([{ name: INDEX, valid: true }]);
	}, 60000);
});
