<?php declare(strict_types=1);
/**
* TOOLS_REGISTER
* Manages tools registration process, from /tools directory elements to the
* database, in section 'Registered Tools' (dd1324) where are parsed and saved
* That section is not editable, is only for read, and is re-created on each
* import tools action from management area.
* Tools configuration section (dd996) is used to store the custom local configuration of the tools
*/
class tools_register {


	/**
	 * TIPO and Section constants for tool registration
	 */
	public static $section_registered_tools_tipo	= 'dd1324'; // Tools register section
	public static $tipo_tool_name					= 'dd1326'; // tool name like 'tool_transcription'
	public static $tipo_tool_label					= 'dd799';
	public static $tipo_ontology					= 'dd1334';
	public static $tipo_version						= 'dd1327';
	public static $tipo_developer					= 'dd1644';
	public static $tipo_dedalo_version_minimal		= 'dd1328';
	public static $section_tools_config_tipo		= 'dd996';
	public static $tipo_affected_models				= 'dd1330';
	public static $tipo_properties					= 'dd1335';
	public static $tipo_always_active				= 'dd1601';
	public static $tools_configuration				= 'dd999'; // tools Configuration component_json
	public static $tools_default_configuration		= 'dd1633'; // tools default Configuration component_json
	public static $tipo_active						= 'dd1354'; // component_radio_button


	/**
	 * IMPORT_TOOLS
	 *
	 * Main entry point for tool synchronization.
	 * 1. Scans the filesystem for tool directories.
	 * 2. Processes each tool's register.json.
	 * 3. Updates the database ontologies and registry records.
	 * 4. Cleans up stale registry records.
	 * 5. Invalidates caches.
	 *
	 * @return array List of processed tool information objects.
	 */
	public static function import_tools() : array {

		$info_file_processed 	= [];
		$ar_ontologies 			= [];
		$info_objects_parsed 	= [];
		$counter 				= 0;

		// 1. Scan filesystem for valid tool directories
		$tool_directories = self::get_valid_tool_directories();

		// 2. Process each directory and extract data
		foreach ($tool_directories as $current_dir_tool) {

			$basename = basename($current_dir_tool);
			$result   = self::process_tool_directory($current_dir_tool, $basename, $counter);

			if ($result->skipped) {
				continue;
			}

			if ($result->ontology_data) {
				$ar_ontologies[] = $result->ontology_data;
			}

			if ($result->info_object) {
				$info_objects_parsed[$basename] = $result->info_object;
			}

			if ($result->file_info) {
				$info_file_processed[] = $result->file_info;
			}
		}

		// 3. Update database structures (Ontology)
		if (!empty($ar_ontologies)) {
			self::update_ontology_structure($ar_ontologies);
		}

		// 4. Update Registry records in database
		if (!empty($info_objects_parsed)) {
			self::update_tool_registry_sections($info_objects_parsed, $info_file_processed);
		}

		// 5. Cleanup records for tools that were removed from disk
		self::cleanup_removed_tools($info_file_processed);

		// 6. Invalidate caches to reflect changes
		if (!self::clean_cache()) {
			debug_log(__METHOD__ . " Error deleting tools cache", logger::ERROR);
		}

		// Debug logging if enabled
		if (SHOW_DEBUG === true) {
			debug_log(__METHOD__ . " Imported " . count($info_file_processed) . " tools.", logger::DEBUG);
		}

		return $info_file_processed;
	}


	/**
	 * GET_VALID_TOOL_DIRECTORIES
	 *
	 * Scans the DEDALO_TOOLS_PATH and filters for valid tool folders (starting with tool_).
	 *
	 * @return array List of absolute paths to valid tool directories.
	 */
	private static function get_valid_tool_directories() : array {
		$ar_tools 	= (array)glob(DEDALO_TOOLS_PATH . '/*', GLOB_ONLYDIR);
		$valid_dirs = [];

		foreach ($ar_tools as $current_dir_tool) {
			$basename = basename($current_dir_tool);

			// System folders to ignore
			if (in_array($basename, ['tool_common', 'acc'])) {
				continue;
			}

			// Development template only visible in developer mode
			if ($basename === 'tool_dev_template' && SHOW_DEVELOPER !== true) {
				continue;
			}

			// Pattern check (must follow tool_ naming convention)
			if (!str_starts_with($basename, 'tool_')) {
				debug_log(__METHOD__ . " Ignored non-tool directory: $basename", logger::WARNING);
				continue;
			}

			$valid_dirs[] = $current_dir_tool;
		}

		return $valid_dirs;
	}


