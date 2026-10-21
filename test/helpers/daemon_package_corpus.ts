/**
 * THE DAEMON PACKAGE CORPUS — the standalone packages under `publication/`
 * (each its own package.json + tsconfig.json + lockfile: today site_builder,
 * host_agent, server_api/v2) and the TypeScript source each one ships.
 *
 * Gates that ask a question PER PACKAGE (is every file it ships type-checked;
 * is it linted or budgeted) read the package set from here, so a fourth daemon
 * is in every such census the day its package.json lands — never added by hand
 * to one gate and forgotten by another. `test/helpers/publication_corpus.ts`
 * owns the per-package SOURCE TREES the source-shape gates scan; this module
 * owns the PACKAGE boundary.
 *
 * Zero-argument listers on purpose (census_derivation_tripwire): a
 * parameterized lister hands the root choice back to the caller.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** The root every daemon package lives under. The ONLY place it is named. */
const PUBLICATION_ROOT = join(REPO_ROOT, 'publication');

const TS_SOURCE = /\.(ts|tsx|mts|cts)$/;

/**
 * Every daemon package (repo-relative): a directory under publication/, at
 * depth 1 or 2, with both a package.json and a tsconfig.json. A nested project
 * inside a package (a site template) belongs to its package, not beside it.
 */
export function daemonPackages(): string[] {
	const found: string[] = [];
	const visit = (dir: string, depth: number): void => {
		if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'tsconfig.json'))) {
			found.push(relative(REPO_ROOT, dir));
			return;
		}
		if (depth === 2) return;
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
				visit(join(dir, entry.name), depth + 1);
			}
		}
	};
	visit(PUBLICATION_ROOT, 0);
	return found.sort();
}

/**
 * The TypeScript each daemon package SHIPS, keyed by package: git's view
 * (tracked, plus new files not ignored yet — a probe not committed yet counts),
 * installed dependencies and ignored scratch trees excluded, deleted files
 * dropped.
 */
export function daemonPackageSources(): Map<string, string[]> {
	const run = Bun.spawnSync(
		['git', 'ls-files', '--cached', '--others', '--exclude-standard', '--', 'publication'],
		{ cwd: REPO_ROOT, stdout: 'pipe', stderr: 'pipe' },
	);
	if (run.exitCode !== 0)
		throw new Error(`git ls-files publication failed: ${run.stderr.toString()}`);
	const files = run.stdout
		.toString()
		.split('\n')
		.filter((path) => TS_SOURCE.test(path) && !path.includes('/node_modules/'))
		.filter((path) => existsSync(join(REPO_ROOT, path)));
	const byPackage = new Map<string, string[]>();
	for (const pkg of daemonPackages()) {
		byPackage.set(pkg, files.filter((path) => path.startsWith(`${pkg}/`)).sort());
	}
	return byPackage;
}
