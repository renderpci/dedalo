<?php declare(strict_types=1);
/**
 * Dédalo API Entry Point
 */
$global_start_time = hrtime(true);



// main header. Print all as JSON data
header('Content-Type: application/json; charset=utf-8');



// Performance monitoring initialization
// Load configuration and monitor class before any heavy processing
$perf_monitor = null;
if (file_exists(__DIR__ . '/performance/performance_config.php')) {
	include_once __DIR__ . '/performance/performance_config.php';
	include_once __DIR__ . '/performance/performance_monitor.php';
	$perf_monitor = performance_monitor::get_instance();
	$perf_monitor->start($global_start_time);
}
// Cache performance monitor active state to avoid repeated checks
$perf_active = isset($perf_monitor) && $perf_monitor->is_active();



// php version check
$minimum_version = '8.4.0';
if (version_compare(phpversion(), $minimum_version, '<')) { // Check for PHP x.x.x or higher
	$response = new stdClass();
	$response->result	= false;
	$response->msg		= 'Error. Request failed. This PHP version is not supported (' . phpversion() . '). You need: >=' . $minimum_version;
	error_log('Error: ' . $response->msg);
	echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	return;
}



// file includes config dedalo
if (!defined('APP_ROOT')) {
	define('APP_ROOT', dirname(__DIR__, 4)); // Go up 4 directories from this file to the root
}
if (!defined('DEDALO_ROOT_PATH')) {
	if (!include APP_ROOT . '/config/config.php') {
		throw new Exception('Config file not found');
	}
}



// Allow CORS setting from config.php
// SEC-012: Access-Control-Allow-Origin must be a single origin or '*' per spec.
// Only echo the request Origin when it matches DEDALO_CORS['allowed_origins'];
// never combine '*' with Allow-Credentials: true.
if (defined('DEDALO_CORS')) {
	$cors_allowed_origins = isset(DEDALO_CORS['allowed_origins']) ? (array)DEDALO_CORS['allowed_origins'] : [];
	$cors_request_origin  = $_SERVER['HTTP_ORIGIN'] ?? '';

	header('Access-Control-Allow-Methods: ' . implode(', ', (array)(DEDALO_CORS['allowed_methods'] ?? [])) );
	header('Access-Control-Allow-Headers: ' . implode(', ', (array)(DEDALO_CORS['allowed_headers'] ?? [])) );
	header('Access-Control-Max-Age: '       . (string)(DEDALO_CORS['max_age'] ?? 86400) );
	header('Vary: Origin');

	if ($cors_request_origin !== '' && in_array($cors_request_origin, $cors_allowed_origins, true)) {
		header('Access-Control-Allow-Origin: ' . $cors_request_origin);
		header('Access-Control-Allow-Credentials: true');
	}
}



// CORS preflight OPTIONS requests area ignored
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
	// API-06: a CORS preflight is a normal, expected request — not an error.
	// Respond without writing to the PHP error log on every OPTIONS request.
	$response = new stdClass();
	$response->result	= false;
	$response->msg		= 'Ignored preflight call ' . $_SERVER['REQUEST_METHOD'];
	echo json_handler::encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	return;
}



// php://input get post vars. file_get_contents returns a JSON encoded string
// When worker is active, the file_get_contents() is passed in $GLOBALS['DEDALO_RAW_BODY']
$str_json = $GLOBALS['DEDALO_RAW_BODY'] ?? file_get_contents('php://input');
if (!empty($str_json)) {
	$rqo = json_decode($str_json);
	// Error handling
	if ($rqo === null && json_last_error() !== JSON_ERROR_NONE) {
		$response = new stdClass();
		$response->result	= false;
		$response->msg		= 'Invalid JSON in request: ' . json_last_error_msg();
		error_log('Error: ' . $response->msg);
		echo json_handler::encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		return;
	}
}



