/**
 * component_relation_model — relation to an ontology model node backed by a
 * datalist (PHP core/component_relation_model). Relation-column storage;
 * select-family resolution.
 */
import type { ComponentModel } from '../types.ts';

export const component_relation_model: ComponentModel = {
	model: 'component_relation_model',
	column: 'relation',
	defaultRelationType: 'dd98',
	resolveData: 'select_family',
	flatValue: 'datalist',
	search: { status: 'ported' },
	importConform: 'relation',
	// Default target when the node's own sqo names none: the caller section's
	// MODEL twin (es1 → es2), resolved by ontology/model_section.ts through
	// relations/request_config/target_sources.ts. PHP kept this per-caller
	// calculation in the class (v6 class.component_relation_model.php:115-177);
	// here it is one declared, shared sqo source.
	targetSource: 'section_model',
};
