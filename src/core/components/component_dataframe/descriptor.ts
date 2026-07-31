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
	// dd490 (DEDALO_RELATION_TYPE_DATAFRAME) — NOT the dd151 link type this
	// model inherits from component_portal in PHP. A frame locator's type IS
	// its pairing marker: isDataframeEntry recognises dd490 and nothing else,
	// so a dd151 frame is stored-but-unreadable. PHP gets away with the
	// inherited default only because its clients happen to send dd490; here the
	// server is authoritative, so the default has to be the real one.
	defaultRelationType: 'dd490',
	resolveData: 'portal',
	search: { status: 'ported' },
	importConform: 'relation',
};
