/**
 * host_selinux — SELINUX CONTEXTS ON THE RHEL FAMILY (terminal installer phase
 * 4, 2026-10-12; enforcing or permissive — a no-op elsewhere):
 *
 *  - file contexts, every spec DERIVED FROM THE ANSWERS (the socket's dir, the
 *    web root of MEDIA_PATH, the install folder — any path, regex-escaped):
 *      <socket dir>(/.*)?               httpd_var_run_t   (the socket — the
 *                                       /var/run spelling under /run: L48, the
 *                                       equivalence rule maps it onto /run)
 *      /srv/dedalo/<i>(/.*)? and the    httpd_sys_content_t (media + the
 *      web root of MEDIA_PATH           published client — never the code tree,
 *                                       which an update replaces unlabelled: B13)
 *      /var/lib/dedalo-install/acme/<i>(/.*)?  httpd_sys_content_t (the HTTP-01
 *                                       challenge root — var_lib_t is denied: B13)
 *      <install folder>/{dedalo,private,backups}(/.*)?  var_lib_t — and the
 *                                       backup dir when it lies outside, and the
 *                                       folder itself (not recursive) when this
 *                                       install created it: init_t reaches the
 *                                       WorkingDirectory= and EnvironmentFile=
 *                                       there, the engine and the backup units
 *                                       are unconfined, and httpd_t is DENIED
 *                                       var_lib_t (B13) — so the web server never
 *                                       reads the tree, whatever path it is at
 *                                       (a /home path would be user_home_t, a
 *                                       /data path default_t: EnvironmentFile
 *                                       breaks, /opt usr_t: httpd reads it).
 *                                       Never a relabel of an existing folder
 *                                       itself (a hosting account's .ssh stays);
 *    then `restorecon -RF` on each (the instance's subtrees AS the service
 *    user: root never works by path inside the install folder — B1);
 *  - ONE host-wide CIL module, `dedalo_engine` (deploy/selinux/): the engine's
 *    own domain dedalo_engine_t (systemd starts the pinned runtime, labelled
 *    dedalo_engine_exec_t, into it) and httpd_t → dedalo_engine_t connectto
 *    (L12) — the web server reaches the engine's socket and NO other
 *    service's (connectto is checked against the listener's domain, so a rule
 *    naming unconfined_service_t would open every service in it). Written to
 *    /var/lib/dedalo-install/selinux/, loaded at priority 400, stamped; a
 *    module of that name the installer did not write is refused. Refcounted.
 *    Then `restorecon -F` on the runtime: `install` gave it the directory's
 *    type, the module's filecon applies only once it is loaded.
 *
 * No boolean is changed (no setsebool). The firewall is checked and told by
 * host_preflight, never changed.
 */

import type {
	ExecCommand,
	HostCommand,
	HostCtx,
	HostPlanCtx,
	HostStepDefinition,
} from '../contract.ts';
import { executeCommands } from '../execute.ts';
import { isInside } from '../fs.ts';
import { hostRefuse } from '../refuse.ts';
import { otherEntries, updateEntry } from '../registry.ts';
import { sourceText } from '../source.ts';
import { exec, probe, probeText, ran, remember, verdictOf } from './common.ts';
import { identityOf } from './identity.ts';

/** The engine runtime's file type and the domain systemd starts it into (the module's). */
export const ENGINE_EXEC_TYPE = 'dedalo_engine_exec_t';
export const ENGINE_DOMAIN = 'dedalo_engine_t';

/** Does SELinux apply here (RHEL family, enforcing or permissive)? */
export function selinuxApplies(ctx: HostPlanCtx): boolean {
	return (
		ctx.row.selinux && (ctx.facts.selinux === 'enforcing' || ctx.facts.selinux === 'permissive')
	);
}

/** A path as a literal inside a file-context regex (its metacharacters escaped). */
export function fcontextEscape(path: string): string {
	return path.replace(/[.^$*+?()[\]{}|\\]/g, '\\$&');
}

/** The /var/run spelling of a path under /run (L48: the equivalence rule maps it onto /run). */
function varRunSpelling(path: string): string {
	return path === '/run' || path.startsWith('/run/') ? `/var${path}` : path;
}

/** One file-context rule. */
export interface FcontextRule {
	spec: string;
	type: string;
	/** The path relabelled now (null: systemd creates it at each start — labelled by the rule). */
	path: string | null;
	/** Relabelled as the service user (inside the install folder — B1). */
	byUser?: true;
	/** Only the path itself (the install folder this install created), not its tree. */
	single?: true;
}

/** A recursive rule over `path`. */
function treeRule(path: string, type: string, extra: Partial<FcontextRule> = {}): FcontextRule {
	return { spec: `${fcontextEscape(path)}(/.*)?`, type, path, ...extra };
}

/** The web content: /srv/dedalo/<i>, and MEDIA_PATH's web root when it lies elsewhere. */
function webRules(ctx: HostPlanCtx): FcontextRule[] {
	const { paths } = ctx;
	const outside = !isInside(paths.srv, paths.webRoot);
	return [
		treeRule(paths.srv, 'httpd_sys_content_t'),
		...(outside ? [treeRule(paths.webRoot, 'httpd_sys_content_t')] : []),
		...(ctx.answers.tls_mode === 'letsencrypt'
			? [treeRule(paths.acmeDir, 'httpd_sys_content_t')]
			: []),
	];
}

