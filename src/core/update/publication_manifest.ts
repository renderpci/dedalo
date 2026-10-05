/**
 * THE PUBLICATION MANIFEST (publication host phase 4, decision L1) — a per-file
 * sha256 census of `publication/server_api/**`, written by the code updater into
 * the QUARANTINE at the extract phase, beside the install stamp
 * (install_stamp.ts), BEFORE the smoke boot — so the tree that is validated is
 * byte-for-byte the tree that lands, manifest included.
 *
 * WHY IT EXISTS. The engine pushes the Publication API bundles to each paired
 * publication host from the INSTALLED tree, after the restart. By then the
 * verified release zip has been deleted (cleanStagingDir), so nothing else can
 * prove that what ships is what was verified. This file carries that proof
 * across the restart: before packing, every manifested file is re-hashed; any
 * drift — a file edited, removed or added after the update, or a non-regular
 * entry — REFUSES the push and names the file. A tree with no manifest (a dev
 * checkout, or a tree installed before this feature) has no verified release
 * and is refused too (`missing_manifest`).
 *
 * ONE DIGEST RULE. `digest_mismatch` when the manifest's digest is not the
 * tree's own install stamp (a manifest from another archive, or no stamp) OR,
 * when the caller passes `expectedDigest`, not that release either. Every
 * caller that NAMES a release after INSTALLED_DIGEST (the bundle builder, the
 * lockstep reconciler, its dry run and panel) passes it: after a swap lands and
 * before its restart, the tree on disk is the NEW archive while the process is
 * still the old one — its files must never ship under the old release id. The
 * comparison lives here and nowhere else.
 *
 * THE ONE READER. readPublicationManifest / parsePublicationManifest are the only
 * code that reads or validates this file; any malformed shape is null (absent),
 * never a partial trust.
 *
 * ONE TOLERANCE RULE FOR BOTH SIDES. A path in PUBLICATION_TREE_TOLERATED is
 * never manifested, never drift, and never shipped (the bundle builder packs
 * exactly `manifestFilesFor`). The list mirrors the ignore files that apply to
 * this tree (publication/server_api/v2/.gitignore, the root .gitignore's
 * Publication API block, the updater's IGNORED_ROOT_ENTRIES) and a test binds
 * it to them: `server_config_api.php` and `.env` are operator secrets that must
 * never leave the work host; `node_modules` is rebuilt engine-side (L3).
 *
 * ASYNC ON PURPOSE. This module is reachable from the API dispatch table
 * through code_update.ts, and the sync-I/O ledgers are shrink-only; hashing a
 * whole API tree synchronously would also stall every concurrent request. Only
 * node:fs/promises and Bun.file streams are used here.
 *
 * HONEST LIMITS. (1) It detects DRIFT, not an attacker: whoever can write the
 * code tree can rewrite manifest and files together — and already owns the
 * engine. (2) Verify-then-pack is two reads: the bundle builder must hash what
 * it streams and compare it to the manifest again, or a file swapped between
 * the two passes would ship.
 */

import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { INSTALL_STAMP_PATH, parseInstallStamp } from './install_stamp.ts';
import { refuseUpdate } from './refuse.ts';

/** The manifest's path inside any Dédalo tree, relative to the repo root (gitignored). */
export const PUBLICATION_MANIFEST_PATH = 'src/core/update/publication_manifest.json';

/** The tree the manifest covers, relative to the repo root. */
export const PUBLICATION_API_ROOT = 'publication/server_api';

export type PublicationApi = 'v1' | 'v2';

export interface PublicationManifest {
	version: 1;
	/** sha256 of the archive the tree was installed from (= the install stamp's digest). */
	digest: string;
	/** Tree-relative POSIX path ('publication/server_api/v1/…') → sha256, sorted by path. */
	files: Record<string, string>;
}

export type PublicationTreeVerdict =
	| { ok: true }
	| { ok: false; drift: string[]; reason: 'missing_manifest' | 'digest_mismatch' | 'drift' };

/** Never manifested, never drift, never shipped. Bound to the ignore files by update_publication_manifest.test.ts. */
export const PUBLICATION_TREE_TOLERATED: Readonly<{
	names: readonly string[];
	dirs: readonly string[];
	suffixes: readonly string[];
}> = Object.freeze({
	names: Object.freeze(['.DS_Store', 'Thumbs.db', 'desktop.ini', 'server_config_api.php', '.env']),
	dirs: Object.freeze(['node_modules', 'coverage', 'dist', '.cache']),
	suffixes: Object.freeze(['.tsbuildinfo', '.log']),
});

