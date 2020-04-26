<?php
$start_time=microtime(1);
set_time_limit ( 3600 * 2 );  // 2 Hours (1h = 3600 sec)
include( DEDALO_CONFIG_PATH .'/config.php');
include( dirname(__FILE__) .'/class.tool_import_kml.php');  # Read constants from here (pass url 'button_tipo' if needed)
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* PROCESS_FILE
* 
*/
function process_file($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('target_file_path','target_file_name','section_tipo','button_import_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='dato') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	# File check
	$file = $target_file_path .'/'. $target_file_name;
	if (!file_exists($file)) {
		$response->msg = 'Error. File not found: '.$target_file_name;
		if(SHOW_DEBUG===true) {
			$response->msg .= " - path: $file ";
		}
		return $response;
	}	

	# Inject. Needed for class tool_import_kml
	$_GET['button_tipo'] = $button_import_tipo;

	# Create tool
	$dummy_section_obj 	= section::get_instance(null, $section_tipo);
	$tool_import_kml 	= new tool_import_kml( $dummy_section_obj, 'edit' );


	# Process file returns object response
	$response = (object)$tool_import_kml->process_file($file);

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
}//end process_file



?>