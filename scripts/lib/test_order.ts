/**
 * TEST-FILE ORDER — the ONE way a tier hands its files to `bun test`.
 *
 * MEASURED (Bun 1.4.2, 2026-10-02, a scratch dir of five files):
 *  - `bun test <dir>` runs files in RAW readdir order — hash order per
 *    filesystem. The GitHub runner (ext4) and the Mac's CI container (virtiofs)
 *    therefore ran the unit tier's ~1000 files in DIFFERENT orders, and
 *    order-dependent reds appeared on one host only.
 *  - `bun test t/<a>.test.ts t/<z>.test.ts` (bare) is NOT a path list: bun
 *    reads a bare argument as a SUBSTRING FILTER, scans the tree, and runs the
 *    matches in the same readdir order. An "explicit" bare list fixes nothing.
 *  - `bun test ./t/<a>.test.ts ./t/<z>.test.ts` is PATH mode: files run in
 *    ARGV order, and the JUnit `file=` keys stay repo-relative
 *    (`t/<a>.test.ts`), so no baseline key moves.
 *  - a missing `./path` is SILENTLY DROPPED (exit 0, the rest runs). Hence the
 *    existence check below: a tier must never shrink without a word.
 *
 * So every tier expands its paths here into a codepoint-SORTED, `./`-prefixed
 * file list: one process, one order, identical on every host. Gate:
 * test/unit/tier_file_order_tripwire.test.ts (incl. the bun behaviour above,
 * re-measured on the pinned bun every run).
 *
 * ARGV SIZE, measured 2026-10-02: the unit tier (test/unit + test/integration,
 * 1007 files) is ~55 KB of argv. ARG_MAX is 1 MiB on macOS, 2 MiB on Linux.
 * `ARGV_BUDGET_BYTES` refuses a list past a quarter of the smaller one rather
 * than let an E2BIG surface as "the tier did not run" — chunking would change
 * process boundaries (one module registry per process), which is a semantic
 * change, not a fix; the day the budget trips, that decision is made on purpose.
 */

import { existsSync, statSync } from 'node:fs';
import { isAbsolute, join, normalize } from 'node:path';
import { Glob } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** Bun's four test-file shapes (the discovery `bun test <dir>` performs). */
export const BUN_TEST_GLOBS = [
	'**/*.test.{js,jsx,ts,tsx,mjs,cjs}',
	'**/*_test.{js,jsx,ts,tsx,mjs,cjs}',
	'**/*.spec.{js,jsx,ts,tsx,mjs,cjs}',
	'**/*_spec.{js,jsx,ts,tsx,mjs,cjs}',
] as const;

/** A quarter of macOS's 1 MiB ARG_MAX (Linux: 2 MiB). See the header. */
export const ARGV_BUDGET_BYTES = 256 * 1024;

/** Codepoint order — locale-free, so every host and `LC_ALL=C sort` agree. */
export function codepointCompare(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

function repoRelative(path: string): string {
	if (isAbsolute(path))
		throw new Error(`test_order: '${path}' is absolute — tier paths are repo-relative`);
	const clean = normalize(path).replace(/\/+$/, '');
	if (clean.startsWith('..')) throw new Error(`test_order: '${path}' leaves the repository`);
	return clean.startsWith('./') ? clean.slice(2) : clean;
}

/** Every test file bun would discover under one existing directory (repo-relative). */
function walkDirectory(rel: string, abs: string): string[] {
	const found: string[] = [];
	for (const glob of BUN_TEST_GLOBS) {
		for (const file of new Glob(glob).scanSync({ cwd: abs, onlyFiles: true })) {
			if (!file.split('/').includes('node_modules')) found.push(`${rel}/${file}`);
		}
	}
	return found;
}

/**
 * Expand repo-relative tier paths (directories and/or files) into the sorted,
 * de-duplicated list of test files bun would discover under them. A path that
 * does not exist, or a directory holding no test file, THROWS — never an empty
 * or silently shrunk tier. `inventory: true` is the read-only listing a drift
 * REPORT needs (which files exist to have reported): absent paths contribute
 * nothing instead of throwing, because the report is already explaining a failure.
 */
export function tierFiles(
	paths: readonly string[],
	root: string = REPO_ROOT,
	options: { inventory?: boolean } = {},
): string[] {
	if (paths.length === 0) throw new Error('test_order: a tier with no paths measures nothing');
	const out = new Set<string>();
	for (const path of paths) {
		// Canonical spelling only (`test/unit`, never `./test/unit/`): the path IS the
		// key prefix of every file it yields, so a second spelling of one tier would
		// be a second key space.
		if (repoRelative(path) !== path) {
			throw new Error(
				`test_order: tier path '${path}' is not canonical (write '${repoRelative(path)}')`,
			);
		}
		const abs = join(root, path);
		if (!existsSync(abs)) {
			if (options.inventory) continue;
			throw new Error(`test_order: tier path '${path}' does not exist`);
		}
		const found = statSync(abs).isDirectory() ? walkDirectory(path, abs) : [path];
		if (found.length === 0 && !options.inventory) {
			throw new Error(`test_order: tier directory '${path}' holds no test file`);
		}
		for (const file of found) out.add(file);
	}
	return [...out].sort(codepointCompare);
}

/**
 * The `bun test` file arguments for a list of repo-relative test files: sorted,
 * de-duplicated, each `./`-prefixed (PATH mode — see the header), each checked to
 * exist (bun drops a missing `./path` silently), and the whole within
 * `ARGV_BUDGET_BYTES`.
 */
export function bunTestFileArgs(files: readonly string[], root: string = REPO_ROOT): string[] {
	const sorted = [...new Set(files.map(repoRelative))].sort(codepointCompare);
	const missing = sorted.filter((f) => !existsSync(join(root, f)));
	if (missing.length > 0) {
		throw new Error(
			`test_order: ${missing.length} test file(s) do not exist — bun would drop them silently: ${missing.join(', ')}`,
		);
	}
	const args = sorted.map((f) => `./${f}`);
	const bytes = args.reduce((n, a) => n + Buffer.byteLength(a) + 1, 0);
	if (bytes > ARGV_BUDGET_BYTES) {
		throw new Error(
			`test_order: ${args.length} files = ${bytes} bytes of argv, over the ${ARGV_BUDGET_BYTES}-byte budget. Chunking changes process boundaries (one module registry per process) — decide that deliberately in scripts/lib/test_order.ts, do not raise the budget past ARG_MAX.`,
		);
	}
	return args;
}

/** `tierFiles` then `bunTestFileArgs`: the argv segment for a tier's paths. */
export function tierFileArgs(paths: readonly string[], root: string = REPO_ROOT): string[] {
	return bunTestFileArgs(tierFiles(paths, root), root);
}

/**
 * CLI: `bun scripts/lib/test_order.ts <path>…` prints a tier's file arguments,
 * one line, so a census's reproduce command is runnable as quoted:
 * `bun test --timeout=30000 $(bun scripts/lib/test_order.ts test/parity)`.
 */
if (import.meta.main) {
	console.log(tierFileArgs(process.argv.slice(2)).join(' '));
}
