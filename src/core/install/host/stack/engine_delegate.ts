/**
 * stack_engine — THE ENGINE STEPS, INSIDE THE CONTAINER (terminal installer
 * phase 4, 2026-10-12): the host never runs an engine step itself. It starts
 * ONE child in the image this install verified, through the SAME headless
 * executor every route runs:
 *
 *     docker compose -f <stack> -f compose.override.yaml --env-file .dedalo.env \
 *         run --rm -T dedalo bun run scripts/install.ts \
 *         --request-stdin --execute --events-jsonl [--resume]
 *
 * Its request is ONE JSON object on stdin — the engine answers (the host's
 * minus the host-only keys, plus `engine_only`) AND the secrets (the root
 * password, the generated database password read back from .dedalo.env, the
 * services' passwords). Never `-e NAME=value` (an environment value shows in
 * `docker inspect` while the container runs — F5), never argv, never a bind
 * mount of a file the image's user cannot read (critique B10). The child keeps
 * its own plan and state in the `private` volume (/private/install).
 *
 * Its progress comes back as JSON lines and is relayed (the production
 * delegate's relay: the one-time salt line goes to the front end's one-time
 * display, never stored or logged — critique A4). VERIFY asks the child
 * (`--status --json`, in a throw-away container); UNDO is the child's own
 * --abort (it refuses a sealed install) — run first in the reverse order.
 * Before the child runs, the image tag must still be the verified digest (A16).
 */

import { HOST_ONLY_ANSWER_KEYS, type InstallAnswers } from '../../install_plan.ts';
import type { SecretKey } from '../../run_files_core.ts';
import type { ExecCommand, HostCtx, HostPlanCtx, HostStepDefinition } from '../contract.ts';
import { requestOf, succeeded } from '../execute.ts';
import { confirmFlags, probeText, ran } from '../production/common.ts';
import type { EngineStatus } from '../production/engine_delegate.ts';
import { relay } from '../production/engine_delegate.ts';
import { hostRefuse } from '../refuse.ts';
import { databasePassword, rememberNewVolumes, stackCreated } from './common.ts';
import { composeCommand, composeProbe } from './compose.ts';
import { stackFactsOf } from './facts.ts';
import { assertPinnedImage } from './image_verify.ts';
import { ENGINE_VOLUMES, PRIVATE_VOLUME } from './layout.ts';

/** The request schema of scripts/install.ts --request-stdin. */
const REQUEST_SCHEMA = 'dedalo.install.request/1';

/** The secrets the child is handed (the database password is the generated one). */
const ENGINE_SECRETS: readonly SecretKey[] = Object.freeze([
	'root_password',
	'db_password',
	'mysql_password',
	'smtp_pass',
]);

/** The installer inside the image (its WORKDIR is the release tree). */
const CHILD = ['dedalo', 'bun', 'run', 'scripts/install.ts'] as const;

/** The engine child's answers: the host's minus the host-only keys (critique A14). */
export function stackEngineAnswers(ctx: HostPlanCtx): Partial<InstallAnswers> {
	const answers: Record<string, unknown> = { ...ctx.plan.answers };
	for (const key of HOST_ONLY_ANSWER_KEYS) delete answers[key];
	return { ...answers, engine_only: true } as Partial<InstallAnswers>;
}

/** The delegated run (fresh or resumed) — what the Review lists. */
export function stackEngineCommand(ctx: HostPlanCtx, resume = false): ExecCommand {
	return composeCommand(
		ctx,
		[
			'run',
			'--rm',
			'-T',
			...CHILD,
			'--request-stdin',
			'--execute',
			'--events-jsonl',
			...(resume ? ['--resume'] : []),
		],
		'the engine steps (seed, ontologies, thesauri, tools, root), inside the container',
		{
			stdin: {
				secrets: ENGINE_SECRETS,
				with: { schema: REQUEST_SCHEMA, answers: stackEngineAnswers(ctx) },
			},
			timeoutMs: 6 * 3600 * 1000,
		},
	);
}

