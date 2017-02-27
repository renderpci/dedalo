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
* ADD_RELATED
* @return bool
*/
function add_related() {

	$result = false;
	
	$vars = array('tipo','parent','section_tipo','target_section_tipo','target_section_id');
		foreach($vars as $name) {
			$$name = common::setVar($name);
			if (empty($$name)) {
				exit("Error. ".$$name." is mandatory");
			}
		}

	// tipo, $parent, $section_tipo, $children_section_tipo, $children_section_id, $children_component_tipo
	$modelo_name 	= 'component_relation_related';
	$modo 			= 'edit';
	$lang 			= DEDALO_DATA_NOLAN;	
	$component_relation_related    = component_common::get_instance($modelo_name,
													  				$tipo,
													  				$parent,
													  				$modo,
													  				$lang,
													  				$section_tipo);
	$locator = new locator();
		$locator->set_section_tipo($target_section_tipo);
		$locator->set_section_id($target_section_id);
		$locator->set_type($component_relation_related->get_relation_type());
		$locator->set_type_rel($component_relation_related->get_relation_type_rel());
		$locator->set_from_component_tipo($tipo);
			#dump($locator, ' locator ++ '.to_string());

	$added = (bool)$component_relation_related->add_related( $locator );
	if ($added===true) {
		$component_relation_related->Save();
		$result = true;
	}

	return (bool)$result;
}//end add_related



/**
* REMOVE_related
* @return bool
*/
function remove_related() {

	$result = false;
	
	$vars = array('tipo','parent','section_tipo','target_section_tipo','target_section_id');
		foreach($vars as $name) {
			$$name = common::setVar($name);
			if (empty($$name)) {
				exit("Error. ".$$name." is mandatory");
			}
		}


	$modelo_name 	= 'component_relation_related';
	$modo 			= 'edit';
	$lang 			= DEDALO_DATA_NOLAN;	
	$component_relation_related    = component_common::get_instance($modelo_name,
													  				$tipo,
													  				$parent,
													  				$modo,
													  				$lang,
													  				$section_tipo);
	$locator = new locator();
		$locator->set_section_tipo($target_section_tipo);
		$locator->set_section_id($target_section_id);
		$locator->set_type($component_relation_related->get_relation_type());
		$locator->set_from_component_tipo($tipo);

	# Remove
	$removed = (bool)$component_relation_related->remove_related( $locator );
	if ($removed===true) {
		$component_relation_related->Save();
		$result = true;
	}

	return (bool)$result;
}//end remove_related












?>