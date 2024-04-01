<?php
$global_start_time = hrtime(true);

// Turn off output buffering
	ini_set('output_buffering', 'off');
// Turn off PHP output compression
	// ini_set('zlib.output_compression', false);
// Flush (send) the output buffer and turn off output buffering
	// ob_end_flush();
	// while (@ob_end_flush());

	// Implicitly flush the buffer(s)
	// ini_set('implicit_flush', true);
	// ob_implicit_flush(true);



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
			$response->msg		= 'Ignored call ' . $_SERVER['REQUEST_METHOD'];
		error_log('Error: '.$response->msg);
		echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		exit( 0 );
	}



// php version check
	$version = explode('.', phpversion());
	if ($version[0]<8 || ($version[0]==8 && $version[1]<1)) {
		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed. This PHP version is not supported ('.phpversion().'). You need: >=8.1';
		error_log('Error: '.$response->msg);
		// header print as JSON data
		header('Content-Type: application/json');
		echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		die();
	}



// file includes
	// config dedalo
	include dirname(dirname(dirname(dirname(dirname(__FILE__))))) .'/config/config.php';



// php://input get post vars. file_get_contents returns a string
	$str_json = file_get_contents('php://input');
	if (!empty($str_json)) {
		$rqo = json_decode( $str_json );
	}



// non php://input cases
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
		if (isset($_REQUEST['rqo'])) {
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
			." Error on API : Empty rqo (Some cases like preflight, do not generates a rqo) " . PHP_EOL
			.' $_REQUEST: '. to_string($_REQUEST)
			, logger::ERROR
		);
		exit( 0 );
	}



// prevent_lock from session
	$session_closed = false;
	if (isset($rqo->prevent_lock) && $rqo->prevent_lock===true) {
		// close current session and set as only read
		session_write_close();
		$session_closed = true;
	}



// dd_dd_manager
	// try {

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

	// } catch (Throwable $e) { // For PHP 7
		// 	$result = new stdClass();
		// 		$result->result	= false;
		// 		$result->msg	= (SHOW_DEBUG===true)
		// 			? 'Throwable Exception when calling Dédalo API: '.PHP_EOL.'  '. $e->getMessage()
		// 			: 'Throwable Exception when calling Dédalo API. Contact with your admin';
		// 		$result->debug	= (object)[
		// 			'rqo' => $rqo
		// 		];

		// 	trigger_error($e->getMessage());

		// } catch (Exception $e) { // For PHP 5

		// 	$result = new stdClass();
		// 		$result->result	= false;
		// 		$result->msg	= (SHOW_DEBUG===true)
		// 			? 'Exception when calling Dédalo API: '.PHP_EOL.'  '. $e->getMessage()
		// 			: 'Exception when calling Dédalo API. Contact with your admin';
		// 		$result->debug	= (object)[
		// 			'rqo' => $rqo
		// 		];
	// 	trigger_error($e->getMessage());
	// }



// debug (browser Server-Timing)
		// header('Server-Timing: miss, db;dur=53, app;dur=47.2');
		// $current = (hrtime(true) - $global_start_time) / 1000000;
		// header('Server-Timing: API;dur='.$current);



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



// SSE stream / JSON cases
	$is_stream = $rqo->is_stream ?? false;
	if ($is_stream===true) {

		// SSE case ----------------------------------

		// only logged users can access SSE events
			if(login::is_logged()!==true) {
				die('Authentication error: please login');
			}

		// header print as event stream
			header("Content-Type: text/event-stream");

		// mandatory vars
			$pfile	= $response->pfile ?? null;
			$pid	= $response->pid ?? null;
			if (empty($pfile) || empty($pid)) {
				$output = (object)[
					'pid'			=> $pid,
					'pfile'			=> $pfile,
					'is_running'	=> $is_running,
					'data'			=> null,
					'time'			=> date(DATE_ISO8601),
					'errors'		=> ['Error: pfile and pid are mandatory']
				];
				echo json_handler::encode($output, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL . PHP_EOL;
				die();
			}

		// process
			$process = new process();
				$process->setPid($pid);
				$process->setFile(process::get_process_path() .'/'. $pfile);

		// event loop
			// update rate (int milliseconds)
			$update_rate = $rqo->update_rate ?? 1000;
			while (1) {

				// process info updated on each loop
					$is_running	= $process->status(); // bool is running
					$data		= $process->read(); // string data

				// output JSON to client
					$output = (object)[
						'pid'			=> $pid,
						'pfile'			=> $pfile,
						'is_running'	=> $is_running,
						'data'			=> $data,
						'time'			=> date(DATE_ISO8601),
						'total_time' 	=> exec_time_unit($global_start_time,'secs').' secs',
						'errors'		=> []
					];

				// debug
					if(SHOW_DEBUG===true) {
						error_log('process loop: is_running: '.to_string($is_running) .' output: ' .PHP_EOL. json_encode($output) );
					}

				// output the response JSON string
					echo json_handler::encode($output, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL . PHP_EOL;

				// flush the output buffer and send echoed messages to the browser
					while (ob_get_level() > 0) {
						ob_end_flush();
					}
					flush();

				// stop on finish
					if ($is_running===false) break;

				// break the loop if the client aborted the connection (closed the page)
					if ( connection_aborted() ) break;

				// sleep n milliseconds before running the loop again
					$ms = $update_rate; usleep( $ms * 1000 );
			}//end while
	}else{

		// JSON case ----------------------------------

		// header print as JSON data
			header('Content-Type: application/json');

		// output the response JSON string
			$output_string = isset($rqo->pretty_print)
				? json_handler::encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT)
				: json_handler::encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
			echo $output_string;
	}
