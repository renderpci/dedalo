/**
 * get_relation_list — the "Referencias" panel (PHP relation_list class +
 * relation_list_json): lists every record that points AT the host record,
 * as a heterogeneous grid whose columns differ per referencing section.
 *
 * Pipeline:
 *  1. findInverseReferences (search_related) — the owning records;
 *  2. per referencing section, the grid COLUMNS: the section_map
 *     'relation_list' scope's term tipos (strict, no chain) when authored,
 *     else the section's legacy relation_list ontology node `relations`;
 *  3. per record, one id cell + one VALUE cell per column. Cell values are
 *     the component's flat display string (PHP get_value → export atoms →
 *     to_flat_string): lang-sliced literal values joined ' | ' for the
 *     string family, resolved datalist labels for relation models.
 *
 * VALUE SCOPE (every model that appears as a real relation_list column in the
 * ontology): the string family (input_text/text_area/email/number),
 * component_date, component_iri, the datalist-resolvable relation models
 * (select/radio/check_box/autocomplete/autocomplete_hi/relation_model/portal
 * with export-atoms child recursion), the media models (image/svg/pdf/av), and
 * component_section_id (the record's own id). LEDGERED: any other model (the
 * cell carries value null + the response notes the unresolved model, never a
 * guessed string) — the only live instance is one node mis-modelled as `section`
 * used as a relation_list column (ich126 under rsc197's ich96).
 */

import { readEnv } from '../../config/env.ts';
import { getFlatValueFamily } from '../components/registry.ts';
import { mediaTypeOf } from '../concepts/media.ts';
import { dataframeEntryMatches } from '../concepts/subdatum.ts';
import { type MatrixRecord, readMatrixRecord } from '../db/matrix.ts';
import { sql } from '../db/postgres.ts';
import { createOntologyCache } from '../ontology/cache_factory.ts';
import { registerOntologyCacheClearer } from '../ontology/cache_invalidation.ts';
import { termByTipo } from '../ontology/labels.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
	getNode,
} from '../ontology/resolver.ts';
import { getSectionMap } from '../ontology/section_map.ts';
import { resolveLocatorLabels } from '../relations/datalist.ts';
import { findInverseReferences } from '../search/search_related.ts';
import { resolveOwnConfigMap } from '../section/list_definitions/section_list.ts';
import { resolveComponentValue } from './component_data.ts';
import { currentDataLang } from './request_lang.ts';

/** PHP export_value records_separator (join_atoms depth-0 default). */
const RECORDS_SEPARATOR = ' | ';

export interface RelationListResult {
	context: Record<string, unknown>[];
	data: Record<string, unknown>[];
	/** Models the value resolver does not cover (ledger, never guessed). */
	unresolved: string[];
}

/** The grid column tipos of one referencing section (see module doc step 2). */
async function getRelationListColumns(sectionTipo: string): Promise<string[]> {
	// section_map 'relation_list' scope (strict — the scope key is read
	// directly, no SCOPE_FALLBACK walk), resolved through the canonical
	// virtual-aware cached accessor (S2-27).
	const sectionMap = (await getSectionMap(sectionTipo)) as {
		relation_list?: { term?: string | string[] };
	} | null;
	const scopeTerm = sectionMap?.relation_list?.term;
	if (scopeTerm !== undefined && scopeTerm !== null) {
		return Array.isArray(scopeTerm) ? scopeTerm : [scopeTerm];
	}

	// Legacy: the section's relation_list ontology node — its `relations`
	// links name the column tipos.
	const legacyRows = (await sql.unsafe(
		`SELECT relations FROM dd_ontology WHERE parent = $1 AND model = 'relation_list' LIMIT 1`,
		[sectionTipo],
	)) as { relations: { tipo?: string }[] | null }[];
	return (legacyRows[0]?.relations ?? [])
		.map((link) => link.tipo)
		.filter((tipo): tipo is string => typeof tipo === 'string');
}

/**
 * Optional per-run seams for the cell-value resolvers. `loadRecord` replaces
 * the default uncached `readMatrixRecord` — the export run passes a loader
 * backed by its per-run record cache, collapsing the per-row/per-target
 * single-record SELECTs (the classic N+1) to one read per distinct record.
 * A loader function (not a bare Map) keeps eviction policy on the caller's
 * side and this module free of any diffusion import.
 */
export interface CellValueResolveOptions {
	loadRecord?: (
		tableName: string,
		sectionTipo: string,
		sectionId: number,
	) => Promise<MatrixRecord | null>;
}