	/**
	 * PROCESS_TOOL_DIRECTORY
	 *
	 * Parses a tool's register.json, performs version migrations, and prepares ontology data.
	 *
	 * @param string $current_dir_tool Absolute path to tool folder.
	 * @param string $basename Tool folder name.
	 * @param int    $counter Reference to counter for ontology renumeration.
	 * @return object Processed results object.
	 */
	private static function process_tool_directory(string $current_dir_tool, string $basename, int &$counter) : object {

		$result = (object)[
			'skipped' 		=> false,
			'ontology_data' => null,
			'info_object' 	=> null,
			'file_info' 	=> null
		];

		$info_file = $current_dir_tool . '/register.json';
		if (!file_exists($info_file)) {
			debug_log(__METHOD__ . " ERROR. Missing register.json in: $current_dir_tool", logger::ERROR);
			$result->skipped = true;
			return $result;
		}

		// Decode the tool registration file
		$info_object = json_handler::decode(file_get_contents($info_file));
		if (!$info_object) {
			debug_log(__METHOD__ . " ERROR. Invalid register.json in: $current_dir_tool", logger::ERROR);
			$result->skipped = true;
			return $result;
		}

		// Handle legacy v6 data format if present
		$new_info_object = self::convert_register_v6_to_v7(clone $info_object);

		// Local helper for value extraction
		$get_val = function(object $obj, string $tipo) {
			$model  = ontology_node::get_model_by_tipo($tipo, true);
			$column = section_record_data::get_column_name($model);
			return $obj->{$column}->{$tipo}[0]->value ?? null;
		};

		// Prepare and renumerate ontology structure if defined
		$tipo_ontology = self::$tipo_ontology;
		$ontology_value = $get_val($new_info_object, $tipo_ontology);

		if (!empty($ontology_value)) {
			if (!is_array($ontology_value)) {
				$ontology_value = [$ontology_value];
			}
			$new_ontology_value 	= self::renumerate_term_id($ontology_value, $counter);
			$result->ontology_data 	= $new_ontology_value;

			// Inject renumerated ontology back into the object for saving
			$model_ontology  = ontology_node::get_model_by_tipo($tipo_ontology, true);
			$column_ontology = section_record_data::get_column_name($model_ontology);
			$new_info_object->{$column_ontology}->{$tipo_ontology} = [(object)['value' => $new_ontology_value]];
		}

		$result->info_object = $new_info_object;

		// Extract metadata for the import report
		$name    = $get_val($new_info_object, self::$tipo_tool_name);
		$version = $get_val($new_info_object, self::$tipo_version);

		$result->file_info = (object)[
			'dir'     => str_replace(DEDALO_TOOLS_PATH, '', $current_dir_tool),
			'name'    => $name,
			'version' => $version
		];

		return $result;
	}


	/**
	 * UPDATE_ONTOLOGY_STRUCTURE
	 *
	 * (Note: Implementation placeholder) Updates the tool-related ontology terms in database.
	 *
	 * @param array $ar_ontologies List of renumerated ontology structures.
	 */
	private static function update_ontology_structure(array $ar_ontologies) : void {
		// Remove existing tool structure nodes
		ontology_utils::delete_tld_nodes('tool');

		foreach ($ar_ontologies as $current_ontology_data) {
			// @TODO: Implementation for inserting new ontology nodes
		}
	}


