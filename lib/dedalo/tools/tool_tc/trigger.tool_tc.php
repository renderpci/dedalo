<?php
set_time_limit ( 259200 );  // 3 dias

// JSON DOCUMENT
header('Content-Type: application/json');

$session_duration_hours = 72;
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

# Disable logging activity and time machine # !IMPORTANT
logger_backend_activity::$enable_log = false;
#RecordObj_time_machine::$save_time_machine_version = false;


# Write session to unlock session file
session_write_close();


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


# CALL FUNCTION
if ( function_exists($mode) ) {
	$result = call_user_func($mode);
	echo json_encode($result);
}


/**
* change_all_timecodes
* 
*/
function change_all_timecodes() {

	$vars = array('tipo','section_tipo','parent','lang','offset_seconds','save');
		foreach($vars as $name) $$name = common::setVar($name);

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
	$response = $tool_tc ->change_all_timecodes( $offset_seconds, $save );

	
	return (object)$response;
}//end change_all_timecodes



?>