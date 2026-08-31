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
 * SEVEN RULES, and every one of them has an anti-vacuity probe:
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
 *     right one — against real stub servers). And the name-level distinctness
 *     refusal is probed in BOTH directions (2026-08-25): it fires on a genuine
 *     suite-db == app-db collision and stays quiet on a distinct explicit
 *     DEDALO_TEST_DATABASE — the readEnv-based version of that guard was
 *     vacuous inside a test process (the preload rewrites DB_NAME) and this
 *     gate's happy-path-only assertion never noticed.
 *  7. A CLONE INHERITS THE MARKER, AND REWRITES THE ONE FIELD THE COPY MADE A
 *     LIE (2026-08-25, the parallel-shard work). A shard database is a
 *     `CREATE DATABASE … TEMPLATE <suite>` copy — 7612 MB and 907 s is not
 *     something a run can build N times — so it arrives carrying the template's
 *     marker row, which names the TEMPLATE and which rule 3 therefore refuses.
 *     The provisioning path rewrites `database_name = current_database()` (the
 *     connection's own identity, never a caller-supplied name), in INTERPOLATED
 *     form: demanding the literal table name here would demand exactly what
 *     rule 5 forbids, and the two rules could never both be green. Derived, not
 *     enumerated — the set of files performing that rewrite must be empty or
 *     exactly the one provisioner, so a rewrite landing elsewhere is red rather
 *     than a rule that skips forever. Rule 7b is its companion on the other
 *     side: `test:db:setup` builds the TEMPLATE and sweeps the TEMPLATE's media
 *     tree, so it must refuse a `<template>__shard<N>` target BEFORE any side
 *     effect (both existing name guards pass a shard name happily).
 *
 * HONEST LIMITS. The inventory is a REGEX classifier over stripped sources: it
 * sees DML text and the named write doors, not a write reached through an
 * arbitrary dynamic indirection. It covers the two directories test data lives
 * in — a writer someone puts in a third place is outside it, exactly as the
 * corpus of every source-scan gate in this tree is.
 *
 * And rule 7's binding half is PRESENCE-GATED on `scripts/lib/test_shard_db.ts`
 * (written in parallel with this gate, 2026-08-25): while the provisioner is
 * absent those tests do not run. What is NOT gated is the census — the "no
 * other file rewrites the marker" assertion, and every positive control, run
 * either way — so the window this leaves open is "the provisioner exists and is
 * correct", never "someone rewrote the marker somewhere else".
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
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
import { applicationDatabaseName } from '../helpers/test_database.ts';

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
				await import('../../src/core/test_data/map_of_grapes_fixture.ts')
			).ensureMapOfGrapesFixture(),
	},
	{
		name: 'ensureSuiteProjectsFixture',
		run: async () =>
			(await import('../../src/core/test_data/projects_fixture.ts')).ensureSuiteProjectsFixture(),
	},
	{
		name: 'removeSuiteProjectsFixture',
		run: async () =>
			(await import('../../src/core/test_data/projects_fixture.ts')).removeSuiteProjectsFixture(),
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
		name: 'ensureSyntheticHierarchies',
		run: async () =>
			(
				await import('../../src/core/test_data/synthetic_hierarchy_fixture.ts')
			).ensureSyntheticHierarchies(),
	},
	{
		name: 'dropSyntheticHierarchies',
		run: async () =>
			(
				await import('../../src/core/test_data/synthetic_hierarchy_fixture.ts')
			).dropSyntheticHierarchies(),
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
	{
		name: 'installHierarchyPruningFixture',
		run: async () =>
			(await import('../helpers/hierarchy_pruning_fixture.ts')).installHierarchyPruningFixture(),
	},
	{
		name: 'removeHierarchyPruningFixture',
		run: async () =>
			(await import('../helpers/hierarchy_pruning_fixture.ts')).removeHierarchyPruningFixture(),
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
		// Checked by STRUCTURE, not by formatting. This used to pin the call as one
		// exact line, so adding an argument to it (the install/suite `scope`, 2026-08-21)
		// reddened a gate whose subject had not changed at all. What matters is that
		// the bypass appears ONCE and appears INSIDE the ontology door's argument
		// list — a second use, or one attached to any other call, is the thing this
		// rule exists to catch.
		const occurrences = source.split('allowAnyDatabase').length - 1;
		expect(occurrences, 'the installer may bypass the marker exactly once').toBe(1);
		const flagAt = source.indexOf('allowAnyDatabase');
		const doorAt = source.lastIndexOf('materializeTestTldOntology(', flagAt);
		expect(
			doorAt,
			'`allowAnyDatabase` is not inside a materializeTestTldOntology call',
		).toBeGreaterThan(-1);
		// Nothing closes that call between the door and the flag.
		expect(source.slice(doorAt, flagAt)).not.toContain(')');
	});
});