	/**
	 * UPDATE_TOOL_REGISTRY_SECTIONS
	 *
	 * Persists tool registration data to the database tools registry section (dd1324).
	 *
	 * @param array $info_objects_parsed  Processed tool objects.
	 * @param array $info_file_processed  Reference to import report array for updating status.
	 */
	private static function update_tool_registry_sections(array $info_objects_parsed, array &$info_file_processed) : void {

		foreach ($info_objects_parsed as $basename => $current_tool_section_data) {

			// Validate it's not a placeholder file
			if (isset($current_tool_section_data->type) && $current_tool_section_data->type === 'placeholder') {
				debug_log(__METHOD__ . " Error. Tool register for '$basename' is a placeholder. Skipping.", logger::ERROR);
				continue;
			}

			// Essential data check
			if (!isset($current_tool_section_data->relation) || !isset($current_tool_section_data->data)) {
				$msg = "Invalid register.json structure for '$basename'.";
				debug_log(__METHOD__ . " $msg", logger::ERROR);

				$report_item = array_find($info_file_processed, function($el) use($basename) {
					return ($el->name === $basename || substr($el->dir, 1) === $basename);
				});
				if ($report_item) {
					$report_item->errors   = [$msg];
					$report_item->imported = false;
				}
				continue;
			}

			// Extract tool name from the data object
			$model  = ontology_node::get_model_by_tipo(self::$tipo_tool_name, true);
			$column = section_record_data::get_column_name($model);
			$tool_name = $current_tool_section_data->{$column}->{self::$tipo_tool_name}[0]->value ?? null;

			if (empty($tool_name)) {
				debug_log(__METHOD__ . " Error. Tool name missing from registration data for '$basename'. Skipping.", logger::ERROR);
				continue;
			}

			// Remove dd1353 (simple_tool_object) if exists in source file (/current_tool/register.json)
			$simple_tool_object_tipo = 'dd1353';
			$model = ontology_node::get_model_by_tipo($simple_tool_object_tipo, true);
			$column = section_record_data::get_column_name($model);
			if( isset($current_tool_section_data->{$column}->{$simple_tool_object_tipo}) ) {
				unset($current_tool_section_data->{$column}->{$simple_tool_object_tipo});
			}

			// Save or update the tool's registration section record
			$current_section_id = self::save_tool_section_record($tool_name, $current_tool_section_data);

			if (!$current_section_id) {
				continue;
			}

			// Update report with success status
			$report_item = array_find($info_file_processed, function($el) use($tool_name) {
				return $el->name === $tool_name;
			});
			if ($report_item) {
				$report_item->section_id = $current_section_id;
				$report_item->imported   = true;
			}
		}
	}


	/**
	 * SAVE_TOOL_SECTION_RECORD
	 *
	 * Upserts a section record in the tools registry section.
	 *
	 * @param string $tool_name
	 * @param object $current_tool_section_data
	 * @return int|null Created/Updated section ID.
	 */
	private static function save_tool_section_record(string $tool_name, object $current_tool_section_data) : ?int {

		$existing_tool = self::get_tool_data_by_name($tool_name, self::$section_registered_tools_tipo);
		$current_section_id = !empty($existing_tool->section_id) ? (int)$existing_tool->section_id : null;

		$current_tool_section_data->section_tipo = self::$section_registered_tools_tipo;
		$current_tool_section_data->section_id   = $current_section_id;

		// Create record if it doesn't exist
		if (empty($current_section_id)) {
			$section = section::get_instance(self::$section_registered_tools_tipo);
			$current_section_id = $section->create_record();
			if (!$current_section_id) {
				debug_log(__METHOD__ . " Error. Failed to create record in " . self::$section_registered_tools_tipo, logger::ERROR);
				return null;
			}
		}

		$section_record = section_record::get_instance(self::$section_registered_tools_tipo, $current_section_id);
		$section_record->set_data($current_tool_section_data);
		$section_record->save();

		return (int)$current_section_id;
	}


	/**
	 * CLEANUP_REMOVED_TOOLS
	 *
	 * Deletes registry records for tools that are no longer present on the filesystem.
	 *
	 * @param array $info_file_processed Currently present tools from disk.
	 */
	private static function cleanup_removed_tools(array $info_file_processed) : void {

		$records = section::get_resource_all_section_records_unfiltered(self::$section_registered_tools_tipo, 'section_id');

		while ($current_row = pg_fetch_assoc($records)) {

			$current_section_id = (int)$current_row['section_id'];

			// Identify tool by its registered name
			$component_tipo = self::$tipo_tool_name;
			$model          = ontology_node::get_model_by_tipo($component_tipo, true);
			$component      = component_common::get_instance(
				$model,
				$component_tipo,
				$current_section_id,
				'list',
				DEDALO_DATA_NOLAN,
				self::$section_registered_tools_tipo,
				true
			);
			$tool_name_on_db = $component->get_value();

			// If tool is not on disk anymore, purge the registry record
			$found_on_disk = array_find($info_file_processed, function($el) use($tool_name_on_db) {
				return $el->name === $tool_name_on_db;
			});

			if ($found_on_disk === null) {
				$section_record = section_record::get_instance(self::$section_registered_tools_tipo, $current_section_id);
				$section_record->delete();
			}
		}
	}


