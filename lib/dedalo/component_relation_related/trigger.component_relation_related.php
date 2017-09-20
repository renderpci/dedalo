<?php
$start_time=microtime(1);
include( dirname(dirname(__FILE__)).'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();

# IGNORE_USER_ABORT
ignore_user_abort(true);



/**
* ADD_RELATED
* @return bool
*/
function add_related($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';
	
	$vars = array('tipo','parent','section_tipo','target_section_tipo','target_section_id');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
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
}//end add_related



/**
* REMOVE_related
* @return bool
*/
function remove_related($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';
	
	$vars = array('tipo','parent','section_tipo','target_section_tipo','target_section_id');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
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
}//end remove_related



?>