/**
 * area_thesaurus / area_ontology get_data — the tree-area boot payload (PHP
 * area_thesaurus_json via hierarchy/ontology::get_active_elements). Relocated
 * from resolve/area_hierarchy.ts into the area module (engineering/AREA_SPEC.md §5);
 * semantics unchanged (byte-parity gate: area_hierarchy_differential.test.ts).
 *
 *   data[0] = { tipo, value: hierarchy_item[], typologies: typology[] }
 *   hierarchy_item = { section_id, section_tipo, target_section_tipo,
 *     target_section_name, children_tipo, typology_section_id, order,
 *     type:'hierarchy', active_in_thesaurus, root_terms: locator[] }
 *   typology = { section_id, type:'typology', label, order }
 *
 * Sources (hierarchy1 records on matrix_hierarchy_main; ontology35 for the
 * ontology area): active = hierarchy4 dd64/1; name = hierarchy5 (lang slice);
 * target = hierarchy53; typology = hierarchy9 locator → hierarchy13 record
 * (label hierarchy16, order hierarchy106); order = hierarchy48 ?? 0;
 * active_in_thesaurus = hierarchy125 dd64/1; root_terms = hierarchy45
 * locators (sanitized; hierarchy59 in model view); children_tipo = the target
 * section's component_relation_children (recursive, virtual-resolved; ontology
 * fixed 'ontology14'). THESAURUS skips: not active_in_thesaurus, no target, no
 * typology, no root terms, no children_tipo. ONTOLOGY keeps inactive/rootless
 * entries and pins typology_section_id '14'. Typologies dedup by section_id in
 * first-seen order.
 */

import { sql } from '../db/postgres.ts';
import { createOntologyCache } from '../ontology/cache_factory.ts';
import { registerOntologyCacheClearer } from '../ontology/cache_invalidation.ts';
import { findFirstDescendantTipoByModel, getMatrixTableFromTipo } from '../ontology/resolver.ts';

// Hierarchy/ontology component tipos this resolver reads (kept local — they are
// this projection's concern, not the area taxonomy's).
const ONTOLOGY_MAIN_SECTION = 'ontology35';
const THESAURUS_MAIN_SECTION = 'hierarchy1';
const ONTOLOGY_CHILDREN_TIPO = 'ontology14';
const ONTOLOGY_TYPOLOGY_ID = '14';
const TYPOLOGY_SECTION_FALLBACK = 'hierarchy13';
const NAME_TIPO = 'hierarchy5';
const TARGET_TIPO = 'hierarchy53';
const TYPOLOGY_LOCATOR_TIPO = 'hierarchy9';
const ACTIVE_IN_THESAURUS_TIPO = 'hierarchy125';
const ORDER_TIPO = 'hierarchy48';
const ACTIVE_FILTER_TIPO = 'hierarchy4';
const ROOT_TERM_TIPO = 'hierarchy45';
const ROOT_TERM_MODEL_TIPO = 'hierarchy59';
const TYPOLOGY_LABEL_TIPO = 'hierarchy16';
const TYPOLOGY_ORDER_TIPO = 'hierarchy106';

interface HierarchyItem {
	section_id: string;
	section_tipo: string;
	target_section_tipo: string;
	target_section_name: string | null;
	children_tipo: string;
	typology_section_id: string;
	order: number;
	type: 'hierarchy';
	active_in_thesaurus: boolean;
	root_terms: Record<string, unknown>[];
}

interface TypologyItem {
	section_id: string;
	type: 'typology';
	label: string | null;
	order: number;
}

const childrenTipoCache = createOntologyCache<string, string | null>();

/** Flush the resolver's ontology-derived children_tipo cache (ontology import). */
export function clearChildrenTipoCache(): void {
	childrenTipoCache.clear();
}
registerOntologyCacheClearer(clearChildrenTipoCache);

/**
 * The target section's component_relation_children tipo (recursive, virtual).
 * Delegates to the canonical T3 accessor (audit S2-19) — which also adopts
 * the standard section-containment guard this walk used to lack; the
 * children component lives in the walked section's own subtree, so pruning
 * nested section/area nodes cannot lose it.
 */
async function getRelationChildrenTipo(sectionTipo: string): Promise<string | null> {
	const cached = childrenTipoCache.get(sectionTipo);
	if (cached !== undefined) return cached;
	const found = await findFirstDescendantTipoByModel(sectionTipo, 'component_relation_children');
	childrenTipoCache.set(sectionTipo, found);
	return found;
}

function langSliceValue(
	items: { lang?: string; value?: unknown }[] | null | undefined,
	lang: string,
): string | null {
	if (!Array.isArray(items) || items.length === 0) return null;
	const slice = items.filter((item) => item?.lang === lang);
	const chosen = slice.length > 0 ? slice : [items[0]];
	const parts = chosen
		.map((item) => (typeof item?.value === 'string' ? item.value : ''))
		.filter((part) => part !== '');
	return parts.length > 0 ? parts.join(' | ') : null;
}

