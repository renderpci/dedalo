#!/usr/bin/env php
<?php
/**
* DB_ANALYZE_PROCESS
* Background process to execute PostgreSQL ANALYZE command
* and store execution timestamp in cache
*
* This file is executed as a standalone PHP process in background
* Called from login::init_user_login_sequence() via dd_cache::process_and_cache_to_file()
*
* @package Dedalo
* @subpackage db
*/

// server_vars from command line argument
	$server_vars = !empty($argv[1])
		? json_decode($argv[1])
		: null;

	if (empty($server_vars)) {
		error_log("Error: server_vars is required");
		exit(1);
	}

// set server vars
	$_SERVER['HTTP_HOST']	= $server_vars->server->HTTP_HOST ?? 'localhost';
	$_SERVER['REQUEST_URI']	= $server_vars->server->REQUEST_URI ?? '';
	$_SERVER['SERVER_NAME']	= $server_vars->server->SERVER_NAME ?? 'development';

// session_id
	$session_id = $server_vars->session_id ?? null;
	if (!empty($session_id)) {
		session_id($session_id);
	}

// unlock session. Only for read
	define('PREVENT_SESSION_LOCK', true);

// config. Starts a new session with forced id from command arguments
	include dirname(__FILE__, 3) . '/config/config.php';

// execute ANALYZE
	try {

		debug_log(__METHOD__
			." Executing DB ANALYZE..."
			, logger::WARNING
		);

		$analyze_response = db_tasks::analyze_db();

		// prepare cache data with timestamp
		// Note: only store serializable data (no PgSql\Result object)
		$cache_data = (object)[
			'timestamp'		=> time(),
			'date'			=> date('Y-m-d H:i:s'),
			'success'		=> $analyze_response->result !== false,
			'msg'			=> $analyze_response->msg,
			'errors'		=> $analyze_response->errors ?? []
		];

		// cache file name
		$cache_file_name = db_tasks::get_analyze_cache_file_name();

		// save to cache
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
