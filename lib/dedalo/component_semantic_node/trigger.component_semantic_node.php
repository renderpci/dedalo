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
* @return object $response
*/
function add_index($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
		// $vars = array('component_tipo', 'section_tipo', 'parent','portal_locator_section_tipo','portal_locator_section_id','new_ds_locator','ds_from_component_tipo');
		$vars = [
			'tipo', // tipo of component_semantic_node
			'section_tipo',
			'parent',
			'locator_ds', // like: {"type":"dd151","section_id":"2","section_tipo":"ds1","from_component_tipo":"oh89"}
			'row_locator' // full portal locator
		];
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	// decode JSON encoded vars
		$new_ds_locator	= json_decode($locator_ds);
		$row_locator	= json_decode($row_locator);

	// portal component
		$portal_tipo	= $row_locator->from_component_tipo;
		$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($portal_tipo,true);
		$component		= component_common::get_instance( $modelo_name,
														  $portal_tipo,
														  $parent,
														  'list',
														  DEDALO_DATA_NOLAN,
														  $section_tipo);

		$add_index_response = $component->add_index_semantic( $new_ds_locator, $row_locator->section_tipo, $row_locator->section_id );
		debug_log(__METHOD__." add_index_semantic result:  ".json_encode($add_index_response->result).' '.to_string($add_index_response->msg), logger::WARNING);
		$dato = $component->get_dato();

	// current_locator locate into portal dato
		foreach ($dato as $dato_locator) {
			if ($dato_locator->section_tipo==$row_locator->section_tipo &&
				$dato_locator->section_id==$row_locator->section_id) {

				$current_locator = $dato_locator;
				break;
			}
		}

	// refresh HTML
		if (isset($current_locator)) {

			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true); // expected component_semantic_node
			if ($modelo_name!=='component_semantic_node') {
				throw new Exception("Error Processing Request. Expected model is 'component_semantic_node' and given: '$modelo_name'", 1);
			}
			$component_semantic_node = component_common::get_instance($modelo_name,
																	 $tipo,
																	 $parent,
																	 'edit',
																	 DEDALO_DATA_NOLAN,
																	 $section_tipo);
			$component_semantic_node->set_dato($current_locator);

			$html = $component_semantic_node->get_html();
		}


	$response->result 	= $html ?? '';
	$response->msg 		= "OK. Request done successfully ".__FUNCTION__;

	// Debug
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
		// $vars = ['component_tipo','section_tipo','parent','portal_locator_section_tipo','portal_locator_section_id','new_ds_locator','ds_from_component_tipo'];
		$vars = [
			'tipo', // tipo of component_semantic_node
			'section_tipo',
			'parent',
			'locator_ds', // like: {"type":"dd151","section_id":"2","section_tipo":"ds1","from_component_tipo":"oh89"}
			'row_locator' // full portal locator
		];
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	// decode JSON encoded vars
		$row_locator = json_decode($row_locator); // like  {"ds":[{"type":"dd151","section_id":"1","section_tipo":"ds1","from_component_tipo":"oh89"},{"type":"dd151","section_id":"2","section_tipo":"ds1","from_component_tipo":"oh89"}],"type":"dd151","section_id":"1","section_tipo":"rsc197","from_component_tipo":"oh24"}
		$locator_ds	 = json_decode($locator_ds); // like {"type":"dd151","section_id":"2","section_tipo":"ds1","from_component_tipo":"oh89"}

	// portal component
		$portal_tipo	= $row_locator->from_component_tipo;
		$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($portal_tipo,true); // expected portal
		$component		= component_common::get_instance( $modelo_name,
														  $portal_tipo,
														  $parent,
														  'list',
														  DEDALO_DATA_NOLAN,
														  $section_tipo);

		$remove_index_response = $component->remove_index_semantic( $locator_ds, $row_locator->section_tipo, $row_locator->section_id );
		debug_log(__METHOD__." remove_index_semantic result:  ".json_encode($remove_index_response->result).' '.to_string($remove_index_response->msg), logger::WARNING);
		$dato = $component->get_dato();

	// current_locator locate into portal dato
		foreach ($dato as $dato_locator) {
			if ($dato_locator->section_tipo===$row_locator->section_tipo &&
				$dato_locator->section_id==$row_locator->section_id) {

				$current_locator = $dato_locator;
				break;
			}
		}

	// refresh HTML
		if (isset($current_locator)) {

			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true); // expected component_semantic_node
			if ($modelo_name!=='component_semantic_node') {
				throw new Exception("Error Processing Request. Expected model is 'component_semantic_node' and given: '$modelo_name'", 1);
			}
			$component_semantic_node = component_common::get_instance($modelo_name,
																	  $tipo,
																	  $parent,
																	  'edit',
																	  DEDALO_DATA_NOLAN,
																	  $section_tipo);
			$component_semantic_node->set_dato($current_locator);

			$html = $component_semantic_node->get_html();
		}


	$response->result 	= $html ?? '';
	$response->msg 		= "OK. Request done successfully ".__FUNCTION__;

	// Debug
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
* GET_SEARCH_HTML
* @return object $response
*/
function get_search_html($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	// set vars
		$vars = [
			'tipo',
			'section_tipo',
			'locator_ds'
		];
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	// decode JSON encoded vars
		$locator_ds = json_decode($locator_ds);

	// row_locator build
		$row_locator = (object)[
			'ds' => [$locator_ds]
		];

	// component_semantic_node
		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true); // expected component_semantic_node
		if ($modelo_name!=='component_semantic_node') {
			throw new Exception("Error Processing Request. Expected model is 'component_semantic_node' and given: '$modelo_name'", 1);
		}
		$component_semantic_node = component_common::get_instance($modelo_name,
																  $tipo,
																  null,
																  'search',
																  DEDALO_DATA_NOLAN,
																  $section_tipo);
		$component_semantic_node->set_dato($row_locator);
		$html = $component_semantic_node->get_html();


	// response
		$response->result	= $html;
		$response->msg		= __FUNCTION__ ." done successfully";


	return (object)$response;
}//end get_search_html



/**
* RESOLVE_TERM
* @return object $response
*/
	// function resolve_term($json_data) {
	// 	global $start_time;

	// 	$response = new stdClass();
	// 		$response->result 	= false;
	// 		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	// 	# set vars
	// 	$vars = array('locator');
	// 		foreach($vars as $name) {
	// 			$$name = common::setVarData($name, $json_data);
	// 			# DATA VERIFY
	// 			if (empty($$name)) {
	// 				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
	// 				return $response;
	// 			}
	// 		}

	// 	$locator = json_decode($locator);

	// 	$term = ts_object::get_term_by_locator( $locator, $lang=DEDALO_DATA_LANG, $from_cache=true );

	// 	$response->result 	= $term;
	// 	$response->msg 		= __FUNCTION__. " done successfully";

	// 	return (object)$response;
	// }//end resolve_term


