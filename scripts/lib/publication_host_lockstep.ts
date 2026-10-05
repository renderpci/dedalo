/**
 * PUBLICATION-HOST LOCKSTEP DRILL KIT — the pure pieces behind the [lockstep] rows of
 * scripts/publication_host_engine_drill.ts (engineering/PUBLICATION_HOST_SPEC.md §3, Lockstep).
 *
 * The rows prove phase 4's ENGINE half on what production runs: an INSTALLED tree, carrying
 * the install stamp the updater writes at extract (src/core/update/install_stamp.ts) and the
 * publication manifest written beside it. This dev checkout has neither, and must be refused.
 * So the drill:
 *   - materializes a scratch tree from this checkout's WORKING tree (tracked + untracked-
 *     unignored: uncommitted work is exercised, exactly as `bun test` does). Symlinks are
 *     dropped: a release archive carries none, and code_update refuses them. The tree is
 *     marked as a drill tree, and the checkout's node_modules are linked;
 *   - stamps it with a SYNTHETIC digest (verifying a downloaded archive is code_update's
 *     gate, not this one's) and plants the pending sentinel a swap leaves behind;
 *   - runs scripts/publication_host_lockstep_driver.ts INSIDE it, so the tree's own engine
 *     modules read the tree's own INSTALLED_DIGEST.
 * The driver refuses every tree without DRILL_TREE_MARKER: it writes the manifest, flips
 * the sentinel, builds bundles, pushes to the hosts of the registry it is pointed at and
 * records their runtime — never a live installation's.
 *
 * Node builtins, one leaf module (install_stamp.ts) and one ERASED type import: the hermetic
 * gate (test/unit/publication_host_lockstep_kit.test.ts) loads it without the engine config.
 */

