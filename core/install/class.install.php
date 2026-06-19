<?php declare(strict_types=1);

// Include collaborator classes
include_once __DIR__ . '/class.install_config_manager.php';
include_once __DIR__ . '/class.install_database_manager.php';
include_once __DIR__ . '/class.install_ontology_manager.php';
include_once __DIR__ . '/class.install_hierarchy_manager.php';
include_once __DIR__ . '/class.install_data_seeder.php';
include_once __DIR__ . '/class.install_setup_manager.php';

/**
* INSTALL
* Façade entry-point for all Dédalo installation and upgrade operations.
*
* Responsibilities:
* - Exposes the single public API surface consumed by install_json.php and
*   dd_utils_api (the install API controller), keeping callers decoupled from
*   the underlying manager hierarchy.
* - Delegates every real operation to one of five specialised managers:
*     install_config_manager   – config resolution, DB status, install-status file
*     install_database_manager – DB cloning, cleaning, extensions, optimization
*     install_ontology_manager – ontology stripping, recovery file export/import
*     install_hierarchy_manager – hierarchy file discovery, import, activation
*     install_data_seeder      – seeding root user, projects, profiles, test record
* - Extends `common` to satisfy the API compatibility contract (same constructor
*   shape, set_tipo / set_lang / set_mode / set_model calls) that install_json.php
*   and dd_utils_api expect from every handler object.
* - Provides `get_structure_context()`, which is the standard method the JS client
*   calls to build the installation wizard UI (pre-flight checks, DB status,
*   version info, available hierarchy files).
*
* Lifecycle of a fresh installation (typical call sequence):
*  1. get_structure_context()      – pre-flight: filesystem, DB, PHP version
*  2. install_db_from_default_file() – load the bundled .pgsql.gz seed database
*  3. set_root_pw($options)         – set the root user password
*  4. install_hierarchies($options) – activate the selected knowledge hierarchies
*  5. set_install_status('installed') / to_update() – seal the installation
*
* Lifecycle of building a distributable install image (developer / CI):
*  build_install_version()          – clone → clean → seed → pg_dump → .pgsql.gz
*
* @package Dédalo
* @subpackage Core
*/
class install extends common {

	/**
	* CLASS VARS
	*/

	/**
	 * Name of the ephemeral PostgreSQL database used during install-image creation.
	 * The current production database is cloned into this database, stripped of
	 * user data, seeded with defaults, and then pg_dumped to the distributable
	 * compressed file.  Mirrored from install_config_manager::$db_install_name.
	 * @var string $db_install_name
	 */
	public static string $db_install_name = 'dedalo7_install';