describe('rule 5 — one producer of the marker', () => {
	test('`writeTestDatabaseMarker` is called from the setup script and nowhere else', () => {
		// STILL ONE ITEM after the shard work (2026-08-25), and that was CHECKED,
		// not assumed: the shard provisioning path does NOT produce a marker — a
		// clone INHERITS the template's row and rewrites only `database_name`
		// (rule 7). Minting one there would fabricate provenance the shard never
		// performed, and would create a second path able to stamp the row onto a
		// database nobody proved was a clone. Rule 7 asserts that absence, so this
		// list can only grow through a deliberate edit in both places.
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
				// The literal's ONE definition site — split DB-free (D13, 2026-08-25) so
				// scripts/test_db_setup.ts can ask a target for the marker over psql
				// without importing the pool (postgres.ts connects at module scope) and
				// without a second copy of the name.
				file !== 'src/core/test_data/test_database_marker_constants.ts' &&
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
		// The app side must be the INSTALLATION's database (../private/.env), not
		// this process's rewritten env — the preload set DB_NAME to the suite DB,
		// so a readEnv-based appDb would silently be the suite's own name.
		expect(appDb).toBe(applicationDatabaseName() ?? '');
	});

	test('the distinctness refusal is not vacuous: a genuine collision refuses', () => {
		// HOW THE HAPPY-PATH-ONLY VERSION OF THIS GATE LET THE DEFECT LIVE.
		// resolveSuiteDatabase() used readEnv('DB_NAME') for the app side, but
		// the preload rewrites process.env.DB_NAME to the SUITE database and
		// readEnv gives process env precedence — so inside every bun test run the
		// guard compared `<suite>_test` against `<suite>`: always distinct, never
		// the application database, and the test above stayed green forever
		// (measured 2026-08-25). Worse, with DEDALO_TEST_DATABASE explicit the
		// same trap FALSE-fired: both sides resolved to the identical explicit
		// value and the guard refused a perfectly safe run. This test drives BOTH
		// directions over a mutated env, so a regression to readEnv on either
		// side of the comparison is red the day it lands.
		// THE APP NAME IS SUPPLIED, NOT REQUIRED FROM DISK. This used to read
		// ../private/.env and THROW when it was absent, on the reasoning that the
		// suite this gate runs on is configured there. True on a developer box,
		// false on the hosted DB tier: scripts/ci/db_tier.sh composes its whole
		// environment in-process precisely so no such file exists, so the probe
		// threw on every runner — the 15th red gate of that tier, and the only one
		// of the fifteen that was about this gate at all.
		//
		// Injecting the name keeps the probe running EVERYWHERE rather than
		// skipping where it matters most. The real file is still preferred when it
		// is there, so the developer-box case is unchanged; the synthetic name is
		// only a stand-in for "some application database", which is all the three
		// cases below need it to be.
		const appDb = applicationDatabaseName() ?? 'dedalo_probe_application_db';
		const savedExplicit = process.env.DEDALO_TEST_DATABASE;
		try {
			// (a) GENUINE COLLISION — the operator points DEDALO_TEST_DATABASE at
			// the application database itself. This is the one mistake the guard
			// exists to make impossible, and it must refuse.
			process.env.DEDALO_TEST_DATABASE = appDb;
			expect(() => resolveSuiteDatabase(appDb)).toThrow(/REFUSING to run the client suite/);
			// (b) EXPLICIT BUT DISTINCT — the parallel-shard shape. The old
			// readEnv-based guard refused exactly this safe case; it must pass.
			process.env.DEDALO_TEST_DATABASE = `${appDb}_test_shard_probe`;
			expect(resolveSuiteDatabase(appDb)).toEqual({
				suiteDb: `${appDb}_test_shard_probe`,
				appDb,
			});
			// (c) UNSET — the everyday derived name. Must pass too, and against the
			// REAL app database name, not this process's rewritten one.
			delete process.env.DEDALO_TEST_DATABASE;
			const derived = resolveSuiteDatabase(appDb);
			expect(derived.appDb).toBe(appDb);
			expect(derived.suiteDb).not.toBe(appDb);
		} finally {
			// Restore the snapshot exactly — other files in this run derive the
			// suite database from the same env.
			if (savedExplicit === undefined) {
				delete process.env.DEDALO_TEST_DATABASE;
			} else {
				process.env.DEDALO_TEST_DATABASE = savedExplicit;
			}
		}
	});
});

