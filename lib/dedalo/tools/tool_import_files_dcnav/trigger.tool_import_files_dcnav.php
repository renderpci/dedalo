<?php
$start_time=microtime(1);
set_time_limit ( 259200 );  // 3 dias
$session_duration_hours = 72;
include( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();

# Disable logging activity and time machine # !IMPORTANT
logger_backend_activity::$enable_log = false;
#RecordObj_time_machine::$save_time_machine_version = false;

# Write session to unlock session file
#session_write_close();



/**
* IMPORT_FILES
* Process previously uploaded images 
*/
function import_files($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';
	
	$vars = array('tipo','section_tipo','top_tipo','top_id','import_mode','ar_data','import_file_name_mode','file_processor_properties','copy_all_filenames_to','optional_copy_filename');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='import_mode' || $name==='top_id' || $name==='file_processor_properties' || $name==='copy_all_filenames_to'|| $name==='optional_copy_filename') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	# Init tool_import_files
	$tool_import_files_dcnav = new tool_import_files_dcnav(null);

	$response = $tool_import_files_dcnav->import_files($json_data);

	// $response->result 	= true;
	// $response->msg 		= 'Import files done successfully. Total: '.$total ." of " .count($ar_data);


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
}//end if ($mode=='import_files')



?>