// non php://input cases
// when the API is called by libs as ckeditor will be created a default upload rqo
// see: service_ckeditor simpleUpload.uploadUrl
if (!empty($_FILES)) {

	// files case. Received files case. Uploading from tool_upload or text editor images upload
	if (!isset($rqo)) {
		$rqo = new stdClass();
		$rqo->action	= 'upload';
		$rqo->dd_api	= 'dd_utils_api';
		$rqo->options	= new stdClass();
	} else if (!isset($rqo->options)) {
		$rqo->options = new stdClass();
	}
	foreach (array_merge($_POST, $_GET) as $key => $value) {
		$rqo->options->{$key} = safe_xss($value);
	}
	foreach ($_FILES as $key => $value) {
		$rqo->options->{$key} = $value;
	}
} elseif (!empty($_REQUEST)) {

	// GET/POST case
	if (isset($_GET['time'])) {
		// Ignore time get (used only for cache purposes @see data_manager.request JS.)
		// Prevents potential proxy problems.
	} else if (isset($_REQUEST['rqo'])) {
		$rqo = json_handler::decode($_REQUEST['rqo']);
		// SEC-010: bring this branch in line with the php://input and $_REQUEST fallbacks,
		// which already sanitize via safe_xss / safe_xss_recursive. Without this, payloads
		// passed through the legacy `rqo` form/query parameter reach dd_manager unsanitized.
		if (is_object($rqo) || is_array($rqo)) {
			$rqo = safe_xss_recursive($rqo);
		}
	} else {
		$rqo = (object)[
			'source' => (object)[]
		];
		foreach ($_REQUEST as $key => $value) {
			if (in_array($key, request_query_object::$direct_keys)) {
				$clean_value = safe_xss($value);
				$rqo->{$key} = is_array($clean_value) ? (object)$clean_value : $clean_value;
			} else {
				if (!isset($rqo->source)) {
					$rqo->source = new stdClass();
				}
				$rqo->source->{$key} = safe_xss($value);
			}
		}
	}
}



// rqo check. Some cases like preflight, do not generates a rqo
if (empty($rqo)) {
	error_log('API JSON index. ! Ignored empty rqo');
	debug_log(
		" Warning on API : Empty rqo (Some cases like preflight, do not generates a rqo) " . PHP_EOL
		. ' $_REQUEST: ' . to_string($_REQUEST),
		logger::WARNING
	);
	echo "{}";
	return;
}
// Default dd_api apply
$action = $rqo->action ?? null;
if (in_array($action, ['diffuse', 'validate', 'get_ontology_map'])) {
	$rqo->dd_api = 'dd_diffusion_api';
}
$rqo->dd_api = $rqo->dd_api ?? 'dd_core_api';



// SQO + ddo_map security scrub. The HTTP API is an untrusted rqo source: strip
// server-only SQO fields (sentence/params/column_sql/table aliases), force
// parsed=false, coerce limit/offset/total, and reduce client-sent show/search
// ddo_maps to the whitelisted display fields. Shared with the worker SSE entry
// point so the two entry points cannot drift.
// @see dd_manager::sanitize_client_rqo
if (isset($rqo)) {
	$rqo = dd_manager::sanitize_client_rqo($rqo);
}



// Performance checkpoint: request parsed
if ($perf_active) {
	$perf_monitor->checkpoint('request_parsed');
	$perf_monitor->set_request_data($rqo);
}



// debug test. Activate for debug only
// if (DEVELOPMENT_SERVER) {
// 	define('DEV_SERVER_DEFAULT_DELAY_MS', 12);
// 	define('DEV_SERVER_SAVE_DELAY_MS', 300);
// 	// Approximate real conditions by adding a small delay to the development servers,
// 	// such as the local host.
// 	usleep( DEV_SERVER_DEFAULT_DELAY_MS * 1000 ); // 12 ms
// 	// delay save
// 	if (isset($rqo->action) && $rqo->action==='save') {
// 		usleep( DEV_SERVER_SAVE_DELAY_MS * 1000 ); // 300 ms
// 	}
// }



