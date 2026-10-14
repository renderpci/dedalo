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
 * (critique A4). The HOST owns that display (campaign 3 C3-18): it records
 * `salt_shown` only when the line reached a terminal, and at the end of any
 * run that completes the install — a resume that adopted a child which
 * finished as an orphan included — shows the salt it reads back from the
 * instance's .env (as the instance), once, or prints the command that reads it.
 *
 * The child DIES WITH THE INSTALLER (C3-29): `setpriv --pdeathsig KILL` at
 * both ends of the runuser chain (execute.ts) — and a resume refuses while
 * the child of an earlier run still holds its own install lock (`--status`
 * names a live holder).
 *
 * The engine checks the backup directory the instance's units write to
 * (DEDALO_BACKUP_DIR = <backup dir>/db — C3-55), never a second one under
 * its private dir.
 *
 * VERIFY asks the child itself (`--status --json`, as the instance user):
 * done = its record says `complete`. UNDO is the child's own --abort — run
 * first in the reverse order. It refuses a sealed install unless the host
 * attests the instance never served (`unserved` in its request: the step that
 * first starts it as a server never started — C3-11); even then the child
 * refuses when its database changed since it sealed.
 */

import { HOST_ONLY_ANSWER_KEYS, type InstallAnswers } from '../../install_plan.ts';
import type { SecretKey } from '../../run_files_core.ts';
import {
	type ExecCommand,
	engineSecretKeys,
	type HostCtx,
	type HostPlanCtx,
	type HostStepDefinition,
} from '../contract.ts';
import { requestOf, succeeded } from '../execute.ts';
import { hostRefuse } from '../refuse.ts';
import { confirmFlags, probe, probeText, ran } from './common.ts';

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
		// The units' backup dir: the engine writes DEDALO_BACKUP_DIR=<it>/db (C3-55).
		backup_dir: ctx.answers.backup_dir,
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
		// The backups the units write (C3-55): the engine checks that directory, not <private>/backups.
		env: { HOME: ctx.paths.instanceDir, DEDALO_BACKUP_DIR: `${ctx.paths.backupDir}/db` },
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
				secrets: engineSecretKeys(ctx.plan.answers),
				with: { schema: 'dedalo.install.request/1', answers: engineAnswers(ctx) },
			},
			pdeathsig: true,
		},
	);
}

/** The child's record, as `--status --json` answers it. */
export interface EngineStatus {
	exists: boolean;
	outcome: 'in_progress' | 'complete' | 'aborted' | null;
	failed_step: string | null;
	/** The secrets a resume of the child still needs (C3-51); absent from an older child. */
	needs?: string[];
	/** The child generated the salt (C3-18). */
	salt_generated?: boolean;
	/** A LIVE process holding the child's install lock (C3-29), or null. */
	running?: { pid: number; started_at: string } | null;
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

/** The command that reads the salt back (the instance's .env is 0600, its user's). */
function saltCommand(ctx: HostPlanCtx): string {
	return `sudo grep ^DEDALO_SALT_STRING= ${ctx.paths.privateDir}/.env`;
}

/**
 * The salt line: to the one-time display, never to the transcript (critique
 * A4) — recorded shown ONLY when it reached a terminal (C3-18).
 */
function relayShowOnce(ctx: HostCtx, event: ChildEvent): void {
	const shown = ctx.io.showOnce?.(event.lines ?? []) ?? false;
	if (shown) ctx.created.salt_shown = true;
	else ctx.say(`    the generated salt is stored in ${ctx.paths.privateDir}/.env (0600)`);
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

/**
 * Refuse while the child of an earlier run still works (C3-29): its own
 * install lock is held by a live process — a second child would race it.
 */
export function refuseLiveChild(status: EngineStatus | null, where: string): void {
	const running = status?.running ?? null;
	if (running === null) return;
	hostRefuse(
		'install.state_conflict',
		`the engine steps of an earlier run are still running (pid ${running.pid}${where}, since ${running.started_at}) — wait for them to end (or stop that process), then --resume`,
	);
}

async function runEngine(ctx: HostCtx) {
	const status = await engineStatus(ctx);
	refuseLiveChild(status, ` as ${ctx.paths.user}`);
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

/**
 * The child's request on an abort: answers, and — when the instance never
 * served — the host's attestation (C3-11). The child still proves it.
 */
export function abortRequest(
	answers: Partial<InstallAnswers>,
	served: boolean,
): Readonly<Record<string, unknown>> {
	return {
		schema: 'dedalo.install.request/1',
		answers,
		...(served ? {} : { unserved: true }),
	};
}

/** The child's own --abort (events as JSON lines: no sentence of its own leaks into the host's). */
async function undoEngine(ctx: HostCtx): Promise<string> {
	const status = await engineStatus(ctx);
	if (status === null || !status.exists) return 'no engine record';
	refuseLiveChild(status, ` as ${ctx.paths.user}`);
	const command = childCommand(
		ctx,
		// The OPERATOR's confirmation, never the plan's name: the child's own gate decides.
		['--abort', ...confirmFlags(ctx), '--request-stdin', '--events-jsonl'],
		{
			label: 'undo the engine steps (its own --abort)',
			stdin: {
				secrets: ['db_password'],
				with: abortRequest(engineAnswers(ctx), ctx.created.served),
			},
			pdeathsig: true,
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
}

/** Which of the engine secrets the child still needs (null: it cannot say — C3-51). */
export function stillNeeded(status: EngineStatus | null): SecretKey[] | null {
	if (status === null || !status.exists) return null;
	if (status.outcome === 'complete') return [];
	return Array.isArray(status.needs) ? (status.needs as SecretKey[]) : null;
}

/** `grep` of the salt line in the instance's .env, as the instance (its stdout is the secret). */
function saltProbe(ctx: HostPlanCtx): ExecCommand {
	return probe(
		ctx,
		'grep',
		['-m', '1', '^DEDALO_SALT_STRING=', `${ctx.paths.privateDir}/.env`],
		'the generated salt (shown once, never logged)',
		{ as: 'instance' },
	);
}

/**
 * Show the generated salt ONCE (C3-18) — the end of any run that completes the
 * install, when no run reached a terminal with it: read back as `read` answers
 * it, handed to the one-time display; no terminal (or nothing read): the
 * command that reads it. Never logged.
 */
export async function showSaltLine(
	ctx: HostCtx,
	read: () => Promise<string>,
	command: string,
): Promise<void> {
	const salt = (await read()).trim().replace(/^DEDALO_SALT_STRING=/, '');
	const shown =
		salt !== '' && (ctx.io.showOnce?.([`  generated DEDALO_SALT_STRING = ${salt}`]) ?? false);
	if (shown) ctx.created.salt_shown = true;
	else
		ctx.say(
			`  the generated salt (DEDALO_SALT_STRING) is not shown here — read it with: ${command}`,
		);
}

/** The production engine's one-time salt (see showSaltLine). */
async function showSaltOnce(ctx: HostCtx): Promise<void> {
	if (ctx.created.salt_shown) return;
	const status = await engineStatus(ctx);
	if (status?.salt_generated !== true) return;
	await showSaltLine(ctx, () => probeText(ctx, saltProbe(ctx)), saltCommand(ctx));
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
	undo: undoEngine,
	afterComplete: showSaltOnce,
	secretsStillNeeded: async (ctx) => stillNeeded(await engineStatus(ctx)),
};
