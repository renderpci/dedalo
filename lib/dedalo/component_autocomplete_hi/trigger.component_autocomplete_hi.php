<?php
$start_time=microtime(1);
include( dirname(dirname(__FILE__)).'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* UPDATE_COMPONENT_RELATED
* @return object $response
*/
function update_component_related($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('ar_locators');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}


	if(!$ar_locators = json_decode($ar_locators)) {
		return (object)$response;
	}

	$ar_locators = json_decode($ar_locators);
	$locator = end($ar_locators);

	$section_id = $locator->section_id;
	$section_tipo = $locator->section_tipo;

	# Geo
	$component_geo	= component_common::get_instance('component_geolocation',
													 DEDALO_THESAURUS_GEOLOCATION_TIPO,
													 $section_id,
													 'edit',
													 DEDALO_DATA_NOLAN,
													 $section_tipo);
	$geo_dato = $component_geo->get_dato();

	$response = new stdClass();
		$response->result 	= $geo_dato;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			foreach($vars as $current_locator) {
				$debug->{$current_locator} = $$current_locator;
			}

		$response->debug = $debug;
	}


	return (object)$response;	
}//end update_component_related



/**
* BUILD_GRID_IMAGES
* @return object $response
*/
function build_grid_images($json_data) {
	global $start_time;

	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed '.__METHOD__;	
	
	$vars = array('search_query_object','component_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='max_records' || $name==='offset' || $name==='distinct_values') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = "Trigger Error: (".__METHOD__.") Empty ".$name." (is mandatory)";
				return $response;
			}
		}

	// Filter is indexable
	$filter_indexable = json_decode('
      {
        "q": "{\"section_id\":\"1\",\"section_tipo\":\"dd64\",\"type\":\"dd151\",\"from_component_tipo\":\"hierarchy24\"}",
        "q_operator": null,
        "path": [
          {
            "section_tipo": "hierarchy20",
            "component_tipo": "hierarchy24",
            "modelo": "component_radio_button",
            "name": "Usable in indexing"
          }
        ]
      }
    ');

	$op = '$and';
	$search_query_object->filter->$op[] = $filter_indexable;
	#dump($search_query_object, ' search_query_object ++ '.to_string());

	// Search
	$search_development2 = new search_development2($search_query_object);
	$search_result 		 = $search_development2->search();
	$ar_records 		 = $search_result->ar_records;

	$ar_items = [];
	foreach ($ar_records as $key => $row) {
		
		$locator = new locator();
			$locator->set_section_tipo($row->section_tipo);
			$locator->set_section_id($row->section_id);
			$locator->set_component_tipo($component_tipo);

		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		$component 		= component_common::get_instance($modelo_name,
														 $component_tipo,
														 $row->section_id,
														 'list',
														 DEDALO_DATA_NOLAN,
														 $row->section_tipo);
		$url = $component->get_url();

		$item = new stdClass();
			$item->url 		= $url . '?' . start_time();
			$item->locator 	= $locator;
			

		$ar_items[] = $item;
	}


	$response->result 	 = $ar_items;
	$response->msg 		 = 'Ok. Request done ['.__FUNCTION__.']';


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
}//end build_grid_images



/**
* AUTOCOMPLETE
* Get list of mathed DB results for current string by ajax call
* @param $ar_tipo_to_search
* @param $string_to_search
*//*
function autocomplete($json_data) {
	global $start_time;

	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__METHOD__.']';	
	
	$vars = array('hierarchy_types','hierarchy_sections','string_to_search','from_component_tipo','distinct_values','relation_type','search_tipos','filter_custom');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='hierarchy_types' || $name==='distinct_values' || $name==='search_tipos' || $name==='filter_custom') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__METHOD__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}
	
	$hierarchy_types 	= null; // json_decode($hierarchy_types);	


	if (empty($search_tipos)) {
		$search_tipos = [DEDALO_THESAURUS_TERM_TIPO];
	}
	if (is_string($search_tipos) && strpos($search_tipos,'[')===0) {
		$search_tipos = json_decode($search_tipos);
	}
	#debug_log(__METHOD__." search_tipos ".print_r($search_tipos,true), logger::DEBUG);

	$options = new stdClass();
		$options->hierarchy_types 		= $hierarchy_types;
		$options->hierarchy_sections 	= $hierarchy_sections;
		$options->string_to_search 		= $string_to_search;
		$options->max_results 			= 40;
		$options->show_modelo_name 		= true;
		$options->show_parent_name 		= true;
		$options->distinct_values 		= $distinct_values;
		$options->from_component_tipo 	= $from_component_tipo;
		$options->relation_type 		= $relation_type; // DEDALO_RELATION_TYPE_LINK;
		$options->search_tipos 			= $search_tipos;
		$options->filter_custom 		= $filter_custom;


	// $hierarchy_types, $hierarchy_sections, $string_to_search, $max_results=30, $show_modelo_name=false, $show_parent_name=false, $from_component_tipo, $distinct_values
	$search = component_autocomplete_hi::autocomplete_hi_search($options);
																

	$response->result 				= $search->result;
	$response->search_query_object 	= $search->search_query_object; // json encoded object
	$response->msg 					= 'Ok. Request done ['.__FUNCTION__.']';

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
}//end autocomplete
*/


