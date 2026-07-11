/**
 * indexation_list (SECTION_SPEC §7.3) — the component selection resolved for the
 * thesaurus tag-indexation grid (tool_indexation / component_relation_index
 * inverse resolution from thesauri).
 *
 * PHP reference: dd_grid::indexation_grid (class.indexation_grid.php:283-345):
 * find the indexation_list child (first-level, real-section fallback), then read
 * its PROPERTIES head/row → show.ddo_map (NOT the node `relations`), plus
 * properties.color / class_list for the section grid cell. The grid rows are the
 * inverse tag locators (get_ar_section_top_tipo), each rendered per the row
 * ddo_map through the existing relation_index inverse engine.
 *
 * SCOPE: this module resolves the grid CONFIG (head/row ddo_maps + class_lists +
 * render_labels). The live grid drive is section/indexation_grid.ts (the
 * get_indexation_grid API action), gated against the live oracle in
 * test/parity/indexation_grid_differential.test.ts. (An earlier note here
 * claimed this install's indexation data was orphaned; the 2026-07-09 corpus
 * scan found ~48k live dd96 indexation relations — rsc205, numisdata5/6,
 * tchi1, rsc167 — so the drive IS differentially gated.)
 */

import { findSectionChildByModel } from './node_find.ts';

/** The indexation grid configuration (PHP indexation_grid head/row/class). */
export interface IndexationListConfig {
	/** The indexation_list node tipo. */
	tipo: string;
	/** Header cell ddo_map (PHP properties.head.show.ddo_map) — absent for many. */
	headDdoMap: Record<string, unknown>[];
	/** Row cell ddo_map (PHP properties.row.show.ddo_map) — the grid columns. */
	rowDdoMap: Record<string, unknown>[];
	/** The head row CSS class list (PHP properties.head.class_list). */
	headClassList: string | null;
	/** Whether the head row renders labels (PHP properties.head.render_label). */
	headRenderLabel: boolean;
	/** The row cell CSS class list (PHP properties.row.class_list). */
	rowClassList: string | null;
	/** Whether the grid renders the component label (PHP properties.row.render_label). */
	renderLabel: boolean;
	/** The section grid cell CSS class list (PHP properties.class_list). */
	classList: string | null;
}

function ddoMapOf(slot: unknown): Record<string, unknown>[] {
	const ddoMap = (slot as { show?: { ddo_map?: unknown } } | null)?.show?.ddo_map;
	return Array.isArray(ddoMap) ? (ddoMap as Record<string, unknown>[]) : [];
}

/**
 * Resolve a section's indexation grid config (PHP indexation_grid node read).
 * Returns null when the section declares no indexation_list node.
 */
export async function getIndexationListConfig(
	sectionTipo: string,
): Promise<IndexationListConfig | null> {
	const node = await findSectionChildByModel(sectionTipo, 'indexation_list');
	if (node === null) return null;
	const props = (node.properties ?? {}) as {
		head?: { class_list?: unknown; render_label?: unknown };
		row?: { class_list?: unknown; render_label?: unknown };
		class_list?: unknown;
	};
	return {
		tipo: node.tipo,
		headDdoMap: ddoMapOf(props.head),
		rowDdoMap: ddoMapOf(props.row),
		headClassList: typeof props.head?.class_list === 'string' ? props.head.class_list : null,
		headRenderLabel: props.head?.render_label === true,
		rowClassList: typeof props.row?.class_list === 'string' ? props.row.class_list : null,
		renderLabel: props.row?.render_label === true,
		classList: typeof props.class_list === 'string' ? props.class_list : null,
	};
}
