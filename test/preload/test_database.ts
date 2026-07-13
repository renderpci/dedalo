/**
 * bun test preload — point the WHOLE SUITE at the dedicated test database.
 *
 * This must be the FIRST preload (bunfig.toml): it rewrites process.env BEFORE any test
 * module imports src/config/config.ts, which freezes the connection at import. The seam is
 * the same one session_db.ts already uses for the session store, the ts_state file and the
 * diffusion job tables — this one just covers the biggest shared surface of all, the DB.
 *
 * WHY. Running the suite against the application's database made the tests depend on that
 * install's data (183 of 2039 unit tests failed on a fresh install, because ~46 files need
 * the `numisdata` ontology that ships in no seed) and let them WRITE to it — a gate once
 * provisioned a scratch ontology node and DELETED a real one (test218) on its way out.
 * Tests get their own database; the app's is not theirs to touch.
 *
 * FAIL LOUD, NOT SILENT. If the test DB does not exist, the DB-backed gates fail with
 * connection errors that look like an engine bug. So we PROBE it here and, when it is
 * missing, say exactly what to run — and fall back to the configured DB, preserving the old
 * behaviour rather than bricking a working checkout. The hermetic CI tier has no Postgres at
 * all: the probe fails there too, warns, and the DB-less tripwires run exactly as before.
 *
 * Opt out with DEDALO_TEST_DB_DISABLE=true (runs against the configured DB, as before).
 */

import { testDatabaseName } from '../helpers/test_database.ts';

export {};

if (process.env.DEDALO_TEST_DB_DISABLE !== 'true') {
	const testDb = testDatabaseName();
	const appDb = process.env.DB_NAME ?? process.env.DEDALO_DATABASE_CONN;

	// Never let the "test" DB resolve to the app DB — that is the whole point of the file.
	if (testDb === appDb) {
		console.warn(
			`[test-preload] DEDALO_TEST_DATABASE resolves to the APPLICATION database (${testDb}). ` +
				'Refusing to redirect: the suite would write to your app. Set DEDALO_TEST_DATABASE.',
		);
	} else {
		const exists = await databaseExists(testDb);
		if (exists) {
			// DB_NAME is the key config reads (its alias is DEDALO_DATABASE_CONN); set BOTH so
			// no lookup path can resolve back to the application database.
			process.env.DB_NAME = testDb;
			process.env.DEDALO_DATABASE_CONN = testDb;
			console.log(`[test-preload] suite database: ${testDb} (the app DB is untouched)`);
		} else {
			console.warn(
				`[test-preload] the test database '${testDb}' does not exist — falling back to the ` +
					'CONFIGURED database, so these tests read (and write) your application data, and ' +
					'the gates needing the numisdata test ontology will fail. Build it with:\n' +
					'    bun run test:db:setup',
			);
		}
	}
}

/** Cheap existence probe. Any failure (no Postgres at all — the hermetic tier) ⇒ false. */
async function databaseExists(name: string): Promise<boolean> {
	try {
		const { SQL } = await import('bun');
		const admin = new SQL({
			hostname: process.env.DEDALO_HOSTNAME_CONN ?? 'localhost',
			port: Number(process.env.DEDALO_DB_PORT_CONN ?? 5432),
			username: process.env.DEDALO_USERNAME_CONN,
			password: process.env.DEDALO_PASSWORD_CONN,
			database: 'postgres',
			max: 1,
		});
		const rows = await admin`SELECT 1 FROM pg_database WHERE datname = ${name}`;
		await admin.end();
		return rows.length > 0;
	} catch {
		return false;
	}
}