	/**
	 * GET_TOOLS_FILES_LIST
	 *
	 * Scans the tool directory and returns metadata for all available tools.
	 * Used by the development area UI to display tool installation status.
	 *
	 * @return array List of tool objects with name, version, developer and status.
	 */
	public static function get_tools_files_list() : array {

		$files_list = [];

		// Optimization: Cache lookups outside the loop
		$all_registered_tools = tool_common::get_all_registered_tools();

		$m_version    = ontology_node::get_model_by_tipo(self::$tipo_version, true);
		$col_version  = section_record_data::get_column_name($m_version);

		$m_developer  = ontology_node::get_model_by_tipo(self::$tipo_developer, true);
		$col_developer = section_record_data::get_column_name($m_developer);

		$files = glob(DEDALO_TOOLS_PATH . '/*', GLOB_ONLYDIR);

		foreach ($files as $path) {
			$tool_name = basename($path);

			// Filter for valid tool folders
			if (!str_starts_with($tool_name, 'tool_') || $tool_name === 'tool_common') {
				continue;
			}
			if ($tool_name === 'tool_dev_template' && SHOW_DEVELOPER !== true) {
				continue;
			}

			$item = (object)[
				'name'              => $tool_name,
				'warning'           => null,
				'version'           => null,
				'developer'         => null,
				'installed_version' => null
			];

			$register_file = $path . '/register.json';
			if (!file_exists($register_file)) {
				$item->warning = '(!) Missing register.json file';
				$files_list[] = $item;
				continue;
			}

			$contents = file_get_contents($register_file);
			if ($contents === false) {
				$item->warning = '(!) Error reading register.json';
				$files_list[] = $item;
				continue;
			}

			// Check registry status
			$tool_info = array_find($all_registered_tools, function($el) use($tool_name) {
				return $el->name === $tool_name;
			});

			if (empty($tool_info)) {
				$item->warning = '(!) Not registered tool';
			} else {
				$item->installed_version = $tool_info->version ?? null;
			}

			// Parse registration file
			$info_object = json_handler::decode($contents);
			if (!$info_object) {
				$item->warning = '(!) Invalid register.json format';
			} else {
				// Migrate if needed
				if (isset($info_object->components)) {
					$info_object = self::convert_register_v6_to_v7($info_object);
				}

				$item->version   = $info_object->{$col_version}->{self::$tipo_version}[0]->value ?? null;
				$item->developer = $info_object->{$col_developer}->{self::$tipo_developer}[0]->value ?? null;
			}

			$files_list[] = $item;
		}

		return $files_list;
	}


	/**
	 * GET_TOOL_DATA_BY_NAME
	 *
	 * Searches for a tool record by its name within a specific section (Registry or Config).
	 *
	 * @param string $tool_name     The unique name of the tool (e.g. 'tool_lang').
	 * @param string $section_tipo  The section to search in.
	 * @return object|null The raw database record object or null if not found.
	 */
	public static function get_tool_data_by_name(string $tool_name, string $section_tipo) : ?object {

		$sqo = (object)[
			'typo'         => 'sqo',
			'section_tipo' => [$section_tipo],
			'filter'       => (object)[
				'$and' => [
					(object)[
						'q'          => [$tool_name],
						'q_operator' => '=',
						'path'       => [
							(object)[
								'section_tipo'   => $section_tipo,
								'component_tipo' => self::$tipo_tool_name,
								'model'          => "component_input_text",
								'name'           => "Tool name"
							]
						],
						'type' => "jsonb"
					]
				]
			],
			'select'     => [],
			'limit'      => 1,
			'full_count' => false
		];

		$search = search::get_instance($sqo);
		$result = $search->search();

		return $result->fetch_one() ?: null;
	}


