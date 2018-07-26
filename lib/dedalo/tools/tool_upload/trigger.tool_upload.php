<?php
# SESSION LIFETIME
# Set session_duration_hours before load 'config' file (override default value)
$session_duration_hours = 24;

require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

if(login::is_logged()!==true) {
	$string_error = "Auth error: please login";
	print dd_error::wrap_error($string_error);
	die();
}

#ini_set('max_input_time', 0); // Unlimited time 
#ini_set('max_execution_time', 60 * 5); // Unlimited time 
set_time_limit(0);


require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.AVObj.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.PosterFrameObj.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.Ffmpeg.php');


# set vars
$vars = array('mode','SID','quality','tipo','parent','section_tipo');
	foreach($vars as $name) $$name = common::setVar($name);


# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


# UPLOAD FILE GENÉRICO
if( $mode==='upload_file' ) {
	
	#trigger_error("Necesita parent!!! desde la llamada js");

	if(!$SID) 			exit('Error SID not defined (2)');
	if(!$quality) 		exit('Error: quality not defined');
	if(!$tipo) 			exit('Error: tipo not defined');
	if(!$parent) 		exit('Error: parent not defined');
	if(!$section_tipo) 	exit('Error: section_tipo not defined');

	# Write session to unlock session file
	session_write_close();

	debug_log(__METHOD__." Uploading file ($SID) - Session is writeed and closed ".to_string(), logger::DEBUG);

	$component_name = RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
	$component_obj 	= component_common::get_instance($component_name, $tipo, $parent, 'edit', DEDALO_DATA_LANG, $section_tipo);
	$tool_upload 	= new tool_upload($component_obj);
	

	$response = $tool_upload->upload_file( $quality );
		#dump($response, ' response ++ '.to_string());

	# Save component for update component 'valor_list'
	$component_obj->Save();
		

	echo json_encode($response);
	exit();
}//end upload_file







die("Sorry. Mode ($mode) not supported")
?>