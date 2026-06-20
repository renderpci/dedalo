#!/usr/bin/env php
<?php
/**
* DB_ANALYZE_PROCESS
* Standalone CLI background worker that runs VACUUM ANALYZE on the full PostgreSQL
* database and records the last-run timestamp in a dd_cache file.
*
* Invocation
* ----------
* This script is never called directly by a web request. It is launched by
* dd_cache::process_and_cache_to_file() with wait=false, which means it runs as a
* detached background process while the original HTTP request continues. The typical
* call site is login::init_user_login_sequence(), which fires it once per login when
* db_tasks::should_run_analyze() returns true (i.e. more than 24 hours have elapsed
* since the last successful run).
*
* Launch contract (from dd_cache::process_and_cache_to_file)
* ----------------------------------------------------------
* $argv[1]  JSON-encoded object built by the launcher. Expected shape:
*   {
*     "server": {
*       "HTTP_HOST":   string,
*       "REQUEST_URI": string,
*       "SERVER_NAME": string
*     },
*     "session_id": string,   // the caller's PHP session ID (may be absent)
*     "user_id":    int|null  // the logged-in user ID (informational only)
*   }
*
* Bootstrap sequence
* ------------------
* 1. Decode $argv[1] and re-populate the minimal $_SERVER keys that config.php
*    relies on (HTTP_HOST, REQUEST_URI, SERVER_NAME).
* 2. Re-use the caller's session ID via session_id() so that the bootstrap can read
*    user-scoped session data if needed (e.g. language, entity).
* 3. Define PREVENT_SESSION_LOCK = true before including config.php so that the
*    session is opened in read-only mode — this worker must never block the calling
*    browser tab by holding a write lock on the session file.
* 4. Include config.php to initialise Dédalo's autoloader, constants, and DB layer.
*
* Execution flow
* --------------
* 1. Call db_tasks::analyze_db(), which issues "VACUUM ANALYZE;" against PostgreSQL.
* 2. Build a serialisable result object (no PgSql\Result handles — those cannot be
*    written to a PHP cache file).
* 3. Persist the result via dd_cache::cache_to_file() using an empty prefix so the
*    file is shared across users (not user-scoped). The file name is provided by
*    db_tasks::get_analyze_cache_file_name() and is the same name that
*    db_tasks::should_run_analyze() reads on the next login check.
* 4. Exit 0 on success, exit 1 on caught exception.
*
* Cache file shape (written by dd_cache::cache_to_file)
* ------------------------------------------------------
* The $cache_data object stored in the cache file contains:
*   timestamp  int     Unix timestamp of this run (used by should_run_analyze)
*   date       string  Human-readable datetime "Y-m-d H:i:s"
*   success    bool    true when db_tasks::analyze_db() did not return false
*   msg        string  Status message from db_tasks::analyze_db()
*   errors     array   Any error strings collected during the run
*
* @package Dedalo
* @subpackage db
*/

// server_vars from command line argument
// dd_cache::process_and_cache_to_file() passes the caller's environment as a
// JSON-encoded object in $argv[1]. Without it there is no way to bootstrap config.php
// correctly (it needs HTTP_HOST to resolve the installation entity).
	$server_vars = !empty($argv[1])
		? json_decode($argv[1])
		: null;

	if (empty($server_vars)) {
		error_log("Error: server_vars is required");
		exit(1);
	}

// set server vars
// config.php inspects $_SERVER to determine the running entity and database connection
// parameters. Populate the minimum required keys from the values the caller recorded
// at the time it spawned this process.
	$_SERVER['HTTP_HOST']	= $server_vars->server->HTTP_HOST ?? 'localhost';
	$_SERVER['REQUEST_URI']	= $server_vars->server->REQUEST_URI ?? '';
	$_SERVER['SERVER_NAME']	= $server_vars->server->SERVER_NAME ?? 'development';

// session_id
// Re-attach to the caller's PHP session so that any session-dependent initialisation
// in config.php (e.g. resolving the active language or entity) works correctly.
// session_id() must be called before session_start(), which config.php triggers.
	$session_id = $server_vars->session_id ?? null;
	if (!empty($session_id)) {
		session_id($session_id);
	}

// unlock session. Only for read
// (!) This constant MUST be defined before config.php is included.
// When PREVENT_SESSION_LOCK is true, Dédalo opens the session with
// session_write_close() immediately after reading it, preventing an exclusive
// file lock that would otherwise block the browser tab that launched this process
// from completing its own response.
	define('PREVENT_SESSION_LOCK', true);

// config. Starts a new session with forced id from command arguments
// This single include bootstraps the entire Dédalo stack: autoloader, constants,
// database connection pool, logger, and all core classes including db_tasks and
// dd_cache which are used below.
	include dirname(__FILE__, 3) . '/config/bootstrap.php';

// execute ANALYZE
	try {

		debug_log(__METHOD__
			." Executing DB ANALYZE..."
			, logger::WARNING
		);

		$analyze_response = db_tasks::analyze_db();

		// prepare cache data with timestamp
		// Note: only store serializable data (no PgSql\Result object)
		// The PgSql\Result handle returned inside $analyze_response is already freed
		// by analyze_db(); we reconstruct a plain stdClass here so dd_cache can
		// var_export it into a PHP cache file without touching resource handles.
		$cache_data = (object)[
			'timestamp'		=> time(),
			'date'			=> date('Y-m-d H:i:s'),
			'success'		=> $analyze_response->result !== false,
			'msg'			=> $analyze_response->msg,
			'errors'		=> $analyze_response->errors ?? []
		];

		// cache file name
		// Use the same file name that db_tasks::should_run_analyze() reads on the
		// next login so the 24-hour throttle check finds the timestamp we write here.
		$cache_file_name = db_tasks::get_analyze_cache_file_name();

		// save to cache
		// prefix = '' makes this a global (not user-scoped) cache file.
		// The ANALYZE result is installation-wide, not per-user, so all users share
		// a single timestamp record under the entity name.
		$cache_result = dd_cache::cache_to_file((object)[
			'data'		=> $cache_data,
			'file_name'	=> $cache_file_name,
			'prefix'	=> ''
		]);

		if ($cache_result===true) {
			debug_log(__METHOD__
				." DB ANALYZE executed successfully in background"
				, logger::DEBUG
			);
		} else {
			debug_log(__METHOD__
				." Warning: DB ANALYZE executed but cache write failed"
				, logger::WARNING
			);
		}

	} catch (Exception $e) {
		debug_log(__METHOD__
			." Error executing DB ANALYZE: " . $e->getMessage()
			, logger::ERROR
		);
		exit(1);
	}

exit(0);
