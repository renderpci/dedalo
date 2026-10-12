/**
 * host_selinux — SELINUX CONTEXTS ON THE RHEL FAMILY (terminal installer phase
 * 4, 2026-10-12; enforcing or permissive — a no-op elsewhere):
 *
 *  - file contexts for what the web server reads or connects to:
 *      /var/run/dedalo-<i>(/.*)?        httpd_var_run_t   (the socket — the
 *                                       /var/run spelling: L48, the equivalence
 *                                       rule maps it onto /run)
 *      /srv/dedalo/<i>(/.*)?            httpd_sys_content_t (media + the
 *                                       published client — never the code tree,
 *                                       which an update replaces unlabelled: B13)
 *      /var/lib/dedalo-install/acme/<i>(/.*)?  httpd_sys_content_t (the HTTP-01
 *                                       challenge root — var_lib_t is denied: B13)
 *    then `restorecon -RF` on each;
 *  - ONE host-wide CIL module, `dedalo_engine` (deploy/selinux/), allowing
 *    httpd_t to connect to the engine's socket (L12). Written to
 *    /var/lib/dedalo-install/selinux/, loaded at priority 400, stamped; a
 *    module of that name the installer did not write is refused. Refcounted.
 *
 * No boolean is changed (no setsebool). The firewall is checked and told by
 * host_preflight, never changed.
 */

import type { HostCommand, HostCtx, HostPlanCtx, HostStepDefinition } from '../contract.ts';
import { executeCommands } from '../execute.ts';
import { hostRefuse } from '../refuse.ts';
import { otherEntries, updateEntry } from '../registry.ts';
import { sourceText } from '../source.ts';
import { exec, probe, probeText, ran, remember, verdictOf } from './common.ts';

/** Does SELinux apply here (RHEL family, enforcing or permissive)? */
export function selinuxApplies(ctx: HostPlanCtx): boolean {
	return (
		ctx.row.selinux && (ctx.facts.selinux === 'enforcing' || ctx.facts.selinux === 'permissive')
	);
}

/**
 * The file-context rules (spec, type, and the path relabelled now — null for
 * the socket dir, which systemd creates at each start and labels by the rule).
 */
export function fcontextRules(
	ctx: HostPlanCtx,
): { spec: string; type: string; path: string | null }[] {
	const { paths } = ctx;
	return [
		{ spec: `/var/run/dedalo-${paths.instance}(/.*)?`, type: 'httpd_var_run_t', path: null },
		{ spec: `${paths.srv}(/.*)?`, type: 'httpd_sys_content_t', path: paths.srv },
		...(ctx.answers.tls_mode === 'letsencrypt'
			? [{ spec: `${paths.acmeDir}(/.*)?`, type: 'httpd_sys_content_t', path: paths.acmeDir }]
			: []),
	];
}

/** The module file (stamped with the template's own hash). */
function moduleText(ctx: HostPlanCtx): string {
	return sourceText('deploy/selinux/dedalo_engine.cil.tpl', ctx.source).replace(
		'@@STAMP@@',
		'dedalo-install',
	);
}

function modulePath(ctx: HostPlanCtx): string {
	return `${ctx.paths.selinuxDir}/dedalo_engine.cil`;
}

/**
 * The commands. `present` = the local rules already defined (a re-run after a
 * kill adds only the missing ones: `semanage fcontext -a` refuses a duplicate).
 */
export function selinuxCommands(ctx: HostPlanCtx, present = ''): HostCommand[] {
	if (!selinuxApplies(ctx)) return [];
	return [
		...fcontextRules(ctx)
			.filter((rule) => !present.includes(rule.spec))
			.map((rule) =>
				exec(
					ctx,
					'semanage',
					['fcontext', '-a', '-t', rule.type, rule.spec],
					`label ${rule.spec} ${rule.type}`,
				),
			),
		...fcontextRules(ctx).flatMap((rule) =>
			rule.path === null
				? []
				: [exec(ctx, 'restorecon', ['-RF', rule.path], `relabel ${rule.path}`)],
		),

		{
			kind: 'mkdir',
			path: ctx.paths.selinuxDir,
			mode: 0o700,
			owner: 'root',
			group: 'root',
			label: 'the policy module dir',
		},
		{
			kind: 'write',
			path: modulePath(ctx),
			mode: 0o600,
			owner: 'root',
			group: 'root',
			content: moduleText(ctx),
			label:
				'the dedalo_engine policy module — WIDENS httpd_t: it may connect to the unix sockets of every unconfined_service_t service on this host, not only Dédalo\'s',
		},
		exec(
			ctx,
			'semodule',
			['-X', '400', '-i', modulePath(ctx)],
			'load the dedalo_engine module (httpd → the engine socket)',
		),
	];
}

