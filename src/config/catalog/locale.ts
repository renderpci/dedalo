/**
 * CONFIG CATALOG — domain: locale
 *
 * GENERATED SCAFFOLD (probe_emit_catalog.ts). Hand-edit from here on.
 */

import type { CatalogEntry } from '../catalog_types.ts';

export const LOCALE_KEYS = {
	DEDALO_DATE_ORDER: {
		type: 'string',
		scope: 'operator',
		default: 'dmy',
		heading: 'Defining date order',
		typeLabel: 'string',
		doc: `Defines the default order for the date input by users and to be showed in component_date. By default Dédalo use dmy (European dates format).

Options:

* dmy : common way order day/moth/year
* mdy : USA way order moth/day/year
* ymd : China, Japan, Korean, Iran way year/month/day

\`\`\`bash
DEDALO_DATE_ORDER="dmy"
\`\`\``,
	},
	DEDALO_LOCALE: {
		type: 'string',
		scope: 'operator',
		default: 'es-ES',
		heading: 'Defining locale encoding',
		typeLabel: 'string',
		doc: `Defines the UI locale used to format and encode text. By default Dédalo uses UTF-8
encoding for Spanish (\`es-ES\`).

\`\`\`bash
DEDALO_LOCALE="es-ES"
\`\`\``,
	},
	DEDALO_TIMEZONE: {
		type: 'string',
		scope: 'operator',
		default: 'Europe/Madrid',
		heading: 'Defining time zone',
		typeLabel: 'string',
		doc: `Used to defines the time zone of the project. It could be different of the server installation or the linux timezone. The time zone will be used to store the time stamp of the changes done by the users.

\`\`\`bash
DEDALO_TIMEZONE="Europe/Madrid"
\`\`\``,
	},
} as const satisfies Record<string, CatalogEntry>;
