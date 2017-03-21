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

	if (SHOW_DEBUG!==true) {
		return;
	}

	$html = '';
	
	
	// Backtrace info of current execution
	$bt = debug_backtrace(); #print_r($bt);


	$html .= "\n DUMP \n  Caller: ".str_replace(__WEB_ROOT__,'',$bt[0]['file']);
	$html .= "\n  Line: ".@$bt[0]['line'];

	# NIVEL 1

		# FUNCTION
		if (isset($bt[1]['function']))
			$html .= "\n  Inside method: ".$bt[1]['function'];
								
		# VAR_NAME
		if(isset($var_name))
			$html .= "\n  name: <b>".$var_name."</b>";	
		
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
		if(is_array($val) || is_object($val)) {
			$value_html .= print_r($val, true);
		}else{
			$val = str_replace("\n", ' ', $val);
			#if (strlen($val)>100) {
			#	$val = substr($val, 0, 100).'..';
			#}
			$value_html .= var_export($val,true);
		}
		$html .= trim($value_html);

		$html = strip_tags($html);
		$html = str_replace("\n\n", "\n", $html);

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
	global $log_messages ;
	$log_messages .= wrap_pre($html);

	# CONSOLE ERROR LOG
	error_log('-->'.$html);

	

	return wrap_pre($html);
}

function wrap_pre($string) {
	$html='';
	#$html .= "\n<html xmlns=\"http://www.w3.org/1999/xhtml\" ><body>";
	#$html .= "\n<meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\" />";
	$html .= "\n<!DOCTYPE html>\n<pre class=\"dump\">";
	#$html .= "<div class=\"icon_warning\"></div>";
	$html .= stripslashes($string);
	$html .= "\n</pre>\n";
	#$html .= "\n</body></html>";
	return $html;
}





