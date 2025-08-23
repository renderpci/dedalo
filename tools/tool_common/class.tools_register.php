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

		$info_file_processed = [];

		// tipos
			$tipo_name		= self::$tipo_tool_name; // 'dd1326';
			$tipo_ontology	= self::$tipo_ontology; // 'dd1334';
			$tipo_version	= self::$tipo_version; // 'dd1327';

		// get the all tools folders
			$ar_tools = (array)glob(DEDALO_TOOLS_PATH . '/*', GLOB_ONLYDIR);

		// Ontologies. Get the all tools ontologies
			$counter				= 0;
			$ar_ontologies			= [];
			$info_objects_parsed	= [];
			foreach ($ar_tools as $current_dir_tool) {

				// basename
					$basename = pathinfo($current_dir_tool)['basename'];

				// ignore folders with name different from pattern 'tool_*'
					if ($basename==='tool_common' || $basename==='acc') {
						continue;
					}
					// tool_dev_template case only for development
					if ($basename==='tool_dev_template' && SHOW_DEVELOPER!==true) {
						continue;
					}
					if (preg_match('/^tool_\w+$/', $basename, $output_array)!==1) {
						debug_log(__METHOD__
							. " Ignored non tool valid directory:" .PHP_EOL
							. ' dirname: ' . $basename
							, logger::ERROR
						);
						continue;
					}

				// info_file register.json file check
					$info_file = $current_dir_tool . '/register.json';
					if(!file_exists($info_file)){
						debug_log(__METHOD__
							. " ERROR. File register.json does not exist into directory: ".PHP_EOL
							. " $current_dir_tool "
							, logger::ERROR
						);
						continue;
					}

				// info object (JSON encoded)
					if( !$info_object = json_decode( file_get_contents($info_file) ) ){
						debug_log(__METHOD__
							." ERROR. Wrong file register.json . Is not a JSON valid file "
							, logger::ERROR
						);
						continue;
					}

					$new_info_object = clone $info_object;

				// ontology from info object
					$current_ontology = (isset($new_info_object->components->{$tipo_ontology}->dato->{DEDALO_DATA_NOLAN}))
						? $new_info_object->components->{$tipo_ontology}->dato->{DEDALO_DATA_NOLAN}
						: null;

					if(!empty($current_ontology)) {

						if (isset($current_ontology[0]) && empty((array)$current_ontology[0])) {
							debug_log(__METHOD__
								." ERROR. Ignored Wrong file register.json ONTOLOGY DATA (empty item value)" .PHP_EOL
								. ' dir_tool: ' . $current_dir_tool
								, logger::ERROR
							);
							continue;
						}
						if (isset($current_ontology[1])) {
							debug_log(__METHOD__
								." ERROR. Ignored Wrong file register.json ONTOLOGY DATA (more than one value)" .PHP_EOL
								. ' dir_tool: ' . $current_dir_tool
								, logger::ERROR
							);
							continue;
						}

						$new_ontology = tools_register::renumerate_term_id($current_ontology, $counter);

						$ar_ontologies[] = $new_ontology;

						// update ontology
						$new_info_object->components->{$tipo_ontology}->dato->{DEDALO_DATA_NOLAN} = $new_ontology;

					}else{

						// debug_log(__METHOD__." The current register.json don't have ontology data ".to_string($current_dir_tool), logger::ERROR);
					}

				// add info_objects_parsed
					$info_objects_parsed[$basename] = $new_info_object;

				// info_file_processed
					$name = isset($info_object->components->{$tipo_name})
						? reset($info_object->components->{$tipo_name}->dato->{'lg-nolan'})
						: null;
					$version = isset($info_object->components->{$tipo_version})
						? reset($info_object->components->{$tipo_version}->dato->{'lg-nolan'})
						: null;
					$info_file_processed[] = (object)[
						'dir'		=> str_replace(DEDALO_TOOLS_PATH, '', $current_dir_tool),
						'name'		=> $name,
						'version'	=> $version
					];
			}//end foreach ($ar_tools)

		// DB Updates
			// structure
			if (!empty($ar_ontologies)) {

				// Clean. remove structure records in the database
					ontology_node::delete_tld_nodes( 'tool' );

				// import ontology (structure) in dd_ontology
					foreach ($ar_ontologies as $current_ontology) {
						// @TODO generate the ontology node or modify exiting one!! 10-01-2024
					}

				// update counter at end to consolidate
					ontology_node::update_counter('tool', $counter-1);
			}

			// section
			if (!empty($info_objects_parsed)) {

				// Clean. remove tools section records in the database. (!) Removed to allow recycle records
					// tools_register::clean_section_tools_data();

				// import record (section tool) in db matrix_tools
					// $section_id_counter = 1; // first section_id to use
					foreach ($info_objects_parsed as $basename => $current_tool_section_data) {

						// check file placeholder
							if (isset($current_tool_section_data->type) && $current_tool_section_data->type==='placeholder') {
								$msg = isset($current_tool_section_data->info)
									? $current_tool_section_data->info
									: 'This file (register.json) must be downloaded from current tool Dédalo Tools Development record
									   using the button \'Download register file\' ';
								debug_log(__METHOD__
									. " Error. tool register file of basename: '$basename' is a placeholder !" . PHP_EOL
									. ' ' . $msg
									, logger::ERROR);
								continue;
							}

						// check register file is well formed
							if (!isset($current_tool_section_data->relations) || !isset($current_tool_section_data->components)) {
								$msg = 'Error. '.$basename.' Bad formed register file (register.json)!
										This file must be downloaded from current tool Dédalo Tools Development record using the button
										\'Download register file\'
										';
								debug_log(__METHOD__
									. " Error. tool register file" . PHP_EOL
									. ' ' . $msg
									, logger::ERROR);

								// info_file_processed. Added info
								$info_file_processed_item = array_find($info_file_processed, function($el) use($basename){
									return ($el->name===$basename || substr($el->dir, 1)===$basename);
								});
								if (is_object($info_file_processed_item)) {
									$info_file_processed_item->errors	= [$msg];
									$info_file_processed_item->imported	= false;
								}
								continue;
							}

						// section save raw data
							try {
								$tool_name = $current_tool_section_data->components->{self::$tipo_tool_name}->dato->{DEDALO_DATA_NOLAN}[0];
							} catch (Exception $e) {
								debug_log(__METHOD__
									. " ERROR on get tool name " .PHP_EOL
									. ' Exception: '. $e->getMessage() . PHP_EOL
									. ' The tool will be ignored. section_id: '. $current_tool_section_data->section_id
									, logger::ERROR
								);
								continue;
							}
							if (empty($tool_name)) {
								debug_log(__METHOD__
									. " Error. tool name is empty ! Ignored tool" . PHP_EOL
									. ' section_id: '.to_string($current_tool_section_data->section_id)
									, logger::ERROR
								);
								continue;
							}

						// look for already existing tools
							$tool_found			= self::get_tool_data_by_name($tool_name, self::$section_registered_tools_tipo); // return section record raw data or null
							$current_section_id	= !empty($tool_found->section_id)
								? (int)$tool_found->section_id
								: null;

							// section
								$section = section::get_instance(
									$current_section_id, // null if not found existing by name
									self::$section_registered_tools_tipo, // dd1324
									'edit',
									true // cache (!) it's important set true to prevent re-create later when a component saves)
								);

							// change section data. Set dd1324 (register) instead 'dd1340' (development)
								$current_tool_section_data->section_tipo	= self::$section_registered_tools_tipo;
								$current_tool_section_data->section_id		= $current_section_id;

							// section save
								$section->set_dato( $current_tool_section_data );
								$created_section_id = $section->Save();

						// info_file_processed. Added info
							$info_file_processed_item = array_find($info_file_processed, function($el) use($tool_name){
								return $el->name===$tool_name;
							});
							if (is_object($info_file_processed_item)) {
								$info_file_processed_item->existing_tool	= $current_section_id==$created_section_id;
								$info_file_processed_item->section_id		= $created_section_id;
								$info_file_processed_item->imported			= true;
							}

						// save new record with serialized section_id
							// $created_section_id = tools_register::import_info_object($current_tool_section_data, $section_id_counter);

						// build tool_object (simple). Collect data from created section to create a imple_tool_object
							$tool_object = tools_register::create_simple_tool_object(
								$section->get_tipo(), // section_tools_tipo
								$section->get_section_id()
							);

						// tool_obj . Set and save updated section
							$component_tipo	= self::$simple_tool_obj_component_tipo; // 'dd1353'; // component_json (Simple tool object)
							$model			= ontology_node::get_model_by_tipo($component_tipo,true);
							$component		= component_common::get_instance(
								$model,
								$component_tipo,
								$created_section_id,
								'list',
								DEDALO_DATA_NOLAN,
								self::$section_registered_tools_tipo,
								true // cache
							);
							$component->set_dato([$tool_object]);
							$component->Save();
							if (!empty($tool_object->name)) {
								tools_register::create_tool_config($tool_object->name);
							}else{
								debug_log(__METHOD__
									. " Ignored empty tool_object->name " . PHP_EOL
									. ' tool_object: ' . to_string($tool_object)
									, logger::ERROR
								);
							}
					}//end foreach ($info_objects_parsed as $basename => $current_tool_section_data)

				// remove non existing tools (in directory /tools)
					$resource_all_section_records = section::get_resource_all_section_records_unfiltered(
						self::$section_registered_tools_tipo,
						'section_id'
					);
					while ($current_row = pg_fetch_assoc($resource_all_section_records)) {

						$current_section_id = $current_row['section_id'];

						// tool name
							$component_tipo	= self::$tipo_tool_name;
							$model			= ontology_node::get_model_by_tipo($component_tipo,true);
							$component		= component_common::get_instance(
								$model,
								$component_tipo,
								$current_section_id,
								'list',
								DEDALO_DATA_NOLAN,
								self::$section_registered_tools_tipo,
								true // cache
							);
							$value = $component->get_value(); // as  'tool_lang'

						// files exists check
							$found = array_find($info_file_processed, function($el) use($value) {
								return $el->name === $value;
							});
							if ($found===null) {
								// delete unused section
								$section = section::get_instance(
									$current_section_id, // string|null section_id
									self::$section_registered_tools_tipo // string section_tipo
								);
								$section->Delete(
									'delete_record' // string delete_mode
								);
							}
					}

			}//end if (!empty($info_objects_parsed))

		// clean_cache. Remove previous stored data in session or files
			$deleted = tools_register::clean_cache();
			if (!$deleted) {
				debug_log(__METHOD__
					. " Error deleting tools cache " . PHP_EOL
					. ' deleted: ' . to_string($deleted)
					, logger::ERROR
				);
			}

		// debug
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__
					. " Imported ".($counter+1)." ontology items from dirs: ". PHP_EOL
					. json_encode($info_file_processed, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
					, logger::DEBUG
				);
			}


		return $info_file_processed;
	}//end import_tools



	/**
	* GET_TOOLS_FILES_LIST
	* Scan tool directory and get tools name and version in array of objects
	* Used by class area-development to get the tools list
	* @return array $files_list
	*/
	public static function get_tools_files_list() : array {

		$files_list = [];

		$files = glob(DEDALO_TOOLS_PATH . '/*', GLOB_ONLYDIR);
		foreach ($files as $path) {

			// ignore folders with name different from pattern 'tool_*'
				if (	1!==preg_match('/tools\/tool_*/', $path, $output_array)
					 || 1===preg_match('/tools\/tool_common/', $path, $output_array)
					) {
					continue;
				}
				// tool_dev_template case only for development
				if (1===preg_match('/tools\/tool_dev_template/', $path, $output_array) && SHOW_DEVELOPER!==true) {
					continue;
				}

			// tool name
				$tool_name = str_replace(DEDALO_TOOLS_PATH.'/', '', $path);

			// item
				$item = (object)[
					'name'				=> $tool_name,
					'warning'			=> null,
					'version'			=> null,
					'developer'			=> null,
					'installed_version'	=> null
				];

			// check file register is ready
				$register_contents = file_get_contents($path.'/register.json');
				if($register_contents===false) {

					debug_log(__METHOD__
						." Invalid register.json file from tool ".to_string($tool_name)
						, logger::ERROR
					);
					$item->warning = '(!) Invalid register.json file';

				}else{

					// compare register.json file.
					$all_registered_tools = tool_common::get_all_registered_tools();
					$tool_info = array_find($all_registered_tools, function($el) use($tool_name) {
						return $el->name===$tool_name;
					});

					if(empty($tool_info)) {
						debug_log(__METHOD__
							." Tool '$tool_name' not found in all_registered_tools."
							, logger::WARNING
						);
						$item->warning = '(!) Not registered tool';
					}

					// info object (JSON encoded file)
						$info_object = json_handler::decode( $register_contents );
						if( !$info_object ) {
							debug_log(__METHOD__
								." ERROR. Wrong file register.json . Is not a JSON valid file "
								, logger::ERROR
							);
						}else{

							// version
							$tipo_version	= self::$tipo_version;
							if (	isset($info_object->components->{$tipo_version})
								 && isset($info_object->components->{$tipo_version}->dato)
								 && isset($info_object->components->{$tipo_version}->dato->{'lg-nolan'})
								 && isset($info_object->components->{$tipo_version}->dato->{'lg-nolan'}[0])
								) {
								$item->version = $info_object->components->{$tipo_version}->dato->{'lg-nolan'}[0];
							}

							// developer
							$tipo_developer	= self::$tipo_developer;
							if (	isset($info_object->components->{$tipo_developer})
								 && isset($info_object->components->{$tipo_developer}->dato)
								 && isset($info_object->components->{$tipo_developer}->dato->{'lg-nolan'})
								 && isset($info_object->components->{$tipo_developer}->dato->{'lg-nolan'}[0])
								) {
								$item->developer = $info_object->components->{$tipo_developer}->dato->{'lg-nolan'}[0];
							}
						}

					// installed_version
						if (!empty($tool_info)) {
							$item->installed_version = $tool_info->version  ?? null;
						}
				}//end if($register_contents===false)

			// add
				$files_list[] = $item;
		}//end foreach ($files as $path)


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
				"offset": 0,
				"full_count": false
			}');
			$search	= search::get_instance($sqo);
			$result	= $search->search();

		// whole section record raw data
		$tool_full_data = $result->ar_records[0] ?? null;

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
			$dato	= $component->get_dato();
			$value	= is_array($dato) && isset($dato[0])
				? $dato[0]
				: null;
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
			$dato	= $component->get_dato_full();
			$value	= [];
			if (!empty($dato)) {
				foreach ($dato as $current_lang => $current_value) {
					$value[] = (object)[
						'lang'	=> $current_lang,
						'value'	=> reset($current_value)
					];
				}
			}
			$tool_object->label = $value;

		// version
			$component_tipo	= self::$tipo_version; //  'dd1327';
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);
			$dato	= $component->get_dato();
			$value	= is_array($dato) && isset($dato[0])
				? $dato[0]
				: null;
			$tool_object->version = $value;

		// dedalo version (minimal requirement)
			$component_tipo	= self::$tipo_dedalo_version_minimal; // 'dd1328';
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);
			$dato 	= $component->get_dato();
			$value	= is_array($dato) && isset($dato[0])
				? $dato[0]
				: null;
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
			$dato	= $component->get_dato_full();
			$value	= [];
			if (!empty($dato)) {
				foreach ($dato as $current_lang => $current_value) {
					$value[] = (object)[
						'lang'	=> $current_lang,
						'value'	=> $current_value
					];
				}
			}
			$tool_object->description = $value;

		// developer
			$component_tipo	= 'dd1644';
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);
			$dato	= $component->get_dato_full();
			$value	= [];
			if (!empty($dato)) {
				foreach ($dato as $current_lang => $current_value) {
					$value[] = (object)[
						'lang'	=> $current_lang,
						'value'	=> $current_value
					];
				}
			}
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
			$ar_value			= $component->get_valor(DEDALO_DATA_LANG, 'array'); // array|null
			$affected_models	= (!empty($ar_value))
				? array_map(function($el){
					return strip_tags($el); // strip possible mark tags (e.g. <mark>section</mark>)
				  }, $ar_value)
				: $ar_value;
			$tool_object->affected_models = $affected_models;

		// affected tipos (components)
			$component_tipo	= 'dd1350';
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);
			$dato	= $component->get_dato();
			$value	= is_array($dato) && isset($dato[0])
				? $dato[0]
				: null;
			// empty object case check
			if (empty((array)$value)) {
				$value = null;
			}
			$tool_object->affected_tipos = $value; // array

		// show in inspector
			$component_tipo	= 'dd1331';
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
			$dato		= $component->get_dato();
			$dato_ref	= !empty($dato)
				? reset($dato)->section_id
				: null;
			$value		= $dato_ref == '1' ? true : false;
			$tool_object->show_in_inspector = $value; // bool

		// show in component
			$component_tipo	= 'dd1332';
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
			$dato		= $component->get_dato();
			$dato_ref	= !empty($dato)
				? reset($dato)->section_id
				: null;
			$value		= $dato_ref == '1' ? true : false;
			$tool_object->show_in_component = $value;

		// always active
			$component_tipo	= 'dd1601';
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);
			$dato		= (array)$component->get_dato();
			$dato_ref	= !empty($dato)
				? reset($dato)->section_id
				: null;
			$value		= $dato_ref=='1' ? true : false;
			$tool_object->always_active = $value;

		// requirement translatable
			$component_tipo	= 'dd1333';
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
			$dato		= $component->get_dato();
			$dato_ref	= empty($dato) ? '0' : (reset($dato)->section_id);
			$value		= $dato_ref=='1' ? true : false;
			$tool_object->requirement_translatable = $value;

		// ontology -component_json-
			$component_tipo	= self::$tipo_ontology; // 'dd1334';
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);
			$dato	= $component->get_dato();
			$value	= is_array($dato) && isset($dato[0])
				? $dato[0]
				: null;
			// empty object case check
			if (empty($value) || empty((array)$value)) {
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
			$dato	= $component->get_dato();
			$value	= is_array($dato) && isset($dato[0])
				? $dato[0]
				: null;
			// empty object case check
			if (empty($value) || empty((array)$value)) {
				$value = null;
			}
			$tool_object->properties = $value;

		// labels
			$component_tipo	= 'dd1372';
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);
			$dato	= $component->get_dato();
			$value	= is_array($dato) && isset($dato[0])
				? $dato[0]
				: null;
			// empty object case check
			if (empty($value) || empty((array)$value)) {
				$value = null;
			}
			$tool_object->labels = $value;


		return $tool_object;
	}//end create_simple_tool_object



	/**
	* RENUMERATE_TERM_ID
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

			// bad ontology error skip
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
			$ar_items_children = array_filter($ontology, function($current_element) use($tipo){
				return isset($current_element->parent) && $current_element->parent===$tipo;
			});
			$new_tld = 'tool'.++$counter;

			$item->tipo = $new_tld;
			$item->tld 	= 'tool';

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
					   "select": [],
					   "limit": 1,
					   "offset": 0,
					   "full_count": false
				   }');
				$reg_search	= search::get_instance($reg_sqo);
				$reg_result	= $reg_search->search();

				if (!empty($reg_result->ar_records)) {

					$reg_record = reset($reg_result->ar_records);

					// set section data from DDBB record
					$reg_section = section::get_instance($reg_record->section_id, $reg_record->section_tipo);
					$reg_section->set_dato($reg_record->datos);

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
						$reg_dato = $reg_component->get_dato();
						if(empty($reg_dato)) return false;

					// config_component. create the config component in the config section
						$config_section = section::get_instance(null, $section_tools_config_tipo);
						$config_section->forced_create_record();

						$config_component = component_common::get_instance(
							$component_model,
							$component_tipo,
							$config_section->get_section_id(),
							'list',
							DEDALO_DATA_NOLAN,
							$section_tools_config_tipo
						);
						$config_component->set_dato($reg_dato);
						$config_component->Save();

					// config_name_component. create the name component in the config section
						$config_name_component_model	= ontology_node::get_model_by_tipo($component_tipo_tool_name,true);
						$config_name_component			= component_common::get_instance(
							$config_name_component_model,
							$component_tipo_tool_name,
							$config_section->get_section_id(),
							'list',
							DEDALO_DATA_NOLAN,
							$section_tools_config_tipo
						);
						$config_name_component->set_dato([$tool_name]);
						$config_name_component->Save();
				}else{
					return false;
				}
			}//end if(empty($tool_by_name))


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
			$config_search	= search::get_instance($sqo_config_tool_active);
			$config_result	= $config_search->search();
			$ar_records		= $config_result->ar_records ?? [];

		// map result as ar_config
			$ar_config = array_map(function($record) use($name_tipo, $config_tipo){

				$section = section::get_instance($record->section_id, $record->section_tipo);
				$section->set_dato($record->datos);

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
					$dato	= $component->get_dato();
					$name	= !empty($dato)
						? reset($dato)
						: null;

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
					$dato	= $component->get_dato();
					$config	= !empty($dato)
						? reset($dato)
						: null;

				$value = (object)[
					'name'		=> $name,
					'config'	=> $config
				];

				return $value;
			}, $ar_records);

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
			$config_search	= search::get_instance($sqo_config_tool_active);
			$config_result	= $config_search->search();
			$ar_records		= $config_result->ar_records ?? [];

		// map result as ar_config
			$ar_config = array_map(function($record) use($name_tipo, $config_tipo){

				$section = section::get_instance($record->section_id, $record->section_tipo);
				$section->set_dato($record->datos);

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
						$component	= component_common::get_instance(
							$model,
							$name_tipo,
							$record->section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$record->section_tipo
						);
						$dato	= $component->get_dato();
						$name	= !empty($dato)
							? ($dato[0] ?? null)
							: null;
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
						$component	= component_common::get_instance(
							$model,
							$config_tipo,
							$record->section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$record->section_tipo
						);
						$dato	= $component->get_dato();
						$config	= !empty($dato)
							? ($dato[0] ?? null)
							: null;
					}

				// value
					$value = (object)[
						'name'		=> $name,
						'config'	=> $config
					];

				return $value;
			}, $ar_records);

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
	* 	'development_1_' + 'cache_user_tools.json'
	* @return string
	*/
	public static function get_cache_user_tools_file_name() : string {

		return 'cache_user_tools.json';
	}//end get_cache_user_tools_file_name



	/**
	* REMOVE_TOOL_CONFIGURATION
	* Delete the configuration records in DDBB of specified tool	*
	* @param string $tool_name | the name of the tool configuration to be delete as 'tool_transcription'
	* @return bool
	*/
	public static function remove_tool_configuration( string $tool_name ) :bool {

		if( empty($tool_name) ){
			return false;
		}

		// get the tool_transctiprion register
		$tool_transcription_register = tools_register::get_tool_data_by_name($tool_name , tools_register::$section_tools_config_tipo);


		if( !empty($tool_transcription_register) ){

			$sql = 'DELETE FROM "matrix_tools"
					WHERE section_tipo = \''.tools_register::$section_tools_config_tipo.'\'
					AND section_id = \''.$tool_transcription_register->section_id.'\';';

			$result	= pg_query(DBi::_getConnection(), $sql);

			if($result===false){
				return false;
			}
		}

		return true;
	}//end remove_tool_configuration



}//end class tools_register