// ---------------------------------------------------------------------------
// RULE 7 — CLONE PROVENANCE: a shard database INHERITS the marker, and rewrites
// the ONE field the copy turned into a lie.
// ---------------------------------------------------------------------------

/**
 * WHY THIS RULE EXISTS (2026-08-25, the parallel-shard work).
 *
 * The suite database is 7612 MB and takes 907 s to build from the seed, so a
 * sharded run cannot build N of them: each shard gets a `CREATE DATABASE
 * <shard> TEMPLATE <suite>` clone (Postgres 18.4 here, STRATEGY = FILE_COPY),
 * which copies the template's files — the `dedalo_test_marker` row INCLUDED.
 *
 * That copy is what makes this rule necessary. The inherited row still says
 * `database_name = '<template>'`, and rule 3's law is that a marker naming
 * ANOTHER database is refused (`assertTestDatabase` throws "does not belong").
 * So every shard would refuse every write, on a database that is in fact a
 * disposable clone of a disposable database. The provisioning path therefore
 * rewrites exactly one field, on the clone's own connection:
 *
 *     UPDATE "<marker table>" SET database_name = current_database()
 *
 * `current_database()` and not a name the caller passed in: the value must come
 * from the connection that is about to be written through, so a provisioner
 * pointed at the wrong database cannot stamp a correct-looking marker onto it.
 *
 * THE SHAPE IS INTERPOLATED, NEVER THE LITERAL, and that is not a style
 * preference — it is what keeps this rule and RULE 5 simultaneously
 * satisfiable. Rule 5 allows the string `dedalo_test_marker` in exactly ONE
 * file under `src/`, `tools/` and `scripts/` (the DB-free constants module). A
 * rule 7 that demanded the literal in the provisioner would demand precisely
 * what rule 5 forbids, and the two gates could never both be green. So the
 * provisioner IMPORTS `TEST_MARKER_TABLE` and interpolates it, and this rule
 * asserts THAT — plus the absence of the literal, so the escape hatch is shut
 * from this side too.
 *
 * WHY IT IS NOT A SECOND MARKER PRODUCER (rule 5's list stays one item long).
 * The clone does not MINT a marker: minting one means asserting provenance —
 * `build_stamp`, `git_rev`, `seed_sha256`, `ontology_sha256` — about a build
 * the shard never performed, and it means a path that can create the row on a
 * database nobody proved was a clone (which is exactly the production-shaped
 * accident the whole marker law exists to make impossible). A shard's
 * provenance IS the template's; the only fact the copy invalidated is the name,
 * and the name is the only thing rewritten. `writeTestDatabaseMarker` therefore
 * stays pinned to `scripts/test_db_setup.ts` in rule 5, and this rule asserts
 * the provisioner does not call it — so a future change to a mint-shaped
 * provisioner is a deliberate edit to BOTH lists, not a quiet widening.
 *
 * PRESENCE-GATED, BUT NOT ON `existsSync` ALONE. `scripts/lib/test_shard_db.ts`
 * is being written in parallel with this gate. A rule that merely skipped while
 * the file was missing would also skip forever if the provisioner landed under
 * a different name — a silent narrowing. So the census is DERIVED: every file
 * under `src/`, `tools/` and `scripts/` is classified, and the set that
 * rewrites the marker must be EXACTLY the empty set (tier not landed) or
 * EXACTLY `[SHARD_PROVISIONER]`. A provisioner somewhere else is red, and the
 * fix is to move it or to change the pin on purpose.
 */

