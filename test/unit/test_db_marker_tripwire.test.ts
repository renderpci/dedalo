/**
 * THE TEST-DATABASE MARKER TRIPWIRE — "a test never writes production data" is
 * MECHANICAL, not a convention (AGENTS.md hard rules, 2026-08-19).
 *
 * Dédalo runs in production with irreplaceable heritage data, and the suite
 * must be runnable at any moment. Until this gate the guarantee rested on a
 * NAME (`<app db>_test`, test/helpers/test_database.ts) plus each door
 * remembering to check something. A name is a claim ABOUT a database — point
 * `DEDALO_TEST_DATABASE` at a colleague's install, a second checkout or a
 * production restore and the name is "right" while the database is real.
 * `src/core/test_data/test_database_marker.ts` replaces that with the database
 * ITSELF declaring what it is (the `dedalo_test_marker` row), and every
 * test-data writer asking it first.
 *
 * SIX RULES, and every one of them has an anti-vacuity probe:
 *
 *  1. THE INVENTORY (source scan). Every file under `src/core/test_data/**` and
 *     `test/helpers/**` that HAS A WRITE SEAM must call `assertTestDatabase(`,
 *     or carry a named reason in `EXEMPT_WRITERS`. The list is DERIVED from the
 *     sources, so a NEW writer that forgets the guard is red the day it lands —
 *     which is the whole point: an enumerated list would rot into a convention
 *     again.
 *  2. EVERY DOOR REFUSES on a marker-less database. Proved for real, on the
 *     real doors: inside ONE transaction the marker row is DELETED, the marker
 *     cache cleared, every door called, and the transaction ROLLED BACK. The
 *     doors see a database with no marker on their own connection; the suite
 *     database never loses its row (dropping it mid-suite would poison every
 *     file that runs after this one).
 *  3. THE MARKER'S SHAPE on the suite database: the purpose sentence verbatim,
 *     the database it names, sha256-shaped provenance, and the DB-level
 *     constraints (one row only, purpose pinned) that make it impossible to
 *     create by accident.
 *  4. THE INSTALLER IS THE ONLY BYPASS. `allowAnyDatabase` appears in exactly
 *     two files — the door that defines it and `src/core/install/db_restore.ts`,
 *     which materializes the `test` TLD ONTOLOGY (definitions, no records) on a
 *     fresh real install. Asserted as source AND exercised behaviourally: the
 *     installer's call shape succeeds with no marker present.
 *  5. ONE PRODUCER. `writeTestDatabaseMarker` is called from
 *     `scripts/test_db_setup.ts` and nowhere else, and no install seed,
 *     migration or engine module so much as names the table.
 *  6. THE CLIENT RUN IS INSIDE THE LAW TOO (2026-08-19). `bun run test:client`
 *     drives a LIVE SERVER, so its writes never pass this process's guard — the
 *     hole the dmm fixture's exemption used to name. Closed by making the run
 *     OWN its server on the suite database (scripts/client_test_server.ts) and
 *     VERIFY it over the wire (`/health` answers the marker's FINGERPRINT, dev
 *     mode only, never the database name). Asserted as source (the runner has no
 *     unverified path to a target) and behaviourally (the probe refuses a server
 *     with no fingerprint and one with the wrong fingerprint, and accepts the
 *     right one — against real stub servers).
 *
 * HONEST LIMITS. The inventory is a REGEX classifier over stripped sources: it
 * sees DML text and the named write doors, not a write reached through an
 * arbitrary dynamic indirection. It covers the two directories test data lives
 * in — a writer someone puts in a third place is outside it, exactly as the
 * corpus of every source-scan gate in this tree is.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Glob } from 'bun';
import {
	assertServedDatabase,
	probeServedDatabase,
	resolveSuiteDatabase,
} from '../../scripts/client_test_server.ts';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';
import { DedaloError } from '../../src/core/errors/index.ts';
import {
	assertTestDatabase,
	clearTestDatabaseMarkerCache,
	currentDatabaseName,
	readTestDatabaseMarker,
	TEST_MARKER_PURPOSE,
	TEST_MARKER_TABLE,
	testDatabaseFingerprint,
} from '../../src/core/test_data/test_database_marker.ts';
import { materializeTestTldOntology } from '../../src/core/test_data/test_tld_materialize.ts';
import { stripComments } from '../helpers/strip_comments.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const read = (file: string): string => readFileSync(join(REPO_ROOT, file), 'utf-8');

// ---------------------------------------------------------------------------
// RULE 1 — the writer inventory, derived from the sources.
// ---------------------------------------------------------------------------

/** The two directories test data is written from. */
const WRITER_ROOTS = ['src/core/test_data', 'test/helpers'] as const;

