<?php
require_once( dirname(dirname(__FILE__)).'/config/config4.php');

# set vars
	$vars = array('mode','dedalo_application_lang','dedalo_data_lang');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* CHANGE_LANG 
*/
if($mode=='change_lang') {

	# DATA VERIFY
	if(empty($dedalo_application_lang) || strlen($dedalo_application_lang)<3) exit("Trigger Error: dedalo_application_lang is mandatory");

	#trigger_error("- changed application lang to: $dedalo_application_lang");	
	//unset($_SESSION['dedalo4']['config']['menu_structure_html']);
	#unset($_SESSION['dedalo4']['config']['ar_label']);

	#unset($_SESSION['dedalo4']['config']);

	# Return ok . Nothing to do. All logic is in config4. Only load page works..
	print 'Lang changed to : '. $_SESSION['dedalo4']['config']['dedalo_application_lang'] ."\nReloading page..";

	# Write session to unlock session file
	session_write_close();
	
	exit();

}#end Save



# Login verify os disabled 
#if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


?>