/** A dedalo_engine module this installer did not write is someone else's. */
async function assertModuleOurs(ctx: HostCtx): Promise<void> {
	const loaded = (await probeText(ctx, probe(ctx, 'semodule', ['-l'], 'modules')))
		.split('\n')
		.some((line) => line.trim().split(/\s+/)[0] === 'dedalo_engine');
	const ours = ctx.fs.readText(modulePath(ctx));
	if (loaded && ours !== moduleText(ctx)) {
		hostRefuse(
			'install.state_conflict',
			'an SELinux module named dedalo_engine is loaded that this installer did not write — refusing to replace it',
		);
	}
}

export const host_selinux: HostStepDefinition = {
	id: 'host_selinux',
	privilege: 'root',
	kind: 'action',
	needs: [],
	label: () => 'SELinux file contexts and the socket policy (RHEL family)',
	commands: (ctx) => selinuxCommands(ctx),
	verify: async (ctx) => {
		if (!selinuxApplies(ctx)) return { ok: true, detail: 'SELinux does not apply on this host' };
		const rules = await probeText(
			ctx,
			probe(ctx, 'semanage', ['fcontext', '-l', '-C'], 'local rules'),
		);
		const modules = await probeText(ctx, probe(ctx, 'semodule', ['-l'], 'modules'));
		return verdictOf(
			[
				...fcontextRules(ctx).map((rule): [boolean, string] => [
					rules.includes(rule.spec),
					`no file context for ${rule.spec}`,
				]),
				[/^dedalo_engine\b/m.test(modules), 'the dedalo_engine module is not loaded'],
			],
			'file contexts and the socket policy in place',
		);
	},
	run: async (ctx) => {
		if (!selinuxApplies(ctx)) return ran(`SELinux ${ctx.facts.selinux} — nothing to do`);
		await assertModuleOurs(ctx);
		const present = await probeText(
			ctx,
			probe(ctx, 'semanage', ['fcontext', '-l', '-C'], 'local rules'),
		);
		await executeCommands(selinuxCommands(ctx, present), ctx);
		updateEntry(ctx.fs, ctx.paths, { selinux_module: true });
		return ran(`${fcontextRules(ctx).length} file contexts, the dedalo_engine module`, {
			told: [
				"SELinux: the dedalo_engine module lets the web server (httpd_t) connect to the unix sockets of EVERY unconfined_service_t service on this host (the engine runs in that domain), not only Dédalo's — review the other services started from /opt or /usr/local",
			],
		});
	},
	intent: (ctx) => {
		if (!selinuxApplies(ctx)) return;
		for (const rule of fcontextRules(ctx)) remember(ctx.created.selinux_fcontexts, rule.spec);
		ctx.created.selinux_module ||= !ctx.fs.exists(modulePath(ctx));
	},
	undo: async (ctx) => {
		const commands: HostCommand[] = ctx.created.selinux_fcontexts.map((spec) =>
			exec(ctx, 'semanage', ['fcontext', '-d', spec], `remove the file context ${spec}`, {
				okExit: [0, 1],
			}),
		);
		updateEntry(ctx.fs, ctx.paths, { selinux_module: false });
		const shared = otherEntries(ctx.fs, ctx.paths).some((entry) => entry.selinux_module);
		if (ctx.created.selinux_module && !shared) {
			commands.push(
				exec(
					ctx,
					'semodule',
					['-X', '400', '-r', 'dedalo_engine'],
					'unload the dedalo_engine module',
					{ okExit: [0, 1] },
				),
			);
			commands.push({ kind: 'remove', path: modulePath(ctx), label: 'the module file' });
		}
		await executeCommands(commands, ctx);
		return `${ctx.created.selinux_fcontexts.length} file context(s) removed${shared ? '; module kept (another instance uses it)' : ''}`;
	},
};
