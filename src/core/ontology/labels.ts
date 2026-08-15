/**
 * Ontology LABEL resolution — the dd_ontology.term → display-label lookup,
 * shared by structure-context, the section module, and the request_config ddo
 * enrichment. Extracted from resolve/structure_context.ts so the section
 * context/buttons split can resolve labels without importing back into the
 * structure-context builder (cycle-free).
 *
 * PHP reference: RecordObj_dd term resolution + common label fallback
 * (application lang first, then the first non-empty translation).
 */

import { config } from '../../config/config.ts';
import { sql } from '../db/postgres.ts';
import { translationLangOf } from '../resolve/lang_alias.ts';
import { currentApplicationLang } from '../resolve/request_lang.ts';
import { createOntologyCache } from './cache_factory.ts';
import { registerOntologyCacheClearer } from './cache_invalidation.ts';

/**
 * The language the ONTOLOGY STRUCTURE itself is authored in (S2-28: one named
 * constant so every structure-lang fallback is auditable — this is NOT a data
 * or interface language default; those are request-scoped via
 * currentDataLang()/currentApplicationLang()). Config: DEDALO_STRUCTURE_LANG
 * (only lg-spa is accepted upstream). Dédalo's shipped ontology terms are
 * guaranteed present in Spanish; term fallback chains end here before the
 * first-non-empty scan.
 */
export const ONTOLOGY_STRUCTURE_LANG = config.lang.structureLang;

/**
 * Pick the display label from an ontology term object: the requested
 * application language first, then the PHP fallback (first non-empty entry).
 * `lang` defaults to the request-scoped effective application language, so a
 * user's interface-language choice re-labels every ontology-derived title.
 */
export function resolveLabel(
	term: unknown,
	lang: string = currentApplicationLang(),
): string | null {
	if (term === null || typeof term !== 'object') return null;
	const termMap = term as Record<string, string>;
	if (typeof termMap[lang] === 'string' && termMap[lang] !== '') return termMap[lang] as string;
	// Declared language equivalence (PHP lang::get_label_lang via RecordObj_dd:
	// ontology terms are authored in the canonical member — Català — and the
	// other members read it). Without this step a Valencian interface fell to
	// the first-non-empty scan below, i.e. an ARBITRARY language.
	const translationLang = translationLangOf(lang);
	if (
		translationLang !== null &&
		typeof termMap[translationLang] === 'string' &&
		termMap[translationLang] !== ''
	) {
		return termMap[translationLang] as string;
	}
	// First non-empty entry, PHP fallback.
	for (const value of Object.values(termMap)) {
		if (typeof value === 'string' && value !== '') return value;
	}
	return null;
}

/**
 * Cached (lang, tipo) → label (dd_ontology.term). Keyed by language too: the
 * same tipo resolves to different labels per interface language, so a shared
 * per-tipo cache would bleed one user's language into another's (spec §4).
 */
const labelCache = createOntologyCache<string, string | null>();

/** Label lookup for one tipo (dd_ontology.term), cached per-process per-lang. */
export async function labelByTipo(
	tipo: string,
	lang: string = currentApplicationLang(),
): Promise<string | null> {
	const cacheKey = `${lang} ${tipo}`;
	const cached = labelCache.get(cacheKey);
	if (cached !== undefined) return cached;
	const rows = (await sql`
		SELECT term FROM dd_ontology WHERE tipo = ${tipo} LIMIT 1
	`) as { term: unknown }[];
	const label = resolveLabel(rows[0]?.term ?? null, lang);
	labelCache.set(cacheKey, label);
	return label;
}

/** Clear the label cache (test isolation / cache-invalidation hooks). */
export function clearLabelCache(): void {
	labelCache.clear();
	termCache.clear();
}
registerOntologyCacheClearer(clearLabelCache);

/**
 * Cached (lang, tipo) → display term. Factory-created (hub-cleared on every
 * dd_ontology write) — the S2-27 fix: the old canonical copy in
 * tm_record.ts was UNCACHED and called per-item in loops.
 */
const termCache = createOntologyCache<string, string>();

/**
 * The display term of one ontology node in `lang` (PHP get_term_by_tipo) —
 * THE canonical termByTipo (audit S2-27: this collapses the four parallel
 * resolvers; tm_record/ts_object copies are deleted, read_tm re-exports this
 * one for legacy importers). Fallback chain (distinct from labelByTipo's):
 * requested lang → the ontology structure lang → first non-empty translation
 * → the tipo itself (labelByTipo instead resolves lang → first non-empty →
 * null, the PHP RecordObj_dd label rule).
 */
export async function termByTipo(tipo: string, lang: string): Promise<string> {
	const cacheKey = `${lang} ${tipo}`;
	const cached = termCache.get(cacheKey);
	if (cached !== undefined) return cached;
	const rows = (await sql`
		SELECT term FROM dd_ontology WHERE tipo = ${tipo} LIMIT 1
	`) as { term: Record<string, string> | null }[];
	const term = rows[0]?.term ?? null;
	// The declared language equivalence slots between the requested lang and the
	// structure lang, same as resolveLabel (Valencià reads the Català term).
	const translationLang = term === null ? null : translationLangOf(lang);
	const resolved =
		term === null
			? tipo
			: (term[lang] ??
				(translationLang !== null ? term[translationLang] : undefined) ??
				term[ONTOLOGY_STRUCTURE_LANG] ??
				Object.values(term).find((value) => value) ??
				tipo);
	termCache.set(cacheKey, resolved);
	return resolved;
}

/**
 * The display label for a value that IS an ontology tipo: `«term» [tipo]`.
 *
 * Several columns store a tipo as their value and must show which node it is —
 * two nodes routinely share a term, so the term alone is ambiguous. PHP renders
 * them all the same way; TS had the transform written out three times (the TM
 * What column inside its emitter, the dd542 Activity `where` column inside
 * emitDdoData, and nowhere at all for the TM Where column, which therefore
 * showed a bare term). One helper, one shape
 * (WC-2026-08-14-tm-cells-obey-list-emit-policy).
 */
export async function ontologyTermLabel(tipo: string, lang: string): Promise<string> {
	return `${await termByTipo(tipo, lang)} [${tipo}]`;
}
