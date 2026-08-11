/**
 * consolidate_tables + analyze_statistics decision seams
 * (src/core/area_maintenance/widgets/database_info.ts).
 *
 * The two maintenance actions this file gates are the most destructive pair in
 * the widget: one RENUMBERS the primary key of the shared ontology tables, the
 * other interpolates catalog-derived identifiers into SQL. Both were previously
 * reachable only by clicking the maintenance panel against a real database, so
 * every guard in them was untested.
 *
 * WHAT IS PINNED
 *   1. `planConsolidation` — the three-way verdict (error / noop / consolidate)
 *      including the `=== null || === undefined` shape of the first-id check
 *      (NOT truthiness: id 0 is a legal id and must read as 'noop', not
 *      'error') and the `Number(firstId) <= rowCount` comparison.
 *   2. `consolidateOneTable` against a SCRATCH CLONE — the renumber is gapless
 *      1..n, in `orderBy` order rather than id order, loses no row and pairs no
 *      row with another row's payload, and the sequence ends ABOVE the new max
 *      so the next insert cannot collide. Both members of the closed
 *      `ConsolidateOrder` enum are exercised.
 *   3. `CONSOLIDATE_TABLES` exact membership — the allowlist is the only thing
 *      standing between this action and an arbitrary table's primary key.
 *   4. `buildAnalyzeStatement` — quoting, the identifier allowlist, the
 *      rejected list, and the `null` statement when nothing survives.
 *   5. `analyzeStatisticsMessage` — all three arms.
 *   6. The extraction actually replaced the inline code (source assertions).
 *
 * BEHAVIOUR CHANGE PINNED HERE (defect D14, authorised 2026-08-08).
 * `consolidateOneTable` now wraps the `UPDATE … row_number()` and the
 * `setval(<table>_id_seq, …)` in ONE `withTransaction`. Before the extraction
 * they were two independent statements and a failure between them left the
 * sequence disagreeing with the renumbered data — a silent duplicate-key
 * generator. Nothing else changed.
 *
 * NOT COVERED, stated rather than faked:
 *   - `databaseInfoConsolidateTables` end to end. Every table it will act on is
 *     an allowlisted SHARED table (`dd_ontology`, `matrix_ontology`, …), and
 *     the only way to make it do work is to let it renumber one of them in the
 *     suite database. Deliberately dropped: a test that finds the bug by
 *     committing the forbidden write is not a test.
 *   - `databaseInfoAnalyzeStatistics` end to end. The action takes NO
 *     parameters, so its table list cannot be injected, and it depends on the
 *     shared database's live `degradedTableNames()` — driving it would fire a
 *     real ANALYZE across shared tables. Provenance is gated by the arity
 *     assertion (`Function.length === 0`) instead: the moment someone gives the
 *     action an `options` parameter, the "the list is re-derived server-side,
 *     never taken from the client" invariant is at risk and this test fails.
 *
 * SCRATCH SURFACE (this file owns it, nothing else touches it): the table
 * `matrix_ts_test_zzc_consol`, cloned from `matrix_test`, plus its own
 * sequence. Section ids 905001-905999, tipos prefixed `zzc`. Dropped in
 * `afterAll`. No production table is written; raw SQL on a private clone
 * writes no `matrix_time_machine` tail, so there is none to sweep.
 */

import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
	analyzeStatisticsMessage,
	buildAnalyzeStatement,
	CONSOLIDATE_TABLES,
	consolidateOneTable,
	planConsolidation,
	widget,
} from '../../src/core/area_maintenance/widgets/database_info.ts';
import { sql } from '../../src/core/db/postgres.ts';

const SOURCE_FILE = `${import.meta.dir}/../../src/core/area_maintenance/widgets/database_info.ts`;
/** The scratch clone. Its name is an identifier, as consolidateOneTable demands. */
const CLONE = 'matrix_ts_test_zzc_consol';

/** Seed rows: id, section_id, section_tipo, tld, payload. */
interface SeedRow {
	id: number;
	sectionId: number;
	tipo: string;
	tld: string;
	payload: string;
}

async function reseed(rows: SeedRow[]): Promise<void> {
	await sql.unsafe(`DELETE FROM "${CLONE}"`, []);
	for (const row of rows) {
		await sql.unsafe(
			`INSERT INTO "${CLONE}" (id, section_id, section_tipo, tld, data)
			 VALUES ($1, $2, $3, $4, $5::text::jsonb)`,
			[row.id, row.sectionId, row.tipo, row.tld, JSON.stringify(row.payload)],
		);
	}
}

interface CloneRow {
	id: number;
	section_id: number;
	section_tipo: string;
	tld: string;
	payload: string;
}

async function readClone(): Promise<CloneRow[]> {
	const rows = (await sql.unsafe(
		`SELECT id, section_id, section_tipo, tld, data #>> '{}' AS payload
		 FROM "${CLONE}" ORDER BY id ASC`,
		[],
	)) as Record<string, unknown>[];
	return rows.map((row) => ({
		id: Number(row.id),
		section_id: Number(row.section_id),
		section_tipo: String(row.section_tipo),
		tld: String(row.tld),
		payload: String(row.payload),
	}));
}

