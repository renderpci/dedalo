<?php
$start_time=microtime(1);
include( dirname(dirname(__FILE__)).'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();


/**
* AUTOCOMPLETE
* Get list of mathed DB results for current string by ajax call
* @param $ar_tipo_to_search
* @param $string_to_search
*/
function autocomplete($json_data) {
	global $start_time;

	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed [get_component_json_data]';	
	
	$vars = array('hierarchy_types','hierarchy_sections','string_to_search');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = "Trigger Error: (get_component_json_data) Empty ".$name." (is mandatory)";
				return $response;
			}
		}
	

	$hierarchy_types 	= json_decode($hierarchy_types);
	$hierarchy_sections = json_decode($hierarchy_sections);

	$result = component_autocomplete_hi::autocomplete_hi_search($hierarchy_types,
																$hierarchy_sections,
																$string_to_search,
																50,
																true,
																true); //$ar_referenced_tipo, $string_to_search, $max_results=30, $show_modelo_name=true, $source_mode

	$response->result 	= $result;
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
}//end autocomplete




/**
* UPDATE_COMPONENT_RELATED
* @return 
*/
function update_component_related($json_data) {

	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('ar_locators');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}


	if(!$ar_locators = json_decode($ar_locators)) {
		return (object)$response;
	}

	$ar_locators = json_decode($ar_locators);
	$locator = end($ar_locators);

	$section_id = $locator->section_id;
	$section_tipo = $locator->section_tipo;

	# Geo
	$component_geo	= component_common::get_instance('component_geolocation',
													 DEDALO_THESAURUS_GEOLOCATION_TIPO,
													 $section_id,
													 'edit',
													 DEDALO_DATA_NOLAN,
													 $section_tipo);
	$geo_dato = $component_geo->get_dato();

	$response = new stdClass();
		$response->result 	= $geo_dato;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			foreach($vars as $current_locator) {
				$debug->{$current_locator} = $$current_locator;
			}

		$response->debug = $debug;
	}


	return (object)$response;
	
}#end update_component_related


?>