/**
 * host_identity — THE SERVICE ACCOUNT, THE INSTALL FOLDER AND THE INSTANCE'S
 * DIRECTORIES (terminal installer phase 4; owner decisions 2026-10-12): every
 * decision comes from the ONE verdict over the FROZEN facts
 * (identity_rules.ts) — what is CREATED and what is USED AS IS:
 *
 *  - the SERVICE USER: created (`useradd --system`, no login shell, no
 *    skeleton — the folder is a listed directory, never `--create-home`) when
 *    absent; an EXISTING account (a hosting account such as my_domain.org) is
 *    used as it is and NEVER created, changed or deleted by the installer;
 *  - the SERVICE GROUP: the new user's own (`--user-group`), a typed absent one
 *    (`groupadd --system`), or an existing one used as it is;
 *  - the INSTALL FOLDER: created by ROOT (0750 user:group) only under
 *    root-owned parents — its missing parents root 0755; under a parent the
 *    user owns, created BY THE USER (root never works by path in a tree
 *    another account controls — critique B1); an existing empty folder under
 *    root-owned parents is ADOPTED (owner and mode recorded, restored on
 *    --abort); the user's own folder is used as it is (never chowned or
 *    chmodded, nor is its parent);
 *  - INSIDE the folder (private/ 0700, backups/ 0750 — the code updater's
 *    backup root — and the backup dir when it lies there) and inside the
 *    instance's web root: made BY THE SERVICE USER;
 *  - the root-owned 0755 ones root-run units read from (/opt/dedalo/…, the
 *    challenge root's parents) and the shared roots (/srv/dedalo): root's.
 *
 * MODES (the DIR_MODE_REGISTER census): the folder, /srv/dedalo/<i>, its web
 * root, MEDIA_PATH (L56: never world-readable — the web server reads through
 * the service group), the client publish dir, the backups: 0750; private:
 * 0700; /opt/dedalo/{bun,instances}/… and /var/lib/dedalo-install/acme/<i>:
 * 0755 root.
 *
 * UNDO: only what this install created. Inside the folder, as the service
 * user: its private/ always (it holds the .env); everything else only when no
 * backup remains — then a folder this install created goes with its content,
 * an adopted one gets its owner and mode back, an existing one keeps its own
 * content. The user and the group only when THIS install created them, never
 * while the user runs something, and KEPT (told) while backups remain (a
 * removed uid reused by a later account would read them — critique A6). An
 * existing account is never removed: no userdel/groupdel is ever listed for it.
 */

import { isAbsolute } from 'node:path';
import { sameOrInside } from '../../install_validation.ts';
import type {
	ExecCommand,
	HostCommand,
	HostCtx,
	HostPlanCtx,
	HostStepDefinition,
	MkdirCommand,
} from '../contract.ts';
import { executeCommands, runExec } from '../execute.ts';
import { hostRefuse } from '../refuse.ts';
import { dropEntry, updateEntry } from '../registry.ts';
import { exec, probe, probeOk, probeText, ran, remember, verdictOf, webFlavor } from './common.ts';
import { type FolderPlan, type IdentityVerdict, identityVerdict } from './identity_rules.ts';

interface DirSpec {
	path: string;
	mode: number;
	owner: string;
	group: string;
	/** Made by the service user (inside a tree it controls), not by root. */
	byUser: boolean;
}

/** THE verdict of the frozen facts (the commands, the verify and the undo all read it). */
export function identityOf(ctx: HostPlanCtx): IdentityVerdict {
	return identityVerdict({
		answers: ctx.answers,
		account: ctx.facts.account,
		instances: ctx.facts.instances,
		webUser: webFlavor(ctx).user,
		sites: ctx.facts.web.sites,
	});
}

/** A directory the service user owns (made by it when `byUser`). */
function own(ctx: HostPlanCtx, path: string, mode: number, byUser: boolean): DirSpec {
	return { path, mode, owner: ctx.paths.user, group: ctx.paths.group, byUser };
}

/** A root-owned 0755 directory. */
function rootDir(path: string): DirSpec {
	return { path, mode: 0o755, owner: 'root', group: 'root', byUser: false };
}

