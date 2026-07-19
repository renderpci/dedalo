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

/** Regenerate options a model exposes (PHP get_regenerate_options); only media so far. */
function regenerateOptionsFor(model: string): Record<string, unknown> | null {
	if (isMediaModel(model)) {
		// Media models rebuild derivatives; the exact per-model option set (e.g.
		// delete_normalized_files) is ledgered — the flag presence is what the
		// client keys the "regenerate" affordance on.
		return { regenerable: true };
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
	const selection = (ctx.options.components_selection ?? []) as { tipo?: string }[];
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

	// Matched records: the client SQO (no limit) or the whole section.
	const sqoRaw = (ctx.options.sqo as Record<string, unknown> | undefined) ?? {
		section_tipo: [sectionTipo],
	};
	const sqo = sanitizeClientSqo(structuredClone(sqoRaw));
	(sqo as { limit?: unknown; offset?: unknown }).limit = null;
	(sqo as { limit?: unknown; offset?: unknown }).offset = 0;
	const built = await buildSearchSql(sqo, { principal: ctx.principal });
	const rows = (await sql.unsafe(built.sql, built.params as (string | number | null)[])) as {
		section_tipo: string;
		section_id: number;
	}[];

	let regenerated = 0;
	let mediaHeld = 0;
	const mediaErrors: string[] = [];
	for (const row of rows) {
		const table = (await getMatrixTableFromTipo(row.section_tipo)) ?? 'matrix';
		const record = await readMatrixRecord(table, row.section_tipo, row.section_id);
		if (record === null) continue;
		for (const sel of selection) {
			const tipo = String(sel.tipo ?? '');
			const model = tipo !== '' ? await getModelByTipo(tipo) : null;
			if (model === null) continue;
			if (isMediaModel(model)) {
				// MEDIA repair: the shared kernel (core/media/repair.ts) rebuilds
				// derivatives from the original where it is on this box and re-scans
				// files_info per item. The persist here is the established files_info
				// write-back (per-key jsonb, NO Time Machine entry — files_info is a
				// filesystem cache; media/tools/files_info_persist.ts discipline).
				const storedItems = (readComponentItems(record, tipo, model) ?? []) as unknown[];
				if (storedItems.length === 0) continue;
				const { refreshedItems, errors, heldShrinks } = await refreshMediaItems({
					componentTipo: tipo,
					sectionTipo: row.section_tipo,
					sectionId: row.section_id,
					model,
					items: storedItems,
					regenerate: true,
					// NEVER shrink from a tool sweep: on a partial-media box the rescan
					// would wipe the valid index of every record whose files are not
					// local (the 2026-07-19 incident). Shrinks need the ops script's
					// explicit --allow-shrink adjudication.
					holdShrink: true,
				});
				mediaErrors.push(...errors.map((message) => `${tipo}#${row.section_id}: ${message}`));
				mediaHeld += heldShrinks;
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
				});
			}
			regenerated += 1;
		}
	}
	return {
		result: true,
		msg: `OK. update_cache regenerated ${regenerated} component(s) across ${rows.length} record(s).${mediaErrors.length > 0 ? ` ${mediaErrors.length} media derivative rebuild(s) failed (files_info still refreshed).` : ''}${mediaHeld > 0 ? ` ${mediaHeld} stored media index(es) kept (files not on this server — shrink held).` : ''}`,
		errors: mediaErrors,
		regenerated,
		records: rows.length,
		media_errors: mediaErrors.length,
		media_held: mediaHeld,
	};
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