/** The ONE provisioning path allowed to rewrite an inherited marker. */
const SHARD_PROVISIONER = 'scripts/lib/test_shard_db.ts';

/**
 * The shard namespace. `<template>__shard<N>` — the double underscore is what
 * makes a shard name recognisable to `scripts/test_db_setup.ts` without a
 * second source of truth about the shard list.
 */
const SHARD_NAME_SHAPE = /__shard\d+$/;

const shardTierLanded = existsSync(join(REPO_ROOT, SHARD_PROVISIONER));

/**
 * Does this source perform the clone's marker rewrite, in the interpolated
 * form? Returns the REASONS it does not, so a half-written provisioner fails
 * naming what is missing instead of vanishing from a census.
 */
function markerRewriteFaults(source: string): string[] {
	const code = stripComments(source);
	const faults: string[] = [];
	if (
		!/import\s*(?:type\s*)?\{[^}]*\bTEST_MARKER_TABLE\b[^}]*\}\s*from\s*['"][^'"]*test_database_marker(?:_constants)?\.ts['"]/.test(
			code,
		)
	) {
		faults.push('it does not IMPORT TEST_MARKER_TABLE from the marker constants module');
	}
	if (!/UPDATE\s+"?\$\{TEST_MARKER_TABLE\}"?\s+SET\b/.test(code)) {
		faults.push('it has no `UPDATE "${TEST_MARKER_TABLE}" SET …` (the interpolated shape)');
	}
	if (!/database_name\s*=\s*current_database\(\)/.test(code)) {
		faults.push(
			'the rewrite does not set database_name = current_database() (the value must come from the connection being written through, never from a caller-supplied name)',
		);
	}
	if (code.includes(TEST_MARKER_TABLE)) {
		faults.push(
			`it spells the marker table LITERALLY; rule 5 allows that literal in one file only, so the literal form would make rules 5 and 7 mutually unsatisfiable — import ${'TEST_MARKER_TABLE'} instead`,
		);
	}
	return faults;
}

/** The files that perform the rewrite, derived — never enumerated. */
function markerRewriters(): string[] {
	return engineSources().filter((file) => markerRewriteFaults(read(file)).length === 0);
}

