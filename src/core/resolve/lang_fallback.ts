/**
 * DETERMINISTIC lang fallback for translated PROGRAM strings stored as a
 * lang-keyed item array (`[{lang, value}, …]`).
 *
 * WHY THIS EXISTS
 * PHP resolved a missing translation by taking `items[0]` — whatever the
 * column's stored order happened to put first. Stored order is alphabetical by
 * lang code, so an install running lg-spa was served the GERMAN string for any
 * tool whose description lacked Spanish (lg-deu sorts first), and the CATALAN
 * one where German was absent. That is not a language choice, it is an
 * artefact: the same missing translation resolved to a different language
 * depending on which OTHER languages existed.
 *
 * THE CHAIN (first hit wins), mirroring the UI-label catalog chain
 * (labels/catalog.ts) so the two label stores degrade the same way:
 *
 *   1. the requested application lang;
 *   2. its declared LINGUISTIC alias (lang_alias.translationLangOf — a
 *      Valencian interface reads the Catalan string);
 *   3. the INSTALL's default application lang (the operator's choice);
 *   4. MASTER_SOURCE_LANG — the language program strings are AUTHORED in, so
 *      it is the only defensible last translation;
 *   5. the first non-empty entry — kept so a string that exists in NO chain
 *      lang still shows something rather than vanishing, but now reached only
 *      when every meaningful candidate missed.
 *
 * Divergence from the (dead) PHP oracle: WC-2026-08-02-tool-string-lang-fallback.
 * Pure function over the boot-frozen config — no request state, no caches.
 */

import { config } from '../../config/config.ts';
import { MASTER_SOURCE_LANG } from '../labels/catalog.ts';
import { translationLangOf } from './lang_alias.ts';

/** An item of a translated string column: the shape both tool and data columns use. */
export interface LangItem {
	lang?: string;
	value?: string;
}

/**
 * The candidate langs for `requestedLang`, in priority order, deduplicated.
 * Exported for gates that assert the chain without building item arrays.
 */
export function langFallbackChain(requestedLang: string): string[] {
	const chain: string[] = [requestedLang];
	const alias = translationLangOf(requestedLang);
	if (alias !== null) chain.push(alias);
	chain.push(config.lang.applicationLangsDefault, MASTER_SOURCE_LANG);
	return chain.filter((lang, index) => lang !== '' && chain.indexOf(lang) === index);
}

/**
 * The value for `requestedLang` following the chain above, or null when no
 * entry carries a non-empty value.
 */
export function resolveLangItems(
	items: readonly LangItem[] | undefined,
	requestedLang: string,
): string | null {
	if (items === undefined || items.length === 0) return null;
	for (const lang of langFallbackChain(requestedLang)) {
		const value = items.find((item) => item.lang === lang)?.value;
		if (value !== undefined && value !== '') return value;
	}
	const first = items.find((item) => item.value !== undefined && item.value !== '')?.value;
	return first ?? null;
}
