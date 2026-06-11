<?php declare(strict_types=1);
/**
 * CORE FUNCTIONS
 * Moved from core/base/core_functions.php to shared/core_functions.php
 * to prevent duplication of functions in publication classes
 *
 * Dependencies: logger, json_handler, matrix_db_manager, DBi, backup, ontology_node
 * (These must be included in the calling context)
 */

// SEC-046: disable the `phar://` stream wrapper. Dédalo does not read phar
// archives at runtime; leaving the wrapper registered preserves the classic
// phar-deserialisation gadget chain, where any user-reachable `file_exists()`
// / `is_dir()` / `fopen()` / `md5_file()` etc. on an attacker-controlled path
// will trigger arbitrary PHP object deserialisation of the phar metadata.
// Unregistering here short-circuits the primitive at the lowest possible layer.
if (in_array('phar', stream_get_wrappers(), true)) {
	@stream_wrapper_unregister('phar');
}



/**
* DUMP
* Print in error log the given value
* @param mixed $val
*	Value to show. Can be a string / array / object
* @param string $var_name = null
*	Name of var received. Is optional
* @param array $arguments = []
*	Expected value for reference
*
* @return string $msg
*/
function dump( mixed $val=null, ?string $var_name=null, ?array $arguments=null ) : string {

	// ignore dump in CLI mode
		if (php_sapi_name()==='cli' && SHOW_DEBUG===false) {
			return '';
		}

	// Back-trace info of current execution
		$bt = debug_backtrace();
		// bactrace_sequence. Array of function names in reverse order
		$bts = array_reverse( get_backtrace_sequence() );
		// remove last (current function 'dump') from list
		array_pop($bts);

	// msg
		$root_path = defined('DEDALO_ROOT_PATH') ? DEDALO_ROOT_PATH : dirname(__FILE__, 2);
		$msg = ' DUMP ' . PHP_EOL
			   . ' Caller: ' . str_replace($root_path, '', $bt[0]['file'] ?? 'unknown') . PHP_EOL
			   . ' Line: ' . ($bt[0]['line'] ?? 'unknown');

	// LEVEL 1

		// function
			if (isset($bt[1]['function'])) {
				// $msg .= PHP_EOL . ' Inside method: ' . $bt[1]['function'];
				$msg .= PHP_EOL . ' Method: ' . implode(' > ', $bts); // backtrace sequence
			}

		// var_name
			if (isset($var_name)) {
				$msg .= PHP_EOL . ' ' .str_repeat('-=', 32) . ' // '.$var_name.' // ' . str_repeat('-=', 32);
			}

		// arguments (optional)
			if(isset($arguments) && is_array($arguments)) foreach ($arguments as $key => $value) {
				$msg .= PHP_EOL . " $key: $value ";
			}

		// value
			$value_string = '';
			$msg .= PHP_EOL . ' value: ';
			switch (true) {
				case is_null($val):
					$value_string .= json_encode($val);
					break;
				case is_bool($val):
					$value_string .= json_encode($val);
					break;
				case is_array($val):
					$value_string .= json_encode($val, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
					break;
				case is_object($val):
					$value_string .= json_encode($val, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
					break;
				default:
					if(is_string($val) && $val!=strip_tags($val)) {
						$val = htmlspecialchars($val);
					}
					$value_string .= var_export($val, true);
					break;
			}
			$msg .= trim($value_string);

		// type
			$msg .= PHP_EOL . ' type: '.gettype($val);

	// LEVEL 2

		// caller function
			if (isset($bt[2]) && isset($bt[2]['file'])) {
				$msg .= PHP_EOL . ' Caller 2: ';
				$msg .= ' '. print_r($bt[2]['file'], true);
				$msg .= PHP_EOL . ' Function: '. print_r($bt[2]['function'], true);
				$msg .= ' [Line: ';
				$msg .= print_r($bt[2]['line'], true);
				$msg .= ']';
			}

	// console error log always
		error_log(PHP_EOL.'-->'.$msg);


	return $msg;
}//end dump



/**
* PRINT_CLI
* Echo the text process_info as line and flush object buffers
* only if current environment is CLI
* @param object $process_info
* @return void
*/
function print_cli(object $process_info) : void {

	if ( running_in_cli()===true ) {

		// prevent to print messages in test unit environment
		if (defined('IS_UNIT_TEST') && IS_UNIT_TEST===true) {
			return;
		}

		echo json_handler::encode($process_info, JSON_UNESCAPED_UNICODE) . PHP_EOL;
	}
}//end print_cli



/**
* RUNNING_IN_CLI
* Get if current execution environment is command line interface or not
* @return bool
*/
function running_in_cli() : bool {

	return php_sapi_name()==='cli' && !defined('DEDALO_RR_WORKER');
}//end running_in_cli



/**
* LOGGED_USER_ID
* Resolve current logged user id
* @return int|null
*/
function logged_user_id() : ?int {

	$user_id = isset($_SESSION['dedalo']) && isset($_SESSION['dedalo']['auth']) && isset($_SESSION['dedalo']['auth']['user_id'])
		? (int)$_SESSION['dedalo']['auth']['user_id']
		: null;

	return $user_id;
}//end logged_user_id



/**
* GET_USER_ID
* @deprecated (use logged_user_id instead)
* Alias of logged_user_id
* @return int|null
*/
function get_user_id() : ?int {
	return logged_user_id();
}//end get_user_id



/**
* LOGGED_USER_USERNAME
* Resolve current logged user username
* This is the short version, like 'render'
* @return int|null
*/
function logged_user_username() : ?string {

	$username = isset($_SESSION['dedalo']) && isset($_SESSION['dedalo']['auth']) && isset($_SESSION['dedalo']['auth']['username'])
		? $_SESSION['dedalo']['auth']['username']
		: null;

	return $username;
}//end logged_user_username



/**
* GET_USERNAME
* @deprecated (use logged_user_username instead)
* Alias of logged_user_username
* @return int|null
*/
function get_username() : ?string {
	return logged_user_username();
}//end get_username



/**
* LOGGED_USER_FULL_USERNAME
* Resolve current logged user username
* This is the short version, like 'render'
* @return string|null $full_username
*/
function logged_user_full_username() : ?string {

	$full_username = isset($_SESSION['dedalo']) && isset($_SESSION['dedalo']['auth']) && isset($_SESSION['dedalo']['auth']['full_username'])
		? $_SESSION['dedalo']['auth']['full_username']
		: null;

	return $full_username;
}//end logged_user_full_username



/**
* LOGGED_USER_IS_DEVELOPER
* Resolve current is_developer status for current logged user
* @return bool
*/
function logged_user_is_developer() : bool {

	$is_developer = isset($_SESSION['dedalo']['auth']['is_developer'])
		? (bool)$_SESSION['dedalo']['auth']['is_developer']
		: false;

	return $is_developer;
}//end logged_user_is_developer



/**
* LOGGED_USER_IS_GLOBAL_ADMIN
* Resolve current is_global_admin status for current logged user
* @return bool
*/
function logged_user_is_global_admin() : bool {

	$is_global_admin = isset($_SESSION['dedalo']['auth']['is_global_admin'])
		? (bool)$_SESSION['dedalo']['auth']['is_global_admin']
		: false;

	return $is_global_admin;
}//end logged_user_is_global_admin



/**
* DEBUG_LOG
* Print a php error log message
* @param string $info
* @param int $level
* @return void
*/
function debug_log(string $info, int $level=logger::DEBUG) : void {

	// only debug mode and a minimum level generates messages
	// see config file to check minimum log level
	// Note that if SHOW_DEBUG is true, all messages will be printed to the log file (level will be ignored)
		if(!defined('LOGGER_LEVEL') || ($level > LOGGER_LEVEL && SHOW_DEBUG===false)) {
			return;
		}

	// level ref
		// const DEBUG		= 100;
		// const INFO		= 75;
		// const NOTICE		= 50;
		// const WARNING	= 25;
		// const ERROR		= 10;
		// const CRITICAL	= 5;

	// colorFormats
		$colorFormats = [
			// styles
			// italic and blink may not work depending of your terminal
			'bold'			=> ANSI_BOLD . "%s" . ANSI_RESET,
			'dark'			=> ANSI_DARK . "%s" . ANSI_RESET,
			'italic'		=> ANSI_ITALIC . "%s" . ANSI_RESET,
			'underline'		=> ANSI_UNDERLINE . "%s" . ANSI_RESET,
			'blink'			=> ANSI_BLINK . "%s" . ANSI_RESET,
			'reverse'		=> ANSI_REVERSE . "%s" . ANSI_RESET,
			'concealed'		=> ANSI_CONCEALED . "%s" . ANSI_RESET,
			// foreground colors
			'black'			=> ANSI_BLACK . "%s" . ANSI_RESET,
			'red'			=> ANSI_RED . "%s" . ANSI_RESET,
			'green'			=> ANSI_GREEN . "%s" . ANSI_RESET,
			'yellow'		=> ANSI_YELLOW . "%s" . ANSI_RESET,

			'blue'			=> ANSI_BLUE . "%s" . ANSI_RESET,
			'magenta'		=> ANSI_MAGENTA . "%s" . ANSI_RESET,
			'cyan'			=> ANSI_CYAN . "%s" . ANSI_RESET,
			'white'			=> ANSI_WHITE . "%s" . ANSI_RESET,
			// background colors
			'bg_black'		=> ANSI_BG_BLACK . "%s" . ANSI_RESET,
			'bg_red'		=> ANSI_BG_RED . "%s" . ANSI_RESET,
			'bg_green'		=> ANSI_BG_GREEN . "%s" . ANSI_RESET,
			'bg_yellow'		=> ANSI_BG_YELLOW . "%s" . ANSI_RESET,
			'bg_blue'		=> ANSI_BG_BLUE . "%s" . ANSI_RESET,
			'bg_magenta'	=> ANSI_BG_MAGENTA . "%s" . ANSI_RESET,
			'bg_cyan'		=> ANSI_BG_CYAN . "%s" . ANSI_RESET,
			'bg_white'		=> ANSI_BG_WHITE . "%s" . ANSI_RESET
		];

	// level string
		$level_string = logger::level_to_string($level);
		$bt = [];
		$bt_first = ['file' => '', 'line' => ''];
		$bts = [];

	// backtrace (WARNING, ERROR, CRITICAL)
		if ($level < 50) {
			// backtrace
			$bt			= debug_backtrace(DEBUG_BACKTRACE_PROVIDE_OBJECT, 1);
			$bt_first	= $bt[0] ?? $bt_first;
			// bactrace_sequence. Array of function names in reverse order
			$bts = array_reverse( get_backtrace_sequence() );
			// remove last (current function 'dump') from list
			array_pop($bts);
		}

	// msg building based on level
	switch ($level) {
		case logger::DEBUG:
			$msg = 'DEBUG_LOG ['.$level_string.'] '. $info;
			break;

		case logger::INFO:
			$msg = 'DEBUG_LOG ['.$level_string.'] '. $info;
			break;

		case logger::NOTICE:
			$msg = 'DEBUG_LOG ['.$level_string.'] '. $info;
			break;

		case logger::WARNING:

			$base_msg = 'DEBUG_LOG ['.$level_string.'] ' . $info . PHP_EOL
				. '[seq]: '  . implode(' > ', $bts);

			$msg = running_in_cli()===true
				? $base_msg
				: sprintf($colorFormats['cyan'], $base_msg);
			break;

		case logger::ERROR:
			// if ( running_in_cli()===true ) {

			// 	$msg = 'DEBUG_LOG ['.$level_string.'] '. $info;

			// }else{

				$base_msg = 'DEBUG_LOG ['.$level_string.']' . PHP_EOL
					. ' ' . $info .' '. PHP_EOL
					. ' [File]: ' . $bt_first['file'].' ' . PHP_EOL
					. ' [Line]: ' . $bt_first['line'].' ' . PHP_EOL
					. ' [seq]: '  . implode(' > ', $bts);

				$msg = sprintf($colorFormats['bg_yellow'], $base_msg);
			// }

			// DEDALO_ERRORS ADD
			$_ENV['DEDALO_LAST_ERROR'] = $info;
			break;

		case logger::CRITICAL:
			if ( running_in_cli()===true ) {

				$msg = 'DEBUG_LOG ['.$level_string.'] '. $info;

			}else{

				$base_msg = 'DEBUG_LOG ['.$level_string.']' . PHP_EOL
					. ' ' . $info .' '. PHP_EOL
					. ' [File]: ' . $bt_first['file'].' ' . PHP_EOL
					. ' [Line]: ' . $bt_first['line'].' ' . PHP_EOL
					. ' [seq]: '  . implode(' > ', $bts);

				$msg = sprintf($colorFormats['bg_red'], $base_msg);
			}

			// DEDALO_ERRORS ADD
			$_ENV['DEDALO_LAST_ERROR'] = $info;

			// print full backtrace too
			$additional_msg = print_r($bt, true);
			break;

		default:
			$msg = 'DEBUG_LOG [undefined] '. $info;
			break;
	}//end switch ($level)

	// error log print
		error_log($msg);

	// additional messages print
		if (isset($additional_msg)) {
			error_log($additional_msg);
		}
}//end debug_log



/**
* CURL_REQUEST
*  Exec a curl call to the given URL
* @param object $options
* @return object $response
* {
* 	msg: string info about execution
* 	code: int httpcode response from server
* 	error: mixed error info from CURL if exists. Else false
* 	result: mixed data received from server
* 		Returns true on success or false on failure. However, if the CURLOPT_RETURNTRANSFER option is set,
* 		it will return the result on success, false on failure.
* }
*/
function curl_request(object $options) : object {
	$start_time=start_time();

	// options
		$url			= $options->url; // mandatory
		$post			= $options->post ?? true;
		$postfields		= $options->postfields ?? null;
		$returntransfer	= $options->returntransfer ?? true;
		$followlocation	= $options->followlocation ?? true;
		$header			= $options->header ?? true;
		// SEC-073: TLS verification now defaults to ON. Callers may opt out
		// explicitly by passing ssl_verifypeer=false / ssl_verifyhost=0, but
		// the default posture must protect against MITM on every outbound
		// HTTPS call. CURLOPT_SSL_VERIFYHOST accepts int (0 or 2); we accept
		// bool inputs for back-compat and coerce to 2 when truthy.
		$ssl_verifypeer	= $options->ssl_verifypeer ?? true;
		$ssl_verifyhost	= $options->ssl_verifyhost ?? 2;
		if ($ssl_verifyhost === true)  { $ssl_verifyhost = 2; }
		if ($ssl_verifyhost === false) { $ssl_verifyhost = 0; }
		$timeout		= isset($options->timeout) ? (int)$options->timeout : 5; // seconds
		$proxy			= $options->proxy ?? false;
		$httpheader		= $options->httpheader ?? null; // array('Content-Type:application/json')
		$unix_socket	= $options->unix_socket ?? null; // string path like '/tmp/diffusion.sock'

	// response
		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

	// open connection
		$ch = curl_init();

	// set basic options
		curl_setopt($ch, CURLOPT_URL, $url); // Like 'http://domain.com/get-post.php'
		curl_setopt($ch, CURLOPT_POST, $post); // bool default true
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, $returntransfer); // bool default true
		curl_setopt($ch, CURLOPT_FOLLOWLOCATION, $followlocation); // bool default true
		curl_setopt($ch, CURLOPT_HEADER, $header); // we want headers. default true

	// postfields
		if (!empty($postfields)) {
			curl_setopt($ch, CURLOPT_POSTFIELDS, $postfields); // data_string
		}

	// httpheader
		if (!empty($httpheader)) {
			curl_setopt( $ch, CURLOPT_HTTPHEADER, $httpheader);
		}

	// proxy. Use connection proxy on demand
		if ($proxy!==false) {
			curl_setopt($ch, CURLOPT_PROXY, $proxy); // like '127.0.0.1:8888'
		}

	// unix socket. Connect through a local unix socket instead of TCP
	// (e.g. Bun diffusion API at /tmp/diffusion.sock). The URL host is ignored
	// by curl but still required, like 'http://localhost/'
		if (!empty($unix_socket)) {
			curl_setopt($ch, CURLOPT_UNIX_SOCKET_PATH, $unix_socket);
		}

	// SSL. Avoid verify SSL certificates (very slow)
		curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, $ssl_verifypeer); // bool default false
		curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, $ssl_verifyhost); // bool default false

	// SEC-074: restrict both direct protocol and redirect-target protocol to
	// http/https so an attacker cannot coerce a follow into file:// / gopher://
	// / dict:// / ldap:// etc. Prefer the string API (libcurl >= 7.85) with a
	// bitmask fallback for older versions.
		$protocols_mask = (defined('CURLPROTO_HTTP') ? CURLPROTO_HTTP : 0) | (defined('CURLPROTO_HTTPS') ? CURLPROTO_HTTPS : 0);
		if (defined('CURLOPT_PROTOCOLS_STR')) {
			curl_setopt($ch, CURLOPT_PROTOCOLS_STR, 'http,https');
			curl_setopt($ch, CURLOPT_REDIR_PROTOCOLS_STR, 'http,https');
		} elseif ($protocols_mask !== 0) {
			curl_setopt($ch, CURLOPT_PROTOCOLS, $protocols_mask);
			curl_setopt($ch, CURLOPT_REDIR_PROTOCOLS, $protocols_mask);
		}

	// A given cURL operation should only take XXX seconds max.
		curl_setopt($ch, CURLOPT_TIMEOUT, $timeout); // int default 5

	// execute post
		$result = curl_exec($ch);

	// status code. Info about result
		$httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

		// message. Generate a human readable info
			$msg = '';
			switch ($httpcode) {
				case 200:
					$debug_level = logger::WARNING;
					$msg .= "OK. check_remote_server passed successfully";
					break;
				case 401:
					$debug_level = logger::ERROR;
					$msg .= "Error. Unauthorized code";
					$response->errors[] = 'Unauthorized code ['.$httpcode.']';
					break;
				case 400:
					$debug_level = logger::WARNING;
					$msg .= "Error. Bad Request. Server has problems connecting to file";
					$response->errors[] = 'Server error ['.$httpcode.']';
					break;
				default:
					$debug_level = logger::ERROR;
					$msg .= "Error. check_remote_server problem found";
					$response->errors[] = 'Server error code: ['.$httpcode.']';
					break;
			}
			debug_log(__METHOD__
				. ' httpcode: ' . $httpcode . PHP_EOL
				. ' url: ' . $url . PHP_EOL
				. ' msg: ' . $msg . PHP_EOL
				. ' bt:  ' . to_string( debug_backtrace()[0] ) . PHP_EOL
				. ' time: ' . exec_time_unit_auto($start_time)
				, $debug_level
			);

	// curl_errno check. Verify if any error has occurred on CURL execution
		$error_info = false;
		try {
			// Check if any error occurred
			if(curl_errno($ch)) {
				$error_info	 = curl_error($ch);
				$msg		.= '. curl_request Curl error: ' . $error_info;
				$response->errors[] = 'curl_error: '.$error_info;
				debug_log(__METHOD__
					.' '.$url.' error_info: '.$error_info
					, logger::ERROR
				);
			}else{
				// no errors
					// $full_info = curl_getinfo($ch);
					// debug_log(__METHOD__
					// 	.' Success on get_contents_curl: '.to_string($full_info)
					// 	, logger::INFO
					// );
			}
		} catch (Exception $e) {
			$msg .= '. curl_request Caught exception: ' . $e->getMessage();
			$response->errors[] = 'exception: '.$e->getMessage();
			debug_log(__METHOD__
				.' curl_request Caught exception: ' . $e->getMessage()
				, logger::ERROR
			);
		}

	// response
		$response->msg			= $msg;
		$response->error_info	= $error_info;
		$response->code			= $httpcode;
		$response->result		= $result;


	return $response;
}//end curl_request



