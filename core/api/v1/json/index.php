<?php declare(strict_types=1);
/**
* Dédalo API Entry Point
*/
$global_start_time = hrtime(true);



// Turn off PHP output compression
	// ini_set('zlib.output_compression', false);



// header print as JSON data
	header('Content-Type: application/json; charset=utf-8');



// PUBLIC API HEADERS (!) TEMPORAL 16-11-2022
	// Allow CORS
	header('Access-Control-Allow-Origin: *');
	// header("Access-Control-Allow-Credentials: true");
	// header("Access-Control-Allow-Methods: GET,POST"); // GET,HEAD,OPTIONS,POST,PUT
	$allow_headers = [
		// 'Access-Control-Allow-Headers',
		// 'Origin,Accept',
		// 'X-Requested-With',
		'Content-Type',
		// 'Access-Control-Request-Method',
		// 'Access-Control-Request-Headers'
		'Content-Range'
	];
	header('Access-Control-Allow-Headers: '. implode(', ', $allow_headers));



// CORS preflight OPTIONS requests area ignored
	if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD']==='OPTIONS') {
		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Ignored preflight call ' . $_SERVER['REQUEST_METHOD'];
		error_log('Error: '.$response->msg);
		echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		exit( 0 );
	}



// php version check
	$minimum_version = '8.3.0';
	if (version_compare(phpversion(), $minimum_version, '<')) { // Check for PHP 8.3.0 or higher
		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed. This PHP version is not supported ('.phpversion().'). You need: >='.$minimum_version;
		error_log('Error: '.$response->msg);
		echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		exit( 0 );
	}



// file includes
	// config dedalo
	define('APP_ROOT', dirname(__DIR__, 4)); // Go up 4 directories from this file to the root
	if (!include APP_ROOT . '/config/config.php') {
		throw new Exception('Config file not found');
	}



// php://input get post vars. file_get_contents returns a JSON encoded string
	$str_json = file_get_contents('php://input');
	if (!empty($str_json)) {
		$rqo = json_decode( $str_json );
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
		}
		foreach($_POST as $key => $value) {
				$rqo->options->{$key} = safe_xss($value);
		}
		foreach($_GET as $key => $value) {
				$rqo->options->{$key} = safe_xss($value);
		}
		foreach($_FILES as $key => $value) {
				$rqo->options->{$key} = $value;
		}

	}elseif (!empty($_REQUEST)) {

		// GET/POST case
		if (isset($_GET['time'])) {
			// Ignore time get (used only for cache purposes @see data_manager.request JS.)
			// Prevents potential proxy problems.
		}else if (isset($_REQUEST['rqo'])) {
			$rqo = json_handler::decode($_REQUEST['rqo']);
		}else{
			$rqo = (object)[
				'source' => (object)[]
			];
			foreach($_REQUEST as $key => $value) {
				if (in_array($key, request_query_object::$direct_keys)) {
					$rqo->{$key} = safe_xss($value);
				}else{
					$rqo->source->{$key} = safe_xss($value);
				}
			}
		}
	}



// rqo check. Some cases like preflight, do not generates a rqo
	if (empty($rqo)) {
		error_log('API JSON index. ! Ignored empty rqo');
		debug_log(__METHOD__
			." Warning on API : Empty rqo (Some cases like preflight, do not generates a rqo) " . PHP_EOL
			.' $_REQUEST: '. to_string($_REQUEST)
			, logger::WARNING
		);
		exit( 0 );
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
	if ($recovery_mode===true) {
		// verify is not a malicious request
		if (defined('DEDALO_RECOVERY_MODE') && DEDALO_RECOVERY_MODE===true) {
			// change config environmental var value after verify
			// that Dédalo is really in recovery mode (set in config_core)
			// Note that this action changes the default Ontology table used: jer_dd -> jer_dd_recovery
			$_ENV['DEDALO_RECOVERY_MODE'] = true;
		}
	}



// prevent_lock from session
	$session_closed = false;
	if (isset($rqo->prevent_lock) && $rqo->prevent_lock===true) {
		// close current session and set as only read
		session_write_close();
		$session_closed = true;
	}



// dd_dd_manager
	try {

		$dd_manager	= new dd_manager();
		$response	= $dd_manager->manage_request( $rqo );

		// close current session and set as read only
			if ($session_closed===false) {
				session_write_close();
			}

		// debug
			if(SHOW_DEBUG===true) {
				// server_errors. bool true on debug_log write log with LOGGER_LEVEL as 'ERROR' or 'CRITICAL'
				$response->dedalo_last_error = $_ENV['DEDALO_LAST_ERROR'] ?? null;

				// real_execution_time add
				$response->debug						= $response->debug ?? new stdClass();
				$response->debug->real_execution_time	= exec_time_unit($global_start_time,'ms').' ms';

			}else{

				$response->dedalo_last_error = isset($_ENV['DEDALO_LAST_ERROR'])
					? 'Server errors occurred. Check the server log for details'
					: null;
			}

	} catch (Throwable $e) {

		// Final fallback error handling

		debug_log(__METHOD__
			. ' API end point caught exception ' . PHP_EOL
			. ' msg: ' . $e->getMessage()  . PHP_EOL
			. ' trace: ' . json_encode($e->getTrace(), JSON_PRETTY_PRINT)
			, logger::ERROR
		);

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= (SHOW_DEBUG===true)
				? 'Throwable Exception when calling Dédalo API: '.PHP_EOL.'  '. $e->getMessage()
				: 'Throwable Exception when calling Dédalo API. Contact with your admin';
			$response->errors	= ['An unexpected error occurred'];
			if (SHOW_DEBUG===true) {
				$response->debug = (object)[
					'exception' => $e->getMessage(),
					'rqo' => $rqo
				];
			}
	}



// output_string_and_close_connection
	// function output_string_and_close_connection($string_to_output) {
	// 	// set_time_limit(0);
	// 	ignore_user_abort(true);
	// 	// buffer all upcoming output - make sure we care about compression:
	// 	if(!ob_start("ob_gzhandler"))
	// 	    ob_start();
	// 	echo $string_to_output;
	// 	// get the size of the output
	// 	$size = ob_get_length();
	// 	// send headers to tell the browser to close the connection
	// 	header("Content-Length: $size");
	// 	header('Connection: close');
	// 	// flush all output
	// 	ob_end_flush();
	// 	// ob_flush();
	// 	flush();
	// 	// close current session
	// 	// if (session_id()) session_write_close();
	// }



// debug (browser Server-Timing)
	// header('Server-Timing: miss, db;dur=53, app;dur=47.2');
	// $current = (hrtime(true) - $global_start_time) / 1000000;
	// header('Server-Timing: API;dur='.$current);
	// header X-Processing-Time
	if (DEVELOPMENT_SERVER) {
		header('X-Processing-Time: ' . (microtime(true) - $_SERVER['REQUEST_TIME_FLOAT']));
	}



// output the response JSON string
	$output_string = isset($rqo->pretty_print)
		? json_handler::encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT)
		: json_handler::encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	echo $output_string;