/** The area boot data item {tipo, value, typologies} (see module doc). */
export async function readAreaHierarchyData(
	model: 'area_thesaurus' | 'area_ontology',
	areaTipo: string,
	lang: string,
	termsAreModel = false,
): Promise<Record<string, unknown>> {
	const isOntology = model === 'area_ontology';
	const mainSection = isOntology ? ONTOLOGY_MAIN_SECTION : THESAURUS_MAIN_SECTION;
	const table = (await getMatrixTableFromTipo(mainSection)) ?? 'matrix_hierarchy_main';

	// terms_are_model (PHP hierarchy::get_root_terms $is_model): the model view reads
	// the General-Term-MODEL portal (hierarchy59 → <tld>2 records) instead of the
	// regular General-Term portal (hierarchy45 → <tld>1). The default path
	// (termsAreModel=false) stays byte-equal to the pre-existing parity gate.
	const rootTermTipo = termsAreModel ? ROOT_TERM_MODEL_TIPO : ROOT_TERM_TIPO;
	const rows = (await sql.unsafe(
		`SELECT section_id,
		        string->'${NAME_TIPO}' AS name_items,
		        COALESCE(string->'${TARGET_TIPO}', data->'${TARGET_TIPO}') AS target_items,
		        relation->'${TYPOLOGY_LOCATOR_TIPO}' AS typology_locators,
		        relation->'${ACTIVE_IN_THESAURUS_TIPO}' AS active_locators,
		        relation->'${rootTermTipo}' AS root_term_locators,
		        COALESCE(number->'${ORDER_TIPO}', data->'${ORDER_TIPO}') AS order_items
		 FROM "${table}"
		 WHERE section_tipo = $1
		   AND relation->'${ACTIVE_FILTER_TIPO}' @> '[{"section_id":"1","section_tipo":"dd64"}]'
		 ORDER BY section_id ASC`,
		[mainSection],
	)) as {
		section_id: number;
		name_items: { lang?: string; value?: unknown }[] | null;
		target_items: { lang?: string; value?: unknown }[] | null;
		typology_locators: { section_id?: unknown; section_tipo?: unknown }[] | null;
		active_locators: { section_id?: unknown }[] | null;
		root_term_locators: Record<string, unknown>[] | null;
		order_items: { value?: unknown }[] | null;
	}[];

	const value: HierarchyItem[] = [];
	const typologyOrder: string[] = [];
	const typologySources = new Map<string, string>(); // id → typology section tipo
	for (const row of rows) {
		const target =
			langSliceValue(row.target_items, 'lg-nolan') ?? langSliceValue(row.target_items, lang);
		if (target === null || target === '') continue;
		const typologyId = row.typology_locators?.[0]?.section_id;
		if (typologyId === undefined || typologyId === null || typologyId === '') continue;
		const activeInThesaurus = String(row.active_locators?.[0]?.section_id ?? '') === '1';
		if (!isOntology && !activeInThesaurus) continue;
		const rootTerms = (row.root_term_locators ?? []).filter(
			(term) =>
				typeof term === 'object' &&
				term !== null &&
				term.section_tipo !== undefined &&
				term.section_id !== undefined,
		);
		if (!isOntology && rootTerms.length === 0) continue;
		const childrenTipo = isOntology
			? ONTOLOGY_CHILDREN_TIPO
			: await getRelationChildrenTipo(target);
		if (childrenTipo === null || childrenTipo === '') continue;

		value.push({
			section_id: String(row.section_id),
			section_tipo: mainSection,
			target_section_tipo: target,
			target_section_name: langSliceValue(row.name_items, lang),
			children_tipo: childrenTipo,
			typology_section_id: isOntology ? ONTOLOGY_TYPOLOGY_ID : String(typologyId),
			order: Number(row.order_items?.[0]?.value ?? 0),
			type: 'hierarchy',
			active_in_thesaurus: activeInThesaurus,
			root_terms: rootTerms,
		});
		const effectiveTypologyId = isOntology ? ONTOLOGY_TYPOLOGY_ID : String(typologyId);
		if (!typologyOrder.includes(effectiveTypologyId)) {
			typologyOrder.push(effectiveTypologyId);
			typologySources.set(
				effectiveTypologyId,
				String(row.typology_locators?.[0]?.section_tipo ?? TYPOLOGY_SECTION_FALLBACK),
			);
		}
	}

	// Typologies (deduplicated, first-seen order): label hierarchy16 + order
	// hierarchy106 from the typology record.
	const typologies: TypologyItem[] = [];
	for (const typologyId of typologyOrder) {
		const typologySection = typologySources.get(typologyId) ?? TYPOLOGY_SECTION_FALLBACK;
		const typologyTable = (await getMatrixTableFromTipo(typologySection)) ?? 'matrix_dd';
		const typologyRows = (await sql.unsafe(
			`SELECT string->'${TYPOLOGY_LABEL_TIPO}' AS label_items, number->'${TYPOLOGY_ORDER_TIPO}' AS order_items
			 FROM "${typologyTable}" WHERE section_tipo = $1 AND section_id = $2`,
			[typologySection, Number(typologyId)],
		)) as {
			label_items: { lang?: string; value?: unknown }[] | null;
			order_items: { value?: unknown }[] | null;
		}[];
		typologies.push({
			section_id: typologyId,
			type: 'typology',
			label: langSliceValue(typologyRows[0]?.label_items, lang),
			order: Number(typologyRows[0]?.order_items?.[0]?.value ?? 0),
		});
	}

	return { tipo: areaTipo, value, typologies };
}
