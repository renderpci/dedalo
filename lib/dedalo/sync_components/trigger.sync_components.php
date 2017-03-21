<?php
// JSON DOCUMENT
header('Content-Type: application/json');

include( dirname(dirname(__FILE__)) .'/config/config4.php');
include(DEDALO_LIB_BASE_PATH.'/sync_components/class.sync_components.php');

if(login::is_logged()!==true) return false;

# Write session to unlock session file
session_write_close();

# Ignore user abort load page
ignore_user_abort(true);

# set vars
	$vars = array('mode',);
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit(json_encode("<span class='error'> Trigger: Error Need mode..</span>"));



# CALL FUNCTION
if ( function_exists($mode) ) {
	$result = call_user_func($mode);
	echo json_encode($result);
}


