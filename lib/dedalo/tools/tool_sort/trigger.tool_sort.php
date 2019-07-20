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



