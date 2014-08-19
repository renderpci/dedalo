<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','tipo_to_search','string_to_search');
	foreach($vars as $name) {
		$$name = common::setVar($name);
	}

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* AUTOCOMPLETE
* Get list of mathed DB results for current string by ajax call
* @param $tipo_to_search
* @param $string_to_search
*/
if($mode=='autocomplete') {
	
	if (empty($tipo_to_search)) {
		return "Error: tipo_to_search is not defined!";
	}
	if (strlen($string_to_search)<1) {
		return NULL;
	}

	/*
	dump($tipo_to_search,'ar-tipo_to_search pre decode');

	# JSON DECODE tipo_to_search
	$tipo_to_search = json_handler::decode($tipo_to_search);
		dump($tipo_to_search,'ar-tipo_to_search post decode');

	if (empty($tipo_to_search)) {
		return NULL;
	}
	*/

	$result = component_autocomplete::autocomplete_search($tipo_to_search, $string_to_search);

	print json_handler::encode($result);
	die();
}


?>