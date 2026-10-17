/**
 * install_dev_dependencies — the DEVELOPER route's development dependencies
 * (TODO-052; design DEV_ROUTE_SERVE §1.0).
 *
 * WHY A PLAN STEP. install.sh bootstraps the INSTALLER's dependencies with
 * `bun install --frozen-lockfile --production --ignore-scripts` before any route
 * is chosen — it cannot know the route, and production is right to stay
 * production-only. But a checkout is worked on with `bun run dev`, whose CSS
 * watcher (scripts/build_css.ts) imports `less`, a devDependency: the install
 * said "complete" and the first `bun run dev` crashed with "Cannot find package
 * 'less'". The route is known only here, in the plan, so the developer route
 * carries this step and no other route does (install_plan.ts engineSteps;
 * gate: test/unit/install_dev_dependencies_native.test.ts).
 *
 * THE SAME INSTALL, WIDENED. `bun install --frozen-lockfile --ignore-scripts`
 * over the tree the bootstrap filled: incremental (only the missing packages
 * land), pinned by the committed lockfile, no lifecycle scripts — the same
 * three properties as the bootstrap, minus `--production`.
 *
 * AS THE TREE'S OWNER, NEVER ROOT IN A USER'S TREE. A root-owned
 * `node_modules` in an operator's clone is the C3-24 incident install.sh
 * already refuses to repeat (`deps_user`). The developer route runs as the
 * developer; root in a tree root does not own is REFUSED here, naming the
 * account to run as — a sudo'd developer install would also leave
 * ../private/.env root-owned, which `bun run dev` (as the developer) cannot read.
 *
 * ALREADY THERE = NOTHING SPAWNED. Every devDependency at its locked version
 * (node_modules/<name>/package.json against bun.lock) means the work is done —
 * the same predicate is the step's `verify`, so a resume never re-runs it and a
 * developer whose checkout is complete never waits on the registry.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { liveProcessEnv, projectRoot } from '../../config/env.ts';
import { refuseInstall } from './refuse.ts';

/** The argv after the bun binary: the bootstrap's flags minus `--production`. */
export const DEV_INSTALL_ARGS: readonly string[] = Object.freeze([
	'install',
	'--frozen-lockfile',
	'--ignore-scripts',
]);

/** One devDependency that is not usable as the lockfile pins it. */
export interface DevDependencyGap {
	readonly name: string;
	/** The version bun.lock pins (null: the lockfile names no such package). */
	readonly locked: string | null;
	/** The version in node_modules (null: not installed). */
	readonly installed: string | null;
}

/** The devDependency names package.json declares. */
export function devDependencyNames(tree: string): string[] {
	const manifest = JSON.parse(readFileSync(join(tree, 'package.json'), 'utf8')) as {
		devDependencies?: Record<string, string>;
	};
	return Object.keys(manifest.devDependencies ?? {});
}

/** Escape a package name for a RegExp (scoped names carry `@` and `/`, `.` is common). */
function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * The version bun.lock pins for a TOP-LEVEL package: its `packages` entry
 * `"<name>": ["<name>@<version>", …]` (a nested copy is keyed `<parent>/<name>`
 * and so never matches the line-anchored key). null when the lock names none.
 */
export function lockedVersion(lockText: string, name: string): string | null {
	const escaped = escapeRegExp(name);
	const match = new RegExp(`^\\s*"${escaped}": \\["${escaped}@([^"]+)"`, 'm').exec(lockText);
	return match?.[1] ?? null;
}

/** The version installed at node_modules/<name>, or null. */
function installedVersion(tree: string, name: string): string | null {
	const manifest = join(tree, 'node_modules', name, 'package.json');
	if (!existsSync(manifest)) return null;
	const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { version?: unknown };
	return typeof parsed.version === 'string' ? parsed.version : null;
}

/**
 * Is the installed copy the one the lock pins? A registry pin is a version and
 * must match exactly; a `file:` / `git+…` / `github:` pin carries no version to
 * compare (bun.lock writes the SPEC), so presence is what can be checked.
 */
export function satisfiesLock(locked: string | null, installed: string | null): boolean {
	if (locked === null || installed === null) return false;
	return locked.includes(':') || installed === locked;
}

/** Every devDependency that is missing or not at its locked version (empty = done). */
export function devDependencyGaps(tree: string): DevDependencyGap[] {
	const lockPath = join(tree, 'bun.lock');
	const lockText = existsSync(lockPath) ? readFileSync(lockPath, 'utf8') : '';
	return devDependencyNames(tree)
		.map((name) => ({
			name,
			locked: lockedVersion(lockText, name),
			installed: installedVersion(tree, name),
		}))
		.filter((gap) => !satisfiesLock(gap.locked, gap.installed));
}

/** `less (not installed)`, `chai (6.2.0, locked 6.3.0)`. */
export function describeGaps(gaps: readonly DevDependencyGap[]): string {
	return gaps
		.map((gap) => {
			if (gap.locked === null) return `${gap.name} (not in bun.lock)`;
			if (gap.installed === null) return `${gap.name} (not installed)`;
			return `${gap.name} (${gap.installed}, locked ${gap.locked})`;
		})
		.join(', ');
}