/** One resolved relation target: its RAW stored position + flat value parts. */
export interface RelationTargetValue {
	/** RAW stored-locator array position (holes/invalid entries consume one). */
	index: number;
	sectionTipo: string | null;
	sectionId: number | string | null;
	/** The target's flat display parts (config children joined per field, or
	 * the datalist label) — empty when the target resolves to nothing. */
	parts: string[];
}

/**
 * Per-TARGET flat values of one relation component on one record — the
 * per-locator half of the datalist branch of resolveCellValue (PHP
 * get_export_value recursion): with config children, each locator target
 * flattens as its children's values joined by the COMPONENT's
 * fields_separator (rsc368's ' | ', rsc139's ', '); without config children,
 * the target label resolves via the datalist — in STORED locator order.
 * resolveCellValue joins the flattened parts with its itemSeparator; the
 * export compact-portal cells (WC-008) consume the targets individually.
 */
export async function resolveRelationTargetValues(
	sectionTipo: string,
	sectionId: number,
	componentTipo: string,
	lang: string,
	unresolved: string[],
	opts?: CellValueResolveOptions,
): Promise<RelationTargetValue[]> {
	const model = await getModelByTipo(componentTipo);
	if (model === null) return [];
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) return [];
	// The loader seam consults AFTER the null-table early-return (parity
	// keystone: a cached loader must never resolve what the default can't).
	const record = await (opts?.loadRecord ?? readMatrixRecord)(table, sectionTipo, sectionId);
	if (record === null) return [];

	const column = getColumnNameByModel(model) ?? 'relation';
	const columnData = record.columns[column as keyof typeof record.columns] as Record<
		string,
		unknown[]
	> | null;
	const locators = (columnData?.[componentTipo] ?? []) as {
		section_tipo?: unknown;
		section_id?: unknown;
		id?: number | string;
		main_component_tipo?: string;
	}[];
	if (locators.length === 0) return [];

	const cell = await resolveOwnConfigMap(componentTipo);
	// Map-ordered children, dataframe children FLAGGED (they resolve as frame
	// fields folded into the flat cell — PHP field-dimension order = ddo order).
	const children: { tipo: string; isDataframe: boolean }[] = [];
	for (const child of cell.rawDdos ?? []) {
		if (typeof child?.tipo !== 'string') continue;
		if (child.parent !== undefined && child.parent !== 'self' && child.parent !== componentTipo)
			continue;
		children.push({
			tipo: child.tipo,
			isDataframe: (await getModelByTipo(child.tipo)) === 'component_dataframe',
		});
	}
	// Implicit legacy map (section_list node relations): components only.
	for (const relTipo of cell.implicitRelations ?? []) {
		const relModel = await getModelByTipo(relTipo);
		if (relModel === null || !relModel.startsWith('component_')) continue;
		children.push({ tipo: relTipo, isDataframe: relModel === 'component_dataframe' });
	}

	const targets: RelationTargetValue[] = [];
	if (children.length > 0) {
		// (single-child configs degrade to exactly the label value, so the
		// pinned label gates — numisdata30 'Emporion', numisdata585 — hold)
		const fieldsSeparator = await componentFieldsSeparator(componentTipo);
		for (let index = 0; index < locators.length; index++) {
			const locator = locators[index];
			const targetSection = locator?.section_tipo;
			const targetId = locator?.section_id;
			if (typeof targetSection !== 'string' || targetId === undefined) continue;
			const fieldParts: string[] = [];
			for (const child of children) {
				if (child.isDataframe) {
					// Frames live on THIS record's relation column, paired to the
					// MAIN locator by (dd490, main, id_key = locator.id) — PHP
					// relation_common :871-897; empty/no-frames contributes nothing.
					const frameFlat = await resolveDataframeFlatValue(
						record,
						child.tipo,
						locator?.main_component_tipo ?? componentTipo,
						locator?.id,
						lang,
						unresolved,
						opts,
					);
					if (frameFlat !== null && frameFlat !== '') fieldParts.push(frameFlat);
					continue;
				}
				const childValue = await resolveCellValue(
					targetSection,
					Number(targetId),
					child.tipo,
					lang,
					unresolved,
					await componentFieldsSeparator(child.tipo),
					opts,
				);
				if (childValue !== null && childValue !== '') fieldParts.push(childValue);
			}
			targets.push({
				index,
				sectionTipo: targetSection,
				sectionId: targetId as number | string,
				parts: fieldParts.length > 0 ? [fieldParts.join(fieldsSeparator)] : [],
			});
		}
	} else {
		const properties = (await getNode(componentTipo))?.properties ?? null;
		for (let index = 0; index < locators.length; index++) {
			const locator = locators[index] as { section_tipo?: unknown; section_id?: unknown };
			const labels = await resolveLocatorLabels(componentTipo, properties, sectionTipo, lang, [
				locator,
			]);
			targets.push({
				index,
				sectionTipo: typeof locator?.section_tipo === 'string' ? locator.section_tipo : null,
				sectionId: (locator?.section_id as number | string | undefined) ?? null,
				parts: labels.filter((label) => label !== ''),
			});
		}
	}
	return targets;
}

