<?php
$start_time=microtime(1);
include( dirname(dirname(__FILE__)).'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* LOAD_ROWS
*/
function load_rows($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';
	
	# set vars
	$vars = array('options');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			# if ($name==='dato') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.safe_xss($name).' (is mandatory)';
				return $response;
			}
		}	
	
	# Received post var 'options' is a json object stringnified. Decode to regenrate original object
	# $options = json_decode($options);
	if (!is_object($options)) {
		$response->msg = 'Trigger Error: ('.__FUNCTION__.') Received data must be a object (options)';
		return $response;
	}	

	if (empty($options->modo)) {
		$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty options->modo (is mandatory)';
		return $response;
	}

	$section_tipo = $options->search_query_object->section_tipo;


	if (!defined('SECTION_TIPO')) {
		define('SECTION_TIPO', $section_tipo);
	}	


	$section_records 	= new section_records($section_tipo, $options);
	$html 				= $section_records->get_html();
	
	
	#session_write_close();


	$response->result 	= $html;
	$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			foreach($vars as $name) {
				$debug->{$name} = $$name;
			}

		$response->debug = $debug;
	}


	return (object)$response;
}//end load_rows



?>