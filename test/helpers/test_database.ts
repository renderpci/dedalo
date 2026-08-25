/**
 * The ONE place the test database's name is derived — shared by the setup script
 * (scripts/test_db_setup.ts, which DROPS and rebuilds it) and the test preload
 * (test/preload/test_database.ts, which points the suite at it).
 *
 * Two copies of this rule would eventually disagree, and the failure mode is not a red
 * test: it is the setup script building one database while the suite writes to another —
 * most likely the application's.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnvFile, privateDir, readEnv } from '../../src/config/env.ts';

/**
 * THE OTHER HALF OF THE RULE LIVES IN `src/`, DELIBERATELY. This file only
 * DERIVES a NAME, and a name is a convention: point `DEDALO_TEST_DATABASE` at a
 * colleague's install or a production restore and the name is "right" while the
 * database is real. The mechanical guarantee is
 * `assertTestDatabase()` in `src/core/test_data/test_database_marker.ts` —
 * it asks the DATABASE what it is (the `dedalo_test_marker` row), and every
 * test-data writer calls it first.
 *
 * It is NOT re-exported from here on purpose: this module is loaded by
 * `test/preload/test_database.ts` and by `scripts/test_db_setup.ts` BEFORE the
 * env is repointed, and a re-export would eagerly pull in
 * `src/core/db/postgres.ts` — which freezes the connection at import, at the
 * app database. Import the guard straight from its own module.
 */

/**
 * Explicit DEDALO_TEST_DATABASE wins; otherwise `<app db>_test`.
 *
 * The suffix convention keeps the name obviously derived and obviously NOT the app DB, so
 * a human reading `dedalo7_ts_test` in a psql prompt knows immediately what they are in.
 */
export function testDatabaseName(): string {
	const explicit = readEnv('DEDALO_TEST_DATABASE');
	if (explicit !== undefined && explicit !== '') return explicit;
	const appDb = readEnv('DB_NAME') ?? readEnv('DEDALO_DATABASE_CONN');
	return appDb === undefined || appDb === '' ? 'dedalo_ts_test' : `${appDb}_test`;
}

/**
 * The APPLICATION database's name — resolved from `../private/.env` ONLY,
 * NEVER through `readEnv('DB_NAME')`, and that restriction is the whole point
 * of this function existing.
 *
 * THE PRECEDENCE TRAP. `readEnv` gives `process.env` precedence over the
 * private file (src/config/env.ts), and `test/preload/test_database.ts`
 * REWRITES `process.env.DB_NAME` to the SUITE database before any test runs.
 * So inside a `bun test` process, `readEnv('DB_NAME')` already answers the
 * suite database — a guard that asks it "which one is the application's?"
 * gets the suite's own name back and compares a database against itself.
 * That is exactly how `resolveSuiteDatabase()`'s distinctness refusal ran
 * VACUOUS for months: it compared `<base>_test_test` against `<base>_test`,
 * neither of which is the application database, and could never fire on the
 * one collision it exists to catch (measured 2026-08-25; and with
 * `DEDALO_TEST_DATABASE` set explicitly the same trap FALSE-fires, because
 * both sides then resolve to the identical explicit value).
 *
 * The application database is a property of the INSTALLATION, not of this
 * process's mutated environment, so this reads the private file directly with
 * the same parser `readEnv` itself uses (`parseEnvFile`) and honors the same
 * key pair (`DB_NAME`, PHP-alias `DEDALO_DATABASE_CONN`) — but never the
 * process env. It deliberately does NOT import `src/core/db/postgres.ts`
 * (connection freezes at import — see the header above), and it does not use
 * `envSnapshot()` either, for the same precedence reason.
 *
 * WHAT THIS DOES NOT PROVE: a process env-only deployment (CI/systemd with no
 * private file) resolves to `undefined` here. That is honest — such a process
 * HAS no installation database on disk to protect — and the caller must treat
 * `undefined` as "no application database known", never as "".
 */
export function applicationDatabaseName(): string | undefined {
	const envFilePath = join(privateDir, '.env');
	if (!existsSync(envFilePath)) return undefined;
	const fileValues = parseEnvFile(readFileSync(envFilePath, 'utf-8'));
	const name = fileValues.DB_NAME ?? fileValues.DEDALO_DATABASE_CONN;
	return name === undefined || name === '' ? undefined : name;
}
