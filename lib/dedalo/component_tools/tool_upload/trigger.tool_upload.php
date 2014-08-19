<?php
# SESSION LIFETIME
# Set session_duration_hours before load 'config' file (override default value)
$session_duration_hours = 24;

require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.AVObj.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.PosterFrameObj.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.Ffmpeg.php');


if(login::is_logged()!==true) {
	$string_error = "Auth error: please login";
	print Error::wrap_error($string_error);
	die();
}

# set vars
$vars = array('mode','SID','quality','tipo','id');
	foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


# UPLOAD FILE GENÉRICO
if( $mode=='upload_file' ) {

	if(!$SID) 		exit('Error SID not defined');
	if(!$quality) 	exit('Error: quality not defined');
	if(!$tipo) 		exit('Error: tipo not defined');
	if(!$id) 		exit('Error: id not defined');

	$component_name = RecordObj_ts::get_modelo_name_by_tipo($tipo);
	$component_obj 	= new $component_name($id,$tipo);
	$tool_upload 	= new tool_upload($component_obj);
		#dump($tool_upload,'$tool_upload');

	$html 			= $tool_upload->upload_file($quality);

	print $html;
	exit();
}







die("Sorry. Mode ($mode) not supported")
?>