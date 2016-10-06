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
* ADD_CHILDREN
* @return bool
*/
function add_children() {

	$result = false;
	
	$vars = array('tipo','parent','section_tipo','target_section_tipo','target_section_id');
		foreach($vars as $name) {
			$$name = common::setVar($name);
			if (empty($$name)) {
				exit("Error. ".$$name." is mandatory");
			}
		}

	// tipo, $parent, $section_tipo, $children_section_tipo, $children_section_id, $children_component_tipo
	$modelo_name 	= 'component_relation_children';
	$modo 			= 'edit';
	$lang 			= DEDALO_DATA_NOLAN;	
	$component_relation_children   = component_common::get_instance($modelo_name,
													  				$tipo,
													  				$parent,
													  				$modo,
													  				$lang,
													  				$section_tipo);
	
	$added = (bool)$component_relation_children->make_me_your_children( $target_section_tipo, $target_section_id );
	if ($added===true) {
		$component_relation_children->Save();
		$result = true;
	}

	return (bool)$result;
}//end add_children



/**
* REMOVE_CHILDREN
* @return bool
*/
function remove_children() {

	$result = false;
	
	$vars = array('tipo','parent','section_tipo','target_section_tipo','target_section_id');
		foreach($vars as $name) {
			$$name = common::setVar($name);
			if (empty($$name)) {
				exit("Error. ".$$name." is mandatory");
			}
		}


	$modelo_name 	= 'component_relation_children';
	$modo 			= 'edit';
	$lang 			= DEDALO_DATA_NOLAN;	
	$component_relation_children   = component_common::get_instance($modelo_name,
													  				$tipo,
													  				$parent,
													  				$modo,
													  				$lang,
													  				$section_tipo);

	# REMOVE_ME_AS_YOUR_CHILDREN
	# We use this this method (remove_me_as_your_children) instead 'remove_children' to unify calls with add_children
	# and avoid errors on create locators (this way force always recrete locator in component)
	$removed = (bool)$component_relation_children->remove_me_as_your_children( $target_section_tipo, $target_section_id );
	if ($removed===true) {
		$component_relation_children->Save();
		$result = true;
	}

	/* Método eliminando por locator:		
		$locator = json_decode($locator);
		$removed = (bool)$component_relation_children->remove_children($locator);
		if ($removed===true) {
			$component_relation_children->Save();
			$result = true;
		}
		*/

	return (bool)$result;
}//end remove_children












?>