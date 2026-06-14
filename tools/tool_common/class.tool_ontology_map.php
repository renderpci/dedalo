<?php declare(strict_types=1);
/**
* TOOL_ONTOLOGY_MAP
*
* Canonical contract of every ontology tipo used by the tools subsystem.
* This is the single place where the dd-tipos of the tool registry record
* (section dd1324 'Registered Tools'), the tools configuration section
* (dd996) and the tools authoring section (dd1340) are declared.
*
* Any code that reads or writes tool registry/configuration data MUST use
* these constants instead of string literals, so the record schema is
* documented, greppable and typo-safe in one place.
*
* Section tipos themselves remain the existing core defines
* (DEDALO_REGISTER_TOOLS_SECTION_TIPO / DEDALO_TOOLS_CONFIGURATION_SECTION_TIPO
* in core/base/dd_tipos.php); this class only adds the component-level map.
*/
final class tool_ontology_map {



	// Identity
		/** Tool name, e.g. 'tool_lang' (component_input_text) */
		public const TOOL_NAME = 'dd1326';
		/** Display label, translatable (component_input_text) */
		public const TOOL_LABEL = 'dd799';
		/** Tool semantic version, e.g. '2.5.0' (component_input_text) */
		public const VERSION = 'dd1327';
		/** Minimum compatible Dédalo version (component_input_text) */
		public const DEDALO_VERSION_MIN = 'dd1328';
		/** Developer/author name(s) (component_input_text) */
		public const DEVELOPER = 'dd1644';
		/** Free description, translatable (component_text_area) */
		public const DESCRIPTION = 'dd612';
		/** Implementation/technical notes, translatable (component_text_area) */
		public const IMPLEMENTATION = 'dd1362';

	// Applicability
		/** Component/section models the tool affects (component_relation) */
		public const AFFECTED_MODELS = 'dd1330';
		/** Specific ontology tipos restriction (component_json) */
		public const AFFECTED_TIPOS = 'dd1350';
		/** Show the tool in the inspector panel (component_radio_button) */
		public const SHOW_IN_INSPECTOR = 'dd1331';
		/** Show the tool inline in the component (component_radio_button) */
		public const SHOW_IN_COMPONENT = 'dd1332';
		/** Tool requires a translatable component (component_radio_button) */
		public const REQUIRE_TRANSLATABLE = 'dd1333';
		/** Tool is active regardless of profile authorization (component_radio_button) */
		public const ALWAYS_ACTIVE = 'dd1601';
		/** Active status flag (component_radio_button) */
		public const ACTIVE = 'dd1354';

	// Extensions
		/** Tool ontology extension nodes (component_json) */
		public const ONTOLOGY = 'dd1334';
		/** Tool UI/behavior properties (component_json) */
		public const PROPERTIES = 'dd1335';
		/** Multilingual UI label strings (component_json) */
		public const LABELS = 'dd1372';

	// Configuration
		/** Runtime configuration JSON (component_json). Present in dd1324 and dd996 */
		public const CONFIG = 'dd999';
		/** Factory default configuration JSON (component_json). Present in dd1324 only */
		public const DEFAULT_CONFIG = 'dd1633';

	// Derived/internal
		/** Resolved simple tool object (component_json). Computed, removed on registry import */
		public const SIMPLE_TOOL_OBJECT = 'dd1353';



	/**
	* MAP
	* name => tipo index of all components above, for iteration and validation.
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
