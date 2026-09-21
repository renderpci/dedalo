/**
 * PRODUCTION CORPUS — the ONE lister of "what runs in production" for the
 * packages this repository ships, behind test/unit/production_import_tripwire.
 *
 * Two derivations, both from the tree, never a hand list:
 *
 *  - `packageRoots()`: every directory holding a `bun.lock` AND a `package.json`
 *    outside node_modules — the engine ('.'), the v2 publication API, the site
 *    builder and the template it scaffolds. Walked from the repo root, which
 *    narrows nothing (census_derivation_tripwire: a lister fed REPO_ROOT chose
 *    no root).
 *
 *  - `productionFilesOf(root)`: the production SOURCE files of one package.
 *    The engine's are `src/` plus every `tools/<tool>/server/` tree — tool
 *    handlers are reached through the dispatch registry by path
 *    (src/core/tools/paths.ts), not by a statically resolvable edge from
 *    src/server.ts, which is why this is a census over the trees and not a
 *    graph walk from one file (a walk narrows silently at every computed
 *    import). Every other package is its `src/`. Test files and `.d.ts` are
 *    not production.
 *
 * Registered in census_derivation_tripwire's SHARED_LISTERS (ROOTS: `src`
 * `tools`; the per-package `src`), so the root set is written down ONCE.
 */
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

export const REPO_ROOT = resolve(import.meta.dir, '../..');

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);

/** Recursive file listing under `dir`, skipping the build/dependency trees. */
export function walkFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (IGNORED_DIRS.has(entry.name)) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) walkFiles(full, out);
		else if (entry.isFile()) out.push(full);
	}
	return out;
}

/** Every `<root>/bun.lock` outside node_modules, as repo-relative roots ('.' first). */
export function packageRoots(): string[] {
	const roots = walkFiles(REPO_ROOT)
		.filter((file) => file.endsWith('/bun.lock'))
		.map((file) => relative(REPO_ROOT, dirname(file)) || '.')
		.filter((root) => existsSync(join(REPO_ROOT, root, 'package.json')));
	return roots.sort((a, b) => (a === '.' ? -1 : b === '.' ? 1 : a.localeCompare(b)));
}

/** The production source roots of a package (absolute) — see the header. */
export function sourceRootsOf(root: string): string[] {
	if (root === '.') {
		const toolsDir = join(REPO_ROOT, 'tools');
		const toolServers = readdirSync(toolsDir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => join(toolsDir, entry.name, 'server'))
			.filter((dir) => existsSync(dir));
		return [join(REPO_ROOT, 'src'), ...toolServers];
	}
	return [join(REPO_ROOT, root, 'src')];
}

const SOURCE_FILE = /\.(ts|js|mjs|cjs)$/;
const NOT_PRODUCTION = /(\.test\.[tj]s|\.d\.ts)$/;

/** Every production source file of a package (absolute paths, sorted). */
export function productionFilesOf(root: string): string[] {
	return sourceRootsOf(root)
		.flatMap((dir) => walkFiles(dir))
		.filter((file) => SOURCE_FILE.test(file) && !NOT_PRODUCTION.test(file))
		.sort();
}
