/**
 * host_web_http + host_web_site — THE INSTANCE'S ONE SITE FILE (terminal
 * installer phase 4, 2026-10-12; owner round 2 #2: one site file per instance,
 * never another site, the default site or global configuration edited).
 *
 *  - host_web_http (Let's Encrypt only): STAGE 1 — the plain-HTTP server with
 *    the HTTP-01 challenge root and the redirect, so certbot can prove the
 *    address before any certificate exists.
 *  - host_web_site: the FULL site (stage 2) — after the first boot, so the
 *    engine's generated media rule files exist (L103) — and, on nginx, the ONE
 *    host-wide media-map include (web/nginx.ts mapInclude, critique B6).
 *
 * Both: the web server's user joins the instance group (it connects to the
 * socket and reads media and client through it — `usermod -aG`, recorded, the
 * only change to an account the installer did not create); Apache's modules
 * CHECKED and the exact enabling command TOLD (never enabled: owner — the run
 * stops, the operator enables them, `--resume` continues); the configuration
 * TESTED before the reload; a reload applies every pending change of the web
 * server's configuration, which the Review says next to the command (A18).
 *
 * THE CATCH-ALL (campaign 3 C3-30 — web/catch_all.ts), nginx: host_web_site
 * also writes the ONE host-wide catch-all site for ports 80/443 when the host
 * has none of the installer's yet (an instance on the standard ports only; a
 * port an operator's `default_server` holds is said so); later instances use
 * it as it is. Refcounted in the registry
 * (`catch_all`). It is the default by ORDER, never by `default_server`, so an
 * operator's default (Debian's own, installed with nginx) stays and never
 * clashes. Apache's vhosts guard their own name instead (web/apache.ts).
 */

import type {
	ExecCommand,
	HostCommand,
	HostCtx,
	HostPlanCtx,
	HostStepDefinition,
} from '../contract.ts';
import { executeCommands, requestOf, succeeded } from '../execute.ts';
import { binaryOf } from '../os_support.ts';
import { hostRefuse } from '../refuse.ts';
import { otherEntries, ownEntry, setMapOwner, updateEntry } from '../registry.ts';
import {
	APACHE_EMPTY_ROOT,
	apacheModuleCommand,
	missingApacheModules,
	renderApacheSite,
} from '../web/apache.ts';
import {
	CATCH_ALL_PORTS,
	CATCH_ALL_STAMP,
	catchAllPath,
	keptDefaults,
	renderNginxCatchAll,
} from '../web/catch_all.ts';
import {
	mapConfigHash,
	mapInclude,
	NGINX_MAP_INCLUDE,
	nginxRuleCopies,
	nginxRulesDir,
	productionMediaRules,
	renderNginxSite,
} from '../web/nginx.ts';
import { mediaGated, type SiteInput } from '../web/site.ts';
import {
	configTest,
	exec,
	probe,
	probeOk,
	probeText,
	ran,
	reloadWeb,
	remember,
	sitePath,
	stampOf,
	verdictOf,
	webFlavor,
} from './common.ts';
import { identityOf } from './identity.ts';

/** The certificate the full site names. */
export function certificatePaths(ctx: HostPlanCtx): { fullchain: string; key: string } {
	if (ctx.answers.tls_mode === 'files')
		return { fullchain: ctx.answers.tls_cert_path, key: ctx.answers.tls_key_path };
	const live = `/etc/letsencrypt/live/dedalo-${ctx.paths.instance}`;
	return { fullchain: `${live}/fullchain.pem`, key: `${live}/privkey.pem` };
}

/** The site's text for a stage (null cert = stage 1). */
export function siteText(ctx: HostPlanCtx, cert: SiteInput['cert']): string {
	const input: SiteInput = {
		paths: ctx.paths,
		answers: ctx.answers,
		stamp: stampOf(ctx),
		cert,
		acme: ctx.answers.tls_mode === 'letsencrypt',
		logDir: webFlavor(ctx).logDir,
		mediaRules: productionMediaRules(ctx.paths.instance),
	};
	return ctx.facts.web.kind === 'nginx' ? renderNginxSite(input) : renderApacheSite(input);
}

/**
 * The trade-off of a service group that is an EXISTING account's primary
 * group (owner decisions 2026-10-12 — accepted, told): the web user then
 * reads whatever that group can read. null: the instance's own group.
 */
