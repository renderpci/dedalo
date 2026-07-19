/**
 * indexation_grid — the thesaurus "show indexations" grid (PHP
 * core/dd_grid/class.indexation_grid.php + the per-model get_grid_value
 * cell renderers). For a thesaurus term, lists every record that indexes it
 * as a nested dd_grid_cell_object tree the client's view_indexation_dd_grid
 * renders (ts_object.js show_indexations → dd_grid).
 *
 * TS-NATIVE REINTERPRETATION (not a transliteration): PHP instantiates one
 * component object per cell per row, each re-reading its record through the
 * section_record machinery. Here every record involved is read ONCE — the
 * section_top rows are batch-prefetched per matrix table, portal targets are
 * memoized per request — and the cells are emitted by pure per-family
 * resolvers over those in-memory rows. The WIRE SHAPE is byte-parity with
 * PHP (gates: test/parity/indexation_grid_differential.test.ts + the media/
 * av-format corpus in indexation_grid_media_av_differential.test.ts — live
 * rsc29 thumb URLs and a seeded oh1/rsc167 av chain, captured 2026-07-10).
 *
 * PHP anchors (v7_php_frozen/master_dedalo):
 * - class.indexation_grid.php build_indexation_grid/get_grid_value/
 *   process_ddo_map/get_ar_section_top_tipo/get_ar_locators
 * - class.component_relation_common.php get_grid_value :311 (recursion,
 *   column_obj path grammar, row/column layout, row_count/column_count math)
 * - class.component_common.php export_value_to_grid_cell :1689 (atoms cell)
 * - component_text_area get_grid_value :100 + component_text_area_value.php
 *   (the indexation custom columns: default/pdf/av layouts)
 * - PHP QUIRK mirrored: indexation_grid:553 set_data([$locator]) resolves
 *   through the Accessors __call magic into $this->data, which get_data()
 *   never reads (it loads from the section record) — the "inject the tagged
 *   locator into the portal" branch is observably a NO-OP, so portals always
 *   render their record's own stored data. Verified against the live oracle
 *   (cu1_1 → oh1 portal renders empty).
 */

import { config } from '../../config/config.ts';
import { mediaTypeOf } from '../concepts/media.ts';
import { getActiveTlds } from '../db/dd_ontology.ts';
import { MATRIX_JSONB_COLUMNS, readMatrixRecord } from '../db/matrix.ts';
import { sql } from '../db/postgres.ts';
import { getLabels } from '../labels/catalog.ts';
import { additionalPath as mediaBucketPath } from '../media/path.ts';
import { termByTipo } from '../ontology/labels.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
	getNode,
	getTranslatableByTipo,
} from '../ontology/resolver.ts';
import { getTldFromTipo } from '../ontology/tld.ts';
import { buildRequestConfigForElement } from '../relations/request_config/build.ts';
import { currentApplicationLang, currentDataLang } from '../resolve/request_lang.ts';
import { truncateHtml } from '../resolve/truncate_html.ts';
import { findInverseReferenceLocators } from '../search/search_related.ts';
import type { Principal } from '../security/permissions.ts';
import { getIndexationListConfig } from './list_definitions/indexation_list.ts';

/** PHP DEDALO_RELATION_TYPE_INDEX_TIPO — the indexation relation type. */
const RELATION_TYPE_INDEX = 'dd96';

// ---------------------------------------------------------------------------
// dd_grid_cell_object — the wire shape (PHP class.dd_grid_cell_object.php).
// Every cell serializes ALL fields, null-defaulted, in this exact key order.
// ---------------------------------------------------------------------------

export interface GridCell {
	id: string | null;
	class_list: string | null;
	type: string | null;
	label: string | null;
	row_count: number | null;
	column_count: number | null;
	column_labels: unknown[] | null;
	fields_separator: string | null;
	records_separator: string | null;
	cell_type: string | null;
	action: unknown | null;
	value: unknown[] | null;
	fallback_value: unknown[] | null;
	data: unknown[] | null;
	render_label: boolean | null;
	column: string | null;
	ar_columns_obj: unknown[] | null;
	features: Record<string, unknown> | null;
	model: string | null;
}

function cell(partial: Partial<GridCell>): GridCell {
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
		...partial,
	};
}

// ---------------------------------------------------------------------------
// Working locator (PHP component_relation_index::parse_data :251 mapping of
// the search_related breakdown rows).
// ---------------------------------------------------------------------------

interface IndexLocator {
	type?: string;
	/** The REFERRING record (holds the relation entry). */
	section_tipo: string;
	section_id: string;
	component_tipo?: string;
	tag_id?: string;
	section_top_id?: string;
	section_top_tipo?: string;
	from_component_top_tipo?: string;
}

/** A processed ddo (PHP process_ddo_map output). */
interface GridDdo {
	tipo: string;
	section_tipo: string;
	parent: string;
	label: string;
	mode: string;
	model: string;
	class_list?: string;
	fields_separator?: string;
	records_separator?: string;
	format_columns?: string;
	[extra: string]: unknown;
}

// ---------------------------------------------------------------------------
// Per-request context: memoized record reads + shared lookups. This is the
// Bun-side performance core — one DB read per record for the whole grid.
// ---------------------------------------------------------------------------

interface GridContext {
	dataLang: string;
	applicationLang: string;
	uiLabels: Record<string, string>;
	activeTlds: ReadonlySet<string>;
	records: Map<string, Awaited<ReturnType<typeof readMatrixRecord>>>;
	/** Memoized default request_config ddo_maps for leaf relation ddos. */
	defaultDdoMaps: Map<string, GridDdo[]>;
	/** Memoized element tool contexts, keyed `${elementTipo}|${toolName}` (PHP structure_context->tools). */
	toolContexts: Map<string, Record<string, unknown>>;
}

async function readRecordOnce(
	ctx: GridContext,
	sectionTipo: string,
	sectionId: string | number,
): Promise<Awaited<ReturnType<typeof readMatrixRecord>>> {
	const key = `${sectionTipo}_${sectionId}`;
	if (ctx.records.has(key)) return ctx.records.get(key) ?? null;
	const table = await getMatrixTableFromTipo(sectionTipo);
	const record =
		table === null ? null : await readMatrixRecord(table, sectionTipo, Number(sectionId));
	ctx.records.set(key, record);
	return record;
}

