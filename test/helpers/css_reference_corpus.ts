/**
 * WHERE A STYLESHEET CAN BE NAMED FROM — the reference trees, in ONE place, and
 * the listing they narrow.
 *
 * `css_corpus_tripwire` proves every served stylesheet is reachable: it looks
 * for the sheet's basename in the tracked text that could load it. That text
 * does not live where the sheets live — a `.less` is under client/ or tools/
 * (the build's own `SEARCH_DIRS`), while the code that names it also sits in
 * src/ (the server templates), install/ and deploy/.
 *
 * The union was spelled inside the gate, which made the gate choose its own
 * corpus roots — the thing `census_derivation_tripwire` refuses: a root set
 * written into one gate is a root set no other gate can be held to. So the
 * listing AND its narrowing live here, registered in that gate's
 * SHARED_LISTERS with the roots they name.
 *
 * Tracked, not on-disk: the question is about COMMITTED bytes, because a deploy
 * is a checkout (.gitattributes) and untracked build output ships nowhere.
 *
 * Consumers: test/unit/css_corpus_tripwire.test.ts.
 */

import { join } from 'node:path';
import { SEARCH_DIRS } from '../../scripts/build_css.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/**
 * Tracked text the client could name a stylesheet from: the two browser trees
 * the build already derives, plus the three server-side trees that emit or
 * install markup.
 */
export const CSS_REFERENCE_TREES: readonly string[] = [...SEARCH_DIRS, 'src', 'install', 'deploy'];

/** True when `file` lies inside one of the given repo-relative trees. */
export const underTrees = (file: string, trees: readonly string[]): boolean =>
	trees.some((tree) => file.startsWith(`${tree}/`));

/** Every tracked path in the repo — ONE listing, narrowed by its callers. */
export function trackedRepoFiles(): string[] {
	const run = Bun.spawnSync(['git', 'ls-files'], {
		cwd: REPO_ROOT,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	if (run.exitCode !== 0) {
		throw new Error(`css_reference_corpus: git ls-files failed: ${run.stderr.toString()}`);
	}
	return run.stdout
		.toString()
		.split('\n')
		.filter((line) => line.trim() !== '')
		.sort();
}

/**
 * The reference corpus: every tracked file whose text could name a stylesheet.
 * `.css` itself is excluded — a sheet mentioning its own name proves nothing
 * about who loads it.
 */
export const cssReferenceFiles = (trackedFiles: readonly string[]): string[] =>
	trackedFiles
		.filter((file) => /\.(js|mjs|cjs|ts|html|php|json)$/.test(file))
		.filter((file) => underTrees(file, CSS_REFERENCE_TREES));
