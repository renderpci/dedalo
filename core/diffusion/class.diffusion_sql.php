<?php
/**
* CLASS DIFFUSION_SQL
* Manage the publication in SQL DDBB
* The specific SQL commands are into the MySQL class
*/
class diffusion_sql extends diffusion  {



	/**
	* @var
	*/
	public static $database_name;
	public static $database_tipo;
	public static $ar_table;
	public static $ar_table_data;



	/**
	* CONSTRUCT
	* @param object|null $options = null
	*  Default null
	*/
	public function __construct( ?object $options=null ) {

		parent::__construct($options);
	}//end __construct



	/**
	* UPDATE_RECORD
	* Update one or any number of records ( array ) and references
	* @param object $options
	* {
	* 	section_tipo: string
	* 	section_id: string|int
	* 	diffusion_element_tipo: string
	* 	recursion_level: int
	* 	component_publication_tipo: string|null
	* 	skip_tipos: array|null
	* 	resolve_references: bool
	* }
	* @return object $response
	*/
	public function update_record( object $options ) : object {

		set_time_limit ( 259200 );  // 3 days

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= [];
				$response->errors	= [];
				$response->class	= get_called_class();

		// options
			$section_tipo				= $options->section_tipo;
			$section_id					= $options->section_id;
			$diffusion_element_tipo		= $options->diffusion_element_tipo;
			$recursion_level			= isset($options->recursion_level)
				? (int)$options->recursion_level
				: 0;
			$component_publication_tipo	= $options->component_publication_tipo ?? null; // optional
			$skip_tipos					= $options->skip_tipos ?? null;
			$resolve_references			= $options->resolve_references ?? false;

		// mandatory vars check
			if(empty($section_tipo) || empty($section_id) || empty($diffusion_element_tipo)) {
				$response->result	= false;
				$response->msg[]	= " ERROR ON UPDATE RECORD section_id:'$section_id' - section_tipo:'$section_tipo' - diffusion_element_tipo:'$diffusion_element_tipo'. Undefined a mandatory options var";
				debug_log(__METHOD__
					.' ' . implode(', ', $response->msg) . PHP_EOL
					. to_string($options)
					, logger::ERROR
				);
				$response->errors[] = 'Mandatory vars error';
				return $response;
			}
			// Old code heritage control
			if (is_array($section_id)) {
				if(SHOW_DEBUG===true) {
					dump($section_id, ' $section_id ++ '.to_string());
				}
				$response->result	= false;
				$response->msg[]	= 'Error Processing Request. Type array is not accepted to update_record anymore. Please use integer as section_id';
				debug_log(__METHOD__
					.'  ' . implode(', ', $response->msg)
					, logger::ERROR
				);
				$response->errors[] = 'section_id is an array. Expected integer';
				return $response;
			}

		// cache
			static $ar_resolved_static = [];
			static $ar_unconfigured_diffusion_section;
			// resolved_static_key
			$resolved_static_key = $section_tipo . '_' . $section_id;
			// Record already resolved check
			if (true===in_array($resolved_static_key, $ar_resolved_static)) {
				// response
				$response->result	= true;
				$response->msg[]	= 'Skipped record already updated. resolved_static_key: '.$resolved_static_key;
				debug_log(__METHOD__
					. ' '. implode(', ', $response->msg)
					, logger::WARNING
				);
				return $response;
			}

		// table info
			$diffusion_element_tables_map = diffusion_sql::get_diffusion_element_tables_map( $diffusion_element_tipo );
			if (!property_exists($diffusion_element_tables_map, $section_tipo)) {
				$label = ontology_node::get_termino_by_tipo($section_tipo, DEDALO_DATA_LANG);

				$response->code		= 2;
				$response->result	= false;
				$response->msg[]	= "WARNING ON UPDATE RECORD[2] section_id: $section_id - section_tipo: $section_tipo - diffusion_element_tipo: $diffusion_element_tipo.".PHP_EOL
				." Undefined section_tipo $section_tipo var in diffusion_element_tables_map. ".PHP_EOL
				." PROBABLY THE TARGET TABLE FOR $section_tipo ($label) DO NOT EXISTS IN SQL. ".PHP_EOL
				." If you want to resolve this reference, create a diffusion table for this data ($section_tipo) or check the MYSQL schema for problems with tables creation.";
				debug_log(__METHOD__
					. " " . implode(', ', $response->msg) .PHP_EOL
					. ' The property "'.$section_tipo.'" do not exists in the object diffusion_element_tables_map ' .PHP_EOL
					.' Ignored update_record request. options:' .PHP_EOL
					. json_encode($options, JSON_PRETTY_PRINT)
					, logger::WARNING
				);
				return $response;
			}
			$table_map			= $diffusion_element_tables_map->{$section_tipo};
			$table_name			= $table_map->name;
			$table_tipo			= $table_map->table;
			$table_properties	= $table_map->properties;
			$database_name		= $table_map->database_name;
			$database_tipo		= $table_map->database_tipo;
			$table_from_alias	= $table_map->from_alias;

		// database_name . Resolve database_tipo in current diffusion map. Like 'web_aup'
			// if (isset(self::$database_name)) {
			// 	$database_name = self::$database_name;
			// 	$database_tipo = self::$database_tipo;
			// }else{
			// 	# DIFFUSION ELEMENT
			// 	$diffusion_element	= self::get_diffusion_element_from_element_tipo($diffusion_element_tipo);
			// 	$database_name		= $diffusion_element->database_name;
			// 	if (empty($database_name)) {
			// 		throw new Exception("Error Processing Request. database_name not defined", 1);
			// 	}
			// 	self::$database_name = $database_name; // Set static class var

			// 	$database_tipo = $diffusion_element->database_tipo;
			// 	self::$database_tipo = $database_tipo; // Set static class var
			// }

		// custom diffusion processor (Defined in properties)
			if (isset($table_properties->custom_diffusion)) {
				$function_name	= $table_properties->custom_diffusion;
				$custom_options	= clone $options;
					$custom_options->database_name		= $database_name;
					$custom_options->table_name			= $table_name;
					$custom_options->table_properties	= $table_properties;
				call_user_func($function_name, $custom_options);

				// saves publication data (moved temporarily)
					diffusion::update_publication_data($section_tipo, $section_id);

				$response->result 	= true;
				$response->msg[]	= 'Processing with '.$function_name;

				return $response;
			}

		// direct record save

			// diffusion_section. Resolve diffusion section from section tipo
				if (in_array($section_tipo, (array)$ar_unconfigured_diffusion_section)) {
					$response->result	= false;
					$response->msg[]	= 'unconfigured_diffusion_section';
					debug_log(__METHOD__
						." Error[1]: misconfigured diffusion section for section_tipo: ".to_string($section_tipo)
						, logger::ERROR
					);
					$response->errors[] = '[1] misconfigured diffusion section '.to_string($section_tipo);
					return $response;
				}
				$diffusion_section = $table_tipo;
				if(empty($diffusion_section)) {
					if(SHOW_DEBUG===true) {
						$section_name = ontology_node::get_termino_by_tipo($section_tipo, DEDALO_STRUCTURE_LANG, true, false);
						// throw new Exception("Error Processing Request. diffusion_section not found in correspondence with section_tipo: $section_tipo . Nothing is updated", 1);
						// echo "<hr> DEBUG update_record: Omitted update section <b>'$section_name'</b>. Optional diffusion_section not found in correspondence with section_tipo: $section_tipo [$section_id]<br>";
						$msg = " Omitted update section '$section_name'. Optional diffusion_section not found in correspondence with section_tipo: $section_tipo [$section_id] ";
						$response->msg[] = $msg;
						debug_log(__METHOD__
							. " " . implode(', ', $response->msg)
							, logger::DEBUG
						);
					}
					$ar_unconfigured_diffusion_section[] = $section_tipo;

					$response->msg[] = " [2] misconfigured diffusion section for section_tipo: $section_tipo";
					debug_log(__METHOD__
						." Error[2]: misconfigured diffusion section for section_tipo: ".to_string($section_tipo)
						, logger::ERROR
					);
					$response->errors[] = '[2] misconfigured diffusion section '.to_string($section_tipo);
					return $response;
				}

			// table fields reference only	(not needed because tables are already created)
				#self::build_table_columns($diffusion_section, $database_name);

			// table_data . Calculate table_data for current array of section_id (all langs)
				$ar_result = array();
				foreach ((array)$section_id as $current_section_id) {
					$ar_result[] = array($section_tipo => $current_section_id);
				}

			// COLUMNS_DATA. Calculate, process and store in a class var all columns data for current diffusion_section
				$cd_options = new stdClass();
					$cd_options->table_tipo 			 	= $table_tipo; // same as diffusion_section
					$cd_options->ar_section_id_portal 	 	= array();
					$cd_options->database_name 		 	 	= $database_name;
					$cd_options->table_name 		 	 	= $table_name;
					$cd_options->table_properties 		 	= $table_properties;
					$cd_options->table_from_alias 		 	= $table_from_alias;
					$cd_options->ar_result 			 	 	= $ar_result;
					$cd_options->diffusion_element_tipo  	= $diffusion_element_tipo;
					$cd_options->component_publication_tipo = $component_publication_tipo;
				$ar_field_data = self::build_table_columns_data( $cd_options ); // Trigger resolve

			// SAVE RECORD . Insert MYSQL record (array) deleting before old data
				if(!empty($ar_field_data)) {

					$save_options = new stdClass();
						$save_options->record_data						= $ar_field_data;
						$save_options->record_data['diffusion_section']	= $diffusion_section;
						$save_options->diffusion_element_tipo			= $diffusion_element_tipo;
						$save_options->section_tipo						= $section_tipo;

						// engine switch
						$ontology_node			= new ontology_node($database_tipo);
						$database_properties	= $ontology_node->get_propiedades(true);
						if (isset($database_properties->engine)) {
							$save_options->record_data['engine'] = $database_properties->engine; // If defined in database properties
						}

					// save
						// save MYSQL record, deleting previous record
						$save_response = diffusion_mysql::save_record($save_options);
						if ($save_response->result===false) {
							debug_log(__METHOD__
								.' Error: save response error ' . PHP_EOL
								.' save_response: ' . json_encode($save_response, JSON_PRETTY_PRINT)
								, logger::ERROR
							);
							$response->errors[] = 'failed save record: '. $save_response->msg ?? 'Unknown error';
						}

					// global_search (LEGACY ONLY) (disabled 31-03-2025)
						// if (isset($table_properties->global_search_map)) {

							// $gs_options = new stdClass();
							// 	$gs_options->global_search_map		= $table_properties->global_search_map;
							// 	$gs_options->diffusion_section		= $diffusion_section;
							// 	$gs_options->section_tipo			= $section_tipo;
							// 	$gs_options->diffusion_element_tipo	= $diffusion_element_tipo;
							// 	$gs_options->ar_field_data			= $ar_field_data;
							// self::save_global_search_data($gs_options);

						// }//end if (isset($table_properties->global_search_map))

					// save_global_table_data
						if (!isset($table_properties->global_table_maps)) {

							// try from real
							$ontology_node		= new ontology_node($table_tipo);
							$target_properties	= $ontology_node->get_propiedades(true);
							if (is_object($target_properties) && isset($target_properties->global_table_maps)) {
								// overwrite global_table_maps
								$table_properties->global_table_maps = $target_properties->global_table_maps;
							}
						}
						if (isset($table_properties->global_table_maps)) {

							foreach ($table_properties->global_table_maps as $current_global_table_map) {
								self::save_global_table_data((object)[
									'global_table_map'			=> $current_global_table_map,
									'diffusion_element_tipo'	=> $diffusion_element_tipo,
									'section_tipo'				=> $section_tipo,
									'database_name'				=> $database_name,
									'ar_field_data'				=> $ar_field_data
								]);
							}
						}

					// saves publication data (moved temporarily)
						if ($save_response->result===true) {
							diffusion::update_publication_data($section_tipo, $section_id);
						}
				}//end if(!empty($ar_field_data))

			// cache . update
				$ar_resolved_static[] = $resolved_static_key;

		// thesaurus parent auto publication. If current record is from a thesaurus section,
			// recursive parents are published too (20-05-2020) .
			// Allow publish only used terms and parents path for large thesaurus sections like toponymy
			if (!empty($ar_field_data['ar_fields'])) {

				$current_record_data	= reset($ar_field_data['ar_fields']);
				$first_lang_data		= reset($current_record_data);
				$found_component_relation_parent = array_find($first_lang_data ?? [], function($item){
					return $item['related_model']==='component_relation_parent';
				});
				if (!empty($found_component_relation_parent)) {
					// this section is thesaurus
					// locate recursive parents
					$parents_recursive = component_relation_parent::get_parents_recursive(
						$section_id,
						$section_tipo,
						// (object)[
						// 	'skip_root' => true,
						// 	'search_in_main_hierarchy' => true
						// ]
					);
					foreach ($parents_recursive as $parents_recursive_locator) {

						// launch parent update record
						$this->update_record((object)[
							'section_tipo'				=> $parents_recursive_locator->section_tipo,
							'section_id'				=> $parents_recursive_locator->section_id,
							'diffusion_element_tipo'	=> $diffusion_element_tipo
						]);
					}
				}
			}//end if (!empty($ar_field_data['ar_fields']))

		// references. Resolve references until reach max_recursions level
			$max_recursions = diffusion::get_resolve_levels();
			// subtract one for key coherence (recursion level and max_recursions)
			$max_recursions--;

			if ($recursion_level >= $max_recursions) {
				// Avoid infinite loops like Manolo's item to all references
				$resolve_references = false;
				debug_log(__METHOD__
					." (!) Stopped recursive resolve_references on level '$recursion_level' ".to_string($options)." ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ "
					, logger::WARNING
				);
			}
			if ($resolve_references===true) {

				// ar_section_components . Get section components (portals and autocompletes) and look for references
				// component_relation_common::get_components_with_relations(); # Using model name
					$ar_components_with_references = [
						'component_portal',
						'component_autocomplete',
						'component_autocomplete_hi',
						'component_select'
					];
					$ar_section_components = section::get_ar_children_tipo_by_model_name_in_section(
						$section_tipo,
						$ar_components_with_references,
						true, // bool from_cache
						true, // bool resolve_virtual
						true, // recursive
						true // search_exact
					);
					sort($ar_section_components, SORT_NATURAL);	// always sort components_with_references

				// Iterate founded components with relations. get references from components dato
					$group_by_section_tipo	= [];
					$skip_tipos				= isset($skip_tipos) ? $skip_tipos : [];
					foreach ($ar_section_components as $current_component_tipo) {

						// skip_tipos defined in $skip_tipos
							if (in_array($current_component_tipo, $skip_tipos)) {
								continue;
							}

						// model
							$model_name = ontology_node::get_modelo_name_by_tipo($current_component_tipo, true);
							if (!in_array($model_name, $ar_components_with_references)) {
								continue;	// Skip component IMPORTANT to skip component_autocomplete_ts
							}

						// skip resolve components with dato external (portals)
							$ontology_node					= new ontology_node($current_component_tipo);
							$current_component_properties	= $ontology_node->get_propiedades(true);
							if (isset($current_component_properties->source->mode) && $current_component_properties->source->mode==='external') {
								debug_log(__METHOD__
									." Skipped component with external source mode" . PHP_EOL
									. 'current_component_tipo: ' .to_string($current_component_tipo)
									, logger::WARNING
								);
								// continue; // (!) commented 06-11-2023 because MIB Catalog numisdata665 needs to follow external portal numisdata965 Orderer coins
							}

						// component's lang
							$current_lang = ontology_node::get_lang_by_tipo($current_component_tipo, true);

						// iterate array of section_id (from options) and group_by_section_tipo
							foreach ((array)$section_id as $current_section_id) {

								$current_component = component_common::get_instance(
									$model_name,
									$current_component_tipo,
									$current_section_id,
									'list',
									$current_lang,
									$section_tipo,
									false
								);

								$current_dato = $current_component->get_dato();
								if (!empty($current_dato)) {
									foreach ((array)$current_dato as $current_locator) {

										if ( !isset($group_by_section_tipo[$current_locator->section_tipo]) ||
											 !in_array($current_locator->section_id, $group_by_section_tipo[$current_locator->section_tipo])
											 ) { // If not exists in group_by_section_tipo, add

											// resolved_static_key
											$current_resolved_static_key = $current_locator->section_tipo . '_' . $current_locator->section_id;
											if(!in_array($current_resolved_static_key, $ar_resolved_static)) {
												$group_by_section_tipo[$current_locator->section_tipo][] = $current_locator->section_id;
											}
										}
									}
								}
							}//end foreach ((array)$section_id as $current_section_id)

					}//end foreach ($ar_section_components as $current_component_tipo)

				// debug. show levels resolution calls
					if(SHOW_DEBUG===true) {
						dump($group_by_section_tipo, ' references to resolve (group_by_section_tipo) ++ '.to_string($resolved_static_key));
					}

				// resolve references recursion. Look inside portals of portals, etc..
					$next_recursion_level = ($recursion_level + 1);

					// iterate previous created groups by section tipo
						foreach ($group_by_section_tipo as $current_section_tipo => $current_ar_section_id) {

							// skip empty values
								if (empty($current_ar_section_id)) {
									continue;
								}

							// recursion level reset
								// $current_recursion_level = 1;
								if(SHOW_DEBUG===true) {
									$label = ontology_node::get_termino_by_tipo($current_section_tipo);
									debug_log(__METHOD__
										. " current recursion_level: '$recursion_level' of $max_recursions [$current_section_tipo] "
										. " label: '$label' - current_ar_section_id: ".to_string($current_ar_section_id)
										." ============================================================================================== "
										, logger::DEBUG
									);
								}

							foreach ((array)$current_ar_section_id as $current_section_id) {

								// Recursion with all references update_record
									$this->update_record( (object)[
										'section_tipo'				=> $current_section_tipo,
										'section_id'				=> $current_section_id,
										'diffusion_element_tipo'	=> $diffusion_element_tipo,
										'recursion_level'			=> $next_recursion_level,
										'skip_tipos'				=> $skip_tipos,
										'resolve_references'		=> true
									]);
							}
						}//end foreach ($group_by_section_tipo as $current_section_tipo => $current_ar_section_id)
			}//end if ($resolve_references===true)

		// debug
			if(SHOW_DEBUG===true) {
				// $time_complete = exec_time_unit($start_time,'ms');
				// debug_log(__METHOD__
				// 	. " /////////////////////////////// update_record complete "
				// 	. " time: " . $time_complete .' ms'. PHP_EOL
				// 	. " resolved_static_key: " . $resolved_static_key . PHP_EOL
				// 	. " max_recursions: " . $max_recursions . PHP_EOL
				// 	. " recursion_level: " . $recursion_level . PHP_EOL
				// 	, logger::ERROR
				// );
			}

		// response
			$response->result	= true;
			$response->msg[]	= "Record updated section_id: $section_id. Number of references: ".count($ar_resolved_static).' in levels: '.($max_recursions + 1);


		return $response;
	}//end update_record



	/**
	* GET_DB_SCHEMA
	* Simply Exec self::build_table_columns for every table in structure
	* @param string $database_tipo like 'dd521'
	*/
		// public function get_db_schema($database_tipo) {

		// 	# DEFAULT CASE
		// 	# table in first level
		// 	$ar_diffusion_table = ontology_node::get_ar_tipo_by_model_name_and_relation($database_tipo, $model_name=array('table'), $relation_type='children', $search_exact=true);

		// 		# Recorremos hijos de la primera/as tabla/s
		// 		foreach ($ar_diffusion_table as $key => $current_table_tipo) {

		// 			if(SHOW_DEBUG===true) {

		// 				# Table verify
		// 				$model_name = ontology_node::get_modelo_name_by_tipo($current_table_tipo,true);
		// 				if ($model_name==='section') {

		// 					$ar_section = ontology_node::get_ar_tipo_by_model_name_and_relation($current_table_tipo, 'section', 'termino_relacionado', true);
		// 					#dump($ar_section,'ar_section : '.$database_tipo);

		// 					if(empty($ar_section)) {
		// 						debug_log(__METHOD__." Current diffusion table ($current_table_tipo) is excluded from diffusion data because don't have related 'section'. Please fix this ASAP ".to_string(), logger::WARNING);
		// 						continue;
		// 					}
		// 				}
		// 			}
		// 			# Exec build_table_columns for each table
		// 			$result = self::build_table_columns($current_table_tipo, $database_tipo);
		// 			#dump($result, ' result ++ '.to_string());
		// 		}

		// 	# THESAURUS CASE
		// 	# table_thesaurus in first level
		// 	$ar_diffusion_table_thesaurus = ontology_node::get_ar_tipo_by_model_name_and_relation($database_tipo, $model_name='table_thesaurus', $relation_type='children', true);

		// 		# Recorremos hijos de la primera/as tabla/s
		// 		foreach ($ar_diffusion_table_thesaurus as $current_table_tipo) {

		// 			$ontology_node = new ontology_node($current_table_tipo);
		// 			$properties  = json_decode( $ontology_node->get_properties() );
		// 				#dump($properties, ' properties ++ '.to_string());
		// 			if (isset($properties->ar_tables)) {
		// 				$options = new stdClass();
		// 					$options->ar_tables  	= $properties->ar_tables;
		// 					$options->table_name 	= ontology_node::get_termino_by_tipo($current_table_tipo, DEDALO_STRUCTURE_LANG, true, false);
		// 					$options->database_name = ontology_node::get_termino_by_tipo($database_tipo, DEDALO_STRUCTURE_LANG, true, false);

		// 				$thesaurus_columns  = self::build_thesaurus_columns( $options );
		// 				self::$ar_table[$options->database_name][$current_table_tipo] = $thesaurus_columns;
		// 			}
		// 		}
		// 	#dump(self::$ar_table, 'self::$ar_table ++ '.to_string()); die();
		// }//end get_db_schema