/**
 * The flat value of ONE main locator's paired dataframe frames (PHP
 * relation_common::get_export_value :871-897 + component_dataframe::get_data
 * :103-129): frames pair on the OWNER record's relation[frameTipo] slot by
 * (dd490, main_component_tipo, INT id_key = the main locator's stored id);
 * each frame's own config children resolve at the FRAME TARGET record and
 * join with the frame's fields_separator; multiple frames join the same way.
 * Null pairId (PHP null id_key) or zero pairs → null (contributes nothing).
 */
async function resolveDataframeFlatValue(
	record: { columns: { relation?: unknown } },
	frameTipo: string,
	mainComponentTipo: string,
	pairId: number | string | undefined,
	lang: string,
	unresolved: string[],
	opts?: CellValueResolveOptions,
): Promise<string | null> {
	if (pairId === undefined || pairId === null) return null;
	const slot = ((record.columns.relation as Record<string, unknown[]> | null)?.[frameTipo] ??
		[]) as Record<string, unknown>[];
	const paired = slot.filter((entry) =>
		dataframeEntryMatches(entry as never, mainComponentTipo, pairId, frameTipo),
	);
	if (paired.length === 0) return null;

	const frameCell = await resolveOwnConfigMap(frameTipo);
	const frameChildTipos: string[] = [];
	for (const child of frameCell.rawDdos ?? []) {
		if (typeof child?.tipo !== 'string') continue;
		if (child.parent !== undefined && child.parent !== 'self' && child.parent !== frameTipo)
			continue;
		frameChildTipos.push(child.tipo);
	}
	for (const relTipo of frameCell.implicitRelations ?? []) {
		const relModel = await getModelByTipo(relTipo);
		if (relModel === null || !relModel.startsWith('component_')) continue;
		frameChildTipos.push(relTipo);
	}
	if (frameChildTipos.length === 0) return null;

	const frameSeparator = await componentFieldsSeparator(frameTipo);
	const frameParts: string[] = [];
	for (const frame of paired) {
		const frameTarget = frame as { section_tipo?: unknown; section_id?: unknown };
		if (typeof frameTarget.section_tipo !== 'string' || frameTarget.section_id === undefined) {
			continue;
		}
		const fields: string[] = [];
		for (const childTipo of frameChildTipos) {
			const value = await resolveCellValue(
				frameTarget.section_tipo,
				Number(frameTarget.section_id),
				childTipo,
				lang,
				unresolved,
				frameSeparator,
				opts,
			);
			if (value !== null && value !== '') fields.push(value);
		}
		if (fields.length > 0) frameParts.push(fields.join(frameSeparator));
	}
	return frameParts.length > 0 ? frameParts.join(frameSeparator) : null;
}

