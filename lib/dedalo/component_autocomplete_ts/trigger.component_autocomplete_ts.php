<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','ar_tipo_to_search','string_to_search');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* AUTOCOMPLETE TS
* Get list of mathed DB results for current string by ajax call
* @param $ar_tipo_to_search
* @param $string_to_search
*/
if($mode=='autocomplete_ts') {

	if (empty($ar_tipo_to_search)) {
		return "Error: ar_tipo_to_search is not defined!";
	}
	if (strlen($string_to_search)<3) {
		return null;
	}

	$result = component_autocomplete_ts::autocomplete_ts_search($ar_tipo_to_search, $string_to_search);

	print json_handler::encode($result);
	die();
}


/**
* FIRE_TREE_RESOLUTION
* Launch method to precalculate tesauro tree
* @param $ar_tipo_to_search
*/
if($mode=='fire_tree_resolution_DES') {

	if (empty($ar_tipo_to_search)) {
		return "Error: ar_tipo_to_search is not defined!";
	}

	$result = component_autocomplete_ts::get_tree_resolution($ar_tipo_to_search);

	if (is_array($result)) {
		print count($result) ." records from: $ar_tipo_to_search";	
	}else{
		print "Ops.. Error on get_tree_resolution for $ar_tipo_to_search";
	}	
	die();
}



?>