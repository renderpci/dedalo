<?php
/**
* COMMON
* 
*
*/
class common {


	# Version. Important!
	static $version = "1.0.0"; // 14-09-2017

	

	/**
	* TRIGGER_MANAGER
	* @param php://input
	* @return object $response
	*/
	public static function trigger_manager($request_options=false) {

		$options = new stdClass();
			$options->test_login = false;
	

		# Set JSON headers for all responses
		header('Content-Type: application/json');

		# JSON_DATA
		# javascript common.get_json_data sends a stringify json object
		# this object is getted here and decoded with all ajax request vars
		$str_json = file_get_contents('php://input');
		if (!$json_data = json_decode($str_json)) {
			$response = new stdClass();
				$response->result 	= false;
				$response->msg 		= "Error on read php://input data";
			echo json_encode($response);
			exit();
		}		
		
		
		#dump($json_data, ' json_data ++ '.to_string());

		# MODE Verify
		if(empty($json_data->mode)) exit( json_encode("<span class='error'> Trigger: Error Need mode..</span>") );
		
		# CALL FUNCTION
		if ( function_exists($json_data->mode) ) {
			$response = (object)call_user_func($json_data->mode, $json_data);
			$json_params = null;
			if(SHOW_DEBUG===true) {
				$json_params = JSON_PRETTY_PRINT;
			}
			echo json_encode($response, $json_params);
		}else{
			$response = new stdClass();
				$response->result 	= false;
				$response->msg 		= 'Error. Request failed.'.$json_data->mode.' not exists';
			echo json_encode($response);
		}
	}//end trigger_manager



	/**
	* SETVARDATA
	* @param string $name
	* @param onject $data_obj
	*/
	public static function setVarData($name, $data_obj, $default=false) {

		if($name==='name') throw new Exception("Error Processing Request [setVarData]: Name 'name' is invalid", 1);
		
		$$name = $default; 
		if(isset($data_obj->{$name})) $$name = $data_obj->{$name};
		
		if(isset($$name))
			return $$name;

		return false;
	}//end setVar



	/**
	* GENERATE_URL
	* @return 
	*/
	public static function generate_url($string) {
		return urlencode($string);
	}//end generate_url


	

}//end common



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


	$html .= " DUMP ".PHP_EOL."  Caller: ".str_replace('DEDALO_ROOT','',$bt[0]['file']);
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
	if(SHOW_DEBUG===true) { //
		#if ($print!=false)
	print wrap_pre($html, false);
		#print trim($html);
		//echo "<script>console.log('PHP: ".$html."');</script>";
	}

	# LOG MESSAGE
	#$GLOBALS['log_messages'][] = wrap_pre($html);

	# CONSOLE ERROR LOG
	error_log('-->'.$html);


	#return wrap_pre($html);
	return trim($html);
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
* EXEC_TIME_UNIT
*/
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



/**
* START_TIME
*/
function start_time() {
	$mtime = explode(' ',microtime());
	return $mtime[1]+$mtime[0];
}//end start_time



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
		}else if( empty($var)){
			return 'Array(empty)';
		}
		return print_r($var,true);	
			
	}else if (is_object($var)) {		
		$var = json_encode($var);
		$var = json_decode($var);
		return '<pre>'.print_r($var,true).'</pre>';
	}else if (is_bool($var)) {
		$var = (int)$var;
	}	
	return "$var";
}//end to_string



?>