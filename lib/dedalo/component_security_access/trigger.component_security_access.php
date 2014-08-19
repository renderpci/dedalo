<?php
die(" NOT USED: SEE TRIGGER.COMPONENT_COMMON");


/*
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','tipo','caller_id');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}
	
	
# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


# LOAD AJAX HTML
if ($mode = 'iframe') {	

	if(empty($tipo)) throw new Exception("Error Processing Request. tipo is not defined!", 1);
	
	$modo 	= $mode;
	$parent = $caller_id;

	$component_security_access = new component_security_access(NULL, $tipo, $modo, $parent);	#__construct($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=NULL)

	$html = $component_security_access->get_html();
	
	print $html;

}//iframe
*/


		
?>