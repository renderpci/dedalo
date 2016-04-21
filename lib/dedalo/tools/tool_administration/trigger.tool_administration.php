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
	
	echo json_encode($response);
	exit();

}//end update_structure


?>