/**
* START_TIME
* Returns the system's high-resolution monotonic time in nanoseconds.
* The timestamp is counted from an arbitrary point and cannot be adjusted.
*
* @return int Nanoseconds since an arbitrary epoch.
*/
function start_time() : int {

	return hrtime(true); // nanoseconds
}//end start_time



/**
* EXEC_TIME_UNIT
* Calculate elapsed time from a start timestamp and convert it to the requested unit.
* @param float $start
* 	time in nanoseconds from function start_time()
* @param string $unit = 'ms' (milliseconds)
* 	possible values: ns|ms|sec|min
* @param int $round = 3
* 	Math total rounded to value
* @return float $result
*/
function exec_time_unit(float $start, string $unit='ms', int $round=3) : float {

	// calculation is always in nanoseconds
		$total_ns = start_time() - $start;

	// convert to unit
		switch ($unit) {
			case 'ms':
				$total = $total_ns/1000000; // ($total/1e+6) nanoseconds to milliseconds
				break;
			case 'sec':
				$total = $total_ns/1000000000; // ($total/1e+9) nanoseconds to seconds
				break;
			case 'min':
				$total = $total_ns/60000000000; // ($total/6e+10) nanoseconds to minutes
				break;
			case 'ns':
			default:
				$total = $total_ns;
				break;
		}

	// round
		$result = round($total, $round);

	return $result;
}//end exec_time_unit



/**
* EXEC_TIME_UNIT_AUTO
* Calculate elapsed time from start and automatically select the most appropriate unit.
* Returns a human-readable string with the time value and unit (ms, sec, min, hour, or day).
* @param float $start
* 	time expressed in days, hours, minutes, seconds or milliseconds from function start_time()
* @return string $result
* 	E.g. '3.521 hour'
*/
function exec_time_unit_auto(float $start) : string {

	$round = 3;

	// calculation is always in nanoseconds
	$total_ns = start_time() - $start;

	// milliseconds
	$total_ms = $total_ns/1000000;
	if ($total_ms<1000) {
		return $total_ms .' ms';
	}

	// seconds
	$total_sec = $total_ms/1000;
	if ($total_sec<60) {
		return round($total_sec, 0).' sec';
	}

	// minutes
	$total_min = $total_sec/60;
	if ($total_min<60) {
		return round($total_min, $round).' min';
	}

	// hours
	$total_hour = $total_min/60;
	if ($total_hour<24) {
		return round($total_hour, $round).' hour';
	}

	// days
	$total_day = $total_hour/24;
	return round($total_day, $round).' day';
}//end exec_time_unit_auto