/** Batch-prefetch all top records per matrix table (one query per table). */
async function prefetchRecords(
	ctx: GridContext,
	targets: { section_tipo: string; section_id: string }[],
): Promise<void> {
	const byTable = new Map<string, { section_tipo: string; section_id: string }[]>();
	for (const target of targets) {
		const key = `${target.section_tipo}_${target.section_id}`;
		if (ctx.records.has(key)) continue;
		const table = await getMatrixTableFromTipo(target.section_tipo);
		if (table === null) {
			ctx.records.set(key, null);
			continue;
		}
		const list = byTable.get(table) ?? [];
		list.push(target);
		byTable.set(table, list);
	}
	for (const [table, list] of byTable) {
		const tipos = list.map((t) => t.section_tipo);
		const ids = list.map((t) => Number(t.section_id));
		const projection = MATRIX_JSONB_COLUMNS.map((column) => `"${column}"`).join(', ');
		// Bun.sql array-param trap: bind arrays as JSON text (repo idiom).
		const rows = (await sql.unsafe(
			`SELECT id, section_id, section_tipo, ${projection}
			 FROM "${table}"
			 WHERE section_tipo IN (SELECT jsonb_array_elements_text($1::text::jsonb))
			   AND section_id IN (SELECT (jsonb_array_elements_text($2::text::jsonb))::bigint)`,
			[JSON.stringify(tipos), JSON.stringify(ids)],
		)) as Record<string, unknown>[];
		for (const row of rows) {
			const columns: Record<string, unknown> = {};
			for (const column of MATRIX_JSONB_COLUMNS) columns[column] = row[column];
			ctx.records.set(`${row.section_tipo}_${row.section_id}`, {
				id: row.id as number,
				section_id: row.section_id as number,
				section_tipo: row.section_tipo as string,
				columns,
				rawText: {},
			} as never);
		}
		// misses stay unreadable → null (PHP renders the row with empty cells)
		for (const target of list) {
			const key = `${target.section_tipo}_${target.section_id}`;
			if (!ctx.records.has(key)) ctx.records.set(key, null);
		}
	}
}

// ---------------------------------------------------------------------------
// Component items + lang slices (PHP get_data / get_data_lang /
// get_component_data_fallback — main lang → nolan → every project lang).
// ---------------------------------------------------------------------------

type DataItem = { lang?: string; value?: unknown; [extra: string]: unknown };

async function componentItems(
	ctx: GridContext,
	sectionTipo: string,
	sectionId: string | number,
	tipo: string,
	model: string,
): Promise<DataItem[]> {
	const column = getColumnNameByModel(model);
	if (column === null) return [];
	const record = await readRecordOnce(ctx, sectionTipo, sectionId);
	if (record === null) return [];
	const bag = record.columns[column as keyof typeof record.columns] as Record<
		string,
		DataItem[]
	> | null;
	const items = bag?.[tipo];
	return Array.isArray(items) ? items : [];
}

function sliceByLang(items: DataItem[], lang: string): DataItem[] {
	return items.filter((item) => (item?.lang ?? 'lg-nolan') === lang);
}

/** {data, fallback} the way the PHP export atoms partition them. */
async function langData(
	ctx: GridContext,
	items: DataItem[],
	tipo: string,
): Promise<{ data: DataItem[]; fallback: DataItem[] }> {
	if (items.length === 0) return { data: [], fallback: [] };
	const translatable = await getTranslatableByTipo(tipo);
	const effectiveLang = translatable ? ctx.dataLang : 'lg-nolan';
	const data = sliceByLang(items, effectiveLang);
	if (data.length > 0) return { data, fallback: [] };
	// PHP get_component_data_fallback: main lang → nolan → all langs
	const tried = new Set([effectiveLang]);
	const candidates = [config.menu.dataLang, 'lg-nolan', ...config.menu.projectsDefaultLangs];
	for (const candidate of candidates) {
		if (tried.has(candidate)) continue;
		tried.add(candidate);
		const fallbackSlice = sliceByLang(items, candidate);
		if (fallbackSlice.length > 0) return { data: [], fallback: fallbackSlice };
	}
	return { data: [], fallback: [] };
}

// ---------------------------------------------------------------------------
// Atom values per model family (PHP get_export_value semantics).
// ---------------------------------------------------------------------------

/** PHP component_date::data_item_to_value (modes date/range; sep '/'). */
function dateItemToValue(item: Record<string, unknown>, dateMode: string): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	const partToString = (part: unknown): string => {
		if (part === null || typeof part !== 'object') return '';
		const p = part as { year?: number; month?: number; day?: number };
		if (typeof p.year !== 'number') return '';
		if (p.day !== undefined && p.day !== null)
			return `${p.year}/${pad(p.month ?? 0)}/${pad(p.day)}`;
		if (p.month !== undefined && p.month !== null) return `${p.year}/${pad(p.month)}`;
		return String(p.year);
	};
	if (dateMode === 'range') {
		let value = '';
		if (item.start !== undefined && item.start !== null && typeof item.start === 'object') {
			value += partToString(item.start);
		}
		if (item.end !== undefined && item.end !== null && typeof item.end === 'object') {
			value += ` <> ${partToString(item.end)}`;
		}
		return value;
	}
	// 'date' + default: start ?? item itself
	const target = item.start !== undefined && item.start !== null ? item.start : item;
	return typeof target === 'object' ? partToString(target) : '';
}

interface AtomsResult {
	value: unknown[];
	fallbackValue: unknown[];
	cellType: string | null;
	/** Leaf-segment separators when atoms exist (null → grid defaults). */
	segFields: string | null;
	segRecords: string | null;
}

/**
 * The atoms of one scalar component (PHP <model>::get_export_value). Per
 * family: string models one atom per non-empty item ('' items kept as PHP
 * keeps them), date formats items, media ALWAYS emits one URL atom ('' when
 * no data), section_id emits the int id.
 */
async function resolveAtoms(
	ctx: GridContext,
	ddo: GridDdo,
	sectionTipo: string,
	sectionId: string | number,
): Promise<AtomsResult> {
	const model = ddo.model;
	const node = await getNode(ddo.tipo);
	const properties = (node?.properties ?? {}) as {
		records_separator?: string;
		fields_separator?: string;
		date_mode?: string;
	};

	// section_id: one int atom, cell_type 'section_id' (PHP component_section_id)
	if (model === 'component_section_id') {
		return {
			value: [Number(sectionId)],
			fallbackValue: [],
			cellType: 'section_id',
			segFields: null,
			segRecords: null,
		};
	}

	// media family: ALWAYS one atom — the thumb/posterframe URL when the record
	// STORES media data (PHP media_common/av/3d get_export_value: isset(get_data())
	// — even an empty stored array builds the URL), '' when the key is absent.
	// Gate: indexation_grid_media/av corpus (live rsc29 image cells + seeded
	// rsc35 posterframe cell, byte-verified vs the PHP oracle 2026-07-10).
	const mediaColumn = getColumnNameByModel(model);
	if (mediaColumn === 'media') {
		const record = await readRecordOnce(ctx, sectionTipo, sectionId);
		const bag = (record?.columns.media ?? null) as Record<string, unknown> | null;
		const stored = bag?.[ddo.tipo];
		const url =
			stored === undefined || stored === null
				? ''
				: await mediaCellUrl(ctx, ddo, model, sectionTipo, sectionId);
		return { value: [url], fallbackValue: [], cellType: 'img', segFields: null, segRecords: null };
	}

	const items = await componentItems(ctx, sectionTipo, sectionId, ddo.tipo, model);

	// date: nolan items → formatted values; separators = records_separator
	// resolution for BOTH (PHP component_date::get_export_value :266)
	if (model === 'component_date') {
		const sep = ddo.records_separator ?? properties.records_separator ?? ' | ';
		const dateMode = properties.date_mode ?? 'date';
		const value = items.map((item) =>
			item === null || item === undefined
				? ''
				: dateItemToValue(item as Record<string, unknown>, dateMode),
		);
		return {
			value,
			fallbackValue: [],
			cellType: value.length > 0 ? 'text' : null,
			segFields: value.length > 0 ? sep : null,
			segRecords: value.length > 0 ? sep : null,
		};
	}

	// string family default (input_text/text_area/number/email/iri…):
	// lang slice + fallback chain; one atom per item, raw value.
	const { data, fallback } = await langData(ctx, items, ddo.tipo);
	const toValues = (slice: DataItem[]): unknown[] =>
		slice
			.map((item) => item?.value)
			.filter((value) => value !== null && value !== undefined && value !== '');
	const value = toValues(data);
	const fallbackValue = toValues(fallback);
	// input_text-style segment: fields=records=(ddo.records ?? props.records ?? ' | ')
	const sep = ddo.records_separator ?? properties.records_separator ?? ' | ';
	const hasAtoms = value.length > 0 || fallbackValue.length > 0;
	return {
		value,
		fallbackValue,
		cellType: hasAtoms ? 'text' : null,
		segFields: hasAtoms ? sep : null,
		segRecords: hasAtoms ? sep : null,
	};
}

