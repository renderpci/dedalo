<?php
$start_time=microtime(1);
include( dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* AUTOMATIC TRANSLATION
* @param $source_lang
* @param $target_lang
* @param $source_id
* @param $component_tipo
* @param $section_id
*/
function automatic_translation($json_data) {
	global $start_time;

	# Write session to unlock session file
	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# mandatory vars
	$vars = array('source_lang','target_lang','component_tipo','section_id','section_tipo','translator');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				#if ($name==='dato') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}
			#debug_log(__METHOD__." options ".to_string($json_data), logger::DEBUG);

	// Options are the same as received json_data object
	$options  = $json_data;
	$response = tool_lang_multi::automatic_translation($options);

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
}//end automatic_translation






