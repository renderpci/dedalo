<?php
$start_time=microtime(1);
include( dirname(dirname(__FILE__)).'/config/config.php');
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
	
	$vars = array('search_query_object','component_tipo','locator');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='max_records' || $name==='offset' || $name==='distinct_values') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = "Trigger Error: (".__METHOD__.") Empty ".$name." (is mandatory)";
				return $response;
			}
		}
	
	// Locator
		$locator = json_decode($locator);

	// (!) NOTE: search_query_object is not used anymore. Remove all code related with search_query_object here ann javascript when you this is stable this way !
	
		// Build new filted based on locator
			/*		
			$filter_section_id = '
			{
	            "q": "'.$locator->section_id.'",
	            "q_operator": null,
	            "path": [
	                {
	                    "section_tipo": "'.$locator->section_tipo.'",
	                    "component_tipo": "hierarchy22",
	                    "modelo": "component_section_id",
	                    "name": "Id"
	                }
	            ]
	        }';
	        $op = '$and';
			$search_query_object->filter->$op[] = $filter_section_id;
			*/

		// Filter is indexable
		    /*
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
			*/

		// Search
			/*
			$search_development2 = new search_development2($search_query_object);
			$search_result 		 = $search_development2->search();
			$ar_records 		 = $search_result->ar_records;
			*/

		// add_childrens. Recombine result rows with childrens recursive
			/*
			$item = new stdClass();
				$item->section_tipo = $locator->section_tipo;
				$item->section_id   = $locator->section_id;
			$ar_records = component_common::add_childrens([$item], true);
			*/

	// childrens . Get childrens recursive from user selected term no indexable
	$ar_records = component_relation_children::get_childrens($locator->section_id, $locator->section_tipo, null, true);

	$ar_items = [];
	foreach ($ar_records as $key => $row) {

		// Check if is indexable
		$is_indexable = ts_object::is_indexable($row->section_tipo, $row->section_id);
		if ($is_indexable!==true) {
			continue; // Skip non indable terms
		}
		
		$current_locator = new locator();
			$current_locator->set_section_tipo($row->section_tipo);
			$current_locator->set_section_id($row->section_id);
			$current_locator->set_component_tipo($component_tipo);

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
			$item->locator 	= $current_locator;
			

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




