/**
 * component_external — relation to a record in an EXTERNAL Dédalo (PHP
 * core/component_external). Stores its locators in the `relation` column; ROW
 * EMISSION reuses the portal path (resolveData === portalResolver).
 *
 * SEARCH is deliberately UNPORTED: remote external data is not searchable (PHP
 * has no search trait for it), so the search dispatcher throws rather than
 * silently returning empty results.
 */
import type { ComponentModel } from '../types.ts';

export const component_external: ComponentModel = {
	model: 'component_external',
	column: 'relation',
	resolveData: 'portal',
	search: {
		status: 'unported',
		reason:
			'not searchable — PHP has no trait and fatals (component_common::get_search_query calls an undefined resolve_query_object_sql); the throw IS the faithful port',
	},
	importConform: 'relation',
};
