<?php declare(strict_types=1);
/**
* INSTALL
*
*/
class install extends common {



	/**
	* CLASS VARS
	* @var
	*/
		protected $id;
		public static $db_install_name	= 'dedalo6_install';



	/**
	* __CONSTRUCT
	* @param string $mode = 'install'
	*/
	public function __construct(string $mode='install') {

		$id		= null;
		$tipo	= 'dd1590';

		$this->set_id($id);
		$this->set_tipo($tipo);
		$this->set_lang(DEDALO_DATA_LANG);
		$this->set_mode($mode);
		$this->set_model('install');
	}//end __construct



	/**
	* GET_STRUCTURE_CONTEXT
	* @param int $permissions = 1
	* @param bool $add_request_config = false
	* @return dd_object $dd_object
	*/
	public function get_structure_context(int $permissions=1, bool $add_request_config=false) : dd_object {

		// dd_object_base
			$dd_object = new dd_object();
				$dd_object->set_tipo($this->tipo);
				$dd_object->set_model($this->model);
				$dd_object->set_lang($this->lang);
				$dd_object->set_mode($this->mode);

		// properties base
			$properties = new stdClass();

		// already installed case
			if(defined('DEDALO_INSTALL_STATUS') && DEDALO_INSTALL_STATUS==='installed') {

				$dd_object->set_properties($properties);
				return $dd_object;
			}

		// dd_init_test. check general files and permissions
				$init_test_response = require DEDALO_CORE_PATH.'/base/dd_init_test.php';
				$properties->init_test = $init_test_response;

			// errors found on init test (Don't stop execution here)
				if ($init_test_response->result===false) {

					// failed. Stop here
					$dd_object->set_properties($properties);

					$error_msg = !empty($init_test_response->msg)
						? implode(', ', $init_test_response->msg)
						: 'Unknown error on init_test_response';

					debug_log(__METHOD__
						." Error: dd_init_test " . PHP_EOL
						. $error_msg
						, logger::ERROR
					);

					return $dd_object;
				}

		// check db_status (config_db.php and DB connection)
			$db_status				= install::get_db_status();
			$properties->db_status	= $db_status;
			if($db_status->global_status===false) {

				// failed. Stop here
				$dd_object->set_properties($properties);

				debug_log(__METHOD__
					." Error: DDBB connection (get_db_status) is not reachable "
					, logger::ERROR
				);

				return $dd_object;
			}

		// DB (from config)
			$properties->dedalo_entity	= DEDALO_ENTITY;
			$properties->db_config		= new stdClass();
				$properties->db_config->db_name		= DEDALO_DATABASE_CONN;
				$properties->db_config->user_name	= DEDALO_USERNAME_CONN;
				$properties->db_config->hostname	= DEDALO_HOSTNAME_CONN;
				$properties->db_config->port		= DEDALO_DB_PORT_CONN;
				$properties->db_config->socket		= DEDALO_SOCKET_CONN;

		// get_db_data_version. Version of DDBB data ( 5.8.2 expected ). array|null
			$properties->db_data_version =	install::get_db_data_version();

		// dedalo version
			$properties->version = DEDALO_VERSION . ' - Build ' . DEDALO_BUILD;

		// check if the install database file exist
			$config = install::get_config();
			$properties->target_file_path = $config->target_file_path_compress;
			$properties->target_file_path_exists = (file_exists($config->target_file_path_compress))
				? true
				: false;

		// get the hierarchy file path
			$properties->hierarchy_files_dir_path = $config->hierarchy_files_dir_path;
		// hierarchies
			$hierarchies = install::get_available_hierarchy_files();
			$properties->hierarchies = $hierarchies->result !== false
				? $hierarchies->result
				: null;
			$properties->install_checked_default	= $config->install_checked_default;
			$properties->hierarchy_typologies		= $config->hierarchy_typologies;

		// check php version
			$properties->php_version			= PHP_VERSION;
			$properties->php_version_supported	= system::test_php_version_supported(); // >= 8.1.0

		// max_execution_time
			$max_execution_time = ini_get('max_execution_time');
			$properties->max_execution_time	= $max_execution_time;


		// dd_object
			$dd_object->set_properties($properties);


		return $dd_object;
	}//end get_structure_context



	/**
	* GET_CONFIG
	* @return object $config
	*/
	public static function get_config() : object {

		$db_install_name	= install::$db_install_name;
		$host_line			= (!empty(DEDALO_HOSTNAME_CONN)) ? ('-h '.DEDALO_HOSTNAME_CONN) : 'localhost';
		$port_line			= (!empty(DEDALO_DB_PORT_CONN)) ? ('-p '.DEDALO_DB_PORT_CONN) : '';
		$to_preserve_tld	= [
			'dd',			// Dedalo core
			'rsc',			// Dédalo resources
			'hierarchy',	// Dédalo hierarchies
			'ontology',		// Dédalo ontology
			'localontology',// Dédalo local ontology
			'lg',			// Dédalo langs
			'oh',			// Oral History
			// 'ich',		// Intangible Cultural Heritage
			// 'es',		// Spain toponymy
			// 'fr',		// France toponymy
			// 'ds',		// Thesaurus: semantic
			// 'ww',		// Thesaurus: web (webs using Dédalo thesaurus as site menu and areas)
			// 'ts',		// Thesaurus: thematic
			// 'xx'			// Thesaurus: special
			// 'on',		// Thesaurus: onomastic
			// 'dc',		// Thesaurus: chronological
		];
		$to_clean_tables	= [
			'matrix',				// main table
			'matrix_activities',	// activities (exhibitions, visits, etc)
			'matrix_activity',		// Dédalo activity log data
			'matrix_hierarchy',		// thesaurus data
			'matrix_hierarchy_main',// hierarchy data
			'matrix_ontology',		// ontology data
			'matrix_ontology_main',// ontology data
			'matrix_indexations',	// indexation data
			'matrix_layout',		// print presets layout table
			'matrix_layout_dd',		// print presets layout table (former oh1 print presets)
			'matrix_list',			// public list values
			'matrix_nexus',
			'matrix_nexus_main',
			'matrix_notes',			// notes inside transcription content
			'matrix_notifications',	// internal notifications data
			'matrix_profiles',		// user profiles table
			'matrix_projects',		// projects table
			'matrix_stats',			// stats data
			'matrix_structurations',// like indexation data
			'matrix_test',			// only for test purposes
			'matrix_tools',			// tools register, development and config
			'matrix_time_machine',	// data versions table
			'matrix_users',			// users table (user 'root' will be re-created later)
			'relations',			// search relations table
			'matrix_dataframe',		// dataframe records (ratings mainly)
			'matrix_test',			// test table
			// 'sessions'			// optional sessions table
		];

		$install_checked_default = [
			'es', // spain
			'fr', // france
			'lg', // lang
			'ts', // thematic
			'utoponymy'
		];

		$target_file_path			= DEDALO_ROOT_PATH . '/install/db/'.$db_install_name.'.pgsql';
		$target_file_path_compress	= $target_file_path.'.gz';
		$hierarchy_files_dir_path	= DEDALO_ROOT_PATH . '/install/import/hierarchy';
		$config_core_file_path		= DEDALO_CONFIG_PATH.'/config_core.php';
		$hierarchy_typologies 		= install::get_hierarchy_typlologies();

		return (object)[
			'db_install_name'			=> $db_install_name,
			'host_line'					=> $host_line,
			'port_line'					=> $port_line,
			'to_preserve_tld'			=> $to_preserve_tld,
			'to_clean_tables'			=> $to_clean_tables,
			'target_file_path'			=> $target_file_path,
			'target_file_path_compress'	=> $target_file_path_compress,
			'hierarchy_files_dir_path'	=> $hierarchy_files_dir_path,
			'install_checked_default'	=> $install_checked_default,
			'hierarchy_typologies'		=> $hierarchy_typologies,
			'config_core_file_path'		=> $config_core_file_path
		];
	}//end get_config



	/**
	* GET_DB_INSTALL_CONN
	* Open connection to the new install database (not current, note the database name)
	* @return PgSql\Connection|bool
	* 	false on error
	*/
	public static function get_db_install_conn() : PgSql\Connection|bool {

		$config = install::get_config();

		$db_install_conn = DBi::_getNewConnection(
			DEDALO_HOSTNAME_CONN,
			DEDALO_USERNAME_CONN,
			DEDALO_PASSWORD_CONN,
			$config->db_install_name,
			DEDALO_DB_PORT_CONN,
			DEDALO_SOCKET_CONN
		);

		return $db_install_conn;
	}//end get_db_install_conn



	/**
	* GET_DB_STATUS
	* Check if the config vars are empty or with default values
	* Open connection to the new install database (not current, note the database name)
	* @return object
	*/
	public static function get_db_status() : object {

		// check config db vars
			$db_name		= DEDALO_DATABASE_CONN;
			$user_name		= DEDALO_USERNAME_CONN;
			$pw				= DEDALO_PASSWORD_CONN;
			$information	= DEDALO_INFORMATION;
			$info_key		= DEDALO_INFO_KEY;

			$config_check = true;

			$db_name_check = true;
			if(empty($db_name) || $db_name==='dedalo_mydatabase'){
				$config_check	= false;
				$db_name_check	= false;
			}
			$user_name_check	= true;
			if(empty($user_name) || $user_name==='myusername'){
				$config_check		= false;
				$user_name_check	= false;
			}
			$pw_check = true;
			if(empty($pw) || $pw==='mypassword'){
				$config_check	= false;
				$pw_check		= false;
			}
			$information_check = true;
			if(empty($information) || $information==='Dédalo install version'){
				$config_check = false;
				$information_check = false;
			}
			$info_key_check = true;
			if(empty($info_key) || $info_key==='my_entity_name'){
				$config_check = false;
				$info_key_check = false;
			}

		// check db connection
			$db_connection = DBi::_getNewConnection(
				DEDALO_HOSTNAME_CONN,
				DEDALO_USERNAME_CONN,
				DEDALO_PASSWORD_CONN,
				DEDALO_DATABASE_CONN,
				DEDALO_DB_PORT_CONN,
				DEDALO_SOCKET_CONN
			);

			$db_connection_check = $db_connection !== false
				? true
				: false;

		// db_status
			$db_status = new stdClass();
				$db_status->config_db_name_check		= $db_name_check;
				$db_status->config_user_name_check		= $user_name_check;
				$db_status->config_pw_check				= $pw_check;
				$db_status->config_information_check	= $information_check;
				$db_status->config_info_key_check		= $info_key_check;
				$db_status->config_check				= $config_check;
				$db_status->db_connection_check			= $db_connection_check;

		// global status
			$global_status = true;
			foreach ($db_status as $value) {
				if ($value===false) {
					$global_status = false;
					break;
				}
			}
			$db_status->global_status = $global_status;


		return $db_status;
	}//end get_db_status



