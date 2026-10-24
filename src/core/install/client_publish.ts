/**
 * THE ENGINE PUBLISHES ITS OWN CLIENT (installer unification D2, 2026-10-09).
 *
 * In a container stack nginx serves the client statics. It used to bind-mount
 * them from the HOST checkout (`./client`), which made the client's version
 * the checkout's, not the engine's: a pulled image B behind a checkout at A
 * served client A against engine B — and the wire contract between the two is
 * exact (scripts/update_probe.ts measured that failure). Now the ENGINE copies
 * the client of the code it runs into a volume nginx reads, at every start,
 * before it serves: client and engine are one version by construction.
 * Precedent: the engine already writes the media rule files nginx includes.
 *
 * THE LAYOUT under DEDALO_CLIENT_PUBLISH_DIR (the stacks mount the `client`
 * volume there, and nginx mounts the same volume read-only at the directory
 * its `alias` points into):
 *
 *   releases/<name>/dedalo/… a full copy; <name> = <id>, the first 16 hex of
 *                            sha256 over the sorted (relative path, file
 *                            sha256) list — or <id>-<nonce> when a directory
 *                            of that id is already there (see below)
 *   dedalo -> releases/<name>/dedalo   RELATIVE symlink, so it resolves in any
 *                            container that mounts the volume, whatever path
 *   .published               {id, published_at, files, bytes}
 *
 * The switch is one rename of a symlink over the old one — a request sees the
 * old tree or the new one, never a half-copied mix. Unchanged content copies
 * nothing — and "unchanged" is VERIFIED, not stamped: the live link names a
 * release of the id and the tree it resolves to re-hashes to the id (a stamp
 * alone never vouches for bytes). Other releases are pruned after the switch. A
 * legacy real `dedalo/` directory is moved aside and removed.
 *
 * A RELEASE NAME IS NEVER REUSED (cross-ops:r1). Republishing an id whose
 * directory is already there — a torn live release, or a partial copy a crash
 * left — builds under a FRESH name, `<id>-<nonce>`, and the link is switched to
 * it; the old directory is pruned after. Replacing the directory in place took
 * two renames (old name out, new one in) with the live link naming the gap
 * between them: a request — or a cut — there met a dangling link.
 *
 * DURABLE ACROSS A POWER CUT, not only a kill (cross-ops:r0, 2026-10-21; the
 * law is core/files/durable.ts's: a rename is atomic, not durable). A release
 * is built ASIDE (`releases/.<id>.staging-<pid>`), every file and directory of
 * it fsynced, then renamed to its unused `releases/<name>` and `releases/` fsynced; only
 * then is the link switched (the publish dir fsynced after), and only then is
 * the stamp written (exclusive temp, fsynced, renamed, dir fsynced). A live
 * release is never emptied to be re-copied: its replacement is complete before
 * it takes the name. Gate: test/unit/client_publish_durability_native.test.ts.
 *
 * WHAT IS NEVER PUBLISHED: a symlink in the source. nginx follows symlinks, so
 * one would let it serve whatever the link names; it is logged and skipped,
 * never followed. Only regular files and directories are copied, with modes
 * 0750 / 0640 — nginx reads them through the engine's group, like media.
 *
 * WHEN: publishClientAtBoot runs before the socket bind in EVERY boot mode
 * that serves. It is a no-op when the key is unset
 * (every non-container install) and in a smoke boot (read-only by
 * construction). It never throws (the returned promise never rejects): a
 * failure is one loud `[client_publish]` line, and the engine still serves its
 * API. ASYNC end to end (node:fs/promises): the boot awaits it before the bind,
 * and no step blocks the event loop for the length of a file
 * (sync_io_on_request_path_tripwire).
 *
 * The key is read from the PROCESS environment only: it names a mount of this
 * container, which `../private/.env` (outliving every container) cannot know.
 * Gate: test/unit/client_publish_native.test.ts.
 */

import { createHash } from 'node:crypto';
import type { Stats } from 'node:fs';
import {
	chmod,
	copyFile,
	lstat,
	mkdir,
	open,
	readdir,
	readFile,
	readlink,
	rename,
	rm,
	symlink,
} from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { processEnvValue, projectRoot } from '../../config/env.ts';
import { directoryFsyncUnsupported } from '../files/durable.ts';

/** Absolute root of the client tree the engine serves and publishes. */
export const CLIENT_ROOT: string = join(projectRoot, 'client', 'dedalo');

const DIR_MODE = 0o750;
const FILE_MODE = 0o640;
const LINK_NAME = 'dedalo';
const RELEASES = 'releases';
const STAMP = '.published';

