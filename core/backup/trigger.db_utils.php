<?php
$start_time=microtime(1);
set_time_limit(300);
include( DEDALO_CONFIG_PATH .'/config.php');
include(DEDALO_CORE_PATH.'/backup/class.backup.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* EXPORT_STR
* Export db (export_structure)
*/
function export_str($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= "";//'Error. Request failed ['.__FUNCTION__.']';

	# Dump all historic data first
	$db_name 				= 'dedalo4_development_str_'.date("Y-m-d_Hi").'.custom';
	$res_export_structure 	= backup::export_structure($db_name, $exclude_tables=false);	// Full backup
	if ($res_export_structure->result===false) {
		$response->result 	= false;
		$response->msg 		= $res_export_structure->msg;
		return $response;
	}else{
		# Append msg
		$response->msg .= $res_export_structure->msg;
	}


	
	# Dump official structure version 'dedalo4_development_str.custom' (partial backup)
	$res_export_structure2 = (object)backup::export_structure(null, $exclude_tables=true);	 // Partial backup
	if ($res_export_structure2->result===false) {
		$response->result 	= false;
		$response->msg 		= $res_export_structure2->msg;
		return $response;
	}else{
		# Append msg
		$response->msg .= $res_export_structure2->msg;
	}


	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";			

		$response->debug = $debug;
	}
	
	return (object)$response;
}//end export_str



/**
* IMPORT_STR
* Import db (import_structure)
*//* NO USAR . USAR LA DE TOOL ADMINISTRATION 
function import_str($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$html ='';

	# Before import, EXPORT ;-)
	$db_name = 'dedalo4_development_str_'.date("Y-m-d_Hi").'.custom';
	$exp 	 = backup::export_structure($db_name, $exclude_tables=false);	// Full backup
	$html .= $exp->msg;
	$html .= '<br>';
	if ($exp->code!=0) {
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.'] Sorry. Next step import_structure stopped ('.$exp->code.')';
		return $response;		
	}

	$res = backup::import_structure();

	# Delete session config (force to recalculate)
	unset($_SESSION['dedalo4']['config']);

	# Delete session permissions table (force to recalculate)
	unset($_SESSION['dedalo4']['auth']['permissions_table']);

	$html .= $res;	
	#echo wrap_html($html, false);

	$response->result 	= $html;
	$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			$debug->exp 		= $exp;

		$response->debug = $debug;
	}
	
	return (object)$response;
}//end import_str */



# BACKUP DB 
/* REMOVED
function backup() {

	$res = backup::init_backup_secuence($user_id_matrix='0', $username='system');
	echo $res;
}//end backup */



# LOAD_STR_DATA
/* REMOVED !
function load_str_data() {

	$res = (array)backup::load_dedalo_str_tables_data();

	$html = implode('<hr>', $res);
	echo wrap_pre($html);
}//end load_str_data */



?>