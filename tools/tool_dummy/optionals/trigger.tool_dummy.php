<?php
$start_time=hrtime(true);
include( dirname(dirname(dirname(__FILE__))) .'/config/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* MY_CUSTOM_STATIC_CALL
* @param object $json_data
*/
function my_custom_static_call($json_data) {
	global $start_time;

	// unlock session file
		session_write_close();

	// default response
		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

	// exec
		$options	= $json_data;
		$response	= tool_dummy::my_custom_static_method($options);

	// debug info
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				$debug->json_data	= $json_data;
			$response->debug = $debug;
		}


	return (object)$response;
}//end my_custom_static_call