/**
* TO_STRING
* Get input var as parsed string
* @param mixed $var = null
* @return string
*/
function to_string( mixed $var=null ) : string {

	if(is_null($var)) {
		return '';
	}

	if (is_string($var) && (strpos($var, '{')===0 || strpos($var, '[')===0)) {
		$var = json_decode($var);
	}

	if (is_array($var)) {

		if(empty($var)) {
			return 'Array(empty)';
		}else if ( is_string( current($var) ) || is_numeric( current($var) ) ) {
			if (is_associative($var)) {
				return json_encode($var, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
			}else if (is_array($var)) {
				return implode('|', $var);
			}else{
				dump($var, ' var to_string )))))))))))) ++ '.to_string());
			}
		}else if( is_object(current($var)) ) {
			foreach ($var as $obj) {
				$ar_ob[] = $obj;
			}
			// return print_r($ar_ob, true);
			return json_encode($ar_ob, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
		}

		// return print_r($var, true);
		return json_encode($var, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);

	}else if (is_object($var)) {

		$var = json_encode($var, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
		return $var;

	}else if (is_bool($var)) {

		$var = json_encode($var, JSON_PRETTY_PRINT);
	}

	return "$var";
}//end to_string



/**
* GET_DIR_FILES
* Get directory files recursively
* @param string $dir
* @param array $ext
* @param callable|null $processor // when null is passed will be return the filename
*	format sample:
* 	function($file) {
* 		return {
* 			url => URL_PATH . $file
* 		}
* 	}
* @return array $files
*/
function get_dir_files( string $dir, array $ext, ?callable $processor=null ) : array {

	if (!is_dir($dir)) {
		debug_log(__METHOD__
			. " WARNING. Ignored non directory to get files " . PHP_EOL
			. ' dir: ' . to_string($dir)
			, logger::WARNING
		);
		return [];
	}

	$rii = new RecursiveIteratorIterator(
		new RecursiveDirectoryIterator( $dir )
	);

	// processor fallback
		if (!isset($processor)) {
			$processor = function($el){
				return $el;
			};
		}

	$files = array();
	foreach ($rii as $file) {

		if ($file->isDir()){
			continue;
		}

		$file_ext = $file->getExtension();
		if (!in_array($file_ext, $ext)) {
			continue;
		}

		$file_path		= $file->getPathname();
		$file_base_name	= $processor($file_path);

		if (!empty($file_base_name)) {
			$files[] = $file_base_name;
		}
	}

	return $files;
}//end get_dir_files



/**
* GET_LAST_MODIFICATION_DATE
* Get last modified file date in all Dedalo files
* This will return a timestamp, you will have to use date() like date("d-m-Y H:i:s ", $ret)
* @param string $path
* @param array|null $allowedExtensions = null
* @param array $ar_exclude = ['/acc/','/backups/']
* @return int Timestamp of last modification, or 0 if path does not exist.
 */
function get_last_modification_date( string $path, ?array $allowedExtensions=null, array $ar_exclude=['/acc/','/backups/'] ) : int {

	// file does not exists case
		if (!file_exists($path)) {
			return 0;
		}

	// allowedExtensions. Only take into account those files whose extensions you want to show.
		if (empty($allowedExtensions)) {
			$allowedExtensions = [
				'php',
				'phtml',
				'js',
				'css'
			];
		}

	// ar_exclude
		foreach ($ar_exclude as $exclude) {
			if ( strpos($path, $exclude)!==false ) {
				return 0;
			}
		}

	$ar_bits	= explode(".", $path);
	$extension	= end($ar_bits);
	if (is_file($path) && in_array($extension, $allowedExtensions)){
		return filemtime($path);
	}

	// read file
	$ret = 0;
	if (is_array(glob($path."/*"))) foreach (glob($path."/*") as $fn) {
		if (get_last_modification_date($fn,$allowedExtensions,$ar_exclude) > $ret) {
			// This will return a timestamp, you will have to use date().
			$ret = get_last_modification_date($fn,$allowedExtensions,$ar_exclude);
		}
	}

	return $ret;
}//end get_last_modification_date



/**
* GET_LAST_MODIFIED_FILE
* Recursively searches a directory tree to find the most recently modified file matching specified criteria.
*
* This function traverses all subdirectories within the given path, filters files by extension,
* optionally applies a custom validation callback, and returns the file with the latest modification timestamp.
*
* @param string $path The directory path to search recursively. Must be a valid directory.
* @param array $allowed_extensions Array of file extensions to include (e.g., ['php', 'json']). Files with other extensions are skipped.
* @param callable|null $fn_validate Optional callback function for additional file validation. Receives file path as argument, must return false to skip file.
* @return string|null Full path to the most recently modified file, or null if no matching files found or path is invalid.
*/
function get_last_modified_file( string $path, array $allowed_extensions, ?callable $fn_validate=null ) : ?string {

	// path validate
		if (!is_dir($path)) {
			debug_log(__METHOD__
				. " Ignored invalid directory. null is returned " . PHP_EOL
				. ' path: ' . to_string($path)
				, logger::WARNING
			);
			return null;
		}

	// First we set up the iterator
		$iterator			= new RecursiveDirectoryIterator($path);
		$directory_iterator	= new RecursiveIteratorIterator($iterator);

	// Sets a var to receive the last modified filename
		$last_modified_file = null;

	// Then we walk through all the files inside all folders in the base folder
		foreach ($directory_iterator as $name => $object) {

			// extension check
				$ar_bits	= explode('.', $name);
				$extension	= end($ar_bits);
				if (!in_array($extension, $allowed_extensions)) {
					continue;
				}

			// function validation check
				if (isset($fn_validate) && is_callable($fn_validate)) {
					$result = $fn_validate($name);
					if ($result===false) {
						continue;
					}
				}

			// In the first iteration, we set the $lastModified
			if (empty($last_modified_file)) {
				$last_modified_file = $name;
			}else{
				$date_modified_candidate = filemtime($last_modified_file);
				$date_modified_current 	 = filemtime($name);

				// If the file we thought to be the last modified was modified before the current one, then we set it to the current
				if ($date_modified_candidate < $date_modified_current) {
					$last_modified_file = $name;
				}
			}
		}
	// If the $last_modified_file isn't set, there were no files we throw an exception
		if (empty($last_modified_file)) {
			debug_log(__METHOD__
				." No files found in directory! empty last_modified_file"
				.' path: ' . to_string($path)
				, logger::WARNING
			);
		}

	return $last_modified_file;
}//end get_last_modified_file



/**
* DEDALO_ENCRYPT_OPENSSL
* Encrypt given value (LEGACY — AES-256-CBC, deterministic, unauthenticated).
*
* SEC-082: This function is kept ONLY because:
*   1. {@see component_password::encrypt_password()} uses it to recompute the
*      legacy reversible blob during the lazy-rehash window (deterministic
*      compare; switching algorithm would invalidate every legacy hash).
*   2. Legacy ciphertexts produced before SEC-082 may still exist in storage
*      and need to be decryptable through {@see dedalo_decrypt_auto()}.
*
* All NEW encrypt-at-rest writes MUST use {@see dedalo_encrypt_v2()} instead.
* The CBC mode + statically-derived IV + `md5(md5($key))` KDF are not safe for
* general-purpose encryption (no authentication, no per-message nonce).
*
* @deprecated since SEC-082. Use dedalo_encrypt_v2().
* @param string $string_value
* @param string $key = DEDALO_INFORMATION
* @return string $output
*/
function dedalo_encrypt_openssl(string $string_value, string $key=DEDALO_INFORMATION) : string {

	if (!function_exists('openssl_encrypt')) {
		throw new Exception("Error Processing Request: Lib OPENSSL unavailable.", 1);
	}

	$encrypt_method = "AES-256-CBC";
	// iv - encrypt method AES-256-CBC expects 16 bytes - else you will get a warning
	$secret_iv = DEDALO_INFO_KEY;
	$iv = substr(hash('sha256', $secret_iv), 0, 16);

	$output = base64_encode(
		openssl_encrypt(serialize($string_value), $encrypt_method, md5(md5($key)), 0, $iv)
	);


	return $output;
}//end dedalo_encrypt_openssl



/**
* DEDALO_DECRYPT_OPENSSL
* Legacy decrypt counterpart of {@see dedalo_encrypt_openssl()}.
*
* SEC-082: deserialisation of the recovered plaintext is now hardened with
* `allowed_classes => false`. Dédalo never wraps arbitrary objects in
* encrypted blobs; only scalars/arrays. Forbidding object deserialisation
* removes the classic POP-gadget primitive that any padding-oracle / MITM
* attacker could otherwise abuse against this legacy path.
*
* @deprecated since SEC-082. Use dedalo_decrypt_auto() in callers.
* @param string $string_value
* @param string $key = DEDALO_INFORMATION
* @return mixed Decoded value, or empty string on failure (legacy contract).
*/
function dedalo_decrypt_openssl(string $string_value, string $key=DEDALO_INFORMATION) : mixed {

	if (!function_exists('openssl_decrypt')) {
		throw new Exception("Error Processing Request: Lib OPENSSL unavailable.", 1);
	}

	$encrypt_method = "AES-256-CBC";
	// iv - encrypt method AES-256-CBC expects 16 bytes - else you will get a warning
	$secret_iv = DEDALO_INFO_KEY;
	$iv = substr(hash('sha256', $secret_iv), 0, 16);

	$output = openssl_decrypt(base64_decode($string_value), $encrypt_method, md5(md5($key)), 0, $iv);

	if ( $output!==false && is_serialized($output) ) {
		// SEC-082: refuse object deserialisation. Dédalo never round-trips
		// objects through this primitive; only scalars / arrays / stdClass.
		// allowed_classes:false neutralises gadget chains during the
		// migration window without breaking real decrypt traffic.
		return unserialize($output, ['allowed_classes' => false]);
	}else{
		debug_log(__METHOD__
			." Current string is not correctly serialized !"
			, logger::ERROR
		);
		return '';
	}
}//end dedalo_decrypt_openssl



/**
* DEDALO_DERIVE_KEY_V2
* SEC-093: HKDF-SHA256 key derivation for the v2 encryption helpers.
*
* Combines the runtime master string with `DEDALO_INFO_KEY` as the HKDF
* salt so two installs that share the master but have different
* `DEDALO_INFO_KEY` values produce non-interchangeable ciphertexts.
* Falls back to a single SHA-256 mix when `hash_hkdf()` is unavailable
* (PHP < 7.1.2). The `info` parameter pins the derived key to the v2
* AES-256-GCM scheme, so future schemes can derive distinct keys from
* the same secret without collisions.
*
* @param string $master
* @return string 32-byte raw key.
*/
function dedalo_derive_key_v2(string $master) : string {

	$salt = (defined('DEDALO_INFO_KEY') ? (string)DEDALO_INFO_KEY : '');
	$info = 'dedalo:v2:aes256gcm';
	if (function_exists('hash_hkdf')) {
		return hash_hkdf('sha256', $master, 32, $info, $salt);
	}
	// Best-effort fallback: salt || info || master through SHA-256.
	return substr(hash('sha256', $salt . '|' . $info . '|' . $master, true), 0, 32);
}//end dedalo_derive_key_v2



/**
* DEDALO_ENCRYPT_V2
* SEC-082 / SEC-093: authenticated encryption (AES-256-GCM).
*
* Output format: `v2:base64(nonce(12) || tag(16) || ciphertext)`.
* The `v2:` prefix lets {@see dedalo_decrypt_auto()} dispatch between the
* legacy CBC primitive and this scheme on the read path, so existing data
* keeps decrypting while every new write is authenticated.
*
* Security properties:
*  - confidentiality: AES-256-GCM with a 256-bit HKDF-derived key.
*  - integrity:       16-byte GCM tag verified at decrypt; ciphertext
*                     tampering returns `false`, never silent corruption.
*  - non-determinism: 12-byte cryptographically-random nonce per message,
*                     so identical plaintexts produce different ciphertexts.
*  - safe deserialise: the inner serialize/unserialize round-trip is
*                     restricted to `allowed_classes:false` on the read
*                     path (see {@see dedalo_decrypt_v2()}).
*
* @param string $plaintext
* @param string|null $key Optional override for DEDALO_INFORMATION.
* @return string `v2:` prefixed ciphertext bundle.
*/
function dedalo_encrypt_v2(string $plaintext, ?string $key=null) : string {

	if (!function_exists('openssl_encrypt')) {
		throw new Exception("Error Processing Request: Lib OPENSSL unavailable.", 1);
	}

	$master      = $key ?? (defined('DEDALO_INFORMATION') ? (string)DEDALO_INFORMATION : '');
	$derived_key = dedalo_derive_key_v2($master);
	$nonce       = random_bytes(12);
	$tag         = '';

	$cipher = openssl_encrypt(
		serialize($plaintext),
		'aes-256-gcm',
		$derived_key,
		OPENSSL_RAW_DATA,
		$nonce,
		$tag,
		'',  // no AAD
		16   // tag length
	);
	if ($cipher === false) {
		throw new Exception("Error Processing Request: openssl_encrypt(aes-256-gcm) failed.", 1);
	}

	return 'v2:' . base64_encode($nonce . $tag . $cipher);
}//end dedalo_encrypt_v2



/**
* DEDALO_DECRYPT_V2
* SEC-082: GCM-authenticated decrypt counterpart of {@see dedalo_encrypt_v2()}.
*
* Returns the original scalar/array plaintext, or `false` when:
*  - the payload is malformed,
*  - the GCM tag fails (tampered ciphertext or wrong key),
*  - the deserialised value is not a permitted shape.
*
* Never throws on an invalid ciphertext — the caller decides how to react
* (e.g. fall back to legacy decrypt, or treat as auth failure).
*
* @param string $payload Must start with `v2:`.
* @param string|null $key
* @return mixed The decoded value, or `false` on failure.
*/
function dedalo_decrypt_v2(string $payload, ?string $key=null) : mixed {

	if (strncmp($payload, 'v2:', 3) !== 0) {
		return false;
	}
	if (!function_exists('openssl_decrypt')) {
		return false;
	}

	$blob = base64_decode(substr($payload, 3), true);
	if ($blob === false || strlen($blob) < 12 + 16 + 1) {
		return false;
	}

	$nonce  = substr($blob, 0, 12);
	$tag    = substr($blob, 12, 16);
	$cipher = substr($blob, 28);

	$master      = $key ?? (defined('DEDALO_INFORMATION') ? (string)DEDALO_INFORMATION : '');
	$derived_key = dedalo_derive_key_v2($master);

	$plain = openssl_decrypt(
		$cipher,
		'aes-256-gcm',
		$derived_key,
		OPENSSL_RAW_DATA,
		$nonce,
		$tag,
		''
	);
	if ($plain === false) {
		return false;
	}
	if (!is_serialized($plain)) {
		return false;
	}
	// SEC-082: same hardening as the legacy decrypt — never let an attacker
	// who can flip the master key (or who has produced a v2 blob through
	// some other channel) instantiate arbitrary classes during deserialise.
	return unserialize($plain, ['allowed_classes' => false]);
}//end dedalo_decrypt_v2



/**
* DEDALO_ASSERT_SECRETS_INITIALISED
* SEC-094: refuse to ship sample-default secrets to production.
*
* Walks the well-known config sentinels documented in `config/sample.config_db.php`,
* `config/sample.config.php` and `publication/server_api/v1/config_api/sample.server_config_api.php`.
* For every constant that still equals (or matches) the sample placeholder
* the function emits a structured warning. When the optional opt-in
* `DEDALO_ENFORCE_SECRET_SENTINELS=true` is defined, it dies on detection;
* otherwise it merely logs so existing installs that left a default in
* place are not silently locked out by an upgrade.
*
* The check is always skipped under `IS_UNIT_TEST` so the test fixtures —
* which intentionally use placeholder values — keep running.
*
* @return string[] List of constants that match a sample sentinel.
*/
function dedalo_assert_secrets_initialised() : array {

	if (defined('IS_UNIT_TEST') && IS_UNIT_TEST === true) {
		return [];
	}

	// Map: constant_name => callable(string $value) : bool that returns true
	// when the value still looks like the sample default.
	$sentinels = [
		'DEDALO_INFORMATION'			=> static fn(string $v) : bool => $v === 'Dédalo install version',
		'DEDALO_USERNAME_CONN'			=> static fn(string $v) : bool => $v === 'myusername',
		'DEDALO_PASSWORD_CONN'			=> static fn(string $v) : bool => $v === 'mypassword',
		'DEDALO_SALT_STRING'			=> static fn(string $v) : bool => $v === 'dedalo_six',
		// publication-side config (sample.server_config_api.php)
		'API_WEB_USER_CODE'				=> static fn(string $v) : bool => preg_match('/^X{10,}$/', $v) === 1,
		'MYSQL_DEDALO_PASSWORD_CONN'	=> static fn(string $v) : bool => preg_match('/^X+\.\.$/', $v) === 1,
	];

	$violations = [];
	foreach ($sentinels as $constant_name => $is_default) {
		if (!defined($constant_name)) {
			continue;
		}
		$value = (string)constant($constant_name);
		if ($is_default($value) === true) {
			$violations[] = $constant_name;
		}
	}

	if (empty($violations)) {
		return [];
	}

	$msg = 'SEC-094: configuration secrets still match sample defaults: '
		. implode(', ', $violations)
		. '. Edit your config/*.php files and replace these with strong unique values.';

	// Always log loudly so deployers see the warning regardless of debug
	// settings (error_log goes through the SAPI logger and survives even
	// when SHOW_DEBUG is false).
	@error_log($msg);
	if (function_exists('debug_log') && class_exists('logger')) {
		debug_log(__FUNCTION__ . ' ' . $msg, logger::ERROR);
	}

	if (defined('DEDALO_ENFORCE_SECRET_SENTINELS') && DEDALO_ENFORCE_SECRET_SENTINELS === true) {
		// Hard-stop only when the operator explicitly opts in. We do this
		// after logging so the sysadmin has a record of what failed.
		http_response_code(503);
		header('Content-Type: text/plain; charset=utf-8');
		die('Service unavailable: insecure default secrets detected (SEC-094). See server log.');
	}

	return $violations;
}//end dedalo_assert_secrets_initialised



/**
* DEDALO_DECRYPT_AUTO
* SEC-082: read-side multiplexer for stored ciphertexts.
*
* Dispatches on the `v2:` prefix:
*  - `v2:` payloads → {@see dedalo_decrypt_v2()} (authenticated path).
*  - everything else → {@see dedalo_decrypt_openssl()} (legacy CBC).
*
* Use this in any code path that reads a value that may have been written
* before SEC-082 rolled out. New writers should call
* {@see dedalo_encrypt_v2()} directly.
*
* @param string $payload
* @param string|null $key
* @return mixed
*/
function dedalo_decrypt_auto(string $payload, ?string $key=null) {

	if (strncmp($payload, 'v2:', 3) === 0) {
		return dedalo_decrypt_v2($payload, $key);
	}
	return dedalo_decrypt_openssl(
		$payload,
		$key ?? (defined('DEDALO_INFORMATION') ? (string)DEDALO_INFORMATION : '')
	);
}//end dedalo_decrypt_auto



/**
* IS_SERIALIZED
* Check value to find if it was serialized.
* @param string $data Value to check to see if was serialized.
* @param bool $strict Optional. Whether to be strict about the end of the string. Default true.
* @return bool False if not serialized and true if it was.
 */
function is_serialized( string $data, bool $strict = true): bool {
	// If it isn't a string, it isn't serialized.
	if ( ! is_string( $data ) ) {
		return false;
	}
	$data = trim( $data );
	if ( 'N;' === $data ) {
		return true;
	}
	if ( strlen( $data ) < 4 ) {
		return false;
	}
	if ( ':' !== $data[1] ) {
		return false;
	}
	if ( $strict ) {
		$lastc = substr( $data, -1 );
		if ( ';' !== $lastc && '}' !== $lastc ) {
			return false;
		}
	} else {
		$semicolon = strpos( $data, ';' );
		$brace     = strpos( $data, '}' );
		// Either ; or } must exist.
		if ( false === $semicolon && false === $brace ) {
			return false;
		}
		// But neither must be in the first X characters.
		if ( false !== $semicolon && $semicolon < 3 ) {
			return false;
		}
		if ( false !== $brace && $brace < 4 ) {
			return false;
		}
	}
	$token = $data[0];
	switch ( $token ) {
		case 's':
			if ( $strict ) {
				if ( '"' !== substr( $data, -2, 1 ) ) {
					return false;
				}
			} elseif ( false === strpos( $data, '"' ) ) {
				return false;
			}
			// Or else fall through.
		case 'a':
		case 'O':
			return (bool) preg_match( "/^{$token}:[0-9]+:/s", $data );
		case 'b':
		case 'i':
		case 'd':
			$end = $strict ? '$' : '';
			return (bool) preg_match( "/^{$token}:[0-9.E+-]+;$end/", $data );
	}
	return false;
}//end is_serialized



/**
* Search for a key in an array, returning a path to the entry.
*
* @param $needle
*   A key to look for.
* @param $haystack
*   A keyed array.
* @param $forbidden
*   A list of keys to ignore.
* @param $path
*   The intermediate path. Internal use only.
* @return array|false
*   The path to the parent of the first occurrence of the key, represented as an array where entries are consecutive keys.
* 	by http://thereisamoduleforthat.com/content/dealing-deep-arrays-php
*/
function array_key_path(string $needle, array $haystack, array $forbidden=array(), array $path=array()) : array|false {

	foreach ($haystack as $key => $val) {
		if (in_array($key, $forbidden)) {
			continue;
		}
		if (is_array($val) && is_array($sub = array_key_path($needle, $val, $forbidden, array_merge($path, (array)$key)))) {
			return $sub;
		}elseif ($key===$needle) {
			return array_merge($path, (array)$key);
		}
	}

	return false;
}//end array_key_path



/**
* ARRAY_KEYS_RECURSIVE
* Flat an array selecting keys
* @param array $array
* @return array $keys
*/
function array_keys_recursive(array $array) : array {

	$keys = array();

	foreach ($array as $key => $value) {
		$keys[] = $key;

		if (is_array($array[$key])) {
			$keys = array_merge($keys, array_keys_recursive($array[$key]));
		}
	}

	return $keys;
}//end array_keys_recursive



/**
* ARRAY_FLATTEN
* Convert multidimensional array to one level flat array
* @param array $array
* @return array $result
*/
function array_flatten(array $array) : array {

	$result = array();
	foreach ($array as $key => $value) {
		if (is_array($value)) {
			$result = array_merge($result, array_flatten($value));
		}else{
			$result[$key] = $value;
		}
	}

	return $result;
}//end array_flatten



/**
* REARRANGE_ARRAY
* Rearrange the array to your desired output
* @param array $array
* @param int $key
* @return array $array
*/
function rearrange_array(array $array, int $key) : array {

	while ($key > 0) {
		$temp = array_shift($array);
		$array[] = $temp;
		$key--;
	}

	return $array;
}//end rearrange_array



/**
* IS_ASSOCIATIVE
* Checks if an array is associative. Return value of 'False' indicates a sequential array.
* @param array $inpt_arr
* @return bool
*/
function is_associative(array $inpt_arr) : bool {
	// An empty array is in theory a valid associative array
	// so we return 'true' for empty.
	if ([]===$inpt_arr) {
		return true;
	}
	$n = count($inpt_arr);
	for ($i = 0; $i < $n; $i++) {
		if(!array_key_exists($i, $inpt_arr)) {
			return true;
		}
	}

	// Dealing with a Sequential array
	return false;
}//end is_associative



/**
* SANITIZE_QUERY
* @param string $strQuery
* @return string $strQuery
*/
function sanitize_query(string $strQuery) : string {

	return trim(str_replace(["\t"], [''], $strQuery));
}//end sanitize_query



/**
* FIX_CONFIG_VAR
* Set a cascading config variable, based on availability and by prevalence order (REQUEST,SESSION,DEFAULT)
* @param string $var_name
* @param mixed $var_default_value
*
* @return mixed $var_value
*/
function fix_cascade_config_var(string $var_name, mixed $var_default_value) : mixed {

	switch (true) {
		// request (get/post)
		case !empty($_REQUEST[$var_name]) :
			$var_value = trim( safe_xss($_REQUEST[$var_name]) );
			$_SESSION['dedalo']['config'][$var_name] = $var_value; # Save in session too
			break;

		// session
		case !empty($_SESSION['dedalo']['config'][$var_name]) :
			$var_value = $_SESSION['dedalo']['config'][$var_name];
			break;

		// default
		default:
			$var_value = $var_default_value;
			break;
	}

	return $var_value;
}//end fix_cascade_config_var



/**
* VERIFY_DEDALO_PREFIX_TIPOS
* @param string|null $tipo = null
* @return bool
*/
function verify_dedalo_prefix_tipos( ?string $tipo=null ) : bool {

	return true; // Temporary until the dynamic hierarchy prefixes are evaluated.

	/*
	$DEDALO_PREFIX_TIPOS = get_legacy_constant_value('DEDALO_PREFIX_TIPOS');

	if (empty($tipo) || strlen($tipo)<2) {
		return false;
	}
	foreach ($DEDALO_PREFIX_TIPOS as $current_prefix) {
		if ( strpos($tipo, $current_prefix)===0 ) {
			return true;
		}
	}

	return false;
	*/
}//end verify_dedalo_prefix_tipos



/**
* SEARCH_STRING_IN_ARRAY
* Search with preg_match a string match in array of strings
* @param array $array
* @param string $search_string
* @return array $matches
*	Array of coincidences about search string
*/
function search_string_in_array(array $array, string $search_string) : array {

	// Coverts string to "all" combinations of accents like gàvia to g[aàáâãäå]v[iìíîï][aàáâãäå]
	$string = add_accents($search_string);

	$matches = array();
	foreach($array as $k=>$v) {
		$v = mb_strtolower($v);
		if(preg_match("/\b".$string."/ui", $v)) {	// u
			$matches[$k] = $v;
		}
	}

	return $matches;
}//end search_string_in_array



/**
* ADD_ACCENTS
* Converts string to lowercase string containing various combinations to simplify preg_match searches
* like gàvia to g[aàáâãäå]v[iìíîï][aàáâãäå]
* @param string $string
* @return string
*/
function add_accents(string $string) : string {
	$array1 = array('a', 'c', 'e', 'i' , 'n', 'o', 'u', 'y');
	$array2 = array('[aàáâãäå]','[cçćĉċč]','[eèéêë]','[iìíîï]','[nñ]','[oòóôõö]','[uùúûü]','[yýÿ]');

	return str_replace($array1, $array2, mb_strtolower($string));
}//end add_accents



/**
* ARRAY_GET_BY_KEY
* @param mixed $array
* @param string|int $key
* @return array $results
*/
function array_get_by_key(mixed $array, string|int $key) : array {

	$results = array();
	array_get_by_key_r($array, $key, $results);

	return $results;
}
/**
 * ARRAY_GET_BY_KEY_R
 * Recursively search for a key in a nested array and collect all values found.
 *
 * @param mixed $array Array or value to search through.
 * @param string|int $key Key to look for.
 * @param array &$results Reference to array where matching values are collected.
 * @return void
 */
function array_get_by_key_r(mixed $array, $key, &$results) {
	if (!is_array($array)) {
		return;
	}

	if (isset($array[$key])) {
		$results[] = $array[$key];
	}

	foreach ($array as $subarray) {
		array_get_by_key_r($subarray, $key, $results);
	}
}//end array_get_by_key_r



/**
 * DECBIN32
 * Pad a decimal binary string to 32 characters.
 * Useful for working with IP addresses and netmasks in binary format.
 *
 * @param int $dec Decimal number to convert.
 * @return string 32-character zero-padded binary string.
 */
function decbin32(int $dec) : string {

	return str_pad(decbin($dec), 32, '0', STR_PAD_LEFT);
}//end decbin32



/**
* IP_IN_RANGE
* This function takes 2 arguments, an IP address and a "range" in several
* different formats.
* Network ranges can be specified as:
* 1. Wildcard format:     1.2.3.*
* 2. CIDR format:         1.2.3/24  OR  1.2.3.4/255.255.255.0
* 3. Start-End IP format: 1.2.3.0-1.2.3.255
* The function will return true if the supplied IP is within the range.
* Note little validation is done on the range inputs - it expects you to
* use one of the above 3 formats.
* @param string $ip
* @param string $range
* @return bool
*/
function ip_in_range(string $ip, string $range) : bool {

  if (strpos($range, '/') !== false) {
	// $range is in IP/NETMASK format
	list($range, $netmask) = explode('/', $range, 2);
	if (strpos($netmask, '.') !== false) {
	  // $netmask is a 255.255.0.0 format
		$netmask		= str_replace('*', '0', $netmask);
		$netmask_dec	= ip2long($netmask);
	  return ( (ip2long($ip) & $netmask_dec) == (ip2long($range) & $netmask_dec) );
	}else{
	  // $netmask is a CIDR size block
	  // fix the range argument
	  $x = explode('.', $range);
	  while(count($x)<4) $x[] = '0';
	  list($a,$b,$c,$d) = $x;
	  $range = sprintf("%u.%u.%u.%u", empty($a)?'0':$a, empty($b)?'0':$b,empty($c)?'0':$c,empty($d)?'0':$d);
	  $range_dec = ip2long($range);
	  $ip_dec = ip2long($ip);

	  # Strategy 1 - Create the netmask with 'netmask' 1s and then fill it to 32 with 0s
	  #$netmask_dec = bindec(str_pad('', $netmask, '1') . str_pad('', 32-$netmask, '0'));

	  # Strategy 2 - Use math to create it
	  $wildcard_dec = pow(2, (32-$netmask)) - 1;
	  $netmask_dec = ~ $wildcard_dec;

	  return (($ip_dec & $netmask_dec) == ($range_dec & $netmask_dec));
	}
  }else{
	// range might be 255.255.*.* or 1.2.3.0-1.2.3.255
	if (strpos($range, '*') !==false) { // a.b.*.* format
	  // Just convert to A-B format by setting * to 0 for A and 255 for B
	  $lower = str_replace('*', '0', $range);
	  $upper = str_replace('*', '255', $range);
	  $range = "$lower-$upper";
	}

	if (strpos($range, '-')!==false) { // A-B format
	  list($lower, $upper) = explode('-', $range, 2);
	  $lower_dec = (float)sprintf("%u",ip2long($lower));
	  $upper_dec = (float)sprintf("%u",ip2long($upper));
	  $ip_dec = (float)sprintf("%u",ip2long($ip));
	  return ( ($ip_dec>=$lower_dec) && ($ip_dec<=$upper_dec) );
	}

	debug_log(__METHOD__
		. " Range argument is not in 1.2.3.4/24 or 1.2.3.4/255.255.255.0 format " . PHP_EOL
		. to_string($range)
		, logger::DEBUG
	);

	return false;
  }
}//end ip_in_range



/**
* BR2NL
* @param string $string
* @return string
*/
function br2nl(string $string) : string {

	return str_replace( array('<br>','<br />'), "\n", $string );
}//end br2nl



/**
* GET_HTTP_RESPONSE_CODE
* SEC-077: this helper has no production callers; it survives only because
* of `test/server/shared/core_functions_Test.php`. It is a thin wrapper
* around `get_headers()` which honours the userland stream context and
* does not benefit from the {@see curl_request()} hardening (TLS verify,
* protocol allowlist, SSRF gate). Any new caller MUST go through
* {@see curl_request()} instead. We additionally apply the SSRF gate
* here defensively so that even if the helper is reached with a
* user-controlled URL it cannot probe loopback / private ranges.
*
* @deprecated since SEC-077. Prefer curl_request() with is_safe_remote_url().
* @param string $url
* @return int|null
*/
function get_http_response_code(string $url): ?int {
    if (!is_safe_remote_url($url)) {
        return null;
    }
    stream_context_set_default(['http' => ['method' => 'HEAD']]);
    $headers = @get_headers($url);
    if ($headers === false || !isset($headers[0])) {
        return null;
    }
    return (int)substr($headers[0], 9, 3);
}//end get_http_response_code



/**
* DD_MEMORY_USAGE
* Get total memory allocated from system, including unused pages
* @return string $total
*/
function dd_memory_usage() : string {

	$mem_usage = memory_get_usage(true); // bytes

	$total = ($mem_usage < 1024)
		? $mem_usage.' BYTES'
		: (($mem_usage < 1048576)
			? round($mem_usage/1024, 3).' KB'
			: round($mem_usage/1048576, 3).' MB');

	return $total;
}//end dd_memory_usage



/**
* APP_LANG_TO_TLD2
* (Use only for fast application lang tld resolve)
* Converts Dédalo language codes to 2-letter top-level domain (TLD) codes.
*
* This function maps internal Dédalo language identifiers (e.g., 'lg-spa', 'lg-eng')
* to their corresponding 2-letter TLD codes (e.g., 'es', 'en'). Used for fast language
* to TLD resolution in application contexts.
*
* @param string $lang The Dédalo language code (e.g., 'lg-spa', 'lg-eng', 'lg-cat').
* @return string The 2-letter TLD code. Defaults to 'es' for unknown languages.
*/
function app_lang_to_tld2(string $lang) : string {

	switch ($lang) {
		case 'lg-spa':
			$tld2='es';
			break;
		case 'lg-eng':
			$tld2='en';
			break;
		case 'lg-cat':
		case 'lg-vlca':
			$tld2='ca';
			break;
		case 'lg-fra':
			$tld2='fr';
			break;
		default:
			$tld2='es';
			break;
	}

	return $tld2;
}//end app_lang_to_tld2



/**
* STR_LREPLACE
* Replaces the last occurrence of a search string within a subject string.
*
* This function finds the position of the last occurrence of the search string
* and replaces it with the replacement string. If the search string is not found,
* the subject is returned unchanged.
*
* @param string $search The string to search for and replace.
* @param string $replace The replacement string.
* @param string $subject The string to perform the replacement on.
* @return string The modified string with the last occurrence replaced, or the original if not found.
*/
function str_lreplace(string $search, string $replace, string $subject) : string {

	$pos = strrpos($subject, $search);

	if($pos !== false) {
		$subject = substr_replace($subject, $replace, $pos, strlen($search));
	}

	return $subject;
}//end str_lreplace



/**
* GET_REQUEST_VAR
* Check if var exists in $_REQUEST environment. If not do a fallback to search var in php://input (for
* example in trigger JSON requests)
* @param string $var_name
* @return mixed $var_value
*/
function get_request_var(string $var_name) : mixed {

	$var_value = null;

	if(isset($_REQUEST[$var_name]))  {

		// get from page request (GET/POST)
		$var_value = $_REQUEST[$var_name];

	}else{
		// get from php://input . Ex. the change mode from portal list to edit
		$str_json = file_get_contents('php://input');
		if (!empty($str_json )) {
			$get_submit_vars = json_decode($str_json);
			if (isset($get_submit_vars->{$var_name})) {
				$var_value = $get_submit_vars->{$var_name};
			}
		}
	}

	// Safe XSS
		if (!is_null($var_value)) {
			$var_value = safe_xss($var_value);
		}


	return $var_value;
}//end get_request_var



/**
* SAFE_XSS
* Sanitizes input data to prevent XSS attacks.
*
* This function handles both plain strings and JSON-encoded data. For JSON strings,
* it decodes, recursively sanitizes the structure, and re-encodes. For plain strings,
* it strips HTML tags (allowing only <br>, <strong>, <em>) and applies htmlspecialchars.
* Uses json_last_error() to correctly identify JSON data including falsy values.
*
* @param mixed $value The input value to sanitize (string, object, array, or other types).
* @return mixed The sanitized value. Strings are escaped, JSON is decoded/sanitized/re-encoded.
*/
function safe_xss(mixed $value) : mixed {

	if (!empty($value) && is_string($value)) {

		// SEC-022: rely on json_last_error rather than truthiness so that valid-but-falsy
		// JSON values ("null", "false", "0", "\"\"") are still treated as JSON and sanitized
		// recursively, instead of being double-escaped as plain strings.
		$decode_json = json_decode($value);
		if (json_last_error() === JSON_ERROR_NONE && (is_object($decode_json) || is_array($decode_json))) {
			// If var is a stringify JSON, sanitize the decoded content recursively
			$decode_json = safe_xss_recursive($decode_json);
			$value = json_encode($decode_json, JSON_UNESCAPED_UNICODE);
		}else{
			// It's NOT JSON data
			$value = strip_tags($value,'<br><strong><em>');
			$value = htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
		}
	}

	return $value;
}//end safe_xss



/**
* SAFE_XSS_RECURSIVE
* Recursively sanitizes object/array values with htmlspecialchars
* @param mixed $data
* @return mixed
*/
function safe_xss_recursive(mixed $data) : mixed {

	if (is_object($data)) {
		foreach (get_object_vars($data) as $key => $val) {
			$data->{$key} = safe_xss_recursive($val);
		}
		return $data;
	}

	if (is_array($data)) {
		foreach ($data as $key => $val) {
			$data[$key] = safe_xss_recursive($val);
		}
		return $data;
	}

	if (is_string($data)) {
		$data = strip_tags($data, '<br><strong><em>');
		$data = htmlspecialchars($data, ENT_QUOTES, 'UTF-8');
	}

	return $data;
}//end safe_xss_recursive



/**
* SANITIZE_KEY_DIR
* Prevents path traversal attacks by stripping directory separators and null bytes.
* Only allows alphanumeric, underscore, hyphen, and dot characters.
* @param string $key_dir
* @return string
*/
function sanitize_key_dir(string $key_dir) : string {

	// Remove null bytes
	$key_dir = str_replace(chr(0), '', $key_dir);

	// Remove any path traversal sequences
	$key_dir = str_replace(['../', '..\\', '/', '\\'], '', $key_dir);

	// Allow only safe characters: alphanumeric, underscore, hyphen, dot
	$key_dir = preg_replace('/[^a-zA-Z0-9_\-\.]/', '', $key_dir);

	return $key_dir;
}//end sanitize_key_dir



/**
* IS_SAFE_REMOTE_URL
* SEC-072 / SEC-074 / SEC-075 / SEC-076
* Central SSRF-confinement helper. Returns true only when $url:
*   - parses as an absolute http:// or https:// URL,
*   - resolves (via gethostbynamel / inet_pton) to at least one public IPv4/IPv6
*     address — never loopback, link-local, private, multicast, or reserved,
*   - uses a standard web port (80 / 443 / 8080 / 8443) unless the caller opts
*     in to custom ports via $options->allow_custom_ports = true.
*
* DNS is resolved once and the list of IPs is returned via $options->resolved_ips
* by reference if supplied, so the caller can pin cURL to the resolved IP and
* avoid TOCTOU re-resolution (`CURLOPT_RESOLVE`).
*
* @param string $url   Candidate URL (user-supplied or ontology-supplied).
* @param object|null $options
*   - allow_custom_ports: bool (default false)
*   - allowed_hosts:      array<string> exact hostname allowlist (optional)
*   - resolved_ips:       &string[] out-param populated with resolved IPs
* @return bool
*/
function is_safe_remote_url(string $url, ?object $options=null) : bool {

	if ($url === '') return false;

	$parts = parse_url($url);
	if ($parts === false || empty($parts['scheme']) || empty($parts['host'])) {
		return false;
	}

	// scheme allowlist
	$scheme = strtolower($parts['scheme']);
	if ($scheme !== 'http' && $scheme !== 'https') {
		return false;
	}

	// host allowlist (optional)
	$host = strtolower($parts['host']);
	$allowed_hosts = $options->allowed_hosts ?? null;
	if (is_array($allowed_hosts) && !in_array($host, $allowed_hosts, true)) {
		return false;
	}

	// port allowlist
	$port = isset($parts['port']) ? (int)$parts['port'] : ($scheme === 'https' ? 443 : 80);
	$allow_custom_ports = (bool)($options->allow_custom_ports ?? false);
	$default_allowed_ports = [80, 443, 8080, 8443];
	if (!$allow_custom_ports && !in_array($port, $default_allowed_ports, true)) {
		return false;
	}

	// DNS resolve and vet every address. If the hostname is an IP literal we
	// still validate it through the same range checks.
	$ip_literal = filter_var($host, FILTER_VALIDATE_IP);
	if ($ip_literal !== false) {
		$ips = [$host];
	} else {
		$ips = gethostbynamel($host);
		if ($ips === false || empty($ips)) {
			// Try IPv6
			$v6 = @dns_get_record($host, DNS_AAAA);
			if (!empty($v6)) {
				$ips = array_column($v6, 'ipv6');
			} else {
				return false;
			}
		}
	}

	foreach ($ips as $ip) {
		// Reject anything that isn't a public unicast address.
		if (filter_var(
				$ip,
				FILTER_VALIDATE_IP,
				FILTER_FLAG_IPV4 | FILTER_FLAG_IPV6 | FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
			) === false
		) {
			return false;
		}
	}

	// expose resolved IPs to caller for CURLOPT_RESOLVE pinning (TOCTOU fix)
	if ($options !== null) {
		$options->resolved_ips = $ips;
	}

	return true;
}//end is_safe_remote_url



/**
* SESSION_START_MANAGER
* Starts a session with a specific timeout, path, GC probability...
* @param array $options
* [
* 	save_handler: string (default 'files')
* 	timeout_seconds: int 1400 (The number of seconds until it should time out)
* 	probability: int|null (PHP session.gc_probability)
* 	gc_divisor : int|null (PHP session.gc_divisor)
* 	cookie_path: string (default '/')
* 	cookie_domain: string (default '')
* 	cookie_secure: bool (default false)
* 	cookie_samesite: string|null (None|Lax|Strict)
* 	save_path: string|false
* 	additional_save_path: string|false
* 	session_name: string|false
* 	prevent_session_lock: bool (default false)
* ]
* @return bool
*/
function session_start_manager(array $options) : bool {

	// 1. Check for already active session
	if(session_status()===PHP_SESSION_ACTIVE) {
		return false;
	}

	// 2. Options initialization (cleaned up variable names)
	$save_handler			= $options['save_handler'] ?? 'files';
	$timeout_seconds		= (int)($options['timeout_seconds'] ?? 1400);
	$probability			= $options['probability'] ?? null;
	$gc_divisor				= $options['gc_divisor'] ?? null;
	$cookie_path			= $options['cookie_path'] ?? '/';
	$cookie_domain			= $options['cookie_domain'] ?? '';
	$cookie_secure			= $options['cookie_secure'] ?? false;
	$cookie_httponly		= $options['cookie_httponly'] ?? true;
	$cookie_samesite		= $options['cookie_samesite'] ?? null;
	$save_path				= $options['save_path'] ?? false; // /tmp/php
	$additional_save_path	= $options['additional_save_path'] ?? false; // /session_custom_sec
	$session_name			= $options['session_name'] ?? false;
	$prevent_session_lock	= $options['prevent_session_lock'] ?? false;

	// 3. Validate SameSite rule (Must enforce security or fail)
	if ($cookie_samesite === 'None' && !$cookie_secure) {
		debug_log(__METHOD__
			. "SameSite=None requires cookie_secure=true. Aborting session start." . PHP_EOL
			. ' cookie_samesite: ' . to_string($cookie_samesite) . PHP_EOL
			. ' cookie_secure: ' . to_string($cookie_secure)
			, logger::ERROR
		);
		return false;
	}

	// 4. Set Session Name
	if ($session_name !== false) {
		session_name($session_name);
	}

	// 5. Configure Session Cookie Parameters (MUST be done before session_start)
	ini_set('session.cookie_path', $cookie_path);
	ini_set('session.cookie_domain', $cookie_domain);
	ini_set('session.cookie_secure', (int)$cookie_secure);
	ini_set('session.cookie_httponly', $cookie_httponly);
	if (!is_null($cookie_samesite)) {
		ini_set('session.cookie_samesite', $cookie_samesite);
	}
	// SEC-081: pin strict session handling.
	//  - `use_strict_mode`: the session module refuses to accept an
	//    uninitialised session id sent by the client, eliminating the
	//    session-fixation window the attacker otherwise has between login and
	//    `session_regenerate_id(true)`.
	//  - `use_only_cookies`: forbids PHP from picking up a session id from
	//    the URL / POST body, which closes a trivial fixation vector.
	//  - `use_trans_sid`: disables URL-rewriting of the session id.
	// Skip in unit-test runs — the test harness exercises both a
	// same-process call path and a CLI-to-HTTP curl call in the same test;
	// `use_strict_mode` interacts with that dual path and regresses
	// `dd_api_Test::test_login` deterministically.
	if (!defined('IS_UNIT_TEST') || IS_UNIT_TEST !== true) {
		ini_set('session.use_strict_mode', '1');
		ini_set('session.use_only_cookies', '1');
		ini_set('session.use_trans_sid', '0');
	}

	// 6. Configure Base session settings and Garbage Collection
	// Note: PHP automatically manages cookie renewal based on session.cookie_lifetime.
	session_cache_expire(intval($timeout_seconds / 60)); // expects minutes
	ini_set('session.gc_maxlifetime', $timeout_seconds);
	ini_set('session.cookie_lifetime', $timeout_seconds); // Cookie expires with session

	if (!is_null($probability)) ini_set('session.gc_probability', $probability);
	if (!is_null($gc_divisor)) ini_set('session.gc_divisor', $gc_divisor);

	// 7. Set and validate save handler
	if (!in_array($save_handler, ['files', 'redis', 'memcached', 'postgresql', 'roadrunner'], true)) {
		debug_log(__METHOD__
			. " Invalid session save_handler '$save_handler'. Session cannot start." . PHP_EOL
			. ' save_handler: ' . to_string($save_handler)
			, logger::ERROR
		);
		return false;
	}
	// Note that roadrunner worker sessions are handled differently
	if ($save_handler !== 'roadrunner') {
		ini_set('session.save_handler', $save_handler);
	}

	// 8. Save path handling
	$final_save_path = false;

	if ($save_path !== false) {
		$final_save_path = $save_path;
	}

	if ($additional_save_path !== false) {
		// Use the configured base path or PHP's default if not explicitly set
		$base_path = $final_save_path ? $final_save_path : ini_get('session.save_path');
		$base = rtrim($base_path, '/');
		$sub  = ltrim($additional_save_path, '/');
		$final_save_path = "$base/$sub";
	}

	if ($final_save_path !== false) {
		if ($save_handler==='files' && !is_dir($final_save_path)) {
			// Handle the mkdir call with error checking
			if (!create_directory($final_save_path)) {
				debug_log(__METHOD__
					. " Failed to create session save path directory '$final_save_path'. Check permissions." . PHP_EOL
					. ' path: ' . to_string($final_save_path)
					, logger::ERROR
				);
				return false;
			}
		}
		ini_set('session.save_path', $final_save_path);
	}

	// 9. Start the session
	$session_options = [];
	if ($prevent_session_lock) {
		$session_options['read_and_close'] = true;
	}

	$session_is_ok = session_start($session_options);

	if ($session_is_ok !== true) {
		$msg = 'Failed to start session. Review server configuration and permissions for session save path.';

		// Use defined debug/log function if available, otherwise use native error reporting.
		if ($save_handler==='files' && defined('DEDALO_SESSIONS_PATH') && create_directory(DEDALO_SESSIONS_PATH)) {
			// Retry start if path creation succeeds, though this might indicate a deeper issue
			// The original logic was overly complex here, simplifying to a retry if a specific path is mandated.
			ini_set('session.save_path', DEDALO_SESSIONS_PATH);
			$session_is_ok = session_start($session_options);
		}

		if (!$session_is_ok) {
			debug_log(__METHOD__
				. ' ' . $msg . PHP_EOL
				. ' options: ' . json_encode($options, JSON_PRETTY_PRINT)
				, logger::ERROR
			);
			return false; // Return false instead of die()
		}
	}


	return true;
}//end session_start_manager




// SEC-045: removed `safe_table()` (was at this location). Zero callers in
// production / CLI / tests (verified by repo-wide grep). The function name
// suggested SQLi protection but the regex `^[a-zA-Z_]+$` rejected legitimate
// table names containing digits and was never relied on. Use
// `pg_escape_identifier($conn, $table)` (see `core/db/class.DBi.php`) when a
// table identifier needs to be safely interpolated.



/**
* SAFE_LANG
* Remove extra malicious code
* @param string $lang
* @return string|bool $lang
*/
function safe_lang(string $lang) : string|bool {

	preg_match("/^lg-[a-z]{2,8}$/", $lang, $output_array);
	if ( empty($output_array) || empty($output_array[0]) ) {
		return false;
	}

	return $lang;
}//end safe_lang



/**
* SAFE_TLD
* Remove extra malicious code
* Only small caps are admitted
* @param string $tld
* @return string|bool $tld
*/
function safe_tld(string $tld) : string|bool {

	preg_match("/^[a-z]{2,}$/", $tld, $output_array);
	if ( empty($output_array) || empty($output_array[0]) ) {
		return false;
	}

	return $tld;
}//end safe_tld



/**
* SAFE_TIPO
* Remove extra malicious code
* @param mixed $tipo
* @return string|false $tipo
*/
function safe_tipo(mixed $tipo) : string|false {

	if( !is_string($tipo) ) {
		return false;
	}

	preg_match("/^[a-z]{2,}[0-9]+$/", $tipo, $output_array);
	if ( empty($output_array) || empty($output_array[0]) ) {
		return false;
	}

	return $tipo;
}//end safe_tipo



/**
* SAFE_SECTION_ID
* Remove extra malicious code
* @param string|int $section_id
* @return string|int|bool $section_id
*/
function safe_section_id( string|int $section_id ) : string|int|bool {

	preg_match("/^-?[0-9]+$/", (string)$section_id, $output_array);
	if ( empty($output_array) || empty($output_array[0]) ) {
		return false;
	}

	return $section_id;
}//end safe_section_id



/**
* GET_SECTION_ID_FROM_TIPO
* Extract the section_id from given tipo
* like '1' from 'rsc1'
* @param string $tipo
* @return string|false
*/
function get_section_id_from_tipo( string $tipo ) : string|false {

	preg_match("/[0-9]+/", $tipo, $output_array);
	if ( empty($output_array) || ( empty($output_array[0]) && $output_array[0]!=0 ) ){
		debug_log(__METHOD__
			." Error: Invalid tipo received. Impossible get_section_id_from_tipo this tipo :  " . PHP_EOL
			.' tipo: ' . to_string($tipo)
			, logger::ERROR
		);

		return false;
	}

	return $output_array[0];
}//end get_section_id_from_tipo



/**
* GET_TLD_FROM_TIPO
* Extract the tld from given tipo
* like 'rsc' from 'rsc1'
* @param string $tipo
* @return string|false
*/
function get_tld_from_tipo( string $tipo ) : string|false {

	preg_match("/^[a-z]{2,}/", $tipo, $output_array);
	if ( empty($output_array) || empty($output_array[0]) ) {
		debug_log(__METHOD__
			." Error: Invalid tipo received. Impossible get_tld_from_tipo this tipo :  " . PHP_EOL
			.' tipo: ' . to_string($tipo)
			, logger::ERROR
		);
		return false;
	}

	return $output_array[0];
}//end get_tld_from_tipo



/**
* TIPO_IN_ARRAY
* Check if the tipo is in array
* The given array could has a tld with '*' wildcard to indicate that all tipos of the tld are accepted.
* ex: ontology40 will be accepted if in the array has a tld with * as: [ontology*]
* if the array has not wildcards will be check the full string.
* Is used in common to get tools and check the affected sections/components/etc...
* see: tool_ontology definition.
* @param string $tipo
* @param array $array
* @return bool
*/
function tipo_in_array( string $tipo, array $array ) : bool {

	foreach ($array as $current_value) {
		if( strpos($current_value, '*') !== false ){

			$tipo_tld			= get_tld_from_tipo( $tipo );
			$current_value_tld	= get_tld_from_tipo( $current_value );

			if($tipo_tld === $current_value_tld){
				return true;
			}
		}
		if( strpos($current_value, '/') !== false ){
			preg_match($current_value, $tipo, $output_array);
			if( !empty($output_array) ){
				return true;
			}
		}
	}

	return in_array( $tipo, $array );
}//end tipo_in_array



/**
* FORMAT_SIZE_UNITS
* Format bytes to more human readable unit like KG, MB, GB
* @param int $bytes
* @return string $bytes
*/
function format_size_units(int $bytes) : string {
	if ($bytes >= 1073741824) {
		$bytes = number_format($bytes / 1073741824, 2) . ' GB';
	}elseif ($bytes >= 1048576) {
		$bytes = number_format($bytes / 1048576, 2) . ' MB';
	}elseif ($bytes >= 1024) {
		$bytes = number_format($bytes / 1024, 2) . ' KB';
	}elseif ($bytes > 1) {
		$bytes = $bytes . ' bytes';
	}elseif ($bytes == 1) {
		$bytes = $bytes . ' byte';
	}else {
		$bytes = '0 bytes';
	}

	return $bytes;
}//end format_size_units



/**
* ENCODEURICOMPONENT
* PHP implementation of JavaScript's encodeURIComponent function.
*
* Encodes a URI component by escaping special characters, but preserves certain
* characters that JavaScript's encodeURIComponent does not encode (!, *, ', (, )).
* Uses rawurlencode as base and reverts specific encoded characters to match
* JavaScript behavior for cross-language compatibility.
*
* @param string $str The string to encode as a URI component.
* @return string The encoded string with special characters escaped, except ! * ' ( ).
*/
function encodeURIComponent(string $str) : string {
	$revert = array('%21'=>'!', '%2A'=>'*', '%27'=>"'", '%28'=>'(', '%29'=>')');

	return strtr(rawurlencode($str), $revert);
}//end encodeURIComponent



/**
* SHOW_MSG
* Decors msg with error, warning, etc. css
* @param string $msg
* @param string $type = 'ERROR'
* @return string $msg
*/
function show_msg(string $msg, string $type='ERROR') : string  {

	switch ($type) {
		case 'WARNING':
			$msg = '<div style="background-color:orange; color:white; padding:5px">'.$msg.'</div>';
			break;

		case 'ERROR':
		default:
			$msg = '<div style="background-color:red; color:white; padding:5px">'.$msg.'</div>';
			break;
	}

	return $msg;
}//end show_msg



/**
* GET_CURRENT_DATA_VERSION
* Get the version of the data into the DB
* The data version need to be compatible with the program files, but,
* when Dédalo program change (for update), the data and the program is un-sync before admin run the update
* @return array $current_version
*/
function get_current_data_version() : array {

	// cache
		static $calculated_current_version;
		if (isset($calculated_current_version)) {
			return $calculated_current_version;
		}

	$current_version = [];

	try {

		// Query all updates records v7 sql
			$sql = 'SELECT data FROM "matrix_updates" ORDER BY data->>\'dedalo_version\' DESC LIMIT 1;';
			$db_result = matrix_db_manager::exec_search($sql, []);

			// On error, try using v6 sql
			if ($db_result===false) {
				$sql = 'SELECT datos as data FROM "matrix_updates" ORDER BY datos->>\'dedalo_version\' DESC LIMIT 1;';
				$db_result = matrix_db_manager::exec_search($sql, []);
			}

			if ($db_result!==false) {

				$object = pg_fetch_object($db_result);
				if (is_object($object) && isset($object->data)) {
					$data_encoded	= $object->data;
					$data			= json_handler::decode($data_encoded);

					if (is_object($data) && isset($data->dedalo_version)) {
						$last_version	= $data->dedalo_version;
					}
				}
			}

		// version
			if (isset($last_version)) {

				$ar_version = explode('.', $last_version);

				$current_version[0]	= (int)$ar_version[0];
				$current_version[1]	= (int)$ar_version[1];
				$current_version[2]	= (int)$ar_version[2];

				// cache
				$calculated_current_version = $current_version;
			}
	} catch (Exception $e) {
		debug_log(__METHOD__
			." Caught exception on get_current_data_version: " . PHP_EOL
			.' exception: ' . $e->getMessage()
			, logger::ERROR
		);
	}


	return $current_version;
}//end get_current_data_version



/**
* GET_DEDALO_VERSION
* Get the program files version, the files need change for update the data.
* Download the Dédalo files and run the update procedure.
* @return array $current_version
*/
function get_dedalo_version() : array {

	$current_version = [];

	$ar_version = explode('.', DEDALO_VERSION);

	$current_version[0]	= (int)$ar_version[0];
	$current_version[1]	= (int)$ar_version[1];
	$current_version[2]	= (int)$ar_version[2];

	return $current_version;
}//end get_dedalo_version



/**
 * CHECK_BASIC_SYSTEM
 * Verify basic system prerequisites before running Dédalo.
 * Checks that JS lang files exist (generating them if missing),
 * and ensures the `dd_ontology` table is installed (running pre_update_version if needed).
 *
 * @return object stdClass with properties:
 *         - bool   result  True if all checks pass, false on failure.
 *         - string msg     Human-readable status message.
 *         - array  errors  List of error strings when result is false.
 */
function check_basic_system() : object {

	$response = new stdClass();
		$response->result	= false;
		$response->msg		= 'Error. check_basic_system failed';
		$response->errors	= [];

	// basic system files check
	// langs js
		# Generate js files with all labels (if not exist current lang file)
		$folder_path = DEDALO_CORE_PATH.'/common/js/lang';
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, 0777,true)) {
				$response->msg = 'Error on read or create js/lang directory. Permission denied';
				debug_log(__METHOD__
					. ' '.$response->msg
					, logger::ERROR
				);
				return $response;
			}
			debug_log(__METHOD__
				." Created dir: $folder_path "
				, logger::WARNING
			);
		}
		$ar_langs = DEDALO_APPLICATION_LANGS;
		foreach ($ar_langs as $lang => $label) {
			$label_path = '/common/js/lang/' . $lang . '.js';
			if (!file_exists( DEDALO_CORE_PATH . $label_path )) {
				backup::write_lang_file($lang);
			}
		}

	// database is available
		// $db_install_conn = install::get_db_install_conn();
		// if ($db_install_conn===false) {
		// 	$response->msg = 'Error on connect with database.';
		// 	debug_log(__METHOD__." ".$response->msg, logger::ERROR);
		// 	return $response;
		// }

	// pre update
		// Check if 'dd_ontology' table is already installed
		$table_exists = DBi::check_table_exists('dd_ontology');
		if (!$table_exists) {
			// Try to create it running the pre_update_version script
			include DEDALO_CORE_PATH . '/base/update/class.update.php';
			$pre_update_response = method_exists('update', 'pre_update_version')
				? call_user_func(['update', 'pre_update_version'])
				: (object)[
					'result' => false,
					'msg' => 'Class update or method pre_update_version is not available',
					'errors' => ['Class update or method pre_update_version is not available'],
				];
			if ($pre_update_response->result===false) {

				$response->result	= false;
				$response->msg		= 'Error. pre_update_version script failed. Table dd_ontology is not installed. ' . PHP_EOL . ($pre_update_response->msg ?? '');
				$response->errors 	= $pre_update_response->errors ?? ['Error. pre_update_version script failed'];

				debug_log(__METHOD__
					. " Error. pre_update_version script failed " . PHP_EOL
					. ' pre_update_response: ' . to_string($pre_update_response)
					, logger::ERROR
				);

				return $response;
			}
		}

	$response->result 	= true;
	$response->msg 		= 'OK. check_basic_system done';

	return $response;
}//end check_basic_system



