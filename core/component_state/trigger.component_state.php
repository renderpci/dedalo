<?php
$start_time=microtime(1);
include( DEDALO_CONFIG_PATH.'/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();

# IGNORE_USER_ABORT
#ignore_user_abort(true);



/**
* UPDATE_STATE_LOCATOR
*/
function update_state_locator($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('tipo','parent','modo','lang','section_tipo','top_tipo','options','type','dato');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='dato') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	$options = json_decode($options);
	$dato 	 = (int)$dato;

	$component_state = component_common::get_instance( 'component_state',
														$tipo,
														$parent,
														'edit',
														$lang,
														$section_tipo);

	$component_state->set_options($options);
	$current_valor   = $component_state->get_valor_for_checkbox();

	if($type == 'user'){
		$ar_dato = [$dato,$current_valor[1]];
	}else if($type == 'admin'){
		$ar_dato = [$current_valor[0],$dato];
	}else{
		exit('Error: Invalid type');
	}

	$result = (bool)$component_state->update_state_locator( $options, $ar_dato);

	if($result!==true){
		debug_log(__METHOD__." Error on update_state_locator. result: ".to_string($result), logger::WARNING);
	}

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
}//end update_state_locator



?>