/**
 * DEPENDENCY INTEGRITY TRIPWIRE (DEC-12) — every third-party byte this engine
 * installs or serves is pinned by a digest, and there is no third way in.
 *
 * WHY THIS EXISTS (P2-5, 2026-08-24). `package.json` declared
 * `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`. A tarball-URL
 * dependency is the one shape bun records WITHOUT integrity: 581 lockfile entries
 * carried `sha512-`, that one carried nothing. It was not an inert dev dependency
 * either — those bytes are served to browsers as `/dedalo/lib/xlsx/xlsx.mjs`
 * (`tools/tool_export/js/tool_export.js`), and a code update re-runs `bun install`
 * in the quarantine, so every update re-fetched unverified third-party client code.
 * One CDN compromise, or one MITM on an installation's network, and the next update
 * writes attacker JavaScript into every export the museum performs.
 *
 * xlsx is now VENDORED (`vendor/xlsx/`). This gate is what stops the shape coming
 * back — anywhere, in any of the three packages that have their own lockfile.
 *
 * THE TWO HALVES, because closing one alone is a false floor:
 *   1. INSTALLED code — no dependency specifier may be a URL/git/file/link, and no
 *      lockfile tuple may resolve to a non-registry URL or lack a `sha512-`/`sha256-`
 *      integrity. That is the package-manager path.
 *   2. COMMITTED code — `vendor/` has no lockfile at all, so its integrity is the
 *      tree digest in `vendor/vendor_manifest.json`. Dirs and manifest rows must be
 *      exact complements (neither an undeclared tree nor a row with no tree), and
 *      every digest must recompute (`scripts/vendor_verify.ts`).
 *
 * The lockfile roots are IMPORTED from `scripts/ci/audit.ts`, which already declares
 * that census for `bun audit`. Re-declaring the list here is how a fourth package
 * would end up audited but unguarded.
 *
 * HONEST LIMITS.
 *   - This proves a digest EXISTS and matches, never that the bytes are benign. A
 *     pinned malicious release stays pinned and malicious; `scripts/ci/audit.ts`
 *     (advisories) and the vendor staleness print are the other axis.
 *   - Distribution side is NOT covered here. `test/unit/release_archive_tripwire.test.ts`
 *     hashes nothing — it only rejects symlinks in the release archive — so what
 *     protects an installation receiving an update is the update's own archive-sha
 *     refusal, not an independent signature over vendor/.
 *   - Transitive integrity is only as good as bun's own lockfile writer: we assert
 *     the field is present and registry-shaped, not that bun verified it on install.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PACKAGES } from '../../scripts/ci/audit.ts';
import {
	listVendorDirs,
	readManifest,
	treeDigest,
	verifyVendorTrees,
} from '../../scripts/vendor_verify.ts';

const REPO_ROOT = resolve(import.meta.dir, '../..');

/**
 * A dependency specifier that is NOT a version range — it points at bytes the
 * registry never saw. `https?:` is the tarball-URL case that started this; `git`,
 * `github:`, `file:` and `link:` are the other doors into the same room (a git dep
 * resolves to a moving ref, a file/link dep to whatever is on that machine).
 */
const FORBIDDEN_SPECIFIER = /^(https?:|git|github:|file:|link:)/;

/** The dependency blocks a package manager reads. All of them, not just `dependencies`. */
const DEPENDENCY_BLOCKS = [
	'dependencies',
	'devDependencies',
	'peerDependencies',
	// bun installs optional deps like any other, so a tarball URL parked here would
	// walk straight past a scan that only knew the three blocks above.
	'optionalDependencies',
	'bundledDependencies',
	'overrides',
	'resolutions',
] as const;

type PackageJson = Record<string, unknown>;

/**
 * Flatten one package.json's dependency blocks to `<block>.<name>` → specifier.
 * `overrides` may nest (`{"pkg": {"dep": "^1"}}`), so it recurses one level rather
 * than silently skipping the nested form — the exact way a scan narrows itself.
 */
function specifiersOf(pkg: PackageJson, label: string): { where: string; value: string }[] {
	const out: { where: string; value: string }[] = [];
	const visit = (node: unknown, path: string): void => {
		if (typeof node === 'string') {
			out.push({ where: `${label} ${path}`, value: node });
			return;
		}
		if (node !== null && typeof node === 'object') {
			for (const [key, value] of Object.entries(node)) visit(value, `${path}.${key}`);
		}
	};
	for (const block of DEPENDENCY_BLOCKS) {
		const node = pkg[block];
		if (node !== undefined) visit(node, block);
	}
	return out;
}

