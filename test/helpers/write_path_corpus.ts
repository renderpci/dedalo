/**
 * THE write-path census corpus — one lister, shared by every gate that claims
 * a TOTAL census over "the code that can write the shared database":
 * `sql_confinement_tripwire` (T1/T3/T4), `ws_a_tripwires` (jsonb binds, the
 * locator law), `matrix_counter_monotonic_tripwire` (counter DML) and the
 * `section_record` write-chokepoint grep gate.
 *
 * WHY ONE COPY. Each of those gates carried its own `['src', 'tools']` walk, and
 * the 2026-08-26 audit found what a per-gate root list does over time: ONE gate
 * had been widened to `scripts/` (the counter gate, because a script is exactly
 * where a "fix counter" one-off lives) and the other three had not — so a
 * script that mass-rewrites matrix jsonb (`scripts/migrate_section_id_locators.ts`)
 * sat outside the jsonb-bind law, the locator law and the SQL tiers at once.
 * A root list that exists in one place cannot drift between gates; the
 * `census_derivation_tripwire` asserts that the four gates import THIS module
 * and that `scripts/` is in the corpus.
 *
 * WHAT IS IN. Every non-test `.ts` file under `src/`, `tools/` and `scripts/`
 * (`scripts/ci/`, `scripts/lib/` included). `test/` is not the engine and is
 * not in; a `.test.ts` anywhere is a gate, not a writer.
 */

import { join, relative } from 'node:path';
import { Glob } from 'bun';

export const REPO_ROOT = join(import.meta.dir, '..', '..');

/** The roots of the write-path census. Widening is a change to THIS line. */
export const WRITE_PATH_ROOTS = ['src', 'tools', 'scripts'] as const;

/**
 * Anti-vacuity floor for the corpus (780 files on 2026-09-02). A walk that
 * returns fewer than this is a broken walk, not a smaller engine.
 */
export const WRITE_PATH_CORPUS_FLOOR = 700;

/** All non-test TS source files under the write-path roots, repo-relative, sorted. */
export function writePathSourceFiles(): string[] {
	const files: string[] = [];
	for (const dir of WRITE_PATH_ROOTS) {
		const glob = new Glob('**/*.ts');
		for (const match of glob.scanSync({ cwd: join(REPO_ROOT, dir) })) {
			if (match.endsWith('.test.ts')) continue;
			files.push(relative(REPO_ROOT, join(REPO_ROOT, dir, match)));
		}
	}
	return files.sort();
}