const SHA256_RE = /^[a-f0-9]{64}$/;

interface TreeEntry {
	key: string;
	regular: boolean;
}

interface TreeListing {
	files: string[];
	irregular: string[];
}

function isSha256(value: unknown): value is string {
	return typeof value === 'string' && SHA256_RE.test(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeSegment(segment: string): boolean {
	return segment !== '' && segment !== '.' && segment !== '..';
}

function isManifestKey(key: string): boolean {
	return key.startsWith(`${PUBLICATION_API_ROOT}/`) && key.split('/').every(isSafeSegment);
}

function hasManifestEntries(files: Record<string, unknown>): files is Record<string, string> {
	return Object.entries(files).every(([key, sha]) => isManifestKey(key) && isSha256(sha));
}

function apiRoot(api: PublicationApi): string {
	return `${PUBLICATION_API_ROOT}/${api}`;
}

function isToleratedFileName(name: string): boolean {
	return (
		PUBLICATION_TREE_TOLERATED.names.includes(name) ||
		PUBLICATION_TREE_TOLERATED.suffixes.some((suffix) => name.endsWith(suffix))
	);
}

/** Is a tree-relative path outside the manifest by rule (see PUBLICATION_TREE_TOLERATED)? */
export function isToleratedPath(key: string): boolean {
	const segments = key.split('/');
	const base = segments[segments.length - 1] ?? '';
	return (
		segments.some((segment) => PUBLICATION_TREE_TOLERATED.dirs.includes(segment)) ||
		isToleratedFileName(base)
	);
}

function isMissing(error: unknown): boolean {
	return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}

async function listDir(dir: string): Promise<Dirent[]> {
	try {
		return await readdir(dir, { withFileTypes: true });
	} catch (error) {
		if (isMissing(error)) return [];
		throw error;
	}
}

/** Every non-tolerated entry under `rel`; tolerated directories are pruned, never descended. */
async function* walkTree(treeRoot: string, rel: string): AsyncGenerator<TreeEntry> {
	for (const dirent of await listDir(join(treeRoot, rel))) {
		const key = `${rel}/${dirent.name}`;
		if (isToleratedPath(key)) continue;
		if (dirent.isDirectory()) yield* walkTree(treeRoot, key);
		else yield { key, regular: dirent.isFile() };
	}
}

async function listPublicationTree(treeRoot: string, rel: string): Promise<TreeListing> {
	const listing: TreeListing = { files: [], irregular: [] };
	for await (const entry of walkTree(treeRoot, rel)) {
		(entry.regular ? listing.files : listing.irregular).push(entry.key);
	}
	listing.files.sort();
	listing.irregular.sort();
	return listing;
}

async function sha256File(path: string): Promise<string> {
	const hash = createHash('sha256');
	for await (const chunk of Bun.file(path).stream()) hash.update(chunk);
	return hash.digest('hex');
}

async function sha256OrNull(path: string): Promise<string | null> {
	try {
		return await sha256File(path);
	} catch {
		return null;
	}
}

async function hashAll(treeRoot: string, keys: readonly string[]): Promise<Record<string, string>> {
	const files: Record<string, string> = {};
	for (const key of keys) files[key] = await sha256File(join(treeRoot, key));
	return files;
}

async function writeManifestFile(treeRoot: string, manifest: PublicationManifest): Promise<void> {
	const path = join(treeRoot, PUBLICATION_MANIFEST_PATH);
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.tmp`;
	await writeFile(tmp, `${JSON.stringify(manifest, null, '\t')}\n`, { mode: 0o644 });
	await rename(tmp, path);
}

/**
 * Write the manifest of `treeRoot`'s Publication API tree (called by updateCode
 * on the extracted quarantine). A non-regular entry REFUSES the update: the
 * extraction belt already refuses symlinks, so one here is a defect, and a
 * manifest that skipped it would certify a tree it never read.
 */
export async function writePublicationManifest(treeRoot: string, digest: string): Promise<void> {
	if (!isSha256(digest)) {
		refuseUpdate(
			'update.failed',
			'Error. The publication manifest needs the verified archive digest — nothing was swapped',
		);
	}
	const listing = await listPublicationTree(treeRoot, PUBLICATION_API_ROOT);
	if (listing.irregular.length > 0) {
		refuseUpdate(
			'update.refused',
			`Error. The release's Publication API tree holds entries that are not regular files: ${listing.irregular.join(', ')} — nothing was swapped`,
		);
	}
	await writeManifestFile(treeRoot, {
		version: 1,
		digest,
		files: await hashAll(treeRoot, listing.files),
	});
}

