/**
 * PRODUCTION CORPUS — the ONE lister of "what runs in production" for the
 * packages this repository ships, behind test/unit/production_import_tripwire.
 *
 * Three derivations, all from the tree, never a hand list:
 *
 *  - `packageRoots()`: every directory holding a GIT-TRACKED `bun.lock` AND a
 *    `package.json` — the engine ('.'), the v2 publication API, the site
 *    builder and the template it scaffolds. Discovered by `git ls-files` over
 *    the whole repo, which narrows nothing (no root chosen) yet sees only the
 *    packages that SHIP: a directory walk also entered gitignored local trees
 *    (`rewrite/` — internal process, never on a clone, and no gate may read it),
 *    where a scratch package with a lockfile but no `src/` made every case throw.
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
 *  - `nonProductionFilesOf(root, roots)`: everything ELSE a package ships that
 *    Bun or Node executes — its tests wherever they live (`test/`, `tests/`,
 *    `*.test.ts` beside `src/`), its scripts and tooling — derived from the
 *    shipped-file listing (`shippableFiles()`) minus production, minus nested
 *    package roots, minus the reasoned browser/harness trees of `NON_BUN_TREES`.
 *    Until 2026-10-21 that corpus was a hand-picked `test/` + `scripts/` pair,
 *    which left three of five package roots judged over an EMPTY set.
 *
 * Registered in census_derivation_tripwire's SHARED_LISTERS (ROOTS: `src`
 * `tools`; the per-package `src`), so the root set is written down ONCE.
 */
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const REPO_ROOT = resolve(import.meta.dir, '../..');

/**
 * Dependency/VCS trees only. NOT `build` or `dist`: a source root may hold a
 * module DIRECTORY of that name — publication/site_builder/src/build/ is the
 * site builder's build step — and the name heuristic silently dropped it from
 * LEG 1 (production_import_tripwire's totality case now measures that).
 */
const IGNORED_DIRS = new Set(['node_modules', '.git']);

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

/**
 * Every git-tracked `<root>/bun.lock` with a `package.json` beside it, as
 * repo-relative roots ('.' first). Tracked, not walked: the question is which
 * packages this repository SHIPS, and an untracked or ignored lockfile is a
 * local accident (see the header). Throws when git cannot list.
 */
