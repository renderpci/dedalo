<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','id','parent','dato','tipo');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}
	
	
# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");

?>