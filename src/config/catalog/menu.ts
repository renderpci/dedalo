/**
 * CONFIG CATALOG — domain: menu
 *
 * GENERATED SCAFFOLD (probe_emit_catalog.ts). Hand-edit from here on.
 */

import type { CatalogEntry } from '../catalog_types.ts';

export const MENU_KEYS = {
	AREAS_DENY: {
		type: 'string_list',
		scope: 'operator',
		default: ['dd137', 'rsc1', 'hierarchy20'],
		heading: 'Defining denied areas',
		typeLabel: 'array',
		doc: `This parameter defines the areas that are removed from the installation.

Areas are the top-level parts of the ontology (Thesaurus, Resources, Tools, …), each with its own tipo. A denied area is stripped from the ontology BEFORE the security layer runs, so it disappears from the menu and becomes unreachable — for every user, the root user included. Denial is absolute: there is no allow-list that can give it back.

By default Dédalo denies the areas that exist as internal lists of values rather than as places a user works in — the Yes/No list, for one — and those should stay denied. Add a tipo here to take a whole area out of an installation that does not use it. To hide an area from the menu while leaving it reachable, use MENU_SKIP_TIPOS instead. The maintenance area can also persist this list at runtime, and that override wins over the value set here.

\`\`\`bash
AREAS_DENY=["dd137","rsc1","hierarchy20"]
\`\`\``,
	},
	MENU_SKIP_TIPOS: {
		type: 'string_list',
		scope: 'operator',
		default: ['dd349', 'dd355', 'numisdata1', 'tch188'],
		heading: 'Defining skip tipos from menu',
		typeLabel: 'array',
		doc: `This parameter defines the tipos to be skipped from the menu.

The ontology sometimes define long hierarchy to access to the sections, and could be convenient to remove some tipo from the menu to access more quickly to the sections. Add the tipo to the array to be removed it from menu.

\`\`\`bash
MENU_SKIP_TIPOS=[]
\`\`\``,
	},
} as const satisfies Record<string, CatalogEntry>;
