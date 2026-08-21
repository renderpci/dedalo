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
 *   4. the generic `test` TLD ontology, materialized from
 *      src/core/test_data/test_tld_ontology.json through the engine's doors
 *      (records → rebuildOntology), so the suite runs on the REVIEWABLE source
 *      and not on whatever the binary seed happens to hold;
 *   5. the numisdata TEST ONTOLOGY (test/fixtures/ontology/numisdata_ontology.copy.gz) —
 *      DEFINITIONS ONLY, no records. The gates needing it create their own rows at
 *      reserved-high scratch ids; they only ever lacked the ontology to resolve against.
 *      Measured: this alone takes the unit suite from 183 failures to 109.
 *
 * DEFINITIONS, NOT RECORDS. Every step above installs ONTOLOGY (and the tool
 * registry an install cannot boot without). No fixture RECORDS are seeded here
 * beyond the seed's own — in particular NOT the derived test corpus
 * (src/core/test_data/test_corpus/): that is a situation, and ambient records
 * change the answer for every census, emptiness and row-count gate in the
 * suite. A gate that needs the corpus ensures and drops it itself; see step 6
 * at the bottom of this file.
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
 *
 * AND IT STAMPS THE DATABASE. Right after CREATE DATABASE + seed restore it
 * writes the `dedalo_test_marker` row (step 2b, src/core/test_data/test_database_marker.ts).
 * That row — not this script's name check, and not the `_test` suffix — is what
 * every test-data writer in the tree asks before it moves a single row. This is
 * the ONLY producer of that row anywhere.
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { readEnv } from '../src/config/env.ts';
import { testDatabaseName } from '../test/helpers/test_database.ts';
import { rebuildTestMediaRoot } from '../test/helpers/test_media_root.ts';

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
//
// LEDGER — coverage plan §4.4 D13 + D12, KNOWN-OPEN AND UNGATED.
//  - D13: this guard is ONLY name-equality with THIS checkout's DB_NAME. Point
//    `DEDALO_TEST_DATABASE` at any OTHER real database on the same host — a
//    second checkout's install, a colleague's, a production restore — and the
//    script passes the guard and DROPS it. What it needs: refuse unless the
//    target is ABSENT, was CREATED BY THIS SCRIPT (a provenance marker row), or
//    `--force` is given.
//  - D12: the database this builds does not stay clean. Measured 2026-08-10 on
//    `dedalo_mib_v7_test`: `matrix_time_machine` 3,385 of 7,708 rows at
//    section_id >= 900000, `matrix_test` carrying 902006, `matrix_stats` 2 rows
//    both leaked, `matrix_users` id 0 a leaked password-reset user (D11). Gates
//    sweep `matrix_*` and forget `matrix_time_machine`, or sweep with a filter
//    that never matched what they wrote. A rebuild clears it; nothing PREVENTS
//    it, and no gate reports it.
if (testDb === appDb || testDb === '') {
	console.error(
		`REFUSING: the test database name (${testDb || '<empty>'}) is not distinct from the application database (${appDb}). This script DROPS the database it builds. Set DEDALO_TEST_DATABASE.`,
	);
	process.exit(1);
}

// Repoint the WHOLE PROCESS before config is imported (see the header). Everything after
// this — connFromConfig(), the pool, the installer helpers — resolves to the test DB.
process.env.DB_NAME = testDb;
process.env.DEDALO_DATABASE_CONN = testDb;

// AND THE MEDIA ROOT, in the same breath and for the same reason. The database is
// not the only surface the suite shared with the installation: `MEDIA_PATH` was,
// so a client-suite upload, an `ensureMediaKit` and every derivative a gate built
// landed in the install's media tree. `DEDALO_TEST_MEDIA_ROOT` repoints the root
// AND arms the `.dedalo_test_media` guard (src/core/media/test_media_root.ts) —
// one key, so a run cannot be armed at the wrong root or repointed with the guard
// asleep. The tree is SWEPT and rebuilt here, beside the database it belongs to:
// the two are ONE fixture (files_info rows name files in it) — which is why the
// SUITE DATABASE NAME is passed EXPLICITLY: the tree is keyed by it, and the
// derivation (`<DB_NAME>_test`) has just been invalidated by the repoint above.
const mediaRoot = rebuildTestMediaRoot(testDb);
process.env.DEDALO_TEST_MEDIA_ROOT = mediaRoot;
console.log(
	`[test-db] test media root rebuilt: ${mediaRoot} (marked '.dedalo_test_media'; the installation's media tree is never touched)`,
);

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

