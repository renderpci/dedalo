/**
 * IS THE SUITE DATABASE REACHABLE? — probed ONCE, at module load, so callers can
 * gate at COLLECTION time.
 *
 * The distinction this exists to enforce: `if (!dbReady) return;` inside a test
 * body reports a PASS with zero assertions. A green tick that asserted nothing is
 * the green-suite trap the foundation audit named (S2-40) — worse than a red,
 * because it is indistinguishable from a gate that ran. The probe is therefore
 * top-level, and callers use `describe.if(DB_READY)` / `test.if(DB_READY)`, which
 * make bun print an explicit SKIP.
 *
 * Top-level await runs before bun collects the file's tests, and the module is
 * evaluated once per process, so N gated files cost ONE `SELECT 1`.
 */

import { sql } from '../../src/core/db/postgres.ts';

async function probe(): Promise<boolean> {
	try {
		await sql`SELECT 1`;
		return true;
	} catch {
		console.warn(
			'[db_ready] the suite Postgres is unreachable — every DB-backed case is SKIPPED, not passed',
		);
		return false;
	}
}

/** True when the suite's Postgres answered. Gate with `describe.if` / `test.if`. */
export const DB_READY: boolean = await probe();
