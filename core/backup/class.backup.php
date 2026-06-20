<?php declare(strict_types=1);
/**
* CLASS BACKUP
* Abstract utility class that centralises all database backup and restore
* operations for the Dédalo platform.
*
* Responsibilities:
* - Triggering and throttling PostgreSQL pg_dump backups (init_backup_sequence)
*   as a nohup background process so the HTTP response is not blocked.
* - Importing PostgreSQL COPY-format files into the matrix or ontology tables
*   (import_from_copy_file, copy_from_file).
* - Delegating MariaDB/MySQL dumps to the Bun diffusion engine via
*   diffusion_api_client::call('backup_database') — PHP itself never connects
*   to MariaDB (see MariaDB-is-Bun's-responsibility memory note).
* - Enumerating existing backup files for the maintenance UI.
* - Regenerating compiled JS label files for a given language (write_lang_file).
* - Performing a connectivity check against configured ontology servers
*   (check_remote_server).
*
* Architecture notes:
* - The class is abstract and never instantiated; all methods are static.
* - Heavy shell operations (pg_dump, gunzip, psql COPY) are run via shell_exec
*   or exec rather than PHP's pg_* functions so that large dumps do not exhaust
*   PHP memory limits.
* - Time-range throttling in init_backup_sequence uses get_last_modification_date()
*   to avoid redundant dumps within the configured DEDALO_BACKUP_TIME_RANGE window.
* - The DEDALO_DB_MANAGEMENT constant opt-out allows installations whose database
*   is managed externally (remote server, cloud provider) to bypass all local
*   dump logic transparently.
*
* Related classes:
* - DBi (core/db/class.DBi.php) — provides get_connection_string() for CLI tools.
* - matrix_db_manager (core/db/class.matrix_db_manager.php) — lower-level DB access.
* - diffusion_api_client (diffusion/class.diffusion_api_client.php) — Bun bridge.
* - label (core/common/class.label.php) — provides label arrays written to JS files.
* - process (core/base/class.processes.php) — wraps nohup background execution.
*
* @package Dédalo
* @subpackage Core
*/
abstract class backup {



	/**
	* CLASS VARS
	*/
		/**
		 * Ordered list of dd_ontology columns included in COPY export/import operations.
		 * The auto-incremented 'id' column is intentionally absent so that rows
		 * re-inserted after a DELETE re-acquire IDs without PK conflicts.
		 * copy_from_file() references this list when building the psql \copy command.
		 * @var array<int,string> $dd_ontology_columns
		 */
		public static array $dd_ontology_columns = ['tipo', 'parent', 'term', 'model', 'order_number', 'relations', 'tld', 'properties', 'model_tipo', 'is_model', 'is_translatable', 'propiedades'];

		/**
		 * Whether the download/output directory has already been verified or created
		 * in the current request lifetime.
		 * Acts as a one-shot guard so repeated calls within the same request skip
		 * redundant filesystem stat() calls.
		 * @var bool $checked_download_str_dir
		 */
		public static bool $checked_download_str_dir = false;