function parseJsonOrNull(content: string): unknown {
	try {
		return JSON.parse(content);
	} catch {
		return null;
	}
}

/** THE validator. ANY malformed shape → null: a manifest is evidence, never partially trusted. */
export function parsePublicationManifest(content: string): PublicationManifest | null {
	const raw = parseJsonOrNull(content);
	if (!isPlainRecord(raw) || raw.version !== 1) return null;
	const digest = raw.digest;
	const files = raw.files;
	if (!isSha256(digest) || !isPlainRecord(files) || !hasManifestEntries(files)) return null;
	return { version: 1, digest, files: { ...files } };
}

/** THE reader: the manifest of `treeRoot`, or null when it is absent or malformed. */
export async function readPublicationManifest(
	treeRoot: string,
): Promise<PublicationManifest | null> {
	try {
		return parsePublicationManifest(
			await readFile(join(treeRoot, PUBLICATION_MANIFEST_PATH), 'utf8'),
		);
	} catch {
		return null;
	}
}

/** The manifested files of ONE API, sorted — exactly what a bundle may carry. */
export function manifestFilesFor(manifest: PublicationManifest, api: PublicationApi): string[] {
	const prefix = `${apiRoot(api)}/`;
	return Object.keys(manifest.files)
		.filter((key) => key.startsWith(prefix))
		.sort();
}

/** The tree's OWN stamp digest (null when absent or unreadable). */
async function stampDigestOf(treeRoot: string): Promise<string | null> {
	try {
		return (
			parseInstallStamp(await readFile(join(treeRoot, INSTALL_STAMP_PATH), 'utf8'))?.digest ?? null
		);
	} catch {
		return null;
	}
}

/** THE digest rule (see the header): the stamp must own the manifest, and so must the caller's release. */
async function digestAgrees(
	treeRoot: string,
	manifest: PublicationManifest,
	expectedDigest: string | undefined,
): Promise<boolean> {
	if (expectedDigest !== undefined && manifest.digest !== expectedDigest) return false;
	return manifest.digest === (await stampDigestOf(treeRoot));
}

async function fileDrift(
	treeRoot: string,
	key: string,
	present: boolean,
	expectedSha: string | undefined,
): Promise<'missing' | 'modified' | null> {
	if (!present) return 'missing';
	return (await sha256OrNull(join(treeRoot, key))) === expectedSha ? null : 'modified';
}

async function changedFiles(
	treeRoot: string,
	expected: readonly string[],
	present: ReadonlySet<string>,
	files: Readonly<Record<string, string>>,
): Promise<string[]> {
	const changed: string[] = [];
	for (const key of expected) {
		const why = await fileDrift(treeRoot, key, present.has(key), files[key]);
		if (why !== null) changed.push(`${key} (${why})`);
	}
	return changed;
}

async function treeDrift(
	treeRoot: string,
	api: PublicationApi,
	manifest: PublicationManifest,
): Promise<string[]> {
	const expected = manifestFilesFor(manifest, api);
	if (expected.length === 0) return [`${apiRoot(api)}/ (no files in the manifest)`];
	const listing = await listPublicationTree(treeRoot, apiRoot(api));
	const unexpected = listing.files.filter((key) => !Object.hasOwn(manifest.files, key));
	const drift = [
		...listing.irregular.map((key) => `${key} (not a regular file)`),
		...unexpected.map((key) => `${key} (not in the manifest)`),
		...(await changedFiles(treeRoot, expected, new Set(listing.files), manifest.files)),
	];
	return drift.sort();
}

/**
 * Does `treeRoot`'s API tree still hold exactly what the updater verified, for
 * the release the caller names (`expectedDigest`, normally INSTALLED_DIGEST)?
 * Each API is judged on its own: v2 drift never blocks a v1 push (L6).
 */
export async function verifyPublicationTree(
	treeRoot: string,
	api: PublicationApi,
	expectedDigest?: string,
): Promise<PublicationTreeVerdict> {
	const manifest = await readPublicationManifest(treeRoot);
	if (manifest === null) return { ok: false, reason: 'missing_manifest', drift: [] };
	if (!(await digestAgrees(treeRoot, manifest, expectedDigest))) {
		return { ok: false, reason: 'digest_mismatch', drift: [] };
	}
	const drift = await treeDrift(treeRoot, api, manifest);
	return drift.length === 0 ? { ok: true } : { ok: false, reason: 'drift', drift };
}
