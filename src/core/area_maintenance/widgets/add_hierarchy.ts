/**
 * add_hierarchy widget — READ-only panel data (PHP widgets/add_hierarchy
 * get_value shape: {hierarchies, hierarchy_files_dir_path, hierarchy_typologies,
 * active_hierarchies}). The IMPORTABLE hierarchies come from JSON files in the
 * PHP install tree, which this engine does not own — so the importable list is
 * empty and hierarchy_files_dir_path is null (a coexisting TS server must not
 * mutate the install). This renders the panel cleanly (no error) instead of
 * the generic "Widget class file is unavailable"; the install EXECUTE stays
 * unregistered.
 */

import type { WidgetModule, WidgetResponse } from './support.ts';

async function addHierarchyGetValue(): Promise<WidgetResponse> {
	return {
		result: {
			hierarchies: [],
			active_hierarchies: [],
			hierarchy_typologies: [],
			hierarchy_files_dir_path: null,
		},
		msg: 'OK. Request done successfully',
		errors: [],
	};
}

export const widget: WidgetModule = {
	spec: {
		id: 'add_hierarchy',
		category: 'data',
		class: 'success width_100',
		label: { kind: 'label_concat', keys: ['instalar', 'jerarquias'] },
	},
	getValue: addHierarchyGetValue,
};
