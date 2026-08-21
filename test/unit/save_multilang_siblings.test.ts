/**
 * OFFLINE unit twin of the S1-01 sibling-preservation guarantee.
 *
 * A translatable literal stores its language versions as SHARED-ID siblings in
 * one flat array; a single-language edit must operate on the CURRENT-LANG
 * slice only (PHP component_common::update_data_value :4152-4223). The S1-01
 * regression mapped over the FULL array by id — a routine lg-spa edit
 * DESTROYED the lg-eng sibling and stored aliased copies of the request-lang
 * object. That data-destroying class is covered by the oracle-gated parity
 * gate (test/parity/save_multilang_differential.test.ts), which SKIPS
 * entirely on a credless run — this file keeps the guarantee red-capable
 * OFFLINE (the oracle trap, S3-39): same seeded v7 dato shapes, saved through
 * the real saveComponentData, asserted against the raw stored column.
 *
 * Assertions per case:
 *  - the sibling-language item SURVIVES byte-identical (jsonb canonical text
 *    of the stored element, before vs after);
 *  - the total item count is unchanged / grows by exactly the new translation;
 *  - the id-less legacy branches the parity gate covers (key-resolution via
 *    get_id_from_key) reuse the sibling's shared id instead of minting one —
 *    mirrored for BOTH the 'update'+key and 'insert'+key branches.
 *
 * Scratch surfaces only: a section this file BUILDS, at high reserved
 * section_ids. Records seeded via updateMatrixRecord (no counter touched);
 * rows + TM audit rows cleaned before AND after.
 */
// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rules). The real
// ontology resolution under test (component_input_text, translatable → the
// `string` column) came from `numisdata16` on the shared `test2` section; the gate
// now BUILDS both (`zzmls`: one section on matrix_test through the test24
// matrix_table node + one translatable component_input_text), so the shapes it
// asserts on are ones it authored.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { MATRIX_JSONB_COLUMNS } from '../../src/core/db/matrix.ts';
import { updateMatrixRecord } from '../../src/core/db/matrix_write.ts';
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
const TEST_SECTION_TIPO = 'zzmls1';
/** input_text, translatable → 'string' column. */
const COMPONENT_TIPO = 'zzmls2';
/** Reserved high ids — clear of genuine test records and other suites' scratch. */
const EDIT_ID = 917211;
const UPDATE_KEY_ID = 917212;
const INSERT_KEY_ID = 917213;
const SCRATCH_IDS = [EDIT_ID, UPDATE_KEY_ID, INSERT_KEY_ID];
/**
 * An anchor record: dropSituation scopes its sweep to the sections the
 * situation declares records for, so the section needs one to be torn down whole.
 */
const ANCHOR_ID = 917210;

