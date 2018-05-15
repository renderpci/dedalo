<?php
$start_time=microtime(1);
include( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* LOAD_THESAURUS_SECTION
* @return object $response
*/
function load_thesaurus_section($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed [load_thesaurus_section]';

	# set vars
	$vars = array('section_tipo');
		foreach($vars as $name) $$name = common::setVarData($name, $json_data);

	$ts_data = tool_ts_print::build_ts_data($section_tipo);
		#dump(json_encode($ts_data, JSON_PRETTY_PRINT), ' ts_data ++ '.to_string());
	
	# Ecode options JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES 
	#$ts_data_json = json_encode($ts_data, JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_TAG | JSON_HEX_AMP );

	$response->result 	= $ts_data;
	$response->msg 		= 'Ok. Successful [load_thesaurus_section]';

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
}//end load_thesaurus_section




?>