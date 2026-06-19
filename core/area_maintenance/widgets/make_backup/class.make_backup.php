<?php declare(strict_types=1);
/**
* MAKE_BACKUP
* Maintenance-area widget that exposes database backup actions and file listings
* to the browser UI.
*
* This class acts as a thin, security-gated adapter between the maintenance API
* and the lower-level `backup` utility class (core/backup/class.backup.php).
* It does NOT implement backup logic itself; every heavy operation (pg_dump,
* MariaDB dump via the Bun diffusion engine, directory scans) is delegated to
* `backup::*` static methods.
*
* Responsibilities:
* - Providing the initial widget state (`get_value`) consumed by the JS view when
*   the maintenance area first renders the widget.
* - Triggering a forced PostgreSQL dump on user request (`make_psql_backup`).
* - Triggering MariaDB/MySQL dumps for every configured publication endpoint
*   (`make_mysql_backup`).
* - Returning paginated lists of existing backup files for both database engines
*   (`get_dedalo_backup_files`).
*
* Security model (SEC-044):
*   `dd_area_maintenance_api::widget_request` enforces that the called method name
*   appears in the widget class's `API_ACTIONS` constant before dispatching. Methods
*   not listed there are rejected at the API layer.  `get_value` is invoked through
*   the separate `get_widget_value` path (hard-coded in the API) and therefore does
*   not need to appear in `API_ACTIONS`.
*
* Related classes:
* - backup (core/backup/class.backup.php) — all actual dump and file-scan logic.
* - dd_area_maintenance_api (core/api/v1/common/class.dd_area_maintenance_api.php)
*   — API router; calls `widget_request` and `get_widget_value`.
* - diffusion_api_client — used indirectly by `backup::make_mysql_backup` to
*   delegate to the Bun diffusion engine (PHP never connects to MariaDB directly).
*
* @package Dédalo
* @subpackage Core
*/
class make_backup {



	/**
	* API_ACTIONS
	* Allowlist of method names that `dd_area_maintenance_api::widget_request` is
	* permitted to dispatch on this widget class (SEC-044 gate).
	*
	* `get_value` is intentionally absent: it is invoked through the separate
	* `get_widget_value` API action, which has its own hard-coded dispatch path and
	* does not go through `widget_request`.
	*
	* @var array<int,string>
	*/
	public const API_ACTIONS = [
		'make_psql_backup',
		'make_mysql_backup',
		'get_dedalo_backup_files'
	];



