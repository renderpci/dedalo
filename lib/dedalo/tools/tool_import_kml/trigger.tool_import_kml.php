<?php
set_time_limit ( 3600 * 2 );  // 2 Hours (1h = 3600 sec)

require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( dirname(__FILE__) .'/class.tool_import_kml.php');  # Read constants from here (pass url 'button_tipo' if needed)

# Write session to unlock session file
# session_write_close();

// JSON DOCUMENT
header('Content-Type: application/json');


if(login::is_logged()!==true) exit("<span class='error'> Auth error: please login </span>");

# set vars
$vars = array('mode');
	foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit( "<span class='error'> Trigger: Error Need mode.. </span>" );



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
	$vars = array('target_file_path','target_file_name','section_tipo','button_import_tipo');
		foreach($vars as $name) $$name = common::setVar($name);

	# File check
	$file = $target_file_path .'/'. $target_file_name;
	if (!file_exists($file)) {
		$response->msg = 'Error. File not found: '.$target_file_name;
		if(SHOW_DEBUG===true) {
			$response->msg .= " - path: $file ";
		}
		return $response;
	}	

	# Needed for class tool_import_kml
	$_GET['button_tipo'] = $button_import_tipo;

	# Create tool
	$dummy_section_obj 	= section::get_instance(null, $section_tipo);
	$tool_import_kml 	= new tool_import_kml( $dummy_section_obj, 'edit' );


	# Process file returns object response
	$response = $tool_import_kml->process_file($file);

	if(SHOW_DEBUG===true) {
		$response->debug_request = to_string($_REQUEST);
	}


	return (object)$response;
}//end process_file



?>