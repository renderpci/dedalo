/**
 * ddinfo — the thesaurus-target breadcrumb item (PHP dd_info): for each
 * resolved locator whose target lives in a THESAURUS section, the list-cell
 * subdatum emits the target's ANCESTOR CHAIN — parent terms closest-first,
 * ending with the hierarchy's own label — so the UI can show "Hispania
 * Citerior → Hispaniae → Provincias romanas → Toponimia histórica".
 *
 * Resolution (user-confirmed): the parent walk uses the target section's
 * section_map (thesaurus scope `parent` component, `term` component(s)) with
 * the generic hierarchy components as the fallback (hierarchy36 parent,
 * hierarchy25 term); the trailing label is the hierarchy registry record
 * (hierarchy1, matched by its target-section value hierarchy53) `hierarchy5`
 * name.
 */

import { sql } from '../db/postgres.ts';
import { createOntologyCache } from '../ontology/cache_factory.ts';
import { registerOntologyCacheClearer } from '../ontology/cache_invalidation.ts';
import { getMatrixTableFromTipo } from '../ontology/resolver.ts';

/** Generic thesaurus components (PHP hierarchyNN family defaults). */
const DEFAULT_PARENT_COMPONENT = 'hierarchy36';
const DEFAULT_TERM_COMPONENTS = ['hierarchy25'];

interface ThesaurusMapConfig {
	parent: string;
	terms: string[];
}

const mapCache = createOntologyCache<string, ThesaurusMapConfig>();

/** Drop the ontology-derived thesaurus section_map cache. */
export function clearDdInfoCache(): void {
	mapCache.clear();
}
registerOntologyCacheClearer(clearDdInfoCache);

/** The section's parent/term components (section_map thesaurus scope). */
async function getThesaurusMap(sectionTipo: string): Promise<ThesaurusMapConfig> {
	const cached = mapCache.get(sectionTipo);
	if (cached !== undefined) return cached;
	// Canonical (virtual-aware, cached) section_map accessor — S2-27: the raw
	// `WHERE parent = tipo` copy missed virtual sections' real-section map.
	const { getSectionMap } = await import('../ontology/section_map.ts');
	const sectionMap = (await getSectionMap(sectionTipo)) as {
		thesaurus?: { parent?: string; term?: string | string[] };
	} | null;
	const scope = sectionMap?.thesaurus;
	const term = scope?.term;
	const resolved: ThesaurusMapConfig = {
		parent: scope?.parent ?? DEFAULT_PARENT_COMPONENT,
		terms:
			term === undefined || term === null
				? DEFAULT_TERM_COMPONENTS
				: Array.isArray(term)
					? term
					: [term],
	};
	mapCache.set(sectionTipo, resolved);
	return resolved;
}

/** One record's term string (lang slice, any-lang fallback), or null. */
async function resolveTerm(
	table: string,
	sectionTipo: string,
	sectionId: number,
	termComponents: string[],
	lang: string,
): Promise<string | null> {
	const rows = (await sql.unsafe(
		`SELECT string, data FROM "${table}" WHERE section_tipo = $1 AND section_id = $2`,
		[sectionTipo, sectionId],
	)) as { string: Record<string, unknown[]> | null; data: Record<string, unknown[]> | null }[];
	const record = rows[0];
	if (record === undefined) return null;
	for (const component of termComponents) {
		const items = (record.string?.[component] ?? record.data?.[component] ?? []) as {
			lang?: string;
			value?: string;
		}[];
		const match = items.find((item) => item.lang === lang) ?? items[0];
		if (match?.value !== undefined && match.value !== '') return match.value;
	}
	return null;
}

/**
 * The ancestor-chain value of one thesaurus target (see module doc). Returns
 * [] when the target has no parent (a root term).
 *
 * `withHierarchyLabel`: the PORTAL-CELL ddinfo (autocomplete_hi edit widget)
 * ends the chain with the hierarchy registry record's own name (the module
 * doc's user-confirmed shape); the SECTION-ROWS ddinfo (the picker's
 * value_with_parents breadcrumb, PHP get_ddinfo_parents via get_locator_value
 * show_parents) ends at the ROOT TERM — no trailing label (byte-diffed vs the
 * live oracle on fr1, 2026-07-09: PHP […,"France"], never […,"France","Francia"]).
 */
