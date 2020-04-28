<?php
$start_time=microtime(1);
include( dirname(dirname(dirname(__FILE__))) .'/config/config.php');


# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
	// default behavior
	common::trigger_manager();


/**
* GET_PDF_DATA
* @param $json_data
*/
function get_pdf_data($json_data) {
	global $start_time;

	# Write session to unlock session file
	session_write_close();

	# set vars
	$vars = array();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$tool_pdf_extractor = new tool_pdf_extractor();
	$response->result = $tool_pdf_extractor->get_pdf_data($json_data);
	$response->msg 	  = 'Ok. Request done ['.__FUNCTION__.']';

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
}//end get_system_info
