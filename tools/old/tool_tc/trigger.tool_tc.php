<?php
$start_time=microtime(1);
set_time_limit ( 259200 );  // 3 dias
$session_duration_hours = 72;
include( DEDALO_CONFIG_PATH.'/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();

# Disable logging activity and time machine # !IMPORTANT
logger_backend_activity::$enable_log = false;
#RecordObj_time_machine::$save_time_machine_version = false;

# Write session to unlock session file
session_write_close();



/**
* CHANGE_ALL_TIMECODES
* 
*/
function change_all_timecodes($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('tipo','section_tipo','parent','lang','offset_seconds','save');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='save') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	if (is_string($save)) {
		$save = json_decode($save);
	}

	$modelo_name 	 = RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
	$component_obj 	 = component_common::get_instance($modelo_name,
													  $tipo,
													  $parent,
													  'edit',
													  $lang,
													  $section_tipo);

	$tool_tc  = new tool_tc($component_obj);
	$response = (object)$tool_tc ->change_all_timecodes( $offset_seconds, $save );

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
}//end change_all_timecodes



?>