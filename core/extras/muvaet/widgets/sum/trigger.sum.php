<?php
$start_time=microtime(1);
include( DEDALO_CONFIG_PATH .'/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* RESET
* 
*/
function reset($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';


	# set vars
	$vars = array('section_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	$search_options_session_key = 'section_'.$section_tipo;
	if (isset($_SESSION['dedalo4']['config']['sum_total'][$search_options_session_key])) {
		unset($_SESSION['dedalo4']['config']['sum_total'][$search_options_session_key]);

		$response->result 	= true;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.'] Removed session sum_total: '.$search_options_session_key;
	}

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
}//end reset




?>