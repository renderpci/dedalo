<?php declare(strict_types=1);
/**
* AREA_MAINTENANCE
* System administrator's area with useful methods to
* backup, review data, update Ontology, etc.
* @see API entry point dd_area_maintenance_api.class
*/
class area_maintenance extends area_common {



	// tables_with_relations
	static $ar_tables_with_relations = [
		'matrix_users',
		'matrix_projects',
		'matrix',
		'matrix_list',
		'matrix_activities',
		'matrix_hierarchy',
		'matrix_hierarchy_main',
		'matrix_langs',
		'matrix_layout',
		'matrix_notes',
		'matrix_profiles',
		'matrix_test',
		'matrix_indexations',
		'matrix_structurations',
		'matrix_dd',
		'matrix_layout_dd',
		'matrix_activity',
		'matrix_tools'
	];//end ar_tables_with_relations



	/**
	* ITEM_MAKE_BACKUP
	* @return object $item
	*/
	public function item_make_backup() : object {

		// short vars
			$mysql_db = defined('API_WEB_USER_CODE_MULTIPLE') ? API_WEB_USER_CODE_MULTIPLE : null;

		// item
			$item = new stdClass();
				$item->id		= 'make_backup';
				$item->type		= 'widget';
				$item->label	= label::get_label('make_backup') ?? 'Make backup';
				$item->value	= (object)[
					'dedalo_db_management'	=> DEDALO_DB_MANAGEMENT,
					'backup_path'			=> DEDALO_BACKUP_PATH_DB,
					'file_name'				=> date("Y-m-d_His") .'.'. DEDALO_DATABASE_CONN .'.'. DEDALO_DB_TYPE .'_'. logged_user_id() .'_forced_dbv' . implode('-', get_current_data_version()).'.custom.backup',
					'mysql_db'				=> $mysql_db, // first 10 items
				];


		return $item;
	}//end item_make_backup