	/**
	 * Private helper to extract component data or values from a section record.
	 * Used to DRY create_simple_tool_object.
	 */
	private static function get_val(int|string $section_id, string $section_tipo, string $tipo, $lang = DEDALO_DATA_NOLAN, $full_data = false) {
		$model = ontology_node::get_model_by_tipo($tipo, true);
		$comp  = component_common::get_instance($model, $tipo, $section_id, 'list', $lang, $section_tipo);
		return $full_data ? $comp->get_data() : $comp->get_value();
	}


	/**
	 * CREATE_SIMPLE_TOOL_OBJECT
	 *
	 * Gathers all relevant data from a registered tool's section record and returns a simplified object.
	 * This object is used by the frontend and other modules to understand tool capabilities and properties.
	 *
	 * @param string      $section_tipo
	 * @param int|string  $section_id
	 * @return object Simplified tool information object.
	 */
	public static function create_simple_tool_object(string $section_tipo, int|string $section_id) : object {

		$tool_object = new stdClass();
		$tool_object->section_tipo = $section_tipo;
		$tool_object->section_id   = $section_id;

		// Basic metadata
		$tool_object->name       = self::get_val($section_id, $section_tipo, self::$tipo_tool_name);
		$tool_object->label      = self::get_val($section_id, $section_tipo, self::$tipo_tool_label, DEDALO_DATA_LANG, true);
		$tool_object->version    = self::get_val($section_id, $section_tipo, self::$tipo_version);
		$tool_object->dd_version = self::get_val($section_id, $section_tipo, self::$tipo_dedalo_version_minimal);
		$tool_object->developer  = self::get_val($section_id, $section_tipo, 'dd1644');
		$tool_object->description = self::get_val($section_id, $section_tipo, 'dd612', DEDALO_DATA_LANG, true);

		// affected_models
		$tool_object->affected_models = (function() use ($section_id, $section_tipo) {
			$tipo = self::$tipo_affected_models;
			$lang = DEDALO_DATA_NOLAN;
			$data = self::get_val($section_id, $section_tipo, $tipo, $lang, true) ?? [];
			$models = [];
			foreach ($data as $locator) {
				$val = component_relation_common::get_locator_value($locator, DEDALO_DATA_NOLAN, false, ['dd1345']);
				if (isset($val[0])) {
					$models[] = strip_tags($val[0]);
				}
			}
			return $models;
		})();

		// affected_tipos
		$tool_object->affected_tipos = self::get_val($section_id, $section_tipo, 'dd1350', DEDALO_DATA_NOLAN, true)[0]->value ?? null;

		// Boolean flags (represented as value 1 in database)
		$flags = [
			'show_in_inspector'        => 'dd1331',
			'show_in_component'        => 'dd1332',
			'always_active'            => self::$tipo_always_active, // 'dd1601'
			'requirement_translatable' => 'dd1333'
		];

		foreach ($flags as $prop => $tipo) {
			$data = self::get_val($section_id, $section_tipo, $tipo, DEDALO_DATA_NOLAN, true);
			$data_ref = $data[0]->section_id ?? null;
			$tool_object->{$prop} = ($data_ref == '1');
		}

		// Specialized JSON properties
		$json_props = [
			'ontology'   => self::$tipo_ontology,
			'properties' => self::$tipo_properties,
			'labels'     => 'dd1372'
		];

		foreach ($json_props as $prop => $tipo) {
			$data  = self::get_val($section_id, $section_tipo, $tipo, DEDALO_DATA_LANG, true);
			$value = $data[0]->value ?? null;
			if (empty($value) || (is_array($value) && count($value) === 0)) {
				$value = null;
			}
			$tool_object->{$prop} = $value;
		}

		return $tool_object;
	}


	/**
	 * RENUMERATE_TERM_ID
	 *
	 * Recursively renumbers the 'tipo' (term_id) based on a global counter for tools.
	 * Also updates the 'parent' references for child nodes to maintain hierarchy.
	 *
	 * @param array $ontology  The ontology structure to renumber.
	 * @param int   $counter   Reference to global tool counter.
	 * @return array The updated ontology structure.
	 */
	public static function renumerate_term_id(array $ontology, &$counter) : array {

		if (empty($ontology)) {
			return $ontology;
		}

		foreach ($ontology as $item) {
			if (!isset($item->tipo)) {
				debug_log(__METHOD__ . " Skipped item without tipo: " . to_string($item), logger::ERROR);
				continue;
			}

			$old_tipo = $item->tipo;
			$new_tipo = 'tool' . (++$counter);

			// Update self
			$item->tipo = $new_tipo;
			$item->tld  = 'tool';

			// Update references in all other elements that pointed to this as parent
			foreach ($ontology as $other_item) {
				if (isset($other_item->parent) && $other_item->parent === $old_tipo) {
					$other_item->parent = $new_tipo;
				}
			}
		}

		return $ontology;
	}


