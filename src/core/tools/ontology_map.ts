/**
 * Tool ontology map — the single source of truth for every dd-tipo used by the
 * tools subsystem (PHP tools/tool_common/class.tool_ontology_map.php).
 *
 * HARD RULE (ported from the PHP tools_architecture branch): no other file may
 * name a tool-registry dd-tipo inline. Import the constant from here so a tipo
 * renumeration is a one-file change and the registry contract stays auditable.
 *
 * The tools subsystem stores everything in the `matrix_tools` table across a few
 * sections:
 *  - dd1324  registry           (system-managed; re-created on every import)
 *  - dd996   install config     (per-install config overrides)
 *  - dd1340  authoring section  (a register.json's own section_tipo in the dump)
 *  - dd1342  models section      (affected_models locators resolve here)
 * Per-user authorization lives outside matrix_tools:
 *  - dd234   profiles section   (matrix_profiles)
 *  - dd1067  profile's authorized-tools component
 */

/** Tools register section (PHP DEDALO_REGISTER_TOOLS_SECTION_TIPO). */
export const TOOLS_REGISTER_SECTION_TIPO = 'dd1324';
/** Per-install tools configuration section (PHP DEDALO_TOOLS_CONFIGURATION_SECTION_TIPO). */
export const TOOLS_CONFIG_SECTION_TIPO = 'dd996';
/** Tools-development / authoring section (register.json dumps carry this as their section_tipo). */
export const TOOLS_AUTHORING_SECTION_TIPO = 'dd1340';
/** The model-list section whose records name the models a tool affects. */
export const AFFECTED_MODELS_SECTION_TIPO = 'dd1342';
/** The component in a dd1342 record holding the model-name string. */
export const MODEL_NAME_COMPONENT = 'dd1345';

/** The profiles section (matrix_profiles) used for per-user tool authorization. */
export const PROFILE_SECTION_TIPO = 'dd234';
/** The profile's authorized-tools component (locators → dd1324 registry rows). */
export const PROFILE_TOOLS_COMPONENT = 'dd1067';

/**
 * Component tipos inside a tool registry (dd1324) record. Mirrors the PHP
 * tool_ontology_map constants 1:1.
 */
export const TIPO = {
	/** tool name (string, nolan) */
	NAME: 'dd1326',
	/** tool label (string, lang array) */
	LABEL: 'dd799',
	/** tool version (string) */
	VERSION: 'dd1327',
	/** minimum Dédalo version (string) */
	DEDALO_VERSION_MIN: 'dd1328',
	/** developer (string) */
	DEVELOPER: 'dd1644',
	/** description (string, lang array) */
	DESCRIPTION: 'dd612',
	/** view / open_as properties (misc) */
	PROPERTIES: 'dd1335',
	/** affected models (relation → dd1342 model records) */
	AFFECTED_MODELS: 'dd1330',
	/** affected tipos / patterns (misc: [{value:[...]}]) */
	AFFECTED_TIPOS: 'dd1350',
	/** require_translatable (radio_button relation → dd64) */
	REQUIRE_TRANSLATABLE: 'dd1333',
	/** show_in_inspector (radio_button relation → dd64) */
	SHOW_IN_INSPECTOR: 'dd1331',
	/** show_in_component (radio_button relation → dd64) */
	SHOW_IN_COMPONENT: 'dd1332',
	/** active (radio_button relation → dd64; dd64/1 = active) */
	ACTIVE: 'dd1354',
	/** always_active (radio_button relation → dd64) */
	ALWAYS_ACTIVE: 'dd1601',
	/** cached SIMPLE_TOOL_OBJECT blob (misc/json) */
	SIMPLE_TOOL_OBJECT: 'dd1353',
	/** ontology definition blob (misc/json) */
	ONTOLOGY: 'dd1334',
	/** tool labels array (misc) — [{lang,name,value}] */
	LABELS: 'dd1372',
	/** per-install config component */
	CONFIG: 'dd999',
	/** register.json default config */
	DEFAULT_CONFIG: 'dd1633',
} as const;

/** The dd64 (yes/no) record id that means "yes"/"active". */
export const DD64_YES_SECTION_ID = '1';
export const DD64_SECTION_TIPO = 'dd64';
