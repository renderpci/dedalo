<?php
/**
* TRIGGER
*/
# CONFIG
	$start_time=microtime(1);
	include(dirname(dirname(__FILE__)) . '/config/config.php');	

# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
	common::trigger_manager();



/**
* LOAD_CHILDRENS
* @return object $response
*/
function load_childrens($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';



	# set vars
	$vars = array('ar_term_id','lang');
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
		$options->dedalo_get 		= 'thesaurus_term';
		$options->code 				= API_WEB_USER_CODE;		
		$options->lang 				= $lang;
		$options->ar_term_id 		= $ar_term_id;
			#dump($ar_term_id, ' ar_term_id ++ '.to_string());

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
}//end load_childrens




/**
* LOAD_INDEXATIONS
* @return object $response
*/
function load_indexations($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('term_id','ar_locators','lang');
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
		$options->dedalo_get 		= 'thesaurus_indexation_node';
		$options->code 				= API_WEB_USER_CODE;		
		$options->lang 				= $lang;
		$options->term_id 			= $term_id;
		$options->ar_locators 		= $ar_locators;

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
}//end load_indexations	



/**
* LOAD_VIDEO_DATA
* @return object $response
*/
function load_video_data($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('term_id','ar_locators','ar_locators_key','lang');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='ar_locators_key') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	# Search	
	$options = new stdClass();
		$options->dedalo_get 		= 'thesaurus_video_view_data';
		$options->code 				= API_WEB_USER_CODE;
		$options->lang 				= $lang;
		$options->term_id 			= $term_id;
		$options->ar_locators 		= $ar_locators;
		$options->ar_locators_key 	= (int)$ar_locators_key;

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
}//end load_video_data

?>