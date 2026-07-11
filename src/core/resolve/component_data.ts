/**
 * Component DATA reader — the TS re-expression of component_common::get_data /
 * get_data_lang / get_data_item and the string-family language fallback
 * (spec §3.7 "Data").
 *
 * PHP references: class.component_common.php get_data (:1139), get_data_lang
 * (:1297), get_data_item (:3981); component_string_common
 * get_component_data_fallback (:310).
 *
 * A component's stored data lives in its matrix row at
 * row[<column-for-model>][<component tipo>] as an array of items:
 *   literal item  : { id, value, lang }
 *   relation item : a locator { section_tipo, section_id, … }
 *
 * Language rules:
 * - non-translatable components return the FULL item array unfiltered;
 * - translatable components filter items by lang (strict equality);
 * - when the requested lang yields nothing, fallback_value tries: the install
 *   main lang, then lg-nolan, then every other project lang — first non-empty
 *   wins; null when the component holds no data at all.
 */

import { config } from '../../config/config.ts';
import { readEnv } from '../../config/env.ts';
import { getComponentModel } from '../components/registry.ts';
import type { MatrixRecord } from '../db/matrix.ts';
import { getColumnNameByModel, getTranslatableByTipo } from '../ontology/resolver.ts';

/**
 * The install's MAIN data language — the fallback chain's first candidate.
 * PHP get_component_data_fallback($lang, $main_lang = DEDALO_DATA_LANG_DEFAULT):
 * the INSTALL config defines it (../private/.env DEDALO_DATA_LANG_DEFAULT);
 * languages are configuration, never module literals (owner rule, 2026-07-09).
 */
const DEFAULT_DATA_LANG = config.lang.dataLangDefault;
const NOLAN = 'lg-nolan'; // PHP DEDALO_DATA_NOLAN — the structural no-language token
/**
 * Project languages tried by the fallback chain — PHP get_component_data_fallback
 * iterates common::get_ar_all_langs() = DEDALO_PROJECTS_DEFAULT_LANGS
 * (class.common.php:1255), defined in ../private/.env (PROJECTS_DEFAULT_LANGS).
 * The previous read of 'APPLICATION_LANGS' was DOUBLY wrong (2026-07-09, rsc92
 * picker bug): wrong key (UI langs, and stored as a JSON map so the CSV split
 * produced garbage → silently fell back to a 3-lang literal) — so values
 * stored only in e.g. lg-fra NEVER resolved as fallback and the picker
 * rendered blank terms.
 */
const ALL_LANGS = config.menu.projectsDefaultLangs;

/** Raw stored items of one component in one record (null when absent). */
export function readComponentItems(
	record: MatrixRecord,
	componentTipo: string,
	model: string,
): unknown[] | null {
	const column = getColumnNameByModel(model);
	if (column === null) return null;
	const columnValue = record.columns[column as keyof MatrixRecord['columns']];
	if (columnValue === null || columnValue === undefined || typeof columnValue !== 'object') {
		return null;
	}
	const items = (columnValue as Record<string, unknown>)[componentTipo];
	if (items === undefined || items === null) return null;
	// PHP coerces non-array data to [$data] (legacy matrix_dd compat).
	const array = Array.isArray(items) ? items : [items];
	// Drop null/'' holes: a null data item is never valid, but corrupt/legacy
	// records carry them (e.g. a trailing `null` from a bad delete). PHP emits
	// them verbatim (get_data), which CRASHES the copied client — the date edit
	// renderer reads current_value.id on a null entry at index>0
	// (render_edit_component_date.js). We diverge from that PHP live defect and
	// strip the holes at the single read chokepoint, protecting every view; a
	// later save then self-heals the stored array. Pinned in
	// test/unit/component_data_null_filter.test.ts.
	return array.filter((item) => item !== null && item !== '');
}

/** Language-filtered slice (PHP get_data_lang). */
export function filterItemsByLang(items: unknown[], lang: string): unknown[] {
	return items.filter(
		(item) =>
			item !== null && typeof item === 'object' && (item as { lang?: string }).lang === lang,
	);
}

/**
 * The component's value for a lang + its fallback (PHP list/edit data flow).
 * Returns {value, fallbackValue}: value = lang slice (or full array when not
 * translatable); fallbackValue only computed when value is empty.
 */
/**
 * Whether a model's CLASS supports translation (PHP supports_translation
 * property — a class-level gate, deliberately independent of the ontology
 * `translatable` flag; see class.component_common.php :1301-1308). Only these
 * lang-filter their items; everything else returns the full array. The set of
 * translatable classes now lives per-model in the component registry
 * (descriptor.classSupportsTranslation).
 */
function classSupportsTranslation(model: string): boolean {
	return getComponentModel(model)?.classSupportsTranslation === true;
}

