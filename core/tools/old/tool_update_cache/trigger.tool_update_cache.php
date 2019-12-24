<?php
$start_time=microtime(1);
set_time_limit ( 259200 );  // 3 dias
$session_duration_hours = 72;
include( DEDALO_CONFIG_PATH .'/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();

# Disable logging activity and time machine # !IMPORTANT
logger_backend_activity::$enable_log = false;
#RecordObj_time_machine::$save_time_machine_version = false;

# Write session to unlock session file
session_write_close();



/**
* UPDATE_CACHE
* @param $json_data
*/
function update_cache($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('section_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='dato') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}	

	$tool_update_cache  = new tool_update_cache($section_tipo);
	$response 			= (object)$tool_update_cache->update_cache();
	
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
}//end update_cache



/**
* UPDATE_CACHE
* @param $section_tipo
* @param $section_id
*//*
function update_cache_by_section_id_XXXX(){

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed update_cache_by_section_id';

	# set vars
	$vars = array('section_tipo','section_id');
		foreach($vars as $name) $$name = common::setVar($name);

	if (empty($section_tipo)) {
		$response->msg = "Error Processing Request: section_tipo is mandatory";
		return $response;
	}
	if (empty($section_id)) {
		$response->msg = "Error Processing Request: section_id is mandatory";
		return $response;
	}

	$locator = new locator();
		$locator->set_section_tipo($section_tipo);
		$locator->set_section_id($section_id);	

	$options = new stdClass();
		$options->filter_by_id = array( $locator );
	
	$tool_update_cache  = new tool_update_cache($section_tipo);
	$result  			= $tool_update_cache->update_cache( $options );


	if(SHOW_DEBUG) {		
		#dump(tool_update_cache::$debug_response,'$tool_update_cache->debug_response');		
	}
	
	if ($result==true) {
		echo 'Ok. update_cache done. '. to_string($section_id);
	}else{
		echo $result;
	}
	
	debug_log(__METHOD__." update_cache_by_section_id trigger result: ".to_string($result), logger::DEBUG);


	return $response;
}//end update_cache_by_section_id */



?>