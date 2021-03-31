<?php // includes common

# SESSION LIFETIME
# Set session_duration_hours before load 'config' file (override default value)
$session_duration_hours = 24;

require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

set_time_limit(28800); // 8 hours
// ini_set('max_execution_time', 28800); // max_execution_time is already set on set_time_limit

if(login::is_logged()!==true) {
	$string_error = "Auth error: please login";
	print dd_error::wrap_error($string_error);
	die();
}