	/**
	* GET_DB_DATA_VERSION
	* @return array|null $current_version_in_db
	*/
	public function get_db_data_version() : ?array {

		try {
			$current_version_in_db = get_current_data_version();
		} catch (Exception $e) {
			debug_log(__METHOD__." Caught exception: ".$e->getMessage(), logger::WARNING);

			$current_version_in_db = null;
		}


		return $current_version_in_db;
	}//end get_db_data_version



	/**
	* TO_UPDATE
	* @return object $response
	*/
	public static function to_update() : object {

		$response = install::set_install_status('installed');


		return $response;
	}//end to_update



	/**
	* BUILD_INSTALL_VERSION
	* Creates a clean install database and file
	* @return object $response
	*/
	public static function build_install_version() : object {

		// set timeout in seconds
		set_time_limit(600); // 10 minutes (10*60)

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		// CLI msg
			if ( running_in_cli()===true ) {
				print_cli((object)[
					'msg' => (label::get_label('processing_wait') ?? 'Processing... please wait')
				]);
			}

		// config
			$config = install::get_config();

		// clone database to dedalo_install
			// CLI msg
			if ( running_in_cli()===true ) {
				print_cli((object)[
					'msg' => 'Cloning database'
				]);
			}
			$skip_if_exists = false;
			$call_response = install::clone_database($skip_if_exists);
			if ($call_response->result===false) {
				return $call_response;
			}
			if (!empty($call_response->errors)) {
				$response->errors = array_merge($response->errors, $call_response->errors);
			}

		// clean ontology (structure)
			// CLI msg
			if ( running_in_cli()===true ) {
				print_cli((object)[
					'msg' => 'Cleaning Ontology'
				]);
			}
			$call_response = install::clean_ontology();
			if ($call_response->result===false) {
				return $call_response;
			}
			if (!empty($call_response->errors)) {
				$response->errors = array_merge($response->errors, $call_response->errors);
			}

		// clean counters (truncate all counters to force re-create later)
			// CLI msg
			if ( running_in_cli()===true ) {
				print_cli((object)[
					'msg' => 'Cleaning counters'
				]);
			}
			$call_response = install::clean_counters();
			if ($call_response->result===false) {
				return $call_response;
			}
			if (!empty($call_response->errors)) {
				$response->errors = array_merge($response->errors, $call_response->errors);
			}

		// clean general tables ($to_clean_tables)
			// CLI msg
			if ( running_in_cli()===true ) {
				print_cli((object)[
					'msg' => 'Cleaning tables'
				]);
			}
			$call_response = install::clean_tables();
			if ($call_response->result===false) {
				return $call_response;
			}
			if (!empty($call_response->errors)) {
				$response->errors = array_merge($response->errors, $call_response->errors);
			}

		// create extensions (unaccent, pg_trgm ..)
			// CLI msg
			if ( running_in_cli()===true ) {
				print_cli((object)[
					'msg' => 'Creating extensions (unaccent, pg_trgm ..)'
				]);
			}
			$call_response = install::create_extensions();
			if ($call_response->result===false) {
				return $call_response;
			}
			if (!empty($call_response->errors)) {
				$response->errors = array_merge($response->errors, $call_response->errors);
			}

		// clean table matrix_hierarchy (remove non to-preserve TLD's)
			// $call_response = install::clean_matrix_hierarchy();
			// if ($call_response->result===false) {
			// 	return $call_response;
			// }

		// create default blank root user
			// CLI msg
			if ( running_in_cli()===true ) {
				print_cli((object)[
					'msg' => 'Creating root user'
				]);
			}
			$call_response = install::create_root_user();
			if ($call_response->result===false) {
				return $call_response;
			}
			if (!empty($call_response->errors)) {
				$response->errors = array_merge($response->errors, $call_response->errors);
			}

		// create default main project
			// CLI msg
			if ( running_in_cli()===true ) {
				print_cli((object)[
					'msg' => 'Creating main project'
				]);
			}
			$call_response = install::create_main_project();
			if ($call_response->result===false) {
				return $call_response;
			}
			if (!empty($call_response->errors)) {
				$response->errors = array_merge($response->errors, $call_response->errors);
			}

		// create default main profiles
			// CLI msg
			if ( running_in_cli()===true ) {
				print_cli((object)[
					'msg' => 'Creating main profiles'
				]);
			}
			$call_response = install::create_main_profiles();
			if ($call_response->result===false) {
				return $call_response;
			}
			if (!empty($call_response->errors)) {
				$response->errors = array_merge($response->errors, $call_response->errors);
			}

		// create default test_record
			// CLI msg
			if ( running_in_cli()===true ) {
				print_cli((object)[
					'msg' => 'Creating default test record'
				]);
			}
			$call_response = install::create_test_record();
			if ($call_response->result===false) {
				return $call_response;
			}
			if (!empty($call_response->errors)) {
				$response->errors = array_merge($response->errors, $call_response->errors);
			}

		// import_hierarchy_main_records (matrix_hierarchy_main records)
			// CLI msg
			if ( running_in_cli()===true ) {
				print_cli((object)[
					'msg' => 'Importing main hierarchy records'
				]);
			}
			$call_response = install::import_hierarchy_main_records();
			if ($call_response->result===false) {
				return $call_response;
			}
			if (!empty($call_response->errors)) {
				$response->errors = array_merge($response->errors, $call_response->errors);
			}

		// import toponymy hierarchies
			// $ar_hierarchy_section_tipo = [
			// 	'es1',
			// 	'es2',
			// 	'fr1',
			// 	'fr2'
			// ];
			// foreach ($ar_hierarchy_section_tipo as $section_tipo) {
			// 	$call_response = install::import_hierarchy_file($section_tipo);
			// 	if ($call_response->result===false) {
			// 		return $call_response;
			// 	}
			// }

		// activate_hierarchies
			// $ar_hierarchy_tld2 = [
			// 	'ds', // semantic
			// 	'ts', // thematic
			// 	'lg', // langs
			// 	'es', // Spain
			// 	'fr' // France
			// ];
			// foreach ($ar_hierarchy_tld as $tld2) {
			// 	$call_response = install::activate_hierarchy($tld2);
			// 	if ($call_response->result===false) {
			// 		return $call_response;
			// 	}
			// }

		// regenerate relations ()
			// $ar_tables = tool_administration::$ar_tables_with_relations;
			// $tables = [];
			// foreach ($ar_tables as $current_table) {
			// 	if ($current_table==='matrix_langs') {
			// 		continue;
			// 	}
			// 	$tables[] = $current_table;
			// }
			// if ($exec) {
			// 	$generate_relations_response = self::generate_relations_table_data($tables, true, $db_install_conn);
			// 	if ($generate_relations_response->result!==true) {
			// 		trigger_error('Error on propagate relations data. '.$generate_relations_response->msg);
			// 	}
			// }

		// vacuum analyze
			// CLI msg
			if ( running_in_cli()===true ) {
				print_cli((object)[
					'msg' => 'Vacuum database'
				]);
			}
			$call_response = install::optimize_database();
			if ($call_response->result===false) {
				return $call_response;
			}
			if (!empty($call_response->errors)) {
				$response->errors = array_merge($response->errors, $call_response->errors);
			}

		// build install DDBB to default compressed psql file
			// CLI msg
			if ( running_in_cli()===true ) {
				print_cli((object)[
					'msg' => 'Creating compressed psql file'
				]);
			}
			$call_response = install::build_install_db_file();
			if ($call_response->result===false) {
				return $call_response;
			}
			if (!empty($call_response->errors)) {
				$response->errors = array_merge($response->errors, $call_response->errors);
			}

		// response
			$response->result	= true;
			$response->msg		= empty($response->errors)
				? 'OK. The current database \''.DEDALO_DATABASE_CONN.'\' has been cloned to \''.$config->db_install_name.'\' and exported a install copy to \''.$config->target_file_path_compress.'\''
				: 'Warning: Request done with errors';


		return $response;
	}//end build_install_version



	/**
	* OPTIMIZE_DATABASE
	* @return object $response
	*/
	public static function optimize_database() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		$sql = 'VACUUM ANALYZE';
		debug_log(__METHOD__
			." Executing DB query " . PHP_EOL
			. $sql
			, logger::WARNING
		);
		$result	= pg_query(DBi::_getConnection(), $sql);
		if (!$result) {
			$msg = " Error on db execution (optimize database 0): ".pg_last_error(DBi::_getConnection());
			debug_log(__METHOD__
				. $msg . PHP_EOL
				. $sql
				, logger::ERROR
			);
			$response->msg = $msg;

			return $response; // return error here !
		}

		// response
			$response->result	= true;
			$response->msg		= 'OK. Request done';


