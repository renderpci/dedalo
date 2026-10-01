/**
 * THE GUARDED RUNNER DOOR of the spawned runner children
 * (diffusion_runner_kill_child.ts, diffusion_runner_pool_child.ts).
 *
 * A child process runs the REAL `runJob` — what the scheduler's spawned process
 * runs — and `runJob` WRITES: job rows, dd1758 rows, run-ledger rows, files. The
 * marker law (every test-data writer asks `assertTestDatabase` before its first
 * write) holds for it like for any helper, and this module is where it is asked:
 * ONE importable door, so test_db_marker_tripwire's rule 2 can probe the refusal
 * in-process (a spawned child cannot run inside its rollback transaction), and
 * the children carry no write seam of their own. The runner is loaded only
 * after the database answered.
 */

import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

/** Run one claimed job's epoch — on a database that SAYS it is a test one, or not at all. */
export async function runGuardedDiffusionJob(jobId: string, epoch: number): Promise<void> {
	await assertTestDatabase('runGuardedDiffusionJob');
	const { runJob } = await import('../../src/diffusion/runner.ts');
	await runJob(jobId, epoch);
}