export async function buildDdInfoChain(
	targetSectionTipo: string,
	targetSectionId: number | string,
	lang: string,
	withHierarchyLabel = true,
): Promise<string[]> {
	const table = await getMatrixTableFromTipo(targetSectionTipo);
	if (table === null) return [];
	const chain: string[] = [];
	let currentSection = targetSectionTipo;
	let currentId = Number(targetSectionId);

	for (let depth = 0; depth < 20; depth++) {
		const map = await getThesaurusMap(currentSection);
		const rows = (await sql.unsafe(
			`SELECT relation->$3 AS parents FROM "${table}" WHERE section_tipo = $1 AND section_id = $2`,
			[currentSection, currentId, map.parent],
		)) as { parents: { section_tipo?: string; section_id?: string | number }[] | null }[];
		const parentLocator = rows[0]?.parents?.[0];
		if (parentLocator?.section_tipo === undefined || parentLocator.section_id === undefined) {
			break;
		}
		const parentSection = String(parentLocator.section_tipo);
		const parentId = Number(parentLocator.section_id);
		const parentMap = await getThesaurusMap(parentSection);
		const term = await resolveTerm(table, parentSection, parentId, parentMap.terms, lang);
		if (term !== null) chain.push(term);
		currentSection = parentSection;
		currentId = parentId;
	}

	// Trailing label: the hierarchy registry record's own name (portal-cell
	// shape only — see the doc above).
	if (withHierarchyLabel && chain.length > 0) {
		const labelRows = (await sql.unsafe(
			`SELECT COALESCE(string->'hierarchy5', data->'hierarchy5') AS label
			 FROM matrix_hierarchy_main
			 WHERE section_tipo = 'hierarchy1'
			   AND COALESCE(data->'hierarchy53', string->'hierarchy53')->0->>'value' = $1
			 LIMIT 1`,
			[targetSectionTipo],
		)) as { label: { lang?: string; value?: string }[] | null }[];
		const items = labelRows[0]?.label ?? [];
		const match = items.find((item) => item.lang === lang) ?? items[0];
		if (match?.value !== undefined && match.value !== '') chain.push(match.value);
	}
	return chain;
}

/** Whether ddinfo applies: the target lives in a thesaurus table. */
export async function isThesaurusTarget(sectionTipo: string): Promise<boolean> {
	return (await getMatrixTableFromTipo(sectionTipo)) === 'matrix_hierarchy';
}

/**
 * The recursive PARENT locators of one thesaurus record, closest first (PHP
 * component_relation_parent::get_parents_recursive — the walk behind the
 * relation_search ancestor index). Same section_map parent resolution as the
 * ddinfo chain; cycle-guarded at 20 hops.
 */
export async function getParentChainLocators(
	targetSectionTipo: string,
	targetSectionId: number | string,
): Promise<{ section_tipo: string; section_id: string }[]> {
	const table = await getMatrixTableFromTipo(targetSectionTipo);
	if (table === null) return [];
	const chain: { section_tipo: string; section_id: string }[] = [];
	let currentSection = targetSectionTipo;
	let currentId = Number(targetSectionId);
	for (let depth = 0; depth < 20; depth++) {
		const map = await getThesaurusMap(currentSection);
		const rows = (await sql.unsafe(
			`SELECT relation->$3 AS parents FROM "${table}" WHERE section_tipo = $1 AND section_id = $2`,
			[currentSection, currentId, map.parent],
		)) as { parents: { section_tipo?: string; section_id?: string | number }[] | null }[];
		const parentLocator = rows[0]?.parents?.[0];
		if (parentLocator?.section_tipo === undefined || parentLocator.section_id === undefined) break;
		chain.push({
			section_tipo: String(parentLocator.section_tipo),
			section_id: String(parentLocator.section_id),
		});
		currentSection = String(parentLocator.section_tipo);
		currentId = Number(parentLocator.section_id);
	}
	return chain;
}
