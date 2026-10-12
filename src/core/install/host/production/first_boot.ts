/**
 * host_first_boot — THE FIRST START (terminal installer phase 4, 2026-10-12):
 * `systemctl start dedalo-ts@<i>`, then wait — bounded, with progress — for
 * the socket's /health to answer 200 AND for every migration file to be
 * recorded (online migrations included: scripts/ops/boot_status.ts, run as the
 * instance). Only then is the watchdog armed (the next step): campaign 2 L7 —
 * a watchdog armed with the service killed the first boot mid-migration.
 *
 * Under SELinux the started engine must run in its OWN domain (dedalo_engine_t,
 * deploy/selinux/dedalo_engine.cil.tpl): the web server may connect to that
 * domain only, so an engine left in unconfined_service_t answers on its socket
 * but never through the site. Read back from the running process, not assumed.
 */

import type { ExecCommand, HostCtx, HostPlanCtx, HostStepDefinition } from '../contract.ts';
import { executeCommands } from '../execute.ts';
import { hostRefuse } from '../refuse.ts';
import { exec, probeText, ran, systemctl, verdictOf } from './common.ts';
import { ENGINE_DOMAIN, selinuxApplies } from './selinux.ts';
import { serverUnit } from './units.ts';

/** The bound of each wait (boot migrations and the search-store backfill can take minutes). */
export const FIRST_BOOT_LIMIT_MS = 45 * 60 * 1000;
const POLL_MS = 3000;
const PROGRESS_EVERY = 10;

/** `/health` over the socket → the HTTP status ('000' while nothing listens). */
export function healthProbe(ctx: HostPlanCtx): ExecCommand {
	return exec(
		ctx,
		'curl',
		[
			'-s',
			'-o',
			'/dev/null',
			'-w',
			'%{http_code}',
			'--max-time',
			'10',
			'--unix-socket',
			ctx.paths.socket,
			'http://localhost/health',
		],
		'the engine answers /health on its socket',
		{ mutates: false, okExit: [0, 7, 28, 56] },
	);
}

/** The migration census, as the instance (pending files as one JSON line). */
export function bootStatusProbe(ctx: HostPlanCtx): ExecCommand {
	return {
		kind: 'exec',
		argv: [ctx.paths.bun, 'run', 'scripts/ops/boot_status.ts', '--json'],
		as: 'instance',
		label: 'every migration recorded',
		mutates: false,
		cwd: ctx.paths.tree,
		env: { HOME: ctx.paths.home },
		timeoutMs: 120_000,
	};
}

/** The pending migrations (null: the census did not answer). */
async function pendingMigrations(ctx: HostCtx): Promise<string[] | null> {
	const text = await probeText(ctx, bootStatusProbe(ctx));
	try {
		const answer = JSON.parse(text.trim().split('\n').at(-1) ?? '') as { pending?: string[] };
		return Array.isArray(answer.pending) ? answer.pending : null;
	} catch {
		return null;
	}
}

async function healthy(ctx: HostCtx): Promise<boolean> {
	return (await probeText(ctx, healthProbe(ctx))).trim() === '200';
}

/**
 * The exit code a server that refuses to boot leaves (src/config/install_state.ts
 * NOT_INSTALLED_EXIT_CODE — held equal by install_host_steps_native; not imported,
 * so the root-run host executor never loads the engine's config layer).
 */
export const REFUSED_BOOT_EXIT = 78;

/** `systemctl show -p <property> --value <unit>` — one property per call. */
export function unitPropertyProbe(ctx: HostPlanCtx, property: string): ExecCommand {
	return exec(
		ctx,
		'systemctl',
		['show', '-p', property, '--value', serverUnit(ctx)],
		`${serverUnit(ctx)} ${property}`,
		{ mutates: false },
	);
}

/**
 * The unit REFUSED to boot (exit 78 → RestartPreventExitStatus → `failed`, never
 * restarted): stop waiting at once, instead of polling /health for the whole
 * bound against a unit nothing will start again.
 */
async function refuseIfBootRefused(ctx: HostCtx): Promise<void> {
	const result = (await probeText(ctx, unitPropertyProbe(ctx, 'Result'))).trim();
	if (result !== 'exit-code') return;
	const status = (await probeText(ctx, unitPropertyProbe(ctx, 'ExecMainStatus'))).trim();
	if (status !== String(REFUSED_BOOT_EXIT)) return;
	hostRefuse(
		'install.step_failed',
		`${serverUnit(ctx)} refused to boot (exit ${REFUSED_BOOT_EXIT}: not installed for the unit's environment) — see journalctl -u ${serverUnit(ctx)} for the [boot] REFUSED line`,
	);
}