/**
 * A component's flat scalar value read the way PHP get_additional_path /
 * component_image::get_id read sibling components (get_value → export atoms
 * flat string; instantiated with lang NOLAN): the lg-nolan slice, falling back
 * through the langData chain, items joined with ' | ' (single-item in every
 * live corpus record — rsc33 'Directorio' / rsc34 image_id are one-value).
 */
async function flatSiblingValue(
	ctx: GridContext,
	componentTipo: string,
	sectionTipo: string,
	sectionId: string | number,
): Promise<string> {
	const model = (await getModelByTipo(componentTipo)) ?? '';
	const items = await componentItems(ctx, sectionTipo, sectionId, componentTipo, model);
	if (items.length === 0) return '';
	let slice = sliceByLang(items, 'lg-nolan');
	if (slice.length === 0) {
		const { data, fallback } = await langData(ctx, items, componentTipo);
		slice = data.length > 0 ? data : fallback;
	}
	return slice
		.map((item) => (typeof item?.value === 'string' ? item.value : ''))
		.filter((value) => value !== '')
		.join(' | ');
}

/**
 * PHP media_common::get_external_source — properties.external_source names an
 * IRI component whose stored item on THIS record (non-empty dataframe AND iri)
 * overrides the media URL entirely (get_url returns it verbatim). Null in
 * every other case.
 */
async function externalSourceUrl(
	ctx: GridContext,
	mediaTipo: string,
	sectionTipo: string,
	sectionId: string | number,
): Promise<string | null> {
	const properties = ((await getNode(mediaTipo))?.properties ?? {}) as {
		external_source?: unknown;
	};
	const iriTipo =
		typeof properties.external_source === 'string' ? properties.external_source : null;
	if (iriTipo === null) return null;
	const iriModel = (await getModelByTipo(iriTipo)) ?? 'component_iri';
	const first = (await componentItems(ctx, sectionTipo, sectionId, iriTipo, iriModel))[0] as
		| { dataframe?: unknown; iri?: unknown }
		| undefined;
	const dataframe = first?.dataframe;
	const dataframeNonEmpty =
		dataframe !== undefined &&
		dataframe !== null &&
		dataframe !== false &&
		dataframe !== '' &&
		!(Array.isArray(dataframe) && dataframe.length === 0);
	if (dataframeNonEmpty && typeof first?.iri === 'string' && first.iri !== '') {
		return first.iri;
	}
	return null;
}

/**
 * The media grid-cell URL (PHP <media>::get_export_value with the grid's
 * fixed posture: mode 'indexation_list' ≠ 'edit' → thumb/posterframe quality;
 * caller ≠ 'tool_export' → relative URL; test_file=false → no disk stat):
 * - image/pdf/svg (media_common :340): DEDALO_MEDIA_URL + folder +
 *   initial_media_path + '/' + thumb_quality + additional_path + '/' + id +
 *   '.' + default extension (get_media_url_dir collapses a leading '//').
 * - av/3d (component_av :253 / component_3d :200 → get_posterframe_url):
 *   DEDALO_MEDIA_URL + folder + '/posterframe' + additional_path + '/' + id +
 *   '.' + DEDALO_AV_POSTERFRAME_EXTENSION (no initial_media_path — PHP omits it).
 * - external_source wins over everything (get_url :2950).
 * - id (get_id :649): `{tipo}_{section_tipo}_{section_id}` (+ '_{data_lang}'
 *   when translatable); component_image (:158) first tries the external-source
 *   filename stem, then the properties.image_id sibling value.
 * - additional_path (:753): properties.additional_path sibling value (leading
 *   slash forced / trailing stripped; empty → fall through) else the
 *   max_items_folder bucket.
 */
