<?php
declare(strict_types=1);
require_once DEDALO_CORE_PATH.'/db/class.db_data_check.php';
/**
* AREA_MAINTENANCE
*
*/
class area_maintenance extends area_common {



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
				$item->typo		= 'widget';
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
	* GET_AR_WIDGETS
	* @return array $data_items
	*	Array of widgets object
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
				$item->typo		= 'widget';
				$item->label	= 'Regenerate relations table data';
				$item->value	= (object)[
					'body' => 'Delete and create again table relations records based on locators data of sections in current selected table/s',
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;


		// update_ontology *
			$item = new stdClass();
				$item->id		= 'update_ontology';
				$item->typo		= 'widget';
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
			$item = new stdClass();
				$item->id		= 'register_tools';
				$item->typo		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= label::get_label('registrar_herramientas');
				$item->value	= (object)[
					'datalist' => tools_register::get_tools_files_list()
				];
				// verify tipo 'dd1644' Developer added Ontology field 09-10-2023
				if (empty(RecordObj_dd::get_modelo_name_by_tipo('dd1644',true))) {
					$item->value->errors[] = 'Your Ontology is outdated. Term \'dd1644\' do not exists';
				}
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;


		// export_ontology_to_json *
			$item = new stdClass();
				$item->id		= 'export_ontology_to_json';
				$item->typo		= 'widget';
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
				$item->typo		= 'widget';
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


		// build_structure_css
			// $item = new stdClass();
			// 	$item->id		= 'build_structure_css';
			// 	$item->typo		= 'widget';
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
				$item->typo		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= label::get_label('build_install_version') ?? 'Build install version';
				$item->value	= (object)[
					'source_db'		=> DEDALO_DATABASE_CONN,
					'target_db'		=> install::$db_install_name,
					'target_file'	=> '/install/db/'.install::$db_install_name.'.pgsql.gz'
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;


		// export_hierarchy *
			$item = new stdClass();
				$item->id		= 'export_hierarchy';
				$item->typo		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= label::get_label('export_hierarchy') ?? 'Export hierarchy';
				$item->value	= (object)[
					'export_hierarchy_path' => (defined('EXPORT_HIERARCHY_PATH')
						? EXPORT_HIERARCHY_PATH
						: null)
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
				$item->typo		= 'widget';
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
				$item->typo		= 'widget';
				$item->label	= label::get_label('update') .' '. label::get_label('code');
				$item->value	= (object)[
					'dedalo_source_version_url'			=> DEDALO_SOURCE_VERSION_URL,
					'dedalo_source_version_local_dir'	=> DEDALO_SOURCE_VERSION_LOCAL_DIR
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;


		// check_config *
			$item = new stdClass();
				$item->id		= 'check_config';
				$item->typo		= 'widget';
				$item->label	= label::get_label('check_config') ?? 'Check config';
				$item->value	= (object)[
					'info' => self::check_config()
				];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;


		// add_hierarchy *
			$item = new stdClass();
				$install_config = install::get_config();

				$item->id		= 'add_hierarchy';
				$item->typo		= 'widget';
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
				$item->typo		= 'widget';
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
				$item->typo		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= 'DÉDALO API TEST ENVIRONMENT';
				$item->value	= (object)[];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;


		// sqo_test_environment *
			$item = new stdClass();
				$item->id		= 'sqo_test_environment';
				$item->class	= 'blue width_100';
				$item->typo		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= 'SEARCH QUERY OBJECT TEST ENVIRONMENT';
				$item->value	= (object)[];
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;


		// lock_components *
			$item = new stdClass();
				$item->id		= 'lock_components';
				$item->class	= 'width_100';
				$item->typo		= 'widget';
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
				$item->typo		= 'widget';
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
				$item->typo		= 'widget';
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
				$item->typo		= 'widget';
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
				$item->typo		= 'widget';
				$item->label	= 'Unit test area';
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;


		// environment *
			$item = new stdClass();
				$item->id		= 'environment';
				$item->typo		= 'widget';
				$item->label	= 'Environment';
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;


		// sequences_status *
			$response = db_data_check::check_sequences();
			$item = new stdClass();
				$item->id		= 'sequences_status';
				$item->typo		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= 'DB SEQUENCES STATUS';
				$item->value	= $response;
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;


		// counters_status *
			$response = counter::check_counters();
			$item = new stdClass();
				$item->id		= 'counters_status';
				$item->typo		= 'widget';
				$item->tipo		= $this->tipo;
				$item->label	= 'DEDALO COUNTERS STATUS';
				$item->value	= $response;
			$widget = $this->widget_factory($item);
			$ar_widgets[] = $widget;


		// php_info *
			$item = new stdClass();
				$item->id		= 'php_info';
				$item->typo		= 'widget';
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
			$widget->typo		= 'widget';
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
	* GENERATE_RELATIONS_TABLE_DATA
	* Re-creates relationships between components in given tables (or all of then)
	* All relationships pointers are stored in table 'relations' for easy search. This function
	* deletes the data in that table and and rebuild it from component's locators
	* @param string $tables = '*'
	* @return object $response
	*/
	public static function generate_relations_table_data(string $tables='*') : object {

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
					foreach ($items as $key => $table) {
						$ar_tables[] = trim($table);
					}
					return $ar_tables;
				}
			})($tables);

		// truncate relations table on *
			if ($tables==='*') {

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


		foreach ($ar_tables as $key => $table) {

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
							foreach ($datos->relations as $key => $current_locator) {
								if (isset($current_locator->from_component_tipo)) {
									$component_dato[$current_locator->from_component_tipo][] = $current_locator;
								}else{
									debug_log(__METHOD__." Error on get from_component_tipo from locator (table:$table) (ignored) locator:".to_string($current_locator), logger::ERROR);
								}
							}

						// propagate component dato
							foreach ($component_dato as $from_component_tipo => $ar_locators) {

								$propagate_options = new stdClass();
									$propagate_options->ar_locators			= $ar_locators;
									$propagate_options->section_id			= $section_id;
									$propagate_options->section_tipo		= $section_tipo;
									$propagate_options->from_component_tipo	= $from_component_tipo;

								// propagate_component_dato_to_relations_table takes care of delete and insert new relations
								$propagate_response = search::propagate_component_dato_to_relations_table($propagate_options);
							}

					}else{
						debug_log(__METHOD__." ERROR: Empty datos from: $table $section_tipo $section_id ".to_string(), logger::ERROR);
					}
				}

				// debug
					if(SHOW_DEBUG===true) {
						# Show log msg every 100 id
						if ($counter===1) {
							debug_log(__METHOD__." Updated section data table $table $i".to_string(), logger::DEBUG);
						}
						$counter++;
						if ($counter>300) {
							$counter = 1;
						}
					}

			}//end for ($i=$min; $i<=$max; $i++)

			// msg add table
				$response->msg[] = " Updated table data table $table ";

			// debug
				// debug_log(__METHOD__." Updated table data table $table  ", logger::WARNING);

		}//end foreach ($ar_tables as $key => $table)

		// response
			$response->result	= true;
			$response->msg[0]	= 'OK. All data is propagated successfully'; // Override first message
			$response->msg		= $response->msg; // array