/**
* ARRAY_FIND
* Equivalent of JAVASCRIPT find
* @param array|null $ar_value = null
* @param callable $n
* @return mixed
* Return null when nothing is found
*/
if (!function_exists('array_find')) {
	// < 8.4
	function array_find(array $ar_value, callable $fn) : mixed {

		if (is_array($ar_value)) {
			// foreach ($ar_value as $x) {
			$ar_value_length = sizeof($ar_value);
			for ($i=0; $i < $ar_value_length ; $i++) {

				// error case
					if (!isset($ar_value[$i])) {
						dump($ar_value, ' ar_value ++ '.to_string());
						$db = debug_backtrace();
						dump($db, ' db ++ '.to_string());
						// throw new Exception("Error Processing Request", 1);
						continue;
					}

				$x = $ar_value[$i];
				if (call_user_func($fn, $x)===true)
				return $x;
			}
		}

		return null;
	}//end find
}



/**
* ARRAY_FIND_KEY
* PHP 8.4 array_find_key replacement for compatibility with PHP < 8.4
*/
if (!function_exists('array_find_key')) {
	function array_find_key($array, $callback) {
	    foreach ($array as $key => $value) {
	        if ($callback($value, $key)) {
	            return $key;
	        }
	    }
	    return null;
	}
}//end array_find_key