const SITUATION = situation({
	tld: 'zzmls',
	name: 'save_multilang_siblings',
	nodes: [
		{
			tipo: TEST_SECTION_TIPO,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Hermanos multilingües', 'lg-eng': 'Multilang siblings' },
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

/** Seed a fresh matrix_test record whose string column carries the given items. */
async function seedRecord(sectionId: number, items: Record<string, unknown>[]): Promise<void> {
	await cleanRecord(sectionId);
	const values: Record<string, unknown> = {};
	for (const column of MATRIX_JSONB_COLUMNS) values[column] = null;
	values.string = { [COMPONENT_TIPO]: items };
	expect(await updateMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, sectionId, values)).toBe(
		'inserted',
	);
}

/**
 * The stored elements of one language as jsonb CANONICAL TEXT — the
 * byte-identity probe: jsonb canonicalizes key order/spacing, so equal text
 * means the stored value is untouched.
 */
async function langElementTexts(sectionId: number, lang: string): Promise<string[]> {
	const rows = (await sql.unsafe(
		`SELECT elem::text AS t
		 FROM ${TEST_TABLE}, jsonb_array_elements(string->$1) AS elem
		 WHERE section_tipo = $2 AND section_id = $3 AND elem->>'lang' = $4`,
		[COMPONENT_TIPO, TEST_SECTION_TIPO, sectionId, lang],
	)) as { t: string }[];
	return rows.map((row) => row.t);
}

async function storedItems(
	sectionId: number,
): Promise<{ id: number | string; lang: string; value: string }[]> {
	const rows = (await sql.unsafe(
		`SELECT string->$1 AS items FROM ${TEST_TABLE}
		 WHERE section_tipo = $2 AND section_id = $3`,
		[COMPONENT_TIPO, TEST_SECTION_TIPO, sectionId],
	)) as { items: { id: number | string; lang: string; value: string }[] | null }[];
	return rows[0]?.items ?? [];
}

beforeAll(async () => {
	await ensureSituation(SITUATION);
	expect(await getMatrixTableFromTipo(TEST_SECTION_TIPO)).toBe(TEST_TABLE);
	for (const sectionId of SCRATCH_IDS) await cleanRecord(sectionId);
});

afterAll(async () => {
	for (const sectionId of SCRATCH_IDS) await cleanRecord(sectionId);
	expect(await dropSituation(SITUATION)).toBe(0);
});

describe('S1-01 offline twin — multi-lang siblings survive a single-lang save', () => {
	test('lg-spa edit preserves the shared-id lg-eng sibling BYTE-IDENTICAL, count unchanged', async () => {
		await seedRecord(EDIT_ID, [
			{ id: 1, lang: 'lg-eng', value: 'English original' },
			{ id: 1, lang: 'lg-spa', value: 'Original español' },
		]);
		const engBefore = await langElementTexts(EDIT_ID, 'lg-eng');
		expect(engBefore.length).toBe(1);

		const outcome = await saveComponentData({
			componentTipo: COMPONENT_TIPO,
			sectionTipo: TEST_SECTION_TIPO,
			sectionId: EDIT_ID,
			lang: 'lg-spa',
			changedData: [
				{ action: 'update', id: 1, value: { id: 1, lang: 'lg-spa', value: 'Editado español' } },
			],
			userId: -1,
		});
		expect(outcome.ok).toBe(true);

		// The lg-eng sibling SURVIVED, byte-identical (the S1-01 destruction).
		const engAfter = await langElementTexts(EDIT_ID, 'lg-eng');
		expect(engAfter).toEqual(engBefore);

		// Total item count UNCHANGED — no aliased request-lang duplicates.
		const after = await storedItems(EDIT_ID);
		expect(after.length).toBe(2);
		const spaItems = after.filter((item) => item.lang === 'lg-spa');
		expect(spaItems.length).toBe(1);
		expect(spaItems[0]?.value).toBe('Editado español');
		expect(Number(spaItems[0]?.id)).toBe(1); // shared id kept
	}, 30000);

	test("id-less 'update' + key resolves the shared sibling id (get_id_from_key branch)", async () => {
		await seedRecord(UPDATE_KEY_ID, [{ id: 1, lang: 'lg-eng', value: 'English original' }]);
		const engBefore = await langElementTexts(UPDATE_KEY_ID, 'lg-eng');
		expect(engBefore.length).toBe(1);

		// The client sends id:null + key (array position) for a first translation;
		// get_id_from_key resolves the sibling-language id at that position.
		const outcome = await saveComponentData({
			componentTipo: COMPONENT_TIPO,
			sectionTipo: TEST_SECTION_TIPO,
			sectionId: UPDATE_KEY_ID,
			lang: 'lg-spa',
			changedData: [
				{
					action: 'update',
					id: null,
					key: 0,
					value: { lang: 'lg-spa', value: 'Primera traducción' },
				},
			],
			userId: -1,
		});
		expect(outcome.ok).toBe(true);

		const after = await storedItems(UPDATE_KEY_ID);
		expect(after.length).toBe(2); // sibling + the new translation, nothing else
		// The translation shares the sibling's id 1 (no freshly minted id).
		const translation = after.find((item) => item.lang === 'lg-spa');
		expect(Number(translation?.id)).toBe(1);
		expect(translation?.value).toBe('Primera traducción');
		// The lg-eng source of the resolved id survives byte-identical.
		expect(await langElementTexts(UPDATE_KEY_ID, 'lg-eng')).toEqual(engBefore);
	}, 30000);

	test("id-less 'insert' + key reuses the shared id (insert branch of the key resolution)", async () => {
		await seedRecord(INSERT_KEY_ID, [{ id: 7, lang: 'lg-eng', value: 'Seven' }]);
		const engBefore = await langElementTexts(INSERT_KEY_ID, 'lg-eng');
		expect(engBefore.length).toBe(1);

		const outcome = await saveComponentData({
			componentTipo: COMPONENT_TIPO,
			sectionTipo: TEST_SECTION_TIPO,
			sectionId: INSERT_KEY_ID,
			lang: 'lg-ita',
			changedData: [{ action: 'insert', id: null, key: 0, value: { value: 'Sette' } }],
			userId: -1,
		});
		expect(outcome.ok).toBe(true);

		const after = await storedItems(INSERT_KEY_ID);
		expect(after.length).toBe(2);
		// PHP :4110-4126 — the inserted translation resolves id 7 from lg-eng at
		// key 0 instead of allocating a fresh counter id (which would orphan it).
		const translation = after.find((item) => item.lang === 'lg-ita');
		expect(Number(translation?.id)).toBe(7);
		expect(translation?.value).toBe('Sette');
		expect(await langElementTexts(INSERT_KEY_ID, 'lg-eng')).toEqual(engBefore);
	}, 30000);
});
