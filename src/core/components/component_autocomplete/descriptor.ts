/**
 * component_autocomplete — legacy v5/v6 model name. At runtime it is REPLACED by
 * component_portal (PHP ontology_node::get_model). Alias-only, no `column`.
 */
import type { ComponentModel } from '../types.ts';

export const component_autocomplete: ComponentModel = {
	model: 'component_autocomplete',
	alias: 'component_portal',
};
