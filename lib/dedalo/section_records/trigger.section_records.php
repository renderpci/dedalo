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
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}


	# Received post var 'options' is a json object stringnified. Decode to regenrate original object
	$options = json_decode($options);
	if (!is_object($options)) {
		$response->msg = 'Trigger Error: ('.__FUNCTION__.') Received data must be a object (options)';
		return $response;
	}

	/*
	if (isset($options->context) && is_string($options->context) ) {
		$options->context = json_decode($options->context);
	}*/
	#dump($options->context,"options to object");	

	if (isset($options->limit)) {
		#$_SESSION['dedalo4']['config']['max_rows'] = $options->limit;
	}

	if (empty($options->section_tipo)) {
		$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty options->section_tipo (is mandatory)';
		return $response;
	}
	if (empty($options->modo)) {
		$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty options->modo (is mandatory)';
		return $response;
	}

	# Activity case : Only use
	if ($options->section_tipo==DEDALO_ACTIVITY_SECTION_TIPO) {
		$options->tipo_de_dato 			= 'dato';
		$options->tipo_de_dato_order	= 'dato';
	}

	# error_log( to_string($options) );
	# Reset offset
	#$options->offset = 0;
	#$options->offset_list = 0;

	#$options = json_handler::decode(json_encode($options));	# Force array of objects instead default array of arrays format
		#dump($options, 'options', array()); #die();

	if (!defined('SECTION_TIPO')) {
		define('SECTION_TIPO', $options->section_tipo);
	}	
	#dump($options, ' options'); die();

	$section_records 	= new section_records($options->section_tipo, $options);
	$html 				= $section_records->get_html();
	#$html 			=(string)"<br>12345</br>";

	#$html 			= str_replace(':', '_', $html);
	#$html = filter_var($html, FILTER_SANITIZE_STRING);
	
	session_write_close();


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