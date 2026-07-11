/**
 * component_calculation — legacy v5/v6 model name. At runtime it is REPLACED by
 * component_info (PHP ontology_node::get_model). Alias-only, no `column`.
 */
import type { ComponentModel } from '../types.ts';

export const component_calculation: ComponentModel = {
	model: 'component_calculation',
	alias: 'component_info',
};
