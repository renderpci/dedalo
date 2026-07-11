/**
 * component_state — legacy v5/v6 model name. At runtime it is REPLACED by
 * component_info (PHP ontology_node::get_model). Alias-only, no `column`.
 */
import type { ComponentModel } from '../types.ts';

export const component_state: ComponentModel = {
	model: 'component_state',
	alias: 'component_info',
};
