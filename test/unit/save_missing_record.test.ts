/**
 * S1-02 Wave-2 gate: the materialize-and-relock branch of saveComponentData
 * (src/core/section/record/save_component.ts, lockRows.length === 0).
 *
 * PHP set_dato UPSERTS: saving component data into a section_id whose matrix
 * row does not exist yet CREATES the record instead of erroring. The TS twin
 * materializes via createSectionRecord({conflictTolerant: true}) and RE-LOCKS
 * the fresh row — the Wave-2 correction, because the original upsert branch
 * locked NOTHING when a concurrent save materialized the row first, reopening
 * the exact lost-update window the S1-02 tx-wrap closed.
 *
 * Covered here:
 *  1. A save into a missing section_id creates the record — exactly ONE row —
 *     with the create metadata, and persists the value.
 *  2. Two CONCURRENT saves into the SAME missing section_id: both succeed
 *     (conflict-tolerant create + re-lock), exactly ONE row exists, and BOTH
 *     values are present (atomic-append inserts) with distinct item ids.
 */
// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rules). The gate
// drove the save through `numisdata16`, an install component whose ontology
// (component_input_text, translatable → `string` column) is what the write path
// resolves, and it borrowed the shared `test2` section — so its counter dance had
// to protect OTHER suites' scratch band. It now BUILDS its own situation
// (`zzsmiss`: one section on matrix_test through the test24 matrix_table node +
// one translatable component_input_text), which it owns outright: dropSituation
// sweeps the section's rows, TM rows and counter row, so the snapshot/restore of
// a shared counter is gone with the sharing that made it necessary.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

/**
 * Where the section's records live. STATED here and PROVEN in beforeAll
 * against `getMatrixTableFromTipo` — the test24 relation is what puts them in
 * `matrix_test`, and a gate that only assumed it would write to `matrix`.
 */
const TEST_TABLE = 'matrix_test';
const TEST_SECTION_TIPO = 'zzsmiss1';
/** component_input_text, translatable → 'string' column. */
const COMPONENT_TIPO = 'zzsmiss2';
/** Reserved high ids — the records this gate proves are MISSING pre-save. */
const SINGLE_ID = 917201;
const RACE_ID = 917202;
/**
 * An anchor record: dropSituation scopes its sweep to the sections the
 * situation declares records for, so the section needs one to be torn down
 * whole (which is also what removes the counter the explicit-id create raises).
 */
const ANCHOR_ID = 917200;

const SITUATION = situation({
	tld: 'zzsmiss',
	name: 'save_missing_record',
	nodes: [
		{
			tipo: TEST_SECTION_TIPO,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Guardar registro ausente', 'lg-eng': 'Save missing record' },
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: COMPONENT_TIPO,
			parent: TEST_SECTION_TIPO,
			model: 'component_input_text',
			is_translatable: true,
			term: { 'lg-spa': 'Texto', 'lg-eng': 'Text' },
		},
	],
	records: [{ section_tipo: TEST_SECTION_TIPO, section_id: ANCHOR_ID }],
});

function cleanRecord(sectionId: number): Promise<void> {
	return cleanScratchRecord(TEST_SECTION_TIPO, sectionId, TEST_TABLE);
}

async function readItems(sectionId: number): Promise<{ id: number; value: string }[]> {
	const rows = (await sql.unsafe(
		`SELECT string->$1 AS items FROM ${TEST_TABLE}
		 WHERE section_tipo = $2 AND section_id = $3`,
		[COMPONENT_TIPO, TEST_SECTION_TIPO, sectionId],
	)) as { items: { id: number; value: string }[] | null }[];
	return rows[0]?.items ?? [];
}

async function rowCount(sectionId: number): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT 1 FROM ${TEST_TABLE} WHERE section_tipo = $1 AND section_id = $2`,
		[TEST_SECTION_TIPO, sectionId],
	)) as unknown[];
	return rows.length;
}

beforeAll(async () => {
	await ensureSituation(SITUATION);
	expect(await getMatrixTableFromTipo(TEST_SECTION_TIPO)).toBe(TEST_TABLE);
	await cleanRecord(SINGLE_ID);
	await cleanRecord(RACE_ID);
});

afterAll(async () => {
	await cleanRecord(SINGLE_ID);
	await cleanRecord(RACE_ID);
	expect(await dropSituation(SITUATION)).toBe(0);
});

describe('S1-02 Wave-2 — save into a non-existent record materializes and re-locks', () => {
	test('save creates the missing record (exactly ONE row) and persists the value', async () => {
		expect(await rowCount(SINGLE_ID)).toBe(0); // truly missing pre-save

		const outcome = await saveComponentData({
			componentTipo: COMPONENT_TIPO,
			sectionTipo: TEST_SECTION_TIPO,
			sectionId: SINGLE_ID,
			lang: 'lg-spa',
			// The client's ordinary first-value save: an id-less 'update' appends;
			// the set_data safety net stamps a fresh counter id before the write.
			changedData: [
				{ action: 'update', id: null, value: { lang: 'lg-spa', value: 'materialized-on-save' } },
			],
			userId: -1,
		});
		expect(outcome.ok).toBe(true);

		// Exactly ONE row was created.
		expect(await rowCount(SINGLE_ID)).toBe(1);

		// The value landed, id-stamped and lang-stamped.
		const items = await readItems(SINGLE_ID);
		expect(items.length).toBe(1);
		expect(items[0]?.value).toBe('materialized-on-save');
		expect(Number(items[0]?.id)).toBeGreaterThan(0);

		// The row is a REAL created record (createSectionRecord ran): the data
		// column carries the fresh-record metadata with the saving user.
		const metadata = (await sql.unsafe(
			`SELECT data->>'created_by_user_id' AS created_by FROM ${TEST_TABLE}
			 WHERE section_tipo = $1 AND section_id = $2`,
			[TEST_SECTION_TIPO, SINGLE_ID],
		)) as { created_by: string | null }[];
		expect(Number(metadata[0]?.created_by)).toBe(-1);
	}, 30000);

	test('two CONCURRENT saves into the SAME missing section_id: both succeed, ONE row, both values', async () => {
		expect(await rowCount(RACE_ID)).toBe(0); // truly missing pre-race

		const saveValue = (value: string) =>
			saveComponentData({
				componentTipo: COMPONENT_TIPO,
				sectionTipo: TEST_SECTION_TIPO,
				sectionId: RACE_ID,
				lang: 'lg-spa',
				changedData: [{ action: 'insert', value: { lang: 'lg-spa', value } }],
				userId: -1,
			});

		// Both saves find no row; both try to materialize it. The loser's create
		// is conflict-tolerated and its re-lock queues behind the winner's COMMIT
		// — no throw, no second row, no lost item.
		const [first, second] = await Promise.all([saveValue('race-first'), saveValue('race-second')]);
		expect(first.ok).toBe(true);
		expect(second.ok).toBe(true);

		// Exactly ONE row exists.
		expect(await rowCount(RACE_ID)).toBe(1);

		// BOTH values are present (atomic-append inserts) with distinct ids.
		const items = await readItems(RACE_ID);
		const values = items.map((item) => item.value);
		expect(values).toContain('race-first');
		expect(values).toContain('race-second');
		expect(items.length).toBe(2);
		expect(new Set(items.map((item) => Number(item.id))).size).toBe(2);
	}, 30000);
});
