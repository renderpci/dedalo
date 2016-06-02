<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once(DEDALO_LIB_BASE_PATH . '/common/class.TR.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','portal_tipo','portal_parent','rel_locator','search_options_session_key','portal_section_tipo');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* ADD RESOURCE
* Save on matrix current resource
* @param $caller_id (id matrix from source component_resource)
* @param $rel_locator String like '1235.0.0'
*/
if($mode=='add_resource') {

	$vars = array('portal_tipo','portal_parent','portal_section_tipo','rel_locator','prev_locator');
		foreach($vars as $name) $$name = common::setVar($name);

	if(empty($portal_tipo)) {
		trigger_error("Error : few vars. portal_tipo is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Error: portal_tipo is empty ! ", 1);
		}		
		exit();
	}
	if(empty($portal_parent)) {
		trigger_error("Error : few vars. portal_parent is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Error: portal_parent is empty ! ", 1);
		}		
		exit();
	}
	if(empty($portal_section_tipo)) {
		trigger_error("Error : few vars. section_tipo is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Error: section_tipo is empty ! ", 1);
		}		
		exit();
	}
	if(empty($rel_locator)) {
		trigger_error("Error : few vars. rel_locator is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Error: rel_locator is empty ! ", 1);
		}		
		exit();
	}
	
	
	$component_portal 	= component_common::get_instance('component_portal',
														 $portal_tipo,
														 $portal_parent,
														 'edit',
														 DEDALO_DATA_NOLAN,
														 $portal_section_tipo);

	#
	# REMOVE PREVIOUS LOCATOR WEN IS REQUIRED
	if (!empty($prev_locator)) {
		
		$prev_locator = json_decode($prev_locator);

		$remove_locator_result = $component_portal->remove_locator( $prev_locator );
		#debug_log(__METHOD__." Removed prev locator ".to_string($prev_locator), logger::DEBUG);

	}//end if (!empty($prev_locator)) 


	#
	# ADD NEW LOCATOR
	$rel_locator 		= json_decode($rel_locator);
	$locator_added 		= $component_portal->add_locator( $rel_locator );
		#dump($locator_added,"locator_added");
		#dump($component_portal->get_dato(),"component_portal dato");
	


	if ($locator_added!==true) {
		trigger_error("Error : on add locator");
		if(SHOW_DEBUG) {
			throw new Exception("Error: on add locator. Expected response 'true'. Received response: $locator_added", 1);
		}		
		exit();
	}


	# Save
	$component_portal->Save();

	# State update
	$state = $component_portal->update_state($rel_locator);

	#dump($component_portal,"component_portal");

	echo 'ok';
	exit();

}//end add_resource



/**
* SHOW_FULL
* Show full list of section records unfiltered by section_creator_portal_tipo
*/
if ($mode=='show_full') {

	$vars = array('search_options_session_key');
		foreach($vars as $name) $$name = common::setVar($name);
	
	if (empty($search_options_session_key)) {		
		exit("Trigger Error: search_options_session_key is empty !");
	}

	if (isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]->filter_by_section_creator_portal_tipo)) {
		unset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]->filter_by_section_creator_portal_tipo);
		debug_log(__METHOD__." Trigger: Removed 'filter_by_section_creator_portal_tipo' from session var SESSION[config4][search_options][$search_options_session_key] ".to_string(), logger::DEBUG);
		
	}else{		
		debug_log(__METHOD__." Trigger: Error on portal_tool show_full. Session key received not exists: $search_options_session_key ".to_string(), logger::DEBUG);
	}
	exit();

}//end show_full



/**
* SHOW_FILTERED
* Show filtered list of section records by section_creator_portal_tipo
*/
if ($mode=='show_filtered') {

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




?>