	/**
	* __CONSTRUCT
	* Initialises the install façade as an API-compatible handler.
	*
	* Sets tipo to 'dd1590' (the Dédalo install section ontology node), language to
	* the configured data language, mode to the supplied $mode, and model to
	* 'install'.  These values mirror the shape expected by install_json.php and
	* dd_utils_api so that the install object behaves like any other common handler.
	*
	* @param string $mode [= 'install'] - Operating mode passed to common::set_mode().
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
	* Builds the dd_object payload the install wizard JS client consumes to render
	* its UI and decide which setup steps to show.
	*
	* Execution is guarded by a cascade of early-return checks; each successive
	* check is only reached when all previous ones passed:
	*  1. Already-installed guard – if DEDALO_INSTALL_STATUS === 'installed', return
	*     a minimal dd_object immediately (no further checks needed).
	*  2. Filesystem / permissions pre-flight via dd_init_test.php – missing
	*     directories, wrong permissions, etc.  A false result stops execution and
	*     logs at ERROR level; the partial properties object is still returned so the
	*     UI can display the specific failure message.
	*  3. Database configuration and connection check (install_config_manager::get_db_status()).
	*     A false global_status stops execution.
	*  4. If all guards pass, assembles the full properties object containing:
	*       - dedalo_entity, db_config (name, user, host, port, socket)
	*       - db_data_version (array from get_current_data_version(), or null)
	*       - version string (DEDALO_VERSION + DEDALO_BUILD)
	*       - target_file_path_compress and target_file_path_exists flag
	*       - hierarchy_files_dir_path, hierarchies (available .copy.gz files), hierarchy_typologies
	*       - install_checked_default (pre-selected hierarchy codes)
	*       - php_version and php_version_supported (>= 8.1.0)
	*       - max_execution_time (from php.ini)
	*
	* @param int  $permissions       [= 1]     - Unused parameter; kept for interface compatibility.
	* @param bool $add_request_config [= false] - Unused parameter; kept for interface compatibility.
	* @return dd_object $dd_object - Always returns a dd_object; properties are partial on failure.
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

		// server_info. Detailed server environment diagnostics (using system class)
			$server_info = new stdClass();
				$server_info->php_version			= PHP_VERSION;
				$server_info->php_version_supported	= system::test_php_version_supported();
				$server_info->memory_limit			= ini_get('memory_limit') ?: '—';
				$server_info->php_memory			= system::get_php_memory() . ' GB';
				$server_info->max_execution_time	= ini_get('max_execution_time') ?: '—';
				$server_info->platform				= PHP_OS_FAMILY . ' ' . php_uname('r') . ' ' . php_uname('m');
				$server_info->server_software		= $_SERVER['SERVER_SOFTWARE'] ?? 'CLI';
				$server_info->ram					= system::get_ram() . ' GB';
				$server_info->cpu_mhz				= system::get_mhz() ? system::get_mhz() . ' MHz' : '—';
				$server_info->mbstring				= extension_loaded('mbstring') ? 'Available' : 'Not found';
				$server_info->curl					= system::check_curl() ? 'Available' : 'Not found';
				$server_info->openssl				= extension_loaded('openssl') ? 'Available' : 'Not found';
				$server_info->gd					= system::check_gd_lib() ? 'Available' : 'Not found';
				$server_info->pg_version			= '—';
				$server_info->apache_version		= system::get_apache_version() ?: '—';
				$server_info->imagemagick			= '—';
				$server_info->ffmpeg				= '—';
				$server_info->disk_free_space		= '—';
				$server_info->php_user				= '—';

			// PostgreSQL version (from system class, fallback to DB query)
				$pg_version = system::get_postgresql_version();
				if (!empty($pg_version)) {
					$server_info->pg_version = 'PostgreSQL ' . $pg_version;
				}else{
					try {
						$conn = install_config_manager::get_db_install_conn();
						if ($conn !== false) {
							$pg_result = pg_query($conn, 'SELECT version()');
							if ($pg_result !== false) {
								$pg_row = pg_fetch_row($pg_result);
								if ($pg_row !== false) {
									if (preg_match('/^PostgreSQL\s+(\S+)/', $pg_row[0], $matches)) {
										$server_info->pg_version = 'PostgreSQL ' . $matches[1];
									}else{
										$server_info->pg_version = $pg_row[0];
									}
								}
							}
						}
					} catch (Throwable $e) {
						// ignore - will show '—'
					}
				}

			// ImageMagick (from system class)
				$im_version = system::get_imagemagick_version();
				if (!empty($im_version)) {
					$server_info->imagemagick			= 'ImageMagick ' . $im_version;
					$server_info->imagemagick_supported	= system::test_imagemagick_version_supported();
				}

			// FFmpeg (from system class)
				$ff_version = system::get_ffmpeg_version();
				if (!empty($ff_version)) {
					$server_info->ffmpeg				= 'FFmpeg ' . $ff_version;
					$server_info->ffmpeg_supported		= system::test_ffmpeg_version_supported();
				}

			// Disk free space (from system class)
				$disk_mb = system::get_disk_free_space();
				if ($disk_mb !== null) {
					$server_info->disk_free_space = round($disk_mb / 1024, 1) . ' GB';
				}

			// PHP user
				$php_user_info = system::get_php_user_info();
				if ($php_user_info !== null) {
					$server_info->php_user = $php_user_info->name ?? ($php_user_info->current_user ?? '—');
				}

			$properties->server_info = $server_info;

		// errors found on init test (Don't stop execution here)
			if ($init_test_response->result===false) {

				// A not-installed system with failed diagnostics still needs configuration; flag it
				// so the modernized wizard renders the diagnostics view (and the prerequisites to fix)
				// rather than the legacy "could not get db status" path.
				$properties->needs_config = true;

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
			// On a FRESH install the config is still placeholder/unreachable. The modernized
			// wizard COLLECTS, validates and persists the config itself (../private/.env), so we
			// must NOT stop here — flag needs_config and continue, providing the prefill + file /
			// hierarchy properties the wizard needs (none of which require a DB connection). The
			// legacy "validate hand-edited config" path is taken only when global_status is true.
			$properties->needs_config = ($db_status->global_status===false);
			if($db_status->global_status===false) {
				debug_log(__METHOD__
					." Install needs configuration (db_status not yet valid); serving the config wizard."
					, logger::DEBUG
				);
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
		// Only meaningful when the database is actually reachable. On a FRESH install there is no
		// DB yet, and the data-version reader would pass a false connection to pg_* and fatal — so
		// skip it unless the live connection check passed.
			$properties->db_data_version = ($db_status->db_connection_check===true)
				? install_config_manager::get_db_data_version()
				: null;

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
	* Returns the resolved install configuration object.
	* Delegates to install_config_manager::get_config(), which assembles
	* path constants, connection details, table lists, and hierarchy typologies
	* into a single stdClass.  See install_config_manager for full shape.
	* @return object $config
	*/
	public static function get_config() : object {
		return install_config_manager::get_config();
	}//end get_config

