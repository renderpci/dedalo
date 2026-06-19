<?php declare(strict_types=1);
/**
* TOOL_ONTOLOGY_MAP
* Canonical map of every ontology tipo used by the tools subsystem.
*
* This is the single authoritative place where the component dd-tipos of
* the tool registry record (section dd1324 'Registered Tools'), the tool
* configuration section (dd996 'Tools Configuration'), and the tools
* authoring section (dd1340) are declared as named PHP constants.
*
* Responsibilities:
* - Provides typo-safe, grep-friendly references for every component that
*   tools_register reads/writes when importing or exporting register.json.
* - Groups constants by logical concern (Identity, Applicability,
*   Extensions, Configuration, Derived) so the overall schema is
*   self-documenting.
* - Exposes MAP for iteration (e.g. validation loops in
*   tools_register::validate_register()) without hard-coding tipo strings.
*
* Consumers:
* - tools_register — primary consumer; mirrors every constant as a static
*   property on class instantiation so legacy call-sites continue to work.
* - tool_common — references ACTIVE (dd1354) when filtering active tools.
* - Any future code that touches the dd1324/dd996/dd1340 schema MUST use
*   these constants instead of bare string literals.
*
* Section-level tipos (DEDALO_REGISTER_TOOLS_SECTION_TIPO = 'dd1324' and
* DEDALO_TOOLS_CONFIGURATION_SECTION_TIPO = 'dd996') are defined in
* core/base/dd_tipos.php; this class only maps the component-level schema.
*
* @package Dédalo
* @subpackage Tools
*/
final class tool_ontology_map {



	// -------------------------------------------------------------------------
	// Identity group
	// These components identify the tool in the registry record (dd1324).
	// -------------------------------------------------------------------------

		/**
		* Tool machine name, e.g. 'tool_lang' (component_input_text).
		* Used as the primary lookup key when resolving tools by name.
		* @var string TOOL_NAME
		*/
		public const TOOL_NAME = 'dd1326';

		/**
		* Human-readable display label, stored translatable (component_input_text).
		* Value is language-wrapped; callers must request the appropriate lang.
		* @var string TOOL_LABEL
		*/
		public const TOOL_LABEL = 'dd799';

		/**
		* Tool semantic version string, e.g. '2.5.0' (component_input_text).
		* Written from register.json→version on each import.
		* @var string VERSION
		*/
		public const VERSION = 'dd1327';

		/**
		* Minimum compatible Dédalo application version (component_input_text).
		* tools_register compares this against the running Dédalo version during
		* import to warn about compatibility issues.
		* @var string DEDALO_VERSION_MIN
		*/
		public const DEDALO_VERSION_MIN = 'dd1328';

		/**
		* Developer / author name(s) (component_input_text).
		* Informational only; not used for access control.
		* @var string DEVELOPER
		*/
		public const DEVELOPER = 'dd1644';

		/**
		* Free-form tool description, translatable (component_text_area).
		* Shown in the tool management UI.
		* @var string DESCRIPTION
		*/
		public const DESCRIPTION = 'dd612';

		/**
		* Implementation / technical notes, translatable (component_text_area).
		* Internal developer notes; not surfaced in the end-user UI.
		* @var string IMPLEMENTATION
		*/
		public const IMPLEMENTATION = 'dd1362';


	// -------------------------------------------------------------------------
	// Applicability group
	// These components control where and when a tool is active.
	// -------------------------------------------------------------------------

		/**
		* Component/section model tipos the tool targets (component_relation).
		* A tool with an empty AFFECTED_MODELS applies to all models.
		* tools_register::create_simple_tool_object() reads this as locators.
		* @var string AFFECTED_MODELS
		*/
		public const AFFECTED_MODELS = 'dd1330';

		/**
		* Specific ontology tipos restriction, stored as a JSON array
		* (component_json). Narrows applicability below AFFECTED_MODELS — the
		* tool will only activate on components whose tipo is listed here.
		* Stripped from register.json on import (SIMPLE_TOOL_OBJECT replaces it
		* in the runtime cache); callers read it from the dd1324 record.
		* @var string AFFECTED_TIPOS
		*/
		public const AFFECTED_TIPOS = 'dd1350';

		/**
		* Whether to show the tool button in the inspector panel
		* (component_radio_button, boolean-like value).
		* @var string SHOW_IN_INSPECTOR
		*/
		public const SHOW_IN_INSPECTOR = 'dd1331';

		/**
		* Whether to show the tool inline inside the component widget
		* (component_radio_button, boolean-like value).
		* @var string SHOW_IN_COMPONENT
		*/
		public const SHOW_IN_COMPONENT = 'dd1332';

		/**
		* Whether the tool requires a translatable component context
		* (component_radio_button, boolean-like value).
		* When true, the tool is hidden on non-translatable components.
		* @var string REQUIRE_TRANSLATABLE
		*/
		public const REQUIRE_TRANSLATABLE = 'dd1333';

