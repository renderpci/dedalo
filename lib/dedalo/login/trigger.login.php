<?php
$TOP_TIPO=false;
$start_time=microtime(1);
include( dirname(dirname(__FILE__)).'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager( json_decode('{"test_login":false}') );



# LOGIN	 #################################################################################################################	
function Login($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$trigger_post_vars = array();
	foreach ($json_data as $key => $value) {
		$trigger_post_vars[$key] = trim($value); // trim to avoid write space errors
	}
	
	# If all is ok, return string 'ok'
	$response = (object)login::Login( $trigger_post_vars );

	# Close script session
	session_write_close();

	# Exit printing result
	# exit($result);
	
	#$response->result 	= $result;
	#$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";			

		$response->debug = $debug;
	}
	
	return (object)$response;
}//end Login



# QUIT ###################################################################################################################		
function Quit($json_data) {	
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$trigger_post_vars = array();
	foreach ($json_data as $key => $value) {
		$trigger_post_vars[$key] = $value;
	}

	# If all is ok, return string 'ok'
	$result = login::Quit( $trigger_post_vars );

	# Close script session
	session_write_close();
	
	# Exit printing result
	# exit($result);

	$response->result 	= $result;
	$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";			

		$response->debug = $debug;
	}
	
	return (object)$response;
}//end Quit()



?>