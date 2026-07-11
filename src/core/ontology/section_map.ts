/**
 * SECTION_MAP access (PHP section::get_section_map + class.section_map.php):
 * every section may declare a 'section_map' ontology child whose properties
 * name its FUNCTIONAL components per scope — e.g. {thesaurus: {term: 'es16',
 * parent: 'es48'}, relation_list: {...}}. Consumers resolve "the term
 * component of section X" without hardcoding tipos.
 *
 * Scope lookups fall back through SCOPE_FALLBACK (main → thesaurus →
 * relation_list) when the requested scope has no value — a section declaring
 * only 'main' still answers a 'thesaurus.term' query (PHP
 * section_map::get_element_tipo).
 *
 * Virtual sections (ontology aliases) resolve through their real section
 * (relations[0].tipo).
 */

import { sql } from '../db/postgres.ts';
import { createOntologyCache } from './cache_factory.ts';
import { registerOntologyCacheClearer } from './cache_invalidation.ts';

/** PHP section_map::SCOPE_FALLBACK chain. */
export const SCOPE_FALLBACK = ['main', 'thesaurus', 'relation_list'];

const sectionMapCache = createOntologyCache<string, Record<string, unknown> | null>();

/** Drop the section_map properties cache. */
export function clearSectionMapCache(): void {
	sectionMapCache.clear();
}
registerOntologyCacheClearer(clearSectionMapCache);

/** section::get_section_map — the section_map child node's properties (virtual-aware). */
export async function getSectionMap(sectionTipo: string): Promise<Record<string, unknown> | null> {
	const cached = sectionMapCache.get(sectionTipo);
	if (cached !== undefined) return cached;
	const read = async (parent: string) =>
		(await sql.unsafe(
			`SELECT properties FROM dd_ontology WHERE parent = $1 AND model = 'section_map' LIMIT 1`,
			[parent],
		)) as { properties: Record<string, unknown> | null }[];
	let rows = await read(sectionTipo);
	if (rows.length === 0) {
		// virtual section: its node's relations[0].tipo points at the real section
		const nodeRows = (await sql.unsafe('SELECT relations FROM dd_ontology WHERE tipo = $1', [
			sectionTipo,
		])) as { relations: { tipo?: unknown }[] | null }[];
		const real = nodeRows[0]?.relations?.[0]?.tipo;
		if (typeof real === 'string') rows = await read(real);
	}
	const map = rows[0]?.properties ?? null;
	sectionMapCache.set(sectionTipo, map);
	return map;
}

/** section_map::get_element_tipo — per-key scope chain walk. */
export async function getSectionMapValue(
	sectionTipo: string,
	scope: string,
	key: string,
): Promise<unknown> {
	const map = await getSectionMap(sectionTipo);
	if (map === null) return null;
	const direct = (map[scope] as Record<string, unknown> | undefined)?.[key];
	if (direct !== undefined && direct !== null && direct !== '') return direct;
	for (const candidate of [scope, ...SCOPE_FALLBACK]) {
		const node = map[candidate];
		if (node !== null && typeof node === 'object' && key in (node as Record<string, unknown>)) {
			return (node as Record<string, unknown>)[key];
		}
	}
	return null;
}
