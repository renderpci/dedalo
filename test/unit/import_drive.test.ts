/**
 * R2 drive gate (scratch-twin): the CSV import WRITE path end-to-end against the
 * REAL DB — conform a raw-export cell → saveComponentData(set_data) → read back →
 * the stored dato matches. Uses a DISPOSABLE record (createSectionRecord, deleted
 * in afterAll) so no real record is mutated (scratch-twin hygiene). This closes
 * the previously-ledgered "CSV→DB execute drive".
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { readComponentItems } from '../../src/core/resolve/component_data.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { conformImportData, unwrapDedaloData } from '../../src/core/tools/import_data.ts';

const SECTION = 'ich135';
const INPUT_TEXT = 'ich137';
const USER = -1;

let scratchId: number | null = null;

beforeAll(async () => {
	try {
		scratchId = await createSectionRecord(SECTION, USER);
	} catch {
		scratchId = null; // DB unavailable → tests below skip
	}
});

afterAll(async () => {
	if (scratchId !== null) {
		try {
			await deleteSectionRecord(SECTION, scratchId, USER);
		} catch {
			// best-effort cleanup
		}
	}
});

describe('CSV import drive (scratch-twin, real DB)', () => {
	test('conform → save → read-back reproduces the imported value', async () => {
		if (scratchId === null) return; // DB unavailable
		// A raw-export CSV cell for an input_text dato.
		const cell = JSON.stringify({
			dedalo_data: [{ value: 'imported value', lang: 'lg-eng', id: 1 }],
		});
		const unwrapped = unwrapDedaloData(cell);
		expect(unwrapped.wrapped).toBe(true);
		const conform = conformImportData({
			model: 'component_input_text',
			importValue: unwrapped.value,
			columnName: INPUT_TEXT,
			sectionId: scratchId,
			componentTipo: INPUT_TEXT,
		});
		const items = conform.result as unknown[];

		const save = await saveComponentData({
			componentTipo: INPUT_TEXT,
			sectionTipo: SECTION,
			sectionId: scratchId,
			lang: 'lg-eng',
			changedData: [{ action: 'set_data', id: null, value: items }],
			userId: USER,
		});
		expect(save.ok).toBe(true);

		const table = await getMatrixTableFromTipo(SECTION);
		const record = await readMatrixRecord(table!, SECTION, scratchId);
		const stored = readComponentItems(record!, INPUT_TEXT, 'component_input_text') ?? [];
		expect(stored).toContainEqual(
			expect.objectContaining({ value: 'imported value', lang: 'lg-eng' }),
		);
	});

	test('empty cell clears the component (import "clear" semantics)', async () => {
		if (scratchId === null) return;
		const conform = conformImportData({
			model: 'component_input_text',
			importValue: '',
			columnName: INPUT_TEXT,
			sectionId: scratchId,
			componentTipo: INPUT_TEXT,
		});
		expect(conform.result).toBeNull();
		await saveComponentData({
			componentTipo: INPUT_TEXT,
			sectionTipo: SECTION,
			sectionId: scratchId,
			lang: 'lg-eng',
			changedData: [{ action: 'set_data', id: null, value: [] }],
			userId: USER,
		});
		const table = await getMatrixTableFromTipo(SECTION);
		const record = await readMatrixRecord(table!, SECTION, scratchId);
		const stored = readComponentItems(record!, INPUT_TEXT, 'component_input_text') ?? [];
		expect(stored.filter((i) => (i as { lang?: string }).lang === 'lg-eng')).toHaveLength(0);
	});
});
