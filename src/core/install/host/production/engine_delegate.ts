/**
 * host_engine — THE ENGINE STEPS, DELEGATED (terminal installer phase 4,
 * 2026-10-12): the root process never runs an engine step itself (it would
 * freeze the engine configuration for the wrong private dir and run psql as
 * root). It starts ONE child, AS THE SERVICE USER (with the service group),
 * in the instance's own release tree:
 *
 *     runuser -u <service user> -g <service group> -- /opt/dedalo/bun/<pin>/bun \
 *         run scripts/install.ts --request-stdin --execute --events-jsonl [--resume]
 *
 * — the SAME headless executor (executor.ts) every route runs, with its own
 * plan and state under <install folder>/private/install/. Its request is ONE
 * JSON object on stdin: the engine answers (the host answers minus the
 * host-only keys, plus `engine_only`, the OS row's PostgreSQL binaries and the
 * NORMALIZED database role — the service user: the child has no service_user
 * to derive it from, critique B3) AND the secrets — never argv, never a file
 * root writes into a directory the instance owns (critique B10/A5).
 *
 * Its progress comes back as JSON lines (--events-jsonl): each log line and
 * step event is relayed, redacted; the one-time salt line (`show_once`) is
 * handed to the front end's one-time display and NEVER stored or logged
 * (critique A4).
 *
 * VERIFY asks the child itself (`--status --json`, as the instance user):
 * done = its record says `complete`. UNDO is the child's own --abort (it
 * refuses a sealed install) — run first in the reverse order.
 */

import { HOST_ONLY_ANSWER_KEYS, type InstallAnswers } from '../../install_plan.ts';
import type { ExecCommand, HostCtx, HostPlanCtx, HostStepDefinition } from '../contract.ts';
import { requestOf, succeeded } from '../execute.ts';
import { hostRefuse } from '../refuse.ts';
import { confirmFlags, ran } from './common.ts';

/**
 * The engine child's answers: the host's minus the host-only keys (critique
 * A14) — with the role the HOST normalized (= the service user on a created
 * database): the child never re-derives it (critique B3).
 */
export function engineAnswers(ctx: HostPlanCtx): Partial<InstallAnswers> {
	const answers: Record<string, unknown> = { ...ctx.plan.answers };
	for (const key of HOST_ONLY_ANSWER_KEYS) delete answers[key];
	return {
		...answers,
		db_username: ctx.answers.db_username,
		engine_only: true,
		pg_bin_path: ctx.row.pgBinDir,
	} as Partial<InstallAnswers>;
}

/** The child's argv (run as the instance, in its tree). */
function childCommand(
	ctx: HostPlanCtx,
	extra: readonly string[],
	options: Partial<ExecCommand>,
): ExecCommand {
	return {
		kind: 'exec',
		argv: [ctx.paths.bun, 'run', `${ctx.paths.tree}/scripts/install.ts`, ...extra],
		as: 'instance',
		label: 'the engine steps, as the instance user',
		mutates: true,
		cwd: ctx.paths.tree,
		env: { HOME: ctx.paths.instanceDir },
		timeoutMs: 6 * 3600 * 1000,
		...options,
	};
}

/** The delegated run (fresh or resumed) — what the Review lists. */
export function engineCommand(ctx: HostPlanCtx, resume = false): ExecCommand {
	return childCommand(
		ctx,
		['--request-stdin', '--execute', '--events-jsonl', ...(resume ? ['--resume'] : [])],
		{
			stdin: {
				secrets: ['root_password', 'mysql_password', 'smtp_pass', 'db_password'],
				with: { schema: 'dedalo.install.request/1', answers: engineAnswers(ctx) },
			},
		},
	);
}

/** The child's record, as `--status --json` answers it. */
export interface EngineStatus {
	exists: boolean;
	outcome: 'in_progress' | 'complete' | 'aborted' | null;
	failed_step: string | null;
}

