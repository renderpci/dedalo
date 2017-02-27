<?php
// JSON DOCUMENT
header('Content-Type: application/json');

$session_duration_hours = 72;
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
	$result = call_user_func($mode);
	echo (string)json_encode($result);
}



/**
* MAKE_BACKUP
* Force unlock all components
*/
function make_backup() {

	$result = tool_administration::make_backup();

	return $result;
}//end make_backup



/**
* FORCE_UNLOCK_ALL_COMPONENTS
* Force unlock all components
*/
function force_unlock_all_components() {

	include DEDALO_LIB_BASE_PATH . '/lock_components/class.lock_components.php';

	$result = lock_components::force_unlock_all_components();

	return $result;
}//end force_unlock_all_components



/**
* GET_ACTIVE_USERS
* Force unlock all components
*/
function get_active_users() {

	include DEDALO_LIB_BASE_PATH . '/lock_components/class.lock_components.php';

	$result = lock_components::get_active_users();

	return  $result;
}//end get_active_users



/**
* BUILD_STRUCTURE_CSS
* Force unlock all components
*/
function build_structure_css() {

	$result = css::build_structure_css();

	return $result;
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
	
	return $response;
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
		return $response;
	}else if(empty($section_tipo)){
		$response->msg .= "<span class='error'> Error: '".label::get_label('section_tipo')."' is mandatory</span>";
		return $response;
	}
	if(!empty($language) && (empty($component_tipo) || empty($section_tipo)) ){
		$response->msg .= "<span class='error'> Error: Need component_tipo and section_tipo for delete Language</span>";
		return $response;
	}

	$response = (object)tool_administration::delete_component_tipo_in_matrix_table($section_tipo,$component_tipo,$language,$save);

	return $response;
}//end build_structure_css



/**
* UPDATE_VERSION
* Update the version, components, SQL, etc, the script look the updates.php file and apply to the current installation data
*/
function update_version() {
	
	set_time_limit (0); // Set time limit unlimited

	ini_set('memory_limit', -1); // unlimited memory

	// Free browser session
	// session_write_close();

	$response = (object)tool_administration::update_version();	

	return $response;
}//end update_version



/**
* SKIP_PUBLICATION_STATE_CHECK
* Update the version, components, SQL, etc, the script look the updates.php file and apply to the current installation data
*/
function skip_publication_state_check() {

	$vars = array('value');
		foreach($vars as $name) $$name = common::setVar($name);

	$value = json_decode($value);

	tool_administration::skip_publication_state_check($value);

	$response = new stdClass();
		$response->result 	= true;
		$response->msg 		= 'Set skip_publication_state_check successfully: '.to_string($value);
	
	return $response;
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
	
	return $response;
}//end remove_av_temporals



/**
* MOVE_COMPONENT_DATA
*/
function move_component_data() {

	# set vars
	$vars = array('source_section_tipo','source_section_id','source_delete','source_portal_tipo','target_section_tipo','target_section_id','map_components');
		foreach($vars as $name) $$name = common::setVar($name);

	if (!empty($source_section_id)) {
		if ($ar_source = json_decode($source_section_id)) {
			$source_section_id = (array)$ar_source;
		}else{
			$source_section_id = (array)$source_section_id;
		}
	}	

	$options = new stdClass();
		# Source options
		$options->source_section_tipo 	= $source_section_tipo;
		$options->source_section_id 	= $source_section_id; // array or null for all records
		$options->source_delete 		= json_decode($source_delete); // bool
		$options->source_portal_tipo 	= $source_portal_tipo;	// portal tipo where hook the target section
		# Target options
		$options->target_section_tipo 	= $target_section_tipo;
		$options->target_section_id 	= $target_section_id; // array or null for all records			
		# Others
		$options->map_components 		= json_decode($map_components); // key is source component tipo. value is target component tipo

		#debug_log(__METHOD__." [trigger_tool_administration] Options ".to_string($options), logger::DEBUG);

	$response = (object)tool_administration::move_component_data($options);	
	
	return $response;
}//end move_component_data



/**
* REMOVE_INVERSE_LOCATORS_IN_SECTION
* @return json string
*/
function remove_inverse_locators_in_section() {

	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= '';
	
	# set vars
	$vars = array('section_tipo');
		foreach($vars as $name) $$name = common::setVar($name);

	if (empty($section_tipo)) {
		return null;
	}

	$result = (bool)tool_update_cache::remove_inverse_locators_in_section($section_tipo);
	$response->result = $result;

	if ($result===true) {
		$response->msg = "Removed all inverse locators in section '$section_tipo' successfully";
	}else{
		$response->msg = "Error on remove inverse locators: ".to_string($result);
	}

	return (object)$response;
}//end remove_inverse_locators_in_section



/**
* UPDATE_JER_FROM_4_0_TO_4_1
* @return 
*/
function update_jer_from_4_0_to_4_1() {

	set_time_limit ( 259200 );  // 3 dias

	# set vars
	$vars = array('tld','modelo');
		foreach($vars as $name) $$name = common::setVar($name);

	$tld 	= (string)strtolower($tld);
	$modelo = (string)$modelo;
	if ($modelo!=='si') {
		$modelo = 'no';
	}
	
	$response =	hierarchy::update_jer_from_4_0_to_4_1($tld, $modelo);


	return (object)$response;	
}//end update_jer_from_4_0_to_4_1



?>