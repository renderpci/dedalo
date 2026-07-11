/**
 * Language display helpers — TS port of lang::get_name_from_code and
 * lang::get_alpha2_from_code (core/common/class.lang.php).
 *
 * get_name_from_code resolves a `lg-<code>` to its human name in the requested
 * lang (fallback: install data lang, then any), reading the langs section (lg1)
 * from matrix_langs. get_alpha2_from_code is the fixed ISO 639-1 map the HTML5
 * <track> element expects. Used by the component_av subtitles descriptor.
 */

import { sql } from '../db/postgres.ts';
import { createDataCache } from '../ontology/cache_factory.ts';
import { currentDataLang } from './request_lang.ts';

const LANGS_SECTION_TIPO = 'lg1';
const LANGS_TABLE = 'matrix_langs';
const TERM_TIPO = 'hierarchy25'; // DEDALO_THESAURUS_TERM_TIPO — the language name
const CODE_TIPO = 'hierarchy41'; // DEDALO_THESAURUS_CODE_TIPO — the tld code
const NOLAN = 'lg-nolan';

interface LangName {
	lang: string;
	value: string;
}
// Data-derived (matrix_langs lg1 records): a lang-record write re-resolves.
const nameCache = createDataCache<string, string | null>((cache, sectionTipo) => {
	if (sectionTipo === LANGS_SECTION_TIPO) cache.clear();
});

/**
 * PHP lang::fallback_lang_value: requested lang → request data lang → any.
 * `dataLang` is an EXPLICIT parameter (DEC-13 rule 1): the caller resolves the
 * ambient value once and uses it for both the cache key and this fallback —
 * an ambient read inside a cached builder was the S3-21/S3-59 bleed.
 */
function fallbackLangValue(names: LangName[], lang: string, dataLang: string): string | null {
	const exact = names.find((name) => name.lang === lang);
	if (exact?.value) return exact.value;
	const main = names.find((name) => name.lang === dataLang);
	if (main?.value) return main.value;
	const any = names.find((name) => name.value);
	return any?.value ?? null;
}

/**
 * The human name of a language code (PHP lang::get_name_from_code). Returns null
 * for the lg-nolan sentinel or an unknown code.
 */
export async function getLangNameFromCode(
	langCode: string,
	lang: string = currentDataLang(),
): Promise<string | null> {
	if (langCode === NOLAN) return null;
	// The fallback consults the request data lang, so the key carries BOTH lang
	// dimensions (S3-21/S3-59: an unkeyed fallback dimension served requester
	// A's data-lang fallback to requester B).
	const dataLang = currentDataLang();
	const cacheKey = `${langCode}_${lang}_${dataLang}`;
	const cached = nameCache.get(cacheKey);
	if (cached !== undefined) return cached;
	const code = langCode.replace('lg-', '');
	const rows = (await sql.unsafe(
		`SELECT "string"->'${TERM_TIPO}' AS names
		 FROM "${LANGS_TABLE}"
		 WHERE section_tipo = $1 AND "string"->'${CODE_TIPO}'->0->>'value' = $2
		 LIMIT 1`,
		[LANGS_SECTION_TIPO, code],
	)) as { names: LangName[] | null }[];
	const names = Array.isArray(rows[0]?.names) ? (rows[0]?.names as LangName[]) : [];
	const name = fallbackLangValue(names, lang, dataLang);
	nameCache.set(cacheKey, name);
	return name;
}

/** PHP lang::get_alpha2_from_code — the ISO 639-1 map (null when unmapped). */
const ALPHA2_MAP: Readonly<Record<string, string>> = {
	'lg-spa': 'es',
	'lg-eng': 'en',
	'lg-cat': 'ca',
	'lg-vlca': 'ca', // Valencian shares the Catalan ISO 639-1 code
	'lg-fra': 'fr',
	'lg-eus': 'eu',
	'lg-por': 'pt',
	'lg-ara': 'ar',
	'lg-rus': 'ru',
	'lg-ell': 'el',
	'lg-deu': 'de',
	'lg-ita': 'it',
	'lg-lat': 'la',
	'lg-glg': 'gl',
	'lg-nep': 'ne',
};

export function getAlpha2FromCode(langCode: string): string | null {
	return ALPHA2_MAP[langCode] ?? null;
}
