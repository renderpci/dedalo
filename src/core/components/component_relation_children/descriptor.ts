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
	defaultRelationType: 'dd48',
	resolveData: 'relation_children',
	search: { status: 'ported' }, // builder_relation_children.ts (dedicated inverse-parent pipeline)
	sortable: false, // PHP component_relation_common::get_sortable() → false (no subclass override)
};