import { createHash } from 'node:crypto';
import {
	chmodSync,
	copyFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { CodeUpdateSentinel } from '../../src/core/update/boot_confirm.ts';
import { INSTALL_STAMP_PATH } from '../../src/core/update/install_stamp.ts';

/** The file that makes a directory a lockstep drill tree, and nothing else one. */
export const DRILL_TREE_MARKER = '.dedalo_lockstep_drill_tree';
/** The sentinel's name inside the backup root (boot_confirm.ts codeUpdateSentinelPath). */
export const SENTINEL_FILE = 'last_code_update.json';
export const DRIVER_RESULT = 'DRIVER_RESULT ';
export const DRIVER_ERROR = 'DRIVER_ERROR ';

/**
 * Copy the working tree of `repo` into `dest`: every regular file git would carry (tracked,
 * plus untracked files that are not ignored), with its mode. Files tracked but deleted from
 * the worktree are skipped, as are symlinks and gitlinks. The checkout's node_modules is
 * linked, never copied; the drill marker is planted. Returns the number of files copied.
 */
export function materializeScratchTree(repo: string, dest: string): number {
	const listed = Bun.spawnSync(
		['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
		{
			cwd: repo,
			stdout: 'pipe',
			stderr: 'pipe',
		},
	);
	if (listed.exitCode !== 0) throw new Error(`git ls-files failed: ${listed.stderr.toString()}`);
	mkdirSync(dest, { recursive: true });
	let copied = 0;
	for (const rel of new Set(listed.stdout.toString().split('\0').filter(Boolean))) {
		const from = join(repo, rel);
		if (!existsSync(from) && !isLink(from)) continue; // tracked, deleted in the worktree
		const stat = lstatSync(from);
		if (!stat.isFile()) continue; // a symlink (the agent aliases) or a gitlink
		const to = join(dest, rel);
		mkdirSync(dirname(to), { recursive: true });
		copyFileSync(from, to);
		chmodSync(to, stat.mode & 0o777);
		copied++;
	}
	if (existsSync(join(repo, 'node_modules')))
		symlinkSync(join(repo, 'node_modules'), join(dest, 'node_modules'));
	writeFileSync(
		join(dest, DRILL_TREE_MARKER),
		'publication-host lockstep drill tree: scratch, never an installation\n',
	);
	return copied;
}

function isLink(path: string): boolean {
	try {
		return lstatSync(path).isSymbolicLink();
	} catch {
		return false;
	}
}

/** The driver's guard: throw unless `root` carries the drill marker. */
export function assertDrillTree(root: string): void {
	if (!existsSync(join(root, DRILL_TREE_MARKER)))
		throw new Error(
			`${root} is not a lockstep drill tree (no ${DRILL_TREE_MARKER}): the driver writes a manifest, a sentinel and the hosts' runtime, and pushes code, so it refuses any other tree`,
		);
}

/** The stamp the updater writes at extract (code_update.ts writeInstallStampSync's shape). */
export function writeScratchStamp(tree: string, digest: string): void {
	const path = join(tree, INSTALL_STAMP_PATH);
	mkdirSync(dirname(path), { recursive: true });
	const stamp = {
		digest,
		channel: 'master',
		source_url: 'drill:publication-host-lockstep',
		installed_at: new Date().toISOString(),
	};
	writeFileSync(path, `${JSON.stringify(stamp, null, '\t')}\n`);
}

/** A synthetic archive digest, stable per label: two labels = two "archives". */
export function drillDigest(label: string): string {
	return createHash('sha256')
		.update(`dedalo publication-host lockstep drill: ${label}`)
		.digest('hex');
}

/** The sentinel a swap leaves PENDING, naming the digest it installed (boot_confirm.ts). */
export function plantPendingSentinel(backupRoot: string, version: string, digest: string): void {
	const sentinel: CodeUpdateSentinel = {
		version,
		previousVersion: version,
		updateMode: 'clean',
		stamp: new Date().toISOString().slice(0, 19).replaceAll(':', '-'),
		backupDir: join(backupRoot, 'drill_no_restore_point'),
		installDigest: digest,
		status: 'pending',
		rollback_attempted: false,
	};
	mkdirSync(backupRoot, { recursive: true });
	writeFileSync(join(backupRoot, SENTINEL_FILE), `${JSON.stringify(sentinel, null, '\t')}\n`);
}

/** The sentinel's status, or null when there is none (or it does not parse). */
export function sentinelStatus(backupRoot: string): string | null {
	try {
		const raw = JSON.parse(readFileSync(join(backupRoot, SENTINEL_FILE), 'utf8')) as {
			status?: unknown;
		};
		return typeof raw.status === 'string' ? raw.status : null;
	} catch {
		return null;
	}
}

/**
 * The driver's answer: the LAST `DRIVER_RESULT <json>` line, on exit 0. Anything else throws,
 * naming the driver's own `DRIVER_ERROR` text when there is one, plus the stderr tail.
 */
export function parseDriverResult<T>(stdout: string, stderr: string, code: number | null): T {
	const lines = stdout.split('\n');
	const result = lines.filter((line) => line.startsWith(DRIVER_RESULT)).pop();
	const error = lines.filter((line) => line.startsWith(DRIVER_ERROR)).pop();
	if (code === 0 && result !== undefined)
		return JSON.parse(result.slice(DRIVER_RESULT.length)) as T;
	const why =
		error?.slice(DRIVER_ERROR.length) ??
		`exit ${code}${result === undefined ? ', no result line' : ''}`;
	const tail = stderr.trim().split('\n').slice(-15).join('\n');
	throw new Error(`lockstep driver: ${why}${tail === '' ? '' : `\n${tail}`}`);
}

/** Total bytes under `dir` (0 when absent): the agent audits every mutation it receives. */
export function auditBytes(dir: string): number {
	if (!existsSync(dir)) return 0;
	let total = 0;
	for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
		if (entry.isFile()) total += statSync(join(entry.parentPath, entry.name)).size;
	}
	return total;
}
