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
* @return
*	Nothing
*	Only print (formated as <pre>code</pre>) the info and value or dumped var
*/
#function dump($val, $var_name=NULL, $expected=NULL, $print=false){
function dump($val, $var_name=NULL, $arguments=array()){

	$html = '';
	
	
	// Backtrace info of current execution
	$bt = debug_backtrace();


	$html .= " DUMP ".PHP_EOL."  Caller: ".str_replace(DEDALO_ROOT,'',$bt[0]['file']);
	$html .= PHP_EOL ." Line: ".@$bt[0]['line'];

	# NIVEL 1

		# FUNCTION
		if (isset($bt[1]['function']))
			$html .= PHP_EOL . " Inside method: ".$bt[1]['function'];
								
		# VAR_NAME
		if(isset($var_name))
			$html .= PHP_EOL . " name: <strong>".$var_name."</strong>";	
		
		# EXPECTED
		if(isset($expected))
			$html .= PHP_EOL . " val expected: <em> $expected </em>";

		# EXEC_TIME
		if(isset($start_time)) {
			$html .= PHP_EOL . " exec_time: <em> ".exec_time($start_time)." </em>";
		}

		# arguments (optional)
		if(isset($arguments) && is_array($arguments)) foreach ($arguments as $key => $value) {			
			$html .= PHP_EOL . " $key: <em> $value </em>";
		}
		
		# VALUE
		$value_html='';
		$html .= PHP_EOL . " value: " ;
		switch (true) {
			case is_array($val):
				$value_html .= print_r($val, true);								
				break;
			case is_object($val):
				$value_html .= print_r($val,true);
				break;
			default:
				if(is_string($val) && $val != strip_tags($val)) {
					$val = htmlspecialchars($val);
				}
				$value_html .= var_export($val,true);
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
		if (!$str_json) {			
			// not exists call php://input
			print wrap_pre($html);
		}
	}

	# LOG MESSAGE
	#$GLOBALS['log_messages'][] = wrap_pre($html);

	# CONSOLE ERROR LOG ALWAYS
	error_log(PHP_EOL.'-->'.$html);


	#return wrap_pre($html);
	return $html;
}//end dump