	/**
	* GET_DB_INSTALL_CONN
	* Opens and returns a new PostgreSQL connection to the ephemeral install
	* database (db_install_name, not the current production database).
	* Used by the manager classes during install-image creation steps.
	* Returns false on connection failure.
	* @return PgSql\Connection|bool
	*/
	public static function get_db_install_conn() : PgSql\Connection|bool {
		return install_config_manager::get_db_install_conn();
	}//end get_db_install_conn

	/**
	* GET_DB_STATUS
	* Verifies that all required database constants have been customised from
	* their placeholder defaults and that a live PostgreSQL connection can be
	* established.  Returns a stdClass with per-check boolean flags plus a
	* global_status that is false if any individual check fails.
	* @return object
	*/
	public static function get_db_status() : object {
		return install_config_manager::get_db_status();
	}//end get_db_status

	/**
	* GET_DB_DATA_VERSION
	* Returns the data-schema version recorded in the current database
	* (e.g. ['5', '8', '2']), or null if the version cannot be determined
	* (missing table, exception during query).
	* @return array|null
	*/
	public function get_db_data_version() : ?array {
		return install_config_manager::get_db_data_version();
	}//end get_db_data_version

	/**
	* TO_UPDATE
	* Marks the Dédalo installation as complete by writing the
	* 'installed' status to config_core.php.  Called at the end of an
	* upgrade workflow (as opposed to a fresh install which calls
	* set_install_status() directly).
	* @return object $response
	*/
	public static function to_update() : object {
		return install_config_manager::to_update();
	}//end to_update

