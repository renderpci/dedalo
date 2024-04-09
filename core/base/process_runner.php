#!/usr/bin/env php
<?php
/**
* process_runner.php
* This file calculates process in background.
*
*/
// time
	$start_time = hrtime(true);

// data
	$data = json_decode($argv[1], true);

// server environment. Restore from command arguments
	$_SERVER = $data['server'];

// user_id
	$user_id = (int)$data['user_id'];

// session_id. Is used mainly to verify that user is logged or not.
	// get current session id and force new session name as equal
	$session_id = $data['session_id'] ?? null;
	if (!empty($session_id)) {
		session_id($session_id);
	}

// config. Starts a new session with forced id from command arguments
	include (dirname(dirname(dirname(__FILE__)))) .'/config/config.php';

// unlock session. Only use for read
	session_write_close();

// only logged users can access SSE events
	if(login::is_logged()!==true) {
		die('Authentication error: please login');
	}

// safe_data. data check
	$safe_data = [];
	foreach ($data as $key => $value) {
		$safe_value = safe_xss($value);
		if ($safe_value!==$value) {
			die("Invalid value [$key]: ". to_string($value));
		}
		$safe_data[$key] = $safe_value;
	}

// output manager
	// class_name
	$output_class_name		= $safe_data['class_name'];
	// method_name
	$output_method_name		= $safe_data['method_name'];
	// params
	$output_params			= $safe_data['params'] ?? new stdClass();

	// include class file
	if (isset($safe_data['file'])) {
		$allow_url_include = ini_get('allow_url_include');
		if ($allow_url_include==='On' || $allow_url_include==true) {
			die('Invalid server config. Remote files are not allowed');
		}
		// file_exists get false for remote files. It is used here for security reasons too
		if (!file_exists($safe_data['file'])) {
			debug_log(__METHOD__
				. " Request file for include is not valid " . PHP_EOL
				. ' file: ' . to_string($safe_data['file'])
				, logger::ERROR
			);
			die('Invalid file');
		}
		include_once($safe_data['file']);
	}

	// check callable
	// if (!is_callable($output_class_name::$output_method_name)) {
	// 	debug_log(__METHOD__." Error. Method it's not callable ".to_string($output_class_name .':'.$output_method_name), logger::ERROR);
	// 	return null;
	// }

	// exec output
	$output_params	= (object)json_decode( json_encode($output_params) );
	$output_result	= $output_class_name::$output_method_name($output_params);


// log write notification
	debug_log(__METHOD__
		.' Process runner job is done ('.$output_class_name.'::'.$output_method_name.') in time: '.exec_time_unit($start_time,'ms').' ms'
		, logger::WARNING
	);

// write result to file as text
	echo json_encode($output_result, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