	/**
	 * CREATE_TOOL_CONFIG
	 *
	 * Ensures a tool configuration record exists in dd996.
	 * If not found, it clones the default configuration from the tool's registration record.
	 *
	 * @param string $tool_name The unique tool name.
	 * @return bool Success status.
	 */
	public static function create_tool_config(string $tool_name) : bool {

		$config_section_tipo = self::$section_tools_config_tipo;

		// 1. Check if user configuration already exists
		$existing_config = self::get_tool_data_by_name($tool_name, $config_section_tipo);
		if (!empty($existing_config)) {
			return true;
		}

		// 2. Not found, lookup the registration record to get default config
		$reg_section_tipo = self::$section_registered_tools_tipo;
		$reg_record = self::get_tool_data_by_name($tool_name, $reg_section_tipo);

		if (empty($reg_record)) {
			debug_log(__METHOD__ . " Error. Tool '$tool_name' record not found in registry.", logger::ERROR);
			return false;
		}

		// Load registry record data
		$reg_section = section_record::get_instance($reg_section_tipo, $reg_record->section_id);
		$reg_section->set_data($reg_record);

		// Extract default config data
		$default_config = self::get_val($reg_record->section_id, $reg_section_tipo, self::$tools_configuration, DEDALO_DATA_NOLAN, true);
		if (empty($default_config)) {
			return false;
		}

		// 3. Create new configuration record
		$config_section = section::get_instance($config_section_tipo);
		$new_id = $config_section->create_record();

		if (!$new_id) {
			debug_log(__METHOD__ . " Failed to create config record for $tool_name", logger::ERROR);
			return false;
		}

		// Save configuration components
		$model_config = ontology_node::get_model_by_tipo(self::$tools_configuration, true);
		$comp_config  = component_common::get_instance($model_config, self::$tools_configuration, $new_id, 'list', DEDALO_DATA_NOLAN, $config_section_tipo);
		$comp_config->set_data($default_config);
		$comp_config->save();

		$model_name = ontology_node::get_model_by_tipo(self::$tipo_tool_name, true);
		$comp_name  = component_common::get_instance($model_name, self::$tipo_tool_name, $new_id, 'list', DEDALO_DATA_NOLAN, $config_section_tipo);
		$comp_name->set_data([(object)['value' => $tool_name, 'lang' => DEDALO_DATA_NOLAN]]);
		$comp_name->save();

		return true;
	}


	/**
	 * GET_ALL_CONFIG_TOOL
	 *
	 * Returns current user configuration for all registered tools.
	 *
	 * @return array List of config objects {name, config}.
	 */
	public static function get_all_config_tool() : array {
		static $cache;
		if (isset($cache)) return $cache;

		return $cache = self::get_config_list(self::$section_tools_config_tipo, self::$tools_configuration);
	}


	/**
	 * GET_ALL_DEFAULT_CONFIG
	 *
	 * Returns default registry configuration for all tools.
	 *
	 * @return array List of default config objects {name, config}.
	 */
	public static function get_all_default_config() : array {
		static $cache;
		if (isset($cache)) return $cache;

		return $cache = self::get_config_list(self::$section_registered_tools_tipo, self::$tools_default_configuration);
	}


	/**
	 * Private helper to fetch and parse configuration records from a specific section.
	 */
	private static function get_config_list(string $section_tipo, string $config_tipo) : array {

		$sqo = (object)[
			'section_tipo' => [$section_tipo],
			'limit'        => 0,
			'full_count'   => false
		];

		$search = search::get_instance($sqo);
		$result = $search->search();

		$config_list = [];
		foreach ($result as $record) {
			$name   = self::get_val($record->section_id, $section_tipo, self::$tipo_tool_name);
			$config = self::get_val($record->section_id, $section_tipo, $config_tipo, DEDALO_DATA_NOLAN, true)[0]->value ?? null;

			if (!$name) continue;

			$config_list[] = (object)[
				'name'   => $name,
				'config' => $config
			];
		}

		return $config_list;
	}