	/**
	* BUILD_TABLE_COLUMNS (RECURSIVE)
	* Build the fields to add in the table to generate
	* Assign the result recursively to the static variable self::$ar_table
	* @param object $options
	* @return array $ar_table_data
	*/
	public static function build_table_columns(object $options) : array {

		// options
			$table_tipo			= $options->table_tipo ?? null;
			$table_name			= $options->table_name ?? null;
			$database_name		= $options->database_name ?? null;
			$ar_children_tipo	= $options->ar_children_tipo ?? null;
			$table_from_alias	= $options->table_from_alias ?? null;

		// ar_table_data
			$ar_table_data = array();
			// add
			$ar_table_data['database_name']	= $database_name;	//self::$database_name;
			$ar_table_data['table_name']	= $table_name;		//ontology_node::get_termino_by_tipo($table_tipo, DEDALO_STRUCTURE_LANG, true, false);
			$ar_table_data['ar_fields']		= array();

		// Table properties SCHEMA optional
			// $ontology_node 	  = new ontology_node($table_tipo);
			// $str_properties  = $ontology_node->get_properties();
			// if($properties = json_decode($str_properties)) {
			// 	if (isset($properties->schema)) {
			// 		self::save_table_schema(  $database_name, $table_name, $properties->schema );
			// 	}
			// }

		// section_id column. Mandatory column
			$options = new stdClass();
				$options->typology	= 'section_id';
				$options->tipo		= null;
			$ar_table_data['ar_fields'][] = self::create_field( $options );

		// lang column. Mandatory column
			$options = new stdClass();
				$options->typology	= 'lang';
				$options->tipo		= null;
			$ar_table_data['ar_fields'][] = self::create_field( $options );

		// other fields . Normal columns
			$ar_table_children = $ar_children_tipo;
			if (empty($ar_table_children)) {
				$ontology_node		= new ontology_node($table_tipo);
				$ar_table_children	= $ontology_node->get_ar_children_of_this();

				// Add from table alias too
				if (!empty($table_from_alias)) {

					$ontology_node_alias			= new ontology_node($table_from_alias);
					$ar_table_alias_children	= $ontology_node_alias->get_ar_children_of_this();

					// merge all
					$ar_table_children = self::replace_fields(
						$ar_table_children,
						$ar_table_alias_children
					);
				}
			}


		foreach ($ar_table_children as $curent_children_tipo) {

			$model_name = ontology_node::get_modelo_name_by_tipo($curent_children_tipo,true);
			if ($model_name==='box elements') {
				continue;
			}

			switch ($model_name) {

				// case 'table': // ESTO SE USA ????????
					// 	#
					// 	# TABLE
					// 	$options = new stdClass();
					// 		$options->typology 	= 'relation';
					// 		$options->tipo 		= $curent_children_tipo;
					// 	$ar_table_data['ar_fields'][] = self::create_field( $options );

					// 	# Recursion (portal)
					// 	$table_columns_options = new stdClass();
					// 		$table_columns_options->table_tipo 	  	 = $curent_children_tipo;
					// 		$table_columns_options->database_name 	 = $database_name;
					// 		$table_columns_options->table_from_alias = $table_from_alias;
					// 	self::build_table_columns($table_columns_options);
					// 	break;

				default:
					// field
					$ontology_node	= new ontology_node($curent_children_tipo);
					$properties		= $ontology_node->get_propiedades(true);

					switch (true) {

						case ( is_object($properties) && property_exists($properties, 'exclude_column') && $properties->exclude_column===true ):
							# Exclude this column of table
							break;

						case ( is_object($properties) && property_exists($properties, 'ts_map') ):
							# CASE TS_MAP IS DEFINED
							$options = new stdClass();
								$options->ts_map 				= $properties->ts_map;
								if(property_exists($properties, 'ts_map_prefix')){
										$options->ts_map_prefix	= $properties->ts_map_prefix;
									}else{
										$options->ts_map_prefix	= false;
									}
								$options->curent_children_tipo  = $curent_children_tipo;
								$options->request  				= 'columns';

							// (!) Removed way.
								// $ar_dedalo_countries = (array)self::get_ar_dedalo_countries($options);
								// foreach ($ar_dedalo_countries as $current_dedalo_country) {
								// 	$ar_column_data=array();
								// 	$ar_column_data['field_name']  		= (string)$current_dedalo_country;
								// 	$ar_column_data['field_type']  		= (string)'field_text';
								// 	$ar_column_data['field_coment'] 	= (string)'Autocreated column for country compatibility';
								// 	$ar_column_data['field_options'] 	= (string)' ';
								// 	$ar_table_data['ar_fields'][] 		= $ar_column_data;	# Add column
								// }
							break;

						default:
							# DEFAULT CASE
							$options = new stdClass();
								$options->typology 	= 'default';
								$options->tipo 		= $curent_children_tipo;
							$element = self::create_field( $options );

							$name = ontology_node::get_termino_by_tipo($curent_children_tipo, DEDALO_STRUCTURE_LANG, true, false);
							if ($name==='section_id') {
								// overwrite default auto-created int column section_id
								$found = array_find($ar_table_data['ar_fields'], function($item){
									return $item['field_name']==='section_id';
								});
								if ($found) {
									foreach ($ar_table_data['ar_fields'] as $c_key => $c_value) {
										if ($c_value['field_name']==='section_id') {
											$ar_table_data['ar_fields'][$c_key] = $element;
										}
									}
								}
							}else{
								$ar_table_data['ar_fields'][] = $element;
							}
							break;
					}//end switch (true)
					break;
			}//end switch model_name
		}//end foreach ($ar_table_children as $curent_children_tipo)


		return $ar_table_data;
	}//end build_table_columns



	/**
	* REPLACE_FIELDS
	* @param array $ar_table_children
	* @param array $ar_table_alias_children
	* @return array $ar_fields
	*/
	public static function replace_fields(array $ar_table_children, array $ar_table_alias_children) : array {

		$ar_fields = [];

		// add real table children
			foreach ($ar_table_children as $child_tipo) {
				$ar_fields[] = $child_tipo;
			}

		// add / replace table_alias_children
			foreach ($ar_table_alias_children as $child_tipo) {

				$related_tipo = false;

				$ar_related = ontology_node::get_ar_terminos_relacionados(
					$child_tipo,
					true, // bool cache
					true // bool simple
				);
				foreach ($ar_related as $current_related_tipo) {
					$model = ontology_node::get_modelo_name_by_tipo($current_related_tipo,true);
					if (strpos($model, 'field_')===0) {
						$related_tipo = $current_related_tipo;
						break;
					}
				}

				if ($related_tipo===false) {

					// add element normally
					$ar_fields[] = $child_tipo;

				}else{

					// related fields case
					$_key = array_search($related_tipo, $ar_fields);
					if ($_key!==false) {

						// replace original element
						$ar_fields[$_key] = $child_tipo;

					}else{

						// add element
						$ar_fields[] = $child_tipo;
					}
				}
			}


		return array_values($ar_fields);
	}//end replace_fields



	/**
	* CREATE_FIELD
	* Build field array data from request parameters
	* @param object $options
	* {
	* 	tipo : "numisdata776",
	* 	typology: "default"
	* }
	* @return array $ar_field_data
	* Assoc array field format:
	* 	$ar_data['field_name'];
	* 	$ar_data['field_type'];
	* 	$ar_data['field_coment'];
	* 	$ar_data['field_options'];
	*/
	public static function create_field(object $options) : array {

		// options
			$tipo		= $options->tipo ?? null;
			$typology	= $options->typology ?? null;

		$ar_field_data = array();

		switch ($typology) {

			case 'section_id':
				$ar_field_data['field_name']	= 'section_id';
				$ar_field_data['field_type']	= 'field_int';
				$ar_field_data['field_coment']	= 'Field created automatically to save section_id (no match in Ontology)';
				$ar_field_data['field_options']	= 12;
				break;

			case 'lang':
				$ar_field_data['field_name']	= 'lang';
				$ar_field_data['field_type']	= 'field_varchar';
				$ar_field_data['field_coment']	= "Field created automatically to save the language (no correspondence in Ontology)";
				$ar_field_data['field_options']	= 8;
				break;

			// case 'relation': (NOT USED ANYMORE. OLD TABLE COLUMN LINKS BETWEEN TABLES)
				// 	$ar_field_data['field_name'] 	= ontology_node::get_termino_by_tipo($options->tipo, DEDALO_STRUCTURE_LANG, true, false);
				// 	$ar_field_data['field_type'] 	= 'field_text';
				// 	$termino_relacionado 			= ontology_node::get_ar_terminos_relacionados($options->tipo, $cache=true, $simple=true)[0];
				// 	$ar_field_data['field_coment'] 	= ontology_node::get_termino_by_tipo($termino_relacionado)." - $termino_relacionado";
				// 	$ar_field_data['field_options'] = null;
				// 	break;

			default:
				$ar_field_data['field_name']	= ontology_node::get_termino_by_tipo($tipo, DEDALO_STRUCTURE_LANG, true, false);
				$ar_field_data['field_type']	= ontology_node::get_modelo_name_by_tipo($tipo,true);

				$related_component_tipo			= self::get_field_related_component($tipo);
				$ar_field_data['field_coment']	= !empty($related_component_tipo)
					? ontology_node::get_termino_by_tipo($related_component_tipo)." - $related_component_tipo"
					: $ar_field_data['field_name'];

				$ontology_node	= new ontology_node($tipo);
				$properties		= $ontology_node->get_propiedades(true);

				$diffusion_model_name = ontology_node::get_modelo_name_by_tipo($tipo,true);
				switch ($diffusion_model_name) {
					case 'field_enum':
						$properties_enum = $properties->enum ?? [];
						if (empty($properties_enum)) {
							// throw new Exception("Error Processing Request. Field enum $tipo is misconfigured. Please, set property 'enum' to current field", 1);
							debug_log(__METHOD__
								. " ERROR: Field enum '$tipo' is misconfigured. Please, set property 'enum' to current field " . PHP_EOL
								. ' tipo: ' . to_string($tipo) . PHP_EOL
								. ' properties: ' . to_string($properties)
								, logger::ERROR
							);
						}
						$ar_enum_options = array();
						foreach ($properties_enum as $current_enum_value) {
							$ar_enum_options[] = '"'.$current_enum_value.'"';
						}
						$ar_field_data['field_options'] = (string)implode(',', $ar_enum_options); // Format: "enum":{"1":"si", "2":"no"}
						break;
					case 'field_varchar':
						if(isset($properties->varchar)) {
							$field_options = $properties->varchar; // Default 255
						}else{
							$field_options = '255';
						}
						$ar_field_data['field_options'] = $field_options; // Format: "varchar":8
						break;
					case 'field_int':
						if(isset($properties->length)) {
							$field_options = $properties->length;
						}else{
							$field_options = 8; # Default
						}
						$ar_field_data['field_options']	= $field_options;
						break;
					case 'decimal':
						if(isset($properties->precision) && isset($properties->scale)) {
							$field_options = $properties->precision .','. $properties->scale;
						}else{
							$field_options = '10,0'; # Default
						}
						$ar_field_data['field_options']	= $field_options;
						break;
					default:
						$ar_field_data['field_options'] = (string)'';
				}
				break;
		}//end switch ($typology)

		// debug
			if (empty($ar_field_data['field_type'])) {
				debug_log(__METHOD__
					. ' WARNING: EMPTY ar_field_data: $ar_field_data[field_type] ' . PHP_EOL
					. ' tipo: ' . $tipo . PHP_EOL
					. 'model: ' . ontology_node::get_modelo_name_by_tipo($tipo,true)
					, logger::WARNING
				);
			}


		return $ar_field_data;
	}//end create_field



	/**
	* BUILD_TABLE_COLUMNS_DATA (RECURSIVE)
	* Builds the data to be entered into the fields of the generated table and sets it to the static variable self::$ar_table_data
	* @see $his->get_db_data
	*
	* @param object $request_options
	* @return array|null $ar_field_data
	*/
	public static function build_table_columns_data(object $request_options) : ?array {
		$start_time = start_time();

		// options
			$options = new stdClass();
				$options->table_tipo					= null;
				$options->ar_section_id_portal			= array();
				$options->database_name					= null;
				$options->table_name					= null;
				$options->table_properties				= null;
				$options->table_from_alias				= null;
				$options->ar_result						= false;
				$options->diffusion_element_tipo		= null;
				$options->ar_children_tipo				= null;
				$options->component_publication_tipo	= null;
				$options->build_mode					= 'default';
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

				foreach ($options as $var_name => $value) {
					$$var_name = $value; // move options var to self var
				}
		// debug
			if(SHOW_DEBUG===true) {
				#dump($options, ' options ++ '.to_string());
				#dump($table_tipo, ' table_tipo ++ ');
				#dump($ar_section_id_portal, ' ar_section_id_portal ++ ');
				#dump($database_name, ' database_name ++ ');
				#dump($ar_result, ' ar_result ++ ');
				#dump($diffusion_element_tipo, " diffusion_element_tipo ++ (".ontology_node::get_termino_by_tipo($table_tipo).")");
				  #dump($ar_section_id_portal,"ar_section_id_portal - table_tipo: $table_tipo (".ontology_node::get_termino_by_tipo($table_tipo).") - database_name: $database_name (".ontology_node::get_termino_by_tipo($database_name).") "); #die();
				#exit();
			}

		// set_time_limit ( 259200 );  // 3 days

		# AR_RESULT . Get all matrix records in current table / portal. When portal is request, records of portal are in var '$ar_section_id_portal'
		# NOTE : Because we need section_id and section_tipo of every item (multi-target portals), format $ar_result contains this data always
			if ($ar_result===false) {

				// SECTION try . Target section is a related term of current diffusion pointer. Normally is section, but can be a portal
					$pointer_type		='section';
					$ar_section_tipo	= ontology_node::get_ar_tipo_by_model_name_and_relation(
						$table_tipo,
						'section',
						'termino_relacionado'
					);
					if (!isset($ar_section_tipo[0])) {
						# PORTAL try
						$pointer_type		= 'portal';
						$ar_section_tipo	= ontology_node::get_ar_tipo_by_model_name_and_relation(
							$table_tipo,
							'component_portal',
							'termino_relacionado'
						);
					}
					if(!isset($ar_section_tipo[0])) {
						debug_log(__METHOD__
							." Error Processing Request, related section_tipo not found for $table_tipo. Please define valid related term (section or portal) for pointer table_tipo:$table_tipo (Ignored element $table_tipo!)"
							, logger::ERROR
						);
						return null;
					}

				// SECTION_TIPO . Set section tipo
					$section_tipo = $ar_section_tipo[0];

				$ar_result = array();
				if(!empty($ar_section_id_portal)) {
					# Records here are the portal dato locators
					# $ar_result	= $ar_section_id_portal;
					foreach ($ar_section_id_portal as $key => $object) {
						// Override section_tipo for each element
						$ar_result[] = array($object->section_tipo => $object->section_id);
					}
				}else{
					// We look for ALL records in this section
					$result = section::get_resource_all_section_records_unfiltered($section_tipo);
					while ($rows = pg_fetch_assoc($result)) {
						$current_id = $rows['section_id'];
						// Use general section_tipo for each element
						$ar_result[] = array($section_tipo => $current_id);
					}
				}
			}
			#dump($ar_section_id_portal, ' ar_section_id_portal ++ '.to_string());
			#dump($ar_result," ar_result section_tipo:$section_tipo - table_tipo:$table_tipo - ar_section_id_portal:".to_string($ar_section_id_portal)); die();

		# LANGS . From config
			$ar_all_project_langs = defined('DEDALO_DIFFUSION_LANGS')
				? DEDALO_DIFFUSION_LANGS
				: DEDALO_PROJECTS_DEFAULT_LANGS;


		# AR_FIELD_DATA
			$ar_field_data = array();
			$ar_field_data['database_name']	= (string)$database_name;
			$ar_field_data['table_name'] 	= (string)$table_name;
			#$ar_field_data['ar_fields'] 	= array();

		#
		# TABLE CHILDREN (FIELDS)
			$ar_table_children = $ar_children_tipo;
			if (empty($ar_table_children)) {
				$ontology_node 	   = new ontology_node($table_tipo);
				$ar_table_children = $ontology_node->get_ar_children_of_this();

				# Add from table alias too
				if (!empty($table_from_alias)) {
					$ontology_node_alias			= new ontology_node($table_from_alias);
					$ar_table_alias_children	= (array)$ontology_node_alias->get_ar_children_of_this();

					# Merge all
					$ar_table_children = self::replace_fields(
						$ar_table_children,
						$ar_table_alias_children
					);
				}
			}

		#
		# COMPONENT PUBLICATION - CHECK (once)
			if(empty($component_publication_tipo)) {
				$component_publication_tipo = diffusion::get_component_publication_tipo($ar_table_children);
				if (empty($component_publication_tipo)) {

					$ar_section_tipo = ontology_node::get_ar_tipo_by_model_name_and_relation(
						$table_tipo,
						'section',
						'termino_relacionado',
						true
					);
					debug_log(__METHOD__
						." Error on find component_publication_tipo. Not found component_publication in this section. Ignored! " . PHP_EOL
						.' table_tipo: '		. $table_tipo . PHP_EOL
						.' table_name: '		. ($ar_field_data['table_name'] ?? '') . PHP_EOL
						.' section_tipo: '		. ($ar_section_tipo[0] ?? 'unknown') . PHP_EOL
						.' ar_table_children: ' . json_encode($ar_table_children, JSON_PRETTY_PRINT)
						, logger::WARNING
					);

					return null;
				}
			}


		// resolved records. Store resolved records to avoid infinite loops
			static $columns_data_resolved_records = [];

		// publication_state_check
			$skip_publication_state_check = isset($_SESSION['dedalo']['config']['skip_publication_state_check'])
				? (int)$_SESSION['dedalo']['config']['skip_publication_state_check']
				: 0;

		// Records iteration
		$i					= 0;
		$ar_data			= array();
		$ar_portal_records	= array();
		if(!empty($ar_result)) foreach ((array)$ar_result as $records) foreach ($records as $section_tipo => $current_section_id) {

			// resolved_records_key
				$columns_data_resolved_records_key = $section_tipo.'-'.$current_section_id.'-'.$build_mode;
				if (true===in_array($columns_data_resolved_records_key, $columns_data_resolved_records)) {
					debug_log(__METHOD__
						." SKIPPED RECORD [$columns_data_resolved_records_key]. ALREADY RESOLVED. "
						, logger::WARNING
					);
					continue;
				}

			// section diffusion info - check. On finish record update, update current section diffusion_info
				$section = section::get_instance(
					$current_section_id,
					$section_tipo,
					'list',
					false // cache force to false
				);
				$diffusion_info	= $section->get_diffusion_info();
				if ( isset($diffusion_info->{$diffusion_element_tipo}) ) {
					if($skip_publication_state_check===1) {
						// Nothing to do. (Configured from tool_administrator)
					}else{
						// resolved_records (set a resolved)
						$columns_data_resolved_records[] = $columns_data_resolved_records_key;

						debug_log(__METHOD__
							." Skipped current record [{$section_tipo}-{$current_section_id}]. Already published ($diffusion_element_tipo)."
							, logger::DEBUG
						);
						continue;
					}
				}

			// component publication - check (once)
				if (is_object($table_properties) && property_exists($table_properties,'check_publication_value') && $table_properties->check_publication_value===false) {
					// Skip check_publication_value. Always is publishable (5-2-2018)
					$to_publish = true;
				}else{
					$to_publish = diffusion_sql::check_publication_value((object)[
						'component_publication_tipo'	=> $component_publication_tipo,
						'section_id'					=> $current_section_id,
						'section_tipo'					=> $section_tipo,
						'database_name'					=> $database_name,
						'table_name'					=> $table_name,
						'diffusion_element_tipo'		=> $diffusion_element_tipo,
						'table_properties'				=> $table_properties
					]);
				}
				if ($to_publish===false) {
					// resolved_records (set as resolved)
					$columns_data_resolved_records[] = $columns_data_resolved_records_key;
					continue;
				}

			// langs iteration
				foreach ($ar_all_project_langs as $current_lang) {

					// section_id . Mandatory column . Add field section_id to table data
						// column add ###################################################
						$section_id_options = new stdClass();
							$section_id_options->typology				= 'section';
							$section_id_options->value					= $current_section_id;
							$section_id_options->diffusion_element_tipo	= $diffusion_element_tipo;
						$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = self::build_data_field( $section_id_options );

					// lang . mandatory column. add field lang to table data
						// column add ###################################################
						$lg_options = new stdClass();
							$lg_options->typology				= 'lang';
							$lg_options->value					= $current_lang;
							$lg_options->diffusion_element_tipo	= $diffusion_element_tipo;
						$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = self::build_data_field( $lg_options );

					// columns . normal table columns / fields
						// regular columns iterate ###################################################
						foreach ((array)$ar_table_children as $curent_children_tipo) {

							$start_time2=start_time();

							// model check
								$model_name = ontology_node::get_modelo_name_by_tipo($curent_children_tipo,true);
								if ($model_name==='box elements') {
									continue;
								}

							// properties
								$ontology_node	= new ontology_node($curent_children_tipo);
								$properties		= $ontology_node->get_propiedades(true);

							// switch discriminate by propiedades
								switch (true) {
									case ( is_object($properties) && property_exists($properties, 'exclude_column') && $properties->exclude_column===true ):
										// Exclude this column of table
										break;

									case ( is_object($properties) && property_exists($properties, 'ts_map') ):
										// ts_map_options
										$ts_map_options = new stdClass();
											$ts_map_options->ts_map					= $properties->ts_map;
											$ts_map_options->ts_map_prefix			= (property_exists($properties, 'ts_map_prefix'))
												? $properties->ts_map_prefix
												: false;
											$ts_map_options->curent_children_tipo	= $curent_children_tipo;
											$ts_map_options->request				= 'fields';
											$ts_map_options->parent					= $current_section_id;
											$ts_map_options->lang					= $current_lang;
										break;

									case ( is_object($properties) && property_exists($properties, 'table') ): // autocomplete column table
										// table name column
										// Usada para alojar el nombre de la tabla al que apunta el id del del dato del autocomplete actual (se guardan 3 columnas: name_id,name_table,name_label)
										$current_ar_field_data = array();
										$current_ar_field_data['field_name']	= ontology_node::get_termino_by_tipo($curent_children_tipo, DEDALO_STRUCTURE_LANG, true, false);
										$current_ar_field_data['field_value']	= $properties->table;

										# COLUMN ADD ###################################################
										$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = $current_ar_field_data;
										break;

									case ( is_object($properties) && property_exists($properties, 'merge_columns') ):

										$ar_value = [];
										foreach ($properties->merge_columns as $column_tipo) {
											$column_found = array_find($ar_field_data['ar_fields'][$current_section_id][$current_lang], function($item) use($column_tipo){
												return $item['tipo']===$column_tipo;
											});
											if ($column_found && !empty($column_found['field_value'])) {
												$current_value = $column_found['field_value'];
												$ar_value[] = is_string($current_value) || is_numeric($current_value)
													? $current_value
													: json_encode($current_value);
											}
										}
										$separator = isset($properties->separator)
											? $properties->separator
											: ' ';
										$value = implode($separator, $ar_value);
										$value = str_replace(['<br>',' | ','  '], $separator, $value);
										$value = strip_tags($value);

										$column = [];
										$column['field_name']		= ontology_node::get_termino_by_tipo($curent_children_tipo, DEDALO_STRUCTURE_LANG, true, false);
										$column['field_value']		= $value;
										$column['tipo']				= $curent_children_tipo;
										$column['related_model']	= null;

										$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = $column;
										break;

									default:
										// default case . direct field
										// COLUMN ADD ###################################################
										$default_options = new stdClass();
											$default_options->tipo						= $curent_children_tipo;
											$default_options->parent					= $current_section_id;
											$default_options->lang						= $current_lang;
											$default_options->section_tipo				= $section_tipo;
											$default_options->caler_id					= 3;
											$default_options->properties				= $properties;
											$default_options->diffusion_element_tipo	= $diffusion_element_tipo;
										$column = self::build_data_field( $default_options );

										// related text area case (set for indexations publish)
											if ($column['related_model']==='component_text_area') {

												$options_item = new stdClass();
													$options_item->component_tipo			= $column['related_term'];
													$options_item->section_tipo				= $section_tipo;
													$options_item->section_id				= $current_section_id;
													$options_item->lang						= $current_lang;
													$options_item->model					= $column['related_model'];
													$options_item->diffusion_element_tipo	= $diffusion_element_tipo;
												diffusion::add_to_update_record_actions($options_item);
											}

										$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = $column;
										break;
								}//end switch (true)

							// debug
								if(SHOW_DEBUG===true) {
									$time_complete = exec_time_unit($start_time2);
									if (floatval($time_complete)>40) {
										debug_log(__METHOD__
											." )))))))))))))))))))))))))))))))))))))) build_data_field complete LONG time: $time_complete ms. !!!!!!!!!!!! " . PHP_EOL
											. " children_tipo: $curent_children_tipo - $section_tipo" . PHP_EOL
											. " lang: $current_lang" . PHP_EOL
											. " section_id: $current_section_id"
											, logger::DEBUG
										);
										// dump($ar_field_data['ar_fields'][$current_section_id], ' $ar_field_data[ar_fields][$current_section_id] ++ '.to_string($curent_children_tipo));
									}
								}
						}//end foreach ($ar_table_children as $curent_children_tipo)

					$i++;
				}//end foreach ($ar_all_project_langs as $current_lang)

			// section diffusion info - add
			// On finish record update, update current section diffusion_info
			// $section = section::get_instance($current_section_id, $section_tipo, $mode='list');
			// $diffusion_info = $section->get_diffusion_info(); dump($diffusion_info, ' diffusion_info ++ '.to_string());
				if ($build_mode==='default') {

					$section->set_bl_loaded_matrix_data(false); // force section to update dato from current database to prevent loose user changes on publication time lapse
					$section->add_diffusion_info_default($diffusion_element_tipo);
					$section->save_modified = false;
					$section->save_tm = false; // prevent to save time machine record
					$section->Save();

					debug_log(__METHOD__
						." Added current diffusion_element_tipo $diffusion_element_tipo to data." . PHP_EOL
						." Section diffusion_info updated and saved [{$section_tipo}-{$current_section_id}]."
						, logger::DEBUG
					);
				}

			// resolved_records
			$columns_data_resolved_records[] = $columns_data_resolved_records_key;

			// let GC do the memory job
			// time_nanosleep(0, 10000000); // 50 ms
			// Forces collection of any existing garbage cycles
			gc_collect_cycles();
		}//end foreach ($ar_result as $current_section_id) end iteration of records
		#self::build_table_columns_data($section_tipo, $ar_portal_section_id_unique, $database_name, false, $diffusion_element_tipo);
		#dump($ar_field_data, ' ar_field_data ++ '.to_string());

		// exec cue update_record_actions
			if (!empty(diffusion::$update_record_actions)) {
				#dump(diffusion::$update_record_actions, 'diffusion::$update_record_actions ++ '.to_string());
				debug_log(__METHOD__
					." Executing update_record_actions" . PHP_EOL
					.to_string(diffusion::$update_record_actions)
					, logger::DEBUG
				);
				foreach (diffusion::$update_record_actions as $ckey => $current_update_record_options) {

					// clone options
						$current_update_record_options_clone = clone $current_update_record_options;

					// Remove from array to avoid infinity loop
						unset(diffusion::$update_record_actions[$ckey]);

					// exec call to update_record
						$diffusion_sql = new diffusion_sql();
						$diffusion_sql->update_record($current_update_record_options_clone);
				}
			}

		// debug
			if(SHOW_DEBUG===true) {
				$time_complete = exec_time_unit($start_time);
				debug_log(__METHOD__
					." /////////////////////////////// build_table_columns_data complete time: $time_complete ms. "
					, logger::DEBUG
				);
			}


		// return var (If not empty ar_fields)
		// After iterate all records and create the current section array fields, set to static class var (self::$ar_table_data)
		if (!empty($ar_field_data['ar_fields'])) {
			// self::$ar_table_data[$database_name][$table_tipo] = $ar_field_data; // Fix in class static var if not empty
			return $ar_field_data;
		}else{
			return null;
		}
		# PORTAL RECORDS TOTALS
		# After iterate all records, we have now the portal records totals (organized by portal_tipo )
		# Iterate all portals and build every table_data of this portals
		# dump($ar_portal_records, ' $ar_portal_records');
		#foreach ((array)$ar_portal_records as $portal_tipo => $portal_records) {
		#	$portal_records = self::clean_duplicates( $portal_records );
		#	self::build_table_columns_data($portal_tipo, $portal_records, $database_name, false, $diffusion_element_tipo);
		#}
	}//end build_table_columns_data



