<?php
$start_time=microtime(1);
include( DEDALO_CONFIG_PATH .'/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* CREATE_NEW_STRUCT
* @return object $response
*/
function create_new_struct($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed [create_new_struct]';

	# set vars
	$vars = array('tag_id');
		foreach($vars as $name) $$name = common::setVarData($name, $json_data);

	$response  = component_text_area::create_new_struct();

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
}//end create_new_struct



/**
* DELETE_TAG
* Deletes all tag relations (index and portal) and finally removes the tag in all langs
* @return object $response
*/
function delete_tag($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed [delete_tag]';


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


	$response = tool_structuration::delete_tag($options);

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
	$fragment_text	= component_text_area::get_fragment_text_from_tag($tag_id, 'struct', $raw_text)[0];
	#$fragment_text	= strip_tags($fragment_text);

	#
	# Indexations list
	$indexations_list = component_relation_struct::get_indexations_from_tag($component_tipo, $section_tipo, $section_id, $tag_id);

	#
	# Struct notes
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
		$ar_component_tipo = array(DEDALO_STRUCTURATION_TITLE_TIPO, DEDALO_STRUCTURATION_DESCRIPTION_TIPO);
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

		$struct_notes = new stdClass();
			$struct_notes->section_info = $section_info;
			$struct_notes->html 	    = $html;
	}
	
	
	$response->result 			= true;
	$response->msg 	  			= 'Request done successfully';
	$response->fragment_text 	= $fragment_text;
	$response->indexations_list = $indexations_list;
	$response->struct_notes 	= isset($struct_notes) ? $struct_notes : null;

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
* SET_SECTION_TITLES
* @return object $response
*//* PASADA A TEXT AREA
function set_section_titles($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed (set_section_titles)';

	$vars = array('ar_locators', 'lang');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			if ($$name===false) {
				$response->msg = 'Error. Empty mandatory var '.$name;
				return $response;
			}
		}
	$ar_locators = json_decode($ar_locators);

	if (is_array($ar_locators)) {		
	
		$result = array();
		foreach ($ar_locators as $current_string_locator) {
			
			$locator = json_decode( str_replace("'", '"', $current_string_locator) );
			if ($locator) {			
				# get_struct_note_data from db
				$struct_note_data = tool_structuration::get_struct_note_data($locator, $lang);
				if ($struct_note_data->result!==false) {			
					$result[$current_string_locator] = (object)$struct_note_data->result;
				}
			}
		}
		$response->result 	= $result;
		$response->msg 		= 'Request done successfully (set_section_titles) Total: '.count($result);
	}
	

	return (object)$response;
}//end set_section_titles */



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

	# COMPONENT_RELATION_STRUCT
	$ar_children = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, array('component_relation_struct'), $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true);
	if(empty($ar_children)) {
		$response->msg = 'Error. Component component_relation_index not found in section '.$section_tipo;
		return $response;
	}

	$tipo 			= reset($ar_children);
	$modelo_name 	= 'component_relation_struct';
	$component 		= component_common::get_instance($modelo_name,
													 $tipo,
													 $section_id,
													 'edit',
													 DEDALO_DATA_NOLAN,
													 $section_tipo);
	

	# Add fix custom data to locator
	$locator->type 				  = DEDALO_RELATION_TYPE_STRUCT_TIPO;
	$locator->from_component_tipo = $tipo;
		#dump($locator, ' locator ++ '.to_string());
	$response->result = $component->add_locator($locator);
	if($response->result===true) {
		$component->Save();
		$response->msg = "Added term $label, locator ".json_encode($locator)." to $modelo_name $tipo [$section_tipo - $section_id]";
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
			if ($name = "term") continue; // Not mandatory (translations issue)
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
	$modelo_name 	= 'component_relation_struct';
	$component 		= component_common::get_instance($modelo_name,
													 $component_tipo,
													 $section_id,
													 'edit',
													 DEDALO_DATA_NOLAN,
													 $section_tipo);	


	$response->result = $component->remove_locator($locator);
	if($response->result===true) {
		$component->Save();
		$response->msg = "Removed term \"$term\", locator ".json_encode($locator)." on $modelo_name $component_tipo [$section_tipo - $section_id]";
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
* GET_SOURCE_DATO_LANG
* @return 
*/
function get_source_dato_lang($json_data) {
	global $start_time;
	
	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed '.__FUNCTION__;

	$vars = array('section_tipo', 'section_id', 'component_tipo', 'lang');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			if ($name = "term") continue; // Not mandatory (translations issue)
			if (empty($$name)) {
				$response->msg = 'Error. Empty mandatory var '.$name;
				return $response;
			}
		}
		
	# COMPONENT
	$source_lang 	= component_text_area::force_change_lang($component_tipo, $section_id, 'edit', $lang, $section_tipo);
		#dump($source_lang, ' source_lang ++ '.to_string());
	if($source_lang === $lang) {
		
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
		$component 		= component_common::get_instance($modelo_name,
														 $component_tipo,
														 $section_id,
														 'edit',
														 $source_lang,
														 $section_tipo);

		$dato = $component->get_dato();
		$dato = TR::addTagImgOnTheFly($dato);
		$response->result 	= $dato;
		$response->msg = 'OK';

	}

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			$debug->source_lang = $source_lang;
			foreach($vars as $name) {
				$debug->{$name} = $$name;
			}

		$response->debug = $debug;
	}


	return (object)$response;
}//end get_source_dato_lang



?>