describe('rule 7 — clone provenance: the shard marker rewrite', () => {
	test('the matcher fires and refuses correctly on synthetic sources (positive control)', () => {
		const importLine = `import { TEST_MARKER_TABLE } from '../../src/core/test_data/test_database_marker_constants.ts';`;
		// The conforming shape, spelled in single quotes so `${…}` stays TEXT.
		const conforming = [
			importLine,
			'await sql.unsafe(`UPDATE "${TEST_MARKER_TABLE}" SET database_name = current_database() WHERE id = 1`);',
		].join('\n');
		expect(markerRewriteFaults(conforming)).toEqual([]);

		// THE POSITIVE CONTROL THAT MATTERS: the literal form. It is what a
		// well-meaning author writes, it would satisfy a naive "does it rewrite
		// the marker" matcher, and it is exactly what rule 5 forbids.
		const literalForm = [
			importLine,
			`await sql.unsafe('UPDATE "${TEST_MARKER_TABLE}" SET database_name = current_database() WHERE id = 1');`,
		].join('\n');
		expect(markerRewriteFaults(literalForm).length).toBeGreaterThan(0);

		// A caller-supplied name instead of the connection's own identity.
		const hardcodedName = [
			importLine,
			'await sql.unsafe(`UPDATE "${TEST_MARKER_TABLE}" SET database_name = ${shardDb}`);',
		].join('\n');
		expect(markerRewriteFaults(hardcodedName).length).toBeGreaterThan(0);

		// No import of the constant at all.
		expect(
			markerRewriteFaults(
				'await sql.unsafe(`UPDATE "${TEST_MARKER_TABLE}" SET database_name = current_database()`);',
			).length,
		).toBeGreaterThan(0);

		// And PROSE about the rewrite is not the rewrite (comments are stripped).
		expect(
			markerRewriteFaults(
				`${importLine}\n// UPDATE "\${TEST_MARKER_TABLE}" SET database_name = current_database()\n`,
			).length,
		).toBeGreaterThan(0);
	});

	test('the source census is not vacuous (anti-vacuity floor)', () => {
		// If engineSources() or the reader broke, every assertion below would pass
		// over an empty tree. Same floor the sibling rules use.
		const sources = engineSources();
		expect(sources.length).toBeGreaterThan(200);
		expect(sources).toContain('scripts/test_db_setup.ts');
		expect(sources).toContain('src/core/test_data/test_database_marker.ts');
	});

	test('exactly one file rewrites the marker, and only the shard provisioner may', () => {
		const rewriters = markerRewriters();
		expect(
			rewriters,
			shardTierLanded
				? `The shard provisioning path (${SHARD_PROVISIONER}) is the ONLY file that may rewrite an inherited marker. A second rewriter is a second way for a database to claim it is a disposable clone: ${rewriters.join(', ')}`
				: `${SHARD_PROVISIONER} is not present, so NOTHING may rewrite the marker yet. A rewrite landing anywhere else would leave this rule permanently skipped — move it to ${SHARD_PROVISIONER}, or change the pin deliberately: ${rewriters.join(', ')}`,
		).toEqual(shardTierLanded ? [SHARD_PROVISIONER] : []);
	});

	test.if(shardTierLanded)('the provisioner rewrites the marker in the interpolated shape', () => {
		const faults = markerRewriteFaults(read(SHARD_PROVISIONER));
		expect(
			faults,
			`${SHARD_PROVISIONER} clones the suite database, so it inherits a marker naming the TEMPLATE — which rule 3 refuses. It must rewrite it, and in the interpolated form: ${faults.join(' | ')}`,
		).toEqual([]);
	});

	test.if(shardTierLanded)(
		'the provisioner is NOT a second marker PRODUCER (rule 5 addendum)',
		() => {
			// Rule 5's first test pins `writeTestDatabaseMarker` callers to exactly
			// ['scripts/test_db_setup.ts']. CHECKED AND DELIBERATELY NOT WIDENED: the
			// provisioner inherits the row through the clone and edits one field, so
			// it never produces a marker and must not appear in that list. This test
			// makes the decision mechanical — the day the provisioner starts minting
			// markers it goes red HERE, forcing the edit to rule 5's list to be an
			// argued one rather than a green side effect.
			expect(
				stripComments(read(SHARD_PROVISIONER)).includes('writeTestDatabaseMarker'),
				`${SHARD_PROVISIONER} must NOT call writeTestDatabaseMarker: minting a marker asserts provenance (build_stamp, git_rev, seed/ontology sha) about a build the shard never performed, and creates a path that can stamp the row onto a database nobody proved was a clone. A shard's provenance IS the template's; only the name is rewritten.`,
			).toBe(false);
		},
	);
});

// ---------------------------------------------------------------------------
// RULE 7b — `test:db:setup` refuses a SHARD name before it touches anything.
// ---------------------------------------------------------------------------

