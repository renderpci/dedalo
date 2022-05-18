<?php
$start_time = hrtime(true);
include(dirname(dirname(dirname(__FILE__))).'/config/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* SEARCH_THESAURUS
* @return object $response
*/
function search_thesaurus(object $json_data) : object {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('search_options');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	// force search_query_object->select not empty
		if (empty($search_options->search_query_object->select)) {

			$search_options->search_query_object->select = json_decode('
			  [
			    {
			      "path": [
			        {
			          "section_tipo": "'.DEDALO_TESAURO_TIPO.'",
			          "component_tipo": "hierarchy22",
			          "modelo": "component_section_id",
			          "name": "Id"
			        }
			      ]
			    }
			  ]
			');
		}

	// response
		$area_thesaurus	= new area_thesaurus(DEDALO_TESAURO_TIPO);
		$response		= $area_thesaurus->search_thesaurus( $search_options );
			#dump( json_encode((array)$response), ' $response ++ '.to_string()); die();

	# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


	return $response;
}//end search_thesaurus