	/**
	 * GET_ALL_CONFIG_TOOL_CLIENT
	 *
	 * Filters the user configuration to return only properties flagged with "client": true.
	 *
	 * @return array
	 */
	public static function get_all_config_tool_client() : array {
		static $cache;
		if (isset($cache)) return $cache;

		$full_configs = self::get_all_config_tool();
		return $cache = self::filter_client_config($full_configs);
	}


	/**
	 * GET_ALL_DEFAULT_CONFIG_TOOL_CLIENT
	 *
	 * Filters the default configuration to return only properties flagged with "client": true.
	 *
	 * @return array
	 */
	public static function get_all_default_config_tool_client() : array {
		static $cache;
		if (isset($cache)) return $cache;

		$full_configs = self::get_all_default_config();
		return $cache = self::filter_client_config($full_configs);
	}


	/**
	 * Helper to filter config objects for properties visible to the client.
	 */
	private static function filter_client_config(array $configs) : array {
		return array_map(function($item) {
			$client_config = [];
			if (!empty($item->config)) {
				foreach ($item->config as $key => $prop) {
					if (isset($prop->client) && $prop->client === true) {
						$client_config[$key] = $prop;
					}
				}
			}

			return (object)[
				'name'   => $item->name,
				'config' => !empty($client_config) ? (object)$client_config : null
			];
		}, $configs);
	}


	/**
	 * CLEAN_CACHE
	 *
	 * Purges the tool-related cache files.
	 *
	 * @return bool Success status.
	 */
	public static function clean_cache() : bool {
		return dd_cache::delete_cache_files([
			self::get_cache_user_tools_file_name()
		]);
	}


	/**
	 * GET_CACHE_USER_TOOLS_FILE_NAME
	 *
	 * Returns the base name for the user tool authorization cache.
	 *
	 * @return string
	 */
	public static function get_cache_user_tools_file_name() : string {
		return 'cache_user_tools.php';
	}


	/**
	 * REMOVE_TOOL_CONFIGURATION
	 *
	 * Deletes the configuration records for a specific tool from the database.
	 *
	 * @param string $tool_name Unique name of the tool.
	 * @return bool Success status.
	 */
	public static function remove_tool_configuration(string $tool_name) : bool {
		if (empty($tool_name)) return false;

		$config = self::get_tool_data_by_name($tool_name, self::$section_tools_config_tipo);
		if (empty($config->section_id)) return true;

		$params = [
			self::$section_tools_config_tipo,
			$config->section_id
		];
		$sql_query = 'DELETE FROM "matrix_tools" WHERE section_tipo = $1 AND section_id = $2';

		$result = matrix_db_manager::exec_search($sql_query, $params);

		return ($result !== false);
	}


	/**
	 * CONVERT_REGISTER_V6_TO_V7
	 *
	 * Legacy helper to migrate tool registration data from the Dédalo v6 format to v7.
	 *
	 * @param object $info_object Original v6/v7 registration object.
	 * @return object Migrated v7 registration object.
	 */
	public static function convert_register_v6_to_v7(object $info_object) : object {

		// If 'components' property exists, it's a v6 structure
		if (isset($info_object->components)) {
			require_once DEDALO_CORE_PATH . '/base/upgrade/class.v6_to_v7.php';

			$response = (object)['result' => false, 'msg' => '', 'errors' => []];
			$migrated = v6_to_v7::process_matrix_row_data(
				$info_object,
				common::get_matrix_table_from_tipo($info_object->section_tipo ?? ''),
				$info_object->section_tipo ?? '',
				$info_object->section_id ?? '',
				v6_to_v7::get_value_type_map(),
				$response
			);

			// Overlay migrated properties onto the object
			foreach ($migrated as $key => $val) {
				$info_object->{$key} = $val;
			}

			// Purge v6-specific properties
			unset($info_object->components, $info_object->relations, $info_object->relations_search);
		}

		return $info_object;
	}


} // end class tools_register