// recovery mode (fixed in in config_core)
// rqo->recovery_mode is set automatically by data_manager.request_config from environment page_globals
// to preserve the recovery status across API calls
// @see dd_core_api->start
$recovery_mode = $rqo->recovery_mode ?? false;
if ($recovery_mode === true) {
	// verify is not a malicious request
	if (defined('DEDALO_RECOVERY_MODE') && DEDALO_RECOVERY_MODE === true) {
		// change config environmental var value after verify
		// that Dédalo is really in recovery mode (set in config_core)
		// Note that this action changes the default Ontology table used: dd_ontology -> dd_ontology_recovery
		$_ENV['DEDALO_RECOVERY_MODE'] = true;
	}
}



// SEC-008: mint the per-session CSRF token while the session is still open
// for writes. dd_manager will read $_SESSION['dedalo']['csrf_token'] on the
// rest of the request lifecycle (it stays populated in memory even after the
// session is closed below), so we only need to ensure the token is committed
// to storage before any session_write_close() call further down.
if (class_exists('dd_manager') && method_exists('dd_manager', 'bootstrap_csrf_token')) {
	dd_manager::bootstrap_csrf_token();
}

// prevent_lock from session
$session_closed = false;
if (isset($rqo->prevent_lock) && $rqo->prevent_lock === true) {
	// close current session and set as only read
	session_write_close();
	$session_closed = true;
}



// dd_dd_manager
try {

	// Performance checkpoint: before manager
	if ($perf_active) {
		$perf_monitor->checkpoint('before_dd_manager');
	}

	$dd_manager	= new dd_manager();
	$response	= $dd_manager->manage_request($rqo);

	// Generators are for SSE/streaming and should not reach the normal API entry point.
	// If one does, it means the request was not correctly detected as a stream.
	if ($response instanceof \Generator) {
		throw new Exception("Unexpected Generator response in non-streaming API call");
	}

	// Performance checkpoint: after manager
	if ($perf_active) {
		$perf_monitor->checkpoint('after_dd_manager');
		$perf_monitor->set_response_data($response);
	}

	// close current session and set as read only
	if ($session_closed === false) {
		session_write_close();
	}

	// debug
	if (SHOW_DEBUG === true) {
		// server_errors. bool true on debug_log write log with LOGGER_LEVEL as 'ERROR' or 'CRITICAL'
		$response->dedalo_last_error = $_ENV['DEDALO_LAST_ERROR'] ?? null;

		// real_execution_time add
		$total_time_api_exec					= exec_time_unit_auto($global_start_time);
		$response->debug						= $response->debug ?? new stdClass();
		$response->debug->real_execution_time	= $total_time_api_exec;

	} else {

		$response->dedalo_last_error = isset($_ENV['DEDALO_LAST_ERROR'])
			? 'Server errors occurred. Check the server log for details'
			: null;
	}
} catch (Throwable $e) {

	// Final fallback error handling
	dd_error::captureException($e);

	// SEC-016: always log full trace server-side; never expose `$e->getTrace()` (contains
	// argument arrays which may include passwords / tokens) nor the original `$rqo`
	// (login/save_password/etc. carry credentials in `source`). Even with SHOW_DEBUG, a
	// trace string + message is sufficient for developers and avoids leaking arguments.
	error_log('Dedalo API EXCEPTION: ' . $e->getMessage() . PHP_EOL . $e->getTraceAsString());

	$response = new stdClass();
	$response->result	= false;
	$response->msg		= (SHOW_DEBUG === true)
		? 'Throwable Exception when calling Dédalo API: ' . PHP_EOL . '  ' . $e->getMessage()
		: 'Throwable Exception when calling Dédalo API. Contact with your admin';
	$response->errors	= ['An unexpected error occurred'];
	if (SHOW_DEBUG === true) {
		$response->debug = (object)[
			'exception' => $e->getMessage(),
			'trace'		=> $e->getTraceAsString(),
			'file'		=> $e->getFile(),
			'line'		=> $e->getLine()
			// SEC-016: $rqo intentionally omitted; may contain credentials.
		];
	}

	// reset session. When a section read fails, the session is removed to unlock next request.
	$action = $rqo->action ?? null;
	if ($action === 'read') {
		// reset bad section session to allow next request
		$source			= $rqo->source ?? (object)[];
		$session_key	= $source->session_key ?? null;

		if (empty($session_key)) {
			$model	= $source->model ?? null;
			$tipo	= $source->tipo ?? null;
			if ($model === 'section' && is_string($tipo)) {
				$session_key = section::build_sqo_id($tipo);
			} else {
				$session_key = 'undefined';
			}
		}

		if(isset($_SESSION['dedalo']['config']['sqo'][$session_key])) {
			// remove session
			unset($_SESSION['dedalo']['config']['sqo'][$session_key]);
			// debug
			debug_log(
				' API end point removed section session ' . PHP_EOL
				. ' session_key: ' . $session_key . PHP_EOL,
				logger::WARNING
			);
		}
	}
}