/** One component's flat display string on one record (PHP get_value). */
export async function resolveCellValue(
	sectionTipo: string,
	sectionId: number,
	componentTipo: string,
	lang: string,
	unresolved: string[],
	/** Multi-item join for DEFAULT-separator levels — the export-atoms rule
	 * flips ' | ' (first indexed level) to ', ' (deeper levels). */
	itemSeparator: string = RECORDS_SEPARATOR,
	opts?: CellValueResolveOptions,
): Promise<string | null> {
	const model = await getModelByTipo(componentTipo);
	if (model === null) return null;

	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) return null;
	// The loader seam consults AFTER the null-table early-return (parity
	// keystone: a cached loader must never resolve what the default can't).
	const record = await (opts?.loadRecord ?? readMatrixRecord)(table, sectionTipo, sectionId);
	if (record === null) return null;

	// Per-model dispatch by the DESCRIPTOR's flatValue family (WS-B facet
	// rewire, 2026-07-10): add a model = declare the facet, never edit this
	// file's branch tables. Undeclared families stay ledgered-unresolved.
	const family = getFlatValueFamily(model);

	if (family === 'section_id') {
		// The record's own section_id (PHP component_section_id::get_value): the
		// numeric id as a flat string. Used as an rsc424 relation_list column (rsc559).
		return String(sectionId);
	}

	if (family === 'string') {
		const { value, fallbackValue } = await resolveComponentValue(
			record,
			componentTipo,
			model,
			lang,
		);
		const items = (value && value.length > 0 ? value : (fallbackValue ?? [])) as {
			value?: unknown;
		}[];
		const parts = items
			.map((item) => (item?.value === undefined || item.value === null ? '' : String(item.value)))
			.filter((part) => part !== '');
		return parts.length > 0 ? parts.join(itemSeparator) : null;
	}

	if (family === 'date') {
		// Flat date (PHP export atom): the start's year, or a d-m-Y date when
		// day/month are present. Multiple items join like literals.
		const { value } = await resolveComponentValue(record, componentTipo, model, lang);
		type DdDate = { year?: number; month?: number; day?: number };
		const formatDate = (date: DdDate | undefined): string => {
			if (date?.year === undefined) return '';
			if (date.month === undefined || date.day === undefined) return String(date.year);
			const pad = (n: number): string => String(n).padStart(2, '0');
			return `${pad(date.day)}-${pad(date.month)}-${date.year}`;
		};
		const parts = ((value ?? []) as { start?: DdDate; end?: DdDate }[])
			.map((item) => {
				const startText = formatDate(item?.start);
				if (startText === '') return '';
				const endText = formatDate(item?.end);
				// Ranges render 'start <> end' (PHP dd_date range separator).
				return endText !== '' ? `${startText} <> ${endText}` : startText;
			})
			.filter((part) => part !== '');
		return parts.length > 0 ? parts.join(itemSeparator) : null;
	}

	if (family === 'iri') {
		// Flat iri: the iri value + its dd560 label-dataframe field joined ', '
		// per item ('Les dracmes empuritanes, Zenon' — the frame pairs by
		// id_key + main_component_tipo, label = dd1715 at the dd1706 target).
		const iriItems = ((record.columns.iri as Record<string, unknown[]> | null)?.[componentTipo] ??
			[]) as { iri?: unknown; id?: number | string }[];
		const frameBag = ((record.columns.relation as Record<string, unknown[]> | null)?.dd560 ??
			[]) as {
			id_key?: number | string;
			main_component_tipo?: string;
			section_tipo?: string;
			section_id?: number | string;
		}[];
		const parts: string[] = [];
		for (const item of iriItems) {
			const fields: string[] = [];
			if (typeof item?.iri === 'string' && item.iri !== '') fields.push(item.iri);
			const frame = frameBag.find(
				(entry) =>
					entry?.main_component_tipo === componentTipo &&
					String(entry?.id_key) === String(item?.id),
			);
			if (frame !== undefined && typeof frame.section_tipo === 'string') {
				const label = await resolveCellValue(
					frame.section_tipo,
					Number(frame.section_id),
					'dd1715', // DEDALO label component of the dd1706 frame target
					lang,
					unresolved,
					RECORDS_SEPARATOR,
					opts,
				);
				if (label !== null && label !== '') fields.push(label);
			}
			if (fields.length > 0) parts.push(fields.join(', '));
		}
		return parts.length > 0 ? parts.join(itemSeparator) : null;
	}

	if (family === 'datalist') {
		const targets = await resolveRelationTargetValues(
			sectionTipo,
			sectionId,
			componentTipo,
			lang,
			unresolved,
			opts,
		);
		const parts = targets.flatMap((target) => target.parts);
		return parts.length > 0 ? parts.join(itemSeparator) : null;
	}

	// MEDIA components: the export cell is the ABSOLUTE URL of the model's
	// default quality (stored files_info file_path under the configured public
	// media base — PHP: http://host/dedalo/media/image/1.5MB/32000/….jpg). The
	// quality comes from the media CONTRACT (mediaTypeOf → DEDALO_*_QUALITY_
	// DEFAULT), never a hardcoded table.
	if (family === 'media') {
		const mediaBase = readEnv('DEDALO_MEDIA_BASE_URL');
		const defaultQuality = mediaTypeOf(model)?.defaultQuality;
		if (mediaBase === undefined || mediaBase === '' || defaultQuality === undefined) {
			if (!unresolved.includes(model)) unresolved.push(model);
			return null;
		}
		const column = getColumnNameByModel(model) ?? 'media';
		const items = ((
			record.columns[column as keyof typeof record.columns] as Record<string, unknown[]> | null
		)?.[componentTipo] ?? []) as { files_info?: { quality?: string; file_path?: string }[] }[];
		const parts: string[] = [];
		for (const item of items) {
			const entry = (item?.files_info ?? []).find((info) => info?.quality === defaultQuality);
			if (entry?.file_path !== undefined && entry.file_path !== '') {
				parts.push(`${mediaBase}${entry.file_path}`);
			}
		}
		return parts.length > 0 ? parts.join(itemSeparator) : null;
	}

	if (!unresolved.includes(model)) unresolved.push(model);
	return null;
}