		/**
		* Whether the tool is always active, bypassing profile authorization
		* (component_radio_button, boolean-like value).
		* When true, the tool renders even if the user's profile normally
		* excludes it (e.g. read-only or restricted profiles).
		* @var string ALWAYS_ACTIVE
		*/
		public const ALWAYS_ACTIVE = 'dd1601';

		/**
		* Global active/inactive flag for the tool (component_radio_button,
		* boolean-like value). Inactive tools are excluded from the runtime
		* tool list returned by tool_common::get_active_tool_names().
		* @var string ACTIVE
		*/
		public const ACTIVE = 'dd1354';


	// -------------------------------------------------------------------------
	// Extensions group
	// JSON blobs that ship with the tool's own register.json and are stored
	// as-is in the dd1324 record.
	// -------------------------------------------------------------------------

		/**
		* Ontology extension nodes contributed by this tool (component_json).
		* Merged into the running ontology when the tool is imported, allowing
		* tools to register their own tipos without touching core ontology files.
		* @var string ONTOLOGY
		*/
		public const ONTOLOGY = 'dd1334';

		/**
		* Tool UI / behaviour properties (component_json).
		* Arbitrary key-value bag used by the tool's own PHP/JS code; shape is
		* tool-specific. Stored lang-wrapped in legacy (v6) registry dumps;
		* tools_register::unwrap_lang_value() normalises on import.
		* @var string PROPERTIES
		*/
		public const PROPERTIES = 'dd1335';

		/**
		* Multilingual UI label strings (component_json).
		* Key is a label identifier; value is a lang-map object.
		* Stored lang-wrapped in legacy (v6) registry dumps; normalised on import.
		* @var string LABELS
		*/
		public const LABELS = 'dd1372';


	// -------------------------------------------------------------------------
	// Configuration group
	// Runtime and factory-default JSON configuration for a tool.
	// Both tipos are present on the dd1324 registry record; only CONFIG also
	// exists on dd996 (the per-installation configuration section), where it
	// holds the operator's local overrides.
	// -------------------------------------------------------------------------

		/**
		* Runtime configuration JSON (component_json).
		* Present in both dd1324 (imported default) and dd996 (local override).
		* tools_register merges dd996 config over dd1324 config when building
		* the effective tool configuration object.
		* @var string CONFIG
		*/
		public const CONFIG = 'dd999';

		/**
		* Factory default configuration JSON (component_json).
		* Present in dd1324 only. Stores the unmodified defaults shipped with
		* the tool so that operators can reset their dd996 config to factory
		* state without reimporting the tool.
		* @var string DEFAULT_CONFIG
		*/
		public const DEFAULT_CONFIG = 'dd1633';


	// -------------------------------------------------------------------------
	// Derived / internal group
	// Computed values written back to the registry record; never authored by
	// hand in register.json.
	// -------------------------------------------------------------------------

		/**
		* Resolved simple tool object, stored as JSON (component_json).
		* Computed by tools_register::create_simple_tool_object() after import
		* and written back to the dd1324 record as a fast-path cache for the
		* frontend. Any incoming register.json that happens to contain this
		* field has it stripped before the record is saved, ensuring the value
		* is always server-generated and never imported verbatim.
		* @var string SIMPLE_TOOL_OBJECT
		*/
		public const SIMPLE_TOOL_OBJECT = 'dd1353';



	/**
	* MAP
	* Name → tipo index of all component constants defined above.
	*
	* Provides a stable, iterable representation of the full component schema
	* of a tool registry record. Used by:
	* - tools_register::validate_register() — iterates MAP to check that
	*   every expected component tipo is present in an imported record.
	* - Generic import/export helpers — build component lists without
	*   enumerating constants individually.
	*
	* The string keys match the flat property names used in the v7
	* register.json authoring format (see tools/tool_common/register.schema.json)
	* so that callers can treat MAP as a bidirectional key ↔ tipo lookup.
	* @var array<string, string> MAP
	*/
	public const MAP = [
		'tool_name'				=> self::TOOL_NAME,
		'tool_label'			=> self::TOOL_LABEL,
		'version'				=> self::VERSION,
		'dedalo_version_min'	=> self::DEDALO_VERSION_MIN,
		'developer'				=> self::DEVELOPER,
		'description'			=> self::DESCRIPTION,
		'implementation'		=> self::IMPLEMENTATION,
		'affected_models'		=> self::AFFECTED_MODELS,
		'affected_tipos'		=> self::AFFECTED_TIPOS,
		'show_in_inspector'		=> self::SHOW_IN_INSPECTOR,
		'show_in_component'		=> self::SHOW_IN_COMPONENT,
		'require_translatable'	=> self::REQUIRE_TRANSLATABLE,
		'always_active'			=> self::ALWAYS_ACTIVE,
		'active'				=> self::ACTIVE,
		'ontology'				=> self::ONTOLOGY,
		'properties'			=> self::PROPERTIES,
		'labels'				=> self::LABELS,
		'config'				=> self::CONFIG,
		'default_config'		=> self::DEFAULT_CONFIG,
		'simple_tool_object'	=> self::SIMPLE_TOOL_OBJECT
	];



}//end class tool_ontology_map
