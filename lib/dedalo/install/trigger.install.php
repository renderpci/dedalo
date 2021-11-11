<?php
$TOP_TIPO=false;
$start_time=microtime(1);
include( dirname(dirname(__FILE__)).'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager( json_decode('{"test_login":false}') );



/**
* INSTALL_DB_FROM_DEFAULT_FILE
* Note that login it is not necessary here
*/
function install_db_from_default_file($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	// check status for security
		$dedalo_install_status = defined('DEDALO_INSTALL_STATUS')
			? DEDALO_INSTALL_STATUS
			: null;
		if ($dedalo_install_status==='installed') {
			$response->msg = 'Error. Current system is already installed';
			return $response;
		}

	// check db is already imported fro security
		$db_tables		= backup::get_tables(); // returns array empty if not is imported
		$db_is_imported	= (bool)in_array('matrix_users', $db_tables);
		if ($db_is_imported===true) {
			$response->msg = 'Error. Current database is not empty';
			return $response;
		}

	// exec
		$response = (object)install::install_db_from_default_file();

	# Close script session
	// session_write_close();

	// debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			$response->debug = $debug;
		}

	return (object)$response;
}//end install_db_from_default_file



/**
* INSTALL_HIERARCHIES
*/
function install_hierarchies($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	// check login for security
		if (login::is_logged()!==true) {
			$response->msg = 'Error. You are not logged in';
			return $response;
		}

	// exec
		$response = (object)install::install_hierarchies( $json_data );

	# Close script session
	// session_write_close();

	// debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			$response->debug = $debug;
		}

	return (object)$response;
}//end install_hierarchies


