<?php
require_once( dirname(dirname(dirname(dirname(__FILE__)))).'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode');
		foreach($vars as $name) $$name = common::setVar($name);


/**
* DONWLOAD_FRAGMENT
*/
if ($mode=='donwload_fragment') {

	
	debug_log(__METHOD__." Downloading fragment  ".to_string( safe_xss($_POST) ), logger::DEBUG);
	
	exit();

}#end alphabetic_tesauro



?>