/**
 * THE DIFFUSION SCRATCH TABLES, MATERIALIZED BY THE GATE THAT USES THEM.
 *
 * The bun-test preload (test/preload/session_db.ts) points the engine's two
 * diffusion seams at scratch tables — the job queue (`DIFFUSION_JOBS_TABLE` +
 * its `_events` twin) and the dd1758 activity ledger
 * (`DIFFUSION_ACTIVITY_TABLE`). NOTHING builds them up front: `test:db:setup`
 * does not, and must not (a shard-suffixed run names its own). The engine
 * creates each one lazily, on ITS OWN entry points (`ensureDiffusionJobTables`
 * in every queue.ts door; `ensureDiffusionActivityTable` in every
 * diffusion_delete.ts door) — correct in production, where the real tables are
 * installed.
 *
 * A gate that runs RAW SQL on one of them (a sweep DELETE in `beforeAll`, a
 * row-count SELECT as its first statement) is not an engine entry point. It
 * worked only when an EARLIER file in the same process had happened to call
 * one, so right after `bun run test:db:setup` the unit census reddened
 * ops_diffusion_queue / diffusion_runner_native / diffusion_dd1762_actor with
 * 42P01 — and the runner's half-run teardown then leaked its zzdif domain into
 * diffusion_seed_compiles_native. Order-dependent reds, fixed by determinism:
 * a gate that touches these tables BUILDS them itself, here, in its
 * `beforeAll`. Idempotent (CREATE … IF NOT EXISTS behind the engine's own
 * per-table memo), so every such gate calls it unconditionally.
 *
 * Gate: test/unit/diffusion_scratch_tables_tripwire.test.ts — a test file that
 * binds a scratch table NAME (`activityTable`, `DIFFUSION_JOBS_TABLE`,
 * `DIFFUSION_JOB_EVENTS_TABLE`) must call this.
 */

import {
	activityTable,
	ensureDiffusionActivityTable,
} from '../../src/core/diffusion_bridge/diffusion_delete.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import {
	DIFFUSION_JOB_EVENTS_TABLE,
	DIFFUSION_JOBS_TABLE,
	ensureDiffusionJobTables,
} from '../../src/diffusion/jobs/schema.ts';

export interface DiffusionScratchTables {
	jobs: string;
	jobEvents: string;
	activity: string;
}

/**
 * Create (if absent) every diffusion scratch table the preload seams name, and
 * return their names. Refuses on a database without the suite marker, and
 * refuses a production table name (the seams must be ACTIVE: a gate that would
 * raw-DELETE from the real `matrix_activity_diffusion` is a misconfigured run).
 */
export async function ensureDiffusionScratchTables(): Promise<DiffusionScratchTables> {
	await assertTestDatabase('ensureDiffusionScratchTables');
	const tables = {
		jobs: DIFFUSION_JOBS_TABLE,
		jobEvents: DIFFUSION_JOB_EVENTS_TABLE,
		activity: activityTable(),
	};
	for (const [role, name] of Object.entries(tables)) {
		if (!name.startsWith('dedalo_ts_test_')) {
			throw new Error(
				`ensureDiffusionScratchTables REFUSED: the ${role} table resolves to '${name}', not a dedalo_ts_test_* scratch table — the test preload's diffusion seams are not active in this process (test/preload/session_db.ts). Nothing was created.`,
			);
		}
	}
	await ensureDiffusionJobTables();
	await ensureDiffusionActivityTable();
	return tables;
}
