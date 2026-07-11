/**
 * component_input_text_large — legacy v5/v6 model name. At runtime it is REPLACED
 * by component_text_area (PHP ontology_node::get_model :493-507). Alias-only: it
 * never stores data under its own name, so no `column` — getModelByTipo maps it
 * to its canonical model before any column/resolver lookup.
 */
import type { ComponentModel } from '../types.ts';

export const component_input_text_large: ComponentModel = {
	model: 'component_input_text_large',
	alias: 'component_text_area',
};