	/**
	* BUILD_INSTALL_VERSION
	* Orchestrates the full install-image creation pipeline, suitable for
	* developer / CI use.  The pipeline runs entirely on the server and
	* produces a distributable compressed .pgsql.gz snapshot of a clean,
	* seeded Dédalo database.
	*
	* Steps (each step returns on failure, accumulating non-fatal errors):
	*  1. Clone current production DB to the ephemeral install database via
	*     install_database_manager::clone_database() (requires exclusive lock;
	*     see clone_database_dump() for the lock-free alternative).
	*  2. Strip custom ontology rows, leaving only core TLD namespaces
	*     (dd, rsc, hierarchy, ontology, ontologytype, localontology, lg, oh).
	*  3. Truncate all counter tables and reset their sequences.
	*  4. Delete user data from all configurable matrix tables.
	*  5. Install required PostgreSQL extensions (unaccent, pg_trgm) and
	*     the f_unaccent() helper function.
	*  6. Insert the default root user (section_id = -1, password null).
	*  7. Insert the default main project (section_id = 1).
	*  8. Insert the default Admin and User profiles (section_ids 1 and 2).
	*  9. Insert a minimal test record required by unit tests.
	* 10. Import matrix_hierarchy_main.sql (countries and root hierarchies).
	* 11. Run VACUUM ANALYZE on the install database.
	* 12. pg_dump the install database to a gzip-compressed .pgsql file.
	*
	* Time limit is raised to 600 s (10 minutes) before execution.
	* Progress is printed to stdout when running in CLI mode.
	*
	* Response $response->errors accumulates non-fatal per-step warnings.
	* Any step that returns result === false causes an immediate early return.
	*
	* @return object $response
	*   - result bool   – true on full success, false on hard failure
	*   - msg    string – human-readable summary including source/target DB names
	*   - errors array  – accumulated non-fatal warnings from individual steps
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
	* Runs PostgreSQL VACUUM ANALYZE on the current production database to
	* reclaim storage and update query-planner statistics.
	* @return object $response
	*/
	public static function optimize_database() : object {
		return install_database_manager::optimize_database();
	}//end optimize_database

	/**
	* INSTALL_DB_FROM_DEFAULT_FILE
	* Decompresses and imports the bundled .pgsql.gz install seed file into
	* the current (empty) database.  This is the standard fresh-install path:
	* gunzip the file, run psql to load it, then delete the uncompressed copy.
	* Requires a .pgpass entry for the PostgreSQL user so psql can authenticate
	* without a password prompt.
	* @return object $response
	*/
	public static function install_db_from_default_file() : object {
		return install_database_manager::install_db_from_default_file();
	}//end install_db_from_default_file

	/**
	* CLONE_DATABASE
	* Clones the current production database to the ephemeral install database
	* using PostgreSQL CREATE DATABASE … WITH TEMPLATE.  Requires an exclusive
	* lock on the source database; any active client connection will block the
	* operation.  See install_database_manager::clone_database_dump() for the
	* lock-free pg_dump alternative.
	*
	* (!) This method is private; the build_install_version() pipeline invokes
	* install_database_manager::clone_database() directly.
	*
	* @param bool $skip_if_exists - If true, skip the clone when the target DB already exists.
	* @return object $response
	*/
	private static function clone_database(bool $skip_if_exists) : object {
		return install_database_manager::clone_database($skip_if_exists);
	}//end clone_database

	/**
	* CLONE_DATABASE_DUMP
	* Lock-free alternative to clone_database().  Uses a pg_dump | psql
	* pipeline with an MVCC snapshot on the source database, so no active
	* sessions need to be terminated first.  Currently unused by
	* build_install_version() (the commented-out line in that method), but
	* kept available as a private utility.
	*
	* @param bool $skip_if_exists - If true, skip the clone when the target DB already exists.
	* @return object $response
	*/
	private static function clone_database_dump(bool $skip_if_exists) : object {
		return install_database_manager::clone_database_dump($skip_if_exists);
	}//end clone_database_dump

	/**
	* CLEAN_ONTOLOGY
	* Removes custom ontology rows from the install database, retaining only
	* the core TLD namespaces defined in install_config_manager::$to_preserve_tld.
	* Also re-indexes affected tables and invalidates the diffusion section-map
	* cache when the diffusion subsystem is available.
	*
	* (!) Private — called from build_install_version() via install_ontology_manager.
	*
	* @return object $response
	*/
	private static function clean_ontology() : object {
		return install_ontology_manager::clean_ontology();
	}//end clean_ontology

