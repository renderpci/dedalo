<?php
$start_time=microtime(1);
require_once( dirname(dirname(__FILE__)).'/config/config4.php');
common::trigger_manager();

# IGNORE_USER_ABORT
ignore_user_abort(true);



/**
* ADD_CHILDREN
* @return object $response
*/
function add_children($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed [add_children]';
	
	$vars = array('tipo','parent','section_tipo','target_section_tipo','target_section_id');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
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
		$response->result 	= true;
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
}//end add_children



/**
* REMOVE_CHILDREN
* @return object $response
*/
function remove_children($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed [remove_children]';
	
	$vars = array('tipo','parent','section_tipo','target_section_tipo','target_section_id');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
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
		$response->result 	= true;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';
	}

	/* Método eliminando por locator:		
		$locator = json_decode($locator);
		$removed = (bool)$component_relation_children->remove_children($locator);
		if ($removed===true) {
			$component_relation_children->Save();
			$result = true;
		}
		*/

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
}//end remove_children




?>