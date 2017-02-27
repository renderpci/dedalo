<?php
set_time_limit ( 3600 * 2 );  // 2 horas (1h = 3600 sec)

// JSON DOCUMENT
header('Content-Type: application/json');

require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( dirname(__FILE__) .'/class.tool_import_marc21.php');  # Read constants from here (pass url 'button_tipo' if needed)

# Write session to unlock session file
session_write_close();


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# set vars
$vars = array('mode');
	foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode.. </span>");


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
* PROCESS_FILE
* 
*/
function process_file() {

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed process_file';

	# set vars
	$vars = array('target_file_path','target_file_name','projects_value');
		foreach($vars as $name) $$name = common::setVar($name);

	$projects_value = json_decode($projects_value);
	$projects_dato  = array();
	foreach ((array)$projects_value as $key => $value) {
		$projects_dato[$value] = '2';
	}

	$section_tipo = tool_import_marc21::MARC21_IMPORT_SECTION_TIPO;
	$section_obj = section::get_instance(null, $section_tipo);
	$modo  		 = 'edit';
	$tool_import_marc21 = new tool_import_marc21( $section_obj, $modo );

	$file = $target_file_path .'/'. $target_file_name;
	if (!file_exists($file)) {
		$response->msg = 'Error. File not found: '.$target_file_name;
		if(SHOW_DEBUG===true) {
			$response->msg .= " - path: $file ";
		}
		return $response;
	}

	# process_file returns object response
	$response = (object)$tool_import_marc21->process_file($file, $projects_dato);

		
	return (object)$response;
}//end process_file



?>