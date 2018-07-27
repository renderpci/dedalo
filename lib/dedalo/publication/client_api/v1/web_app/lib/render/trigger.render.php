<?php
/**
* TRIGGER RENDER
*/
# CONFIG
	$start_time=microtime(1);
	require(dirname(dirname(dirname(__FILE__))) . '/config/config.php');
	

# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
	common::trigger_manager();



/**
* LOAD_VIDEO_FREE_SEARCH
* @return object $response
*/
function load_video_free_search($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('q','lang','section_id');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	# Search	
	$options = new stdClass();
		$options->dedalo_get 		= 'free_search';
		$options->code 				= API_WEB_USER_CODE;
		$options->q 				= (string)($json_data->q);
		$options->search_mode 		= 'full_text_search';
		$options->lang 				= $lang;
		$options->filter 			= 'section_id = ' . $section_id;
		$options->list_fragment 	= false;
		$options->video_fragment 	= true;
		$options->fragment_terms 	= true;
		$options->image_type 		= 'posterframe';

	# Http request in php to the API
	$response = json_web_data::get_data($options);


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
}//end load_video_free_search



?>