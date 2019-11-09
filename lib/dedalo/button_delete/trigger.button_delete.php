<?php
$start_time=microtime(1);
include( dirname(dirname(__FILE__)).'/config/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* DEL
* @return 
*/
function Del($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('modo','section_tipo','section_id','top_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			# if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	# FIX SECTION TIPO
	define('SECTION_TIPO', $section_tipo);

	$delete_mode = $modo;

	# Delete method
	$section 	= section::get_instance($section_id, $section_tipo);
	$delete 	= $section->Delete($delete_mode);


	# Update search_query_object full_count property
	$search_options = section_records::get_search_options($section_tipo);
	if ($search_options->search_query_object) {
		$search_options->search_query_object->full_count = true; // Force re-count records
	}


	$response->result 	= $delete;
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
}//end Del



?>