/** One regular file of the source tree. */
interface SourceFile {
	rel: string;
	sha256: string;
	bytes: number;
}

/** The walk of the source tree: what is published, and what was refused. */
interface SourceTree {
	dirs: string[];
	files: SourceFile[];
	skipped: string[];
}

/** What one publication did. */
export interface ClientPublishResult {
	status: 'published' | 'unchanged';
	id: string;
	files: number;
	bytes: number;
	/** Source entries that were NOT published (symlinks, special files), relative. */
	skipped: string[];
	/** Absolute path of the published release directory. */
	release: string;
}

/** The `.published` stamp. */
interface PublishedStamp {
	id: string;
	published_at: string;
	files: number;
	bytes: number;
}

/** One regular file's sha256 and byte count, from ONE async read. */
async function hashFile(path: string): Promise<{ sha256: string; bytes: number }> {
	const content = await readFile(path);
	return { sha256: createHash('sha256').update(content).digest('hex'), bytes: content.byteLength };
}

/** Walk one directory of the source; recurse into real directories only. */
async function walkInto(root: string, rel: string, tree: SourceTree): Promise<void> {
	for (const entry of await readdir(join(root, rel), { withFileTypes: true })) {
		const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
		if (entry.isDirectory()) {
			tree.dirs.push(child);
			await walkInto(root, child, tree);
		} else if (entry.isFile()) {
			tree.files.push({ rel: child, ...(await hashFile(join(root, child))) });
		} else {
			tree.skipped.push(child); // a symlink or a special file: never followed, never copied
		}
	}
}

/** The source tree, sorted (byte order of the relative path). */
export async function readSourceTree(root: string): Promise<SourceTree> {
	const tree: SourceTree = { dirs: [], files: [], skipped: [] };
	await walkInto(root, '', tree);
	const byPath = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
	tree.dirs.sort(byPath);
	tree.files.sort((a, b) => byPath(a.rel, b.rel));
	tree.skipped.sort(byPath);
	return tree;
}

/** The content id: first 16 hex of sha256 over the sorted (path, sha256) list. */
export function clientContentId(files: readonly SourceFile[]): string {
	const hash = createHash('sha256');
	for (const file of files) hash.update(`${file.rel}\0${file.sha256}\n`);
	return hash.digest('hex').slice(0, 16);
}

async function readStamp(dir: string): Promise<PublishedStamp | null> {
	try {
		const parsed = JSON.parse(await readFile(join(dir, STAMP), 'utf8')) as PublishedStamp;
		return typeof parsed.id === 'string' ? parsed : null;
	} catch {
		return null;
	}
}

/** The release directory name a link target `releases/<name>/dedalo` names, when <name> is one of `id`. */
function releaseNameOf(target: string, id: string): string | null {
	const match = new RegExp(`^${RELEASES}/(${id}(?:-[a-z0-9]+)?)/${LINK_NAME}$`).exec(target);
	return match?.[1] ?? null;
}

/** The release directory name the live link names, when it is a symlink to a release of `id`; else null. */
async function linkedReleaseName(dir: string, id: string): Promise<string | null> {
	const link = join(dir, LINK_NAME);
	const stat = await lstatOrNull(link);
	if (stat === null || !stat.isSymbolicLink()) return null;
	return releaseNameOf(await readlink(link), id);
}

/**
 * The live release IS this id — VERIFIED, never taken on the stamp's word
 * (cross-ops:r0, 2026-10-21): the link is the relative link to a release of
 * `id` (releases/<id>[-<nonce>]/dedalo) AND the tree it resolves to hashes to
 * `id` (every file re-read: a release torn by a power cut — a name whose data
 * never reached the disk comes back EMPTY — fails here and is republished, where
 * trusting the stamp served it until the content changed). Answers the live
 * release's directory name, or null. Costs one read of the published tree per
 * boot, the same order as the source hash every boot already pays.
 */
async function liveReleaseVerifies(dir: string, id: string): Promise<string | null> {
	const name = await linkedReleaseName(dir, id);
	if (name === null) return null;
	try {
		const live = await readSourceTree(join(dir, LINK_NAME));
		return live.skipped.length === 0 && clientContentId(live.files) === id ? name : null;
	} catch {
		return null; // a dangling link or an unreadable entry: not published
	}
}

async function makeDir(path: string): Promise<void> {
	await mkdir(path, { recursive: true });
	await chmod(path, DIR_MODE); // explicit: the process umask must not decide it
}

