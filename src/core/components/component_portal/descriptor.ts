/**
 * component_portal — the canonical relation component (PHP core/component_portal).
 * Stores arrays of locators in the `relation` column and resolves them through
 * the shared portal path (relations/relation_core.expandPortal). Legacy aliases
 * component_autocomplete / component_autocomplete_hi resolve to this model.
 */
import type { ComponentModel } from '../types.ts';

export const component_portal: ComponentModel = {
	model: 'component_portal',
	column: 'relation',
	defaultRelationType: 'dd151',
	resolveData: 'portal',
	flatValue: 'datalist',
	search: { status: 'ported' },
	importConform: 'relation',
};
