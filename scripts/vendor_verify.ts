/**
 * VENDOR TREE INTEGRITY — recompute the digest of every committed third-party
 * tree under `vendor/` and compare it with `vendor/vendor_manifest.json`.
 *
 * WHY THIS EXISTS. A `vendor/` lib is third-party code we SERVE TO BROWSERS
 * (`src/core/client_libs/registry.ts`), and it escapes every integrity mechanism
 * the rest of the dependency tree enjoys: no registry, no lockfile line, no
 * `sha512-` integrity, no Dependabot, no `bun audit` row. What guards a
 * package-manager dependency is the lockfile hash; what guards a vendored one is
 * THIS file plus the manifest — nothing else in the repo hashes those bytes.
 *
 * The digest is deliberately a TREE digest, not a per-file list: it covers the
 * file set as well as the contents, so both an edited byte and an added or
 * deleted file move it. It is computed as
 *
 *     sha256( join( sorted( `${relpath}\0${sha256(bytes)}\n` ) ) )
 *
 * over every regular file under the lib root, relative paths POSIX-normalised,
 * so it is stable across platforms and independent of readdir order.
 *
 * WHERE IT RUNS. From `test/unit/dependency_integrity_tripwire.test.ts` (every
 * `bun test`) and from `scripts/ci/audit.ts`, which the hermetic CI tier already
 * invokes — the vendor pass runs BEFORE the networked advisory audit precisely so
 * the offline skip in that script can never skip integrity too.
 *
 * WHERE IT DOES NOT RUN: at boot. Hashing ~11 MB of pdfjs on every server start
 * would buy nothing — a tampered checkout is caught by git and by CI, not by the
 * process that would already be running the tampered code.
 *
 * HONEST LIMIT — distribution side. `test/unit/release_archive_tripwire.test.ts`
 * hashes NOTHING: it only refuses symlinks in the release archive. So this manifest
 * proves the CHECKOUT is intact; what protects an installation receiving an update
 * is the update's own archive-sha refusal (the manifest travels inside that archive
 * and is covered by its digest, not by an independent signature).
 *
 * Usage:
 *   bun run scripts/vendor_verify.ts            verify (exit 1 on any drift)
 *   bun run scripts/vendor_verify.ts --write    recompute digests/counts into the
 *                                               manifest, PRESERVING the curated
 *                                               fields (version, upstream,
 *                                               archive_sha256, reviewed, note).
 *                                               Review the diff: a changed digest
 *                                               is a changed dependency.
 */

import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix, resolve, sep } from 'node:path';

export const REPO_ROOT = resolve(import.meta.dir, '..');
export const VENDOR_ROOT = join(REPO_ROOT, 'vendor');
export const MANIFEST_PATH = join(VENDOR_ROOT, 'vendor_manifest.json');

/** The manifest's own filename — a file, not a vendored lib directory. */
const MANIFEST_BASENAME = 'vendor_manifest.json';

export interface VendorManifestEntry {
	/** Upstream release this tree was taken from. */
	version: string;
	/** Where the bytes came from — a release/download URL a human can re-fetch. */
	upstream: string;
	/**
	 * sha256 of the upstream ARCHIVE, when one exists and was verified at vendoring
	 * time. `null` means no archive digest is known (see `note`) — the tree digest
	 * is then the only anchor, which is weaker provenance and says so.
	 */
	archive_sha256: string | null;
	/** Tree digest — see the header for the exact construction. */
	tree_sha256: string;
	/** Number of regular files under the lib root. */
	files: number;
	/** ISO date a human last reviewed this pin (staleness axis; Dependabot cannot). */
	reviewed: string;
	/** Anything a reader needs to know: what was trimmed, why it is vendored at all. */
	note: string;
}

export interface VendorManifest {
	note: string;
	libs: Record<string, VendorManifestEntry>;
}

/** Every regular file under `dir`, as POSIX paths relative to `dir`, sorted. */
export function listTreeFiles(dir: string): string[] {
	const out: string[] = [];
	const walk = (current: string): void => {
		for (const entry of readdirSync(current)) {
			const full = join(current, entry);
			// lstat, not stat: a symlink is never followed. A vendored tree is bytes we
			// commit; a link would make the digest depend on something outside it.
			const info = lstatSync(full, { throwIfNoEntry: false });
			if (info === undefined) continue;
			if (info.isDirectory()) walk(full);
			else if (info.isFile())
				out.push(
					full
						.slice(dir.length + 1)
						.split(sep)
						.join(posix.sep),
				);
		}
	};
	walk(dir);
	return out.sort();
}

