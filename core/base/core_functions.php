<?php



/**
* DUMP
* @param $val
*	Value to show. Can be a string / array / object
* @param $var_name
*	Name of var received. Is optional
* @param $expected
*	Expected value for reference
*
* @return string $html
*	Nothing
*	Only print (formatted as <pre>code</pre>) the info and value or dumped var
*/
function dump($val, string $var_name=null, array $arguments=[]) : string {

	$html = '';


	// Back-trace info of current execution
	$bt = debug_backtrace();


	$html .= " DUMP ".PHP_EOL."  Caller: ".str_replace(DEDALO_ROOT_PATH,'',$bt[0]['file']);
	$html .= PHP_EOL ." Line: ".@$bt[0]['line'];

	# NIVEL 1

		# FUNCTION
		if (isset($bt[1]['function']))
			$html .= PHP_EOL . " Inside method: ".$bt[1]['function'];

		# VAR_NAME
		if(isset($var_name))
			$html .= PHP_EOL . " name: <strong>". $var_name . '</strong>';

		# EXPECTED
		if(isset($expected))
			$html .= PHP_EOL . " val expected: <em> $expected </em>";

		# EXEC_TIME
		if(isset($start_time)) {
			$html .= PHP_EOL . " exec_time: <em> ".exec_time_unit($start_time)." </em>";
		}

		# arguments (optional)
		if(isset($arguments) && is_array($arguments)) foreach ($arguments as $key => $value) {
			$html .= PHP_EOL . " $key: <em> $value </em>";
		}

		# VALUE
		$value_html='';
		$html .= PHP_EOL . " value: " ;
		switch (true) {
			case is_null($val):
				$value_html .= json_encode($val);
				break;
			case is_bool($val):
				$value_html .= json_encode($val);
				break;
			case is_array($val):
				#$value_html .= var_export($val, true);
				$value_html .= json_encode($val,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
				break;
			case is_object($val):
				#$value_html .= var_export($val,true);
				$value_html .= json_encode($val,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
				break;
			default:
				if(is_string($val) && $val != strip_tags($val)) {
					$val = htmlspecialchars($val);
				}
				$value_html .= var_export($val, true);
				break;
		}

		$html .= trim($value_html);

		# TYPE
		$html .= PHP_EOL . " type: ".gettype($val)."";


	# NIVEL 2

		# CALLER FUNCTION
		if (isset($bt[2]) && isset($bt[2]['file'])) {
			$html .= PHP_EOL . " Caller2: ";
			$html .= " ". print_r($bt[2]['file'],true);
			$html .= PHP_EOL . " Function: ". print_r($bt[2]['function'],true);
			$html .= " [Line: ". print_r($bt[2]['line'],true)."]";
		}


	# PRINT
	if(SHOW_DEBUG===true) {
		// print wrap_pre($html);
		// echo "<script>console.log('PHP: ".$html."');</script>";

		$str_json = file_get_contents('php://input');
		#error_log("++++>>>> ".to_string($str_json));
		if (!$str_json && empty($_POST)) {
			// not exists call php://input
			print wrap_pre($html);
		}
	}

	# CONSOLE ERROR LOG ALWAYS
	error_log(PHP_EOL.'-->'.$html);

	#return wrap_pre($html);
	return $html;
}//end dump



/**
* WRAP_PRE
*/
function wrap_pre(string $string, bool $add_header_html=true) : string {
	$html='';
	#$html .= "\n<html xmlns=\"http://www.w3.org/1999/xhtml\" ><body>";
	if ($add_header_html) {
		$html .= '<!DOCTYPE html>';
		$html .= '<html lang="en">';
		$html .= '<head>';
		$html .= '<meta charset="utf-8">';
		$html .= '</head><body>';
	}
	$style = 'tab-size:2;white-space:pre-wrap;overflow:auto;min-width:500px;font-family:monospace;color:#4B5D5E;font-size:0.8em;background-color:rgba(217, 227, 255, 0.8);border-radius:5px;padding:10px;position:relative;z-index:1';
	$html .= "<pre class=\"dump\" style=\"$style\">";
	$html .= "<div class=\"icon_warning\"></div>";
	$html .= stripslashes($string);
	$html .= "</pre>";
	if ($add_header_html) {
		$html .= '</body></html>';
	}
	return $html;
}//end wrap_pre



/**
* WRAP_HTML
*/
function wrap_html(string $string, bool $htmlspecialchars=true) {
	$html='';
	$html .= '<!DOCTYPE html>';
	$html .= '<html lang="en"><head>';
	$html .= '<meta charset="utf-8">';
	$html .= '</head><body>';
	if ($htmlspecialchars) {
		$string = htmlspecialchars($string);
	}
	$html .= nl2br( $string );
	$html .= '</body></html>';

	return $html;
}//end wrap_html



/**
* DEBUG_LOG
* Print a php error log message
* @param string $info
* @param int $level
* @return $bool
*/
function debug_log(string $info, int $level=logger::DEBUG) : bool {

	// only debug mode and a minimum level generates messages
		if(SHOW_DEBUG!==true || $level > LOGGER_LEVEL) {
			return false;
		}

	// level ref
		// const DEBUG		= 100;
		// const INFO		= 75;
		// const NOTICE		= 50;
		// const WARNING	= 25;
		// const ERROR		= 10;
		// const CRITICAL	= 5;

	if ($level<11) {
		$colorFormats = array(
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
		);
		$base_msg	= 'DEBUG_LOG ['.logger::level_to_string($level).'] '.PHP_EOL. $info;
		$msg		= sprintf($colorFormats['bg_yellow'], $base_msg);
	}else{
		$msg		= 'DEBUG_LOG ['.logger::level_to_string($level).'] '. $info;
	}

	error_log($msg);

	return true;
}//end debug_log



/**
* FILE_GET_CONTENTS_CURL
* @param string $url
* @return mixed $data
*/
	// function file_get_contents_curl(string $url) {

	// 	$ch = curl_init();
	// 	curl_setopt($ch, CURLOPT_HEADER, 0);
	// 	curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
	// 	curl_setopt($ch, CURLOPT_URL, $url);
	// 	curl_setopt($ch, CURLOPT_FOLLOWLOCATION, 1);

	// 	// Prevent to verify ssl certificates (very slow)
	// 	curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

	// 	// A given cURL operation should only take XXX seconds max.
	// 	curl_setopt($ch, CURLOPT_TIMEOUT, 10); // int default 10

	// 	$data = curl_exec($ch);

	// 	// Check if any error occurred
	// 		if (!curl_errno($ch)) {
	// 			// no errors
	// 			$info = curl_getinfo($ch);
	// 			// echo 'Took ', $info['total_time'], ' seconds to send a request to ', $info['url'], "\n";
	// 			debug_log(__METHOD__.' Success on get_contents_curl: '.to_string($info), logger::INFO);

	// 		}else{
	// 			// errors found
	// 			$info = curl_getinfo($ch);
	// 			debug_log(__METHOD__.' Error on get_contents_curl: '.to_string($info), logger::ERROR);
	// 		}


	// 	curl_close($ch);

	// 	return $data;
	// }//end file_get_contents_curl



/**
* CURL_REQUEST
* @return object $response
* 	msg: string info about execution
* 	code: int httpcode response from server
* 	error: mixed error info from CURL if exists. Else false
* 	result: mixed data received from server
*/
function curl_request(object $options) : object {

	// options
		$url			= $options->url; // mandatory
		$post			= isset($options->post) ? $options->post : true;
		$postfields		= $options->postfields ?? null;
		$returntransfer	= $options->returntransfer ?? 1;
		$followlocation	= isset($options->followlocation) ? $options->followlocation : true;
		$header			= isset($options->header) ? $options->header : true;
		$ssl_verifypeer	= isset($options->ssl_verifypeer) ? $options->ssl_verifypeer : false;
		$timeout		= isset($options->timeout) ? (int)$options->timeout : 5; // seconds
		$proxy			= $options->proxy ?? false;

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

	// proxy. Use connection proxy on demand
		if ($proxy!==false) {
			curl_setopt($ch, CURLOPT_PROXY, $proxy); // like '127.0.0.1:8888'
		}

	// SSL. Avoid verify SSL certificates (very slow)
		curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, $ssl_verifypeer); // bool default false

	// A given cURL operation should only take XXX seconds max.
		curl_setopt($ch, CURLOPT_TIMEOUT, $timeout); // int default 5

	// execute post
		$result = curl_exec($ch);

	// status code. Info about result
		$httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
		// debug_log(__METHOD__." ".$url." status code: ".to_string($httpcode), logger::WARNING);

	// message. Generate a human readable info
		$msg = '';
		switch ($httpcode) {
			case 200:
				$msg .= "OK. check_remote_server passed successfully (status code: $httpcode)";
				break;
			case 401:
				$msg .= "Error. Unauthorized code (status code: $httpcode)";
				break;
			case 400:
				$msg .= "Error. Server has problems collect structure files (status code: $httpcode)";
				break;
			default:
				$msg .= "Error. check_remote_server problem found (status code: $httpcode)";
				break;
		}
		debug_log(__METHOD__.' '.$url.' msg: '.$msg, logger::WARNING);

	// curl_errno check. Verify if any error has occurred on CURL execution
		$error_info = false;
		try {
			// Check if any error occurred
			if(curl_errno($ch)) {
				$error_info	 = curl_error($ch);
				$msg		.= '. curl_request Curl error:' . $error_info;
				debug_log(__METHOD__.' '.$url.' error_info: '.$error_info, logger::ERROR);
			}else{
				// no errors
				$full_info = curl_getinfo($ch);
				debug_log(__METHOD__.' Success on get_contents_curl: '.to_string($full_info), logger::INFO);
			}
		} catch (Exception $e) {
			$msg .= '. curl_request Caught exception:' . $e->getMessage();
			debug_log(__METHOD__.' curl_request Caught exception:' . $e->getMessage(), logger::ERROR);
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
function start_time() {

	return hrtime(true); // nanoseconds
}//end start_time



/**
* EXEC_TIME
* @return string
*/
function exec_time($start, string $method=null, $result=null) : string {

	$total = exec_time_unit($start, 'ms', 3);

	$exec = ($total>100)
		? sprintf(' Exec in <span style=\'color:red\'>%.3f ms.</span>', $total)
		: sprintf(' Exec in %.3f ms.', $total);

	$final_string = '<b>' . $method . '</b>' . $exec ;

	if(!empty($result)) {
		$final_string .= ' Res '.to_string($result) ;
	}


	return '<pre>'.$final_string.'</pre>' ;
}//end exec_time



/**
* EXEC_TIME
* @param float $start
* 	time in nanoseconds from function start_time()
* @param string $unit = 'ms' (milliseconds)
* 	possible values: ns|ms|sec
* @param int $round = 3
* 	Math total rounded to value
* @return string
*/
function exec_time_unit(float $start, string $unit='ms', int $round=3) : string {

	$total_ns	= start_time() - $start;
	$total		= ($unit==='ms')
		? $total_ns/1e+6 // ($total/1e+6) nanoseconds to milliseconds
		: $total_ns;

	// round
		$result = round($total, $round);

	return $result;
}//end exec_time_unit



/**
* TO_STRING
* Get input var as parsed string
* @return string
*/
// function to_string(mixed $var=null) : string {
function to_string($var=null) : string {

	if(is_null($var)) {
		return '';
	}

	if (is_string($var) && (strpos($var, '{')===0 || strpos($var, '[')===0)) {
		$var = json_decode($var);
	}

	if (is_array($var)) {

		if(empty($var)) {
			return 'Array(empty)';
		}else if ( is_string(current($var)) || is_numeric(current($var)) ) {
			if (is_associative($var)) {
				return json_encode($var, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
			}else{
				return implode('|', $var);
			}
		}else if( is_object( current($var) ) ){
			foreach ($var as $obj) {
				$ar_ob[] = $obj;
			}
			return print_r($ar_ob,true);
		}

		return print_r($var, true);

	}else if (is_object($var)) {
		$var = json_encode($var, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
		return $var;
		#$var = json_decode($var);
		#return '<pre>'.print_r($var,true).'</pre>';
	}else if (is_bool($var)) {
		$var = (int)$var;
	}

	return "$var";
}//end to_string



/**
* GET_LAST_MODIFICATION_DATE
* Get last modified file date in all Dedalo files
* This will return a timestamp, you will have to use date() like date("d-m-Y H:i:s ", $ret))
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
* @return string|null $last_modified_file
*/
function get_last_modified_file(string $path, array $allowed_extensions) {

	// First we set up the iterator
		$iterator			= new RecursiveDirectoryIterator($path);
		$directory_iterator	= new RecursiveIteratorIterator($iterator);

	// Sets a var to receive the last modified filename
		$last_modified_file = null;

	// Then we walk through all the files inside all folders in the base folder
		if (!empty($directory_iterator)) foreach ($directory_iterator as $name => $object) {

			$ar_bits	= explode(".", $name);
			$extension	= end($ar_bits);
			if (!in_array($extension, $allowed_extensions)) continue;

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
			debug_log(__METHOD__." No files found in directory path: ".to_string($path), logger::ERROR);
		}

	return $last_modified_file;
}//end get_last_modified_file



/**
* DEDALO_ENCRYPT_OPENSSL
* @return string $output
*/
function dedalo_encrypt_openssl(string $stringArray, string $key=DEDALO_INFORMACION) : string {

	if (!function_exists('openssl_encrypt')) throw new Exception("Error Processing Request: Lib OPENSSL unavailable.", 1);

	$encrypt_method = "AES-256-CBC";
	// iv - encrypt method AES-256-CBC expects 16 bytes - else you will get a warning
	$secret_iv = DEDALO_INFO_KEY;
	$iv = substr(hash('sha256', $secret_iv), 0, 16);

	$output = base64_encode(openssl_encrypt(serialize($stringArray), $encrypt_method, md5(md5($key)), 0, $iv));

	return $output;
}//end dedalo_encrypt_openssl



/**
* DEDALO_DECRYPT_OPENSSL
* @return string $output
*/
function dedalo_decrypt_openssl(string $stringArray, string $key=DEDALO_INFORMACION) : string {

	if (!function_exists('openssl_decrypt')) throw new Exception("Error Processing Request: Lib OPENSSL unavailable.", 1);

	$encrypt_method = "AES-256-CBC";
	// iv - encrypt method AES-256-CBC expects 16 bytes - else you will get a warning
	$secret_iv = DEDALO_INFO_KEY;
	$iv = substr(hash('sha256', $secret_iv), 0, 16);

	$output = openssl_decrypt(base64_decode($stringArray), $encrypt_method, md5(md5($key)), 0, $iv);

	if ( is_serialized($output) ) {
		return unserialize($output);
	}else{
		debug_log(__METHOD__." Current string is not correctly serialized ! ".to_string(), logger::ERROR);
		return '';
	}
}//end dedalo_decrypt_openssl



/**
* IS_SERIALIZED
* Check if given string is serialized
* @return bool
*/
function is_serialized(string $str) : bool {

	return ($str == serialize(false) || @unserialize($str)!==false);
}//end is_serialized



/**
* ENCRYPTION_MODE
* Return current crypt mode to use looking current Dédalo version
* @return string
*/
function encryption_mode() : string {

	# Overwrites calculated mode. Useful for clean install
	if (defined('ENCRYPTION_MODE')) {
		return ENCRYPTION_MODE;
	}

	$current_version = get_current_version_in_db();

	$min_subversion = 22; # real: 22 (see updates.php)
	if( ($current_version[0] >= 4 && $current_version[1] >= 0 && $current_version[2] >= $min_subversion) ||
		($current_version[0] >= 4 && $current_version[1] >= 5) ||
		 $current_version[0] > 4
	  ) {
		return 'openssl';
	}else{
		debug_log(__METHOD__." !! USING OLD CRYPT METHOD (mcrypt). Please use openssl ".to_string(), logger::WARNING);
		return 'mcrypt';
	}
}//end encryption_mode



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
* @return
*   The path to the parent of the first occurrence of the key, represented as an array where entries are consecutive keys.
* by http://thereisamoduleforthat.com/content/dealing-deep-arrays-php
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
* Given a path, return a reference to the array entry.
* @param $array
*   A keyed array.
* @param $path
*   An array path, represented as an array where entries are consecutive keys.
* @return
*   A reference to the entry that corresponds to the given path.
* by http://thereisamoduleforthat.com/content/dealing-deep-arrays-php
*/
	// function &array_path(&$array, $path) {
	//   $offset =& $array;
	//   if ($path) foreach ($path as $index) {
	// 	$offset =& $offset[$index];
	//   }

	//   return $offset;
	// }//end array_path



/**
* ARRAY_KEYS_RECURSIVE
* Flat an array
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
*/
function array_flatten(array $array) : array {

   $result = array();
   foreach ($array as $key => $value) {
	   if (is_array($value)){ $result = array_merge($result, array_flatten($value));}
	   else {$result[$key] = $value;}
   }
   return $result;
}//end array_flatten



/**
* REARRANGE_ARRAY
* Rearrange the array to your desired output
*/
function rearrange_array($array, $key) {
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
* CLEAN_URL_VARS : Elimina variables no deseadas del query en la url
*/
	// function clean_url_vars(array $current_var=[]) : string {

	// 	$qs = '';

	// 	$queryString = $_SERVER['QUERY_STRING']; # like max=10

	// 	$search  = array('&&',	'&=',	'=&',	'??',	);
	// 	$replace = array('&',	'&',	'&',	'?',	);
	// 	$queryString = str_replace($search, $replace, $queryString);

	// 	$posAND 	= strpos($queryString, '&');
	// 	$posEQUAL 	= strpos($queryString, '=');

	// 	$ar_excluded_vars = array(	'pageNum',
	// 								'search',
	// 								'reset'
	// 								);
	// 	foreach ($current_var as $current_value) {
	// 		$ar_excluded_vars[] = $current_value;
	// 	}

	// 	if($posAND !== false) { # query tipo ?m=list&t=dd334&pageNum=3

	// 		$ar_pares = explode('&', $queryString);
	// 		if(is_array($ar_pares)) foreach ($ar_pares as $par){

	// 			$troz		= @ explode('=',$par) ;
	// 			if($troz) {
	// 				$varName	= NULL;
	// 				if (isset($troz[0])) {
	// 					$varName = $troz[0];
	// 				}

	// 				$varValue 	= NULL;
	// 				if (isset($troz[1])) {
	// 					$varValue= $troz[1];
	// 				}

	// 				#if($varName !='pageNum' && $varName !='accion' && $varName !='reset' ){
	// 				if (!in_array($varName, $ar_excluded_vars)) {
	// 					$qs .= $varName . '=' . $varValue .'&';
	// 				}
	// 			}
	// 		}
	// 	}else if($posAND === false && $posEQUAL !== false) { # query tipo ?m=list&t=dd334

	// 		$qs = $queryString ;
	// 	}

	// 	$qs = str_replace($search, $replace, $qs);

	// 	# if last char is & delete it
	// 	if(substr($qs, -1)=='&') $qs = substr($qs, 0, -1);

	// 	return $qs ;
	// }//end clean_url_vars



/**
* SANITIZE_OUTPUT
*/
	// function sanitize_output($buffer) {

	// 	$search = array(
	// 		'/\>[^\S ]+/s', //strip whitespaces after tags, except space
	// 		'/[^\S ]+\</s', //strip whitespaces before tags, except space
	// 		'/(\s)+/s'  // shorten multiple whitespace sequences
	// 		);
	// 	$replace = array(
	// 		'>',
	// 		'<',
	// 		'\\1'
	// 		);
	// 	$buffer = preg_replace($search, $replace, $buffer);
	// 	return $buffer;
	// }



/**
* SANITIZE_QUERY
*/
function sanitize_query(string $strQuery) : string {

	return trim(str_replace("\t", '', $strQuery));
}//end sanitize_query



/**
* FIX_CONFIG4_VAR
* Set a cascading config4 variable, based on availability and by prevalence order (REQUEST,SESSION,DEFAULT)
* @param string $var_name
* @param mixed $var_default_value
*
* @return mixed $var_value
*/
// function fix_cascade_config4_var(string $var_name, mixed $var_default_value) : mixed {
function fix_cascade_config4_var(string $var_name, $var_default_value) { // 7.4 compatible

	switch (true) {
		# REQUEST (GET/POST)
		case !empty($_REQUEST[$var_name]) :
			$var_value = trim( safe_xss($_REQUEST[$var_name]) );
			$_SESSION['dedalo']['config'][$var_name]= $var_value; # Save in session too
			break;
		# SESSION
		case !empty($_SESSION['dedalo']['config'][$var_name]) :
			$var_value = $_SESSION['dedalo']['config'][$var_name];
			break;
		# DEFAULT
		default:
			$var_value = $var_default_value;
			break;
	}

	return $var_value;
}//end fix_cascade_config4_var



/**
* VERIFY_DEDALO_PREFIX_TIPOS
* @return bool
*/
function verify_dedalo_prefix_tipos(string $tipo=null) : bool {

	return true; # Temporal hasta que se valore lo de los prefijos dinámicos de hierarchy

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
* BUILD_SORTER
* @param string key
* @return function order
*/
function build_sorter(string $key) {
	return function ($a, $b) use ($key) {
		if (!isset($a[$key]) || !isset($b[$key])) {
			return;
		}

		return strnatcmp($a[$key], $b[$key]);
	};
}//end build_sorter



/**
* SEARCH_STRING_IN_ARRAY
* Search with preg_match a string match in array of strings
* @return array $matches
*	Array of coincidences about search string
*/
function search_string_in_array(array $array, string $search_string) : array {

	# Coverts string to "all" combinations of accents like gàvia to g[aàáâãäå]v[iìíîï][aàáâãäå]
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
* @return string
*/
function add_accents(string $string) : string {
	$array1 = array('a', 'c', 'e', 'i' , 'n', 'o', 'u', 'y');
	$array2 = array('[aàáâãäå]','[cçćĉċč]','[eèéêë]','[iìíîï]','[nñ]','[oòóôõö]','[uùúûü]','[yýÿ]');

	return str_replace($array1, $array2, mb_strtolower($string));
}//end add_accents



/**
* ARRAY_GET_BY_KEY
*/
function array_get_by_key(array $array, $key) : array {

	$results = array();
	array_get_by_key_r($array, $key, $results);

	return $results;
}
function array_get_by_key_r(array $array, $key, &$results) {
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



/*
 * ip_in_range.php - Function to determine if an IP is located in a
 *                   specific range as specified via several alternative
 *                   formats.
 *
 * Network ranges can be specified as:
 * 1. Wildcard format:     1.2.3.*
 * 2. CIDR format:         1.2.3/24  OR  1.2.3.4/255.255.255.0
 * 3. Start-End IP format: 1.2.3.0-1.2.3.255
 *
 * Return value BOOLEAN : ip_in_range($ip, $range);
 *
 * Copyright 2008: Paul Gregg <pgregg@pgregg.com>
 * 10 January 2008
 * Version: 1.2
 *
 * Source website: http://www.pgregg.com/projects/php/ip_in_range/
 * Version 1.2
 *
 * This software is Donationware - if you feel you have benefited from
 * the use of this tool then please consider a donation. The value of
 * which is entirely left up to your discretion.
 * http://www.pgregg.com/donate/
 *
 * Please do not remove this header, or source attribution from this file.
 */



// decbin32
// In order to simplify working with IP addresses (in binary) and their
// netmasks, it is easier to ensure that the binary strings are padded
// with zeros out to 32 characters - IP addresses are 32 bit numbers
function decbin32($dec) {

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
*/
function ip_in_range($ip, $range) {

  if (strpos($range, '/') !== false) {
	// $range is in IP/NETMASK format
	list($range, $netmask) = explode('/', $range, 2);
	if (strpos($netmask, '.') !== false) {
	  // $netmask is a 255.255.0.0 format
	  $netmask = str_replace('*', '0', $netmask);
	  $netmask_dec = ip2long($netmask);
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

	echo 'Range argument is not in 1.2.3.4/24 or 1.2.3.4/255.255.255.0 format';

	return false;
  }
}//end ip_in_range



/**
* BR2NL
*/
function br2nl(string $string) : string {

	return str_replace( array('<br>','<br />'), "\n", $string );
}//end br2nl



/**
* GET_HTTP_RESPONSE_CODE
*/
function get_http_response_code(string $theURL) : int {
	stream_context_set_default(
		array(
			'http' => array(
				'method' => 'HEAD'
			)
		)
	);
	$headers = get_headers($theURL);

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
* CAST
* @param string|object $destination
* @param object $sourceObject
* @return object
*/
function cast($destination, $sourceObject) {

	if (is_string($destination)) {
		$destination = new $destination();
	}
	$sourceReflection		= new ReflectionObject($sourceObject);
	$destinationReflection	= new ReflectionObject($destination);
	$sourceProperties		= $sourceReflection->getProperties();

	foreach ($sourceProperties as $sourceProperty) {

		$sourceProperty->setAccessible(true);
		$name	= $sourceProperty->getName();
		$value	= $sourceProperty->getValue($sourceObject);

		if ($destinationReflection->hasProperty($name)) {
			$propDest = $destinationReflection->getProperty($name);
			$propDest->setAccessible(true);
			$propDest->setValue($destination,$value);
		} else {
			$destination->$name = $value;
		}
	}

	return $destination;
}//end cast



/**
* LOG_MESSAGES
* Print a message in all pages to active users
* @param mixed $vars
*/
function log_messages($vars, string $level='error') : string {

	$html ='';

	if (is_array($vars)) {
		foreach ($vars as $key => $value) {
			$html .= "$key => $value";
		}
	}elseif (is_object($vars)) {
		$html .= print_r($vars,true);
	}else{
		$html .= $vars;
	}

	return $html;
}//end log_messages



/**
* NOTICE_TO_ACTIVE_USERS
* Print a message in all pages to active users
*/
function notice_to_active_users(array $ar_options) {

	$msg	= $ar_options['msg'];
	$mode	= $ar_options['mode'];

	log_messages($msg, $mode);
}//end notice_to_active_users



/**
* GET_REQUEST_VAR
* Check if var exists in $_REQUEST environment. If not do a fallback to search var in php://input (for
* example in trigger JSON requests)
* @return mixed|bool $var_value
*/
function get_request_var(string $var_name) {

	$var_value = null;

	if(isset($_REQUEST[$var_name]))  {

		// get from page request (GET/POST)
		$var_value = $_REQUEST[$var_name];

	}else{
		// get from php://input . Ex. the change modo from portal list to edit
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
function safe_xss($value) {

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
* SESSION_START_MANAGER
* Starts a session with a specific timeout and a specific GC probability.
* @param int $timeout The number of seconds until it should time out.
* @param int $probability The probability, in int percentage, that the garbage
*        collection routine will be triggered right now.
* @param string $cookie_path The base path for the cookie.
* @return bool
*/
// $sessiondb = null;
function session_start_manager(array $request_options) : bool {
	// global $sessiondb;
	#if (session_status()===PHP_SESSION_ACTIVE) return false;

	// options
		$options = new stdClass();
			$options->save_handler			= 'files';
			$options->timeout_seconds		= 1400;
			$options->probability			= null;
			$options->gc_divisor			= null;
			$options->cookie_path			= '/';
			$options->cookie_domain			= '';
			$options->cookie_secure			= false;
			$options->cookie_samesite		= null;
			$options->save_path				= false; # /tmp/php
			$options->aditional_save_path	= false; # /session_custom_sec
			$options->session_name			= false;
			$options->prevent_session_lock	= false;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

	// switch by save_handler
	switch ($options->save_handler) {

		case 'files':
			// short vars
				$timeout			= $options->timeout_seconds;
				$probability		= $options->probability;
				$gc_divisor			= $options->gc_divisor;
				$cookie_path		= $options->cookie_path;
				$cookie_domain		= $options->cookie_domain;
				$save_path			= $options->save_path;
				$cookie_secure		= $options->cookie_secure;
				$cookie_samesite	= $options->cookie_samesite;

			// cache_expire. Set lifetime of cache (this no affect to session duration)
				session_cache_expire( intval($timeout*60) ); 	#in minutes (*60)	Default php usually : 180

			// gc_maxlifetime. Set the max lifetime
				ini_set('session.gc_maxlifetime', $timeout);

			// cookie_lifetime. Set the session cookie to timeout
				ini_set('session.cookie_lifetime', $timeout);

			// save_path
				if ($options->save_path!==false) {
					ini_set('session.save_path', $save_path);
				}

			// session_name
				if ($options->session_name!==false) {
					session_name($options->session_name);
				}

			// aditional_save_path
				if ($options->aditional_save_path!==false) {
					// Change the save path. Sessions stored in the same path
					// all share the same lifetime; the lowest lifetime will be
					// used for all. Therefore, for this to work, the session
					// must be stored in a directory where only sessions sharing
					// it's lifetime are. Best to just dynamically create on.
					$path = ini_get('session.save_path') . $options->aditional_save_path;
					if(!file_exists($path)) {
						if(!mkdir($path, 0700)) {
							trigger_error("Failed to create session save path directory '$path'. Check permissions.", E_USER_ERROR);
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

			// session_start. Start the session!
				if ($options->prevent_session_lock===true) {
					// read only but non locking session
					session_start([
						'read_and_close' => true
					]);
				}else{
					session_start();
				}

			// cookie
				// Renew the time left until this session times out.
				// If you skip this, the session will time out based
				// on the time when it was created, rather than when
				// it was last used.
				if(isset($_COOKIE[session_name()])) {
					#setcookie(session_name(), $_COOKIE[session_name()], time() + $timeout, $cookie_path, $cookie_domain);
					// setcookie(session_name(), $_COOKIE[session_name()], time() + $timeout, $cookie_path, $cookie_domain, TRUE, TRUE);

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

					// setcookie(
						// 	$cookie_values->name,			// string $name
						// 	$cookie_values->value,		// string $value = ""
						// 	$cookie_values->expires,	// int $expires = 0
						// 	$cookie_values->path,			// string $path = ""
						// 	$cookie_values->domain,		// string $domain = ""
						// 	$cookie_values->secure,		// bool $secure = false
						// 	$cookie_values->httponly	// bool $httponly = false
						// );
						$arr_cookie_options = array (
							'expires'	=> $cookie_values->expires,
							'path'		=> '/',
							'domain'	=> $cookie_values->domain,	// leading dot for compatibility or use subdomain. ex. .example.com
							'secure'	=> $cookie_values->secure,	// true or false
							'httponly'	=> $cookie_values->secure,	// true or false
							'samesite'	=> $cookie_samesite					// None || Lax || Strict
						);
						setcookie($cookie_values->name, $cookie_values->value, $arr_cookie_options);
				}
			break;

		case 'memcached':
			ini_set('session.save_handler', 'memcached');
			# Connection type: '127.0.0.1:11211' , '/usr/local/var/memcached/memcached.sock'
			ini_set('session.save_path', $options->save_path);

			// Start the session!
			session_start();
			break;

		case 'postgresql':
			#
			# manejador de sesiones
			#
			require_once 'session/PGSessions.php';
			$connectionString = 'pgsql:host='.DEDALO_HOSTNAME_CONN.' port='.DEDALO_DB_PORT_CONN.' dbname='.DEDALO_DATABASE_CONN.' user='.DEDALO_USERNAME_CONN.' password='.DEDALO_PASSWORD_CONN;
			$pdo_connection   = new PDO($connectionString);

			#use \PGSessions\PGSessions;
			$sessions_handler = new PGSessions($pdo_connection);
			session_set_save_handler($sessions_handler, true);
			#session_name('MySessionName');
			#session_start();
			#session_regenerate_id(true);

			session_start();
			break;
	}

	return true;
}//end session_start_manager



/**
* SAFE_TABLE
* Remove extra malicious code
* @return string|bool $table
*/
function safe_table(string $table) {

	preg_match("/^[a-zA-Z_]+$/", $table, $output_array);
	if (empty($output_array[0])) {
		return false;
	}

	return $table;
}//end safe_table



/**
* SAFE_LANG
* Remove extra malicious code
* @return string|bool $lang
*/
function safe_lang(string $lang) {

	preg_match("/^lg-[a-z]{2,8}$/", $lang, $output_array);
	if (empty($output_array[0])) {
		return false;
	}

	return $lang;
}//end safe_lang



/**
* SAFE_TIPO
* Remove extra malicious code
* @return string|bool $tipo
*/
function safe_tipo(string $tipo) {

	preg_match("/^[a-z]+[0-9]+$/", $tipo, $output_array);
	if (empty($output_array[0])) {
		return false;
	}

	/*
	if ( strpos($tipo,',')!==false || strpos($tipo,';')!==false || strpos($tipo,'\'')!==false || strpos($tipo,'"')!==false ) {
		#exit("bad tipo ".htmlentities($tipo));
		debug_log(__METHOD__." bad tipo ".to_string($tipo), logger::ERROR);
		return false;
	}*/

	return $tipo;
}//end safe_tipo



/**
* SAFE_SECTION_ID
* Remove extra malicious code
* @return string|bool $section_id
*/
function safe_section_id( $section_id ) {

	preg_match("/^[0-9]+$/", $section_id, $output_array);
	if (empty($output_array[0])) {
		return false;
	}

	return $section_id;
}//end safe_section_id



/**
* FORMAT_SIZE_UNITS
* Format bytes to more human readable unit like KG, MB, GB
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
* @return string
*/
function encodeURIComponent(string $str) : string {
	$revert = array('%21'=>'!', '%2A'=>'*', '%27'=>"'", '%28'=>'(', '%29'=>')');

	return strtr(rawurlencode($str), $revert);
}//end encodeURIComponent



/**
* SHOW_MSG
* Decore msg with error, warning, etc. css
*/
function show_msg(string $msg, string $type='ERROR') {

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
* GET_CURRENT_VERION
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

		// Query the last row of matrix_updates, it is the last update, and the current version.
			$strQuery = 'SELECT id, datos
						 FROM "matrix_updates"
						 ORDER BY id DESC
						 LIMIT 1';

			$result = JSON_RecordObj_matrix::search_free($strQuery);
			// loop the rows
			if ($result!==false) {
				while ($rows = pg_fetch_assoc($result)) {
					$id				= (int)$rows['id'];
					$datos_encoded	= (string)$rows['datos'];
					$datos			= (object)json_handler::decode($datos_encoded);
					break;
				}
			}

		// version
			if (isset($datos)) {

				$ar_version = explode(".", $datos->dedalo_version);

				$current_version[0]	= (int)$ar_version[0];
				$current_version[1]	= (int)$ar_version[1];
				$current_version[2]	= (int)$ar_version[2];

				// cache
				$calculated_current_version = $current_version;
			}
	} catch (Exception $e) {
		// error_log( 'Caught exception: ' . $e->getMessage() );
		debug_log(__METHOD__." Caught exception: ".$e->getMessage(), logger::ERROR);
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
				debug_log(__METHOD__." ".$response->msg, logger::ERROR);
				return $response;
			}
			debug_log(__METHOD__." Created dir: $folder_path ", logger::WARNING);
		}
		$ar_langs = DEDALO_APPLICATION_LANGS;
		foreach ($ar_langs as $lang => $label) {
			$label_path = '/common/js/lang/' . $lang . '.js';
			if (!file_exists(DEDALO_CORE_PATH.$label_path)) {
				$ar_label	= label::get_ar_label($lang); // Get all properties
				$write		= file_put_contents( DEDALO_CORE_PATH.$label_path, json_encode($ar_label, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
				if ($write===false) {
					$response->msg = 'Error on write js/lang file. Permission denied. '.DEDALO_CORE_PATH.$label_path;
					debug_log(__METHOD__." ".$response->msg, logger::ERROR);
					return $response;
				}
				debug_log(__METHOD__." Generated js labels file for lang: $lang - $label_path ", logger::WARNING);
			}
		}

	// structure css
		// Generate css structure file (if not exist)
		// Removed!. No longer used
		// $file_path = DEDALO_CORE_PATH.'/common/css/structure.css';
		// if (!file_exists($file_path)) {
		// 	$build_structure_css_response = (object)css::build_structure_css();
		// 	debug_log(__METHOD__." Generated structure css file: $file_path ".$build_structure_css_response->msg, logger::WARNING);
		// }

	// database is available
		// $db_install_conn = install::get_db_install_conn();
		// if ($db_install_conn===false) {
		// 	$response->msg = 'Error on connect with database.';
		// 	debug_log(__METHOD__." ".$response->msg, logger::ERROR);
		// 	return $response;
		// }


	$response->result 	= true;
	$response->msg 		= 'Ok. check_basic_system done';

	return $response;
}//end check_basic_system



/**
* ARRAY_FIND
* Equivalent of JAVASCRIPT find
* @return mixed
* Return null when nothing is found
*/
function array_find(array $ar_value=null, $fn) {

	if (is_array($ar_value)) {
		// foreach ($ar_value as $x) {
		$ar_value_length = sizeof($ar_value);
		for ($i=0; $i < $ar_value_length ; $i++) {
			$x = $ar_value[$i];
			if (call_user_func($fn, $x)===true)
			return $x;
		}
	}

	return null;
}//end find



/**
* WRITE_SESSION_VALUE
* Simple assign value $_SESSION['xx'] = value
* Write the received value into target session
* Used to control session writes only
* @return bool false | value mixed
*/
function write_session_value(array $session_keys, $value) {

	if(session_status()===PHP_SESSION_ACTIVE){
		// write ready
		// $result = $session = $value;
		// $result = $_SESSION['dedalo'][$session_keys] = $value;
		$result = insert_into($_SESSION['dedalo'], $session_keys, $value);

	}else{

		trigger_error( '!!!!!!!!!!!!!!!!!! SESSION WRITE IS DISABLE '. json_encode($session_key) . ' - value: '. json_encode($value) );
		$result = false;
	}

	return $result;
}//end write_session_value



/**
* INSERT_INTO
* Insert value into array using any number of keys sequence
* like $_SESSION['dedalo']['config']['ddo'][$section_tipo][$ddo_key]
*/
function insert_into(&$array, array $keys, $value) {
	 $last = array_pop($keys);

	 foreach($keys as $key) {
		  if(!array_key_exists($key, $array) ||
			  array_key_exists($key, $array) && !is_array($array[$key])) {
				  $array[$key] = array();

		  }
		  $array = &$array[$key];
	 }
	 $array[$last] = $value;
}//end insert_into



/**
* GET_OBJECT_PROPERTY
* Extract value from a object using dynamic path array
* @return mixed
*/
function get_object_property(object $object, array $ar_property_path) {

	foreach ($ar_property_path as $property_name) {
		// basic protection against bad path
		if (!property_exists($object, $property_name)) return null;
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
			return false;
		}

	// get constant value
		$constant = constant($constant_name);

	// If it isn't a string, it isn't serialized, avoid this block
	if (is_string($constant)) {
		 // try to unserialize
		if (false!==($value = @unserialize($constant)) ) {
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Current constant is serialized ! Please edit your Dédalo config file and set without legacy serialization to best performance. NAME: ". $constant_name, logger::WARNING);
			}
			return $value;
		}
	}


	return $constant;
}//end get_legacy_constant_value



/**
* TEST_PHP_VERSION_SUPPORTED
* Test if PHP version is supported
* @param string $minimun_php_version = '8.1.0'
* @return bool
*/
function test_php_version_supported(string $minimun_php_version='8.1.0') : bool {

	if (version_compare(PHP_VERSION, $minimun_php_version) >= 0) {
		return true;
	}else{
		debug_log(__METHOD__." This PHP version (".PHP_VERSION.") is not supported ! Please update your PHP to $minimun_php_version or higher ASAP ", logger::ERROR);
		return false;
	}
}//end test_php_version_supported



/**
* FILTER_FILENAME
* Sanitize filenames for user uploaded files
* From Sean Vieira
* @param string $filename
* @param bool $beautify = true
* @return string $filename
*/
	// function filter_filename(string $filename, bool $beautify=true) : string {
	// 	// sanitize filename
	// 	$filename = preg_replace(
	// 		'~
	// 		[<>:"/\\\|?*]|           # file system reserved https://en.wikipedia.org/wiki/Filename#Reserved_characters_and_words
	// 		[\x00-\x1F]|             # control characters http://msdn.microsoft.com/en-us/library/windows/desktop/aa365247%28v=vs.85%29.aspx
	// 		[\x7F\xA0\xAD]|          # non-printing characters DEL, NO-BREAK SPACE, SOFT HYPHEN
	// 		[#\[\]@!$&\'()+,;=]|     # URI reserved https://www.rfc-editor.org/rfc/rfc3986#section-2.2
	// 		[{}^\~`]                 # URL unsafe characters https://www.ietf.org/rfc/rfc1738.txt
	// 		~x',
	// 		'X', $filename);
	// 	// avoids ".", ".." or ".hiddenFiles"
	// 	$filename = ltrim($filename, '.-');
	// 	// optional beautification
	// 	if ($beautify) $filename = beautify_filename($filename);
	// 	// maximize filename length to 255 bytes http://serverfault.com/a/9548/44086
	// 	$ext = pathinfo($filename, PATHINFO_EXTENSION);
	// 	$filename = mb_strcut(pathinfo($filename, PATHINFO_FILENAME), 0, 255 - ($ext ? strlen($ext) + 1 : 0), mb_detect_encoding($filename)) . ($ext ? '.' . $ext : '');

	// 	return $filename;
	// }//end filter_filename


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



