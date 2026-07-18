/**
 * `set_data` on a RELATION component NORMALIZES every locator — TS-NATIVE
 * write-path contract.
 *
 * `set_data` is the bulk-replace action (the whole data array at once — what a
 * component_radio_button sends when you pick an option). PHP's bulk-replace is NOT
 * a raw assignment: component_common::set_data (:997) runs validate_data_element
 * over EVERY element, the same normalizer the insert path uses — `type` filled,
 * `from_component_tipo` FORCED to the component's own tipo, section_id stringified,
 * paginated_key stripped, duplicates dropped.
 *
 * The TS port applied that normalizer on `insert` ONLY, so set_data persisted the
 * client's raw locator: a BARE {id, section_tipo, section_id}. Nothing looked broken
 * at rest — but every jsonb `@>` containment that names from_component_tipo then
 * missed the record. Live symptom (2026-07-14): setting a hierarchy's "Active" radio
 * (hierarchy4) stored a bare locator, so the request_config `field_value` active
 * filter — `relation @> '{"hierarchy4":[{…,"from_component_tipo":"hierarchy4"}]}'`
 * (relations/request_config/explicit.ts, PHP's exact SQO q_parsed) — matched ZERO
 * records, the hierarchy45 portal resolved an EMPTY target_sections, and the client
 * painted "Invalid target section tipo (empty)".
 *
 * Fixture: a scratch hierarchy1 twin; hierarchy4 is component_radio_button, a real
 * relation model whose locators target the si_no section (dd64/1 = YES).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { cleanScratchRecord, createScratchRecord } from '../helpers/test_data.ts';

const TABLE = 'matrix_hierarchy_main';
const SECTION_TIPO = 'hierarchy1';
const SECTION_ID = 900004;
/** component_radio_button — a relation model (locator → dd64 si_no). */
const RELATION_TIPO = 'hierarchy4';
const USER_ID = -1;

const cleanup = (): Promise<void> => cleanScratchRecord(SECTION_TIPO, SECTION_ID, TABLE);

async function storedLocators(): Promise<Record<string, unknown>[]> {
	const rows = (await sql.unsafe(
		`SELECT relation->$3 AS value FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION_TIPO, SECTION_ID, RELATION_TIPO],
	)) as { value: Record<string, unknown>[] | null }[];
	return rows[0]?.value ?? [];
}

/** The active-filter containment the portal's target_sections resolution runs. */
async function matchedByActiveFilter(): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM "${TABLE}" t
		 WHERE t.section_tipo = $1 AND t.section_id = $2
		   AND t.relation @> '{"hierarchy4":[{"section_tipo":"dd64","section_id":"1","from_component_tipo":"hierarchy4"}]}'::jsonb`,
		[SECTION_TIPO, SECTION_ID],
	)) as { n: number }[];
	return Number(rows[0]?.n ?? 0);
}

describe('set_data on a relation component', () => {
	beforeAll(async () => {
		await cleanup();
		await createScratchRecord(SECTION_TIPO, SECTION_ID, { relation: {} }, { table: TABLE });
	});
	afterAll(cleanup);

	test('stamps type + from_component_tipo on the client’s bare locator', async () => {
		// EXACTLY what the client sends when the "Yes" radio is picked.
		const result = await saveComponentData({
			componentTipo: RELATION_TIPO,
			sectionTipo: SECTION_TIPO,
			sectionId: SECTION_ID,
			lang: 'lg-nolan',
			userId: USER_ID,
			changedData: [
				{ action: 'set_data', value: [{ id: 1, section_tipo: 'dd64', section_id: 1 }] },
			],
		});
		expect(result.ok).toBe(true);

		const locators = await storedLocators();
		expect(locators).toHaveLength(1);
		expect(locators[0]).toMatchObject({
			id: 1,
			type: 'dd151',
			section_tipo: 'dd64',
			section_id: '1', // locator law: section_id persists as a STRING
			from_component_tipo: RELATION_TIPO,
		});
	});

	test('the stored locator satisfies the active-filter containment', async () => {
		// The whole point: a bare locator is invisible to this query, and an
		// invisible active hierarchy resolves an empty portal target_sections.
		expect(await matchedByActiveFilter()).toBe(1);
	});

	// THE LIVE PATH. A component_radio_button does NOT send set_data: its
	// build_changed_data_item emits action:'update' (client component_radio_button.js:183).
	// PHP normalizes it anyway because every action funnels through set_data →
	// validate_data_element; TS branches per action, so `update` needs the same stamp.
	// This is the exact save that stored the bare hierarchy4 locator on Afghanistan and
	// Andorra and emptied the portal's target_sections.
	test("update (the radio button's real action) normalizes the locator too", async () => {
		const result = await saveComponentData({
			componentTipo: RELATION_TIPO,
			sectionTipo: SECTION_TIPO,
			sectionId: SECTION_ID,
			lang: 'lg-nolan',
			userId: USER_ID,
			changedData: [
				{ action: 'update', id: 1, value: { id: 1, section_tipo: 'dd64', section_id: '1' } },
			],
		});
		expect(result.ok).toBe(true);

		const locators = await storedLocators();
		expect(locators).toHaveLength(1);
		expect(locators[0]).toMatchObject({
			type: 'dd151',
			from_component_tipo: RELATION_TIPO,
			section_id: '1',
		});
		expect(await matchedByActiveFilter()).toBe(1);
	});

	// An update REPLACES an item that is still in the array, so the duplicate guard must
	// not reject it as a duplicate of itself — that would silently swallow every toggle.
	test('update in place is not rejected as a self-duplicate', async () => {
		const result = await saveComponentData({
			componentTipo: RELATION_TIPO,
			sectionTipo: SECTION_TIPO,
			sectionId: SECTION_ID,
			lang: 'lg-nolan',
			userId: USER_ID,
			// toggle YES (dd64/1) → NO (dd64/2) on the same item id
			changedData: [
				{ action: 'update', id: 1, value: { id: 1, section_tipo: 'dd64', section_id: '2' } },
			],
		});
		expect(result.ok).toBe(true);

		const locators = await storedLocators();
		expect(locators).toHaveLength(1);
		expect(locators[0]).toMatchObject({ section_id: '2', from_component_tipo: RELATION_TIPO });
		expect(await matchedByActiveFilter()).toBe(0); // no longer "active"
	});

	test('duplicate locators in the same set_data are dropped', async () => {
		// PHP resets its locator lookup map on the first element of the call
		// (component_relation_common :1150-53), so dedup is scoped to the NEW array.
		const result = await saveComponentData({
			componentTipo: RELATION_TIPO,
			sectionTipo: SECTION_TIPO,
			sectionId: SECTION_ID,
			lang: 'lg-nolan',
			userId: USER_ID,
			changedData: [
				{
					action: 'set_data',
					value: [
						{ id: 1, section_tipo: 'dd64', section_id: 1 },
						{ id: 2, section_tipo: 'dd64', section_id: '1' }, // same locator, loose section_id
					],
				},
			],
		});
		expect(result.ok).toBe(true);
		expect(await storedLocators()).toHaveLength(1);
	});
});