/**
 * fsync one path (async: the boot step never blocks the event loop). A
 * directory's fsync makes its entries durable; a filesystem without that
 * guarantee is said loudly by the kernel's own predicate, never a failure.
 */
async function fsyncPath(path: string, directory: boolean): Promise<void> {
	const handle = await open(path, 'r');
	try {
		await handle.sync();
	} catch (error) {
		if (!directory || !directoryFsyncUnsupported(path, error)) throw error;
	} finally {
		await handle.close();
	}
}

/** Run `work` over `items`, at most `limit` at a time. */
async function eachBounded<T>(
	items: readonly T[],
	limit: number,
	work: (item: T) => Promise<void>,
): Promise<void> {
	let next = 0;
	const lane = async (): Promise<void> => {
		while (next < items.length) {
			const item = items[next++] as T;
			await work(item);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}

/** Copies (each with its fsync) in flight at once: overlaps the per-file flush. */
const COPY_CONCURRENCY = 16;

/** Copy the tree into `root` — every file and directory DURABLE before this returns. */
async function copyRelease(source: string, root: string, tree: SourceTree): Promise<void> {
	await makeDir(root);
	for (const rel of tree.dirs) await makeDir(join(root, rel)); // sorted: parents first
	await eachBounded(tree.files, COPY_CONCURRENCY, async (file) => {
		const target = join(root, file.rel);
		await copyFile(join(source, file.rel), target);
		await chmod(target, FILE_MODE);
		await fsyncPath(target, false);
	});
	// Each directory's entries (deepest first), then the root's.
	for (const rel of [...tree.dirs].reverse()) await fsyncPath(join(root, rel), true);
	await fsyncPath(root, true);
}

/**
 * An UNUSED release name for `id`: `<id>` itself, or — when a directory of that
 * name is already there (a torn live release, a partial copy a crash left) —
 * `<id>-<nonce>`. A name in use is never replaced (see the header).
 */
async function freshReleaseName(releases: string, id: string): Promise<string> {
	if ((await lstatOrNull(join(releases, id))) === null) return id;
	for (let attempt = 0; ; attempt++) {
		const name = `${id}-${process.pid.toString(36)}${Date.now().toString(36)}${attempt.toString(36)}`;
		if ((await lstatOrNull(join(releases, name))) === null) return name;
	}
}

/**
 * Build a release of `id` ASIDE and rename it in, durably, under an UNUSED name
 * (answered). The copy goes to a staging sibling; only a COMPLETE, fsynced tree
 * takes a release name — and never one already there, so whatever the live link
 * names stays in place, whole or torn, until the link is switched away from it.
 */
async function buildRelease(
	source: string,
	dir: string,
	id: string,
	tree: SourceTree,
): Promise<string> {
	const releases = join(dir, RELEASES);
	const staging = join(releases, `.${id}.staging-${process.pid}`);
	await rm(staging, { recursive: true, force: true });
	await makeDir(staging);
	await copyRelease(source, join(staging, LINK_NAME), tree);
	await fsyncPath(staging, true);
	const name = await freshReleaseName(releases, id);
	await rename(staging, join(releases, name));
	await fsyncPath(releases, true);
	return name;
}

/** An lstat that answers null for a missing path. */
async function lstatOrNull(path: string): Promise<Stats | null> {
	try {
		return await lstat(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw error;
	}
}

/** Move a legacy REAL directory out of the link's way; returns where it went, or null. */
async function moveLegacyAside(link: string): Promise<string | null> {
	const stat = await lstatOrNull(link);
	if (stat === null || stat.isSymbolicLink() || !stat.isDirectory()) return null;
	const aside = `${link}.legacy-${process.pid}`;
	await rename(link, aside);
	return aside;
}

/**
 * Point `<dir>/dedalo` at the release: a relative link made aside, renamed over
 * the old one, and the publish directory fsynced — the switch survives a power
 * cut before anything (the stamp) may say it happened.
 */
async function switchLink(dir: string, name: string): Promise<void> {
	const link = join(dir, LINK_NAME);
	const tmp = join(dir, `.${LINK_NAME}.tmp-${process.pid}`);
	await rm(tmp, { force: true });
	await symlink(join(RELEASES, name, LINK_NAME), tmp);
	const legacy = await moveLegacyAside(link);
	await rename(tmp, link);
	await fsyncPath(dir, true);
	if (legacy !== null) await rm(legacy, { recursive: true, force: true });
}

/** The stamp, durably: an exclusive temp, its bytes fsynced, renamed in, the directory fsynced. */
async function writeStamp(dir: string, stamp: PublishedStamp): Promise<void> {
	const tmp = join(dir, `${STAMP}.tmp-${process.pid}`);
	await rm(tmp, { force: true });
	const handle = await open(tmp, 'wx', FILE_MODE);
	try {
		await handle.writeFile(`${JSON.stringify(stamp)}\n`);
		await handle.chmod(FILE_MODE);
		await handle.sync();
	} finally {
		await handle.close();
	}
	await rename(tmp, join(dir, STAMP));
	await fsyncPath(dir, true);
}

/** Remove every release but the live one, by directory name (and any staging leftover of a killed run). */
async function pruneReleases(dir: string, keep: string): Promise<void> {
	for (const name of await readdir(join(dir, RELEASES))) {
		if (name !== keep) await rm(join(dir, RELEASES, name), { recursive: true, force: true });
	}
}

/**
 * Publish `source` into `dir` (see the header for the layout). Throws on an
 * I/O failure — publishClientAtBoot is the never-throwing boot wrapper.
 */
export async function publishClient(options: {
	source: string;
	dir: string;
	now?: () => Date;
}): Promise<ClientPublishResult> {
	const tree = await readSourceTree(options.source);
	const id = clientContentId(tree.files);
	const bytes = tree.files.reduce((sum, file) => sum + file.bytes, 0);
	const result = { id, files: tree.files.length, bytes, skipped: tree.skipped };
	const releaseOf = (name: string): string => join(options.dir, RELEASES, name, LINK_NAME);
	const stampNow = (): PublishedStamp => ({
		id,
		published_at: (options.now?.() ?? new Date()).toISOString(),
		files: result.files,
		bytes,
	});
	const live = await liveReleaseVerifies(options.dir, id);
	if (live !== null) {
		// Served and whole. A stamp naming another id is a crash between the
		// switch and the stamp: repaired without copying a byte — the live
		// release is never touched. The prune finishes whatever a killed run left
		// (an old release, a staging copy): one readdir when clean.
		if ((await readStamp(options.dir))?.id !== id) await writeStamp(options.dir, stampNow());
		await pruneReleases(options.dir, live);
		return { status: 'unchanged', ...result, release: releaseOf(live) };
	}
	await makeDir(join(options.dir, RELEASES));
	const name = await buildRelease(options.source, options.dir, id, tree);
	await switchLink(options.dir, name);
	await writeStamp(options.dir, stampNow());
	await pruneReleases(options.dir, name);
	return { status: 'published', ...result, release: releaseOf(name) };
}

/** The one log line of a publication. */
function describe(result: ClientPublishResult, dir: string): string {
	const skipped =
		result.skipped.length === 0
			? ''
			: ` — NOT published (symlink or special file, never followed): ${result.skipped.join(', ')}`;
	return `[client_publish] ${result.status} client ${result.id} (${result.files} files, ${result.bytes} bytes) at ${dir}/${LINK_NAME}${skipped}`;
}

/** The publish directory a boot uses, or null for "publish nothing". */
function bootPublishDir(options: {
	smokeBoot: boolean;
	publishDir?: string | undefined;
}): string | null {
	if (options.smokeBoot) return null; // a smoke boot is read-only by construction
	const dir =
		'publishDir' in options ? options.publishDir : processEnvValue('DEDALO_CLIENT_PUBLISH_DIR');
	return dir === undefined || dir.trim() === '' ? null : dir;
}

/**
 * The boot step. No-op (null) in a smoke boot or when DEDALO_CLIENT_PUBLISH_DIR
 * is unset; otherwise publishes CLIENT_ROOT and logs one line. NEVER throws.
 * `publishDir` / `source` are test seams; production reads the process env.
 */
export async function publishClientAtBoot(options: {
	smokeBoot: boolean;
	publishDir?: string | undefined;
	source?: string;
}): Promise<ClientPublishResult | null> {
	const dir = bootPublishDir(options);
	if (dir === null) return null;
	if (!isAbsolute(dir)) {
		console.error(
			`[client_publish] FAILED: DEDALO_CLIENT_PUBLISH_DIR is not absolute ('${dir}') — nothing published`,
		);
		return null;
	}
	try {
		const result = await publishClient({ source: options.source ?? CLIENT_ROOT, dir });
		(result.skipped.length === 0 ? console.log : console.warn)(describe(result, dir));
		return result;
	} catch (error) {
		console.error(
			`[client_publish] FAILED to publish the client into ${dir} — the proxy keeps serving the previous copy (or none): ${(error as Error).message}`,
		);
		return null;
	}
}