		return $response;
	}//end generate_relations_table_data



	/**
	* CHECK_CONFIG
	* @return object $response
	*/
	public static function check_config() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ';

		// sample config file
			$input_lines = '';
			$file = DEDALO_CONFIG_PATH . '/sample.config.php';
			if (!file_exists($file)) {
				$response->msg .= 'sample config file do not exists';
			}else{
				$input_lines = file_get_contents($file);
				if(empty($input_lines)) {
					$response->msg .= 'Invalid sample config file';
				}
			}

			// regex search
			preg_match_all('/[^\/\/ #]define\(\'(\S*)\',.*/', $input_lines, $output_array);

			// check every constant from config
				$constants_list	= $output_array[1] ?? [];
				$ar_missing		= [];
				foreach ($constants_list as $const_name) {
					if (!defined($const_name)) {
						$ar_missing[] = $const_name;
					}
				}

		// sample config db
			$input_lines = '';
			$file = DEDALO_CONFIG_PATH . '/sample.config_db.php';
			if (!file_exists($file)) {
				$response->msg .= 'sample config_db file do not exists';
			}else{
				$input_lines = file_get_contents($file );
				if(empty($input_lines)) {
					$response->msg .= 'Invalid sample config_db file';
				}
			}

			// regex search
			preg_match_all("/[^\/\/ ]define\(\'(\S*)\',.*'.*/", $input_lines, $db_output_array);

			// check every constant from config
				$db_constants_list	= $db_output_array[1] ?? [];
				$db_ar_missing		= [];
				foreach ($db_constants_list as $const_name) {
					if (!defined($const_name)) {
						$db_ar_missing[] = $const_name;
					}
				}

		// sample config core
			$input_lines = '';
			$file = DEDALO_CONFIG_PATH . '/sample.config_core.php';
			if (!file_exists($file)) {
				$response->msg .= 'sample config_core file do not exists';
			}else{
				$input_lines = file_get_contents($file);
				if(empty($input_lines)) {
					$response->msg .= 'Invalid sample config_core file';
				}
			}

			// regex search
			preg_match_all("/[^\/\/ ]define\(\'(\S*)\',.*/", $input_lines, $core_output_array);

			// check every constant from config
				$core_constants_list	= $core_output_array[1] ?? [];
				$core_ar_missing		= [];
				foreach ($core_constants_list as $const_name) {
					if (!defined($const_name)) {
						$core_ar_missing[] = $const_name;
					}
				}

		// merge config and config_db vars
			array_push($constants_list, ...$db_constants_list, ...$core_constants_list);
			array_push($ar_missing, ...$db_ar_missing, ...$core_ar_missing);

		// response
			$response->result			= true;
			$response->msg				= 'OK. Request done successfully ';
			$response->constants_list	= $constants_list;
			$response->ar_missing		= $ar_missing;


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

		$ar_sql_query = [];

		// extensions
		$ar_sql_query[] = '
			CREATE EXTENSION IF NOT EXISTS pg_trgm
			SCHEMA public
			VERSION "1.6";

			CREATE EXTENSION IF NOT EXISTS unaccent
			SCHEMA public
			VERSION "1.1";
		';

		// functions
		$ar_sql_query[] = '
			CREATE OR REPLACE FUNCTION public.f_unaccent(
			text)
			RETURNS text
			LANGUAGE \'sql\'
			COST 100
			IMMUTABLE PARALLEL UNSAFE
			AS $BODY$
			SELECT public.unaccent(\'public.unaccent\', $1)
			$BODY$;

			-- DROP FUNCTION IF EXISTS public.relations_flat_st_si(jsonb);
			-- DROP FUNCTION IF EXISTS public.relations_flat_fct_st_si(jsonb);
			-- DROP FUNCTION IF EXISTS public.relations_flat_ty_st_si(jsonb);
			-- DROP FUNCTION IF EXISTS public.relations_flat_ty_st(jsonb);

			-- Create function with base flat locators st=section_tipo si=section_id (rsc197_2)
			CREATE OR REPLACE FUNCTION public.relations_flat_st_si(datos jsonb) RETURNS jsonb
			AS $$ SELECT jsonb_agg( concat(rel->>\'section_tipo\',\'_\',rel->>\'section_id\') )
			FROM jsonb_array_elements($1->\'relations\') rel(rel)
			$$ LANGUAGE sql IMMUTABLE;

			-- Create function with base flat locators fct=from_section_tipo st=section_tipo si=section_id (oh24_rsc197_2)
			CREATE OR REPLACE FUNCTION public.relations_flat_fct_st_si(datos jsonb) RETURNS jsonb
			AS $$ SELECT jsonb_agg( concat(rel->>\'from_component_tipo\',\'_\',rel->>\'section_tipo\',\'_\',rel->>\'section_id\') )
			FROM jsonb_array_elements($1->\'relations\') rel(rel)
			$$ LANGUAGE sql IMMUTABLE;

			-- Create function with base flat locators ty=type st=section_tipo si=section_id (oh24_rsc197_2)
			CREATE OR REPLACE FUNCTION public.relations_flat_ty_st_si(datos jsonb) RETURNS jsonb
			AS $$ SELECT jsonb_agg( concat(rel->>\'type\',\'_\',rel->>\'section_tipo\',\'_\',rel->>\'section_id\') )
			FROM jsonb_array_elements($1->\'relations\') rel(rel)
			$$ LANGUAGE sql IMMUTABLE;

			-- Create function with base flat locators ty=type st=section_tipo (dd96_rsc197)
			CREATE OR REPLACE FUNCTION public.relations_flat_ty_st(datos jsonb) RETURNS jsonb
			AS $$ SELECT jsonb_agg( concat(rel->>\'type\',\'_\',rel->>\'section_tipo\') )
			FROM jsonb_array_elements($1->\'relations\') rel(rel)
			$$ LANGUAGE sql IMMUTABLE;
		';

		// jer_dd
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS jer_dd_esdescriptor
			ON public.jer_dd USING btree
			(esdescriptor ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: jer_dd_esmodelo

			-- DROP INDEX IF EXISTS public.jer_dd_esmodelo;

			CREATE INDEX IF NOT EXISTS jer_dd_esmodelo
			ON public.jer_dd USING btree
			(esmodelo ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: jer_dd_modelo

			-- DROP INDEX IF EXISTS public.jer_dd_modelo;

			CREATE INDEX IF NOT EXISTS jer_dd_modelo
			ON public.jer_dd USING btree
			(modelo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: jer_dd_norden

			-- DROP INDEX IF EXISTS public.jer_dd_norden;

			CREATE INDEX IF NOT EXISTS jer_dd_norden
			ON public.jer_dd USING btree
			(norden ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: jer_dd_parent

			-- DROP INDEX IF EXISTS public.jer_dd_parent;

			CREATE INDEX IF NOT EXISTS jer_dd_parent
			ON public.jer_dd USING btree
			(parent COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: jer_dd_parent_esdescriptor_norden

			-- DROP INDEX IF EXISTS public.jer_dd_parent_esdescriptor_norden;

			CREATE INDEX IF NOT EXISTS jer_dd_parent_esdescriptor_norden
			ON public.jer_dd USING btree
			(parent COLLATE pg_catalog."default" ASC NULLS LAST, esdescriptor ASC NULLS LAST, norden ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: jer_dd_relaciones

			-- DROP INDEX IF EXISTS public.jer_dd_relaciones;

			CREATE INDEX IF NOT EXISTS jer_dd_relaciones
			ON public.jer_dd USING btree
			(relaciones COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: jer_dd_traducible

			-- DROP INDEX IF EXISTS public.jer_dd_traducible;

			CREATE INDEX IF NOT EXISTS jer_dd_traducible
			ON public.jer_dd USING btree
			(traducible ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: jer_dd_usableindex

			-- DROP INDEX IF EXISTS public.jer_dd_usableindex;

			CREATE INDEX IF NOT EXISTS jer_dd_usableindex
			ON public.jer_dd USING btree
			(tld COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: jer_dd_visible

			-- DROP INDEX IF EXISTS public.jer_dd_visible;

			CREATE INDEX IF NOT EXISTS jer_dd_visible
			ON public.jer_dd USING btree
			(visible ASC NULLS LAST)
			TABLESPACE pg_default;
		';

		// jer_dd
		$ar_sql_query[] =

		// main_dd
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS main_dd_tld
			ON public.main_dd USING btree
			(tld COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
		';

		// matrix
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_datos_gin
			ON public.matrix USING gin
			(datos jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_id_index

			-- DROP INDEX IF EXISTS public.matrix_id_index;

			CREATE INDEX IF NOT EXISTS matrix_id_index
			ON public.matrix USING btree
			(id ASC NULLS FIRST)
			TABLESPACE pg_default;
			-- Index: matrix_order_id_desc

			-- DROP INDEX IF EXISTS public.matrix_order_id_desc;

			CREATE INDEX IF NOT EXISTS matrix_order_id_desc
			ON public.matrix USING btree
			(id DESC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_relations_flat_fct_st_si

			-- DROP INDEX IF EXISTS public.matrix_relations_flat_fct_st_si;

			CREATE INDEX IF NOT EXISTS matrix_relations_flat_fct_st_si
			ON public.matrix USING gin
			(relations_flat_fct_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_relations_flat_st_si

			-- DROP INDEX IF EXISTS public.matrix_relations_flat_st_si;

			CREATE INDEX IF NOT EXISTS matrix_relations_flat_st_si
			ON public.matrix USING gin
			(relations_flat_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_relations_flat_ty_st

			-- DROP INDEX IF EXISTS public.matrix_relations_flat_ty_st;

			CREATE INDEX IF NOT EXISTS matrix_relations_flat_ty_st
			ON public.matrix USING gin
			(relations_flat_ty_st(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_relations_flat_ty_st_si

			-- DROP INDEX IF EXISTS public.matrix_relations_flat_ty_st_si;

			CREATE INDEX IF NOT EXISTS matrix_relations_flat_ty_st_si
			ON public.matrix USING gin
			(relations_flat_ty_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_relations_gin

			-- DROP INDEX IF EXISTS public.matrix_relations_gin;

			CREATE INDEX IF NOT EXISTS matrix_relations_gin
			ON public.matrix USING gin
			((datos #> \'{relations}\'::text[]) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_section_id

			-- DROP INDEX IF EXISTS public.matrix_section_id;

			CREATE INDEX IF NOT EXISTS matrix_section_id
			ON public.matrix USING btree
			(section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_section_tipo

			-- DROP INDEX IF EXISTS public.matrix_section_tipo;

			CREATE INDEX IF NOT EXISTS matrix_section_tipo
			ON public.matrix USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_section_tipo_section_id

			-- DROP INDEX IF EXISTS public.matrix_section_tipo_section_id;

			CREATE INDEX IF NOT EXISTS matrix_section_tipo_section_id
			ON public.matrix USING btree
			(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_section_tipo_section_id_desc

			-- DROP INDEX IF EXISTS public.matrix_section_tipo_section_id_desc;

			CREATE INDEX IF NOT EXISTS matrix_section_tipo_section_id_desc
			ON public.matrix USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_id DESC NULLS FIRST)
			TABLESPACE pg_default;
		';

		// matrix_activities
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_activities_datos_gin
			ON public.matrix_activities USING gin
			(datos jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_activities_id_idx

			-- DROP INDEX IF EXISTS public.matrix_activities_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_activities_id_idx
			ON public.matrix_activities USING btree
			(id ASC NULLS FIRST)
			TABLESPACE pg_default;
			-- Index: matrix_activities_relations_flat_fct_st_si

			-- DROP INDEX IF EXISTS public.matrix_activities_relations_flat_fct_st_si;

			CREATE INDEX IF NOT EXISTS matrix_activities_relations_flat_fct_st_si
			ON public.matrix_activities USING gin
			(relations_flat_fct_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_activities_relations_flat_st_si

			-- DROP INDEX IF EXISTS public.matrix_activities_relations_flat_st_si;

			CREATE INDEX IF NOT EXISTS matrix_activities_relations_flat_st_si
			ON public.matrix_activities USING gin
			(relations_flat_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_activities_relations_flat_ty_st

			-- DROP INDEX IF EXISTS public.matrix_activities_relations_flat_ty_st;

			CREATE INDEX IF NOT EXISTS matrix_activities_relations_flat_ty_st
			ON public.matrix_activities USING gin
			(relations_flat_ty_st(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_activities_relations_flat_ty_st_si

			-- DROP INDEX IF EXISTS public.matrix_activities_relations_flat_ty_st_si;

			CREATE INDEX IF NOT EXISTS matrix_activities_relations_flat_ty_st_si
			ON public.matrix_activities USING gin
			(relations_flat_ty_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_activities_relations_idx

			-- DROP INDEX IF EXISTS public.matrix_activities_relations_idx;

			CREATE INDEX IF NOT EXISTS matrix_activities_relations_idx
			ON public.matrix_activities USING gin
			((datos #> \'{relations}\'::text[]) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_activities_section_id

			-- DROP INDEX IF EXISTS public.matrix_activities_section_id;

			CREATE INDEX IF NOT EXISTS matrix_activities_section_id
			ON public.matrix_activities USING btree
			(section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_activities_section_tipo

			-- DROP INDEX IF EXISTS public.matrix_activities_section_tipo;

			CREATE INDEX IF NOT EXISTS matrix_activities_section_tipo
			ON public.matrix_activities USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_activities_section_tipo_section_id

			-- DROP INDEX IF EXISTS public.matrix_activities_section_tipo_section_id;

			CREATE INDEX IF NOT EXISTS matrix_activities_section_tipo_section_id
			ON public.matrix_activities USING btree
			(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
		';

		// matrix_activity
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_activity_date_btree
			ON public.matrix_activity USING btree
			(date ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_activity_datos_gin

			-- DROP INDEX IF EXISTS public.matrix_activity_datos_gin;

			CREATE INDEX IF NOT EXISTS matrix_activity_datos_gin
			ON public.matrix_activity USING gin
			(datos jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_activity_order_id_asc

			-- DROP INDEX IF EXISTS public.matrix_activity_order_id_asc;

			CREATE INDEX IF NOT EXISTS matrix_activity_order_id_asc
			ON public.matrix_activity USING btree
			(id ASC NULLS FIRST)
			TABLESPACE pg_default;
			-- Index: matrix_activity_order_id_desc

			-- DROP INDEX IF EXISTS public.matrix_activity_order_id_desc;

			CREATE INDEX IF NOT EXISTS matrix_activity_order_id_desc
			ON public.matrix_activity USING btree
			(id DESC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_activity_order_section_id_desc

			-- DROP INDEX IF EXISTS public.matrix_activity_order_section_id_desc;

			CREATE INDEX IF NOT EXISTS matrix_activity_order_section_id_desc
			ON public.matrix_activity USING btree
			(section_id DESC NULLS FIRST)
			TABLESPACE pg_default;
			-- Index: matrix_activity_relations_idx

			-- DROP INDEX IF EXISTS public.matrix_activity_relations_idx;

			CREATE INDEX IF NOT EXISTS matrix_activity_relations_idx
			ON public.matrix_activity USING gin
			((datos #> \'{relations}\'::text[]) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_activity_section_id

			-- DROP INDEX IF EXISTS public.matrix_activity_section_id;

			CREATE INDEX IF NOT EXISTS matrix_activity_section_id
			ON public.matrix_activity USING btree
			(section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_activity_section_tipo

			-- DROP INDEX IF EXISTS public.matrix_activity_section_tipo;

			CREATE INDEX IF NOT EXISTS matrix_activity_section_tipo
			ON public.matrix_activity USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_activity_section_tipo_section_id

			-- DROP INDEX IF EXISTS public.matrix_activity_section_tipo_section_id;

			CREATE INDEX IF NOT EXISTS matrix_activity_section_tipo_section_id
			ON public.matrix_activity USING btree
			(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
		';

		// matrix_counter
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_counter_parent
			ON public.matrix_counter USING btree
			(parent ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_counter_tipo

			-- DROP INDEX IF EXISTS public.matrix_counter_tipo;

			CREATE INDEX IF NOT EXISTS matrix_counter_tipo
			ON public.matrix_counter USING btree
			(tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
		';

		// matrix_counter_dd
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_counter_dd_parent
			ON public.matrix_counter_dd USING btree
			(parent ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_counter_dd_tipo

			-- DROP INDEX IF EXISTS public.matrix_counter_dd_tipo;

			CREATE INDEX IF NOT EXISTS matrix_counter_dd_tipo
			ON public.matrix_counter_dd USING btree
			(tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
		';

		// matrix_dataframe
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_dataframe_datos_idx
			ON public.matrix_dataframe USING gin
			(datos jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_dataframe_expr_idx

			-- DROP INDEX IF EXISTS public.matrix_dataframe_expr_idx;

			CREATE INDEX IF NOT EXISTS matrix_dataframe_expr_idx
			ON public.matrix_dataframe USING gin
			((datos #> \'{relations}\'::text[]) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_dataframe_id_idx

			-- DROP INDEX IF EXISTS public.matrix_dataframe_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_dataframe_id_idx
			ON public.matrix_dataframe USING btree
			(id ASC NULLS FIRST)
			TABLESPACE pg_default;
			-- Index: matrix_dataframe_id_idx1

			-- DROP INDEX IF EXISTS public.matrix_dataframe_id_idx1;

			CREATE INDEX IF NOT EXISTS matrix_dataframe_id_idx1
			ON public.matrix_dataframe USING btree
			(id DESC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_dataframe_relations_flat_fct_st_si_idx

			-- DROP INDEX IF EXISTS public.matrix_dataframe_relations_flat_fct_st_si_idx;

			CREATE INDEX IF NOT EXISTS matrix_dataframe_relations_flat_fct_st_si_idx
			ON public.matrix_dataframe USING gin
			(relations_flat_fct_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_dataframe_relations_flat_st_si_idx

			-- DROP INDEX IF EXISTS public.matrix_dataframe_relations_flat_st_si_idx;

			CREATE INDEX IF NOT EXISTS matrix_dataframe_relations_flat_st_si_idx
			ON public.matrix_dataframe USING gin
			(relations_flat_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_dataframe_relations_flat_ty_st_idx

			-- DROP INDEX IF EXISTS public.matrix_dataframe_relations_flat_ty_st_idx;

			CREATE INDEX IF NOT EXISTS matrix_dataframe_relations_flat_ty_st_idx
			ON public.matrix_dataframe USING gin
			(relations_flat_ty_st(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_dataframe_relations_flat_ty_st_si_idx

			-- DROP INDEX IF EXISTS public.matrix_dataframe_relations_flat_ty_st_si_idx;

			CREATE INDEX IF NOT EXISTS matrix_dataframe_relations_flat_ty_st_si_idx
			ON public.matrix_dataframe USING gin
			(relations_flat_ty_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_dataframe_section_id_idx

			-- DROP INDEX IF EXISTS public.matrix_dataframe_section_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_dataframe_section_id_idx
			ON public.matrix_dataframe USING btree
			(section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_dataframe_section_id_section_tipo_idx

			-- DROP INDEX IF EXISTS public.matrix_dataframe_section_id_section_tipo_idx;

			CREATE INDEX IF NOT EXISTS matrix_dataframe_section_id_section_tipo_idx
			ON public.matrix_dataframe USING btree
			(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_dataframe_section_tipo_idx

			-- DROP INDEX IF EXISTS public.matrix_dataframe_section_tipo_idx;

			CREATE INDEX IF NOT EXISTS matrix_dataframe_section_tipo_idx
			ON public.matrix_dataframe USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_dataframe_section_tipo_section_id_idx

			-- DROP INDEX IF EXISTS public.matrix_dataframe_section_tipo_section_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_dataframe_section_tipo_section_id_idx
			ON public.matrix_dataframe USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_id DESC NULLS FIRST)
			TABLESPACE pg_default;
		';

		// matrix_dd
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_dd_dd1475_gin
			ON public.matrix_dd USING gin
			((datos #> \'{components,dd1475,dato,lg-nolan}\'::text[]) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_dd_gin

			-- DROP INDEX IF EXISTS public.matrix_dd_gin;

			CREATE INDEX IF NOT EXISTS matrix_dd_gin
			ON public.matrix_dd USING gin
			(datos jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_dd_relations_idx

			-- DROP INDEX IF EXISTS public.matrix_dd_relations_idx;

			CREATE INDEX IF NOT EXISTS matrix_dd_relations_idx
			ON public.matrix_dd USING gin
			((datos #> \'{relations}\'::text[]) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_dd_section_id

			-- DROP INDEX IF EXISTS public.matrix_dd_section_id;

			CREATE INDEX IF NOT EXISTS matrix_dd_section_id
			ON public.matrix_dd USING btree
			(section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_dd_section_tipo

			-- DROP INDEX IF EXISTS public.matrix_dd_section_tipo;

			CREATE INDEX IF NOT EXISTS matrix_dd_section_tipo
			ON public.matrix_dd USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_dd_section_tipo_section_id

			-- DROP INDEX IF EXISTS public.matrix_dd_section_tipo_section_id;

			CREATE INDEX IF NOT EXISTS matrix_dd_section_tipo_section_id
			ON public.matrix_dd USING btree
			(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
		';

		// matrix_descriptors_dd
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_descriptors_dd_dato_tipo_lang
			ON public.matrix_descriptors_dd USING btree
			(dato COLLATE pg_catalog."default" ASC NULLS LAST, tipo COLLATE pg_catalog."default" ASC NULLS LAST, lang COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_descriptors_dd_lang

			-- DROP INDEX IF EXISTS public.matrix_descriptors_dd_lang;

			CREATE INDEX IF NOT EXISTS matrix_descriptors_dd_lang
			ON public.matrix_descriptors_dd USING btree
			(lang COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_descriptors_dd_parent

			-- DROP INDEX IF EXISTS public.matrix_descriptors_dd_parent;

			CREATE INDEX IF NOT EXISTS matrix_descriptors_dd_parent
			ON public.matrix_descriptors_dd USING btree
			(parent COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_descriptors_dd_parent_tipo_lang

			-- DROP INDEX IF EXISTS public.matrix_descriptors_dd_parent_tipo_lang;

			CREATE INDEX IF NOT EXISTS matrix_descriptors_dd_parent_tipo_lang
			ON public.matrix_descriptors_dd USING btree
			(parent COLLATE pg_catalog."default" ASC NULLS LAST, tipo COLLATE pg_catalog."default" ASC NULLS LAST, lang COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_descriptors_dd_tipo

			-- DROP INDEX IF EXISTS public.matrix_descriptors_dd_tipo;

			CREATE INDEX IF NOT EXISTS matrix_descriptors_dd_tipo
			ON public.matrix_descriptors_dd USING btree
			(tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
		';

		// matrix_hierarchy
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_hierarchy_datos_idx
			ON public.matrix_hierarchy USING gin
			(datos jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_hierarchy_id_idx

			-- DROP INDEX IF EXISTS public.matrix_hierarchy_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_hierarchy_id_idx
			ON public.matrix_hierarchy USING btree
			(id ASC NULLS FIRST)
			TABLESPACE pg_default;
			-- Index: matrix_hierarchy_id_idx1

			-- DROP INDEX IF EXISTS public.matrix_hierarchy_id_idx1;

			CREATE INDEX IF NOT EXISTS matrix_hierarchy_id_idx1
			ON public.matrix_hierarchy USING btree
			(id DESC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_hierarchy_relations_flat_fct_st_si

			-- DROP INDEX IF EXISTS public.matrix_hierarchy_relations_flat_fct_st_si;

			CREATE INDEX IF NOT EXISTS matrix_hierarchy_relations_flat_fct_st_si
			ON public.matrix_hierarchy USING gin
			(relations_flat_fct_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_hierarchy_relations_flat_st_si

			-- DROP INDEX IF EXISTS public.matrix_hierarchy_relations_flat_st_si;

			CREATE INDEX IF NOT EXISTS matrix_hierarchy_relations_flat_st_si
			ON public.matrix_hierarchy USING gin
			(relations_flat_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_hierarchy_relations_flat_ty_st

			-- DROP INDEX IF EXISTS public.matrix_hierarchy_relations_flat_ty_st;

			CREATE INDEX IF NOT EXISTS matrix_hierarchy_relations_flat_ty_st
			ON public.matrix_hierarchy USING gin
			(relations_flat_ty_st(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_hierarchy_relations_flat_ty_st_si

			-- DROP INDEX IF EXISTS public.matrix_hierarchy_relations_flat_ty_st_si;

			CREATE INDEX IF NOT EXISTS matrix_hierarchy_relations_flat_ty_st_si
			ON public.matrix_hierarchy USING gin
			(relations_flat_ty_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_hierarchy_relations_idx

			-- DROP INDEX IF EXISTS public.matrix_hierarchy_relations_idx;

			CREATE INDEX IF NOT EXISTS matrix_hierarchy_relations_idx
			ON public.matrix_hierarchy USING gin
			((datos #> \'{relations}\'::text[]) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_hierarchy_section_id_idx

			-- DROP INDEX IF EXISTS public.matrix_hierarchy_section_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_hierarchy_section_id_idx
			ON public.matrix_hierarchy USING btree
			(section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_hierarchy_section_tipo_idx

			-- DROP INDEX IF EXISTS public.matrix_hierarchy_section_tipo_idx;

			CREATE INDEX IF NOT EXISTS matrix_hierarchy_section_tipo_idx
			ON public.matrix_hierarchy USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_hierarchy_section_tipo_section_id

			-- DROP INDEX IF EXISTS public.matrix_hierarchy_section_tipo_section_id;

			CREATE INDEX IF NOT EXISTS matrix_hierarchy_section_tipo_section_id
			ON public.matrix_hierarchy USING btree
			(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_hierarchy_section_tipo_section_id_desc

			-- DROP INDEX IF EXISTS public.matrix_hierarchy_section_tipo_section_id_desc;

			CREATE INDEX IF NOT EXISTS matrix_hierarchy_section_tipo_section_id_desc
			ON public.matrix_hierarchy USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_id DESC NULLS FIRST)
			TABLESPACE pg_default;
			-- Index: matrix_hierarchy_term

			-- DROP INDEX IF EXISTS public.matrix_hierarchy_term;

			CREATE INDEX IF NOT EXISTS matrix_hierarchy_term
			ON public.matrix_hierarchy USING gin
			(f_unaccent(datos #>> \'{components,hierarchy25,dato}\'::text[]) COLLATE pg_catalog."default" gin_trgm_ops)
			TABLESPACE pg_default;
		';

		// matrix_hierarchy_main
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_hierarchy_main_datos_idx
			ON public.matrix_hierarchy_main USING gin
			(datos jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_hierarchy_main_id_idx

			-- DROP INDEX IF EXISTS public.matrix_hierarchy_main_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_hierarchy_main_id_idx
			ON public.matrix_hierarchy_main USING btree
			(id ASC NULLS FIRST)
			TABLESPACE pg_default;
			-- Index: matrix_hierarchy_main_id_idx1

			-- DROP INDEX IF EXISTS public.matrix_hierarchy_main_id_idx1;

			CREATE INDEX IF NOT EXISTS matrix_hierarchy_main_id_idx1
			ON public.matrix_hierarchy_main USING btree
			(id DESC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_hierarchy_main_relations_idx

			-- DROP INDEX IF EXISTS public.matrix_hierarchy_main_relations_idx;

			CREATE INDEX IF NOT EXISTS matrix_hierarchy_main_relations_idx
			ON public.matrix_hierarchy_main USING gin
			((datos #> \'{relations}\'::text[]) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_hierarchy_main_section_id_idx

			-- DROP INDEX IF EXISTS public.matrix_hierarchy_main_section_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_hierarchy_main_section_id_idx
			ON public.matrix_hierarchy_main USING btree
			(section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_hierarchy_main_section_tipo_idx

			-- DROP INDEX IF EXISTS public.matrix_hierarchy_main_section_tipo_idx;

			CREATE INDEX IF NOT EXISTS matrix_hierarchy_main_section_tipo_idx
			ON public.matrix_hierarchy_main USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
		';

		// matrix_indexations
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_indexations_datos_idx
			ON public.matrix_indexations USING gin
			(datos jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_indexations_id_idx

			-- DROP INDEX IF EXISTS public.matrix_indexations_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_indexations_id_idx
			ON public.matrix_indexations USING btree
			(id ASC NULLS FIRST)
			TABLESPACE pg_default;
			-- Index: matrix_indexations_id_idx1

			-- DROP INDEX IF EXISTS public.matrix_indexations_id_idx1;

			CREATE INDEX IF NOT EXISTS matrix_indexations_id_idx1
			ON public.matrix_indexations USING btree
			(id DESC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_indexations_relations_idx

			-- DROP INDEX IF EXISTS public.matrix_indexations_relations_idx;

			CREATE INDEX IF NOT EXISTS matrix_indexations_relations_idx
			ON public.matrix_indexations USING gin
			((datos #> \'{relations}\'::text[]) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_indexations_section_id_idx

			-- DROP INDEX IF EXISTS public.matrix_indexations_section_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_indexations_section_id_idx
			ON public.matrix_indexations USING btree
			(section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_indexations_section_tipo_idx

			-- DROP INDEX IF EXISTS public.matrix_indexations_section_tipo_idx;

			CREATE INDEX IF NOT EXISTS matrix_indexations_section_tipo_idx
			ON public.matrix_indexations USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
		';

		// matrix_langs
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_langs_datos_idx
			ON public.matrix_langs USING gin
			(datos jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_langs_hierarchy41_gin

			-- DROP INDEX IF EXISTS public.matrix_langs_hierarchy41_gin;

			CREATE INDEX IF NOT EXISTS matrix_langs_hierarchy41_gin
			ON public.matrix_langs USING gin
			((datos #> \'{components,hierarchy41,dato,lg-nolan}\'::text[]))
			TABLESPACE pg_default;
			-- Index: matrix_langs_id_idx

			-- DROP INDEX IF EXISTS public.matrix_langs_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_langs_id_idx
			ON public.matrix_langs USING btree
			(id ASC NULLS FIRST)
			TABLESPACE pg_default;
			-- Index: matrix_langs_id_idx1

			-- DROP INDEX IF EXISTS public.matrix_langs_id_idx1;

			CREATE INDEX IF NOT EXISTS matrix_langs_id_idx1
			ON public.matrix_langs USING btree
			(id DESC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_langs_relations_idx

			-- DROP INDEX IF EXISTS public.matrix_langs_relations_idx;

			CREATE INDEX IF NOT EXISTS matrix_langs_relations_idx
			ON public.matrix_langs USING gin
			((datos #> \'{relations}\'::text[]) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_langs_section_id_idx

			-- DROP INDEX IF EXISTS public.matrix_langs_section_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_langs_section_id_idx
			ON public.matrix_langs USING btree
			(section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_langs_section_tipo_idx

			-- DROP INDEX IF EXISTS public.matrix_langs_section_tipo_idx;

			CREATE INDEX IF NOT EXISTS matrix_langs_section_tipo_idx
			ON public.matrix_langs USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_langs_section_tipo_section_id

			-- DROP INDEX IF EXISTS public.matrix_langs_section_tipo_section_id;

			CREATE INDEX IF NOT EXISTS matrix_langs_section_tipo_section_id
			ON public.matrix_langs USING btree
			(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
		';

		// matrix_list
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_list_datos_gin
			ON public.matrix_list USING gin
			(datos jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_list_relations_flat_fct_st_si

			-- DROP INDEX IF EXISTS public.matrix_list_relations_flat_fct_st_si;

			CREATE INDEX IF NOT EXISTS matrix_list_relations_flat_fct_st_si
			ON public.matrix_list USING gin
			(relations_flat_fct_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_list_relations_flat_st_si

			-- DROP INDEX IF EXISTS public.matrix_list_relations_flat_st_si;

			CREATE INDEX IF NOT EXISTS matrix_list_relations_flat_st_si
			ON public.matrix_list USING gin
			(relations_flat_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_list_relations_flat_ty_st

			-- DROP INDEX IF EXISTS public.matrix_list_relations_flat_ty_st;

			CREATE INDEX IF NOT EXISTS matrix_list_relations_flat_ty_st
			ON public.matrix_list USING gin
			(relations_flat_ty_st(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_list_relations_flat_ty_st_si

			-- DROP INDEX IF EXISTS public.matrix_list_relations_flat_ty_st_si;

			CREATE INDEX IF NOT EXISTS matrix_list_relations_flat_ty_st_si
			ON public.matrix_list USING gin
			(relations_flat_ty_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_list_relations_idx

			-- DROP INDEX IF EXISTS public.matrix_list_relations_idx;

			CREATE INDEX IF NOT EXISTS matrix_list_relations_idx
			ON public.matrix_list USING gin
			((datos #> \'{relations}\'::text[]) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_list_section_id

			-- DROP INDEX IF EXISTS public.matrix_list_section_id;

			CREATE INDEX IF NOT EXISTS matrix_list_section_id
			ON public.matrix_list USING btree
			(section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_list_section_tipo

			-- DROP INDEX IF EXISTS public.matrix_list_section_tipo;

			CREATE INDEX IF NOT EXISTS matrix_list_section_tipo
			ON public.matrix_list USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_list_section_tipo_section_id

			-- DROP INDEX IF EXISTS public.matrix_list_section_tipo_section_id;

			CREATE INDEX IF NOT EXISTS matrix_list_section_tipo_section_id
			ON public.matrix_list USING btree
			(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
		';

		// matrix_nexus
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_nexus_datos_idx
			ON public.matrix_nexus USING gin
			(datos jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_nexus_expr_idx

			-- DROP INDEX IF EXISTS public.matrix_nexus_expr_idx;

			CREATE INDEX IF NOT EXISTS matrix_nexus_expr_idx
			ON public.matrix_nexus USING gin
			((datos #> \'{relations}\'::text[]) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_nexus_id_idx

			-- DROP INDEX IF EXISTS public.matrix_nexus_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_nexus_id_idx
			ON public.matrix_nexus USING btree
			(id ASC NULLS FIRST)
			TABLESPACE pg_default;
			-- Index: matrix_nexus_id_idx1

			-- DROP INDEX IF EXISTS public.matrix_nexus_id_idx1;

			CREATE INDEX IF NOT EXISTS matrix_nexus_id_idx1
			ON public.matrix_nexus USING btree
			(id DESC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_nexus_relations_flat_fct_st_si_idx

			-- DROP INDEX IF EXISTS public.matrix_nexus_relations_flat_fct_st_si_idx;

			CREATE INDEX IF NOT EXISTS matrix_nexus_relations_flat_fct_st_si_idx
			ON public.matrix_nexus USING gin
			(relations_flat_fct_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_nexus_relations_flat_st_si_idx

			-- DROP INDEX IF EXISTS public.matrix_nexus_relations_flat_st_si_idx;

			CREATE INDEX IF NOT EXISTS matrix_nexus_relations_flat_st_si_idx
			ON public.matrix_nexus USING gin
			(relations_flat_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_nexus_relations_flat_ty_st_idx

			-- DROP INDEX IF EXISTS public.matrix_nexus_relations_flat_ty_st_idx;

			CREATE INDEX IF NOT EXISTS matrix_nexus_relations_flat_ty_st_idx
			ON public.matrix_nexus USING gin
			(relations_flat_ty_st(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_nexus_relations_flat_ty_st_si_idx

			-- DROP INDEX IF EXISTS public.matrix_nexus_relations_flat_ty_st_si_idx;

			CREATE INDEX IF NOT EXISTS matrix_nexus_relations_flat_ty_st_si_idx
			ON public.matrix_nexus USING gin
			(relations_flat_ty_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_nexus_section_id_idx

			-- DROP INDEX IF EXISTS public.matrix_nexus_section_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_nexus_section_id_idx
			ON public.matrix_nexus USING btree
			(section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_nexus_section_id_section_tipo_idx

			-- DROP INDEX IF EXISTS public.matrix_nexus_section_id_section_tipo_idx;

			CREATE INDEX IF NOT EXISTS matrix_nexus_section_id_section_tipo_idx
			ON public.matrix_nexus USING btree
			(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_nexus_section_tipo_idx

			-- DROP INDEX IF EXISTS public.matrix_nexus_section_tipo_idx;

			CREATE INDEX IF NOT EXISTS matrix_nexus_section_tipo_idx
			ON public.matrix_nexus USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_nexus_section_tipo_section_id_idx

			-- DROP INDEX IF EXISTS public.matrix_nexus_section_tipo_section_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_nexus_section_tipo_section_id_idx
			ON public.matrix_nexus USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_id DESC NULLS FIRST)
			TABLESPACE pg_default;
		';

		// matrix_nexus_main
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_nexus_main_datos_idx
			ON public.matrix_nexus_main USING gin
			(datos jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_nexus_main_expr_idx

			-- DROP INDEX IF EXISTS public.matrix_nexus_main_expr_idx;

			CREATE INDEX IF NOT EXISTS matrix_nexus_main_expr_idx
			ON public.matrix_nexus_main USING gin
			((datos #> \'{relations}\'::text[]) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_nexus_main_id_idx

			-- DROP INDEX IF EXISTS public.matrix_nexus_main_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_nexus_main_id_idx
			ON public.matrix_nexus_main USING btree
			(id ASC NULLS FIRST)
			TABLESPACE pg_default;
			-- Index: matrix_nexus_main_id_idx1

			-- DROP INDEX IF EXISTS public.matrix_nexus_main_id_idx1;

			CREATE INDEX IF NOT EXISTS matrix_nexus_main_id_idx1
			ON public.matrix_nexus_main USING btree
			(id DESC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_nexus_main_relations_flat_fct_st_si_idx

			-- DROP INDEX IF EXISTS public.matrix_nexus_main_relations_flat_fct_st_si_idx;

			CREATE INDEX IF NOT EXISTS matrix_nexus_main_relations_flat_fct_st_si_idx
			ON public.matrix_nexus_main USING gin
			(relations_flat_fct_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_nexus_main_relations_flat_st_si_idx

			-- DROP INDEX IF EXISTS public.matrix_nexus_main_relations_flat_st_si_idx;

			CREATE INDEX IF NOT EXISTS matrix_nexus_main_relations_flat_st_si_idx
			ON public.matrix_nexus_main USING gin
			(relations_flat_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_nexus_main_relations_flat_ty_st_idx

			-- DROP INDEX IF EXISTS public.matrix_nexus_main_relations_flat_ty_st_idx;

			CREATE INDEX IF NOT EXISTS matrix_nexus_main_relations_flat_ty_st_idx
			ON public.matrix_nexus_main USING gin
			(relations_flat_ty_st(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_nexus_main_relations_flat_ty_st_si_idx

			-- DROP INDEX IF EXISTS public.matrix_nexus_main_relations_flat_ty_st_si_idx;

			CREATE INDEX IF NOT EXISTS matrix_nexus_main_relations_flat_ty_st_si_idx
			ON public.matrix_nexus_main USING gin
			(relations_flat_ty_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_nexus_main_section_id_idx

			-- DROP INDEX IF EXISTS public.matrix_nexus_main_section_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_nexus_main_section_id_idx
			ON public.matrix_nexus_main USING btree
			(section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_nexus_main_section_id_section_tipo_idx

			-- DROP INDEX IF EXISTS public.matrix_nexus_main_section_id_section_tipo_idx;

			CREATE INDEX IF NOT EXISTS matrix_nexus_main_section_id_section_tipo_idx
			ON public.matrix_nexus_main USING btree
			(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_nexus_main_section_tipo_idx

			-- DROP INDEX IF EXISTS public.matrix_nexus_main_section_tipo_idx;

			CREATE INDEX IF NOT EXISTS matrix_nexus_main_section_tipo_idx
			ON public.matrix_nexus_main USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_nexus_main_section_tipo_section_id_idx

			-- DROP INDEX IF EXISTS public.matrix_nexus_main_section_tipo_section_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_nexus_main_section_tipo_section_id_idx
			ON public.matrix_nexus_main USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_id DESC NULLS FIRST)
			TABLESPACE pg_default;
		';

		// matrix_notes
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_notes_datos_idx
			ON public.matrix_notes USING gin
			(datos jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_notes_id_idx

			-- DROP INDEX IF EXISTS public.matrix_notes_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_notes_id_idx
			ON public.matrix_notes USING btree
			(id ASC NULLS FIRST)
			TABLESPACE pg_default;
			-- Index: matrix_notes_id_idx1

			-- DROP INDEX IF EXISTS public.matrix_notes_id_idx1;

			CREATE INDEX IF NOT EXISTS matrix_notes_id_idx1
			ON public.matrix_notes USING btree
			(id DESC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_notes_relations_idx

			-- DROP INDEX IF EXISTS public.matrix_notes_relations_idx;

			CREATE INDEX IF NOT EXISTS matrix_notes_relations_idx
			ON public.matrix_notes USING gin
			((datos #> \'{relations}\'::text[]) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_notes_section_id_idx

			-- DROP INDEX IF EXISTS public.matrix_notes_section_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_notes_section_id_idx
			ON public.matrix_notes USING btree
			(section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_notes_section_tipo_idx

			-- DROP INDEX IF EXISTS public.matrix_notes_section_tipo_idx;

			CREATE INDEX IF NOT EXISTS matrix_notes_section_tipo_idx
			ON public.matrix_notes USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
		';

		// matrix_profiles
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_profiles_datos_gin
			ON public.matrix_profiles USING gin
			(datos jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_profiles_relations_idx

			-- DROP INDEX IF EXISTS public.matrix_profiles_relations_idx;

			CREATE INDEX IF NOT EXISTS matrix_profiles_relations_idx
			ON public.matrix_profiles USING gin
			((datos #> \'{relations}\'::text[]) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_profiles_section_id

			-- DROP INDEX IF EXISTS public.matrix_profiles_section_id;

			CREATE INDEX IF NOT EXISTS matrix_profiles_section_id
			ON public.matrix_profiles USING btree
			(section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_profiles_section_tipo

			-- DROP INDEX IF EXISTS public.matrix_profiles_section_tipo;

			CREATE INDEX IF NOT EXISTS matrix_profiles_section_tipo
			ON public.matrix_profiles USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_profiles_section_tipo_section_id

			-- DROP INDEX IF EXISTS public.matrix_profiles_section_tipo_section_id;

			CREATE INDEX IF NOT EXISTS matrix_profiles_section_tipo_section_id
			ON public.matrix_profiles USING btree
			(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
		';

		// matrix_projects
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_projects_datos_gin
			ON public.matrix_projects USING gin
			(datos jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_projects_relations_idx

			-- DROP INDEX IF EXISTS public.matrix_projects_relations_idx;

			CREATE INDEX IF NOT EXISTS matrix_projects_relations_idx
			ON public.matrix_projects USING gin
			((datos #> \'{relations}\'::text[]) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_projects_section_id

			-- DROP INDEX IF EXISTS public.matrix_projects_section_id;

			CREATE INDEX IF NOT EXISTS matrix_projects_section_id
			ON public.matrix_projects USING btree
			(section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_projects_section_tipo

			-- DROP INDEX IF EXISTS public.matrix_projects_section_tipo;

			CREATE INDEX IF NOT EXISTS matrix_projects_section_tipo
			ON public.matrix_projects USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_projects_section_tipo_section_id

			-- DROP INDEX IF EXISTS public.matrix_projects_section_tipo_section_id;

			CREATE INDEX IF NOT EXISTS matrix_projects_section_tipo_section_id
			ON public.matrix_projects USING btree
			(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
		';

		// matrix_stats
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_stats_datos_idx
			ON public.matrix_stats USING gin
			(datos jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_stats_expr_idx

			-- DROP INDEX IF EXISTS public.matrix_stats_expr_idx;

			CREATE INDEX IF NOT EXISTS matrix_stats_expr_idx
			ON public.matrix_stats USING gin
			((datos #> \'{relations}\'::text[]) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_stats_section_id_idx

			-- DROP INDEX IF EXISTS public.matrix_stats_section_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_stats_section_id_idx
			ON public.matrix_stats USING btree
			(section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_stats_section_id_section_tipo_idx

			-- DROP INDEX IF EXISTS public.matrix_stats_section_id_section_tipo_idx;

			CREATE INDEX IF NOT EXISTS matrix_stats_section_id_section_tipo_idx
			ON public.matrix_stats USING btree
			(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_stats_section_tipo_idx

			-- DROP INDEX IF EXISTS public.matrix_stats_section_tipo_idx;

			CREATE INDEX IF NOT EXISTS matrix_stats_section_tipo_idx
			ON public.matrix_stats USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
		';

		// matrix_test
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_test_datos_idx
			ON public.matrix_test USING gin
			(datos jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_test_id_idx

			-- DROP INDEX IF EXISTS public.matrix_test_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_test_id_idx
			ON public.matrix_test USING btree
			(id ASC NULLS FIRST)
			TABLESPACE pg_default;
			-- Index: matrix_test_id_idx1

			-- DROP INDEX IF EXISTS public.matrix_test_id_idx1;

			CREATE INDEX IF NOT EXISTS matrix_test_id_idx1
			ON public.matrix_test USING btree
			(id DESC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_test_relations_flat_fct_st_si

			-- DROP INDEX IF EXISTS public.matrix_test_relations_flat_fct_st_si;

			CREATE INDEX IF NOT EXISTS matrix_test_relations_flat_fct_st_si
			ON public.matrix_test USING gin
			(relations_flat_fct_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_test_relations_flat_st_si

			-- DROP INDEX IF EXISTS public.matrix_test_relations_flat_st_si;

			CREATE INDEX IF NOT EXISTS matrix_test_relations_flat_st_si
			ON public.matrix_test USING gin
			(relations_flat_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_test_relations_flat_ty_st

			-- DROP INDEX IF EXISTS public.matrix_test_relations_flat_ty_st;

			CREATE INDEX IF NOT EXISTS matrix_test_relations_flat_ty_st
			ON public.matrix_test USING gin
			(relations_flat_ty_st(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_test_relations_flat_ty_st_si

			-- DROP INDEX IF EXISTS public.matrix_test_relations_flat_ty_st_si;

			CREATE INDEX IF NOT EXISTS matrix_test_relations_flat_ty_st_si
			ON public.matrix_test USING gin
			(relations_flat_ty_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_test_section_id_idx

			-- DROP INDEX IF EXISTS public.matrix_test_section_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_test_section_id_idx
			ON public.matrix_test USING btree
			(section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_test_section_tipo_idx

			-- DROP INDEX IF EXISTS public.matrix_test_section_tipo_idx;

			CREATE INDEX IF NOT EXISTS matrix_test_section_tipo_idx
			ON public.matrix_test USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_test_section_tipo_section_id

			-- DROP INDEX IF EXISTS public.matrix_test_section_tipo_section_id;

			CREATE INDEX IF NOT EXISTS matrix_test_section_tipo_section_id
			ON public.matrix_test USING btree
			(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
		';

		// matrix_time_machine
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_time_machine_datos_gin
			ON public.matrix_time_machine USING gin
			(dato jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_time_machine_id_matrix

			-- DROP INDEX IF EXISTS public.matrix_time_machine_id_matrix;

			CREATE INDEX IF NOT EXISTS matrix_time_machine_id_matrix
			ON public.matrix_time_machine USING btree
			(id_matrix ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_time_machine_lang

			-- DROP INDEX IF EXISTS public.matrix_time_machine_lang;

			CREATE INDEX IF NOT EXISTS matrix_time_machine_lang
			ON public.matrix_time_machine USING btree
			(lang COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_time_machine_section_id

			-- DROP INDEX IF EXISTS public.matrix_time_machine_section_id;

			CREATE INDEX IF NOT EXISTS matrix_time_machine_section_id
			ON public.matrix_time_machine USING btree
			(section_id DESC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_time_machine_section_id_key

			-- DROP INDEX IF EXISTS public.matrix_time_machine_section_id_key;

			CREATE INDEX IF NOT EXISTS matrix_time_machine_section_id_key
			ON public.matrix_time_machine USING btree
			(section_id ASC NULLS LAST, section_id_key ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, tipo COLLATE pg_catalog."default" ASC NULLS LAST, lang COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_time_machine_section_tipo

			-- DROP INDEX IF EXISTS public.matrix_time_machine_section_tipo;

			CREATE INDEX IF NOT EXISTS matrix_time_machine_section_tipo
			ON public.matrix_time_machine USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_time_machine_state

			-- DROP INDEX IF EXISTS public.matrix_time_machine_state;

			CREATE INDEX IF NOT EXISTS matrix_time_machine_state
			ON public.matrix_time_machine USING btree
			(state COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_time_machine_timestamp

			-- DROP INDEX IF EXISTS public.matrix_time_machine_timestamp;

			CREATE INDEX IF NOT EXISTS matrix_time_machine_timestamp
			ON public.matrix_time_machine USING btree
			("timestamp" DESC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_time_machine_tipo

			-- DROP INDEX IF EXISTS public.matrix_time_machine_tipo;

			CREATE INDEX IF NOT EXISTS matrix_time_machine_tipo
			ON public.matrix_time_machine USING btree
			(tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_time_machine_userID

			-- DROP INDEX IF EXISTS public."matrix_time_machine_userID";

			CREATE INDEX IF NOT EXISTS "matrix_time_machine_userID"
			ON public.matrix_time_machine USING btree
			("userID" ASC NULLS LAST)
			TABLESPACE pg_default;
		';

		// matrix_tools
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_tools_datos_idx
			ON public.matrix_tools USING gin
			(datos jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_tools_id_idx

			-- DROP INDEX IF EXISTS public.matrix_tools_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_tools_id_idx
			ON public.matrix_tools USING btree
			(id ASC NULLS FIRST)
			TABLESPACE pg_default;
			-- Index: matrix_tools_section_id_idx

			-- DROP INDEX IF EXISTS public.matrix_tools_section_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_tools_section_id_idx
			ON public.matrix_tools USING btree
			(section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_tools_section_tipo_idx

			-- DROP INDEX IF EXISTS public.matrix_tools_section_tipo_idx;

			CREATE INDEX IF NOT EXISTS matrix_tools_section_tipo_idx
			ON public.matrix_tools USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_tools_section_tipo_section_id_idx

			-- DROP INDEX IF EXISTS public.matrix_tools_section_tipo_section_id_idx;

			CREATE INDEX IF NOT EXISTS matrix_tools_section_tipo_section_id_idx
			ON public.matrix_tools USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_id DESC NULLS FIRST)
			TABLESPACE pg_default;
		';

		// matrix_users
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS matrix_users_datos_gin
			ON public.matrix_users USING gin
			(datos jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_users_relations_idx

			-- DROP INDEX IF EXISTS public.matrix_users_relations_idx;

			CREATE INDEX IF NOT EXISTS matrix_users_relations_idx
			ON public.matrix_users USING gin
			((datos #> \'{relations}\'::text[]) jsonb_path_ops)
			TABLESPACE pg_default;
			-- Index: matrix_users_section_id

			-- DROP INDEX IF EXISTS public.matrix_users_section_id;

			CREATE INDEX IF NOT EXISTS matrix_users_section_id
			ON public.matrix_users USING btree
			(section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_users_section_tipo

			-- DROP INDEX IF EXISTS public.matrix_users_section_tipo;

			CREATE INDEX IF NOT EXISTS matrix_users_section_tipo
			ON public.matrix_users USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: matrix_users_section_tipo_section_id

			-- DROP INDEX IF EXISTS public.matrix_users_section_tipo_section_id;

			CREATE INDEX IF NOT EXISTS matrix_users_section_tipo_section_id
			ON public.matrix_users USING btree
			(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
		';

		// relations
		$ar_sql_query[] = '
			CREATE INDEX IF NOT EXISTS relations_from_component_tipo
			ON public.relations USING btree
			(from_component_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: relations_section_id

			-- DROP INDEX IF EXISTS public.relations_section_id;

			CREATE INDEX IF NOT EXISTS relations_section_id
			ON public.relations USING btree
			(section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: relations_section_tipo

			-- DROP INDEX IF EXISTS public.relations_section_tipo;

			CREATE INDEX IF NOT EXISTS relations_section_tipo
			ON public.relations USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: relations_section_tipo_section_id

			-- DROP INDEX IF EXISTS public.relations_section_tipo_section_id;

			CREATE INDEX IF NOT EXISTS relations_section_tipo_section_id
			ON public.relations USING btree
			(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: relations_target_section_id

			-- DROP INDEX IF EXISTS public.relations_target_section_id;

			CREATE INDEX IF NOT EXISTS relations_target_section_id
			ON public.relations USING btree
			(target_section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: relations_target_section_id_section_id

			-- DROP INDEX IF EXISTS public.relations_target_section_id_section_id;

			CREATE INDEX IF NOT EXISTS relations_target_section_id_section_id
			ON public.relations USING btree
			(target_section_id ASC NULLS LAST, section_id ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: relations_target_section_tipo

			-- DROP INDEX IF EXISTS public.relations_target_section_tipo;

			CREATE INDEX IF NOT EXISTS relations_target_section_tipo
			ON public.relations USING btree
			(target_section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: relations_target_section_tipo_section_tipo

			-- DROP INDEX IF EXISTS public.relations_target_section_tipo_section_tipo;

			CREATE INDEX IF NOT EXISTS relations_target_section_tipo_section_tipo
			ON public.relations USING btree
			(target_section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
			TABLESPACE pg_default;
			-- Index: relations_target_section_tipo_target_section_id

			-- DROP INDEX IF EXISTS public.relations_target_section_tipo_target_section_id;

			CREATE INDEX IF NOT EXISTS relations_target_section_tipo_target_section_id
			ON public.relations USING btree
			(target_section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, target_section_id ASC NULLS LAST)
			TABLESPACE pg_default;
		';

		// exec
		foreach ($ar_sql_query as $sql_query) {
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
			}
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


		return $response;
	}//end rebuild_db_indexes



	/**
	* LONG_PROCESS_STREAM
	* Print a sequential number every 1000 milliseconds
	* Used to test long processes and timeouts issues
	* @return void
	*/
	public static function long_process_stream() {

		if (running_in_cli()===true) {

			// executing from dd_utils_api::get_process_status

			$i=0;
			while(1){

				$counter = $i++;

				print_cli((object)[
					'msg'		=> 'Iteration ' . $counter,
					'memory'	=> dd_memory_usage()
				]);

				$ms = 1000; usleep( $ms * 1000 );
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
					// 'pid'		=> $pid,
					// 'pfile'		=> $pfile,
					'is_running'	=> true,
					'data'			=> $data,
					'time'			=> date("Y-m-d H:i:s"),
					'total_time' 	=> exec_time_unit_auto($start_time),
					'errors'		=> []
				];

				// debug
					if(SHOW_DEBUG===true) {
						error_log('process loop: is_running output: ' .PHP_EOL. json_encode($output) );
					}

				// output the response JSON string
					$a = json_handler::encode($output, JSON_UNESCAPED_UNICODE) . PHP_EOL ;
					echo $a;
					// fix Apache issue where small chunks are not sent correctly over HTTP
					if (strlen($a) < 4096) {
						echo str_pad(' ', 4096) . PHP_EOL;
					}

				while (ob_get_level() > 0) {
					ob_end_flush();
				}
				flush();

				// break the loop if the client aborted the connection (closed the page)
				if ( connection_aborted() ) break;

				$ms = 1000;
				usleep( $ms * 1000 );
			}
			die();
		}
	}//end long_process_stream



}//end class area_maintenance
