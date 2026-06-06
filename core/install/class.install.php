<?php declare(strict_types=1);

// Include collaborator classes
include_once __DIR__ . '/class.install_config_manager.php';
include_once __DIR__ . '/class.install_database_manager.php';
include_once __DIR__ . '/class.install_ontology_manager.php';
include_once __DIR__ . '/class.install_hierarchy_manager.php';
include_once __DIR__ . '/class.install_data_seeder.php';

/**
* INSTALL
* Facade class for install operations. Delegates to specialized manager classes.
* Extends common for API compatibility (install_json.php, dd_utils_api).
*
* @package Dedalo
* @subpackage Install
*/
class install extends common {

	/**
	* CLASS VARS
	*/

	/**
	 * Database name used for initial installation and setup.
	 * Contains the default database for creating Dédalo tables and ontology.
	 * @var string $db_install_name
	 */
	public static string $db_install_name = 'dedalo7_install';



	/**
	* __CONSTRUCT
	* @param string $mode = 'install'
	*/
	public function __construct(string $mode='install') {

		$tipo = 'dd1590';

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
			$db_status				= install_config_manager::get_db_status();
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
			$properties->db_data_version =	install_config_manager::get_db_data_version();

		// dedalo version
			$properties->version = DEDALO_VERSION . ' - Build ' . DEDALO_BUILD;

		// check if the install database file exist
			$config = install_config_manager::get_config();
			$properties->target_file_path = $config->target_file_path_compress;
			$properties->target_file_path_exists = (file_exists($config->target_file_path_compress))
				? true
				: false;

		// get the hierarchy file path
			$properties->hierarchy_files_dir_path = $config->hierarchy_files_dir_path;
		// hierarchies
			$hierarchies = install_hierarchy_manager::get_available_hierarchy_files();
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
		return install_config_manager::get_config();
	}//end get_config

	/**
	* GET_DB_INSTALL_CONN
	* @return PgSql\Connection|bool
	*/
	public static function get_db_install_conn() : PgSql\Connection|bool {
		return install_config_manager::get_db_install_conn();
	}//end get_db_install_conn

	/**
	* GET_DB_STATUS
	* @return object
	*/
	public static function get_db_status() : object {
		return install_config_manager::get_db_status();
	}//end get_db_status

	/**
	* GET_DB_DATA_VERSION
	* @return array|null
	*/
	public function get_db_data_version() : ?array {
		return install_config_manager::get_db_data_version();
	}//end get_db_data_version

	/**
	* TO_UPDATE
	* @return object $response
	*/
	public static function to_update() : object {
		return install_config_manager::to_update();
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
			$config = install_config_manager::get_config();

		// clone database to dedalo_install
			// CLI msg
			if ( running_in_cli()===true ) {
				print_cli((object)[
					'msg' => 'Cloning database'
				]);
			}
			$skip_if_exists = false;
			// $call_response = install_database_manager::clone_database_dump($skip_if_exists);
			$call_response = install_database_manager::clone_database($skip_if_exists);
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
			$call_response = install_ontology_manager::clean_ontology();
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
			$call_response = install_database_manager::clean_counters();
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
			$call_response = install_database_manager::clean_tables();
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
			$call_response = install_database_manager::create_extensions();
			if ($call_response->result===false) {
				return $call_response;
			}
			if (!empty($call_response->errors)) {
				$response->errors = array_merge($response->errors, $call_response->errors);
			}

		// create default blank root user
			// CLI msg
			if ( running_in_cli()===true ) {
				print_cli((object)[
					'msg' => 'Creating root user'
				]);
			}
			$call_response = install_data_seeder::create_root_user();
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
			$call_response = install_data_seeder::create_main_project();
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
			$call_response = install_data_seeder::create_main_profiles();
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
			$call_response = install_data_seeder::create_test_record();
			if ($call_response->result===false) {
				return $call_response;
			}
			if (!empty($call_response->errors)) {
				$response->errors = array_merge($response->errors, $call_response->errors);
			}

		// import hierarchy main records
			// CLI msg
			if ( running_in_cli()===true ) {
				print_cli((object)[
					'msg' => 'Importing hierarchy main records'
				]);
			}
			$call_response = install_hierarchy_manager::import_hierarchy_main_records();
			if ($call_response->result===false) {
				return $call_response;
			}
			if (!empty($call_response->errors)) {
				$response->errors = array_merge($response->errors, $call_response->errors);
			}

		// vacuum analyze
			// CLI msg
			if ( running_in_cli()===true ) {
				print_cli((object)[
					'msg' => 'Vacuum database'
				]);
			}
			$call_response = install_database_manager::optimize_database();
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
			$call_response = install_ontology_manager::build_install_db_file();
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
		return install_database_manager::optimize_database();
	}//end optimize_database

