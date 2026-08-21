/**
 * Relation SAVE round-trip: portal/select locator add + remove through the
 * generic save path. Relations store locators as data items, so the same
 * update_data_value insert/remove machinery should apply — this test proves
 * (or disproves) that the write path already covers the relation family.
 */
// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rules). The gate
// used to drive the save through `numisdata434`, an install component whose
// ontology (component_publication → `relation` column) is what the write path
// actually resolves. It now BUILDS that ontology itself (`zzsrel`: one section on
// matrix_test through the test24 matrix_table node + one component_publication
// node), so the resolution under test is a value this file authored.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { cleanScratchRecord, createScratchRecord } from '../helpers/test_data.ts';

const TEST_SECTION_TIPO = 'zzsrel1';
const TEST_SECTION_ID = 900003;
/** component_publication → `relation` column: the twin of the install node. */
const RELATION_TIPO = 'zzsrel2';

/**
 * The section and the relation component the save resolves through.
 * `relations: [{ tipo: 'test24' }]` is the matrix_table node whose term is
 * `matrix_test`: nothing this gate writes can land in the installation's
 * `matrix`. The publication component keeps its source's target relations
 * (`dd64` publication sections, `dd62`) — seed-shipped ontology, on every install.
 */
const SITUATION = situation({
	tld: 'zzsrel',
	name: 'save_relation_roundtrip',
	nodes: [
		{
			tipo: TEST_SECTION_TIPO,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Ida y vuelta de relación', 'lg-eng': 'Relation round-trip' },
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: RELATION_TIPO,
			parent: TEST_SECTION_TIPO,
			model: 'component_publication',
			term: { 'lg-spa': 'Público', 'lg-eng': 'Public' },
			relations: [{ tipo: 'dd64' }, { tipo: 'dd62' }],
		},
	],
	// An anchor record so the section is swept whole on teardown (dropSituation
	// scopes its sweep to the sections the situation declares records for).
	records: [{ section_tipo: TEST_SECTION_TIPO, section_id: 900001 }],
});

/**
 * Where the section's records live. STATED here and PROVEN in beforeAll
 * against `getMatrixTableFromTipo` — the test24 relation is what puts them in
 * `matrix_test`, and a gate that only assumed it would write to `matrix`.
 */
const TEST_TABLE = 'matrix_test';

function cleanup(): Promise<void> {
	return cleanScratchRecord(TEST_SECTION_TIPO, TEST_SECTION_ID, TEST_TABLE);
}

describe('relation save round-trip (write-path family coverage)', () => {
	beforeAll(async () => {
		await ensureSituation(SITUATION);
		expect(await getMatrixTableFromTipo(TEST_SECTION_TIPO)).toBe(TEST_TABLE);
		await cleanup();
		// Seed the record (upsert INSERT branch) with an empty relation column
		// carrying the component key.
		await createScratchRecord(TEST_SECTION_TIPO, TEST_SECTION_ID, {
			relation: { [RELATION_TIPO]: [] },
		});
	});
	afterAll(async () => {
		await cleanup();
		expect(await dropSituation(SITUATION)).toBe(0);
	});

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
			record?.columns.relation as Record<string, { id: number; section_id: number }[]>
		)?.[RELATION_TIPO];
		expect(items?.length).toBe(1);
		// int-canonical stored address (WC-2026-08-10-section-id-int-canonical)
		expect(items?.[0]?.section_id).toBe(42);
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
			section_id: number;
		}[];
		expect(items?.length ?? 0).toBe(0);
	});
});
