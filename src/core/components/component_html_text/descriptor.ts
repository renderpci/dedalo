/**
 * component_html_text — legacy v5/v6 model name. At runtime it is REPLACED by
 * component_text_area (PHP ontology_node::get_model). Alias-only, no `column`.
 */
import type { ComponentModel } from '../types.ts';

export const component_html_text: ComponentModel = {
	model: 'component_html_text',
	alias: 'component_text_area',
};
