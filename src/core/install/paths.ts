/**
 * Filesystem anchors for the install subsystem — all derived from the repo root
 * so they resolve identically under the server, the CLI, and tests regardless of
 * cwd. The seed dump and hierarchy import files are VENDORED under install/.
 */

import { join } from 'node:path';
import { privateDir, projectRoot, readEnv } from '../../config/env.ts';

/**
 * The private config directory the installer WRITES to (.env, state, sessions,
 * backups). Defaults to the real <repo>/../private, but honors the test-only
 * override DEDALO_INSTALL_PRIVATE_DIR so a gate can point config_persist /
 * check_directories at a scratch dir and never touch the live ../private/.env.
 */
export function installPrivateDir(): string {
	return readEnv('DEDALO_INSTALL_PRIVATE_DIR') ?? privateDir;
}

/** The vendored core seed dump restored into an empty DB (PHP dedalo7_install). */
export const SEED_DUMP_PATH: string = join(projectRoot, 'install/db/dedalo_install.pgsql.gz');

/**
 * The migrations the seed PREDATES and the installer must apply itself, right
 * after restoring it: the installer runs in install mode, which skips the boot
 * migration runner, yet it mints records (activateHierarchy) before any boot.
 * Today one — `0010_tm_role.sql` (the seed's `matrix_time_machine` has no
 * `tm_role`; every history reader needs it). Idempotent, so the first real
 * boot's runner re-applying it is a no-op. Remove an entry when the seed is
 * regenerated with it.
 */
export const SEED_PREDATED_MIGRATION_PATHS: readonly string[] = [
	join(projectRoot, 'install/db/migrations/0010_tm_role.sql'),
];

/** Directory holding the vendored hierarchy import files + metadata JSONs. */
export const HIERARCHY_IMPORT_DIR: string = join(projectRoot, 'install/import/hierarchy');

/**
 * The generated key census the installer drops next to the operator's `.env`.
 *
 * GENERATED from `src/config/catalog/` (`bun run config:gen`) and gated byte-for-byte by
 * `config_docs_tripwire` — so the copy an administrator finds in ../private/ can never
 * describe a key this engine does not read. It is a shipped artifact, exactly like
 * SEED_DUMP_PATH above; it is NOT rendered at install time (a render bug must not be able
 * to touch an install).
 */
export const SAMPLE_ENV_PATH: string = join(projectRoot, 'install/sample.env');
