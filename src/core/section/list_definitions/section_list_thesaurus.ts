/**
 * section_list_thesaurus (SECTION_SPEC §7.5) — the component selection resolved
 * when a section is shown in the thesaurus/hierarchy TREE.
 *
 * PHP reference: ts_object::get_ar_elements (class.ts_object.php:212-274): find
 * the section_list_thesaurus child (first-level, exact, virtual fallback), then
 * iterate its properties.show.ddo_map. Unlike section_list (which uses the node
 * `relations`), the tree element list lives in the node's PROPERTIES show
 * ddo_map, each entry typed 'term'/'icon'/'link_children'/'link_children_model'.
 *
 * SCOPE: this module resolves the ELEMENT LIST (the tree node's columns). The
 * full tree walk/rendering is the ts_object consumer, not yet ported to TS
 * (LEDGERED) — this resolver is its foundation and is gated against the
 * ontology-declared ddo_map.
 */

import { findSectionChildByModel } from './node_find.ts';

/** One tree element descriptor (PHP get_ar_elements ddo entry). */
export interface ThesaurusElement {
	tipo: string;
	/** 'term' | 'icon' | 'link_children' | 'link_children_model' | … */
	type?: string;
	icon?: string;
}

/**
 * The section's thesaurus-tree element list (PHP get_ar_elements). Returns the
 * section_list_thesaurus node's show.ddo_map entries in order; [] when the
 * section declares no section_list_thesaurus node.
 */
export async function getSectionListThesaurus(sectionTipo: string): Promise<ThesaurusElement[]> {
	const node = await findSectionChildByModel(sectionTipo, 'section_list_thesaurus');
	if (node === null) return [];
	const ddoMap = (node.properties as { show?: { ddo_map?: Record<string, unknown>[] } } | null)
		?.show?.ddo_map;
	if (!Array.isArray(ddoMap)) return [];
	return ddoMap
		.filter((entry): entry is Record<string, unknown> => typeof entry?.tipo === 'string')
		.map((entry) => {
			const element: ThesaurusElement = { tipo: entry.tipo as string };
			if (typeof entry.type === 'string') element.type = entry.type;
			if (typeof entry.icon === 'string') element.icon = entry.icon;
			return element;
		});
}

/**
 * The TERM component tipos among the tree elements (PHP link_children_model
 * filtering, type 'term'): the actual columns a tree node renders as label text.
 */
export async function getThesaurusTermTipos(sectionTipo: string): Promise<string[]> {
	const elements = await getSectionListThesaurus(sectionTipo);
	return elements.filter((element) => element.type === 'term').map((element) => element.tipo);
}
