<?php
/*
if(SHOW_DEBUG) {
	unset($TIMER_IMG); $TIMER_IMG['image_start']=microtime(1);
}
*/
#define('DEDALO_LIB_BASE_PATH', dirname( dirname(__FILE__) ));
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');
require_once(DEDALO_LIB_BASE_PATH . '/media_engine/class.Thumb.php');


/*
if(login::is_logged()!==true) {
	$string_error = "Auth error: please login";
	print dd_error::wrap_error($string_error);
	die();
}
*/

/*
# SETVAR
function setVar($name, $default=false) {
	$$name = $default; 
	if(isset($_GET[$name])) $$name = $_GET[$name];
	if(isset($$name))
	return $$name ;
}
*/

# set vars
$vars = array('m','quality','SID','w','h','fx','p','prop','aditional_path','initial_media_path');
	foreach($vars as $name) $$name = common::setVar($name);

#dump($_REQUEST, ' _REQUEST');die();

# LOAD VISTA TEMPLATE CODE
$page_html = dirname(__FILE__).'/html/img.phtml';
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