export function sharedGroupLine(ctx: HostPlanCtx): string | null {
	const owner = identityOf(ctx).group.primaryOf;
	if (owner === null) return null;
	return `${webFlavor(ctx).user} joins ${ctx.paths.group}, the primary group of ${owner}: it can then read whatever that group can read (a group of its own is recommended: --service-group)`;
}

/** The web user joins the service group (unless it already is a member — run-time). */
function groupCommand(ctx: HostPlanCtx): ExecCommand {
	const user = webFlavor(ctx).user;
	const shared = sharedGroupLine(ctx);
	return exec(
		ctx,
		'usermod',
		['-aG', ctx.paths.group, user],
		`let ${user} reach the socket, media and client (group ${ctx.paths.group})${shared === null ? '' : ` — ${shared}`}`,
	);
}

/** Apache's shared empty DocumentRoot (nothing is ever served from it). */
function apacheRootCommands(ctx: HostPlanCtx): HostCommand[] {
	if (ctx.facts.web.kind !== 'apache') return [];
	return [
		{
			kind: 'mkdir',
			path: APACHE_EMPTY_ROOT,
			mode: 0o755,
			owner: 'root',
			group: 'root',
			label: 'the empty DocumentRoot every Dédalo vhost points at',
		},
	];
}

/**
 * Debian's a2ensite (our site only) — AFTER the site file is written: a2ensite
 * refuses a site that does not exist yet ("ERROR: Site dedalo-<i> does not
 * exist!"), so it can never precede the write.
 */
function enableCommands(ctx: HostPlanCtx): HostCommand[] {
	if (ctx.facts.web.kind !== 'apache' || !webFlavor(ctx).enableWithA2ensite) return [];
	return [
		exec(ctx, 'a2ensite', [`dedalo-${ctx.paths.instance}`], 'enable this site (only this one)'),
	];
}

/** A site write (0644 root). */
function siteWrite(ctx: HostPlanCtx, content: string, label: string): HostCommand {
	return {
		kind: 'write',
		path: sitePath(ctx),
		mode: 0o644,
		owner: 'root',
		group: 'root',
		content,
		label,
	};
}

/** Stage 1's commands. */
export function httpCommands(ctx: HostPlanCtx): HostCommand[] {
	return [
		groupCommand(ctx),
		...apacheRootCommands(ctx),
		siteWrite(ctx, siteText(ctx, null), 'the site file, stage 1 (HTTP challenge + redirect)'),
		...enableCommands(ctx),
		configTest(ctx),
		reloadWeb(ctx),
	];
}

/** The nginx map include write, when this instance becomes the map's owner. */
function mapCommands(ctx: HostPlanCtx, owner: boolean): HostCommand[] {
	if (!owner) return [];
	return [
		{
			kind: 'write',
			path: NGINX_MAP_INCLUDE,
			mode: 0o644,
			owner: 'root',
			group: 'root',
			content: mapInclude(ctx.paths.instance),
			label: 'the host-wide media map include',
		},
	];
}

/** Does this site include the engine's nginx rules (nginx with the media gate on)? */
function nginxGated(ctx: HostPlanCtx): boolean {
	return ctx.facts.web.kind === 'nginx' && mediaGated(ctx.answers);
}

/**
 * nginx with the media gate: the engine's generated rules copied — VALIDATED,
 * root-owned — under /etc/nginx/dedalo/<i>/ by the root-run script (never the
 * instance-writable files included in place: web/nginx.ts header).
 */
function ruleCopyCommands(ctx: HostPlanCtx): HostCommand[] {
	if (!nginxGated(ctx)) return [];
	return [
		{
			kind: 'mkdir',
			path: '/etc/nginx/dedalo',
			mode: 0o755,
			owner: 'root',
			group: 'root',
			label: "the root-owned home of the instances' media-rule copies",
		},
		{
			kind: 'exec',
			argv: ruleCopyArgv(ctx),
			as: 'root',
			label: "copy the engine's media rules, validated, root-owned",
			mutates: true,
		},
	];
}

/** The rule-copy script's argv (the refresh adds `--reload <nginx> <service>`). */
function ruleCopyArgv(ctx: HostPlanCtx): string[] {
	return [
		`${ctx.paths.binDir}/dedalo-media-rules.sh`,
		'--source',
		ctx.paths.media,
		'--dest',
		nginxRulesDir(ctx.paths.instance),
	];
}

