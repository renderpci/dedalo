<?php
$start_time=microtime(1);
include( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* ADD RESOURCE
* Add new locator to portal dato
* @return object $response
*/
function add_resource($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	
	$vars = array('portal_tipo','portal_parent','portal_section_tipo','rel_locator','prev_locator');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='prev_locator') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

		if ($prev_locator==='"null"') {
			$prev_locator = null;
		}
		
	
	$component_portal 	= component_common::get_instance('component_portal',
														 $portal_tipo,
														 $portal_parent,
														 'edit',
														 DEDALO_DATA_NOLAN,
														 $portal_section_tipo);

	#
	# REMOVE PREVIOUS LOCATOR WHEN IS REQUIRED
	# debug_log(__METHOD__." Received prev_locator type: ".gettype($prev_locator), logger::DEBUG);
	# debug_log(__METHOD__." Received prev_locator strlen: ". strlen($prev_locator), logger::DEBUG);
	if (!empty($prev_locator)) {
		
		if ($prev_locator = json_decode($prev_locator)) {
			$remove_locator_result = $component_portal->remove_locator( $prev_locator );
			debug_log(__METHOD__." Removed prev_locator: ". to_string($prev_locator), logger::DEBUG);
		}else{
			debug_log(__METHOD__." Error on json_decode 1 var prev_locator: ".to_string($prev_locator), logger::ERROR);
		}		
		#debug_log(__METHOD__." Removed prev locator ".to_string($prev_locator), logger::DEBUG);

	}//end if (!empty($prev_locator))


	#
	# ADD NEW LOCATOR
	# debug_log(__METHOD__." Received rel_locator type: ".gettype($rel_locator), logger::DEBUG);
	# debug_log(__METHOD__." Received rel_locator: ".to_string($rel_locator), logger::DEBUG);
	$locator_added = false;
	if ($rel_locator = json_decode($rel_locator)) {
		$locator_added = $component_portal->add_locator( $rel_locator );
	}else{
		debug_log(__METHOD__." Error on json_decode 2 var rel_locator: ".to_string($rel_locator), logger::ERROR);
	}
	
	if ($locator_added!==true) {
		$response->msg = "Error : on add locator. Expected response 'true'. Received response: ".to_string($locator_added);
		return $response;
	}

	# Save
	$component_portal->Save();


	# State update
	$state = $component_portal->update_state($rel_locator);

	$response->result = true;
	$response->msg 	  = "Added resource successfully";

	
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time			= exec_time_unit($start_time,'ms')." ms";
			$debug->locator_added 		= $locator_added;
			$debug->state 		  		= $state;
			$debug->portal_tipo 		= $portal_tipo;
			$debug->portal_parent 		= $portal_parent;
			$debug->portal_section_tipo = $portal_section_tipo;
			$debug->rel_locator  		= $rel_locator;
			$debug->prev_locator 		= $prev_locator;
			$debug->request 			= $_REQUEST;
	
		$response->debug = $debug;
	}


	return (object)$response;
}//end add_resource



/**
* SHOW_MORE_TOGGLE
* @return object $response
*/
function show_more_toggle($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('action', 'search_options_session_key');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}


	# Action
	switch ($action) {
		case 'show_full':
			if (isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]->filter_by_section_creator_portal_tipo)) {
				unset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]->filter_by_section_creator_portal_tipo);
				debug_log(__METHOD__."[show_more_toggle] Trigger: Removed 'filter_by_section_creator_portal_tipo' from session var SESSION[config4][search_options][$search_options_session_key] ".to_string(), logger::DEBUG);
				$response->result = true;
				$response->msg    = 'show_full activated successfully';
				if(SHOW_DEBUG===true) {
					$response->debug  = array(
						"search_options_session_key" => $search_options_session_key,
						"action" => "unset SESSION[dedalo4][config][search_options][$search_options_session_key]->filter_by_section_creator_portal_tipo ",
						"session search_options_session_key" => $_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]
						);
				}
				#dump($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]->filter_by_section_creator_portal_tipo, ' var show_full 2++ '.to_string());		
			}else{		
				debug_log(__METHOD__."[show_more_toggle] Trigger: Error on portal_tool show_full. Session key received not exists: $search_options_session_key ".to_string(), logger::DEBUG);
			}
		
			break;
		
		case 'show_filtered':
			if (isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key])) {
				unset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]);		
				debug_log(__METHOD__." Trigger Removed full var SESSION[config4][search_options][$search_options_session_key]. Reloading page to recreate var ".to_string(), logger::DEBUG);
			}else{
				debug_log(__METHOD__."[show_more_toggle] Trigger Error: on portal_tool show_filtered [$search_options_session_key] ".to_string(), logger::DEBUG);
			}
			break;
		default:
			$response->result = false;
			$response->msg 	  = 'Error. Invalid action: '.to_string($action);
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
}//end show_more_toggle



/**
* SHOW_FULL
* js show_more_toggle
* Show full list of section records unfiltered by section_creator_portal_tipo
*//* DEACTVATED 22-02-2017 [P]
function show_full99() {

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed on show_full';

	$vars = array('search_options_session_key');
		foreach($vars as $name) $$name = common::setVar($name);
	
	if (empty($search_options_session_key)) {		
		$response->msg = "Trigger Error: search_options_session_key is empty !";
		return response;
	}

	if (isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]->filter_by_section_creator_portal_tipo)) {
		unset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]->filter_by_section_creator_portal_tipo);
		debug_log(__METHOD__." Trigger: Removed 'filter_by_section_creator_portal_tipo' from session var SESSION[config4][search_options][$search_options_session_key] ".to_string(), logger::DEBUG);
		$response->result = true;
		$response->msg    = 'show_full activated successfully';
		if(SHOW_DEBUG===true) {
			$response->debug  = array(
				"action" => "unset $_SESSION[dedalo4][config][search_options][$search_options_session_key]->filter_by_section_creator_portal_tipo ",
				"session search_options_session_key" => $_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]
				);
		}		
	}else{		
		debug_log(__METHOD__." Trigger: Error on portal_tool show_full. Session key received not exists: $search_options_session_key ".to_string(), logger::DEBUG);
	}

	return $response;
}//end show_full
*/


/**
* SHOW_FILTERED
* js show_more_toggle
* Show filtered list of section records by section_creator_portal_tipo
*//* DEACTVATED 22-02-2017 [P]
if ($mode=='show_filtered99') {

	$vars = array('search_options_session_key');
		foreach($vars as $name) $$name = common::setVar($name);
	
	if (empty($search_options_session_key)) {		
		exit("Trigger Error: search_options_session_key is empty !");
	}

	if (isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key])) {
		unset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]);		
		debug_log(__METHOD__." Trigger Removed full var SESSION[config4][search_options][$search_options_session_key]. Reloading page to recreate var ".to_string(), logger::DEBUG);
	}else{
		debug_log(__METHOD__." Trigger Error: on portal_tool show_filtered [$search_options_session_key] ".to_string(), logger::DEBUG);
	}
	exit();

}//end show_filtered
*/



?>