/**
 * WRITE-PATH PROPAGATION GATE (P3, ERRORS_SPEC §8) — the component save door.
 *
 * `saveComponentData` runs the whole change application inside ONE
 * transaction (S1-02): row lock, record materialisation, item-id allocation,
 * data write, Time Machine row. CONVENTIONS §1 says every integrity failure
 * between "client asked to persist X" and COMMIT must PROPAGATE to the caller
 * and roll the transaction back — never be absorbed into a soft
 * `{ok:false}`. Now that the guards are TYPED (`internal.invariant`,
 * `request.invalid_data`, `record.external_write_refused`), this gate proves
 * the typing did not change that:
 *
 *   A. an existing scratch twin: an `insert` without id ALLOCATES an item id
 *      (a meta-counter UPDATE lands inside the tx), then the json_codec guard
 *      fires on the value → the DedaloError reaches the caller, the counter
 *      and the data column are byte-unchanged, no TM row was appended;
 *   B. a NOT-yet-materialised twin: the save CREATES the row inside the tx
 *      (PHP set_dato upsert), then fails → the row does not exist afterwards;
 *   C. the caller-fault refusals (`request.invalid_data`) throw the typed
 *      code and write nothing.
 *
 * Scratch pattern: test/unit/save_roundtrip.test.ts (numisdata6/1 cloned into
 * matrix_test under 'test2'; the ontology of numisdata16 = input_text →
 * string column drives the save). Cleaned before and after.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { type DedaloError, isDedaloError } from '../../src/core/errors/dedalo_error.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { cleanScratchRecord, createScratchRecord } from '../helpers/test_data.ts';

const TABLE = 'matrix_test';
const SECTION_TIPO = 'test2';
const EXISTING_ID = 900011;
const UNBORN_ID = 900012;
const COMPONENT = 'numisdata16';

async function refusalOf(run: Promise<unknown>): Promise<DedaloError> {
	try {
		await run;
	} catch (error) {
		if (isDedaloError(error)) return error;
		throw error;
	}
	throw new Error('expected a DedaloError, but the save succeeded');
}

async function tmRowCount(sectionId: number): Promise<number> {
	const rows = (await sql`
		SELECT count(*)::int AS n FROM matrix_time_machine
		WHERE section_tipo = ${SECTION_TIPO} AND section_id = ${sectionId}
	`) as { n: number }[];
	return rows[0]?.n ?? 0;
}

describe('save_component failure propagation (write paths never absorb integrity errors)', () => {
	beforeAll(async () => {
		await cleanScratchRecord(SECTION_TIPO, EXISTING_ID);
		await cleanScratchRecord(SECTION_TIPO, UNBORN_ID);
		const source = await readMatrixRecord('matrix', 'numisdata6', 1);
		await createScratchRecord(SECTION_TIPO, EXISTING_ID, source?.rawText ?? {}, { rawText: true });
	});
	afterAll(async () => {
		await cleanScratchRecord(SECTION_TIPO, EXISTING_ID);
		await cleanScratchRecord(SECTION_TIPO, UNBORN_ID);
	});

	test('A. allocation landed, then the json_codec guard fired: DedaloError out, counter + column + TM unchanged', async () => {
		const before = await readMatrixRecord(TABLE, SECTION_TIPO, EXISTING_ID);
		expect(before).not.toBeNull();
		const tmBefore = await tmRowCount(EXISTING_ID);

		const error = await refusalOf(
			saveComponentData({
				componentTipo: COMPONENT,
				sectionTipo: SECTION_TIPO,
				sectionId: EXISTING_ID,
				lang: 'lg-spa',
				// No id → allocateComponentItemId writes meta.<tipo>[0].count inside
				// the tx BEFORE the value is encoded; NaN is not JSON → the guard.
				changedData: [{ action: 'insert', value: { lang: 'lg-spa', value: Number.NaN } }],
				userId: -1,
			}),
		);
		expect(error.code).toBe('internal.invariant');
		expect(error.message).toContain('json_codec: non-finite number');

		const after = await readMatrixRecord(TABLE, SECTION_TIPO, EXISTING_ID);
		// The meta counter UPDATE that ran inside the tx is rolled back…
		expect(after?.rawText.meta ?? null).toBe(before?.rawText.meta ?? null);
		// …the data column is byte-identical, and no audit row was appended.
		expect(after?.rawText.string).toBe(before?.rawText.string);
		expect(await tmRowCount(EXISTING_ID)).toBe(tmBefore);
	});

	test('A-control (anti-vacuity): the SAME insert with a JSON-safe value does move the counter, the column and TM', async () => {
		const before = await readMatrixRecord(TABLE, SECTION_TIPO, EXISTING_ID);
		const tmBefore = await tmRowCount(EXISTING_ID);
		const outcome = await saveComponentData({
			componentTipo: COMPONENT,
			sectionTipo: SECTION_TIPO,
			sectionId: EXISTING_ID,
			lang: 'lg-spa',
			changedData: [{ action: 'insert', value: { lang: 'lg-spa', value: 'control' } }],
			userId: -1,
		});
		expect(outcome.ok).toBe(true);
		const after = await readMatrixRecord(TABLE, SECTION_TIPO, EXISTING_ID);
		expect(after?.rawText.meta ?? null).not.toBe(before?.rawText.meta ?? null);
		expect(after?.rawText.string).toContain('control');
		expect(await tmRowCount(EXISTING_ID)).toBe(tmBefore + 1);
	});

	test('B. the record materialised inside the tx is gone after the failure', async () => {
		expect(await readMatrixRecord(TABLE, SECTION_TIPO, UNBORN_ID)).toBeNull();
		const error = await refusalOf(
			saveComponentData({
				componentTipo: COMPONENT,
				sectionTipo: SECTION_TIPO,
				sectionId: UNBORN_ID,
				lang: 'lg-spa',
				changedData: [{ action: 'insert', value: { lang: 'lg-spa', value: Number.NaN } }],
				userId: -1,
			}),
		);
		expect(error.code).toBe('internal.invariant');
		expect(await readMatrixRecord(TABLE, SECTION_TIPO, UNBORN_ID)).toBeNull();
		expect(await tmRowCount(UNBORN_ID)).toBe(0);
	});

	test('C. caller faults are typed request.invalid_data and write nothing', async () => {
		const before = await readMatrixRecord(TABLE, SECTION_TIPO, EXISTING_ID);
		const notAnObject = await refusalOf(
			saveComponentData({
				componentTipo: COMPONENT,
				sectionTipo: SECTION_TIPO,
				sectionId: EXISTING_ID,
				lang: 'lg-spa',
				changedData: [{ action: 'insert', value: 'not an item' }],
				userId: -1,
			}),
		);
		expect(notAnObject.code).toBe('request.invalid_data');
		expect(notAnObject.message).toContain('insert value must be an object item');

		const unknownAction = await refusalOf(
			saveComponentData({
				componentTipo: COMPONENT,
				sectionTipo: SECTION_TIPO,
				sectionId: EXISTING_ID,
				lang: 'lg-spa',
				changedData: [{ action: 'not_a_real_action', value: null }],
				userId: -1,
			}),
		);
		expect(unknownAction.code).toBe('request.invalid_data');
		expect(unknownAction.coordinates?.action).toBe('not_a_real_action');

		const after = await readMatrixRecord(TABLE, SECTION_TIPO, EXISTING_ID);
		expect(after?.rawText.string).toBe(before?.rawText.string);
		expect(after?.rawText.meta ?? null).toBe(before?.rawText.meta ?? null);
	});
});
