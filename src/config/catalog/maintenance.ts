/**
 * CONFIG CATALOG — domain: maintenance
 *
 * GENERATED SCAFFOLD (probe_emit_catalog.ts). Hand-edit from here on.
 */

import { join } from 'node:path';
import type { CatalogEntry } from '../catalog_types.ts';
import { privateDir, projectRoot } from '../env.ts';

export const MAINTENANCE_KEYS = {
	CODE_SERVERS: {
		type: 'server_list',
		scope: 'operator',
		default: undefined,
		heading: 'Defining server code provider',
		typeLabel: 'array',
		doc: `This parameter defines the code servers this install offers releases from. By default the server defines the official Dédalo code server, but you can include other mirror servers by adding entries to the array. Each entry is a JSON object with \`name\`, \`url\` and \`code\`.

\`\`\`bash
CODE_SERVERS=[{"name":"Official Dédalo code server","url":"https://master.dedalo.dev/core/api/v1/json/","code":"x3a0B4Y020Eg9w"}]
\`\`\``,
	},
	DEDALO_CODE_FILES_DIR: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Defining is a code server directory',
		typeLabel: 'string',
		doc: `This parameter defines the path to the code files in the server. Default location in root path /code.
Code files are organize in version directories with major / minor / version_dedalo.zip as:
\`./dedalo/code/6/6.4/6.4.1_dedalo.zip\`

\`\`\`bash
DEDALO_CODE_FILES_DIR="/srv/dedalo/code"
\`\`\``,
	},
	DEDALO_CODE_SERVER_GIT_DIR: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Defining is a code server build version from development git',
		typeLabel: 'string',
		doc: `This parameter defines the path to git directory in the server. It use to build the version with for specific version.
GIT directory is a valid git server than can provide the build version.
This parameter is not necessary if the server will be only a mirror from official files.


\`\`\`bash
DEDALO_CODE_SERVER_GIT_DIR="/my_dedalo_git_directory"
\`\`\``,
	},
	DEDALO_SOURCE_VERSION_LOCAL_DIR: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Defining source versions local directory to save the new code',
		typeLabel: 'string',
		doc: `This parameter defines the path to the local directory to save the new code downloaded from the master server repository.

\`\`\`bash
DEDALO_SOURCE_VERSION_LOCAL_DIR="/tmp/my_museum"
\`\`\``,
	},
	IS_A_CODE_SERVER: {
		type: 'boolean',
		scope: 'operator',
		default: false,
		heading: 'Defining is a code server',
		typeLabel: 'bool',
		doc: `This parameter defines if the server can provide code to other Dédalo servers. By default no Dédalo server provides code, but it is possible to set one up as a mirror server that provides code versions. To enable it, also set \`DEDALO_CODE_FILES_DIR\` — the URL other servers fetch from is derived automatically.

\`\`\`bash
IS_A_CODE_SERVER=false
\`\`\``,
	},
	IS_AN_ONTOLOGY_SERVER: {
		type: 'boolean',
		scope: 'operator',
		default: false,
		heading: 'Is an ontology master server',
		typeLabel: 'bool',
		doc: `It defines if the installation server can provide his ontology files to other Dédalo servers.

\`\`\`bash
IS_AN_ONTOLOGY_SERVER=false
\`\`\``,
	},
	ONTOLOGY_DATA_IO_DIR: {
		type: 'string',
		scope: 'operator',
		default: () => join(projectRoot, 'install', 'import', 'ontology'),
		defaultDoc: '`<install dir>/install/import/ontology`',
		heading: 'Ontology input/output, export/import or download directory',
		typeLabel: 'string',
		doc: `This parameter defines the directory to input/output the ontology files in the server. Ontology files can be created by master ontology servers or downloaded from an external provider such as the official master Dédalo server. Defaults to \`install/import/ontology\` inside the install tree.

\`\`\`bash
ONTOLOGY_DATA_IO_DIR="/srv/dedalo/import/ontology"
\`\`\``,
	},
	ONTOLOGY_SERVER_CODE: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'defining the  ontology master server code',
		typeLabel: 'string',
		doc: `It  defines the valid code for clients to validate to get ontology files.

\`\`\`bash
ONTOLOGY_SERVER_CODE="x3a0B4Y020Eg9w"
\`\`\`

This parameter needs to be included as \`code\` in [ONTOLOGY_SERVERS](#ontology-servers) defintion in every authorized client.`,
	},
	ONTOLOGY_SERVERS: {
		type: 'server_list',
		scope: 'operator',
		default: undefined,
		heading: 'Ontology servers',
		typeLabel: 'array of objects',
		doc: `This parameter defines the ontology master servers to get the ontology updates. The servers could be:

- the official dedalo.dev server
- an external server for local Ontologies (private Ontologies of entities.)
- local server, the current installation

Each entry is a JSON object with \`name\`, \`url\` and \`code\`. Configuration for the official dedalo.dev server:

\`\`\`bash
ONTOLOGY_SERVERS=[{"name":"Official Dédalo Ontology server","url":"https://master.dedalo.dev/dedalo/core/api/v1/json/","code":"x3a0B4Y020Eg9w"}]
\`\`\`

It gets the tld from the [ACTIVE_ONTOLOGY_TLDS](#defining-active-ontology-tlds) definition.

Local ontologies can be provided by other installations in parallel by adding new
entries to this list. Every Dédalo server can provide its own ontologies.`,
	},
	STRUCTURE_FROM_SERVER: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Sync ontology from master server',
		typeLabel: 'bool',
		doc: `This parameter defines if the installation will be updated his ontology using the master server versions.

\`\`\`bash
STRUCTURE_FROM_SERVER=true
\`\`\``,
	},
	DEDALO_GEOIP_ENABLED: {
		type: 'boolean',
		scope: 'operator',
		default: true,
		heading: 'Enable local IP to Country resolution',
		typeLabel: 'bool',
		doc: `Enables the built-in, self-hosted IP to Country resolution used in section Activity to show the source country flag from an IP address.

Resolution runs on the server against a local, openly-licensed country database (DB-IP IP to Country Lite, CC-BY-4.0) — no third-party request is made from the browser. When disabled, IP addresses are shown without a country flag.

\`\`\`bash
DEDALO_GEOIP_ENABLED=true
\`\`\``,
	},
	DEDALO_GEOIP_DIR: {
		type: 'string',
		scope: 'operator',
		default: () => join(privateDir, 'geoip'),
		defaultDoc: '`<private dir>/geoip`',
		heading: 'IP to Country database directory',
		typeLabel: 'string',
		doc: `Directory where the local IP to Country database file is downloaded and cached. Defaults to \`geoip\` inside the private directory (outside the web root).

\`\`\`bash
DEDALO_GEOIP_DIR="/srv/dedalo/geoip"
\`\`\``,
	},
	DEDALO_GEOIP_AUTO_UPDATE: {
		type: 'boolean',
		scope: 'operator',
		default: true,
		heading: 'Auto-download and refresh the IP to Country database',
		typeLabel: 'bool',
		doc: `When enabled, the server downloads the IP to Country database on first use and refreshes it monthly. Disable it to use only a database file placed manually in \`DEDALO_GEOIP_DIR\` (e.g. air-gapped installs).

\`\`\`bash
DEDALO_GEOIP_AUTO_UPDATE=true
\`\`\``,
	},
	DEDALO_GEOIP_DB_URL: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'IP to Country database download URL override',
		typeLabel: 'string',
		doc: `Overrides the default monthly DB-IP download URL. Use it to point at a mirror or a pinned month. The default is \`https://download.db-ip.com/free/dbip-country-lite-YYYY-MM.mmdb.gz\` (the current month, with a fallback to the previous month), computed automatically.

\`\`\`bash
DEDALO_GEOIP_DB_URL="https://mirror.example.org/dbip-country-lite-2026-07.mmdb.gz"
\`\`\``,
	},
} as const satisfies Record<string, CatalogEntry>;