export function packageRoots(): string[] {
	const listing = Bun.spawnSync(['git', 'ls-files', '-z', '--', ':(glob)**/bun.lock'], {
		cwd: REPO_ROOT,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	if (listing.exitCode !== 0) {
		throw new Error(`packageRoots: git ls-files failed: ${listing.stderr.toString().trim()}`);
	}
	const roots = listing.stdout
		.toString()
		.split('\0')
		.filter((file) => file === 'bun.lock' || file.endsWith('/bun.lock'))
		.map((file) => dirname(file))
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

const SOURCE_FILE = /\.(ts|tsx|js|mjs|cjs)$/;
const NOT_PRODUCTION = /(\.test\.[tj]sx?|\.d\.ts)$/;

/** Every production source file of a package (absolute paths, sorted). */
export function productionFilesOf(root: string): string[] {
	return sourceRootsOf(root)
		.flatMap((dir) => walkFiles(dir))
		.filter((file) => SOURCE_FILE.test(file) && !NOT_PRODUCTION.test(file))
		.sort();
}

/**
 * Every file the working tree would SHIP, repo-relative and sorted: git-tracked
 * plus untracked-but-not-ignored (`git ls-files -co --exclude-standard`, run at
 * the repo root — the `.` site, no subtree chosen), minus a tracked file deleted
 * in the working tree. The same "what this repository ships" question
 * `packageRoots()` asks, so a gitignored local tree (rewrite/, .venv/, a
 * node_modules/) is never in a census, and a new file is in it before its
 * `git add`. Throws when git cannot list.
 */
export function shippableFiles(): string[] {
	const listing = Bun.spawnSync(['git', 'ls-files', '-z', '-co', '--exclude-standard'], {
		cwd: REPO_ROOT,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	if (listing.exitCode !== 0) {
		throw new Error(`shippableFiles: git ls-files failed: ${listing.stderr.toString().trim()}`);
	}
	return [...new Set(listing.stdout.toString().split('\0'))]
		.filter((file) => file !== '' && existsSync(join(REPO_ROOT, file)))
		.sort();
}

/**
 * The trees whose JS/TS is NOT executed by Bun or Node, so a bare specifier in
 * them is not resolved through any package.json — LEG 4 of
 * production_import_tripwire does not judge them. Matched against the
 * repo-relative path. Each entry must still match a shipped source file (the
 * gate reddens on a stale one), and each names WHERE its specifiers resolve.
 * Classified by EXECUTION ENVIRONMENT, never by whether today's files happen to
 * import a package: the census is everything else.
 */
export const NON_BUN_TREES: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
	{
		pattern: /^client\/dedalo\/core\//,
		reason:
			'browser modules served to the page; a bare specifier here (three, ckeditor5/src/*) resolves through the page import map or the vendored ckeditor build, never through package.json',
	},
	{
		pattern: /^client\/dedalo\/test\/client\/js\//,
		reason:
			'the browser Mocha suites, run inside headless Chrome; the Bun-executed runner beside them (client/dedalo/test/client/puppeteer_runner.js) is NOT matched and stays in the census',
	},
	{
		pattern: /^tools\/[^/]+\/js\//,
		reason:
			'tool client modules, served to the page exactly like client/dedalo/core; a bare specifier resolves through the page import map',
	},
	{
		pattern: /^tools\/[^/]+\/(?:translators|transcribers)\/browser_[^/]+\//,
		reason:
			'in-browser model workers (transformers.js / whisper) the tool client loads; the shared transcribers/lib the tool server also imports is NOT matched',
	},
	{
		pattern: /^vendor\//,
		reason:
			'vendored third-party browser builds, byte-pinned by dependency_integrity_tripwire; their internal specifiers (pdfjs-lib, @napi-rs/canvas) belong to the upstream build',
	},
	{
		pattern: /^docs\//,
		reason:
			"the manual site's browser assets, loaded by the generated docs pages in the reader's browser, never by Bun",
	},
	{
		pattern: /^\.agents\//,
		reason:
			'agent workflow scripts, run by the agent harness sandbox — not by Bun or Node, and with no package resolution',
	},
];

/**
 * Every NON-production source file of a package root (absolute, sorted): what
 * the working tree ships under `root` — outside every nested package root, which
 * is judged on its own — that is a JS/TS source, not production
 * (`productionFilesOf`) and not in a `NON_BUN_TREES` tree. DERIVED, never a
 * chosen set of directory names: a package's tests live in `test/`, `tests/`,
 * or beside `src/` as `*.test.ts`, its tooling in `scripts/`, `deploy/`,
 * `install/` or a root `vite.config.ts`, and every one of them is Bun- (or
 * Node-) executed against that package's node_modules. `roots` is
 * `packageRoots()`, passed in so one census lists it once.
 */
export function nonProductionFilesOf(root: string, roots: readonly string[]): string[] {
	const production = new Set(productionFilesOf(root));
	const nested = roots.filter(
		(other) => other !== root && (root === '.' || other.startsWith(`${root}/`)),
	);
	return shippableFiles()
		.filter(
			(file) =>
				(root === '.' || file.startsWith(`${root}/`)) &&
				!nested.some((other) => file.startsWith(`${other}/`)) &&
				SOURCE_FILE.test(file) &&
				!file.endsWith('.d.ts') &&
				!NON_BUN_TREES.some(({ pattern }) => pattern.test(file)),
		)
		.map((file) => join(REPO_ROOT, file))
		.filter((file) => !production.has(file))
		.sort();
}
