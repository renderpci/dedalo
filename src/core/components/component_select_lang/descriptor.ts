/**
 * component_select_lang — language-choice select (PHP core/component_select_lang).
 * Same relation-column storage and select-family resolution as component_select,
 * with the datalist populated from the project languages.
 */
import type { ComponentModel } from '../types.ts';

export const component_select_lang: ComponentModel = {
	model: 'component_select_lang',
	column: 'relation',
	defaultRelationType: 'dd151',
	resolveData: 'select_family',
	search: { status: 'ported' },
	importConform: 'select_lang',
};
