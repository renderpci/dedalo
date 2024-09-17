<?php
declare(strict_types=1);
/**
 * CORE FUNCTIONS
 * Moved from core/base/core_functions.php to shared/core_functions.php
 * to prevent duplication of functions in publication classes
 */



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
function dump(mixed $val, string $var_name=null, array $arguments=null) : string {

	// ignore dump in CLI mode
		if (php_sapi_name()==='cli' && SHOW_DEBUG===false) {
			return '';
		}

	// Back-trace info of current execution
		$bt = debug_backtrace();

	// msg
		$msg  = ' DUMP ' . PHP_EOL
			   .' Caller: ' . str_replace(DEDALO_ROOT_PATH, '', $bt[0]['file']) . PHP_EOL
			   .' Line: '.@$bt[0]['line'];

	// LEVEL 1

		// function
			if (isset($bt[1]['function'])) {
				$msg .= PHP_EOL . ' Inside method: ' . $bt[1]['function'];
			}

		// var_name
			if(isset($var_name)) {
				$msg .= PHP_EOL . ' name: '. $var_name . PHP_EOL
				. ' +++++++++++++++++++++++++++++++++++++++++++++++++++// '.$var_name.' //+++++++++++++++++++++++++++++++++++++++++++++++++++';
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

	return php_sapi_name()==='cli';
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
* @return int|null $full_username
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
}//end logged_user_is_developer



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
			'bold'			=> "\033[1m%s\033[0m",
			'dark'			=> "\033[2m%s\033[0m",
			'italic'		=> "\033[3m%s\033[0m",
			'underline'		=> "\033[4m%s\033[0m",
			'blink'			=> "\033[5m%s\033[0m",
			'reverse'		=> "\033[7m%s\033[0m",
			'concealed'		=> "\033[8m%s\033[0m",
			// foreground colors
			'black'			=> "\033[30m%s\033[0m",
			'red'			=> "\033[31m%s\033[0m",
			'green'			=> "\033[32m%s\033[0m",
			'yellow'		=> "\033[33m%s\033[0m",
			'blue'			=> "\033[34m%s\033[0m",
			'magenta'		=> "\033[35m%s\033[0m",
			'cyan'			=> "\033[36m%s\033[0m",
			'white'			=> "\033[37m%s\033[0m",
			// background colors
			'bg_black'		=> "\033[40m%s\033[0m",
			'bg_red'		=> "\033[41m%s\033[0m",
			'bg_green'		=> "\033[42m%s\033[0m",
			'bg_yellow'		=> "\033[43m%s\033[0m",
			'bg_blue'		=> "\033[44m%s\033[0m",
			'bg_magenta'	=> "\033[45m%s\033[0m",
			'bg_cyan'		=> "\033[46m%s\033[0m",
			'bg_white'		=> "\033[47m%s\033[0m"
		];

	// level string
		$level_string = logger::level_to_string($level);

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
			if ( running_in_cli()===true ) {
				$msg = 'DEBUG_LOG ['.$level_string.'] '. $info;
			}else{
				$msg = sprintf(
					$colorFormats['cyan'],
					'DEBUG_LOG ['.$level_string.'] '. $info
				);
			}
			break;

		case logger::ERROR:

			if ( running_in_cli()===true ) {

				$msg = 'DEBUG_LOG ['.$level_string.'] '. $info;

			}else{
				// backtrace
				$bt			= debug_backtrace();
				$source		= $bt[0];
				$base_msg	= 'DEBUG_LOG ['.$level_string.']' . PHP_EOL
					. ' ' . $info .' '. PHP_EOL
					. ' [File]: ' . $source['file'].' '. PHP_EOL
					. ' [Line]: ' . $source['line'].' ';

				$msg = sprintf($colorFormats['bg_yellow'], $base_msg);
			}

			// DEDALO_ERRORS ADD
			$_ENV['DEDALO_LAST_ERROR'] = $info;
			break;

		case logger::CRITICAL:

			if ( running_in_cli()===true ) {

				$msg = 'DEBUG_LOG ['.$level_string.'] '. $info;

			}else{

				// backtrace
					$bt		= debug_backtrace();
					$source	= $bt[0];

				$base_msg = 'DEBUG_LOG ['.$level_string.']' . PHP_EOL
					. ' ' . $info .' '. PHP_EOL
					. ' [File]: ' . $source['file'].' '. PHP_EOL
					. ' [Line]: ' . $source['line'].' ';

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

	// options
		$url			= $options->url; // mandatory
		$post			= $options->post ?? true;
		$postfields		= $options->postfields ?? null;
		$returntransfer	= $options->returntransfer ?? 1;
		$followlocation	= $options->followlocation ?? true;
		$header			= $options->header ?? true;
		$ssl_verifypeer	= $options->ssl_verifypeer ?? false;
		$ssl_verifyhost	= $options->ssl_verifyhost ?? false;
		$timeout		= isset($options->timeout) ? (int)$options->timeout : 5; // seconds
		$proxy			= $options->proxy ?? false;
		$httpheader		= $options->httpheader ?? null; // array('Content-Type:application/json')

	// response
		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

	// open connection
		$ch = curl_init();

	// set basic options
		curl_setopt($ch, CURLOPT_URL, $url); // Like 'http://domain.com/get-post.php'
		curl_setopt($ch, CURLOPT_POST, $post); // bool default true
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, $returntransfer); // int default 1
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

	// SSL. Avoid verify SSL certificates (very slow)
		curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, $ssl_verifypeer); // bool default false
		curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, $ssl_verifyhost); // bool default false

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
					break;
				case 400:
					$debug_level = logger::WARNING;
					$msg .= "Error. Bad Request. Server has problems connecting to file";
					break;
				default:
					$debug_level = logger::ERROR;
					$msg .= "Error. check_remote_server problem found";
					break;
			}
			debug_log(__METHOD__
				. ' httpcode: ' . $httpcode . PHP_EOL
				. ' url: ' . $url . PHP_EOL
				. ' msg: ' . $msg . PHP_EOL
				. ' bt:  ' . to_string( debug_backtrace()[0] )
				, $debug_level
			);

	// curl_errno check. Verify if any error has occurred on CURL execution
		$error_info = false;
		try {
			// Check if any error occurred
			if(curl_errno($ch)) {
				$error_info	 = curl_error($ch);
				$msg		.= '. curl_request Curl error: ' . $error_info;
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
			debug_log(__METHOD__
				.' curl_request Caught exception: ' . $e->getMessage()
				, logger::ERROR
			);
		}

	// close connection
		curl_close($ch);

	// response
		$response->msg		= $msg;
		$response->error	= $error_info;
		$response->code		= $httpcode;
		$response->result	= $result;


	return $response;
}//end curl_request