async function mediaCellUrl(
	ctx: GridContext,
	ddo: GridDdo,
	model: string,
	sectionTipo: string,
	sectionId: string | number,
): Promise<string> {
	const spec = mediaTypeOf(model);
	if (spec === null) {
		// Unknown media-column model: fail LOUD (repo rule) rather than guess.
		throw new Error(
			`indexation_grid: no media spec for model '${model}' (${ddo.tipo} @ ${sectionTipo}/${sectionId})`,
		);
	}
	const externalSource = await externalSourceUrl(ctx, ddo.tipo, sectionTipo, sectionId);

	// PHP get_url returns the external source verbatim before any composition.
	if (externalSource !== null && model !== 'component_av' && model !== 'component_3d') {
		return externalSource;
	}

	// id (PHP get_id / component_image::get_id)
	let id: string | null = null;
	if (model === 'component_image' && externalSource !== null) {
		// external filename stem (pathinfo($external_source)['filename'])
		const base = externalSource.split('/').pop() ?? '';
		const dot = base.lastIndexOf('.');
		const stem = dot > 0 ? base.slice(0, dot) : base;
		if (stem !== '') id = stem;
	}
	if (id === null && model === 'component_image') {
		const properties = ((await getNode(ddo.tipo))?.properties ?? {}) as { image_id?: unknown };
		if (typeof properties.image_id === 'string' && properties.image_id !== '') {
			const value = (
				await flatSiblingValue(ctx, properties.image_id, sectionTipo, sectionId)
			).trim();
			if (value !== '') id = value;
		}
	}
	if (id === null) {
		id = `${ddo.tipo}_${sectionTipo}_${sectionId}`;
		if (await getTranslatableByTipo(ddo.tipo)) id += `_${ctx.dataLang}`;
	}

	// additional_path (PHP get_additional_path)
	const properties = ((await getNode(ddo.tipo))?.properties ?? {}) as {
		additional_path?: unknown;
		max_items_folder?: unknown;
	};
	let bucket = '';
	if (typeof properties.additional_path === 'string' && properties.additional_path !== '') {
		let value = (
			await flatSiblingValue(ctx, properties.additional_path, sectionTipo, sectionId)
		).trim();
		if (!value.startsWith('/')) value = `/${value}`;
		if (value.endsWith('/')) value = value.slice(0, -1);
		bucket = value; // '' when the sibling is empty (PHP empty() → bucket fallback)
	}
	if (bucket === '') {
		const rawMax = properties.max_items_folder;
		const maxItemsFolder =
			typeof rawMax === 'number'
				? rawMax
				: typeof rawMax === 'string'
					? Number(rawMax) || null
					: null;
		bucket = mediaBucketPath(Number(sectionId), maxItemsFolder);
	}

	const mediaUrlBase = `/dedalo/${config.mediaDir}`;

	// av/3d: posterframe grammar (no initial_media_path, no '//' cleanup)
	if (model === 'component_av' || model === 'component_3d') {
		return `${mediaUrlBase}${spec.folder}/posterframe${bucket}/${id}.${config.media.avExtras.posterframeExtension}`;
	}

	// image/pdf/svg: thumb-quality media dir (PHP get_media_url_dir)
	const { resolveMediaPathOptions } = await import('../media/ontology_path.ts');
	const pathOpts = await resolveMediaPathOptions(ddo.tipo, sectionTipo);
	const quality = config.media.thumb.quality;
	let dir = `${mediaUrlBase}${spec.folder}${pathOpts.initialMediaPath}/${quality}${bucket}`;
	dir = dir.replace(/^\/\//, '/');
	return `${dir}/${id}.${spec.defaultExtension}`;
}

/**
 * One registered tool's simple context for an element, with the element's
 * properties.tool_config[toolName] enriched in (PHP get_structure_context →
 * common::get_tools + the tool_config enrichment, the exact objects the av
 * text_area columns embed). `{}` when the tool does not apply to the element
 * (PHP array_find(...) ?? new stdClass()). Memoized per element+tool.
 */
async function elementToolContext(
	ctx: GridContext,
	elementTipo: string,
	elementSectionTipo: string,
	toolName: string,
): Promise<Record<string, unknown>> {
	const key = `${elementTipo}|${elementSectionTipo}|${toolName}`;
	const cached = ctx.toolContexts.get(key);
	if (cached !== undefined) return cached;
	let context: Record<string, unknown> = {};
	try {
		const model = (await getModelByTipo(elementTipo)) ?? '';
		const properties = ((await getNode(elementTipo))?.properties ?? {}) as {
			tool_config?: Record<string, unknown>;
		};
		const toolConfigBag = properties.tool_config ?? {};
		const { getElementTools } = await import('../tools/registry.ts');
		const elementTools = await getElementTools({
			model,
			tipo: elementTipo,
			isComponent: model.startsWith('component_'),
			translatable: await getTranslatableByTipo(elementTipo),
			toolConfigKeys: Object.keys(toolConfigBag),
		});
		const tool = elementTools.tools.find((entry) => entry.name === toolName);
		if (tool !== undefined) {
			// PHP key order (tool ddo serialization puts `properties` after
			// `model`) — reordered locally for byte parity on the grid wire.
			context = {
				typo: tool.typo,
				type: tool.type,
				section_tipo: tool.section_tipo,
				mode: tool.mode,
				model: tool.model,
				...(tool.properties !== undefined ? { properties: tool.properties } : {}),
				label: tool.label,
				css: tool.css,
				name: tool.name,
				icon: tool.icon,
				show_in_inspector: tool.show_in_inspector,
				show_in_component: tool.show_in_component,
			};
			const rawToolConfig = toolConfigBag[toolName];
			if (rawToolConfig !== undefined && rawToolConfig !== null) {
				const { enrichToolConfig } = await import('../tools/section_tool_context.ts');
				context.tool_config = await enrichToolConfig(
					rawToolConfig,
					elementTipo,
					elementSectionTipo,
				);
			}
		}
	} catch (error) {
		// PHP tolerates a tool context that cannot build (logs, renders {}).
		console.error(`[indexation_grid] tool context '${toolName}' for ${elementTipo} failed:`, error);
		context = {};
	}
	ctx.toolContexts.set(key, context);
	return context;
}

/** PHP component_common::export_value_to_grid_cell (:1689). */
async function atomsCell(
	ctx: GridContext,
	ddo: GridDdo,
	sectionTipo: string,
	sectionId: string | number,
	columnObj: Record<string, unknown>,
): Promise<GridCell> {
	const atoms = await resolveAtoms(ctx, ddo, sectionTipo, sectionId);
	const out = cell({
		type: 'column',
		label: ddo.label,
		cell_type: atoms.cellType ?? 'text',
		ar_columns_obj: [columnObj],
		fields_separator: ddo.fields_separator ?? atoms.segFields ?? ', ',
		records_separator: ddo.records_separator ?? atoms.segRecords ?? ' | ',
		value: atoms.value,
		fallback_value: atoms.fallbackValue,
		model: ddo.model,
	});
	if (ddo.class_list !== undefined) out.class_list = ddo.class_list;
	if (out.cell_type === 'section_id') out.row_count = 1;
	return out;
}

// ---------------------------------------------------------------------------
// text_area indexation custom columns (component_text_area_value.php).
// ---------------------------------------------------------------------------

/** PHP TR::get_mark_pattern indexIn/indexOut with id + the (.*) fragment. */
function fragmentFromTag(
	tagId: string,
	rawText: string,
): {
	text: string;
	tag_in_pos: number | null;
	tag_out_pos: number | null;
	tag_in: string | null;
	tag_out: string | null;
} | null {
	if (tagId === '' || rawText === '') return null;
	const escaped = tagId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(
		`(\\[index-[a-z]-${escaped}(-[^-]{0,22}-data:.*?:data)?\\])(.*)(\\[\\/index-[a-z]-${escaped}(-[^-]{0,22}-data:.*?:data)?\\])`,
	);
	const match = pattern.exec(rawText);
	if (match === null || match[3] === undefined) return null;
	let text = match[3];
	if (text !== '') {
		text = deleteMarks(text);
		text = decodeHtmlSpecialChars(text);
	}
	const tagInPos = match.index;
	return {
		text,
		tag_in_pos: tagInPos,
		tag_out_pos: tagInPos + match[0].length,
		tag_in: match[1] ?? null,
		tag_out: match[4] ?? null,
	};
}

/** PHP TR::deleteMarks — strip every Dédalo [tag] mark family. */
function deleteMarks(text: string): string {
	return text
		.replace(/\[TC_[0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}(\.[0-9]{1,3})?_TC\]/g, '')
		.replace(
			/\[\/?(index|geo|page|note|draw|reference)-[a-z]-[0-9]{1,6}(-[^-]{0,22})?(-data:.*?:data)?\]/g,
			'',
		)
		.replace(/\[\/?person-[a-z]-[0-9]{0,6}-[^-]{0,22}(-data:.*?:data)?\]/g, '')
		.replace(/\[\/?lang-[a-z]-[0-9]{1,6}-[^-]{0,22}(-data:.*?:data)?\]/g, '')
		.replace(/\[\/?svg-[a-z]-[0-9]{1,6}(-[^-]{0,22})?(-data:.*?:data)?\]/g, '');
}

/** PHP htmlspecialchars_decode default (ENT_QUOTES|ENT_SUBSTITUTE|ENT_HTML401). */
function decodeHtmlSpecialChars(text: string): string {
	return text
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'");
}

/** Nearest TC mark before tag_in / after tag_out (PHP OptimizeTC). */
function optimizeTcIn(rawText: string, tagIn: string): string | null {
	const pos = rawText.indexOf(tagIn);
	if (pos < 0) return null;
	const before = rawText.slice(0, pos);
	const matches = [
		...before.matchAll(/\[TC_([0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}(?:\.[0-9]{1,3})?)_TC\]/g),
	];
	const last = matches[matches.length - 1];
	return last?.[1] ?? null;
}
function optimizeTcOut(rawText: string, tagOut: string): string | null {
	const pos = rawText.indexOf(tagOut);
	if (pos < 0) return null;
	const after = rawText.slice(pos + tagOut.length);
	const match = /\[TC_([0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}(?:\.[0-9]{1,3})?)_TC\]/.exec(after);
	return match?.[1] ?? null;
}
function tcToSeconds(tc: string | null): number {
	if (tc === null || tc === '') return 0;
	const match = /([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2})(\.([0-9]{1,3}))?/.exec(tc);
	if (match === null) return 0;
	return (
		Number(match[1]) * 3600 +
		Number(match[2]) * 60 +
		Number(match[3]) +
		(match[5] !== undefined ? Number(`0.${match[5]}`) : 0)
	);
}
function secondsToTc(seconds: number): string {
	const sign = seconds < 0 ? '-' : '';
	const abs = Math.abs(seconds);
	const h = Math.floor(abs / 3600);
	const m = Math.floor((abs % 3600) / 60);
	const s = abs % 60;
	const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
	const frac = (s % 1).toFixed(3).slice(1); // '.000'
	return `${sign}${pad(h)}:${pad(m)}:${pad(s)}${frac}`;
}

/**
 * The related component_av of a text_area (PHP get_related_component_av_tipo):
 * the ontology node's `relations` entries hold a related component_av tipo.
 */
async function relatedAvTipo(textAreaTipo: string): Promise<string | null> {
	const node = await getNode(textAreaTipo);
	const relations = (node?.relations ?? []) as { tipo?: string }[];
	for (const relation of relations) {
		if (typeof relation?.tipo !== 'string') continue;
		if ((await getModelByTipo(relation.tipo)) === 'component_av') return relation.tipo;
	}
	return null;
}

/**
 * component_text_area indexation cell (PHP get_grid_value :100 + the
 * component_text_area_value.php include): the outer column cell whose value
 * is the interactive custom-columns array (default/pdf/av layouts).
 */
async function textAreaIndexationCell(
	ctx: GridContext,
	ddo: GridDdo,
	sectionTipo: string,
	sectionId: string | number,
	indexLocator: IndexLocator,
	columnObj: Record<string, unknown>,
): Promise<GridCell> {
	const node = await getNode(ddo.tipo);
	const properties = (node?.properties ?? {}) as {
		fields_separator?: string;
		records_separator?: string;
	};

	const items = await componentItems(ctx, sectionTipo, sectionId, ddo.tipo, 'component_text_area');
	const { data, fallback } = await langData(ctx, items, ddo.tipo);

	const buildColumns = async (slice: DataItem[]): Promise<GridCell[]> => {
		let fullRawText = typeof slice[0]?.value === 'string' ? (slice[0].value as string) : '';
		if (fullRawText === '' && fallback.length > 0 && slice !== fallback) {
			fullRawText = typeof fallback[0]?.value === 'string' ? (fallback[0].value as string) : '';
		}
		const locSectionTipo = indexLocator.section_tipo;
		const locSectionId = indexLocator.section_id;
		let tagId = indexLocator.tag_id ?? '';

		// fragment (PHP get_fragment_text_from_tag; 220-char truncation fallback)
		let fragmentInfo: ReturnType<typeof fragmentFromTag> = null;
		if (tagId !== '') {
			fragmentInfo = fragmentFromTag(tagId, fullRawText);
		}
		if (fragmentInfo === null) {
			if (indexLocator.tag_id === undefined) tagId = '';
			let valueFragment = truncateHtml(220, fullRawText, true);
			valueFragment = valueFragment !== '' ? deleteMarks(valueFragment) : '';
			fragmentInfo = {
				text: valueFragment,
				tag_in_pos: null,
				tag_out_pos: null,
				tag_in: null,
				tag_out: null,
			};
		}
		const textFragment = fragmentInfo.text ?? '';

		const recordLinkColumn = cell({
			type: 'column',
			cell_type: 'record_link',
			class_list: 'record_link',
			value: [{ section_id: locSectionId, section_tipo: locSectionTipo }],
		});
		const textFragmentColumn = cell({
			type: 'column',
			cell_type: 'text',
			class_list: 'text_fragment',
			value: [textFragment],
		});

		switch (ddo.format_columns) {
			case 'av': {
				// AV transcription layout (11 columns). Tool contexts come from the
				// element's registered tools (PHP get_structure_context->tools:
				// tool_indexation off the text_area, tool_transcription off the
				// related component_av); a missing tool → {} + label ''. Captured
				// live 2026-07-10 (seeded oh1/rsc167 scratch chain, gate corpus).
				const tcIn =
					fragmentInfo.tag_in !== null ? optimizeTcIn(fullRawText, fragmentInfo.tag_in) : null;
				const tcOut =
					fragmentInfo.tag_out !== null ? optimizeTcOut(fullRawText, fragmentInfo.tag_out) : null;
				const tcInSecs = tcToSeconds(tcIn);
				const tcOutSecs = tcToSeconds(tcOut);
				const durationTc = secondsToTc(tcOutSecs - tcInSecs);
				const openLabel = ctx.uiLabels.open ?? 'Open';
				const downloadLabel = ctx.uiLabels.download ?? 'Download';
				const fragmentLabel = ctx.uiLabels.fragment ?? 'fragment';
				const avTipo = await relatedAvTipo(ddo.tipo);
				const toolIndexation = await elementToolContext(
					ctx,
					ddo.tipo,
					sectionTipo,
					'tool_indexation',
				);
				const toolTranscription =
					avTipo !== null
						? await elementToolContext(ctx, avTipo, sectionTipo, 'tool_transcription')
						: {};
				const indexationLabel =
					typeof toolIndexation.label === 'string' ? toolIndexation.label : '';
				const transcriptionLabel =
					typeof toolTranscription.label === 'string' ? toolTranscription.label : '';
				// caller.lang is the COMPONENT instance lang (PHP indexation_grid :506
				// — DATA_LANG only when the text_area is translatable, else nolan).
				const callerLang = (await getTranslatableByTipo(ddo.tipo)) ? ctx.dataLang : 'lg-nolan';
				const callerBase = {
					tipo: sectionTipo,
					section_tipo: sectionTipo,
					section_id: sectionId,
					mode: 'indexation_list',
					model: 'section',
					lang: callerLang,
				};
				const openTool = (
					classList: string,
					buttonClass: string,
					label: string,
					options: Record<string, unknown>,
				): GridCell =>
					cell({
						type: 'column',
						cell_type: 'button',
						class_list: classList,
						value: [
							{
								class_list: buttonClass,
								label,
								...(options.value !== undefined ? { value: options.value } : {}),
								action: options.action,
							},
						],
					});
				const columns: GridCell[] = [recordLinkColumn];
				columns.push(
					openTool('tag_id', 'button tag_id', `${openLabel} ${indexationLabel}`, {
						value: [tagId],
						action: {
							event: 'click',
							method: 'open_tool',
							module_path: '../../../tools/tool_common/js/tool_common.js',
							options: {
								caller: callerBase,
								caller_options: { tag_id: tagId },
								tool_context: toolIndexation,
							},
						},
					}),
					openTool('button_indexation', 'button label', `${openLabel} ${indexationLabel}`, {
						action: {
							event: 'click',
							method: 'open_tool',
							module_path: '../../../tools/tool_common/js/tool_common.js',
							options: { caller: callerBase, tool_context: toolIndexation },
						},
					}),
					openTool(
						'button_transcription',
						'button document',
						`${openLabel} ${transcriptionLabel}`,
						{
							action: {
								event: 'click',
								method: 'open_tool',
								module_path: '../../../tools/tool_common/js/tool_common.js',
								options: {
									// key order mirrors PHP (tag_id before mode) for byte parity
									caller: {
										tipo: callerBase.tipo,
										section_tipo: callerBase.section_tipo,
										section_id: callerBase.section_id,
										tag_id: tagId,
										mode: callerBase.mode,
										model: callerBase.model,
										lang: callerBase.lang,
										section_top_tipo: indexLocator.section_top_tipo ?? null,
										section_top_id: indexLocator.section_top_id ?? null,
									},
									tool_context: toolTranscription,
								},
							},
						},
					),
					openTool('button_av_player', 'button film', `${openLabel} av`, {
						action: {
							event: 'click',
							method: 'open_av_player',
							module_path: '../../component_av/js/component_av.js',
							options: {
								section_tipo: locSectionTipo,
								section_id: locSectionId,
								component_tipo: avTipo,
								tc_in_secs: tcInSecs,
								tc_out_secs: tcOutSecs,
							},
						},
					}),
					textFragmentColumn,
					cell({ type: 'column', cell_type: 'text', class_list: 'tc_in', value: [tcIn] }),
					cell({ type: 'column', cell_type: 'text', class_list: 'tc_out', value: [tcOut] }),
					cell({
						type: 'column',
						cell_type: 'text',
						class_list: 'duration_tc',
						value: [durationTc],
					}),
				);
				for (const watermark of [false, true]) {
					columns.push(
						cell({
							type: 'column',
							cell_type: 'button',
							class_list: `button_download_av${watermark ? ' watermark' : ''}`,
							value: [
								{
									class_list: 'button download',
									label: `${downloadLabel} ${fragmentLabel}${watermark ? ' (Watermark)' : ''}`,
									action: {
										event: 'click',
										method: 'download_av_fragment',
										module_path: '../../component_av/js/component_av.js',
										options: {
											tipo: avTipo,
											section_tipo: locSectionTipo,
											section_id: locSectionId,
											tag_id: tagId,
											lang: ctx.dataLang,
											tc_in_secs: tcInSecs,
											tc_out_secs: tcOutSecs,
											quality: config.media.av.defaultQuality,
											watermark,
										},
									},
								},
							],
						}),
					);
				}
				return columns;
			}
			case 'pdf':
				return [
					recordLinkColumn,
					cell({ type: 'column', cell_type: 'text', class_list: 'tag_id', value: [tagId] }),
					textFragmentColumn,
				];
			default:
				return [recordLinkColumn, textFragmentColumn];
		}
	};

	const processedData = await buildColumns(data);
	const processedFallback =
		data.length === 0 && fallback.length > 0 ? await buildColumns(fallback) : [];

	const out = cell({
		type: 'column',
		label: ddo.label,
		ar_columns_obj: [columnObj],
		fields_separator: ddo.fields_separator ?? properties.fields_separator ?? ', ',
		records_separator: ddo.records_separator ?? properties.records_separator ?? ' | ',
		value: processedData as unknown[],
		fallback_value: processedFallback as unknown[],
		model: 'component_text_area',
	});
	if (ddo.class_list !== undefined) out.class_list = ddo.class_list;
	return out;
}

// ---------------------------------------------------------------------------
// relation-family cell (PHP component_relation_common::get_grid_value :311).
// ---------------------------------------------------------------------------

/** The ddo_map of a leaf relation ddo's own default request_config. */
async function defaultDdoMap(ctx: GridContext, ddo: GridDdo): Promise<GridDdo[]> {
	const cached = ctx.defaultDdoMaps.get(ddo.tipo);
	if (cached !== undefined) return cached;
	let map: GridDdo[] = [];
	try {
		const node = await getNode(ddo.tipo);
		const configs = await buildRequestConfigForElement(node?.properties ?? null, {
			ownerTipo: ddo.tipo,
			callerSectionTipo: ddo.section_tipo,
			mode: 'indexation_list',
		} as never);
		const dedaloConfig = configs.find(
			(item) => (item as { api_engine?: string }).api_engine === 'dedalo',
		) as { show?: { ddo_map?: GridDdo[] } } | undefined;
		map = dedaloConfig?.show?.ddo_map ?? [];
	} catch {
		// PHP tolerates a request_config that cannot build (logs, renders empty)
		map = [];
	}
	ctx.defaultDdoMaps.set(ddo.tipo, map);
	return map;
}

async function relationCell(
	ctx: GridContext,
	ddo: GridDdo,
	sectionTipo: string,
	sectionId: string | number,
	indexLocator: IndexLocator,
	columnObj: Record<string, unknown>,
	injectedDdoMap: GridDdo[] | null,
	subColumnsDivision: boolean,
): Promise<GridCell> {
	const node = await getNode(ddo.tipo);
	const properties = (node?.properties ?? {}) as {
		fields_separator?: string;
		records_separator?: string;
	};

	// data: the record's OWN stored data (see the set_data quirk in the header)
	const data = await componentItems(ctx, sectionTipo, sectionId, ddo.tipo, ddo.model);

	// ddo_map: injected (indexation sub-ddos) or the component's own default
	const ddoMap = injectedDdoMap ?? (await defaultDdoMap(ctx, ddo));
	const directChildren = ddoMap.filter((child) => child.parent === ddo.tipo);

	const arCells: GridCell[] = [];
	const arColumnsObj: Record<string, unknown>[] = [];
	let subRowCount = 0;
	let locatorCount = 0;

	let currentKey = -1;
	for (const rawLocator of data) {
		currentKey += 1;
		const locator = rawLocator as { section_tipo?: string; section_id?: string | number };
		if (locator === null || typeof locator !== 'object' || locator.section_tipo === undefined) {
			continue;
		}
		locatorCount += 1;
		// PHP check_tipo_is_valid: inactive-TLD targets are skipped
		const tld = (getTldFromTipo(locator.section_tipo) ?? '').toLowerCase();
		if (tld !== '' && !ctx.activeTlds.has(tld)) continue;

		const locatorColumnObj: Record<string, unknown>[] = [];
		const arColumns: GridCell[] = [];
		for (const childDdo of directChildren) {
			if (childDdo.model === '' || childDdo.model === null) continue;
			const subDdoMap = collectDescendants(ddoMap, childDdo.tipo);
			let currentPath = `${locator.section_tipo}_${childDdo.tipo}`;
			if (subColumnsDivision && currentKey > 0) currentPath = `${currentPath}|${currentKey}`;
			const childColumnObj: Record<string, unknown> = {
				id: `${columnObj.id}_${currentPath}`,
				group: `${columnObj.id}_${locator.section_tipo}`,
			};
			const childCell = await resolveDdoCell(
				ctx,
				childDdo,
				locator.section_tipo,
				locator.section_id ?? '',
				indexLocator,
				childColumnObj,
				subDdoMap.length > 0 ? [childDdo, ...subDdoMap] : null,
				getColumnNameByModel(childDdo.model) === 'relation',
			);
			subRowCount = childCell.row_count ?? 0;
			const childColumns = Array.isArray(childCell.ar_columns_obj)
				? (childCell.ar_columns_obj as Record<string, unknown>[])
				: [];
			locatorColumnObj.push(...childColumns);
			arColumns.push(childCell);
		}

		// layout: nested-portal children spread as columns; else one row per locator
		if (subColumnsDivision || sectionId === null) {
			arCells.push(...arColumns);
		} else {
			arCells.push(cell({ type: 'row', value: arColumns as unknown[] }));
		}

		// ar_columns_obj dedup + group-position insertion (PHP :626-658)
		for (const currentColumnObj of locatorColumnObj) {
			if (currentColumnObj === null || typeof currentColumnObj !== 'object') continue;
			const exists = arColumnsObj.find((entry) => entry.id === currentColumnObj.id);
			if (exists !== undefined) continue;
			const pathParts = String(currentColumnObj.id ?? '').split('|');
			if ((subColumnsDivision && currentKey > 0) || pathParts.length > 1) {
				let position: number | false = false;
				for (let i = 0; i < arColumnsObj.length; i++) {
					if (arColumnsObj[i]?.group === currentColumnObj.group) position = i;
				}
				if (position !== false && position !== 0) {
					arColumnsObj.splice(position + 1, 0, currentColumnObj);
				} else if (position === 0) {
					arColumnsObj.splice(1, 0, currentColumnObj);
				} else {
					arColumnsObj.push(currentColumnObj);
				}
			} else {
				arColumnsObj.push(currentColumnObj);
			}
		}
	}

	let rowCount = Math.max(locatorCount, subRowCount);
	if (rowCount === 0) rowCount = 1;

	const requestConfigShow = null; // PHP reads show.fields_separator off the injected rc — never set by these builders
	const out = cell({
		type: 'column',
		row_count: rowCount,
		column_count: arColumnsObj.length,
		label: ddo.label,
		ar_columns_obj: arColumnsObj,
		fields_separator:
			ddo.fields_separator ?? requestConfigShow ?? properties.fields_separator ?? ', ',
		records_separator:
			ddo.records_separator ?? requestConfigShow ?? properties.records_separator ?? ' | ',
		value: arCells as unknown[],
		model: ddo.model,
	});
	if (ddo.class_list !== undefined) out.class_list = ddo.class_list;
	return out;
}

/** All recursive descendants of `parentTipo` in the map (PHP get_children_recursive). */
function collectDescendants(ddoMap: GridDdo[], parentTipo: string): GridDdo[] {
	const out: GridDdo[] = [];
	for (const ddo of ddoMap) {
		if (ddo.parent === parentTipo) {
			out.push(ddo);
			out.push(...collectDescendants(ddoMap, ddo.tipo));
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// per-ddo dispatch (PHP indexation_grid::get_grid_value component branch +
// the component get_grid_value overrides).
// ---------------------------------------------------------------------------

async function resolveDdoCell(
	ctx: GridContext,
	rawDdo: GridDdo,
	sectionTipo: string,
	sectionId: string | number,
	indexLocator: IndexLocator,
	columnObj: Record<string, unknown>,
	injectedDdoMap: GridDdo[] | null,
	subColumnsDivision: boolean,
): Promise<GridCell> {
	// The cell label is ALWAYS the component's own ontology label in the
	// application lang (PHP get_label()), never a label a request_config
	// builder may have stamped on the ddo (those default to other langs).
	const ddo: GridDdo = { ...rawDdo, label: await termByTipo(rawDdo.tipo, ctx.applicationLang) };
	if (ddo.model === 'component_text_area' && ddo.mode === 'indexation_list') {
		return textAreaIndexationCell(ctx, ddo, sectionTipo, sectionId, indexLocator, columnObj);
	}
	if (getColumnNameByModel(ddo.model) === 'relation') {
		return relationCell(
			ctx,
			ddo,
			sectionTipo,
			sectionId,
			indexLocator,
			columnObj,
			injectedDdoMap,
			subColumnsDivision,
		);
	}
	return atomsCell(ctx, ddo, sectionTipo, sectionId, columnObj);
}

/**
 * One head/data grid row's cells for a locator (PHP indexation_grid::
 * get_grid_value :468): only the ddos anchored on the section_top render as
 * top-level columns; deeper ddos are injected into their parent's show map.
 */
async function gridRowCells(
	ctx: GridContext,
	arDdo: GridDdo[],
	locator: IndexLocator,
): Promise<{ rowCounts: number[]; cells: GridCell[] }> {
	// PHP indexation_grid::get_grid_value :471-472 — direct locators get their
	// top_* slots FILLED (the av columns then emit them instead of null).
	locator.section_top_tipo = locator.section_top_tipo ?? locator.section_tipo;
	locator.section_top_id = locator.section_top_id ?? locator.section_id;
	const topTipo = locator.section_top_tipo;
	const topId = locator.section_top_id;
	const childrenDdo = arDdo.filter((ddo) => ddo.section_tipo === topTipo);

	const rowCounts: number[] = [];
	const cells: GridCell[] = [];
	for (const ddo of childrenDdo) {
		const currentSectionTipo =
			ddo.section_tipo === locator.section_tipo ? locator.section_tipo : topTipo;
		const currentSectionId = ddo.section_tipo === locator.section_tipo ? locator.section_id : topId;
		const columnObj = { id: `${ddo.section_tipo}_${ddo.tipo}` };
		const subDdoMap = arDdo.filter((child) => child.parent === ddo.tipo);
		const gridCell = await resolveDdoCell(
			ctx,
			ddo,
			currentSectionTipo,
			currentSectionId,
			locator,
			columnObj,
			subDdoMap.length > 0 ? [ddo, ...subDdoMap] : null,
			false,
		);
		rowCounts.push(gridCell.row_count ?? 0);
		cells.push(gridCell);
	}
	return { rowCounts, cells };
}

/** PHP indexation_grid::process_ddo_map (:603) — enrich + resolve 'self'. */
async function processDdoMap(
	rawMap: Record<string, unknown>[],
	sectionTipo: string,
	ctx: GridContext,
): Promise<GridDdo[]> {
	const out: GridDdo[] = [];
	for (const raw of rawMap) {
		const tipo = raw.tipo;
		if (typeof tipo !== 'string') {
			console.error('[indexation_grid] ignored ddo without tipo:', JSON.stringify(raw));
			continue;
		}
		const model = (await getModelByTipo(tipo)) ?? '';
		out.push({
			...raw,
			tipo,
			label: await termByTipo(tipo, ctx.applicationLang),
			section_tipo: raw.section_tipo === 'self' ? sectionTipo : (raw.section_tipo as string),
			parent: raw.parent === 'self' ? sectionTipo : (raw.parent as string),
			mode: typeof raw.mode === 'string' ? raw.mode : 'indexation_list',
			model,
		} as GridDdo);
	}
	return out;
}

// ---------------------------------------------------------------------------
// main entry (PHP build_indexation_grid :196).
// ---------------------------------------------------------------------------

export interface IndexationGridSqo {
	section_tipo?: unknown;
	filter_by_locators?: { section_tipo?: unknown; section_id?: unknown }[];
	limit?: number;
	offset?: number;
}

export async function buildIndexationGrid(
	args: {
		sectionTipo: string;
		sectionId: string | number;
		tipo: string;
		sqo: IndexationGridSqo;
	},
	principal: Principal,
): Promise<GridCell[]> {
	const grid: GridCell[] = [];

	// target sections (string | string[]; empty → nothing to show)
	const rawTarget = args.sqo.section_tipo;
	const targetSection =
		rawTarget === undefined || rawTarget === null || rawTarget === ''
			? null
			: Array.isArray(rawTarget)
				? (rawTarget as string[])
				: [String(rawTarget)];
	if (targetSection === null || targetSection.length === 0) return grid;

	const limit = args.sqo.limit ?? 500;
	const offset = args.sqo.offset ?? 0;

	// inverse locators (PHP get_ar_locators → search_related + parse_data)
	const filterLocators = (args.sqo.filter_by_locators ?? [])
		.filter((locator) => typeof locator?.section_tipo === 'string')
		.map((locator) => ({
			type: RELATION_TYPE_INDEX,
			section_tipo: String(locator.section_tipo),
			section_id: locator.section_id as string | number,
		}));
	if (filterLocators.length === 0) return grid;

	const hits = await findInverseReferenceLocators(filterLocators, {
		sectionTipos: targetSection.includes('all') ? 'all' : targetSection,
		limit,
		offset,
		order: 'section_id',
	});

	const locators: IndexLocator[] = hits.map((hit) => {
		const entry = (hit as { locator_data?: Record<string, unknown> }).locator_data ?? {};
		const locator: IndexLocator = {
			type: typeof entry.type === 'string' ? entry.type : undefined,
			section_tipo: hit.section_tipo,
			section_id: String(hit.section_id),
		};
		if (entry.tag_component_tipo !== undefined)
			locator.component_tipo = String(entry.tag_component_tipo);
		if (entry.tag_id !== undefined) locator.tag_id = String(entry.tag_id);
		if (entry.section_top_id !== undefined) locator.section_top_id = String(entry.section_top_id);
		if (entry.section_top_tipo !== undefined)
			locator.section_top_tipo = String(entry.section_top_tipo);
		if (entry.from_component_tipo !== undefined) {
			locator.from_component_top_tipo = String(entry.from_component_tipo);
		}
		return locator;
	});

	// group by section_top (PHP get_ar_section_top_tipo)
	const groups = new Map<string, Map<string, IndexLocator[]>>();
	for (const locator of locators) {
		const topTipo = locator.section_top_tipo ?? locator.section_tipo;
		const topId = locator.section_top_id ?? locator.section_id;
		const byId = groups.get(topTipo) ?? new Map<string, IndexLocator[]>();
		const list = byId.get(topId) ?? [];
		list.push(locator);
		byId.set(topId, list);
		groups.set(topTipo, byId);
	}

	// per-user projects filter (PHP: non-global-admin rows must intersect the
	// caller's projects via the record's component_filter data)
	if (!principal.isGlobalAdmin) {
		const { isRecordInScope } = await import('../security/record_scope.ts');
		for (const [topTipo, byId] of groups) {
			for (const topId of [...byId.keys()]) {
				if (!(await isRecordInScope(topTipo, Number(topId), principal))) {
					byId.delete(topId);
				}
			}
			if (byId.size === 0) groups.delete(topTipo);
		}
	}

	const ctx: GridContext = {
		dataLang: currentDataLang(),
		applicationLang: currentApplicationLang(),
		uiLabels: await getLabels(currentApplicationLang()),
		activeTlds: new Set((await getActiveTlds()).map((tld: string) => tld.toLowerCase())),
		records: new Map(),
		defaultDdoMaps: new Map(),
		toolContexts: new Map(),
	};

	// Bun-native: prefetch every top record in one query per matrix table.
	const prefetchTargets: { section_tipo: string; section_id: string }[] = [];
	for (const [topTipo, byId] of groups) {
		for (const topId of byId.keys()) {
			prefetchTargets.push({ section_tipo: topTipo, section_id: topId });
		}
	}
	await prefetchRecords(ctx, prefetchTargets);

	for (const [topTipo, byId] of groups) {
		// section caption column
		const sectionNode = await getNode(topTipo);
		const sectionColor = (sectionNode?.properties as { color?: string } | null)?.color;
		const listConfig = await getIndexationListConfig(topTipo);
		if (listConfig === null) {
			console.error(
				`[indexation_grid] ignored section without indexation_list config (misconfigured ontology): ${topTipo}`,
			);
			continue;
		}
		const sectionGrid = cell({
			type: 'column',
			label: await termByTipo(topTipo, ctx.applicationLang),
			render_label: true,
			class_list:
				listConfig.classList !== null
					? `caption section ${topTipo} ${listConfig.classList}`
					: `caption section ${topTipo}`,
		});
		if (sectionColor !== undefined) sectionGrid.features = { color: sectionColor };

		const headDdoMap =
			listConfig.headDdoMap.length > 0
				? await processDdoMap(listConfig.headDdoMap, topTipo, ctx)
				: null;
		const rowDdoMap =
			listConfig.rowDdoMap.length > 0
				? await processDdoMap(listConfig.rowDdoMap, topTipo, ctx)
				: null;

		const sectionValues: GridCell[] = [];
		const sectionRowCounts: number[] = [];
		for (const [, groupLocators] of byId) {
			const rowsMaxCount: number[] = [];

			if (headDdoMap !== null) {
				const head = await gridRowCells(ctx, headDdoMap, groupLocators[0] as IndexLocator);
				const headRowCount = head.rowCounts.length > 0 ? Math.max(...head.rowCounts) : 0;
				sectionValues.push(
					cell({
						type: 'row',
						row_count: headRowCount,
						class_list: listConfig.headClassList,
						render_label: listConfig.headRenderLabel,
						value: head.cells as unknown[],
					}),
				);
				rowsMaxCount.push(headRowCount);
			}

			if (rowDdoMap !== null) {
				for (const locator of groupLocators) {
					const row = await gridRowCells(ctx, rowDdoMap, locator);
					const rowCount = row.rowCounts.length > 0 ? Math.max(...row.rowCounts) : 0;
					rowsMaxCount.push(rowCount);
					sectionValues.push(
						cell({
							type: 'row',
							row_count: rowCount,
							class_list: listConfig.rowClassList,
							render_label: listConfig.renderLabel,
							value: row.cells as unknown[],
						}),
					);
				}
			} else {
				console.warn(
					`[indexation_grid] undefined row ddo_map for section ${topTipo} — configure the ontology indexation_list`,
				);
			}
			sectionRowCounts.push(rowsMaxCount.reduce((a, b) => a + b, 0));
		}

		sectionGrid.value = sectionValues as unknown[];
		grid.push(
			cell({
				type: 'row',
				row_count: sectionRowCounts.reduce((a, b) => a + b, 0),
				value: [sectionGrid] as unknown[],
			}),
		);
	}

	return grid;
}
