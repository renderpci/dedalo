<?php
$start_time=microtime(1);
set_time_limit ( 3600 * 2 );  // 2 horas (1h = 3600 sec)
include( dirname(dirname(dirname(__FILE__))) .'/config/config.php');
include( dirname(__FILE__) .'/class.tool_import_marc21.php');  # Read constants from here (pass url 'button_tipo' if needed)
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();

# Write session to unlock session file
session_write_close();



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
	$vars = array('target_file_path','target_file_name','projects_value');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='dato') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}
	$projects_value = json_decode($projects_value);
	$projects_dato  = array();
	foreach ((array)$projects_value as $key => $value) {
		$projects_dato[$value] = '2';
	}

	$section_tipo = tool_import_marc21::MARC21_IMPORT_SECTION_TIPO;
	$section_obj = section::get_instance(null, $section_tipo);
	$modo  		 = 'edit';
	$tool_import_marc21 = new tool_import_marc21( $section_obj, $modo );

	$file = $target_file_path .'/'. $target_file_name;
	if (!file_exists($file)) {
		$response->msg = 'Error. File not found: '.$target_file_name;
		if(SHOW_DEBUG===true) {
			$response->msg .= " - path: $file ";
		}
		return $response;
	}

	# process_file returns object response
	$response = (object)$tool_import_marc21->process_file($file, $projects_dato);

		
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