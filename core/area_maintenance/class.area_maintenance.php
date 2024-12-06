<?php
declare(strict_types=1);
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
			$mysql_db = (defined('API_WEB_USER_CODE_MULTIPLE') ? API_WEB_USER_CODE_MULTIPLE : null);

		// item
			$item = new stdClass();
				$item->id		= 'make_backup';
				$item->type		= 'widget';
				$item->label	= label::get_label('make_backup') ?? 'Make backup';
				$item->value	= (object)[
					'dedalo_db_management'	=> DEDALO_DB_MANAGEMENT,
					'backup_path'			=> DEDALO_BACKUP_PATH_DB,
					'file_name'				=> date("Y-m-d_His") .'.'. DEDALO_DATABASE_CONN .'.'. DEDALO_DB_TYPE .'_'. logged_user_id() .'_forced_dbv' . implode('-', get_current_version_in_db()).'.custom.backup',
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

		$DEDALO_PREFIX_TIPOS = get_legacy_constant_value('DEDALO_PREFIX_TIPOS');


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
				$item->value	= (object)[
					'current_ontology'		=> RecordObj_dd::get_termino_by_tipo(DEDALO_ROOT_TIPO,'lg-spa'),
					'prefix_tipos'			=> $DEDALO_PREFIX_TIPOS,
					'structure_from_server'	=> (defined('STRUCTURE_FROM_SERVER') ? STRUCTURE_FROM_SERVER : null),
					'structure_server_url'	=> (defined('STRUCTURE_SERVER_URL') ? STRUCTURE_SERVER_URL : null),
					'structure_server_code'	=> (defined('STRUCTURE_SERVER_CODE') ? STRUCTURE_SERVER_CODE : null),
					'ontology_db'			=> (defined('ONTOLOGY_DB') ? ONTOLOGY_DB : null),
					'body'					=> defined('ONTOLOGY_DB')
						? 'Disabled update Ontology. You are using config ONTOLOGY_DB !'
						: label::get_label('update_ontology')." is disabled for ".DEDALO_ENTITY,
					'confirm_text'			=> '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! WARNING !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!' . PHP_EOL
						.'!!!!!!!!!!!!!! DELETING ACTUAL ONTOLOGY !!!!!!!!!!!!!!!!!!!!!!!!!!!' . PHP_EOL
						.'Are you sure you want to overwrite the current Ontology data?' .PHP_EOL
						.'You will lose all changes made to the local Ontology.'
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// register_tools *
			$tools_files_list = tools_register::get_tools_files_list();
			$need_update = array_reduce($tools_files_list, function ($carry, $c_tool) {
				return $carry || ($c_tool->version !== $c_tool->installed_version);
			}, false);
			$item = new stdClass();
				$item->id		= 'register_tools';
				$item->class	= $need_update===false ? 'success' : 'danger';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= label::get_label('registrar_herramientas');
				$item->value	= (object)[
					'datalist' => $tools_files_list
				];
				// verify tipo 'dd1644' Developer added Ontology field 09-10-2023
				if (empty(RecordObj_dd::get_modelo_name_by_tipo('dd1644',true))) {
					$item->value->errors[] = 'Your Ontology is outdated. Term \'dd1644\' do not exists';
				}
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;


		// move_tld
			$item = new stdClass();
				$item->id		= 'move_tld';
				$item->type		= 'widget';
				$item->label	= 'Move TLD';
				$item->value	= (object)[
					'body' => 'Move TLD defined map items from source (e.g. numisdata279) to target (e.g. tchi1).<br>
							   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_tld.<br>
							   Note that this can be a very long process because it has to go through all the records in all the tables.',
					'files' => area_maintenance::get_definitions_files( 'move_tld' )
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;
		// build_structure_css
			// $item = new stdClass();
			// 	$item->id		= 'build_structure_css';
			// 	$item->type		= 'widget';
			// 	$item->tipo		= $this->tipo;
			// 	$item->parent	= $this->tipo;
			// 	$item->label	= label::get_label('build_structure_css');
			// 	$item->body		= 'Regenerate css from actual structure (Ontology)';
			// 	$item->run[]	= (object)[
			// 		'fn'		=> 'init_form',
			// 		'options'	=> (object)[
			// 			'confirm_text' => label::get_label('sure') ?? 'Sure?'
			// 		]
			// 	];
			// 	$item->trigger 	= (object)[
			// 		'dd_api'	=> 'dd_utils_api',
			// 		'action'	=> 'build_structure_css',
			// 		'options'	=> null
			// 	];
			// $widget = $this->widget_factory($item);
			// $ar_widgets[] = $widget;

		// build_install_version *
			$item = new stdClass();
				$item->id		= 'build_install_version';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= label::get_label('build_install_version') ?? 'Build install version';
				$item->value	= (object)[
					'source_db'		=> DEDALO_DATABASE_CONN,
					'target_db'		=> install::$db_install_name,
					'target_file'	=> '/install/db/'.install::$db_install_name.'.pgsql.gz'
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// update_data_version *
			include_once DEDALO_CORE_PATH . '/base/update/class.update.php';
			$updates				= update::get_updates();
			$update_version			= update::get_update_version();
			$update_version_plain	= empty($update_version)
				? ''
				: implode('', $update_version);

			$item = new stdClass();
				$item->id		= 'update_data_version';
				$item->class	= empty($update_version) ? 'success width_100' : 'danger width_100';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= label::get_label('update').' '.label::get_label('data');
				$item->value	= (object)[
					'update_version'		=> $update_version,
					'current_version_in_db'	=> get_current_version_in_db(),
					'dedalo_version'		=> get_dedalo_version(),
					'updates'				=> $updates->{$update_version_plain} ?? null
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// update_code *
			$item = new stdClass();
				$item->id		= 'update_code';
				$item->type		= 'widget';
				$item->label	= label::get_label('update') .' '. label::get_label('code');
				$item->value	= (object)[
					'dedalo_source_version_url'			=> DEDALO_SOURCE_VERSION_URL,
					'dedalo_source_version_local_dir'	=> DEDALO_SOURCE_VERSION_LOCAL_DIR
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// check_config *
			$config_status = self::check_config();
			$missing = [];
			foreach ($config_status->result as $el) {
				$missing = array_merge($missing, $el->sample_vs_config);
			}
			$item = new stdClass();
				$item->id		= 'check_config';
				$item->class	= empty($missing) ? 'success' : 'danger';
				$item->type		= 'widget';
				$item->label	= label::get_label('check_config') ?? 'Check config';
				$item->value	= (object)[
					'info' => $config_status
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// export_ontology_to_json *
			$item = new stdClass();
				$item->id		= 'export_ontology_to_json';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= label::get_label('export_json_ontology') ?? 'Export JSON ontology';;
				$item->value	= (object)[
					'file_name'	=> 'structure.json',
					'file_path'	=> (defined('STRUCTURE_DOWNLOAD_JSON_FILE') ? STRUCTURE_DOWNLOAD_JSON_FILE : ONTOLOGY_DOWNLOAD_DIR),
					'tipos'		=> $DEDALO_PREFIX_TIPOS
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// import_ontology_from_json *
			$item = new stdClass();
				$item->id		= 'import_ontology_from_json';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= label::get_label('import_json_ontology') ?? 'Import JSON ontology';
				$item->value	= (object)[
					'ontology_db'	=> (defined('ONTOLOGY_DB') ? ONTOLOGY_DB : null),
					'file_name'		=> 'structure.json',
					'file_path'		=> (defined('STRUCTURE_DOWNLOAD_JSON_FILE') ? STRUCTURE_DOWNLOAD_JSON_FILE : ONTOLOGY_DOWNLOAD_DIR),
					'tipos'			=> $DEDALO_PREFIX_TIPOS
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// export_hierarchy *
			$item = new stdClass();
				$item->id		= 'export_hierarchy';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= label::get_label('export_hierarchy') ?? 'Export hierarchy';
				$item->value	= (object)[
					'export_hierarchy_path' => (defined('EXPORT_HIERARCHY_PATH')
						? EXPORT_HIERARCHY_PATH
						: null)
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// add_hierarchy *
			$item = new stdClass();
				$install_config = install::get_config();

				$item->id		= 'add_hierarchy';
				$item->type		= 'widget';
				$item->class	= 'success width_100';
				$item->label	= label::get_label('instalar') .' '. label::get_label('jerarquias');
				$item->value	= (object)[
					'hierarchies'				=> install::get_available_hierarchy_files()->result,
					'active_hierarchies'		=> hierarchy::get_active_hierarchies(),
					'hierarchy_files_dir_path'	=> $install_config->hierarchy_files_dir_path,
					'hierarchy_typologies'		=> $install_config->hierarchy_typologies
				];
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

		// dedalo_api_test_environment *
			$item = new stdClass();
				$item->id		= 'dedalo_api_test_environment';
				$item->class	= 'width_100';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= 'DÉDALO API TEST ENVIRONMENT';
				$item->value	= (object)[];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// sqo_test_environment *
			$item = new stdClass();
				$item->id		= 'sqo_test_environment';
				$item->class	= 'blue width_100';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= 'SEARCH QUERY OBJECT TEST ENVIRONMENT';
				$item->value	= (object)[];
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

		// dedalo_version *
			$item = new stdClass();
				$item->id		= 'dedalo_version';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= 'DEDALO VERSION';
				$item->value	= (object)[
					'dedalo_version'	=> DEDALO_VERSION,
					'dedalo_build'		=> DEDALO_BUILD
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// database_info *
			$info = pg_version(DBi::_getConnection());
			$info['host'] = to_string(DEDALO_HOSTNAME_CONN);
			$item = new stdClass();
				$item->id		= 'database_info';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= 'DATABASE INFO';
				$item->value	= (object)[
					'info' => $info
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// php_user *
			$info = (function(){
				try {
					if (function_exists('posix_getpwuid') && function_exists('posix_geteuid')) {
						$info = posix_getpwuid(posix_geteuid());
					}else{
						$name			= get_current_user();
						$current_user	= trim(shell_exec('whoami'));
						$info = [
							'name'			=> $name,
							'current_user'	=> $current_user
						];
					}
				} catch (Exception $e) {
					debug_log(__METHOD__." Exception:".$e->getMessage(), logger::ERROR);
				}
				return $info;
			})();
			$item = new stdClass();
				$item->id		= 'php_user';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= 'PHP USER';
				$item->value	= (object)[
					'info' => $info
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// unit_test *
			$item = new stdClass();
				$item->id		= 'unit_test';
				$item->type		= 'widget';
				$item->label	= 'Unit test area';
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// environment *
			$item = new stdClass();
				$item->id		= 'environment';
				$item->type		= 'widget';
				$item->label	= 'Environment';
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// sequences_status *
			require_once DEDALO_CORE_PATH.'/db/class.db_data_check.php';
			$response = db_data_check::check_sequences();
			$item = new stdClass();
				$item->id		= 'sequences_status';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= 'DB SEQUENCES STATUS';
				$item->value	= $response;
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// counters_status *
			$response = counter::check_counters();
			$item = new stdClass();
				$item->id		= 'counters_status';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= 'DEDALO COUNTERS STATUS';
				$item->value	= $response;
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;

		// php_info *
			$item = new stdClass();
				$item->id		= 'php_info';
				$item->type		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= 'PHP INFO';
				$item->value	= (object)[
					'src' => DEDALO_CORE_URL.'/area_maintenance/php_info.php'
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
					return $response;
				}
				// restart table sequence
				$strQuery	= 'ALTER SEQUENCE relations_id_seq RESTART WITH 1;';
				$result		= JSON_RecordDataBoundObject::search_free($strQuery);
				if ($result===false) {
					$response->msg = $response->msg[0].' - Unable to alter SEQUENCE relations_id_seq!';
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
										." Error on get from_component_tipo from locator (table:$table) (ignored) locator:"
										.to_string($current_locator)
										, logger::ERROR
									);
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
			$response->msg[0]	= 'OK. All data is propagated successfully'; // Override first message
			$response->msg		= $response->msg; // array


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
	* CHECK_CONFIG
	* @return object $response
	*/
	public static function check_config() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ';

		// result
			$result = [];

		// ar_files_name iterate
			$ar_files_name = [
				'config',
				'config_db',
				'config_core'
			];
			foreach ($ar_files_name as $file_name) {

				$item = new stdClass();
					$item->file_name		= $file_name;
					$item->config_vs_sample	= [];
					$item->sample_vs_config	= [];

				// sample_config_constants_list
					$sample_config_constants_list = area_maintenance::get_file_constants(
						DEDALO_CONFIG_PATH . '/sample.'.$file_name.'.php'
					);
					$item->sample_config_constants_list	= $sample_config_constants_list;

				// config_constants_list
					$config_constants_list = area_maintenance::get_file_constants(
						DEDALO_CONFIG_PATH . '/'.$file_name.'.php'
					);
					$item->config_constants_list = $config_constants_list;

				// config_vs_sample. Compares defined config constants vs sample config
					$ignore = ['DEDALO_MAINTENANCE_MODE_CUSTOM','DEDALO_NOTIFICATION','GEONAMES_ACCOUNT_USERNAME','EXPORT_HIERARCHY_PATH'];
					foreach ($config_constants_list as $const_name) {
						if (!in_array($const_name, $sample_config_constants_list)) {
							// exceptions (ignore optional constants that could be disabled)
							if (!in_array($const_name, $ignore)) {
								$item->config_vs_sample[] = $const_name;
							}
						}
					}

				// sample_vs_config. Compares defined sample constants vs config
					$ignore = ['DEDALO_MAINTENANCE_MODE','DEDALO_API_URL'];
					foreach ($sample_config_constants_list as $const_name) {
						if (!in_array($const_name, $ignore) && !defined($const_name)) {
							$item->sample_vs_config[] = $const_name;
						}
					}

				// add
					$result[] = $item;
			}//end foreach


		// response
			$response->result						= $result;
			$response->msg							= 'OK. Request done successfully';
			$response->sample_config_constants_list	= $sample_config_constants_list;


		return $response;
	}//end check_config



	/**
	* REBUILD_DB_INDEXES
	* Force to re-build the PostgreSQL main indexes, extensions and functions
	* @return object $response
	*/
	public static function rebuild_db_indexes() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ';
			$response->errors	= [];
			$response->success	= 0;

		$ar_sql_query = [];

		// import file with all definitions of indexes
		require_once dirname(__FILE__) . '/db_indexes.php';

		// exec
		foreach ($ar_sql_query as $sql_query) {

			// debug info
			debug_log(__METHOD__
				. " Executing rebuild_db_indexes SQL sentence " . PHP_EOL
				. ' sql_query: ' . trim($sql_query)
				, logger::WARNING
			);

			// exec query
			$result = pg_query(DBi::_getConnection(), $sql_query);
			if($result===false) {
				// error case
				debug_log(__METHOD__
					." Error Processing sql_query Request ". PHP_EOL
					. pg_last_error(DBi::_getConnection()) .PHP_EOL
					. 'sql_query: '.to_string($sql_query)
					, logger::ERROR
				);
				$response->errors[] = " Error Processing sql_query Request: ". pg_last_error(DBi::_getConnection());
				continue;
			}

			$response->success++;
		}

		// debug
			debug_log(__METHOD__
				. " Exec rebuild_db_indexes " . PHP_EOL
				. ' sql_query: ' .PHP_EOL. implode(PHP_EOL . PHP_EOL, $ar_sql_query) . PHP_EOL
				, logger::DEBUG
			);

		// response OK
		$response->result	= true;
		$response->msg		= count($response->errors)>0
			? 'Warning. Request done with errors'
			: 'OK. Request done successfully';
		$response->n_queries = count($ar_sql_query);
		$response->n_errors = count($response->errors);


		return $response;
	}//end rebuild_db_indexes



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

		if (running_in_cli()===true) {

			// executing from dd_utils_api::get_process_status (area maintenance panel)

			$counter = 0;
			while(1){

				$counter++;

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
	*/
	public static function register_tools() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		$response->result	= tools_register::import_tools();
		$response->msg		= 'OK. Request done successfully';

		// check results errors
		$errors = [];
		if (!empty($response->result)) {
			foreach ($response->result as $item) {
				if (!empty($item->errors)) {
					$errors = array_merge($errors, (array)$item->errors);
				}
			}
			$response->msg = 'Warning. Request done with errors';
		}
		$response->errors = $errors;


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
	* EXPORT_HIERARCHY
	* Alias of hierarchy::export_hierarchy
	* @param object $options
	* @return object $response
	*/
	public static function export_hierarchy(object $options) : object {

		// options
			$section_tipo = $options->section_tipo ?? null;

		// export_hierarchy
			$response = hierarchy::export_hierarchy($section_tipo);


		return $response;
	}//end export_hierarchy



	/**
	* UPDATE_CODE
	* Download code in zip format file from the GIT repository defined in config
	* @param object $options
	* @return object $response
	*/
	public static function update_code(object $options) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		try {

			$result = new stdClass();

			debug_log(__METHOD__." Start downloading file ".DEDALO_SOURCE_VERSION_URL, logger::DEBUG);

			// CLI msg
				if ( running_in_cli()===true ) {
					print_cli((object)[
						'msg'		=> 'Start downloading file: ' . DEDALO_SOURCE_VERSION_URL,
						'memory'	=> dd_memory_usage()
					]);
				}

			// Download zip file from server (master) curl mode (unified with download_remote_structure_file)
				// data
				$data_string = "data=" . json_encode(null);
				// curl_request
				$curl_response = curl_request((object)[
					'url'				=> DEDALO_SOURCE_VERSION_URL,
					'post'				=> true,
					'postfields'		=> $data_string,
					'returntransfer'	=> 1,
					'followlocation'	=> true,
					'header'			=> false, // bool add header to result
					'ssl_verifypeer'	=> false,
					'timeout'			=> 300, // int seconds
					'proxy'				=> (defined('SERVER_PROXY') && !empty(SERVER_PROXY))
						? SERVER_PROXY // from Dédalo config file
						: false // default case
				]);
				$contents = $curl_response->result;
				// check contents
				if ($contents===false) {
					$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Contents from Dédalo code repository fail to download from: '.DEDALO_SOURCE_VERSION_URL;
					debug_log(__METHOD__
						." $response->msg"
						, logger::ERROR
					);
					return $response;
				}
				$result->download_file = [
					'Downloaded file: ' . DEDALO_SOURCE_VERSION_URL,
					'Time: ' . exec_time_unit($start_time,'sec') . ' secs'
				];
				debug_log(__METHOD__
					." Downloaded file (".DEDALO_SOURCE_VERSION_URL.") in ".exec_time_unit($start_time,'sec') . ' secs'
					, logger::DEBUG
				);

			// Save contents to local dir
				if (!is_dir(DEDALO_SOURCE_VERSION_LOCAL_DIR)) {
					if( !mkdir(DEDALO_SOURCE_VERSION_LOCAL_DIR,  0775) ) {
						$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Unable to create dir: '.DEDALO_SOURCE_VERSION_LOCAL_DIR;
						debug_log(__METHOD__
							." $response->msg"
							, logger::ERROR
						);
						return $response;
					}
				}
				$file_name		= 'dedalo6_code.zip';
				$target_file	= DEDALO_SOURCE_VERSION_LOCAL_DIR . '/' . $file_name;
				$put_contents	= file_put_contents($target_file, $contents);
				if (!$put_contents) {
					$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Contents from Dédalo code repository fail to write on : '.$target_file;
					debug_log(__METHOD__
						." $response->msg"
						, logger::ERROR
					);
					return $response;
				}
				$result->write_file = [
					"Written file: ". $target_file,
					"File size: "	. format_size_units( filesize($target_file) )
				];

			// extract files from zip. (!) Note that 'ZipArchive' need to be installed in PHP to allow work
				// CLI msg
				if ( running_in_cli()===true ) {
					print_cli((object)[
						'msg'		=> 'Extracting zip file',
						'memory'	=> dd_memory_usage()
					]);
				}
				$zip = new ZipArchive;
				$res = $zip->open($target_file);
				if ($res!==true) {
					$response->msg = 'Error. Request failed ['.__FUNCTION__.']. ERROR ON ZIP file extraction to '.DEDALO_SOURCE_VERSION_LOCAL_DIR;
					debug_log(__METHOD__
						." $response->msg"
						, logger::ERROR
					);
					return $response;
				}
				$zip->extractTo(DEDALO_SOURCE_VERSION_LOCAL_DIR);
				$zip->close();
				$result->extract = [
					"Extracted ZIP file to: " . DEDALO_SOURCE_VERSION_LOCAL_DIR
				];
				debug_log(__METHOD__
					." ZIP file extracted successfully to ".DEDALO_SOURCE_VERSION_LOCAL_DIR
					, logger::DEBUG
				);

			// rsync
				// CLI msg
				if ( running_in_cli()===true ) {
					print_cli((object)[
						'msg'		=> 'Updating files',
						'memory'	=> dd_memory_usage()
					]);
				}
				$source		= (strpos(DEDALO_SOURCE_VERSION_URL, 'github.com'))
					? DEDALO_SOURCE_VERSION_LOCAL_DIR .'/dedalo-master' // like 'dedalo-master'
					: DEDALO_SOURCE_VERSION_LOCAL_DIR .'/'. pathinfo($file_name)['filename']; // like 'dedalo6_code' from 'dedalo6_code.zip'
				$target		= DEDALO_ROOT_PATH;
				$exclude	= ' --exclude="*/config*" --exclude="media" ';
				$aditional 	= ''; // $is_preview===true ? ' --dry-run ' : '';
				$command	= 'rsync -avui --no-owner --no-group --no-perms --progress '. $exclude . $aditional . $source.'/ ' . $target.'/';
				$output		= shell_exec($command);
				if ($output===null) {
					$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Error executing rsync command. source: '.$source;
					debug_log(__METHOD__
						. $response->msg  . PHP_EOL
						. ' command: ' . to_string($command) . PHP_EOL
						. ' output: ' . to_string($output)
						, logger::ERROR
					);
					return $response;
				}
				$result->rsync = [
					"command: " . $command,
					"output: "  . str_replace(["\n","\r"], '<br>', $output),
				];
				debug_log(__METHOD__
					." RSYNC command done ". PHP_EOL .to_string($command)
					, logger::DEBUG
				);

			// remove temp used files and folders
				$command_rm_dir		= "rm -R -f $source";
				$output_rm_dir		= shell_exec($command_rm_dir);
				$result->remove_dir	= [
					"command_rm_dir: " . $command_rm_dir,
					"output_rm_dir: "  . $output_rm_dir
				];
				$command_rm_file 	= "rm $target_file";
				$output_rm_file		= shell_exec($command_rm_file);
				$result->remove_file= [
					"command_rm_file: " . $command_rm_file,
					"output_rm_file: "  . $output_rm_file
				];
				debug_log(__METHOD__
					." Removed temp used files and folders"
					, logger::DEBUG
				);

			// update JAVASCRIPT labels
				// CLI msg
				if ( running_in_cli()===true ) {
					print_cli((object)[
						'msg'		=> 'Updating js lang files',
						'memory'	=> dd_memory_usage()
					]);
				}
				$ar_langs = DEDALO_APPLICATION_LANGS;
				foreach ($ar_langs as $lang => $label) {
					backup::write_lang_file($lang);
				}

			// version info. Get from new downloaded file 'version.inc'
				$command = 'ddversion=`'.PHP_BIN_PATH.' << \'EOF\'
				<?php require "'.DEDALO_CORE_PATH.'/base/version.inc"; echo DEDALO_VERSION ." Build ". DEDALO_BUILD; ?>`
				echo $ddversion';
				// exec command
				$new_version_info = exec($command); // string like '6.0.0_RC6 Build 2023-08-22T19:19:35+02:00'

			// response OK
				// $response->result	= $result;
				// $response->msg		= 'OK. Updated Dédalo code successfully. ' . $new_version_info;

			// debug
				debug_log(__METHOD__
					.' Updated Dédalo code successfully. ' . $new_version_info
					, logger::DEBUG
				);

			// pause and force garbage collector (prevent cached files generating errors)
				sleep(1);
				opcache_reset();
				gc_collect_cycles();
				sleep(1);

			// logger activity : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
				logger::$obj['activity']->log_message(
					'SAVE',
					logger::INFO,
					DEDALO_ROOT_TIPO,
					NULL,
					[
						'msg' => 'Updated code to v. ' . $new_version_info
					],
					logged_user_id() // int
				);

		} catch (Exception $e) {

			$response->msg = $e->getMessage();
		}

		$response->result	= true;
		$response->msg		= 'OK. Updated Dédalo code successfully. '.__METHOD__;


		return $response;
	}//end update_code



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


		return $response;
	}//end update_data_version



	/**
	* SET_CONGIF_AUTO
	* This function set a custom maintenance mode. Useful when the root user
	* do not have access to the config file to edit
	* @param object $options
	* @return object $response
	*/
	private static function set_congif_auto(object $options) {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
				$response->errors	= [];

		// options
			$name	= $options->name; // name of the constant like 'MAINTENANCE_MODE_CUSTOM'
			$value	= $options->value ?? null; // value of the constant like bool 'false'

		// user root check. Only root user can set congif_core
			if (logged_user_id()!==DEDALO_SUPERUSER) {
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

				// Disable (Experimental with serious security implications)
				// case 'DEDALO_NOTIFICATION_CUSTOM':
				// 	// string|boolean
				// 	$ar_allow_type = ['boolean','string'];
				// 	if (!in_array($value_type, $ar_allow_type)) {
				// 		$response->msg = 'Error. invalid value type. Only allow boolean|string';
				// 		return $response;
				// 	}
				// 	if (is_string($value)) {
				// 		$msg = safe_xss($value);
				// 		$write_value = '["msg" => "'.$msg.'", "class_name" => "warning"]';
				// 	}else{
				// 		$write_value = 'false'; // no true is expected
				// 	}
				// 	break;

				default:
					$response->msg = 'Error. Invalid name';
					return $response;
					break;
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
	}//end set_congif_auto



	/**
	* SET_MAINTENANCE_MODE
	* Changes Dédalo maintenance mode from true to false or vice-versa
	* Uses area_maintenance:: set_congif_auto to overwrite the core_config files
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

		$response = area_maintenance:: set_congif_auto((object)[
			'name'	=> 'DEDALO_MAINTENANCE_MODE_CUSTOM',
			'value'	=> $value
		]);


		return $response;
	}//end set_maintenance_mode



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
	* UPDATE_ONTOLOGY
	* Is called from area_maintenence widget 'update_ontology' across dd_area_maintenance::class_request
	* Connect with master server, download ontology files and update local DDBB and lang files
	* @param object $options
	* {
	* 	ar_dedalo_prefix_tipos : array ['numisdata','rsc']
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
			$ar_dedalo_prefix_tipos = $options->ar_dedalo_prefix_tipos;
			if (empty($ar_dedalo_prefix_tipos) || !is_array($ar_dedalo_prefix_tipos)) {
				$response->errors[] = 'Empty mandatory ar_dedalo_prefix_tipos value';
				return $response;
			}
			foreach ($ar_dedalo_prefix_tipos as $prefix) {
				if(!hierarchy::valid_tld($prefix)) {
					$response->errors[] = 'Error. Invalid prefix value: '. to_string($prefix);
					return $response;
				}
			}

		// ar_msg
			$ar_msg = [];

		// Remote server check
			if(defined('STRUCTURE_FROM_SERVER') && STRUCTURE_FROM_SERVER===true) {

				debug_log(__METHOD__
					." Checking remote_server status. Expected header code 200 .... "
					, logger::DEBUG
				);

				// Check remote server status before begins
					$remote_server_response = (object)backup::check_remote_server();
					if (	$remote_server_response->result!==false
						 && $remote_server_response->code===200
						 && $remote_server_response->error===false) {

						// success
						$ar_msg[] = $remote_server_response->msg;

					}else{

						if(SHOW_DEBUG===true) {
							$check_status_exec_time = exec_time_unit($start_time,'ms').' ms';
							debug_log(__METHOD__
								." REMOTE_SERVER_STATUS ($check_status_exec_time). remote_server_response: " .PHP_EOL
								. to_string($remote_server_response)
								, logger::ERROR
							);
						}

						// error
						$response->msg		= 'Error. Request failed 1 ['.__FUNCTION__.'] ' . $remote_server_response->msg;
						$response->result	= false;
						$response->errors[]	= $remote_server_response->msg;
						return $response;
					}
			}

		// simple_schema_of_sections. Get current simple schema of sections before update data
		// Will used to compare with the new schema (after update)
			$old_simple_schema_of_sections = hierarchy::get_simple_schema_of_sections();

		// export. Before import, export a copy ;-)
			$db_name = 'dedalo_development_str_'.date("Y-m-d_Hi").'.custom';
			$res_export_structure = (object)backup::export_structure($db_name, $exclude_tables=false);	// Full backup
			if ($res_export_structure->result===false) {

				// error on export current DDBB
				$response->msg		= 'Error. Request failed 2 ['.__FUNCTION__.'] ' . $res_export_structure->msg;
				$response->errors[]	= $response->msg;
				return $response;

			}else{
				// Append msg
				$ar_msg[] = $res_export_structure->msg . ' - export time: '.exec_time_unit_auto($start_time);
			}

		// import
			$prev_time = start_time(); // reset exec time
			$import_structure_response = backup::import_structure(
				'dedalo_development_str.custom', // string db_name
				true, // bool check_server
				$ar_dedalo_prefix_tipos // array dedalo_prefix_tipos
			);
			if ($import_structure_response->result===false) {
				// error on import current DDBB
				$response->msg		= 'Error. Request import_structure failed 3 ['.__FUNCTION__.'] ' .$import_structure_response->msg;
				$response->errors	= array_merge($response->errors, $import_structure_response->errors);
				return $response;

			}else{
				// errors
				if (!empty($import_structure_response->errors)) {
					$response->errors = array_merge($response->errors, $import_structure_response->errors);
					$response->msg = 'Error. Request import_structure failed 4 ['.__FUNCTION__.'] ' .$import_structure_response->msg;
					return $response;
				}

				// Append msg
				$import_structure_response_ar_msg = explode(PHP_EOL, $import_structure_response->msg);
				$ar_msg		=  array_merge($ar_msg, $import_structure_response_ar_msg);
				$ar_msg[]	= 'Import time: '.exec_time_unit_auto($prev_time);
			}

		// optimize tables
			$ar_tables = ['jer_dd','matrix_descriptors_dd','matrix_dd','matrix_list'];
			backup::optimize_tables($ar_tables);

		// delete all session data except auth
			foreach ($_SESSION['dedalo'] as $key => $value) {
				if ($key==='auth') continue;
				unset($_SESSION['dedalo'][$key]);
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
					'version'	=> RecordObj_dd::get_termino_by_tipo(DEDALO_ROOT_TIPO,'lg-spa')
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
			$RecordObj_dd = new RecordObj_dd(DEDALO_ROOT_TIPO);
			$root_info = (object)[
				'term' => RecordObj_dd::get_termino_by_tipo(DEDALO_ROOT_TIPO, DEDALO_STRUCTURE_LANG, false, false),
				'properties' => $RecordObj_dd->get_properties()
			];

		// response
			$response->result	= true;
			array_unshift( $ar_msg, 'OK. Request done '.__METHOD__);
			$response->msg = implode(PHP_EOL, $ar_msg);
			$response->root_info = $root_info;


		return $response;
	}//end update_ontology



	/**
	* RECOVER_JER_DD_COLUMN
	* Used in version 6.2.9 to recover unset jet_dd column 'term' and values
	* @return bool
	*/
	public static function recover_jer_dd_column() {

		require_once DEDALO_CORE_PATH .'/base/upgrade/class.transform_data.php';

		try {

			// safe column term check/creation
			$sql = sanitize_query('
				DO $$
				BEGIN
					IF NOT EXISTS(SELECT *
						FROM information_schema.columns
						WHERE table_name=\'jer_dd\' and column_name=\'term\')
					THEN
						ALTER TABLE "jer_dd"
						ADD "term" jsonb NULL;
						COMMENT ON TABLE "jer_dd" IS \'Term and translations\';
					END IF;
				END $$;
			');
			$result = pg_query(DBi::_getConnection(), $sql);
			if ($result===false) {
				return false;
			}

			// safe term data fill from 'matrix_descriptors_dd'
			$result = transform_data::copy_descriptors_to_jer_dd();
			if ($result===false) {
				return false;
			}

		} catch (Exception $e) {
			debug_log(__METHOD__
				. " Error (exception) on recover term jer_dd_column" . PHP_EOL
				. ' Caught exception: ' . $e->getMessage()
				, logger::ERROR
			);
			return false;
		}


		return true;
	}//end recover_jer_dd_column



}//end class area_maintenance