function wrap_html($string, $cwd) {

	$css_common_url = '../common/css/common.css';
	$js_common_url  = '../common/js/common.js';

	$css_url = '../'.$cwd.'/css/'.$cwd.'.css';
	$js_url  = '../'.$cwd.'/js/'.$cwd.'.js';
	$html='';
	$html .= '<!DOCTYPE html>
<html>
<head>
 <meta charset="utf-8">
 <link href="'.$css_common_url.'" rel="stylesheet" />
 <link href="'.$css_url.'" rel="stylesheet" />
 <script src="'.$js_common_url.'"></script>
 <script src="'.$js_url.'"></script>
</head>
<body>';
	$html .= $string;
	$html .= "</body>
</html>";
	return $html;
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

# START_TIME
function start_time() {
	$mtime = explode(' ',microtime());
    return $mtime[1]+$mtime[0];
}
# EXEC_TIME
function exec_time($start, $method=NULL, $result=NULL) {

	#return null;
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

function exec_time_unit($start, $unit='ms') {
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

	if (is_array($var)) {

		if ( is_string(current($var)) || is_numeric(current($var)) ) {			
			return implode('|', $var);	
		}else if( is_object( current($var) ) ){
			foreach ($var as $obj) {
				$ar_ob[] = $obj;
			}
			return implode('|', $ar_ob);
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
function get_last_modification_date($path) {
	
	// Only take into account those files whose extensions you want to show.
	$allowedExtensions = array(
	  'php',
	  'phtml',
	  'js',
	  'css'
	);
    
    if (!file_exists($path))
        return 0;
    
    $ar_bits = explode(".", $path);
    $extension = end($ar_bits);
    if (is_file($path) && in_array($extension, $allowedExtensions))
        return filemtime($path);
    $ret = 0;
    
    if (is_array(glob($path."/*"))) foreach (glob($path."/*") as $fn)
	{
        if (get_last_modification_date($fn) > $ret)
            $ret = get_last_modification_date($fn);    
            // This will return a timestamp, you will have to use date().
	}
	#dump($ret,'$ret');
    return $ret;
}
/*
# CRIPTO : if (!function_exists('mcrypt_encrypt'))
function dedalo_encryptStringArray ($stringArray, $key = DEDALO_INFORMACION) {	
	if (!function_exists('mcrypt_encrypt')) throw new Exception("Error Processing Request: Lib MCRYPT unavailable.", 1);	
	$s = strtr(base64_encode(mcrypt_encrypt(MCRYPT_RIJNDAEL_256, md5($key), serialize($stringArray), MCRYPT_MODE_CBC, md5(md5($key)))), '+/=', '-_,');	
	return $s;
}
function dedalo_decryptStringArray ($stringArray, $key = DEDALO_INFORMACION) {
	#$start_time = start_time();
	if (!function_exists('mcrypt_encrypt')) throw new Exception("Error Processing Request: Lib MCRYPT unavailable.", 1);
 	$s = unserialize(rtrim(mcrypt_decrypt(MCRYPT_RIJNDAEL_256, md5($key), base64_decode(strtr($stringArray, '-_,', '+/=')), MCRYPT_MODE_CBC, md5(md5($key))), "\0"));
 	#$exec_time = exec_time($start_time);
	#dump($exec_time,'exec_time');
 	return $s;
}
*/

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
* Retur array as ul / li html
*/
function alist ($array) {  //This function prints a text array as an html list.
  $alist = "<ul>";
  for ($i = 0; $i < sizeof($array); $i++) {
    $alist .= "<li>$array[$i]";
  }
  $alist .= "</ul>";
  return $alist;
}

$codHeader = '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />';

/**
* CLEAN_URL_VARS : eliminar variables no deseadas del query en la url
*/
function clean_url_vars() {
	
	#echo $queryString."<br>";
	$qs = false ;
	
	$queryString = $_SERVER['QUERY_STRING']; # like max=10
		#dump($queryString, ' queryString');
	
	$search  = array('&&',	'&=',	'=&',	'??',	);
	$replace = array('&',	'&',	'&',	'?',	);
	$queryString = str_replace($search, $replace, $queryString);
	
	$posAND 	= strpos($queryString, '&');
	$posEQUAL 	= strpos($queryString, '=');

	$ar_excluded_vars = array(	'pageNum',
								'search',
								'reset',
								'search',
								'q'
								);

	preg_match("/\?(q=[a-z]{2})/", $queryString, $output_array);
		#dump($output_array, ' output_array');
	if (isset($output_array[1])) {
		$queryString = str_replace($output_array[1], '', $queryString);
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


/**
* DEDALO_SORT
* Use like : uasort($array,"dedalo_sort");
*/
function dedalo_sort($name1,$name2){
    $patterns = array(
        'a' => '(á|à|â|ä|Á|À|Â|Ä)',
        'e' => '(é|è|ê|ë|É|È|Ê|Ë)',
        'i' => '(í|ì|î|ï|Í|Ì|Î|Ï)',
        'o' => '(ó|ò|ô|ö|Ó|Ò|Ô|Ö)',
        'u' => '(ú|ù|û|ü|Ú|Ù|Û|Ü)'
    );          
    $name1 = preg_replace(array_values($patterns), array_keys($patterns), $name1);
    $name2 = preg_replace(array_values($patterns), array_keys($patterns), $name2);          
    return strcasecmp($name1, $name2);
}





/**
* CLEAN_REQUEST_STRING
* clean query de paginacion public
* @param string $queryString
* @return string $qs
*/
function clean_request_string($queryString) {
	
	$qs = '';
	
	$piezas = explode('&', $queryString);
	foreach ((array)$piezas as $key => $value) {
		
		$troz	= explode('=',$value) ;
		if(is_array($troz) && isset($troz[0]) && isset($troz[1]) ) {
			
			$trozE 	= $troz[0] ;
			if (
				$trozE !='page' && 
				$trozE !='ordenGET' && 
				$trozE !='ot' && 
				$trozE !='key')
			{
				$qs .= $troz[0] . '=' . $troz[1] . '&';
			}
		}
	}
	return substr($qs,0,-1) ;
}




?>