	/**
	* INIT_BACKUP_SEQUENCE
	* Launch a non-blocking pg_dump of the Dédalo PostgreSQL database.
	*
	* The dump is spawned as a background nohup process (nice -n 19) so the HTTP
	* response is not held waiting for a potentially large dump to complete.
	* The process PID and a per-process output file are returned to the caller
	* so that the maintenance UI can track progress.
	*
	* Throttle logic:
	*   By default the method respects a time-range guard: if a .backup file whose
	*   mtime is within DEDALO_BACKUP_TIME_RANGE hours already exists in the backup
	*   directory, the dump is skipped and result=true is returned immediately.
	*   Pass skip_backup_time_range=true to force an immediate dump regardless
	*   (useful for "backup now" buttons in the maintenance UI).
	*
	* Opt-out:
	*   When the constant DEDALO_DB_MANAGEMENT is explicitly set to false the method
	*   returns result=true without doing anything, allowing installations that delegate
	*   backups to an external system (cron, cloud provider, etc.) to call this method
	*   unconditionally without side-effects.
	*
	* File naming:
	*   Normal run   — "Y-m-d_H.<conn>.<type>_<user_id>_dbv<version>.custom.backup"
	*                  (hourly resolution; a second call within the same clock-hour
	*                   is skipped by the file_exists() guard below the time-range check)
	*   Forced run   — "Y-m-d_His.<conn>.<type>_<user_id>_forced_dbv<version>.custom.backup"
	*                  (second-level resolution so forced dumps never collide)
	*
	* @param object $options {
	*   user_id              : int    [= logged_user_id()]   — user triggering the backup
	*   username             : string [= logged_user_username()]
	*   skip_backup_time_range : bool [= false] — when true, bypass throttle check
	* }
	* @return object $response {
	*   result : bool   — true on success or skip, false on error
	*   msg    : string — human-readable status
	*   errors : array  — populated on failure
	*   pid    : int|null    — PID of spawned pg_dump process (on success)
	*   pfile  : string|null — path to the process stdout/stderr file (on success)
	* }
	*/
	public static function init_backup_sequence(object $options) : object {

		// options
			$user_id				= $options->user_id ?? logged_user_id(); // int
			$username				= $options->username ?? logged_user_username(); // string
			$skip_backup_time_range	= $options->skip_backup_time_range ?? false; // bool

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed '.__METHOD__;
				$response->errors	= [];

		// DEDALO_DB_MANAGEMENT opt-out
		// When DEDALO_DB_MANAGEMENT is explicitly false the database is managed
		// outside of PHP (remote server, cloud provider, external cron). In that
		// case we return success immediately without touching the filesystem.
			if (defined('DEDALO_DB_MANAGEMENT') && DEDALO_DB_MANAGEMENT===false) {

				$response->msg		= 'OK. Skipped request by db config management '.__METHOD__;
				$response->result	= true;

				debug_log(__METHOD__
					." Skipped request backup_sequence because DEDALO_DB_MANAGEMENT = false"
					, logger::WARNING
				);
				return $response;
			}

		try {

			// Backups folder exists verify
				$file_path = DEDALO_BACKUP_PATH_DB;
				if( !is_dir($file_path) ) {
					if(!mkdir($file_path, 0700, true)) {
						#throw new Exception(" Error on read or create backup directory. Permission denied");
						$response->result	= false;
						$response->msg		= 'Error on read or create backup directory. Permission denied '.__METHOD__;
						$response->errors[]	= 'Error: unable to create backups folder';
						debug_log(__METHOD__
							. " $response->msg " . PHP_EOL
							. ' file_path: ' . to_string($file_path)
							, logger::ERROR
						);
						return $response;
					}
					debug_log(__METHOD__
						." CREATED DIR: $file_path  "
						, logger::WARNING
					);
				}

			// file-name construction
			// Normal dumps use one-hour resolution ("Y-m-d_H") so that a second
			// call within the same clock-hour is caught by the file_exists() guard
			// below and avoids a duplicate dump.  Forced dumps use full second
			// resolution ("Y-m-d_His") so they never collide with each other.
			// The Dédalo data-version array (from matrix_updates) is appended so
			// the filename encodes which schema version the dump was taken at.
				$ar_dd_data_version	= get_current_data_version();
				$db_name			= ($skip_backup_time_range===true)
					? date("Y-m-d_His") .'.'. DEDALO_DATABASE_CONN .'.'. DEDALO_DB_TYPE .'_'. $user_id .'_forced_dbv' . implode('-', $ar_dd_data_version)
					: date("Y-m-d_H")   .'.'. DEDALO_DATABASE_CONN .'.'. DEDALO_DB_TYPE .'_'. $user_id .'_dbv' . implode('-', $ar_dd_data_version);

			// time range check
				if($skip_backup_time_range===true) {

					// Direct backup is forced
					debug_log(__METHOD__
						." Making backup without time range prevention "
						, logger::WARNING
					);

				}else{

					// Time range for backups in hours
					// DEDALO_BACKUP_TIME_RANGE can be overridden in config.php.
					// The default (8 h) prevents multiple large pg_dump processes
					// from queuing up when several users log in close together.
					if (!defined('DEDALO_BACKUP_TIME_RANGE')) {
						define('DEDALO_BACKUP_TIME_RANGE', 8); // Minimum lapse of time (in hours) for run backup script again. Default: (int) 4
					}
					// get_last_modification_date() scans only files with '.backup'
					// extension and excludes any path containing '/acc/' (access logs).
					// It returns 0 when no matching file is found, causing
					// difference_in_hours to be very large and always pass the guard.
					$last_modification_time_secs = get_last_modification_date(
						$file_path, // string path
						['backup'], // array|null allowedExtensions
						['/acc/'] // array ar_exclude
					);
					$current_time_secs		= time();
					// (!) Integer arithmetic on epoch seconds / 3600 before rounding
					// intentionally truncates to whole-hour boundaries, not elapsed
					// wall-clock hours, so two dumps at 07:59 and 08:01 are 1 hour
					// apart in this formula even though only 2 minutes elapsed.
					$difference_in_hours	= round( ($current_time_secs/3600) - round($last_modification_time_secs/3600), 0 );
					if ( $difference_in_hours < DEDALO_BACKUP_TIME_RANGE ) {
						$msg = ' Skipped backup. A recent backup (about '.$difference_in_hours.' hours early) already exists. It is not necessary to build another one';
						debug_log(__METHOD__
							." $msg "
							, logger::DEBUG
						);

						$response->result	= true;
						$response->msg		= $msg . " ".__METHOD__;

						return $response; // stop here
					}
				}

			// Backup file exists (less than an hour apart)
				$file_path = DEDALO_BACKUP_PATH_DB . DIRECTORY_SEPARATOR . $db_name . '.custom.backup';
				if (file_exists($file_path)) {
					$msg = " Skipped backup. A recent backup already exists ('$file_path'). It is not necessary to build another one";
					debug_log(__METHOD__
						. $msg  . PHP_EOL
						. ' db_name: ' . to_string($db_name)
						, logger::DEBUG
					);

					$response->result	= true;
					$response->msg		= $msg . " ".__METHOD__;

					return $response; // stop here
				}

			// pg_dump command
			// -F c  : custom (compressed) format for pg_restore compatibility
			// -b    : include large objects (BLOBs) in the dump
			// -v    : verbose output written to the process file for progress tracking
			// DBi::get_connection_string() returns "-h <host> [-p <port>] -U <user>"
			// so no password is exposed in the process list; authentication is provided
			// via the PGPASSWORD env var (DBi::pg_env_set, below) so the DB may be REMOTE
			// without a ~/.pgpass file.
			$cmd = system::get_pg_bin_path().'pg_dump '.DBi::get_connection_string().' -F c -b -v '.escapeshellarg(DEDALO_DATABASE_CONN).' > "'.$file_path .'"';

			// process
			// nohup + '& echo $!' lets PHP capture the PID and return immediately
			// while pg_dump continues in the background.  nice -n 19 ensures the
			// dump runs at lowest priority so it does not starve the web server.
				$pfile		= process::get_unique_process_file(); // like 'process_1_2024-03-31_23-47-36_3137757' usually stored in the sessions directory
				$file_path	= process::get_process_path() . DIRECTORY_SEPARATOR . $pfile; // output file with errors and stream data
				$command	= "nohup sh -c 'nice -n 19 $cmd' >$file_path 2>&1 & echo $!";

					// debug
					debug_log(__METHOD__
						." Building backup file in background ($file_path)". PHP_EOL
						." Command: ". PHP_EOL. to_string($command)
						, logger::DEBUG
					);

				// Export PGPASSWORD around the spawn so the backgrounded pg_dump inherits it
				// at fork time (the '& echo $!' returns only after the child has forked) and
				// then clear it. The secret never lands in $command or the debug log above.
				// GAP-1: guarantee PGPASSWORD is cleared even if process spawn throws,
				// so the secret never lingers in the request's environment.
				DBi::pg_env_set();
				try {
					$process	= new process($command);
					$pid		= $process->getPid();
				} finally {
					DBi::pg_env_clear();
				}

				// register the process so dd_utils_api::get_process_status can verify ownership
				processes::add(
					(int)$user_id,
					$pid,
					$pfile
				);

		}catch (Exception $e) {

			$msg = "Error on backup_sequence. User: $username. - error: ".  $e->getMessage(). "\n";
			debug_log(__METHOD__
				. " Exception: $msg "
				, logger::ERROR
			);

			// response error
				$response->result	= false;
				$response->msg		= "Exception: $msg";
				$response->errors[]	= $e->getMessage();

			return $response; // stop here
		}

		// response OK
			$response->result	= true;
			$response->pid		= $pid ?? null;
			$response->pfile	= $pfile ?? null;
			$response->msg		= empty($response->errors)
				? 'OK. backup process running for db: ' . $db_name
				: 'Warning! backup done with some errors';


		return $response;
	}//end init_backup_sequence



