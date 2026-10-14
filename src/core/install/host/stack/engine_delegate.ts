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
 * --abort (it refuses a sealed install unless the host attests the stack
 * never started serving — C3-11) — run first in the reverse order, its events
 * as JSON lines (its own closing sentence never leaks into the host's: C3-52).
 * Before the child runs, the image tag must still be the verified digest (A16).
 *
 * The child's container is NAMED (campaign 3 C3-29): an interrupted run
 * removes it (`docker rm -f` — a killed `compose run` client leaves its
 * container working), and a resume refuses while one of an earlier run is
 * still running. The salt is the host's to show once (C3-18): read back from
 * /private/.env in the running engine container at the end of the install.
 */

import { HOST_ONLY_ANSWER_KEYS, type InstallAnswers } from '../../install_plan.ts';
import {
	type ExecCommand,
	engineSecretKeys,
	type HostCtx,
	type HostPlanCtx,
	type HostStepDefinition,
} from '../contract.ts';
import { requestOf, succeeded } from '../execute.ts';
import { confirmFlags, probeText, ran } from '../production/common.ts';
import {
	abortRequest,
	type EngineStatus,
	relay,
	saltTodo,
	showSaltLine,
	stillNeeded,
} from '../production/engine_delegate.ts';
import { hostRefuse } from '../refuse.ts';
import { databasePassword, rememberNewVolumes, stackCreated } from './common.ts';
import { composeCommand, composeProbe, dockerCommand, dockerProbe } from './compose.ts';
import { stackFactsOf } from './facts.ts';
import { assertPinnedImage } from './image_verify.ts';
import { ENGINE_VOLUMES, ENV_FILE, OVERRIDE_FILE, PRIVATE_VOLUME, stackFileOf } from './layout.ts';

/** The request schema of scripts/install.ts --request-stdin. */
const REQUEST_SCHEMA = 'dedalo.install.request/1';

/** The installer inside the image (its WORKDIR is the release tree). */
const CHILD = ['dedalo', 'bun', 'run', 'scripts/install.ts'] as const;

/** The engine child's answers: the host's minus the host-only keys (critique A14). */
export function stackEngineAnswers(ctx: HostPlanCtx): Partial<InstallAnswers> {
	const answers: Record<string, unknown> = { ...ctx.plan.answers };
	for (const key of HOST_ONLY_ANSWER_KEYS) delete answers[key];
	return { ...answers, engine_only: true } as Partial<InstallAnswers>;
}

/**
 * The engine child's container name (C3-29) — one per host, like the stack's
 * own volume names (layout.ts): one docker/trial stack per Docker host.
 */
export const ENGINE_CONTAINER = 'dedalo-install-engine';

/** The delegated run (fresh or resumed) — what the Review lists. */
export function stackEngineCommand(ctx: HostPlanCtx, resume = false): ExecCommand {
	return composeCommand(
		ctx,
		[
			'run',
			'--rm',
			'--name',
			ENGINE_CONTAINER,
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
				// the plan's own (the database password is the generated one)
				secrets: engineSecretKeys(ctx.plan.answers),
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

/** The id of the RUNNING engine container ('' when none). */
async function liveEngineContainer(ctx: HostCtx): Promise<string> {
	const filter = `name=^/?${ENGINE_CONTAINER}$`;
	const text = await probeText(
		ctx,
		dockerProbe(ctx, ['ps', '-q', '--filter', filter], 'a running engine container'),
	);
	return text.trim();
}

/** Refuse while the engine container of an earlier run still works (C3-29). */
async function refuseLiveContainer(ctx: HostCtx): Promise<void> {
	const id = await liveEngineContainer(ctx);
	if (id === '') return;
	hostRefuse(
		'install.state_conflict',
		`the engine steps of an earlier run are still running (container ${ENGINE_CONTAINER}, ${id}) — wait for them to end (or docker rm -f ${ENGINE_CONTAINER}), then --resume`,
	);
}

/** Stop the engine child's container (an interrupted run — C3-29). */
async function removeEngineContainer(ctx: HostCtx): Promise<void> {
	await ctx.runner.run(
		requestOf(
			dockerCommand(ctx, ['rm', '-f', ENGINE_CONTAINER], 'stop the engine container', {
				okExit: [0, 1],
			}),
			ctx,
		),
	);
}

async function runStackEngine(ctx: HostCtx) {
	await assertPinnedImage(ctx);
	await refuseLiveContainer(ctx);
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
			'--name',
			ENGINE_CONTAINER,
			'-T',
			...CHILD,
			'--abort',
			// The OPERATOR's confirmation, never the plan's name: the child's own gate decides.
			...confirmFlags(ctx),
			'--request-stdin',
			'--events-jsonl',
		],
		'undo the engine steps (its own --abort)',
		{
			stdin: {
				secrets: ['db_password'],
				with: abortRequest(stackEngineAnswers(ctx), ctx.created.served),
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

/** The command that reads the salt back from the engine container (docker.md and quickstart.md quote it — gate: install_stack_steps_native). */
export function stackSaltCommand(ctx: HostPlanCtx): string {
	return `docker compose -f ${stackFileOf(ctx.answers)} -f ${OVERRIDE_FILE} --env-file ${ENV_FILE} exec dedalo grep ^DEDALO_SALT_STRING= /private/.env`;
}

/** The stack engine's one-time salt (production/engine_delegate.ts showSaltLine — C3-18). */
async function showStackSalt(ctx: HostCtx): Promise<string[] | undefined> {
	if (!ctx.created.salt_shown) {
		const status = await stackEngineStatus(ctx);
		if (status?.salt_generated !== true) return undefined;
		const read = composeProbe(
			ctx,
			['exec', '-T', 'dedalo', 'grep', '-m', '1', '^DEDALO_SALT_STRING=', '/private/.env'],
			'the generated salt (shown once, never logged)',
		);
		await showSaltLine(ctx, () => probeText(ctx, read), stackSaltCommand(ctx));
	}
	// The closing To-do names the read command on EVERY completing run (campaign 3c D3).
	return [saltTodo(stackSaltCommand(ctx))];
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
	onInterrupt: removeEngineContainer,
	afterComplete: showStackSalt,
	secretsStillNeeded: async (ctx) => stillNeeded(await stackEngineStatus(ctx)),
};
