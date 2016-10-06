<?php
require_once( dirname(dirname(__FILE__)).'/config/config4.php');

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# set vars
	$vars = array('mode');
		foreach($vars as $name) $$name = common::setVar($name);

# Set JSON headers for all responses
header('Content-Type: application/json');

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


# CALL FUNCTION
if ( function_exists($mode) ) {
	$res = call_user_func($mode);
	echo json_encode($res);
}



/**
* ADD_PARENT
* @return bool
*/
function add_parent() {

	$result = false;
	
	$vars = array('tipo','parent','section_tipo','children_section_tipo','children_section_id','children_component_tipo');
		foreach($vars as $name) {
			$$name = common::setVar($name);
			if (empty($$name)) {
				exit("Error. ".$$name." is mandatory");
			}
		}
		
	$result = component_relation_parent::add_parent($tipo, $parent, $section_tipo, $children_section_tipo, $children_section_id, $children_component_tipo);

	return (bool)$result;
}//end add_parent




/**
* REMOVE_PARENT
* @return bool
*/
function remove_parent() {

	$result = false;
	
	$vars = array('tipo','parent','section_tipo','children_section_tipo','children_section_id','children_component_tipo');
		foreach($vars as $name) {
			$$name = common::setVar($name);
			if (empty($$name)) {
				exit("Error. ".$$name." is mandatory");
			}
		}
	
	$result = component_relation_parent::remove_parent($tipo, $parent, $section_tipo, $children_section_tipo, $children_section_id, $children_component_tipo);
	
	return (bool)$result;
}//end remove_parent











?>