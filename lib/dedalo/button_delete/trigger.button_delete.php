<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','section_id','section_tipo');
		foreach($vars as $name) $$name = common::setVar($name);
	
	
# mode
if(empty($mode)) exit("<span class='error'>Error Trigger: Need mode..</span>");


# FIX SECTION TIPO
	define('SECTION_TIPO', $section_tipo);


# DELETE
	if(!$section_id) 	exit("<span class='error'>Error Delete Trigger: Need section section_id..</span>");
	if(!$section_tipo) 	exit("<span class='error'>Error Delete Trigger: Need section section_tipo..</span>");

	$delete_mode = $mode;

	# Delete method
	#$delete = button_delete::Delete($id, $delete_mode=$mode);
	$section 	= section::get_instance($section_id, $section_tipo);
	$delete 	= $section->Delete($delete_mode);

	print $delete;
	die();
?>