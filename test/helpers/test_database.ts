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

/**
 * The CLUSTER-LEVEL half of `test:db:setup` step 5b (the `dedalo_test_ro`
 * read-only role) — the one statement set in the build that touches an object
 * SHARED BY EVERY SUITE DATABASE ON THE CLUSTER, and therefore the one step two
 * concurrent builds can collide on.
 *
 * THE COLLISION (measured 2026-09-30, lane provisioning for the closure plan).
 * Building `…_test_l2`, `…_l3` and `…_l4` at the same time, one build died at
 * the very end with `ERROR: tuple concurrently updated`: `ALTER ROLE` rewrites
 * the role's single `pg_authid` tuple, and Postgres takes no heavyweight lock
 * that would make a second writer wait — it fails it. Measured bare: 8
 * concurrent `ALTER ROLE dedalo_test_ro …` × 5 rounds = 31 of 40 failed. The
 * `IF NOT EXISTS … CREATE ROLE` above it has the same shape (two builds both
 * see "absent", the second CREATE fails `duplicate_object`).
 *
 * THE FIX IS SERIALIZATION, NOT RETRY. The whole step runs in ONE transaction
 * that first takes a transaction-scoped advisory lock. Every caller connects to
 * the `postgres` maintenance database, and an advisory lock's key space is
 * per-database, so all concurrent builds contend on the same key and run the
 * step one after another; the lock releases at COMMIT/ROLLBACK, so a crashed
 * build cannot leave it held. Same 8 × 5 with the lock: 0 failed.
 *
 * Lives HERE (not inline in the script) so a gate can execute the EXACT text
 * the build executes — test/unit/test_db_marker_tripwire.test.ts rule 8 runs
 * it concurrently and requires every run to succeed. Pure string builder: no
 * import, no connection (this module's header explains why that matters).
 */
export const READ_ONLY_ROLE_LOCK_KEY = 7_240_011;

export function readOnlyRoleClusterSql(testDb: string): string {
	// Interpolated as a quoted identifier: refuse, never escape (same grammar as
	// scripts/test_db_setup.ts's own name guard).
	if (!/^[A-Za-z0-9_.-]+$/.test(testDb)) {
		throw new Error(
			`readOnlyRoleClusterSql: database name '${testDb}' contains characters outside [A-Za-z0-9_.-]; refusing to interpolate it.`,
		);
	}
	return `BEGIN;
SELECT pg_advisory_xact_lock(${READ_ONLY_ROLE_LOCK_KEY});
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dedalo_test_ro') THEN
    CREATE ROLE dedalo_test_ro;
  END IF;
END $$;
ALTER ROLE dedalo_test_ro LOGIN PASSWORD 'dedalo_test_ro';
GRANT CONNECT ON DATABASE "${testDb}" TO dedalo_test_ro;
COMMIT;
`;
}