	/**
	* CLEAN_COUNTERS
	* Truncates matrix_counter and matrix_counter_dd (resetting their sequences
	* to 1) and removes custom rows from main_dd, preserving only the core TLD
	* entries.  Counters are re-created on demand as records are inserted.
	*
	* (!) Private — called from build_install_version() via install_database_manager.
	*
	* @return object $response
	*/
	private static function clean_counters() : object {
		return install_database_manager::clean_counters();
	}//end clean_counters

	/**
	* CLEAN_TABLES
	* Drops tables not in the install_config_manager valid_tables allowlist,
	* deletes all rows from the configurable to_clean_tables list (with special
	* handling for matrix_ontology and matrix_ontology_main), resets sequences,
	* and runs VACUUM ANALYZE on every remaining table.
	*
	* (!) Private — called from build_install_version() via install_database_manager.
	*
	* @return object $response
	*/
	private static function clean_tables() : object {
		return install_database_manager::clean_tables();
	}//end clean_tables

	/**
	* CREATE_EXTENSIONS
	* Installs the required PostgreSQL extensions (unaccent, pg_trgm) and
	* defines the f_unaccent() immutable helper function in the install database.
	* These extensions power accent-insensitive full-text search across Dédalo.
	*
	* (!) Private — called from build_install_version() via install_database_manager.
	*
	* @return object $response
	*/
	private static function create_extensions() : object {
		return install_database_manager::create_extensions();
	}//end create_extensions

	/**
	* CREATE_ROOT_USER
	* Seeds the root user record (section_id = -1) into matrix_users with
	* username 'root' and a null password.  Password must be set separately via
	* set_root_pw().  The negative section_id is intentional; normal data-save
	* paths refuse to write records with section_id < 1 as a safety guard.
	*
	* (!) Private — called from build_install_version() via install_data_seeder.
	*
	* @return object $response
	*/
	private static function create_root_user() : object {
		return install_data_seeder::create_root_user();
	}//end create_root_user

	/**
	* CREATE_MAIN_PROJECT
	* Seeds the default 'General project' record (section_id = 1) into
	* matrix_projects.  Every Dédalo installation requires at least one project
	* for user/profile associations to be valid.
	*
	* (!) Private — called from build_install_version() via install_data_seeder.
	*
	* @return object $response
	*/
	private static function create_main_project() : object {
		return install_data_seeder::create_main_project();
	}//end create_main_project

	/**
	* CREATE_MAIN_PROFILES
	* Seeds two default permission profiles into matrix_profiles:
	*   - section_id 1: Admin
	*   - section_id 2: User
	* These profiles are referenced by the root user record and are required
	* before any user login can succeed.
	*
	* (!) Private — called from build_install_version() via install_data_seeder.
	*
	* @return object $response
	*/
	private static function create_main_profiles() : object {
		return install_data_seeder::create_main_profiles();
	}//end create_main_profiles

	/**
	* CREATE_TEST_RECORD
	* Seeds the minimal record required for Dédalo's unit-test suite into
	* matrix_test (section_id = 1, section_tipo = 'test3').  Without this
	* record the test harness cannot execute component read/write round-trips.
	*
	* (!) Private — called from build_install_version() via install_data_seeder.
	*
	* @return object $response
	*/
	private static function create_test_record() : object {
		return install_data_seeder::create_test_record();
	}//end create_test_record

	/**
	* IMPORT_HIERARCHY_MAIN_RECORDS
	* Loads the bundled matrix_hierarchy_main.sql seed file into the install
	* database, populating the root-level hierarchy records for countries and
	* the main thematic/special/semantic/language hierarchies.  All imported
	* hierarchies are inactive by default; call activate_hierarchy() to load
	* their term/model data and make them visible.
	*
	* (!) Private — called from build_install_version() via install_hierarchy_manager.
	*
	* @return object $response
	*/
	private static function import_hierarchy_main_records() : object {
		return install_hierarchy_manager::import_hierarchy_main_records();
	}//end import_hierarchy_main_records

