/**
 * component_select_lang datalist + list-value — a language picker whose OPTIONS
 * are the project default languages, NOT the records of a target section.
 *
 * PHP overrides the generic get_list_of_values/get_list_value here:
 * - options = lang::resolve_multiple(DEDALO_PROJECTS_DEFAULT_LANGS): each project
 *   lang → a langs-section (lg1) record, labeled with its name in the requested
 *   lang (fallback_lang_value), sorted by strcmp(label)
 *   (class.component_select_lang.php get_list_of_values);
 * - list value = the labels of the options whose locator matches the stored
 *   data, resolved in DEDALO_DATA_LANG, with the get_missing_lang `*` guard for a
 *   stored lang that is not a project lang (get_list_value / get_missing_lang).
 *
 * PHP constants (config): DEDALO_LANGS_SECTION_TIPO 'lg1', langs table
 * 'matrix_langs', DEDALO_THESAURUS_TERM_TIPO 'hierarchy25' (names),
 * DEDALO_THESAURUS_CODE_TIPO 'hierarchy41' (code).
 */

import { sql } from '../db/postgres.ts';
import { createDataCache } from '../ontology/cache_factory.ts';
import { currentDataLang } from '../resolve/request_lang.ts';
import { registerSectionDataListener } from '../section_record/save_event.ts';

/**
 * One select_lang option (PHP get_list_of_values item). Unlike the generic
 * datalist item it carries NO `hide` key — the PHP override emits only
 * {value, label, section_id}.
 */
export interface SelectLangDatalistItem {
	/** The lg1 record address — INT (WC-2026-08-10-section-id-int-canonical). */
	value: { section_tipo: string; section_id: number };
	label: string;
	/**
	 * NOT a record address: the 'lg-<code>' language token the widget keys its
	 * options by. It stays a STRING verbatim — same field name, different
	 * concept (concepts/section_id.ts header).
	 */
	section_id: string;
}

const LANGS_SECTION_TIPO = 'lg1'; // DEDALO_LANGS_SECTION_TIPO
const LANGS_TABLE = 'matrix_langs'; // lang::$langs_matrix_table
const TERM_TIPO = 'hierarchy25'; // DEDALO_THESAURUS_TERM_TIPO — the language name
const CODE_TIPO = 'hierarchy41'; // DEDALO_THESAURUS_CODE_TIPO — the tld code

interface LangName {
	lang: string;
	value: string;
}
interface ResolvedLang {
	section_id: number;
	code: string;
	names: LangName[];
}

/** Per-lang cache of the resolved project langs (small, install-stable). */
let resolvedLangsCache: ResolvedLang[] | null = null;
/**
 * section_id → 'lg-<code>' cache for {@link getLangCodeBySectionId}. Same
 * character as resolvedLangsCache: lg1 records are install-stable data, and the
 * lookup runs once per text_area row in list emission (the original-language
 * forcing), so it must not be a query per row. Factory-created: a write to a
 * langs-section record clears it by construction.
 */
const langCodeCache = createDataCache<number, string | null>((cache, sectionTipo) => {
	if (sectionTipo === LANGS_SECTION_TIPO) cache.clear();
});
// Data-derived (lg1 records: names/codes): a write/delete of a langs-section
// record rebuilds the list on next read (S1-11 channel; WS-B lifecycle sweep).
registerSectionDataListener((sectionTipo) => {
	if (sectionTipo === LANGS_SECTION_TIPO) resolvedLangsCache = null;
});

/**
 * PHP lang::get_section_id_from_code — the lg1 record id for a lang code,
 * WHATEVER the project's language list says. The import needs exactly this
 * distinction: a code that resolves but is not a project lang is importable
 * (with a warning), while a code that resolves to nothing is a hard error.
 * Returns null when no lg1 record carries the code.
 */
export async function getLangSectionIdByCode(code: string): Promise<number | null> {
	const bare = code.startsWith('lg-') ? code.slice(3) : code;
	// CODE_TIPO is a fixed ontology constant (tipo-grammar safe); the code is bound.
	const rows = (await sql.unsafe(
		`SELECT section_id
		   FROM "${LANGS_TABLE}"
		  WHERE section_tipo = $1
		    AND "string"->'${CODE_TIPO}'->0->>'value' = $2
		  LIMIT 1`,
		[LANGS_SECTION_TIPO, bare],
	)) as { section_id: number }[];
	return rows[0]?.section_id ?? null;
}

/**
 * The INVERSE of getLangSectionIdByCode: the Dédalo lang tag ('lg-<code>') of
 * one lg1 record (PHP lang::get_code_from_locator, which read the lg1 record's
 * CODE component and prefixed 'lg-').
 *
 * This is how a component_select_lang VALUE — a locator into lg1, e.g. the
 * "Original language" (rsc263) of an interview — becomes the lang tag the rest
 * of the engine speaks. Returns null when the record does not exist or carries
 * no code (a half-built lg1 record must not mint an 'lg-undefined' tag).
 */
