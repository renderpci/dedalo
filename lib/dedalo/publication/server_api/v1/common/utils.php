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


	$html .= " DUMP ".PHP_EOL."  Caller: ".str_replace(API_ROOT,'',$bt[0]['file']);
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
				#$value_html .= print_r($val, true);
				$value_html .= json_encode($val, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
				break;
			case is_object($val):
				#$value_html .= print_r($val,true);
				$value_html .= json_encode($val, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
				break;
			default:
				if(is_string($val) && $val != strip_tags($val)) {
					$val = htmlspecialchars($val);
				}
				#$value_html .= var_export($val,true);
				$value_html .= json_encode($val, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
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
* DEBUG_LOG
*/
function debug_log($info, $level='DEBUG') {
	if(SHOW_DEBUG!==true) return false;

	$msg = 'DEBUG_LOG ['.$level.'] '.$info;
	error_log($msg);

	return $msg;
}//end debug_log


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
	}else if($unit==='sec' || $unit==='secs') {
		$total = $total;
	}
	return round($total,3);
}//end exec_time_unit



/**
* TO_STRING
*/
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



class logger {
	const DEBUG 	= 100;
	const INFO 		= 75;
	const NOTICE 	= 50;
	const WARNING 	= 25;
	const ERROR 	= 10;
	const CRITICAL 	= 5;
}
