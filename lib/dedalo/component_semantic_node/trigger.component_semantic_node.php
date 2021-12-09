<?php
$start_time=microtime(1);
include( dirname(dirname(__FILE__)) .'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();

# Write session to unlock session file
session_write_close();



/**
* ADD_INDEX
* Add semantic term to column
*/
function add_index($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('component_tipo', 'section_tipo', 'parent','portal_locator_section_tipo','portal_locator_section_id','new_ds_locator','ds_from_component_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	$new_ds_locator = json_decode($new_ds_locator);

	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
	$component 		= component_common::get_instance( $modelo_name,
													  $component_tipo,
													  $parent,
													  'list',
													  DEDALO_DATA_NOLAN,
													  $section_tipo);

	$result = $component->add_index_semantic( $new_ds_locator, $portal_locator_section_tipo, $portal_locator_section_id);
	$dato   = $component->get_dato();
		#dump($dato, ' dato ++ '.to_string());
	foreach ($dato as $dato_locator) {
		if ($dato_locator->section_tipo==$portal_locator_section_tipo && $dato_locator->section_id==$portal_locator_section_id) {
			$current_locator = $dato_locator;
			break;
		}
	}
	
	$html='';
	if (isset($current_locator)) {

		$component_semantic_node = component_common::get_instance('component_semantic_node',
																 $ds_from_component_tipo,
																 $current_locator->section_id,
																 'edit',
																 DEDALO_DATA_NOLAN,
																 $current_locator->section_tipo);
		$component_semantic_node->set_row_locator($current_locator);

		$html .= $component_semantic_node->get_html();
	}


	$response->result 	= $html;
	$response->msg 		= "add_index done successfully";

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
* Remove semantic term from column
*/
function remove_index($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('component_tipo', 'section_tipo', 'parent','portal_locator_section_tipo','portal_locator_section_id','new_ds_locator','ds_from_component_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	$new_ds_locator = json_decode($new_ds_locator);
	
	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
	$component 		= component_common::get_instance( $modelo_name,
													  $component_tipo,
													  $parent,
													  'list',
													  DEDALO_DATA_NOLAN,
													  $section_tipo);

	$result = $component->remove_index_semantic( $new_ds_locator, $portal_locator_section_tipo, $portal_locator_section_id );
	$dato   = $component->get_dato();
	
	foreach ($dato as $dato_locator) {
		if ($dato_locator->section_tipo==$portal_locator_section_tipo && $dato_locator->section_id==$portal_locator_section_id) {
			$current_locator = $dato_locator;
			break;
		}
	}

	$html='';
	if (isset($current_locator)) {


		$component_semantic_node = component_common::get_instance('component_semantic_node',
																 $ds_from_component_tipo,
																 $current_locator->section_id,
																 'edit',
																 DEDALO_DATA_NOLAN,
																 $current_locator->section_tipo);
		$component_semantic_node->set_row_locator($current_locator);

		$html .= $component_semantic_node->get_html();
	}


	$response->result 	= $html;
	$response->msg 		= "remove_index done successfully";

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
* RESOLVE_TERM
* @return object $response
*/
function resolve_term($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('locator');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	$locator = json_decode($locator);

	$term = ts_object::get_term_by_locator( $locator, $lang=DEDALO_DATA_LANG, $from_cache=true );

	$response->result 	= $term;
	$response->msg 		= __FUNCTION__. " done successfully";

	return (object)$response;
}//end resolve_term



/**
* GET_SEARCH_HTML
* @return object $response
*/
function get_search_html($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('tipo','section_tipo','row_locator');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	$row_locator = json_decode($row_locator);

	$component_semantic_node = component_common::get_instance('component_semantic_node',
															  $tipo,
															  null,
															  'search',
															  DEDALO_DATA_NOLAN,
															  $section_tipo);
	$component_semantic_node->set_row_locator($row_locator);
	$html = $component_semantic_node->get_html();


	$response->result 	= $html;
	$response->msg 		= __FUNCTION__ ." done successfully";

	return (object)$response;
}//end get_search_html













