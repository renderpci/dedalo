<?php
/*
	
	TRIGGER VISITAS (CUSTOM)
	To use, overwite trigger.tool_calendar.php URL in javascript file.
	Trigger execution is secuential. Modes capured here stop execution and avoid use of next standard script mode


*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH .'/tools/calendar/class.tool_calendar.php');  


# login test
	if(login::is_logged()!==true) {
		$string_error = "Auth error: please login";
		print dd_error::wrap_error($string_error);
		die();
	}

# set vars
	$vars = array('mode','options','start','end');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode.. </span>");

	







# Load real tool trigger after 
	require_once( DEDALO_LIB_BASE_PATH .'/tools/calendar/trigger.tool_calendar.php');
?>