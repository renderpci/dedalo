<?php
require_once( dirname(dirname(__FILE__)).'/config/config4.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_matrix.php');
require_once(DEDALO_LIB_BASE_PATH . '/common/class.TR.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

	#dump($_REQUEST);

# set vars
	$vars = array('mode','id','tipo','modo','caller_id');	
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);		
	}

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



?>