/** The folder's missing parents: root's (0755 root) or the user's own (0755). */
function ancestorDirs(ctx: HostPlanCtx, plan: FolderPlan): DirSpec[] {
	if (plan.kind !== 'create') return [];
	return plan.ancestors.map((path) =>
		plan.by === 'root' ? rootDir(path) : own(ctx, path, 0o755, true),
	);
}

/** The folder itself: created (root's or the user's), adopted (root hands it over), or none. */
function folderDirs(ctx: HostPlanCtx, plan: FolderPlan): DirSpec[] {
	const dir = ctx.paths.instanceDir;
	if (plan.kind === 'create') return [own(ctx, dir, 0o750, plan.by === 'user')];
	return plan.kind === 'adopt' ? [own(ctx, dir, 0o750, false)] : [];
}

/** Strictly inside `dir`. */
function below(path: string, dir: string): boolean {
	return path !== dir && sameOrInside(path, dir);
}

/** Is `path` inside a tree the service user controls (its folder, its web root, /srv/dedalo/<i>)? */
function userTree(ctx: HostPlanCtx, path: string): boolean {
	const { instanceDir, srv, webRoot } = ctx.paths;
	return sameOrInside(path, instanceDir) || below(path, srv) || below(path, webRoot);
}

/** Can root make the backup dir (outside the folder) by path — every existing parent root's? */
function backupByRoot(ctx: HostPlanCtx): boolean {
	return ctx.facts.account.backupAncestors.every((fact) => !fact.exists || fact.owner === 'root');
}

/** The instance's own directories inside and beside the folder. */
function instanceOwnDirs(ctx: HostPlanCtx): DirSpec[] {
	const { paths } = ctx;
	const mine = (path: string, mode = 0o750): DirSpec =>
		own(ctx, path, mode, userTree(ctx, path) || !backupByRoot(ctx));
	return [
		own(ctx, paths.privateDir, 0o700, true),
		own(ctx, paths.instanceBackups, 0o750, true),
		mine(paths.backupDir),
		mine(paths.backupStateDir),
		rootDir('/srv/dedalo'),
		own(ctx, paths.srv, 0o750, false),
		own(ctx, paths.webRoot, 0o750, userTree(ctx, paths.webRoot)),
		own(ctx, `${paths.webRoot}/dedalo`, 0o750, true),
		own(ctx, paths.media, 0o750, true),
		own(ctx, paths.clientPublish, 0o750, true),
	];
}

/** The root-owned directories root-run units read from. */
function rootDirs(ctx: HostPlanCtx): DirSpec[] {
	const { paths, answers } = ctx;
	return [
		rootDir('/opt/dedalo'),
		rootDir('/opt/dedalo/bun'),
		rootDir('/opt/dedalo/instances'),
		rootDir(`/opt/dedalo/instances/${paths.instance}`),
		rootDir(paths.binDir),
		rootDir('/var/lib/dedalo-install/acme'),
		...(answers.tls_mode === 'letsencrypt' ? [rootDir(paths.acmeDir)] : []),
		rootDir(paths.registryDir),
	];
}

/** Every directory of the instance, parents before children (de-duplicated). */
export function instanceDirs(ctx: HostPlanCtx): DirSpec[] {
	const plan = identityOf(ctx).folder;
	return [
		...ancestorDirs(ctx, plan),
		...folderDirs(ctx, plan),
		...instanceOwnDirs(ctx),
		...rootDirs(ctx),
	].filter((spec, index, all) => all.findIndex((other) => other.path === spec.path) === index);
}

/**
 * The directories the INSTANCE owns that must not exist before the install
 * (host_preflight) — INSIDE the install folder too (its private/, backups/, a
 * typed backup dir there: an existing directory of the account's is never
 * re-moded, filled or removed by the installer). Only the install folder and
 * its own parents are excepted: the verdict decides those (an existing folder
 * is used or adopted).
 */
export function ownedDirs(ctx: HostPlanCtx): string[] {
	const dir = ctx.paths.instanceDir;
	return instanceOwnDirs(ctx)
		.filter((spec) => spec.owner !== 'root' && !sameOrInside(dir, spec.path))
		.map((spec) => spec.path);
}