/**
 * bun.lock is JSONC — it carries trailing commas, which `JSON.parse` refuses. The
 * lockfile is machine-written, so the only deviation is that comma; stripping it is
 * enough and keeps this gate free of a JSONC dependency.
 */
function parseLockfile(path: string): { packages: Record<string, unknown[]> } {
	const text = readFileSync(path, 'utf-8').replace(/,(\s*[}\]])/g, '$1');
	return JSON.parse(text) as { packages: Record<string, unknown[]> };
}

/**
 * The problems in one lockfile tuple, if any. A tuple is
 * `[ "<name>@<resolution>", <registry>, <metadata>, "<integrity>" ]` — the last
 * element is the integrity when there is one, and a URL/git resolution is exactly
 * the case where bun writes a shorter tuple with none.
 */
function lockProblems(root: string, name: string, tuple: unknown[]): string[] {
	const problems: string[] = [];
	const resolution = typeof tuple[0] === 'string' ? tuple[0] : '';
	// `name@version` for a registry dep; `name@https://…` / `name@github:…` for the
	// shapes this gate refuses. Split on the LAST '@' so scoped names survive.
	const at = resolution.lastIndexOf('@');
	const spec = at <= 0 ? resolution : resolution.slice(at + 1);
	if (FORBIDDEN_SPECIFIER.test(spec) || spec.includes('://')) {
		problems.push(`${root} bun.lock: "${name}" resolves to a non-registry source (${resolution})`);
	}
	const last = tuple[tuple.length - 1];
	const integrity = typeof last === 'string' ? last : '';
	if (!(integrity.startsWith('sha512-') || integrity.startsWith('sha256-'))) {
		problems.push(`${root} bun.lock: "${name}" (${resolution}) carries NO integrity hash`);
	}
	return problems;
}

