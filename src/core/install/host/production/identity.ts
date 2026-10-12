/**
 * host_identity — THE INSTANCE'S USER AND DIRECTORIES (terminal installer phase
 * 4, 2026-10-12): the system user + group `ded_<i>` (no login shell), then
 * every directory of the layout (layout.ts) at its mode and owner — the
 * instance's own 0750/0700 under its home and /srv, the root-owned 0755 ones
 * root-run units read from (/opt/dedalo/…, the challenge root's parents).
 *
 * MODES (the DIR_MODE_REGISTER census): home, /srv/dedalo/<i>, its web root,
 * MEDIA_PATH (L56: never world-readable — the web server reads through the
 * instance group), the client publish dir, the backups: 0750; ../private:
 * 0700; /opt/dedalo/{bun,instances}/… and /var/lib/dedalo-install/acme/<i>:
 * 0755 root.
 *
 * NEVER A FOREIGN DIRECTORY: an instance directory (home, private, backups,
 * the web root and media, the client) that already exists is refused at the
 * System check (host_preflight — the answers may point anywhere: a web root of
 * /var/www or a backup dir of /srv would otherwise be handed to the instance
 * user); a SHARED root directory that exists (/srv/dedalo, /opt/dedalo… of
 * another instance) is used as it is — never re-moded or re-owned; only the
 * directories this run creates get their mode and owner.
 *
 * THE HOME is created by the mkdir list, not by `useradd --create-home`: no
 * skeleton files land in it, so nothing the installer did not list is left
 * behind with the account's uid.
 *
 * UNDO: only what the intent recorded (a directory that existed before the run
 * — /srv/dedalo, /opt/dedalo on a host with other instances — is never listed),
 * deepest first and only while EMPTY; the user only when it runs nothing, and
 * KEPT (told) while backups remain in its home — a removed uid reused by a
 * later system user would read them (critique A6). With the user, the home
 * this install created goes too (whatever the engine left in it): no file is
 * left owned by a uid the next system account may receive.
 */

import type { HostCtx, HostPlanCtx, HostStepDefinition, MkdirCommand } from '../contract.ts';
import { executeCommands, runExec } from '../execute.ts';
import { exec, probe, probeOk, ran, remember, verdictOf } from './common.ts';

interface DirSpec {
	path: string;
	mode: number;
	owner: string;
	group: string;
}

/** The directories the INSTANCE owns (must not exist before the install — host_preflight). */
export function ownedDirs(ctx: HostPlanCtx): string[] {
	return instanceDirs(ctx)
		.filter((spec) => spec.owner !== 'root')
		.map((spec) => spec.path);
}

/** Every directory of the instance, parents before children. */
export function instanceDirs(ctx: HostPlanCtx): DirSpec[] {
	const { paths, answers } = ctx;
	const own = (path: string, mode = 0o750): DirSpec => ({
		path,
		mode,
		owner: paths.user,
		group: paths.group,
	});
	const root = (path: string): DirSpec => ({ path, mode: 0o755, owner: 'root', group: 'root' });
	return [
		own(paths.home),
		own(paths.privateDir, 0o700),
		own(paths.backupDir),
		own(paths.backupStateDir),
		root('/srv/dedalo'),
		own(paths.srv),
		own(paths.webRoot),
		own(`${paths.webRoot}/dedalo`),
		own(paths.media),
		own(paths.clientPublish),
		root('/opt/dedalo'),
		root('/opt/dedalo/bun'),
		root('/opt/dedalo/instances'),
		root(`/opt/dedalo/instances/${paths.instance}`),
		root(paths.binDir),
		root('/var/lib/dedalo-install/acme'),
		...(answers.tls_mode === 'letsencrypt' ? [root(paths.acmeDir)] : []),
		root(paths.registryDir),
	].filter((spec, index, all) => all.findIndex((other) => other.path === spec.path) === index);
}

/** The user (and its group): a system account, no login shell, no skeleton (the home is a listed mkdir). */
function userCommand(ctx: HostPlanCtx) {
	const user = ctx.paths.user;
	return exec(
		ctx,
		'useradd',
		[
			'--system',
			'--user-group',
			'--home-dir',
			ctx.paths.home,
			'--no-create-home',
			'--shell',
			'/usr/sbin/nologin',
			user,
		],
		`create the instance user ${user} (and its group)`,
		{ unless: probe(ctx, 'getent', ['passwd', user], `${user} exists`) },
	);
}

/** The step's commands: the user, then every directory. */
export function identityCommands(ctx: HostPlanCtx) {
	const dirs: MkdirCommand[] = instanceDirs(ctx).map((spec) => ({
		kind: 'mkdir',
		...spec,
		label: `directory ${spec.path}`,
	}));
	return [userCommand(ctx), ...dirs];
}