async function nextSequenceValue(): Promise<number> {
	const rows = (await sql.unsafe(`SELECT nextval('${CLONE}_id_seq') AS n`, [])) as {
		n: number | string;
	}[];
	return Number(rows[0]?.n);
}

let dbAvailable = false;

beforeAll(async () => {
	try {
		await sql.unsafe('SELECT 1', []);
		dbAvailable = true;
	} catch {
		dbAvailable = false;
		return;
	}
	await sql.unsafe(`DROP TABLE IF EXISTS "${CLONE}" CASCADE`, []);
	// INCLUDING ALL copies the column defaults too, which means the clone would
	// otherwise share matrix_test's sequence — give it its OWN, since the whole
	// point of the setval half is that the table's sequence is reset.
	await sql.unsafe(`CREATE TABLE "${CLONE}" (LIKE matrix_test INCLUDING ALL)`, []);
	await sql.unsafe(`ALTER TABLE "${CLONE}" ADD COLUMN tld character varying`, []);
	await sql.unsafe(`CREATE SEQUENCE "${CLONE}_id_seq" OWNED BY "${CLONE}".id`, []);
	await sql.unsafe(
		`ALTER TABLE "${CLONE}" ALTER COLUMN id SET DEFAULT nextval('${CLONE}_id_seq')`,
		[],
	);
});

afterAll(async () => {
	if (!dbAvailable) return;
	await sql.unsafe(`DROP TABLE IF EXISTS "${CLONE}" CASCADE`, []);
});

// ---------------------------------------------------------------------------
// planConsolidation — pure
// ---------------------------------------------------------------------------

test('planConsolidation: a missing first id aborts the run', () => {
	expect(planConsolidation(null, 0)).toBe('error');
	expect(planConsolidation(undefined, 5)).toBe('error');
});

test('planConsolidation: first id inside the compact range is a no-op', () => {
	expect(planConsolidation(1, 100)).toBe('noop');
	expect(planConsolidation(100, 100)).toBe('noop'); // boundary: <=, not <
});

test('planConsolidation: first id past the row count needs consolidation', () => {
	expect(planConsolidation(101, 100)).toBe('consolidate');
});

test('planConsolidation: id 0 is a value, not an absence (quirk: pinned, not fixed)', () => {
	// The guard is `=== null || === undefined`, NOT truthiness. A falsy-but-real
	// first id must reach the arithmetic, where 0 <= 3 reads as already compact.
	expect(planConsolidation(0, 3)).toBe('noop');
});

// ---------------------------------------------------------------------------
// CONSOLIDATE_TABLES — the allowlist
// ---------------------------------------------------------------------------

test('CONSOLIDATE_TABLES is exactly the four ontology tables', () => {
	expect([...CONSOLIDATE_TABLES]).toEqual([
		'dd_ontology',
		'matrix_ontology',
		'matrix_ontology_main',
		'matrix_dd',
	]);
});

// ---------------------------------------------------------------------------
// buildAnalyzeStatement — the interpolation gate
// ---------------------------------------------------------------------------

test('buildAnalyzeStatement quotes the survivors and rejects the rest', () => {
	const { statement, rejected } = buildAnalyzeStatement([
		'matrix',
		'matrix"; DROP TABLE matrix; --',
		'1bad',
		'ok_table',
	]);
	expect(statement).toBe('ANALYZE "matrix", "ok_table"');
	expect(rejected).toEqual(['matrix"; DROP TABLE matrix; --', '1bad']);
	expect(rejected.length).toBe(2);
});

test('buildAnalyzeStatement issues no SQL at all when nothing survives', () => {
	expect(buildAnalyzeStatement(['1bad'])).toEqual({ statement: null, rejected: ['1bad'] });
	expect(buildAnalyzeStatement([])).toEqual({ statement: null, rejected: [] });
});

// ---------------------------------------------------------------------------
// analyzeStatisticsMessage — the three arms
// ---------------------------------------------------------------------------

test('analyzeStatisticsMessage: errors outrank everything', () => {
	expect(analyzeStatisticsMessage(0, ['boom'])).toBe('Warning. Request done with errors');
	expect(analyzeStatisticsMessage(7, ['boom'])).toBe('Warning. Request done with errors');
});

test('analyzeStatisticsMessage: an empty table set is a success', () => {
	expect(analyzeStatisticsMessage(0, [])).toBe(
		'OK. Table statistics were already healthy — nothing to analyze',
	);
});

test('analyzeStatisticsMessage: the count arm', () => {
	expect(analyzeStatisticsMessage(3, [])).toBe('OK. ANALYZE done on 3 table(s)');
});

// ---------------------------------------------------------------------------
// consolidateOneTable — the renumber, on the scratch clone
// ---------------------------------------------------------------------------