	/**
	* BUILD_INSTALL_DB_FILE
	* pg_dumps the ephemeral install database to the distributable gzip-compressed
	* .pgsql file at install/db/dedalo7_install.pgsql.gz.  Any existing file is
	* first renamed to a timestamped archive.  This is the last step of
	* build_install_version().
	* @return object $response
	*/
	public static function build_install_db_file() : object {
		return install_ontology_manager::build_install_db_file();
	}//end build_install_db_file

	/**
	* ACTIVATE_HIERARCHY
	* Activates a single hierarchy by its TLD, wiring up the ontology virtual
	* section, setting typology, label, language, active/active_in_thesaurus
	* flags, target section types, and (for typology 2) the general term and
	* model children locators.  Creates a new hierarchy_main record when the
	* TLD does not yet exist.
	*
	* @param object $options - Hierarchy descriptor with fields:
	*   tld (string), typology (int), label (string), active_in_thesaurus (bool)
	* @return object $response
	*/
	public static function activate_hierarchy(object $options) : object {
		return install_hierarchy_manager::activate_hierarchy($options);
	}//end activate_hierarchy

	/**
	* GET_AVAILABLE_HIERARCHY_FILES
	* Scans the hierarchy files directory for .copy.gz files, enriches each
	* with label, type ('term'|'model'), typology and active_in_thesaurus from
	* hierarchies.json, and returns the list.  Returns an empty result (not an
	* error) when the directory is empty or missing.
	* @return object $response - result is array of hierarchy descriptor objects or false
	*/
	public static function get_available_hierarchy_files() : object {
		return install_hierarchy_manager::get_available_hierarchy_files();
	}//end get_available_hierarchy_files

	/**
	* GET_HIERARCHY_TYPLOLOGIES
	* Returns the array of available hierarchy typology definitions read from
	* hierarchies_typologies.json.  Each entry has at minimum 'typology' (int)
	* and 'label' (string) fields.  Returns an empty array when the file is
	* missing.
	*
	* Note: the method name contains a typo ('typlologies'); kept as-is for
	* backward compatibility.
	*
	* @return array $typlologies
	*/
	public static function get_hierarchy_typlologies() : array {
		return install_hierarchy_manager::get_hierarchy_typlologies();
	}//end get_hierarchy_typlologies

	/**
	* INSTALL_HIERARCHIES
	* Batch-activates a list of selected hierarchies from $options.
	* For each selected hierarchy, imports its .copy.gz data file via
	* backup::import_from_copy_file() and then calls activate_hierarchy().
	* Collects per-hierarchy responses; errors do not stop processing of
	* subsequent hierarchies.
	*
	* @param object $options - Must contain:
	*   selected_hierarchies (array) – list of hierarchy descriptor objects,
	*   each with at least tld, typology, label, active_in_thesaurus.
	* @return object $response - result true, responses array of per-hierarchy results
	*/
	public static function install_hierarchies(object $options) : object {
		return install_hierarchy_manager::install_hierarchies($options);
	}//end install_hierarchies

	/**
	* SYSTEM_IS_ALREADY_INSTALLED
	* Checks whether the system has been previously installed by verifying that
	* the matrix_users table exists and contains more than one row.  A fresh
	* install seed has exactly one row (root); a count above 1 indicates a
	* configured installation.
	* @return object $response - result true when already installed, false otherwise
	*/
	public static function system_is_already_installed() : object {
		return install_config_manager::system_is_already_installed();
	}//end system_is_already_installed

