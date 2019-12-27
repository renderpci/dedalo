<?php
$start_time=microtime(1);
include(dirname(dirname(dirname(__FILE__))).'/config/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();

# IGNORE_USER_ABORT
ignore_user_abort(true);



/**
* ADD_PARENT
* @return bool
*/
function add_parent($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('tipo','parent','section_tipo','children_section_tipo','children_section_id');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	$add_parent = component_relation_parent::add_parent($tipo, $parent, $section_tipo, $children_section_tipo, $children_section_id);

	$response->result 	= $add_parent;
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
}//end add_parent



/**
* REMOVE_PARENT
* @return bool
*/
function remove_parent($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';


	$vars = array('tipo','parent','section_tipo','children_section_tipo','children_section_id','children_component_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			if (empty($$name)) {
				exit("Error. ".$$name." is mandatory");
			}
		}

	$remove_parent 		= component_relation_parent::remove_parent($tipo, $parent, $section_tipo, $children_section_tipo, $children_section_id, $children_component_tipo);

	$response->result 	= $remove_parent;
	$response->msg 		= 'Ok. Request done [remove_parent]';

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
}//end remove_parent



?>
