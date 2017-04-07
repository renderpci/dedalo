<?php
set_time_limit ( 259200 );  // 3 dias

// JSON DOCUMENT
header('Content-Type: application/json');

$session_duration_hours = 72;
require_once( dirname(dirname(dirname(dirname(dirname(__FILE__))))) .'/config/config4.php');
include_once( DEDALO_LIB_BASE_PATH . '/component_info/widgets/class.widget.php' );

# Disable logging activity and time machine # !IMPORTANT
#logger_backend_activity::$enable_log = false;
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
* LOAD_TERMS
* 
*/
function load_terms() {

	$vars = array('component_tipo','section_tipo','section_id','component_portal_tipo','component_text_area_tipo');
		foreach($vars as $name) $$name = common::setVar($name);

	# Structure widget config
	$widget_str_object = widget::get_widget_str_object($component_tipo, 'descriptors');
	debug_log(__METHOD__." widget_str_object ".to_string(), logger::DEBUG);

	$component_info  = component_common::get_instance($modelo_name='component_info',
													  $component_tipo,
													  $section_id,
													  $modo='edit',
													  $lang=DEDALO_DATA_NOLAN,
													  $section_tipo);
	
	$widget_str_object->component_info = $component_info;

	$widget = widget::getInstance();
	$widget->configure($widget_str_object);
	$widget->modo = 'edit99';

	$html = $widget->get_html();

	$response = new stdClass();
		$response->result 	= $html;
		$response->msg 		= 'Done';
	
	return (object)$response;
}//end load_terms




?>