// 2b. THE TEST-DATABASE MARKER — the mechanical half of "tests never write
// production data" (src/core/test_data/test_database_marker.ts).
//
// It is written HERE, on a database this script has just DROPPED and CREATED,
// and nowhere else in the tree: that provenance is what the row means. Every
// step below this line, and every test-data writer in the suite, REFUSES on a
// database that does not carry it — the name guard above is a claim about a
// database, this row is the database itself saying it is disposable.
//
// It carries the provenance a stale test DB is diagnosed by: when it was
// built, from which checkout, from which seed, and from which `test` TLD
// ontology.
const { writeTestDatabaseMarker } = await import('../src/core/test_data/test_database_marker.ts');
const gitRev = await (async (): Promise<string> => {
	const proc = Bun.spawn(['git', '-C', REPO, 'rev-parse', 'HEAD'], {
		stdout: 'pipe',
		stderr: 'ignore',
	});
	const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
	return code === 0 ? out.trim() : 'unknown';
})();
const sha256 = (path: string): string =>
	new Bun.CryptoHasher('sha256').update(readFileSync(path)).digest('hex');
const marker = await writeTestDatabaseMarker({
	build_stamp: new Date().toISOString(),
	git_rev: gitRev,
	seed_sha256: sha256(SEED),
	ontology_sha256: sha256(join(REPO, 'src', 'core', 'test_data', 'test_tld_ontology.json')),
});
console.log(
	`[test-db] marker written: ${marker.database_name} @ ${marker.build_stamp} (git ${marker.git_rev.slice(0, 12)}) — every test-data writer refuses without it`,
);

// 3. The generic `test` TLD ontology, from its ONE source
// (src/core/test_data/test_tld_ontology.json) through the engine's own doors:
// matrix_ontology `test0` records, then rebuildOntology('test') derives
// dd_ontology. The seed still carries its own copy of those rows today; this
// OVERWRITES them from the reviewable JSON, so the suite database matches the
// file a human reviews. Once scripts/strip_test_tld_from_seed.ts is applied the
// seed carries only the bootstrap rows and this step is the sole source.
const { materializeTestTldOntology } = await import(
	'../src/core/test_data/test_tld_materialize.ts'
);
const testTld = await materializeTestTldOntology({ expectDatabase: testDb });
console.log(
	`[test-db] test TLD ontology materialized from JSON: ${testTld.nodes} records in ${testTld.tlds.join(', ')} — ${testTld.rebuilt.join('; ')}${testTld.strays.length > 0 ? ` (STRAY records not in the JSON: ${testTld.strays.join(', ')})` : ''}`,
);

// 4. The numisdata TEST ontology — definitions only, no records.
//
// PHASE 5/6 DELETES THIS STEP (generic-`test`-TLD migration): every gate that
// needs this structure gets a `test` clone of it instead, and the fixture
// test/fixtures/ontology/numisdata_ontology.copy.gz goes with it. Kept until
// the parity/unit sweeps have moved off the numisdata tipos.
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

// 5. Hierarchies + tools, through the INSTALLER'S OWN code paths, from repo-vendored data —
// the tools/tree/virtual-section gates need a complete install, not a bare seed.
const tlds = [
	...new Set(
		(await Array.fromAsync(new Bun.Glob('*1.copy.gz').scan({ cwd: HIERARCHY_DIR }))).map((file) =>
			file.replace(/1\.copy\.gz$/, ''),
		),
	),
].sort();
const { installHierarchies } = await import('../src/core/install/hierarchy_import.ts');
const hierarchies = await installHierarchies(tlds);
console.log(
	`[test-db] hierarchies imported: ${tlds.length} TLDs${hierarchies.ok === true ? '' : ` (WITH ERRORS: ${JSON.stringify(hierarchies.errors)})`}`,
);

const { registerInstallTools } = await import('../src/core/install/register_tools.ts');
const tools = await registerInstallTools();
console.log(`[test-db] tools registered (ok: ${tools.ok})`);

// 6. THE TEST CORPUS IS **NOT** SEEDED HERE — and that is the design, not an
// omission. The corpus (src/core/test_data/test_corpus/, 446 records over 36
// sections) is a SITUATION, and this database is the empty stage every gate
// builds its situation on: ambient rows are not free, because a census gate, a
// scratch-surface emptiness check and a "count the rows this save appended"
// assertion all read whatever the database holds. So a gate that needs the
// corpus calls `ensureTestCorpus(scope)` in its own `beforeAll` and
// `dropTestCorpus(scope)` in `afterAll` (test/unit/test_corpus_fixture.test.ts
// is the reference; test/helpers/zzd_diffusion_fixture.ts is the same pattern
// for the diffusion ontology). The ONTOLOGY above is the opposite case and does
// belong here: definitions cost nothing to have present, records do.
//
// To materialize it by hand for a debugging session:
//   bun -e "await (await import('./src/core/test_data/test_corpus/ensure.ts')).ensureTestCorpus()"

console.log(`[test-db] ready — 'bun test' now uses '${testDb}' and '${mediaRoot}' automatically.`);
process.exit(0);
