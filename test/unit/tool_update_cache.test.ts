/**
 * R5 gate: tool_update_cache. get_component_list enumerates a section's components
 * (reusing the verified get_section_elements_context) against the live DB.
 * update_cache regenerates stored component data via a re-save drive — verified
 * scratch-twin (create a record, regenerate, data intact, delete).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { readComponentItems } from '../../src/core/resolve/component_data.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import { mustGet } from '../helpers/assert.ts';

const SECTION = 'numisdata4';
const SCRATCH_SECTION = 'ich135';
const SCRATCH_INPUT_TEXT = 'ich137';
const scratchIds: number[] = [];
afterAll(async () => {
	for (const id of scratchIds) {
		try {
			await deleteSectionRecord(SCRATCH_SECTION, id, -1);
		} catch {
			/* best-effort */
		}
	}
});

describe('tool_update_cache module', () => {
	test('registers get_component_list (read) + update_cache (bg write)', async () => {
		const loaded = await getLoadedTool('tool_update_cache');
		expect(loaded).not.toBeNull();
		const actions = loaded!.module.apiActions;
		expect(Object.keys(actions).sort()).toEqual(['get_component_list', 'update_cache']);
		expect(mustGet(actions.get_component_list, 'get_component_list').permission).toBe('section');
		expect(mustGet(actions.update_cache, 'update_cache').permission).toBe('section');
		expect(loaded!.module.backgroundRunnable).toEqual(['update_cache']);
	});

	test('get_component_list returns the section components with regenerate_options', async () => {
		const loaded = await getLoadedTool('tool_update_cache');
		const principal = await resolvePrincipal(-1);
		const res = await mustGet(
			loaded!.module.apiActions.get_component_list,
			'get_component_list',
		).handler({
			principal,
			userId: -1,
			background: false,
			options: { ar_section_tipo: SECTION, context_type: 'simple', use_real_sections: true },
		});
		expect(res.result).not.toBe(false);
		const list = res.result as Record<string, unknown>[];
		expect(Array.isArray(list)).toBe(true);
		expect(list.length).toBeGreaterThan(0);
		// Every entry is a component and carries the regenerate_options key.
		for (const el of list) {
			expect(el.type).toBe('component');
			expect('regenerate_options' in el).toBe(true);
		}
	});

	test('update_cache rejects missing inputs (no bulk run on empty selection)', async () => {
		const loaded = await getLoadedTool('tool_update_cache');
		const principal = await resolvePrincipal(-1);
		const res = await mustGet(loaded!.module.apiActions.update_cache, 'update_cache').handler({
			principal,
			userId: -1,
			background: true,
			options: { section_tipo: SECTION, components_selection: [] },
		});
		expect(res.result).toBe(false);
		expect(res.errors).toContain('invalid_request');
	});

	test('update_cache regenerates a component (scratch-twin, real DB)', async () => {
		const loaded = await getLoadedTool('tool_update_cache');
		const principal = await resolvePrincipal(-1);
		let scratchId: number;
		try {
			scratchId = await createSectionRecord(SCRATCH_SECTION, -1);
		} catch {
			return; // DB unavailable
		}
		scratchIds.push(scratchId);
		// Seed a value, then regenerate the whole section for that component.
		await saveComponentData({
			componentTipo: SCRATCH_INPUT_TEXT,
			sectionTipo: SCRATCH_SECTION,
			sectionId: scratchId,
			lang: 'lg-eng',
			changedData: [
				{ action: 'set_data', id: null, value: [{ value: 'cache seed', lang: 'lg-eng', id: 1 }] },
			],
			userId: -1,
		});
		const res = await mustGet(loaded!.module.apiActions.update_cache, 'update_cache').handler({
			principal,
			userId: -1,
			background: true,
			options: {
				section_tipo: SCRATCH_SECTION,
				components_selection: [{ tipo: SCRATCH_INPUT_TEXT }],
				sqo: {
					section_tipo: [SCRATCH_SECTION],
					filter_by_locators: [{ section_tipo: SCRATCH_SECTION, section_id: String(scratchId) }],
				},
			},
		});
		expect(res.result).toBe(true);
		expect(res.regenerated as number).toBeGreaterThanOrEqual(1);
		// The value survives the regenerate (re-save is data-preserving).
		const table = await getMatrixTableFromTipo(SCRATCH_SECTION);
		const stored =
			readComponentItems(
				(await readMatrixRecord(table!, SCRATCH_SECTION, scratchId))!,
				SCRATCH_INPUT_TEXT,
				'component_input_text',
			) ?? [];
		expect(stored).toContainEqual(expect.objectContaining({ value: 'cache seed' }));
	});
});