		return $response;
	}//end optimize_database



	/**
	* INSTALL_DB_FROM_DEFAULT_FILE
	* Unzip the psql default install file and import it to the current blank database
	* @return object $response
	*/
	public static function install_db_from_default_file() : object {

		// set timeout in seconds
		set_time_limit(600); // 10 minutes (10*60)

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config						= self::get_config();
			$target_file_path_compress	= $config->target_file_path_compress;
			$uncompressed_file			= $config->target_file_path;
			$exec						= true;

		// check if file exists
			if (!file_exists($target_file_path_compress)) {
				$response->msg = 'Error. The required file do not exists: '.$target_file_path_compress;
				return $response;
			}

		// terminal gunzip command. From 'dedalo4_install.pgsql.gz' to 'dedalo4_install.pgsql'
			$command = 'gunzip --keep --force -v '.$target_file_path_compress.';'; // -k (keep original file) -f (force overwrite without prompt)
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
			if ($exec) {
				$command_res = shell_exec($command);
				debug_log(__METHOD__
					." Exec response 1 (shell_exec): ".json_encode($command_res)
					, logger::DEBUG
				);
			}

		// terminal command psql copy data from file 'dedalo4_install.pgsql'
			$command = DB_BIN_PATH.'psql -d '.DEDALO_DATABASE_CONN.' -U '.DEDALO_USERNAME_CONN.' '.$config->host_line.' '.$config->port_line.' --echo-errors --file "'.$uncompressed_file.'"';
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
			if ($exec) {

				// $command_res = shell_exec($command);
				// debug_log(__METHOD__." Exec response 2 (shell_exec): ".json_encode($command_res), logger::DEBUG);

				$output = null;
				$result_code = null;
				exec($command, $output, $result_code);
				$command_res = $output;
				debug_log(__METHOD__
					." Exec response 2 (exec) " . PHP_EOL
					.' output: ' 		. to_string($output) . PHP_EOL
					.' result_code: ' 	. to_string($result_code) . PHP_EOL
					, logger::WARNING
				);

				if (empty($command_res)) {

					$php_whoami					= trim(shell_exec('whoami'));
					$php_get_current_user		= get_current_user();
					$user_home_dir				= trim(shell_exec('echo $HOME'));
					$pgpass_file_path			= $user_home_dir.'/.pgpass';
					$pgpass_file_exists			= file_exists($pgpass_file_path);
					$pgpass_file_permissions	= $pgpass_file_exists
						? substr(sprintf('%o', fileperms($pgpass_file_path)), -4)
						: 'file not found!';

					$response->msg = 'Error. Database import failed! Verify your .pgpass file and look for errors in php error file. '
						.' - PHP get_current_user: '		. $php_get_current_user
						.' - PHP whoami: '					. $php_whoami
						.' - PHP home: '					. $user_home_dir
						.' - .pgpass file permissions: '	. $pgpass_file_permissions;
					trigger_error($response->msg);

					debug_log(__METHOD__
						." -> failed command execution ".PHP_EOL
						.' command: '					. $command .PHP_EOL
						.' command output: '			. to_string($output) .PHP_EOL
						.' command result_code: '		. to_string($result_code) .PHP_EOL
						.' PHP user get_current_user: ' . $php_get_current_user . PHP_EOL
						.' PHP user whoami: '			. $php_whoami . PHP_EOL
						.' PHP $HOME dir: '				. $user_home_dir . PHP_EOL
						.' .pgpass file path: '			. $pgpass_file_path . PHP_EOL
						.' .pgpass file exists: '		. json_encode($pgpass_file_exists) . PHP_EOL
						.' .pgpass file permissions: '	. $pgpass_file_permissions . PHP_EOL
						, logger::ERROR
					);

					return $response;
				}
			}

		// delete uncompressed_file ('dedalo4_install.pgsql')
			$command  = 'rm '.$uncompressed_file.';';
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
			if ($exec) {
				$command_res = shell_exec($command);
				debug_log(__METHOD__." Exec response 4 (shell_exec): ".json_encode($command_res), logger::DEBUG);
			}

		// response
			$response->result	= true;
			$response->msg		= 'OK. Request done';


		return $response;
	}//end install_db_from_default_file



	/**
	* CLONE_DATABASE
	* @param bool $skip_if_exists
	* @return object $response
	*/
	private static function clone_database(bool $skip_if_exists) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config	= self::get_config();
			$exec	= true;

		// check if already exists the install database. If yes, ignore clone order and return ok
			$db_exists = false;
			$sql = '
				-- returns string f for false or t for true
				SELECT EXISTS(
					SELECT datname FROM pg_catalog.pg_database WHERE datname = \''.$config->db_install_name.'\'
				);
			';
			debug_log(__METHOD__
				." Executing DB query " . PHP_EOL
				. $sql
				, logger::WARNING
			);
			if ($exec) {
				$result	= pg_query(DBi::_getConnection(), $sql);
				if (!$result) {
					$msg = " Error on db execution (clone database 0): ".pg_last_error(DBi::_getConnection());
					debug_log(__METHOD__
						. $msg . PHP_EOL
						. $sql
						, logger::ERROR
					);
					$response->msg = $msg;

					return $response; // return error here !
				}
				$rows	= (array)pg_fetch_assoc($result); // returns 'f' for false, 't' for true
				$value	= reset($rows);

				$db_exists = ($value==='t');
				if ($db_exists===true && $skip_if_exists===true) {

					$response->result	= true;
					$response->msg		= 'OK. Request done. DDBB already exists. Ignored clone!';
					debug_log(__METHOD__
						. $response->msg
						, logger::WARNING
					);

					return $response; // return success here !
				}
			}

		// terminate the active connections on target database
			if ($db_exists===true) {
				$sql = '
					SELECT
						pg_terminate_backend (pg_stat_activity.pid)
					FROM
						pg_stat_activity
					WHERE
						pg_stat_activity.datname = \''.$config->db_install_name.'\';
					-- SELECT
					-- 	pg_terminate_backend (pg_stat_activity.pid)
					-- FROM
					-- 	pg_stat_activity
					-- WHERE
					-- 	pg_stat_activity.datname = \''.DEDALO_DATABASE_CONN.'\';
				';
				debug_log(__METHOD__
					. " Executing DB query " . PHP_EOL
					. to_string($sql)
					, logger::WARNING
				);
				if ($exec) {
					$result = pg_query(DBi::_getConnection(), $sql);
					if (!$result) {
						$msg = " Error on db execution (clone database 1): ".pg_last_error(DBi::_getConnection());
						debug_log(__METHOD__
							. $msg .PHP_EOL
							. $sql
							, logger::ERROR
						);
						$response->msg = $msg;

						return $response; // return error here !
					}
				}
			}

		// new connection
			$db_conn = DBi::_getNewConnection();

		// drop target database
			$sql = '
				DROP DATABASE IF EXISTS '.$config->db_install_name.';
			';
			debug_log(__METHOD__
				. " Executing DB query " . PHP_EOL
				. $sql
				, logger::WARNING
			);
			if ($exec) {
				$result   = pg_query($db_conn, $sql);
				if (!$result) {
					$msg = " Error on db execution (clone database 2): ".pg_last_error($db_conn);
					debug_log(__METHOD__
						. $msg .PHP_EOL
						. $sql
						, logger::ERROR
					);
					$response->msg = $msg;

					return $response; // return error here !
				}
			}

		// create a new install database with cloned schema and data
			$sql = '
				CREATE DATABASE '.$config->db_install_name.' WITH TEMPLATE '.DEDALO_DATABASE_CONN.' OWNER '.DEDALO_USERNAME_CONN.';
			';
			if ($exec) {
				debug_log(__METHOD__
					. " Executing DB query " . PHP_EOL
					. $sql
					, logger::WARNING
				);
				$result = pg_query($db_conn, $sql);
				if (!$result) {
					$msg = " Error on db execution (clone database 3): ".pg_last_error($db_conn);
					debug_log(__METHOD__
						. $msg .PHP_EOL
						. $sql
						, logger::ERROR
					);
					$response->msg = $msg;

					return $response; // return error here !
				}
			}

		// response
			$response->result	= true;
			$response->msg		= 'OK. Request done';


		return $response;
	}//end clone_database



	/**
	* CLEAN_ONTOLOGY
	* @return object $response
	*/
	private static function clean_ontology() : object {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config				= self::get_config();
			$db_install_conn	= install::get_db_install_conn();
			$exec				= true;

		// clean jer_dd
			$items	= array_map(function($el){
				return '\''.$el.'\'';
			}, $config->to_preserve_tld);
			$line	= implode(',', $items);
			$sql	='
				DELETE
				FROM "jer_dd"
				WHERE
				tld NOT IN('.$line.');
			';
			// dump(null, ' clean jer_dd ++ '.to_string($sql));
			debug_log(__METHOD__
				. " Executing DB query " .PHP_EOL
				. $sql
				, logger::WARNING
			);
			if ($exec) {
				$result   = pg_query($db_install_conn, $sql);
				if (!$result) {
					$msg = " Error on db execution (jer_dd): ".pg_last_error(DBi::_getConnection());
					debug_log(__METHOD__.$msg, logger::ERROR);
					$response->msg = $msg;
					return $response;
				}
			}

		// clean matrix_descriptors_dd
			if (DBi::check_table_exists('matrix_descriptors_dd')) {
				$items	= array_map(function($el){
					return 'parent !~ \'^'.$el.'[0-9]+\'';
				}, $config->to_preserve_tld);
				$line	= implode(' AND ', $items);
				$sql = '
					DELETE
					FROM "matrix_descriptors_dd"
					WHERE
					'.$line.';
				';
				debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
				if ($exec) {
					$result   = pg_query($db_install_conn, $sql);
					if (!$result) {
						$msg = " Error on db execution (matrix_descriptors_dd): ".pg_last_error(DBi::_getConnection());
						debug_log(__METHOD__.$msg, logger::ERROR);
						$response->msg = $msg;
						return $response;
					}
				}
			}

		// re-index ontology tables
			$sql = '
					REINDEX TABLE "jer_dd";
			';
			if (DBi::check_table_exists('matrix_descriptors_dd')) {
				$sql .= '
					REINDEX TABLE "matrix_descriptors_dd";
				';
			}
			debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
			if ($exec) {
				$result   = pg_query($db_install_conn, $sql);
				if (!$result) {
					debug_log(__METHOD__." Error on db execution (re-index ontology tables): ".pg_last_error(DBi::_getConnection()), logger::ERROR);
					return $response;
				}
			}

		$response->result 	= true;
		$response->msg 		= 'OK. Request done';

		return $response;
	}//end clean_ontology



	/**
	* CLEAN_COUNTERS
	* @return object $response
	*/
	private static function clean_counters() : object {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config				= self::get_config();
			$db_install_conn	= install::get_db_install_conn();
			$to_preserve_tld	= $config->to_preserve_tld;
			$exec				= true;

		// truncate all. They will be re-created from higher value when needed
			$sql = '
				TRUNCATE "matrix_counter";
				ALTER SEQUENCE "matrix_counter_id_seq" RESTART WITH 1;
				TRUNCATE "matrix_counter_dd";
				ALTER SEQUENCE "matrix_counter_dd_id_seq" RESTART WITH 1;
			';
			debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
			if ($exec) {
				$result   = pg_query($db_install_conn, $sql);
				if (!$result) {
					$msg = " Error on db execution (matrix_counter): ".pg_last_error(DBi::_getConnection());
					debug_log(__METHOD__.$msg, logger::ERROR);
					$response->msg = $msg;
					return $response;
				}
			}

		// clean main_dd (Ontology counters)
			if (DBi::check_table_exists('main_dd')) {
				$items = array_map(function($el){
					return '\''.$el.'\'';
				}, $to_preserve_tld);
				$line	= implode(',', $items);
				$sql = '
					DELETE
					FROM "main_dd"
					WHERE
					tld NOT IN('.$line.');
				';
				debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
				if ($exec) {
					$result   = pg_query($db_install_conn, $sql);
					if (!$result) {
						$msg = " Error on db execution (main_dd): ".pg_last_error(DBi::_getConnection());
						debug_log(__METHOD__.$msg, logger::ERROR);
						$response->msg = $msg;
						return $response;
					}
				}
			}


		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;

		return $response;
	}//end clean_counters



	/**
	* CLEAN_TABLES
	* @return object $response
	*/
	private static function clean_tables() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config				= self::get_config();
			$db_install_conn	= install::get_db_install_conn();
			$to_clean_tables	= $config->to_clean_tables;
			$exec				= true;

		// clean matrix and accessory tables
			$items = array_map(function($table){

				// CLI msg
				if ( running_in_cli()===true ) {
					print_cli((object)[
						'msg' => 'Cleaning table: ' . $table
					]);
				}

				$sql = 'DELETE FROM "'.$table.'"; ALTER SEQUENCE IF EXISTS '.$table.'_id_seq RESTART WITH 1 ;';
				if ($table==='matrix_activity') {
					// add special sequence matrix_activity_section_id_seq
					$sql .= 'ALTER SEQUENCE IF EXISTS matrix_activity_section_id_seq RESTART WITH 1 ;';
				}
				return $sql;
			}, $to_clean_tables);
			$sql = implode(PHP_EOL, $items);
			debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
			if ($exec) {
				$result   = pg_query($db_install_conn, $sql);
				if (!$result) {
					$msg = " Error on db execution (clean tables): ".pg_last_error(DBi::_getConnection());
					debug_log(__METHOD__.$msg, logger::ERROR);
					$response->msg = $msg;
					return $response;
				}
			}

		// response
			$response->result	= true;
			$response->msg		= 'OK. Request done '.__METHOD__;


		return $response;
	}//end clean_tables



	/**
	* CLEAN_MATRIX_HIERARCHY
	* @return object $response
	*/
		// private static function clean_matrix_hierarchy() {

		// 	$response = new stdClass();
		// 		$response->result 	= false;
		// 		$response->msg 		= 'Error. Request failed '.__METHOD__;

		// 	// short vars
		// 		$config				= self::get_config();
		// 		$db_install_conn	= install::get_db_install_conn();
		// 		$to_clean_tables	= $config->to_clean_tables;
		// 		$exec				= true;

		// 	// clean matrix_hierarchy
		// 		$items	= array_map(function($el){
		// 			return 'section_tipo !~ \'^'.$el.'[0-9]+\'';
		// 		}, $config->to_preserve_tld);
		// 		$line	= implode(' AND ', $items);
		// 		$sql = '
		// 			DELETE
		// 			FROM "matrix_hierarchy"
		// 			WHERE
		// 			'.$line.';
		// 		';
		// 		debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
		// 		if ($exec) {
		// 			$result   = pg_query($db_install_conn, $sql);
		// 			if (!$result) {
		// 				$msg = " Error on db execution (matrix_hierarchy): ".pg_last_error(DBi::_getConnection());
		// 				debug_log(__METHOD__.$msg, logger::ERROR);
		// 				$response->msg = $msg;
		// 				return $response;
		// 			}
		// 		}

		// 	// re-index table
		// 		$sql = '
		// 			REINDEX TABLE "matrix_hierarchy";
		// 		';
		// 		debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
		// 		if ($exec) {
		// 			$result   = pg_query($db_install_conn, $sql);
		// 			if (!$result) {
		// 				debug_log(__METHOD__." Error on db execution (re-index matrix_hierarchy tables): ".pg_last_error(DBi::_getConnection()), logger::ERROR);
		// 				return $response;
		// 			}
		// 		}

		// 	$response->result	= true;
		// 	$response->msg		= 'OK. Request done '.__METHOD__;

		// 	return $response;
		// }//end clean_matrix_hierarchy


	/**
	* CREATE_ROOT_USER
	* @return object $response
	*/
	private static function create_root_user() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config				= self::get_config();
			$db_install_conn	= install::get_db_install_conn();
			$exec				= true;

		$dato = trim('
			{
			  "label": "Usuarios",
			  "relations": [
				{
				  "type": "dd151",
				  "section_id": "1",
				  "section_tipo": "dd64",
				  "from_component_tipo": "dd131"
				},
				{
				  "type": "dd151",
				  "section_id": "-1",
				  "section_tipo": "dd128",
				  "from_component_tipo": "dd200"
				},
				{
				  "type": "dd151",
				  "section_id": "-1",
				  "section_tipo": "dd128",
				  "from_component_tipo": "dd197"
				},
				{
				  "type": "dd151",
				  "section_id": "2",
				  "section_tipo": "dd64",
				  "from_component_tipo": "dd244"
				},
				{
				  "type": "dd151",
				  "section_id": "2",
				  "section_tipo": "dd234",
				  "from_component_tipo": "dd1725"
				}
			  ],
			  "components": {
				"dd132": {
				  "inf": "User [component_input_text]",
				  "dato": {
					"lg-nolan": [
					  "root"
					]
				  }
				},
				"dd133": {
				  "inf": "Password [component_password]",
				  "dato": {
					"lg-nolan": null
				  }
				},
				"dd199": {
				  "inf": "Created date [component_date]",
				  "dato": {
					"lg-nolan": [
					  {
						"start": {
						  "day": 30,
						  "hour": 12,
						  "time": 64772914091,
						  "year": 2022,
						  "month": 9,
						  "minute": 8,
						  "second": 11
						}
					  }
					]
				  }
				},
				"dd201": {
				  "inf": "Modified date [component_date]",
				  "dato": {
					"lg-nolan": [
					  {
						"start": {
						  "day": 30,
						  "hour": 12,
						  "time": 64772914091,
						  "year": 2022,
						  "month": 9,
						  "minute": 8,
						  "second": 11
						}
					  }
					]
				  }
				}
			  },
			  "section_id": 0,
			  "created_date": "2022-09-30 13:48:31",
			  "section_tipo": "dd128",
			  "modified_date": "2022-09-30 13:48:31",
			  "created_by_userID": -1,
			  "section_real_tipo": "dd128",
			  "ar_section_creator": {},
			  "modified_by_userID": -1
			}
		');
		$sql = '
			TRUNCATE "matrix_users";
			ALTER SEQUENCE matrix_users_id_seq RESTART WITH 1;
			INSERT INTO "matrix_users" ("section_id", "section_tipo", "datos") VALUES (\'-1\', \'dd128\', \''.$dato.'\');
		';
		debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
		if ($exec) {
			$result   = pg_query($db_install_conn, $sql);
			if (!$result) {
				$msg = " Error on db execution (matrix_counter): ".pg_last_error(DBi::_getConnection());
				debug_log(__METHOD__.$msg, logger::ERROR);
				$response->msg = $msg;
				return $response;
			}
		}

		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;


		return $response;
	}//end create_root_user



	/**
	* CREATE_EXTENSIONS
	* Add Dédalo mandatory PostgreSQL extensions and functions
	* to current install database
	* @return object $response
	*/
	private static function create_extensions() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$db_install_conn	= install::get_db_install_conn();


		$sql = '
			CREATE EXTENSION IF NOT EXISTS unaccent;
			CREATE EXTENSION IF NOT EXISTS pg_trgm;

			CREATE OR REPLACE FUNCTION f_unaccent(text)
			RETURNS text AS
			$func$
			SELECT public.unaccent(\'public.unaccent\', $1)
			$func$  LANGUAGE sql IMMUTABLE;
		';
		debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
		$result   = pg_query($db_install_conn, $sql);
		if ($result===false) {
			$msg = " Error on db execution (create_extensions): ".pg_last_error(DBi::_getConnection());
			debug_log(__METHOD__.$msg, logger::ERROR);
			$response->msg = $msg;
			return $response;
		}

		// response
			$response->result	= true;
			$response->msg		= 'OK. Request done '.__METHOD__;


		return $response;
	}//end create_extensions



	/**
	* CREATE_MAIN_PROJECT
	* @return object $response
	*/
	private static function create_main_project() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config				= self::get_config();
			$db_install_conn	= install::get_db_install_conn();
			$exec				= true;

		$dato = trim('
			{
			  "label": "Proyectos",
			  "relations": [
				{
				  "type": "dd151",
				  "section_id": "-1",
				  "section_tipo": "dd128",
				  "from_component_tipo": "dd200"
				},
				{
				  "type": "dd151",
				  "section_id": "-1",
				  "section_tipo": "dd128",
				  "from_component_tipo": "dd197"
				}
			  ],
			  "components": {
				"dd155": {
				  "inf": "Project code [component_input_text]",
				  "dato": {
					"lg-nolan": [
					  "001"
					]
				  }
				},
				"dd156": {
				  "inf": "Project (name) [component_input_text]",
				  "dato": {
					"lg-eng": [
					  "General project"
					]
				  }
				},
				"dd199": {
				  "inf": "Created date [component_date]",
				  "dato": {
					"lg-nolan": [
					  {
						"start": {
						  "day": 15,
						  "hour": 0,
						  "time": 64606896000,
						  "year": 2010,
						  "month": 2,
						  "minute": 0,
						  "second": 0
						}
					  }
					]
				  }
				},
				"dd201": {
				  "inf": "Modified date [component_date]",
				  "dato": {
					"lg-nolan": [
					  {
						"start": {
						  "day": 10,
						  "hour": 16,
						  "time": 64890432722,
						  "year": 2018,
						  "month": 12,
						  "minute": 12,
						  "second": 2
						}
					  }
					]
				  }
				}
			  },
			  "section_id": 1,
			  "created_date": "2010-02-15 00:00:00",
			  "section_tipo": "dd153",
			  "modified_date": "2018-12-10 16:12:02",
			  "diffusion_info": null,
			  "created_by_userID": -1,
			  "section_real_tipo": "dd153",
			  "modified_by_userID": -1
			}
		');
		$sql = '
			TRUNCATE "matrix_projects";
			ALTER SEQUENCE matrix_projects_id_seq RESTART WITH 1;
			INSERT INTO "matrix_projects" ("section_id", "section_tipo", "datos") VALUES (\'1\', \'dd153\', \''.$dato.'\');
		';
		debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
		if ($exec) {
			$result   = pg_query($db_install_conn, $sql);
			if (!$result) {
				$msg = " Error on db execution (matrix_counter): ".pg_last_error(DBi::_getConnection());
				debug_log(__METHOD__.$msg, logger::ERROR);
				$response->msg = $msg;
				return $response;
			}
		}

		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;


		return $response;
	}//end create_main_project



	/**
	* CREATE_MAIN_PROFILES
	* @return object $response
	*/
	private static function create_main_profiles() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config				= self::get_config();
			$db_install_conn	= install::get_db_install_conn();
			$exec				= true;

		$dato = trim('
			{
			  "label": "Profiles",
			  "relations": [
				{
				  "type": "dd151",
				  "section_id": "-1",
				  "section_tipo": "dd128",
				  "from_component_tipo": "dd200"
				},
				{
				  "type": "dd151",
				  "section_id": "-1",
				  "section_tipo": "dd128",
				  "from_component_tipo": "dd197"
				}
			  ],
			  "components": {
				"dd199": {
				  "inf": "Created date [component_date]",
				  "dato": {
					"lg-nolan": [
					  {
						"start": {
						  "day": 21,
						  "hour": 20,
						  "time": 64803010979,
						  "year": 2016,
						  "month": 3,
						  "minute": 22,
						  "second": 59
						}
					  }
					]
				  }
				},
				"dd201": {
				  "inf": "Modified date [component_date]",
				  "dato": {
					"lg-nolan": [
					  {
						"start": {
						  "day": 8,
						  "hour": 14,
						  "time": 64839364078,
						  "year": 2017,
						  "month": 5,
						  "minute": 27,
						  "second": 58
						}
					  }
					]
				  }
				},
				"dd237": {
				  "inf": "Name [component_input_text]",
				  "dato": {
					"lg-eng": [
					  "Admin"
					]
				  }
				},
				"dd238": {
				  "inf": "Descripción [component_text_area]",
				  "dato": {
					"lg-eng": [
					  "<p>Admin general</p>"
					]
				  }
				}
			  },
			  "section_id": 1,
			  "created_date": "2016-03-21 20:22:59",
			  "section_tipo": "dd234",
			  "modified_date": "2017-05-08 14:27:58",
			  "diffusion_info": null,
			  "created_by_userID": -1,
			  "section_real_tipo": "dd234",
			  "modified_by_userID": -1
			}
		');
		$dato2 = trim('
			{
			  "label": "Profiles",
			  "relations": [
				{
				  "type": "dd151",
				  "section_id": "-1",
				  "section_tipo": "dd128",
				  "from_component_tipo": "dd200"
				},
				{
				  "type": "dd151",
				  "section_id": "-1",
				  "section_tipo": "dd128",
				  "from_component_tipo": "dd197"
				}
			  ],
			  "components": {
				"dd199": {
				  "inf": "Created date [component_date]",
				  "dato": {
					"lg-nolan": [
					  {
						"start": {
						  "day": 21,
						  "hour": 20,
						  "time": 64803011216,
						  "year": 2016,
						  "month": 3,
						  "minute": 26,
						  "second": 56
						}
					  }
					]
				  }
				},
				"dd201": {
				  "inf": "Modified date [component_date]",
				  "dato": {
					"lg-nolan": [
					  {
						"start": {
						  "day": 8,
						  "hour": 14,
						  "time": 64839364078,
						  "year": 2017,
						  "month": 5,
						  "minute": 27,
						  "second": 58
						}
					  }
					]
				  }
				},
				"dd237": {
				  "inf": "Name [component_input_text]",
				  "dato": {
					"lg-eng": [
					  "User"
					]
				  }
				},
				"dd238": {
				  "inf": "Descripción [component_text_area]",
				  "dato": {
					"lg-eng": [
					  "<p>Generic user</p>"
					]
				  }
				}
			  },
			  "section_id": 2,
			  "created_date": "2016-03-21 20:26:56",
			  "section_tipo": "dd234",
			  "modified_date": "2017-05-08 14:27:58",
			  "diffusion_info": null,
			  "created_by_userID": -1,
			  "section_real_tipo": "dd234",
			  "modified_by_userID": -1
			}
		');
		$sql = '
			TRUNCATE "matrix_profiles";
			ALTER SEQUENCE matrix_profiles_id_seq RESTART WITH 1;
			INSERT INTO "matrix_profiles" ("section_id", "section_tipo", "datos") VALUES (\'1\', \'dd234\', \''.$dato.'\');
			INSERT INTO "matrix_profiles" ("section_id", "section_tipo", "datos") VALUES (\'2\', \'dd234\', \''.$dato2.'\');
		';
		debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
		if ($exec) {
			$result   = pg_query($db_install_conn, $sql);
			if (!$result) {
				$msg = " Error on db execution (matrix_counter): ".pg_last_error(DBi::_getConnection());
				debug_log(__METHOD__.$msg, logger::ERROR);
				$response->msg = $msg;
				return $response;
			}
		}

		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;


		return $response;
	}//end create_main_profiles



	/**
	* CREATE_TEST_RECORD
	* This record it's necessary to run unit_test checks
	* Table 'matrix_test' must to exists
	* @return object $response
	*/
	private static function create_test_record() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config				= self::get_config();
			$db_install_conn	= install::get_db_install_conn();
			$exec				= true;
			$section_tipo		= 'test3';
			$table				= 'matrix_test';

		$dato = trim('
			{
			  "relations": [],
			  "components": {},
			  "modified_date": "2022-10-07 11:16:43",
			  "diffusion_info": null,
			  "modified_by_userID": 1
			}
		');
		$sql = '
			TRUNCATE "'.$table.'";
			ALTER SEQUENCE '.$table.'_id_seq RESTART WITH 1;
			INSERT INTO "'.$table.'" ("section_id", "section_tipo", "datos") VALUES (\'1\', \''.$section_tipo.'\', \''.$dato.'\');
		';
		debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
		if ($exec) {
			$result   = pg_query($db_install_conn, $sql);
			if (!$result) {
				$msg = " Error on db execution (matrix_counter): ".pg_last_error(DBi::_getConnection());
				debug_log(__METHOD__.$msg, logger::ERROR);
				$response->msg = $msg;
				return $response;
			}
		}

		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;


		return $response;
	}//end create_test_record



	/**
	* IMPORT_HIERARCHY_MAIN_RECORDS
	* Import basic matrix_hierarchy_main records
	* Countries and main hierarchies (thematic, special, semantic, languages)
	* Get already exported SQL file placed in ./dedalo/install/import/matrix_hierarchy_main.sql
	* and execute the SQL insert code inside
	* (!) Note that all sections are inactive by default. Use 'activate_hierarchy' to load terms and models and activate hierarchy
	* @return object $response
	*/
	private static function import_hierarchy_main_records() : object {

		// set timeout in seconds
		set_time_limit(600); // 10 minutes (10*60)

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config			= self::get_config();
			$exec			= true;
			$sql_file_path	= DEDALO_ROOT_PATH . '/install/import/matrix_hierarchy_main.sql';
			$matrix_table	= 'matrix_hierarchy_main';

		// check if file exists
			if (!file_exists($sql_file_path)) {
				$response->msg = 'Error. The required file do not exists: '.$sql_file_path;
				return $response;
			}

		// terminal command psql delete previous records
			$command = DB_BIN_PATH.'psql -d '.$config->db_install_name.' -U '.DEDALO_USERNAME_CONN.' '.$config->host_line.' '.$config->port_line.' --echo-errors -c "DELETE FROM "'.$matrix_table.'"; ALTER SEQUENCE IF EXISTS '.$matrix_table.'_id_seq RESTART WITH 1 ;";';
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
			if ($exec) {
				$command_res = shell_exec($command);
				debug_log(__METHOD__." Exec response 1 (shell_exec): ".json_encode($command_res), logger::DEBUG);
			}

		// terminal command psql execute sql query from .sql file
			$command = DB_BIN_PATH.'psql -d '.$config->db_install_name.' -U '.DEDALO_USERNAME_CONN.' '.$config->host_line.' '.$config->port_line.' --echo-errors --file "'.$sql_file_path.'"';
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
			if ($exec) {
				$command_res = shell_exec($command);
				debug_log(__METHOD__." Exec response 2 (shell_exec): ".json_encode($command_res), logger::DEBUG);
			}

		// update sequence value
			$query = 'SELECT setval(\'matrix_hierarchy_main_id_seq\', (SELECT MAX(id) FROM "matrix_hierarchy_main")+1)';
			$command = DB_BIN_PATH.'psql -d '.$config->db_install_name.' -U '.DEDALO_USERNAME_CONN.' '.$config->host_line.' '.$config->port_line.' --echo-errors '
				.'-c "'.$query.';";';
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
			if ($exec) {
				$command_res = shell_exec($command);
				debug_log(__METHOD__." Exec response 3 (shell_exec): ".json_encode($command_res), logger::DEBUG);
			}


		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;


		return $response;
	}//end import_hierarchy_main_records



	/**
	* BUILD_INSTALL_DB_FILE
	* @return object $response
	*/
	public static function build_install_db_file() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__.' ';

		// short vars
			$config						= self::get_config();
			$exec						= true;
			$target_file_path			= $config->target_file_path;
			$target_file_path_compress	= $config->target_file_path_compress;
			$db_install_name			= $config->db_install_name;
			$db_install_conn			= install::get_db_install_conn();
			// check target install database exists and connection is reliable
			if ($db_install_conn===false) {
				$msg = ' Error. DDBB connection error. Verify database "'.$db_install_name.'" exists and is accessible';
				debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
				$response->msg .= $msg;
				return $response;
			}

		// rename old version if exists
			if (file_exists($target_file_path_compress)) {
				$target_file_path_archive = str_replace('.gz', '_'.time().'.gz', $target_file_path_compress);
				rename($target_file_path_compress, $target_file_path_archive);
			}

		// terminal command pg_dump
			$command  = DB_BIN_PATH . 'pg_dump '.$config->host_line.' '.$config->port_line.' -U '.DEDALO_USERNAME_CONN.' -F p -b -v --no-owner --no-privileges --role='.DEDALO_USERNAME_CONN.' '.$db_install_name; //.' > '.$target_file_path.'.psql';
			// $command .= ' | zip '.$target_file_path_compress.' -foo'; // redirects output to zip compressed file
			$command .=' | gzip > '.$target_file_path_compress;

			debug_log(__METHOD__." Executing terminal DB command ".to_string($command), logger::WARNING);
			if ($exec) {
				$command_res = shell_exec($command);
				debug_log(__METHOD__." Exec response (shell_exec) ".to_string($command_res), logger::DEBUG);
			}

		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;


		return $response;
	}//end build_install_db_file



	/**
	* ACTIVATE_HIERARCHY
	* Activate thesaurus hierarchy by tld2
	* @param object $options
	*  Sample
	* {
	*	"file": "/localdir/dedalo/install/import/hierarchy/fauna1.copy.gz",
	*	"file_name": "fauna1.copy.gz",
	*	"section_tipo": "fauna1",
	*	"tld": "fauna",
	*	"label": "Fauna",
	*	"type": "term", // or model
	*	"typology": 11
	* }
	* @return object $response
	*/
	public static function activate_hierarchy(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		// options
			$tld					= $options->tld;
			$typology				= $options->typology;
			$label					= $options->label;
			$active_in_thesaurus	= $options->active_in_thesaurus ?? true;

		// short vars
			$config	= self::get_config();

		// hierarchy search by
			// MOVED TO CLASS HIERARCHY !
				// $sql = '
				// 	SELECT section_id
				// 	FROM "matrix_hierarchy_main"
				// 	WHERE
				// 	f_unaccent(matrix_hierarchy_main.datos#>>\'{components,hierarchy6,dato}\') ~* f_unaccent(\'.*\["'.$tld.'"\].*\')
				// ';
				// debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
				// if ($exec) {
				// 	$result = pg_query(DBi::_getConnection(), $sql);
				// 	if ($result===false) {
				// 		$msg = " Error on db execution (clone database): ".pg_last_error(DBi::_getConnection());
				// 		debug_log(__METHOD__.$msg, logger::ERROR);
				// 		$response->msg = $msg;

				// 		return $response; // return error here !
				// 	}
				// 	$rows	= (array)pg_fetch_assoc($result);
				// 	$value	= reset($rows);
				// 	if (empty($value)) {
				// 		$msg = " Error on db search. Not found tld to activate: tld2: '$tld' (activate_hierarchy)";
				// 		debug_log(__METHOD__.$msg, logger::ERROR);
				// 		$response->msg = $msg;

				// 		return $response; // return error here !
				// 	}
				// }
				// $section_tipo	= DEDALO_HIERARCHY_SECTION_TIPO;
				// $section_id		= $value;
			$hierarchy_by_tld_response	= hierarchy::get_hierarchy_by_tld($tld);
			$section_tipo				= DEDALO_HIERARCHY_SECTION_TIPO;
			$section_id					= $hierarchy_by_tld_response->result;
			$section_exists				= !empty($section_id);

		// hierarchy not already exists case. Create a new one
			if ($section_exists===false) {

				// update sequence value
				$matrix_table = 'matrix_hierarchy_main';
				$query = 'SELECT setval(\''.$matrix_table.'_id_seq\', (SELECT MAX(id) FROM "'.$matrix_table.'")+1)';
				$command = DB_BIN_PATH.'psql -d '.DEDALO_DATABASE_CONN.' -U '.DEDALO_USERNAME_CONN.' '.$config->host_line.' '.$config->port_line.' --echo-errors '
					.'-c "'.$query.';";';
				debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
				$command_res = shell_exec($command);
				debug_log(__METHOD__." Exec response (shell_exec): ".json_encode($command_res), logger::DEBUG);

				// create a new section
				$section = section::get_instance(
					null, // string|null section_id
					$section_tipo // string section_tipo
				);
				$section_id = $section->Save();
			}

		// check valid $section_id
			if (empty($section_id)) {
				$msg = " ERROR creating a new section in '$section_tipo' - tld: '$tld'";
				debug_log(__METHOD__
					. $msg
					, logger::ERROR
				);
				$response->errors[] = $msg;

				return $response; // return error here !
			}

		// new hierarchy case
			if ($section_exists===false) {

				// tld
					$tld_tipo	= DEDALO_HIERARCHY_TLD2_TIPO; // hierarchy6
					$model_name	= ontology_node::get_model_name_by_tipo($tld_tipo, true);
					$component	= component_common::get_instance(
						$model_name,
						$tld_tipo,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);
					$dato = [$tld];
					$component->set_dato($dato);
					$component->Save();

				// typology
					$hierarchy_type_tipo	= DEDALO_HIERARCHY_TYPOLOGY_TIPO; // hierarchy9
					$model_name				= ontology_node::get_model_name_by_tipo($hierarchy_type_tipo, true);
					$component				= component_common::get_instance(
						$model_name,
						$hierarchy_type_tipo,
						$section_id,
						'edit',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);
					$locator = new locator();
						$locator->set_section_tipo(DEDALO_HIERARCHY_TYPES_SECTION_TIPO); // hierarchy13
						$locator->set_section_id($typology);
						$locator->set_from_component_tipo($hierarchy_type_tipo);
					$dato = [$locator];
					$component->set_dato($dato);
					$component->Save();

				// name
					$name_tipo	= DEDALO_HIERARCHY_TERM_TIPO;	// hierarchy5
					$model_name	= ontology_node::get_model_name_by_tipo($name_tipo, true);
					$component	= component_common::get_instance(
						$model_name,
						$name_tipo,
						$section_id,
						'edit',
						DEDALO_DATA_LANG,
						$section_tipo
					);
					$dato = [$label];
					$component->set_dato($dato);
					$component->Save();

				// lang
					$name_tipo	= DEDALO_HIERARCHY_LANG_TIPO;	// hierarchy8
					$model_name	= ontology_node::get_model_name_by_tipo($name_tipo, true);
					$component	= component_common::get_instance(
						$model_name,
						$name_tipo,
						$section_id,
						'edit',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);
					$lang_locator = lang::get_lang_locator_from_code(DEDALO_DATA_LANG_DEFAULT);
					$dato = [$lang_locator];
					$component->set_dato($dato);
					$component->Save();
			}

		// active hierarchy
			$active_tipo	= DEDALO_HIERARCHY_ACTIVE_TIPO;	// hierarchy4
			$model_name		= ontology_node::get_model_name_by_tipo($active_tipo, true);
			$component		= component_common::get_instance(
				$model_name,
				$active_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$dato = json_decode('[
			  {
				"type": "'.DEDALO_RELATION_TYPE_LINK.'",
				"section_id": "'.NUMERICAL_MATRIX_VALUE_YES.'",
				"section_tipo": "'.DEDALO_SECTION_SI_NO_TIPO.'",
				"from_component_tipo": "'.DEDALO_HIERARCHY_ACTIVE_TIPO.'"
			  }
			]');
			$component->set_dato($dato);
			$component->Save();

		// active in thesaurus
			$active_view_ts_tipo	= DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO;	// hierarchy4
			$model_name				= ontology_node::get_model_name_by_tipo($active_view_ts_tipo, true);
			$component				= component_common::get_instance(
				$model_name,
				$active_view_ts_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$target_active_ts_section_id = ($active_in_thesaurus===true) ? NUMERICAL_MATRIX_VALUE_YES : NUMERICAL_MATRIX_VALUE_NO;

			$active_data = new locator();
				$active_data->set_type(DEDALO_RELATION_TYPE_LINK);
				$active_data->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
				$active_data->set_section_id($target_active_ts_section_id);
				$active_data->set_from_component_tipo(DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO);

			$component->set_dato($active_data);
			$component->Save();

		// set real section tipo (!) needed to create virtual section
			// source_real_section_tipo
			$model_name	= ontology_node::get_model_name_by_tipo(DEDALO_HIERARCHY_SOURCE_REAL_SECTION_TIPO, true);
			$component	= component_common::get_instance(
				$model_name,
				DEDALO_HIERARCHY_SOURCE_REAL_SECTION_TIPO,
				$section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$component->set_dato([DEDALO_THESAURUS_SECTION_TIPO]);
			$component->Save();

		// create ontology tld (generate_virtual_section)
			$options = (object)[
				'section_id'	=> $section_id,
				'section_tipo'	=> $section_tipo
			];
			$call_response = hierarchy::generate_virtual_section($options);
			if ($call_response->result===false) {
				$msg = " ERROR " . PHP_EOL . to_string($call_response->msg);
				debug_log(__METHOD__
					. $msg
					, logger::ERROR
				);
				$response->errors[] = $msg;
			}

		// set target section data
			// target thesaurus
				$component_tipo	= DEDALO_HIERARCHY_TARGET_SECTION_TIPO;	// 'hierarchy53';
				$model_name		= ontology_node::get_model_name_by_tipo($component_tipo, true);
				$component		= component_common::get_instance(
					$model_name,
					$component_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				$dato = [$tld.'1'];
				$component->set_dato($dato);
				$component->Save();

			// target model
				$component_tipo	= DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO;	// 'hierarchy58';
				$model_name		= ontology_node::get_model_name_by_tipo($component_tipo, true);
				$component		= component_common::get_instance(
					$model_name,
					$component_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				$dato = [$tld.'2'];
				$component->set_dato($dato);
				$component->Save();

		// set children data
			if ($typology==2) {
				// general term
					$component_tipo	= DEDALO_HIERARCHY_CHILDREN_TIPO;	// 'hierarchy45';
					$model_name		= ontology_node::get_model_name_by_tipo($component_tipo, true);
					$component		= component_common::get_instance(
						$model_name,
						$component_tipo,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);
					$dato = json_decode('[
						{
							"type": "dd48",
							"section_id": "1",
							"section_tipo": "'.$tld.'1",
							"from_component_tipo": "'.DEDALO_HIERARCHY_CHILDREN_TIPO.'"
						}
					]');
					$component->set_dato($dato);
					$component->Save();

				// general model
					$dir_path		= $config->hierarchy_files_dir_path;
					$models_file	= $dir_path . '/' . strtolower($tld) . '.copy.gz';
					if (file_exists($models_file)) {

						$component_tipo	= DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO;	// 'hierarchy59';
						$model_name		= ontology_node::get_model_name_by_tipo($component_tipo, true);
						$component		= component_common::get_instance(
							$model_name,
							$component_tipo,
							$section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$section_tipo
						);
						$dato = json_decode('[
							{
								"type": "dd48",
								"section_id": "2",
								"section_tipo": "'. $tld.'2",
								"from_component_tipo": "'.DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO.'"
							}
						]');
						$component->set_dato($dato);
						$component->Save();

					}else{
						debug_log(__METHOD__
							." Ignored not existing model data for tld: ".to_string($tld)
							, logger::WARNING
						);
					}
			}

		// response OK
		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;


		return $response;
	}//end activate_hierarchy



	/**
	* GET_AVAILABLE_HIERARCHY_FILES
	* List of all available hierarchy files found in install directory
	* @see class area_development get_ar_widgets use
	* @return object $response
	*/
	public static function get_available_hierarchy_files() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config		= self::get_config();
			$dir_path	= $config->hierarchy_files_dir_path;

		// labels
			$hierarchies_json	= file_get_contents(__DIR__.'/hierarchies.json');
			$hierarchies		= json_decode($hierarchies_json);

		// read the dir
			$hierarchy_files = (array)glob($dir_path . '/*.copy.gz');

		// hierarchy_files conform items
		$hierarchy_files = array_map(function($file) use($hierarchies){

			$file_name		= pathinfo($file)['basename'];
			$section_tipo	= explode('.', $file_name)[0];
			$tld			= preg_replace('/\d/', '', $section_tipo);

			$current_hierarchy = array_find($hierarchies ?? [], function($el) use($tld){
				return strtolower($el->tld)===strtolower($tld);
			}) ?? new stdClass();

			$label					= $current_hierarchy->label ?? 'undefined ['.$tld.']';
			$type					= strpos($section_tipo, '2')!==false ? 'model' : 'term';
			$typology				= $current_hierarchy->typology ?? 'undefined typology ['.$tld.']';
			$active_in_thesaurus	= $current_hierarchy->active_in_thesaurus ?? 'undefined typology ['.$tld.']';

			$item = (object)[
				'file'					=> $file,
				'file_name'				=> $file_name,
				'section_tipo'			=> $section_tipo,
				'tld'					=> $tld,
				'label'					=> $label,
				'type'					=> $type,
				'typology'				=> $typology,
				'active_in_thesaurus'	=> $active_in_thesaurus
			];

			return $item;
		}, $hierarchy_files);

		$response->result	= $hierarchy_files;
		$response->msg		= 'OK. Request done '.__METHOD__;

		// empty case
			if (empty($hierarchy_files)) {
				debug_log(__METHOD__
					. "Dédalo Error: directory '$dir_path' is not accessible or empty!  " . PHP_EOL
					. ' dir_path: ' . to_string($dir_path) . PHP_EOL
					. ' hierarchy_files: ' . to_string($hierarchy_files)
					, logger::ERROR
				);
			}


		return $response;
	}//end get_available_hierarchy_files



	/**
	* GET_HIERARCHY_TYPLOLOGIES
	* Read JSON file 'hierarchies_typologies.json'
	* @return array $typlologies
	* Sample:
	* [
	*  {
	*	"typology": 6,
	*	"label": "Web sites"
	*  },
	*  ...
	* ]
	*/
	public static function get_hierarchy_typlologies() : array {

		$typlologies = json_handler::decode(
			file_get_contents(__DIR__.'/hierarchies_typologies.json')
		);

		return $typlologies;
	}//end get_hierarchy_typlologies



	/**
	* INSTALL_HIERARCHIES
	* Called from install trigger with selected user options from check boxes
	* @param object $options
	* @return object $response
	*/
	public static function install_hierarchies(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// options
			$hierarchies = $options->hierarchies;

		// read the dir
			$hierarchy_files = install::get_available_hierarchy_files();

		// selected_hierarchies
			$selected_hierarchies = array_filter($hierarchy_files->result, function($el) use($hierarchies){
				return in_array($el->tld, $hierarchies);
			});

		$ar_responses = [];

		// import_hierarchy_files
		// iterate selected_hierarchies and import DDBB data (psql -copy). After this,
		// creates and activates the new hierarchy
			// sample data
			// [
			// 	{
			// 		"file": "/localdir/dedalo/install/import/hierarchy/fauna1.copy.gz",
			// 		"file_name": "fauna1.copy.gz",
			// 		"section_tipo": "fauna1",
			// 		"tld": "fauna",
			// 		"label": "Fauna",
			// 		"type": "term", // or model
			// 		"typology": 11
			// 	}
			// ]
			foreach ($selected_hierarchies as $item) {

				// import records from file *.copy.gz
				// this delete existing data of current section_tipo and copy all file pg data
				$section_tipo	= $item->section_tipo;
				$config			= self::get_config();
				$hierarchy_path	= $config->hierarchy_files_dir_path;
				$file_path		= $hierarchy_path.'/'.$section_tipo.'.copy.gz'; // country data file

				$options = new stdClass();
					$options->section_tipo	= $section_tipo;
					$options->file_path		= $file_path;
					$options->matrix_table	= 'matrix_hierarchy';

				// import file
				$ar_responses[] = backup::import_from_copy_file( $options );

				// $ar_responses[] = install::import_hierarchy_file($item->section_tipo);

				// ignore models for creating hierarchy
				if ($item->type!=='term') {
					continue;
				}

				// creates/activate the new hierarchy and ontology
				$ar_responses[] = install::activate_hierarchy($item);
			}

		$response->result	= $ar_responses;
		$response->msg		= 'OK. Request done '.__METHOD__;


		return $response;
	}//end install_hierarchies



	/**
	* SYSTEM_IS_ALREADY_INSTALLED
	* We can assume that systems with only a root user are NOT properly installed yet
	* @return object $response
	*/
	public static function system_is_already_installed() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		$total = 0;

		try {

			// table exists check
				$exists	= DBi::check_table_exists('matrix_users');

				if ($exists===false) {
					$response->result	= false;
					$response->msg		= 'System is NOT installed yet';
					return $response;
				}

			// number of users in table
				$sql = '
					SELECT COUNT(*) as total FROM "matrix_users";
				';
				$result	= pg_query(DBi::_getConnection(), $sql);
				$row	= pg_fetch_object($result);
				$total	= (int)$row->total ?? 0;

		} catch (Exception $e) {
			$total = 0;
		}

		if ($total>1) {
			$response->result	= true;
			$response->msg		= 'System is already installed';
			return $response;
		}else{
			$response->result	= false;
			$response->msg		= 'System is NOT installed yet';
		}


		return $response;
	}//end system_is_already_installed


	/**
	* SET_ROOT_PW
	* This action is fired only in the installation process.
	* if you want to change the root pw after installation process, you will need to do:
	* 	1. To change the root pw in the section_id -1 in matrix_ursers table, set it with null data in this way:
	*		"dd133": {
	*			"dato": {
	*			"lg-nolan": null
	*			}
	*		}
	* 	2. remove the installed status in config/config_auto file.
	* @param object $options
	* @return object $response
	*/
	public static function set_root_pw(object $options) : object {

		// options
			$password = safe_xss($options->password);

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';

		// check the dedalo install status (config_auto.php)
		// When install is finished, it will be set automatically to 'installed'
			if(defined('DEDALO_INSTALL_STATUS') && DEDALO_INSTALL_STATUS==='installed') {
				$response->msg = 'Error. Request not valid, Dédalo was already installed';
				return $response;
			}

		// check if the root user has the default value in the user sections inside DDBB
			if(login::check_root_has_default_password()===false){
				$response->msg = 'Error. root pw was set in another install process';
				return $response;
			}

		// check password
			if (empty($password) ) {
				$response->msg = 'Error: few vars';
				return $response;
			}

		// Test encrypt and decrypt data cycle
			$password_encripted	= dedalo_encrypt_openssl($password);
			if (dedalo_decrypt_openssl($password_encripted) !== $password) {
				$response->msg =  'Error: sorry an error happens on UPDATE record. Encrypt and decrypt cycle was wrong!';
				return $response;
			}

		// section
			$section	= section::get_instance(-1, DEDALO_SECTION_USERS_TIPO);
			$dato		= $section->get_dato();
			$tipo		= DEDALO_USER_PASSWORD_TIPO;
			$lang		= DEDALO_DATA_NOLAN;

		// empty component data case
			if (!isset($dato->components->{$tipo})) {
				$dato->components->{$tipo}			= new stdClass();
				$dato->components->{$tipo}->dato	= new stdClass();
			}

		// Set dato as array
			$dato->components->{$tipo}->dato->{$lang} = [$password_encripted];

		// update section full dato. It's saved directly because for security, save data prevents to save section_id < 1
			$strQuery	= "UPDATE matrix_users SET datos = $1 WHERE section_id = $2 AND section_tipo = $3";
			$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( json_handler::encode($dato), -1, DEDALO_SECTION_USERS_TIPO ));
			if($result===false) {
				$response->msg = 'Error: sorry an error happens on UPDATE record. Data is not saved';
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. $strQuery
					, logger::ERROR
				);
				return $response;
			}

		// reset session
			unset($_SESSION['dedalo']['auth']);

		// response success
			$response->result	= true;
			$response->msg		= 'OK. root pw was set';


		return $response;
	}//end set_root_pw



	/**
	* SET_INSTALL_STATUS
	* Fix current Dédalo app as installed
	* @param string $status
	* 	Options: 'installed'
	* @return object $response
	*/
	public static function set_install_status(string $status) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// config_core write install status (config_core.php)
			$config	= install::get_config();
			$file	= $config->config_core_file_path;

		// set file content
			if (defined('DEDALO_INSTALL_STATUS') && DEDALO_INSTALL_STATUS===$status) {

				$response->result	= true;
				$response->msg		= 'OK. Dédalo status is already: '.$status;
				return $response;

			}else{

				if(!file_exists($file)) {

					if(!file_put_contents($file, '')) {
						$response->msg = 'Error (1). It\'s not possible set the install status, review the PHP permissions to write in Dédalo directory: ' . $file;
						debug_log(__METHOD__." ".$response->msg, logger::ERROR);
						return $response;
					}
				}

				$content = file_get_contents($file);

				// add vars
				if (strpos($content, 'DEDALO_INSTALL_STATUS')===false) {

					// file do not exists or const DEDALO_INSTALL_STATUS it's not defined case

					// line
					$line = PHP_EOL . 'define(\'DEDALO_INSTALL_STATUS\', \''.$status.'\');';
					// Write the contents to the file,
					// using the FILE_APPEND flag to append the content to the end of the file
					// and the LOCK_EX flag to prevent anyone else writing to the file at the same time
					if(!file_put_contents($file, $line, FILE_APPEND | LOCK_EX)) {

						$response->msg = 'Error (2). It\'s not possible set the install status, review the PHP permissions to write in Dédalo directory: '.$file;
						debug_log(__METHOD__
							. ' ' . $response->msg .PHP_EOL
							. 'file: '.$file
							, logger::ERROR
						);
						return $response;
					}

					$response->result	= true;
					$response->msg		= 'All ready';

					debug_log(__METHOD__." Added config_auto line with constant: DEDALO_INSTALL_STATUS  ", logger::DEBUG);


				}elseif (strpos($content, 'DEDALO_INSTALL_STATUS')!==false && strpos($content, '\'DEDALO_INSTALL_STATUS\', \''.$status.'\'')===false) {

					// file exists but const DEDALO_INSTALL_STATUS it's not defined or it's different case

					// replace line to updated value
					$content = preg_replace('/define\(\'DEDALO_INSTALL_STATUS\',.+\);/', 'define(\'DEDALO_INSTALL_STATUS\', \''.$status.'\');', $content);
					// Write the contents to the file,
					// using the LOCK_EX flag to prevent anyone else writing to the file at the same time
					if(!file_put_contents($file, $content, LOCK_EX)) {
						$response->msg = 'Error (3). It\'s not possible set the install status, review the PHP permissions to write in Dédalo directory: ' . $file;
						debug_log(__METHOD__." ".$response->msg, logger::ERROR);
						return $response;
					}

					$response->result	= true;
					$response->msg		= 'All ready';

					debug_log(__METHOD__." Changed config_auto content with constant: DEDALO_INSTALL_STATUS = ''.$status.'' ".to_string(), logger::DEBUG);
				}
			}

		// refresh session cached data. Delete all session data
			unset($_SESSION['dedalo']);


		return $response;
	}//end set_install_status



	/**
	* BUILD_RECOVERY_VERSION_FILE
	* Creates the recovery file 'jer_dd_recovery.sql' from current 'jer_dd' table
	* @return object $response
	*/
	public static function build_recovery_version_file() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// preserve_tld list
			$preserve_tld = [
				'dd',
				'rsc',
				'lg',
				'hierarchy',
				'ontology',
				'ontologytype'
			];
			$preserve_tld_string = "'".implode("','", $preserve_tld)."'";

		// clone jer_dd table to jer_dd_recovery
			$sql = '
				DROP TABLE IF EXISTS "jer_dd_recovery" CASCADE;
				CREATE TABLE "jer_dd_recovery" ( LIKE "jer_dd" INCLUDING ALL );
				INSERT INTO "jer_dd_recovery" SELECT * FROM "jer_dd" WHERE tld IN ('.$preserve_tld_string.');
			';
			$result	= pg_query(DBi::_getConnection(), $sql);
			if (!$result) {
				$msg = " Error on db execution (clone table jer_dd): ".pg_last_error(DBi::_getConnection());
				debug_log(__METHOD__
					. $msg . PHP_EOL
					. $sql
					, logger::ERROR
				);
				$response->msg = $msg;
				$response->errors[] = 'failed creating jer_dd_recovery table';

				return $response; // return error here !
			}

		// export to file
			// terminal command pg_dump
			$config		= self::get_config();
			$sql_file	= DEDALO_ROOT_PATH . '/install/db/jer_dd_recovery.sql.gz';
			$command	= DB_BIN_PATH . 'pg_dump -d '.DEDALO_DATABASE_CONN.' '.$config->host_line.' '.$config->port_line
						  .' -U '.DEDALO_USERNAME_CONN.' -t jer_dd_recovery | gzip > '.$sql_file;

			debug_log(__METHOD__
				." Executing terminal DB command " . PHP_EOL
				.to_string($command) . PHP_EOL
				, logger::WARNING
			);

			$command_res = shell_exec($command);
			debug_log(__METHOD__." Exec response (shell_exec) ".to_string($command_res), logger::DEBUG);

		// delete temp table
			$sql = '
				DROP TABLE IF EXISTS "jer_dd_recovery" CASCADE;
			';
			$result	= pg_query(DBi::_getConnection(), $sql);
			if (!$result) {
				$msg = " Error on db execution (delete table jer_dd_recovery): ".pg_last_error(DBi::_getConnection());
				debug_log(__METHOD__
					. $msg . PHP_EOL
					. $sql
					, logger::ERROR
				);
				$response->msg = $msg;
				$response->errors[] = 'failed deleting jer_dd_recovery table';

				return $response; // return error here !
			}

		// response OK
			$response->result		= true;
			$response->msg			= 'OK. Request done successfully';
			$response->file_size	= filesize($sql_file) . ' Bytes';


		return $response;
	}//end build_recovery_version_file



	/**
	* RESTORE_JER_DD_RECOVERY_FROM_FILE
	* Import the SQL file creating table 'jer_dd_recovery'
	* Source file is a SQL string file located at /dedalo/install/db/jer_dd_recovery.sql
	* @return object $response
	*/
	public static function restore_jer_dd_recovery_from_file() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// config
			$config = self::get_config();

		// sql_file: jer_dd_recovery.sql
			$sql_file = DEDALO_ROOT_PATH . '/install/db/jer_dd_recovery.sql.gz';
			if (!file_exists($sql_file)) {
				$msg = " Error on table restore. File do not exists: ".pg_last_error(DBi::_getConnection());
				debug_log(__METHOD__
					. $msg . PHP_EOL
					. 'sql_file: ' . $sql_file
					, logger::ERROR
				);
				$response->msg = $msg;
				$response->errors[] = 'source sql_file do not exists';

				return $response; // return error here !
			}

		// command
			$command = 'gunzip -c ' . $sql_file . ' | '
					  . DB_BIN_PATH . 'psql -d '.DEDALO_DATABASE_CONN.' '.$config->host_line.' '.$config->port_line. ' -U '.DEDALO_USERNAME_CONN;

			debug_log(__METHOD__
				." Executing terminal DB command " . PHP_EOL
				.to_string($command) . PHP_EOL
				, logger::WARNING
			);

			// exec command
			$command_res = shell_exec($command);

			debug_log(__METHOD__
				." Exec response (shell_exec) " . PHP_EOL
				.to_string($command_res) . PHP_EOL
				, logger::WARNING
			);

		$response->result	= true;
		$response->msg		= 'OK. Request done successfully';


		return $response;
	}//end restore_jer_dd_recovery_from_file



}//end class install