/** Ask the child for its record (null: it could not answer). */
export async function engineStatus(ctx: HostCtx): Promise<EngineStatus | null> {
	const command = childCommand(ctx, ['--status', '--json'], {
		mutates: false,
		label: 'the engine record',
		timeoutMs: 120_000,
	});
	const result = await ctx.runner.run(requestOf(command, ctx));
	if (!succeeded(command, result)) return null;
	try {
		return JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '') as EngineStatus;
	} catch {
		return null;
	}
}

/** One event of the child's stream (--events-jsonl). */
interface ChildEvent {
	event?: string;
	line?: string;
	lines?: string[];
	step?: string;
	phase?: string;
	label?: string;
}

/** The salt line: to the one-time display, never to the transcript (critique A4). */
function relayShowOnce(ctx: HostCtx, event: ChildEvent): void {
	const shown = ctx.io.showOnce?.(event.lines ?? []) ?? false;
	if (!shown) ctx.say(`    the generated salt is stored in ${ctx.paths.privateDir}/.env (0600)`);
}

const RELAY: Readonly<Record<string, (ctx: HostCtx, event: ChildEvent) => void>> = Object.freeze({
	show_once: relayShowOnce,
	warn: (ctx: HostCtx, event: ChildEvent) => ctx.warn(`    ${event.line ?? ''}`),
	log: (ctx: HostCtx, event: ChildEvent) => ctx.say(`    ${event.line ?? ''}`),
	step: (ctx: HostCtx, event: ChildEvent) =>
		ctx.say(`    engine ${event.phase ?? ''}: ${event.label ?? event.step ?? ''}`),
});

/** One JSON line of the child's event stream, relayed (never stored) — the docker delegate's too. */
export function relay(ctx: HostCtx, line: string): void {
	let event: ChildEvent;
	try {
		event = JSON.parse(line) as ChildEvent;
	} catch {
		ctx.say(`    ${line}`);
		return;
	}
	RELAY[event.event ?? '']?.(ctx, event);
}

async function runEngine(ctx: HostCtx) {
	const status = await engineStatus(ctx);
	if (status?.outcome === 'complete') return ran('engine install already complete');
	const command = engineCommand(ctx, status?.exists === true);
	const result = await ctx.runner.run({
		...requestOf(command, ctx),
		onStdoutLine: (line) => relay(ctx, line),
	});
	if (!succeeded(command, result)) {
		hostRefuse(
			'install.step_failed',
			`the engine steps failed (exit ${result.exitCode}) — their record is in ${ctx.paths.privateDir}/install; the host install resumes them`,
		);
	}
	return ran('engine steps complete');
}

export const host_engine: HostStepDefinition = {
	id: 'host_engine',
	privilege: 'root',
	kind: 'action',
	needs: ['root_password', 'mysql_password', 'smtp_pass', 'db_password'],
	label: () => 'the engine steps (seed, ontologies, thesauri, tools, root), as the instance user',
	commands: (ctx) => [engineCommand(ctx)],
	verify: async (ctx) => {
		const status = await engineStatus(ctx);
		return status?.outcome === 'complete'
			? { ok: true, detail: 'the engine record is complete' }
			: { ok: false, detail: `the engine record is ${status?.outcome ?? 'not readable'}` };
	},
	run: runEngine,
	intent: (ctx) => {
		ctx.created.engine_run_dir = ctx.paths.privateDir;
	},
	undo: async (ctx) => {
		const status = await engineStatus(ctx);
		if (status === null || !status.exists) return 'no engine record';
		const command = childCommand(
			ctx,
			// The OPERATOR's confirmation, never the plan's name: the child's own gate decides.
			['--abort', ...confirmFlags(ctx), '--request-stdin'],
			{
				label: 'undo the engine steps (its own --abort)',
				stdin: {
					secrets: ['db_password'],
					with: { schema: 'dedalo.install.request/1', answers: engineAnswers(ctx) },
				},
			},
		);
		const result = await ctx.runner.run({
			...requestOf(command, ctx),
			onStdoutLine: (line) => relay(ctx, line),
		});
		if (!succeeded(command, result)) {
			hostRefuse(
				'install.state_conflict',
				'the engine child refused its --abort (see above) — nothing before it was undone',
			);
		}
		return 'engine steps undone';
	},
};
