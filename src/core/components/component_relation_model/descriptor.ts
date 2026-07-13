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
};
