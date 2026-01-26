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



	static $section_registered_tools_tipo	= 'dd1324'; // Tools register section
	static $simple_tool_obj_component_tipo	= 'dd1353';
	static $tipo_tool_name					= 'dd1326'; // tool name like 'tool_transcription'
	static $tipo_tool_label					= 'dd799';
	static $tipo_ontology					= 'dd1334';
	static $tipo_version					= 'dd1327';
	static $tipo_developer					= 'dd1644';
	static $tipo_dedalo_version_minimal		= 'dd1328';
	static $section_tools_config_tipo		= 'dd996';
	static $tipo_affected_models			= 'dd1330';
	static $tipo_properties					= 'dd1335';
	static $tools_configuration				= 'dd999'; // tools Configuration component_json
	static $tools_default_configuration		= 'dd1633'; // tools default Configuration component_json
	static $tipo_active						= 'dd1354'; // component_radio_button



	/**
	* IMPORT_TOOLS
	* Read all dedalo dir 'tools' sub-folders and extract property 'ontology' from all 'register.json' files
	* Remove all previous values in database about tld 'tool' and insert safe re-numerated all new structure terms
	* from imported ontologies
	* @return array $info_file_processed
	*	Array of objects
	*/
	public static function import_tools() : array {

		$info_file_processed 	= [];
		$ar_ontologies 			= [];
		$info_objects_parsed 	= [];
		$counter 				= 0;

		// 1. Get valid tool directories
		$tool_directories = self::get_valid_tool_directories();

		// 2. Process each directory
		foreach ($tool_directories as $current_dir_tool) {

			// Get basename as 'tool_lang' from '/tools/tool_lang'
			$basename = pathinfo($current_dir_tool, PATHINFO_BASENAME);

			// Process tool directory
			$result = self::process_tool_directory($current_dir_tool, $basename, $counter);

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

		// 3. Database Updates
		// Structure (Ontology)
		if (!empty($ar_ontologies)) {
			self::update_ontology_structure($ar_ontologies);
		}

		// Sections (Tools Registry)
		if (!empty($info_objects_parsed)) {
			self::update_tool_registry_sections($info_objects_parsed, $info_file_processed);
		}

		// 4. Remove non-existing tools
		self::cleanup_removed_tools($info_file_processed);

		// 5. Clean cache
		$deleted = self::clean_cache();
		if (!$deleted) {
			debug_log(__METHOD__ . " Error deleting tools cache ", logger::ERROR);
		}

		// Debug
		if (SHOW_DEBUG === true) {
			debug_log(__METHOD__
				. " Imported " . count($info_file_processed) . " ontology items from dirs: " . PHP_EOL
				. json_encode($info_file_processed, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
				, logger::DEBUG
			);
		}

		return $info_file_processed;
	}//end import_tools



	/**
	* GET_VALID_TOOL_DIRECTORIES
	* Scans the tools directory and filters for valid tool folders
	* @return array
	*/
	private static function get_valid_tool_directories() : array {
		$ar_tools 	= (array)glob(DEDALO_TOOLS_PATH . '/*', GLOB_ONLYDIR);
		$valid_dirs = [];

		foreach ($ar_tools as $current_dir_tool) {
			$basename = pathinfo($current_dir_tool, PATHINFO_BASENAME);

			// ignore folders with name different from pattern 'tool_*'
			if ($basename === 'tool_common' || $basename === 'acc') {
				continue;
			}
			// tool_dev_template case only for development
			if ($basename === 'tool_dev_template' && SHOW_DEVELOPER !== true) {
				continue;
			}
			if (preg_match('/^tool_\w+$/', $basename) !== 1) {
				debug_log(__METHOD__
					. " Ignored non tool valid directory:" . PHP_EOL
					. ' dirname: ' . $basename
					, logger::ERROR
				);
				continue;
			}

			$valid_dirs[] = $current_dir_tool;
		}

		return $valid_dirs;
	}//end get_valid_tool_directories



	/**
	* PROCESS_TOOL_DIRECTORY
	* Parses a single tool directory, extracting ontology and info
	* @param string $current_dir_tool
	* @param string $basename
	* @param int $counter
	* @return object
	*/
	private static function process_tool_directory(string $current_dir_tool, string $basename, int &$counter) : object {

		$result = (object)[
			'skipped' 		=> false,
			'ontology_data' => null,
			'info_object' 	=> null,
			'file_info' 	=> null
		];

		// info_file register.json file check
		$info_file = $current_dir_tool . '/register.json';
		if (!file_exists($info_file)) {
			debug_log(__METHOD__ . " ERROR. File register.json does not exist in: $current_dir_tool", logger::ERROR);
			$result->skipped = true;
			return $result;
		}

		// info object (JSON encoded)
		$info_object = json_handler::decode(file_get_contents($info_file));
		if (!$info_object) {
			debug_log(__METHOD__ . " ERROR. Invalid register.json in: $current_dir_tool", logger::ERROR);
			$result->skipped = true;
			return $result;
		}

		// v6 to v7 migration (if needed)
		$new_info_object = self::convert_register_v6_to_v7(clone $info_object);

		/**
		 * Local helper to extract a value from the registry info object
		 */
		$get_component_value = function(object $obj, string $tipo) {
			$model  = ontology_node::get_model_by_tipo($tipo, true);
			$column = section_record_data::get_column_name($model);
			return $obj->{$column}->{$tipo}[0]->value ?? null;
		};

		// Ontology Extraction (dd1334)
		$tipo_ontology = self::$tipo_ontology; // 'dd1334' component_json
		$ontology_value = $get_component_value($new_info_object, $tipo_ontology);

		if (!empty($ontology_value)) {
			if(!is_array($ontology_value)) {
				$ontology_value = [$ontology_value];
			}
			$new_ontology_value 	= self::renumerate_term_id($ontology_value, $counter);
			$result->ontology_data 	= $new_ontology_value;

			// Update ontology in new object
			$model_ontology  = ontology_node::get_model_by_tipo($tipo_ontology, true);
			$column_ontology = section_record_data::get_column_name($model_ontology);
			$new_info_object->{$column_ontology}->{$tipo_ontology} = [(object)['value' => $new_ontology_value]];
		}

		$result->info_object = $new_info_object;

		// File Info (extract from original or new info object)
		$name    = $get_component_value($new_info_object, self::$tipo_tool_name);
		$version = $get_component_value($new_info_object, self::$tipo_version);

		$result->file_info = (object)[
			'dir'     => str_replace(DEDALO_TOOLS_PATH, '', $current_dir_tool),
			'name'    => $name,
			'version' => $version
		];

		return $result;
	}//end process_tool_directory



	/**
	* UPDATE_ONTOLOGY_STRUCTURE
	* Updates the ontology structure in the database
	* @param array $ar_ontologies
	*/
	private static function update_ontology_structure(array $ar_ontologies) : void {
		// Clean. remove structure records in the database
		ontology_utils::delete_tld_nodes('tool');

		// import ontology (structure) in dd_ontology
		foreach ($ar_ontologies as $current_ontology_data) {
			// @TODO generate the ontology node or modify exiting one!! 10-01-2024
		}

		// update counter at end to consolidate
		// ontology_node::update_counter('tool', $counter-1);
	}//end update_ontology_structure



	/**
	* UPDATE_TOOL_REGISTRY_SECTIONS
	* Imports and updates tool sections in the database
	* @param array $info_objects_parsed
	* @param array $info_file_processed
	*/
	private static function update_tool_registry_sections(array $info_objects_parsed, array &$info_file_processed) : void {

		foreach ($info_objects_parsed as $basename => $current_tool_section_data) {

			// check file placeholder
			if (isset($current_tool_section_data->type) && $current_tool_section_data->type === 'placeholder') {
				$msg = isset($current_tool_section_data->info)
					? $current_tool_section_data->info
					: 'This file (register.json) must be downloaded from current tool Dédalo Tools Development record using the button \'Download register file\' ';
				debug_log(__METHOD__
					. " Error. tool register file of basename: '$basename' is a placeholder !" . PHP_EOL
					. ' ' . $msg
					, logger::ERROR);
				continue;
			}

			// check register file is well formed
			if (!isset($current_tool_section_data->relation) || !isset($current_tool_section_data->data)) {
				$msg = 'Error. ' . $basename . ' Bad formed register file (register.json)! This file must be downloaded from current tool Dédalo Tools Development record using the button \'Download register file\'';
				debug_log(__METHOD__ . " Error. tool register file" . PHP_EOL . ' ' . $msg, logger::ERROR);

				// info_file_processed. Added info
				$info_file_processed_item = array_find($info_file_processed, function($el) use($basename) {
					return ($el->name === $basename || substr($el->dir, 1) === $basename);
				});
				if (is_object($info_file_processed_item)) {
					$info_file_processed_item->errors   = [$msg];
					$info_file_processed_item->imported = false;
				}
				continue;
			}

			// section save raw data

			// tool name
			$model = ontology_node::get_model_by_tipo(self::$tipo_tool_name, true);
			$column = section_record_data::get_column_name($model);
			$tool_name = $current_tool_section_data->{$column}->{self::$tipo_tool_name}[0]->value ?? null;
			if (empty($tool_name)) {
				debug_log(__METHOD__
					. " Error. tool name is empty ! Ignored tool" . PHP_EOL
					. ' section_id: ' . to_string($current_tool_section_data->section_id)
					, logger::ERROR
				);
				continue;
			}

			// Save section record
			$current_section_id = self::save_tool_section_record($tool_name, $current_tool_section_data);
			if (!$current_section_id) {
				continue; // Error logged in helper
			}

			// info_file_processed. Added info
			$info_file_processed_item = array_find($info_file_processed, function($el) use($tool_name) {
				return $el->name === $tool_name;
			});
			if (is_object($info_file_processed_item)) {
				// Update info_file_processed
				$info_file_processed_item->section_id = $current_section_id;
				$info_file_processed_item->imported   = true;
			}

			// Update simple tool object
			self::update_simple_tool_object($current_section_id);

		}// end foreach
	}//end update_tool_registry_sections



	/**
	* SAVE_TOOL_SECTION_RECORD
	* Handles the logic for checking existing tools and saving/creating the section record
	* @param string $tool_name
	* @param object $current_tool_section_data
	* @return int|null $current_section_id
	*/
	private static function save_tool_section_record(string $tool_name, object $current_tool_section_data) : ?int {

		// look for already existing tools
		$tool_found = self::get_tool_data_by_name($tool_name, self::$section_registered_tools_tipo);
		$current_section_id = !empty($tool_found->section_id)
			? (int)$tool_found->section_id
			: null;

		// change section data. Set dd1324 (register) instead 'dd1340' (development)
		$current_tool_section_data->section_tipo = self::$section_registered_tools_tipo;
		$current_tool_section_data->section_id   = $current_section_id;

		// section record
		if (empty($current_section_id)) {
			$section = section::get_instance(self::$section_registered_tools_tipo);
			$current_section_id = $section->create_record();
			if (empty($current_section_id)) {
				debug_log(__METHOD__
					. " Error. section record not created ! Ignored tool" . PHP_EOL
					.' section_tupo: ' . self::$section_registered_tools_tipo . PHP_EOL
					.' section_id: ' . json_encode($current_section_id)
					, logger::ERROR
				);
				return null;
			}
		}

		$created_section_id = $current_section_id;

		$section_record = section_record::get_instance(
			self::$section_registered_tools_tipo, // dd1324
			$created_section_id
		);
		$section_record->set_data($current_tool_section_data);
		$section_record->save();

		return (int)$created_section_id;
	}//end save_tool_section_record



	/**
	* UPDATE_SIMPLE_TOOL_OBJECT
	* Creates and saves the simple tool object (dd1353)
	* @param int $section_id
	* @return bool $result
	*/
	private static function update_simple_tool_object(int $section_id) : bool {

		// build tool_object (simple). Collect data from created section
		$tool_object = self::create_simple_tool_object(
			self::$section_registered_tools_tipo,
			$section_id
		);

		// tool_obj . Set and save updated section
		$component_tipo = self::$simple_tool_obj_component_tipo; // 'dd1353' component_json
		$model          = ontology_node::get_model_by_tipo($component_tipo, true);
		$component      = component_common::get_instance(
			$model,
			$component_tipo,
			$section_id,
			'list',
			DEDALO_DATA_NOLAN,
			self::$section_registered_tools_tipo,
			true // cache
		);
		$data_element = (object)[
			'value' => $tool_object
		];
		$component->set_data([$data_element]);
		$result = $component->save();
		if(!$result) {
			debug_log(__METHOD__
				. " Error. Saving dd1353 failed!" . PHP_EOL
				.' component_tipo: ' . $component_tipo . PHP_EOL
				.' section_id: ' . $section_id . PHP_EOL
				.' tool_object: ' . to_string($tool_object)
				, logger::ERROR
			);
			return false;
		}

		if (!empty($tool_object->name)) {
			self::create_tool_config($tool_object->name);
		} else {
			debug_log(__METHOD__
				. " Ignored empty tool_object->name " . PHP_EOL
				. ' tool_object: ' . to_string($tool_object)
				, logger::ERROR
			);
		}

		return $result;
	}//end update_simple_tool_object



	/**
	* CLEANUP_REMOVED_TOOLS
	* Checks for registered tools that no longer exist in the file system (files list) and deletes them
	* @param array $info_file_processed
	*/
	private static function cleanup_removed_tools(array $info_file_processed) : void {

		$resource_all_section_records = section::get_resource_all_section_records_unfiltered(
			self::$section_registered_tools_tipo,
			'section_id'
		);

		while ($current_row = pg_fetch_assoc($resource_all_section_records)) {

			$current_section_id = $current_row['section_id'];

			// tool name
			$component_tipo = self::$tipo_tool_name;
			$model          = ontology_node::get_model_by_tipo($component_tipo, true);
			$component      = component_common::get_instance(
				$model,
				$component_tipo,
				$current_section_id,
				'list',
				DEDALO_DATA_NOLAN,
				self::$section_registered_tools_tipo,
				true // cache
			);
			$value = $component->get_value(); // as 'tool_lang'

			// files exists check
			$found = array_find($info_file_processed, function($el) use($value) {
				return $el->name === $value;
			});

			if ($found === null) {
				// delete unused section
				$section_record = section_record::get_instance(
					self::$section_registered_tools_tipo,
					$current_section_id
				);
				$section_record->delete();
			}
		}
	}//end cleanup_removed_tools



	/**
	* GET_TOOLS_FILES_LIST
	* Scan tool directory and get tools name and version in array of objects
	* Used by class area-development to get the tools list
	* @return array $files_list
	*/
	public static function get_tools_files_list() : array {

		$files_list = [];

		// Move lookups outside the loop for efficiency
		$all_registered_tools = tool_common::get_all_registered_tools();

		$model_version    = ontology_node::get_model_by_tipo(self::$tipo_version, true);
		$column_version   = section_record_data::get_column_name($model_version);

		$model_developer  = ontology_node::get_model_by_tipo(self::$tipo_developer, true);
		$column_developer = section_record_data::get_column_name($model_developer);

		$files = glob(DEDALO_TOOLS_PATH . '/*', GLOB_ONLYDIR);
		foreach ($files as $path) {

			$tool_name = basename($path);

			// ignore folders with name different from pattern 'tool_*'
			if (!str_starts_with($tool_name, 'tool_') || $tool_name === 'tool_common') {
				continue;
			}
			// tool_dev_template case only for development
			if ($tool_name === 'tool_dev_template' && SHOW_DEVELOPER !== true) {
				continue;
			}

			// item
			$item = (object)[
				'name'              => $tool_name,
				'warning'           => null,
				'version'           => null,
				'developer'         => null,
				'installed_version' => null
			];

			// check file register is ready
			$register_file = $path . '/register.json';
			if (!file_exists($register_file)) {
				$item->warning = '(!) Missing register.json file';
				$files_list[] = $item;
				continue;
			}

			$register_contents = file_get_contents($register_file);
			if ($register_contents === false) {
				debug_log(__METHOD__ . " Error reading register.json file from tool " . to_string($tool_name), logger::ERROR);
				$item->warning = '(!) Error reading register.json';
				$files_list[] = $item;
				continue;
			}

			// find registered tool info
			$tool_info = array_find($all_registered_tools, function($el) use($tool_name) {
				return $el->name === $tool_name;
			});

			// Warning if tool not found in all_registered_tools
			if (empty($tool_info)) {
				$item->warning = '(!) Not registered tool';
			}else{
				// installed_version
				$item->installed_version = $tool_info->version ?? null;
			}

			// info object (JSON encoded file)
			$info_object = json_handler::decode($register_contents);

			if (!$info_object) {
				debug_log(__METHOD__ . " ERROR. Invalid register.json for $tool_name. Is not a valid JSON file", logger::ERROR);
				$item->warning = '(!) Invalid register.json format';
			} else {
				// v6 to v7 migration
				if (isset($info_object->components)) {
					$info_object = self::convert_register_v6_to_v7($info_object);
				}

				// version
				$item->version = $info_object->{$column_version}->{self::$tipo_version}[0]->value ?? null;

				// developer
				$item->developer = $info_object->{$column_developer}->{self::$tipo_developer}[0]->value ?? null;
			}

			// add
			$files_list[] = $item;
		}

		return $files_list;
	}//end get_tools_files_list



	/**
	* GET_TOOL_DATA_BY_NAME
	* Gets current tool data from the tool name
	* Note that this function can search in any virtual of section 'Tools' (dd73)
	* @param string $tool_name
	* @return object|null $tool_full_data
	*/
	public static function get_tool_data_by_name(string $tool_name, string $section_tipo) : ?object {

		// search by tool name
		$sqo = json_decode('{
			"typo": "sqo",
			"id": "temp",
			"section_tipo": [
				"'.$section_tipo.'"
			],
			"filter": {
				"$and": [
					{
						"q": [
							"'.$tool_name.'"
						],
						"q_operator": "=",
						"path": [
							{
								"section_tipo"		: "'.$section_tipo.'",
								"component_tipo"	: "'.self::$tipo_tool_name.'",
								"model"				: "component_input_text",
								"name"				: "Tool name"
							}
						],
						"type": "jsonb"
					}
				]
			},
			"select": [],
			"limit": 1,
			"offset": null,
			"full_count": false
		}');
		$search	= search::get_instance($sqo);
		$db_result = $search->search();

		// whole section record raw data
		$tool_full_data = $db_result->fetch_one() ?: null;


		return $tool_full_data;
	}//end get_tool_data_by_name



	/**
	* CREATE_SIMPLE_TOOL_OBJECT
	* Build a tool object from section tools register development
	* @param string $section_tipo
	* @param int|string $section_id
	* @return object $tool_object
	*	Simple and human readable JSON object to use with components, sections, areas..
	*/
	public static function create_simple_tool_object(string $section_tipo, int|string $section_id) : object {

		$tool_object = new stdClass();

			$tool_object->section_tipo	= $section_tipo;
			$tool_object->section_id	= $section_id;

		// name
			$component_tipo	= self::$tipo_tool_name; // 'dd1326';
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$value = $component->get_value();
			$tool_object->name = $value;

		// label
			$component_tipo	= self::$tipo_tool_label; // 'dd799';
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);
			$value = $component->get_data(); // Use the whole data object !
 			$tool_object->label = $value;

		// version
			$component_tipo	= self::$tipo_version; //  'dd1327';
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$value = $component->get_value();
			$tool_object->version = $value;

		// dedalo version (minimal requirement)
			$component_tipo	= self::$tipo_dedalo_version_minimal; // 'dd1328';
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$value = $component->get_value();
			$tool_object->dd_version = $value;

		// description
			$component_tipo	= 'dd612';
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);
			$value = $component->get_value();
			$tool_object->description = $value;

		// developer
			$component_tipo	= 'dd1644';
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$value = $component->get_value();
			$tool_object->developer = $value;

		// affected components (models)
			$component_tipo	= self::$tipo_affected_models; // 'dd1330';
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component_lang	= ontology_node::get_translatable($component_tipo)===true ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				$component_lang,
				$section_tipo
			);
			$data = $component->get_data() ?? [];
			$affected_models = [];
			foreach ( $data as $locator ) {
				$current_value = component_relation_common::get_locator_value( $locator, DEDALO_DATA_NOLAN, false, ['dd1345'] );
				if( isset($current_value[0]) ){
					strip_tags( $current_value[0] );
					$affected_models = array_merge( $affected_models, $current_value );
				}
			}
			$tool_object->affected_models = $affected_models;

		// affected tipos (components)
			$component_tipo	= 'dd1350'; // component_json
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$data	= $component->get_data() ?? [];
			$value	= $data[0]->value ?? null;
			$tool_object->affected_tipos = $value; // array

		// show in inspector
			$component_tipo	= 'dd1331';
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$data		= $component->get_data();
			$data_ref	= !empty($data)
				? $data[0]->section_id
				: null;
			$value		= $data_ref == '1' ? true : false;
			$tool_object->show_in_inspector = $value; // bool

		// show in component
			$component_tipo	= 'dd1332';
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$data		= $component->get_data();
			$data_ref	= !empty($data)
				? $data[0]->section_id
				: null;
			$value		= $data_ref == '1' ? true : false;
			$tool_object->show_in_component = $value;

		// always active
			$component_tipo	= 'dd1601';
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$data		= $component->get_data();
			$data_ref	= !empty($data)
				? $data[0]->section_id
				: null;
			$value		= $data_ref == '1' ? true : false;
			$tool_object->always_active = $value;

		// requirement translatable
			$component_tipo	= 'dd1333';
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$data		= $component->get_data();
			$data_ref	= !empty($data)
				? $data[0]->section_id
				: null;
			$value		= $data_ref == '1' ? true : false;
			$tool_object->requirement_translatable = $value;

		// ontology -component_json-
			$component_tipo	= self::$tipo_ontology; // 'dd1334' component_json
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);
			$data	= $component->get_data();
			$value	= $data[0]->value ?? null;
			// empty object case check
			if ( $value !== null && empty($value) ) {
				$value = null;
			}
			$tool_object->ontology = $value;

		// properties
			$component_tipo	= self::$tipo_properties; // 'dd1335';
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);
			$data	= $component->get_data();
			$value	= $data[0]->value ?? null;
			// empty object case check
			if ( $value !== null && empty($value) ) {
				$value = null;
			}
			$tool_object->properties = $value;

		// labels
			$component_tipo	= 'dd1372'; // component_json
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);
			$data	= $component->get_data();
			$value	= $data[0]->value ?? null;
			// empty object case check
			if (empty($value) || empty((array)$value)) {
				$value = null;
			}
			$tool_object->labels = $value;


		return $tool_object;
	}//end create_simple_tool_object



	/**
	* RENUMERATE_TERM_ID
	* Receives an ontology array and renumbers the term_id field
	* based on the given counter.
	* @param array $ontology
	* @param int $counter
	* @return array $ontology
	*/
	public static function renumerate_term_id(array $ontology, &$counter) : array {

		// empty case
		if (empty($ontology)) {
			return $ontology;
		}

		foreach ($ontology as $item) {

			// bad ontology (without tipo) error skip
			if (!isset($item->tipo)) {
				debug_log(__METHOD__
					. " Skipped wrong ontology element. Item ontology tipo is not set" .PHP_EOL
					. 'item: '.to_string($item) . PHP_EOL
					. 'ontology: '.to_string($ontology)
					, logger::ERROR
				);
				continue;
			}

			$tipo = $item->tipo;

			// get children
			$ar_items_children = array_filter($ontology, function($current_element) use($tipo){
				return isset($current_element->parent) && $current_element->parent===$tipo;
			});

			// new tld
			$new_tld = 'tool'.++$counter;

			// set new tipo and tld
			$item->tipo = $new_tld;
			$item->tld 	= 'tool';

			// set new parent for children
			foreach ($ar_items_children as $key => $current_element) {
				$ontology[$key]->parent = $new_tld;
			}
		}

		return $ontology;
	}//end renumerate_term_id



	/**
	* CREATE_TOOL_CONFIG
	* @param string $tool_name
	* @return bool
	*/
	public static function create_tool_config(string $tool_name) : bool {

		// section
			$section_tools_config_tipo	= self::$section_tools_config_tipo; // 'dd996';
			$component_tipo_tool_name	= self::$tipo_tool_name; // 'dd1326';
			$tools_configuration		= self::$tools_configuration; // 'dd999'

		// search by tool name. (!) Note that section_tipo is dd996 (Tools configuration) a virtual of 'dd73'
			$tool_by_name = self::get_tool_data_by_name($tool_name, $section_tools_config_tipo);

		// empty result case
			if(empty($tool_by_name)) {

				$section_tools_reg_tipo		= self::$section_registered_tools_tipo; // 'dd1324';
				$component_tipo_tool_name	= self::$tipo_tool_name; // 'dd1326';
				// get the register tool
				$reg_sqo = json_decode('{
					"select": [],
					"typo": "sqo",
					"id": "temp",
					"section_tipo": [
						"'.$section_tools_reg_tipo.'"
					],
					"filter": {
						"$and": [
							 {
								"q": [
								   "'.$tool_name.'"
								],
								"q_operator": "=",
								"path": [
								   {
										"section_tipo"		: "'.$section_tools_reg_tipo.'",
										"component_tipo"	: "'.$component_tipo_tool_name.'",
										"model"				: "component_input_text",
										"name"				: "Tool name"
								   }
								],
								"type": "jsonb"
							 }
						]
					},
					"limit": 1,
					"offset": null,
					"full_count": false
				}');
				$reg_search	= search::get_instance($reg_sqo);
				$db_result = $reg_search->search();
				$reg_record = $db_result->fetch_one(); // get the first record if exists
				if (!empty($reg_record)) {

					// set section data from DDBB record
					$reg_section_record = section_record::get_instance($reg_record->section_tipo, $reg_record->section_id);
					$reg_section_record->set_data( $reg_record );

					// reg_component. get the default config of the register
						$component_tipo		= $tools_configuration; // 'dd999';
						$component_model	= ontology_node::get_model_by_tipo($component_tipo,true);
						$reg_component		= component_common::get_instance(
							$component_model,
							$component_tipo,
							$reg_record->section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$section_tools_reg_tipo
						);
						$reg_data = $reg_component->get_data();
						if(empty($reg_data)) return false;

					// config_component. create the config component in the config section
						$config_section = section::get_instance( $section_tools_config_tipo );
						$config_section_id = $config_section->create_record();

						$config_component = component_common::get_instance(
							$component_model,
							$component_tipo,
							$config_section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$section_tools_config_tipo
						);
						$config_component->set_data($reg_data);
						$config_component->save();

					// config_name_component. create the name component in the config section
						$config_name_component_model	= ontology_node::get_model_by_tipo($component_tipo_tool_name,true);
						$config_name_component			= component_common::get_instance(
							$config_name_component_model,
							$component_tipo_tool_name,
							$config_section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$section_tools_config_tipo
						);
						$data = [(object)[
							'value' => $tool_name,
							'lang' => DEDALO_DATA_NOLAN
						]];
						$config_name_component->set_data($data);
						$config_name_component->save();
				}else{
					return false;
				}
			}//end if (!empty($reg_record))


		return true;
	}//end create_tool_config



	/**
	* GET_ALL_CONFIG_TOOL
	* @return array $ar_config
	*/
	public static function get_all_config_tool() : array {

		// cache
			static $cache_all_config_tool;
			if( isset($cache_all_config_tool) ){
				return $cache_all_config_tool;
			}

		// short vars
			$section_tools_config_tipo	= self::$section_tools_config_tipo; // 'dd996'
			$name_tipo					= self::$tipo_tool_name; // 'dd1326';
			$config_tipo				= self::$tools_configuration; // 'dd999' tools Configuration component_json

		// sqo_config_tool_active
			$sqo_config_tool_active = json_decode('{
				"section_tipo": "'.$section_tools_config_tipo.'",
				"limit": 0,
				"filter": null,
				"full_count": false
			}');

		// search
			$config_search	= search::get_instance( $sqo_config_tool_active );
			$db_result		= $config_search->search();
			$row_count 		= $db_result->row_count();

		// map result as ar_config
			$ar_config = [];
			if($row_count > 0) {
				foreach( $db_result as $record ) {

					$section_record = section_record::get_instance( $record->section_tipo, $record->section_id);
					$section_record->set_data( $record );

					// name
					$model		= ontology_node::get_model_by_tipo($name_tipo,true);
					$component	= component_common::get_instance(
						$model,
						$name_tipo,
						$record->section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$record->section_tipo
					);
					$data	= $component->get_data_lang();
					$name	= $data[0]->value ?? null;

					// config
					$model		= ontology_node::get_model_by_tipo($config_tipo,true);
					$component	= component_common::get_instance(
						$model,
						$config_tipo,
						$record->section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$record->section_tipo
					);
					$data	= $component->get_data_lang();
					$config	= $data[0]->value ?? null;

					$value = (object)[
						'name'		=> $name,
						'config'	=> $config
					];

					$ar_config[] = $value;
				}
			}

		// cache. save the result into the cache
			$cache_all_config_tool = $ar_config;


		return $ar_config;
	}//end get_all_config_tool



	/**
	* GET_ALL_DEFAULT_CONFIG
	* @return array $ar_config
	*/
	public static function get_all_default_config() : array {

		// cache
			static $cache_all_default_config;
			if( isset($cache_all_default_config) ){
				return $cache_all_default_config;
			}

		// short vars
			$section_tools_config_tipo	= self::$section_registered_tools_tipo; // 'dd1324'
			$name_tipo					= self::$tipo_tool_name; // 'dd1326';
			$config_tipo				= self::$tools_default_configuration; // 'dd1633' tools Configuration component_json

		// sqo_config_tool_active
			$sqo_config_tool_active = json_decode('{
				"section_tipo": "'.$section_tools_config_tipo.'",
				"limit": 0,
				"filter": null,
				"full_count": false
			}');

		// search
			$config_search = search::get_instance($sqo_config_tool_active);
			$db_result = $config_search->search();

		// map result as ar_config
		$ar_config = [];
		foreach ($db_result as $record) {

				$section_record = section_record::get_instance( $record->section_tipo, $record->section_id);
				$section_record->set_data( $record );

				// name
				$model = ontology_node::get_model_by_tipo($name_tipo,true);
				if (empty($model)) {
					$name	= null;
					debug_log(__METHOD__
						. " Invalid model (empty) is ignored! " . PHP_EOL
						. ' tipo: ' . to_string($config_tipo)
						, logger::ERROR
					);
				}else{
					$component = component_common::get_instance(
						$model,
						$name_tipo,
						$record->section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$record->section_tipo
					);
					$data	= $component->get_data_lang();
					$name	= $data[0]->value ?? null;
				}

				// config
				$model = ontology_node::get_model_by_tipo($config_tipo,true);
				if (empty($model)) {
					$config	= null;
					debug_log(__METHOD__
						. " Invalid model (empty) is ignored! " . PHP_EOL
						. ' tipo: ' . to_string($config_tipo)
						, logger::ERROR
					);
				}else{
					$component = component_common::get_instance(
						$model,
						$config_tipo,
						$record->section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$record->section_tipo
					);
					$data	= $component->get_data_lang();
					$config	= $data[0]->value ?? null;
				}

				// value object
				$value = new stdclass();
				$value->name = $name;
				$value->config = $config;

				// add to ar_config
				$ar_config[] = $value;
			}

		// cache. save the result into the cache
			$cache_all_default_config = $ar_config;


		return $ar_config;
	}//end get_all_default_config



	/**
	* GET_ALL_CONFIG_TOOL_CLIENT
	* Filter the client part of the config defined with the "client" property to true
	* Config record without client property will be ignored
	* Expected item config object as (note that only config properties with 'client == true' will be included !):
		* {
		*	  "translator_engine": {
		* 		"client": true, <-- (!)
		*		"type": "array",
		*		"value": [
		*		  {
		*			"name": "babel",
		*			"label": "Babel"
		*		  },
		*		  {
		*			"name": "google_translation",
		*			"label": "Google translator"
		*		  },
		*		  {
		*			"name": "pepe_translation",
		*			"label": "Pepe translator"
		*		  }
		*		],
		*		"default": []
		*	  }
		* }
	* @return array $ar_client_config
	*/
	public static function get_all_config_tool_client() : array {

		static $cache_ar_client_default_config;
		if (isset($cache_ar_client_default_config)) {
			return $cache_ar_client_default_config;
		}

		// get all tools config sections
		$ar_config = tools_register::get_all_config_tool();

		// normalize config values
		$ar_client_default_config = array_map(function($item){

			$new_config = [];
			if( !empty($item->config) ) {
				foreach ($item->config as $key => $value) {
					if (isset($value->client) && $value->client===true) {
						$new_config[$key] = $value;
					}
				}
			}

			$new_item = new stdClass();
				$new_item->name		= $item->name;
				$new_item->config	= !empty($new_config) ? (object)$new_config : null;

			return $new_item;
		}, $ar_config);

		$cache_ar_client_default_config = $ar_client_default_config;


		return $ar_client_default_config;
	}//end get_all_config_tool_client



	/**
	* GET_ALL_DEFAULT_CONFIG_TOOL_CLIENT
	* filter the client part of the config defined with the "client" property to true
	* Sample:
		* {
		*	"translator_engine": {
		*		"type": "array",
		*		"value": [
		*		  {
		*			"name": "babel",
		*			"label": "Babel"
		*		  },
		*		  {
		*			"name": "google_translation",
		*			"label": "Google translator"
		*		  }
		*		],
		*		"client": true,
		*		"default": []
		*	}
		* }
	* @return array $ar_client_config
	*/
	public static function get_all_default_config_tool_client() : array {

		static $cache_ar_client_config;
		if (isset($cache_ar_client_config)) {
			return $cache_ar_client_config;
		}

		// get all tools config sections
		$ar_config = tools_register::get_all_default_config();

		$ar_client_config = array_map(function($item){

			$new_config = [];
			if( !empty($item->config) ) {
				foreach ($item->config as $key => $value) {
					if (isset($value->client) && $value->client===true) {
						$new_config[$key] = $value;
					}
				}
			}

			$new_item = new stdClass();
				$new_item->name		= $item->name;
				$new_item->config	= !empty($new_config) ? (object)$new_config : null;

			return $new_item;
		}, $ar_config);

		$cache_ar_client_config = $ar_client_config;


		return $ar_client_config;
	}//end get_all_default_config_tool_client



	/**
	* CLEAN_CACHE
	* Delete session and cache files from tools
	* The file is saved in sessions directory as
	*  'development_1_cache_user_tools.json'
	* @return bool
	*/
	public static function clean_cache() {

		// delete_cache_files
			$deleted_files = dd_cache::delete_cache_files([
				tools_register::get_cache_user_tools_file_name() //	like 'cache_user_tools.json'
			]);
			if ($deleted_files===true) {
				return true;
			}


		return false;
	}//end clean_cache



	/**
	* GET_CACHE_USER_TOOLS_FILE_NAME
	* Normalized cache tool name
	* Note that on save by dd_cache, file will be customized as
	* 	'development_1_' + 'cache_user_tools.php'
	* @return string
	*/
	public static function get_cache_user_tools_file_name() : string {

		return 'cache_user_tools.php';
	}//end get_cache_user_tools_file_name



	/**
	* REMOVE_TOOL_CONFIGURATION
	* Delete the configuration records in DDBB of specified tool	*
	* @param string $tool_name | the name of the tool configuration to be delete as 'tool_transcription'
	* @return bool
	*/
	public static function remove_tool_configuration( string $tool_name ) : bool {

		if( empty($tool_name) ){
			return false;
		}

		// get the tool_transctiprion register
		$tool_transcription_register = tools_register::get_tool_data_by_name(
			$tool_name ,
			tools_register::$section_tools_config_tipo
		);

		if( !empty($tool_transcription_register) ){

			$sql = '
				DELETE FROM "matrix_tools"
				WHERE section_tipo = $1
				  AND section_id = $2
			';

			$result	= pg_query_params(
				DBi::_getConnection(),
				$sql,
				[
					tools_register::$section_tools_config_tipo,
					$tool_transcription_register->section_id
				]
			);

			if($result===false){
				return false;
			}
		}

		return true;
	}//end remove_tool_configuration



	/**
	 * Convert register v6 to v7
	 * It checks if the register is from v6 and if so, it converts it to v7
	 * @param object $info_object
	 * @return object $info_object
	 * Modified info_object with v7 data
	 */
	public static function convert_register_v6_to_v7(object $info_object) : object {

		// v6 to v7 migration
		if( isset($info_object->components) ) {
			// File is from v6. Need to migrate to v7
			require_once DEDALO_CORE_PATH . '/base/upgrade/class.v6_to_v7.php';
			$response = (object)[
				'result' => false,
				'msg' => 'Pre update has failed',
				'errors' => []
			];
			$migrated = v6_to_v7::process_matrix_row_data(
				$info_object,
				common::get_matrix_table_from_tipo($info_object->section_tipo ?? ''),
				$info_object->section_tipo ?? '',
				$info_object->section_id ?? '',
				v6_to_v7::get_value_type_map(),
				$response
			);

			// Merge migrated columns back into info_object
			foreach ($migrated as $key => $val) {
				$info_object->{$key} = $val;
			}

			// Remove v6 properties
			unset($info_object->components);
			unset($info_object->relations);
			unset($info_object->relations_search);
		}

		return $info_object;
	}//end convert_register_v6_to_v7



	// public static function parse_ontology_data( object $info_object ) : object|false {

	// 	$tipo_ontology 		= 'dd1334';
	// 	$model_ontology 	= ontology_node::get_model_by_tipo($tipo_ontology, true);
	// 	$column_ontology 	= section_record_data::get_column_name($model_ontology);
	// 	$ontology_data 		= (isset($info_object->{$column_ontology}->{$tipo_ontology}))
	// 		? $info_object->{$column_ontology}->{$tipo_ontology}
	// 		: null;

	// 	// check invalid cases
	// 	// if (isset($ontology_data[0]) && empty((array)$ontology_data[0])) {
	// 	// 	debug_log(__METHOD__
	// 	// 		." ERROR. Ignored Wrong file register.json ONTOLOGY DATA (empty item value)" .PHP_EOL
	// 	// 		. ' dir_tool: ' . $current_dir_tool
	// 	// 		, logger::ERROR
	// 	// 	);
	// 	// 	return false;
	// 	// }

	// 	$current_ontology_value = $ontology_data[0]->value ?? null;

	// 	// empty value case
	// 	if(empty($current_ontology_value)) {
	// 		return false;
	// 	}

	// 	// array always
	// 	if( !is_array($ontology_data) ){
	// 		$ontology_data = [$ontology_data];
	// 		debug_log(__METHOD__
	// 			." WARNING. Fixed not array ontology data"
	// 			, logger::WARNING
	// 		);
	// 	}

	// 	// renumerate term id
	// 	$new_ontology_data = tools_register::renumerate_term_id($ontology_data, $counter);

	// 	$ar_ontology = [];

	// 	foreach ($ontology_data as $current_ontology_data) {

	// 		$ar_ontology[] = $current_ontology_data;
	// 	}

	// 	return $new_ontology_data;
	// }//end parse_ontology_data



}//end class tools_register
