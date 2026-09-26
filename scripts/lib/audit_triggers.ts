/**
 * THE DEPENDENCY AUDIT'S TRIGGER SET — which changed paths make the push gate
 * run `scripts/ci/audit.ts` (S3, 2026-09-26).
 *
 * A module of its own, SIDE-EFFECT FREE on import: audit.ts derives its package
 * census (`PACKAGES`, a repo-wide `**\/package.json` glob) at module load, so a
 * gate that imported the matcher from there also ran — and was censused as —
 * a directory walk it never asserts on. This file reads source files only when
 * `auditCodeInputs` is CALLED, and only the ones the import graph names.
 * audit.ts imports (and re-exports) it, so it is itself in the closure it
 * computes. `changedSince` (the change set the matcher is applied to) lives here
 * for the same reason. Gate: test/unit/audit_trigger_closure_native.test.ts.
 */

import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/**
 * The roots of the audit's CODE inputs, repo-relative. Every module they reach
 * through a relative import (static, re-export, dynamic, require — transitively)
 * is a trigger. Roots, not a file list: a new helper joins by being imported.
 */
export const AUDIT_CODE_ROOTS: readonly string[] = [
	'scripts/ci/audit.ts',
	'test/unit/vendor_advisory_tripwire.test.ts',
];

/** The derived code-input set, plus what could NOT be derived (non-empty ⇒ fail-safe). */
export type AuditCodeInputs = { files: readonly string[]; incomplete: readonly string[] };

/** Repo-relative source reader; null = no such file. Injectable so the gate can overlay an edit. */
export type SourceReader = (repoRelative: string) => string | null;

const readRepoSource: SourceReader = (rel) => {
	try {
		return readFileSync(join(REPO_ROOT, rel), 'utf-8');
	} catch {
		return null;
	}
};

const RESOLVE_SUFFIXES = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '/index.ts', '/index.js'];

/**
 * The relative-import closure of `roots`, read through Bun's own transpiler
 * (`scanImports` — comments and strings are not imports; type-only imports are
 * erased, correctly: they cannot change what the audit DOES, and typecheck runs
 * on every push). Bare specifiers (`bun`, `node:*`, packages) are not repo code
 * and are covered by the lockfile/package.json triggers. A module that cannot be
 * read or parsed, or a relative specifier that resolves to nothing, lands in
 * `incomplete` — the matcher then runs the audit unconditionally.
 */
export function auditCodeInputs(
	roots: readonly string[] = AUDIT_CODE_ROOTS,
	read: SourceReader = readRepoSource,
): AuditCodeInputs {
	const transpiler = new Bun.Transpiler({ loader: 'tsx' });
	const files = new Set<string>();
	const incomplete: string[] = [];
	const queue = [...roots];
	while (queue.length > 0) {
		const file = queue.shift() as string;
		if (files.has(file)) continue;
		const source = read(file);
		if (source === null) {
			incomplete.push(`${file}: unreadable`);
			continue;
		}
		files.add(file);
		// Data a module imports (a .json, say) is an input, not a module to scan.
		if (!/\.(?:[cm]?[jt]sx?)$/.test(file)) continue;
		let imports: { path: string }[];
		try {
			imports = transpiler.scanImports(source);
		} catch (error) {
			incomplete.push(`${file}: unparseable (${(error as Error).message})`);
			continue;
		}
		for (const { path: specifier } of imports) {
			if (!specifier.startsWith('./') && !specifier.startsWith('../')) continue;
			const base = posix.normalize(posix.join(posix.dirname(file), specifier));
			if (base.startsWith('../') || base.includes('node_modules/')) continue; // outside the repo
			const hit = RESOLVE_SUFFIXES.map((suffix) => base + suffix).find(
				(candidate) => files.has(candidate) || read(candidate) !== null,
			);
			if (hit === undefined) incomplete.push(`${file}: "${specifier}" resolves to no file`);
			else if (!files.has(hit)) queue.push(hit);
		}
	}
	return { files: [...files].sort(), incomplete };
}

