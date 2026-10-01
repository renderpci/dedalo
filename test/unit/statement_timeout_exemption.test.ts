/**
 * The maintenance opt-out from the pool-wide statement_timeout (WC-055, PERF-11).
 *
 * `DB_STATEMENT_TIMEOUT_MS` is the only ceiling on a search that cannot abort
 * early — the dd551 Data search (`f_unaccent(...) ~* ...` over `misc`) is
 * deliberately unindexed, so a term matching nothing reads all 32.9M rows
 * (~175 s measured on mdcat), and a client disconnecting does not cancel it.
 * It shipped DISABLED for years, because it is a per-connection GUC on the
 * shared pool and would equally abort REINDEX / VACUUM / DROP INDEX
 * CONCURRENTLY — maintenance that is SUPPOSED to run for minutes.
 *
 * `runWithoutStatementTimeout` resolves that conflict. Since PERF-11 it runs
 * its statement on the MAINTENANCE pool (withUnboundedStatements), whose
 * connections are BORN with `statement_timeout = 0` — no GUC is ever SET or
 * RESET, so the WC-055 leak class is gone by construction rather than by a
 * remembered RESET. This gate proves, against a live server:
 *   1. a statement IS bounded when the GUC is set;
 *   2. the helper's statement is NOT;
 *   3. the helper MUTATES NO GUC: its 0 is the startup setting (source
 *      `client`, never `session`), and a session-scoped `set_config(…, false)`
 *      through it is refused before it is sent — so nothing can ride a pooled
 *      connection into later traffic. (The full pool/scope matrix, under a
 *      real configured ceiling, is statement_ceiling_scope_native.)
 */

import { describe, expect, test } from 'bun:test';
import { getPoolStats, runWithoutStatementTimeout, sql } from '../../src/core/db/postgres.ts';
import { refusalOf } from '../helpers/refusal.ts';

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

	test('runWithoutStatementTimeout runs with no ceiling', async () => {
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

	test('the helper mutates no GUC: its 0 is the startup setting, and a session set_config is refused', async () => {
		const [setting] = (await runWithoutStatementTimeout(
			"SELECT setting, source FROM pg_settings WHERE name = 'statement_timeout'",
		)) as { setting: string; source: string }[];
		expect(setting?.setting).toBe('0');
		expect(
			setting?.source,
			'the helper cleared the ceiling with a session SET (it must run on a connection born unbounded)',
		).toBe('client');

		// De-vacuated (2026-08-23), re-aimed (PERF-11): a session-scoped
		// set_config through the helper would plant a SENTINEL ceiling on a
		// pooled (maintenance) connection that outlives the call. It is refused
		// before it is sent, and no pooled connection carries the sentinel.
		const SENTINEL_MS = 12345;
		const refusal = await refusalOf(
			runWithoutStatementTimeout(`SELECT set_config('statement_timeout', '${SENTINEL_MS}', false)`),
		);
		expect(refusal.code).toBe('internal.invariant');
		// Concurrent probes to spread across the pool's connections (sequential
		// queries tend to reuse one), sized to make missing a leaked connection
		// unlikely — on BOTH pools.
		const { max, maintenance } = getPoolStats();
		const probe = (text: string) => sql.unsafe(text, []) as Promise<{ timeout: string }[]>;
		const pooled = await Promise.all(
			Array.from({ length: Math.max(4, max * 2) }, () =>
				probe(`SELECT current_setting('statement_timeout') AS timeout`),
			),
		);
		const maintenanceProbes = await Promise.all(
			Array.from({ length: Math.max(2, maintenance.max * 2) }, () =>
				runWithoutStatementTimeout(`SELECT current_setting('statement_timeout') AS timeout`),
			),
		);
		const leaked = [...pooled, ...(maintenanceProbes as { timeout: string }[][])]
			.map((rows) => rows[0]?.timeout)
			.filter((timeout) => timeout?.includes('12345'));
		expect(leaked, 'a pooled connection carries the refused session sentinel').toEqual([]);
	}, 30000);
});
