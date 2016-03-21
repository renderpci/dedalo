<?php
require_once( dirname(dirname(__FILE__)).'/config/config4.php');

# set vars
	$vars = array('mode','tipo','parent','section_tipo','lang','top_tipo','top_id');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");

# Login verify os disabled 
if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");



/**
* LOAD_TR 
*/
if($mode=='load_tr') {

	# DATA VERIFY
	if(empty($tipo) || empty($section_tipo) || empty($parent)) exit("Trigger Error: Few vars");

	$modelo_name 		 = 'component_text_area';
	$modo 				 = 'load_tr';
	$component_text_area = component_common::get_instance($modelo_name,
														  $tipo,
														  $parent,
														  $modo,
														  $lang,
														  $section_tipo);

	echo $component_text_area->get_html();
	exit();

}#end Save






?>