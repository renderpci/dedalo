<?php
#namespace dedalo4;

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
	$bt = debug_backtrace(); #print_r($bt);


	$html .= " DUMP \n  Caller: ".str_replace(DEDALO_ROOT,'',$bt[0]['file']);
	$html .= "\n  Line: ".@$bt[0]['line'];

	# NIVEL 1

		# FUNCTION
		if (isset($bt[1]['function']))
			$html .= "\n  Inside method: ".$bt[1]['function'];
								
		# VAR_NAME
		if(isset($var_name))
			$html .= "\n  name: <strong>".$var_name."</strong>";	
		
		# EXPECTED
		if(isset($expected))
			$html .= "\n  val expected: <em> $expected </em>";

		# EXEC_TIME
		if(isset($start_time)) {
			$html .= "\n  exec_time: <em> ".exec_time($start_time)." </em>";
		}

		# arguments (optional)
		if(isset($arguments) && is_array($arguments)) foreach ($arguments as $key => $value) {			
			$html .= "\n  $key: <em> $value </em>";
		}
			

		# VALUE
		$value_html='';
		$html .= "\n  value: " ;
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
		$html .= "\n  type: ".gettype($val)."";

	
	# NIVEL 2

		# CALLER FUNCTION
		if (isset($bt[2])) {
			$html .= "\n  Caller2: ";
			$html .= " ". print_r($bt[2]['file'],true);
			$html .= "\n  Function: ". print_r($bt[2]['function'],true);
			$html .= " [Line: ". print_r($bt[2]['line'],true)."]";
		}
	

	# PRINT
	if(SHOW_DEBUG===true) { //
		#if ($print!=false)
		print wrap_pre($html) ;
	}

	# LOG MESSAGE
	#$GLOBALS['log_messages'][] = wrap_pre($html);

	# CONSOLE ERROR LOG
	error_log('-->'.$html);


	return wrap_pre($html);
}

function wrap_pre($string) {
	$html='';
	#$html .= "\n<html xmlns=\"http://www.w3.org/1999/xhtml\" ><body>";	
	$html .= "\n<!DOCTYPE html>";
	$html .= "\n<meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\" />";
	$html .= "<pre class=\"dump\" style=\"min-width:500px;font-family:monospace;color:#4B5D5E;font-size:0.8em;background-color:rgba(217, 227, 255, 0.8);border-radius:5px;padding:10px;position:relative;z-index:9999\">";
	$html .= "<div class=\"icon_warning\" ></div>";
	$html .= stripslashes($string);
	$html .= "\n</pre>";
	#$html .= "\n</body></html>";
	return $html;
}

function wrap_html($string) {
	$html='';
	$html .= "\n<!DOCTYPE html>";
	$html .= "\n<meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\" />";
	$html .= "\n<html><body>";
	$html .= nl2br( htmlspecialchars($string) );
	$html .= "\n</body></html>";
	return $html;
}


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
	$msg = "DEBUG_LOG [".logger::level_to_string($level)."] $info";
	error_log($msg);

	$GLOBALS['log_messages'][] = $msg;
}


# CURL GET URL
function file_get_contents_curl($url) {
	$ch = curl_init();
	curl_setopt($ch, CURLOPT_HEADER, 0);
	curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
	curl_setopt($ch, CURLOPT_URL, $url);
	curl_setopt($ch, CURLOPT_FOLLOWLOCATION, 1);
	$data = curl_exec($ch);
	curl_close($ch);
	return $data;
}


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

	#return $final_string ;
	return '<pre>'.$final_string.'</pre>' ;
}
# EXEC_TIME_UNIT
function exec_time_unit($start, $unit='ms', $round=3) {
	$end = start_time();
	$total = $end - $start;
	if($unit=='ms') {
		$total = $total*1000; 
	}else if($unit=='sec') {
		$total = $total; 
	}  
	return round($total,3);
}

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
		}else if( empty($var)){
			return 'Array(empty)';
		}
		return print_r($var,true);	
			
	}else if (is_object($var)) {
		return '<pre>'.print_r($var,true).'</pre>';
	}	
	return $var;
}


# GET_LAST_MODIFICATION_DATE : Get last modified file date in all Dedalo files
# This will return a timestamp, you will have to use date() like date("d-m-Y H:i:s ", $ret));
function get_last_modification_date($path, $allowedExtensions=null, $ar_exclude=array('/acc/','/backups/')) {
	#error_log('---- PATH: '.$path);
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
	#dump($ret,'$ret');
	return $ret;
}

