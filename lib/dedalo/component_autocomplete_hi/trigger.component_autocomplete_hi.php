<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode');
		foreach($vars as $name) $$name = common::setVar($name);

# Set JSON headers for all responses
header('Content-Type: application/json');

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");

# CALL FUNCTION
if ( function_exists($mode) ) {
	$result = call_user_func($mode);
	echo json_encode($result);
}


/**
* AUTOCOMPLETE
* Get list of mathed DB results for current string by ajax call
* @param $ar_tipo_to_search
* @param $string_to_search
*/
function autocomplete() {

	session_write_close();

	$vars = array('hierarchy_types','hierarchy_sections','string_to_search');
		foreach($vars as $name) {
			$$name = common::setVar($name);
			if (empty($$name)) {
				return "Error. ".$$name." is mandatory";
			}
		}

	$hierarchy_types 	= json_decode($hierarchy_types);
	$hierarchy_sections = json_decode($hierarchy_sections);

	$result = component_autocomplete_hi::autocomplete_hi_search($hierarchy_types,
																$hierarchy_sections,
																$string_to_search,
																30,
																true,
																true); //$ar_referenced_tipo, $string_to_search, $max_results=30, $show_modelo_name=true, $source_mode

	return $result;
}//end 



?>