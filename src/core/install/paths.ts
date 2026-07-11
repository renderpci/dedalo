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

/** Directory holding the vendored hierarchy import files + metadata JSONs. */
export const HIERARCHY_IMPORT_DIR: string = join(projectRoot, 'install/import/hierarchy');