/**
 * THE TRIGGER SET — the tracked paths whose change makes this ratchet's answer
 * change for reasons OF OURS. Derived, never enumerated by hand:
 *   - every `bun.lock` and every `package.json`, at any depth (the root, the two
 *     publication daemons, the site-builder template — the same census PACKAGES
 *     derives, plus a manifest that has no lockfile YET, which is exactly the
 *     commit that is about to need one);
 *   - `vendor/` and every manifest row's explicit `root` (the trees that live
 *     outside vendor/, e.g. swagger-ui inside the v1 publication API);
 *   - the ratchet's committed baseline (its data input);
 *   - the ratchet's CODE: the relative-import closure of AUDIT_CODE_ROOTS
 *     (`auditCodeInputs`) — this script, the vendor advisory tripwire, and every
 *     module either reaches, transitively. DERIVED from the import graph, never
 *     listed: the hand list (audit.ts, vendor_verify.ts, reason_validator.ts)
 *     meant a helper newly imported by audit.ts, edited alone, SKIPPED the
 *     audit on push — a change to the checker has to run the checker, or an
 *     edit that breaks it ships green;
 *   - `.bun-version`: `bun audit` is the bun binary's own subcommand.
 * Exported: the gate proves the set on constructed change lists
 * (test/unit/audit_trigger_closure_native.test.ts proves the derivation).
 */
export function auditTriggerMatcher(
	extraRoots: readonly string[],
	code: AuditCodeInputs = auditCodeInputs(),
): (path: string) => boolean {
	const exact = new Set([
		'.bun-version',
		'engineering/dependency_audit_baseline.json',
		...code.files,
	]);
	const prefixes = ['vendor/', ...extraRoots.map((root) => `${root.replace(/\/+$/, '')}/`)];
	return (path: string): boolean => {
		// FAIL-SAFE: a closure that could not be fully computed (an unparseable or
		// unresolvable module) is never read as "these are all the inputs" — every
		// path triggers, so the audit RUNS rather than skipping on a guess.
		if (code.incomplete.length > 0) return true;
		if (path.includes('node_modules/')) return false;
		if (exact.has(path)) return true;
		const base = path.slice(path.lastIndexOf('/') + 1);
		if (base === 'bun.lock' || base === 'package.json') return true;
		return prefixes.some((prefix) => path.startsWith(prefix));
	};
}

/**
 * The files that differ between `reference` and the working tree, or null when
 * that cannot be answered. The WORKING TREE, not HEAD: a local run with
 * uncommitted lockfile edits must see them (a superset only ever runs MORE).
 *
 * `--no-renames`: a detected rename names only its NEW path, so a file moved OUT of
 * vendor/ (or out of a lockfile's directory) would vanish from the trigger set and the
 * audit would SKIP on exactly the change that should run it.
 *
 * NOT untracked files, deliberately: listing them is a second walk of the tree
 * (census_derivation_tripwire registers audit.ts's roots), and nothing a push
 * carries is untracked. A vendored tree dropped in without `git add` is already red
 * on every push: dependency_integrity_tripwire's complement law (every vendor/ dir
 * has a manifest row) runs in the always-on tripwire block.
 *
 * Lives here, not in audit.ts, so its gate (audit_trigger_closure_native) runs it on a
 * scratch repository (`root`) without loading audit.ts's PACKAGES glob.
 */
export function changedSince(reference: string, root: string = REPO_ROOT): string[] | null {
	if (reference.trim() === '') return null;
	const proc = Bun.spawnSync(['git', 'diff', '--name-only', '--no-renames', reference, '--'], {
		cwd: root,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	if (proc.exitCode !== 0) {
		console.error(
			`   git diff against "${reference}" failed: ${proc.stderr.toString().trim().slice(0, 300)}`,
		);
		return null;
	}
	return proc.stdout
		.toString()
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '');
}