export async function resolveComponentValue(
	record: MatrixRecord,
	componentTipo: string,
	model: string,
	lang: string,
): Promise<{ value: unknown[] | null; fallbackValue: unknown[] | null }> {
	// component_alias data key (WC-020): an alias stores NOTHING under its own
	// tipo — its value lives in the TARGET's column slot.
	const { resolveDataTipo } = await import('../ontology/alias.ts');
	const dataTipo = await resolveDataTipo(componentTipo);
	const items = readComponentItems(record, dataTipo, model);
	if (items === null || items.length === 0) {
		return { value: null, fallbackValue: null };
	}
	if (!classSupportsTranslation(model)) {
		return { value: items, fallbackValue: null };
	}

	// Effective filter lang = the INSTANCE lang: ontology-non-translatable
	// string-family components are nolan-forced at instantiation (PHP
	// get_element_lang); component_iri honors the requested lang as-is
	// (empirically verified against live PHP, 2026-07-02).
	const translatable = await getTranslatableByTipo(componentTipo);
	const effectiveLang = translatable || model === 'component_iri' ? lang : NOLAN;
	const slice = filterItemsByLang(items, effectiveLang);
	if (slice.length > 0) {
		return { value: slice, fallbackValue: null };
	}

	// Empty slice: iri emits a plain empty array (no fallback machinery);
	// the string family computes the fallback chain (main lang → nolan →
	// remaining project langs), entries stay null.
	if (model === 'component_iri') {
		return { value: [], fallbackValue: null };
	}
	const tried = new Set([effectiveLang]);
	for (const candidate of [DEFAULT_DATA_LANG, NOLAN, ...ALL_LANGS, NOLAN]) {
		if (tried.has(candidate)) continue;
		tried.add(candidate);
		const fallbackSlice = filterItemsByLang(items, candidate);
		if (fallbackSlice.length > 0) {
			return { value: null, fallbackValue: fallbackSlice };
		}
	}
	return { value: null, fallbackValue: null };
}

/**
 * The sections envelope: first data item of every section-list response
 * (PHP sections_json.php :136). Lives here with DataItem so every emitter —
 * the section read pipeline and the relations layer — shares one response
 * vocabulary without importing each other.
 */
export interface SectionsEnvelope {
	typo: 'sections';
	tipo: string;
	section_tipo: [];
	entries: { section_tipo: string; section_id: number; paginated_key: number }[];
}

/** A data item as the API emits it (PHP get_data_item :3981). */
export interface DataItem {
	section_id: number | string | null;
	section_tipo: string;
	tipo: string;
	mode: string;
	lang: string;
	from_component_tipo: string;
	/** The value payload — PHP names this key 'entries'. */
	entries: unknown[] | null;
	[extra: string]: unknown;
}

/**
 * EmissionContext — the EXPLICIT per-read emission protocol (audit S2-29).
 *
 * One instance is created wherever a response data array is born (a section
 * read, a get_data/resolve_data call, a TM row set) and THREADED through
 * emitDdoData → the relation resolvers → expandPortal/emitDataframeItem. It
 * replaces the old implicit protocol: a bare out-param array plus a
 * MODULE-GLOBAL WeakSet (relation_core.nestedStampedItems) that decided which
 * items an outer re-stamp loop was allowed to rewrite.
 *
 * The contract emitters must follow (unchanged semantics, now visible):
 * - push items to `items` IN EMISSION ORDER (outer loops rewrite identity on
 *   index ranges pushed since a checkpoint — PHP class.common.php:2792-2799);
 * - after stamping an item's identity (from_component_tipo/section_id/row
 *   anchor), call `markStamped(item)` so outer expansions keep the nested
 *   creator's identity and only rewrite the row anchor + outward parent;
 * - cross-item per-read memory (e.g. relation_index's solved pointing
 *   sections) lives in `scratch` under a module-local symbol — never in
 *   module-level state keyed by request objects.
 */
export class EmissionContext {
	/** The response data array (envelope at [0] on section reads). */
	readonly items: (SectionsEnvelope | DataItem)[];
	/** Items whose identity a NESTED expansion already stamped (see class doc). */
	readonly #stamped = new WeakSet<object>();
	/** Per-read emitter scratch, keyed by module-local symbols (see class doc). */
	readonly scratch = new Map<symbol, unknown>();

	constructor(items: (SectionsEnvelope | DataItem)[] = []) {
		this.items = items;
	}

	markStamped(item: object): void {
		this.#stamped.add(item);
	}

	isStamped(item: object): boolean {
		return this.#stamped.has(item);
	}
}

/**
 * Build the canonical data item envelope.
 *
 * WC-001 (engineering/WIRE_CONTRACT.md, DEC-02): an empty value emits `entries: []`
 * — NEVER null — for EVERY model. PHP emits null; the byte-identical client's
 * lifecycle code requires an array (`entries.map(...)` call sites crash on
 * null), so the TS engine unified on `[]` at this single chokepoint. Parity
 * gates reconcile via test/parity/normalize.ts adoptEntriesArrayContract on
 * the PHP side.
 */
export function buildDataItem(
	componentTipo: string,
	sectionTipo: string,
	sectionId: number | string | null,
	mode: string,
	lang: string,
	entries: unknown[] | null,
	fromComponentTipo?: string,
): DataItem {
	return {
		section_id: sectionId,
		section_tipo: sectionTipo,
		tipo: componentTipo,
		mode,
		lang,
		from_component_tipo: fromComponentTipo ?? componentTipo,
		entries: entries ?? [],
	};
}
