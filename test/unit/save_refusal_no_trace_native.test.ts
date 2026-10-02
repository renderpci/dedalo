/**
 * A REFUSED SAVE LEAVES NO TRACE (2026-09-29) — save_component.ts
 * runSaveAtomically.
 *
 * `saveComponentData` materializes a MISSING record (create-on-first-save, the
 * PHP set_dato upsert) BEFORE its change loop runs. A change the loop then
 * refuses with `{ok:false}` — `remove` of an id the component does not hold —
 * used to COMMIT that create: an empty record persisted, matrix_counter jumped
 * to the requested id, a NEW activity row described a creation the caller was
 * told failed. When saveComponentData owns the transaction the refusal now
 * rolls it back; under a caller's transaction the caller owns that choice.
 *
 * Covered here (1 fails without the fix; 2 fails with a savepoint fence):
 *  1. refused change on a missing record → ok:false, no row, counter
 *     unchanged, no TM row, no activity row;
 *  2. inside a CALLER's transaction the save joins without a savepoint (the
 *     caller owns the refusal's fate), and a create-on-save there still logs
 *     its NEW activity row;
 *  3. the legitimate create-on-save path still creates exactly one record.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

const TABLE = 'matrix_test';
const SECTION_TIPO = 'zzsref1';
/** component_input_text, translatable → 'string' column. */
const COMPONENT = 'zzsref2';
const ANCHOR_ID = 1;
/** Ids far above the anchor: a committed create would raise the counter to them. */
const REFUSED_ID = 918301;
const AMBIENT_REFUSED_ID = 918302;
const AMBIENT_OK_ID = 918303;
const CREATE_ID = 918304;
const ALL_IDS = [REFUSED_ID, AMBIENT_REFUSED_ID, AMBIENT_OK_ID, CREATE_ID];

const SITUATION = situation({
	tld: 'zzsref',
	name: 'save_refusal_no_trace',
	nodes: [
		{
			tipo: SECTION_TIPO,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Rechazo sin rastro', 'lg-eng': 'Refusal leaves no trace' },
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: COMPONENT,
			parent: SECTION_TIPO,
			model: 'component_input_text',
			is_translatable: true,
			term: { 'lg-spa': 'Texto', 'lg-eng': 'Text' },
		},
	],
	records: [{ section_tipo: SECTION_TIPO, section_id: ANCHOR_ID }],
});

async function rowCount(sectionId: number): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT 1 FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION_TIPO, sectionId],
	)) as unknown[];
	return rows.length;
}

async function counterValue(): Promise<number | null> {
	const rows = (await sql`SELECT value FROM matrix_counter WHERE tipo = ${SECTION_TIPO}`) as {
		value: number;
	}[];
	return rows[0] === undefined ? null : Number(rows[0].value);
}

async function tmRowCount(sectionId: number): Promise<number> {
	const rows = (await sql`
		SELECT count(*)::int AS n FROM matrix_time_machine
		WHERE section_tipo = ${SECTION_TIPO} AND section_id = ${sectionId}
	`) as { n: number }[];
	return rows[0]?.n ?? 0;
}

/** NEW activity rows naming a created record of this section at `sectionId`. */
async function activityRowCount(sectionId: number): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM matrix_activity
		 WHERE section_tipo = 'dd542'
		   AND misc->'dd551'->0->'value'->>'section_tipo' = $1
		   AND misc->'dd551'->0->'value'->>'section_id' = $2`,
		[SECTION_TIPO, String(sectionId)],
	)) as { n: number }[];
	return rows[0]?.n ?? 0;
}

async function cleanAll(): Promise<void> {
	for (const id of ALL_IDS) await cleanScratchRecord(SECTION_TIPO, id, TABLE);
	await sql.unsafe(
		`DELETE FROM matrix_activity WHERE section_tipo = 'dd542'
		 AND misc->'dd551'->0->'value'->>'section_tipo' = $1`,
		[SECTION_TIPO],
	);
}

/** The refused change: remove an item id the (missing) record cannot hold. */
function refusedRemove(sectionId: number) {
	return saveComponentData({
		componentTipo: COMPONENT,
		sectionTipo: SECTION_TIPO,
		sectionId,
		lang: 'lg-spa',
		changedData: [{ action: 'remove', id: 1, value: null }],
		userId: -1,
	});
}

function legitimateUpdate(sectionId: number, value: string) {
	return saveComponentData({
		componentTipo: COMPONENT,
		sectionTipo: SECTION_TIPO,
		sectionId,
		lang: 'lg-spa',
		changedData: [{ action: 'update', id: null, value: { lang: 'lg-spa', value } }],
		userId: -1,
	});
}

beforeAll(async () => {
	await ensureSituation(SITUATION);
	expect(await getMatrixTableFromTipo(SECTION_TIPO)).toBe(TABLE);
	await cleanAll();
});

afterAll(async () => {
	await cleanAll();
	expect(await dropSituation(SITUATION)).toBe(0);
});

describe('a refused save on a missing record leaves no trace', () => {
	test('owned transaction: ok:false, no row, counter unchanged, no TM row, no activity row', async () => {
		expect(await rowCount(REFUSED_ID)).toBe(0);
		const counterBefore = await counterValue();
		expect(counterBefore === null || counterBefore < REFUSED_ID).toBe(true);

		const outcome = await refusedRemove(REFUSED_ID);
		expect(outcome.ok).toBe(false);
		expect(outcome.message).toBe('remove: no item with id 1');

		expect(await rowCount(REFUSED_ID)).toBe(0);
		expect(await counterValue()).toBe(counterBefore);
		expect(await tmRowCount(REFUSED_ID)).toBe(0);
		expect(await activityRowCount(REFUSED_ID)).toBe(0);
	}, 30000);

	test("caller's transaction: the save joins it WITHOUT a savepoint — create-on-save stays attributable", async () => {
		// The refused save's writes stay in the caller's transaction — the caller
		// owns that choice (the CSV door throws on ok:false and rolls its row back).
		// The create's birth is decided by its insert statement (create_record.ts
		// createSectionRecord), so the NEW activity row is logged either way.
		const outcomes = await withTransaction(async () => {
			const refused = await refusedRemove(AMBIENT_REFUSED_ID);
			const kept = await legitimateUpdate(AMBIENT_OK_ID, 'kept-after-refusal');
			return { refused, kept };
		});
		expect(outcomes.refused.ok).toBe(false);
		expect(outcomes.kept.ok).toBe(true);
		expect(await rowCount(AMBIENT_OK_ID)).toBe(1);
		expect(await activityRowCount(AMBIENT_OK_ID)).toBe(1);
	}, 30000);

	test('create-on-first-save still materializes exactly one record', async () => {
		expect(await rowCount(CREATE_ID)).toBe(0);
		const outcome = await legitimateUpdate(CREATE_ID, 'materialized-on-save');
		expect(outcome.ok).toBe(true);
		expect(await rowCount(CREATE_ID)).toBe(1);
		expect(Number(await counterValue())).toBeGreaterThanOrEqual(CREATE_ID);
		expect(await tmRowCount(CREATE_ID)).toBeGreaterThan(0);
		// The probe the refusal test relies on DOES see a real create's NEW row.
		expect(await activityRowCount(CREATE_ID)).toBe(1);
	}, 30000);
});
