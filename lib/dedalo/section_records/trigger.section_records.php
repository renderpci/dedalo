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



/**
* SEARCH_ROWS (JSON VERSION)
*/
function search_rows($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';
	
	# set vars
	$vars = array('search_query_object','result_parse_mode','ar_list_map');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='result_parse_mode') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.safe_xss($name).' (is mandatory)';
				return $response;
			}
		}	
	
	# Received post var 'options' is a json object stringnified. Decode to regenrate original object
	# $options = json_decode($options);
		if (!is_object($search_query_object)) {
			$response->msg = 'Trigger Error: ('.__FUNCTION__.') Received data must be a object (search_query_object)';
			return $response;
		}

	// Remove search query object select to force get 'datos' container full (!)
		$search_query_object->select = [];

	// Change search_query_object id to avoid collisions
		$search_query_object->id = $search_query_object->section_tipo . '_search_rows_temp';

	// Debug
		#$search_query_object->limit = 20;

	// Search against database
		$search_development2 = new search_development2($search_query_object);
		$rows_data 		 	 = $search_development2->search();

	// result_parse_mode optional
		switch ($result_parse_mode) {
			case 'list':
				// Resolve components in mode list
				$result = section::build_json_rows($rows_data, $result_parse_mode, $ar_list_map);
				break;
			case 'edit':
				// Resolve components in mode edit
				$result = section::build_json_rows($rows_data, $result_parse_mode, $ar_list_map);
				break;
			#case 'db':
			#	// Only format data as {data:ar_records,context:ar_context}
			#	$result = section::build_json_rows($rows_data, $result_parse_mode, $ar_list_map);
			#	break;
			default:
				// false / none mode. Nothing to do
				$result = $rows_data->ar_records;
				break;
		}
		
	// search_query_object. Add updated search_query_object
		$result->search_query_object = $search_query_object;

	// Save current search options
		$search_options = new stdClass();
			$search_options->modo 	 = 'list';
			$search_options->context = new stdClass();
				$search_options->context->context_name = 'default';
			$search_options->search_query_object = $search_query_object;
		$search_options_id = $search_query_object->section_tipo . '_json'; // section tipo like oh1	
		section_records::set_search_options($search_options, $search_options_id);
		

	$response->result 	= $result;
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
}//end search_rows