/**
* START_TIME
* Returns the system's high resolution time, counted from an arbitrary point in time.
* The delivered timestamp is monotonic and can not be adjusted.
* @return float $time (nanoseconds)
*/
function start_time() : int {

	return hrtime(true); // nanoseconds
}//end start_time



/**
* EXEC_TIME_UNIT
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
* @param float $start
* 	time expressed in days, hours, minutes, seconds or milliseconds from function start_time()
* @return string $result
* 	as '3.521 hour'
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
// function to_string(mixed $var=null) : string {
function to_string(mixed $var=null) : string {

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
function get_dir_files(string $dir, array $ext, ?callable $processor=null) : array {

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
* @return int|date
*/
function get_last_modification_date(string $path, array $allowedExtensions=null, array $ar_exclude=['/acc/','/backups/']) {

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
* @param string $path
* @param array $allowed_extensions
* @param function|null $fn_validate = null
* @return string|null $last_modified_file
*/
function get_last_modified_file(string $path, array $allowed_extensions, $fn_validate=null) : ?string {

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
		if (!empty($directory_iterator)) foreach ($directory_iterator as $name => $object) {

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
* Encrypt given value
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
* @param string $string_value
* @param string $key = DEDALO_INFORMATION
* @return string $output
*/
function dedalo_decrypt_openssl(string $string_value, string $key=DEDALO_INFORMATION) : string {

	if (!function_exists('openssl_decrypt')) {
		throw new Exception("Error Processing Request: Lib OPENSSL unavailable.", 1);
	}

	$encrypt_method = "AES-256-CBC";
	// iv - encrypt method AES-256-CBC expects 16 bytes - else you will get a warning
	$secret_iv = DEDALO_INFO_KEY;
	$iv = substr(hash('sha256', $secret_iv), 0, 16);

	$output = openssl_decrypt(base64_decode($string_value), $encrypt_method, md5(md5($key)), 0, $iv);

	if ( $output!==false && is_serialized($output) ) {
		return unserialize($output);
	}else{
		debug_log(__METHOD__
			." Current string is not correctly serialized !"
			, logger::ERROR
		);
		return '';
	}
}//end dedalo_decrypt_openssl



/**
* IS_SERIALIZED
* Check value to find if it was serialized.
* @param string $data   Value to check to see if was serialized.
* @param bool $strict Optional. Whether to be strict about the end of the string. Default true.
* @return bool False if not serialized and true if it was.
 */
function is_serialized( $data, $strict = true ) {
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
* @return array|boolean
*   The path to the parent of the first occurrence of the key, represented as an array where entries are consecutive keys.
* 	by http://thereisamoduleforthat.com/content/dealing-deep-arrays-php
*/
function array_key_path(string $needle, array $haystack, array $forbidden=array(), array $path=array()) {

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

	return trim(str_replace("\t", '', $strQuery));
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
* @param string $tipo = null
* @return bool
*/
function verify_dedalo_prefix_tipos(string $tipo=null) : bool {

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



// decbin32
// In order to simplify working with IP addresses (in binary) and their
// netmasks, it is easier to ensure that the binary strings are padded
// with zeros out to 32 characters - IP addresses are 32 bit numbers
function decbin32(int $dec) : string {

	return str_pad(decbin($dec), 32, '0', STR_PAD_LEFT);
}



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
* @param string $url
* @return int|false
*/
function get_http_response_code(string $url) : int|false {
	stream_context_set_default(
		array(
			'http' => array(
				'method' => 'HEAD'
			)
		)
	);
	$headers = get_headers($url);

	if ($headers===false || !isset($headers[0])) {
		return false;
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
* Use only for fast application lang tld resolve
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
* @return mixed $value
*/
function safe_xss(mixed $value) : mixed {

	if (!empty($value) && is_string($value)) {

		if ($decode_json=json_decode($value)) {
			// If var is a stringify JSON, not verify string now
		}else{
			// It's NOT JSON data
			$value = strip_tags($value,'<br><strong><em>');
			$value = htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
		}
	}

	return $value;
}//end safe_xss



/**
* SAFE_SQL_QUERY
* @return string $value
*/
function safe_sql_query(string $sql_query) : string {

	// WORKING HERE..

	/*
	if (is_string($value)) {

		if ($decode_json=json_decode($value)) {
			// If var is a stringify json, not verify string now
		}else{
			$value = strip_tags($value,'<br><strong><em>');
			$value = htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
		}
	}
	#error_log("value: ".to_string($value));
	*/

	return $sql_query;
}//end safe_sql_query



/**
* CHECK_SESSIONS_DIRECTORY
* Verify the existence of target session directory.
* If not already exists, it creates a new one
* @return bool
*/
function check_sessions_directory() : bool {

	$folder_path = defined('DEDALO_SESSIONS_PATH')
		? DEDALO_SESSIONS_PATH
		: @session_save_path();

	// Target folder exists test
	if(!is_dir($folder_path) ) {

		// try to create it
		if(!mkdir($folder_path, 0750, true)) {

			// error (use trigger_error here because log manager is not ready yet)
			trigger_error(__METHOD__
				.' Error on read or create sessions directory. Permission denied' . PHP_EOL
				.' folder_path: ' .$folder_path
			);

			return false;
		}

		// OK. Directory created (use error_log here because log manager is not ready yet)
		error_log(__METHOD__
			." CREATED DIR: $folder_path  "
		);
	}


	return true;
}//end check_sessions_directory



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

	// check already started session case
		if(session_status()===PHP_SESSION_ACTIVE) {
			return false;
		}

	// options
		$save_handler			= $options['save_handler'] ?? 'files';
		$timeout_seconds		= $options['timeout_seconds'] ?? 1400;
		$probability			= $options['probability'] ?? null;
		$gc_divisor				= $options['gc_divisor'] ?? null;
		$cookie_path			= $options['cookie_path'] ?? '/';
		$cookie_domain			= $options['cookie_domain'] ?? '';
		$cookie_secure			= $options['cookie_secure'] ?? false;
		$cookie_samesite		= $options['cookie_samesite'] ?? null;
		$save_path				= $options['save_path'] ?? false; // /tmp/php
		$additional_save_path	= $options['additional_save_path'] ?? false; // /session_custom_sec
		$session_name			= $options['session_name'] ?? false;
		$prevent_session_lock	= $options['prevent_session_lock'] ?? false;

	// switch by save_handler
	switch ($save_handler) {

		case 'files':
			// short vars
				$timeout = $timeout_seconds;

			// cache_expire. Set lifetime of cache (this no affect to session duration)
				session_cache_expire( intval($timeout*60) ); // in minutes (*60). Default PHP is usually 180

			// gc_maxlifetime. Set the max lifetime
				ini_set('session.gc_maxlifetime', $timeout);

			// cookie_lifetime. Set the session cookie to timeout
				ini_set('session.cookie_lifetime', $timeout);

			// session_name
				if ($session_name!==false) {
					session_name($session_name);
				}

			// save_path
				if ($save_path!==false) {
					ini_set('session.save_path', $save_path);
				}

			// additional_save_path
				if ($additional_save_path!==false) {
					// Change the save path. Sessions stored in the same path
					// all share the same lifetime; the lowest lifetime will be
					// used for all. Therefore, for this to work, the session
					// must be stored in a directory where only sessions sharing
					// it's lifetime are. Best to just dynamically create on.
					$path = ini_get('session.save_path') . $additional_save_path;
					if(!file_exists($path)) {
						if(!mkdir($path, 0700)) {
							trigger_error("Failed to create session save path directory '$path'. Check permissions.", E_USER_ERROR);
							debug_log(__METHOD__
								. " Failed to create session save path directory. Check permissions." . PHP_EOL
								. ' path: ' . to_string($path)
								, logger::ERROR
							);
						}
					}
					ini_set('session.save_path', $path);
				}

			// gc_probability. Set the chance to trigger the garbage collection.
				if (!is_null($probability)) {
					ini_set('session.gc_probability', $probability);
				}

			// gc_divisor
				if (!is_null($gc_divisor)) {
					ini_set('session.gc_divisor', $gc_divisor); // Should always be 100
				}

			// session start
				$session_is_ok = ($prevent_session_lock===true)
					? session_start(['read_and_close' => true])
					: session_start();
				// error starting session case
				if ( $session_is_ok !== true ) {
					if (defined('DEDALO_SESSIONS_PATH')) {
						if( !check_sessions_directory() ){
							$msg = 'Unable to write sessions. Review your permissions for sessions directory path 1';
							debug_log(__METHOD__
								. $msg . PHP_EOL
								, logger::ERROR
							);
							die($msg);
						}
						// try again, after DEDALO_SESSIONS_PATH directory is forced to create
						session_start();
					}else{
						$msg = 'Unable to write sessions. Review your permissions for sessions directory path 2';
						debug_log(__METHOD__
							. $msg . PHP_EOL
							, logger::ERROR
						);
						die($msg);
					}
				}

			// cookie
				// Renew the time left until this session times out.
				// If you skip this, the session will time out based
				// on the time when it was created, rather than when
				// it was last used.
				if(isset($_COOKIE[session_name()])) {

					$cookie_values = (object)[
						// name. The name of the cookie.
						'name'		=> session_name(),
						// value. The value of the cookie. This value is stored on the clients computer; do not store sensitive information. Assuming the name is 'cookiename', this value is retrieved through $_COOKIE['cookiename']
						'value'		=> $_COOKIE[session_name()],
						// expires. The time the cookie expires. This is a Unix timestamp so is in number of seconds since the epoch. In other words, you'll most likely set this with the time() function plus the number of seconds before you want it to expire. Or you might use mktime(). time()+60*60*24*30 will set the cookie to expire in 30 days. If set to 0, or omitted, the cookie will expire at the end of the session (when the browser closes).
						'expires'	=> (time() + $timeout),
						// path. The path on the server in which the cookie will be available on. If set to '/', the cookie will be available within the entire domain. If set to '/foo/', the cookie will only be available within the /foo/ directory and all sub-directories such as /foo/bar/ of domain. The default value is the current directory that the cookie is being set in.
						'path'		=> $cookie_path,
						// domain. The (sub)domain that the cookie is available to. Setting this to a subdomain (such as 'www.example.com') will make the cookie available to that subdomain and all other sub-domains of it (i.e. w2.www.example.com). To make the cookie available to the whole domain (including all subdomains of it), simply set the value to the domain name ('example.com', in this case).
						'domain'	=> $cookie_domain,
						// secure. Indicates that the cookie should only be transmitted over a secure HTTPS connection from the client. When set to true, the cookie will only be set if a secure connection exists. On the server-side, it's on the programmer to send this kind of cookie only on secure connection (e.g. with respect to $_SERVER["HTTPS"]).
						'secure'	=> $cookie_secure,
						// httponly. When true the cookie will be made accessible only through the HTTP protocol. This means that the cookie won't be accessible by scripting languages, such as JavaScript. It has been suggested that this setting can effectively help to reduce identity theft through XSS attacks (although it is not supported by all browsers), but that claim is often disputed. true or false
						'httponly'	=> true
					];

					// set cookie
						$arr_cookie_options = array (
							'expires'	=> $cookie_values->expires,
							'path'		=> '/',
							'domain'	=> $cookie_values->domain,	// leading dot for compatibility or use subdomain. ex. .example.com
							'secure'	=> $cookie_values->secure,	// true or false
							'httponly'	=> $cookie_values->secure,	// true or false
							'samesite'	=> $cookie_samesite			// None|Lax|Strict
						);
						setcookie($cookie_values->name, $cookie_values->value, $arr_cookie_options);
				}
			break;

		case 'memcached':
			ini_set('session.save_handler', 'memcached');
			// Connection type: '127.0.0.1:11211' , '/usr/local/var/memcached/memcached.sock'
			ini_set('session.save_path', $save_path);

			// Start the session!
			session_start();
			break;

		case 'postgresql':
			// session manager
			require_once 'session/PGSessions.php';
			$connectionString = 'pgsql:host='.DEDALO_HOSTNAME_CONN.' port='.DEDALO_DB_PORT_CONN.' dbname='.DEDALO_DATABASE_CONN.' user='.DEDALO_USERNAME_CONN.' password='.DEDALO_PASSWORD_CONN;
			$pdo_connection   = new PDO($connectionString);
			// use \PGSessions\PGSessions;
			$sessions_handler = new PGSessions($pdo_connection);
			session_set_save_handler($sessions_handler, true);

			// Start the session!
			session_start();
			break;
	}


	return true;
}//end session_start_manager



/**
* SAFE_TABLE
* Remove extra malicious code
* @param string $table
* @return string|bool $table
*/
function safe_table(string $table) : string|bool {

	preg_match("/^[a-zA-Z_]+$/", $table, $output_array);
	if (empty($output_array[0])) {
		return false;
	}

	return $table;
}//end safe_table



/**
* SAFE_LANG
* Remove extra malicious code
* @param string $lang
* @return string|bool $lang
*/
function safe_lang(string $lang) : string|bool {

	preg_match("/^lg-[a-z]{2,8}$/", $lang, $output_array);
	if (empty($output_array[0])) {
		return false;
	}

	return $lang;
}//end safe_lang



/**
* SAFE_TIPO
* Remove extra malicious code
* @param string $tipo
* @return string|bool $tipo
*/
function safe_tipo(string $tipo) : string|bool {

	preg_match("/^[a-z]+[0-9]+$/", $tipo, $output_array);
	if (empty($output_array[0])) {
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

	preg_match("/^[0-9]+$/", (string)$section_id, $output_array);
	if (empty($output_array[0])) {
		return false;
	}

	return $section_id;
}//end safe_section_id



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
* @param string $str
* @return string
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
* GET_CURRENT_VERSION_IN_DB
* Get the version of the data into the DB
* The data version need to be compatible with the program files, but,
* when Dédalo program change (for update), the data and the program is un-sync before admin run the update
* @return array $current_version
*/
function get_current_version_in_db() : array {

	// cache
		static $calculated_current_version;
		if (isset($calculated_current_version)) {
			return $calculated_current_version;
		}

	$current_version = [];

	try {

		// Query all updates records
			$strQuery = '
				SELECT datos
				FROM "matrix_updates"
				-- ORDER BY datos->>\'dedalo_version\' DESC
				-- LIMIT 1
			';
			$result = JSON_RecordObj_matrix::search_free($strQuery);
			if ($result!==false) {

				$ar_dedalo_version = [];
				while ($rows = pg_fetch_assoc($result)) {
					$datos_encoded	= (string)$rows['datos'];
					$datos			= (object)json_handler::decode($datos_encoded);
					// add dedalo_version
					$ar_dedalo_version[] = $datos->dedalo_version;
				}

				// sort in natural way (ASC)
				natsort($ar_dedalo_version);
				$ar_dedalo_version = array_values($ar_dedalo_version);

				// pick the last one
				$key			= count($ar_dedalo_version) - 1;
				$last_version	= $ar_dedalo_version[$key] ?? null;
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
		// error_log( 'Caught exception: ' . $e->getMessage() );
		debug_log(__METHOD__
			." Caught exception: " . PHP_EOL
			.' exception: ' . $e->getMessage()
			, logger::ERROR
		);
	}


	return $current_version;
}//end get_current_version_in_db



/**
* GET_DEDALO_VERSION
* Get the program files version, the files need change for update the data.
* Download the Dédalo files and run the update procedure.
* @return array $current_version
*/
function get_dedalo_version() : array {

	$current_version = [];

	$ar_version = explode(".", DEDALO_VERSION);

	$current_version[0]	= (int)$ar_version[0];
	$current_version[1]	= (int)$ar_version[1];
	$current_version[2]	= (int)$ar_version[2];

	return $current_version;
}//end get_dedalo_version



/**
* CHECK_BASIC_SYSTEM
* @return object $response
*/
function check_basic_system() : object {

	$response = new stdClass();
		$response->result	= false;
		$response->msg		= 'Error. check_basic_system failed';

	// basic system files check
	// langs js
		# Generate js files with all labels (if not exist current lang file)
		$folder_path = DEDALO_CORE_PATH.'/common/js/lang';
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, 0777,true)) {
				$response->msg = 'Error on read or create js/lang directory. Permission denied';
				debug_log(__METHOD__
					. " ".$response->msg
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

	$response->result 	= true;
	$response->msg 		= 'OK. check_basic_system done';

	return $response;
}//end check_basic_system



/**
* ARRAY_FIND
* Equivalent of JAVASCRIPT find
* @param array $ar_value = null
* @param callable $n
* @return mixed
* Return null when nothing is found
*/
function array_find(array $ar_value=null, callable $fn) : mixed {

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
function get_legacy_constant_value(string $constant_name) {

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
* TEST_PHP_VERSION_SUPPORTED
* Test if PHP version is supported
* @param string $minimum_php_version = '8.1.0'
* @return bool
*/
function test_php_version_supported(string $minimum_php_version='8.1.0') : bool {

	if (version_compare(PHP_VERSION, $minimum_php_version) >= 0) {
		return true;
	}else{
		debug_log(__METHOD__
			." This PHP version (".PHP_VERSION.") is not supported ! Please update your PHP to $minimum_php_version or higher ASAP "
			, logger::ERROR
		);
		return false;
	}
}//end test_php_version_supported



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
* BUILD_LINK
* @param string $name
* @param array $arguments
* @return string $link
*/
function build_link(string $name, array $arguments) : string {

	$url	= $arguments['url'] ?? null;
	$css	= $arguments['css'] ?? '';
	$target	= $arguments['target'] ?? '_blank';

	$link = "<a href=\"$url\" target=\"$target\" class=\"$css\">$name</a>";

	return $link;
}//end build_link



/**
* IS_EMPTY_DATO
* Check if data given is considered empty
* This prevents pseudo-empty values like '<p></p>' or similar
* from being considered non-empty.
* @param mixed $dato
* @return bool
*/
function is_empty_dato(mixed $dato) : bool {

	// note that zero value (0) is considered as empty too
	if (empty($dato)) {
		return true;
	}

	switch (true) {

		case is_array($dato):

			foreach ($dato as $value) {
				if (!is_empty_dato($value)) {
					return false;
				}
			}
			return true;

		case is_string($dato):

			$dato_trimmed = trim($dato);
			if (empty($dato_trimmed) || trim(strip_tags($dato_trimmed))==='') {
				return true;
			}
			return false;

		default:

			return false;
	}
}//end is_empty_dato



/**
* GET_FILE_EXTENSION
* @param string $name
* @param bool $lowercase = true
* @return string $extension
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
* Cascade client IP resolution from server vars
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
function create_directory(string $folder_path, int $create_dir_permissions=0750) {

	if( !is_dir($folder_path) ) {
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
* GET_BACTRACE_SEQUENCE
* Gets sequence of function calls to current section
* Used for debug only
* @return array $seq
* 	Array of strings with the name of the functions ordered from newest to oldest
* 	e.g. ['get_children','read']
*/
function get_bactrace_sequence() : array  {

	$bt = debug_backtrace();
	$seq = [];
	foreach ([1,2,3,4,5,6,7,8] as $key) {
		if (isset($bt[$key]['function'])) {
			$seq[] = $bt[$key]['function'];
		}
	}

	return $seq;
}//end get_bactrace_sequence
