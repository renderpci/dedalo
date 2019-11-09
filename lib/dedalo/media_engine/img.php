<?php
/*
if(SHOW_DEBUG) {
	unset($TIMER_IMG); $TIMER_IMG['image_start']=microtime(1);
}
*/
#define('DEDALO_LIB_BASE_PATH', dirname( dirname(__FILE__) ));
require_once( dirname(dirname(__FILE__)) .'/config/config.php');
require_once(DEDALO_LIB_BASE_PATH . '/media_engine/class.Thumb.php');

# Write session to unlock session file
session_write_close();


# set vars
$vars = array('m','quality','SID','w','h','fx','p','prop','aditional_path','initial_media_path','external_source');
	foreach($vars as $name) $$name = common::setVar($name);


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