// debug (browser Server-Timing)
// header('Server-Timing: miss, db;dur=53, app;dur=47.2');
// $current = (hrtime(true) - $global_start_time) / 1000000;
// header('Server-Timing: API;dur='.$current);
// header X-Processing-Time
if (DEVELOPMENT_SERVER) {
	header('X-Processing-Time: ' . (microtime(true) - $_SERVER['REQUEST_TIME_FLOAT']));
}



// Performance checkpoint: before output
if ($perf_active) {
	$perf_monitor->checkpoint('before_output');
}



// output the response JSON string
$options = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
if (isset($rqo->pretty_print)) {
	$options |= JSON_PRETTY_PRINT;
}
$streamed = true;

// Disable streaming in RR worker because native ob_start intercepts everything anyway.
// Native json_handler::encode provides massively lower CPU latency vs chunking in PHP.
if (defined('DEDALO_RR_WORKER')) {
	$streamed = false;
}

if($streamed) {
	// With the streaming response handler, we avoid building the entire JSON string in memory before outputting it,
	// adding memory stability benefits for large objects.
	json_streaming_handler::stream($response, $options);
} else {
	// Required allocating full string in memory.
	echo json_handler::encode($response, $options);
}



// Performance monitoring finalization
if ($perf_active) {
	$perf_monitor->checkpoint('after_output');
	$perf_monitor->finish();
}



// static profiler. On active, report on error log the static vars size (if total time is greater than 2 seconds)
if (SHOW_DEBUG && defined('SHOW_DEBUG_PROFILER') && SHOW_DEBUG_PROFILER) {
	$total_time = exec_time_unit($global_start_time, 'ms');
	if($total_time > 2000) {
		$report = static_profiler::get_report();
		error_log( json_encode($report, JSON_PRETTY_PRINT));
	}

	// log real execution time
	$id	= $rqo->id ?? $rqo->source->tipo ?? '';
	$color = $total_time > 50 ? ANSI_BOLD_RED : ANSI_BOLD_GREEN;
	$text = 'API REQUEST (after_output) ' . $rqo->action . ' (' . $id . ') END IN ' . $color . $total_time . ANSI_RESET . ' ms - ' . dd_memory_usage() .' ';
	$text_length = strlen($text) - 11; // subtract color codes length
	$nchars = 200;
	$line = 'API END POINT FINISHED 2: ' . PHP_EOL . $text .  str_repeat("⌲", (int)$nchars - (int)$text_length) . PHP_EOL;
	debug_log($line, logger::DEBUG);

	// Show response in debug log
	$show_response = false;
	if($show_response) {
		debug_log( json_encode($response, JSON_PRETTY_PRINT), logger::DEBUG);
	}
}
