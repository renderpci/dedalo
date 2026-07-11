/**
 * component_check_box — multi-choice checkbox backed by a datalist (PHP
 * core/component_check_box). Relation-column storage; select-family resolution.
 * Legacy alias component_security_tools resolves to this model.
 */
import type { ComponentModel } from '../types.ts';

export const component_check_box: ComponentModel = {
	model: 'component_check_box',
	column: 'relation',
	defaultRelationType: 'dd151',
	resolveData: 'select_family',
	flatValue: 'datalist',
	search: { status: 'ported' },
};
