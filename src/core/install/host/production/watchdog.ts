/**
 * host_watchdog — ARM THE HEALTH WATCHDOG, AFTER THE FIRST BOOT (terminal
 * installer phase 4, 2026-10-12): `enable --now dedalo-ts-watchdog@<i>.timer`
 * only once host_first_boot proved the engine up and fully migrated (campaign
 * 2 L7). The timer's OnActiveSec and the script's --grace keep a later
 * restart's boot safe too (finding F3).
 */

import type { HostStepDefinition } from '../contract.ts';
import { executeCommands } from '../execute.ts';
import { exec, probe, probeOk, ran, remember, systemctl } from './common.ts';

function timer(instance: string): string {
	return `dedalo-ts-watchdog@${instance}.timer`;
}

export const host_watchdog: HostStepDefinition = {
	id: 'host_watchdog',
	privilege: 'root',
	kind: 'action',
	needs: [],
	label: (plan) =>
		`arm the health watchdog (dedalo-ts-watchdog@${String(plan.answers.instance)}.timer)`,
	commands: (ctx) => [
		systemctl(ctx, 'enable', ['--now', timer(ctx.paths.instance)], 'arm the watchdog timer'),
	],
	verify: async (ctx) =>
		(await probeOk(
			ctx,
			probe(ctx, 'systemctl', ['is-active', timer(ctx.paths.instance)], 'timer active'),
		))
			? { ok: true, detail: 'the watchdog timer is active' }
			: { ok: false, detail: 'the watchdog timer is not active' },
	run: async (ctx) => {
		await executeCommands(
			[systemctl(ctx, 'enable', ['--now', timer(ctx.paths.instance)], 'arm the watchdog timer')],
			ctx,
		);
		return ran('watchdog armed');
	},
	intent: (ctx) => {
		ctx.created.watchdog_armed = true;
		remember(ctx.created.enabled, timer(ctx.paths.instance));
	},
	undo: async (ctx) => {
		await executeCommands(
			[
				exec(
					ctx,
					'systemctl',
					['disable', '--now', timer(ctx.paths.instance)],
					'disarm the watchdog',
					{ okExit: [0, 1, 5] },
				),
			],
			ctx,
		);
		return 'watchdog disarmed';
	},
};
