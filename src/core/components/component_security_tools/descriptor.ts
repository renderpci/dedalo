/**
 * component_security_tools — legacy v5/v6 model name. At runtime it is REPLACED
 * by component_check_box (PHP ontology_node::get_model). Alias-only, no `column`.
 */
import type { ComponentModel } from '../types.ts';

export const component_security_tools: ComponentModel = {
	model: 'component_security_tools',
	alias: 'component_check_box',
};