/** The operator's refresh after the engine regenerated its rules (told on Done). */
export function ruleRefreshLine(ctx: HostPlanCtx): string {
	const argv = [
		...ruleCopyArgv(ctx),
		'--reload',
		binaryOf(ctx.row, 'nginx'),
		webFlavor(ctx).service,
	];
	return `the media gate nginx serves is a root-owned COPY of the engine's rules: after changing the media access mode (or an update that changes them), refresh it as root — ${argv.join(' ')}`;
}

/** Does this instance sit on the standard ports the catch-all covers? */
function standardPorts(ctx: HostPlanCtx): boolean {
	return (
		ctx.answers.http_port === CATCH_ALL_PORTS.http &&
		ctx.answers.https_port === CATCH_ALL_PORTS.https
	);
}

/** The standard ports where an operator's `default_server` stays the default (told). */
export function keptPorts(ctx: HostPlanCtx): string[] {
	return keptDefaults(ctx.facts.web.defaults);
}

/**
 * nginx's host-wide catch-all site (web/catch_all.ts): written when the host
 * has none (facts) and this instance is on the standard ports — never
 * rewritten, never written over another file at its path.
 */
export function catchAllCommands(ctx: HostPlanCtx): HostCommand[] {
	const { web } = ctx.facts;
	if (web.kind !== 'nginx' || !standardPorts(ctx) || web.catchAll !== 'absent') return [];
	return [
		{
			kind: 'write',
			path: catchAllPath(webFlavor(ctx)),
			mode: 0o644,
			owner: 'root',
			group: 'root',
			content: renderNginxCatchAll(),
			label: 'the host-wide catch-all site (a name no site declares reaches no instance)',
		},
	];
}

/** Does this instance use the catch-all once its site is in place? */
function usesCatchAll(ctx: HostPlanCtx): boolean {
	return ctx.facts.web.catchAll === 'ours' || catchAllCommands(ctx).length > 0;
}

/** What the operator is told about the default site of the standard ports. */
export function catchAllTold(ctx: HostPlanCtx): string[] {
	if (ctx.facts.web.kind !== 'nginx' || !standardPorts(ctx)) return [];
	const path = catchAllPath(webFlavor(ctx));
	if (ctx.facts.web.catchAll === 'foreign') {
		return [
			`${path} exists and is not the installer's: no catch-all site was written — a name no site declares reaches whatever site the web server loads first`,
		];
	}
	return keptPorts(ctx).map((port) => {
		const file = ctx.facts.web.defaults.find((item) => item.port === port)?.file ?? 'another file';
		return `port ${port}: the default site stays yours (${file}, default_server) — a name no site declares reaches it, never an instance`;
	});
}

/** Stage 2's commands (`mapOwner`: this instance's map is the host's — decided at run time). */
export function siteCommands(ctx: HostPlanCtx, mapOwner = nginxGated(ctx)): HostCommand[] {
	return [
		groupCommand(ctx),
		...apacheRootCommands(ctx),
		...ruleCopyCommands(ctx),
		...mapCommands(ctx, mapOwner),
		siteWrite(
			ctx,
			siteText(ctx, certificatePaths(ctx)),
			'the site file (HTTPS, media gate, client)',
		),
		...enableCommands(ctx),
		...catchAllCommands(ctx),
		configTest(ctx),
		reloadWeb(ctx),
	];
}

/** Apache's modules: checked, the enabling command TOLD — never enabled (owner). */
async function assertApacheModules(ctx: HostCtx): Promise<void> {
	if (ctx.facts.web.kind !== 'apache') return;
	const query = probe(ctx, 'apache-query', ['-M'], 'loaded modules');
	const result = await ctx.runner.run(requestOf(query, ctx));
	if (!succeeded(query, result)) {
		// A failed listing is no evidence of absent modules: say what failed.
		hostRefuse(
			'install.step_failed',
			`listing Apache's modules failed (\`${query.argv.join(' ')}\`, exit ${result.exitCode}) — fix the Apache configuration, then run the installer with --resume`,
		);
	}
	const loaded = [...result.stdout.matchAll(/^\s*(\w+)_module/gm)].map((m) => m[1] as string);
	const missing = missingApacheModules(loaded);
	if (missing.length > 0) {
		hostRefuse(
			'install.state_conflict',
			`Apache lacks the modules ${missing.join(', ')} — enabling modules is the system administrator's: ${apacheModuleCommand(missing, webFlavor(ctx).enableWithA2ensite)}; then run the installer with --resume`,
		);
	}
}