/** The component's declared show.fields_separator (?? ', ', PHP default). */
const cellFieldsSeparatorCache = createOntologyCache<string, string>();

/** Drop the ontology-derived fields_separator cache. */
export function clearFieldsSeparatorCache(): void {
	cellFieldsSeparatorCache.clear();
}
registerOntologyCacheClearer(clearFieldsSeparatorCache);
/** Exported for the export projection (P6): same separator, ONE cache. */
export async function componentFieldsSeparator(componentTipo: string): Promise<string> {
	const cached = cellFieldsSeparatorCache.get(componentTipo);
	if (cached !== undefined) return cached;
	const rows = (await sql.unsafe(
		`SELECT properties->'source'->'request_config' AS rc FROM dd_ontology WHERE tipo = $1`,
		[componentTipo],
	)) as { rc: { api_engine?: string; show?: { fields_separator?: string } }[] | null }[];
	const rcs = rows[0]?.rc ?? [];
	const main = rcs.find((entry) => entry?.api_engine === 'dedalo') ?? rcs[0];
	const separator =
		typeof main?.show?.fields_separator === 'string' ? main.show.fields_separator : ', ';
	cellFieldsSeparatorCache.set(componentTipo, separator);
	return separator;
}

/**
 * Build the full relation-list grid for one host record (PHP
 * get_relation_list_obj). `limit` caps the referencing RECORDS;
 * `sectionTipos` narrows the OWNING sections (the client sqo's section_tipo
 * axis — PHP feeds the sqo straight to sections::get_instance; 'all' = every
 * section, the panel's default).
 */
export async function buildRelationList(
	hostSectionTipo: string,
	hostSectionId: number | string,
	options: {
		limit?: number | false;
		offset?: number;
		lang?: string;
		sectionTipos?: string[] | 'all';
	} = {},
): Promise<RelationListResult> {
	// Request-scoped data lang backstop (S2-28), never a hardcoded lg-spa.
	const lang = options.lang ?? currentDataLang();
	const hits = await findInverseReferences(
		[{ section_tipo: hostSectionTipo, section_id: String(hostSectionId) }],
		{
			sectionTipos: options.sectionTipos ?? 'all',
			limit: options.limit ?? false,
			offset: options.offset,
		},
	);

	const context: Record<string, unknown>[] = [];
	const data: Record<string, unknown>[] = [];
	const unresolved: string[] = [];
	const columnsBySection = new Map<string, string[]>();

	for (const hit of hits) {
		// First sight of a section: emit its context columns (id + grid columns).
		let columns = columnsBySection.get(hit.section_tipo);
		if (columns === undefined) {
			columns = await getRelationListColumns(hit.section_tipo);
			columnsBySection.set(hit.section_tipo, columns);
			const sectionLabel = await termByTipo(hit.section_tipo, lang);
			context.push({
				section_tipo: hit.section_tipo,
				section_label: sectionLabel,
				component_tipo: 'id',
				component_label: 'id',
			});
			for (const columnTipo of columns) {
				context.push({
					section_tipo: hit.section_tipo,
					section_label: sectionLabel,
					component_tipo: columnTipo,
					component_label: await termByTipo(columnTipo, lang),
				});
			}
		}

		// One row: the id cell (no value key) + a value cell per column.
		data.push({
			section_tipo: hit.section_tipo,
			section_id: String(hit.section_id),
			component_tipo: 'id',
		});
		for (const columnTipo of columns) {
			const cell: Record<string, unknown> = {
				section_tipo: hit.section_tipo,
				section_id: String(hit.section_id),
				component_tipo: columnTipo,
			};
			const value = await resolveCellValue(
				hit.section_tipo,
				hit.section_id,
				columnTipo,
				lang,
				unresolved,
			);
			if (value !== null) cell.value = value;
			data.push(cell);
		}
	}

	return { context, data, unresolved };
}
