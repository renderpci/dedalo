<?php
$start_time=microtime(1);
include( DEDALO_CONFIG_PATH .'/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* set_new_thesaurus_value
* @param $source_tipo
* @param $target_tipo
* @param $section_id
* @param $section_tipo
*/
function set_new_thesaurus_value($json_data) {
	global $start_time;

	# Write session to unlock session file
	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('section_tipo','section_id','component_tipo','dato','update_component');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='update_component_tipo') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}
	
	// check dato
		if (empty($dato) || !is_array($dato)) {
			$response->msg .= ' Invalid dato. It must be an non empty array';
			return $response;
		}


	// component. set dato and save
		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		$component   = component_common::get_instance($modelo_name,
													  $component_tipo,
													  $section_id,
													  "edit",
													  DEDALO_DATA_LANG,
													  $section_tipo);
		$component->set_dato($dato);
		$component->Save();


	// update optional component
		if ($update_component!==false) {

			$update_component_tipo 			= $update_component->component_tipo;
			$update_component_section_tipo 	= $update_component->section_tipo;
			$update_component_section_id 	= $update_component->section_id;
			
			// Simply load in edit mode the compomponent to force update its data
				$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($update_component_tipo,true);
				$update_component   = component_common::get_instance($modelo_name,
																	 $update_component_tipo,
																	 $update_component_section_id,
																	 "edit",
																	 DEDALO_DATA_LANG,
																	 $update_component_section_tipo);

				# Custom properties external dato 
				$update_properties = $update_component->get_properties();
				if(isset($update_properties->source->mode) && $update_properties->source->mode==='external') {
					$update_component->set_dato_external(true);	// Forces update dato with calculated external dato					
				}
				$update_dato = $update_component->get_dato(); // force update					
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
}//end set_new_thesaurus_value