	/**
	* CHECK_PUBLICATION_VALUE
	* @param object $options
	* @return bool
	*/
	public static function check_publication_value(object $options) : bool {

		// options
			$component_publication_tipo	= $options->component_publication_tipo ?? null;
			$section_id					= $options->section_id ?? null;
			$section_tipo				= $options->section_tipo ?? null;
			$database_name				= $options->database_name ?? null;
			$table_name					= $options->table_name ?? null;
			$diffusion_element_tipo		= $options->diffusion_element_tipo ?? null;
			$table_properties			= $options->table_properties ?? null;
			$delete_previous			= $options->delete_previous ?? true;

		// to_publish. Default = true
			$to_publish = true;

		// Resolve table alias name
			$diffusion_element_tables_map = diffusion_sql::get_diffusion_element_tables_map( $diffusion_element_tipo );
			if (isset($diffusion_element_tables_map->{$section_tipo}->from_alias)) {
				$table_name = $diffusion_element_tables_map->{$section_tipo}->name;
			}

		// component publication - check (once)
			$component_publication_bool_value = (bool)diffusion::get_component_publication_bool_value(
				$component_publication_tipo,
				$section_id,
				$section_tipo
			);

		if ($component_publication_bool_value===false) {

			// Delete this record
			if ($delete_previous===true) {

				diffusion_sql::delete_sql_record(
					$section_id,
					$database_name,
					$table_name,
					$section_tipo
				);
				debug_log(__METHOD__
					." Skipped (and MYSQL deleted) record $section_id ".$table_name." (publication=no)"
					, logger::DEBUG
				);

				// Global search case (legacy)
					if (isset($table_properties) && isset($table_properties->global_search_map)) {

						// delete global table record
						$deleted = diffusion_sql::delete_sql_record(
							$section_id,
							$database_name,
							'global_search',
							$section_tipo
						);
						if (!$deleted) {
							debug_log(__METHOD__
								." Error deleting global_search record {$section_tipo}_{$section_id} (publication=no)"
								, logger::ERROR
							);
						}
					}

				// save_global_table_data (new)
					if (!isset($table_properties->global_table_maps) && isset($diffusion_element_tables_map->{$section_tipo}->from_alias)) {

						$table_tipo = $diffusion_element_tables_map->{$section_tipo}->table ?? null;
						// try from real
						$ontology_node		= new ontology_node($table_tipo);
						$target_properties	= $ontology_node->get_propiedades(true);
						if (is_object($target_properties) && isset($target_properties->global_table_maps)) {
							// overwrite global_table_maps
							$table_properties->global_table_maps = $target_properties->global_table_maps;
						}
					}
					if (isset($table_properties->global_table_maps)) {
						foreach ($table_properties->global_table_maps as $current_global_table_map) {

							// resolve table name by table tipo
							$current_table_name = ontology_node::get_termino_by_tipo(
								$current_global_table_map->table_tipo,
								DEDALO_STRUCTURE_LANG,
								true,
								false
							);

							// delete global table record
							// Note that 'custom' argument is used to select the proper
							// column and value to delete in special global tables
							if (diffusion_mysql::table_exits($database_name, $current_table_name)) {
								$deleted = diffusion_mysql::delete_sql_record(
									$section_id,
									$database_name,
									$current_table_name,
									$section_tipo,
									(object)[ // custom
										'field_name'	=> ['section_id'],
										'field_value'	=> [$section_tipo .'_'. $section_id]
									]
								);
								if (!$deleted) {
									debug_log(__METHOD__
										." Error deleting global_table $current_table_name record {$section_tipo}_{$section_id} (publication=no)"
										, logger::ERROR
									);
								}
							}
						}
					}
			}

			$section = section::get_instance(
				$section_id,
				$section_tipo,
				'list', // string mode
				false // bool cache
			);
			$section->set_bl_loaded_matrix_data(false); // force section to update dato from current database to prevent loose user changes on publication time lapse
			$section->add_diffusion_info_default($diffusion_element_tipo);
			$section->save_modified = false;
			$section->Save();
			debug_log(__METHOD__
				." Added current diffusion_element_tipo $diffusion_element_tipo to data. Section diffusion_info updated and saved [{$section_tipo}-{$section_id}]. "
				, logger::DEBUG
			);

			# Cascade delete
			# dump( json_decode($table_properties), ' table_properties ++ '.to_string());
			if ($delete_previous===true && isset($table_properties) && isset($table_properties->cascade_delete)) {
				foreach ((array)$table_properties->cascade_delete as $tvalue) {
					$cd_table_name = $tvalue->table;

					diffusion_sql::delete_sql_record(
						$section_id,
						$database_name,
						$cd_table_name,
						$section_tipo
					);
					debug_log(__METHOD__
						." Deleted (cascade_delete) record $section_id ".$cd_table_name." "
						, logger::DEBUG
					);
				}
			}

			# RESOLVED_RECORDS (set a resolved)
			#$columns_data_resolved_records[] = $columns_data_resolved_records_key;

			#continue;
			$to_publish = false;
		}


		return $to_publish;
	}//end check_publication_value



	/**
	* GET_FIELD_RELATED_COMPONENT
	* @param string $tipo
	* @return string|bool $related_term
	*/
	public static function get_field_related_component(string $tipo) {

		$ar_related = ontology_node::get_ar_terminos_relacionados(
			$tipo,
			true, // cache
			true // simple
		);
		foreach ($ar_related as $current_related) {
			$current_model = ontology_node::get_modelo_name_by_tipo($current_related,true);
			if (strpos($current_model, 'field_')===0) {
				continue; // skip replace elements
			}
			$related_term = $current_related;
			break;
		}
		if (!isset($related_term)) {
			// throw new Exception("Error Processing Request. Table field '$tipo' related component not found. Please review your structure config and fixit.", 1);
			debug_log(__METHOD__
				." Table field '$tipo' related component not found. Please review your structure config"
				, logger::WARNING
			);
			return false;
		}


		return $related_term;
	}//end get_field_related_component



	/**
	* BUILD_DATA_FIELD
	* Build normalized field data array with field_name and field_value. This is the table column data for this element
	* Portal elements are treated as special pseudo-sections with pointers to other tables
	* @param object stdClass $request_options
	* @return array $ar_field_data
	*/
	public static function build_data_field(stdClass $request_options) : array {

		// Defaults
			$ar_field_data					= [];
			$ar_field_data['field_name']	= '';
			$ar_field_data['field_value']	= '';

		// options
			$options = new stdClass();
				$options->typology					= null;
				$options->value						= null;
				$options->tipo						= null;
				$options->parent					= null;
				$options->lang						= null;
				$options->section_tipo				= null;
				$options->caler_id					= null;
				$options->properties				= null;
				$options->diffusion_element_tipo	= null;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		# FIXED FIELDS
		switch ($options->typology) {

			case 'section': # Fix column section_id
				$ar_field_data['field_name']	= 'section_id';
				$ar_field_data['field_value']	= $options->value;
				$ar_field_data['tipo']			= null;
				$ar_field_data['related_model']	= null;
				break;

			case 'lang': # Especial case, constructs a column with current lang value
				$ar_field_data['field_name']	= 'lang';
				$ar_field_data['field_value']	= $options->value;
				$ar_field_data['tipo']			= null;
				$ar_field_data['related_model']	= null;
				break;

			default:
				$ar_field_data['field_name']	= ontology_node::get_termino_by_tipo($options->tipo, DEDALO_STRUCTURE_LANG, true, false);
				$ar_field_data['field_value']	= (string)'';
				$ar_field_data['tipo']			= $options->tipo;

				#
				# Diffusion element
				$diffusion_term					= new ontology_node($options->tipo);
				$properties						= $diffusion_term->get_propiedades(true);	# Format: {"data_to_be_used": "dato"}

				#
				# Component target
				$related_component_tipo	= self::get_field_related_component($options->tipo);
				$model_name				= ontology_node::get_modelo_name_by_tipo($related_component_tipo,true);

				// related term info
					$ar_field_data['related_term']  = $related_component_tipo;
					$ar_field_data['related_model'] = $model_name;

				// component
					if($model_name==='relation_list') {

						$current_component = new relation_list(
							$related_component_tipo,
							$options->parent,
							$options->section_tipo,
							'list'
						);
					}else{

						$current_component = component_common::get_instance(
							$model_name,
							$related_component_tipo,
							$options->parent,
							'list', // Note that list have dato fallback (in section)
							$options->lang,
							$options->section_tipo,
							false
						);
					}
					# Fix diffusion element properties on target component to enable configure response value
					$current_component->set_diffusion_properties($properties);

					$options->component = $current_component;

				if(is_object($properties) && property_exists($properties, 'get_field_value') && isset($properties->get_field_value->get_dato_method)){

					$get_dato_method	= $properties->get_field_value->get_dato_method;
					$dato				= $current_component->{$get_dato_method}();
				}else{
					$dato = ($model_name==='relation_list')
						? $current_component->get_diffusion_dato() // use 'properties->process_dato_arguments' to filter by section or component
						: $current_component->get_dato();
				}

				// diffusion_model_name. like 'field_text'
				$diffusion_model_name = ontology_node::get_modelo_name_by_tipo($options->tipo, true);

				# switch cases
				switch (true) {
					case (is_object($properties) && property_exists($properties, 'data_to_be_used') && $properties->data_to_be_used==='dato'):

						# VALOR (Unresolved data)
						switch ($diffusion_model_name) {
							case 'field_enum':
								foreach ((array)$dato as $current_locator) {
									$dato = $current_locator->section_id;
								}
								if (empty($dato) || ($dato!=='1' && $dato!=='2') ) {
									if(!empty($dato)) {
										debug_log(__METHOD__
											." WARNING: Set enum dato to default 'No' [2] for $model_name : $options->tipo !. <br>Received dato:".to_string($dato)
											, logger::ERROR
										);
									}
									$dato = 2;	// Value 'No' default
								}
								if(SHOW_DEBUG===true) {
									if (!property_exists($properties, 'enum')) {
										debug_log(__METHOD__
											. " Error. Field enum '$options->tipo' is misconfigured. Please, set property 'enum' to current field " . PHP_EOL
											. to_string()
											, logger::ERROR
										);
									}
								}
								$ar_field_data['field_value'] = (string)$properties->enum->$dato; // Format: "enum":{"1":"si", "2":"no"}
								break;
							default:

								$components_with_relations = component_relation_common::get_components_with_relations();
								if (is_array($dato) && (in_array($model_name, $components_with_relations) || $model_name==='relation_list')) {
									$ar_id = array();
									foreach ($dato as $current_locator) {

										// Check target is publishable
											$current_is_publicable = isset($properties->is_publicable)
												? $properties->is_publicable
												: diffusion::get_is_publicable($current_locator);

											if ($current_is_publicable!==true) {
												// debug_log(__METHOD__
												// 	." + Skipped locator not publishable: ".to_string($current_locator)
												// 	, logger::DEBUG
												// );
												continue;
											}

										$ar_id[] = $current_locator->section_id;
									}
									$dato = $ar_id;
								}else{
									// fallback trans-liter-able data for component with_lang_versions
									if (empty($dato) && $current_component->with_lang_versions===true) {
										$current_component->set_lang(DEDALO_DATA_NOLAN);
										$dato = $current_component->get_dato();
									}
								}
								$ar_field_data['field_value'] = $dato;
								break;
						}//end switch ($diffusion_model_name)
						break;

					case (is_object($properties) && property_exists($properties, 'process_dato')):

						# Process dato with function
						$function_name = $properties->process_dato;
						$ar_field_data['field_value'] = call_user_func($function_name, $options, $dato);
						break;

					// DS resolution with v6 model
					case (is_object($properties) && property_exists($properties, 'data_to_be_used') && $properties->data_to_be_used==='ds'):
						if(isset($properties->v6)){

							// ds_tipo. get the component_tipo to be used as ds
							$ds_tipo = $properties->v6->data_to_be_used;

							// create the caller section to get his data
							$caller_section = section::get_instance(
								$options->parent,
								$options->section_tipo
							);
							// get the relations data of the section to get the data of the component
							$caller_section_relations = $caller_section->get_relations();

							$ar_term_ds = [];
							$ar_locator_ds = array_filter($caller_section_relations, function($el) use ($ds_tipo) {
								if (!isset($el->from_component_tipo)) {
									debug_log(__METHOD__
										. "  Bad locator found (caller_section_relations). Ignored " . PHP_EOL
										. ' locator: ' . to_string($el)
										, logger::ERROR
									);
									return false;
								}
								return $el->from_component_tipo === $ds_tipo;
							});
							// create the term resolution of the data
							foreach ($ar_locator_ds  as $locator_ds) {
								$ar_term_ds[] = ts_object::get_term_by_locator( $locator_ds, $options->lang, $from_cache=true );
							}
							// add if not empty
							if (!empty($ar_term_ds)) {
								$ar_field_data['field_value'] = implode('|', $ar_term_ds);
							}
						}
						break;

					// NEED TO BE FIXED
					case (is_object($properties) && property_exists($properties, 'data_to_be_used') && $properties->data_to_be_used==='dataframe'):
						foreach ((array)$dato as $current_locator) {
							if (isset($current_locator->dataframe)) {
								foreach ($current_locator->dataframe as $key => $locator_dataframe) {
									$ar_term_dataframe[] = ts_object::get_term_by_locator( $locator_dataframe, $options->lang, $from_cache=true );
								}
							}
						}
						if (!empty($ar_term_dataframe)) {
							$ar_field_data['field_value'] = implode('|', $ar_term_dataframe);
						}
						break;

					default:
						$option_obj = is_object($properties) && property_exists($properties, 'option_obj')
							? $properties->option_obj
							: null;

						// Set unified diffusion value
						$ar_field_data['field_value'] =	$current_component->get_diffusion_value($options->lang, $option_obj);
							// dump($ar_field_data['field_value'], '1 $ar_field_data[field_value] ++ '.$current_component->get_tipo().' '.$current_component->get_lang());
						// Fallback to main lang
						if (empty($ar_field_data['field_value'])) {
							$main_lang = common::get_main_lang($current_component->get_section_tipo(), $current_component->get_section_id());
								#dump($main_lang, ' main_lang ++ $options->lang: '.to_string($options->lang) ." - section_tipo: ".$current_component->get_section_tipo());
							$current_component->set_lang($main_lang);
							$ar_field_data['field_value'] =	$current_component->get_diffusion_value($main_lang, $option_obj);
								// dump($ar_field_data['field_value'], '2 $ar_field_data[field_value] ++ '.$current_component->get_tipo().' '.$current_component->get_lang());

							// Fallback to ALL langs ... last try
							if (empty($ar_field_data['field_value'])) {
								$ar_all_langs = common::get_ar_all_langs();
								array_push($ar_all_langs, DEDALO_DATA_NOLAN);
								foreach ($ar_all_langs as $current_t_lang) {
									$current_component->set_lang($current_t_lang);
									$current_diffusion_value_try = $current_component->get_diffusion_value($current_t_lang, $option_obj);
									if (!empty($current_diffusion_value_try)) {
										$ar_field_data['field_value'] = $current_diffusion_value_try;
										break;
									}
								 }
							}
						}
						#debug_log(__METHOD__." ar_field_datafield_value ".$current_component->get_tipo().' '.to_string( $ar_field_data['field_value'] ), 'DEBUG');
						break;
				}//switch (true)
				break;

		}//end switch ($options->typology)


		return $ar_field_data;
	}//end build_data_field



