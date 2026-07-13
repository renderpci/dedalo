/**
 * The ONE place the test database's name is derived — shared by the setup script
 * (scripts/test_db_setup.ts, which DROPS and rebuilds it) and the test preload
 * (test/preload/test_database.ts, which points the suite at it).
 *
 * Two copies of this rule would eventually disagree, and the failure mode is not a red
 * test: it is the setup script building one database while the suite writes to another —
 * most likely the application's.
 */

import { readEnv } from '../../src/config/env.ts';

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