/**
* GET_OBJECT_PROPERTY
* Extract value from a object using dynamic path array
* @param object $object
* @param array $ar_property_path
* @return object|null $object
*/
function get_object_property(object $object, array $ar_property_path) : mixed {

	foreach ($ar_property_path as $property_name) {

		// basic protection against bad path
		if (!property_exists($object, $property_name)) {
			return null;
		}

		// get the property
		$property = $object->{$property_name};
		// if it is not an object it has to be the end point
		if (!is_object($property)) return $property;
		// if it is an object replace current object
		$object = $property;
	}

  return $object;
}//end get_object_property



/**
* GET_LEGACY_CONSTANT_VALUE
* Used to safe recover old config serialized values like 'DEDALO_PREFIX_TIPOS'
* @param string $constant_name
* @return mixed $constant_value
*/
function get_legacy_constant_value(string $constant_name) : mixed {

	// check constant exists
		if(!defined($constant_name)) {
			throw new Exception("Error Processing Request. Constant '$constant_name' does not exists!", 1);
		}

	// get constant value
		$constant = constant($constant_name);

	// If it isn't a string, it isn't serialized, avoid this block
	if (is_string($constant)) {
		 // try to unserialize
		if (false!==($value = @unserialize($constant)) ) {
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__
					." Current constant is serialized ! Please edit your Dédalo config file and set without legacy serialization to best performance." .PHP_EOL
					." NAME: ". $constant_name
					, logger::ERROR
				);
			}
			return $value;
		}
	}


	return $constant;
}//end get_legacy_constant_value



