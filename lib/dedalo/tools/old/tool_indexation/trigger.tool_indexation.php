<?php
$start_time=microtime(1);
include( dirname(dirname(dirname(__FILE__))) .'/config/config.php');
common::trigger_manager();



/**
* ADD_INDEX
* Add the received locator in a component relation index dato
* Triggered by js tool_indexation.add_index, called by component_text_area (link_term), called by ts_object (link_term)
* @return object $response
*/
function add_index($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed add_index';

	$vars = array('section_tipo', 'section_id', 'label', 'locator');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			if (empty($$name)) {
				$response->msg = 'Error. Empty mandatory var '.$name;
				return $response;
			}
		}

		$locator = json_decode($locator);
		if (!is_object($locator)) {
			$response->msg = 'Error. Bad locator: '. to_string($locator)." - type: ".gettype($locator);
			return $response;
		}

	# COMPONENT_RELATION_INDEX
	$ar_children = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, array('component_relation_index'), $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true);
	if(empty($ar_children)) {
		$response->msg = 'Error. Component component_relation_index not found in section '.$section_tipo;
		return $response;
	}

	$tipo 			= reset($ar_children);
	$component 		= component_common::get_instance('component_relation_index',
													 $tipo,
													 $section_id,
													 'edit',
													 DEDALO_DATA_NOLAN,
													 $section_tipo);
	

	# Add fix custom data to locator
	$locator->type 				  = DEDALO_RELATION_TYPE_INDEX_TIPO;
	$locator->from_component_tipo = $tipo;
		#dump($locator, ' locator ++ '.to_string());
	$response->result = $component->add_locator($locator);
	if($response->result===true) {
		$component->Save();
		$response->msg = "Added term $label, locator ".json_encode($locator)." to component_relation_index $tipo [$section_tipo - $section_id]";
	}else{
		$response->msg = "No element is added (maybe already exists). Term: $label, locator: ".json_encode($locator)." to 'component_relation_index' tipo:$tipo, section_tipo:$section_tipo, section_id:$section_id]";
	}
	

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
}//end add_index



/**
* REMOVE_INDEX
* @return object $response
*/
function remove_index($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed remove_index';

	$vars = array('section_tipo', 'section_id', 'component_tipo', 'term', 'locator');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			if ($name==='term') continue; # Skip non mandatory
			if (empty($$name) || $$name==='undefined') {
				$response->msg = 'Error. Empty mandatory var '.$name;
				return $response;
			}
		}
		$locator = json_decode($locator);
		if (!is_object($locator)) {
			$response->msg = 'Error. Bad locator: '. to_string($locator)." - type: ".gettype($locator);
			return $response;
		}

	# COMPONENT_RELATION_INDEX
	$component 		= component_common::get_instance('component_relation_index',
													 $component_tipo,
													 $section_id,
													 'edit',
													 DEDALO_DATA_NOLAN,
													 $section_tipo);	


	$response->result = $component->remove_locator($locator);
	if($response->result===true) {
		$component->Save();
		$response->msg = "Removed term \"$term\", locator ".json_encode($locator)." on component_relation_index $component_tipo [$section_tipo - $section_id]";
	}

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
}//end remove_index



/**
* FRAGMENT_INFO
* @return object $response
*/
function fragment_info($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed fragment_info';

	$vars = array('section_tipo', 'section_id', 'component_tipo', 'tag_id', 'lang', 'data');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			if ($$name===false) {
				$response->msg = 'Error. Empty mandatory var '.$name;
				return $response;
			}
		}
	
	#
	# Fragment text
	$component_obj  = component_common::get_instance('component_text_area',
													 $component_tipo,
													 $section_id,
													 'list',
													 $lang,
													 $section_tipo); 	
	$raw_text		= $component_obj->get_dato();
	$fragment_text	= component_text_area::get_fragment_text_from_tag($tag_id, 'index', $raw_text)[0];
	#$fragment_text	= strip_tags($fragment_text);

	#
	# Indexations list
	$indexations_list = component_relation_index::get_indexations_from_tag($component_tipo, $section_tipo, $section_id, $tag_id, $lang);

	#
	# Indexation notes
	$data = str_replace("'", '"', $data);
	if ($locator = json_decode($data)) {

		$section = section::get_instance($locator->section_id, $locator->section_tipo);		
		
		// Section info
		$section_info = new stdClass();
			$section_info->modified_by_userID 	= $section->get_modified_by_userID();
			$section_info->modified_date 		= $section->get_modified_date();
			$section_info->created_by_userID 	= $section->get_created_by_userID();
			$section_info->created_by_user_name = $section->get_created_by_user_name();
			$section_info->created_date 		= $section->get_created_date();		

		// HTML
		#$ar_children_objects = $section->get_ar_children_objects_by_modelo_name_in_section($modelo_name_required='component_', $resolve_virtual=false);
		$ar_component_tipo = array(DEDALO_INDEXATION_TITLE_TIPO, DEDALO_INDEXATION_DESCRIPTION_TIPO);
		$html = '';
		foreach ($ar_component_tipo as $component_tipo) {

			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
			$component 	 	= component_common::get_instance($modelo_name,
															 $component_tipo,
															 $locator->section_id,
															 'edit',
															 $lang,
															 $locator->section_tipo);
			$html .= $component->get_html();
		}

		$indexation_notes = new stdClass();
			$indexation_notes->section_info = $section_info;
			$indexation_notes->html 	    = $html;
	}
	
	
	$response->result 			= true;
	$response->msg 	  			= 'Request done successfully';
	$response->fragment_text 	= $fragment_text;
	$response->indexations_list = $indexations_list;
	$response->indexation_notes = isset($indexation_notes) ? $indexation_notes : null;	

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
}//end fragment_info



/**
* INDEXATIONS_LIST
* @return object $response
*/
function indexations_list($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed indexations_list';

	$vars = array('section_tipo', 'section_id', 'component_tipo', 'tag_id', 'lang');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			if (empty($$name)) {
				$response->msg = 'Error. Empty mandatory var '.$name;
				return $response;
			}
		}

	$ar_indexations = component_relation_index::get_indexations_from_tag($component_tipo, $section_tipo, $section_id, $tag_id, $lang);
	if (!empty($ar_indexations)) {
		$response->msg = 'Request done successfully. '. count($ar_indexations)." indexations";
	}else{
		$response->msg = 'Request done successfully. No current indexes have been created';
	}	
	$response->result 			= true;
	$response->indexations_list = $ar_indexations;

	
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
}//end indexations_list



/**
* DELETE_TAG
* Deletes all tag relations (index and portal) and finally removes the tag in all langs
* @return object $response
*/
function delete_tag($json_data) {	
	global $start_time;

	$vars = array('section_tipo', 'section_id', 'component_tipo', 'tag_id', 'lang');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			if (empty($$name)) {
				$response->msg = 'Error. Empty mandatory var '.$name;
				return $response;
			}
		}

	$options = new stdClass();
		$options->section_tipo 	= $section_tipo;
		$options->section_id 	= $section_id;
		$options->component_tipo= $component_tipo;		
		$options->tag_id 		= $tag_id;
		$options->lang 			= $lang;

	$response = tool_indexation::delete_tag($options);

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
}//end delete_tag



/**
* NEW_INDEX_DATA_RECORD
* @return object $response
*/
function new_index_data_record($json_data) {
	global $start_time;	

	$response 	= tool_indexation::new_index_data_record();
	
	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";			

		$response->debug = $debug;
	}

	return (object)$response;
}//end new_index_data_record



?>