/** `useradd`'s group options: its own same-named group, or the service group. */
function groupOptions(verdict: IdentityVerdict): string[] {
	return verdict.group.withUser
		? ['--user-group']
		: ['--gid', verdict.group.name, '--no-user-group'];
}

/** The service user, when this install creates it (a system account, no login shell, no skeleton). */
function userCommands(ctx: HostPlanCtx, verdict: IdentityVerdict): ExecCommand[] {
	if (!verdict.user.create) return [];
	const user = ctx.paths.user;
	const args = [
		'--system',
		...groupOptions(verdict),
		...['--home-dir', ctx.paths.instanceDir, '--no-create-home', '--shell', '/usr/sbin/nologin'],
		user,
	];
	return [
		exec(ctx, 'useradd', args, `create the service user ${user}`, {
			unless: probe(ctx, 'getent', ['passwd', user], `${user} exists`),
		}),
	];
}

/** The service group, when this install creates it apart from the user's own. */
function groupCommands(ctx: HostPlanCtx, verdict: IdentityVerdict): ExecCommand[] {
	const group = verdict.group;
	if (!group.create || group.withUser) return [];
	return [
		exec(ctx, 'groupadd', ['--system', group.name], `create the service group ${group.name}`, {
			unless: probe(ctx, 'getent', ['group', group.name], `${group.name} exists`),
		}),
	];
}

/** One directory as a command (the user's: made AS the user). */
function mkdirOf(ctx: HostPlanCtx, spec: DirSpec): MkdirCommand {
	const adopt = spec.path === ctx.paths.instanceDir && identityOf(ctx).folder.kind === 'adopt';
	return {
		kind: 'mkdir',
		path: spec.path,
		mode: spec.mode,
		owner: spec.owner,
		group: spec.group,
		label: adopt
			? `adopt the empty folder ${spec.path} (owner and mode restored on --abort)`
			: `directory ${spec.path}`,
		...(spec.byUser ? { as: 'instance' as const } : {}),
	};
}

/** The step's commands: the group, the user, then every directory. */
export function identityCommands(ctx: HostPlanCtx): HostCommand[] {
	const verdict = identityOf(ctx);
	return [
		...groupCommands(ctx, verdict),
		...userCommands(ctx, verdict),
		...instanceDirs(ctx).map((spec) => mkdirOf(ctx, spec)),
	];
}

/** Was the directory there before this install (a shared root one: used as it is)? */
function preexisting(ctx: HostCtx, spec: { path: string; owner: string }): boolean {
	return spec.owner === 'root' && !ctx.created.dirs.includes(spec.path) && ctx.fs.exists(spec.path);
}

/** One directory at its mode and owner (a pre-existing SHARED one: traversable root's). */
function dirCheck(ctx: HostCtx, spec: DirSpec): [boolean, string] {
	const stat = ctx.fs.stat(spec.path);
	if (preexisting(ctx, spec)) {
		const usable = stat?.isDirectory === true && stat.owner === 'root' && (stat.mode & 0o001) !== 0;
		return [usable, `${spec.path} exists but is not a root-owned directory others can traverse`];
	}
	const right = stat?.isDirectory === true && stat.mode === spec.mode && stat.owner === spec.owner;
	return [right, `${spec.path} is not ${spec.mode.toString(8)} ${spec.owner}`];
}

/** The folder used as it is: a directory of the user's, not group/other-writable. */
function usedFolderCheck(ctx: HostCtx): [boolean, string][] {
	if (identityOf(ctx).folder.kind !== 'owned') return [];
	const stat = ctx.fs.stat(ctx.paths.instanceDir);
	const right =
		stat?.isDirectory === true && stat.owner === ctx.paths.user && (stat.mode & 0o022) === 0;
	return [[right, `${ctx.paths.instanceDir} is not a directory of ${ctx.paths.user} without go+w`]];
}

