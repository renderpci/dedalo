/**
 * dd_grid value builders shared by info widgets (PHP component get_grid_value
 * → dd_grid_cell_object tree). Consumed by oh/descriptors; resolveGridColumns
 * is exported for the request-isolation gate (concurrency_interleave.test.ts).
 */

import { readMatrixRecord } from '../../../db/matrix.ts';
import { createOntologyCache } from '../../../ontology/cache_factory.ts';
import { getMatrixTableFromTipo, getModelByTipo, getNode } from '../../../ontology/resolver.ts';
import { resolveComponentValue } from '../../../resolve/component_data.ts';
import { currentApplicationLang } from '../../../resolve/request_lang.ts';
import { readWidgetComponentData } from './widget_common.ts';

/** dd_grid_cell_object serializes EVERY property, nulls included, in this order. */
export function ddGridCell(overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		id: null,
		class_list: null,
		type: null,
		label: null,
		row_count: null,
		column_count: null,
		column_labels: null,
		fields_separator: null,
		records_separator: null,
		cell_type: null,
		action: null,
		value: null,
		fallback_value: null,
		data: null,
		render_label: null,
		column: null,
		ar_columns_obj: null,
		features: null,
		model: null,
		...overrides,
	};
}

interface GridColumn {
	tipo: string;
	model: string;
	label: string;
}

const gridColumnsCache = createOntologyCache<string, GridColumn[]>();

/**
 * The DYNAMIC ddo columns of a relation component whose request_config uses
 * get_ddo_map {model:'section_map', columns:[['thesaurus','term']]} (PHP
 * resolve_get_ddo_map): for every resolved target section (hierarchy_types
 * expansion), the section_map term component(s), union-deduped in resolution
 * order.
 *
 * Exported for the request-isolation gate (concurrency_interleave.test.ts);
 * production callers go through buildPortalGridValue.
 */
export async function resolveGridColumns(
	componentTipo: string,
	ownerSectionTipo: string,
): Promise<GridColumn[]> {
	// Application lang resolved ONCE: the same value keys the cache AND labels
	// the columns, so an ALS-scope change mid-await cannot skew key vs value.
	// (context.lang is the DATA lang — labels use the application lang.)
	const appLang = currentApplicationLang();
	const cacheKey = `${componentTipo}_${ownerSectionTipo}_${appLang}`;
	const cached = gridColumnsCache.get(cacheKey);
	if (cached !== undefined) return cached;

	const node = await getNode(componentTipo);
	const requestConfig = (
		node?.properties as {
			source?: {
				request_config?: {
					sqo?: { section_tipo?: unknown };
					show?: { get_ddo_map?: { columns?: unknown[] } };
				}[];
			};
		} | null
	)?.source?.request_config?.[0];
	const columnsDecl = requestConfig?.show?.get_ddo_map?.columns;
	const columns: GridColumn[] = [];
	if (Array.isArray(columnsDecl)) {
		const { resolveSqoSectionTipos } = await import(
			'../../../relations/request_config/explicit.ts'
		);
		const sections = await resolveSqoSectionTipos(requestConfig?.sqo?.section_tipo, {
			ownerTipo: componentTipo,
			ownerSectionTipo,
			mode: 'edit',
			ownerIsSection: false,
		});
		const seen = new Set<string>();
		const { termByTipo } = await import('../../../ontology/labels.ts');
		for (const section of sections) {
			for (const rawColumn of columnsDecl) {
				// legacy bare-array columns are the path itself
				const path = Array.isArray(rawColumn)
					? rawColumn
					: ((rawColumn as { path?: unknown[] })?.path ?? []);
				if (path.length !== 2) continue;
				const { getSectionMapValue } = await import('../../../ontology/section_map.ts');
				const value = await getSectionMapValue(section, String(path[0]), String(path[1]));
				if (value === null || value === undefined || value === '') continue;
				for (const tipo of Array.isArray(value) ? value : [value]) {
					if (typeof tipo !== 'string' || seen.has(tipo)) continue;
					seen.add(tipo);
					columns.push({
						tipo,
						model: (await getModelByTipo(tipo)) ?? 'component_input_text',
						label: await termByTipo(tipo, appLang),
					});
				}
			}
		}
	}
	gridColumnsCache.set(cacheKey, columns);
	return columns;
}

