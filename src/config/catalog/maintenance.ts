/**
 * CONFIG CATALOG — domain: maintenance
 *
 * GENERATED SCAFFOLD (probe_emit_catalog.ts). Hand-edit from here on.
 */

import { join } from 'node:path';
import type { CatalogEntry } from '../catalog_types.ts';
import { projectRoot } from '../env.ts';

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
	IP_API: {
		type: 'string_map',
		scope: 'operator',
		default: {
			url: 'https://api.country.is/$ip',
			href: 'https://ip-api.com/#$ip',
			country_code: 'country',
		},
		heading: 'Defining ip api service',
		typeLabel: 'array',
		doc: `Defines the service to be used in section Activity to resolve source Country from IP address.

By default Dédalo use the ipapi.co service with free unsigned account. Is possible to configure other services with your specific account. If you want to use a http instead https you can use \`ip-api.com\`

\`\`\`bash
IP_API={"url":"https://api.country.is/$ip","href":"https://ip-api.com/#$ip","country_code":"country"}
\`\`\`

!!! note "IP variable"
    \`$ip\` string will be replaced by the real IP value in resolution and 'country_code' value property is used to generate the icon flag.

    The URL must be in the format that the provider requires.`,
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
} as const satisfies Record<string, CatalogEntry>;
