/**
 * component_relation_index — computed inverse-index relation (PHP
 * core/component_relation_index). Stores/computes in the `relation` column; uses
 * the dedicated index resolver (computed inverse pages in list/tm, portal
 * otherwise).
 *
 * SEARCH is UNPORTED: its computed-inverse search trait is not ported, so the
 * search dispatcher throws.
 */
import type { ComponentModel } from '../types.ts';

export const component_relation_index: ComponentModel = {
	model: 'component_relation_index',
	column: 'relation',
	defaultRelationType: 'dd96',
	resolveData: 'relation_index',
	search: { status: 'ported' }, // builder_relation_index.ts (dedicated computed-inverse pipeline)
	sortable: false, // PHP component_relation_common::get_sortable() → false (no subclass override)
	importConform: 'relation',
};
