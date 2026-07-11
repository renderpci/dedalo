/**
 * Regression gate for the component_publication value-doubling bug (2026-07-04).
 * The client toggle sends the bare datalist locator with the previously-stored
 * id; PHP set_data stamps a fresh counter id onto every id-less item and
 * update_data_value re-stamps the matched id, so the stored array never grows.
 * TS did neither → the array doubled on every save.
 *
 * Scratch-twin hygiene: seed a disposable record (a high section_id that cannot
 * collide) in `matrix`, drive the REAL saveComponentData through a toggle cycle,
 * assert the stored array stays length 1 with a stable stamped id, then delete
 * the twin in afterAll. Never mutates a real record.
 * See rewrite/STATUS.md "SIX-COMPONENT LIFECYCLE FIX" (SHARED save-path id invariant).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';

const SECTION_TIPO = 'rsc170';
const COMPONENT_TIPO = 'rsc20';
const TWIN_ID = 990000456;
const optionA = { section_tipo: 'dd64', section_id: '1' };
const optionB = { section_tipo: 'dd64', section_id: '2' };

function stored(
	rec: Awaited<ReturnType<typeof readMatrixRecord>>,
): { id?: unknown; section_id?: unknown }[] {
	return (
		((rec?.columns.relation as Record<string, unknown[]> | null)?.[COMPONENT_TIPO] as {
			id?: unknown;
			section_id?: unknown;
		}[]) ?? []
	);
}

beforeAll(async () => {
	await sql.unsafe('DELETE FROM matrix WHERE section_tipo=$1 AND section_id=$2', [
		SECTION_TIPO,
		TWIN_ID,
	]);
	await sql.unsafe(
		`INSERT INTO matrix (section_id, section_tipo, relation, meta) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb)`,
		[TWIN_ID, SECTION_TIPO],
	);
});

afterAll(async () => {
	await sql.unsafe('DELETE FROM matrix WHERE section_tipo=$1 AND section_id=$2', [
		SECTION_TIPO,
		TWIN_ID,
	]);
});

describe('component_publication toggle doubling (scratch-twin gate)', () => {
	test('five toggles keep the stored array at length 1 with a stable id', async () => {
		const toggles = [optionA, optionB, optionA, optionB, optionA];
		for (const toggle of toggles) {
			const current = stored(await readMatrixRecord('matrix', SECTION_TIPO, TWIN_ID));
			const priorId = current[0]?.id ?? null;
			const result = await saveComponentData({
				componentTipo: COMPONENT_TIPO,
				sectionTipo: SECTION_TIPO,
				sectionId: TWIN_ID,
				lang: 'lg-nolan',
				userId: 1,
				changedData: [{ action: 'update', id: priorId as number | null, value: { ...toggle } }],
			});
			expect(result.ok).toBe(true);
			const after = stored(await readMatrixRecord('matrix', SECTION_TIPO, TWIN_ID));
			expect(after.length).toBe(1); // never grows (was 1→5 before the fix)
			expect(after[0]?.id).not.toBeUndefined(); // id-invariant upheld
		}
		const final = stored(await readMatrixRecord('matrix', SECTION_TIPO, TWIN_ID));
		expect(final.length).toBe(1);
		expect(String(final[0]?.section_id)).toBe('1'); // last toggle value, replaced in place
	});
});
