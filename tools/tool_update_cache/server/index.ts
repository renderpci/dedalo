/**
 * tool_update_cache server module (PHP tool_update_cache).
 *
 * get_component_list: enumerate a section's components (the "simple" element
 *   context, reusing get_section_elements_context) so the client can offer them
 *   for cache regeneration. Each is annotated with its regenerate_options.
 * update_cache (backgroundRunnable): regenerate the STORED per-record data of the
 *   selected components across every matched record.
 *
 * SCOPE: PHP `regenerate_component()` is a per-model dispatch. Here:
 * - MEDIA components REPAIR the media (PHP parity) via the shared kernel
 *   core/media/repair.ts refreshMediaItems (regenerate:true): rebuild the
 *   derivative files from the original where it is present on this box
 *   (processing.ts regenerate twins — the same seams upload ingest uses),
 *   then re-scan the disk and persist a fresh files_info per item. A record
 *   whose stored files_info is stale (e.g. written while MEDIA_PATH pointed at
 *   the wrong tree) is repaired by exactly this. AV derivatives are an ASYNC
 *   transcode (jobs.ts) — update_cache refreshes the av files_info from disk
 *   but does not enqueue transcodes (that is tool_media_versions' job).
 * - Every other model regenerates via re-save (set_data of the current value),
 *   re-running the save path's derivation.
 */

import { isMediaModel } from '../../../src/core/concepts/media.ts';
import { getModelByTipo } from '../../../src/core/ontology/resolver.ts';
import { buildSectionElementsContext } from '../../../src/core/resolve/section_elements_context.ts';
import type {
	ToolActionContext,
	ToolResponse,
	ToolServerModule,
} from '../../../src/core/tools/module.ts';

/**
 * Regenerate options a model exposes (v6 component_media_common::
 * get_regenerate_options :3300). The copied client ITERATES this as a
 * descriptor array and switches on `type` (render_regenerate_options) —
 * returning any other shape renders a silently empty options panel.
 */
function regenerateOptionsFor(model: string): Record<string, unknown>[] | null {
	if (isMediaModel(model)) {
		return [{ name: 'delete_normalized_files', type: 'boolean', default: false }];
	}
	return null;
}

/** get_component_list: the section's components + their regenerate_options. */
async function getComponentList(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const elements = await buildSectionElementsContext(ctx.principal, {
			ar_section_tipo: ctx.options.ar_section_tipo as string | string[] | undefined,
			context_type: 'simple',
			use_real_sections: Boolean(ctx.options.use_real_sections),
			ar_components_exclude: ctx.options.ar_components_exclude as string[] | undefined,
		});
		const components = elements
			.filter((entry) => entry.type === 'component')
			.map((entry) => ({
				...entry,
				regenerate_options: regenerateOptionsFor(String(entry.model)),
			}));
		return { result: components, msg: 'OK. Request done', errors: [] };
	} catch (error) {
		return { result: false, msg: (error as Error).message, errors: [(error as Error).message] };
	}
}

/**
 * update_cache: regenerate the STORED data of the selected components across every
 * matched record. The generic regenerate is a re-save (set_data of the current
 * value) — this re-runs the save path's derivation (e.g. the relation_search
 * ancestor index for autocomplete_hi, counter reconciliation). MEDIA components
 * additionally need a file-derivative rebuild; that runs only where the media
 * files are present (ledgered on file-less boxes), so it is reported, not faked.
 */