	/**
	* SET_ROOT_PW
	* Sets the root user's password during the installation wizard.  This method
	* is restricted to the install phase: it guards against execution on an
	* already-installed system (DEDALO_INSTALL_STATUS === 'installed') and
	* refuses if the root record already has a non-default password.
	*
	* The password is XSS-sanitised, encrypt/decrypt cycle-tested, and stored
	* in the string column of matrix_users (section_id = -1) using the v7
	* [{id, value, lang}] item format.  The session auth cache is cleared after
	* a successful update.
	*
	* (!) To change the root password after installation, the admin must manually
	* clear the string column and remove the installed status from config_core.php.
	*
	* @param object $options - Must contain: password (string, plain-text).
	* @return object $response
	*/
	public static function set_root_pw(object $options) : object {
		return install_config_manager::set_root_pw($options);
	}//end set_root_pw


	/**
	* TEST_DB_CONNECTION
	* Interactive PostgreSQL check with the values typed in the wizard (delegates to
	* install_setup_manager). @see install_setup_manager::test_db_connection
	*/
	public static function test_db_connection(object $options) : object {
		return install_setup_manager::test_db_connection($options);
	}//end test_db_connection


	/**
	* TEST_DIFFUSION_CONNECTION
	* Interactive MariaDB/MySQL check for the optional diffusion engine.
	* @see install_setup_manager::test_diffusion_connection
	*/
	public static function test_diffusion_connection(object $options) : object {
		return install_setup_manager::test_diffusion_connection($options);
	}//end test_diffusion_connection


	/**
	* CHECK_DIRECTORIES
	* Verify (and optionally create) the main writable directories.
	* @see install_setup_manager::check_directories
	*/
	public static function check_directories(object $options) : object {
		return install_setup_manager::check_directories($options);
	}//end check_directories


	/**
	* PERSIST_CONFIG
	* Write the collected configuration to ../private/.env (+ Bun .env) and state.php.
	* @see install_setup_manager::persist_config
	*/
	public static function persist_config(object $options) : object {
		return install_setup_manager::persist_config($options);
	}//end persist_config


	/**
	* VERIFY_ACTIVE_CONFIG
	* Activation gate: confirm the saved config is live in this process.
	* @see install_setup_manager::verify_active_config
	*/
	public static function verify_active_config(object $options) : object {
		return install_setup_manager::verify_active_config($options);
	}//end verify_active_config

	/**
	* SET_INSTALL_STATUS
	* Writes or updates a DEDALO_INSTALL_STATUS define() call in config_core.php,
	* sealing the current installation state.  After a successful write the
	* session data is cleared so the next request re-evaluates the constant.
	*
	* Supported $status values: 'installed'.
	* No-ops (returns success) when the constant is already set to $status.
	* Creates config_core.php if it does not yet exist.
	*
	* @param string $status - Target install status; currently only 'installed' is used.
	* @return object $response
	*/
	public static function set_install_status(string $status) : object {
		return install_config_manager::set_install_status($status);
	}//end set_install_status

	/**
	* BUILD_RECOVERY_VERSION_FILE
	* Exports a recovery snapshot of the core ontology (dd, rsc, lg, hierarchy,
	* ontology, ontologytype TLDs) to install/db/dd_ontology_recovery.sql.gz.
	* Uses a temporary dd_ontology_recovery table as an intermediate copy target
	* so the live dd_ontology table is not affected.  The temp table is dropped
	* after the pg_dump completes.
	* @return object $response - Includes file_size (bytes) on success.
	*/
	public static function build_recovery_version_file() : object {
		return install_ontology_manager::build_recovery_version_file();
	}//end build_recovery_version_file

	/**
	* RESTORE_DD_ONTOLOGY_RECOVERY_FROM_FILE
	* Imports the gzip-compressed recovery SQL file
	* (install/db/dd_ontology_recovery.sql.gz) into the current database via
	* a gunzip | psql pipeline.  This recreates the dd_ontology_recovery table
	* that was exported by build_recovery_version_file().
	* @return object $response
	*/
	public static function restore_dd_ontology_recovery_from_file() : object {
		return install_ontology_manager::restore_dd_ontology_recovery_from_file();
	}//end restore_dd_ontology_recovery_from_file

}//end class install
