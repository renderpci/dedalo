/**
 * THE REVIEW'S HOST COMMANDS (terminal installer phase 4, 2026-10-12) — what a
 * host route's Review lists: the facts of THIS machine measured now (read-only
 * commands, the same gathering host_preflight freezes), then every host step's
 * `commands()` for them, rendered exactly as they will run. The run measures
 * again at host_preflight and prints its own list; a resume runs the frozen one.
 *
 * On a machine that cannot be measured from this process (not root, not the
 * target), the facts read what they can; every refusal they imply is the run's
 * preflight's, never the Review's.
 */

import type { Subprocess } from 'bun';
import type { InstallPlan } from '../install_plan.ts';
import { buildPlanFile } from '../run_files_core.ts';
import { gatherHostFacts, type HostFacts, pendingFacts } from './facts.ts';
import { type HostFs, hostFs } from './fs.ts';
import { type HostReviewBlock, hostReview } from './host_table.ts';
import { type InstancePaths, instancePaths } from './layout.ts';
import { OS_ROWS, osRowById } from './os_support.ts';
import { type CommandRunner, scratchRunner, systemRunner } from './runner.ts';
import { readHostRootSeam } from './scratch.ts';
import { bunPinOf, sourceTreeRoot } from './source.ts';
import { gatherStackFacts } from './stack/facts.ts';

/** The runner and the fs the Review measures through (the scratch seam's when it is armed). */
function machine(): { runner: CommandRunner; fs: HostFs } {
	const scratch = readHostRootSeam();
	if (scratch !== null) {
		return {
			runner: scratchRunner(scratch.markerDir),
			fs: hostFs(scratch.root, `${scratch.markerDir}/owners.json`),
		};
	}
	return {
		runner: systemRunner({ children: new Set<Subprocess>(), redactions: () => [] }),
		fs: hostFs(''),
	};
}

/** The facts the Review computes with: the host's on production, the compose stack's on docker/trial. */
async function reviewFacts(
	plan: InstallPlan,
	paths: InstancePaths,
	source: string,
): Promise<HostFacts> {
	const { runner, fs } = machine();
	if (plan.answers.route !== 'production') {
		return { ...pendingFacts(), stack: await gatherStackFacts(runner, fs) };
	}
	return gatherHostFacts(runner, fs, plan.answers, paths, osRowById, source);
}

/** The Review blocks of a host plan (none for the developer route, the engine child, or an unsupported OS). */
export async function reviewHostCommands(plan: InstallPlan): Promise<HostReviewBlock[]> {
	if (plan.answers.route === 'developer' || plan.answers.engine_only) return [];
	const source = sourceTreeRoot();
	const paths = instancePaths(plan.answers, bunPinOf(source));
	const facts = await reviewFacts(plan, paths, source);
	if (plan.answers.route === 'production' && facts.os === null) return [];
	return hostReview({
		plan: buildPlanFile(plan, {}),
		answers: plan.answers,
		facts,
		row: facts.os === null ? (OS_ROWS[0] as (typeof OS_ROWS)[number]) : osRowById(facts.os),
		paths,
		source,
	});
}
