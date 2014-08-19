<?php
/*
if(SHOW_DEBUG) {
	unset($TIMER_IMG); $TIMER_IMG['image_start']=microtime(1);
}
*/
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');
require_once(DEDALO_LIB_BASE_PATH . '/media_engine/class.Thumb.php');


/*
if(login::is_logged()!==true) {
	$string_error = "Auth error: please login";
	print Error::wrap_error($string_error);
	die();
}
*/

# set vars
$vars = array('m','quality','SID','w','h','fx','p','prop','aditional_path');
if(is_array($vars)) foreach($vars as $name) {
	$$name = common::setVar($name);	
}


# LOAD VISTA TEMPLATE CODE
$page_html = 'html/img.phtml';
require_once($page_html);

/*
if(SHOW_DEBUG) {
	$TIMER_IMG['image_end']=microtime(1);
	$total=$TIMER_IMG['image_end']-$TIMER_IMG['image_start'];
	$total=round($total,3);
	error_log($total);
}
*/
?>