/** The commands a run applies: only the shared root directories that do not exist yet. */
function runCommands(ctx: HostCtx): HostCommand[] {
	return identityCommands(ctx).filter(
		(command) => command.kind !== 'mkdir' || !preexisting(ctx, command),
	);
}

/**
 * Record what this install creates — from the FROZEN verdict, never from a
 * live look at the folder. The ACCOUNTS are recorded by claimAccounts, at
 * run time, right before they are created.
 */
function recordIdentity(ctx: HostCtx): void {
	const verdict = identityOf(ctx);
	ctx.created.install_dir ??= folderRecord(ctx, verdict.folder);
	for (const spec of instanceDirs(ctx)) recordDir(ctx, spec);
}

/**
 * One account the frozen verdict said to CREATE, claimed live: absent → it is
 * recorded (and saved) BEFORE the command creates it; present and not
 * recorded by an earlier attempt of this run → something else made it since
 * the System check (a package — host_packages runs in between): refused,
 * never recorded, never removed by --abort.
 */
async function claimAccount(
	ctx: HostCtx,
	what: 'user' | 'group',
	name: string,
	flag: 'user' | 'group' = what,
): Promise<void> {
	const database = what === 'user' ? 'passwd' : 'group';
	const exists = await probeOk(ctx, probe(ctx, 'getent', [database, name], `${name} exists`));
	if (!exists) {
		ctx.created[what] = name;
		ctx.save();
		return;
	}
	if (ctx.created[what] === name) return;
	hostRefuse(
		'install.state_conflict',
		`${what} ${name} did not exist at the System check but exists now (another package or account created it since) — the installer never takes it for its own: --abort, then choose another --service-${flag}`,
	);
}

/** Claim the accounts this install creates (see claimAccount). */
async function claimAccounts(ctx: HostCtx): Promise<void> {
	const verdict = identityOf(ctx);
	if (verdict.group.create && !verdict.group.withUser) {
		await claimAccount(ctx, 'group', verdict.group.name);
	}
	if (verdict.user.create) {
		if (verdict.group.withUser) await claimAccount(ctx, 'group', verdict.group.name, 'user');
		await claimAccount(ctx, 'user', verdict.user.name);
	}
}

/** The folder's record (null: used as it is). */
function folderRecord(ctx: HostCtx, plan: FolderPlan): HostCtx['created']['install_dir'] {
	const path = ctx.paths.instanceDir;
	if (plan.kind === 'create') return { path, how: plan.by, owner: '', group: '', mode: 0 };
	if (plan.kind !== 'adopt') return null;
	return { path, how: 'adopted', owner: plan.owner, group: plan.group, mode: plan.mode };
}

/** One directory's record: the user's always (preflight refused existing ones), root's when absent. */
function recordDir(ctx: HostCtx, spec: DirSpec): void {
	if (spec.path === ctx.paths.instanceDir) return;
	if (spec.byUser) remember(ctx.created.user_dirs, spec.path);
	else if (spec.owner !== 'root' || !ctx.fs.exists(spec.path))
		remember(ctx.created.dirs, spec.path);
}

// ── undo ─────────────────────────────────────────────────────────────────────

/** A directory's entries other than the backup bookkeeping (`state`). */
function contentOf(ctx: HostCtx, dir: string): string[] {
	return ctx.fs.list(dir).filter((name) => name !== 'state');
}

/** Do backups remain (the backup dir, or the code updater's backups in the folder)? */
function backupsRemain(ctx: HostCtx): boolean {
	return [ctx.paths.backupDir, ctx.paths.instanceBackups].some(
		(dir) => isAbsolute(dir) && contentOf(ctx, dir).length > 0,
	);
}

/** `rm` as the service user (inside a tree it controls — never root by path: B1). */
function userRemove(ctx: HostPlanCtx, args: string[], label: string): ExecCommand {
	return exec(ctx, 'rm', args, label, { as: 'instance', okExit: [0, 1] });
}

