<?php
require_once( dirname(dirname(__FILE__)).'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

	#dump($_REQUEST);

# set vars
	$vars = array('mode','selected_option','current_user_id');
	foreach($vars as $name) $$name = common::setVar($name);

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* APPLY_PROFILE 
*/
if($mode=='apply_profile') {

	if (empty($selected_option)) {
		exit("Error: selected profile is empty");
	}
	if (empty($current_user_id)) {
		exit("Error: user id is empty");
	}

	$result = component_profile::apply_profile((int)$selected_option, (int)$current_user_id);

	echo $result;
	exit();

}#end apply_profile