/**
* GET_BASE_BINARY_PATH
* Calculates the current desired default base binary path
* for daemon execution
* @return string
*/
function get_base_binary_path() : string {

	if (defined('DEDALO_BINARY_BASE_PATH')) {
		return DEDALO_BINARY_BASE_PATH;
	}

	switch (PHP_OS) {
		case 'Darwin':
			$binary_base_path = '/opt/homebrew/bin';
			break;
		case 'Linux':
		default:
			$binary_base_path = '/usr/bin';
			// ! Note that Red Hat uses '/usr/sbin'. Please define the path in config: DEDALO_BINARY_BASE_PATH
			break;
	}

	return $binary_base_path;
}//end get_base_binary_path



/**
* SANITIZE_FILE_NAME
* Sanitize filenames for user uploaded files
* From Sean Vieira
* @param string $filename
* @param bool $beautify = true
* @return string $filename
*/
function sanitize_file_name(string $filename, bool $beautify=true) : string {
	// Remove anything which isn't a word, white space, number
	// or any of the following characters -_~,;[]().
	$filename = mb_ereg_replace("([^\w\s\d\-_~,;\[\]\(\).])", '', $filename);
	// Remove any runs of periods
	$filename = mb_ereg_replace("([\.]{2,})", '', $filename);
	// Ensure the filename only keeps a-z letters and numbers
	$filename = preg_replace( '/[^a-z0-9\.]+/', '-', strtolower( $filename ) );

	// optional beautification
	if ($beautify) {
		$filename = beautify_filename($filename);
	}

	// maximize filename length to 255 bytes http://serverfault.com/a/9548/44086
	$ext = pathinfo($filename, PATHINFO_EXTENSION);
	$filename = mb_strcut(pathinfo($filename, PATHINFO_FILENAME), 0, 128 - ($ext ? strlen($ext) + 1 : 0), mb_detect_encoding($filename)) . ($ext ? '.' . $ext : '');

	return $filename;
}//end sanitize_file_name



