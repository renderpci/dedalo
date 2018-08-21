<?php
$start_time=microtime(1);
require_once( dirname(dirname(__FILE__)).'/config/config4.php');
common::trigger_manager();

# IGNORE_USER_ABORT
ignore_user_abort(true);



/**
* GET_JSON
* @return object $response
*/
function get_json($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed [get_json]';
	
	$vars = array('tipo','section_tipo','section_id','modo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			if (empty($$name)) {
				exit("Error. ".$$name." is mandatory");
			}
		}

	$relation_list = new relation_list($tipo, $section_id, $section_tipo, $modo='edit');
	$relation_list_json = $relation_list->get_json();

	if ($added===true) {
		$response->result 	= $relation_list_json;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';
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

}//end get_json


?>