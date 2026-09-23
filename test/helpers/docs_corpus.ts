/**
 * THE MANUAL'S CORPUS — the one lister of `docs/**\/*.md`, so a gate that
 * censuses the manual imports its root instead of choosing one in-file.
 *
 * `census_derivation_tripwire` registers this module in SHARED_LISTERS (root
 * `docs`) and refuses a new gate that walks the tree with a private glob — the
 * subset-root defect class (GATE-30/31/34/35: a gate green over the wrong
 * directory) has exactly one cure, a root written down in one reviewable
 * place. Symlinks are followed and dot-files included so a page reached only
 * through an alias is still a page.
 */

import { join } from 'node:path';
import { Glob } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** Root of the manual, repo-relative. */
export const DOCS_ROOT = 'docs';

/** Every markdown page of the manual, as sorted repo-relative paths (`docs/…`). */
export function docsPages(): string[] {
	const glob = new Glob('**/*.md');
	return [...glob.scanSync({ cwd: join(REPO_ROOT, DOCS_ROOT), followSymlinks: true, dot: true })]
		.map((p) => `${DOCS_ROOT}/${p}`)
		.sort();
}

/**
 * Every FILE of the manual tree (not only pages): the gate that asks which of
 * them git ignores needs the whole listing, and asking it here keeps the root
 * in the one reviewable place this module exists to be.
 */
export function docsFiles(): string[] {
	const glob = new Glob('**/*');
	return [...glob.scanSync({ cwd: join(REPO_ROOT, DOCS_ROOT), onlyFiles: true })]
		.map((p) => `${DOCS_ROOT}/${p}`)
		.sort();
}
