#!/usr/bin/env php
<?php declare(strict_types=1);
/**
* PROCESS_RUNNER.PHP
* This file executes process in background.
* Is called from exec_::request_cli
* @see exec_::request_cli
*/

// time
	$start_time = hrtime(true);

// data
	$data = json_decode($argv[1], true);
	if (empty($data)) {
		die('Invalid data');
	}

// error_log_path.
// From now on, the execution CLI uses the same error log path as the PHP-FPM pool to get a unified error output.
	$error_log_path = $data['error_log_path'] ?? null;
	if ($error_log_path) {
		ini_set('error_log', $error_log_path);
	}

// server environment. Restore from command arguments (merge to avoid wiping useful values)
	if (!empty($data['server']) && is_array($data['server'])) {
		$_SERVER = array_merge($_SERVER, $data['server']);
	}

// user_id
	$user_id = (int)$data['user_id'];

// session_id. Is used mainly to verify that user is logged or not.
	// get current session id and force new session name as equal
	$session_id = $data['session_id'] ?? null;
	if (!empty($session_id)) {
		session_id($session_id);
	}

// config. Starts a new session with forced id from command arguments
	include dirname(__FILE__, 3).'/config/bootstrap.php';

// unlock session. Only use for read
	session_write_close();

// only logged users can access SSE events
	if (login::is_logged()!==true) {
		die('Authentication error: please login');
	}

// safe_data. data check (sanitize strings recursively, preserve arrays/objects)
	$safe_data = [];
	$sanitize = null;
	$sanitize = function ($value) use (&$sanitize) {
		if (is_string($value)) {
			return safe_xss($value);
		}
		if (is_array($value)) {
			$res = [];
			foreach ($value as $k => $v) {
				$res[$k] = $sanitize($v);
			}
			return $res;
		}
		if (is_object($value)) {
			$res = new stdClass();
			foreach ((array)$value as $k => $v) {
				$res->$k = $sanitize($v);
			}
			return $res;
		}
		return $value;
	};

	foreach ($data as $key => $value) {
		if ($key === 'params') {
			// Skip recursive sanitization of params — they are application data
			// (e.g. SQO filter values with '>' operators) not rendered as HTML.
			// htmlspecialchars() corrupts such operational values. The direct
			// (non-CLI) path also passes options unsanitized to tool methods.
			// Infrastructure keys (class_name, method_name, file) are still
			// sanitized below.
			$safe_data[$key] = $value;
			continue;
		}
		$safe_value = $sanitize($value);
		if (is_string($value) && $safe_value !== $value) {
			die("Invalid value [$key]: " . to_string($value));
		}
		$safe_data[$key] = $safe_value;
	}

// output manager
	// class_name
	$output_class_name		= $safe_data['class_name'] ?? null;
	// method_name
	$output_method_name		= $safe_data['method_name'] ?? null;
	// params
	$output_params			= $safe_data['params'] ?? new stdClass();

	if (empty($output_class_name) || !is_string($output_class_name)) {
		die('Invalid class_name');
	}
	if (empty($output_method_name) || !is_string($output_method_name)) {
		die('Invalid method_name');
	}

	// include class file (validate realpath and restrict to project tree)
	if (!empty($safe_data['file'])) {
		$allow_url_include = ini_get('allow_url_include');
		if ($allow_url_include === 'On' || $allow_url_include == true) {
			die('Invalid server config. Remote files are not allowed');
		}
		$requested = $safe_data['file'];
		$real_requested = realpath($requested);
		$base_dir = realpath(dirname(__FILE__, 3));
		if ($real_requested === false || strpos($real_requested, $base_dir) !== 0) {
			debug_log(__METHOD__
				. " Request file for include is not valid " . PHP_EOL
				. ' file: ' . to_string($requested)
				, logger::ERROR
			);
			die('Invalid file');
		}
		include_once $real_requested;
	}

	// check callable
	if (!class_exists($output_class_name)) {
		debug_log(__METHOD__ . " Error. Class not found: " . $output_class_name, logger::ERROR);
		die('Invalid class');
	}
	if (!is_callable([$output_class_name, $output_method_name])) {
		debug_log(__METHOD__ . " Error. Method is not callable: " . $output_class_name . ':' . $output_method_name, logger::ERROR);
		die('Invalid method');
	}

	// SEC: opt-in per-class allowlist (mirrors SEC-024 / dd_manager::API_ACTIONS).
	// When the dispatched class declares a BACKGROUND_RUNNABLE class constant
	// the method MUST appear in it; otherwise we fall back to the historical
	// "any public-static method on the class is callable" rule. The opt-in
	// form is strongly preferred for new classes because process_runner is a
	// second API surface that bypasses dd_manager's own allowlist.
	if (defined($output_class_name . '::BACKGROUND_RUNNABLE')) {
		$bg_runnable = constant($output_class_name . '::BACKGROUND_RUNNABLE');
		if (!is_array($bg_runnable) || !in_array($output_method_name, $bg_runnable, true)) {
			debug_log(__METHOD__
				. " Error. Method not in BACKGROUND_RUNNABLE allowlist: "
				. $output_class_name . '::' . $output_method_name
				, logger::ERROR
			);
			die('Method not allowed for background execution');
		}
	}

	// exec output
	$output_params	= (object)json_decode( json_encode($output_params) );
	try {
		$output_result	= $output_class_name::$output_method_name($output_params);
	} catch (permission_exception $e) {
		// SEC: the dispatched method tripped a security::assert_* gate.
		// Convert to a uniform response shape so the parent (SSE / poll) gets
		// valid JSON and not a fatal-error trace on its stdout pipe.
		debug_log(__METHOD__
			. ' permission_exception in CLI: ' . $e->getMessage() . PHP_EOL
			. ' context: ' . $e->api_context . PHP_EOL
			. ' user_id: ' . to_string(logged_user_id()) . PHP_EOL
			. ' class: ' . $output_class_name . '::' . $output_method_name
			, logger::ERROR
		);
		$output_result = (object)[
			'result' => false,
			'msg'    => 'Error. ' . $e->getMessage(),
			'errors' => ['permissions_denied'],
		];
	}


// log write notification
	debug_log(__METHOD__
		.' Process runner job is done ('.$output_class_name.'::'.$output_method_name.') in time: '.exec_time_unit($start_time,'ms').' ms'
		, logger::WARNING
	);

// write result to file as text
	echo json_encode($output_result, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
