<?php
$start_time=microtime(1);
include( dirname(dirname(__FILE__)).'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* SEARCH_THESAURUS
* @return array $result
*/
function search_thesaurus($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('options');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	$options = json_decode($options);
	#dump( $options->filter_by_search, ' $options->filter_by_search ++ '.to_string()); die();

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
			case 'hierarchy_id': // observations
				$search_options->hierarchy_id = $value;
				break;
			default:
				# code...
				break;
		}
	}

	# model
	$search_options->model = (bool)$options->model;
	# limit
	$search_options->limit = isset($options->limit) ? (int)$options->limit : 100;
	
	$n_vars = count(get_object_vars($search_options));	
	if ($n_vars<1) {
		return null;
	}

	# comparison_operator
	$search_options->comparison_operator = $options->operators->comparison_operator;

	$area_thesaurus = new area_thesaurus(DEDALO_TESAURO_TIPO);
	$response 		= $area_thesaurus->search_thesaurus( $search_options );
		#dump( json_encode((array)$response), ' $response ++ '.to_string());

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			foreach($vars as $name) {
				$debug->{$name} = $$name;
			}

		$response->debug = $debug;
	}

	return (object)$response;
}//end search_thesaurus




?>