/**
 * A write seam: raw DML, the unparameterised escape hatch used for DML, the
 * named matrix/ontology write doors, and the filesystem writes the media kit
 * makes. Same spirit as `test/helpers/no_write_scan.ts` (which asks the
 * opposite question of the identify subsystem), narrowed to actual mutation.
 */
const WRITE_SEAMS: readonly RegExp[] = [
	/\bINSERT\s+INTO\b/i,
	/\bUPDATE\s+"?[a-z_]+"?\s+SET\b/i,
	/\bDELETE\s+FROM\b/i,
	/\bTRUNCATE\b/i,
	/\bCREATE\s+TABLE\b/i,
	/\b(?:insert|update|delete)MatrixRecord\w*\s*\(/,
	/\bupsertDdOntologyNode\s*\(/,
	/\bdeleteTldNodes\s*\(/,
	/\b(?:writeFileSync|copyFileSync|mkdirSync|rmSync)\s*\(/,
];

/**
 * Files with a write seam that do NOT call the guard, each with the reason it
 * is not part of the marker law. STALENESS IS FAILURE: an entry that is no
 * longer a writer (or no longer exists) is red, so a dead exemption cannot
 * quietly widen the hole.
 */
const EXEMPT_WRITERS: Readonly<Record<string, string>> = {
	'src/core/test_data/test_database_marker.ts':
		'THE GUARD ITSELF — it is the only writer of the marker row, and a guard that guarded itself could never be written the first time.',
	'test/helpers/test_media_root.ts':
		'WRITES NO DATA — it creates the suite MEDIA root and plants its `.dedalo_test_media` marker. It is the filesystem twin of this file and holds no database connection at all (importing config.ts there would freeze the connection before the preload repoints it); its own guard is test/unit/test_media_root_tripwire.test.ts.',
	'test/helpers/media_scratch_root.ts':
		"WRITES NO DATA — it plants the `.dedalo_test_media` marker in a gate's scratch directory so the media doors will write there. Filesystem only, no database.",
	'src/core/test_data/seed.ts':
		'NOT A TEST-ONLY WRITER: `resetTestSection`/`restoreCanonicalTest3` write the test3 PLAYGROUND records that every install seed ships, and they are called by the INSTALLER (src/core/install/db_restore.ts) and by the maintenance area widget (area_maintenance/widgets/unit_test.ts) — both on a real database, by design.',
};

/** Every `.ts` under the writer roots (tests excluded), repo-relative. */
function writerRootFiles(): string[] {
	const files: string[] = [];
	for (const root of WRITER_ROOTS) {
		for (const match of new Glob('**/*.ts').scanSync({ cwd: join(REPO_ROOT, root) })) {
			if (match.endsWith('.test.ts')) continue;
			files.push(relative(REPO_ROOT, join(REPO_ROOT, root, match)));
		}
	}
	return files.sort();
}

/** Does this source MUTATE anything? Comments are prose ABOUT the rule. */
function hasWriteSeam(source: string): boolean {
	const code = stripComments(source);
	return WRITE_SEAMS.some((pattern) => pattern.test(code));
}

const writerFiles = writerRootFiles().filter((file) => hasWriteSeam(read(file)));

describe('rule 1 — every test-data writer asks the marker', () => {
	test('the scan finds the writers it is meant to see (anti-vacuity)', () => {
		// A floor, plus the load-bearing files BY NAME: a classifier that
		// silently stopped matching would otherwise leave this gate green over
		// an unguarded tree.
		expect(writerFiles.length).toBeGreaterThanOrEqual(8);
		for (const pinned of [
			'src/core/test_data/test_tld_materialize.ts',
			'src/core/test_data/test_corpus/ensure.ts',
			'src/core/test_data/situations/situation.ts',
			'test/helpers/test_data.ts',
			'test/helpers/acl_identity_fixture.ts',
			// `observer_term_seed.ts` was pinned here until 2026-08-20, when it
			// stopped writing directly and became a composition over
			// situations/situation.ts (pinned above). A file that writes nothing
			// cannot "ask the marker", and pinning it would force a redundant call.
		]) {
			expect(writerFiles, `${pinned} must be classified as a writer`).toContain(pinned);
		}
	});

	test('every writer calls assertTestDatabase, or is exempt with a reason', () => {
		const unguarded = writerFiles.filter(
			(file) =>
				!stripComments(read(file)).includes('assertTestDatabase(') &&
				EXEMPT_WRITERS[file] === undefined,
		);
		expect(
			unguarded,
			`These files write test data without asking the '${TEST_MARKER_TABLE}' marker. Call assertTestDatabase('<door>') before the first write, or add an entry to EXEMPT_WRITERS with the reason it is not test-only: ${unguarded.join(', ')}`,
		).toEqual([]);
	});

	test('no exemption is stale', () => {
		const stale = Object.keys(EXEMPT_WRITERS).filter((file) => !writerFiles.includes(file));
		expect(
			stale,
			`Exempt files that are no longer writers (or no longer exist). Delete the entry — a dead exemption widens the law silently: ${stale.join(', ')}`,
		).toEqual([]);
	});

	test('the classifier fires on a synthetic offender (anti-vacuity)', () => {
		expect(hasWriteSeam("await sql.unsafe('DELETE FROM matrix WHERE 1=1');")).toBe(true);
		expect(hasWriteSeam('await insertMatrixRecordWithExplicitId(t, s, i, c);')).toBe(true);
		// …and NOT on prose about writing, nor on a pure read.
		expect(hasWriteSeam('// this module would DELETE FROM matrix if it could\n')).toBe(false);
		expect(hasWriteSeam('const rows = await sql`SELECT 1`;')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// RULE 2 — the doors refuse on a marker-less database (rollback probe).
// ---------------------------------------------------------------------------

/**
 * Run `probe` on a connection where the marker row does not exist, then ROLL
 * BACK. The delete is transaction-local, so no other connection — and no later
 * test file — ever sees a database without its marker.
 */
async function withoutMarker<T>(probe: () => Promise<T>): Promise<T> {
	const rollback = new Error('test_db_marker_tripwire: intentional rollback');
	let captured: T | undefined;
	try {
		await withTransaction(async () => {
			await sql.unsafe(`DELETE FROM "${TEST_MARKER_TABLE}"`);
			clearTestDatabaseMarkerCache();
			captured = await probe();
			throw rollback;
		});
	} catch (error) {
		if (error !== rollback) throw error;
	} finally {
		// The cache must not carry the probe's view out of the transaction.
		clearTestDatabaseMarkerCache();
	}
	return captured as T;
}

/** The refusal a door produced, or null when it did NOT refuse. */
async function refusalOf(door: () => Promise<unknown>): Promise<string | null> {
	try {
		await door();
		return null;
	} catch (error) {
		if (error instanceof DedaloError) return error.message;
		return `NON-DedaloError: ${String(error)}`;
	}
}

/**
 * THE DOORS, by name, with the call that reaches each one. Every entry is a
 * REAL exported writer — the list is checked against the inventory above, so a
 * door added to a guarded file without a probe here is red.
 */
const DOORS: readonly { name: string; run: () => Promise<unknown> }[] = [
	{
		name: 'materializeTestTldOntology',
		// The name layer is SATISFIED on purpose (`expectDatabase` = the live
		// database), so the refusal below can only come from the marker layer.
		run: async () =>
			materializeTestTldOntology({
				expectDatabase: await currentDatabaseName(),
				doc: { tld: 'zzq', nodes: [] },
			}),
	},
	{
		name: 'ensureTestCorpus',
		run: async () =>
			(await import('../../src/core/test_data/test_corpus/ensure.ts')).ensureTestCorpus('dd128'),
	},
	{
		name: 'dropTestCorpus',
		run: async () =>
			(await import('../../src/core/test_data/test_corpus/ensure.ts')).dropTestCorpus('dd128'),
	},
	{
		name: 'ensureMediaKit',
		run: async () =>
			(await import('../../src/core/test_data/test_corpus/ensure.ts')).ensureMediaKit({
				mediaRoot: '/nonexistent',
			}),
	},
	{
		name: 'ensureSituation',
		run: async () => {
			const module = await import('../../src/core/test_data/situations/situation.ts');
			return module.ensureSituation(module.situation({ name: 'zzmk', tld: 'zzmk', nodes: [] }));
		},
	},
	{
		name: 'dropSituation',
		run: async () => {
			const module = await import('../../src/core/test_data/situations/situation.ts');
			return module.dropSituation(module.situation({ name: 'zzmk', tld: 'zzmk', nodes: [] }));
		},
	},
	{
		name: 'ensureMapOfGrapesFixture',
		run: async () =>
			(
				await import('../../src/core/test_data/dmm_map_of_grapes_fixture.ts')
			).ensureMapOfGrapesFixture(),
	},
	{
		name: 'ensureSuiteLoginPassword',
		run: async () =>
			(await import('../../src/core/test_data/suite_login.ts')).ensureSuiteLoginPassword(
				'root',
				'dedalo_suite_client_tests',
			),
	},
	{
		name: 'createScratchRecord',
		run: async () =>
			(await import('../helpers/test_data.ts')).createScratchRecord('test2', 999_997, {}),
	},
	{
		name: 'cleanScratchRecord',
		run: async () => (await import('../helpers/test_data.ts')).cleanScratchRecord('test2', 999_997),
	},
	{
		name: 'cleanScratchTipo',
		run: async () => (await import('../helpers/test_data.ts')).cleanScratchTipo('zzmk1'),
	},
	{
		name: 'installAclIdentityFixture',
		run: async () =>
			(await import('../helpers/acl_identity_fixture.ts')).installAclIdentityFixture(),
	},
	{
		name: 'removeAclIdentityFixture',
		run: async () =>
			(await import('../helpers/acl_identity_fixture.ts')).removeAclIdentityFixture(),
	},
	// NOT LISTED, deliberately: `test/helpers/observer_term_seed.ts`. Until
	// 2026-08-20 it wrote an install thesaurus (`on1`) with its own
	// assertTestDatabase call and was a door in its own right. It is now a thin
	// composition over `situation()` — `ensureObserverTerm` / `dropObserverTerm`
	// simply call ensureSituation/dropSituation, which are listed ABOVE and which
	// refuse naming themselves. Listing the wrapper too would demand a SECOND
	// marker check on a function that writes nothing directly, and would make the
	// refusal name the wrapper instead of the door that actually refused.
];

describe('rule 2 — every door refuses without the marker', () => {
	test('all doors refuse, naming themselves, and the bypass still works', async () => {
		const outcome = await withoutMarker(async () => {
			const refusals: Record<string, string | null> = {};
			for (const door of DOORS) refusals[door.name] = await refusalOf(door.run);
			// RULE 4, behavioural half: the installer's call shape is the ONE
			// thing that still works on a database with no marker.
			const installer = await refusalOf(async () =>
				materializeTestTldOntology({ allowAnyDatabase: true, doc: { tld: 'zzq', nodes: [] } }),
			);
			return { refusals, installer };
		});

		const notRefused = DOORS.filter((door) => outcome.refusals[door.name] === null).map(
			(door) => door.name,
		);
		expect(
			notRefused,
			`These doors WROTE (or tried to) on a database with no '${TEST_MARKER_TABLE}' row: ${notRefused.join(', ')}`,
		).toEqual([]);

		for (const door of DOORS) {
			const message = outcome.refusals[door.name] ?? '';
			expect(message, `${door.name}: the refusal must name the door`).toContain(door.name);
			expect(message, `${door.name}: the refusal must name the marker`).toContain(
				TEST_MARKER_TABLE,
			);
		}

		expect(
			outcome.installer,
			'the installer bypass (allowAnyDatabase) must still work on a database with no marker — a fresh install has none',
		).toBeNull();
	});

	test('nothing the refused doors touch was written (the rollback restored the marker)', async () => {
		clearTestDatabaseMarkerCache();
		const marker = await readTestDatabaseMarker();
		expect(marker, 'the suite database must still carry its marker').not.toBeNull();
		const scratch = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM matrix_test WHERE section_tipo = 'test2' AND section_id = 999997`,
		)) as { n: number }[];
		expect(scratch[0]?.n ?? 0).toBe(0);
	});

	test('the probe itself can observe a marker (anti-vacuity)', async () => {
		// If `withoutMarker` silently failed to remove the row, rule 2 would be
		// asserting nothing at all. Prove both states are reachable.
		const seenInside = await withoutMarker(async () => readTestDatabaseMarker());
		expect(seenInside).toBeNull();
		clearTestDatabaseMarkerCache();
		expect(await readTestDatabaseMarker()).not.toBeNull();
	});

	test('every guarded writer file has at least one door probed here', () => {
		const guarded = writerFiles.filter(
			(file) =>
				EXEMPT_WRITERS[file] === undefined &&
				stripComments(read(file)).includes('assertTestDatabase('),
		);
		const probedIn = new Set<string>();
		for (const file of guarded) {
			const code = stripComments(read(file));
			for (const door of DOORS) {
				if (code.includes(`assertTestDatabase('${door.name}')`)) probedIn.add(file);
			}
		}
		const unprobed = guarded.filter((file) => !probedIn.has(file));
		expect(
			unprobed,
			`These files guard doors that RULE 2 never exercises — add the door to DOORS: ${unprobed.join(', ')}`,
		).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// RULE 3 — the marker's shape on the suite database.
// ---------------------------------------------------------------------------

describe('rule 3 — the marker on the suite database', () => {
	test('carries the expected shape and provenance', async () => {
		clearTestDatabaseMarkerCache();
		const marker = await readTestDatabaseMarker();
		expect(
			marker,
			`No '${TEST_MARKER_TABLE}' row. Build the test database with 'bun run test:db:setup'.`,
		).not.toBeNull();
		const row = marker as NonNullable<typeof marker>;
		expect(row.database_name).toBe(await currentDatabaseName());
		expect(row.seed_sha256).toMatch(/^[0-9a-f]{64}$/);
		expect(row.ontology_sha256).toMatch(/^[0-9a-f]{64}$/);
		expect(row.git_rev).toMatch(/^([0-9a-f]{40}|unknown)$/);
		expect(Number.isNaN(Date.parse(row.build_stamp))).toBe(false);
	});

	test('assertTestDatabase returns it (the guard is not vacuous in either direction)', async () => {
		await expect(assertTestDatabase('test_db_marker_tripwire')).resolves.toBeDefined();
	});

	test('the DB itself pins the purpose and forbids a second row', async () => {
		const constraints = (await sql`
			SELECT pg_get_constraintdef(oid) AS def
			  FROM pg_constraint
			 WHERE conrelid = ${TEST_MARKER_TABLE}::regclass
		`) as { def: string }[];
		const defs = constraints.map((row) => row.def).join(' | ');
		expect(defs, 'the single-row CHECK must exist').toMatch(/CHECK \(\(?id = 1\)?\)/);
		expect(defs, 'the purpose CHECK must pin the exact sentence').toContain(
			TEST_MARKER_PURPOSE.slice(0, 40),
		);
		expect(defs, 'id must be the primary key').toMatch(/PRIMARY KEY/);

		// And behaviourally: a second row is refused by Postgres, not by us.
		const refused = await refusalOf(async () =>
			withTransaction(async () => {
				await sql.unsafe(
					`INSERT INTO "${TEST_MARKER_TABLE}" (id, purpose, database_name, build_stamp, git_rev, seed_sha256, ontology_sha256)
					 VALUES (2, $1, 'x', 'x', 'x', 'x', 'x')`,
					[TEST_MARKER_PURPOSE],
				);
			}),
		);
		expect(refused, 'a second marker row must be impossible').not.toBeNull();
	});

	test('a marker naming another database is refused, not accepted (anti-vacuity)', async () => {
		const outcome = await refusalOf(async () =>
			withTransaction(async () => {
				await sql.unsafe(`UPDATE "${TEST_MARKER_TABLE}" SET database_name = $1 WHERE id = 1`, [
					'some_other_database',
				]);
				clearTestDatabaseMarkerCache();
				await assertTestDatabase('test_db_marker_tripwire');
			}),
		);
		clearTestDatabaseMarkerCache();
		expect(outcome ?? '').toContain('does not belong');
		// The UPDATE was rolled back with the failing transaction.
		expect((await readTestDatabaseMarker())?.database_name).toBe(await currentDatabaseName());
	});
});

// ---------------------------------------------------------------------------
// RULES 4 + 5 — the one bypass, the one producer.
// ---------------------------------------------------------------------------

/** Every tracked `.ts` under `src/`, `tools/` and `scripts/`, repo-relative. */
function engineSources(): string[] {
	const files: string[] = [];
	for (const dir of ['src', 'tools', 'scripts']) {
		for (const match of new Glob('**/*.ts').scanSync({ cwd: join(REPO_ROOT, dir) })) {
			if (match.endsWith('.test.ts')) continue;
			files.push(relative(REPO_ROOT, join(REPO_ROOT, dir, match)));
		}
	}
	return files.sort();
}

describe('rule 4 — the installer is the only bypass', () => {
	test('`allowAnyDatabase` occurs in exactly the door and the installer', () => {
		const users = engineSources().filter((file) =>
			stripComments(read(file)).includes('allowAnyDatabase'),
		);
		expect(
			users,
			'A SECOND bypass of the test-database marker. The installer is the one legitimate caller (a fresh install has no marker and gets the `test` TLD ONTOLOGY, definitions only); anything else must build a test database.',
		).toEqual(['src/core/install/db_restore.ts', 'src/core/test_data/test_tld_materialize.ts']);
	});

	test('the installer uses it for the ontology door only', () => {
		const source = stripComments(read('src/core/install/db_restore.ts'));
		expect(source).toContain('materializeTestTldOntology({ allowAnyDatabase: true })');
	});
});

describe('rule 5 — one producer of the marker', () => {
	test('`writeTestDatabaseMarker` is called from the setup script and nowhere else', () => {
		const callers = engineSources().filter(
			(file) =>
				file !== 'src/core/test_data/test_database_marker.ts' &&
				stripComments(read(file)).includes('writeTestDatabaseMarker'),
		);
		expect(callers).toEqual(['scripts/test_db_setup.ts']);
	});

	test('no install seed, migration or engine module creates the table', () => {
		const namers = engineSources().filter(
			(file) =>
				file !== 'src/core/test_data/test_database_marker.ts' &&
				stripComments(read(file)).includes(TEST_MARKER_TABLE),
		);
		expect(
			namers,
			`Only the marker module may name the '${TEST_MARKER_TABLE}' table (sql_confinement T4).`,
		).toEqual([]);
		const migrations = [
			...new Glob('*.sql').scanSync({ cwd: join(REPO_ROOT, 'install', 'db', 'migrations') }),
		].filter((file) =>
			readFileSync(join(REPO_ROOT, 'install', 'db', 'migrations', file), 'utf-8').includes(
				TEST_MARKER_TABLE,
			),
		);
		expect(migrations, 'a migration must never create the marker on an install').toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// RULE 6 — the client suite's server is on the suite database.
// ---------------------------------------------------------------------------

describe('rule 6 — the client run cannot drive a server on the app database', () => {
	test('the runner resolves the suite database and verifies the target (source)', () => {
		const runner = stripComments(read('scripts/client_test_runner.ts'));
		for (const call of [
			'resolveSuiteDatabase()',
			'repointProcessToSuiteDatabase(',
			'localSuiteFingerprint()',
			'assertServedDatabase(',
			'startClientTestServer(',
		]) {
			expect(runner, `scripts/client_test_runner.ts must call ${call}`).toContain(call);
		}
		// No unverified door to a target: the ONLY place a URL becomes the page
		// the browser opens is establishTarget, which does both checks above.
		expect(runner.match(/page\.goto\(/g) ?? []).toHaveLength(1);
		expect(runner).toContain('const suite = await prepareSuiteDatabase();');
		expect(runner).toContain('const target = await openTarget(suite);');
	});

	test('the wire field is dev-mode-only and is a hash, never the database name', () => {
		const server = stripComments(read('src/server.ts'));
		expect(server, 'the /health identity must come from the marker fingerprint').toContain(
			'testDatabaseFingerprint',
		);
		expect(server, 'and it must be gated on dev mode').toContain('DEV_MODE_HEALTH_DB_IDENTITY');
		// The name must not be reachable from the health payload.
		expect(server).not.toContain('currentDatabaseName');
	});

	test('the fingerprint identifies THIS database, and is absent without a marker', async () => {
		clearTestDatabaseMarkerCache();
		const fingerprint = await testDatabaseFingerprint();
		expect(fingerprint, 'the suite database must produce a fingerprint').toMatch(/^[0-9a-f]{64}$/);
		// It is derived from the marker, so it is stable within a build...
		clearTestDatabaseMarkerCache();
		expect(await testDatabaseFingerprint()).toBe(fingerprint as string);
		// ...and it does NOT leak the database name.
		expect(fingerprint).not.toContain(await currentDatabaseName());
		// A database with no marker answers nothing at all (anti-vacuity).
		expect(await withoutMarker(async () => testDatabaseFingerprint())).toBeNull();
		clearTestDatabaseMarkerCache();
	});

	test('the probe refuses a server that is not on this suite database', async () => {
		const expected = (await testDatabaseFingerprint()) as string;
		const cases: { name: string; payload: Record<string, unknown>; refuses: boolean }[] = [
			// A production/app-database server: dev mode off, or no marker at all.
			{ name: 'no fingerprint', payload: { result: 'ok', entity: 'x' }, refuses: true },
			{ name: 'null fingerprint', payload: { result: 'ok', test_database: null }, refuses: true },
			// Someone else's test database (or one rebuilt since that server booted).
			{
				name: 'another suite database',
				payload: { result: 'ok', test_database: 'f'.repeat(64) },
				refuses: true,
			},
			{
				name: 'this suite database',
				payload: { result: 'ok', test_database: expected },
				refuses: false,
			},
		];
		for (const probeCase of cases) {
			const stub = Bun.serve({
				port: 0,
				fetch: (request) =>
					new URL(request.url).pathname === '/health'
						? Response.json(probeCase.payload)
						: new Response('no', { status: 404 }),
			});
			const origin = `http://localhost:${stub.port}`;
			try {
				const served = await probeServedDatabase(origin);
				const outcome = await refusalOf(async () =>
					assertServedDatabase({ origin, expected, served }),
				);
				if (probeCase.refuses) {
					expect(outcome ?? '', `${probeCase.name}: must be refused`).toContain('REFUSING');
				} else {
					expect(outcome, `${probeCase.name}: must be accepted`).toBeNull();
				}
			} finally {
				stub.stop(true);
			}
		}
	});

	test('the suite database name is never the application database', () => {
		// The runner refuses before it does anything else; proved here rather than
		// by pointing a real run at the app database.
		const { suiteDb, appDb } = resolveSuiteDatabase();
		expect(suiteDb).not.toBe(appDb);
		expect(suiteDb).not.toBe('');
	});
});