/** Is the web user already in the instance group? */
async function inGroup(ctx: HostCtx): Promise<boolean> {
	const line = await probeText(
		ctx,
		probe(ctx, 'getent', ['group', ctx.paths.group], 'group members'),
	);
	const members = (line.trim().split(':')[3] ?? '').split(',');
	return members.includes(webFlavor(ctx).user);
}

/** Drop the group command when the membership is already there (it was ours or not — recorded). */
async function withoutDoneGroup(ctx: HostCtx, commands: HostCommand[]): Promise<HostCommand[]> {
	if (!(await inGroup(ctx))) return commands;
	return commands.slice(1);
}

/**
 * The nginx media map (F1/B6): ONE include host-wide. The first gated
 * instance owns it; a later one is refused when its map's config-hash differs
 * (a different release's map would silently serve the other's rules).
 */
async function mapOwnership(ctx: HostCtx): Promise<boolean> {
	if (ctx.facts.web.kind !== 'nginx' || !mediaGated(ctx.answers)) return false;
	const owner = otherEntries(ctx.fs, ctx.paths).find((entry) => entry.nginx_map_owner);
	if (owner === undefined) return true;
	assertSameMap(ctx, owner);
	return false;
}

/** The GENERATED map file in an instance's media (read for its config-hash only). */
function mapFile(media: string): string {
	return `${media}/dedalo_media_protection_map.nginx.conf`;
}

/** Refuse when another instance's map (the one included) differs from this one's. */
function assertSameMap(ctx: HostCtx, owner: { instance: string; media: string }): void {
	const theirs = mapConfigHash(ctx.fs.readText(nginxRuleCopies(owner.instance).map)) ?? 'unknown';
	const ours = mapConfigHash(ctx.fs.readText(mapFile(ctx.paths.media))) ?? 'not generated yet';
	if (theirs === ours) return;
	hostRefuse(
		'install.state_conflict',
		`the nginx media map of instance ${owner.instance} (config-hash ${theirs}) differs from this one's (${ours}) — same-host instances must run the same release (the map's variables are global to nginx)`,
	);
}

/** After a reload: the configuration test passes and our file is the render. */
async function siteVerdict(ctx: HostCtx, text: string, copies = false) {
	const rules = nginxRuleCopies(ctx.paths.instance);
	return verdictOf(
		[
			[ctx.fs.readText(sitePath(ctx)) === text, `${sitePath(ctx)} differs from its render`],
			[
				!copies || (ctx.fs.exists(rules.server) && ctx.fs.exists(rules.map)),
				`the root-owned media-rule copies are missing in ${nginxRulesDir(ctx.paths.instance)}`,
			],
			[await probeOk(ctx, configTest(ctx)), 'the web server configuration test fails'],
		],
		`${sitePath(ctx)} in place, configuration valid`,
	);
}

/**
 * Record what the site work is about to create — BEFORE it runs, so a failed
 * step still leaves --abort a complete list: the site file (host_preflight
 * refused an existing one, so it is this install's), the empty DocumentRoot,
 * the group membership when the web user is not a member yet.
 */
function recordWeb(ctx: HostCtx, member: boolean, stage: 'http' | 'site'): void {
	ctx.created.web_group_member ||= !member;
	remember(ctx.created.site_files, sitePath(ctx));
	if (ctx.facts.web.kind === 'apache') rememberNewDir(ctx, APACHE_EMPTY_ROOT);
	if (stage === 'site' && nginxGated(ctx)) recordRuleCopies(ctx);
}

/** The rule-copy directories this install created, once empty (a live abort keeps the identity step's). */
function removeRuleDirs(ctx: HostCtx): void {
	for (const dir of [nginxRulesDir(ctx.paths.instance), '/etc/nginx/dedalo'])
		if (ctx.created.dirs.includes(dir)) ctx.fs.rmdirIfEmpty(dir);
}

