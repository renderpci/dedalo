 <?php
$start_time=microtime(1);
include( dirname(dirname(dirname(__FILE__))).'/config/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* AUTOCOMPLETE_SEARCH
* Get list of mathed DB results for current string by ajax call
* @param object $json_data
*/
function autocomplete_search($json_data) {
	global $start_time;

	# Write session to unlock session file
	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('component_tipo','section_tipo','divisor','search_query_object');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='filter_sections') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	/*
	if (!$search_query_object = json_decode($search_query_object)) {
		$response->msg = "Trigger Error. Invalid search_query_object";
		return $response;
	}
	*/
	if(SHOW_DEBUG===true) {
		#debug_log(__METHOD__." search_query_object ".to_string($search_query_object), logger::DEBUG);
		#dump(null, ' trigger search_query_object ++ '. json_encode($search_query_object, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)); #die();
	}

	$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
	$component 	 = component_common::get_instance($modelo_name,
												 $component_tipo,
												 null,
												 'list',
												 DEDALO_DATA_LANG,
												 $section_tipo);

	$result 	 = (array)$component->autocomplete_search(
												 $search_query_object,
												 $divisor);

	$response->result 	= $result;
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
}//end function autocomplete_search')


