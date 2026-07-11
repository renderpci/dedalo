/**
 * Display-term resolution for ontology nodes (PHP ontology_node::get_term_by_tipo
 * with fallback). Extracted from api/handlers/menu.ts (2026-07-10) so the
 * section_tool tool_config enrichment (tools/section_tool_context.ts) shares the
 * EXACT label fallback chain with the menu — the two flows must stay byte-equal
 * on the wire.
 */

import { sql } from '../db/postgres.ts';
import { currentApplicationLang } from '../resolve/request_lang.ts';
import { createOntologyCache } from './cache_factory.ts';
import { registerOntologyCacheClearer } from './cache_invalidation.ts';

/**
 * Resolve a node's display label from its `term` lang-map: the application
 * language, then the structure language, then any non-empty term (PHP
 * ontology_node::get_term with fallback). Empty when no term at all.
 */
export function resolveLabel(term: Record<string, string> | null): string {
	if (term === null) return '';
	const appLang = currentApplicationLang();
	if (term[appLang]) return term[appLang];
	// Structure lang fallback (PHP DEDALO_STRUCTURE_LANG; lg-spa on this install).
	if (term['lg-spa']) return term['lg-spa'];
	for (const value of Object.values(term)) {
		if (value) return value;
	}
	return '';
}

/**
 * Raw `term` lang-maps for the section_tool ddo_map label stamps. The
 * per-entry SELECT in getOntologyTermLabel was the DOMINANT surviving menu
 * cost after the walk cache (~30 queries per read across the 6 section_tool
 * nodes, measured 2026-07-09). Lang-free raw maps — resolveLabel applies the
 * per-request application lang downstream.
 */
const termRowCache = createOntologyCache<string, Record<string, string> | null>();

export function clearTermLabelCache(): void {
	termRowCache.clear();
}
registerOntologyCacheClearer(clearTermLabelCache);

/** The app-lang display term of one ontology node (PHP get_term_by_tipo). */
export async function getOntologyTermLabel(tipo: string): Promise<string> {
	// has() (not get()) — a node without a term caches null.
	if (termRowCache.has(tipo)) {
		return resolveLabel(termRowCache.get(tipo) ?? null);
	}
	const rows = (await sql.unsafe('SELECT term FROM dd_ontology WHERE tipo = $1', [tipo])) as {
		term: Record<string, string> | null;
	}[];
	const term = rows[0]?.term ?? null;
	termRowCache.set(tipo, term);
	return resolveLabel(term);
}
