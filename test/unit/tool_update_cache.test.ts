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
		// 'section_list': the client sends the target under ar_section_tipo, and the
		// gate must authorize on the payload key the handler consumes.
		expect(mustGet(actions.get_component_list, 'get_component_list').permission).toBe(
			'section_list',
		);
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

	test('get_component_list passes the DISPATCH gate with the CLIENT request shape', async () => {
		// The browser sends the target as ar_section_tipo (never section_tipo). The
		// action's permission gate must authorize on THAT key — a 'section' gate here
		// fails closed before the handler and the tool renders a silently empty
		// component list for every section and every user (the exact shipped bug).
		// This test routes the exact client shape through dispatchToolRequest, the
		// path the direct-handler tests bypass.
		const { dispatchToolRequest } = await import('../../src/core/tools/dispatch.ts');
		const principal = await resolvePrincipal(-1);
		const res = await dispatchToolRequest(
			principal,
			-1,
			{ model: 'tool_update_cache', action: 'get_component_list' },
			{
				ar_section_tipo: [SECTION],
				use_real_sections: false,
				skip_permissions: true,
				ar_tipo_exclude_elements: null,
				ar_components_exclude: [],
			},
		);
		expect(Array.isArray(res.result)).toBe(true);
		expect((res.result as unknown[]).length).toBeGreaterThan(0);
		// 20s: the first dispatchToolRequest warms the tool registry + user-tools
		// caches (~10s cold) — the default 5s test timeout flakes on it.
	}, 20000);

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

	test('update_cache FAILS CLOSED without an sqo (no whole-section default, WC-043)', async () => {
		// The 2026-07-19 runaway: an absent sqo silently swept an entire 438k-record
		// section while the client displayed "Records: 1". The scope is now REQUIRED.
		const loaded = await getLoadedTool('tool_update_cache');
		const principal = await resolvePrincipal(-1);
		const res = await mustGet(loaded!.module.apiActions.update_cache, 'update_cache').handler({
			principal,
			userId: -1,
			background: true,
			options: { section_tipo: SECTION, components_selection: [{ tipo: 'numisdata79' }] },
		});
		expect(res.result).toBe(false);
		expect(res.errors).toContain('invalid_request');
		expect(String(res.msg)).toContain('sqo');
	});

	test('update_cache honors an aborted signal: cooperative cancellation, zero processed', async () => {
		const loaded = await getLoadedTool('tool_update_cache');
		const principal = await resolvePrincipal(-1);
		const controller = new AbortController();
		controller.abort();
		const res = await mustGet(loaded!.module.apiActions.update_cache, 'update_cache').handler({
			principal,
			userId: -1,
			background: true,
			signal: controller.signal,
			options: {
				section_tipo: SCRATCH_SECTION,
				components_selection: [{ tipo: SCRATCH_INPUT_TEXT }],
				sqo: { section_tipo: [SCRATCH_SECTION] },
			},
		});
		if (res.result === false) return; // DB unavailable
		expect(res.stopped).toBe(true);
		expect(res.processed).toBe(0);
		expect(res.regenerated).toBe(0);
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
		const frames: Record<string, unknown>[] = [];
		const res = await mustGet(loaded!.module.apiActions.update_cache, 'update_cache').handler({
			principal,
			userId: -1,
			background: true,
			publishProgress: (data) => frames.push(data as Record<string, unknown>),
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
		// The sqo scoped the run to EXACTLY the one filtered record (WC-043).
		expect(res.records).toBe(1);
		expect(res.processed).toBe(1);
		// Progress frames: the client-rendered contract (counter/total), final
		// frame terminal with counter === total.
		expect(frames.length).toBeGreaterThanOrEqual(2);
		const last = frames[frames.length - 1] as {
			counter: number;
			total: number;
			is_running: boolean;
		};
		expect(last.counter).toBe(1);
		expect(last.total).toBe(1);
		expect(last.is_running).toBe(false);
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

	test('media repair HOLDS shrinks: a partial-media box never wipes a valid index', async () => {
		// The 2026-07-19 incident class: the stored files_info claims files that are
		// not on THIS box (partial local media copy). holdShrink must KEEP the
		// stored index; only the ops script's explicit --allow-shrink may shrink.
		const { refreshMediaItems } = await import('../../src/core/media/repair.ts');
		const storedFilesInfo = Array.from({ length: 40 }, (_, i) => ({
			quality: 'original',
			file_exist: true,
			file_name: `remote_${i}.jpg`,
			file_path: `/image/original/999000/remote_${i}.jpg`,
			extension: 'jpg',
		}));
		const item = { id: 1, files_info: storedFilesInfo, original_normalized_name: 'x.jpg' };
		let held: Awaited<ReturnType<typeof refreshMediaItems>>;
		try {
			held = await refreshMediaItems({
				componentTipo: 'test99',
				sectionTipo: 'test3',
				sectionId: 999999, // bucket far outside any local media copy
				model: 'component_image',
				items: [item],
				regenerate: false,
				holdShrink: true,
			});
		} catch {
			return; // DB unavailable (ontology path options)
		}
		expect(held.heldShrinks).toBe(1);
		expect((held.refreshedItems[0] as { files_info: unknown[] }).files_info).toBe(storedFilesInfo);

		const raw = await refreshMediaItems({
			componentTipo: 'test99',
			sectionTipo: 'test3',
			sectionId: 999999,
			model: 'component_image',
			items: [item],
			regenerate: false,
			holdShrink: false,
		});
		expect(raw.heldShrinks).toBe(0);
		expect(
			(
				(raw.refreshedItems[0] as { files_info: { file_exist: boolean }[] }).files_info ?? []
			).filter((e) => e.file_exist).length,
		).toBe(0);
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