/**
 * `scripts/test_db_setup.ts` builds THE TEMPLATE: it DROPs its target and
 * SWEEPS that target's media tree. Point `DEDALO_TEST_DATABASE` at a shard
 * clone (`<template>__shard3` — a leftover env var from a sharded run is the
 * everyday way this happens) and it would rebuild an ephemeral clone as if it
 * were the fixture, at 907 s, and delete the media tree keyed to that shard.
 * Both existing name guards let it through: a shard name IS distinct from the
 * application database, and it IS `[A-Za-z0-9_.-]+`.
 *
 * So the script must refuse the shard namespace, and refuse it BEFORE any side
 * effect — `rebuildTestMediaRoot()` sweeps a tree before the first psql call,
 * so "it fails eventually" is not the same as "nothing was touched".
 */
const SETUP_SIDE_EFFECTS = [
	'rebuildTestMediaRoot(',
	'DROP DATABASE',
	'CREATE DATABASE',
	'await psql(',
];

/** Reasons the source does NOT refuse shard names before its first side effect. */
function shardRefusalFaults(source: string): string[] {
	const code = stripComments(source);
	const faults: string[] = [];
	const refusalAt = code.indexOf('__shard');
	if (refusalAt === -1) {
		return ['it never mentions the `__shard` namespace at all'];
	}
	const firstSideEffect = SETUP_SIDE_EFFECTS.map((token) => code.indexOf(token))
		.filter((at) => at !== -1)
		.sort((a, b) => a - b)[0];
	if (firstSideEffect === undefined) {
		// The side-effect tokens are the anti-vacuity floor for THIS matcher: if
		// none of them is found the ordering assertion below would be trivially
		// true, so refuse instead of passing.
		return ['none of the known side-effect tokens was found — the ordering check would be vacuous'];
	}
	if (refusalAt > firstSideEffect) {
		faults.push(
			'the shard refusal comes AFTER a side effect (a tree is swept / a database dropped first)',
		);
	}
	const block = code.slice(Math.max(0, refusalAt - 900), refusalAt + 900);
	if (!block.includes('REFUSING'))
		faults.push('the shard check does not REFUSE (no refusal message)');
	if (!block.includes('process.exit(1)')) faults.push('the shard check does not exit non-zero');
	return faults;
}

