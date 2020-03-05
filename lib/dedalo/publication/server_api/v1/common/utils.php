<?php

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
