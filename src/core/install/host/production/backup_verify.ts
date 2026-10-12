/**
 * host_backup_verify — THE FIRST BACKUP, VERIFIED (terminal installer phase 4,
 * 2026-10-12): `systemctl start --wait dedalo-backup@<i>`, then the OUTCOME —
 * campaign 2: a truncated store list reported success —
 *
 *  - LAST_OK written by THIS run (its mtime after the start — a marker left by
 *    an earlier run proves nothing: critique A7) and listing EVERY expected
 *    store with exit 0; no BACKUP_FAILED;
 *  - the unit's EFFECTIVE environment (`systemctl show -p Environment`, the
 *    merge systemd runs) carries the FULL DEDALO_BACKUP_EXPECTED_STORES list
 *    (L8: an unquoted value is split and silently truncated);
 *
 *  - with the site-builder store asked for: its OWN root unit
 *    (dedalo-backup-site-builder@<i>, no instance .env — render.ts) run and
 *    verified the same way, against its root-owned verdict;
 *
 * and only then `enable --now` the nightly timer. Backups it made are KEPT on
 * --abort (told).
 */

import type { HostCtx, HostPlanCtx, HostStepDefinition } from '../contract.ts';
import { executeCommands } from '../execute.ts';
import { hostRefuse } from '../refuse.ts';
import {
	backupStores,
	expectedStores,
	siteBuilderBackupPaths,
	siteBuilderBackupUnit,
} from '../systemd/render.ts';
import { exec, probe, probeOk, probeText, ran, remember, systemctl, verdictOf } from './common.ts';

function unit(instance: string): string {
	return `dedalo-backup@${instance}.service`;
}

function timer(instance: string): string {
	return `dedalo-backup@${instance}.timer`;
}

/** One verdict directory's checks: no BACKUP_FAILED, a LAST_OK of this run listing every store at exit 0. */
function verdictChecks(
	ctx: HostCtx,
	state: string,
	stores: readonly string[],
	since: number,
): [boolean, string][] {
	const lastOk = ctx.fs.readText(`${state}/LAST_OK`) ?? '';
	const fresh = (ctx.fs.stat(`${state}/LAST_OK`)?.mtimeMs ?? 0) >= since;
	return [
		[!ctx.fs.exists(`${state}/BACKUP_FAILED`), `BACKUP_FAILED is present in ${state}`],
		[lastOk !== '' && fresh, `no LAST_OK written by this run in ${state}`],
		...stores.map((store): [boolean, string] => [
			lastOk.includes(`  ${store}: exit 0`),
			`store ${store} is not in ${state}/LAST_OK with exit 0`,
		]),
	];
}

/** The root-run site-builder store's checks (asked for only). */
function siteBuilderChecks(ctx: HostCtx, since: number): [boolean, string][] {
	if (!ctx.answers.backup_site_builder) return [];
	return verdictChecks(
		ctx,
		siteBuilderBackupPaths(ctx.paths.instance).stateDir,
		['site_builder'],
		since,
	);
}

/** The root-run site-builder store's run (asked for only). */
function siteBuilderRun(ctx: HostPlanCtx) {
	if (!ctx.answers.backup_site_builder) return [];
	return [
		exec(
			ctx,
			'systemctl',
			['start', '--wait', siteBuilderBackupUnit(ctx.paths.instance)],
			'run the site-builder store once (its own root unit)',
			{ okExit: [0, 1, 3], timeoutMs: 6 * 3600 * 1000 },
		),
	];
}

/** The checks of a backup run that started at `since` (0 = any run). */
async function backupChecks(ctx: HostCtx, since: number): Promise<[boolean, string][]> {
	const stores = backupStores(ctx.paths, ctx.row);
	const env = await probeText(
		ctx,
		probe(
			ctx,
			'systemctl',
			['show', '-p', 'Environment', unit(ctx.paths.instance)],
			'effective environment',
		),
	);
	const expected = `DEDALO_BACKUP_EXPECTED_STORES=${expectedStores(stores)}`;
	return [
		...verdictChecks(
			ctx,
			ctx.paths.backupStateDir,
			stores.map((line) => line.store),
			since,
		),
		[env.includes(expected), `the unit's effective environment does not carry ${expected}`],
		...siteBuilderChecks(ctx, since),
	];
}

export const host_backup_verify: HostStepDefinition = {
	id: 'host_backup_verify',
	privilege: 'root',
	kind: 'action',
	needs: [],
	label: (plan) =>
		`first backup of every store, verified; then the nightly timer (${String(plan.answers.backup_dir)})`,
	commands: (ctx) => [
		exec(
			ctx,
			'systemctl',
			['start', '--wait', unit(ctx.paths.instance)],
			'run the backup set once',
			{ okExit: [0, 1, 3], timeoutMs: 6 * 3600 * 1000 },
		),
		...siteBuilderRun(ctx),
		systemctl(
			ctx,
			'enable',
			['--now', timer(ctx.paths.instance)],
			'enable the nightly backup timer',
		),
	],
	verify: async (ctx) => {
		const checks = await backupChecks(ctx, 0);
		const enabled = await probeOk(
			ctx,
			probe(ctx, 'systemctl', ['is-enabled', timer(ctx.paths.instance)], 'timer enabled'),
		);
		return verdictOf(
			[...checks, [enabled, `${timer(ctx.paths.instance)} is not enabled`]],
			'every store backed up; the nightly timer enabled',
		);
	},
	run: async (ctx) => {
		const since = ctx.now() - 1000;
		await executeCommands(
			[
				exec(
					ctx,
					'systemctl',
					['start', '--wait', unit(ctx.paths.instance)],
					'run the backup set once',
					{ okExit: [0, 1, 3], timeoutMs: 6 * 3600 * 1000 },
				),
				...siteBuilderRun(ctx),
			],
			ctx,
		);
		const failed = (await backupChecks(ctx, since)).filter(([ok]) => !ok).map(([, why]) => why);
		if (failed.length > 0)
			hostRefuse(
				'install.step_failed',
				`the first backup did not cover every store: ${failed.join('; ')} — see journalctl -u ${unit(ctx.paths.instance)}`,
			);
		await executeCommands(
			[
				systemctl(
					ctx,
					'enable',
					['--now', timer(ctx.paths.instance)],
					'enable the nightly backup timer',
				),
			],
			ctx,
		);
		return ran(`every store backed up to ${ctx.paths.backupDir}; nightly timer enabled`);
	},
	intent: (ctx) => {
		ctx.created.backup_timer = true;
		remember(ctx.created.enabled, timer(ctx.paths.instance));
	},
	undo: async (ctx) => {
		await executeCommands(
			[
				exec(
					ctx,
					'systemctl',
					['disable', '--now', timer(ctx.paths.instance)],
					'disable the backup timer',
					{ okExit: [0, 1, 5] },
				),
			],
			ctx,
		);
		return `backup timer disabled; the backups in ${ctx.paths.backupDir} are KEPT`;
	},
};