	/**
	* GET_AR_DIFFUSION_MAP
	* Get and set ar_diffusion_map of current domain ($this->domain)
	* @param array $options = []
	* @return array $this->ar_diffusion_map
	*/
	public function get_ar_diffusion_map_sql($options=[]) : array {

		// EN PROCESO

		if (isset($this->ar_diffusion_map)) {
			return $this->ar_diffusion_map;
		}
		#if(SHOW_DEBUG===true) $start_time = start_time();


		$ar_diffusion_map = array();

		# DIFFUSION STRUCTURE

			# DIFFUSION_DOMAIN : Get structure tipo of current diffusion domain name
			$diffusion_domain = diffusion::get_my_diffusion_domain($this->domain, get_called_class());
				#dump($diffusion_domain,'$diffusion_domain '.$this->domain." ".get_called_class());

			# DATABASE :
			$ar_diffusion_database = ontology_node::get_ar_tipo_by_model_name_and_relation($diffusion_domain, $model_name='database', $relation_type='children');
				#dump($ar_diffusion_database,'$ar_diffusion_database');

			# DIFFUSION_SECTIONS : Recorremos las secciones de difusión para localizar las coincidencias con los tipos de sección de las indexaciones
			foreach ($ar_diffusion_database as $diffusion_database_tipo) {

				# diffusion_section_tipo ar_relateds_terms
				$current_database_tipo = $diffusion_database_tipo;
					#dump($current_database_tipo,'$current_database_tipo');

				# current_database_tipo : Verify
				if (empty($current_database_tipo)) {
					throw new Exception("Error Processing Request get_ar_diffusion_map: diffusion_database_tipo is empty. Please configure structure with one diffusion_database_tipo related", 1);
				}

				$ar_diffusion_map[] = $current_database_tipo;

			}//end foreach ($ar_diffusion_database as $diffusion_section_tipo

		# Fix
		$this->ar_diffusion_map = $ar_diffusion_map;


		return (array)$this->ar_diffusion_map;
	}//end get_ar_diffusion_map_sql



	/**
	* SAVE_GLOBAL_SEARCH_DATA
	* v. 1.3 [20-11-2018]
	* v. 1.4 [09-12-2020]
	* v. 1.5 [03-02-2021] Added filter by gender
	* v. 1.6 [14-10-2021] Added filters for graves
	* @return object $save
	*/
	public function save_global_search_data($request_options) {

		$options = new stdClass();
			$options->global_search_map 	 = null;
			$options->diffusion_section 	 = null;
			$options->section_tipo 			 = null;
			$options->diffusion_element_tipo = null;
			$options->ar_field_data 		 = null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		# FULL_DATA
			$full_data_tipos 		= (array)$options->global_search_map->full_data;
			$name_surname_tipos 	= isset($options->global_search_map->name_surname) ? (array)$options->global_search_map->name_surname : [];
			$prisoner_number_tipos 	= isset($options->global_search_map->prisoner_number) ? (array)$options->global_search_map->prisoner_number : [];
			$symbol_state_tipos 	= isset($options->global_search_map->symbol_state) ? (array)$options->global_search_map->symbol_state : [];
			$sort_tipos 			= isset($options->global_search_map->sort) ? (array)$options->global_search_map->sort : [];
			$thesaurus_tipos 		= (array)$options->global_search_map->thesaurus;
			$prison_tipos 			= isset($options->global_search_map->prison) ? (array)$options->global_search_map->prison : []; // 25-01-2018
			$list_data_title_tipos 	= isset($options->global_search_map->list_data->title) ? (array)$options->global_search_map->list_data->title : []; // 25-01-2018
			$title_generic_tipos 	= isset($options->global_search_map->title) ? (array)$options->global_search_map->title : [];	// 15-11-2018
			$pub_author_tipos 		= isset($options->global_search_map->pub_author) ? (array)$options->global_search_map->pub_author : []; // 15-11-2018
			$summary_tipos 	 		= isset($options->global_search_map->list_data->summary) ? (array)$options->global_search_map->list_data->summary : []; // 25-01-2018
			$fields_tipos 	 		= (array)$options->global_search_map->list_data->fields;
			$image_tipo 	 		= isset($options->global_search_map->list_data->image) ? $options->global_search_map->list_data->image : null;
			$filter_date_tipo		= isset($options->global_search_map->filter_date) ? $options->global_search_map->filter_date : 'not_used';
			$ar_fields 		 		= (array)$options->ar_field_data['ar_fields'];
			$table_name 	 		= $options->ar_field_data['table_name'];
			$database_name 	 		= $options->ar_field_data['database_name'];

			$ar_fields_global = array();

			if(SHOW_DEBUG===true) {
				#dump($options->ar_field_data, ' options ++ '.to_string()); die();
				#dump($options->global_search_map, '$options->global_search_map ++ '.to_string());
				#dump($options->ar_field_data, ' $options->ar_field_data ++ '.to_string()); #die();
			}

			#
			# MDCAT
				$mdcat_tipos = [
					'birth_place',
					'dead_at_prison',
					'end_date',
					'exile_place',
					'municipality',
					//'name_surname',
					'neighborhood',
					'prison_municipality',
					'prison',
					'project',
					//'pub_author',
					'pub_editor',
					'pub_year',
					'region',
					'residence_place',
					'start_date',
					'theme',
					//'thesaurus',
					//'title',
					'typology',
					'data_mod', // added 18-09-2019
					'fons_code',
					// added 29-04-2020
					'situation',
					'situation_place',
					'nazi_camp',
					'nazi_sub_camp',
					'prisoner_number',
					// added 09-12-2020
					// 'symbol_state' (already added below in $symbol_state_tipos)
					// added 03-02-2021
					'gender',
					// added 14-10-2021
					'graves_category',
					'archeological_site_type',
					'conservation',
					'marked',
					'dignified',
					'inside_cemetery',
					'grave_by_number',
					'intervention_types',
					'result',
					'graves_genders',
					'ages',
					// added 10-02-2022
					'death_context',
					'buried_type',
					//added 14-05-2023
					'stolpersteine',
					'stolpersteine_date',
					'stolpersteine_place'
				];

			$fields_array = [];

			foreach ($ar_fields as $section_id => $ar_langs) {

				$pseudo_section_id = $options->section_tipo.'_'.$section_id;

				foreach ($ar_langs as $lang => $ar_columns) {
					#dump($ar_columns, ' ar_columns ++ '.to_string());

					$list_data[$lang] = new stdClass();
						$list_data[$lang]->title	= [];
						$list_data[$lang]->summary	= [];

					$full_data[$lang]				= [];
					$name_surname_data[$lang]		= [];
					$prisoner_number_data[$lang]	= [];
					$symbol_state_data[$lang]		= [];
					$thesaurus_data[$lang]			= [];
					$prison_data[$lang]				= [];
					$sort_data[$lang]				= [];
					$pub_author_data[$lang]			= [];
					$title_generic_data[$lang]		= [];
					$filter_date_data[$lang]		= [];
					$filter_mdcat[$lang]			= [];

					foreach ($ar_columns as $column) {
						switch ($column['field_name']) {
							case 'lang':
								# Skip
								break;
							case 'section_id':
								# Skip
								break;
							default:
								# full_data (warning: can use fields used too for title etc. Not use "else" here)
									if (in_array($column['tipo'], $full_data_tipos)) {
										if (is_array($column['field_value'])) {
											$column['field_value'] = json_encode($column['field_value']);
										}
										if (!empty($column['field_value'])) {
											$full_value = is_string($column['field_value'])
												? trim( strip_tags($column['field_value']) )
												: $column['field_value'];
											if (!empty($full_value)) {
												$full_data[$lang][] = $full_value;
											}
										}
									}

								# name_surname_tipos . Added 18-03-2018 !!
									if (in_array($column['tipo'], $name_surname_tipos)) {
										if (is_array($column['field_value'])) {
											$column['field_value'] = json_encode($column['field_value']);
										}
										$name_surname_value = is_string($column['field_value'])
											? trim( strip_tags($column['field_value']) )
											: $column['field_value'];
										if (!empty($name_surname_value)) {
											$name_surname_data[$lang][] = $name_surname_value;
										}
									}

								# prisoner_number_tipos . Added 01-05-2020 !!
									if (in_array($column['tipo'], $prisoner_number_tipos)) {
										// note $column['field_value'] is in format array flat '1452' or '1452 | 1453'
										$ar_values = explode(' | ', ($column['field_value'] ?? '') );
										// if (is_array($column['field_value'])) {
										// 	$column['field_value'] = json_encode($column['field_value']);
										// }
										$prisoner_number_value = is_string($column['field_value'])
											? trim( strip_tags( ($column['field_value'] ?? '') ) )
											: $column['field_value'];
										if (!empty($ar_values)) {
											foreach ($ar_values as $prisoner_number_value) {
												if (!empty($prisoner_number_value)) {
													$prisoner_number_data[$lang][] = $prisoner_number_value;
												}
											}
										}
									}

								# symbol_state . Added 09-12-2020 !!
									if (in_array($column['tipo'], $symbol_state_tipos)) {
										// $ar_values = explode(' | ', $column['field_value']);
										// $symbol_state_value = trim( strip_tags($column['field_value']) );
										$ar_values = $column['field_value'];
										// $symbol_state_value = $column['field_value']
										if (!empty($ar_values)) {
											foreach ($ar_values as $symbol_state_value) {
												if (!empty($symbol_state_value)) {
													$symbol_state_data[$lang][] = $symbol_state_value;
												}
											}
										}
									}

								# sort_tipos . Added 18-03-2018 !!
									if (in_array($column['tipo'], $sort_tipos)) {
										if (is_array($column['field_value'])) {
											$column['field_value'] = json_encode($column['field_value']);
										}
										$sort_value = is_string($column['field_value'])
											? trim( strip_tags( ($column['field_value'] ?? '') ) )
											: $column['field_value'];
										if (!empty($sort_value)) {
											$sort_data[$lang][] = $sort_value;
										}
									}

								# thesaurus_tipos. Added 13-11-2018 !!
									if (in_array($column['tipo'], $thesaurus_tipos)) {
										if (is_array($column['field_value'])) {
											$column['field_value'] = json_encode($column['field_value']);
										}
										$thesaurus_value = is_string($column['field_value'])
											? trim( strip_tags( ($column['field_value'] ?? '') ) )
											: $column['field_value'];
										if (!empty($thesaurus_value)) {
											$thesaurus_data[$lang][] = $thesaurus_value;
										}
									}

								# pub_author_tipos
									if (in_array($column['tipo'], $pub_author_tipos)) {
										if (is_array($column['field_value'])) {
											$column['field_value'] = json_encode($column['field_value']);
										}
										$pub_author_value = is_string($column['field_value'])
											? trim( strip_tags( ($column['field_value'] ?? '') ) )
											: $column['field_value'];
										if (!empty($pub_author_value)) {
											$pub_author_data[$lang][] = $pub_author_value;
										}
									}

								# title_generic_tipos
									if (in_array($column['tipo'], $title_generic_tipos)) {
										if (is_array($column['field_value'])) {
											$column['field_value'] = json_encode($column['field_value']);
										}
										$title_generic_value = is_string($column['field_value'])
											? trim( strip_tags( ($column['field_value'] ?? '') ) )
											: $column['field_value'];
										if (!empty($title_generic_value)) {
											$title_generic_data[$lang][] = $title_generic_value;
										}
									}

								# Fields (special container json)
									if(in_array($column['tipo'], $fields_tipos)) {
										$fields_array[$column['tipo']] = $column['field_value'];
									}

								# list_data_title (list_data)
									if (in_array($column['tipo'], $list_data_title_tipos)) {
										$list_data[$lang]->title[] = $column['field_value'];
									}
								# summary
									elseif (in_array($column['tipo'], $summary_tipos)) {
										if (is_array($column['field_value'])) {
											$column['field_value'] = json_encode($column['field_value']);
										}
										$summary_value = is_string($column['field_value'])
											? trim($column['field_value'])
											: $column['field_value'];
										if (!empty($summary_value)) {
											$list_data[$lang]->summary[] = $summary_value;
										}
									}
								# image
									elseif ($column['tipo']===$image_tipo) {
										$list_data[$lang]->image = $column['field_value'];
									}
								# filter_date
									elseif ($column['tipo']===$filter_date_tipo) {
										$filter_date_data[$lang][] = $column['field_value'];
									}

								// prison_tipos
									if (in_array($column['tipo'], $prison_tipos)) {
										if (is_array($column['field_value'])) {
											$column['field_value'] = json_encode($column['field_value']);
										}
										$prison_value = is_string($column['field_value'])
											? trim( strip_tags( ($column['field_value'] ?? '') ) )
											: $column['field_value'];
										if (!empty($prison_value)) {
											$prison_data[$lang][] = $prison_value;
										}
									}

								$current_field_value = $column['field_value'];

								// mdcat_tipos
									foreach ($mdcat_tipos as $current_column_name) {
										if (!isset($options->global_search_map->{$current_column_name})) continue;

										if (in_array($column['tipo'], $prison_tipos)) {
											#if (is_array($column['field_value'])) {
											#	$column['field_value'] = json_encode($column['field_value']);
											#}
											#$prison_value = trim( strip_tags($column['field_value']) );
											#if (!empty($prison_value)) {
											#	$prison_data[$lang][] = $prison_value;
											#}
										}else{

											if ($column['tipo']===$options->global_search_map->{$current_column_name} && !empty($column['field_value'])) {
												#$list_data[$lang]->{$current_column_name} = $column['field_value'];
												// default direct value
												$current_field_value = $column['field_value'];
												// overwrite value in some cases
												switch ($current_column_name) {
													case 'end_date':
														$ar_current_field_value = (array)explode(',', $current_field_value);
														$current_field_value 	= end($ar_current_field_value);
														$current_field_value 	= strtotime($current_field_value);
														break;
													case 'start_date':
														$ar_current_field_value = (array)explode(',', $current_field_value);
														$current_field_value 	= reset($ar_current_field_value);
														$current_field_value 	= strtotime($current_field_value);
														break;
													case 'pub_year':
														$ar_current_field_value = (array)explode(',', $current_field_value);
														$current_field_value 	= reset($ar_current_field_value);
														$ar_part = explode('-', $current_field_value);
														$year 	 = isset($ar_part[0]) ? $ar_part[0] : null;
														$current_field_value 	= $year;
														break;
													case 'stolpersteine_date':
														$ar_current_field_value = (array)explode(',', $current_field_value);
														$current_field_value 	= reset($ar_current_field_value);
														$current_field_value 	= strtotime($current_field_value);
														break;
													default:
														break;
												}
												// compound and set final column name and value in this lang
												$ar_fields_global[$pseudo_section_id][$lang][] = [
													'field_name'  => ''.$current_column_name.'',
													'field_value' => $current_field_value
												];
											}//end if ($column['tipo']===$options->global_search_map->{$current_column_name} && !empty($column['field_value']))
										}
									}
								break;
						}
					}//end foreach ($ar_columns as $column)


					# SECTION_ID
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'  => 'section_id',
							'field_value' => $pseudo_section_id
						];

					# LANG
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'  => 'lang',
							'field_value' => $lang
						];

					# LIST_DATA
						# Make one string all title/summary elements (if various)
						$list_data[$lang]->title 	= implode(', ',$list_data[$lang]->title);
						$list_data[$lang]->summary 	= implode(', ',$list_data[$lang]->summary);
						if (!empty($list_data[$lang]->image)) {
							$image_parts 				= explode(',', $list_data[$lang]->image);
							$list_data[$lang]->image 	= $image_parts[0]; // Only first image is used
						}
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'	=> 'list_data',
							'field_value'	=> json_encode($list_data[$lang], JSON_UNESCAPED_UNICODE)
						];

