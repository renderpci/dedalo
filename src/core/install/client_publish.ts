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
 *   releases/<id>/dedalo/…   a full copy; <id> = first 16 hex of sha256 over
 *                            the sorted (relative path, file sha256) list
 *   dedalo -> releases/<id>/dedalo   RELATIVE symlink, so it resolves in any
 *                            container that mounts the volume, whatever path
 *   .published               {id, published_at, files, bytes}
 *
 * The switch is one rename of a symlink over the old one — a request sees the
 * old tree or the new one, never a half-copied mix. Unchanged content (same
 * id, link resolving) copies nothing. Other releases are pruned after the
 * switch. A legacy real `dedalo/` directory is moved aside and removed.
 *
 * WHAT IS NEVER PUBLISHED: a symlink in the source. nginx follows symlinks, so
 * one would let it serve whatever the link names; it is logged and skipped,
 * never followed. Only regular files and directories are copied, with modes
 * 0750 / 0640 — nginx reads them through the engine's group, like media.
 *
 * WHEN: publishClientAtBoot runs before the socket bind in EVERY boot mode
 * (the install wizard is client too). It is a no-op when the key is unset
 * (every non-container install) and in a smoke boot (read-only by
 * construction). It never throws: a failure is one loud `[client_publish]`
 * line, and the engine still serves its API.
 *
 * The key is read from the PROCESS environment only: it names a mount of this
 * container, which `../private/.env` (outliving every container) cannot know.
 * Gate: test/unit/client_publish_native.test.ts.
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
	renameSync,
	rmSync,
	type Stats,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { processEnvValue, projectRoot } from '../../config/env.ts';

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

function sha256File(path: string): string {
	return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Walk one directory of the source; recurse into real directories only. */
function walkInto(root: string, rel: string, tree: SourceTree): void {
	for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
		const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
		if (entry.isDirectory()) {
			tree.dirs.push(child);
			walkInto(root, child, tree);
		} else if (entry.isFile()) {
			const path = join(root, child);
			tree.files.push({ rel: child, sha256: sha256File(path), bytes: lstatSync(path).size });
		} else {
			tree.skipped.push(child); // a symlink or a special file: never followed, never copied
		}
	}
}

/** The source tree, sorted (byte order of the relative path). */
export function readSourceTree(root: string): SourceTree {
	const tree: SourceTree = { dirs: [], files: [], skipped: [] };
	walkInto(root, '', tree);
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

function readStamp(dir: string): PublishedStamp | null {
	try {
		const parsed = JSON.parse(readFileSync(join(dir, STAMP), 'utf8')) as PublishedStamp;
		return typeof parsed.id === 'string' ? parsed : null;
	} catch {
		return null;
	}
}

/** Already published: the stamp names this id AND the link resolves to a directory. */
function alreadyPublished(dir: string, id: string): boolean {
	return readStamp(dir)?.id === id && existsSync(join(dir, LINK_NAME));
}

function makeDir(path: string): void {
	mkdirSync(path, { recursive: true });
	chmodSync(path, DIR_MODE); // explicit: the process umask must not decide it
}

/** Copy the tree into a fresh release directory (a leftover partial copy is replaced). */
function copyRelease(source: string, release: string, tree: SourceTree): void {
	rmSync(release, { recursive: true, force: true });
	makeDir(release);
	for (const rel of tree.dirs) makeDir(join(release, rel));
	for (const file of tree.files) {
		const target = join(release, file.rel);
		copyFileSync(join(source, file.rel), target);
		chmodSync(target, FILE_MODE);
	}
}

/** An lstat that answers null for a missing path. */
function lstatOrNull(path: string): Stats | null {
	return lstatSync(path, { throwIfNoEntry: false }) ?? null;
}

/** Move a legacy REAL directory out of the link's way; returns where it went, or null. */
function moveLegacyAside(link: string): string | null {
	const stat = lstatOrNull(link);
	if (stat === null || stat.isSymbolicLink() || !stat.isDirectory()) return null;
	const aside = `${link}.legacy-${process.pid}`;
	renameSync(link, aside);
	return aside;
}

/** Point `<dir>/dedalo` at the release: a relative link made aside, renamed over the old one. */
function switchLink(dir: string, id: string): void {
	const link = join(dir, LINK_NAME);
	const tmp = join(dir, `.${LINK_NAME}.tmp-${process.pid}`);
	rmSync(tmp, { force: true });
	symlinkSync(join(RELEASES, id, LINK_NAME), tmp);
	const legacy = moveLegacyAside(link);
	renameSync(tmp, link);
	if (legacy !== null) rmSync(legacy, { recursive: true, force: true });
}

function writeStamp(dir: string, stamp: PublishedStamp): void {
	const tmp = join(dir, `${STAMP}.tmp-${process.pid}`);
	writeFileSync(tmp, `${JSON.stringify(stamp)}\n`, { mode: FILE_MODE });
	chmodSync(tmp, FILE_MODE);
	renameSync(tmp, join(dir, STAMP));
}

/** Remove every release but the live one. */
function pruneReleases(dir: string, keep: string): void {
	for (const name of readdirSync(join(dir, RELEASES))) {
		if (name !== keep) rmSync(join(dir, RELEASES, name), { recursive: true, force: true });
	}
}

/**
 * Publish `source` into `dir` (see the header for the layout). Throws on an
 * I/O failure — publishClientAtBoot is the never-throwing boot wrapper.
 */
export function publishClient(options: {
	source: string;
	dir: string;
	now?: () => Date;
}): ClientPublishResult {
	const tree = readSourceTree(options.source);
	const id = clientContentId(tree.files);
	const bytes = tree.files.reduce((sum, file) => sum + file.bytes, 0);
	const release = join(options.dir, RELEASES, id, LINK_NAME);
	const result = { id, files: tree.files.length, bytes, skipped: tree.skipped, release };
	if (alreadyPublished(options.dir, id)) return { status: 'unchanged', ...result };
	makeDir(join(options.dir, RELEASES));
	makeDir(join(options.dir, RELEASES, id));
	copyRelease(options.source, release, tree);
	switchLink(options.dir, id);
	const publishedAt = (options.now?.() ?? new Date()).toISOString();
	writeStamp(options.dir, { id, published_at: publishedAt, files: result.files, bytes });
	pruneReleases(options.dir, id);
	return { status: 'published', ...result };
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
export function publishClientAtBoot(options: {
	smokeBoot: boolean;
	publishDir?: string | undefined;
	source?: string;
}): ClientPublishResult | null {
	const dir = bootPublishDir(options);
	if (dir === null) return null;
	if (!isAbsolute(dir)) {
		console.error(
			`[client_publish] FAILED: DEDALO_CLIENT_PUBLISH_DIR is not absolute ('${dir}') — nothing published`,
		);
		return null;
	}
	try {
		const result = publishClient({ source: options.source ?? CLIENT_ROOT, dir });
		(result.skipped.length === 0 ? console.log : console.warn)(describe(result, dir));
		return result;
	} catch (error) {
		console.error(
			`[client_publish] FAILED to publish the client into ${dir} — the proxy keeps serving the previous copy (or none): ${(error as Error).message}`,
		);
		return null;
	}
}
