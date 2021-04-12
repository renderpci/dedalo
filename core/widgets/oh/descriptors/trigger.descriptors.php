<?php
$start_time=microtime(1);
set_time_limit ( 259200 );  // 3 dias
$session_duration_hours = 72;
include( dirname(dirname(dirname(dirname(dirname(__FILE__))))) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/component_info/widgets/class.widget.php' );
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();

# IGNORE_USER_ABORT
ignore_user_abort(true);



# Disable logging activity and time machine # !IMPORTANT
#logger_backend_activity::$enable_log = false;
#RecordObj_time_machine::$save_time_machine_version = false;

# Write session to unlock session file
session_write_close();



/**
* LOAD_TERMS
* 
*/
function load_terms($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('component_tipo','section_tipo','section_id','component_portal_tipo','component_text_area_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

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

	$response->result 	= $html;
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
}//end load_terms




?>