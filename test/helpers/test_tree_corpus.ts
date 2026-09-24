/**
 * THE TEST TREE'S CORPUS — the one lister of `test/**\/*.ts`, so a gate that
 * censuses the suite's own sources imports its root instead of choosing one
 * in-file.
 *
 * `census_derivation_tripwire` registers this module in SHARED_LISTERS (root
 * `test`). Every TypeScript source under test/ — gates, helpers, preloads —
 * because a rule about what TEST code may do (e.g. "a gate that names a
 * diffusion scratch table builds it") holds for a helper as much as a gate.
 * JSON fixtures are data, not code, and are out.
 */

import { join } from 'node:path';
import { Glob } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** Root of the test tree, repo-relative. */
export const TEST_TREE_ROOT = 'test';

/** Every `.ts` under test/, as sorted repo-relative paths (`test/…`). */
export function testTreeSourceFiles(): string[] {
	return [...new Glob('**/*.ts').scanSync({ cwd: join(REPO_ROOT, TEST_TREE_ROOT) })]
		.map((p) => `${TEST_TREE_ROOT}/${p}`)
		.sort();
}