/** Remove what the install left inside the folder, as the user (private/ always; all when no backup remains). */
async function undoInside(ctx: HostCtx, keep: boolean): Promise<void> {
	const dir = ctx.paths.instanceDir;
	const created = ctx.created.install_dir;
	const whole = !keep && created !== null && created.how !== 'adopted';
	const targets = whole ? ctx.fs.list(dir).map((name) => `${dir}/${name}`) : [ctx.paths.privateDir];
	if (targets.length > 0 && ctx.fs.exists(dir)) {
		await runExec(
			userRemove(ctx, ['-rf', '--', ...targets], `remove what this install left in ${dir}`),
			ctx,
		);
	}
}

/**
 * The directories the user made (deepest first, empty only — `rm -d`, as the
 * user): `parents` = the folder's own missing parents (after the folder), else
 * every other one (before it).
 */
async function removeUserDirs(ctx: HostCtx, parents: boolean): Promise<void> {
	const dir = ctx.paths.instanceDir;
	const dirs = [...ctx.created.user_dirs]
		.filter((path) => below(dir, path) === parents && ctx.fs.exists(path))
		.sort((a, b) => b.length - a.length);
	for (const path of dirs) {
		await userRemoveDir(ctx, path);
	}
}

/**
 * `rm -d <path>` as the user (empty only). A SCRATCH root's recording runner
 * executes nothing: the removal is mirrored there (as applyMkdir mirrors a
 * user-made directory — host/execute.ts).
 */
async function userRemoveDir(ctx: HostCtx, path: string): Promise<void> {
	await runExec(userRemove(ctx, ['-d', '--', path], `remove ${path} if empty`), ctx);
	if (ctx.fs.root !== '') ctx.fs.rmdirIfEmpty(path);
}

/** The folder itself: removed when created and emptied, handed back when adopted. */
async function undoFolder(ctx: HostCtx): Promise<string> {
	const created = ctx.created.install_dir;
	const dir = ctx.paths.instanceDir;
	if (created === null) return `${dir} USED AS IS — kept`;
	if (created.how === 'adopted') {
		ctx.fs.mkdir(dir, created.mode, created.owner, created.group);
		return `${dir} handed back (${created.owner}:${created.group} ${created.mode.toString(8)})`;
	}
	if (created.how === 'user') await userRemoveDir(ctx, dir);
	else ctx.fs.rmdirIfEmpty(dir);
	return ctx.fs.exists(dir) ? `${dir} KEPT (not empty)` : `${dir} removed`;
}

/** Root's directories (deepest first, empty only). */
function removeRootDirs(ctx: HostCtx): string[] {
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
	if (backupsRemain(ctx)) {
		return `user ${user} KEPT: backups remain in ${ctx.paths.backupDir} or ${ctx.paths.instanceBackups} (a removed uid could be reused by another account and read them)`;
	}
	return null;
}

/** Undo the group this install created (kept while it is another account's primary group). */
async function removeGroup(ctx: HostCtx): Promise<string> {
	const group = ctx.created.group;
	if (group === null) return `group ${ctx.paths.group} USED AS IS — never removed by the installer`;
	const result = await runExec(
		exec(ctx, 'groupdel', [group], `remove the group ${group}`, { okExit: [0, 6, 8] }),
		ctx,
	);
	return result?.exitCode === 8
		? `group ${group} KEPT: it is the primary group of another account`
		: `group ${group} removed`;
}

/** The instance paths a file of the service user may still be in (the existing ones). */
function instancePaths(ctx: HostCtx): string[] {
	const { instanceDir, srv, backupDir, instanceBackups } = ctx.paths;
	return [...new Set([instanceDir, srv, backupDir, instanceBackups])].filter(
		(path) => isAbsolute(path) && ctx.fs.exists(path),
	);
}

/**
 * The first file or directory of the service user left under the instance's
 * paths ('' when none) — read-only (campaign 3 C3-9): a user removed while it
 * still owns something leaves a tree owned by a bare uid, which the next
 * account created on the host inherits.
 */
async function leftOfUser(ctx: HostCtx, user: string): Promise<string> {
	const paths = instancePaths(ctx);
	if (paths.length === 0) return '';
	const text = await probeText(
		ctx,
		probe(ctx, 'find', [...paths, '-user', user, '-print', '-quit'], `what ${user} still owns`),
	);
	return text.trim();
}