describe('dependency integrity — installed', () => {
	test('the root census is the one scripts/ci/audit.ts declares (guards a silently empty scan)', () => {
		// Imported, never re-listed. If the import ever yields nothing, this gate would
		// pass by checking zero packages — the failure mode it exists to prevent.
		expect(PACKAGES.length).toBeGreaterThanOrEqual(3);
		for (const root of PACKAGES) {
			expect(existsSync(join(REPO_ROOT, root, 'package.json')), `${root}/package.json`).toBe(true);
			expect(existsSync(join(REPO_ROOT, root, 'bun.lock')), `${root}/bun.lock`).toBe(true);
		}
	});

	test('no dependency specifier points outside the registry', () => {
		const offenders: string[] = [];
		for (const root of PACKAGES) {
			const pkg = JSON.parse(
				readFileSync(join(REPO_ROOT, root, 'package.json'), 'utf-8'),
			) as PackageJson;
			for (const { where, value } of specifiersOf(pkg, `${root}/package.json`)) {
				if (FORBIDDEN_SPECIFIER.test(value)) {
					offenders.push(
						`${where} = "${value}" — a URL/git/file dependency is installed with no integrity. ` +
							'Vendor it under vendor/ (see src/core/client_libs/registry.ts xlsx) or use a registry version.',
					);
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	test('every lockfile entry resolves to the registry AND carries an integrity hash', () => {
		const offenders: string[] = [];
		let entries = 0;
		for (const root of PACKAGES) {
			const lock = parseLockfile(join(REPO_ROOT, root, 'bun.lock'));
			for (const [name, tuple] of Object.entries(lock.packages ?? {})) {
				if (!Array.isArray(tuple)) continue;
				entries++;
				offenders.push(...lockProblems(root, name, tuple));
			}
		}
		// Same anti-empty guard: a lockfile format change that yields no tuples must be
		// a red, not a green over 998 unchecked dependencies.
		expect(entries).toBeGreaterThan(500);
		expect(offenders).toEqual([]);
	});

	test('POSITIVE CONTROL — a synthetic URL specifier and an integrity-less tuple are caught', () => {
		// The scan's own detection, proven on data it cannot have been tuned to pass.
		const synthetic: PackageJson = {
			dependencies: { xlsx: 'https://cdn.example.com/xlsx-0.20.3/xlsx-0.20.3.tgz', zod: '^4.4.3' },
			overrides: { hono: { 'some-dep': 'github:owner/repo#main' } },
			devDependencies: { local: 'file:../thing', linked: 'link:../other' },
		};
		const caught = specifiersOf(synthetic, 'synthetic').filter((s) =>
			FORBIDDEN_SPECIFIER.test(s.value),
		);
		expect(caught.map((c) => c.where).sort()).toEqual(
			[
				'synthetic devDependencies.linked',
				'synthetic devDependencies.local',
				'synthetic overrides.hono.some-dep',
				'synthetic dependencies.xlsx',
			].sort(),
		);

		expect(
			lockProblems('.', 'xlsx', ['xlsx@https://cdn.example.com/xlsx-0.20.3.tgz', { bin: {} }]),
		).toHaveLength(2);
		expect(lockProblems('.', 'zod', ['zod@4.4.3', '', {}])).toEqual([
			'. bun.lock: "zod" (zod@4.4.3) carries NO integrity hash',
		]);
		expect(lockProblems('.', 'zod', ['zod@4.4.3', '', {}, 'sha512-abc'])).toEqual([]);
	});
});

describe('dependency integrity — committed under vendor/', () => {
	test('vendor/ directories and vendor_manifest.json rows are exact complements', () => {
		const dirs = listVendorDirs();
		const declared = Object.keys(readManifest().libs).sort();
		// Both directions, named separately so the failure says WHICH way it broke: an
		// undeclared tree is unhashed third-party code; a declared-but-absent row is a
		// manifest that describes something nobody can serve.
		expect(dirs, 'a vendor/ tree with no manifest row is unhashed third-party code').toEqual(
			declared,
		);
		expect(dirs.length).toBeGreaterThan(0);
	});

	test('every manifest row is substantive (version, upstream, review date, reason)', () => {
		const problems: string[] = [];
		for (const [id, entry] of Object.entries(readManifest().libs)) {
			if (entry.version.trim() === '') problems.push(`${id}: no version`);
			// `upstream` may be a prose "none — bespoke build" for ckeditor, whose upstream
			// genuinely does not exist. What it may never be is empty: the never-narrow law
			// wants the absence STATED, not implied.
			if (entry.upstream.trim().length < 4) problems.push(`${id}: no upstream stated`);
			if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewed)) {
				problems.push(`${id}: reviewed "${entry.reviewed}" is not an ISO date`);
			}
			if (entry.note.trim().length < 40) problems.push(`${id}: note is too thin to be a reason`);
			if (!/^[0-9a-f]{64}$/.test(entry.tree_sha256)) problems.push(`${id}: tree_sha256 malformed`);
			if (entry.archive_sha256 !== null && !/^[0-9a-f]{64}$/.test(entry.archive_sha256)) {
				problems.push(`${id}: archive_sha256 must be a sha256 hex digest or null`);
			}
			if (entry.files < 1) problems.push(`${id}: file count ${entry.files}`);
		}
		expect(problems).toEqual([]);
	});

	test('every vendored tree still hashes to its manifest digest', () => {
		// The load-bearing assertion: this is the ONLY thing in the repo that hashes
		// the bytes we serve from vendor/.
		expect(verifyVendorTrees()).toEqual([]);
	});

	test('POSITIVE CONTROL — an edited byte and an added file both move the tree digest', () => {
		// The digest construction itself, exercised on a scratch tree so the control is
		// real without ever writing into vendor/. Both directions matter: hashing only
		// contents would miss a dropped file, hashing only names would miss an edit.
		const scratch = mkdtempSync(join(tmpdir(), 'dedalo_vendor_digest_'));
		try {
			writeFileSync(join(scratch, 'a.js'), 'export const a = 1;\n');
			mkdirSync(join(scratch, 'sub'));
			writeFileSync(join(scratch, 'sub', 'b.js'), 'export const b = 2;\n');
			const original = treeDigest(scratch);
			expect(original.files).toBe(2);

			writeFileSync(join(scratch, 'a.js'), 'export const a = 2;\n');
			expect(treeDigest(scratch).digest).not.toBe(original.digest);

			writeFileSync(join(scratch, 'a.js'), 'export const a = 1;\n');
			expect(treeDigest(scratch).digest).toBe(original.digest);

			writeFileSync(join(scratch, 'c.js'), '');
			const grown = treeDigest(scratch);
			expect(grown.files).toBe(3);
			expect(grown.digest).not.toBe(original.digest);
		} finally {
			rmSync(scratch, { recursive: true, force: true });
		}
	});
});
