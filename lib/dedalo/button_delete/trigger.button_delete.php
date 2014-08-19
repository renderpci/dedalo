<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','id','tipo');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}
	
# mode
if(empty($mode)) exit("<span class='error'>Error Trigger: Need mode..</span>");


# DELETE
	if(!$id) 	exit("<span class='error'>Error Delete Trigger: Need id..</span>");
	if(!$tipo) 	exit("<span class='error'>Error Delete Trigger: Need tipo..</span>");

	$delete_mode = $mode;

	# Delete method
	#$delete = button_delete::Delete($id, $delete_mode=$mode);
	$section 	= new section($id, $tipo);
	$delete 	= $section->Delete($delete_mode);

	print $delete;
	die();

	
	