/**
 * Root writing in a tree it does not own: the refusal sentence, else null.
 * `euid` null = a platform without uids (never root there).
 */
export function ownerRefusal(euid: number | null, treeOwnerUid: number): string | null {
	if (euid !== 0 || treeOwnerUid === 0) return null;
	return `the developer route runs as the checkout's owner (uid ${treeOwnerUid}), not root: root never writes in a user's tree (its node_modules, its ../private/.env). Quit, then run sh install.sh as that user, without sudo`;
}

/**
 * The environment the package manager runs with: what it needs to find the
 * registry and its cache, and NOTHING else — the installer's own process
 * carries the install secrets (DEDALO_INSTALL_*, the seeded DB password), and
 * a package manager is no place for them.
 */
const PASSED_KEYS: ReadonlySet<string> = new Set([
	'PATH',
	'HOME',
	'USER',
	'LOGNAME',
	'TMPDIR',
	'LANG',
	'LC_ALL',
	'NO_COLOR',
	'FORCE_COLOR',
	'SSL_CERT_FILE',
	'SSL_CERT_DIR',
	'NODE_EXTRA_CA_CERTS',
	'HTTP_PROXY',
	'HTTPS_PROXY',
	'NO_PROXY',
	'http_proxy',
	'https_proxy',
	'no_proxy',
]);
const PASSED_PREFIXES: readonly string[] = [
	'BUN_INSTALL',
	'BUN_CONFIG_',
	'NPM_CONFIG_',
	'npm_config_',
];

/** The package manager's environment, from `source` (default: this process's). */
export function packageManagerEnv(
	source: Readonly<Record<string, string>> = liveProcessEnv(),
): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(source)) {
		if (PASSED_KEYS.has(key) || PASSED_PREFIXES.some((prefix) => key.startsWith(prefix))) {
			env[key] = value;
		}
	}
	return env;
}

/** The last `count` non-empty lines of a child's output (what the refusal quotes). */
export function outputTail(text: string, count = 5): string {
	return text
		.split('\n')
		.map((line) => line.trimEnd())
		.filter((line) => line !== '')
		.slice(-count)
		.join(' | ');
}

export interface DevDependenciesOptions {
	/** The checkout (default: this engine's tree). */
	readonly tree?: string;
	/** The bun binary (default: the one running the installer — the verified pin). */
	readonly bun?: string;
	/** The effective uid (default: this process's). */
	readonly euid?: number | null;
}

export interface DevDependenciesResult {
	ok: true;
	msg: string;
	/** The devDependencies the run had to install (empty: they were already there). */
	installed: string[];
}

/** The plural the step's lines need. */
function dependencies(count: number): string {
	return `${count} development dependenc${count === 1 ? 'y' : 'ies'}`;
}

/** Refuse when root would write in a tree it does not own (see ownerRefusal). */
function refuseForeignTree(tree: string, euid: number | null | undefined): void {
	const effective = euid === undefined ? (process.geteuid?.() ?? null) : euid;
	const refusal = ownerRefusal(effective, statSync(tree).uid);
	if (refusal !== null) refuseInstall('install.state_conflict', refusal);
}

/** Run the package manager in `tree`; answer its exit code and combined output. */
async function runPackageManager(
	tree: string,
	bun: string,
): Promise<{ code: number; output: string }> {
	const child = Bun.spawn([bun, ...DEV_INSTALL_ARGS], {
		cwd: tree,
		env: packageManagerEnv(),
		stdin: 'ignore',
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	return { code, output: `${stdout}\n${stderr}` };
}

/**
 * Refuse unless the run left every devDependency usable: a non-zero exit
 * (quoting bun's own last lines), and — the outcome, not the exit code — a 0
 * that left a package missing.
 */
function refuseUnlessInstalled(tree: string, code: number, output: string): void {
	if (code !== 0) {
		refuseInstall(
			'install.step_failed',
			`the development dependencies could not be installed: bun install exited ${code} — this machine needs to reach the npm registry once (or a proxy: HTTPS_PROXY). bun said: ${outputTail(output) || '(nothing)'}`,
		);
	}
	const after = devDependencyGaps(tree);
	if (after.length > 0) {
		refuseInstall(
			'install.step_failed',
			`bun install finished but these development dependencies are still not usable: ${describeGaps(after)}`,
		);
	}
}

/** Install the checkout's development dependencies, or refuse naming why. */
export async function installDevDependencies(
	options: DevDependenciesOptions = {},
): Promise<DevDependenciesResult> {
	const tree = options.tree ?? projectRoot;
	const before = devDependencyGaps(tree);
	if (before.length === 0) {
		return {
			ok: true,
			msg: `${dependencies(devDependencyNames(tree).length)} already installed, at their locked versions`,
			installed: [],
		};
	}
	refuseForeignTree(tree, options.euid);
	const { code, output } = await runPackageManager(tree, options.bun ?? process.execPath);
	refuseUnlessInstalled(tree, code, output);
	return {
		ok: true,
		msg: `installed ${dependencies(before.length)} (bun install --frozen-lockfile --ignore-scripts)`,
		installed: before.map((gap) => gap.name),
	};
}