test('consolidateOneTable renumbers 1..n in tld order and resets the sequence', async () => {
	if (!dbAvailable) throw new Error('no database: this gate cannot run credless');
	// The tld order deliberately DISAGREES with the id order: id 10 sorts last.
	await reseed([
		{ id: 10, sectionId: 905001, tipo: 'zzc1', tld: 'c', payload: 'payload-c' },
		{ id: 40, sectionId: 905002, tipo: 'zzc2', tld: 'a', payload: 'payload-a' },
		{ id: 90, sectionId: 905003, tipo: 'zzc3', tld: 'b', payload: 'payload-b' },
	]);

	await consolidateOneTable(CLONE, 'tld, id');

	const rows = await readClone();
	// gapless 1..n, no row lost or duplicated
	expect(rows.map((row) => row.id)).toEqual([1, 2, 3]);
	expect(rows.length).toBe(3);
	// ordered by tld, NOT by the previous id (which would give c,a,b)
	expect(rows.map((row) => row.tld)).toEqual(['a', 'b', 'c']);
	// every (tld, payload) pair survives ATTACHED — a renumber that shuffled
	// payloads between rows would still pass the two assertions above
	expect(rows.map((row) => `${row.tld}:${row.payload}:${row.section_id}`)).toEqual([
		'a:payload-a:905002',
		'b:payload-b:905003',
		'c:payload-c:905001',
	]);
	// the sequence is now ABOVE the new max, so the next insert cannot collide
	expect(await nextSequenceValue()).toBeGreaterThan(3);
});

test('consolidateOneTable honours the other member of the closed order enum', async () => {
	if (!dbAvailable) throw new Error('no database: this gate cannot run credless');
	// section_tipo order disagrees with both the id order and the tld order.
	await reseed([
		{ id: 10, sectionId: 905011, tipo: 'zzc_c', tld: 'a', payload: 'p1' },
		{ id: 40, sectionId: 905012, tipo: 'zzc_a', tld: 'b', payload: 'p2' },
		{ id: 90, sectionId: 905013, tipo: 'zzc_b', tld: 'c', payload: 'p3' },
	]);

	await consolidateOneTable(CLONE, 'section_tipo, section_id');

	const rows = await readClone();
	expect(rows.map((row) => row.id)).toEqual([1, 2, 3]);
	expect(rows.map((row) => row.section_tipo)).toEqual(['zzc_a', 'zzc_b', 'zzc_c']);
	expect(rows.map((row) => row.payload)).toEqual(['p2', 'p3', 'p1']);
	expect(await nextSequenceValue()).toBeGreaterThan(3);
});

test('consolidateOneTable refuses a non-identifier table name', async () => {
	// The ORDER BY is a closed enum type, so the injection vector a caller could
	// still reach is the table name — it is re-checked inside the extraction.
	await expect(consolidateOneTable('matrix"; DROP TABLE matrix; --', 'tld, id')).rejects.toThrow(
		'refusing non-identifier table name',
	);
});

// ---------------------------------------------------------------------------
// Provenance + the rewire
// ---------------------------------------------------------------------------

test('analyze_statistics takes NO options — its table list is re-derived server-side', () => {
	const action = widget.apiActions?.analyze_statistics;
	if (action === undefined) throw new Error('database_info exposes no analyze_statistics action');
	// Function.length === 0: nothing from the client can reach the ANALYZE list.
	expect(action.length).toBe(0);
});

test('the inline copies are GONE from database_info.ts (extraction, not duplication)', async () => {
	const source = await Bun.file(SOURCE_FILE).text();

	// consolidate: the inline UPDATE/setval pair and the inline plan arithmetic
	expect(source).not.toContain('ORDER BY ${order})');
	expect(source).not.toContain('if (Number(firstId) <= rowCount) continue');
	expect(source).not.toContain('if (firstId === null || firstId === undefined) {');
	// exactly ONE renumber and ONE setval remain in the file — the extraction's
	expect(source.split('row_number() OVER').length - 1).toBe(1);
	// (the header's prose mention of setval is excluded by matching the SQL form)
	expect(source.split("setval('${table}_id_seq'").length - 1).toBe(1);

	// analyze: the inline identifier filter and the inline msg ladder
	// the identifier filter survives ONCE — inside buildAnalyzeStatement, not
	// also inline in the action (which is where it used to live)
	expect(source.split('const safe = tables.filter').length - 1).toBe(1);
	expect(source).not.toContain('const list = safe.map');
	expect(source.split('ANALYZE done on').length - 1).toBe(1);
	expect(source.split('nothing to analyze').length - 1).toBe(1);

	// and the call sites point at the extractions
	expect(source).toContain('await consolidateOneTable(table, order)');
	expect(source).toContain('buildAnalyzeStatement(tables)');
	expect(source).toContain('analyzeStatisticsMessage(tables.length, errors)');
	// the D14 behaviour change is real, not just documented
	expect(source).toContain('await withTransaction(async () => {');
});