async function updateCache(ctx: ToolActionContext): Promise<ToolResponse> {
	const sectionTipo = String(ctx.options.section_tipo ?? '');
	const selection = (ctx.options.components_selection ?? []) as {
		tipo?: string;
		regenerate_options?: unknown;
	}[];
	if (sectionTipo === '' || !Array.isArray(selection) || selection.length === 0) {
		return {
			result: false,
			msg: 'Error. section_tipo and a non-empty components_selection are required',
			errors: ['invalid_request'],
		};
	}
	const { sanitizeClientSqo } = await import('../../../src/core/concepts/sqo.ts');
	const { buildSearchSql } = await import('../../../src/core/search/sql_assembler.ts');
	const { sql } = await import('../../../src/core/db/postgres.ts');
	const { readMatrixRecord } = await import('../../../src/core/db/matrix.ts');
	const { readComponentItems } = await import('../../../src/core/resolve/component_data.ts');
	const { getMatrixTableFromTipo, getTranslatableByTipo } = await import(
		'../../../src/core/ontology/resolver.ts'
	);
	const { saveComponentData } = await import('../../../src/core/section/record/save_component.ts');
	const { config } = await import('../../../src/config/config.ts');
	const { groupItemsByLang } = await import('../../../src/core/tools/import_data.ts');
	const { refreshMediaItems } = await import('../../../src/core/media/repair.ts');
	const { updateMatrixKeyData } = await import('../../../src/core/db/matrix_write.ts');

	// Matched records: the client SQO, REQUIRED (no limit; pagination stripped so
	// the whole matched set — not just the visible page — is processed). There is
	// deliberately NO whole-section fallback: an absent sqo once silently swept an
	// entire 438k-record section that the client displayed as "Records: 1"
	// (2026-07-19 incident, WC-043). The client always sends its live list sqo —
	// an unfiltered list matches the whole section EXPLICITLY; scripted callers
	// pass { section_tipo: ['…'] } themselves.
	const sqoRaw = ctx.options.sqo as Record<string, unknown> | undefined;
	if (sqoRaw === null || typeof sqoRaw !== 'object' || Array.isArray(sqoRaw)) {
		return {
			result: false,
			msg: 'Error. sqo is required (the scope to act on — no whole-section default; WC-043)',
			errors: ['invalid_request'],
		};
	}
	const sqo = sanitizeClientSqo(structuredClone(sqoRaw));
	(sqo as { limit?: unknown; offset?: unknown }).limit = null;
	(sqo as { limit?: unknown; offset?: unknown }).offset = 0;
	const built = await buildSearchSql(sqo, { principal: ctx.principal });
	const rows = (await sql.unsafe(built.sql, built.params as (string | number | null)[])) as {
		section_tipo: string;
		section_id: number;
	}[];

	// Bulk-process record (v6 :64-92): one dd800 record per run, labeled
	// 'Update cache | <section> | <components>'. Its id tags any files the
	// delete_normalized_files option moves to deleted/<id>/ — created BEFORE any
	// record is touched.
	const { createSectionRecord } = await import('../../../src/core/section/record/create_record.ts');
	const { BULK_PROCESS_TIPOS } = await import('../../../src/core/concepts/section.ts');
	const { getTermByTipo } = await import('../../../src/core/ontology/resolver.ts');
	const labelLang = typeof ctx.options.lang === 'string' ? ctx.options.lang : 'lg-eng';
	const componentNames = await Promise.all(
		selection.map(async (sel) => {
			const tipo = String(sel.tipo ?? '');
			return `${(await getTermByTipo(tipo, labelLang)) ?? tipo}[${tipo}]`;
		}),
	);
	const sectionName = (await getTermByTipo(sectionTipo, labelLang)) ?? sectionTipo;
	const bulkProcessId = await createSectionRecord(BULK_PROCESS_TIPOS.section, ctx.userId);
	await saveComponentData({
		componentTipo: BULK_PROCESS_TIPOS.label,
		sectionTipo: BULK_PROCESS_TIPOS.section,
		sectionId: bulkProcessId,
		lang: 'lg-nolan',
		changedData: [
			{
				action: 'set_data',
				id: null,
				value: [
					{
						value: `Update cache | ${sectionName}[${sectionTipo}] | ${componentNames.join(', ')}`,
					},
				],
			},
		],
		userId: ctx.userId,
	});

	// Progress: the pfile frame the client's stream renderer already formats
	// (data.counter / data.total / data.current.section_id / data.n_components —
	// render_tool_update_cache.js compound_msg). Throttled: every publish is a
	// pfile write, so tick at most every PROGRESS_MS (the final row always ticks).
	const publish = ctx.publishProgress ?? (() => {});
	const PROGRESS_MS = 250;
	let lastPublish = 0;
	let counter = 0;

	let regenerated = 0;
	let mediaHeld = 0;
	let stopped = false;
	const mediaErrors: string[] = [];
	for (const row of rows) {
		// Cooperative cancellation (dd_utils_api::stop_process → mediaJobs.stop →
		// the executor's AbortSignal): finish the current record, never mid-write.
		if (ctx.signal?.aborted === true) {
			stopped = true;
			break;
		}
		counter++;
		const now = Date.now();
		if (counter === rows.length || now - lastPublish >= PROGRESS_MS) {
			lastPublish = now;
			publish({
				msg: 'Running tool_update_cache::update_cache',
				is_running: true,
				counter,
				total: rows.length,
				current: { section_id: row.section_id },
				n_components: selection.length,
			});
		}
		const table = (await getMatrixTableFromTipo(row.section_tipo)) ?? 'matrix';
		const record = await readMatrixRecord(table, row.section_tipo, row.section_id);
		if (record === null) continue;
		for (const sel of selection) {
			const tipo = String(sel.tipo ?? '');
			const model = tipo !== '' ? await getModelByTipo(tipo) : null;
			if (model === null) continue;
			if (isMediaModel(model)) {
				// MEDIA repair: the shared kernel (core/media/repair.ts) builds only the
				// MISSING derivatives (v6 regenerate_component parity — an existing file
				// is never re-encoded; image thumb always; envelope create-or-fix) and
				// re-scans files_info per item. The persist here is the established
				// files_info write-back (per-key jsonb, NO Time Machine entry —
				// files_info is a filesystem cache; media/tools/files_info_persist.ts).
				const storedItems = (readComponentItems(record, tipo, model) ?? []) as unknown[];
				if (storedItems.length === 0) continue;
				const regenerateOptions = (sel.regenerate_options ?? null) as {
					delete_normalized_files?: unknown;
				} | null;
				const { refreshedItems, errors, heldShrinks } = await refreshMediaItems({
					componentTipo: tipo,
					sectionTipo: row.section_tipo,
					sectionId: row.section_id,
					model,
					items: storedItems,
					regenerate: true,
					// v6 delete_normalized_files (the client's per-component regenerate
					// checkbox): move the normalized default-quality files to
					// deleted/<bulk id>/ before the rebuild.
					deleteNormalized: regenerateOptions?.delete_normalized_files === true,
					bulkProcessId,
					// NEVER shrink from a tool sweep: on a partial-media box the rescan
					// would wipe the valid index of every record whose files are not
					// local (the 2026-07-19 incident). Shrinks need the ops script's
					// explicit --allow-shrink adjudication.
					holdShrink: true,
				});
				mediaErrors.push(...errors.map((message) => `${tipo}#${row.section_id}: ${message}`));
				mediaHeld += heldShrinks;
				// v6 media_common regenerate (:2670-2705): restore a missing
				// original_file_name from the section's target_filename component
				// (properties.target_filename, e.g. rsc398 'Original file name'),
				// deriving original_normalized_name from it.
				await restoreOriginalNames(refreshedItems, tipo, record, row.section_tipo);
				await updateMatrixKeyData(
					table,
					row.section_tipo,
					row.section_id,
					'media',
					tipo,
					refreshedItems,
				);
				regenerated += 1;
				continue;
			}
			const items = readComponentItems(record, tipo, model) ?? [];
			const translatable = await getTranslatableByTipo(tipo);
			const componentLang = translatable ? config.menu.dataLang : 'lg-nolan';
			// The stored array carries EVERY language; set_data is lang-sliced
			// (PHP set_data_lang), so a translatable literal must be re-saved one
			// lang group at a time — a single flat save would re-stamp every
			// translation onto componentLang.
			const groups = groupItemsByLang(items, componentLang);
			if (groups.size === 0) groups.set(componentLang, []);
			for (const [lang, group] of groups) {
				await saveComponentData({
					componentTipo: tipo,
					sectionTipo: row.section_tipo,
					sectionId: row.section_id,
					lang,
					changedData: [{ action: 'set_data', id: null, value: group }],
					userId: ctx.userId,
					// v6 tool_update_cache (:45-47): Time Machine is DISABLED for the
					// whole run — a regenerate re-saves the same value, so per-row TM
					// versions would be pure bloat on a bulk sweep. The run stays
					// attributable through its dd800 record.
					saveTm: false,
					bulkProcessId,
				});
			}
			regenerated += 1;
		}
	}
	// The abort check runs BEFORE the counter increment, so `counter` always equals
	// the number of FULLY processed records — stopped or not.
	const processed = counter;
	const summaryMsg = stopped
		? `Stopped. update_cache regenerated ${regenerated} component(s) across ${processed} of ${rows.length} matched record(s) before the stop.`
		: `OK. update_cache regenerated ${regenerated} component(s) across ${rows.length} record(s).`;
	const msg = `${summaryMsg}${mediaErrors.length > 0 ? ` ${mediaErrors.length} media derivative rebuild(s) failed (files_info still refreshed).` : ''}${mediaHeld > 0 ? ` ${mediaHeld} stored media index(es) kept (files not on this server — shrink held).` : ''}`;
	// Final frame: the client renders the summary from the last pfile data.
	publish({
		msg,
		is_running: false,
		counter: processed,
		total: rows.length,
		n_components: selection.length,
	});
	return {
		result: true,
		msg,
		errors: mediaErrors,
		regenerated,
		records: rows.length,
		processed,
		stopped,
		bulk_process_id: bulkProcessId,
		media_errors: mediaErrors.length,
		media_held: mediaHeld,
	};
}