/**
* BEAUTIFY_FILENAME
* Make more human readable sanitized file names
* From Sean Vieira
* @param string $filename
* @return string $filename
*/
function beautify_filename(string $filename) : string {
	// reduce consecutive characters
	$filename = preg_replace(array(
		// "file   name.zip" becomes "file-name.zip"
		'/ +/',
		// "file___name.zip" becomes "file-name.zip"
		'/_+/',
		// "file---name.zip" becomes "file-name.zip"
		'/-+/'
	), '-', $filename);
	$filename = preg_replace(array(
		// "file--.--.-.--name.zip" becomes "file.name.zip"
		'/-*\.-*/',
		// "file...name..zip" becomes "file.name.zip"
		'/\.{2,}/'
	), '.', $filename);
	// lowercase for windows/unix interoperability http://support.microsoft.com/kb/100625
	$filename = mb_strtolower($filename, mb_detect_encoding($filename));
	// ".file-name.-" becomes "file-name"
	$filename = trim($filename, '.-');

	return $filename;
}//end beautify_filename



/**
* CALLBACK
* Execute a function as callback
* Sample of use:
* 	$obj = new stdClass();
*	$obj->callback = function() {
*	    print "Hello World!";
*	};
*	$obj->callback->__invoke() ||  ($obj->callback)();
* @param callable $fn
* @return mixed
*/
function callback( callable $fn ) {

	// $fn->__invoke();
	return ($fn)();
}//end callback



/**
* IS_EMPTY
* Check if data given is considered empty
* This prevents pseudo-empty values like '<p></p>' or similar
* from being considered non-empty.
* @param mixed $data
* @return bool
*/
function is_empty(mixed $data) : bool {

	// note that zero value (0) is considered as empty too
	if (empty($data)) {
		return true;
	}

	switch (true) {

		case is_object($data):

			foreach ($data as $property) {
				return false;
			}
			return true;

		case is_array($data):

			foreach ($data as $value) {
				if (!is_empty($value)) {
					return false;
				}
			}
			return true;

		case is_string($data):

			$data_trimmed = trim($data);
			if (empty($data_trimmed) || trim(strip_tags($data_trimmed))==='') {
				return true;
			}
			return false;

		default:

			return false;
	}
}//end is_empty



/**
* GET_FILE_EXTENSION
* Extracts the file extension from a filename or path.
*
* Uses pathinfo() to parse the filename and extract the extension.
* Optionally converts the extension to lowercase for consistent comparison.
*
* @param string $name The filename or path to extract the extension from.
* @param bool $lowercase Whether to convert the extension to lowercase (default: true).
* @return string The file extension without the dot, or empty string if no extension found.
*/
function get_file_extension(string $name, bool $lowercase=true) : string {

	$path_parts = pathinfo($name);

	$extension = $path_parts['extension'] ?? '';

	if ($lowercase===true && !empty($extension)) {
		return strtolower($extension);
	}

	return $extension;
}//end get_file_extension



/**
* GET_CLIENT_IP
* Cascade client IP resolution from server vars.
*
* SEC-017: this function trusts client-controllable headers
* (HTTP_CLIENT_IP, HTTP_X_FORWARDED_FOR, HTTP_FORWARDED, ...). It is acceptable
* for *informational* uses such as logging the apparent client IP, but it MUST
* NOT be used to make security decisions (allowlisting, rate-limiting, audit
* trust). Use {@see get_client_ip_trusted()} for those.
*
* @return string $ip_address
*/
function get_client_ip() : string {

	if (isset($_SERVER['HTTP_CLIENT_IP'])) {
		$ip_address = $_SERVER['HTTP_CLIENT_IP'];
	}
	else if(isset($_SERVER['HTTP_X_FORWARDED_FOR'])) {
		$ip_address = $_SERVER['HTTP_X_FORWARDED_FOR'];
	}
	else if(isset($_SERVER['HTTP_X_FORWARDED'])) {
		$ip_address = $_SERVER['HTTP_X_FORWARDED'];
	}
	else if(isset($_SERVER['HTTP_FORWARDED_FOR'])) {
		$ip_address = $_SERVER['HTTP_FORWARDED_FOR'];
	}
	else if(isset($_SERVER['HTTP_FORWARDED'])) {
		$ip_address = $_SERVER['HTTP_FORWARDED'];
	}
	else if(isset($_SERVER['REMOTE_ADDR'])) {
		$ip_address = $_SERVER['REMOTE_ADDR'];
	}
	else {
		$ip_address = 'UNKNOWN';
	}


	return $ip_address;
}//end get_client_ip



/**
* GET_CLIENT_IP_TRUSTED
* Returns the connecting peer's IP address, suitable for security decisions.
*
* By default the function returns $_SERVER['REMOTE_ADDR'] verbatim. Forwarded
* headers (X-Forwarded-For, Forwarded, X-Real-IP) are honoured ONLY when the
* immediate peer's REMOTE_ADDR matches one of the addresses listed in the
* DEDALO_TRUSTED_PROXIES configuration constant. This prevents an arbitrary
* client from spoofing its source IP by injecting an X-Forwarded-For header.
*
* DEDALO_TRUSTED_PROXIES, when defined, must be an array of literal IP addresses
* (CIDR notation is not supported here). Example:
*     define('DEDALO_TRUSTED_PROXIES', ['127.0.0.1', '10.0.0.5']);
*
* @return string IP address or empty string if it cannot be determined.
*/
function get_client_ip_trusted() : string {

	$remote_addr = $_SERVER['REMOTE_ADDR'] ?? '';
	if ($remote_addr === '') {
		return '';
	}

	$trusted = (defined('DEDALO_TRUSTED_PROXIES') && is_array(DEDALO_TRUSTED_PROXIES))
		? DEDALO_TRUSTED_PROXIES
		: [];

	// If the immediate peer is not a trusted proxy, ignore forwarded headers.
	if (!in_array($remote_addr, $trusted, true)) {
		return $remote_addr;
	}

	// Trusted proxy path: walk X-Forwarded-For from right to left, returning
	// the first address that is itself NOT a trusted proxy. That is the
	// originating client per RFC 7239.
	$forwarded_for = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
	if ($forwarded_for !== '') {
		$candidates = array_map('trim', explode(',', $forwarded_for));
		for ($i = count($candidates) - 1; $i >= 0; $i--) {
			$candidate = $candidates[$i];
			if ($candidate !== '' && !in_array($candidate, $trusted, true)) {
				return $candidate;
			}
		}
	}

	return $remote_addr;
}//end get_client_ip_trusted



/**
* SAML_SAFE_REDIRECT_TARGET
* SEC-014: turn a SAML RelayState (or any other user-controllable redirect
* target) into a URL that is guaranteed to live under DEDALO_ROOT_WEB.
*
* Rejected inputs (all fall back to DEDALO_ROOT_WEB):
*  - non-string / empty values
*  - absolute URLs (`http://...`, `https://...`, `javascript:...`, ...)
*  - protocol-relative URLs (`//evil.example/...`)
*  - backslash-prefixed values (Windows-style `\\evil`)
*  - URLs whose final form does not start with DEDALO_ROOT_WEB
*
* Accepted inputs:
*  - relative paths (`/foo/bar`, `foo/bar`) under the same origin
*  - already-DEDALO_ROOT_WEB-prefixed absolute paths
*
* @param mixed $relay_state
* @return string Safe absolute path/URL to redirect to.
*/
function saml_safe_redirect_target(mixed $relay_state) : string {

	// SEC-104: when `DEDALO_ROOT_WEB` is the empty string (root-mounted
	// install) the original logic produced an empty fallback, which the
	// browser would resolve relative to the current URL — i.e. silently
	// stay on the ACS endpoint instead of leaving it. Coerce to '/' so
	// the fallback is always an absolute, same-origin path.
	$fallback = defined('DEDALO_ROOT_WEB') ? (string)DEDALO_ROOT_WEB : '/';
	if ($fallback === '') {
		$fallback = '/';
	}

	if (!is_string($relay_state) || $relay_state === '') {
		return $fallback;
	}

	$candidate = trim($relay_state);
	if ($candidate === '') {
		return $fallback;
	}

	// Block obviously hostile prefixes before any further parsing.
	if (str_starts_with($candidate, '//')
		|| str_starts_with($candidate, '\\')
		|| preg_match('/^[a-z][a-z0-9+.-]*:/i', $candidate) === 1
	) {
		// Absolute or protocol-relative; only allow if it is an exact
		// DEDALO_ROOT_WEB-prefixed URL (e.g. fully-qualified URLs the IdP
		// might echo back to us).
		if (str_starts_with($candidate, $fallback)) {
			return $candidate;
		}
		return $fallback;
	}

	// Path-only candidate. Normalise leading slash and ensure it stays under
	// the configured web root.
	$path = $candidate[0] === '/' ? $candidate : ('/' . $candidate);
	$root = rtrim($fallback, '/');
	if ($root === '' || str_starts_with($path, $root . '/') || $path === $root) {
		return $path;
	}
	// $root has a non-trivial prefix and $path doesn't include it; prepend.
	return $root . $path;
}//end saml_safe_redirect_target



