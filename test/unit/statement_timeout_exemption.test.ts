/**
 * The maintenance opt-out from the pool-wide statement_timeout (WC-055).
 *
 * `DB_STATEMENT_TIMEOUT_MS` is the only ceiling on a search that cannot abort
 * early — the dd551 Data search (`f_unaccent(...) ~* ...` over `misc`) is
 * deliberately unindexed, so a term matching nothing reads all 32.9M rows
 * (~175 s measured on mdcat), and a client disconnecting does not cancel it.
 * The setting nevertheless shipped DISABLED, because it is a per-connection GUC
 * on the shared pool and would equally abort REINDEX / VACUUM / DROP INDEX
 * CONCURRENTLY — maintenance that is SUPPOSED to run for minutes.
 *
 * `runWithoutStatementTimeout` resolves that conflict, and this gate proves the
 * two halves of it against a live server rather than by inspection:
 *   1. a pooled statement IS bounded when the GUC is set;
 *   2. the helper's statement is NOT, under the same GUC;
 *   3. the reserved connection does not LEAK the cleared GUC back into the pool
 *      — the failure mode that makes `SET` (rather than `SET LOCAL`) dangerous
 *      here, and which would silently un-bound every later request handed that
 *      same connection.
 *
 * The suite cannot rely on the install's own DB_STATEMENT_TIMEOUT_MS (0 in the
 * test env), so it sets the GUC on the connection it is testing.
 */

import { describe, expect, test } from 'bun:test';
import { getPoolStats, runWithoutStatementTimeout, sql } from '../../src/core/db/postgres.ts';

/** Longer than the ceiling below, short enough to keep the suite quick. */
const SLEEP_S = 1.5;
const CEILING_MS = 300;

describe('statement_timeout exemption for maintenance (WC-055)', () => {
	test('a statement on a ceilinged connection IS cancelled', async () => {
		const reserved = await sql.reserve();
		let cancelled: string | null = null;
		try {
			await reserved.unsafe(`SET statement_timeout = ${CEILING_MS}`, []);
			// try/catch, NOT expect(...).rejects: the rejects matcher never settles
			// against a cancelled Bun SQL statement under the test preload (it hangs
			// the whole file, verified by bisecting this test out).
			try {
				await reserved.unsafe(`SELECT pg_sleep(${SLEEP_S})`, []);
			} catch (error) {
				cancelled = (error as Error).message;
			}
		} finally {
			// The test's own hygiene: a plain SET persists for the connection's
			// life, and bun test is ONE process sharing this pool — released
			// un-reset, the 300ms ceiling rides the connection into later files
			// and cancels their long statements as 57014 (measured: 2
			// transform_lang_native victims before this reset existed).
			await reserved.unsafe('RESET statement_timeout', []);
			reserved.release();
		}
		expect(cancelled, 'the ceiling did not cancel a statement that exceeded it').toMatch(
			/statement timeout|canceling statement/i,
		);
	}, 30000);

	test('runWithoutStatementTimeout clears the ceiling for its own statement', async () => {
		// Its reserved connection may be a pool connection that already carries a
		// ceiling from earlier work; the helper must clear it either way.
		const rows = (await runWithoutStatementTimeout(
			"SELECT current_setting('statement_timeout') AS timeout",
		)) as { timeout: string }[];
		expect(rows[0]?.timeout).toBe('0');
	}, 30000);

	test('a statement LONGER than the ceiling completes under the helper', async () => {
		// The behaviour that matters, asserted by elapsed time rather than by the
		// return shape of pg_sleep (which is `void`, not NULL).
		const startedAt = performance.now();
		await runWithoutStatementTimeout(`SELECT pg_sleep(${SLEEP_S})`);
		const elapsedMs = performance.now() - startedAt;
		expect(elapsedMs).toBeGreaterThan(SLEEP_S * 1000 * 0.9);
	}, 30000);

	test('the cleared GUC does not leak back into pooled traffic', async () => {
		// De-vacuated (2026-08-23): the old form compared the pooled GUC against
		// config.ops.dbStatementTimeoutMs, which is 0 in the test env — a leaked
		// 0 equalled the configured 0 and the assertion could never fail. Drive a
		// SENTINEL instead: the "maintenance statement" itself sets a
		// recognizable nonzero ceiling on the helper's reserved connection, so a
		// connection released without RESET is distinguishable from every honest
		// pooled connection.
		const SENTINEL_MS = 12345;
		await runWithoutStatementTimeout(
			`SELECT set_config('statement_timeout', '${SENTINEL_MS}', false)`,
		);
		// Concurrent probes to spread across the pool's connections (sequential
		// queries tend to reuse one), sized to make missing the leaked
		// connection unlikely.
		const { max } = getPoolStats();
		const probes = (await Promise.all(
			Array.from(
				{ length: Math.max(4, max * 2) },
				() =>
					sql.unsafe(`SELECT current_setting('statement_timeout') AS timeout`, []) as Promise<
						{ timeout: string }[]
					>,
			),
		)) as { timeout: string }[][];
		const leaked = probes.map((rows) => rows[0]?.timeout).filter((t) => t?.includes('12345'));
		expect(
			leaked,
			`a pooled connection still carries the helper's reserved-span statement_timeout (${leaked[0]}) — runWithoutStatementTimeout released without RESET`,
		).toEqual([]);
	}, 30000);
});
