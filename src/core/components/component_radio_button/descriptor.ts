/**
 * component_radio_button — single-choice radio backed by a datalist (PHP
 * core/component_radio_button). Relation-column storage; select-family
 * resolution (datalist in list/edit, portal otherwise).
 */
import type { ComponentModel } from '../types.ts';

export const component_radio_button: ComponentModel = {
	model: 'component_radio_button',
	column: 'relation',
	defaultRelationType: 'dd151',
	resolveData: 'select_family',
	flatValue: 'datalist',
	search: { status: 'ported' },
	importConform: 'relation',
};
