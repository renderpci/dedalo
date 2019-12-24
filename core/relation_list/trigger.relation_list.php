<?php
$start_time=microtime(1);
require_once( DEDALO_CONFIG_PATH.'/config.php');
common::trigger_manager();

# IGNORE_USER_ABORT
ignore_user_abort(true);



/**
* GET_RELATION_LIST_JSON
* @return object $response
*/
function get_relation_list_json($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= null;
		$response->msg 		= 'Error. fail to parse request vars [get_relation_list_json]';

	$vars = array('tipo','section_tipo','section_id','modo','value_resolved','limit','offset','count');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);			
		}

	$relation_list 		= new relation_list($tipo, $section_id, $section_tipo, $modo='edit');
	$relation_list->set_value_resolved($value_resolved); 
	$relation_list->set_limit($limit);
	$relation_list->set_offset($offset);
	$relation_list->set_count($count);
	$relation_list_json = $relation_list->get_json();

	if ($relation_list_json !== false) {
		$response->result 	= $relation_list_json;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';
	}else{
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed [get_relation_list_json]';
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

}//end get_relation_list_json


?>