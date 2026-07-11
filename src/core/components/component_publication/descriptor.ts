/**
 * component_publication — publication-state relation backed by a datalist (PHP
 * core/component_publication). Relation-column storage; select-family resolution.
 */
import type { ComponentModel } from '../types.ts';

export const component_publication: ComponentModel = {
	model: 'component_publication',
	column: 'relation',
	defaultRelationType: 'dd151',
	resolveData: 'select_family',
	search: { status: 'ported' },
};
