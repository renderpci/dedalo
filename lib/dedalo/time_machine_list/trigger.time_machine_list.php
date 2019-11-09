<?php
$start_time=microtime(1);
require_once( dirname(dirname(__FILE__)).'/config/config.php');
common::trigger_manager();

# IGNORE_USER_ABORT
ignore_user_abort(true);



/**
* GET_TIME_MACHINE_LIST_JSON
* @return object $response
*/
function get_time_machine_list_json($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= null;
		$response->msg 		= 'Error. fail to parse request vars [get_time_machine_list_json]';

	$vars = array('tipo','section_tipo','section_id','modo','value_resolved','limit','offset','count');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);			
		}

	$time_machine_list 		= new time_machine_list($tipo, $section_id, $section_tipo, $modo='edit');
	$time_machine_list->set_value_resolved($value_resolved); 
	$time_machine_list->set_limit($limit);
	$time_machine_list->set_offset($offset);
	$time_machine_list->set_count($count);
	$time_machine_list_json = $time_machine_list->get_json();

	if ($time_machine_list_json !== false) {
		$response->result 	= $time_machine_list_json;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';
	}else{
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed [get_time_machine_list_json]';
	}

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

}//end get_time_machine_list_json


?>