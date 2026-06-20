<?php declare(strict_types=1);

include_once __DIR__ . '/class.install_hierarchy_manager.php';

/**
* CLASS INSTALL_CONFIG_MANAGER
* Central configuration provider and state manager for the Dédalo installation
* process.
*
* Responsibilities:
* - Build the shared install-time configuration object (database names, file
*   paths, table allow-lists, preserved TLDs) consumed by all other install
*   manager classes.
* - Open a PostgreSQL connection to the dedicated install database
*   (`dedalo7_install`) that is separate from the live application database.
* - Validate that the deployer has replaced every placeholder constant in
*   `config/config.php` and that a real database connection can be established.
* - Detect whether the application has already been fully installed by
*   inspecting `matrix_users`.
* - Write the root user's encrypted password during the very first install run,
*   guarded by multiple safety checks that prevent accidental re-execution.
* - Persist the `DEDALO_INSTALL_STATUS` constant to `config/config_core.php`,
*   which is included on every request and acts as the single source of truth
*   for whether the application is in install vs. running mode.
*
* This is a static-only utility class. Instantiation is intentionally blocked
* by a private constructor. All external callers use the static interface.
*
* Relationships:
* - Included by `class.install_hierarchy_manager.php` (via the include at the
*   top of that file) and by `class.install.php` which orchestrates the full
*   installation sequence.
* - Delegates hierarchy typology discovery to `install_hierarchy_manager`.
* - Calls `DBi::_getNewConnection()` for PostgreSQL connection management and
*   `DBi::check_table_exists()` / `pg_query()` for schema introspection.
* - Calls `login::check_root_has_default_password()` to gate the
*   `set_root_pw()` action.
* - Reads and writes `config/config_core.php` via plain file I/O (not the
*   Dédalo component layer) because the install system must remain functional
*   before any section/component infrastructure is available.
*
* @package Dédalo
* @subpackage Install
*/
final class install_config_manager {

	/**
	* Name of the dedicated PostgreSQL database used during installation.
	* This database is separate from the live application database
	* (DEDALO_DATABASE_CONN) and is pre-populated with seed data that the
	* install process imports from `install/db/dedalo7_install.pgsql(.gz)`.
	* @var string $db_install_name
	*/
	public static string $db_install_name = 'dedalo7_install';

	/**
	* __CONSTRUCT
	* Private constructor to prevent instantiation.
	* All methods are static; this class must never be instantiated.
	*/
	private function __construct() {}