/** A directory this run is about to create (absent now). */
function rememberNewDir(ctx: HostCtx, dir: string): void {
	if (!ctx.fs.exists(dir)) remember(ctx.created.dirs, dir);
}

/** The root-owned rule copies and their directories (nginx with the media gate). */
function recordRuleCopies(ctx: HostCtx): void {
	rememberNewDir(ctx, '/etc/nginx/dedalo');
	rememberNewDir(ctx, nginxRulesDir(ctx.paths.instance));
	const rules = nginxRuleCopies(ctx.paths.instance);
	remember(ctx.created.site_files, rules.server);
	remember(ctx.created.site_files, rules.map);
}

/** A file's bytes before the work (null: absent). */
interface Snapshot {
	path: string;
	before: string | null;
}

/** Put every written file back as it was (or remove it); Debian Apache: disable a new site. */
async function restoreSnapshot(ctx: HostCtx, snapshot: readonly Snapshot[]): Promise<void> {
	for (const { path, before } of snapshot) {
		if (before === null) ctx.fs.remove(path);
		else ctx.fs.write(path, before, 0o644, 'root', 'root');
	}
	const site = snapshot.find((item) => item.path === sitePath(ctx));
	if (site?.before === null && enableCommands(ctx).length > 0) {
		await executeCommands(
			[
				exec(ctx, 'a2dissite', [`dedalo-${ctx.paths.instance}`], 'disable this site', {
					okExit: [0, 1],
				}),
			],
			ctx,
		);
	}
}

/**
 * Apply the site commands. Any failure (the configuration test above all) puts
 * the files back as they were before the step — the host's web server is never
 * left with a configuration it would refuse at its next reload — then refuses.
 */
async function applySite(ctx: HostCtx, commands: readonly HostCommand[]): Promise<void> {
	const snapshot: Snapshot[] = commands
		.filter((command) => command.kind === 'write')
		.map((command) => ({ path: command.path, before: ctx.fs.readText(command.path) }));
	try {
		await executeCommands(commands, ctx);
	} catch (error) {
		await restoreSnapshot(ctx, snapshot);
		throw error;
	}
}

/** Is this instance the LAST user of the installer's own catch-all (its registry entry released)? */
function lastCatchAllUser(ctx: HostCtx): boolean {
	if (ownEntry(ctx.fs, ctx.paths)?.catch_all !== true) return false;
	updateEntry(ctx.fs, ctx.paths, { catch_all: false });
	if (otherEntries(ctx.fs, ctx.paths).some((entry) => entry.catch_all)) return false;
	const text = ctx.fs.readText(catchAllPath(webFlavor(ctx))) ?? '';
	return text.startsWith(`${CATCH_ALL_STAMP}\n`);
}

/**
 * The catch-all's removal: only when this instance used it, no other
 * instance's entry still does, and the file is the installer's own.
 */
function catchAllRemoval(ctx: HostCtx): HostCommand[] {
	if (!lastCatchAllUser(ctx)) return [];
	return [
		{
			kind: 'remove',
			path: catchAllPath(webFlavor(ctx)),
			label: 'the host-wide catch-all site (no instance uses it any more)',
		},
	];
}

/** The site's removal: a2dissite (Debian Apache), the map handover, our files, the catch-all, test, reload. */
function siteRemoval(
	ctx: HostCtx,
	files: readonly string[],
	catchAll: HostCommand[],
): HostCommand[] {
	if (files.length === 0 && catchAll.length === 0) return [];
	const disable =
		webFlavor(ctx).enableWithA2ensite && files.includes(sitePath(ctx))
			? [
					exec(ctx, 'a2dissite', [`dedalo-${ctx.paths.instance}`], 'disable this site', {
						okExit: [0, 1],
					}),
				]
			: [];
	return [
		...disable,
		...mapHandover(ctx),
		...files.map((path): HostCommand => ({ kind: 'remove', path, label: `remove ${path}` })),
		...catchAll,
		configTest(ctx),
		reloadWeb(ctx),
	];
}

/** The web user leaves the instance group — even when a failed step already put the files back. */
function groupRemoval(ctx: HostCtx): HostCommand[] {
	if (!ctx.created.web_group_member) return [];
	return [
		exec(
			ctx,
			'gpasswd',
			['-d', webFlavor(ctx).user, ctx.paths.group],
			'remove the web user from the instance group',
			{ okExit: [0, 3] },
		),
	];
}