	/**
	* GET_VALUE
	* Returns the initial widget state consumed by the JS view on first render.
	*
	* Called by `dd_area_maintenance_api::get_widget_value` (not through the normal
	* `widget_request` / `API_ACTIONS` path).  The returned `result` object carries
	* configuration values and a pre-composed suggested filename so the browser UI
	* can display them immediately without a second round-trip.
	*
	* Data shape of `$response->result`:
	* - `dedalo_db_management` — value of the DEDALO_DB_MANAGEMENT constant; when
	*   false the UI should indicate that local backup management is disabled.
	* - `backup_path`          — filesystem path where dump files are stored
	*   (DEDALO_BACKUP_PATH_DB).
	* - `file_name`            — a suggested filename for a forced dump, composed of
	*   the current timestamp (second-level resolution), connection name, DB type,
	*   current user ID, "forced" marker, and the running data version.  The "forced"
	*   label distinguishes this from hourly-throttled automatic dumps.
	* - `mysql_db`             — raw value of API_WEB_USER_CODE_MULTIPLE (an array of
	*   publication-endpoint descriptors defined in config.php, each potentially
	*   carrying a `db_name` key), or null when the constant is not defined.
	*
	* @return object $response {
	*   result : object — widget state (see above)
	*   msg    : string — 'OK. Request done successfully' or a warning summary
	*   errors : array  — populated on failure (always empty on the happy path here)
	* }
	*/
	public static function get_value() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];


		// short vars
		$mysql_db = defined('API_WEB_USER_CODE_MULTIPLE') ? API_WEB_USER_CODE_MULTIPLE : null;

		// result (value)
		$result	= (object)[
			'dedalo_db_management'	=> DEDALO_DB_MANAGEMENT,
			'backup_path'			=> DEDALO_BACKUP_PATH_DB,
			'file_name'				=> date("Y-m-d_His") .'.'. DEDALO_DATABASE_CONN .'.'. DEDALO_DB_TYPE .'_'. logged_user_id() .'_forced_dbv' . implode('-', get_current_data_version()).'.custom.backup',
			'mysql_db'				=> $mysql_db, // raw API_WEB_USER_CODE_MULTIPLE config array
		];

		// response
		$response->result	= $result;
		$response->msg		= empty($response->errors)
			? 'OK. Request done successfully'
			: 'Warning. Request done with errors';


		return $response;
	}//end get_value



    /**
	* MAKE_PSQL_BACKUP
	* Triggers an immediate, forced PostgreSQL dump of the Dédalo database.
	*
	* Delegates entirely to `backup::init_backup_sequence`, passing `skip_backup_time_range=true`
	* so that the normal hourly-throttle guard is bypassed.  This reflects the user
	* having clicked "Backup now" in the maintenance UI rather than an automatic
	* scheduled run.
	*
	* The dump itself is spawned as a non-blocking nohup background process by the
	* `backup` class; this method returns immediately with the PID and process-file
	* path (when available) so the UI can poll for completion.
	*
	* When DEDALO_DB_MANAGEMENT is false the `backup` class short-circuits without
	* spawning anything and returns result=true; this widget layer does not need to
	* repeat that check.
	*
	* @return object $response — forwarded verbatim from `backup::init_backup_sequence`:
	*   result : bool        — true on success or managed skip, false on error
	*   msg    : string      — human-readable status
	*   errors : array       — populated on failure
	*   pid    : int|null    — PID of the spawned pg_dump process (on success)
	*   pfile  : string|null — path to the process stdout/stderr capture file
	*/
	public static function make_psql_backup() : object {

		$user_id				= logged_user_id();
		$username				= logged_user_username();
		$skip_backup_time_range	= true;

		$response = backup::init_backup_sequence((object)[
			'user_id'					=> $user_id,
			'username'					=> $username,
			'skip_backup_time_range'	=> $skip_backup_time_range
		]);


		return $response;
	}//end make_psql_backup



    /**
	* MAKE_MYSQL_BACKUP
	* Triggers a dump of every configured MariaDB/MySQL publication database.
	*
	* Delegates entirely to `backup::make_mysql_backup`, which iterates the
	* API_WEB_USER_CODE_MULTIPLE config array, extracts each `db_name`, and asks
	* the Bun diffusion engine to run the actual mysqldump via
	* `diffusion_api_client::call('backup_database')`.  PHP itself never opens a
	* direct MariaDB connection (see "MariaDB is Bun's responsibility" memory note).
	*
	* `$response->result` is an array of per-database backup outcome objects; an
	* empty result array means no publication databases are configured.
	*
	* @return object $response — forwarded verbatim from `backup::make_mysql_backup`:
	*   result : array  — one entry per database attempted; each entry mirrors the
	*                     response returned by the Bun backup_database action
	*   msg    : string — summary listing the databases that were processed
	*/
	public static function make_mysql_backup() : object {

		$response = backup::make_mysql_backup();


		return $response;
	}//end make_mysql_backup



    /**
	* GET_DEDALO_BACKUP_FILES
	* Returns lists of existing backup files for PostgreSQL and/or MariaDB,
	* capped to a caller-specified maximum so the maintenance UI is not overwhelmed
	* when many dumps are stored on disk.
	*
	* The returned lists are sliced (newest first) from whatever `backup::get_backup_files`
	* and `backup::get_mysql_backup_files` return — both methods sort by filename in
	* descending order, which works because filenames begin with a Y-m-d_His timestamp.
	*
	* Options contract:
	* - `max_files`         — hard cap on the number of entries returned per list
	*   (default 10).  Pass a larger value if the UI needs to show a full history.
	* - `psql_backup_files` — when true (default), populate `result->psql_backup_files`
	*   with PostgreSQL .custom.backup file metadata.
	* - `mysql_backup_files`— when true (default), populate `result->mysql_backup_files`
	*   with MariaDB .sql file metadata.
	*
	* Data shape of each file entry (from the `backup` class):
	*   { name: string, size: string }  — filename and human-readable byte size.
	*
	* @param object $options {
	* 	max_files: int 10
	* 	psql_backup_files: bool true
	* 	mysql_backup_files: bool true
	* }
	* @return object $response {
	*   result : object {
	*     psql_backup_files  : array<int,object>|undefined — PostgreSQL backup entries
	*     mysql_backup_files : array<int,object>|undefined — MariaDB backup entries
	*   }
	*   msg : string — always 'OK. Request done'
	* }
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
					$files = backup::get_backup_files(); // PostgreSQL files
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



}//end make_backup