	/**
	* GET_CONFIG
	* Build and return the canonical install-time configuration object.
	*
	* Aggregates all install-related paths, database identifiers, table
	* allow-lists, TLD preservation lists, and shell connection arguments into
	* a single stdClass so that every other install manager can call
	* `install_config_manager::get_config()` without re-deriving these values.
	*
	* Key properties of the returned object:
	* - `db_install_name`           — name of the PostgreSQL install database.
	* - `host_line`                  — shell-safe `-h <host>` fragment for psql
	*                                 commands. When DEDALO_HOSTNAME_CONN is empty it
	*                                 falls back to `-h <socket dir>` (DEDALO_SOCKET_CONN)
	*                                 and otherwise to an empty string — never a bare
	*                                 `'localhost'` (which psql would read as a dbname).
	* - `port_line`                  — shell-safe `-p <port>` fragment; empty
	*                                 string when DEDALO_DB_PORT_CONN is not set.
	* - `to_preserve_tld`           — TLD prefixes whose records must NOT be
	*                                 deleted during a "clean data" operation.
	* - `to_clean_tables`           — matrix_* tables that are truncated when
	*                                 resetting the install database, except for
	*                                 `matrix_ontology` (which is handled
	*                                 separately).
	* - `valid_tables`              — exhaustive list of tables that should exist
	*                                 in the target database; any other table
	*                                 found there will be dropped.
	* - `target_file_path`          — absolute path to the raw PostgreSQL dump
	*                                 (`dedalo7_install.pgsql`).
	* - `target_file_path_compress` — gzip-compressed variant of the dump.
	* - `hierarchy_files_dir_path`  — directory containing `.copy.gz` hierarchy
	*                                 import files.
	* - `install_checked_default`   — TLD codes pre-selected in the install UI.
	* - `hierarchy_typologies`      — decoded array from `hierarchies_typologies.json`.
	* - `config_core_file_path`     — absolute path to `config/config_core.php`,
	*                                 the runtime file where `DEDALO_INSTALL_STATUS`
	*                                 is written.
	*
	* Security note (SEC-041): `host_line` and `port_line` apply
	* `escapeshellarg()` to the constant values even though those constants come
	* from a deployer-controlled filesystem file (`config/config.php`), not from
	* HTTP input. This is defence-in-depth against unexpected whitespace or
	* special characters that could alter the psql command line.
	*
	* @return object - stdClass configuration object; never null.
	*/
	public static function get_config() : object {

		$db_install_name	= self::$db_install_name;
		// SEC-041: shell-quote host/port values. The values originate from
		// `config/config.php` constants (deployer-controlled, filesystem-only)
		// so this is defence-in-depth, not an HTTP-reachable taint fix. Quoting
		// the *value* portion only — the `-h`/`-p` flag stays unquoted.
		// BUG-6: when DEDALO_HOSTNAME_CONN is empty, fall back to the socket directory
		// (socket-only installs) and otherwise emit NO host flag — never the bare word
		// 'localhost', which psql would parse as a positional database name. Shares the
		// host/socket precedence rule with DBi::build_conn_flags().
		$host_line			= (!empty(DEDALO_HOSTNAME_CONN))
									? ('-h '.escapeshellarg(DEDALO_HOSTNAME_CONN))
									: ((defined('DEDALO_SOCKET_CONN') && !empty(DEDALO_SOCKET_CONN)) ? ('-h '.escapeshellarg(DEDALO_SOCKET_CONN)) : '');
		$port_line			= (!empty(DEDALO_DB_PORT_CONN)) ? ('-p '.escapeshellarg((string)DEDALO_DB_PORT_CONN)) : '';

		// to_preserve_tld. Records of this list will be preserved on clean data
		$to_preserve_tld	= [
			'dd',			// Dedalo core
			'rsc',			// Dédalo resources
			'hierarchy',	// Dédalo hierarchies
			'ontology',		// Dédalo ontology
			'ontologytype', // Dédalo ontology types (ontologytype15 is always needed)
			'localontology',// Dédalo local ontology
			'lg',			// Dédalo langs
			'oh',			// Oral History
		];

		// to_clean_tables. The records of this list will be removed from the install DB except for some exceptions like 'matrix_ontology'
		$to_clean_tables	= [
			'matrix',					// main table
			'matrix_activities',		// activities (exhibitions, visits, etc)
			'matrix_activity',			// Dédalo activity log data
			'matrix_activity_diffusion',// activity/diffusion tracking data (project-specific)
			'matrix_hierarchy',			// thesaurus data
			'matrix_hierarchy_main',// hierarchy data
			'matrix_ontology',		// ontology data
			'matrix_ontology_main',// ontology data
			'matrix_indexations',	// indexation data
			'matrix_layout',		// print presets layout table
			'matrix_layout_dd',		// print presets layout table (former oh1 print presets)
			'matrix_list',			// public list values
			'matrix_nexus',			// nexus data
			'matrix_nexus_main',	// nexus main data
			'matrix_notes',			// notes inside transcription content
			'matrix_notifications',	// internal notifications data
			'matrix_profiles',		// user profiles table
			'matrix_projects',		// projects table
			'matrix_stats',			// stats data
			'matrix_test',			// only for test purposes
			'matrix_tools',			// tools register, development and config
			'matrix_time_machine',	// data versions table
			'matrix_users',			// users table (user 'root' will be re-created later)
			'matrix_dataframe',		// dataframe records (ratings mainly)
		];

		// valid_tables. Other tables not inckuded here will be deleted in target data base
		$valid_tables = [
			'matrix_counter_dd',
			'matrix_activity_diffusion',
			'matrix_projects',
			'dd_ontology',
			'dd_ontology_recovery',
			'main_dd',
			'matrix',
			'matrix_activities',
			'matrix_activity',
			'matrix_counter',
			'matrix_dataframe',
			'matrix_hierarchy',
			'matrix_hierarchy_main',
			'matrix_indexations',
			'matrix_langs',
			'matrix_layout',
			'matrix_layout_dd',
			'matrix_profiles',
			'matrix_list',
			'matrix_nexus',
			'matrix_nexus_main',
			'matrix_notes',
			'matrix_notifications',
			'matrix_ontology',
			'matrix_ontology_main',
			'matrix_stats',
			'matrix_time_machine',
			'matrix_users',
			'matrix_tools',
			'matrix_updates',
			'matrix_test',
			'matrix_dd',
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
		$hierarchy_typologies 		= install_hierarchy_manager::get_hierarchy_typlologies();

		// exclude_data_tables. Tables whose row DATA is fully removed during the clean
		// phase, so the install image ships their structure (and sequences) but no rows.
		// These are excluded from the clone dump (pg_dump --exclude-table-data) so that
		// production-scale data — matrix_time_machine, matrix_activity, matrix_hierarchy,
		// matrix_ontology, etc. — is never copied only to be deleted again. matrix_ontology
		// is cloned schema-only here and its handful of preserved TLD-root rows are reloaded
		// directly from source by install_database_manager::load_filtered_matrix_ontology()
		// (18k rows → ~8). matrix_ontology_main stays OFF this list: its rows are row-FILTERED
		// in place by clean_tables() (a JSONB predicate) and it is tiny, so copy-then-filter is
		// fine. Derived from to_clean_tables so the whitelist stays the single source of truth.
		$row_filtered_tables	= ['matrix_ontology_main'];
		$exclude_data_tables	= array_values(array_diff($to_clean_tables, $row_filtered_tables));

		return (object)[
			'db_install_name'			=> $db_install_name,
			'host_line'					=> $host_line,
			'port_line'					=> $port_line,
			'to_preserve_tld'			=> $to_preserve_tld,
			'to_clean_tables'			=> $to_clean_tables,
			'exclude_data_tables'		=> $exclude_data_tables,
			'valid_tables' 				=> $valid_tables,
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
	* Open a new PostgreSQL connection to the dedicated install database.
	*
	* The install database (`dedalo7_install`) is distinct from the live
	* application database (DEDALO_DATABASE_CONN). This connection is used by
	* install operations that need to read from or write to the seed database
	* without touching production data.
	*
	* Connection credentials (host, username, password, port, socket) are taken
	* directly from the global DEDALO_*_CONN constants defined in
	* `config/config.php`. Only the database name differs from the normal runtime
	* connection.
	*
	* @return PgSql\Connection|bool - a live PostgreSQL connection on success;
	*         false when the connection attempt fails (e.g. database does not
	*         exist yet, wrong credentials, or PostgreSQL is not reachable).
	*/
	public static function get_db_install_conn() : PgSql\Connection|bool {

		$config = self::get_config();

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
	* PG_SHELL_EXEC
	* Run a PostgreSQL client shell command (pg_dump / psql / gunzip|psql pipelines) with libpq
	* authentication via the PGPASSWORD environment variable, taken from DEDALO_PASSWORD_CONN — so
	* the source/target database may be LOCAL or REMOTE without relying on a ~/.pgpass file.
	* PGPASSWORD is exported only for the duration of the child process and cleared immediately
	* after, and is never interpolated into $command, so the secret reaches neither the process
	* argument list nor any debug log of the command string. Mirrors the inline handling in
	* install_database_manager::clone_database_dump().
	*
	* Binary-path resolution is the caller's responsibility — build commands with
	* system::get_pg_bin_path() (never the raw DB_BIN_PATH constant), so binaries are found on
	* any host layout while connecting over the network to a remote server.
	*
	* @param string $command full shell command (binaries, -h/-p, -U, plus any redirects/pipes)
	* @return string|null     shell_exec() return value (stdout, or null when there is none)
	*/
	public static function pg_shell_exec(string $command) : ?string {

		// Delegate to the canonical helper on the DB layer (DBi::pg_shell_exec),
		// which owns PGPASSWORD lifecycle handling. Kept as a thin alias so existing
		// install callers do not change.
		return DBi::pg_shell_exec($command);
	}//end pg_shell_exec

	/**
	* GET_DB_STATUS
	* Validate the database configuration and test the live connection.
	*
	* Checks each mandatory constant against its known placeholder default:
	* - DEDALO_DATABASE_CONN  must not be empty or 'dedalo_mydatabase'
	* - DEDALO_USERNAME_CONN  must not be empty or 'myusername'
	* - DEDALO_PASSWORD_CONN  must not be empty or 'mypassword'
	* - DEDALO_INFORMATION    must not be empty or 'Dédalo install version'
	* - DEDALO_INFO_KEY       must not be empty or 'my_entity_name'
	*
	* After checking each constant individually it also attempts to open a real
	* PostgreSQL connection to confirm that the database is actually reachable
	* with the configured credentials.
	*
	* The returned object has one boolean property per check, a composite
	* `config_check` (true only when all individual checks pass), and a
	* `global_status` that is false if any single property is false.
	*
	* Returned stdClass properties (all bool):
	* - config_db_name_check
	* - config_user_name_check
	* - config_pw_check
	* - config_information_check
	* - config_info_key_check
	* - config_check          — composite: all of the above
	* - db_connection_check   — live connection succeeded
	* - global_status         — all of the above including db_connection_check
	*
	* @return object - stdClass with the fields described above.
	*/
	public static function get_db_status() : object {

		// check config db vars.
		// On a FRESH v7 install (no ../private/.env, no state.php) the SECRET constant
		// DEDALO_PASSWORD_CONN and the STATE constants DEDALO_INFORMATION / DEDALO_INFO_KEY are
		// NOT defined (they are emitted only from .env/state.php). Read them defensively so this
		// status check returns "not configured" instead of fataling before the installer renders.
			$db_name		= defined('DEDALO_DATABASE_CONN') ? DEDALO_DATABASE_CONN : '';
			$user_name		= defined('DEDALO_USERNAME_CONN') ? DEDALO_USERNAME_CONN : '';
			$pw				= defined('DEDALO_PASSWORD_CONN') ? DEDALO_PASSWORD_CONN : '';
			$information	= defined('DEDALO_INFORMATION') ? DEDALO_INFORMATION : '';
			$info_key		= defined('DEDALO_INFO_KEY') ? DEDALO_INFO_KEY : '';

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
			// GAP-3: an EMPTY password is a legitimate configuration under peer / trust
			// auth (or an existing ~/.pgpass) — the PGPASSWORD policy exports nothing and
			// libpq resolves auth itself. So only the literal sample placeholder must fail
			// config_check; whether an empty password actually authenticates is decided
			// below by $db_connection_check (a real pg_connect attempt).
			$pw_check = true;
			if($pw==='mypassword'){
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

		// check db connection.
		// Wrapped so a failed/placeholder connection on a fresh install can never escape as a
		// fatal (pg_connect emits a warning that Dédalo's error handler may promote to an
		// exception); here a failure simply means db_connection_check = false.
			$db_connection = false;
			try {
				set_error_handler(static function() : bool { return true; });
				$db_connection = DBi::_getNewConnection(
					defined('DEDALO_HOSTNAME_CONN') ? DEDALO_HOSTNAME_CONN : 'localhost',
					$user_name,
					$pw,
					$db_name,
					defined('DEDALO_DB_PORT_CONN') ? DEDALO_DB_PORT_CONN : null,
					defined('DEDALO_SOCKET_CONN') ? DEDALO_SOCKET_CONN : null
				);
				restore_error_handler();
			} catch (\Throwable $e) {
				restore_error_handler();
				$db_connection = false;
			}

			$db_connection_check = $db_connection !== false
				? true
				: false;

		// db writable check (verify target database allows CREATE/INSERT/DROP)
			$db_writable_check = false;
			if ($db_connection_check) {
				try {
					// attempt to create a temporary table, insert a row, and drop it
					$test_table = '_dedalo_install_write_test_' . time();
					$create_sql = "CREATE TEMP TABLE {$test_table} (id serial PRIMARY KEY, val text NOT NULL)";
					$insert_sql = "INSERT INTO {$test_table} (val) VALUES ('write_test')";
					$drop_sql	= "DROP TABLE IF EXISTS {$test_table}";

					$cr = pg_query($db_connection, $create_sql);
					if ($cr !== false) {
						$ir = pg_query($db_connection, $insert_sql);
						if ($ir !== false) {
							$dr = pg_query($db_connection, $drop_sql);
							if ($dr !== false) {
								$db_writable_check = true;
							}
						}else{
							// insert failed — likely no INSERT permission
							pg_query($db_connection, $drop_sql);
						}
					}
				} catch (Throwable $e) {
					debug_log(__METHOD__
						." DB writable check failed: " . $e->getMessage()
						, logger::WARNING
					);
				}
			}

		// db_status
			$db_status = new stdClass();
				$db_status->config_db_name_check		= $db_name_check;
				$db_status->config_user_name_check		= $user_name_check;
				$db_status->config_pw_check				= $pw_check;
				$db_status->config_information_check	= $information_check;
				$db_status->config_info_key_check		= $info_key_check;
				$db_status->config_check				= $config_check;
				$db_status->db_connection_check			= $db_connection_check;
				$db_status->db_writable_check			= $db_writable_check;

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
	* Read the current data-version triplet from the live database.
	*
	* Delegates to the global helper `get_current_data_version()` (defined in
	* `shared/core_functions.php`), which queries `matrix_updates` for the
	* highest `dedalo_version` value. The result is an array such as
	* `[7, 14, 3]` (major, minor, patch).
	*
	* Returns null when the function throws — for example during a fresh install
	* where `matrix_updates` does not yet exist, or when the database connection
	* is not yet available.
	*
	* @return array|null - version triplet on success; null on any exception.
	*/
	public static function get_db_data_version() : ?array {

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
	* Mark the installation as complete and ready for the update cycle.
	*
	* Called at the end of the installation wizard to transition the system
	* from install mode to normal running mode. Internally it is a thin wrapper
	* around `set_install_status('installed')`, which persists the status to
	* ../private/state.php (key `state.install_status`).
	*
	* @return object - stdClass response from set_install_status with:
	*                  `result` (bool) and `msg` (string).
	*/
	public static function to_update() : object {

		$response = self::set_install_status('installed');

		return $response;
	}//end to_update

	/**
	* SYSTEM_IS_ALREADY_INSTALLED
	* Determine whether Dédalo has previously been fully installed.
	*
	* The check is structural rather than relying on the `DEDALO_INSTALL_STATUS`
	* constant, making it useful to detect partial or inconsistent states:
	* 1. The `matrix_users` table must exist (schema has been loaded).
	* 2. That table must contain more than one user record (the root user is
	*    section_id = -1; a real install adds at least one normal user, bringing
	*    the count above 1).
	*
	* The distinction between "table missing" and "table exists but count ≤ 1"
	* is preserved so callers can display a more specific message.
	*
	* @return object - stdClass with:
	*   - result (bool): true when the system appears to be fully installed.
	*   - msg    (string): human-readable explanation of the result.
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
				$total	= ($row !== false) ? (int)($row->total ?? 0) : 0;

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
	* Encrypt and persist the root user's password during the initial install.
	*
	* This method may only execute successfully when ALL of the following
	* conditions are met; it returns an error response otherwise:
	* 1. `DEDALO_INSTALL_STATUS` is NOT yet 'installed' — prevents re-execution
	*    after a completed install.
	* 2. `login::check_root_has_default_password()` returns true — the root
	*    record in `matrix_users` must still hold its factory-default empty
	*    password value, preventing accidental overwrite of a password set in a
	*    previous (aborted) install run.
	* 3. `$options->password` is non-empty after XSS sanitisation.
	* 4. A round-trip encrypt → decrypt cycle produces the original plaintext,
	*    confirming that the OpenSSL key material is configured correctly.
	*
	* On success the encrypted password is written directly via a parameterised
	* SQL UPDATE to `matrix_users` for `section_id = -1`. Direct SQL is used
	* because the normal Save() path refuses to write records with
	* `section_id < 1` (a safety guard that also applies at runtime).
	*
	* The password is stored in the v7 JSONB string column format:
	* `{"<DEDALO_USER_PASSWORD_TIPO>": [{"id":1, "value":"<encrypted>", "lang":"lg-nolan"}]}`
	*
	* The active session is cleared after a successful write so that any cached
	* auth data is immediately invalidated.
	*
	* (!) If you need to change the root password AFTER a completed install:
	*   1. Set the string column of section_id = -1 in matrix_users to
	*      `{"dd133": []}` (empty array for the password component).
	*   2. Remove the `state.install_status` entry from ../private/state.php (v7 stores the
	*      install status there, not in config/config_core.php).
	*   Then re-run the install wizard and call this endpoint again.
	*
	* @param object $options - must contain `password` (string): the plaintext
	*                          root password chosen by the deployer.
	* @return object - stdClass with `result` (bool) and `msg` (string).
	*/
	public static function set_root_pw(object $options) : object {

		// options
			// NOTE: do NOT run safe_xss() on the password. It is never rendered in HTML —
			// it goes straight into dedalo_encrypt_openssl() and the DB. XSS-escaping it would
			// silently mangle legitimate characters (< > & " ') so the stored hash would not
			// match what the user typed, leaving them unable to log in.
			$password = $options->password ?? null;

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

		// v7 schema: write password to string column
			$tipo	= DEDALO_USER_PASSWORD_TIPO;
			$lang	= DEDALO_DATA_NOLAN;

		// Build v7 string value: [{id, value, lang}]
			$string_value = json_encode((object)[
				$tipo => [
					(object)['id' => 1, 'value' => $password_encripted, 'lang' => $lang]
				]
			]);

		// update string column directly. It's saved directly because for security, save data prevents to save section_id < 1
			$strQuery	= "UPDATE matrix_users SET string = $1 WHERE section_id = $2 AND section_tipo = $3";
			$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $string_value, -1, DEDALO_SECTION_USERS_TIPO ));
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
	* Persist `DEDALO_INSTALL_STATUS` to the out-of-web-root state file ../private/state.php
	* (STATE scope, dot-path `state.install_status`). The boot re-emits it as the live
	* DEDALO_INSTALL_STATUS constant on every request; that constant gates the install wizard
	* routes and the `set_root_pw()` action. (v7: this replaced the v6 scheme of writing a
	* `define()` line into the web-served config/config_core.php.)
	*
	* Two code paths:
	* 1. Constant already equals `$status` — no-op, returns success immediately.
	* 2. Otherwise — merge `state.install_status => $status` over the existing state.php (so
	*    info_key/information/maintenance written earlier survive) and write the file atomically
	*    via migration_committer::commit() (stage → back up → rename). A write failure is logged
	*    as an ERROR and surfaced in the response message.
	*
	* The entire `$_SESSION['dedalo']` key is cleared after a successful write
	* so that any cached session data derived from the old status is dropped.
	*
	* @param string $status - the status string to write; currently only
	*                         'installed' is used in practice.
	* @return object - stdClass with:
	*   - result (bool): true on success or when the status was already set.
	*   - msg    (string): human-readable outcome or error description.
	*/
	public static function set_install_status(string $status) : object {

		require_once __DIR__ . '/class.install_config_persistor.php';
		require_once DEDALO_ROOT_PATH . '/install/class.migration_committer.php';

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// already set: no-op
			if (defined('DEDALO_INSTALL_STATUS') && DEDALO_INSTALL_STATUS===$status) {
				$response->result	= true;
				$response->msg		= 'OK. Dédalo status is already: '.$status;
				return $response;
			}

			// guard: never SEAL 'installed' on an incomplete system (defense-in-depth vs a forged/early
			// install_finish that would brick the box into a password-less 'installed' state: set_root_pw
			// then refuses forever and get_structure_context returns empty). Requires the DB imported
			// (matrix_users present) AND the root password set. Legit upgrades (to_update) satisfy both.
				if ($status==='installed') {
					$db_ready	= DBi::check_table_exists('matrix_users');
					$root_ready	= $db_ready && (login::check_root_has_default_password()===false);
					if (!$db_ready || !$root_ready) {
						$response->msg = 'Error. Cannot mark the system installed: the database is not imported yet or the root password has not been set.';
						debug_log(__METHOD__.' '.$response->msg, logger::ERROR);
						return $response;
					}
				}

		// v7 install state lives OUTSIDE the web root, in ../private/state.php (STATE scope),
		// NOT in a web-served config file. Merge state.install_status over the existing state so
		// info_key/information/maintenance written earlier survive. The boot emits the raw value,
		// so the string 'installed' becomes DEDALO_INSTALL_STATUS === 'installed' (the gate value).
			$private	= dirname(DEDALO_ROOT_PATH) . '/private';
			$state_path	= $private . '/state.php';
			$existing	= [];
			if (is_file($state_path)) {
				try {
					$existing = (array)(require $state_path);
				} catch (\Throwable $e) {
					// corrupt/partial state.php → start from empty; the existing file is backed up by
					// migration_committer before overwrite, so nothing is silently lost.
					$existing = [];
				}
			}

			$content = install_config_persistor::render_state($existing, ['state.install_status' => $status]);

			try {
				migration_committer::commit(
					['state' => $content],
					['state' => $state_path],
					$private . '/.install_backups',
					[] // state.php is not a secret-only env file; default perms
				);
			} catch (Throwable $e) {
				$response->msg = 'Error. Could not write the install status to ' . $state_path . ': ' . $e->getMessage()
					. '. Review the PHP write permissions on the private directory.';
				debug_log(__METHOD__." ".$response->msg, logger::ERROR);
				return $response;
			}

		// refresh session cached data. Delete all session data
			unset($_SESSION['dedalo']);

			$response->result	= true;
			$response->msg		= 'OK. Install status set to: '.$status;

		return $response;
	}//end set_install_status

}//end class install_config_manager