/**
* WRAP_PRE
*/
function wrap_pre($string, $add_header_html=true) {
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
function wrap_html($string, $htmlspecialchars=true) {
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
*/
function debug_log($info, $level=logger::DEBUG) {
	if(!SHOW_DEBUG) return false;
	/* level ref
	const DEBUG 	= 100;
	const INFO 		= 75;
	const NOTICE 	= 50; 
	const WARNING 	= 25;
	const ERROR 	= 10;
	const CRITICAL 	= 5;
	*/
	if( $level > LOGGER_LEVEL ) {
		return false;
	}

	$msg = "DEBUG_LOG [".logger::level_to_string($level)."] $info";
	error_log($msg);

	$GLOBALS['log_messages'][] = $msg;
}//end debug_log



# CURL GET URL
function file_get_contents_curl($url) {
	$ch = curl_init();
	curl_setopt($ch, CURLOPT_HEADER, 0);
	curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
	curl_setopt($ch, CURLOPT_URL, $url);
	curl_setopt($ch, CURLOPT_FOLLOWLOCATION, 1);

	# Avoid verify ssl certificates (very slow)
		curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
		
	$data = curl_exec($ch);
	curl_close($ch);
	
	return $data;
}//end file_get_contents_curl



# START_TIME
function start_time() {
	$mtime = explode(' ',microtime());
	
	return $mtime[1]+$mtime[0];
}
# EXEC_TIME
function exec_time($start, $method=NULL, $result=NULL) {
	
	$end = start_time();
	$total = $end - $start;
	$total = $total*1000;
	if($total>100){
		$exec  = sprintf(' Exec in <span style=\'color:red\'>%.3f ms.</span>', $total) ;
	}else{
		$exec  = sprintf(' Exec in %.3f ms.', $total) ;
	}    

	$final_string = '<b>' . $method . '</b>' . $exec ;

	if(!empty($result))
	$final_string .= ' Res '.to_string($result) ;

	
	return '<pre>'.$final_string.'</pre>' ;
}//end exec_time
# EXEC_TIME_UNIT
function exec_time_unit($start, $unit='ms', $round=3) {
	
	$end = start_time();
	$total = $end - $start;
	if($unit==='ms') {
		$total = $total*1000; 
	}else if($unit==='sec') {
		$total = $total; 
	}  
	return round($total,3);
}//end exec_time_unit



# TO_STRING
function to_string($var=null) {
	if ($var===null) return $var;

	if (is_string($var) && (strpos($var, '{')===0 || strpos($var, '[')===0)) {
		$var = json_decode($var);
	}

	if (is_array($var)) {
		if ( is_string(current($var)) || is_numeric(current($var)) ) {
			return implode('|', $var);	
		}else if( is_object( current($var) ) ){
			foreach ($var as $obj) {
				$ar_ob[] = $obj;
			}
			#return implode('|', $ar_ob);
			return print_r($ar_ob,true);
		}else if(empty($var)){
			return 'Array(empty)';
		}
		return print_r($var,true);	
			
	}else if (is_object($var)) {
		$var = json_encode($var, JSON_PRETTY_PRINT);
		return $var;
		#$var = json_decode($var);
		#return '<pre>'.print_r($var,true).'</pre>';
	}else if (is_bool($var)) {
		$var = (int)$var;
	}

	return "$var";
}//end to_string


# GET_LAST_MODIFICATION_DATE : Get last modified file date in all Dedalo files
# This will return a timestamp, you will have to use date() like date("d-m-Y H:i:s ", $ret));
function get_last_modification_date($path, $allowedExtensions=null, $ar_exclude=array('/acc/','/backups/')) {
	
	// Only take into account those files whose extensions you want to show.
	if (empty($allowedExtensions)) {
		$allowedExtensions = array(
		  'php',
		  'phtml',
		  'js',
		  'css'
		);
	}
	
	if (!file_exists($path))
		return 0;

	foreach ($ar_exclude as $exclude) {
		if ( strpos($path, $exclude)!==false ) return 0;
	}    
	
	$ar_bits = explode(".", $path);
	$extension = end($ar_bits);
	if (is_file($path) && in_array($extension, $allowedExtensions))
		return filemtime($path);
	$ret = 0;
	
	if (is_array(glob($path."/*"))) foreach (glob($path."/*") as $fn)
	{
		if (get_last_modification_date($fn,$allowedExtensions,$ar_exclude) > $ret)
			$ret = get_last_modification_date($fn,$allowedExtensions,$ar_exclude);    
			// This will return a timestamp, you will have to use date().
	}
	
	return $ret;
}//end get_last_modification_date



/**
* GET_LAST_MODIFIED_FILE
* @param string $path
* @return string $last_modified_file
*/
function get_last_modified_file($path) {
	
	// First we set up the iterator 
		$iterator 			= new RecursiveDirectoryIterator($path);
		$directory_iterator = new RecursiveIteratorIterator($iterator);

	// Sets a var to receive the last modified filename 
		$last_modified_file = "";

	// Then we walk through all the files inside all folders in the base folder 
		foreach ($directory_iterator as $name => $object) {
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
			throw new Exception("No files in the directory");
		}

	return $last_modified_file;
}//end get_last_modified_file



# CRIPTO : if (!function_exists('mcrypt_encrypt'))
function dedalo_encrypt_openssl($stringArray, $key=DEDALO_INFORMACION) {
	
	if (!function_exists('openssl_encrypt')) throw new Exception("Error Processing Request: Lib OPENSSL unavailable.", 1);

	$encrypt_method = "AES-256-CBC";
	// iv - encrypt method AES-256-CBC expects 16 bytes - else you will get a warning
	$secret_iv = DEDALO_ENTITY;
	$iv = substr(hash('sha256', $secret_iv), 0, 16);

	$output = base64_encode(openssl_encrypt(serialize($stringArray), $encrypt_method, md5(md5($key)), 0, $iv));

	return $output;
}//end dedalo_encrypt_openssl
function dedalo_decrypt_openssl($stringArray, $key=DEDALO_INFORMACION) {
	
	if (!function_exists('openssl_decrypt')) throw new Exception("Error Processing Request: Lib OPENSSL unavailable.", 1);
		
	$encrypt_method = "AES-256-CBC";
	// iv - encrypt method AES-256-CBC expects 16 bytes - else you will get a warning
	$secret_iv = DEDALO_ENTITY;
	$iv = substr(hash('sha256', $secret_iv), 0, 16);

	$output = openssl_decrypt(base64_decode($stringArray), $encrypt_method, md5(md5($key)), 0, $iv);
	
	if ( is_serialized($output) ) {
		return unserialize($output);
	}else{
		debug_log(__METHOD__." Current string is not correctly serialized ! ".to_string(), logger::ERROR);
		return false;
	}
}//end dedalo_decrypt_openssl



/**
* IS_SERIALIZED
*/
function is_serialized($str) {
	
	return ($str == serialize(false) || @unserialize($str) !== false);
}//end is_serialized


/**
* ENCRYPTION_MODE
* @return string
*	Return current crypt mode to use looking current Dédalo version
*/
function encryption_mode() {

	# Overwrites calculated mode. Useful for clean install
	if (defined('ENCRYPTION_MODE')) {
		return ENCRYPTION_MODE;
	}

	$current_version = tool_administration::get_current_version_in_db();
	
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
function array_key_path($needle, $haystack, $forbidden = array(), $path = array()) {
  foreach ($haystack as $key => $val) {
	if (in_array($key, $forbidden)) {
	  continue;
	}
	if (is_array($val) && is_array($sub = array_key_path($needle, $val, $forbidden, array_merge($path, (array)$key)))) {
	  return $sub;
	}
	elseif ($key === $needle) {
	  return array_merge($path, (array)$key);
	}
  }

  return false;
}//end array_key_path



/**
* Given a path, return a reference to the array entry.
*
* @param $array
*   A keyed array.
* @param $path
*   An array path, represented as an array where entries are consecutive keys.
* @return
*   A reference to the entry that corresponds to the given path.
* by http://thereisamoduleforthat.com/content/dealing-deep-arrays-php
*/
function &array_path(&$array, $path) {
  $offset =& $array;
  if ($path) foreach ($path as $index) {
	$offset =& $offset[$index];
  }
  
  return $offset;
}//end array_path



/**
* ALIST
* Return array as ul / li html
*/
function alist ($array) {  //This function prints a text array as an html list.
  $alist = "<ul>";
  for ($i = 0; $i < sizeof($array); $i++) {
	$alist .= "<li>$array[$i]";
  }
  $alist .= "</ul>";
  
  return $alist;
}//end alist



/**
* ARRAY_KEYS_RECURSIVE
* Flat an array
*/
function array_keys_recursive(array $array) {

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
* CLEAN_URL_VARS : Elimina variables no deseadas del query en la url
*/
function clean_url_vars($current_var=array()) {
	
	#echo $queryString."<br>";
	$qs = false ;
	
	$queryString = $_SERVER['QUERY_STRING']; # like max=10
	
	$search  = array('&&',	'&=',	'=&',	'??',	);
	$replace = array('&',	'&',	'&',	'?',	);
	$queryString = str_replace($search, $replace, $queryString);
	
	$posAND 	= strpos($queryString, '&');
	$posEQUAL 	= strpos($queryString, '=');

	$ar_excluded_vars = array(	'pageNum',
								'search',
								'reset'
								);
	foreach ((array)$current_var as $current_value) {
		$ar_excluded_vars[] = $current_value;
	}
	
	if($posAND !== false) { # query tipo ?m=list&t=dd334&pageNum=3
		
		$ar_pares = explode('&', $queryString);		
		if(is_array($ar_pares)) foreach ($ar_pares as $par){
						
			$troz		= @ explode('=',$par) ;
			if($troz) {
				$varName	= NULL;
				if (isset($troz[0])) {
					$varName = $troz[0];
				}
				
				$varValue 	= NULL;
				if (isset($troz[1])) {
					$varValue= $troz[1];
				}
				
				#if($varName !='pageNum' && $varName !='accion' && $varName !='reset' ){
				if (!in_array($varName, $ar_excluded_vars)) {
					$qs .= $varName . '=' . $varValue .'&';
				}
			}
		}
	}else if($posAND === false && $posEQUAL !== false) { # query tipo ?m=list&t=dd334
	
		$qs = $queryString ;				
	}
	
	$qs = str_replace($search, $replace, $qs);
	
	# if last char is & delete it
	if(substr($qs, -1)=='&') $qs = substr($qs, 0, -1);
	
	return $qs ;
}//end clean_url_vars



# SANITIZE_OUTPUT
function sanitize_output($buffer) {

	$search = array(
		'/\>[^\S ]+/s', //strip whitespaces after tags, except space
		'/[^\S ]+\</s', //strip whitespaces before tags, except space
		'/(\s)+/s'  // shorten multiple whitespace sequences
		);
	$replace = array(
		'>',
		'<',
		'\\1'
		);
	$buffer = preg_replace($search, $replace, $buffer);
	return $buffer;
}



# SANITIZE_QUERY
function sanitize_query($strQuery) {
	
	return trim(str_replace("\t", "", $strQuery));
}



/**
* FIX_CONFIG4_VAR
* Fija una variable config4 en cascada, según disponibilidad y por order de prevalencia (REQUEST,SESSION,DEFAULT)
*/
function fix_cascade_config4_var($var_name, $var_default_value) {

	switch (true) {
		# REQUEST (GET/POST)
		case !empty($_REQUEST[$var_name]) :
			$var_value = trim( safe_xss($_REQUEST[$var_name]) );
			$_SESSION['dedalo4']['config'][$var_name]= $var_value; # Save in session too
			break;
		# SESSION
		case !empty($_SESSION['dedalo4']['config'][$var_name]) :
			$var_value = $_SESSION['dedalo4']['config'][$var_name]; 
			break;
		# DEFAULT
		default:
			$var_value = $var_default_value;
			break;
	}

	return $var_value;
}//end fix_cascade_config4_var



/**
* ARRAY_FLATTEN
* Convert multidimensional array to one level flat array
*/
function array_flatten($array) {

   $return = array();
   foreach ($array as $key => $value) {
	   if (is_array($value)){ $return = array_merge($return, array_flatten($value));}
	   else {$return[$key] = $value;}
   }
   return $return;
}//end array_flatten



/**
* VERIFY_DEDALO_PREFIX_TIPOS
* @return bool()
*/
function verify_dedalo_prefix_tipos($tipo=null) {
	
	return true; # Temporal hasta que se valore lo de los prefijos dinámicos de hierarchy
	
	/*
	$DEDALO_PREFIX_TIPOS = unserialize(DEDALO_PREFIX_TIPOS);

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
* @return order
*/
function build_sorter($key) {
	return function ($a, $b) use ($key) {
		if (!isset($a[$key]) || !isset($b[$key])) {
			return;
		}
		return strnatcmp($a[$key], $b[$key]);
		#return strcmp($a[$key], $b[$key]);
	};
}//end build_sorter



/**
* SEARCH_STRING_IN_ARRAY
* Searchs with preg_match a string match in array of strings
* @return array $matches
*	Array of coincidences about search string
*/
function search_string_in_array($array, $search_string) {
	
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
* Converts string to lowervase string containing various combinations to simplify preg_match searches
* like gàvia to g[aàáâãäå]v[iìíîï][aàáâãäå]
*/
function add_accents($string) {
	$array1 = array('a', 'c', 'e', 'i' , 'n', 'o', 'u', 'y');
	$array2 = array('[aàáâãäå]','[cçćĉċč]','[eèéêë]','[iìíîï]','[nñ]','[oòóôõö]','[uùúûü]','[yýÿ]');

	return str_replace($array1, $array2, mb_strtolower($string));
}//end add_accents



/**
* CONVERT_SPECIAL_CHARS
function convert_special_chars($string) {
	$array1 = array('ñ');
	$array2 = array('n');

	$final_string = str_replace($array1, $array2, $string);
	#debug_log(__METHOD__." final_string: ".to_string($final_string), logger::ERROR);

	return $final_string;
}
*/



/**
* ARRAY_GET_BY_KEY
*/
function array_get_by_key($array, $key) {

	$results = array();
	array_get_by_key_r($array, $key, $results);
	return $results;
}
function array_get_by_key_r($array, $key, &$results) {
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
function decbin32 ($dec) {
  
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



function br2nl($string) {
	
	return str_replace( array('<br>','<br />'), "\n", $string );
}



/**
* GET_TOP_TIPO
*//* EN PROCESO
function get_top_tipo() {

	$req_modo = $_REQUEST['m'];

	switch (true) {
		case (strpos($req_modo, 'tool_')!==false):
		case (isset($_REQUEST['context_name'])):
			# TOOL / PORTAL MODE
			$top_tipo = $_SESSION['dedalo4']['config']['top_tipo'];
			break;
		
		default:
			# code...
			break;
	}
}*/



/**
* GET_HTTP_RESPONSE_CODE
*/
function get_http_response_code($theURL) {
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
*/
function dd_memory_usage() { 
	$mem_usage = memory_get_usage(true); 
	$total='';
	if ($mem_usage < 1024) 
		$total .= $mem_usage." BYTES";
	elseif ($mem_usage < 1048576) 
		$total .= round($mem_usage/1024,2)." KB";
	else 
		$total .= round($mem_usage/1048576,2)." MB";
		
	return $total; 
}//end dd_memory_usage



/**
* APP_LANG_TO_TLD2
* Use only for fast application lang tld resolve
*/
function app_lang_to_tld2($lang) {

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



function str_lreplace($search, $replace, $subject) {

	$pos = strrpos($subject, $search);

	if($pos !== false) {
		$subject = substr_replace($subject, $replace, $pos, strlen($search));
	}

	return $subject;
}//end str_lreplace



/**
* CAST
*
* @param string|object $destination
* @param object $sourceObject
* @return object
*/
function cast($destination, $sourceObject) {
	
	if (is_string($destination)) {
		$destination = new $destination();
	}
	$sourceReflection = new ReflectionObject($sourceObject);
	$destinationReflection = new ReflectionObject($destination);
	$sourceProperties = $sourceReflection->getProperties();
	foreach ($sourceProperties as $sourceProperty) {
		$sourceProperty->setAccessible(true);
		$name = $sourceProperty->getName();
		$value = $sourceProperty->getValue($sourceObject);
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
*/
function log_messages($vars,$level='error') {
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
	#$GLOBALS['log_messages'] .= "<div class=\"$level\">$html</div>";
	$GLOBALS['log_messages'][] = "<div class=\"$level\">$html</div>";
}//end log_messages



/**
* NOTICE_TO_ACTIVE_USERS
* Print a message in all pages to active users
*/
function notice_to_active_users( $ar_options ) {

	$msg  = $ar_options['msg'];
	$mode = $ar_options['mode'];

	log_messages($msg, $mode);
	/*
	switch ($mode) {
		case 'warning':
			$msg = "<span class=\"warning notice_to_active_users\">$msg</span>";
			break;
		
		default:
			# code...
			break;
	}
	// Write msg in globals var array
	$GLOBALS['log_messages'][] = $msg;
	*/
}//end notice_to_active_users



/**
* GET_REQUEST_VAR
* Check if var exists in $_REQUEST environment. If not do a fallback to search var in php://input (for
* example in trigger json requests)
* @return mixed string | bool $var_value
*/
function get_request_var($var_name) {

	$var_value = false;

	if(isset($_REQUEST[$var_name]))  {
		$var_value = $_REQUEST[$var_name];		
	}else{
		#get the change modo from portal list to edit
		$str_json = file_get_contents('php://input');
		$get_submit_vars = json_decode($str_json);
		if (isset($get_submit_vars->{$var_name})) {
			$var_value = $get_submit_vars->{$var_name};
		}
	}

	# Safe XSS
	$var_value = safe_xss($var_value);

	return $var_value;
}//end get_request_var



/**
* SAFE_XSS
* @return mixed $value
*/
function safe_xss($value) {

	if (is_string($value)) {

		if ($decode_json=json_decode($value)) {
			// If var is a stringify json, not verify string now
		}else{
			$value = strip_tags($value,'<br><strong><em>');
			$value = htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
		}
	}	
	#error_log("value: ".to_string($value));

	return $value;
}//end safe_xss



/**
* SAFE_SQL_QUERY
* @return mixed $value
*/
function safe_sql_query($sql_query) {
	
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



/***
 * Starts a session with a specific timeout and a specific GC probability.
 * @param int $timeout The number of seconds until it should time out.
 * @param int $probability The probability, in int percentage, that the garbage 
 *        collection routine will be triggered right now.
 * @param string $cookie_path The base path for the cookie.
 */
$sessiondb = null;
function session_start_manager($request_options) {
global $sessiondb;
	#if (session_status()===PHP_SESSION_ACTIVE) return false;

	$options = new stdClass();
		$options->save_handler 			= 'files';
		$options->timeout_seconds 		= 1400;
		$options->probability 			= 100;
		$options->cookie_path 			= '/';
		$options->cookie_domain 		= null;
		$options->save_path 			= false; # /tmp/php
		$options->aditional_save_path	= false; # /session_custom_sec
		$options->session_name			= false;
		foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
	
	switch ($options->save_handler) {
		case 'memcached':
			ini_set('session.save_handler', 'memcached');
			# Connection type: '127.0.0.1:11211' , '/usr/local/var/memcached/memcached.sock'
			ini_set('session.save_path', $options->save_path);

			// Start the session!
			session_start();
			break;
		
		case 'files':
			$timeout 	 	= $options->timeout_seconds;
			$probability 	= $options->probability;
			$cookie_path 	= $options->cookie_path;
			$cookie_domain 	= $options->cookie_domain;

			// Set lifetime of cache (this no affect to session duration)
			session_cache_expire( intval($timeout*60) ); 	#in minutes (*60)	Default php usually : 180

			// Set the max lifetime
			ini_set("session.gc_maxlifetime", $timeout);
		 
			// Set the session cookie to timeout
			ini_set("session.cookie_lifetime", $timeout);

			if ($options->save_path!==false) {
				ini_set( 'session.save_path', $options->save_path);
			}

			if ($options->session_name!==false) {
				session_name($options->session_name);
			}		
		 
			if ($options->aditional_save_path!==false) {
				// Change the save path. Sessions stored in the same path
				// all share the same lifetime; the lowest lifetime will be
				// used for all. Therefore, for this to work, the session
				// must be stored in a directory where only sessions sharing
				// it's lifetime are. Best to just dynamically create on.			
				$path = ini_get("session.save_path") . $options->aditional_save_path;
				if(!file_exists($path)) {
					if(!mkdir($path, 0700)) {
						trigger_error("Failed to create session save path directory '$path'. Check permissions.", E_USER_ERROR);
					}
				}
				ini_set("session.save_path", $path);
			}
		 
			// Set the chance to trigger the garbage collection.
			ini_set("session.gc_probability", $probability);
			ini_set("session.gc_divisor", 100); // Should always be 100

			// Start the session!
			session_start();

			// Renew the time left until this session times out.
			// If you skip this, the session will time out based
			// on the time when it was created, rather than when
			// it was last used.
			if(isset($_COOKIE[session_name()])) {
				#setcookie(session_name(), $_COOKIE[session_name()], time() + $timeout, $cookie_path, $cookie_domain);
				setcookie(session_name(), $_COOKIE[session_name()], time() + $timeout, $cookie_path, $cookie_domain, TRUE, TRUE);
			}
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
* @return string $table
*/
function safe_table( $table ) {

	preg_match("/^[a-zA-Z_]+$/", $table, $output_array);
	if (empty($output_array[0])) {
		return false;
	}
	
	return $table;
}//end safe_table



/**
* SAFE_LANG
* Remove extra malicious code
* @return string $lang
*/
function safe_lang( $lang ) {

	preg_match("/^lg-[a-z]{2,8}$/", $lang, $output_array);
	if (empty($output_array[0])) {
		return false;
	}
	
	return $lang;
}//end safe_lang



/**
* SAFE_TIPO
* Remove extra malicious code
* @return string $tipo
*/
function safe_tipo( $tipo ) {

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
* @return string $section_id
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
function format_size_units($bytes) {
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



function encodeURIComponent($str) {
    $revert = array('%21'=>'!', '%2A'=>'*', '%27'=>"'", '%28'=>'(', '%29'=>')');
    
    return strtr(rawurlencode($str), $revert);
}//end encodeURIComponent



/**
* SHOW_MSG
* Decore msg with error, warning, etc. css
*/
function show_msg($msg, $type='ERROR') {

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



?>