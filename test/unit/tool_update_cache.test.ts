/**
 * R5 gate: tool_update_cache. get_component_list enumerates a section's components
 * (reusing the verified get_section_elements_context) against the live DB.
 * update_cache regenerates stored component data via a re-save drive — verified
 * scratch-twin (create a record, regenerate, data intact, delete).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { updateMatrixKeyData } from '../../src/core/db/matrix_write.ts';
import { resolveMediaPathOptions } from '../../src/core/media/ontology_path.ts';
import { resolveOriginalSource } from '../../src/core/media/processing.ts';
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
		// Seed TWO languages, then regenerate the whole section for that component.
		// The regenerate must preserve BOTH translations, un-duplicated (set_data is
		// lang-sliced: a flat full-array re-save would re-stamp/duplicate them).
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
		await saveComponentData({
			componentTipo: SCRATCH_INPUT_TEXT,
			sectionTipo: SCRATCH_SECTION,
			sectionId: scratchId,
			lang: 'lg-spa',
			changedData: [
				{
					action: 'set_data',
					id: null,
					value: [{ value: 'semilla cache', lang: 'lg-spa', id: 1 }],
				},
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
		expect(stored).toContainEqual(expect.objectContaining({ value: 'cache seed', lang: 'lg-eng' }));
		expect(stored).toContainEqual(
			expect.objectContaining({ value: 'semilla cache', lang: 'lg-spa' }),
		);
		// Un-duplicated: one item per language, nothing re-stamped onto another lang.
		expect(stored).toHaveLength(2);
	});

	test('update_cache REPAIRS media: stale files_info is rebuilt from disk (scratch surface)', async () => {
		// test3 (matrix_test) is the scratch surface; test99 is its component_image.
		// Runs only where the record's original file is on this box — the media
		// repair is honest about file-less boxes (regenerate no-ops, scan rules).
		const MEDIA_SECTION = 'test3';
		const MEDIA_COMPONENT = 'test99';
		const MEDIA_ID = 1;
		const spec = mediaTypeOf('component_image');
		expect(spec).not.toBeNull();
		let table: string | null;
		try {
			table = await getMatrixTableFromTipo(MEDIA_SECTION);
		} catch {
			return; // DB unavailable
		}
		if (table === null) return;
		const record = await readMatrixRecord(table, MEDIA_SECTION, MEDIA_ID);
		if (record === null) return;
		const originalItems = readComponentItems(record, MEDIA_COMPONENT, 'component_image');
		if (!Array.isArray(originalItems) || originalItems.length === 0) return;
		const pathOpts = await resolveMediaPathOptions(MEDIA_COMPONENT, MEDIA_SECTION);
		const source = resolveOriginalSource(
			spec!,
			{
				componentTipo: MEDIA_COMPONENT,
				sectionTipo: MEDIA_SECTION,
				sectionId: MEDIA_ID,
				lang: null,
			},
			pathOpts,
		);
		if (source === null) return; // media files not on this box — nothing to assert

		try {
			// Corrupt the stored index the way the wrong-MEDIA_PATH bug did: empty it.
			const wiped = originalItems.map((item) => ({
				...(item as Record<string, unknown>),
				files_info: [],
			}));
			await updateMatrixKeyData(table, MEDIA_SECTION, MEDIA_ID, 'media', MEDIA_COMPONENT, wiped);

			const loaded = await getLoadedTool('tool_update_cache');
			const principal = await resolvePrincipal(-1);
			const res = await mustGet(loaded!.module.apiActions.update_cache, 'update_cache').handler({
				principal,
				userId: -1,
				background: true,
				options: {
					section_tipo: MEDIA_SECTION,
					components_selection: [{ tipo: MEDIA_COMPONENT }],
					sqo: {
						section_tipo: [MEDIA_SECTION],
						filter_by_locators: [{ section_tipo: MEDIA_SECTION, section_id: String(MEDIA_ID) }],
					},
				},
			});
			expect(res.result).toBe(true);
			expect(res.regenerated as number).toBeGreaterThanOrEqual(1);

			const repaired = readComponentItems(
				(await readMatrixRecord(table, MEDIA_SECTION, MEDIA_ID))!,
				MEDIA_COMPONENT,
				'component_image',
			) as Record<string, unknown>[];
			const filesInfo = repaired[0]?.files_info as Record<string, unknown>[];
			expect(Array.isArray(filesInfo)).toBe(true);
			expect(filesInfo.some((entry) => entry.file_exist === true)).toBe(true);
			// Sibling keys survive the repair (refreshStoredFilesInfo spread).
			expect(repaired[0]?.original_normalized_name).toBe(
				(originalItems[0] as Record<string, unknown>).original_normalized_name,
			);
		} finally {
			// Restore the record's stored media exactly as found (scratch hygiene).
			await updateMatrixKeyData(
				table,
				MEDIA_SECTION,
				MEDIA_ID,
				'media',
				MEDIA_COMPONENT,
				originalItems,
			);
		}
	});
});