/** The install folder itself — only when this install created it (never an existing folder). */
function folderRule(ctx: HostPlanCtx): FcontextRule[] {
	const folder = identityOf(ctx).folder;
	if (folder.kind !== 'create') return [];
	const dir = ctx.paths.instanceDir;
	return [
		{
			spec: fcontextEscape(dir),
			type: 'var_lib_t',
			path: dir,
			single: true,
			...(folder.by === 'user' ? { byUser: true as const } : {}),
		},
	];
}

/** The instance's own subtrees (var_lib_t — see the header). */
function instanceRules(ctx: HostPlanCtx): FcontextRule[] {
	const { paths } = ctx;
	const backupOutside = !isInside(paths.instanceDir, paths.backupDir);
	return [
		...folderRule(ctx),
		...[paths.tree, paths.privateDir, paths.instanceBackups].map((path) =>
			treeRule(path, 'var_lib_t', { byUser: true }),
		),
		...(backupOutside ? [treeRule(paths.backupDir, 'var_lib_t')] : []),
	];
}

/** The file-context rules (see the header). */
export function fcontextRules(ctx: HostPlanCtx): FcontextRule[] {
	return [
		{
			spec: `${fcontextEscape(varRunSpelling(ctx.paths.socketDir))}(/.*)?`,
			type: 'httpd_var_run_t',
			path: null,
		},
		...webRules(ctx),
		...instanceRules(ctx),
	];
}

/** The relabel of one rule's path (the instance's subtrees as the service user). */
function relabelCommand(ctx: HostPlanCtx, rule: FcontextRule & { path: string }): ExecCommand {
	return exec(ctx, 'restorecon', [rule.single ? '-F' : '-RF', rule.path], `relabel ${rule.path}`, {
		...(rule.byUser ? { as: 'instance' as const } : {}),
	});
}

/** Does a `semanage fcontext -l -C` listing define exactly `spec` (its first column)? */
export function hasSpec(listing: string, spec: string): boolean {
	return listing.split('\n').some((line) => line.trim().split(/\s+/)[0] === spec);
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
			.filter((rule) => !hasSpec(present, rule.spec))
			.map((rule) =>
				exec(
					ctx,
					'semanage',
					['fcontext', '-a', '-t', rule.type, rule.spec],
					`label ${rule.spec} ${rule.type}`,
				),
			),
		...fcontextRules(ctx).flatMap((rule) =>
			rule.path === null ? [] : [relabelCommand(ctx, { ...rule, path: rule.path })],
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
				"the dedalo_engine policy module — the engine's own domain; the web server may connect to it and to no other service",
		},
		exec(
			ctx,
			'semodule',
			['-X', '400', '-i', modulePath(ctx)],
			'load the dedalo_engine module (httpd → the engine socket)',
		),
		exec(ctx, 'restorecon', ['-F', ctx.paths.bun], `label the engine runtime ${ENGINE_EXEC_TYPE}`),
	];
}

/** The runtime's SELinux label, read back (`stat -c %C`). */
export function runtimeLabelProbe(ctx: HostPlanCtx): ExecCommand {
	return probe(ctx, 'stat', ['-c', '%C', ctx.paths.bun], 'the engine runtime label');
}

/**
 * Record — and save, BEFORE `semanage fcontext -a` runs — exactly the rules
 * this run is about to ADD (`present` = the local rules defined now). A rule
 * that was already there (an operator's own label of the chosen path) is never
 * recorded, so --abort never deletes it; a rule an earlier, killed attempt
 * added was recorded by that attempt.
 */
function claimFcontexts(ctx: HostCtx, present: string): void {
	const adding = fcontextRules(ctx).filter((rule) => !hasSpec(present, rule.spec));
	if (adding.length === 0) return;
	for (const rule of adding) remember(ctx.created.selinux_fcontexts, rule.spec);
	ctx.save();
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
		const runtime = await probeText(ctx, runtimeLabelProbe(ctx));
		return verdictOf(
			[
				...fcontextRules(ctx).map((rule): [boolean, string] => [
					hasSpec(rules, rule.spec),
					`no file context for ${rule.spec}`,
				]),
				[/^dedalo_engine\b/m.test(modules), 'the dedalo_engine module is not loaded'],
				[
					runtime.includes(`:${ENGINE_EXEC_TYPE}:`),
					`${ctx.paths.bun} is not labelled ${ENGINE_EXEC_TYPE} (${runtime.trim() || 'no label'}) — restorecon -F ${ctx.paths.bun}`,
				],
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
		claimFcontexts(ctx, present);
		await executeCommands(selinuxCommands(ctx, present), ctx);
		updateEntry(ctx.fs, ctx.paths, { selinux_module: true });
		return ran(`${fcontextRules(ctx).length} file contexts, the dedalo_engine module`, {
			told: [
				`SELinux: the engine runs as ${ENGINE_DOMAIN}; the web server (httpd_t) may connect to it and to no other service's socket`,
			],
		});
	},
	// The file contexts are recorded by claimFcontexts (run), never here: only the
	// ones this install ADDS are its own.
	intent: (ctx) => {
		if (!selinuxApplies(ctx)) return;
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
			// The runtime's label names a type that no longer exists: give it its default back
			// (host_runtime's undo, which runs next, removes it only when no instance shares it).
			if (ctx.fs.exists(ctx.paths.bun))
				commands.push(
					exec(ctx, 'restorecon', ['-F', ctx.paths.bun], 'relabel the engine runtime', {
						okExit: [0, 1],
					}),
				);
		}
		await executeCommands(commands, ctx);
		return `${ctx.created.selinux_fcontexts.length} file context(s) removed${shared ? '; module kept (another instance uses it)' : ''}`;
	},
};