/**
* SAML_ASSERTION_REGISTER_OR_REJECT
* SEC-078: SAML assertion replay protection.
*
* `OneLogin\Saml2\Response::isValid()` only verifies signature + the
* `NotOnOrAfter` validity window. Inside that window the very same signed
* SAMLResponse XML can be POSTed to `/core/login/saml/acs.php` repeatedly,
* which would log the user in over and over (fixation/escalation when
* combined with a stolen RelayState). The SAML core spec explicitly
* mandates one-time-use of each assertion ID, so we maintain a small
* on-disk cache of consumed assertion IDs and refuse any duplicate seen
* before the assertion's `NotOnOrAfter` expiry.
*
* Storage: one zero-byte file per assertion under
*   `DEDALO_SESSIONS_PATH/saml_seen/<sha256(assertion_id)>.lock`
* The `fopen('xb')` create-or-fail open is the atomic primitive — only the
* first request through the door succeeds; concurrent replays observe
* `false` and are rejected. We also opportunistically prune entries older
* than the longest possible NotOnOrAfter window (1 hour cap) to keep the
* directory bounded under steady traffic.
*
* @param object $samlResponse OneLogin\Saml2\Response (or compatible).
* @return bool true when the assertion is fresh and now consumed,
*              false when it was seen before (caller MUST reject the
*              login attempt) or when the cache cannot be reached.
*/
function saml_assertion_register_or_reject(object $samlResponse) : bool {

	// Pull assertion id + NotOnOrAfter from the response. Both are
	// available on `OneLogin\Saml2\Response` since v3.x; we guard with
	// method_exists() to remain compatible with older or stubbed shims.
	$assertion_id = method_exists($samlResponse, 'getAssertionId')
		? (string)$samlResponse->getAssertionId()
		: '';
	if ($assertion_id === '') {
		// Without a stable id we cannot deduplicate; fail closed.
		debug_log(__FUNCTION__
			. ' SEC-078 assertion has no Id; rejecting to prevent replay.'
			, logger::ERROR
		);
		return false;
	}

	$expiry = method_exists($samlResponse, 'getAssertionNotOnOrAfter')
		? (int)$samlResponse->getAssertionNotOnOrAfter()
		: 0;
	if ($expiry <= 0) {
		// Cap to 5 minutes (typical SAML default) when the library does
		// not expose the value — better than caching forever.
		$expiry = time() + 300;
	}
	// Hard cap so a hostile IdP cannot push the cache TTL out forever.
	$max_expiry = time() + 3600;
	if ($expiry > $max_expiry) {
		$expiry = $max_expiry;
	}

	// Cache directory under DEDALO_SESSIONS_PATH (already gitignored,
	// already writable by the PHP process).
	$base = defined('DEDALO_SESSIONS_PATH')
		? rtrim((string)DEDALO_SESSIONS_PATH, '/')
		: sys_get_temp_dir() . '/dedalo_sessions';
	$dir = $base . '/saml_seen';
	if (!is_dir($dir)) {
		// Recursive mkdir; ignore the race where another worker created it.
		@mkdir($dir, 0700, true);
		if (!is_dir($dir)) {
			debug_log(__FUNCTION__
				. ' SEC-078 cannot create replay cache dir: ' . $dir
				, logger::ERROR
			);
			return false;
		}
	}

	// Sanitised filename. SHA-256 over the assertion id removes any
	// path-traversal risk should the IdP send unusual characters.
	$file = $dir . '/' . hash('sha256', $assertion_id) . '.lock';

	// Opportunistic GC of stale entries (1-in-50 odds per request to keep
	// the cost amortised).
	if (mt_rand(1, 50) === 1) {
		$cutoff = time() - 3600;
		foreach ((array)glob($dir . '/*.lock') as $stale) {
			if (@filemtime($stale) < $cutoff) {
				@unlink($stale);
			}
		}
	}

	// Atomic create-or-fail. PHP's `xb` mode maps to O_CREAT|O_EXCL.
	$fh = @fopen($file, 'xb');
	if ($fh === false) {
		// Already exists — replay.
		return false;
	}
	@fwrite($fh, (string)$expiry);
	@fclose($fh);
	// Set mtime to the assertion expiry so the GC sweep above can reason
	// about freshness without parsing file contents.
	@touch($file, $expiry);

	return true;
}//end saml_assertion_register_or_reject




/**
* GET_COOKIE_PROPERTIES
* @return object $cookie_properties
* Calculate safe cookie properties to use on set/delete http cookies
* @return object $cookie_properties
*/
function get_cookie_properties() : object {

	// Cookie properties
	$domain		= $_SERVER['SERVER_NAME'] ?? '';
	$secure		= stripos(DEDALO_PROTOCOL,'https')!==false ? true : false;
	$httponly	= true; // Not accessible for Javascript, only for http/s requests

	$cookie_properties = new stdClass();
		$cookie_properties->domain		= $domain;
		$cookie_properties->secure		= $secure;
		$cookie_properties->httponly	= $httponly;


	return $cookie_properties;
}//end get_cookie_properties



/**
* CREATE_DIRECTORY
* Create given directory if not already exists
* @param string $folder_path
* 	Absolute directory path as '/home/html/dedalo/media/folder'
* @param int $create_dir_permissions = 0750
* 	PHP target directory permissions expressed like 0750
* @return bool
* 	true when directory already exists or is created successfully
* 	false when not exists and is not possible to create it for any reason
*/
function create_directory(string $folder_path, int $create_dir_permissions=0750) : bool {

	if( !is_dir($folder_path) ) {

		debug_log(__METHOD__
			." CREATING DIR: $folder_path"
			, logger::WARNING
		);

		if(!mkdir($folder_path, $create_dir_permissions, true)) {

			// error creating directory
			debug_log(__METHOD__
				.' Error on read or create directory. Permission denied' . PHP_EOL
				.' php user: ' . exec('whoami') .PHP_EOL
				.' folder_path: ' .$folder_path . PHP_EOL
				.' create_dir_permissions: ' . to_string($create_dir_permissions)
				, logger::ERROR
			);

			return false;
		}

		// directory created successfully
		debug_log(__METHOD__
			." CREATED DIR: $folder_path"
			, logger::WARNING
		);
	}

	return true;
}//end create_directory



/**
* GET_BACKTRACE_SEQUENCE
* Gets sequence of function calls to current section
* Used for debug only
* @return array $seq
* 	Array of strings with the name of the functions ordered from newest to oldest
* 	e.g. ['get_children','read']
*/
function get_backtrace_sequence() : array  {

	$bt = debug_backtrace();
	$seq = [];
	foreach ([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20] as $key) {

		$name_function	= $bt[$key]['function'] ?? null;
		$name_class		= $bt[$key]['class'] ?? null;

		$ar_name = [];
		if (isset($name_class)) {
			$ar_name[] = $name_class;
		}
		if (isset($name_function)) {
			$ar_name[] = $name_function;
		}

		// skip empty
		if (empty($ar_name)) {
			continue;
		}

		$seq[] = implode(':', $ar_name);
	}

	return $seq;
}//end get_backtrace_sequence



/**
* CHECK_URL
* Exec a PHP HEAD request to verify if URL is reachable. Returns true only
* on HTTP 200.
*
* SEC-077: this helper has no production callers (verified via grep). It is
* a SSRF-prone primitive (`get_headers()` honours `php://`, `file://`,
* etc. via the default stream context) and bypasses all the hardening in
* {@see curl_request()}. We apply the {@see is_safe_remote_url()} gate
* defensively so any future revival is automatically constrained to
* http/https targets resolving to public addresses.
*
* @deprecated since SEC-077. Prefer curl_request() with is_safe_remote_url().
* @param string $url
* @return bool
*/
function check_url( string $url ) : bool {

	if (!is_safe_remote_url($url)) {
		return false;
	}

	try {

		$context = stream_context_create(
			[
				'http' => array(
					'method' => 'HEAD'
				)
			]
		);

		$headers = get_headers($url, false, $context);

		$first_line = $headers[0] ?? '';

		if ( strpos($first_line, ' 200 ')!==false) {
			return true;
		}

	} catch (Exception $e) {

		debug_log(__METHOD__
			. " Exception checking URL: $url " . PHP_EOL
			. ' Caught exception: ' . $e->getMessage()
			, logger::DEBUG
		);
	}


	return false;
}//end check_url



/**
* IS_ONTOLOGY_AVAILABLE
* Check if Ontology (dd_ontology) is reachable
* @return bool
*/
function is_ontology_available() : bool {

	try {

		$ontology_node	= ontology_node::get_instance('dd1');
		$term			= $ontology_node->get_term_data();

		return is_object($term);

	} catch (Exception $e) {
		debug_log(__METHOD__
			. " Error (exception) on check term dd_ontology column" . PHP_EOL
			. ' Caught exception: ' . $e->getMessage()
			, logger::ERROR
		);

		return false;
	}
 }//end is_ontology_available



 /**
 * GET_RELATION_NAME
 * Resolves tipo to constant name for relations
 * @param string|null $tipo
 * @return string
 */
function get_relation_name( ?string $tipo ) : string {

	switch ($tipo) {
		case 'dd151':	return 'DEDALO_RELATION_TYPE_LINK';
		case 'dd48':	return 'DEDALO_RELATION_TYPE_CHILDREN_TIPO';
		case 'dd47':	return 'DEDALO_RELATION_TYPE_PARENT_TIPO';
		case 'dd96':	return 'DEDALO_RELATION_TYPE_INDEX_TIPO';
		case 'dd675':	return 'DEDALO_RELATION_TYPE_FILTER';
		case 'dd77':	return 'DEDALO_RELATION_TYPE_ONTOLOGY';
		case 'dd98':	return 'DEDALO_RELATION_TYPE_MODEL_TIPO';
		case 'dd490':	return 'DEDALO_RELATION_TYPE_STRUCT_TIPO';
		default:		return 'Not defined';
	}
 }//end get_relation_name



/**
* ARE_ALL_PROPERTIES_EMPTY
* Checks if a given object has all its properties empty.
* Considers as empty:
*	"" (empty string)
*	0 (0 as an integer)
*	0.0 (0 as a float)
*	"0" (0 as a string)
*	null
*	false
*	array() (empty array)
*/
function are_all_properties_empty( object $object ) : bool {
    $properties = get_object_vars($object);
    $non_empty_properties = array_filter($properties);

    return empty($non_empty_properties);
}//end are_all_properties_empty



/**
 * NORMALIZE_ARRAY
 * Converts objects to arrays, sorts keys of internal elements, and sorts the outer array.
 * It recursively sorts the keys of each object and then sorts
 * the outer array itself so that the internal structure is identical regardless of how it started.
 * Use as:
 * 	$isEqual = normalize_array($array1) === normalize_array($array2);
 * @param array $arr The array to normalize.
 * @return array The normalized array.
 */
function normalize_array(array $arr) : array {
    // 1. Convert objects to associative arrays (easier to sort)
    $arr = json_decode(json_encode($arr), true);

    // 2. Sort the keys of each internal element
    foreach ($arr as &$item) {
        if (is_array($item)) {
            ksort($item);
        }
    }

    // 3. Sort the outer array based on the serialized values of the items
    usort($arr, function($a, $b) {
        return serialize($a) <=> serialize($b);
    });

    return $arr;
}//end normalize_array



/**
* DEBUG_PREPARED_STATEMENT
* Resolve SQL parameters for debugging.
* @param string $sql_template
* @param array $params
* @param object $connection
* @return string $debug_sql
*/
function debug_prepared_statement( string $sql_template, array $params, $connection = null ) : string {
    $debug_sql = $sql_template;

    foreach ($params as $i => $param) {
        if ($connection) {
            $value = is_string($param) ? pg_escape_literal($connection, $param) : $param;
        } else {
            // Simple escaping for debugging only
            if (is_string($param)) {
                $value = "'" . addslashes($param) . "'";
            } elseif (is_null($param)) {
                $value = 'NULL';
            } elseif (is_bool($param)) {
                $value = $param ? 'TRUE' : 'FALSE';
            } else {
                $value = $param;
            }
        }

        $debug_sql = str_replace('$' . ($i + 1), (string)$value, $debug_sql);
    }

    $debug_sql = clean_sql($debug_sql);

    return $debug_sql;
}//end debug_prepared_statement



/**
 * CLEAN_SQL
 * Normalizes SQL string formatting by removing leading whitespace from each line,
 * trimming trailing whitespace, and discarding empty lines.
 *
 * @param string $sql Raw SQL string potentially containing extra indentation and blank lines.
 * @return string Cleaned SQL string with consistent formatting.
 */
function clean_sql(string $sql): string {
    $lines = explode("\n", $sql);

    $lines = array_map(fn($line) => rtrim(preg_replace('/^[\t ]+/', '', $line)), $lines);
    $lines = array_filter($lines, fn($line) => $line !== '');

    return implode("\n", $lines);
}//end clean_sql
