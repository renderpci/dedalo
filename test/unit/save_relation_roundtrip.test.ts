/**
 * Relation SAVE round-trip: portal/select locator add + remove through the
 * generic save path. Relations store locators as data items, so the same
 * update_data_value insert/remove machinery should apply — this test proves
 * (or disproves) that the write path already covers the relation family.
 *
 * Uses the matrix_test playground (real ontology section test2 → matrix_test).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { cleanScratchRecord, createScratchRecord } from '../helpers/test_data.ts';

const TEST_TABLE = 'matrix_test';
const TEST_SECTION_TIPO = 'test2';
const TEST_SECTION_ID = 900003;
// A real relation component of numisdata6 (component_publication → column relation).
const RELATION_TIPO = 'numisdata434';

function cleanup(): Promise<void> {
	return cleanScratchRecord(TEST_SECTION_TIPO, TEST_SECTION_ID);
}

describe('relation save round-trip (write-path family coverage)', () => {
	beforeAll(async () => {
		await cleanup();
		// Seed the record (upsert INSERT branch) with an empty relation column
		// carrying the component key.
		await createScratchRecord(TEST_SECTION_TIPO, TEST_SECTION_ID, {
			relation: { [RELATION_TIPO]: [] },
		});
	});
	afterAll(cleanup);

	test('insert a locator, then remove it by id', async () => {
		const locator = {
			type: 'dd151',
			section_id: '42',
			section_tipo: 'dd64',
			from_component_tipo: RELATION_TIPO,
		};
		const inserted = await saveComponentData({
			componentTipo: RELATION_TIPO,
			sectionTipo: TEST_SECTION_TIPO,
			sectionId: TEST_SECTION_ID,
			lang: 'lg-nolan',
			changedData: [{ action: 'insert', value: { ...locator } }],
			userId: -1,
		});
		expect(inserted.ok).toBe(true);

		let record = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		let items = (
			record?.columns.relation as Record<string, { id: number; section_id: string }[]>
		)?.[RELATION_TIPO];
		expect(items?.length).toBe(1);
		expect(items?.[0]?.section_id).toBe('42');
		const allocatedId = items?.[0]?.id;
		expect(allocatedId).toBeGreaterThan(0); // relation items get an allocated id too

		const removed = await saveComponentData({
			componentTipo: RELATION_TIPO,
			sectionTipo: TEST_SECTION_TIPO,
			sectionId: TEST_SECTION_ID,
			lang: 'lg-nolan',
			changedData: [{ action: 'remove', id: allocatedId, value: null }],
			userId: -1,
		});
		expect(removed.ok).toBe(true);

		record = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		items = (record?.columns.relation as Record<string, unknown[]>)?.[RELATION_TIPO] as {
			id: number;
			section_id: string;
		}[];
		expect(items?.length ?? 0).toBe(0);
	});
});