# CRIPTO : if (!function_exists('mcrypt_encrypt'))
function dedalo_encryptStringArray ($stringArray, $key = DEDALO_INFORMACION) {
	
	if (!function_exists('mcrypt_encrypt')) throw new Exception("Error Processing Request: Lib MCRYPT unavailable.", 1);
	$s = strtr(base64_encode(mcrypt_encrypt(MCRYPT_RIJNDAEL_256, md5($key), serialize($stringArray), MCRYPT_MODE_CBC, md5(md5($key)))), '+/=', '-_,');	
	return $s;
}
function dedalo_decryptStringArray ($stringArray, $key = DEDALO_INFORMACION) {
	
	if (!function_exists('mcrypt_encrypt')) throw new Exception("Error Processing Request: Lib MCRYPT unavailable.", 1);
	$s = rtrim(mcrypt_decrypt(MCRYPT_RIJNDAEL_256, md5($key), base64_decode(strtr($stringArray, '-_,', '+/=')), MCRYPT_MODE_CBC, md5(md5($key))), "\0");	
	if ( is_serialized($s) ) {
		return unserialize($s);
	}else{
		debug_log(__METHOD__." Current string is not correctly serialized ! ".to_string(), logger::DEBUG);
		return false;
	}
	/*
	try {
		if ($s == serialize(false)) {
			$s = unserialize($s);
		}		
	} catch (Exception $e) {
		$s = false;
	}
		
	return $s;
	*/
}

function is_serialized($str) {
	return ($str == serialize(false) || @unserialize($str) !== false);
}


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
  return FALSE;
}

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
}

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
}

# ARRAY_KEYS_RECURSIVE : FLAT ARRAY
function array_keys_recursive(array $array) {

	$keys = array();
 
	foreach ($array as $key => $value) {
		$keys[] = $key;
 
		if (is_array($array[$key])) {
			$keys = array_merge($keys, array_keys_recursive($array[$key]));
		}
	} 
	return $keys;
}

$codHeader = '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />';

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
}


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
function sanitize_query(&$strQuery) {
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
			$var_value = trim($_REQUEST[$var_name]);
			$_SESSION['dedalo4']['config'][$var_name]	= $var_value; # Save in session too			
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
}

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
}


/**
* VERIFY_DEDALO_PREFIX_TIPOS
* @return bool()
*/
function verify_dedalo_prefix_tipos($tipo=null) {	
	
	$DEDALO_PREFIX_TIPOS = unserialize(DEDALO_PREFIX_TIPOS);
	#var_dump($DEDALO_PREFIX_TIPOS);	var_dump($tipo);

	if (empty($tipo) || strlen($tipo)<2) {
		return false;
	}
	foreach ($DEDALO_PREFIX_TIPOS as $current_prefix) {
		if ( strpos($tipo, $current_prefix)===0 ) {
			return true;
		}
	}
	
	#return true; # Temporal hasta que se guarde la structura por partes
	return false;
}


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
	$GLOBALS['log_messages'] .= "<div class=\"$level\">$html</div>";
}

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
}


function search_string_in_array($array, $search_string) {
		
	$matches = array();
	foreach($array as $k=>$v) {
		if(preg_match("/\b$search_string/i", $v)) {
			$matches[$k] = $v;
		}
	}
	return $matches;
}



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
 * Please do not remove this header, or source attibution from this file.
 */


// decbin32
// In order to simplify working with IP addresses (in binary) and their
// netmasks, it is easier to ensure that the binary strings are padded
// with zeros out to 32 characters - IP addresses are 32 bit numbers
function decbin32 ($dec) {
  return str_pad(decbin($dec), 32, '0', STR_PAD_LEFT);
}

// ip_in_range
// This function takes 2 arguments, an IP address and a "range" in several
// different formats.
// Network ranges can be specified as:
// 1. Wildcard format:     1.2.3.*
// 2. CIDR format:         1.2.3/24  OR  1.2.3.4/255.255.255.0
// 3. Start-End IP format: 1.2.3.0-1.2.3.255
// The function will return true if the supplied IP is within the range.
// Note little validation is done on the range inputs - it expects you to
// use one of the above 3 formats.
function ip_in_range($ip, $range) {
  if (strpos($range, '/') !== false) {
	// $range is in IP/NETMASK format
	list($range, $netmask) = explode('/', $range, 2);
	if (strpos($netmask, '.') !== false) {
	  // $netmask is a 255.255.0.0 format
	  $netmask = str_replace('*', '0', $netmask);
	  $netmask_dec = ip2long($netmask);
	  return ( (ip2long($ip) & $netmask_dec) == (ip2long($range) & $netmask_dec) );
	} else {
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
  } else {
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
}

?>