/**
 * v6 component_media_common::regenerate_component (:2670-2705): a media item
 * that lost its `original_file_name` recovers it from the section's
 * target-filename component (the component tipo named by the media component's
 * `properties.target_filename`, e.g. rsc398 'Original file name'), and derives
 * `original_normalized_name` (`<identifier>.<ext of the recovered name>`) when
 * that is missing too. Mutates the (already-cloned) refreshed items in place.
 */
async function restoreOriginalNames(
	refreshedItems: unknown[],
	componentTipo: string,
	record: { columns: Record<string, unknown> },
	sectionTipo: string,
): Promise<void> {
	const first = refreshedItems[0] as Record<string, unknown> | undefined;
	if (first === undefined || first === null || typeof first !== 'object') return;
	if (typeof first.original_file_name === 'string' && first.original_file_name !== '') return;

	const { getPropertiesByTipo, getModelByTipo: modelByTipo } = await import(
		'../../../src/core/ontology/resolver.ts'
	);
	const { readComponentItems: readItems } = await import(
		'../../../src/core/resolve/component_data.ts'
	);
	const properties = (await getPropertiesByTipo(componentTipo)) as {
		target_filename?: unknown;
	} | null;
	const targetTipo =
		typeof properties?.target_filename === 'string' ? properties.target_filename : null;
	if (targetTipo === null) return;
	const targetModel = await modelByTipo(targetTipo);
	if (targetModel === null) return;
	const targetItems = (readItems(record as never, targetTipo, targetModel) ?? []) as {
		value?: unknown;
	}[];
	const fileName = targetItems.find((item) => typeof item?.value === 'string' && item.value !== '')
		?.value as string | undefined;
	if (fileName === undefined) return;

	first.original_file_name = fileName;
	if (typeof first.original_normalized_name !== 'string' || first.original_normalized_name === '') {
		const extension = fileName.includes('.') ? (fileName.split('.').pop() ?? '') : '';
		const sectionId = (record as { columns: unknown } & { section_id?: unknown }).section_id;
		if (extension !== '' && sectionId !== undefined) {
			first.original_normalized_name = `${componentTipo}_${sectionTipo}_${sectionId}.${extension}`;
		}
	}
}

/** The section targets of a component-list request — the 'section_list' gate reads
 * these. The CLIENT sends the target section(s) as `ar_section_tipo` (string or
 * array), NEVER `section_tipo` — a plain 'section' gate here fails closed on every
 * request and the tool renders a silently empty component list. */
function componentListSectionTipos(options: Record<string, unknown>): unknown[] {
	const raw = options.ar_section_tipo;
	if (Array.isArray(raw)) return raw;
	return raw != null && raw !== '' ? [raw] : [];
}

export const tool: ToolServerModule = {
	name: 'tool_update_cache',
	apiActions: {
		get_component_list: {
			permission: 'section_list',
			minLevel: 1,
			sectionTipos: componentListSectionTipos,
			handler: getComponentList,
		},
		update_cache: { permission: 'section', minLevel: 2, handler: updateCache },
	},
	backgroundRunnable: ['update_cache'],
};