export async function getLangCodeBySectionId(sectionId: number): Promise<string | null> {
	if (!Number.isInteger(sectionId) || sectionId < 1) return null;
	if (langCodeCache.has(sectionId)) return langCodeCache.get(sectionId) ?? null;

	// CODE_TIPO is a fixed ontology constant (tipo-grammar safe); the id is bound.
	const rows = (await sql.unsafe(
		`SELECT "string"->'${CODE_TIPO}'->0->>'value' AS code
		   FROM "${LANGS_TABLE}"
		  WHERE section_tipo = $1
		    AND section_id = $2
		  LIMIT 1`,
		[LANGS_SECTION_TIPO, sectionId],
	)) as { code: string | null }[];

	const code = rows[0]?.code;
	const tag = code !== null && code !== undefined && code !== '' ? `lg-${code}` : null;
	langCodeCache.set(sectionId, tag);
	return tag;
}

/**
 * PHP lang::resolve_multiple(DEDALO_PROJECTS_DEFAULT_LANGS): the lg1 records of
 * the project languages, with their names map and tld code.
 */
async function resolveProjectLangs(): Promise<ResolvedLang[]> {
	if (resolvedLangsCache !== null) return resolvedLangsCache;
	const { config } = await import('../../config/config.ts');
	const codes = config.menu.projectsDefaultLangs.map((lang) => lang.replace('lg-', ''));
	// TERM_TIPO/CODE_TIPO are fixed ontology constants (tipo-grammar safe); only
	// the code list is a bound parameter.
	const rows = (await sql.unsafe(
		`SELECT section_id,
		        "string"->'${CODE_TIPO}'->0->>'value' AS code,
		        "string"->'${TERM_TIPO}' AS names
		 FROM "${LANGS_TABLE}"
		 WHERE section_tipo = $1
		   AND "string"->'${CODE_TIPO}'->0->>'value' = ANY(string_to_array($2, ','))`,
		[LANGS_SECTION_TIPO, codes.join(',')],
	)) as { section_id: number; code: string | null; names: LangName[] | null }[];
	resolvedLangsCache = rows.map((row) => ({
		section_id: row.section_id,
		code: row.code ?? '',
		names: Array.isArray(row.names) ? row.names : [],
	}));
	return resolvedLangsCache;
}

/**
 * PHP lang::fallback_lang_value: name in the requested lang, else the install
 * main data lang, else the first non-empty name.
 */
function fallbackLangValue(names: LangName[], lang: string): string | null {
	const exact = names.find((name) => name.lang === lang);
	if (exact?.value) return exact.value;
	const main = names.find((name) => name.lang === currentDataLang());
	if (main?.value) return main.value;
	const any = names.find((name) => name.value);
	return any?.value ?? null;
}

/** PHP strcmp — raw UTF-8 byte comparison (NOT strnatcmp/locale). */
function strcmp(a: string, b: string): number {
	return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/**
 * The datalist for component_select_lang (PHP get_list_of_values): one option
 * per project lang, sorted by label via strcmp.
 */
export async function getSelectLangDatalist(lang: string): Promise<SelectLangDatalistItem[]> {
	const langs = await resolveProjectLangs();
	const items: SelectLangDatalistItem[] = langs.map((resolved) => ({
		// Canonical int: this locator is what the widget posts back and save
		// persists (WC-2026-08-10-section-id-int-canonical).
		value: { section_tipo: LANGS_SECTION_TIPO, section_id: resolved.section_id },
		label: fallbackLangValue(resolved.names, lang) ?? resolved.code,
		section_id: `lg-${resolved.code}`,
	}));
	items.sort((a, b) => strcmp(a.label, b.label));
	return items;
}

/**
 * The list-mode value for component_select_lang (PHP get_list_value): labels of
 * the project-lang options whose locator matches the stored data, resolved in
 * the install data lang; the get_missing_lang `*` guard covers a stored lang
 * outside the project set.
 */
export async function getSelectLangListValue(
	storedLocators: { section_tipo?: unknown; section_id?: unknown }[],
	dataLang: string,
): Promise<string[]> {
	if (storedLocators.length === 0) return [];
	const datalist = await getSelectLangDatalist(dataLang);
	const labels: string[] = [];
	for (const option of datalist) {
		const matched = storedLocators.some(
			(locator) =>
				String(locator.section_tipo) === option.value.section_tipo &&
				String(locator.section_id) === String(option.value.section_id),
		);
		if (matched) labels.push(option.label);
	}
	// PHP get_missing_lang: a stored lang not among the project options is shown
	// as "<name> *" so the value is never silently dropped.
	if (labels.length === 0) {
		const first = storedLocators[0];
		if (first !== undefined) {
			const rows = (await sql.unsafe(
				`SELECT "string"->'${TERM_TIPO}' AS names
				 FROM "${LANGS_TABLE}"
				 WHERE section_tipo = $1 AND section_id = $2`,
				[String(first.section_tipo ?? LANGS_SECTION_TIPO), Number(first.section_id ?? 0)],
			)) as { names: LangName[] | null }[];
			const names = Array.isArray(rows[0]?.names) ? (rows[0]?.names as LangName[]) : [];
			const name = fallbackLangValue(names, dataLang);
			if (name !== null) labels.push(`${name} *`);
		}
	}
	return labels;
}

/** Test-only cache reset. */
export function clearSelectLangCache(): void {
	resolvedLangsCache = null;
	langCodeCache.clear();
}
