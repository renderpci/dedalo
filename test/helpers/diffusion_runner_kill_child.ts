/**
 * A RUNNER PROCESS THAT KILLS ITSELF (-9) AT A CHOSEN POINT — the crash of
 * diffusion_resume_ledger_native's kill leg.
 *
 *   bun run test/helpers/diffusion_runner_kill_child.ts <watchDir> <namePrefix> <jobId> <epoch>
 *
 * Runs the REAL `runJob` (src/diffusion/runner.ts — the same function the
 * scheduler's spawned process runs) and SIGKILLs its own process the first time
 * a file whose name starts with <namePrefix> and ends in `.md` appears in
 * <watchDir>. The kill point is therefore a published per-record file of the
 * run's FRONTIER drain, deterministic in the run's own progress (no wall-clock
 * race with the parent): the run is past its primary batches and inside the
 * drain when the process dies — no close, no abort, no finally.
 *
 * The environment is the parent's (the bun-test preload repoints the database,
 * the media root, the diffusion scratch tables and the files root), inherited
 * whole through Bun.spawn. Exit 0 with `RUN_COMPLETED` on stdout means the
 * trigger never fired — the parent treats that as a vacuous leg, never a pass.
 *
 * `runJob` WRITES (job rows, dd1758 rows, run-ledger rows, files): it is reached
 * through the guarded door (diffusion_runner_door.ts), which asks the database
 * for its test marker BEFORE the runner is even loaded.
 */

import { readdirSync, watch } from 'node:fs';
import { runGuardedDiffusionJob } from './diffusion_runner_door.ts';

const [watchDir, namePrefix, jobId, epochArgument] = process.argv.slice(2);
if (
	watchDir === undefined ||
	namePrefix === undefined ||
	jobId === undefined ||
	epochArgument === undefined
) {
	console.error('usage: diffusion_runner_kill_child.ts <watchDir> <namePrefix> <jobId> <epoch>');
	process.exit(2);
}
// Narrowed once, for the closures below (a closure does not see the guard's narrowing).
const watchedDir: string = watchDir;
const killPrefix: string = namePrefix;

function triggered(): boolean {
	try {
		return readdirSync(watchedDir).some(
			(name) => name.startsWith(killPrefix) && name.endsWith('.md'),
		);
	} catch {
		return false;
	}
}

function die(): void {
	if (triggered()) process.kill(process.pid, 'SIGKILL');
}

// Two observers of the same condition: the fs event, and a 1 ms poll that runs
// between any two awaits of the run (the writers' file writes are synchronous,
// so the process yields only between them).
watch(watchedDir, () => die());
setInterval(die, 1);

await runGuardedDiffusionJob(jobId, Number(epochArgument));
console.log('RUN_COMPLETED');
process.exit(0);
