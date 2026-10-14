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
 *
 * Production also gets, BEFORE the steps (campaign 3 — what was discovered
 * only during the run, or only after it):
 *  - a TO DO block (`step: 'todo'`): what the operator must do themselves —
 *    the firewall's closed ports with the command (C3-6), Apache's modules
 *    (C3-34), the institution's certificate expiring within 30 days or not
 *    trusted by this host (C3-56, C3-13) — the installer checks these, never
 *    does them;
 *  - on each step and on its own mkdir line, the shared directories that
 *    already exist, marked "exists, not created" (C3-57, N26: a second
 *    instance's Review read as if it would recreate /srv/dedalo, /opt/dedalo…).
 */

import type { Subprocess } from 'bun';
import type { InstallPlan } from '../install_plan.ts';
import { buildPlanFile } from '../run_files_core.ts';
import type { HostPlanCtx } from './contract.ts';
import { gatherHostFacts, type HostFacts } from './facts.ts';
import { type HostFs, hostFs } from './fs.ts';
import type { HostExecutorOptions } from './host_executor.ts';
import { type HostReviewBlock, hostReview } from './host_table.ts';
import { type InstancePaths, instancePaths, pathsFor } from './layout.ts';
import { OS_ROWS, osRowById } from './os_support.ts';
import { operatorTodo, webServerClash } from './production/preflight.ts';
import { institutionCertVerdict } from './production/tls.ts';
import { type CommandRunner, scratchRunner, systemRunner } from './runner.ts';
import { readHostRootSeam } from './scratch.ts';
import { bunPinOf, sourceTreeRoot } from './source.ts';
import { gatherStackFacts } from './stack/facts.ts';
import { stackPlanFacts, stackReviewTodo } from './stack/preflight.ts';

/** The runner and the fs the Review (and the identity probe) measure through (the scratch seam's when it is armed). */
export function reviewMachine(): { runner: CommandRunner; fs: HostFs } {
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
	const { runner, fs } = reviewMachine();
	if (plan.answers.route !== 'production') {
		return stackPlanFacts(await gatherStackFacts(runner, fs), source);
	}
	return gatherHostFacts(runner, fs, plan.answers, paths, osRowById, source);
}

/** The step name of the Review's to-do block (not a host step: nothing in it is run). */
export const REVIEW_TODO_STEP = 'todo' as const;

/** A Review block: a host step's, or the to-do block. */
export type ReviewBlock = Omit<HostReviewBlock, 'step'> & {
	step: HostReviewBlock['step'] | typeof REVIEW_TODO_STEP;
};

/**
 * What the operator must do before (or for) the install, in words — the
 * firewall, Apache's modules, the institution's certificate. [] when nothing.
 */
export function reviewTodo(
	ctx: HostPlanCtx,
	fs: Pick<HostFs, 'readText' | 'exists'>,
	now: number,
): string[] {
	const cert = ctx.answers.tls_mode === 'files' ? institutionCertVerdict(ctx, fs, now) : null;
	return [
		// Another web server on this host: host_preflight refuses it — said BEFORE `yes` (campaign 3b N3).
		...webServerClash(ctx, fs),
		...operatorTodo(ctx),
		...(cert === null
			? []
			: [...cert.problems, ...cert.warnings].map(
					(line) => `certificate ${ctx.answers.tls_cert_path}: ${line}`,
				)),
	];
}

/** A `mkdir <path> (…)` Review line's path, or null. */
function mkdirPath(line: string): string | null {
	return /^mkdir (\S+) \(/.exec(line)?.[1] ?? null;
}

/**
 * The suffix of a `mkdir` line whose directory already exists (campaign 3b
 * N26 / C3-57). Not "used as is": the step's mkdir still sets the mode and
 * owner the line shows (fs.ts fixDirectory) — it only does not create it.
 */
export const EXISTS_NOT_CREATED = ' — exists: not created, mode and owner set as shown';

/**
 * Each block's label, with the directories it would create that already exist
 * — and each such `mkdir` line says so ITSELF: a header reading "exists, used
 * as is" above a bare `mkdir` of the same path read as a contradiction
 * (campaign 3b N26).
 */
function markExisting(
	blocks: readonly HostReviewBlock[],
	fs: Pick<HostFs, 'exists'>,
): HostReviewBlock[] {
	return blocks.map((block) => {
		const isExisting = (line: string): boolean => {
			const path = mkdirPath(line);
			return path !== null && fs.exists(path);
		};
		const existing = block.commands.filter(isExisting).map((line) => mkdirPath(line) as string);
		if (existing.length === 0) return block;
		return {
			...block,
			label: `${block.label} — exists, not created: ${existing.join(', ')}`,
			commands: block.commands.map((line) =>
				isExisting(line) ? `${line}${EXISTS_NOT_CREATED}` : line,
			),
		};
	});
}

/** The Review's to-do block, when there is anything to do. */
function todoBlocks(todo: readonly string[]): ReviewBlock[] {
	if (todo.length === 0) return [];
	return [
		{
			step: REVIEW_TODO_STEP,
			label:
				'TO DO YOURSELF — the installer checks these and never does them (read before you install)',
			commands: [...todo],
		},
	];
}

/** The plan context the Review lists the commands of. */
function reviewContext(
	plan: InstallPlan,
	facts: HostFacts,
	pin: string,
	source: string,
): HostPlanCtx {
	return {
		plan: buildPlanFile(plan, {}),
		answers: plan.answers,
		facts,
		row: facts.os === null ? (OS_ROWS[0] as (typeof OS_ROWS)[number]) : osRowById(facts.os),
		paths: pathsFor(plan.answers, pin, facts),
		source,
	};
}

/** Does this plan run no HOST step here (the developer route, the delegated engine child)? */
function runsNoHostStep(plan: InstallPlan): boolean {
	return plan.answers.route === 'developer' || plan.answers.engine_only;
}

/** The Review blocks of a host plan (none for the developer route, the engine child, or an unsupported OS). */
export async function reviewHostCommands(plan: InstallPlan): Promise<ReviewBlock[]> {
	if (runsNoHostStep(plan)) return [];
	const source = sourceTreeRoot();
	const pin = bunPinOf(source);
	// The instance-derived names to measure under; the commands take the paths
	// whose service group the measured account decides (critique B2).
	const facts = await reviewFacts(plan, instancePaths(plan.answers, pin), source);
	if (plan.answers.route === 'production' && facts.os === null) return [];
	const ctx = reviewContext(plan, facts, pin, source);
	const { fs } = reviewMachine();
	if (plan.answers.route !== 'production') {
		return [...todoBlocks(stackReviewTodo(ctx, fs, Date.now())), ...hostReview(ctx)];
	}
	return [...todoBlocks(reviewTodo(ctx, fs, Date.now())), ...markExisting(hostReview(ctx), fs)];
}

/**
 * What the run's own system check would refuse for this plan, asked BEFORE
 * `yes` — the session's `preflightRefusals` (install_session.ts), wired by
 * scripts/install.ts (campaign 3c D2: an untrusted chain, Apache beside nginx,
 * a held port were refused only after `yes`, every answer lost). The SAME
 * function the run asks (host_executor.ts hostPlanRefusals), over the plan
 * with no secret; none for a plan that runs no host step. `options`: a gate's
 * scratch machine (default: this one, or the scratch seam's when armed).
 */
export async function reviewPreflightRefusals(
	plan: InstallPlan,
	options: HostExecutorOptions = {},
): Promise<string[]> {
	if (runsNoHostStep(plan)) return [];
	const { hostPlanRefusals } = await import('./host_executor.ts');
	return (await hostPlanRefusals(buildPlanFile(plan, {}), options)).errors;
}
