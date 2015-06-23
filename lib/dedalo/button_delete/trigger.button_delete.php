<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','id','tipo');
		foreach($vars as $name) $$name = common::setVar($name);
	
	
# mode
if(empty($mode)) exit("<span class='error'>Error Trigger: Need mode..</span>");


# FIX SECTION TIPO
	define('SECTION_TIPO', $tipo);


# DELETE
	if(!$id) 	exit("<span class='error'>Error Delete Trigger: Need section id..</span>");
	if(!$tipo) 	exit("<span class='error'>Error Delete Trigger: Need section tipo..</span>");

	$delete_mode = $mode;

	# Delete method
	#$delete = button_delete::Delete($id, $delete_mode=$mode);
	$section 	= section::get_instance($id, $tipo);
	$delete 	= $section->Delete($delete_mode);

	print $delete;
	die();

	
	