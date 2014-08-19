<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','context_tipo','fecha');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}
	
# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


# NEW	
if ($mode=='Stats') {

	# DATA VERIFY
	if(empty($context_tipo) || strlen($context_tipo)<3) exit("Trigger Error: context_tipo is mandatory");
	
	$diffusion_section = new diffusion_section_stats($context_tipo, $fecha);
		
	$html 				= $diffusion_section->get_html();
	#dump($html,'$html');

	exit($html);
}



?>