	/**
	* GET_TABLES
	* Returns the names of all user tables in the 'public' schema of the active
	* PostgreSQL database, ordered by table name.
	*
	* Queries information_schema.tables so the result is portable across PostgreSQL
	* versions. Only BASE TABLE rows are returned — views, foreign tables, and
	* temporary tables are excluded.
	*
	* Used by class.update (core/base/update) to enumerate tables when checking
	* or applying schema migrations.
	*
	* @return array<int,string> - Flat list of table names. Empty array on DB error.
	*/
	public static function get_tables() : array {

		$strQuery = "
		SELECT *
			FROM information_schema.tables
			WHERE table_type = 'BASE TABLE'
			AND table_schema = 'public'
			ORDER BY table_type, table_name
		";
		$result = matrix_db_manager::exec_search($strQuery, []);

		if(!$result) {
			$msg = 'Error. Failed to retrieve tables from the database.';
			debug_log(__METHOD__ . $msg . ' Query failed: ' . $strQuery, logger::ERROR);
			return [];
		}
		$tableList = array();
		while($row = pg_fetch_assoc($result)) {
			$tableList[] = $row['table_name'];
		}

		return $tableList;
	}//end get_tables



	/**
	* COPY_FROM_FILE
	* Load a PostgreSQL COPY-format flat file into the given table via the psql
	* client-side \copy meta-command.
	*
	* For known tables (dd_ontology, matrix_dd) the method follows a safe
	* three-step protocol:
	*   1. CREATE TABLE AS SELECT (safety duplicate) so the original data can be
	*      recovered if the import fails.
	*   2. DELETE rows for the given tld (dd_ontology) or all rows (matrix_dd).
	*   3. \copy … from <file> to load the new data.
	*
	* The safety duplicate is intentionally left in place after the operation.
	* Callers are responsible for dropping it (e.g. DROP TABLE dd_ontology_copy)
	* once they are satisfied the import is correct.
	*
	* Security:
	*   - The table name is validated against a strict identifier regex before use
	*     in shell commands.
	*   - $tld is passed through escapeshellarg() when inserted into DELETE commands.
	*   - $path_file is passed through escapeshellarg() when used in \copy.
	*
	* Note: This method is an older, lower-level counterpart to import_from_copy_file().
	* New code that needs to import .gz COPY files should prefer import_from_copy_file().
	*
	* @param string      $table     - Target table name; must match /^[a-zA-Z_][a-zA-Z0-9_]*$/.
	* @param string      $path_file - Absolute path to the COPY-format file to load.
	* @param string|null $tld       [= null] - Top-level domain identifier; required when
	*                                $table is 'dd_ontology' (scopes the DELETE to one TLD).
	* @return string - Concatenated shell output from all executed commands.
	*                  Empty string if table name is invalid or file does not exist.
	*/
	public static function copy_from_file( string $table, string $path_file, ?string $tld=null ) : string {

		$ar_res = [];

		// file exists check
			if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $table)) {
				debug_log(__METHOD__ . ' Invalid table name: ' . $table, logger::ERROR);
				return '';
			}
			if (!file_exists($path_file)) {
				debug_log(__METHOD__ . ' File not found: ' . $path_file, logger::ERROR);
				return '';
			}

		// tld mandatory for some tables check
			if ($table==='dd_ontology') {
				if (empty($tld)) {
					debug_log(__METHOD__
						. " Error Processing Request. tld is mandatory " . PHP_EOL
						. ' tld: ' . to_string($tld)
						, logger::ERROR
					);
					return '';
				}
			}

		$command_history = array();

		// psql connection string
		// host/port/user assembly is delegated to DBi::get_connection_string() (no password
		// in the process list); authentication is provided via the PGPASSWORD env var by
		// DBi::pg_shell_exec() below, so the DB may be LOCAL or REMOTE without a ~/.pgpass file.
		// Binary resolution uses system::get_pg_bin_path() so psql is found on any host layout.
		$command_base = system::get_pg_bin_path() . 'psql ' . escapeshellarg(DEDALO_DATABASE_CONN) . ' ' . DBi::get_connection_string();

		switch ($table) {

			case 'dd_ontology':
				// Duplicate table for safety
				$command = $command_base . " -c \"CREATE TABLE \"dd_ontology_copy\" AS SELECT * FROM \"dd_ontology\"\" ";
				$ar_res[] = DBi::pg_shell_exec($command);
				$command_history[] = $command;

				# DELETE . Remove previous records
				$tld_escaped = escapeshellarg($tld);
				$command = $command_base . " -c \"DELETE FROM \"dd_ontology\" WHERE tld = {$tld_escaped} \" ";
				$ar_res[] = DBi::pg_shell_exec($command);
				$command_history[] = $command;

				# COPY . Load data from file
				// The column list from $dd_ontology_columns excludes 'id' so
				// PostgreSQL assigns new serial values; addslashes() escapes the
				// comma-separated list for embedding inside a double-quoted shell string.
				$path_file_escaped = escapeshellarg($path_file);
				$command = $command_base . " -c \"\copy dd_ontology(".addslashes(implode(',', backup::$dd_ontology_columns)).") from {$path_file_escaped}\" ";
				$ar_res[] = DBi::pg_shell_exec($command);
				$command_history[] = $command;
				break;

			case 'matrix_dd':
				// Duplicate table for safety
				$command = $command_base . " -c \"CREATE TABLE \"matrix_dd_copy\" AS SELECT * FROM \"matrix_dd\"\" ";
				$ar_res[] = DBi::pg_shell_exec($command);
				$command_history[] = $command;

				# DELETE . Remove previous records
				$command = $command_base . " -c \"DELETE FROM \"matrix_dd\"\" ";
				$ar_res[] = DBi::pg_shell_exec($command);
				$command_history[] = $command;

				# COPY . Load data from file
				$path_file_escaped = escapeshellarg($path_file);
				$command = $command_base . " -c \"\copy matrix_dd from {$path_file_escaped}\" ";
				$ar_res[] = DBi::pg_shell_exec($command);
				$command_history[] = $command;
				break;
		}

		// debug
		debug_log(__METHOD__
		   .' command_history: '   . json_encode($command_history, JSON_PRETTY_PRINT) . PHP_EOL
		   .' command responses: ' . json_encode($ar_res, JSON_PRETTY_PRINT)
		   , logger::WARNING
		);

		$res = implode(' ', $ar_res);
		$res = str_replace("\n",' ',$res);


		return $res;
	}//end copy_from_file



	/**
	* CHECK_REMOTE_SERVER
	* Probes the configured ontology/structure server with a lightweight cURL
	* POST and returns the server's response object.
	*
	* The method supports two configuration styles (new preferred, legacy fallback):
	*   - ONTOLOGY_SERVERS (array of objects with 'name', 'url', 'code' keys)
	*     — only the first entry is probed; multi-server support is not yet used here.
	*   - STRUCTURE_SERVER_URL + STRUCTURE_SERVER_CODE (v6 legacy constants)
	*     — wrapped into an anonymous object so the rest of the code is uniform.
	*
	* The POST payload includes:
	*   code              : the ontology server access code
	*   check_connection  : true (signals the remote that this is a health-check)
	*   dedalo_version    : running Dédalo version string for compatibility checks
	*
	* Timeout is hard-coded to 5 seconds; SSL peer verification is disabled to
	* accommodate self-signed certificates on development/staging ontology servers.
	* If SERVER_PROXY is defined and non-empty it is forwarded to curl_request().
	*
	* @return object $response - Result from curl_request(); shape depends on the
	*   remote server. result=false with a 'msg' string is returned locally when
	*   the required constants are missing or empty.
	*/
	public static function check_remote_server() : object {

		// server config resolution
		// Prefer the v7 ONTOLOGY_SERVERS array constant; fall back to the v6
		// STRUCTURE_SERVER_URL / STRUCTURE_SERVER_CODE pair for installations that
		// have not yet migrated their config.  An empty-URL sentinel is used when
		// neither constant is defined so the validation block below can emit a
		// clear diagnostic rather than crashing on an undefined constant.
		if (defined('ONTOLOGY_SERVERS')) {
			$servers = ONTOLOGY_SERVERS;
		}else if (defined('STRUCTURE_SERVER_URL') && defined('STRUCTURE_SERVER_CODE')) {
			$servers = [(object)[
				'name'	=> 'Old Ontology server config. Define ONTOLOGY_SERVERS ASAP',
				'url'	=> STRUCTURE_SERVER_URL,
				'code'	=> STRUCTURE_SERVER_CODE
			]];
		}else{
			$servers = [(object)[
				'name'	=> 'Invalid ontology server config. Define ONTOLOGY_SERVERS ASAP',
				'url'	=> '',
				'code'	=> ''
			]];
		}
		$first_server			= (object)$servers[0];
		$ontology_server_code	= $first_server->code ?? '';
		$ontology_server_url	= $first_server->url ?? '';

		// Validate required constants
		if (empty($ontology_server_code)) {
			return (object)[
				'result' => false,
				'msg' => 'Error: ontology_server_code is not defined or empty'
			];
		}
		if (empty($ontology_server_url)) {
			return (object)[
				'result' => false,
				'msg' => 'Error: ontology_server_url is not defined or empty'
			];
		}

		// data
			$data = array(
				'code'				=> $ontology_server_code,
				'check_connection'	=> true,
				'dedalo_version'	=> DEDALO_VERSION ?? 'unknown'
			);
			$data_string = 'data=' . json_encode($data);

		// curl_request
			$response = curl_request((object)[
				'url'				=> $ontology_server_url,
				'post'				=> true,
				'postfields'		=> $data_string,
				'returntransfer'	=> 1,
				'followlocation'	=> true,
				'header'			=> true,
				'ssl_verifypeer'	=> false,
				'timeout'			=> 5, // seconds
				'proxy'				=> (defined('SERVER_PROXY') && !empty(SERVER_PROXY))
					? SERVER_PROXY // from Dédalo config file
					: false // default case
			]);


		return $response;
	}//end check_remote_server



	/**
	* WRITE_LANG_FILE
	* Compiles the full label map for a given language and writes it as a static
	* JSON-content JS file consumed by the browser UI.
	*
	* The output file is written to:
	*   DEDALO_CORE_PATH/common/js/lang/<lang>.js
	* and contains the raw JSON object (no JS variable declaration) so it can be
	* imported directly by the module bundler or loaded as a fetch target.
	*
	* After a successful write the server-side label cache file for that language
	* is deleted so the next PHP request rebuilds the cache from the database
	* rather than serving stale labels.
	*
	* On empty label fetch the file is still written (with a 'label_warning' sentinel
	* key) so the browser does not break on a missing file; the error is logged
	* separately at ERROR level.
	*
	* Called by area_maintenance when regenerating language assets and by
	* update_code after an ontology or code update.
	*
	* @param string $lang - BCP-47-like language code, e.g. 'es', 'en', 'ca'.
	* @return bool - true if the file was written successfully, false on write error.
	*/
	public static function write_lang_file(string $lang) : bool {

		// all labels
		$ar_label = label::get_ar_label($lang, false);
		if (empty($ar_label)) {
			debug_log(__METHOD__
				. " Error on get labels for lang: $lang" . PHP_EOL
				. ' The file will be created empty'
				, logger::ERROR
			);
			$ar_label = (object)[
				'label_warning' => 'You see this data because the labels are empty! '.$lang
			];
		}

		// file path
		$file_path = DEDALO_CORE_PATH . DIRECTORY_SEPARATOR . 'common' . DIRECTORY_SEPARATOR . 'js' . DIRECTORY_SEPARATOR . 'lang' . DIRECTORY_SEPARATOR . $lang . '.js';

		// content
		$content = json_encode($ar_label, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

		$write = file_put_contents(
			$file_path,
			$content
		);
		if ($write===false) {
			debug_log(__METHOD__
				. ' Error on write js/lang file. Permission denied.' . PHP_EOL
				. " lang: $lang - $file_path " .PHP_EOL
				, logger::ERROR
			);

			return false;
		}

		// remove lang cache
		$cache_file_name = label::build_cache_file_name($lang);
		if (!empty($cache_file_name)) {
			dd_cache::delete_cache_files([
				$cache_file_name
			]);
		}

		debug_log(__METHOD__
			. " Generated js labels file for lang: $lang - $file_path " .PHP_EOL
			. ' File size: ' .format_size_units( filesize($file_path) )
			, logger::DEBUG
		);

		return true;
	}//end write_lang_file



	/**
	* MAKE_MYSQL_BACKUP
	* Make a backup of the MariaDB database(s).
	* MariaDB management is a Bun engine responsibility: PHP computes the
	* target file path and asks the Bun diffusion API ('backup_database')
	* to run mysqldump (replaces v6 diffusion_mysql::backup_database).
	* @return object $response
	* {
	* 	result: array|bool [result: true, msg: Backup done web_my_ddbb,..]
	* 	msg: string
	* }
	*/
	public static function make_mysql_backup() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= '';

		// databases
		// API_WEB_USER_CODE_MULTIPLE is an array of publication-endpoint descriptors
		// defined in config.php.  Each entry may carry a 'db_name' key that names
		// the MariaDB database used by that publication endpoint.  We collect all
		// distinct db_name values so that every publication DB gets its own dump.
			$ar_database_name = [];
			$api_publication_code = defined('API_WEB_USER_CODE_MULTIPLE')
				? API_WEB_USER_CODE_MULTIPLE
				: [];
			foreach ($api_publication_code as $value) {
				if (!empty($value['db_name'])) {
					$ar_database_name[] = $value['db_name'];
				}
			}

			$response->result = [];
			foreach ($ar_database_name as $database_name) {

				// target file (path layout preserved from v6: DEDALO_BACKUP_PATH/mysql/)
				$file_name		= date('Y-m-d_His') .'_'. $database_name .'_'. logged_user_id() .'.sql';
				$target_file	= DEDALO_BACKUP_PATH . '/mysql/' . $file_name;

				// Bun engine executes mysqldump and writes the file
				$backup = diffusion_api_client::call((object)[
					'action'		=> 'backup_database',
					'database_name'	=> $database_name,
					'target_file'	=> $target_file
				], 600); // long timeout: dumps of large databases take time

				if (empty($backup->result)) {
					debug_log(__METHOD__
						. " Backup failed for database '$database_name'" . PHP_EOL
						. ' msg: ' . to_string($backup->msg ?? null)
						, logger::ERROR
					);
				}

				$response->result[] = $backup;
			}
			$response->msg = 'Backup done for databases: ' . implode(', ', $ar_database_name);


		return $response;
	}//end make_mysql_backup



	/**
	* GET_MYSQL_BACKUP_FILES
	* Scans the MariaDB/MySQL backup directory and returns metadata for every
	* .sql file found, sorted by filename in descending order (newest first,
	* because filenames start with a Y-m-d_His timestamp).
	*
	* Only files with the 'sql' extension are included; any other files (e.g.
	* partial downloads, .tmp lock files) are silently skipped.
	*
	* Used by the maintenance area UI to populate the backup file list widget.
	*
	* @return array<int,object> - Each entry: {name: string, size: string (human-readable)}.
	*   Empty array when the directory is empty or contains no .sql files.
	*/
	public static function get_mysql_backup_files() : array {

		$folder_path = DEDALO_BACKUP_PATH . DIRECTORY_SEPARATOR . 'mysql';

		// bk_files read backup directory
		$ar_bk_files = (array)glob($folder_path . '/*');
		// sort by name descendant
		$ar_bk_files = array_reverse($ar_bk_files);

		$ar_files = [];
		foreach ($ar_bk_files as $current_file) {

			$path_info = pathinfo($current_file);

			// only 'sql' extension is allowed
			$extension = $path_info['extension'] ?? null;
			if ($extension!=='sql') {
				// ignore it
				continue;
			}

			$name	= $path_info['basename'];
			$size	= filesize($current_file);

			$item = (object)[
				'name'	=> $name,
				'size'	=> format_size_units($size)
			];


			$ar_files[] = $item;
		}


		return $ar_files;
	}//end get_mysql_backup_files



	/**
	* GET_BACKUP_FILES
	* Scans the Dédalo PostgreSQL backup directory (DEDALO_BACKUP_PATH/db/) and
	* returns metadata for every pg_dump custom-format file (.backup), sorted by
	* filename in descending order (newest first, since filenames start with a
	* Y-m-d_H timestamp).
	*
	* Only files with the 'backup' extension are included; other files (e.g. partial
	* downloads, progress output files) are silently skipped.
	*
	* Used by the maintenance area UI to populate the PostgreSQL backup file list widget.
	*
	* @return array<int,object> - Each entry: {name: string, size: string (human-readable)}.
	*   Empty array when the directory is empty or contains no .backup files.
	*/
	public static function get_backup_files() : array {

		$folder_path = DEDALO_BACKUP_PATH . DIRECTORY_SEPARATOR . 'db';

		// bk_files read backup directory
		$ar_bk_files = (array)glob($folder_path . '/*');
		// sort by name descendant
		$ar_bk_files = array_reverse($ar_bk_files);

		$ar_files = [];
		foreach ($ar_bk_files as $current_file) {

			$path_info = pathinfo($current_file);

			// only 'backup' extension is allowed
			$extension = $path_info['extension'] ?? null;
			if ($extension!=='backup') {
				// ignore it
				continue;
			}

			$name	= $path_info['basename'];
			$size	= filesize($current_file);

			$item = (object)[
				'name'	=> $name,
				'size'	=> format_size_units($size)
			];


			$ar_files[] = $item;
		}


		return $ar_files;
	}//end get_backup_files



	/**
	* IMPORT_FROM_COPY_FILE
	* Imports a gzip-compressed PostgreSQL COPY-format file (e.g. 'es1.copy.gz')
	* into the specified matrix table using a four-step shell pipeline:
	*   1. gunzip --keep --force   — decompress to a sibling file (keeps the .gz)
	*   2. DELETE FROM <table>     — remove old rows for the section_tipo (or all rows)
	*   3. \copy <table>(...) from — load decompressed COPY data via psql
	*   4. setval(<table>_id_seq)  — resync the serial sequence to MAX(id)+1
	* The decompressed file is deleted at the end regardless of step outcomes.
	*
	* Delete scope:
	*   delete_table=false (default) — only rows WHERE section_tipo = $section_tipo
	*                                   are removed, so imports can be scoped to a
	*                                   single section type within a shared table.
	*   delete_table=true           — the entire table is truncated before import,
	*                                   typically used when re-loading a full matrix.
	*
	* Security:
	*   - file_path must match /^[a-zA-Z0-9_\/\.\-]+$/ and have a .gz extension.
	*   - matrix_table must match /^[a-zA-Z_][a-zA-Z0-9_]*$/.
	*   - Each column name is validated against the identifier regex.
	*   - section_tipo is escaped via str_replace("'","''") before insertion into SQL.
	*   - file_path is passed through escapeshellarg() in shell commands.
	*
	* Sequence update failure is non-fatal: the import is still reported as
	* successful with a WARNING log so callers are not blocked by a missing
	* or exhausted sequence.
	*
	* Called by ontology_data_io when restoring section data from an import archive.
	*
	* @param object $options {
	*   section_tipo  : string|null [= null]                — section tipo filter for
	*                   scoped DELETE; required when delete_table is false
	*   file_path     : string [= '']                       — absolute path to the .gz file
	*   matrix_table  : string                              — target PostgreSQL table name
	*   delete_table  : bool   [= false]                    — when true, delete all rows
	*                   before import instead of scoping by section_tipo
	*   columns       : array  [= matrix_db_manager::get_columns_name()] — ordered list
	*                   of column names for the \copy column list
	* }
	* @return object $response {
	*   result : bool   — true on full success, false on any validation or shell error
	*   msg    : string — human-readable status (includes elapsed time on success)
	*   errors : array  — error detail strings; populated on failure
	* }
	*/
	public static function import_from_copy_file( object $options ) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		// options validation
			$section_tipo	= $options->section_tipo ?? null;
			$file_path		= $options->file_path ?? '';
			$matrix_table	= $options->matrix_table ?? null;
			$delete_table	= $options->delete_table ?? false;
			$columns		= $options->columns ?? matrix_db_manager::get_columns_name();

		// validate required parameters
			if (empty($file_path)) {
				$response->msg = 'Error. file_path is required';
				$response->errors[] = 'Missing file_path parameter';
				return $response;
			}

			if (empty($matrix_table)) {
				$response->msg = 'Error. matrix_table is required';
				$response->errors[] = 'Missing matrix_table parameter';
				return $response;
			}

			if ($delete_table === false && empty($section_tipo)) {
				$response->msg = 'Error. section_tipo is required when delete_table is false';
				$response->errors[] = 'Missing section_tipo parameter';
				return $response;
			}

		// validate file path and matrix table name for security
			if (!preg_match('/^[a-zA-Z0-9_\/\.\-]+$/', $file_path)) {
				$response->msg = 'Error. Invalid file_path format';
				$response->errors[] = 'Invalid file_path contains unsafe characters';
				return $response;
			}

			if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $matrix_table)) {
				$response->msg = 'Error. Invalid matrix_table name';
				$response->errors[] = 'Invalid matrix_table name format';
				return $response;
			}

		// validate columns array
			foreach ($columns as $column) {
				if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $column)) {
					$response->msg = 'Error. Invalid column name: ' . $column;
					$response->errors[] = 'Invalid column name format';
					return $response;
				}
			}

		// check if file exists
			if (!file_exists($file_path)) {
				$response->msg = 'Error. The required file does not exist: '.$file_path;
				$response->errors[] = 'File does not exist';
				return $response;
			}

		// determine uncompressed file path
		// pathinfo()['filename'] strips the last extension only, so for
		// 'es1.copy.gz' it yields 'es1.copy' — the expected uncompressed name.
			$path_info = pathinfo($file_path);
			if (strtolower($path_info['extension']) !== 'gz') {
				$response->msg = 'Error. File must have .gz extension';
				$response->errors[] = 'Invalid file extension';
				return $response;
			}
			$uncompressed_file = $path_info['dirname'] . '/' . $path_info['filename'];

		// decompress file using gunzip
		// --keep  : preserve the original .gz so it can be re-imported without
		//           re-uploading; --force overwrites an existing uncompressed file
		//           from a previous failed run.
			$file_path_escaped = escapeshellarg($file_path);
			$command = 'gunzip --keep --force -v ' . $file_path_escaped;
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);

			$command_output = [];
			$command_return_code = 0;
			exec($command, $command_output, $command_return_code);

			if ($command_return_code !== 0) {
				$response->msg = 'Error. Failed to decompress file';
				$response->errors[] = 'Gunzip command failed with code: ' . $command_return_code;
				$response->errors[] = 'Output: ' . implode('\n', $command_output);
				return $response;
			}

			debug_log(__METHOD__." Gunzip response: ".json_encode($command_output), logger::DEBUG);

		// verify uncompressed file exists
			if (!file_exists($uncompressed_file) || filesize($uncompressed_file) == 0) {
				$response->msg = 'Error. Uncompressed file was not created or is empty';
				$response->errors[] = 'Uncompressed file missing or empty after gunzip';
				return $response;
			}

		// command base. A PostgreSQL connection. used by all DDBB connections.
		// Resolve psql robustly (configured DB_BIN_PATH → platform base → PATH) so the COPY import
		// works on non-standard layouts (e.g. a Homebrew Mac) without hand-editing config.
			$command_base = system::get_pg_bin_path().'psql -d ' . escapeshellarg(DEDALO_DATABASE_CONN) .' '. DBi::get_connection_string();

		// delete previous records with proper escaping
			$delete_query = 'DELETE FROM "' . $matrix_table . '"';
			if ($delete_table !== true) {
				// escape section_tipo for SQL
				$section_tipo_escaped = str_replace("'", "''", $section_tipo);
				$delete_query .= " WHERE section_tipo = '" . $section_tipo_escaped . "'";
			}

			$command = $command_base . ' --echo-errors -c ' . escapeshellarg($delete_query);
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);

			$command_output = [];
			$command_return_code = 0;
			DBi::pg_exec($command, $command_output, $command_return_code);

			if ($command_return_code !== 0) {
				$response->msg = 'Error. Failed to delete previous records';
				$response->errors[] = 'Delete command failed with code: ' . $command_return_code;
				$response->errors[] = 'Output: ' . implode('\n', $command_output);
				// cleanup uncompressed file before returning
				if (file_exists($uncompressed_file)) {
					unlink($uncompressed_file);
				}
				return $response;
			}

			debug_log(__METHOD__." Delete response: ".json_encode($command_output), logger::DEBUG);

		// copy data from file with proper escaping
		// '\copy' (client-side) is used instead of server-side COPY so that the
		// file path is resolved relative to the psql client's working directory
		// rather than the PostgreSQL server's filesystem; this works correctly
		// even when the server runs as a different OS user with no access to
		// DEDALO_BACKUP_PATH.
			$columns_list = implode(',', array_map(function($col) { return '"' . $col . '"'; }, $columns));
			$copy_query = '\copy "' . $matrix_table . '" (' . $columns_list . ') from ' . escapeshellarg($uncompressed_file);

			$command = $command_base . ' --echo-errors -c ' . escapeshellarg($copy_query);
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);

			$command_output = [];
			$command_return_code = 0;
			DBi::pg_exec($command, $command_output, $command_return_code);

			if ($command_return_code !== 0) {
				$response->msg = 'Error. Failed to copy data from file';
				$response->errors[] = 'Copy command failed with code: ' . $command_return_code;
				$response->errors[] = 'Output: ' . implode('\n', $command_output);
				// cleanup uncompressed file before returning
				if (file_exists($uncompressed_file)) {
					unlink($uncompressed_file);
				}
				return $response;
			}

			debug_log(__METHOD__." Copy response: ".json_encode($command_output), logger::DEBUG);

		// update sequence value
		// After a COPY the PostgreSQL serial sequence is not automatically advanced.
		// We set it to MAX(id)+1 so subsequent INSERTs do not collide with the
		// imported rows.  Failure here is non-fatal (the data is already loaded)
		// but is logged at WARNING level for visibility.
			$sequence_query = 'SELECT setval(\'' . $matrix_table . '_id_seq\', (SELECT MAX(id) FROM "' . $matrix_table . '")+1)';
			$command = $command_base . ' --echo-errors -c ' . escapeshellarg($sequence_query);
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);

			$command_output = [];
			$command_return_code = 0;
			DBi::pg_exec($command, $command_output, $command_return_code);

			if ($command_return_code !== 0) {
				$response->msg = 'Error. Failed to update sequence value';
				$response->errors[] = 'Sequence update failed with code: ' . $command_return_code;
				$response->errors[] = 'Output: ' . implode('\n', $command_output);
				// Note: This is not critical, so we continue but log the warning
				debug_log(__METHOD__." Warning: Sequence update failed but continuing", logger::WARNING);
			}

			debug_log(__METHOD__." Sequence update response: ".json_encode($command_output), logger::DEBUG);

		// cleanup: delete uncompressed file
			if (file_exists($uncompressed_file)) {
				$unlink_result = unlink($uncompressed_file);
				if (!$unlink_result) {
					debug_log(__METHOD__." Warning: Failed to delete uncompressed file: " . $uncompressed_file, logger::WARNING);
					// Not critical, but log the warning
				}
			}

		// success response
			$response->result	= true;
			$response->msg		= 'OK. Request done successfully [import_from_copy_file] ' . basename($file_path);
			$response->msg	   .= ' | '. exec_time_unit($start_time,'ms').' ms';

		return $response;
	}//end import_from_copy_file



}//end class backup