	/**
	* GET_AR_WIDGETS
	* Definition of all visible widgets in the area
	* Every widget has the client side code in JavaScript
	* @return array $data_items
	*	Array of widget objects
	*/
	public function get_ar_widgets() : array {

		$ar_widgets = [];

		// make_backup *
			$item	= $this->item_make_backup();
			$widget	= $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// regenerate_relations * . Delete and create again table relations records
			$item = new stdClass();
				$item->id		= 'regenerate_relations';
				$item->type		= 'widget';
				$item->label	= 'Regenerate relations table data';
				$item->value	= (object)[
					'body' => 'Delete and create again table relations records based on locators data of sections in current selected table/s',
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// update_ontology *
			$item = new stdClass();
				$item->id		= 'update_ontology';
				$item->type		= 'widget';
				$item->label	= label::get_label('update_ontology') ?? 'Update Ontology';
				$item->value	= null;
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// register_tools *
			$item = new stdClass();
				$item->id		= 'register_tools';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= label::get_label('registrar_herramientas');
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// move_tld
			$item = new stdClass();
				$item->id		= 'move_tld';
				$item->type		= 'widget';
				$item->label	= 'Move TLD';
				$item->value	= (object)[
					'body' => 'Move TLD defined map items from source (ex. numisdata279) to target (ex. tchi1).<br>
							   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_tld.<br>
							   Note: this can be a very long process because it has to go through all the records in all the tables.',
					'files' => area_maintenance::get_definitions_files( 'move_tld' )
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// move_locator
			$item = new stdClass();
				$item->id		= 'move_locator';
				$item->type		= 'widget';
				$item->label	= 'Move locator';
				$item->value	= (object)[
					'body' => 'Move locator defined map items from source (ex. rsc194) to target (ex. rsc197) adding new section_id based in the last section_id of destiny.<br>
							   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_locator.<br>
							   Note: this can be a very long process because it has to go through all the records in all the tables.',
					'files' => area_maintenance::get_definitions_files( 'move_locator' )
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// move_to_portal
			$item = new stdClass();
				$item->id		= 'move_to_portal';
				$item->type		= 'widget';
				$item->label	= 'Move to portal';
				$item->value	= (object)[
					'body' => 'Move data from a section to another linked section and link together with a portal (e.g. "Use and function" components behind qdp443 to section rsc1340).<br>
							   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_to_portal.<br>
							   Note: this can be a very long process because it has to go through all the records in all the tables.',
					'files' => area_maintenance::get_definitions_files( 'move_to_portal' )
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// move_to_table
			$item = new stdClass();
				$item->id		= 'move_to_table';
				$item->type		= 'widget';
				$item->label	= 'Move to table';
				$item->value	= (object)[
					'body' => 'Move data from a table to another (e.g. move utoponymy1 to matrix_hierarchy).<br>
							   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_to_table.<br>',
					'files' => area_maintenance::get_definitions_files( 'move_to_table' )
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// move_lang
			$item = new stdClass();
				$item->id		= 'move_lang';
				$item->type		= 'widget';
				$item->label	= 'Move LANG';
				$item->value	= (object)[
					'body' => 'Convert map items (e.g., hierarchy89) between translatable and non-translatable components (or vice-versa).<br>
							   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_lang.<br>
							   Note: This process can be very time-consuming, as it iterates through all relevant records in the database.',
					'files' => area_maintenance::get_definitions_files( 'move_lang' )
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// build_database_version *
			$item = new stdClass();
				$item->id		= 'build_database_version';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= label::get_label('build_database_version') ?? 'Build database version';
				$item->value	= null; // loaded from self widget
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// update_data_version *
			$item = new stdClass();
				$item->id		= 'update_data_version';
				$item->class	= 'success width_100';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= label::get_label('update').' '.label::get_label('data');
				$item->value	= null; // loaded from self widget
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// update_code *
			$item = new stdClass();
				$item->id		= 'update_code';
				$item->type		= 'widget';
				$item->label	= label::get_label('update') .' '. label::get_label('code');
				$item->value	= null; // loaded from self widget
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// check_config *
			$item = new stdClass();
				$item->id		= 'check_config';
				$item->class	= empty($missing) ? 'success' : 'danger';
				$item->type		= 'widget';
				$item->label	= label::get_label('check_config') ?? 'Check config';
				$item->value	= null; // loaded from self widget
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// export_hierarchy *
			$item = new stdClass();
				$item->id		= 'export_hierarchy';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= label::get_label('export_hierarchy') ?? 'Export hierarchy';
				$item->value	= null;
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// publication_api *
			$item = new stdClass();
				$item->id		= 'publication_api';
				$item->type		= 'widget';
				$item->label	= 'Publication server API';
				$item->value	= (object)[
					'dedalo_diffusion_domain'			=> DEDALO_DIFFUSION_DOMAIN,
					'dedalo_diffusion_resolve_levels'	=> DEDALO_DIFFUSION_RESOLVE_LEVELS,
					'api_web_user_code_multiple'		=> API_WEB_USER_CODE_MULTIPLE,
					'dedalo_diffusion_langs'			=> DEDALO_DIFFUSION_LANGS,
					'diffusion_map'						=> diffusion::get_diffusion_map(
						DEDALO_DIFFUSION_DOMAIN,
						true // bool connection_status
					)
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// add_hierarchy *
			$item = new stdClass();
				$item->id		= 'add_hierarchy';
				$item->type		= 'widget';
				$item->class	= 'success width_100';
				$item->label	= label::get_label('instalar') .' '. label::get_label('jerarquias');
				$item->value	= null; // loaded from self widget
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// dedalo_api_test_environment *
			$item = new stdClass();
				$item->id		= 'dedalo_api_test_environment';
				$item->class	= 'green fit width_100';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= 'DÉDALO API TEST ENVIRONMENT';
				$item->value	= null; // loaded from self widget
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// sqo_test_environment *
			$item = new stdClass();
				$item->id		= 'sqo_test_environment';
				$item->class	= 'blue fit width_100';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= 'SEARCH QUERY OBJECT TEST ENVIRONMENT';
				$item->value	= null; // loaded from self widget
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// lock_components *
			$item = new stdClass();
				$item->id		= 'lock_components';
				$item->class	= 'width_100';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= 'Lock components status';
				$item->value	= (object)[
					'active_users' => (object)[ // mimic api response object
						'result'			=> true,
						'ar_user_actions'	=> []
					]
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// php_user *
			$php_user_info		= system::get_php_user_info();
			$php_error_log_path	= system::get_error_log_path();
			$item = new stdClass();
				$item->id		= 'php_user';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= 'PHP USER';
				$item->value	= (object)[
					'info' => $php_user_info,
					'php_error_log_path' => $php_error_log_path,
					'php_session_path' => session_save_path()
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// database_info *
			$item = new stdClass();
				$item->id		= 'database_info';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= 'DATABASE INFO';
				$item->value	= null; // loaded from self widget
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// environment *
			$item = new stdClass();
				$item->id		= 'environment';
				$item->type		= 'widget';
				$item->label	= 'Environment';
				$item->value	= null; // loaded from self widget
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// unit_test *
			$item = new stdClass();
				$item->id		= 'unit_test';
				$item->type		= 'widget';
				$item->label	= 'Unit test area';
				$item->value	= null; // loaded from self widget
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// sequences_status *
			$response = db_tasks::check_sequences();
			$item = new stdClass();
				$item->id		= 'sequences_status';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= 'DB SEQUENCES STATUS';
				$item->value	= $response;
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// counters_status *
			$item = new stdClass();
				$item->id		= 'counters_status';
				$item->class	= 'width_100';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= 'DEDALO COUNTERS STATUS';
				$item->value	= null; // loaded from self widget
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// php_info *
			$item = new stdClass();
				$item->id		= 'php_info';
				$item->class	= 'violet fit width_100';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= 'PHP INFO';
				$item->value	= (object)[
					'src' => DEDALO_CORE_URL.'/area_maintenance/widgets/php_info/php_info.php'
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// system_info *
			$item = new stdClass();
				$item->id		= 'system_info';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= 'SYSTEM INFO';
				$item->class	= 'width_100';
				$item->value	= (object)[
					'src' => DEDALO_CORE_URL.'/area_maintenance/system_info.php'
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;


		return $ar_widgets;
	}//end get_ar_widgets



	/**
	* WIDGET_FACTORY
	* Unified way to create an area-development widget
	* @param object $item
	* @return object $widget
	*/
	public function widget_factory(object $item) : object {

		$widget = new stdClass();
			$widget->id			= $item->id;
			$widget->class		= $item->class ?? null;
			$widget->type		= 'widget';
			$widget->tipo		= $item->tipo ?? $this->tipo;
			$widget->parent		= $item->parent ?? $this->tipo;
			$widget->label		= $item->label ?? 'Undefined label for: '.$this->tipo;
			$widget->info		= $item->info ?? null;
			$widget->body		= $item->body  ?? null;
			$widget->run		= $item->run ?? [];
			$widget->trigger	= $item->trigger ?? null;
			$widget->value		= $item->value ?? null;


		return $widget;
	}//end widget_factory



	/**
	* GET_DEDALO_BACKUP_FILES
	* Called from widget 'make_backup'
	* @param object $options
	* {
	* 	max_files: int 10
	* 	psql_backup_files: bool true
	* 	mysql_backup_files: bool true
	* }
	* @return object $response
	*/
	public static function get_dedalo_backup_files(object $options) : object {

		// options
			$max_files			= $options->max_files ?? 10;
			$psql_backup_files	= $options->psql_backup_files ?? true;
			$mysql_backup_files	= $options->mysql_backup_files ?? true;

		// result
			$result = new stdClass();

			// psql_backup_files
				if ($psql_backup_files===true) {
					$files = backup::get_backup_files(); // postgresql files
					$result->psql_backup_files = array_slice($files, 0, $max_files); // first N items
				}

			// mysql_backup_files
				if ($mysql_backup_files===true) {
					$files = backup::get_mysql_backup_files(); // MariaDB/MySQL files
					$result->mysql_backup_files = array_slice($files, 0, $max_files); // first N items
				}

		// response
			$response = new stdClass();
				$response->result	= $result;
				$response->msg		= 'OK. Request done';


		return $response;
	}//end get_dedalo_backup_files



	/**
	* REGENERATE_RELATIONS
	* Re-creates relationships between components in given tables (or all of then)
	* All relationships pointers are stored in table 'relations' for easy search. This function
	* deletes the data in that table and and rebuild it from component's locators
	* @param object $options
	* {
	* 	tables: string ('matrix_hierarchy','*')
	* }
	* @return object $response
	*/
	public static function regenerate_relations(object $options) : object {

		// options
			$tables = $options->tables ?? '*';

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= ['Error. Request failed '.__METHOD__];
			$response->errors	= [];

		// tables to propagate
			$ar_tables = (function($tables) {

				if ($tables==='*') {
					// all relation able tables (implies to truncate relations table)
					return area_maintenance::$ar_tables_with_relations;
				}else{
					// is a list comma separated of tables like matrix,matrix_hierarchy
					$ar_tables = [];
					$items = explode(',', $tables);
					foreach ($items as $table) {
						$ar_tables[] = trim($table);
					}
					return $ar_tables;
				}
			})($tables);

		// truncate relations table on *
			if ($tables==='*') {

				// CLI msg
				if ( running_in_cli()===true ) {
					print_cli((object)[
						'msg' => 'Truncating table "relations"'
					]);
				}

				// truncate relations table data
				$strQuery	= 'TRUNCATE "relations";';
				$result		= JSON_RecordDataBoundObject::search_free($strQuery);
				if ($result===false) {
					$response->msg = $response->msg[0].' - Unable to truncate table relations!';
					$response->errors[] = 'Failed truncating table relations';
					return $response;
				}
				// restart table sequence
				$strQuery	= 'ALTER SEQUENCE relations_id_seq RESTART WITH 1;';
				$result		= JSON_RecordDataBoundObject::search_free($strQuery);
				if ($result===false) {
					$response->msg = $response->msg[0].' - Unable to alter SEQUENCE relations_id_seq!';
					$response->errors[] = 'Failed changing sequence relations_id_seq';
					return $response;
				}
			}

		foreach ($ar_tables as $table) {

			$counter = 1;

			// last id in current table
				$strQuery	= "SELECT id FROM $table ORDER BY id DESC LIMIT 1;";
				$result		= JSON_RecordDataBoundObject::search_free($strQuery);
				if ($result===false) {
					$response->msg[] ='Table \''.$table.'\' not found!';
					$response->msg 	 = implode('<br>', $response->msg);
					$response->errors[] = 'Table not found: '.to_string($table);
					return $response;
				}
				$rows = pg_fetch_assoc($result);
				if (!$rows) {
					continue;
				}
				$max = $rows['id'];
				$min = ($table==='matrix_users')
					? -1
					: 1;

			// CLI msg
				if ( running_in_cli()===true ) {
					print_cli((object)[
						'msg'		=> 'Processing table: ' . $table .' | Records: ' . $max,
						'memory'	=> dd_memory_usage()
					]);
				}

			// iterate from 1 to last id
			for ($i=$min; $i<=$max; $i++) {

				$strQuery	= "SELECT section_id, section_tipo, datos FROM $table WHERE id = $i";
				$result		= JSON_RecordDataBoundObject::search_free($strQuery);
				if($result===false) {
					$msg = "Failed Search id $i. Data is not found.";
					$response->errors[] = 'Failed Search';
					debug_log(__METHOD__." ERROR: $msg ".to_string(), logger::ERROR);
					continue;
				}
				$n_rows = pg_num_rows($result);

				if ($n_rows<1) continue; // empty table case

				while($rows = pg_fetch_assoc($result)) {

					$section_id		= $rows['section_id'];
					$section_tipo	= $rows['section_tipo'];
					$datos			= json_decode($rows['datos']);

					if (!empty($datos) && isset($datos->relations)) {

						// component_dato
							$component_dato = [];
							foreach ($datos->relations as $current_locator) {
								if (isset($current_locator->from_component_tipo)) {
									$component_dato[$current_locator->from_component_tipo][] = $current_locator;
								}else{
									debug_log(__METHOD__
										." Error on get from_component_tipo from locator (table:$table) (ignored)" . PHP_EOL
										.' current_locator: ' . to_string($current_locator)
										, logger::ERROR
									);
									$response->errors[] = 'Error on get from_component_tipo from locator: ' . to_string($current_locator);
								}
							}

						// propagate component dato
							foreach ($component_dato as $from_component_tipo => $ar_locators) {

								// CLI msg
									if ( running_in_cli()===true ) {
										print_cli((object)[
											'msg'		=> 'Propagating table: ' . $table . ' | section_tipo: ' . $section_tipo .' | section_id: ' . $section_id .' | component_tipo: ' . $from_component_tipo,
											'tables'	=> $ar_tables
										]);
									}

								$propagate_options = new stdClass();
									$propagate_options->ar_locators			= $ar_locators;
									$propagate_options->section_id			= $section_id;
									$propagate_options->section_tipo		= $section_tipo;
									$propagate_options->from_component_tipo	= $from_component_tipo;

								// propagate_component_dato_to_relations_table takes care of delete and insert new relations
								search::propagate_component_dato_to_relations_table($propagate_options);
							}

					}else{
						debug_log(__METHOD__
							." ERROR: Empty datos from: " . PHP_EOL
							.' table: ' . to_string($table) . PHP_EOL
							.' section_tipo: ' . to_string($section_tipo) . PHP_EOL
							.' section_id: ' . to_string($section_id)
							, logger::ERROR
						);
						$response->errors[] = 'Empty data from table' . to_string($table);
					}
				}

				// debug
					if(SHOW_DEBUG===true) {
						# Show log msg every 100 id
						if ($counter===1) {
							debug_log(__METHOD__." Updated section data table $table $i", logger::DEBUG);
						}
						$counter++;
						if ($counter>300) {
							$counter = 1;
						}
					}

			}//end for ($i=$min; $i<=$max; $i++)

			// msg add table
				$response->msg[] = " Updated table data table $table ";

		}//end foreach ($ar_tables as $key => $table)

		// response
			$response->result	= true;
			$response->msg[0]	= count($response->errors)===0 // Override first message
				? 'OK. All data is propagated successfully'
				: 'Warning: errors found in data propagation';


		return $response;
	}//end regenerate_relations



	/**
	* GET_FILE_CONSTANTS
	* Get all config file constants using a regex
	* @param string $file
	* 	full file path like DEDALO_CONFIG_PATH . '/sample.config.php'
	* @return array $constants_list
	*/
	public static function get_file_constants($file) : array {

		if (!file_exists($file)) {
			return [];
		}

		$input_lines = file_get_contents($file);
		if(empty($input_lines)) {
			return [];
		}

		// regex search
		preg_match_all('/[^\/\/ #]define\(\'(\S*)\',.*/', $input_lines, $output_array);
		$constants_list = $output_array[1] ?? [];


		return $constants_list;
	}//end get_file_constants



	/**
	* RECREATE_DB_ASSETS
	* Force to re-build the PostgreSQL main indexes, extensions and functions
	* @return object $response
	*/
	public static function recreate_db_assets() : object {

		$response = new stdClass();
			$response->result	= new stdClass();
			$response->msg		= 'Error. Request failed ';
			$response->errors	= [];
			$response->success	= 0;
		//extensions
		$response_extensions	= db_tasks::create_extensions();
			$response->result->extensions	= $response_extensions->result;
			$response->errors				= $response_extensions->errors;
		//constaints
		$response_constaints	= db_tasks::rebuild_constaints();
			$response->result->constaints	= $response_constaints->result;
			$response->errors				= array_merge($response->errors, $response_constaints->errors);
		// functions
		$response_functions		= db_tasks::rebuild_functions();
			$response->result->functions	= $response_functions->result;
			$response->errors[]				= array_merge($response->errors, $response_functions->errors);
		// indexes
		$response_indexes		= db_tasks::rebuild_indexes();
			$response->result->indexes		= $response_indexes->result;
			$response->errors[]				= array_merge($response->errors, $response_indexes->errors);
		// maintenance
		$response_maintenance	= db_tasks::exec_maintenance();
			$response->result->maintenance	= $response_maintenance->result;
			$response->errors[]				= array_merge($response->errors, $response_maintenance->errors);


		return $response;
	}//end recreate_db_assets



	/**
	* CREATE_DB_EXTENSIONS
	* Force to create the PostgreSQL main extensions
	* @return object $response
	*/
	public static function create_db_extensions() : object {

		$response = db_tasks::create_extensions();

		return $response;
	}//end create_db_extensions



	/**
	* REBUILD_DB_CONSTAINTS
	* Force to create the PostgreSQL constraints
	* @return object $response
	*/
	public static function rebuild_db_constaints() : object {

		$response = db_tasks::rebuild_constaints();

		return $response;
	}//end rebuild_db_constaints



	/**
	* REBUILD_DB_FUNCTIONS
	* Force to re-build the PostgreSQL main functions
	* @return object $response
	*/
	public static function rebuild_db_functions() : object {

		$response = db_tasks::rebuild_functions();

		return $response;
	}//end rebuild_db_functions



	/**
	* REBUILD_DB_INDEXES
	* Force to re-build the PostgreSQL main indexes
	* @return object $response
	*/
	public static function rebuild_db_indexes() : object {

		$response = db_tasks::rebuild_indexes();

		return $response;
	}//end rebuild_db_indexes



	/**
	* EXEC_DB_MAINTENANCE
	* Force to perform a basic PostgreSQL maintenance for indexing
	* @return object $response
	*/
	public static function exec_db_maintenance() : object {

		$response = db_tasks::exec_maintenance();

		return $response;
	}//end exec_db_maintenance



	/**
	* CONSOLIDATE_TABLES
	* Remunerates table id column to consolidate id sequence from 1,2,...
	* @param object $options
	* @return object $response
	*/
	public static function consolidate_tables( object $options ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ';
			$response->errors	= [];
			$response->success	= 0;

		// options
		$tables = $options->tables ?? [];

		$ar_tables = ['dd_ontology','matrix_ontology','matrix_ontology_main','matrix_dd'];

		// exec
		foreach ($tables as $table) {

			if (!in_array($table, $ar_tables)) {
				debug_log(__METHOD__
					. " Ignored non allow table " . PHP_EOL
					. ' table: ' . to_string($table)
					, logger::ERROR
				);
				continue;
			}

			$result = db_tasks::consolidate_table( $table );

			if($result === false){
				$response->errors[]	= 'It is not possible to consolidate the table: '.$table;
				return $response;
			}
		}

		// response OK
		$response->result	= true;
		$response->msg		= count($response->errors)>0
			? 'Warning. Request done with errors'
			: 'OK. Request done successfully';


		return $response;
	}//end consolidate_tables



	/**
	* LONG_PROCESS_STREAM
	* Print a sequential number every 1000 milliseconds
	* Used to test long processes and timeouts issues
	* @param object $options
	* {
	* 	iterations: int,
	* 	update_rate: int
	* }
	* @return object|void
	*/
	public static function long_process_stream(object $options) {

		// options
			$iterations		= $options->iterations ?? 10;
			$update_rate	= $options->update_rate ?? 1000;

		// error_log_path
			$error_log_path = ini_get('error_log');

		if (running_in_cli()===true) {

			// executing from dd_utils_api::get_process_status (area maintenance panel)

			$counter = 0;
			while(1){

				$counter++;

				trigger_error('FAKE ERROR TESTING CLI ERROR LOG ini_get error_log: '.$error_log_path.' - '.$counter.' ');

				// end runner case
				if ($counter>$iterations) {
					$result = (object)[
						'msg'			=> 'Iterations completed ' . $iterations,
						'iterations'	=> $iterations,
						'update_rate'	=> $update_rate,
						'memory'		=> dd_memory_usage()
					];
					// return is printed by manager too
					return $result; // stop the loop here
				}

				// print notification
				print_cli((object)[
					'msg'			=> 'Iteration ' . $counter . ' of ' . $iterations,
					'iterations'	=> $iterations,
					'update_rate'	=> $update_rate,
					'memory'		=> dd_memory_usage()
				]);

				// sleep process
				$ms = $update_rate; usleep( $ms * 1000 );
			}

		}else{

			// direct call version

			$start_time=start_time();

			// session unlock
			session_write_close();

			// header print as event stream
			header("Content-Type: text/event-stream");
			header("Cache-Control: no-cache");
			header('Connection: keep-alive');
			header("Access-Control-Allow-Origin: *");
			header('X-Accel-Buffering: no'); // nginx buffer control

			$i=0;
			while(1){

				$counter = $i++;

				$data = (object)[
					'msg' => '(no cli version) Iteration ' . $counter
				];

				$output = (object)[
					'is_running'	=> true,
					'data'			=> $data,
					'time'			=> date("Y-m-d H:i:s"),
					'total_time'	=> exec_time_unit_auto($start_time),
					'update_rate'	=> $update_rate,
					'errors'		=> []
				];

				// debug
					if(SHOW_DEBUG===true) {
						error_log('process loop: is_running output: ' .PHP_EOL. json_encode($output) );
					}

				// output the response JSON string
					$a = json_handler::encode($output, JSON_UNESCAPED_UNICODE);

				// fix Apache issue where small chunks are not sent correctly over HTTP
					if ($_SERVER['SERVER_PROTOCOL']==='HTTP/1.1') {
						$len = strlen($a);
						if ($len < 4096) {
							// re-create the output object and the final string
							$fill_length = 4096 - $len;
							$output->fill_buffer = $fill_length . str_pad(' ', $fill_length);
							$a = json_handler::encode($output, JSON_UNESCAPED_UNICODE);
						}
					}

					echo $a;
					echo "\n\n";

				while (ob_get_level() > 0) {
					ob_end_flush();
				}
				flush();

				// break the loop if the client aborted the connection (closed the page)
				if ( connection_aborted() ) break;

				$ms = $update_rate;
				usleep( $ms * 1000 );
			}
			die();
		}
	}//end long_process_stream



	/**
	* MAKE_BACKUP
	* Alias of backup::init_backup_sequence
	* Exec a full pg_dump of current Dédalo database
	* Is fired by widget 'make_backup'
	* @return object $response
	*/
	public static function make_backup() : object {

		$user_id				= logged_user_id();
		$username				= logged_user_username();
		$skip_backup_time_range	= true;

		$response = backup::init_backup_sequence((object)[
			'user_id'					=> $user_id,
			'username'					=> $username,
			'skip_backup_time_range'	=> $skip_backup_time_range
		]);


		return $response;
	}//end make_backup



	/**
	* MAKE_MYSQL_BACKUP
	* Alias of backup::make_mysql_backup
	* Exec a full MySQL dump of current Publication database
	* @return object $response
	*/
	public static function make_mysql_backup() : object {

		$response = backup::make_mysql_backup();


		return $response;
	}//end make_mysql_backup



	/**
	* CREATE_TEST_RECORD
	* This record it's necessary to run unit_test checks
	* Table 'matrix_test' must to exists
	* @return object $response
	*/
	public static function create_test_record() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$db_conn		= DBi::_getConnection();
			$section_tipo	= 'test3';
			$table			= 'matrix_test';

		// test data
			$datos = file_get_contents( dirname(__FILE__) . '/test_data.json' );

		// exec SQL
			$sql = '
				TRUNCATE "'.$table.'";
				ALTER SEQUENCE '.$table.'_id_seq RESTART WITH 1;
				INSERT INTO "'.$table.'" ("section_id", "section_tipo", "datos") VALUES (\'1\', \''.$section_tipo.'\', \''.$datos.'\');
			';
			debug_log(__METHOD__
				." Executing DB query "
				.to_string($sql)
				, logger::WARNING
			);
			$result = pg_query($db_conn, $sql);
			if (!$result) {
				$msg = " Error on db execution (matrix_counter): ".pg_last_error(DBi::_getConnection());
				debug_log(__METHOD__
					. $msg . PHP_EOL
					. ' SQL: ' . $sql
					, logger::ERROR
				);
				$response->msg = $msg;
				return $response;
			}

		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;


		return $response;
	}//end create_test_record



	/**
	* REGISTER_TOOLS
	* Alias of tools_register::import_tools
	* @return object $response
	* {
	*	result: array|false (on success, list of imported tools objects)
	* 	msg: string
	* 	errors: array
	* }
	*/
	public static function register_tools() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// import_tools
			$response->result = tools_register::import_tools();

		// check results errors
			$errors = [];
			if (!empty($response->result)) {
				foreach ($response->result as $item) {
					if (!empty($item->errors)) {
						$errors = array_merge($errors, (array)$item->errors);
					}
				}
			}
			$response->errors = $errors;

		$response->msg = empty($errors)
			? 'OK. Request done successfully'
			: 'Warning. Request done with errors';


		return $response;
	}//end register_tools



	/**
	* BUILD_INSTALL_VERSION
	* Alias of install::build_install_version
	* @return object $response
	*/
	public static function build_install_version() : object {

		// build
		$response = install::build_install_version();


		return $response;
	}//end build_install_version



	/**
	* UPDATE_DATA_VERSION
	* Updates Dédalo data version.
	* Allow change components data format or add new tables or index
	* Triggered by Area Development button 'UPDATE DATA'
	* Sample: Current data version: 5.8.2 -----> 6.0.0
	* @param object $options
	* {
		"updates_checked": {
			"SQL_update_1": true,
			"components_update_1": true,
			"components_update_2": true,
			"components_update_3": true,
			"components_update_4": true,
			"run_scripts_1": true,
			"run_scripts_2": true
		}
	* }
	* @return object $response
	*/
	public static function update_data_version(object $options) : object {

		// options
			$updates_checked = $options->updates_checked;

		// set time limit
			set_time_limit ( 259200 );  // 3 days

		include_once DEDALO_CORE_PATH . '/base/update/class.update.php';

		$response = new stdClass();
			$response->result	= false;
			$response->errors	= [];
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// DEDALO_SUPERUSER only
			if (logged_user_id()!=DEDALO_SUPERUSER) {
				$response->msg = 'Error. Only Dédalo superuser can do this action';
				return $response;
			}

		// DEDALO_MAINTENANCE_MODE
			$maintenance_mode = defined('DEDALO_MAINTENANCE_MODE_CUSTOM')
				? DEDALO_MAINTENANCE_MODE_CUSTOM
				: DEDALO_MAINTENANCE_MODE;
			if ($maintenance_mode!==true) {
				$response->msg = 'Error. Update data is not allowed if Dédalo is not in maintenance_mode';
				return $response;
			}

		try {

			// exec update_data_version. return object response
				$update_data_version_response = update::update_version($updates_checked);

		} catch (Exception $e) {

			debug_log(__METHOD__
				. " Caught exception [update_data_version]: " . PHP_EOL
				. ' msg: ' . $e->getMessage()
				, logger::ERROR
			);

			$update_data_version_response = (object)[
				'result'	=> false,
				'msg'		=> 'ERROR on update_data_version .Caught exception: ' . $e->getMessage()
			];

			// log line
				$update_log_file = DEDALO_CONFIG_PATH . '/update.log';
				$log_line  = PHP_EOL . date('c') . ' ERROR [Exception] ';
				$log_line .= PHP_EOL . 'Caught exception: ' . $e->getMessage();
				file_put_contents($update_log_file, $log_line, FILE_APPEND | LOCK_EX);
		}

		$response->result	= $update_data_version_response->result ?? false;
		$response->msg		= $update_data_version_response->msg ?? 'Error. Request failed ['.__FUNCTION__.']';
		$response->errors 	= array_merge($response->errors, $update_data_version_response->errors);


		return $response;
	}//end update_data_version


	/**
	* SET_CONGIF_CORE
	* This function set a custom maintenance mode. Useful when the root user
	* do not have access to the config file to edit
	* @param object $options
	* @return object $response
	*/
	private static function set_congif_core(object $options) {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
				$response->errors	= [];

		// options
			$name	= $options->name; // name of the constant like 'MAINTENANCE_MODE_CUSTOM'
			$value	= $options->value ?? null; // value of the constant like bool 'false'

		// user root check. Only root user can set congif_core
			if (logged_user_id()!==DEDALO_SUPERUSER
				// && is_ontology_available() // only blocks if no Ontology error was detected (recovery case)
				&& $name!=='DEDALO_RECOVERY_MODE'
				&& (!defined('DEDALO_RECOVERY_MODE') || DEDALO_RECOVERY_MODE==false)
				) {
				$response->msg = 'Error. only root user can set congif_core';
				return $response;
			}

		// value. check valid value type
			$value_type = gettype($value);

		// special parsers
			switch ($name) {

				case 'DEDALO_MAINTENANCE_MODE_CUSTOM':
					// boolean
					$ar_allow_type = ['boolean'];
					if (!in_array($value_type, $ar_allow_type)) {
						$response->msg = 'Error. invalid value type. Only allow boolean';
						return $response;
					}
					$write_value = json_encode( (bool)$value );
					break;

				case 'DEDALO_RECOVERY_MODE':
					// boolean
					$ar_allow_type = ['boolean'];
					if (!in_array($value_type, $ar_allow_type)) {
						$response->msg = 'Error. invalid value type. Only allow boolean';
						return $response;
					}
					$write_value = json_encode( (bool)$value );
					break;

				// Disable (Experimental with serious security implications)
				case 'DEDALO_NOTIFICATION_CUSTOM':
					if (logged_user_id()!==DEDALO_SUPERUSER) {
						$response->msg = 'Error. only root user can set congif_core';
						return $response;
					}
					// string|boolean
					$ar_allow_type = ['boolean','string'];
					if (!in_array($value_type, $ar_allow_type)) {
						$response->msg = 'Error. invalid value type. Only allow boolean|string';
						return $response;
					}
					if (is_string($value)) {
						$msg = safe_xss($value);
						$write_value = '["msg" => "'.trim($msg).'", "class_name" => "warning"]';
					}else{
						$write_value = 'false'; // no true is expected
					}
					break;

				default:
					$response->msg = 'Error. Invalid name';
					return $response;
			}

		// write_value check
			if (!is_string($write_value)) {
				$response->msg = 'Error. invalid value (3)';
				return $response;
			}

		// config_core file (config_core.php)
			$config		= install::get_config();
			$file_path	= $config->config_core_file_path;

		// content string from file
			$content = file_get_contents($file_path);

		// add vars
		if (strpos($content, $name)===false) {

			// file do not exists or const DEDALO_MAINTENANCE_MODE_CUSTOM it's not defined case

			// line
			$line = PHP_EOL . "define('$name', ".$write_value.");";
			// Write the contents to the file,
			// using the FILE_APPEND flag to append the content to the end of the file
			// and the LOCK_EX flag to prevent anyone else writing to the file at the same time
			if(!file_put_contents($file_path, $line, FILE_APPEND | LOCK_EX)) {

				$response->msg = 'Error (2). It\'s not possible set the constant, review the PHP permissions to write in Dédalo directory: '.$file_path;
				debug_log(__METHOD__
					. ' ' . $response->msg .PHP_EOL
					. 'file: '.$file_path
					, logger::ERROR
				);
				return $response;
			}

			$response->result	= true;
			$response->msg		= 'All ready';

			debug_log(__METHOD__
				." Added config_core line with constant: $name  "
				, logger::DEBUG
			);

		}elseif (strpos($content, $name)!==false) {

			// file and constant exists like 'DEDALO_MAINTENANCE_MODE_CUSTOM'

			// replace line to updated value
			$content = preg_replace(
				'/define\(\''.$name.'\',.+\);/',
				'define(\''.$name.'\', '.$write_value.');',
				$content
			);
			// Write the contents to the file,
			// using the LOCK_EX flag to prevent anyone else writing to the file at the same time
			if(!file_put_contents($file_path, $content, LOCK_EX)) {
				$response->msg = 'Error (3). It\'s not possible set the constant, review the PHP permissions to write in Dédalo directory: ' . $file_path;
				debug_log(__METHOD__." ".$response->msg, logger::ERROR);
				return $response;
			}

			$response->result	= true;
			$response->msg		= 'All ready';

			debug_log(__METHOD__
				." Changed config_core content with constant: $name = '".to_string($value)."' "
				, logger::DEBUG
			);
		}


		return $response;
	}//end set_congif_core



	/**
	* SET_MAINTENANCE_MODE
	* Changes Dédalo maintenance mode from true to false or vice-versa
	* Uses area_maintenance:: set_congif_core to overwrite the core_config files
	* Input and output are normalized objects to allow use it from area_maintenance API
	* @param object $options
	* {
	* 	value : bool
	* }
	* @return object $response
	*/
	public static function set_maintenance_mode( object $options ) : object {

		// options
			$value = $options->value;

		// check value type
			if (!is_bool($value)) {
				$response = new stdClass();
					$response->result	= false;
					$response->msg		= 'Error. Request failed';
					$response->errors	= [];
				return $response;
			}

		$response = area_maintenance::set_congif_core((object)[
			'name'	=> 'DEDALO_MAINTENANCE_MODE_CUSTOM',
			'value'	=> $value
		]);


		return $response;
	}//end set_maintenance_mode



	/**
	* SET_RECOVERY_MODE
	* Changes Dédalo recovery mode from true to false or vice-versa
	* Uses area_recovery::set_congif_core to overwrite the core_config files
	* Input and output are normalized objects to allow use it from area_recovery API
	* Could be changed from area_mainteanance check_config widget
	* or automatically from API start
	* @see dd_core_api->start
	* @param object $options
	* {
	* 	value : bool
	* }
	* @return object $response
	*/
	public static function set_recovery_mode( object $options ) : object {

		// options
			$value = $options->value;

		// check value type
			if (!is_bool($value)) {
				$response = new stdClass();
					$response->result	= false;
					$response->msg		= 'Error. Request failed';
					$response->errors	= [];
				return $response;
			}

		// set config_core constant value
		area_maintenance::set_congif_core((object)[
			'name'	=> 'DEDALO_RECOVERY_MODE',
			'value'	=> $value
		]);

		// set environmental var accessible in all Dédalo just now
		$_ENV['DEDALO_RECOVERY_MODE'] = $value;

		$response = new stdClass();
			$response->result	= true;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end set_recovery_mode



	/**
	* SET_NOTIFICATION
	* Writes the given notification text to config_core
	* Note that this custom notifications are stored in core_config file
	* and read from API update_lock_components_state on every component activation/deactivation
	* @param object $options
	* {
	* 	value : string
	* }
	* @return object $response
	*/
	public static function set_notification( object $options ) : object {

		// options
			$value = $options->value;

		// check value type
			if (!is_string($value) && !is_bool($value)) {
				$response = new stdClass();
					$response->result	= false;
					$response->msg		= 'Error. Request failed. value is not string or bool';
					$response->errors	= [];
				return $response;
			}

		// set config_core constant value
		area_maintenance::set_congif_core((object)[
			'name'	=> 'DEDALO_NOTIFICATION_CUSTOM',
			'value'	=> $value
		]);

		$response = new stdClass();
			$response->result	= true;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end set_notification



	/**
	* GET_DEFINITIONS_FILES
	* Get the list of JSON files in the directory:
	* 	/dedalo/core/base/transform_definition_files
	* @return array
	*/
	public static function get_definitions_files( string $directory ) : array {

		$files_list = get_dir_files(
			DEDALO_CORE_PATH . '/base/transform_definition_files/'.$directory,
			['json'],
			function($el) {

				$path_parts	= pathinfo($el);
				$basename	= $path_parts['basename'] ?? 'unknown';
				$content	= file_get_contents($el);
				if (!empty($content)) {
					$content = json_decode($content);
				}

				return (object)[
					'file_name'	=> $basename,
					'content'	=> $content
				];
			}
		);


		return $files_list;
	}//end get_definitions_files



	/**
	* MOVE_TLD
	* Transform Dédalo data from all tables replacing tipos
	* using selected JSON file map
	* Is called from widget 'move_tld' as process
	* @param object $options
	* {
	* 	files_selected : array ['finds_numisdata279_to_tchi1.json']
	* }
	* @return object $response
	*/
	public static function move_tld(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options
			$files_selected = $options->files_selected;
			if (empty($files_selected)) {
				$response->errors[] = 'empty files_selected';
				return $response;
			}

		// files
			$definitions_files	= area_maintenance::get_definitions_files( 'move_tld' );
			$json_files			= array_filter($definitions_files, function($el) use($files_selected){
				return in_array($el->file_name, $files_selected);
			});
			if (empty($json_files)) {
				$response->errors[] = 'json_files not found';
				return $response;
			}

			// ar_file_name
			$ar_file_name = array_values(
				array_map(function($el){
					return $el->file_name;
				}, $json_files)
			);

		// process changes_in_tipos
			$ar_tables = [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_counter',
				'matrix_dataframe',
				'matrix_dd',
				'matrix_hierarchy',
				'matrix_hierarchy_main',
				'matrix_indexations',
				'matrix_layout',
				'matrix_layout_dd',
				'matrix_list',
				'matrix_nexus',
				'matrix_nexus_main',
				'matrix_notes',
				'matrix_profiles',
				'matrix_projects',
				'matrix_stats',
				'matrix_time_machine'
			];
			require_once DEDALO_CORE_PATH . '/base/upgrade/class.transform_data.php';
			$result = transform_data::changes_in_tipos(
				$ar_tables,
				$ar_file_name
			);

		$response->result	= $result;
		$response->msg		= ($result===false)
			? 'Error. changes_in_tipos failed'
			: 'OK. request done successfully';


		return $response;
	}//end move_tld



	/**
	* MOVE_LOCATOR
	* Transform Dédalo data from all tables replacing tipos
	* using selected JSON file map
	* Is called from widget 'move_locator' as process
	* @param object $options
	* {
	* 	files_selected : array ['finds_numisdata279_to_tchi1.json']
	* }
	* @return object $response
	*/
	public static function move_locator(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options
			$files_selected = $options->files_selected;
			if (empty($files_selected)) {
				$response->errors[] = 'empty files_selected';
				return $response;
			}

		// files
			$definitions_files	= area_maintenance::get_definitions_files( 'move_locator' );
			$json_files			= array_filter($definitions_files, function($el) use($files_selected){
				return in_array($el->file_name, $files_selected);
			});
			if (empty($json_files)) {
				$response->errors[] = 'json_files not found';
				return $response;
			}

			// ar_file_name
			$ar_file_name = array_values(
				array_map(function($el){
					return $el->file_name;
				}, $json_files)
			);

		// process changes_in_tipos
			$ar_tables = [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_counter',
				'matrix_dataframe',
				'matrix_dd',
				'matrix_hierarchy',
				'matrix_hierarchy_main',
				'matrix_indexations',
				'matrix_layout',
				'matrix_layout_dd',
				'matrix_list',
				'matrix_nexus',
				'matrix_nexus_main',
				'matrix_notes',
				'matrix_profiles',
				'matrix_projects',
				'matrix_stats',
				'matrix_time_machine'
			];
			require_once DEDALO_CORE_PATH . '/base/upgrade/class.transform_data.php';
			$result = transform_data::changes_in_locators(
				$ar_tables,
				$ar_file_name
			);

		$response->result	= $result;
		$response->msg		= ($result===false)
			? 'Error. changes_in_locators failed'
			: 'OK. request done successfully';


		return $response;
	}//end move_locator




	/**
	* MOVE_TO_PORTAL
	* Transform Dédalo data from all tables replacing tipos
	* using selected JSON file map
	* Is called from widget 'move_to_portal' as process
	* @param object $options
	* {
	* 	files_selected : array ['finds_numisdata279_to_tchi1.json']
	* }
	* @return object $response
	*/
	public static function move_to_portal(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options
			$files_selected = $options->files_selected;
			if (empty($files_selected)) {
				$response->errors[] = 'empty files_selected';
				return $response;
			}

		// files
			$definitions_files	= area_maintenance::get_definitions_files( 'move_to_portal' );

			$json_files			= array_filter($definitions_files, function($el) use($files_selected){
				return in_array($el->file_name, $files_selected);
			});
			if (empty($json_files)) {
				$response->errors[] = 'json_files not found';
				return $response;
			}

			// ar_file_name
			$ar_file_name = array_values(
				array_map(function($el){
					return $el->file_name;
				}, $json_files)
			);


			require_once DEDALO_CORE_PATH . '/base/upgrade/class.transform_data.php';
			$result = transform_data::portalize_data(
				$ar_file_name
			);

		$response->result	= $result;
		$response->msg		= ($result===false)
			? 'Error. changes_in_locators failed'
			: 'OK. request done successfully';


		return $response;
	}//end move_to_portal



	/**
	* MOVE_TO_TABLE
	* Move data from a table to other as `utoponymy1` to `matrix_hierarchy`
	* using selected JSON file map
	* Is called from widget 'move_to_table' as process
	* @param object $options
	* {
	* 	files_selected : array ['location_ubication1_to_hierarchy.json']
	* }
	* @return object $response
	*/
	public static function move_to_table(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options
			$files_selected = $options->files_selected;
			if (empty($files_selected)) {
				$response->errors[] = 'empty files_selected';
				return $response;
			}

		// files
			$definitions_files	= area_maintenance::get_definitions_files( 'move_to_table' );

			$json_files			= array_filter($definitions_files, function($el) use($files_selected){
				return in_array($el->file_name, $files_selected);
			});
			if (empty($json_files)) {
				$response->errors[] = 'json_files not found';
				return $response;
			}

			// ar_file_name
			$ar_file_name = array_values(
				array_map(function($el){
					return $el->file_name;
				}, $json_files)
			);


			require_once DEDALO_CORE_PATH . '/base/upgrade/class.transform_data.php';
			$result = transform_data::move_data_between_matrix_tables(
				$ar_file_name
			);

		$response->result	= $result;
		$response->msg		= ($result===false)
			? 'Error. changes_in_locators failed'
			: 'OK. request done successfully';


		return $response;
	}//end move_to_table


	/**
	* MOVE_LANG
	* Transform Dédalo data from specific tables defined changing data lang
	* using selected JSON file map
	* Is called from widget 'move_lang' as process
	* @param object $options
	* {
	* 	files_selected : array ['change_hierarchy89_to_nolan.json']
	* }
	* @return object $response
	*/
	public static function move_lang(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options
			$files_selected = $options->files_selected;
			if (empty($files_selected)) {
				$response->errors[] = 'empty files_selected';
				return $response;
			}

		// files
			$definitions_files	= area_maintenance::get_definitions_files( 'move_lang' );
			$json_files			= array_filter($definitions_files, function($el) use($files_selected){
				return in_array($el->file_name, $files_selected);
			});
			if (empty($json_files)) {
				$response->errors[] = 'json_files not found';
				return $response;
			}

			// ar_file_name
			$ar_file_name = array_values(
				array_map(function($el){
					return $el->file_name;
				}, $json_files)
			);

			require_once DEDALO_CORE_PATH . '/base/upgrade/class.transform_data.php';
			$result = transform_data::change_data_lang(
				$ar_file_name
			);

		$response->result	= $result;
		$response->msg		= ($result===false)
			? 'Error. changes_in_tipos failed'
			: 'OK. request done successfully';


		return $response;
	}//end move_lang



	/**
	* UPDATE_ONTOLOGY
	* Is called from area_maintenence widget 'update_ontology' across dd_area_maintenance::class_request
	* Connect with master server, download ontology files and update local DDBB and lang files
	* @param object $options
	* {
	*	"server": {
	*		"name": "Official Dédalo Ontology server",
	* 		..
	* 	},
	* 	"files" : [{
	*		"section_tipo": "ontology56",
	*		"tld": "numisdata",
	*		"url": "http://localhost:8080/dedalo/install/import/ontology/6.4/ontology56_numisdata.copy.gz"
	*	}],
	* 	"info": {
	* 		"date": "2024-12-20T20:54:36+01:00",
	* 		"host": "localhost:8080",
	* 		"entity": "monedaiberica",
	* 		..
	* 	}
	* }
	* @return object $response
	* {
	* 	result: bool,
	* 	msg: string,
	* 	errors: array
	* }
	*/
	public static function update_ontology(object $options) : object {
		$start_time=start_time();

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
				$response->errors	= [];

		// options
			$files	= $options->files;
			$info 	= $options->info;

		// ar_msg
			$ar_msg = [];

		// db_system_config_verify. Test pgpass file existence and permissions
			$pgpass_check = system::check_pgpass_file();
			if ( $pgpass_check===false ) {
				// error
				$response->result 	= false;
				$response->msg 		= 'Invalid .pgpass file, check your configuration';
				$response->errors[]	= 'Bad .pgpass file';

				return $response;
			}

		// download files
			$files_to_import = [];
			foreach ($files as $current_file_item) {

				$download_file_response = ontology_data_io::download_remote_ontology_file( $current_file_item->url );

				$ar_msg[] = $download_file_response->msg;
				if( !empty($download_file_response->errors) ){
					$response->errors = array_merge($response->errors, $download_file_response->errors);
				}

				if($download_file_response->result === true){
					$files_to_import[] = $current_file_item;
				}
			}

		// import ontology sections
			// import file
			foreach ($files_to_import as $current_file_item) {

					if($current_file_item->tld === 'matrix_dd'){
						// private lists
						$import_response = ontology_data_io::import_private_lists_from_file( $current_file_item );
					}else{
						// main section
						// check if the main section exist
						ontology::add_main_section( $current_file_item );
						// matrix data of regular ontology
						$import_response = ontology_data_io::import_from_file( $current_file_item );
					}
					// add messages and errors
					if (!empty($import_response->msg)) {
						$ar_msg[] = $import_response->msg;
					}
					if( !empty($import_response->errors) ){
						$response->errors = array_merge($response->errors, $import_response->errors);
					}
			}

		// update dd_ontology with the imported records
			foreach ($files_to_import as $current_file_item) {

				if (!is_object($current_file_item) || !isset($current_file_item->tld, $current_file_item->section_tipo)) {
					debug_log(__METHOD__
						. " Ignored file item: Missing 'tld' or 'section_tipo' properties. " . PHP_EOL
						. ' current_file_item: ' . to_string($current_file_item)
						, logger::ERROR
					);
					continue;
				}

				// private list, matrix_dd, doesn't process it as dd_ontology nodes
				if($current_file_item->tld === 'matrix_dd'){
					continue;
				}

				$section_tipo = $current_file_item->section_tipo;
				$sqo = new search_query_object();
					$sqo->set_section_tipo( [$section_tipo] );
					$sqo->limit = 0;

				$set_dd_ontology_response = ontology::set_records_in_dd_ontology( $sqo );
				// add messages and errors
				if (!empty($set_dd_ontology_response->msg)) {
					$ar_msg[] = $set_dd_ontology_response->msg;
				}
				if(!empty($set_dd_ontology_response->errors)){
					$response->errors = array_merge($response->errors, $set_dd_ontology_response->errors);
				}
			}

		// simple_schema_of_sections. Get current simple schema of sections before update data
		// Will used to compare with the new schema (after update)
			$old_simple_schema_of_sections = hierarchy::get_simple_schema_of_sections();

		// post processing tables
			$ar_tables = ['dd_ontology','matrix_ontology','matrix_ontology_main','matrix_dd'];
			// optimize tables
			db_tasks::optimize_tables($ar_tables);

		// delete all session data except auth
			if (isset($_SESSION['dedalo']) && is_array($_SESSION['dedalo'])) {
				foreach ($_SESSION['dedalo'] as $key => $value) {
					if ($key==='auth') continue;
					unset($_SESSION['dedalo'][$key]);
				}
			}

		// update javascript labels
			$ar_langs = DEDALO_APPLICATION_LANGS;
			foreach ($ar_langs as $lang => $label) {

				// direct
					$write_file = backup::write_lang_file($lang);
					if ($write_file===false) {
						$response->errors[]	= 'Error writing write_lang_file of lang: ' . $lang;
						continue;
					}

				// debug
					debug_log(__METHOD__
						. " Writing lang file " . PHP_EOL
						. ' lang: ' . to_string($lang)
						, logger::WARNING
					);
			}

		// logger activity : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
			logger::$obj['activity']->log_message(
				'SAVE',
				logger::INFO,
				DEDALO_ROOT_TIPO,
				NULL,
				[
					'msg'		=> 'Updated Ontology',
					'version'	=> ontology_node::get_term_by_tipo(DEDALO_ROOT_TIPO,'lg-spa')
				],
				logged_user_id() // int
			);

		// save_simple_schema_file. Get new simple_schema_of_sections
		// to compare with the previous scheme and save the changes
			$save_simple_schema_file_response = hierarchy::save_simple_schema_file((object)[
				'old_simple_schema_of_sections' => $old_simple_schema_of_sections
			]);
			if($save_simple_schema_file_response->result===false){
				$response->result	= false;
				$response->msg		= 'Error saving simple_schema_file: '.$save_simple_schema_file_response->msg;
				$response->errors	= array_merge($response->errors, $save_simple_schema_file_response->errors);
				return $response;
			}else{
				$ar_msg[] = 'OK. Saved a new simple schema changes file: ' . basename($save_simple_schema_file_response->filepath);
			}

		// force reset cache of hierarchy tree
			// delete previous cache files
			dd_cache::delete_cache_files();

		// get new Ontology info
			$ontology_node = ontology_node::get_instance(DEDALO_ROOT_TIPO);
			$root_info = (object)[
				'term' => ontology_node::get_term_by_tipo(DEDALO_ROOT_TIPO, DEDALO_STRUCTURE_LANG, false, false),
				'properties' => $ontology_node->get_properties()
			];

		// response
			$response->result = true;
			$msg = empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning! Request done with errors';
			$response->msg = $msg .' '. implode(PHP_EOL, $ar_msg);
			$response->root_info = $root_info;


		return $response;
	}//end update_ontology



	/**
	* REBUILD_LANG_FILES
	* Re-write label lang JS files and deletes the existing lang cache files
	* It is called from 'Update Ontology' widget
	* @param object $options
	* @return object $response
	*/
	public static function rebuild_lang_files( object $options ) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
				$response->errors	= [];

		// write_lang_file
			$ar_langs = DEDALO_APPLICATION_LANGS;
			foreach ($ar_langs as $lang => $label) {
				$result = backup::write_lang_file($lang);
				if ($result!==true) {
					$response->errors[] = 'Failed write lang file: ' .$lang;
				}
			}

		// response
			if(count($response->errors)===0) {
				$response->result	= true;
				$response->msg		= 'OK. Request done successfully';
				$response->updated	= $ar_langs;
			}


		return $response;
	}//end rebuild_lang_files



	/**
	* BUILD_RECOVERY_VERSION_FILE
	* Alias of install::build_recovery_version_file
	* Creates the recovery file 'dd_ontology_recovery.sql' from current 'dd_ontology' table
	* @return object $response
	*/
	public static function build_recovery_version_file() {

		return install::build_recovery_version_file();
	}//end build_recovery_version_file



	/**
	* RESTORE_DD_ONTOLOGY_RECOVERY_FROM_FILE
	* Alias of install::restore_dd_ontology_recovery_from_file
	* Source file is a SQL string file located at /dedalo/install/db/dd_ontology_recovery.sql
	* @return object $response
	*/
	public static function restore_dd_ontology_recovery_from_file() {

		return install::restore_dd_ontology_recovery_from_file();
	}//end restore_dd_ontology_recovery_from_file



	/**
	* REBUILD_USER_STATS
	* Re-creates the user daily stats from matrix-activity
	* @param object $options
	* @return object $rebuild_user_stats
	*/
	public static function rebuild_user_stats( object $options ) : object {

		// options
			$users = $options->users ?? null;

		// response
			$response = new stdClass();
				$response->result		= false;
				$response->msg			= 'Error. Request failed ['.__FUNCTION__.']';
				$response->errors		= [];
				$response->updated_days	= [];

		// check users value
			if (empty($users)) {
				$response->msg		.= ' Empty users value';
				$response->errors[]	= 'invalid users';
				return $response;
			}

		// write_lang_file
			foreach ($users as $user_id) {

				// delete_user_activity_stats
				$deleted = diffusion_section_stats::delete_user_activity_stats( (int)$user_id );
				if (!$deleted) {
					$response->errors[] = 'failed delete user stats. User: '.$user_id;
					continue;
				}

				// update_user_activity_stats
				$update_user_response = diffusion_section_stats::update_user_activity_stats( (int)$user_id );
				if (!$update_user_response->result) {
					return $update_user_response;
				}

				// errors
				$response->errors = array_merge($response->errors, $update_user_response->errors);

				// updated_days
				$response->updated_days[] = $update_user_response->result;
			}

		// response OK
			$response->msg = empty($response->errors)
				? 'OK. Request done.'
				: 'Warning! Request done with errors';


		return $response;
	}//end rebuild_user_stats



}//end class area_maintenance
