/**
 * THE BOOT MIGRATIONS CORPUS — the one lister that owns `install/db/migrations`.
 *
 * A gate asserting that a schema/function change actually REACHES an existing
 * installation has to read the numbered migrations; census_derivation_tripwire
 * refuses each such gate naming the directory itself, so it is named here and
 * nowhere else. Zero-argument on purpose: a parameterized lister hands the root
 * choice back to the caller, which is the thing the rule is about.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** The migrations root. The ONLY place it is named. */
export const MIGRATIONS_DIR = join(REPO_ROOT, 'install/db/migrations');

/** Every numbered migration file name, sorted (their order IS the apply order). */
export function migrationFileNames(): string[] {
	return readdirSync(MIGRATIONS_DIR)
		.filter((name) => name.endsWith('.sql'))
		.sort();
}

/** Every migration's SQL, joined — what a boot applies, read as one text. */
export function migrationsSql(): string {
	return migrationFileNames()
		.map((name) => readFileSync(join(MIGRATIONS_DIR, name), 'utf8'))
		.join('\n');
}
