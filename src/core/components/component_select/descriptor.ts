/**
 * component_select — single-choice select backed by a datalist (PHP
 * core/component_select). Stores its selected locator(s) in the `relation`
 * column; uses the select-family resolver (datalist in list/edit, portal
 * otherwise).
 */
import type { ComponentModel } from '../types.ts';

export const component_select: ComponentModel = {
	model: 'component_select',
	column: 'relation',
	defaultRelationType: 'dd151',
	resolveData: 'select_family',
	flatValue: 'datalist',
	search: { status: 'ported' },
	importConform: 'relation',
};
