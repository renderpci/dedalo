<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

# lessc load by composer
#require_once DEDALO_ROOT . '/autoload.php';
#use \leafo\lessc;



if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','component_tipo','section_tipo','language','save');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* FORCE_UNLOCK_ALL_COMPONENTS
* Force unlock all components
*/
if($mode=='force_unlock_all_components') {

	include_once DEDALO_LIB_BASE_PATH . '/lock_components/class.lock_components.php';

	$result = lock_components::force_unlock_all_components();

	echo json_encode($result);
	exit();

}//end force_unlock_all_components



/**
* GET_ACTIVE_USERS
* Force unlock all components
*/
if($mode=='get_active_users') {

	include_once DEDALO_LIB_BASE_PATH . '/lock_components/class.lock_components.php';

	$result = lock_components::get_active_users();

	echo json_encode($result);
	exit();

}//end get_active_users



/**
* BUILD_STRUCTURE_CSS
* Force unlock all components
*/
if($mode=='build_structure_css') {	

	$result = css::build_structure_css();

	echo json_encode($result);
	exit();

}//end build_structure_css



/**
* UPDATE_STRUCTURE
* Loads structure databases and overwrite existing data
*/
if($mode=='update_structure') {

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= '';	

	# Before import, EXPORT ;-)
	$db_name = 'dedalo4_development_str_'.date("Y-m-d_Hi").'.custom';
	$exp 	 = backup::export_structure($db_name, $exclude_tables=false);	// Full backup
	$response->msg .= $exp->msg ;//. '<br>';
	
	if ($exp->code!=0) {
		$response->msg .= "<pre>Sorry. Nex step import_structure stopped ($exp->code)</pre>";	
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
	
	
	echo json_encode($response);
	exit();

}//end update_structure


/**
* BUILD_STRUCTURE_CSS
* Force unlock all components
*/
if($mode=='delete_component_tipo_in_matrix_table') {

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= '';

	$component_tipo = json_decode($component_tipo);
	$section_tipo 	= json_decode($section_tipo);
	$language 		= json_decode($language);
	$save 			= json_decode($save);


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

	echo json_encode($result);
	exit();

}//end build_structure_css


/**
* UPDATE_VERSION
* Update the version, components, SQL, etc, the script look the updates.php file and apply to the current installation data
*/
if($mode=='update_version') {

	set_time_limit (0);

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= '';

	$result = tool_administration::update_version();

	
	echo json_encode($result);
	exit();

}//end update_version



?>