/** `--status --json` in a throw-away container (no dependency started). */
function statusProbe(ctx: HostPlanCtx): ExecCommand {
	return composeProbe(
		ctx,
		['run', '--rm', '-T', '--no-deps', ...CHILD, '--status', '--json'],
		'the engine record',
		{ timeoutMs: 300_000 },
	);
}

/** The child's record (null: it could not answer). */
export async function stackEngineStatus(ctx: HostCtx): Promise<EngineStatus | null> {
	const text = await probeText(ctx, statusProbe(ctx));
	try {
		return JSON.parse(text.trim().split('\n').at(-1) ?? '') as EngineStatus;
	} catch {
		return null;
	}
}

/** The context the child's request is built from: the generated database password joins the secrets. */
function withDatabasePassword(ctx: HostCtx): HostCtx {
	return { ...ctx, secrets: { ...ctx.secrets, db_password: databasePassword(ctx) } };
}

/** The relay's context: the child's private dir is the volume's, not a host path. */
function relayContext(ctx: HostCtx): HostCtx {
	return { ...ctx, paths: { ...ctx.paths, privateDir: `/private (volume ${PRIVATE_VOLUME})` } };
}

/** Run one child command with its events relayed; refuse with `failed` when it fails. */
async function runChild(ctx: HostCtx, command: ExecCommand, failed: string): Promise<void> {
	const relayed = relayContext(ctx);
	const result = await ctx.runner.run({
		...requestOf(command, withDatabasePassword(ctx)),
		onStdoutLine: (line) => relay(relayed, line),
	});
	if (!succeeded(command, result))
		hostRefuse('install.step_failed', `${failed} (exit ${result.exitCode})`);
}

async function runStackEngine(ctx: HostCtx) {
	await assertPinnedImage(ctx);
	const status = await stackEngineStatus(ctx);
	if (status?.outcome === 'complete') return ran('engine install already complete');
	await runChild(
		ctx,
		stackEngineCommand(ctx, status?.exists === true),
		`the engine steps failed — their record is in /private/install (volume ${PRIVATE_VOLUME}); the host install resumes them`,
	);
	return ran('engine steps complete');
}

/** The child's own --abort (it refuses a sealed install). */
async function undoStackEngine(ctx: HostCtx): Promise<string> {
	const status = await stackEngineStatus(ctx);
	if (status === null || !status.exists) return 'no engine record';
	const command = composeCommand(
		ctx,
		[
			'run',
			'--rm',
			'-T',
			...CHILD,
			'--abort',
			// The OPERATOR's confirmation, never the plan's name: the child's own gate decides.
			...confirmFlags(ctx),
			'--request-stdin',
		],
		'undo the engine steps (its own --abort)',
		{
			stdin: {
				secrets: ['db_password'],
				with: { schema: REQUEST_SCHEMA, answers: stackEngineAnswers(ctx) },
			},
			timeoutMs: 3600 * 1000,
		},
	);
	await runChild(
		ctx,
		command,
		'the engine child refused its --abort (see above) — nothing before it was undone',
	);
	return 'engine steps undone';
}

export const stack_engine: HostStepDefinition = {
	id: 'stack_engine',
	privilege: 'operator',
	kind: 'action',
	needs: ['root_password', 'mysql_password', 'smtp_pass'],
	label: () => 'the engine steps (seed, ontologies, thesauri, tools, root), inside the container',
	commands: (ctx) => [stackEngineCommand(ctx)],
	verify: async (ctx) => {
		const status = await stackEngineStatus(ctx);
		return status?.outcome === 'complete'
			? { ok: true, detail: 'the engine record is complete' }
			: { ok: false, detail: `the engine record is ${status?.outcome ?? 'not readable'}` };
	},
	run: runStackEngine,
	intent: (ctx) => {
		ctx.created.engine_run_dir = `/private/install (volume ${PRIVATE_VOLUME})`;
		rememberNewVolumes(ctx, ENGINE_VOLUMES, stackFactsOf(ctx).volumes);
		stackCreated(ctx);
	},
	undo: undoStackEngine,
};