/** Was the directory there before this install (a shared root one: used as it is)? */
function preexisting(ctx: HostCtx, spec: DirSpec): boolean {
	return spec.owner === 'root' && !ctx.created.dirs.includes(spec.path) && ctx.fs.exists(spec.path);
}

/**
 * Each directory at its mode and owner — a pre-existing SHARED one only as a
 * root-owned directory others can traverse (it is never re-moded).
 */
function dirChecks(ctx: HostCtx): [boolean, string][] {
	return instanceDirs(ctx).map((spec) => {
		const stat = ctx.fs.stat(spec.path);
		if (preexisting(ctx, spec)) {
			const usable = stat?.isDirectory === true && stat.owner === 'root' && (stat.mode & 0o001) !== 0;
			return [usable, `${spec.path} exists but is not a root-owned directory others can traverse`];
		}
		const right =
			stat?.isDirectory === true && stat.mode === spec.mode && stat.owner === spec.owner;
		return [right, `${spec.path} is not ${spec.mode.toString(8)} ${spec.owner}`];
	});
}

/** The commands a run applies: the user, and only the directories this install creates. */
function runCommands(ctx: HostCtx) {
	return identityCommands(ctx).filter(
		(command) =>
			command.kind !== 'mkdir' ||
			!preexisting(ctx, { ...command, owner: command.owner, group: command.group }),
	);
}

/** Undo the directories (deepest first, empty only); answers the removed ones. */
function removeDirs(ctx: HostCtx): string[] {
	return [...ctx.created.dirs]
		.sort((a, b) => b.length - a.length)
		.filter((path) => ctx.fs.rmdirIfEmpty(path));
}

/** Why the user must be KEPT (null: it may go): it runs something, or backups remain. */
async function keepUserReason(ctx: HostCtx): Promise<string | null> {
	const user = ctx.paths.user;
	if (await probeOk(ctx, probe(ctx, 'pgrep', ['-u', user], `processes of ${user}`))) {
		return `user ${user} KEPT: it still runs processes`;
	}
	if (ctx.fs.list(ctx.paths.backupDir).length > 0) {
		return `user ${user} KEPT: backups remain in ${ctx.paths.backupDir} (a removed uid could be reused by another account and read them)`;
	}
	return null;
}

/** Remove the home this install created (whatever the engine left in it); answers whether it did. */
async function removeCreatedHome(ctx: HostCtx): Promise<boolean> {
	const home = ctx.paths.home;
	if (!ctx.created.dirs.includes(home) || !ctx.fs.exists(home)) return false;
	await runExec(exec(ctx, 'rm', ['-rf', home], `remove the home ${home} this install created`), ctx);
	return true;
}

/** Undo the user: never while it runs something; kept while backups remain. */
async function removeUser(ctx: HostCtx): Promise<string> {
	const user = ctx.paths.user;
	if (!ctx.created.user) return 'user not created by this install';
	const keep = await keepUserReason(ctx);
	if (keep !== null) return keep;
	const home = await removeCreatedHome(ctx);
	await runExec(exec(ctx, 'userdel', [user], `remove the user ${user}`, { okExit: [0, 6] }), ctx);
	await runExec(
		exec(ctx, 'groupdel', [ctx.paths.group], `remove the group ${ctx.paths.group}`, {
			okExit: [0, 6],
		}),
		ctx,
	);
	return `user ${user} removed${home ? ` with its home ${ctx.paths.home}` : ''}`;
}

export const host_identity: HostStepDefinition = {
	id: 'host_identity',
	privilege: 'root',
	kind: 'action',
	needs: [],
	label: (plan) => `instance user ded_${String(plan.answers.instance ?? '')} and its directories`,
	commands: identityCommands,
	verify: async (ctx) =>
		verdictOf(
			[
				[
					await probeOk(ctx, probe(ctx, 'getent', ['passwd', ctx.paths.user], 'user exists')),
					`user ${ctx.paths.user} missing`,
				],
				...dirChecks(ctx),
			],
			`user ${ctx.paths.user} and ${instanceDirs(ctx).length} directories`,
		),
	run: async (ctx) => {
		await executeCommands(runCommands(ctx), ctx);
		return ran(`user ${ctx.paths.user}, ${instanceDirs(ctx).length} directories`);
	},
	intent: (ctx) => {
		ctx.created.user = true;
		for (const spec of instanceDirs(ctx))
			if (!ctx.fs.exists(spec.path)) remember(ctx.created.dirs, spec.path);
	},
	undo: async (ctx) => {
		const removed = removeDirs(ctx);
		const user = await removeUser(ctx);
		return `${removed.length} empty director(ies) removed; ${user}`;
	},
};
