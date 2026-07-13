/**
 * component_dataframe — frame records paired to a main component's data items
 * via the id_key contract (PHP core/component_dataframe). Stores its locators in
 * the `relation` column; ROW EMISSION reuses the portal path (resolveData ===
 * portalResolver). The id_key pairing machinery links out to
 * relations/dataframe.ts.
 */
import type { ComponentModel } from '../types.ts';

export const component_dataframe: ComponentModel = {
	model: 'component_dataframe',
	column: 'relation',
	defaultRelationType: 'dd151',
	resolveData: 'portal',
	search: { status: 'ported' },
	importConform: 'relation',
};
