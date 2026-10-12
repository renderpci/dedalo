/**
 * host_first_boot — THE FIRST START (terminal installer phase 4, 2026-10-12):
 * `systemctl start dedalo-ts@<i>`, then wait — bounded, with progress — for
 * the socket's /health to answer 200 AND for every migration file to be
 * recorded (online migrations included: scripts/ops/boot_status.ts, run as the
 * instance). Only then is the watchdog armed (the next step): campaign 2 L7 —
 * a watchdog armed with the service killed the first boot mid-migration.
 */

import type { ExecCommand, HostCtx, HostPlanCtx, HostStepDefinition } from '../contract.ts';
import { executeCommands } from '../execute.ts';
import { hostRefuse } from '../refuse.ts';
import { exec, probeText, ran, systemctl, verdictOf } from './common.ts';
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
	verify: async (ctx) =>
		verdictOf(
			[
				[await healthy(ctx), '/health does not answer 200 on the socket'],
				[await migrated(ctx), 'migrations are pending'],
			],
			'the engine is up and every migration is recorded',
		),
	run: async (ctx) => {
		await executeCommands(
			[systemctl(ctx, 'start', [serverUnit(ctx)], `start ${serverUnit(ctx)}`)],
			ctx,
		);
		await pollUntil(ctx, () => healthy(ctx), 'the engine answering /health');
		await pollUntil(ctx, () => migrated(ctx), 'every migration recorded');
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
