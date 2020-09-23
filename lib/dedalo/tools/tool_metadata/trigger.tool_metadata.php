<?php
$start_time=microtime(1);
set_time_limit ( 345600 );  // 4 dias: 4 * 24 * 3600
$session_duration_hours = 96;
include( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();


# Disable logging activity and time machine # !IMPORTANT
// logger_backend_activity::$enable_log = false;
// RecordObj_time_machine::$save_time_machine_version = true;



/**
* PROCESS_FILES
*/
function process_files($json_data) {
	global $start_time;

	# Write session to unlock session file
	session_write_close();

	# Ignore user close browser
	ignore_user_abort(true);
	
	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('data','path','extensions');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='extensions') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	$response = (object)tool_metadata::process_files($path, $data, $extensions);

	
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
}//end process_files



/**
* COUNT_FILES
*/
function count_files($json_data) {
	global $start_time;

	# Write session to unlock session file
	session_write_close();

	# Ignore user close browser
	ignore_user_abort(true);
	
	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('path','extensions');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='extensions') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	$response = (object)tool_metadata::count_files($path, $extensions);

	
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
}//end count_files



/**
* CHECK_EXIFTOOL
*/
function check_exiftool($json_data) {
	global $start_time;
	
	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';	

	$response = (object)tool_metadata::check_exiftool();

	
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
}//end check_exiftool


