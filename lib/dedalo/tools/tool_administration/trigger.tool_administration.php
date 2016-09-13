<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

# lessc load by composer
#require_once DEDALO_ROOT . '/autoload.php';
#use \leafo\lessc;



if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


# CALL FUNCTION
if ( function_exists($mode) ) {
	call_user_func($mode);
}



/**
* MAKE_BACKUP
* Force unlock all components
*/
function make_backup() {

	$result = tool_administration::make_backup();

	echo (string)json_encode($result);
}//end make_backup



/**
* FORCE_UNLOCK_ALL_COMPONENTS
* Force unlock all components
*/
function force_unlock_all_components() {

	include DEDALO_LIB_BASE_PATH . '/lock_components/class.lock_components.php';

	$result = lock_components::force_unlock_all_components();

	echo (string)json_encode($result);
}//end force_unlock_all_components



/**
* GET_ACTIVE_USERS
* Force unlock all components
*/
function get_active_users() {

	include DEDALO_LIB_BASE_PATH . '/lock_components/class.lock_components.php';

	$result = lock_components::get_active_users();

	echo (string)json_encode($result);
}//end get_active_users



/**
* BUILD_STRUCTURE_CSS
* Force unlock all components
*/
function build_structure_css() {

	$result = css::build_structure_css();

	echo (string)json_encode($result);
}//end build_structure_css



/**
* UPDATE_STRUCTURE
* Loads structure databases and overwrite existing data
*/
function update_structure() {

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= '';	

	# Before import, EXPORT ;-)
	$db_name = 'dedalo4_development_str_'.date("Y-m-d_Hi").'.custom';
	$exp 	 = backup::export_structure($db_name, $exclude_tables=false);	// Full backup
	$response->msg .= $exp->msg ;//. '<br>';
	
	if ($exp->code!=0) {
		$response->msg .= "<pre>Sorry. A problem occurred. Nex step import_structure is stopped ($exp->code)</pre>";	
	}else{
		$res = backup::import_structure();
		$response->result = true;
		$response->msg .= trim($res);
		#$response->info = $res;
	}
	#dump($response->msg, '$response->msg ++ '.to_string());

	# Delete session config (force to recalculate)
	unset($_SESSION['dedalo4']['config']);

	# Delete session permissions table (force to recalculate)
	unset($_SESSION['dedalo4']['auth']['permissions_table']);

	session_write_close();
	
	echo (string)json_encode($response);
}//end update_structure



/**
* BUILD_STRUCTURE_CSS
* Force unlock all components
*/
function delete_component_tipo_in_matrix_table() {

	# set vars
	$vars = array('component_tipo','section_tipo','language','save');
		foreach($vars as $name) $$name = common::setVar($name);	

	$component_tipo = json_decode($component_tipo);
	$section_tipo 	= json_decode($section_tipo);
	$language 		= json_decode($language);
	$save 			= json_decode($save);

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= '';

	if(empty($component_tipo)){
		$response->msg .= "<span class='error'> Error: '".label::get_label('component_tipo')."' is mandatory</span>";
		exit(json_encode($response));
	}else if(empty($section_tipo)){
		$response->msg .= "<span class='error'> Error: '".label::get_label('section_tipo')."' is mandatory</span>";
		exit(json_encode($response));
	}
	if(!empty($language) && (empty($component_tipo) || empty($section_tipo)) ){
		$response->msg .= "<span class='error'> Error: Need component_tipo and section_tipo for delete Language</span>";
		exit(json_encode($response));
	}

	$result = tool_administration::delete_component_tipo_in_matrix_table($section_tipo,$component_tipo,$language,$save);

	echo (string)json_encode($result);
}//end build_structure_css



/**
* UPDATE_VERSION
* Update the version, components, SQL, etc, the script look the updates.php file and apply to the current installation data
*/
function update_version() {

	// Set time limit unlimited
	set_time_limit (0);

	$response = new stdClass();
		$response->result = false;
		$response->msg 	  = '';

	$result = tool_administration::update_version();

	session_write_close();

	echo (string)json_encode($result);
}//end update_version



/**
* SKIP_PUBLICATION_STATE_CHECK
* Update the version, components, SQL, etc, the script look the updates.php file and apply to the current installation data
*/
function skip_publication_state_check() {

	$vars = array('value');
		foreach($vars as $name) $$name = common::setVar($name);

		$value = json_decode($value);

	$result = tool_administration::skip_publication_state_check($value);
	
	echo (string)json_encode($result);
}//end skip_publication_state_check



/**
* REMOVE_AV_TEMPORALS
* Remove av ffmpeg sh temprals
*/
function remove_av_temporals() {

	$result = tool_administration::remove_av_temporals();

	$response = new stdClass();
		$response->result = !empty($result) ? true : false;
		$response->msg 	  = !empty($result) ? "Removed files: <br>".implode('<br>', (array)$result) : "No files found";
	
	echo (string)json_encode($response);
}//end remove_av_temporals



?>