/**
 * PHP component get_grid_value for ONE relation-component instance: a
 * dd_grid_cell_object 'column' whose value is one 'row' per stored locator,
 * each row holding one leaf cell per dynamic column resolved at the locator's
 * TARGET record. Text leaves carry the lang-resolved value strings; portal
 * leaves emit the empty nested-grid scaffold (row_count 1, column_count 0 —
 * fixture-pinned; nested portal DATA is uncovered scope, ledgered).
 */
export async function buildPortalGridValue(
	componentTipo: string,
	hostSectionTipo: string,
	hostSectionId: number | string,
	lang: string,
): Promise<{ grid: Record<string, unknown>; rows: unknown[] }> {
	const { termByTipo } = await import('../../../ontology/labels.ts');
	const columns = await resolveGridColumns(componentTipo, hostSectionTipo);
	const locators = (await readWidgetComponentData(
		hostSectionTipo,
		hostSectionId,
		componentTipo,
	)) as {
		section_tipo?: unknown;
		section_id?: unknown;
	}[];

	const outerColumnsObj: { id: string; group: string }[] = [];
	const seenColumnIds = new Set<string>();
	const rows: unknown[] = [];
	for (const locator of locators) {
		const targetSection = String(locator.section_tipo ?? '');
		const targetId = Number(locator.section_id ?? 0);
		const group = `${hostSectionTipo}_${componentTipo}_${targetSection}`;
		const targetTable = await getMatrixTableFromTipo(targetSection);
		const targetRecord =
			targetTable === null ? null : await readMatrixRecord(targetTable, targetSection, targetId);

		const cells: unknown[] = [];
		for (const [index, column] of columns.entries()) {
			if (column.model === 'component_portal') {
				// empty nested-portal scaffold (fixture-pinned shape)
				cells.push(
					ddGridCell({
						type: 'column',
						label: column.label,
						row_count: 1,
						column_count: 0,
						fields_separator: ', ',
						records_separator: ' | ',
						value: [],
						ar_columns_obj: [],
						model: column.model,
					}),
				);
				continue;
			}
			const columnId = `${group}_${column.tipo}`;
			if (!seenColumnIds.has(columnId)) {
				seenColumnIds.add(columnId);
				outerColumnsObj.push({ id: columnId, group });
			}
			let valueStrings: unknown[] = [];
			let fallbackStrings: unknown[] = [];
			if (targetRecord !== null) {
				const { value, fallbackValue } = await resolveComponentValue(
					targetRecord,
					column.tipo,
					column.model,
					lang,
				);
				valueStrings = (value ?? []).map((item) => (item as { value?: unknown })?.value);
				fallbackStrings = (fallbackValue ?? []).map((item) => (item as { value?: unknown })?.value);
			}
			cells.push(
				ddGridCell({
					type: 'column',
					label: column.label,
					// (!) the FIRST column renders with the records separator (' | ')
					// as its fields_separator — PHP dd_grid main-term convention
					fields_separator: index === 0 ? ' | ' : ', ',
					records_separator: ' | ',
					cell_type: 'text',
					value: valueStrings,
					fallback_value: fallbackStrings,
					ar_columns_obj: [{ id: columnId, group }],
					model: column.model,
				}),
			);
		}
		rows.push(ddGridCell({ type: 'row', value: cells }));
	}

	const grid = ddGridCell({
		type: 'column',
		label: await termByTipo(componentTipo, currentApplicationLang()),
		row_count: rows.length,
		column_count: outerColumnsObj.length,
		fields_separator: ', ',
		records_separator: ' | ',
		value: rows,
		ar_columns_obj: outerColumnsObj,
		model: (await getModelByTipo(componentTipo)) ?? 'component_portal',
	});
	return { grid, rows };
}