					# FULL_DATA
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'	=> 'full_data',
							'field_value'	=> implode(' ',$full_data[$lang])
						];

					# name_surname. NAME_SURNAME_DATA . Added 18-03-2018 !!
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'	=> 'name_surname',
							'field_value'	=> implode(' ',$name_surname_data[$lang])
						];

					# prisoner_number. prisoner_number_DATA . Added 01-05-2020 !!
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'	=> 'prisoner_number',
							'field_value'	=> json_encode($prisoner_number_data[$lang], JSON_UNESCAPED_UNICODE)
						];

					# symbol_state. symbol_state_data . Added 09-12-2020 !!
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'	=> 'symbol_state',
							'field_value'	=> json_encode($symbol_state_data[$lang], JSON_UNESCAPED_UNICODE)
						];

					# sort. sort_data . Added 18-03-2018 !!
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'	=> 'sort',
							'field_value'	=> implode(' ',$sort_data[$lang])
						];

					# sort_id
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'	=> 'sort_id',
							'field_value'	=> $section_id
						];

					# thesaurus. THESAURUS_DATA . Merge all values in one only array. Added 13-11-2018 !!
						#$ar_thesaurus_elements = [];
						#foreach ((array)$thesaurus_data[$lang] as $current_array_string) {
						#	if ($current_array = json_decode($current_array_string)) {
						#		$ar_thesaurus_elements = array_merge($ar_thesaurus_elements, (array)$current_array);
						#	}
						#}
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'		=> 'thesaurus',
							// 'field_value'	=> (!empty($ar_thesaurus_elements)) ? json_encode($ar_thesaurus_elements) : null
							'field_value'		=> (!empty($thesaurus_data[$lang])) ? implode(' | ', $thesaurus_data[$lang]) : null
						];

					# prison. Merge all values in one only array. Added 20-11-2018 !!
						$ar_prison_elements = [];
						foreach ((array)$prison_data[$lang] as $current_item_string) {
							if (!empty($current_item_string)) {
								$ar_prison_elements[] = $current_item_string;
							}
						}
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'	=> 'prison',
							'field_value'	=> !empty($ar_prison_elements) ? implode(' | ', $ar_prison_elements) : null
						];

					# pub_author. Merge all values in one only array. Added 15-11-2018 !!
						$ar_pub_author_elements = [];
						foreach ((array)$pub_author_data[$lang] as $current_item_string) {
							if (!empty($current_item_string)) {
								$ar_pub_author_elements[] = $current_item_string;
							}
						}
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'	=> 'pub_author',
							'field_value'	=> !empty($ar_pub_author_elements) ? implode(' | ', $ar_pub_author_elements) : null
						];

					# title_generic. title_generic_data. Merge all values in one only array. Added 15-11-2018 !!
						$ar_title_generic_elements = [];
						foreach ((array)$title_generic_data[$lang] as $current_item_string) {
							if (!empty($current_item_string)) {
								$ar_title_generic_elements[] = $current_item_string;
							}
						}
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'	=> 'title',
							'field_value'	=> !empty($ar_title_generic_elements) ? implode(' | ', $ar_title_generic_elements) : null
						];

					# FIELDS
						$ar_objects = [];
						foreach ($fields_array as $current_tipo => $current_value) {
							$current_column_name = ontology_node::get_termino_by_tipo($current_tipo, 'lg-spa', true);
							$fields_obj = new stdClass();
								$fields_obj->name  = $current_column_name;
								$fields_obj->value = is_string($current_value) ? trim( strip_tags($current_value) ) : $current_value;
							$ar_objects[] = $fields_obj;
						}
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'	=> 'fields',
							'field_value'	=> json_encode($ar_objects, JSON_UNESCAPED_UNICODE)
						];

					# FILTER_DATE
						$filter_date = isset($filter_date_data[$lang][0]) ? $filter_date_data[$lang][0] : '';
						// if (strpos($filter_date, '|')!==false) {
							// $ar_filter_date = explode(' | ', $filter_date);
							// $filter_date = isset($ar_filter_date[0]) ? $ar_filter_date[0] : null;
						// }
						if(preg_match('/^[0-9]{4}-[09]{2}-[09]{2}/', $filter_date, $output_array)) {
							$filter_date = reset($output_array);

							$ar_fields_global[$pseudo_section_id][$lang][] = [
								'field_name'	=> 'filter_date',
								'field_value'	=> $filter_date
							];
						}


					# LINK
						$link_obj = [
							'table'			=> $table_name,
							'section_id'	=> $section_id
						];
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'	=> 'link',
							'field_value'	=> json_encode($link_obj)
						];

					# TABLE
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'	=> 'table',
							'field_value'	=> $table_name
						];

					# fons_code (archive code)
						/*
						switch ($table_name) {
							case 'interview': 			$fons_code = 1; break;
							case 'biblioteca': 			$fons_code = 12; break;
							case 'sra': 				$fons_code = 2; break;
							case 'privacio_llibertat': 	$fons_code = 3; break;
							case 'deportats': 			$fons_code = 6; break;
							case 'espais_memoria': 		$fons_code = 4; break;
							case 'cens_simbologia': 	$fons_code = 5; break;
							default: $fons_code = null;
						}
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'  => 'fons_code',
							'field_value' => '["'.$fons_code.'"]'
						];
						*/
				}//end foreach ($ar_langs as $lang => $ar_columns)
			}//end foreach ($ar_fields as $section_id => $ar_langs) {
			#dump($ar_fields_global, ' ar_fields_global ++ '.to_string());
			#dump($ar_fields_global, ' ar_fields_global ++ '.to_string());
			#dump($list_data, ' list_data ++ '.to_string());

		// ar_field_data
			$ar_field_data = [
				"database_name"		=> $database_name,
				"table_name"		=> 'global_search',
				"diffusion_section"	=> $options->diffusion_section,
				"ar_fields"			=> $ar_fields_global
			];

		// save record
			$save_options = new stdClass();
				$save_options->diffusion_element_tipo	= $options->diffusion_element_tipo;
				$save_options->section_tipo				= $options->section_tipo;
				$save_options->record_data				= $ar_field_data;
				$save_options->delete_previous			= true;

			$save = diffusion_mysql::save_record($save_options);

			if (!isset($save->new_id)) {
				debug_log(__METHOD__
					." ERROR ON INERT RECORD (global_search) !!! (diffusion_mysql::save_record) " .PHP_EOL
					.'save: ' . to_string($save)
					, logger::ERROR
				);
			}else{
				debug_log(__METHOD__
					." Saved new record in global_search - ".$save->new_id
					, logger::DEBUG
				);
			}


		return (object)$save;
	}//end save_global_search_data



	/**
	* SAVE_GLOBAL_TABLE_DATA
	*
		{
		  "table_tipo": "test_19",
		  "columns_map": [
			{
			  "target_column": "full_data",
			  "source_columns": [
				"nombre"
			  ]
			}
		  ]
		}
	*
	* @return object $save
	*/
	public function save_global_table_data(object $options) : object {

		// options
			$global_table_map		= $options->global_table_map;
			$diffusion_element_tipo	= $options->diffusion_element_tipo;
			$section_tipo			= $options->section_tipo;
			$database_name			= $options->database_name;
			$ar_field_data			= $options->ar_field_data;

		// short vars
			$ar_fields			= $ar_field_data['ar_fields'];
			$columns_map		= $global_table_map->columns_map;
			$table_tipo			= $global_table_map->table_tipo;
			$table_name			= ontology_node::get_termino_by_tipo($table_tipo, DEDALO_STRUCTURE_LANG, true, false);
			$source_table_name	= $ar_field_data['table_name'];

		// iterate already calculated fields and extract mapped values
			$values = [];
			foreach($ar_fields as $section_id => $data) {
				foreach ($data as $lang => $current_values) {

					$new_items = [];

					// section_id (used term_id here to allow use the same record manager to delete etc..)
						$new_items[] = [
							'field_name'	=> 'section_id',
							'field_value'	=> $section_tipo .'_'. $section_id
						];

					// ref_section_id
						$new_items[] = [
							'field_name'	=> 'ref_section_id',
							'field_value'	=> $section_id
						];

					// ref_section_tipo
						$new_items[] = [
							'field_name'	=> 'ref_section_tipo',
							'field_value'	=> $section_tipo
						];

					// lang
						$new_items[] = [
							'field_name'	=> 'lang',
							'field_value'	=> $lang
						];

					// table
						$new_items[] = [
							'field_name'	=> 'ref_table',
							'field_value'	=> $source_table_name
						];

					// link
						$new_items[] = [
							'field_name'	=> 'link',
							'field_value'	=> (object)[
								'table'			=> $source_table_name,
								'section_id'	=> $section_id
							]
						];

					foreach ($columns_map as $column_map_item) {

						$column_values = [];

						$target_column	= $column_map_item->target_column;
						$source_columns	= $column_map_item->source_columns;

						// extract values
							foreach ($source_columns as $source_column) {
								$found = array_find($current_values ?? [], function($element) use($source_column){
									return ($element['field_name']===$source_column);
								});
								if ($found!==null) {
									// $column_values[] = $found['field_value'];
									// trying to decode before assign (do not affects current numisdata use at map_global)
									$safe_field_value = is_string($found['field_value'])
										? (json_decode($found['field_value']) ?? $found['field_value'])
										: $found['field_value'];
									$column_values[] = $safe_field_value;
								}
							}

						// field value formatted
							$field_value = (function($column_values) use($column_map_item, $source_columns){

								$format = $column_map_item->format ?? null;

								switch ($format) {
									case 'string':
										$separator = $column_map_item->separator ?? ' | ';
										$safe_column_values = array_map(function($el){
											return is_string($el)
												? $el
												: to_string($el);
										}, $column_values);
										return implode($separator, $safe_column_values);
										break;
									default:
										if (count($source_columns)<2) {
											return reset($column_values);
										}else{
											return json_encode($column_values, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
										}
										break;
								}
							})($column_values);

						$new_items[] = [
							'field_name'	=> $target_column,
							'field_value'	=> $field_value
						];
					}

					$values[$section_id][$lang] = $new_items;
				}//end loop lang
			}//end foreach($ar_fields as $section_id => $data)

		// ar_field_data
			$ar_field_data = [
				"database_name" 	=> $database_name,
				"table_name" 		=> $table_name,
				"diffusion_section" => $table_tipo,
				"ar_fields" 		=> $values
			];

		// delete previous records if exists (custom way using section_id and table combination)
			if (diffusion_mysql::table_exits($database_name, $table_name)) {
				foreach($ar_fields as $section_id => $data) {

					$deleted = diffusion_mysql::delete_sql_record(
						$section_id,
						$database_name,
						$table_name,
						$section_tipo,
						(object)[ // custom
							'field_name'	=> ['section_id'],
							'field_value'	=> [$section_tipo .'_'. $section_id]
						]
					);
					if (!$deleted) {
						debug_log(__METHOD__
							. " Error deleting record " . PHP_EOL
							. ' section_id: ' . to_string($section_id) . PHP_EOL
							. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
							. ' database_name: ' . to_string($database_name) . PHP_EOL
							. ' table_name: ' . to_string($table_name)
							, logger::ERROR
						);
					}
				}
			}

		// save record
			$save_options = new stdClass();
				$save_options->diffusion_element_tipo	= $diffusion_element_tipo;
				$save_options->section_tipo				= $table_tipo; // $section_tipo;
				$save_options->record_data				= $ar_field_data;
				$save_options->delete_previous			= false; // already custom diffusion_mysql deleted

			$save = diffusion_mysql::save_record($save_options);

			if (!isset($save->new_id)) {
				debug_log(__METHOD__
					. " ERROR ON INERT RECORD !!! (diffusion_mysql::save_record) " . PHP_EOL
					. 'save: ' . to_string($save)
					, logger::ERROR
				);
			}else{
				debug_log(__METHOD__
					. " Saved new record in global_search - new_id: " . $save->new_id
					, logger::DEBUG
				);
			}


		return (object)$save;
	}//end save_global_table_data



	/**
	* GET_DIFFUSION_DATABASE_NAME_FROM_TABLE
	* @param string $diffusion_table_tipo
	* @return string|null $diffusion_database_name
	*/
	public static function get_diffusion_database_name_from_table(string $diffusion_table_tipo) : ?string {

		$diffusion_database_name = null;

		$model_name 	= 'database';
		$relation_type 	= 'parent';
		$ar_terminoID 	= ontology_node::get_ar_tipo_by_model_name_and_relation($diffusion_table_tipo, $model_name, $relation_type, true);
			#dump($ar_terminoID, ' ar_terminoID ++ '.to_string($diffusion_table_tipo));

		$count = count($ar_terminoID);

		switch (true) {
			case $count===1:
				$diffusion_database_tipo = reset($ar_terminoID);
				$diffusion_database_name = ontology_node::get_termino_by_tipo($diffusion_database_tipo, DEDALO_STRUCTURE_LANG, true, false); // $terminoID, $lang=NULL, $from_cache=false, $fallback=true
				break;
			case $count>1:
				debug_log(__METHOD__
					." Detected more than one related elements" . PHP_EOL
					.' model: ' . $model_name
					, logger::ERROR
				);
				break;
			default:
				break;
		}

		return $diffusion_database_name;
	}//end get_diffusion_database_name_from_table



	/**
	* GET_DIFFUSION_ELEMENT_FROM_ELEMENT_TIPO
	* Select from ar_diffusion_map_elements the current request element by tipo
	* @param string $diffusion_element_tipo
	* @return object|bool $diffusion_element
	*/
	public static function get_diffusion_element_from_element_tipo(string $diffusion_element_tipo) {

		$ar_diffusion_map_elements = self::get_ar_diffusion_map_elements();
		if (!isset($ar_diffusion_map_elements[$diffusion_element_tipo])) {
			return false;
		}

		return $ar_diffusion_map_elements[$diffusion_element_tipo];
	}//end get_diffusion_element_from_element_tipo



	/**
	* GET_DIFFUSION_ELEMENT_TABLES_MAP
	* Build map of section->table of all tables of current diffusion domain
	* @param string $diffusion_domain_name . Like 'aup'
	* @return object $diffusion_element_tables
	*/
	public static function get_diffusion_element_tables_map(string $diffusion_element_tipo) {

		static $ar_diffusion_element_tables_map;

		#if (isset($diffusion_element_tables_map)) {
		#	return $diffusion_element_tables_map;
		#}

		# Return cached map if exists
		if (isset($ar_diffusion_element_tables_map[$diffusion_element_tipo])) {
			return $ar_diffusion_element_tables_map[$diffusion_element_tipo];
		}


		$diffusion_element_tables_map = new stdClass();

		#
		# DIFFUSION_ELEMENT_TIPO_TABLES . Point of start to calculate diffusion tables
		$diffusion_element_tipo_tables = $diffusion_element_tipo; // Default

		# CEDIS ONLY. Override in 'properties' the base point for calculate diffusion tables
		# This is useful for development purposes, and allow publish in different database without duplicate all tables structure for each difusion_element
			$diffusion_element_tipo_obj = new ontology_node($diffusion_element_tipo);
			$properties = $diffusion_element_tipo_obj->get_propiedades(true);
			if (isset($properties->force_source_tables_tipo)) {
				# Override
				$diffusion_element_tipo_tables = $properties->force_source_tables_tipo;
				debug_log(__METHOD__
					." Override diffusion_element_tipo $diffusion_element_tipo to $diffusion_element_tipo_tables for calculate diffusion tables "
					, logger::DEBUG
				);
			}

		// database_alias check
			$database_alias_tipo = ontology_node::get_ar_tipo_by_model_name_and_relation($diffusion_element_tipo, 'database_alias', 'children', true)[0] ?? null;
			if (!empty($database_alias_tipo)) {
				$real_database_tipo = ontology_node::get_ar_tipo_by_model_name_and_relation($database_alias_tipo, 'database', 'termino_relacionado', true)[0] ?? null;
				if (!empty($real_database_tipo)) {
					// overwrite
					$diffusion_element_tipo_tables = $real_database_tipo;
				}
			}

		#
		# TABLES
		# Search inside current entity_domain and iterate all tables resolving alias and store target sections of every table
			$ar_table_tipo = ontology_node::get_ar_tipo_by_model_name_and_relation(
				$diffusion_element_tipo_tables, // database tipo. Note that can be different to diffusion_element_tipo
				'table', // modelo_name
				'children_recursive', // relation_type
				false // search_exact (allow 'table' and 'table_alias')
			);

			// database_alias case
				// $database_alias_tipo = $diffusion_element_tipo;
				if ($database_alias_tipo && $diffusion_element_tipo_tables !== $diffusion_element_tipo) {
					// replace current tables list with modified parsed version
					$ar_table_tipo = diffusion::parse_database_alias_tables($ar_table_tipo, $database_alias_tipo);
				}

		// diffusion_element
			$diffusion_element = self::get_diffusion_element_from_element_tipo($diffusion_element_tipo);
			#dump($diffusion_element, ' diffusion_element ++ '.to_string());


		#
		# DATABASE_NAME . Diffusion domain web_default case
		# Database name is overwritten by config db name. This allow for example, use db 'web_myentity' when diffusion domain is 'default' (instead of db 'web_default')
		$database_name = $diffusion_element->database_name;
		if ($database_name!==MYSQL_DEDALO_DATABASE_CONN && MYSQL_DEDALO_DATABASE_CONN==='web_default') {
			$database_name = MYSQL_DEDALO_DATABASE_CONN;
			debug_log(__METHOD__
				." Using config db (".MYSQL_DEDALO_DATABASE_CONN.") as database overwriting diffusion defined (diffusion_element->database_name) "
				, logger::WARNING
			);
		}
		#debug_log(__METHOD__." Using database_name: $database_name ".to_string(), logger::DEBUG);

		# DATABASE_TIPO
		$database_tipo = $diffusion_element->database_tipo;

		foreach ($ar_table_tipo as $current_table_tipo) {

			# Calculate database once
			#if (!isset($database)) {
			#	$database = self::get_diffusion_database_name_from_table( $current_table_tipo );
			#}

			# Propiedades
			$table_obj			= new ontology_node($current_table_tipo);
			$table_properties	= $table_obj->get_propiedades(true);

			$model_name = ontology_node::get_modelo_name_by_tipo($current_table_tipo,true);
			switch ($model_name) {

				case 'table':
					// Direct relation
					$related_section = self::get_related_section($current_table_tipo);

					if (!empty($related_section)) {
						$section_tipo	= $related_section;
						$name			= ontology_node::get_termino_by_tipo($current_table_tipo, DEDALO_STRUCTURE_LANG, true, false);

						$data = new stdClass();
							$data->table			= $current_table_tipo;
							$data->name				= $name;
							$data->database_name	= $database_name;
							$data->database_tipo	= $database_tipo;
							$data->properties		= $table_properties;
							$data->from_alias		= false;

						$diffusion_element_tables_map->$section_tipo = $data;
					}
					break;

				case 'table_alias':
					// Indirect relation
					$ar_related_tables	= common::get_ar_related_by_model('table', $current_table_tipo);
					$real_table			= $ar_related_tables[0] ?? null;

					if (empty($real_table)) {
						// bad structure configuration for current diffusion element
						// throw new Exception("Error Processing Request. Bad structure configuration for 'real_table' of 'table_alias'. Expected 'table' related and nothing found for tipo: ".to_string($current_table_tipo), 1);
						debug_log(__METHOD__
							. " Ignored table '$current_table_tipo'. Bad structure configuration for 'real_table' of 'table_alias'. Empty real table" . PHP_EOL
							. ' current_table_tipo: ' . to_string($current_table_tipo) . PHP_EOL
							. ' current_table model: ' . to_string($model_name) . PHP_EOL
							. ' ar_related_tables: ' . to_string($ar_related_tables) . PHP_EOL
							. ' current_table label: ' . ontology_node::get_termino_by_tipo($current_table_tipo, true)
							, logger::ERROR
						);
						continue 2;
					}

					// RELATED_SECTION . Direct related section case
					// try with tale_alias
					$related_section = self::get_related_section($current_table_tipo);
					if (empty($related_section)) {
						// try with real table
						$related_section = self::get_related_section($real_table);
					}

					if (!empty($related_section)) {
						// $section_tipo	= reset($ar_related_sections);
						$section_tipo = $related_section;
						# Table name is taken from real_table tipo (only one mysql table for all table alias)
						#$name = ontology_node::get_termino_by_tipo($real_table, DEDALO_STRUCTURE_LANG, true, false);
						# Table name is taken from current_table_tipo tipo (one mysql table for each table alias)
						$name = ontology_node::get_termino_by_tipo($current_table_tipo, DEDALO_STRUCTURE_LANG, true, false);

						if (empty($table_properties)) {
							# Try with real table when alias is empty
							$table_obj			= new ontology_node($real_table);
							$table_properties	= $table_obj->get_propiedades(true);
						}
						$data = new stdClass();
							$data->table			= $real_table;
							$data->name				= $name;
							$data->database_name	= $database_name;
							$data->database_tipo	= $database_tipo;
							$data->properties		= $table_properties;
							$data->from_alias		= $current_table_tipo;

						$diffusion_element_tables_map->$section_tipo = $data;
					}else{
						// bad structure configuration for current diffusion element
							$ontology_node	= new ontology_node($real_table);
							$properties		= $ontology_node->get_propiedades(true);
							debug_log(__METHOD__
								." ERROR: Bad structure/ontology configuration for current diffusion element. Expected a section related but empty related section" . PHP_EOL
								.' current_table_tipo: ' . to_string($current_table_tipo) . PHP_EOL
								.' model: ' . ontology_node::get_modelo_name_by_tipo($current_table_tipo,true) . PHP_EOL
								.' related_section: ' . to_string($related_section) . PHP_EOL
								.' real_table tipo: ' . to_string($real_table) . PHP_EOL
								.' properties: ' . json_encode($properties, JSON_PRETTY_PRINT) . PHP_EOL
								, logger::ERROR
							);
					}
					break;
				/*
				case 'table_thesaurus':
					$real_table 		 = $current_table_tipo;
					$name 				 = ontology_node::get_termino_by_tipo($real_table, DEDALO_STRUCTURE_LANG, true, false);

					$ontology_node = new ontology_node($current_table_tipo);
					$properties  = json_decode($ontology_node->get_properties());
					$thesaurus_ar_prefix = isset($properties->diffusion->thesaurus_ar_prefix) ? $properties->diffusion->thesaurus_ar_prefix : array();

					$section_tipo = 'thesaurus';

					$data = new stdClass();
						$data->table				= $section_tipo;
						$data->name					= $name;
						$data->database				= $database;
						$data->thesaurus_ar_prefix	= $thesaurus_ar_prefix;

					$diffusion_element_tables_map->$section_tipo = $data;
					break;*/

				default:
					# Skip no accepted models
					debug_log(__METHOD__." Skipped invalid model: $model_name", logger::DEBUG);
					#continue;
					break;
			}
		}//end foreach ($ar_table_tipo as $current_table_tipo)
		#dump($diffusion_element_tables_map, ' diffusion_element_tables_map ++ '.to_string());
		#error_log( $diffusion_element_tipo );

		# Cache resolved map
		$ar_diffusion_element_tables_map[$diffusion_element_tipo] = $diffusion_element_tables_map;


		return (object)$diffusion_element_tables_map;
	}//end get_diffusion_element_tables_map



	/**
	* GET_DIFFUSION_TABLE_BY_SECTION
	* @param string $section_tipo
	* @return string|bool $diffusion_section
	*  (tipo like dd1525) or bool false
	*/
	public static function get_diffusion_table_by_section(string $section_tipo) {

		$ar_diffusion_map_elements = self::get_ar_diffusion_map_elements();
			#dump($ar_diffusion_map_elements, ' ar_diffusion_map_elements ++ '.to_string($section_tipo));

		foreach ($ar_diffusion_map_elements as $diffusion_element_tipo => $obj_value) {
			$diffusion_element_tables_map = (object)self::get_diffusion_element_tables_map($diffusion_element_tipo);
				#dump($diffusion_element_tables_map, ' diffusion_element_tables_map ++ '.to_string($diffusion_element_tipo));

			if ( isset($diffusion_element_tables_map->$section_tipo) && isset($diffusion_element_tables_map->$section_tipo->table)) {
				return $diffusion_element_tables_map->$section_tipo->table;
				break;
			}
		}

		return false;
	}//end get_diffusion_table_by_section



	/**
	* GET_THESAURUS_DATA
	* @return object $thesaurus_data
	*/
	public function get_thesaurus_data() : object {

		$thesaurus_data = new stdClass();

		$diffusion_map = self::get_diffusion_map(DEDALO_DIFFUSION_DOMAIN);
			#dump($ar_diffusion_map, ' ar_diffusion_map ++ '.to_string($options->section_tipo));

		$ar_diffusion_map_elements = self::get_ar_diffusion_map_elements();
			#dump($ar_diffusion_map_elements, ' ar_diffusion_map_elements ++ '.to_string()); die();

		$section_tipo = 'thesaurus';
		foreach ($ar_diffusion_map_elements as $diffusion_element_tipo => $obj_value) {
			#dump($obj_value, ' $obj_value ++ '.to_string($diffusion_element_tipo));

			$tables_obj = self::get_diffusion_element_tables_map( $diffusion_element_tipo );
				#dump($tables_obj, ' tables_obj ++ '.to_string( $diffusion_element_tipo ));

			if (isset($tables_obj->$section_tipo)) {
				$thesaurus_data->database_name	= $tables_obj->$section_tipo->database;
				$thesaurus_data->table			= $tables_obj->$section_tipo->table;
				break;
			}
		}
		#dump($thesaurus_data, ' $thesaurus_data ++ '.to_string());

		# Fallback
		if (!isset($thesaurus_data->database_name)) {
			$thesaurus_data->database_name	= 'web_'.DEDALO_DIFFUSION_DOMAIN;
			$thesaurus_data->table			= 'thesaurus';
			debug_log(__METHOD__
				." Thesaurus is not properly defined for diffusion. Using defaults [$thesaurus_data->table,$thesaurus_data->database_name]. Please fix this ASAP "
				, logger::WARNING
			);
		}

		return $thesaurus_data;
	}//end get_thesaurus_data



	/**
	* DIFFUSION_COMPLETE_DUMP
	* @param string $diffusion_element_tipo
	* @param bool $resolve_references = true
	* @return object $response
	*/
	public function diffusion_complete_dump( $diffusion_element_tipo, $resolve_references=true ) {

		$response = new stdClass();
			$response->result = false;
			$response->msg    = '';

		$ar_tables = self::get_diffusion_element_tables_map( $diffusion_element_tipo );
		foreach ((array)$ar_tables as $section_tipo => $value_obj) {

			# All section records
			$result_resource = section::get_resource_all_section_records_unfiltered($section_tipo);
			while ($rows = pg_fetch_assoc($result_resource)) {

				$current_record_section_id = $rows['section_id'];
				debug_log(__METHOD__
					." Diffusion record: - $section_tipo - $current_record_section_id "
					, logger::DEBUG
				);

				// update_record
				$result = $this->update_record((object)[
					'section_tipo'				=> $section_tipo,
					'section_id'				=> $current_record_section_id,
					'diffusion_element_tipo'	=> $diffusion_element_tipo
				]);

				$response->msg .= isset($result->msg) ? "<br>".$result->msg : '';
			}//end foreach ((array)$ar_all_records as $current_record_section_id) {

			// let GC do the memory job
			// time_nanosleep(0, 10000000); // 10 ms
			# Forces collection of any existing garbage cycles
			gc_collect_cycles();
		}

		return (object)$response;
	}//end diffusion_complete_dump



	/**
	* DELETE_SQL_RECORD
	* @return bool
	*/
	public static function delete_sql_record($section_id, $database_name, $table_name, $section_tipo) {
		if(SHOW_DEBUG===true) {
			debug_log(__METHOD__
				." Called with: section_id:$section_id, database_name:$database_name, table_name:$table_name, section_tipo:$section_tipo, called_class:".get_called_class()
				, logger::DEBUG
			);
			#$diffusion_element_tables_map = diffusion_sql::get_diffusion_element_tables_map( $options->diffusion_element_tipo );
		}

		switch ( get_called_class() ) {
			case 'diffusion_mysql':
			case 'diffusion_sql': // ??

				// global_search try delete records
				$global_search_tables = ['global_search'];
				foreach ($global_search_tables as $global_search_table) {
					if( diffusion_mysql::table_exits($database_name, $global_search_table) ) {

						$global_search_section_id = $section_tipo . '_' . $section_id;

						$response = diffusion_mysql::delete_sql_record(
							$global_search_section_id,
							$database_name,
							$global_search_table,
							$section_tipo
						); // $section_id, $database_name, $global_search_table, $section_tipo=null, $custom=false

						if ($response->result===true) {
							debug_log(__METHOD__
								." MySQL record '$global_search_section_id' is deleted from global_search table '$global_search_table' (publication=no) $response->msg "
								, logger::DEBUG
							);
						}
					}
				}

				if( diffusion_mysql::table_exits($database_name, $table_name) ) {

					$response = diffusion_mysql::delete_sql_record(
						$section_id,
						$database_name,
						$table_name,
						$section_tipo
					); // $section_id, $database_name, $table_name, $section_tipo=null, $custom=false

					if ($response->result===true) {
						debug_log(__METHOD__
							." MySQL record '$section_tipo - $section_id' is deleted (publication=no) $response->msg "
							, logger::DEBUG
						);
					}
					return $response->result;
				}
				break;

			default:
				debug_log(__METHOD__." Sorry, this delete method: ".get_called_class()." is not defined yet. Nothing is deleted in current called_class ".to_string(get_called_class()), logger::DEBUG);
				break;
		}

		return false;
	}//end delete_sql_record



	/**
	* SAVE_TABLE_SCHEMA
	* schema_obj is table properties JSON data
	* @param string $database_name
	* @param object $schema_obj
	* @return object $response
	*/
	public static function save_table_schema($database_name, $schema_obj) {

		$response = diffusion_mysql::add_publication_schema( $database_name, json_encode($schema_obj) );

		return $response;
	}//end save_table_schema



	/**
	* GET_ELEMENTS_OF_TYPE
	* @return array
	*/
	public function get_elements_of_type() {

		// No used yet
	}//end get_elements_of_type



	/**
	* MAP_TARGET_SECTION_TIPO
	* Search in diffusion structure the table that point to the same section of current dato
	* @param string $element_tipo
	* @param array $dato;
	* 	Contains one value like 'ts1' (is target section tipo data from component in hierarchy record)
	* @return string|null $table_name
	*	Return table name usable for mysql like 'themes'
	*/
	public static function map_target_section_tipo(object $options, ?array $dato) : ?string {

		$table_name = null;

		$element_tipo = $options->tipo;

		$target_section_tipo = is_array($dato)
			? reset($dato)
			: null;
		if (!empty($target_section_tipo)) {

			$database_element_tipo  = ontology_node::get_ar_tipo_by_model_name_and_relation(
				$element_tipo,
				$model_name='database',
				$relation_type='parent',
				$search_exact=true
			);

			$database_element_tables = ontology_node::get_ar_tipo_by_model_name_and_relation(
				$database_element_tipo[0],
				$model_name='table',
				$relation_type='children',
				$search_exact=true
			);

			foreach ($database_element_tables as $table_tipo) {

				$ar_section_tipo = common::get_ar_related_by_model('section', $table_tipo);
				if (isset($ar_section_tipo[0]) && $ar_section_tipo[0]===$target_section_tipo ) {

					$table_name = ontology_node::get_termino_by_tipo($table_tipo, DEDALO_STRUCTURE_LANG, true, false);
					break;
				}
			}
		}

		return $table_name;
	}//end map_target_section_tipo



	/**
	* MAP_LOCATOR_SECTION_TIPO
	* @return string|null $table_name
	*/
	public static function map_locator_section_tipo(object $options, array $dato) : ?string {

		$table_name = '';

		$element_tipo	= $options->tipo;
		$locator		= reset($dato);
		if (isset($locator->section_tipo)) {
			$database_element_tipo  = ontology_node::get_ar_tipo_by_model_name_and_relation(
				$element_tipo,
				$model_name='database',
				$relation_type='parent',
				$search_exact=true
			);

			$database_element_tables = ontology_node::get_ar_tipo_by_model_name_and_relation(
				$database_element_tipo[0],
				$model_name='table',
				$relation_type='children',
				$search_exact=true
			);

			foreach ($database_element_tables as $table_tipo) {

				$ar_section_tipo = common::get_ar_related_by_model('section', $table_tipo);
				if (isset($ar_section_tipo[0]) && $ar_section_tipo[0]===$locator->section_tipo ) {

					$table_name = ontology_node::get_termino_by_tipo($table_tipo, DEDALO_STRUCTURE_LANG, true, false);
					break;
				}
			}
		}

		return $table_name;
	}//end map_locator_section_tipo



	/**
	* MAP_TO_SECTION_TIPO
	* Returns current section tipo like 'es1'
	* @return string|null $section_tipo
	*/
	public static function map_to_section_tipo($options, $dato) {

		/*
		$element_tipo 		= $options->tipo;
		$table_element_tipo = ontology_node::get_ar_tipo_by_model_name_and_relation($element_tipo, $model_name='table', $relation_type='parent', $search_exact=true);
		$ar_section_tipo 	= common::get_ar_related_by_model('section', reset($table_element_tipo));
		$section_tipo 	 	= reset($ar_section_tipo);
		*/
		$section_tipo 	 	= $options->section_tipo ?? null;


		return $section_tipo;
	}//end map_to_section_tipo



	/**
	* GENERATE_RDF
	* @param object $options
	*  sample:
	*  {
	* 	...
	*    "propiedades" : {
	* 		"process_dato": "diffusion_sql::generate_rdf",
	* 		diffusion_element_tipo": "numisdata325"
	* 	 },
	* 	...
	*  }
	* @param int $dato
	*  section_id sample: 1
	* @return string $rdf
	* sample:
	*  <?xml version="1.0" encoding="utf-8"...
	*/
	public static function generate_rdf($options, $dato) {

		include_once DEDALO_CORE_PATH . '/diffusion/class.diffusion_rdf.php';

		$section_tipo			= $options->section_tipo;
		$section_id				= $dato;
		$diffusion_element_tipo	= $options->properties->diffusion_element_tipo;

		$diffusion_rdf	= new diffusion_rdf(null);
		$response		= $diffusion_rdf->update_record((object)[
			'section_tipo'				=> $section_tipo,
			'section_id'				=> $section_id,
			'diffusion_element_tipo'	=> $diffusion_element_tipo,
			'save_file'					=> false
		]);

		$rdf = $response->data ?? null;

		return $rdf;
	}//end generate_rdf



	/**
	* ANONYMIZED_NAME
	* Process given components data to anonymize the values.
	* Like 'Juan Pérez Marina' to 'JPM'
	* @param object $options
	* {
	*	"section_tipo": "dmm1023",
	*	"section_id": 16,
	*	"diffusion_element_tipo": "mdcat2195",
	*	"lang": "lg-cat",
	*	"properties": {
	*		"process_dato": "diffusion_sql::anonymized_name",
	*		"process_dato_arguments": {
	*			"target_component_tipo": [
	*				"rsc85",
	*				"rsc86"
	*			],
	* 			"anonymized_type": "name_capitals"
	*		}
	*	},
	*	"tipo": "mdcat4587",
	*	"component_tipo": "dmm1041"
	* }
	* @param array|null dato
	*	Is a portal dato
	* @return string $section_tipo
	*/
	public static function anonymized_name( object $options,  ?array $dato ) : ?string {

		if (empty($dato)) {
			return null;
		}

		$target_component_tipo	= $options->properties->process_dato_arguments->target_component_tipo ?? [];
		$anonymized_type		= $options->properties->process_dato_arguments->anonymized_type ?? 'name';
		$lang = $options->lang;
		$mode = 'list';

		$ar_values = [];
		foreach ($dato as $locator) {

			$ar_parts = [];

			$section_id		= $locator->section_id;
			$section_tipo	= $locator->section_tipo;

			foreach ($target_component_tipo as $tipo) {
				$model = ontology_node::get_modelo_name_by_tipo($tipo,true);
				$component = component_common::get_instance(
					$model, // string model
					$tipo, // string tipo
					$section_id, // string section_id
					$mode, // string mode
					$lang, // string lang
					$section_tipo // string section_tipo
				);

				$diffusion_value = $component->get_diffusion_value();
				if (!empty($diffusion_value)) {

					switch ($anonymized_type) {
						case 'name_capitals':
						default:
							$string_parts = explode(' ', $diffusion_value);
							foreach ($string_parts as $spart) {
								$first_char = mb_substr($spart, 0, 1);
								$ar_parts[] = mb_strtoupper($first_char);
							}
							break;
					}
				}
			}

			$ar_values[] = implode('', $ar_parts);
		}

		$value = implode(',', $ar_values);


		return $value;
	}//end anonymized_name



	/**
	* STR_PAD
	* Returns current value with n pads from left Like 1 => 00001
	* @param object $options
		* {
		* 	"section_tipo": "dmm1023",
		*	"section_id": 3,
		*	"diffusion_element_tipo": "mdcat2195",
		*	"lang": "lg-cat",
		*	"properties": {
		*		"process_dato": "diffusion_sql::str_pad",
		*		"process_dato_arguments": {
		*			"lenght": 5,
		*			"pad": "0"
		*		}
		*	},
		*	"tipo": "mdcat4586",
		*	"component_tipo": "dmm1045"
		* }
	* @param int|string dato
	*	Is a section_id from component_section_id value
	* @return string $pad_value
	*/
	public static function str_pad(object $options,  $dato) : string {

		$lenght	= $options->properties->process_dato_arguments->lenght ?? 1;
		$pad	= $options->properties->process_dato_arguments->pad ?? '0';
		$value	= $dato ?? '';

		$pad_value = str_pad($value,  $lenght, $pad, STR_PAD_LEFT);


		return $pad_value;
	}//end str_pad



	/**
	* MAP_TO_TERMINOID
	* Returns current section tipo like 'es1'
	* @param object $options
	* @param int|string dato
	*	Is a section_id from component_section_id value
	* @return string $section_tipo
	*/
	public static function map_to_terminoID(object $options,  $dato) : string {

		$section_tipo	= $options->section_tipo;
		$section_id		= $dato;

		$terminoID = $section_tipo .'_'. $section_id;


		return $terminoID;
	}//end map_to_terminoID



	/**
	* MAP_LOCATOR_TO_INT_RECURSIVE
	* Convert array of locators (dato) to array of section_id.
	* If isset propiedades->process_dato_arguments->custom_arguments->add_parents as true
	* it will be recursive
	* @param object $options
	* @param array|null $dato
	* @return array|null $value
	*/
	public static function map_locator_to_int_recursive($options=null, $dato=null) : ?array {

		if (empty($dato)) {
			return null;
		}

		$value = [];
		foreach ($dato as $current_locator) {

			$value[] = (string)$current_locator->section_id;

			// parents recursive
			// add parents option
			// if defined in properties, get current locator parents recursively and add it to current value (like municipality, region, country hierarchy)
				if (isset($options->properties->process_dato_arguments->custom_arguments->add_parents) && $options->properties->process_dato_arguments->custom_arguments->add_parents===true) {
					// get_parents_recursive($section_id, $section_tipo, $skip_root=true, $is_recursion=false)
					$ar_parents = component_relation_parent::get_parents_recursive(
						$current_locator->section_id,
						$current_locator->section_tipo,
						// (object)[
						// 	'skip_root' => true,
						// 	'search_in_main_hierarchy' => true
						// ]
					);
					foreach ($ar_parents as $parent_locator) {
						$value[] = (string)$parent_locator->section_id;
					}
				}
		}


		return $value;
	}//end map_locator_to_int_recursive



	/**
	* MAP_LOCATOR_TO_TERMINOID_PARENT
	* Alias of map_to_terminoID
	* @param object $options
	* @param array|null $dato
	* @return string|null $terminoID
	* Used to trigger parent publication when children is published (useful in thesaurus web publications like mupreva)
	*/
	public static function map_locator_to_terminoID_parent($options, $dato) {

		# Reference:
		# dato:
		#   [0] => stdClass Object
		#   (
		#       [section_tipo] => mupreva2564
		#       [section_id] => 1
		#       [component_tipo] => mupreva2571
		#   )
		# options:
		#   [typology] =>
		#   [value] =>
		#   [tipo] => mupreva2586
		#   [parent] => 2
		#   [lang] => lg-vlca
		#   [section_tipo] => mupreva2564
		#   [caler_id] => 3
		#   [properties] => stdClass Object
		#       (
		#           [varchar] => 128
		#           [process_dato] => diffusion_sql::map_locator_to_terminoID_parent
		#       )
		#   [diffusion_element_tipo] => mupreva800

		$terminoID = null;

		// locator
			$locator = false;
			if (is_array($dato)) {
				$locator = reset($dato);
			}

		// Trigger update parent here
			if (!empty($locator)) {

				$section_tipo 			= $locator->section_tipo;
				$section_id 			= $locator->section_id;
				$diffusion_element_tipo = $options->diffusion_element_tipo;

				// Force section tipo from locator
				$options->section_tipo = $section_tipo;

				// compose term id
				$terminoID = diffusion_sql::map_to_terminoID($options, $section_id);

				// Set temporally to skip and force parent publication
				$current_skip_publication_state_check = $_SESSION['dedalo']['config']['skip_publication_state_check'] ?? 0;
				$_SESSION['dedalo']['config']['skip_publication_state_check'] = 1;

				// update record
					$diffusion = new diffusion_sql();
					$diffusion->update_record((object)[
						'section_tipo'				=> $section_tipo,
						'section_id'				=> (int)$section_id,
						'diffusion_element_tipo'	=> $diffusion_element_tipo,
						'resolve_references'		=> true
					]);
					debug_log(__METHOD__
						." Triggered diffusion::update_record for parent ($section_tipo  - $section_id)"
						, logger::DEBUG
					);

				// Restore previous skip_publication_state_check state
				$_SESSION['dedalo']['config']['skip_publication_state_check'] = $current_skip_publication_state_check;
			}


		return $terminoID;
	}//end map_locator_to_terminoID_parent



	/**
	* MAP_LOCATOR_TO_TERMINOID
	* Returns map first locator to plain "terminoID" like "es_2"
	* @param object $options
	* {
	*	properties : {
	* 		"process_dato": "diffusion_sql::map_locator_to_terminoID",
	*       "process_dato_arguments:": {
	*            "dato_splice": [ 2 ]
	*        }
	* 	},
	* 	...
	* }
	* @param array|null $dato
	* [
	* 	{
	*		"section_tipo": "dd0",
    *		"section_id": "5",
    *		"from_component_tipo": "ontology15"
    * 	}
	* ]
	* @return string|null $terminoID
	*/
	public static function map_locator_to_terminoID($options, $dato) : ?string {

		if (empty($dato)) {
			return null;
		}

		$properties = $options->properties ?? new stdClass();
		$process_dato_arguments	= $properties->process_dato_arguments ?? new stdClass();

		// ar_filter : process_dato_arguments->filtered_dato_by
		$ar_filter = $process_dato_arguments->filtered_dato_by ?? false;

		// use_parent
		$use_parent = $process_dato_arguments->use_parent ?? false;

		// dato_key. Selects a item from array based on array key (@see sample at dd828)
		$dato_key = $process_dato_arguments->dato_key ?? false;

		// replace
		$replace = $process_dato_arguments->replace ?? false;

		// prepend_parents
		// used in Ontology web. See 'dd0_1189'
		$prepend_parents = $process_dato_arguments->prepend_parents ?? false;
		if ($prepend_parents===true) {
			$ar_parents = [];
			foreach ((array)$dato as $current_locator) {
				$parents = component_relation_parent::get_parents_recursive(
					$current_locator->section_id,
					$current_locator->section_tipo,
					// (object)[
					// 	'skip_root' => true,
					// 	'search_in_main_hierarchy' => true
					// ]
				);
				$ar_parents = array_merge($ar_parents, $parents);
			}
			$dato = array_merge( array_reverse($ar_parents), $dato);
		}

		// add_parents
		// if defined in properties, get current locator parents recursively and add it to current value (like municipality, region, country hierarchy)
		$add_parents = $process_dato_arguments->add_parents ?? $process_dato_arguments->custom_arguments->add_parents ?? false;
		if ($add_parents===true) {
			$ar_parents = [];
			foreach ((array)$dato as $current_locator) {
				$parents = component_relation_parent::get_parents_recursive(
					$current_locator->section_id,
					$current_locator->section_tipo,
					// (object)[
					// 	'skip_root' => true,
					// 	'search_in_main_hierarchy' => true
					// ]
				);
				$ar_parents = array_merge($ar_parents, $parents);
			}
			$dato = array_merge($dato, $ar_parents);
		}

		$ar_terminoID = [];
		foreach ((array)$dato as $current_locator) {

			// data from component section_id data cases, compound a virtual locator
			if (is_integer($current_locator)) {
				$current_section_id = $current_locator;
				$current_locator = new locator();
					$current_locator->set_section_tipo($options->section_tipo);
					$current_locator->set_section_id($current_section_id);
			}

			if ($ar_filter!==false) foreach ($ar_filter as $filter_obj) {
				foreach ($filter_obj as $f_property => $f_value) {
					if (!property_exists($current_locator, $f_property) || $current_locator->{$f_property} != $f_value) {
						continue 3; // Ignore
					}
				}
			}
			if($use_parent===true) {
				$ar_parents = component_relation_parent::get_parents(
					$current_locator->section_id,
					$current_locator->section_tipo
				);
				$current_locator = $ar_parents[0] ?? null;
				if (empty($current_locator)) {
					debug_log(__METHOD__
						. " Skipped empty parent value from locator " . PHP_EOL
						. ' current_locator: ' . to_string($current_locator)
						, logger::WARNING
					);
					continue;
				}
			}

			$section_tipo	= $current_locator->section_tipo;
			$section_id		= $current_locator->section_id;

			$term_id = $section_tipo .'_'. $section_id;

			// replace (sample at dd805)
			if ($replace!==false) {
				$term_id = preg_replace('/'.$replace->regex.'/', $replace->replacement, $term_id);
			}

			$ar_terminoID[] = $term_id;
		}

		// empty case
		if (empty($ar_terminoID)) {
			return null;
		}

		// dato_key. Selects a item from array based on array key
		if ($dato_key!==false) {

			$terminoID = $ar_terminoID[$dato_key] ?? null;

			return $terminoID;
		}

		// encode as JSON string
		$terminoID = json_encode($ar_terminoID);


		return $terminoID;
	}//end map_locator_to_terminoID



	/**
	* MAP_LOCATOR_TO_TERM_ID
	* Alias of map_locator_to_terminoID
	* @see component_relation_common->map_locator_to_term_id
	* @return string $section_tipo
	*/
	public static function map_locator_to_term_id($options, $dato) {

		return self::map_locator_to_terminoID($options, $dato);
	}//end map_locator_to_term_id



	/**
	* MAP_LOCATOR_TO_SECTION_TIPO
	* Returns map first locator to plain "terminoID" like "es_2"
	* @return string $terminoID
	*/
	public static function map_locator_to_section_tipo($options, $dato) {

		$ar_filter = false;
		if (isset($options->properties->process_dato_arguments->filtered_dato_by)) {
			$ar_filter = $options->properties->process_dato_arguments->filtered_dato_by;
		}

		if (isset($options->properties->process_dato_arguments->use_parent)) {
			$use_parent = $options->properties->process_dato_arguments->use_parent;
		}else{
			$use_parent = false;
		}

		$section_tipo = null;

		if (!empty($dato)) {

			$section_tipo = array();
			foreach ((array)$dato as $current_locator) {

				if ($ar_filter!==false) foreach ($ar_filter as $filter_obj) {
					foreach ($filter_obj as $f_property => $f_value) {
						if (!property_exists($current_locator, $f_property) || $current_locator->{$f_property} != $f_value) {
							continue 3; // Ignore
						}
					}
				}
				if($use_parent===true) {
					$ar_parents = component_relation_parent::get_parents(
						$current_locator->section_id,
						$current_locator->section_tipo
					);
					$current_locator = $ar_parents[0];
				}

				$section_tipo[] = $current_locator->section_tipo;

				// add parents option
				// if defined in properties, get current locator parents recursively and add it to current value (like municipality, region, country hierarchy)
					if (isset($options->properties->process_dato_arguments->custom_arguments->add_parents) && $options->properties->process_dato_arguments->custom_arguments->add_parents===true) {
						# calculate parents and add to dato
						// get_parents_recursive($section_id, $section_tipo, $skip_root=true, $is_recursion=false)
						$ar_parents = component_relation_parent::get_parents_recursive(
							$current_locator->section_id,
							$current_locator->section_tipo,
							// (object)[
							// 	'skip_root' => true,
							// 	'search_in_main_hierarchy' => true
							// ]
						);
						foreach ($ar_parents as $parent_locator) {
							$section_tipo[] = $parent_locator->section_tipo;
						}
					}
			}


			$section_tipo = json_encode($section_tipo);
		}


		return $section_tipo;
	}//end map_locator_to_section_tipo



	/**
	* MAP_LOCATOR_TO_section_label
	* Returns map first locator to plain "terminoID" like "es_2"
	* @return string $terminoID
	*/
	public static function map_locator_to_section_label($options, $dato) {

		$section_tipo_encoded = self::map_locator_to_section_tipo($options, $dato);
		if (empty($section_tipo_encoded)) {
			return null;
		}

		$lang = $options->lang;

		// decode and return array
		$section_tipo = json_decode($section_tipo_encoded);

		$section_label = array_map(function($item) use($lang){
			$label = ontology_node::get_termino_by_tipo($item, $lang, true, true);
			return strip_tags($label);
		}, $section_tipo);

		// final string
		$section_label_encoded = json_encode($section_label, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);


		return $section_label_encoded;
	}//end map_locator_to_section_label



	/**
	* MAP_LOCATOR_TO_NAME
	* @return string|null $name
	*/
	public static function map_locator_to_name(object $options, $dato) : ?string {

		$section_tipo_encoded = self::map_locator_to_section_tipo($options, $dato);
		if (empty($section_tipo_encoded)) {
			return null;
		}

		// i.e. options
			// "properties": {
			//       "process_dato": "diffusion_sql::map_locator_to_name",
			//       "process_dato_arguments": {
			//           "custom_arguments": {
			//               "map": {
			//                   "numisdata6": "mints",
			//                   "peri1": "ts_period"
			//               }
			//           }
			//       }
			//   },

		// decode and return array
			$section_tipo = json_decode($section_tipo_encoded);

		// only first is used
			$section_tipo = reset($section_tipo);
			$map = $options->properties->process_dato_arguments->custom_arguments->map;

		// set name
			$name = isset($map->{$section_tipo})
				? $map->{$section_tipo}
				: null;

		return $name;
	}//end map_locator_to_name



	/**
	* MAP_TO_POLITICAL_TOPONYMY
	* @return string $term
	*/
	public static function map_to_political_toponymy($options, $dato) {

		#dump($options, ' options ++ '.to_string());
		#dump($dato, ' dato ++ '.to_string());

		// empty dato case
			if (empty($dato) || empty($dato[0]->from_component_tipo)) {
				return null;
			}

		// component to manage (usually component_autocomplete_hi)
			$tipo 		= $dato[0]->from_component_tipo;
			$model_name = ontology_node::get_modelo_name_by_tipo($tipo,true);

		// properties
			$properties = $options->properties;
			if (!isset($properties->political_toponymy_type)) {
				debug_log(__METHOD__
					." Error. Structure political_toponymy_type is not defined for tipo: ".to_string($tipo)
					, logger::ERROR
				);
				return null;
			}

		// options
			$toponymy_options = new stdClass();
				$toponymy_options->locator 	= $dato[0];
				$toponymy_options->lang 	= $options->lang;
				$toponymy_options->type 	= $properties->political_toponymy_type;

		// call get_political_toponymy
			$term = $model_name::get_political_toponymy($toponymy_options);


		return $term;
	}//end map_to_political_toponymy



	/**
	* MAP_PARENT_TO_NORDER
	* Returns number of order of current element based on parent array position of this element
	* @param object $options
	* sample:
	* {
	*    "typology": null,
	*    "value": null,
	*    "tipo": "dd710",
	*    "parent": 9, // current published record
	*    "lang": "lg-vlca",
	*    "section_tipo": "ww1",
	*    "caler_id": 3,
	*    "properties": {
	*        "process_dato": "diffusion_sql::map_parent_to_norder"
	*    },
	*    "diffusion_element_tipo": "murapa3",
	*    "component": {...}
	* }
	* @param array $dato
	*	Is array of parent locators
	* sample:
	* [
	*    {
	*        "section_tipo": "hierarchy1",
	*        "section_id": "271",
	*        "from_component_tipo": "ww28"
	*    }
	* ]
	* @return int $norder
	*/
	public static function map_parent_to_norder(object $options, $dato) : int {
		$norder = 0;

		// no dato case
			if (empty($dato)) {
				return $norder; // zero
			}

		// debug
			// dump($options, ' map_parent_to_norder options +/////'.to_string());
			// dump($dato, ' map_parent_to_norder dato +/////'.to_string());
			// dump(debug_backtrace(), ' bt debug_backtrace +/////'.to_string());

		// options. caller
			$caller_section_id		= $options->parent;
			$caller_section_tipo	= $options->section_tipo;

		// locator to find (current caller like from dd710)
			$locator_to_find = new locator();
				$locator_to_find->set_section_tipo($caller_section_tipo);
				$locator_to_find->set_section_id($caller_section_id);

		// children params
			$section_tipo	= $dato[0]->section_tipo;
			$section_id		= $dato[0]->section_id; // caller section_id.  $options->parent;

		// children tipo from current section
			$children_tipo = section::get_ar_children_tipo_by_model_name_in_section(
				$section_tipo,
				['component_relation_children'],
				true,
				true,
				true,
				true
			);

		// check found
			if (!isset($children_tipo[0])) {
				debug_log(__METHOD__
					." Error. searched component_relation_children not found in section '$section_tipo'"
					, logger::ERROR
				);
				return $norder; // zero
			}

		// component_relation_children
			$component_relation_children = component_common::get_instance(
				'component_relation_children', // string model
				$children_tipo[0], // string tipo
				$section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_NOLAN, // string lang
				$section_tipo // string section_tipo
			);
			$relation_children_dato = $component_relation_children->get_dato();
			foreach ($relation_children_dato as $key => $children_locator) {
				if( true===locator::compare_locators( $locator_to_find, $children_locator, ['section_tipo','section_id']) ) {
					$norder = $key;
					break;
				}
			}


		return $norder;
	}//end map_parent_to_norder



	/**
	* MAP_PROJECT_TO_SECTION_ID
	* @return array $ar_section_id
	*/
	public static function map_project_to_section_id($options, $dato) {

		$ar_section_id = array();

		$current_version = get_current_data_version();

		//prior to 4.8 dato : 49:2
		if($current_version[0] <= 4 && $current_version[1] <= 8) {

			foreach ((array)$dato as $key => $value) {
				$ar_section_id[] = (string)$key;
			}
		}else{
			//post to 4.9 dato: locator
			foreach ((array)$dato as $current_locator) {
				$ar_section_id[] = $current_locator->section_id;
			}
		}

		return (array)$ar_section_id;
	}//end map_project_to_section_id



	/**
	* CALCULATE_DURATION
	* properties generic postprocess data
	* Calculate the duration of all videos in current interview from portal and returns the total duration
	* @return $duration
	*/
	public static function calculate_duration($options, $dato, $format='secs') {

		$ar_duration = array();
		foreach ((array)$dato as $key => $locator) {

			$data_source	= $options->properties->data_source;
			$portal_tipo	= key($data_source);
			$component_tipo	= reset($data_source);


			$model_name	= ontology_node::get_modelo_name_by_tipo($component_tipo,true);
			$component	= component_common::get_instance(
				$model_name,
				$component_tipo,
				$locator->section_id,
				'list',
				DEDALO_DATA_LANG,
				$locator->section_tipo
			);
			$component_dato = $component->get_dato();
			$component_dato = reset($component_dato);

			$seconds = OptimizeTC::TC2seg($component_dato);

			$ar_duration[] = $seconds;
		}

		$total_seconds = 0;
		foreach ($ar_duration as $seconds) {
			$total_seconds = $total_seconds + $seconds;
		}

		switch ($format) {
			case 'total_tc':
				$duration =  OptimizeTC::seg2tc($total_seconds);
				break;

			case 'secs':
			default:
				$duration = (int)ceil($total_seconds);
				break;
		}

		return $duration;
	}//end calculate_duration



	/**
	* CALCULATE_MEASUREMENTS
	* @return
	*/
	public static function calculate_measurements($options, $dato) {

		# [typology] =>
		# [value] =>
		# [tipo] => mupreva1991
		# [parent] => 22252
		# [lang] => lg-fra
		# [section_tipo] => mupreva1
		# [caler_id] => 3
		# [properties] => stdClass Object
		#     (
		#         [process_dato] => diffusion_sql::calculate_measurements
		#     )

		$measurements = null;

		$diffusion_tipo = $options->tipo;
		$section_id 	= $options->parent;
		$lang 			= $options->lang;
		$section_tipo 	= $options->section_tipo;
		$ar_tipo 		= common::get_ar_related_by_model('component_portal',$diffusion_tipo);
		$component_tipo = reset($ar_tipo);
		$model_name 	= ontology_node::get_modelo_name_by_tipo($component_tipo,true);
		if($model_name!=='component_portal') return null;

		$component = component_common::get_instance(
			$model_name,
			$component_tipo,
			$section_id,
			'list',
			$lang,
			$section_tipo
		);

		#$measurements = $component->get_valor($lang);
		#$measurements = $component->get_valor( $lang, $data_to_be_used='valor_list', $records_separator='<br>', $fields_separator=', ' );
		#$measurements = strip_tags( $measurements );

		$dato = $component->get_dato();

		#
		# TERMINOS_RELACIONADOS . We get the related terms of the current component
		$ontology_node	= new ontology_node($component_tipo);
		$relation_nodes	= (array)$ontology_node->get_relations();


		# FIELDS
		$fields=array();
		foreach ($relation_nodes as $key => $ar_value) {
			foreach ($ar_value as $current_tipo) {
				$model_name = ontology_node::get_modelo_name_by_tipo($current_tipo,true);
				if (strpos($model_name, 'component_')!==false) {
					$fields[] = $current_tipo;
				}
			}
		}

		$ar_resolved=array();
		foreach( (array)$dato as $key => $value) {

			$section_tipo	= $value->section_tipo;
			$section_id		= $value->section_id;

			$ar_resolved[$section_id][] = $section_id;

			foreach ($fields as $current_tipo) {

				$model_name	= ontology_node::get_modelo_name_by_tipo($current_tipo,true);
				$component	= component_common::get_instance(
					$model_name,
					$current_tipo,
					$section_id,
					'edit',
					$lang,
					$section_tipo,
					true
				);
				$current_value_export = $component->get_valor( $lang );

				// Clean double spaces and remove \n
				#$current_value_export = str_replace(array("\n","  "),array(' ',' '),$current_value_export);

				$ar_resolved[$section_id][] = $current_value_export;
			}
		}

		$ar_valor_export=array();
		foreach ($ar_resolved as $key => $ar_value) {
			#$valor_export .= implode("\t", $ar_value).PHP_EOL;
			if (!empty($ar_value)) {

				$valor_line='';
				#$valor_line  = implode("\t", $ar_value);
				foreach ($ar_value as $ckey => $lvalue) {
					if ($ckey===0) {
						continue;
					}
					#dump($lvalue, ' lvalue ++ '.to_string());
					$lvalue=trim($lvalue);
					if (!empty($lvalue)) {
						$valor_line .= " " . $lvalue;
					}
				}
				$ar_valor_export[] = trim($valor_line);
			}
		}
		#$valor_export = $quotes.trim($valor_export).$quotes;

		$measurements = implode(PHP_EOL, $ar_valor_export);

		return $measurements;
	}//end calculate_measurements



	/**
	* COUNT_DATA_ELEMENTS
	* @return int $total
	*/
	public static function count_data_elements($options, $dato) {

		$model = get_class($options->component);

		$components_with_relations = component_relation_common::get_components_with_relations();

		if (is_array($dato) && in_array($model, $components_with_relations)) {
			$ar_result=[];
			foreach ($dato as $key => $current_locator) {

				$current_is_publicable = (isset($options->properties) && isset($options->properties->is_publicable))
					? (bool)$options->properties->is_publicable
					: diffusion::get_is_publicable($current_locator);

				if($current_is_publicable===true){
					$ar_result[] = $current_locator;
				}
			}
			$dato = $ar_result;
		}
		$total = count($dato);

		return (int)$total;
	}//end count_data_elements



	/**
	* SPLIT_DATA
	* @return int|null $total
	*/
	public static function split_data($options, $dato) {

		if(!isset($options->properties->process_dato_arguments->q)){
			return null;
		}
		$ar_q = $options->properties->process_dato_arguments->q;

		// ar_result . dato filtered
			$ar_result = [];
			foreach ($ar_q as $q) {
				$q_operator = $q->q_operator;
				$q_key 		= $q->key;

				switch ($q_operator) {
					case '=':
						if (isset($dato[$q_key])) {

							$current_is_publicable = (isset($options->properties) && isset($options->properties->is_publicable))
								? (bool)$options->properties->is_publicable
								: diffusion::get_is_publicable($dato[$q_key]);

							if($current_is_publicable===true){
								$ar_result[] = $dato[$q_key];
							}
						}
						break;
					case '>':
						foreach ($dato as $key => $current_locator) {
							if($key > $q_key){

								$current_is_publicable = (isset($options->properties) && isset($options->properties->is_publicable))
									? (bool)$options->properties->is_publicable
									: diffusion::get_is_publicable($current_locator);

								if($current_is_publicable===true){
									$ar_result[] = $current_locator;
								}
							}
						}
						break;
				}
			}


		if (isset($options->properties->process_dato_arguments->resolve_value) && true===$options->properties->process_dato_arguments->resolve_value) {

			// resolve_value true
			$component = clone $options->component;
			$component->set_dato($ar_result);

			$value = $component->get_diffusion_value($options->lang);
		}else{

			// resolve_value not defined (default)
			$value = array_map(function($item){
				return $item->section_id;
			}, $ar_result);
		}


		return $value;
	}//end split_data



	/**
	* RESOLVE_JER_DD_DATA
	* @return mixed
	*/
	public static function resolve_jer_dd_data($options, $dato) {

		// options
			$lang			= $options->lang;
			$properties	= $options->properties;
			$column			= $properties->process_dato_arguments->column;
			$mode			= $properties->process_dato_arguments->mode ?? null;
			$resolve_label	= $properties->process_dato_arguments->resolve_label ?? null;
			$term_id		= (!empty($dato)) // expected format ["dd1"]
				? reset($dato)
				: null;

			if (empty($term_id)) {
				return null;
			}

		switch ($column) {
			case 'esmodelo': // typology

				$RecordObj_dd	= new RecordObj_dd($term_id);
				$db_value		= $RecordObj_dd->get_esmodelo();

				$value = (bool)($db_value==='si');

				return $value;
				break;

			case 'modelo' : // object_model, object_model_label

				$RecordObj_dd	= new RecordObj_dd($term_id);
				$tipo			= $RecordObj_dd->get_modelo();

				$value = ($resolve_label===true && !empty($tipo))
					? RecordObj_dd::get_termino_by_tipo($tipo, DEDALO_STRUCTURE_LANG, $from_cache=true, $fallback=false)
					: (!empty($tipo) ? $tipo : null);

				return $value;
				break;

			case 'relaciones': // relations, relations_labels

				$tipos = ontology_node::get_ar_terminos_relacionados($term_id, $cache=true, $simple=true);

				$value = ($resolve_label===true && !empty($tipos))
					? array_map(function($item) use($lang){
						return ontology_node::get_termino_by_tipo($item, $lang, $from_cache=true, $fallback=true);
					  }, $tipos)
					: (!empty($tipos) ? $tipos : null);

				return $value;
				break;

			case 'parent': // children, children_labels, parent, parent_label, parenst, parents_label

				if ($mode==='get_children') {

					$ontology_node	= new ontology_node($term_id);
					$tipos			= $ontology_node->get_ar_children($term_id);

					$value = ($resolve_label===true && !empty($tipos))
						? array_map(function($item) use($lang){
							return ontology_node::get_termino_by_tipo($item, $lang, $from_cache=true, $fallback=true);
						  }, $tipos)
						: (!empty($tipos) ? $tipos : null);

				}else if ($mode==='get_parents') {

					$ontology_node	= new ontology_node($term_id);
					$tipos			= array_values( $ontology_node->get_ar_parents_of_this($ksort=true) );

					$value = ($resolve_label===true && !empty($tipos))
						? array_map(function($item) use($lang){
							return ontology_node::get_termino_by_tipo($item, $lang, $from_cache=true, $fallback=true);
						  }, $tipos)
						: (!empty($tipos) ? $tipos : null);

				}else{

					$ontology_node	= new ontology_node($term_id);
					$tipo			= $ontology_node->get_parent();

					$value = ($resolve_label===true && !empty($tipo))
						? ontology_node::get_termino_by_tipo($tipo, $lang, $from_cache=true, $fallback=true)
						: (!empty($tipo) ? $tipo : null);
				}

				return $value;
				break;

			case 'traducible': // translatable

				$RecordObj_dd	= new RecordObj_dd($term_id);
				$db_value		= $RecordObj_dd->get_traducible();

				$value = $db_value==='si'
					? true
					: false;

				return $value;
				break;

			case 'norden': // norder

				$ontology_node	= new ontology_node($term_id);
				$db_value		= $ontology_node->get_order_number();

				$value = intval($db_value)>0
					? intval($db_value)
					: 0;

				return $value;
				break;

			case 'propiedades': // properties

				$ontology_node	= new ontology_node($term_id);
				$db_value		= $ontology_node->get_propiedades();

				$value = !empty($db_value) ? $db_value : null;

				return $value;
				break;

			case 'properties': // properties

				$ontology_node	= new ontology_node($term_id);
				$db_value		= $ontology_node->get_properties();

				$value = !empty($db_value) ? $db_value : null;

				return $value;
				break;


			default:
				$value = null;
				break;
		}

		return null;
	}//end resolve_jer_dd_data



	/**
	* MAP_QUALITY_TO_INT
	* @return
	*/
	public static function map_quality_to_int($options, $dato) {
		$quality = 0;

		if ( isset($dato[0]) && isset($dato[0]->section_id) ) {
			$quality = $dato[0]->section_id;
		}

		return (int)$quality;
	}//end map_quality_to_int



	/**
	* MAP_LOCATOR_TO_INT
	* Get only the first locator section_id if exists
	* @return int | null
	*/
	public static function map_locator_to_int($options=null, $dato=null) {

		$value = (!empty($dato) && isset($dato[0]))
			? (int)$dato[0]->section_id
			: null;

		return $value;
	}//end map_locator_to_int



	/**
	* MAP_LOCATOR_TO_BOOLEAN
	* Transform locator value (usually a radio button)
	* Get only the first locator section_id if exists
	* @return string JSON encoded bool
	*/
	public static function map_locator_to_boolean($options=null, $dato=null) {

		$value = (!empty($dato) && isset($dato[0]))
			? ($dato[0]->section_id==1) // bool
			: false;

		return json_encode($value);
	}//end map_locator_to_boolean



	/**
	* MAP_LOCATOR_TO_VALUE
	* Transform locator value (usually a radio button) to value
	* Get only the first locator section_id if exists
	* @param object $options
	* {
	* 	"section_tipo": "dmm1023",
	*	"section_id": 1,
	*	"diffusion_element_tipo": "mdcat2195",
	*	"lang": "lg-cat",
	*	"properties": {
	*		"process_dato": "diffusion_sql::map_locator_to_value",
	*		"process_dato_arguments": {
	*			"map": {
	*				"1": 1,
	*				"2": 0
	*			}
	*		}
	*	},
	*	"tipo": "mdcat4622",
	*	"component_tipo": "dmm1082"
	* }
	* @param ?array $dato=null
	* @return mixed $mapped_value
	*/
	public static function map_locator_to_value(object $options, ?array $dato=null) : mixed {

		if (empty($dato) || empty($dato[0])) {
			return null;
		}

		$value = $dato[0]->section_id;

		// map is an object as {"1":true,"2":false}
		$map = $options->properties->process_dato_arguments->map;

		$mapped_value = $map->{$value} ?? null;

		// cast is an string
		$cast = $options->properties->process_dato_arguments->cast ?? null;
		if ($cast) {
			switch ($cast) {
				case 'int':
					$mapped_value = (int)$mapped_value;
					break;

				default:
					// code...
					break;
			}
		}

		return $mapped_value;
	}//end map_locator_to_value



	/**
	* BUILD_GEOLOCATION_DATA
	* @param object $options
	* @param mixed dato
	* @return string $result
	*/
	public static function build_geolocation_data(object $options, $dato) : string {

		$component = $options->component;

		$ar_elements = $component->build_geolocation_data(
			false, // bool geojson
		);

		$result = json_encode($ar_elements, JSON_UNESCAPED_UNICODE);

		return (string)$result; // json_encoded object
	}//end build_geolocation_data



	/**
	* BUILD_GEOLOCATION_DATA
	* @param object $options
	* @return string $result
	*/
		// public static function build_geolocation_data(object $options, $dato) : string {

		// 	$raw_data = !empty($dato)
		// 		? (array)$dato
		// 		: [];

		// 	$component_tipo = $options->component->get_tipo();

		// 	$ar_elements = component_text_area::build_geolocation_data(
		// 		$raw_data,
		// 		false, // boll geojson
		// 		$component_tipo
		// 	);
		// 	$result = json_encode($ar_elements, JSON_UNESCAPED_UNICODE);

		// 	return (string)$result; // json_encoded object
		// }//end build_geolocation_data



	/**
	* BUILD_GEOLOCATION_DATA_GEOJSON
	* @param object $options
	* @param mixed $dato
	* @see ontology publication use in mdcat4091
	* @return string $geolocation_data
	*/
	public static function build_geolocation_data_geojson($options, $dato) : string {

		// options
			// process_dato_arguments. (!) If call is from 'diffusion_sql::resolve_component_value' the path is 'options->process_dato_arguments'
			// but if call is directly from 'diffusion_sql::build_geolocation_data_geojson' the path is inside 'propiedades'
			$process_dato_arguments	= $options->process_dato_arguments ?? $options->properties->process_dato_arguments ?? null;
			$component				= $options->component;

		// geolocation_data
			$ar_elements = $component->build_geolocation_data(
				true
			);
			$geolocation_data = json_encode($ar_elements, JSON_UNESCAPED_UNICODE);

		// fallback optional
			if (empty($ar_elements)
				&& isset($process_dato_arguments)
				&& isset($process_dato_arguments->fallback)
				) {

				$fallback_tipo		= $process_dato_arguments->fallback->tipo;
				$fallback_method	= $process_dato_arguments->fallback->method;
				// lang
				$ontology_node		= new ontology_node($fallback_tipo);
				$lang				= $ontology_node->get_traducible()==='si'
					? $options->lang ?? DEDALO_DATA_LANG
					: DEDALO_DATA_NOLAN;

				$section_id			= $component->get_section_id();
				$section_tipo		= $component->get_section_tipo();
				$model				= ontology_node::get_modelo_name_by_tipo($fallback_tipo,true);
				$fallback_component	= component_common::get_instance(
					$model,
					$fallback_tipo,
					$section_id,
					'list',
					$lang,
					$section_tipo
				);
				if (method_exists($fallback_component,$fallback_method)) {

					$geolocation_data = $fallback_component->{$fallback_method}();

				}else{
					debug_log(__METHOD__
						." ERROR: Method $fallback_method DO NOT EXISTS IN COMPONENT '$fallback_tipo' "
						, logger::ERROR
					);
				}
			}

		return (string)$geolocation_data; // json_encoded object
	}//end build_geolocation_data_geojson



	/**
	* RETURN_EMPTY_STRING
	* Fake method to return true always
	* @return string
	*/
	public static function return_empty_string($options, $dato) {

		return '';
	}//end return_empty_string



	/**
	* RETURN_FIXED_VALUE
	* Fake method to return properties defined fixed value
	* @return string
	*/
	public static function return_fixed_value($options, $dato) {

		$value = $options->properties->process_dato_arguments->value ?? null;

		return $value;
	}//end return_fixed_value



	/**
	* MAP_TO_URL
	* Creates a full URL to access websites file like
	* 'https://monedaiberica.org/type/' + '1542'
	* @param object $options
	* @param mixed $dato
	* 	Usually a int (section_id)
	* @return string
	*/
	public static function map_to_url(object $options, $dato) {

		// base_url as 'https://monedaiberica.org/type/'
		$base_url = $options->properties->process_dato_arguments->base_url ?? '';

		// add as '1542'
		$add = !empty($dato)
			? to_string($dato)
			: '';

		// value composition
		$value = $base_url . $add;

		return $value;
	}//end map_to_url



	/**
	* OBJECT_TO_STRING
	* @return string
	*/
	public static function object_to_string($options, $dato) {

		return json_encode($dato, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	}//end object_to_string



	/**
	* RESOLVE_MULTIPLE
	* Note that in this case, 'process_dato_arguments' is an array instead object
	* Iterate all elements to collect the complete values
	* @param object $options
	* @param mixed $dato
	* @param string $default_separator = ' | '
	* @return string|null $value
	*/
	public static function resolve_multiple($options, $dato, $default_separator=' | ') : ?string {

		// check empty dato
			if (empty($dato) || !isset($dato[0])) {
				return null;
			}

		// process_dato_arguments. In this case is an array of objects
			$process_dato_arguments = (array)$options->properties->process_dato_arguments;

		// ar_value
			$ar_value = [];
			foreach ($process_dato_arguments as $current_options) {

				// method
					$current_method = $current_options->process_dato;

				// options. Each object inside resolve_multiple process_dato_arguments
					$new_options = clone $options;
						$new_options->properties = $current_options;

				// call method
					$current_value = $current_method($new_options, $dato, $default_separator);


				// empty_value. if defined, force custom empty value from properties arguments to insert into result array
					if (true===self::empty_value($current_value) && isset($current_options->empty_value)) {
						$current_value	= $current_options->empty_value; // any type is accepted: array, object, string ..
						$ar_value[]		= $current_value;
					}else{
						if($current_value!==null){
							$ar_value[] = $current_value;
						}
					}
			}

		// output optional. (!) Removed 11-06-2023 because process_dato_arguments is multiple (array)
			// $output = isset($process_dato_arguments->output) ? $process_dato_arguments->output : null;
			// switch ($output) {
			// 	case 'merged':
			// 		# Merge all arrays values in one only array
			// 		$ar_value 	= array_values($ar_value); // Restore array keys
			// 		$value 	  	= json_encode($ar_value, JSON_UNESCAPED_UNICODE);
			// 		break;

			// 	default:
			// 		$separator 	= $options->properties->separator ?? $default_separator;
			// 		$value 		= implode($separator, $ar_value);
			// 		break;
			// }

		// to string default action
			$separator	= $options->properties->separator ?? $default_separator;
			$value		= implode($separator, $ar_value);

		// check empty values
			if (true===self::empty_value($value)) {
				$value = null; // default empty value is 'null'
			}


		return $value;
	}//end resolve_multiple



	/**
	* RESOLVE_VALUE
	* @return mixed
	*/
	public static function resolve_value(object $options, $dato, string $default_separator=' | ') {

		if (isset($dato[0])) {
			$ar_locator = $dato;
		}else{
			return null;
		}

		// can be direct or passed by others
		$process_dato_arguments = (!isset($options->properties)) // use 'properties' here !
			? $options
			: (object)$options->properties->process_dato_arguments;

		$output = isset($process_dato_arguments->output)
			? $process_dato_arguments->output
			: null;

		// dato_splice. To cut dato for get only first, last, etc..
			if (isset($process_dato_arguments->dato_splice) && !empty($ar_locator)) {

				$dato_splice 	= $process_dato_arguments->dato_splice;
				$splice_values 	= is_array($dato_splice) ? $dato_splice : [$dato_splice];

				if (isset($splice_values[1])) {
					array_splice($ar_locator, $splice_values[0], $splice_values[1]);
				}else{
					array_splice($ar_locator, $splice_values[0]);
				}
			}

		#$ar_target_component_tipo = array_filter($process_dato_arguments, function($item) {
		#	return key($item) === 'target_component_tipo';
		#});
		#dump($ar_target_component_tipo, ' ar_target_component_tipo ++ '.to_string());
		#$object_component_tipo = reset($ar_target_component_tipo);
		if (!is_object($process_dato_arguments)) {
			dump($process_dato_arguments, ' error process_dato_arguments must be an object ++ '.to_string());
			debug_log(__METHOD__
				." ERROR PROCESS_DATO_ARGUMENTS MUST BE AN OBJECT "
				, logger::ERROR
			);
		}
		$target_component_tipo	= $process_dato_arguments->target_component_tipo;
		$model_name				= ontology_node::get_modelo_name_by_tipo($target_component_tipo,true);

		$ar_value = [];
		foreach ($ar_locator as $locator) {

			// empty check
				if (empty($locator->section_tipo) || empty($locator->section_id) || empty($model_name)) {
					continue;
				}

			// target is publishable check (see example of use in 'rsc703')
				$current_is_publicable = isset($process_dato_arguments->is_publicable)
					? (bool)$process_dato_arguments->is_publicable // override is_publicable verification (Bibliography case)
					: diffusion::get_is_publicable($locator);
				if ($current_is_publicable!==true) {
					// debug_log(__METHOD__
					// 	." + Skipped locator not publishable: ".to_string($locator)
					// 	, logger::DEBUG
					// );
					continue;
				}

			// component
				$component = ($model_name==='relation_list')
					? new relation_list($target_component_tipo,
										$locator->section_id,
										$locator->section_tipo,
										'list')
					: component_common::get_instance($model_name,
										$target_component_tipo,
										$locator->section_id,
										'list',
										$options->lang ?? DEDALO_DATA_LANG,
										$locator->section_tipo,
										false);
					// transliterable components like component_iri cases (see diffusion 'navarra132').
					// If the component does not have data in the current language, set DEDALO_DATA_NOLAN as the fallback value for Diffusion.
					if(strpos($model_name, 'component_')!==false && $component->get_lang()!==DEDALO_DATA_NOLAN && $component->with_lang_versions===true) {
						$dato = $component->get_dato();
						// fallback trans-liter-able data for component with_lang_versions
						if (empty($dato)) {
							$component->set_lang(DEDALO_DATA_NOLAN);
						}
					}

			// method
				$method = isset($process_dato_arguments->component_method)
					? $process_dato_arguments->component_method
					: 'get_diffusion_value'; // default

			// target_component_properties. Inject custom properties to target component to manage 'get_diffusion_value' or another called method
				if (isset($process_dato_arguments->target_component_properties)) {
					# Overwrite component properties
					$component->diffusion_properties = $process_dato_arguments->target_component_properties;
				}

			// arguments
				$custom_arguments = array();
				if (isset($process_dato_arguments->custom_arguments)) {
					$custom_arguments = (array)$process_dato_arguments->custom_arguments;
				}
				// add lang when get_diffusion_value is the method
				if ($method==='get_diffusion_value') {
					array_unshift($custom_arguments, $options->lang); // always as first argument (!)
				}

			// add current lang always
				if (isset($custom_arguments[0]) && !isset($custom_arguments[0]->lang)) {
					if (is_array($custom_arguments[0])) {
						$custom_arguments[0]['lang'] = $options->lang;
					}elseif (is_object($custom_arguments[0])) {
						$custom_arguments[0]->lang = $options->lang;
					}
				}

			// method call
				$value = call_user_func_array(array($component, $method), $custom_arguments);
				// dump($value, ' value ++ '.to_string("method: $method"));

			// process_dato (added 03-02-2021) @see mdcat3713 and actv108
				if ( isset($process_dato_arguments->process_dato) ) {
					$process_dato_arguments_inside = $process_dato_arguments->process_dato_arguments; // is a object

					$ar_parsed_values = [];

					// (!) add options as FIRST ARRAY ELEMENT to preserve the expected functions params order
					// When Ontology manager is updated (v6.4) the v5 properties are transformed from STRING to JSON
					// This cause that the order of the properties declaration changes in some cases (PostgreSQL JSON binary store)
					if (property_exists($process_dato_arguments_inside, 'options')) {
						// $ar_parsed_values[] = $process_dato_arguments_inside->options;
						$ar_parsed_values[] = $options;
					}

					foreach ($process_dato_arguments_inside as $ckey => $c_value) {
						if ($ckey==='options') {
							// (!) skip already added as first element bellow
							continue;
						}
						switch ($c_value) {
							case '$options':
								$ar_parsed_values[] = $options;
								break;
							case '$value':
								$ar_parsed_values[] = $value;
								break;
							default:
								$ar_parsed_values[] = $c_value;
								break;
						}
					}
					$value2 = call_user_func_array($process_dato_arguments->process_dato, $ar_parsed_values);
					if (!empty($value) && empty($value2)) {
						// something bad happened
						debug_log(__METHOD__
							." value2 is empty. Something bad happened? - process_dato_arguments->process_dato: ".to_string($process_dato_arguments->process_dato)
							, logger::ERROR
						);
					}
					$value = $value2;
				}

			// split string value (see qdp291)
				if (isset($process_dato_arguments->split_string_value) && $value!==null) {
					$value = json_encode( explode($process_dato_arguments->split_string_value, $value), JSON_UNESCAPED_UNICODE );
				}

			switch ($output) {
				case 'merged_unique_implode':
				case 'merged_unique':
				case 'merged_group': // see actv89
				case 'merged':
					// empty_value. if defined, force custom empty value from properties arguments to insert into result array
						if (true===self::empty_value($value) && isset($process_dato_arguments->empty_value)) {
							$value = $process_dato_arguments->empty_value; // any type is accepted: array, object, string ..
							$value_array = (is_array($value) || is_null($value))
								? $value
								: json_decode($value);
						}else{
							$value_array = (is_array($value) || is_null($value))
								? $value
								: json_decode($value);
						}

					if ($value_array!==null) {

						if ($output==='merged_group') {
							// actv89 people case
							$separator	= $process_dato_arguments->separator ?? $default_separator;
							$ar_value[]	= is_array($value_array)
								? implode($separator, $value_array)
								: $value_array;
						}else{
							// default
							foreach ((array)$value_array as $value_array_value) {
								$ar_value[] = $value_array_value;
							}
						}
					}
					break;

				case 'split_date_range':
					// used in numisdata935 to get indirect date
					$current_options	= $process_dato_arguments->output_options;
					$value				= self::split_date_range($current_options, $value);

					// store value in array
						if (isset($process_dato_arguments->empty_value)) {
							// always store
							$ar_value[] = $value;
						}else{
							// only store if not empty
							if (!empty($value) && $value!=='[]' && $value!=='{}') {
								$ar_value[] = $value;
							}
						}
					break;

				case 'ds':
					if (isset($process_dato_arguments->v6)) {

						// ds_tipo. get the component_tipo to be used as ds
						$ds_tipo = $process_dato_arguments->v6->data_to_be_used;

						// create the caller section to get his data
						$caller_section = section::get_instance(
							$locator->section_id,
							$locator->section_tipo
						);
						// get the relations data of the section to get the data of the component
						$caller_section_relations = $caller_section->get_relations();

						$ar_term_ds = [];
						$ar_locator_ds = array_filter($caller_section_relations, function($el) use ($ds_tipo) {
							if (!isset($el->from_component_tipo)) {
								debug_log(__METHOD__
									. "  Bad locator found (caller_section_relations). Ignored " . PHP_EOL
									. ' locator: ' . to_string($el)
									, logger::ERROR
								);
								return false;
							}
							return $el->from_component_tipo === $ds_tipo;
						});
						// create the term resolution of the data
						foreach ($ar_locator_ds  as $locator_ds) {
							$ar_term_ds[] = ts_object::get_term_by_locator( $locator_ds, $options->lang, $from_cache=true );
						}
						if (!empty($ar_term_ds)) {
							$ar_value[] = implode('|', $ar_term_ds);
						}
					}
					break;

				default:
					// empty_value. if defined, force custom empty value from properties arguments to insert into result array
						if (true===self::empty_value($value) && isset($process_dato_arguments->empty_value)) {
							$value = $process_dato_arguments->empty_value; // any type is accepted: array, object, string ..
						}

					// convert to string always
						if (is_array($value) || is_object($value)) {
							$value = json_encode($value, JSON_UNESCAPED_UNICODE);
						}else{
							$value = $value;
						}

					// store value in array
						if (isset($process_dato_arguments->empty_value)) {
							// always store
							$ar_value[] = $value;
						}else{
							// only store if not empty
							if (!empty($value) && $value!=='[]' && $value!=='{}') {
								$ar_value[] = $value;
							}
						}
					break;
			}//end switch ($output)
		}//end foreach ($ar_locator as $locator)


		switch ($output) {
			case 'merged_unique_implode':
				// @see numisdata1028
				if (is_array($ar_value)) {
					$separator	= isset($process_dato_arguments->separator) ? $process_dato_arguments->separator : $default_separator;
					$ar_value	= array_unique($ar_value, SORT_REGULAR);
					$value		= implode($separator, $ar_value);
				}
				break;
			case 'merged_unique':
				// @see numisdata1028
				if (is_array($ar_value)) {
					$ar_value = array_unique($ar_value, SORT_REGULAR);
				}
				// note execution here continues without break (!)
			case 'merged':
			case 'merged_group':
				# Merge all arrays values in one only array
				#$ar_value	= array_unique($ar_value);
				$ar_value	= array_values($ar_value); // Restore array keys
				$value		= json_encode($ar_value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
				break;

			default:
				$separator	= isset($process_dato_arguments->separator) ? $process_dato_arguments->separator : $default_separator;
				$value		= implode($separator, $ar_value);
				break;
		}

		# Remove duplicates
		#$uar_value	= explode(',',$value);
		#$uar_value	= array_unique($uar_value);
		#$value		= implode(',',$ar_value);

		if (true===self::empty_value($value)) {
			$value = null; // default empty value is 'null'
		}


		return $value;
	}//end resolve_value



	/**
	* SPLIT_DATE_RANGE
	* Split and format a component_date value
	* sample of properties config
	* // Indirect (mdcat4595):
	* {
	*	"process_dato": "diffusion_sql::resolve_value",
	*	"process_dato_arguments": {
	*		"target_component_tipo": "rsc89",
	*		"component_method": "get_dato",
	*		"output": "split_date_range",
	*		"output_options": {
	*			"selected_key": 0,
	*			"selected_date": "start",
	*			"date_format": "year"
	*		}
	*	}
	* }
	* // Direct config (mdcat4608)
	* {
	*	  "process_dato": "diffusion_sql::split_date_range",
	*	  "process_dato_arguments": {
	*		"selected_key": 0,
	*		"selected_date": "end",
	*		"date_format": "year"
	*	  }
	* }
	* @see mdcat4595 to get indirect call config (using diffusion_sql::resolve_value)
	* @param object $options
	* @param array|null $dato
	* @return string|null
	*/
	public static function split_date_range(object $options, ?array $dato) : ?string {

		$process_dato_arguments = (!isset($options->properties))
			? $options // case direct from resolve value output
			: (object)$options->properties->process_dato_arguments; // default case

		// two levels case and with options (numisdata1046)
		// added to allow compatibility with numisdata1046 and numisdata1047 properties configuration
		if (isset($process_dato_arguments->process_dato_arguments->options)) {
			$process_dato_arguments = $process_dato_arguments->process_dato_arguments->options;
		}

		$selected_key 	= isset($process_dato_arguments->selected_key)  ? (int)$process_dato_arguments->selected_key : 0;
		$selected_date 	= isset($process_dato_arguments->selected_date) ? $process_dato_arguments->selected_date : false; // 'start';
		$date_format 	= isset($process_dato_arguments->date_format) ? $process_dato_arguments->date_format : 'full';

		// debug
			// dump($options, ' split_date_range options ++ '.to_string());
			// dump($dato, ' split_date_range dato ++ '.to_string());
			// dump($process_dato_arguments, ' process_dato_arguments ++ '.to_string());
			// dump($selected_date, ' selected_date ++ '.to_string());

		// Check array key exists
			if (!isset($dato[$selected_key])) {
				return null;
			}

		if ($selected_date!==false) {

			if (!isset($dato[$selected_key]->$selected_date)) {
				return null;
			}
			$date_obj = $dato[$selected_key]->$selected_date;

		}else{

			$date_obj = $dato[$selected_key];
		}


		// date_format
		switch ($date_format) {
			case 'year':
				$dd_date	= new dd_date($date_obj);
				$value		= $dd_date->year;
				break;
			case 'unix_timestamp':
				$dd_date	= new dd_date($date_obj);
				$value		= $dd_date->get_unix_timestamp();
				break;
			case 'time':
				$dd_date	= new dd_date($date_obj);
				$value		= $dd_date->get_dd_timestamp($date_format="H:i:s", $padding=true);
				break;
			case 'date':
				$dd_date	= new dd_date($date_obj);
				$value		= $dd_date->get_dd_timestamp($date_format="Y-m-d", $padding=true);
				break;
			case 'full':
			default:
				// Default
				$dd_date	= new dd_date($date_obj);
				$value		= $dd_date->get_dd_timestamp($date_format="Y-m-d H:i:s", $padding=true);
				break;
		}


		return $value;
	}//end split_date_range



	/**
	* GET_DIFFUSION_SECTIONS_FROM_DIFFUSION_ELEMENT
	* Used to determine when show publication button in sections
	* Called from class diffusion to get the RDF portion of sections
	* @param string $diffusion_element_tipo
	* @param string|null $class_name = null
	* @return array $ar_diffusion_sections
	*/
	public static function get_diffusion_sections_from_diffusion_element( string $diffusion_element_tipo, ?string $class_name=null ) : array {

		$ar_diffusion_sections = array();

		// root point of reference to search tables
		$reference_root_element = $diffusion_element_tipo;

		// database_alias check . $tipo, $model_name, $relation_type, $search_exact=false
			$database_alias_tipo = ontology_node::get_ar_tipo_by_model_name_and_relation(
				$diffusion_element_tipo,
				'database_alias',
				'children',
				true
			)[0] ?? null;
			if ($database_alias_tipo) {
				$real_database_tipo = ontology_node::get_ar_tipo_by_model_name_and_relation(
					$database_alias_tipo,
					'database',
					'termino_relacionado',
					true
				)[0] ?? null;
				if (!empty($real_database_tipo)) {
					// override reference_root_element
					$reference_root_element = $real_database_tipo;
				}
			}

		// tables. ontology_node::get_ar_tipo_by_model_name_and_relation($diffusion_element_tipo, $model_name='table', $relation_type='children_recursive', $search_exact=false);
			$ar_table_tipo = ontology_node::get_ar_tipo_by_model_name_and_relation(
				$reference_root_element, // database tipo
				'table', // modelo_name
				'children_recursive', // relation_type
				false // search_exact (allow 'table' and 'table_alias')
			);

		// database_alias case
			// $database_alias_tipo = $diffusion_element_tipo;
			if ($database_alias_tipo && $reference_root_element!==$database_alias_tipo) {
				// replace current tables list with modified parsed version
				$ar_table_tipo = diffusion::parse_database_alias_tables($ar_table_tipo, $database_alias_tipo);
			}

		foreach ($ar_table_tipo as $current_table_tipo) {

			$related_section = diffusion_sql::get_related_section($current_table_tipo);
			if (!empty($related_section)) {
				$ar_diffusion_sections[] = $related_section;
			}
		}


		return $ar_diffusion_sections;
	}//end get_diffusion_sections_from_diffusion_element



	/**
	* GET_RELATED_SECTION
	* Resolves target section_tipo from diffusion table
	* Allows v5 properties definition (used for special Ontology sections as 'rsc0')
	* @return string|null $related_section
	*/
	public static function get_related_section(string $table_tipo) : ?string {

		// properties way (implemented to allow Ontology sections like 'dd0')
			$ontology_node	= new ontology_node($table_tipo);
			$properties		= $ontology_node->get_propiedades(true);
			$target_section = $properties->target_section ?? null;
			if (!empty($target_section)) {
				// resolved section tipo
				return $target_section;
			}

		// relation way (default)
			$model_name = ontology_node::get_modelo_name_by_tipo($table_tipo,true);
			switch ($model_name) {

				case 'table_alias':
					// First try section (thesaurus needed)
					$ar_related = common::get_ar_related_by_model('section', $table_tipo);
					if (!isset($ar_related[0])) {
						// If not, We search 'table' now
						$ar_table = common::get_ar_related_by_model('table', $table_tipo);
						if (isset($ar_table[0])) {
							$ar_related = common::get_ar_related_by_model('section', $ar_table[0]);
						}
					}
					break;

				case 'table':
				default:
					// Pointer to section
					$ar_related = common::get_ar_related_by_model('section', $table_tipo);
					break;
			}

			$related_section = $ar_related[0] ?? null;


		return $related_section;
	}//end get_related_section



	/**
	* EMPTY_VALUE
	* Check if a value is considered empty
	* @return bool
	*/
	public static function empty_value($value) : bool {

		return (bool)( (empty($value) || $value==='[]') && $value!='0' );
	}//end empty_value



	/**
	* MAP_RELATIONS
	* @return null
	*/
	public function map_relations($options, $dato) {

		// unfinished !

		return null;
	}//end map_relations



}//end class diffusion_sql
