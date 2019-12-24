<?php
$start_time=microtime(1);
include( DEDALO_CONFIG_PATH.'/config.php');
include(DEDALO_CORE_PATH.'/lock_components/class.lock_components.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();

# Write session to unlock session file
session_write_close();

# Ignore user abort load page
ignore_user_abort(true);



/**
* UPDATE_EVENTS_STATE
* Connects to database and updates user lock components state
* on focus or blur user actions
* @return object $response
*/
function update_lock_components_state($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('section_id','section_tipo','component_tipo','action');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}
	
	$user_id = (int)$_SESSION['dedalo4']['auth']['user_id'];	
	if ($user_id<0) {
		$full_username 	= "Debug user";
	}else{
		$full_username 	= $_SESSION['dedalo4']['auth']['full_username'];
	}

	$event_element = new stdClass();
		$event_element->section_id 	 	= $section_id;
		$event_element->section_tipo 	= $section_tipo;
		$event_element->component_tipo 	= $component_tipo;
		$event_element->action 		 	= $action;
		$event_element->user_id 		= $user_id;
		$event_element->full_username  	= $full_username;
		$event_element->date  			= date("Y-m-d H:i:s");

	$response = (object)lock_components::update_lock_components_state( $event_element );
	
	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			foreach($vars as $name) {
				$debug->{$name} = $$name;
			}

		$response->debug = $debug;
	}

	return $response;
}//end update_lock_components_state