/** Undo the user (and its group): never an existing one, never while it runs something, owns something or backups remain. */
async function removeAccount(ctx: HostCtx, keep: string | null): Promise<string> {
	const user = ctx.created.user;
	if (user === null) {
		return `user ${ctx.paths.user} USED AS IS — never removed by the installer`;
	}
	if (keep !== null) return keep;
	const left = await leftOfUser(ctx, user);
	if (left !== '') {
		return `user ${user} KEPT: it still owns ${left} (a removed uid would be reused by the next account) — remove what remains, then remove the user (userdel ${user})`;
	}
	await runExec(exec(ctx, 'userdel', [user], `remove the user ${user}`, { okExit: [0, 6] }), ctx);
	return `user ${user} removed; ${await removeGroup(ctx)}`;
}

/**
 * The EMPTY directories under the trees this install made outside the folder
 * (the web root: the engine's media tree — C3-9), removed AS THE USER (root
 * never works by path in a tree another account controls — B1). Files are
 * never removed: a tree that still holds one keeps the user (removeAccount).
 */
async function pruneUserTrees(ctx: HostCtx): Promise<void> {
	const dir = ctx.paths.instanceDir;
	const trees = ctx.created.user_dirs.filter(
		(path) => !sameOrInside(path, dir) && ctx.fs.exists(path),
	);
	const tops = trees.filter((path) => !trees.some((other) => below(path, other)));
	for (const path of tops) {
		await runExec(
			exec(
				ctx,
				'find',
				[path, '-mindepth', '1', '-depth', '-type', 'd', '-empty', '-delete'],
				`remove the empty directories under ${path}`,
				{ as: 'instance', okExit: [0, 1] },
			),
			ctx,
		);
	}
}

async function undoIdentity(ctx: HostCtx): Promise<string> {
	const keep = await keepUserReason(ctx);
	await undoInside(ctx, backupsRemain(ctx));
	await pruneUserTrees(ctx);
	await removeUserDirs(ctx, false);
	const folder = await undoFolder(ctx);
	await removeUserDirs(ctx, true);
	// The registry entry this step wrote (host_runtime's undo drops it too, when it ran).
	dropEntry(ctx.fs, ctx.paths);
	const removed = removeRootDirs(ctx);
	const account = await removeAccount(ctx, keep);
	const group =
		ctx.created.user === null && ctx.created.group !== null ? `; ${await removeGroup(ctx)}` : '';
	return `${folder}; ${removed.length} empty director(ies) removed; ${account}${group}`;
}

export const host_identity: HostStepDefinition = {
	id: 'host_identity',
	privilege: 'root',
	kind: 'action',
	needs: [],
	label: (plan) =>
		`service user ${String(plan.answers.service_user ?? '')}, the install folder ${String(plan.answers.install_dir ?? '')} and the instance's directories`,
	commands: identityCommands,
	verify: async (ctx) =>
		verdictOf(
			[
				[
					await probeOk(ctx, probe(ctx, 'getent', ['passwd', ctx.paths.user], 'user exists')),
					`user ${ctx.paths.user} missing`,
				],
				[
					await probeOk(ctx, probe(ctx, 'getent', ['group', ctx.paths.group], 'group exists')),
					`group ${ctx.paths.group} missing`,
				],
				...usedFolderCheck(ctx),
				...instanceDirs(ctx).map((spec) => dirCheck(ctx, spec)),
			],
			`user ${ctx.paths.user}, group ${ctx.paths.group} and ${instanceDirs(ctx).length} directories`,
		),
	run: async (ctx) => {
		await claimAccounts(ctx);
		await executeCommands(runCommands(ctx), ctx);
		updateEntry(ctx.fs, ctx.paths, {
			user: ctx.paths.user,
			group: ctx.paths.group,
			install_dir: ctx.paths.instanceDir,
			backup_dir: ctx.paths.backupDir,
		});
		const verdict = identityOf(ctx);
		return ran(`user ${ctx.paths.user}, ${instanceDirs(ctx).length} directories`, {
			told: verdict.told,
		});
	},
	intent: recordIdentity,
	undo: undoIdentity,
};
