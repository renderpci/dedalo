#!/usr/bin/env php
<?php
/**
* process_runner.php
* This file calculates process in background.
*
*/

// data
	$data = json_decode($argv[1], true);

// server environment. Restore from command arguments
	$_SERVER = $data['server'];

// user_id
	$user_id = $data['user_id'];

// session_id. Is used mainly to verify that user is logged or not.
	// get current session id and force new session name as equal
	$session_id = $data['session_id'] ?? null;
	if (!empty($session_id)) {
		session_id($session_id);
	}

// unlock session. Only for read
	define('PREVENT_SESSION_LOCK', true);

// config. Starts a new session with forced id from command arguments
	include (dirname(dirname(dirname(__FILE__)))) .'/config/config.php';

// actions to run
	if (!is_callable($class_name::$method_name)) {
		debug_log(__METHOD__." Error. Method it's not callable ".to_string(), logger::ERROR);
		return null;
	}
	$params = $data['params'] ?? null;
	$result = isset($data['params'])
		? $class_name::$method_name($data['params'])
		: $class_name::$method_name();

// write result to file as text
	echo json_encode($result);
