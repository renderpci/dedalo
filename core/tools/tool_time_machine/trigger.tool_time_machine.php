<?php
$start_time=microtime(1);
include( dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* APPLY_VALUE
* @param $section_id
* @param $section_tipo
* @param $tipo
* @param $lang
* @param $matrix_id
*/
function apply_value($json_data) {
	global $start_time;

	#debug_log(__METHOD__." TOP_TIPO: ".TOP_TIPO." - TOP_ID: ".TOP_ID.to_string(), logger::DEBUG);

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('section_id','section_tipo','tipo','lang','matrix_id');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='matrix_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	# Extraemos el dato de matrix_time_machine
	$RecordObj_time_machine = new RecordObj_time_machine($matrix_id);
	$dato_time_machine 		= $RecordObj_time_machine->get_dato();
		#debug_log(__METHOD__." dato_time_machine ".to_string($dato_time_machine), logger::DEBUG);


	$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
	$component_obj_to_save	= component_common::get_instance($modelo_name,
															 $tipo,
															 $section_id,
															 'edit',
															 $lang,
															 $section_tipo);

	# Set dato overwrite current component dato
	$component_obj_to_save->set_dato($dato_time_machine);

	# Save component with nee updated dato from time machine
	$component_obj_to_save->Save();


	$response->result 	= true;
	$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			foreach($vars as $name) {
				$debug->{$name} = $$name;
			}
			#$debug->dato_time_machine = $dato_time_machine;

		$response->debug = $debug;
	}

	return (object)$response;
}//end apply_value


