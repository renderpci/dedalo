/**
 * Build the DEDICATED TEST DATABASE (`bun run test:db:setup`).
 *
 * WHY THIS EXISTS. `bun test` used to run against whatever database the install was
 * configured with, which made the suite depend on that install's data — and let it WRITE
 * to the app's database. Both bit us:
 *   - on a fresh install 183 of 2039 unit tests failed: ~46 files need the `numisdata`
 *     ontology (a project TLD that ships in NO install seed), others read records of the
 *     old shared dev DB;
 *   - a gate provisioning a scratch ontology node DELETED a real one (test218) on its way
 *     out of the LIVE database.
 * Tests now get their own database. The application's is not theirs to touch.
 *
 * WHAT IT BUILDS — a COMPLETE install, from files vendored in this repo, never by copying
 * a live database:
 *   1. the install seed (install/db/dedalo_install.pgsql.gz) — schema + canonical test3;
 *   2. hierarchies (install/import/hierarchy/*.copy.gz) via the installer's own
 *      installHierarchies() — the tools/tree/virtual-section gates need them;
 *   3. the registered tools, via the installer's own registerInstallTools();
 *   4. the numisdata TEST ONTOLOGY (test/fixtures/ontology/numisdata_ontology.copy.gz) —
 *      DEFINITIONS ONLY, no records. The gates needing it create their own rows at
 *      reserved-high scratch ids; they only ever lacked the ontology to resolve against.
 *      Measured: this alone takes the unit suite from 183 failures to 109.
 *
 * The ontology fixture carries NO `id` column, so ids come from the sequence and cannot
 * collide with the seed's own rows.
 *
 * ORDER MATTERS: the env is repointed at the test DB BEFORE src/config/config.ts is ever
 * imported (it freezes the connection at import), so the installer code below — which
 * resolves its connection from the config — targets the test database and nothing else.
 *
 * Re-runnable: it drops and rebuilds. It refuses to run when the test database name
 * resolves to the application's, so a fat-fingered env cannot drop your install.
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { readEnv } from '../src/config/env.ts';
import { testDatabaseName } from '../test/helpers/test_database.ts';

const REPO = join(import.meta.dir, '..');
const SEED = join(REPO, 'install', 'db', 'dedalo_install.pgsql.gz');
const HIERARCHY_DIR = join(REPO, 'install', 'import', 'hierarchy');
const ONTOLOGY = join(REPO, 'test', 'fixtures', 'ontology', 'numisdata_ontology.copy.gz');
const ONTOLOGY_COLUMNS = join(
	REPO,
	'test',
	'fixtures',
	'ontology',
	'numisdata_ontology.columns.txt',
);

const appDb = readEnv('DB_NAME') ?? readEnv('DEDALO_DATABASE_CONN') ?? '';
const testDb = testDatabaseName();

// The one guard that matters: never operate on the application's database.
if (testDb === appDb || testDb === '') {
	console.error(
		`REFUSING: the test database name (${testDb || '<empty>'}) is not distinct from the ` +
			`application database (${appDb}). This script DROPS the database it builds. Set ` +
			'DEDALO_TEST_DATABASE.',
	);
	process.exit(1);
}

// Repoint the WHOLE PROCESS before config is imported (see the header). Everything after
// this — connFromConfig(), the pool, the installer helpers — resolves to the test DB.
process.env.DB_NAME = testDb;
process.env.DEDALO_DATABASE_CONN = testDb;

const host = readEnv('DB_HOST') ?? readEnv('DEDALO_HOSTNAME_CONN') ?? 'localhost';
const portRaw = readEnv('DB_PORT') ?? readEnv('DEDALO_DB_PORT_CONN') ?? '';
const user = readEnv('DB_USER') ?? readEnv('DEDALO_USERNAME_CONN') ?? '';
const password = readEnv('DB_PASSWORD') ?? readEnv('DEDALO_PASSWORD_CONN') ?? '';

/** A unix-socket install has no port; `psql -p 0` is a hard error, so send it only if set. */
const conn = [
	'-h',
	host,
	...(portRaw !== '' && Number(portRaw) > 0 ? ['-p', portRaw] : []),
	'-U',
	user,
];
const pgEnv = { ...process.env, PGPASSWORD: password };

async function psql(database: string, args: string[]): Promise<string> {
	const proc = Bun.spawn(['psql', ...conn, '-d', database, '-v', 'ON_ERROR_STOP=1', ...args], {
		env: pgEnv,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) throw new Error(`psql (${database}) exited ${code}: ${err.trim()}`);
	return out;
}

console.log(`[test-db] rebuilding '${testDb}' (application DB '${appDb}' is never touched)`);

// 1. Recreate the database.
await psql('postgres', ['-c', `DROP DATABASE IF EXISTS "${testDb}"`]);
await psql('postgres', ['-c', `CREATE DATABASE "${testDb}"`]);

// 2. The install seed — the schema + data a real install ships with.
if (!existsSync(SEED)) throw new Error(`install seed not found: ${SEED}`);
const seedSql = join(tmpdir(), `dedalo_test_seed_${process.pid}.sql`);
writeFileSync(seedSql, gunzipSync(readFileSync(SEED)));
try {
	await psql(testDb, ['-q', '-f', seedSql]);
	console.log('[test-db] install seed restored (schema + canonical test3 playground)');
} finally {
	rmSync(seedSql, { force: true });
}

// 3. The numisdata TEST ontology — definitions only, no records.
if (!existsSync(ONTOLOGY)) throw new Error(`ontology fixture not found: ${ONTOLOGY}`);
const columns = readFileSync(ONTOLOGY_COLUMNS, 'utf8').trim();
const ontologyCopy = join(tmpdir(), `dedalo_test_numisdata_${process.pid}.copy`);
writeFileSync(ontologyCopy, gunzipSync(readFileSync(ONTOLOGY)));
try {
	await psql(testDb, ['-c', `\\copy dd_ontology (${columns}) FROM '${ontologyCopy}'`]);
	const n = (
		await psql(testDb, ['-tAc', "SELECT count(*) FROM dd_ontology WHERE tld='numisdata'"])
	).trim();
	console.log(`[test-db] numisdata test ontology loaded (${n} nodes, no records)`);
} finally {
	rmSync(ontologyCopy, { force: true });
}

// 4. Hierarchies + tools, through the INSTALLER'S OWN code paths, from repo-vendored data —
// the tools/tree/virtual-section gates need a complete install, not a bare seed.
const tlds = [...new Set(
	(await Array.fromAsync(new Bun.Glob('*1.copy.gz').scan({ cwd: HIERARCHY_DIR })))
		.map((file) => file.replace(/1\.copy\.gz$/, '')),
)].sort();
const { installHierarchies } = await import('../src/core/install/hierarchy_import.ts');
const hierarchies = await installHierarchies(tlds);
console.log(
	`[test-db] hierarchies imported: ${tlds.length} TLDs` +
		(hierarchies.result === true ? '' : ` (WITH ERRORS: ${JSON.stringify(hierarchies.errors)})`),
);

const { registerInstallTools } = await import('../src/core/install/register_tools.ts');
const tools = await registerInstallTools();
console.log(`[test-db] tools registered (result: ${tools.result})`);

console.log(`[test-db] ready — 'bun test' now uses '${testDb}' automatically.`);
process.exit(0);
