/**
 * component_relation_related — symmetric "related records" relation (PHP
 * core/component_relation_related). Stores its locators in the `relation` column;
 * uses the dedicated related resolver (related grid item in list, portal
 * otherwise).
 */
import type { ComponentModel } from '../types.ts';

export const component_relation_related: ComponentModel = {
	model: 'component_relation_related',
	column: 'relation',
	defaultRelationType: 'dd89',
	resolveData: 'relation_related',
	search: { status: 'ported' },
};
