/**
 * CONFIG CATALOG — domain: paths
 *
 * GENERATED SCAFFOLD (probe_emit_catalog.ts). Hand-edit from here on.
 */

import type { CatalogEntry } from '../catalog_types.ts';

export const PATHS_KEYS = {
	DEDALO_HOST: {
		// Resolved 2026-07-13. This key had TWO defaults: three URL-building sites used
		// 'localhost' and two identity-reporting sites used ''. The default is now '' —
		// "not configured" — and the localhost fallback lives in ONE place,
		// core/resolve/public_origin.ts, where it belongs: it is a URL-construction
		// decision, not the meaning of an unset key.
		type: 'string',
		scope: 'operator',
		default: '',
		heading: 'Defining host',
		typeLabel: 'string',
		doc: `The public domain or IP of this installation — the address **other machines** use to
reach it. Dédalo does not need it to serve you; it needs it to tell someone else where it
lives.

It matters when this install publishes to others: the ontology and code update manifests it
serves, and the "Local files" server entry in the update panel, are all built from
\`<DEDALO_PROTOCOL><DEDALO_HOST>\`. Leave it unset and that address falls back to
\`localhost\`, which is correct **only** when the client is on this same machine — a
developer box. A remote installation told to fetch from \`localhost\` will fetch from
itself. So: if this install serves ontology or code to any other machine, set it.

Where Dédalo merely reports its own hostname (the ontology manifest's \`host\` field), an
unset value is reported honestly as empty rather than as a false \`localhost\`.

\`\`\`bash
DEDALO_HOST="dedalo.example.org"
\`\`\``,
	},
	DEDALO_PROTOCOL: {
		type: 'string',
		scope: 'operator',
		default: 'http://',
		heading: 'Defining protocol',
		typeLabel: 'string',
		doc: `This parameter defines the internet protocol used to build absolute URLs. It is
recommended to use the HTTPS protocol for an installation with SSL certification —
it is not mandatory, but it ensures the connection is protected with encryption.
Defaults to \`"http://"\` when unset.

\`\`\`bash
DEDALO_PROTOCOL="https://"
\`\`\``,
	},
} as const satisfies Record<string, CatalogEntry>;
