<?php
// JSON DOCUMENT
header('Content-Type: application/json');

include( dirname(dirname(__FILE__)) .'/config/config4.php');
include(DEDALO_LIB_BASE_PATH.'/lock_components/class.lock_components.php');

if(login::is_logged()!==true) return false;

# Write session to unlock session file
session_write_close();

# Ignore user abort load page
ignore_user_abort(true);

# set vars
	$vars = array('mode',);
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



# CALL FUNCTION
if ( function_exists($mode) ) {
	$result = call_user_func($mode);
	echo json_encode($result);
}



/**
* UPDATE_EVENTS_STATE
* Connects to database and updates user lock components state
* on focus or blur user actions
* @return object $response
*/
function update_lock_components_state() {

	if(SHOW_DEBUG===true) {
		$start_time=microtime(1);
	}

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed on update_lock_components_state';

	$vars = array('section_id','section_tipo','component_tipo','action');
		foreach($vars as $name) $$name = common::setVar($name);
	
	# Verify mandatory vars
	if (empty($section_id)) {
		$response->msg = "Error Processing Request. Few vars! (section_id)";
		return $response;
	}
	if (empty($section_tipo)) {
		$response->msg = "Error Processing Request. Few vars! (section_tipo)";
		return $response;
	}
	if (empty($component_tipo)) {
		$response->msg = "Error Processing Request. Few vars! (component_tipo)";
		return $response;
	}
	if (empty($action)) {
		$response->msg = "Error Processing Request. Few vars! (action)";
		return $response;
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

	$response = lock_components::update_lock_components_state( $event_element );

	if(SHOW_DEBUG===true) {
		#$total=round(microtime(1)-$start_time,3);
		#debug_log(__METHOD__." Total: (update_lock_components_state) ".exec_time($start_time), logger::DEBUG);
	}

	return $response;
}//end update_lock_components_state