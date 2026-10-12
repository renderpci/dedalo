/**
 * host_units — THE INSTANCE'S SYSTEMD UNITS (terminal installer phase 4,
 * 2026-10-12): the shared template units (deploy/systemd/*@*, one copy per
 * host) and this instance's drop-ins (systemd/render.ts), then
 * `daemon-reload` and `enable dedalo-ts@<i>.service` — WITHOUT --now (the
 * first boot is its own step) and WITHOUT the watchdog (armed only after the
 * first boot completed — host_watchdog) or the backup timer (enabled only
 * after a verified first backup — host_backup_verify, critique A7).
 *
 * A template that already exists with OTHER bytes (another installer's,
 * an operator's edit, a single-instance unit of the same name) is REFUSED —
 * never overwritten. Templates are removed on --abort only when no other
 * instance still uses them (the registry's refcount — whichever instance wrote
 * them).
 */

import type {
	HostCommand,
	HostCtx,
	HostPlanCtx,
	HostStepDefinition,
	WriteCommand,
} from '../contract.ts';
import { executeCommands } from '../execute.ts';
import { hostRefuse } from '../refuse.ts';
import { otherEntries, updateEntry } from '../registry.ts';
import { instanceDropins, renderTemplate, SYSTEMD_DIR, UNIT_TEMPLATES } from '../systemd/render.ts';
import { exec, probe, probeOk, ran, remember, stampOf, systemctl, verdictOf } from './common.ts';

/** The template writes (0644 root). */
export function templateWrites(ctx: HostPlanCtx): WriteCommand[] {
	return UNIT_TEMPLATES.map((name) => ({
		kind: 'write',
		path: `${SYSTEMD_DIR}/${name}`,
		mode: 0o644,
		owner: 'root',
		group: 'root',
		content: renderTemplate(name, ctx.row, ctx.source),
		label: `template unit ${name}`,
	}));
}

/** The drop-in writes (0644 root). */
export function dropinWrites(ctx: HostPlanCtx): WriteCommand[] {
	return instanceDropins(ctx.paths, ctx.row, ctx.answers, stampOf(ctx)).map((dropin) => ({
		kind: 'write',
		path: dropin.path,
		mode: 0o644,
		owner: 'root',
		group: 'root',
		content: dropin.content,
		label: `drop-in ${dropin.path.slice(SYSTEMD_DIR.length + 1)}`,
	}));
}

/** The server unit of the instance. */
export function serverUnit(ctx: HostPlanCtx): string {
	return `dedalo-ts@${ctx.paths.instance}.service`;
}

export function unitCommands(ctx: HostPlanCtx): HostCommand[] {
	return [
		...templateWrites(ctx),
		...dropinWrites(ctx),
		systemctl(ctx, 'daemon-reload', [], 'reload systemd'),
		systemctl(
			ctx,
			'enable',
			[serverUnit(ctx)],
			`enable ${serverUnit(ctx)} (started by the first-boot step)`,
		),
	];
}

/** A template present with other bytes is someone else's: refused, never overwritten. */
function assertNoForeignTemplate(ctx: HostCtx): void {
	const foreign = templateWrites(ctx).filter((write) => {
		const text = ctx.fs.readText(write.path);
		return text !== null && text !== write.content;
	});
	if (foreign.length > 0) {
		hostRefuse(
			'install.state_conflict',
			`${foreign.map((write) => write.path).join(', ')} already exist(s) with other content — another installer's or an edited copy; the installer never overwrites it (compare it with deploy/systemd/, then remove it or keep this host's instances on it)`,
		);
	}
}

/**
 * Remove the templates when no other instance still uses them — decided by the
 * REGISTRY's refcount, not by who wrote them: the instance that wrote them may
 * have been aborted first, and the last user must still clean them up. Only a
 * template byte-equal to this release's render goes (an installer's own file,
 * whichever instance wrote it); another byte content is someone else's.
 */
async function removeTemplates(ctx: HostCtx): Promise<string> {
	if (otherEntries(ctx.fs, ctx.paths).some((entry) => entry.templates)) {
		return 'templates kept (another instance uses them)';
	}
	const ours = templateWrites(ctx).filter((write) => ctx.fs.readText(write.path) === write.content);
	for (const write of ours) ctx.fs.remove(write.path);
	if (ours.length === 0) return 'no installer template left to remove';
	return `${ours.length} template(s) removed (no instance uses them)`;
}

export const host_units: HostStepDefinition = {
	id: 'host_units',
	privilege: 'root',
	kind: 'action',
	needs: [],
	label: (plan) =>
		`systemd units: dedalo-ts@${String(plan.answers.instance)} and its backup/watchdog templates`,
	commands: unitCommands,
	verify: async (ctx) =>
		verdictOf(
			[
				...[...templateWrites(ctx), ...dropinWrites(ctx)].map((write): [boolean, string] => [
					ctx.fs.readText(write.path) === write.content,
					`${write.path} differs from its render`,
				]),
				[
					await probeOk(ctx, probe(ctx, 'systemctl', ['is-enabled', serverUnit(ctx)], 'enabled')),
					`${serverUnit(ctx)} is not enabled`,
				],
			],
			`${UNIT_TEMPLATES.length} templates, the drop-ins, ${serverUnit(ctx)} enabled`,
		),
	run: async (ctx) => {
		assertNoForeignTemplate(ctx);
		await executeCommands(unitCommands(ctx), ctx);
		updateEntry(ctx.fs, ctx.paths, { templates: true });
		return ran(`${serverUnit(ctx)} enabled (not started yet)`);
	},
	intent: (ctx) => {
		for (const write of templateWrites(ctx))
			if (!ctx.fs.exists(write.path)) remember(ctx.created.units, write.path);
		for (const write of dropinWrites(ctx)) remember(ctx.created.dropins, write.path);
		remember(ctx.created.enabled, serverUnit(ctx));
	},
	undo: async (ctx) => {
		const i = ctx.paths.instance;
		await executeCommands(
			[
				exec(
					ctx,
					'systemctl',
					[
						'disable',
						'--now',
						serverUnit(ctx),
						`dedalo-ts-watchdog@${i}.timer`,
						`dedalo-backup@${i}.timer`,
					],
					'stop and disable the instance units',
					{ okExit: [0, 1, 5] },
				),
			],
			ctx,
		);
		for (const path of ctx.created.dropins) {
			ctx.fs.remove(path);
			ctx.fs.rmdirIfEmpty(path.slice(0, path.lastIndexOf('/')));
		}
		updateEntry(ctx.fs, ctx.paths, { templates: false });
		const templates = await removeTemplates(ctx);
		await executeCommands([systemctl(ctx, 'daemon-reload', [], 'reload systemd')], ctx);
		return `units disabled, drop-ins removed; ${templates}`;
	},
};
