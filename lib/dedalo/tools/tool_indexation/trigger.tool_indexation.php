<?php

// JSON DOCUMENT
header('Content-Type: application/json');

require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

# Write session to unlock session file
# session_write_close();

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


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
* ADD_INDEX
* Add the received locator in a component relation index dato
* Triggered by js tool_indexation.add_index, called by component_text_area (link_term), called by ts_object (link_term)
* @return object $response
*/
function add_index() {

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed add_index';

	$vars = array('section_tipo', 'section_id', 'label', 'locator');
		foreach($vars as $name) {
			$$name = common::setVar($name);
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
	$response->result = $component->add_index($locator);
	if($response->result===true) {
		$component->Save();
		$response->msg = "Added term $label, locator ".json_encode($locator)." to component_relation_index $tipo [$section_tipo - $section_id]";
	}
	

	return (object)$response;
}//end add_index



/**
* REMOVE_INDEX
* @return object $response
*/
function remove_index() {
	
	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed remove_index';

	$vars = array('section_tipo', 'section_id', 'component_tipo', 'term', 'locator');
		foreach($vars as $name) {
			$$name = common::setVar($name);
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
	$component 		= component_common::get_instance('component_relation_index',
													 $component_tipo,
													 $section_id,
													 'edit',
													 DEDALO_DATA_NOLAN,
													 $section_tipo);	


	$response->result = $component->remove_index($locator);
	if($response->result===true) {
		$component->Save();
		$response->msg = "Removed term \"$term\", locator ".json_encode($locator)." on component_relation_index $component_tipo [$section_tipo - $section_id]";
	}

	return (object)$response;
}//end remove_index



/**
* FRAGMENT_INFO
* @return object $response
*/
function fragment_info() {
	
	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed fragment_info';

	$vars = array('section_tipo', 'section_id', 'component_tipo', 'tag_id', 'lang','tagName');
		foreach($vars as $name) {
			$$name = common::setVar($name);
			if (empty($$name)) {
				$response->msg = 'Error. Empty mandatory var '.$name;
				return $response;
			}
		}

	$component_obj  = component_common::get_instance('component_text_area',
													 $component_tipo,
													 $section_id,
													 'list',
													 $lang,
													 $section_tipo); 	
	$raw_text		= $component_obj->get_dato();
	$fragment_text	= component_text_area::get_fragment_text_from_tag($tagName, $raw_text)[0];
	#$fragment_text	= strip_tags($fragment_text);

	$response->result 			= true;
	$response->msg 	  			= 'Request done successfully';
	$response->fragment_text 	= $fragment_text;
	$response->indexations_list = component_relation_index::get_indexations_from_tag($component_tipo, $section_tipo, $section_id, $tag_id, $lang);
	

	return (object)$response;
}//end fragment_info



/**
* INDEXATIONS_LIST
* @return object $response
*/
function indexations_list() {
	
	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed indexations_list';

	$vars = array('section_tipo', 'section_id', 'component_tipo', 'tag_id', 'lang');
		foreach($vars as $name) {
			$$name = common::setVar($name);
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
	
	
	return (object)$response;
}//end indexations_list



/**
* DELETE_TAG
* Deletes all tag relations (index and portal) and finally removes the tag in all langs
* @return object $response
*/
function delete_tag() {	

	$vars = array('section_tipo', 'section_id', 'component_tipo', 'tag', 'tag_id', 'lang');
		foreach($vars as $name) {
			$$name = common::setVar($name);
			if (empty($$name)) {
				$response->msg = 'Error. Empty mandatory var '.$name;
				return $response;
			}
		}

	$options = new stdClass();
		$options->section_tipo 	= $section_tipo;
		$options->section_id 	= $section_id;
		$options->component_tipo= $component_tipo;
		$options->tag 			= $tag;
		$options->tag_id 		= $tag_id;
		$options->lang 			= $lang;

	$response = tool_indexation::delete_tag($options);	

	return (object)$response;
}//end delete_tag






?>