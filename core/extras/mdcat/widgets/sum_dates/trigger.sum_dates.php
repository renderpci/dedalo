<?php
// JSON DOCUMENT
header('Content-Type: application/json');

require_once( DEDALO_CONFIG_PATH .'/config.php');

# Write session to unlock session file
session_write_close();


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



# CALL FUNCTION
if ( function_exists($mode) ) {
	$result = call_user_func($mode);
	$json_params = null;
	if(SHOW_DEBUG===true) {
		$json_params = JSON_PRETTY_PRINT;
	}
	echo json_encode($result, $json_params);
}



/**
* RESET
* 
*/
function reset() {

	$vars = array('section_tipo');
		foreach($vars as $name) $$name = common::setVar($name);

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= '';

	$search_options_session_key = 'section_'.$section_tipo;
	if (isset($_SESSION['dedalo4']['config']['sum_total'][$search_options_session_key])) {
		unset($_SESSION['dedalo4']['config']['sum_total'][$search_options_session_key]);

		$response->result 	= true;
		$response->msg 		= 'Removed session sum_total: '.$search_options_session_key;
	}

	return (object)$response;
}//end reset



?>