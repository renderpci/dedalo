/**
 * CONFIG CATALOG — domain: defaults
 *
 * GENERATED SCAFFOLD (probe_emit_catalog.ts). Hand-edit from here on.
 */

import type { CatalogEntry } from '../catalog_types.ts';

export const DEFAULTS_KEYS = {
	ACTIVE_ONTOLOGY_TLDS: {
		type: 'string_list',
		scope: 'operator',
		default: [],
		heading: 'Defining active ontology TLDs',
		typeLabel: 'array',
		doc: `!!! info "Renamed in v7 — was \`DEDALO_PREFIX_TIPOS\`"
    The old name did not describe the value: this is the set of ontology
    **top-level domains** active in the installation. The old spelling is retired —
    if it is still in your \`.env\` the server refuses to boot and names the line to
    change.

This parameter defines the ontology TLDs to be used in the Dédalo installation.

Every tipo (typology of indirect programming object) defines a heritage field, a data model, a structuring tools and definitions. Dédalo is a multi heritage application with ontologies for Archeology, Ethnology, Oral History, Numismatics, etc. Every project or institution can add any tipos that it demands. An archaeologic museum will use the model for archeological catalogs, but it will not need the ethnological definitions. In the same way that Oral History project will don't use the archeological or numismatic definitions.

By default Dédalo load some common tipos for all project types.

| **TLD** | **Defintion** |
| --- | --- |
| **dd** | Dédalo. Definition of default list and common uses and tools such as translation tools. |
| **rsc** | Resources. Definition for areas and sections commons to all projects such as people, images, audiovisual files, publications, documents, bibliography, etc. |
| **ontology** | Ontology. Definition of the sections used as nodes of the ontology |
| **hierarchy** | Thesaurus. Definition for sections as toponymy, onomastic, chronologies, techniques, material, etc. |
| **lg** | Languages, Definition for the languages in the thesaurus (used for all application to translate data and interface) |
| **utoponymy** | Unofficial toponymy. Section definition for unofficial toponymy (unofficial places names), used to add places that are not inside the official toponymy of countries or the installation don't want import the official toponymy (use to point the place without the official term in some sections as Publications, to define any place of publication around the world) |

Besides, every installation can import the ontology tipo that will use in the inventory or research:

| **TLD** | **Defintion** |
| --- | --- |
| **oh** | Oral History, the definition sections and tools to be used for oral history projects such as interviews, transcription, indexation, etc. |
| **ich** | Intangible Cultural Heritage, the definition sections and tools to use for intangible heritage, such as elements, processes, communities, symbolic acts, etc. |
| **tch** | Tangible heritage, the definition of sections and tools to use for tangible heritage, such as objects, collectors, informants, etc |
| **tchi** | Tangible heritage immovable, the definition of sections and tools to use for tangible heritage immovable, such as archeological sites, finds, alqueries, etc |
| **dmm** | Memory and documentary heritage, the definition of sections and tools to be used for the heritage of memory, such as graves, deportees, exiles, tortured, etc. |
| **numisdata** | Numismatic heritage, the definition sections and tools to use for numismatics project, such as mints, types, legends, hoards, finds, etc. |
| **isad** | Archives following the [ISAD(g) standard](https://www.ica.org/en/isadg-general-international-standard-archival-description-second-edition) (General International Standard Archival Description - Second edition), the definition of sections and tools to be used for cataloging documents with the standard structure, etc. |
| **actv** | Activities, the definition of section and fields of activities as exhibitions, workshops, didactics, conferences, etc. |

\`\`\`bash
ACTIVE_ONTOLOGY_TLDS=[ "dd", "rsc", "ontology", "hierarchy", "lg", "oh", "ich" ]
\`\`\`

!!! note "Thesaurus dependencies"
    Some tld has a thesaurus dependency, if you want to use a \`tch\` Dédalo installation will need to create the \`material\`, \`technique\`, or \`objects\` hierarchies. This hierarchies are not included into the main tld, because the hierarchies need to be activate and created by the users. [See the table of dependencies](thesaurus_dependeces.md#dependencies).

!!! note "Applying changes in ACTIVE_ONTOLOGY_TLDS"
    Any change in \`ACTIVE_ONTOLOGY_TLDS\` will need a update of the ontology, this changes are not directly applied. Dédalo needs to get the ontology tld and install it, to do that update the ontology in [maintenance](../management/maintenace_status.md) control panel.

!!! note "Activities"
    The \`actv\` tld should be used as model to implement a virtual sections with more specific activities as hierarchies of toponymy does into the thesaurus using it as \`hierarchy20\`, the main section to implement in this way is \`actv1\` and his model \`actv2\`. The virtual sections should be defined with a prefix \`actv\` into the new tld, in this way:
    - for exhibitions section the tld could be: \`actvexhibition\`
    - for conferences section the tld could be: \`actvconference\``,
	},
	DEDALO_DEFAULT_PROJECT: {
		type: 'number',
		scope: 'operator',
		default: 1,
		heading: 'Defining default project',
		typeLabel: 'int',
		doc: `This parameter defines the default project that Dédalo will use to create new sections (records in the DDBB).

Dédalo use the project component (component_filter) to group sections by the research criteria. The project field is mandatory in every section, because an user that can access to a project will no see the records of the other projects and, therefore, is necessary that all sections can be searchable by projects. If the user forget introduce project data, Dédalo will use this parameter to introduce it.

\`\`\`bash
DEDALO_DEFAULT_PROJECT=1
\`\`\``,
	},
	DEDALO_FILTER_SECTION_TIPO_DEFAULT: {
		type: 'string',
		scope: 'operator',
		default: 'dd153',
		heading: 'Defining filter section tipo default',
		typeLabel: 'string',
		doc: `This parameter defines the section that has the projects information inside the ontology.

Dédalo will use this parameter to define the locator of the filter by projects to apply to any search of sections. By default Dédalo has a predefined section to store the projects that administrators users can enlarge. The default section_tipo is \`dd153\` and it is located below 'Administration' area in the menu. Every project field target this section to define the specific project of the current record.

\`\`\`bash
DEDALO_FILTER_SECTION_TIPO_DEFAULT="dd153"
\`\`\`

> Defaults to \`dd153\` (the Projects section). Do not change this param.`,
	},
	DEDALO_MAX_ROWS_PER_PAGE: {
		type: 'number',
		scope: 'operator',
		default: 10,
		heading: 'Defining maximum rows per page',
		typeLabel: 'int',
		doc: `It defines the maximum rows that will loaded in the lists.

This value is the default number of rows that Dédalo will load, but is possible to change this value directly in the filter by the users, when they make a search, if the user do not define the maximum rows, Dédalo will use the value of this parameter.

\`\`\`bash
DEDALO_MAX_ROWS_PER_PAGE=10
\`\`\``,
	},
	DEDALO_SEARCH_CLIENT_MAX_LIMIT: {
		type: 'number',
		scope: 'operator',
		default: 1000,
		heading: 'Defining the maximum rows a search may return',
		typeLabel: 'int',
		doc: `This parameter defines the ceiling applied to the number of rows a search coming FROM THE CLIENT may ask for.

It is not the page size the user sees (that is DEDALO_MAX_ROWS_PER_PAGE): it is the hard limit above which a request from the browser cannot go, whatever it asks for. A request for "all" rows, for a negative number, or for more rows than this ceiling, all come back clamped to the ceiling — so no client can ask the server for an unbounded result set. Searches the server itself builds (exports, publications, counts) are not clamped and keep full access to the whole result.

The default is 1000. Raise it if your own interface legitimately pages in bigger windows; lower it to harden an installation exposed to the public. A value below 1 is raised to 1.

\`\`\`bash
DEDALO_SEARCH_CLIENT_MAX_LIMIT=1000
\`\`\``,
	},
	DEDALO_SECTION_USERS_TIPO: {
		type: 'string',
		scope: 'operator',
		default: 'dd128',
		heading: 'Defining the users section tipo',
		typeLabel: 'string',
		doc: `This parameter defines the section of the ontology that holds the USER records — the login names, the password hashes, the profile and the projects each user may reach.

Dédalo needs to know which section that is, because the section is treated differently everywhere it appears: the root user is never returned by a search, not even to an administrator, and the raw view of a record refuses to open it, so a password hash cannot be read through the interface.

The default is \`dd128\` and an installation should keep it. It is a parameter rather than a fixed value only so that an installation whose ontology places the users section elsewhere keeps those protections instead of quietly losing them.

\`\`\`bash
DEDALO_SECTION_USERS_TIPO="dd128"
\`\`\``,
	},
	MAIN_SECTION: {
		type: 'string',
		scope: 'operator',
		default: 'oh1',
		heading: 'Defining main fallback section',
		typeLabel: 'string',
		doc: `It defines the section will loaded by default when the user login.
The main section of the project that will used, normally will be a inventory or catalog section.

\`\`\`bash
MAIN_SECTION="oh1"
\`\`\``,
	},
} as const satisfies Record<string, CatalogEntry>;