/** Undo the site: remove our files (+ a2dissite), hand the map over or remove it, test, reload; the group. */
async function undoSite(ctx: HostCtx): Promise<string> {
	const files = ctx.created.site_files.filter((path) => ctx.fs.exists(path));
	const catchAll = catchAllRemoval(ctx);
	await executeCommands([...siteRemoval(ctx, files, catchAll), ...groupRemoval(ctx)], ctx);
	ctx.created.web_group_member = false;
	removeRuleDirs(ctx);
	if (files.length === 0 && catchAll.length === 0) return 'no site file left to remove';
	return `${files.join(', ')} removed, ${webFlavor(ctx).service} reloaded`;
}

/** The map include: pointed at another gated instance's map, or removed with the last one. */
function mapHandover(ctx: HostCtx): HostCommand[] {
	if (ownEntry(ctx.fs, ctx.paths)?.nginx_map_owner !== true) return [];
	updateEntry(ctx.fs, ctx.paths, { nginx_map_owner: false });
	const heir = otherEntries(ctx.fs, ctx.paths).find((entry) =>
		ctx.fs.exists(nginxRuleCopies(entry.instance).map),
	);
	if (heir === undefined) {
		return [{ kind: 'remove', path: NGINX_MAP_INCLUDE, label: 'the host-wide media map include' }];
	}
	setMapOwner(ctx.fs, ctx.paths.registryDir, heir.instance);
	return [
		{
			kind: 'write',
			path: NGINX_MAP_INCLUDE,
			mode: 0o644,
			owner: 'root',
			group: 'root',
			content: mapInclude(heir.instance),
			label: `the media map include, now instance ${heir.instance}'s`,
		},
	];
}

export const host_web_http: HostStepDefinition = {
	id: 'host_web_http',
	privilege: 'root',
	kind: 'action',
	needs: [],
	label: () => "web: the plain-HTTP site for the Let's Encrypt challenge",
	commands: httpCommands,
	verify: async (ctx) => {
		const text = ctx.fs.readText(sitePath(ctx));
		// Stage 2 written later also satisfies stage 1 (it keeps the challenge server).
		return text === siteText(ctx, null) || text === siteText(ctx, certificatePaths(ctx))
			? siteVerdict(ctx, text)
			: { ok: false, detail: `${sitePath(ctx)} is not the stage-1 render` };
	},
	run: async (ctx) => {
		await assertApacheModules(ctx);
		const member = await inGroup(ctx);
		recordWeb(ctx, member, 'http');
		ctx.save();
		await applySite(ctx, await withoutDoneGroup(ctx, httpCommands(ctx)));
		return ran(`${sitePath(ctx)} (stage 1) — ${webFlavor(ctx).service} reloaded`, {
			told: [sharedGroupLine(ctx)].filter((line): line is string => line !== null),
		});
	},
	undo: undoSite,
};

export const host_web_site: HostStepDefinition = {
	id: 'host_web_site',
	privilege: 'root',
	kind: 'action',
	needs: [],
	label: (plan) =>
		`web: the site of ${String(plan.answers.server_name)} (HTTPS, media gate, client)`,
	commands: (ctx) => siteCommands(ctx),
	verify: async (ctx) => siteVerdict(ctx, siteText(ctx, certificatePaths(ctx)), nginxGated(ctx)),
	run: async (ctx) => {
		await assertApacheModules(ctx);
		const owner = await mapOwnership(ctx);
		const member = await inGroup(ctx);
		recordWeb(ctx, member, 'site');
		ctx.save();
		await applySite(ctx, await withoutDoneGroup(ctx, siteCommands(ctx, owner)));
		updateEntry(ctx.fs, ctx.paths, {
			...(owner ? { nginx_map_owner: true } : {}),
			catch_all: usesCatchAll(ctx),
		});
		return ran(`${sitePath(ctx)} — ${webFlavor(ctx).service} reloaded`, {
			told: [
				...(nginxGated(ctx) ? [ruleRefreshLine(ctx)] : []),
				...[sharedGroupLine(ctx)].filter((line): line is string => line !== null),
				...catchAllTold(ctx),
			],
		});
	},
	undo: undoSite,
};