describe('rule 7b — the setup script refuses a shard name, before touching anything', () => {
	test('the matcher fires on synthetic offenders (positive control)', () => {
		const refusal = [
			'if (SHARD.test(testDb)) {',
			"  console.error(`REFUSING: '${testDb}' is in the __shard namespace`);",
			'  process.exit(1);',
			'}',
		].join('\n');
		const sideEffect = 'const mediaRoot = rebuildTestMediaRoot(testDb);\nawait psql(testDb, []);';
		expect(shardRefusalFaults(`${refusal}\n${sideEffect}`)).toEqual([]);
		// Ordering inverted — the tree is swept before the refusal.
		expect(shardRefusalFaults(`${sideEffect}\n${refusal}`).length).toBeGreaterThan(0);
		// Present, ordered, but not actually a refusal.
		expect(shardRefusalFaults(`const shardish = /__shard/;\n${sideEffect}`).length).toBeGreaterThan(
			0,
		);
		// Absent entirely.
		expect(shardRefusalFaults(sideEffect)).toEqual([
			'it never mentions the `__shard` namespace at all',
		]);
		// Prose is not a refusal.
		expect(
			shardRefusalFaults(`// refuse __shard names here one day\n${sideEffect}`).length,
		).toBeGreaterThan(0);
	});

	test('the shard name shape is the one both sides agree on', () => {
		// The contract between this gate, the provisioner and the setup script.
		expect(SHARD_NAME_SHAPE.test('dedalo_v7_mht_test__shard3')).toBe(true);
		expect(SHARD_NAME_SHAPE.test('dedalo_v7_mht_test')).toBe(false);
		expect(SHARD_NAME_SHAPE.test('dedalo_v7_mht_test__shard')).toBe(false);
	});

	test.if(shardTierLanded)('scripts/test_db_setup.ts refuses before any side effect', () => {
		const faults = shardRefusalFaults(read('scripts/test_db_setup.ts'));
		expect(
			faults,
			`scripts/test_db_setup.ts DROPs its target and SWEEPS that target's media tree. With shard provisioning present, a stale DEDALO_TEST_DATABASE pointing at a '<template>__shard<N>' clone must be refused before either happens: ${faults.join(' | ')}`,
		).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// RULE 4 — EVERY SQL POOL THE PROCESS CAN OPEN (P1-16, 2026-08-30)
// ---------------------------------------------------------------------------
//
// THE STRUCTURAL HOLE THIS CLOSES, and it is the reason P1-16 existed at all.
//
// Rule 1's inventory is derived over WRITER_ROOTS — `src/core/test_data/**` and
// `test/helpers/**`. That is the right corpus for "which test-data writer forgot to ask
// the marker", and it is the WRONG corpus for "which database can this process open at
// all": production source in neither tree is structurally invisible to it. So when
// `src/ai/rag/vector_store.ts` opened a SECOND Bun SQL pool against
// `RAG_DB_NAME` (default `dedalo7_rag`, a live installation index measured at 5,201
// rows), no rule here could see it, nothing in `test/preload/**` repointed it, and the
// suite issued DELETE + INSERT, DELETE, `CREATE TABLE … PARTITION OF` and
// `DROP TABLE IF EXISTS` against production for months. The audit's own words
// (REMEDIATION.md P1-16): "production source in neither tree is structurally invisible
// to it today, which is exactly how this pool escaped."
//
// A gate that fixed only the RAG pool would leave the blindness intact for the NEXT
// pool. So the census is over POOL CONSTRUCTORS in `src/`, derived, total, and every
// site must carry a verdict:
//
//   marker-guarded — a Dédalo store whose writers ask a marker before writing.
//   read-only      — the pool never mutates; a SELECT cannot corrupt anything.
//   PENDING        — it CAN write a real database and nothing stops it. Shrink-only,
//                    pinned, and each row names the finding, so a known gap is a
//                    counted debt rather than an omission nobody sees.
const POOL_SCAN_ROOT = 'src';

/** Every `new SQL(` site in `src/`, as `<file>:<line>`. Derived, never listed. */
function sqlPoolSites(): string[] {
	const sites: string[] = [];
	for (const match of new Glob('**/*.ts').scanSync({ cwd: join(REPO_ROOT, POOL_SCAN_ROOT) })) {
		if (match.endsWith('.test.ts')) continue;
		const file = `${POOL_SCAN_ROOT}/${match}`;
		// Comments describe the rule (core/db/postgres.ts's T1 header names `new SQL(...)`
		// in prose); only real constructor calls are pools.
		const source = stripComments(read(file));
		const lines = source.split('\n');
		for (let index = 0; index < lines.length; index++) {
			if ((lines[index] as string).includes('new SQL(')) sites.push(`${file}:${index + 1}`);
		}
	}
	return sites.sort();
}

type PoolVerdict = 'marker-guarded' | 'read-only' | 'PENDING';

/** Keyed by FILE — a file's pools share a purpose and a guard. */
const POOL_VERDICTS: Readonly<Record<string, { verdict: PoolVerdict; reason: string }>> = {
	'src/core/db/postgres.ts': {
		verdict: 'marker-guarded',
		reason:
			'THE matrix pool. Every test-data writer that reaches it calls assertTestDatabase() before its first write (rule 1 above), and the suite is repointed by test/preload/test_database.ts. This is the guard the other pools are measured against.',
	},
	'src/ai/rag/vector_store.ts': {
		verdict: 'marker-guarded',
		reason:
			'The pgvector pool. Marker-guarded since 2026-08-30 (P1-16): its write doors ask assertTestRagDatabase() and test/preload/rag_db.ts repoints it with the one key that also arms the refusal. Before that it was the hole this rule exists to make impossible.',
	},
	'src/diffusion/targets/mariadb/db.ts': {
		verdict: 'PENDING',
		reason:
			"The diffusion TARGET pools — an operator-configured MariaDB publication database, not a Dédalo store, so neither the matrix marker nor the RAG marker applies and no equivalent exists. getTargetPool() genuinely writes (CREATE TABLE, DML through src/diffusion/writers/mariadb_sql.ts); probeTargetDatabase() issues only SELECT 1. FINDING 2026-08-30, same class as P1-16 on a third pool: test/integration/diffusion_mariadb.test.ts:68 targets the database `web_numisdata_mib` — one INSTALLATION's publication target, named in the suite — and creates/drops scratch tables in it. It is test.if(HAVE_DB)-guarded, so it SKIPS where MariaDB is unreachable and WRITES where it is. The fix is a marked-target equivalent plus a generic target name; until then this is counted debt, not an oversight.",
	},
};

/** PINNED. Shrink-only: a pool may leave PENDING, never join it silently. */
const POOL_PENDING_COUNT = 1;

describe('rule 4 — every SQL pool the process can open is classified', () => {
	const sites = sqlPoolSites();
	const files = [...new Set(sites.map((site) => site.split(':')[0] as string))].sort();

	test('the scan finds the pools it is meant to see (anti-vacuity)', () => {
		// A census over nothing proves nothing, and this one is cheap to break: a
		// stripComments change, a Glob typo, a moved file.
		expect(
			sites.length,
			'no `new SQL(` site found in src/ — the scan is broken',
		).toBeGreaterThanOrEqual(3);
		expect(files).toContain('src/core/db/postgres.ts');
		expect(files).toContain('src/ai/rag/vector_store.ts');
	});

	test('every pool file carries a verdict', () => {
		const unclassified = files.filter((file) => POOL_VERDICTS[file] === undefined);
		expect(
			unclassified,
			`SQL pool(s) opened by src/ with no verdict:\n  ${unclassified.join('\n  ')}\n` +
				'A second pool is how the suite reached the installation vector database for months. Classify it: ' +
				'marker-guarded (its writers ask a marker), read-only (it never mutates), or PENDING with the finding named.',
		).toEqual([]);
	});

	test('no verdict names a file that no longer opens a pool', () => {
		// Staleness the other way: a dead row reads as coverage.
		for (const [file, row] of Object.entries(POOL_VERDICTS)) {
			expect(files, `${file} carries a pool verdict but opens no pool`).toContain(file);
			expect(row.reason.length, `${file}: the reason is too short to be a reason`).toBeGreaterThan(
				60,
			);
		}
	});

	test('the PENDING list is SHRINK-ONLY', () => {
		const pending = Object.entries(POOL_VERDICTS).filter(([, row]) => row.verdict === 'PENDING');
		expect(pending.length).toBeLessThanOrEqual(POOL_PENDING_COUNT);
		expect(
			pending.length,
			`the pool PENDING list shrank to ${pending.length} — lower POOL_PENDING_COUNT so the ratchet keeps biting`,
		).toBe(POOL_PENDING_COUNT);
	});

	test('a marker-guarded pool really names its guard', () => {
		// The verdict is a claim about the source; check it rather than trust it.
		const guards: Readonly<Record<string, string>> = {
			'src/core/db/postgres.ts': 'assertTestDatabase',
			'src/ai/rag/vector_store.ts': 'assertTestRagDatabase',
		};
		for (const [file, symbol] of Object.entries(guards)) {
			if (POOL_VERDICTS[file]?.verdict !== 'marker-guarded') continue;
			const reachable =
				read(file).includes(symbol) || writerFiles.some((writer) => read(writer).includes(symbol));
			expect(
				reachable,
				`${file} is marked marker-guarded but neither it nor any guarded writer mentions ${symbol}`,
			).toBe(true);
		}
	});
});