	/**
	* INSTALL_DB_FROM_DEFAULT_FILE
	* @return object $response
	*/
	public static function install_db_from_default_file() : object {
		return install_database_manager::install_db_from_default_file();
	}//end install_db_from_default_file

	/**
	* CLONE_DATABASE
	* @param bool $skip_if_exists
	* @return object $response
	*/
	private static function clone_database(bool $skip_if_exists) : object {
		return install_database_manager::clone_database($skip_if_exists);
	}//end clone_database

	/**
	* CLONE_DATABASE_DUMP
	* @param bool $skip_if_exists
	* @return object $response
	*/
	private static function clone_database_dump(bool $skip_if_exists) : object {
		return install_database_manager::clone_database_dump($skip_if_exists);
	}//end clone_database_dump

	/**
	* CLEAN_ONTOLOGY
	* @return object $response
	*/
	private static function clean_ontology() : object {
		return install_ontology_manager::clean_ontology();
	}//end clean_ontology

	/**
	* CLEAN_COUNTERS
	* @return object $response
	*/
	private static function clean_counters() : object {
		return install_database_manager::clean_counters();
	}//end clean_counters

	/**
	* CLEAN_TABLES
	* @return object $response
	*/
	private static function clean_tables() : object {
		return install_database_manager::clean_tables();
	}//end clean_tables

	/**
	* CREATE_EXTENSIONS
	* @return object $response
	*/
	private static function create_extensions() : object {
		return install_database_manager::create_extensions();
	}//end create_extensions

	/**
	* CREATE_ROOT_USER
	* @return object $response
	*/
	private static function create_root_user() : object {
		return install_data_seeder::create_root_user();
	}//end create_root_user

	/**
	* CREATE_MAIN_PROJECT
	* @return object $response
	*/
	private static function create_main_project() : object {
		return install_data_seeder::create_main_project();
	}//end create_main_project

	/**
	* CREATE_MAIN_PROFILES
	* @return object $response
	*/
	private static function create_main_profiles() : object {
		return install_data_seeder::create_main_profiles();
	}//end create_main_profiles

	/**
	* CREATE_TEST_RECORD
	* @return object $response
	*/
	private static function create_test_record() : object {
		return install_data_seeder::create_test_record();
	}//end create_test_record

	/**
	* IMPORT_HIERARCHY_MAIN_RECORDS
	* @return object $response
	*/
	private static function import_hierarchy_main_records() : object {
		return install_hierarchy_manager::import_hierarchy_main_records();
	}//end import_hierarchy_main_records

	/**
	* BUILD_INSTALL_DB_FILE
	* @return object $response
	*/
	public static function build_install_db_file() : object {
		return install_ontology_manager::build_install_db_file();
	}//end build_install_db_file

	/**
	* ACTIVATE_HIERARCHY
	* @param object $options
	* @return object $response
	*/
	public static function activate_hierarchy(object $options) : object {
		return install_hierarchy_manager::activate_hierarchy($options);
	}//end activate_hierarchy

	/**
	* GET_AVAILABLE_HIERARCHY_FILES
	* @return object $response
	*/
	public static function get_available_hierarchy_files() : object {
		return install_hierarchy_manager::get_available_hierarchy_files();
	}//end get_available_hierarchy_files

	/**
	* GET_HIERARCHY_TYPLOLOGIES
	* @return array $typlologies
	*/
	public static function get_hierarchy_typlologies() : array {
		return install_hierarchy_manager::get_hierarchy_typlologies();
	}//end get_hierarchy_typlologies

	/**
	* INSTALL_HIERARCHIES
	* @param object $options
	* @return object $response
	*/
	public static function install_hierarchies(object $options) : object {
		return install_hierarchy_manager::install_hierarchies($options);
	}//end install_hierarchies

	/**
	* SYSTEM_IS_ALREADY_INSTALLED
	* @return object $response
	*/
	public static function system_is_already_installed() : object {
		return install_config_manager::system_is_already_installed();
	}//end system_is_already_installed

	/**
	* SET_ROOT_PW
	* @param object $options
	* @return object $response
	*/
	public static function set_root_pw(object $options) : object {
		return install_config_manager::set_root_pw($options);
	}//end set_root_pw

	/**
	* SET_INSTALL_STATUS
	* @param string $status
	* @return object $response
	*/
	public static function set_install_status(string $status) : object {
		return install_config_manager::set_install_status($status);
	}//end set_install_status

	/**
	* BUILD_RECOVERY_VERSION_FILE
	* @return object $response
	*/
	public static function build_recovery_version_file() : object {
		return install_ontology_manager::build_recovery_version_file();
	}//end build_recovery_version_file

	/**
	* RESTORE_DD_ONTOLOGY_RECOVERY_FROM_FILE
	* @return object $response
	*/
	public static function restore_dd_ontology_recovery_from_file() : object {
		return install_ontology_manager::restore_dd_ontology_recovery_from_file();
	}//end restore_dd_ontology_recovery_from_file

}//end class install
