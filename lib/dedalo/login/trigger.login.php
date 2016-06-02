<?php
$TOP_TIPO=false;
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');

#if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# TRIGGER POST VARS
	$trigger_post_vars 	= $_POST;
		#dump($trigger_post_vars,'trigger_post_vars');


# set vars
	$vars = array('mode');	#'username','password', 'tipo_login', 'tipo_username', 'tipo_password', 'tipo_active_account'
		foreach($vars as $name) $$name = common::setVar($name);	#echo "<br>$name: ".$$name ;	

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");

	
# QUIT ###################################################################################################################		
if($mode=='Quit') {
	
	# If all is ok, return string 'ok'
	$result = login::Quit( $trigger_post_vars );
	# Exit printing result
	exit($result);

} #if($mode=='Quit')



# LOGIN	 #################################################################################################################	
if($mode=='Login') {

	# If all is ok, return string 'ok'
	$result = login::Login( $trigger_post_vars );
	# Exit printing result
	exit($result);
	
} #if($mode=='login')



?>