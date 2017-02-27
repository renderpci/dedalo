<?php
include( dirname(dirname(__FILE__)).'/config/config4.php');
#include(DEDALO_LIB_BASE_PATH.'/ts_object/class.ts_object.php');

#ignore_user_abort(true);

# unlock session allows continue brosing
#session_write_close();


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# Set JSON headers for all responses
header('Content-Type: application/json');



# set vars
$vars = array('mode');
	foreach($vars as $name) $$name = common::setVar($name);

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");

# CALL FUNCTION
if ( function_exists($mode) ) {
	$result = call_user_func($mode);
	echo json_encode($result);
}



/**
* SEARCH_THESAURUS
* @return array $result
*/
function search_thesaurus() {
	# set vars
	$vars = array('options');
		foreach($vars as $name) $$name = common::setVar($name);

	$options = json_decode($options);
	#dump( count($options->filter_by_search), ' $options->filter_by_search ++ '.to_string()); die();

	$search_options = new stdClass();
	foreach ($options->filter_by_search as $key => $value) {
		switch ($key) {
			case 'hierarchy20_hierarchy22': // section id
				$search_options->section_id = $value;
				break;
			case 'hierarchy20_hierarchy25': // term
				$search_options->term = $value;
				break;
			case 'hierarchy20_hierarchy28': // note
				$search_options->note = $value;
				break;
			case 'hierarchy20_hierarchy33': // observations
				$search_options->observations = $value;
				break;
			default:
				# code...
				break;
		}
	}

	# model
	$search_options->model = (bool)$options->model;


	$n_vars = count(get_object_vars($search_options));	
	if ($n_vars<1) {
		return null;
	}

	$area_thesaurus = new area_thesaurus(DEDALO_TESAURO_TIPO);
	$response 		= $area_thesaurus->search_thesaurus( $search_options );
		#dump( json_encode((array)$response), ' $response ++ '.to_string());

	return (object)$response;
}//end search_thesaurus




?>