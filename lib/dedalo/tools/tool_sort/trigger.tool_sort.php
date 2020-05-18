<?php
$start_time=microtime(1);
include( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* ASSIGN_ELEMENT
* @param $target
* @param $locator
*/
function assign_element($json_data) {
	global $start_time;

	# Write session to unlock session file
	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('target','locator');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='update_component_tipo') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}
	
	// check locator
		if (empty($locator) || !is_object($locator)) {
			$response->msg .= ' Invalid locator. It must be an non empty object';
			return $response;
		}


	// component. set dato and save
		$component_tipo = $target->tipo;
		$section_tipo 	= $target->section_tipo;
		$section_id 	= $target->section_id;
		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		$component   = component_common::get_instance($modelo_name,
													  $component_tipo,
													  $section_id,
													  "edit",
													  DEDALO_DATA_LANG,
													  $section_tipo);
		$component->add_locator($locator);
		$component->Save();

	// response
		$response->result 	= true;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

	// Debug
		if(SHOW_DEBUG===true) {

			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}
			$response->debug = $debug;
		}
	
	return (object)$response;
}//end assign_element



/**
* SET_ORIGINAL_DUPLICATE
* @param $section_tipo
* @param $original_id
* @param $duplicates_id
*/
function set_original_duplicate($json_data) {
	global $start_time;

	# Write session to unlock session file
	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('section_tipo','original_id','duplicates_id');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='duplicates_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}
	
	// relation_related_tipo
		$ar_component_relation_related = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, ['component_relation_related'], $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true, $ar_tipo_exclude_elements=false);
		if (empty($ar_component_relation_related)) {
			$response->msg .= ' component_relation_related not found in section '.$section_tipo;
			return $response;
		}else{
			$component_relation_related = $ar_component_relation_related[0];
		}

	// component_realted. set dato and save
		$component_realated_tipo 	= $component_relation_related;		
		$section_id  				= $original_id;
		$modelo_name 				= RecordObj_dd::get_modelo_name_by_tipo($component_relation_related,true);
		$component_realted   		= component_common::get_instance($modelo_name,
													  $component_realated_tipo,
													  $section_id,
													  "edit",
													  DEDALO_DATA_NOLAN,
													  $section_tipo);
		$dato = [];
		foreach ($duplicates_id as $current_section_id) {
			
			$locator = new locator();
				$locator->set_section_tipo($section_tipo);
				$locator->set_section_id($current_section_id);
				$locator->set_from_component_tipo($component_relation_related);
			
			$dato[] = $locator;
		}

		$component_realted->set_dato($dato);
		$component_realted->Save();

		//set the discard select in archive
		// ORIGINAL
		$discard_dato			= [];
		$discard_tipo 			= 'numisdata157';
		$discad_model 			= RecordObj_dd::get_modelo_name_by_tipo($discard_tipo, true);
		$target_section_tipo 	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($discard_tipo, 'section', 'termino_relacionado', $search_exact=true);

		$component_discard = component_common::get_instance($discad_model,
														 $discard_tipo,
														 $section_id,
														 'list',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);
		$original_id = 1;
		$locator = new locator();
				$locator->set_section_tipo($target_section_tipo[0]);
				$locator->set_section_id($original_id);
				$locator->set_from_component_tipo($discard_tipo);

		$discard_dato[] = $locator;
		$component_discard->set_dato($discard_dato);
		$component_discard->Save();

		// COPY
		$discard_dato_copy = [];
		$original_id = 2;
		$locator = new locator();
				$locator->set_section_tipo($target_section_tipo[0]);
				$locator->set_section_id($original_id);
				$locator->set_from_component_tipo($discard_tipo);
		$discard_dato_copy[] = $locator;

		foreach ($duplicates_id as $current_section_id) {

			$component_discard = component_common::get_instance($discad_model,
														 $discard_tipo,
														 $current_section_id,
														 'list',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);
			
			$component_discard->set_dato($discard_dato_copy);
			$component_discard->Save();
		}


	// response
		$response->result 	= true;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

	// Debug
		if(SHOW_DEBUG===true) {

			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}
			$response->debug = $debug;
		}
	
	return (object)$response;
}//end set_original_duplicate
