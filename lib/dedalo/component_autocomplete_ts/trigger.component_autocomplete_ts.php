<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode');
		foreach($vars as $name) $$name = common::setVar($name);



# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* AUTOCOMPLETE TS
* Get list of mathed DB results for current string by ajax call
* @param $ar_tipo_to_search
* @param $string_to_search
*/
if($mode=='autocomplete_ts') {

	session_write_close();

	$vars = array('ar_tipo_to_search','string_to_search','source_mode');
		foreach($vars as $name) $$name = common::setVar($name);

	if (empty($ar_tipo_to_search)) {
		echo "Error: ar_tipo_to_search is not defined!";
		exit();
	}
	if (strlen($string_to_search)<3) {
		echo null;
		exit();
	}
	if (empty($source_mode)) {
		echo "Error: source_mode is not defined!";
		throw new Exception("Error Processing Request", 1);
		
		exit();
	}

	$result = component_autocomplete_ts::autocomplete_ts_search($ar_tipo_to_search, $string_to_search, 30, true, $source_mode); //$ar_referenced_tipo, $string_to_search, $max_results=30, $show_modelo_name=true, $source_mode

	print json_handler::encode($result);
	exit();
}



?>