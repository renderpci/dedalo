<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');

if(login::is_logged()!==true) return;
//die("<span class='error'> Auth error: please login </span>");


ignore_user_abort(true);


# set vars
	$vars = array('mode',);
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


require_once(DEDALO_LIB_BASE_PATH.'/lock_components/class.lock_components.php');

/**
* UPDATE_EVENTS_STATE
*/
if ($mode=='update_lock_components_state') {

	$vars = array('section_id','section_tipo','component_tipo','action');
		foreach($vars as $name) $$name = common::setVar($name);
	

	if (empty($section_id)) {
		throw new Exception("Error Processing Request. Few vars! (section_id)", 1);
	}
	if (empty($section_tipo)) {
		throw new Exception("Error Processing Request. Few vars! (section_tipo)", 1);
	}
	if (empty($component_tipo)) {
		throw new Exception("Error Processing Request. Few vars! (component_tipo)", 1);
	}
	if (empty($action)) {
		throw new Exception("Error Processing Request. Few vars! (action)", 1);
	}
	
	$user_id 		= $_SESSION['dedalo4']['auth']['user_id'];
	$full_username 	= $_SESSION['dedalo4']['auth']['full_username'];
	session_write_close();

	if ($user_id==-1) {
		$full_username 	= "Debug user";
	}


	$event_element = new stdClass();
		$event_element->section_id 	 	= $section_id;
		$event_element->section_tipo 	= $section_tipo;
		$event_element->component_tipo 	= $component_tipo;
		$event_element->action 		 	= $action;
		$event_element->user_id 		= $user_id;
		$event_element->full_username  	= $full_username;
		$event_element->date  			= date("Y-m-d H:i:s");

	$result_obj = lock_components::update_lock_components_state( $event_element );

	echo json_encode($result_obj);
	exit();

}//end if ($mode=='update_lock_components_state')