/** Healthy yet? — refusing at once when the unit refused to boot. */
async function healthyOrRefused(ctx: HostCtx): Promise<boolean> {
	if (await healthy(ctx)) return true;
	await refuseIfBootRefused(ctx);
	return false;
}

/** A process's SELinux label (`ps -o label= -p <pid>`). */
export function processLabelProbe(ctx: HostPlanCtx, pid: string): ExecCommand {
	return exec(ctx, 'ps', ['-o', 'label=', '-p', pid], `the engine's SELinux domain (pid ${pid})`, {
		mutates: false,
	});
}

/**
 * Why the running engine is not in its own SELinux domain, or null (SELinux
 * does not apply, or it is). Read from the unit's MainPID.
 */
export async function engineDomainProblem(ctx: HostCtx): Promise<string | null> {
	if (!selinuxApplies(ctx)) return null;
	const pid = (await probeText(ctx, unitPropertyProbe(ctx, 'MainPID'))).trim();
	if (!/^[1-9]\d*$/.test(pid)) return `${serverUnit(ctx)} has no main process`;
	const label = (await probeText(ctx, processLabelProbe(ctx, pid))).trim();
	if (label.split(':')[2] === ENGINE_DOMAIN) return null;
	return `${serverUnit(ctx)} runs as ${label || 'an unknown label'}, not ${ENGINE_DOMAIN} — the web server cannot reach its socket (ls -Z ${ctx.paths.bun}: dedalo_engine_exec_t expected; restorecon -F it, then systemctl restart ${serverUnit(ctx)})`;
}

async function migrated(ctx: HostCtx): Promise<boolean> {
	return (await pendingMigrations(ctx))?.length === 0;
}

/** A poll's bound and cadence (default: the first boot's). */
export interface PollBound {
	limitMs: number;
	intervalMs: number;
	/** What to read when the bound passes. */
	look: string;
}

/** Poll `check` until it holds or the bound passes (a progress line every ~10 rounds). */
export async function pollUntil(
	ctx: HostCtx,
	check: () => Promise<boolean>,
	what: string,
	bound: PollBound = {
		limitMs: FIRST_BOOT_LIMIT_MS,
		intervalMs: POLL_MS,
		look: `see journalctl -u ${serverUnit(ctx)}`,
	},
): Promise<void> {
	const started = ctx.now();
	for (let round = 1; !(await check()); round++) {
		if (ctx.now() - started > bound.limitMs) {
			hostRefuse(
				'install.step_failed',
				`${what}: not reached after ${Math.round(bound.limitMs / 1000)} s — ${bound.look}`,
			);
		}
		if (round % PROGRESS_EVERY === 0)
			ctx.say(`    waiting: ${what} (${Math.round((ctx.now() - started) / 1000)} s)`);
		await ctx.sleep(bound.intervalMs);
	}
}

export const host_first_boot: HostStepDefinition = {
	id: 'host_first_boot',
	privilege: 'root',
	kind: 'action',
	needs: [],
	label: () => 'first boot: start, /health on the socket, every migration recorded',
	commands: (ctx) => [
		systemctl(ctx, 'start', [serverUnit(ctx)], `start ${serverUnit(ctx)}`),
		healthProbe(ctx),
		bootStatusProbe(ctx),
	],
	verify: async (ctx) => {
		const domain = await engineDomainProblem(ctx);
		return verdictOf(
			[
				[await healthy(ctx), '/health does not answer 200 on the socket'],
				[await migrated(ctx), 'migrations are pending'],
				[domain === null, domain ?? ''],
			],
			'the engine is up and every migration is recorded',
		);
	},
	run: async (ctx) => {
		await executeCommands(
			[systemctl(ctx, 'start', [serverUnit(ctx)], `start ${serverUnit(ctx)}`)],
			ctx,
		);
		await pollUntil(ctx, () => healthyOrRefused(ctx), 'the engine answering /health');
		await pollUntil(ctx, () => migrated(ctx), 'every migration recorded');
		const domain = await engineDomainProblem(ctx);
		if (domain !== null) hostRefuse('install.step_failed', domain);
		return ran(`${serverUnit(ctx)} is up; migrations complete`);
	},
	undo: async (ctx) => {
		await executeCommands(
			[
				exec(ctx, 'systemctl', ['stop', serverUnit(ctx)], `stop ${serverUnit(ctx)}`, {
					okExit: [0, 5],
				}),
			],
			ctx,
		);
		return `${serverUnit(ctx)} stopped`;
	},
};