/** The tree digest of one vendored lib directory. */
export function treeDigest(dir: string): { digest: string; files: number } {
	const relatives = listTreeFiles(dir);
	const lines = relatives.map((rel) => {
		const bytes = readFileSync(join(dir, rel));
		return `${rel}\0${createHash('sha256').update(bytes).digest('hex')}\n`;
	});
	return {
		digest: createHash('sha256').update(lines.join('')).digest('hex'),
		files: relatives.length,
	};
}

/** The vendored lib directories present on disk (the manifest's expected key set). */
export function listVendorDirs(): string[] {
	return readdirSync(VENDOR_ROOT)
		.filter((entry) => {
			if (entry === MANIFEST_BASENAME) return false;
			if (entry.startsWith('.')) return false;
			return lstatSync(join(VENDOR_ROOT, entry)).isDirectory();
		})
		.sort();
}

export function readManifest(): VendorManifest {
	return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as VendorManifest;
}

/**
 * Verify every vendored tree against the manifest.
 *
 * Returns the list of problems, EMPTY when green. It never throws on drift — the
 * caller (a gate, a CI script) decides how loud to be; it does throw when the
 * manifest itself cannot be read, because a missing manifest is not "no drift".
 */
export function verifyVendorTrees(): string[] {
	const manifest = readManifest();
	const onDisk = listVendorDirs();
	const declared = Object.keys(manifest.libs).sort();
	const problems: string[] = [];

	for (const id of onDisk) {
		if (!declared.includes(id)) {
			problems.push(`vendor/${id}/ exists but no vendor_manifest.json row declares it`);
		}
	}
	for (const id of declared) {
		if (!onDisk.includes(id)) {
			problems.push(`vendor_manifest.json declares "${id}" but vendor/${id}/ does not exist`);
			continue;
		}
		const entry = manifest.libs[id] as VendorManifestEntry;
		const { digest, files } = treeDigest(join(VENDOR_ROOT, id));
		if (digest !== entry.tree_sha256) {
			problems.push(
				`vendor/${id}/ tree digest drifted:\n` +
					`      manifest ${entry.tree_sha256}\n` +
					`      on disk  ${digest}\n` +
					'      Either the tree was edited (vendored code is NEVER patched in place —\n' +
					'      bump upstream with scripts/vendor_fetch.ts) or the manifest is stale.',
			);
		}
		if (files !== entry.files) {
			problems.push(`vendor/${id}/ file count: manifest ${entry.files}, on disk ${files}`);
		}
	}
	return problems;
}

if (import.meta.main) {
	const write = process.argv.includes('--write');
	if (write) {
		const manifest = readManifest();
		for (const id of listVendorDirs()) {
			const { digest, files } = treeDigest(join(VENDOR_ROOT, id));
			const previous = manifest.libs[id];
			if (previous === undefined) {
				console.error(
					`== vendor: vendor/${id}/ has no manifest row. Add it by hand (version, upstream,\n` +
						'   archive_sha256, reviewed, note are CURATED — --write only fills the digests).',
				);
				process.exit(1);
			}
			previous.tree_sha256 = digest;
			previous.files = files;
		}
		await Bun.write(MANIFEST_PATH, `${JSON.stringify(manifest, null, '\t')}\n`);
		console.log(`== vendor: digests rewritten (${MANIFEST_PATH}) — review the diff.`);
		process.exit(0);
	}

	const problems = verifyVendorTrees();
	if (problems.length > 0) {
		console.error('== vendor: RED — committed third-party trees do not match the manifest:\n');
		for (const problem of problems) console.error(`   ${problem}`);
		console.error('\nRegenerate deliberately: bun run scripts/vendor_verify.ts --write\n');
		process.exit(1);
	}
	const ids = listVendorDirs();
	console.log(
		`== vendor: GREEN — ${ids.length} vendored trees match the manifest (${ids.join(', ')})`,
	);
}
