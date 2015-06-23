<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','section_tipo');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}
	
# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


# FIX SECTION TIPO
	define('SECTION_TIPO', $section_tipo);


# NEW	
if ($mode=='Stats') {

	# DATA VERIFY
	if(empty($section_tipo) || strlen($section_tipo)<3) exit("Trigger Error: section_tipo is mandatory");
	
	$diffusion_section_stats = new diffusion_section_stats($section_tipo);
		
	$html 				= $diffusion_section_stats->get_html();
	#dump($html,'$html');

	exit($html);
}



?>