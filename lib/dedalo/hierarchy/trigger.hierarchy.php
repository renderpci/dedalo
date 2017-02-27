<?php
require_once( dirname(dirname(__FILE__)).'/config/config4.php');

ignore_user_abort(true);

# Set JSON headers for all responses
header('Content-Type: application/json');

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# set vars
$vars = array('mode');
	foreach($vars as $name) $$name = common::setVar($name);

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");

# CALL FUNCTION
if ( function_exists($mode) ) {
	$result = call_user_func($mode);
	echo json_encode($result);
}



/**
* GENERATE_VIRTUAL_SECTION
*/
function generate_virtual_section() {

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed on generate_virtual_section';
	
	$section_id 	= $_REQUEST['component_parent'];
		if (empty($section_id))
			return '<div class="error">Error: Empty section_id</div>';

	$section_tipo 	= $_REQUEST['section_tipo'];	
		if (empty($section_tipo))
			return '<div class="error">Error: Empty section_tipo</div>';

	$options = new stdClass();
		$options->section_id   = $section_id;
		$options->section_tipo = $section_tipo;
		
	$result = (object)hierarchy::generate_virtual_section( $options );

	switch (true) {
		case isset($result->result) && $result->result===true:
			$class = 'ok';
			break;
		case isset($result->result) && $result->result===false:
			$class = 'warning';
			break;
		default:
			$class = 'warning';
			break;
	}
	if (isset($result->msg)) {
		return '<div class="'.$class.'">'. nl2br($result->msg) .'</div>';
	}

	return null;
}//end generate_virtual_section



/**
* UPDATE_TARGET_SECTION
* @return 
*/
function update_target_section() {

	# set vars
	$vars = array('parent');
		foreach($vars as $name) $$name = common::setVar($name);

	if (empty($parent)) {
		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed (parent:$parent)';
		return $response;
	}	

	$options = new stdClass();
		$options->section_tipo = DEDALO_HIERARCHY_SECTION_TIPO;
		$options->section_id   = (int)$parent;

	$response = hierarchy::update_target_section($options);
	
	return $response;
}//end update_target_section



?>