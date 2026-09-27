/**
 * component_relation_children — the DOWNWARD (children) hierarchy links, computed
 * as the inverse (dd47) of the children's parent links (PHP
 * core/component_relation_children). Stores/computes in the `relation` column;
 * uses the dedicated children resolver (portal machinery with COMPUTED inverse
 * children grafted in).
 *
 * SEARCH is UNPORTED: PHP searches the CHILD records' relation columns via a
 * dedicated 576-line inverse-parent pipeline (trait.search_component_relation_
 * children.php), not the caller's — so the search dispatcher throws.
 */
import type { ComponentModel } from '../types.ts';

export const component_relation_children: ComponentModel = {
	model: 'component_relation_children',
	column: 'relation',
	render: 'text',
	// Computed, never stored forward (edit + list read the inverse question;
	// only search mode reads the column) — an append would be written and never read.
	importAppend: {
		refuse:
			"derived: children are computed from each child record's parent link, there is no stored data to append to (import the parent on the child records)",
	},
	defaultRelationType: 'dd48',
	resolveData: 'relation_children',
	search: { status: 'ported' }, // builder_relation_children.ts (dedicated inverse-parent pipeline)
	sortable: false, // PHP component_relation_common::get_sortable() → false (no subclass override)
	importConform: 'relation',
};
