/**
 * A REAL RUNNER in a pool of `DB_POOL_MAX` connections — the pool leg of
 * diffusion_target_fence_native.
 *
 *   DB_POOL_MAX=<n> bun run test/helpers/diffusion_runner_pool_child.ts <jobId> <epoch>
 *
 * A runner needs two connections — its fenced batch's transaction and the
 * heartbeat beside it; in a pool of one the heartbeat queues behind the batch
 * and the sweeper revokes a live runner. The pool is sized once per process
 * (config), so the leg needs a process of its own. It runs the REAL `runJob`
 * (src/diffusion/runner.ts — what the scheduler's spawned process runs) on a
 * job the parent enqueued, claimed and seeded on the suite database; the
 * parent then reads the OUTCOME from the job row and the target (never a
 * helper's verdict). Prints `RUN_RETURNED` when runJob returned. The
 * environment is the parent's (the bun-test preload's repoints: the lane
 * database, the scratch jobs/activity tables, the files root), inherited whole
 * through Bun.spawn.
 */

import { closeDatabasePool } from '../../src/core/db/postgres.ts';
import { runGuardedDiffusionJob } from './diffusion_runner_door.ts';

const [jobId, epochArgument] = process.argv.slice(2);
if (jobId === undefined || epochArgument === undefined) {
	console.error('usage: diffusion_runner_pool_child.ts <jobId> <epoch>');
	process.exit(2);
}

// The run writes job rows and targets: only on a database that SAYS it is a
// test one (the door asks the marker before it loads the runner).
await runGuardedDiffusionJob(jobId, Number(epochArgument));
console.log('RUN_RETURNED');
await closeDatabasePool();
process.exit(0);
