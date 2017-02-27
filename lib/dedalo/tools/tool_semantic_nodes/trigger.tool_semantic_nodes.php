<?php
// JSON DOCUMENT
header('Content-Type: application/json');

require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# Write session to unlock session file
session_write_close();

# set vars
	$vars = array('mode');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



# CALL FUNCTION
if ( function_exists($mode) ) {
	$result = call_user_func($mode);
	$json_params = null;
	if(SHOW_DEBUG===true) {
		$json_params = JSON_PRETTY_PRINT;
	}
	echo json_encode($result, $json_params);
}



/**
* ADD_INDEX
* Add semantic term to column
*/
function add_index() {

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed on node add_index. ';

	# set vars
	$vars = array('component_tipo', 'section_tipo', 'parent','portal_locator_section_tipo','portal_locator_section_id','new_ds_locator','ds_key');
		foreach($vars as $name) $$name = common::setVar($name);

		if( empty($component_tipo) ) {
			$response->msg .= 'Error component_tipo is mandatory';
			return $response;
		}
		if( empty($section_tipo) ) {
			$response->msg .= 'Error section_tipo is mandatory';
			return $response;
		}
		if( empty($parent) ) {
			$response->msg .= 'Error parent is mandatory';
			return $response;
		}
		if( empty($portal_locator_section_tipo) ) {
			$response->msg .= 'Error portal_locator_section_tipo is mandatory';
			return $response;
		}
		if( empty($portal_locator_section_id) ) {
			$response->msg .= 'Error portal_locator_section_id is mandatory';
			return $response;
		}
		if( empty($new_ds_locator) || !$new_ds_locator = json_decode($new_ds_locator) ) {
			$response->msg .= 'Error locator is mandatory';
			return $response;
		}
		if( empty($ds_key) ) {
			$response->msg .= 'Error ds_key is mandatory';
			return $response;
		}
	

	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
	$component 		= component_common::get_instance( $modelo_name,
													  $component_tipo,
													  $parent,
													  'list',
													  DEDALO_DATA_NOLAN,
													  $section_tipo);

	$result = $component->add_index_semantic( $new_ds_locator, $portal_locator_section_tipo, $portal_locator_section_id, $ds_key );
	$dato   = $component->get_dato();
	
	foreach ($dato as $dato_locator) {
		if ($dato_locator->section_tipo==$portal_locator_section_tipo && $dato_locator->section_id==$portal_locator_section_id) {
			$current_locator = $dato_locator;
			break;
		}
	}
	
	$html='';
	if (isset($current_locator)) {		

		$semantic_wrapper_id = $ds_key.'_'.$current_locator->section_tipo.'_'.$current_locator->section_id;
		$ds_element 		 = isset($current_locator->ds->$ds_key) ? $current_locator->ds->$ds_key : null;

		ob_start();
		include(DEDALO_LIB_BASE_PATH . '/tools/tool_semantic_nodes/html/tool_semantic_nodes_node.phtml');
		$html .= ob_get_clean();
	}


	$response->result 	= $html;
	$response->msg 		= "add_index done successfully";

	return $response;
}//end add_index



/**
* REMOVE_INDEX
* Remove semantic term from column
*/
function remove_index() {

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed on node remove_index. ';

	# set vars
	$vars = array('component_tipo', 'section_tipo', 'parent','portal_locator_section_tipo','portal_locator_section_id','new_ds_locator','ds_key');
		foreach($vars as $name) $$name = common::setVar($name);

		if( empty($component_tipo) ) {
			$response->msg .= 'Error component_tipo is mandatory';
			return $response;
		}
		if( empty($section_tipo) ) {
			$response->msg .= 'Error section_tipo is mandatory';
			return $response;
		}
		if( empty($parent) ) {
			$response->msg .= 'Error parent is mandatory';
			return $response;
		}
		if( empty($portal_locator_section_tipo) ) {
			$response->msg .= 'Error portal_locator_section_tipo is mandatory';
			return $response;
		}
		if( empty($portal_locator_section_id) ) {
			$response->msg .= 'Error portal_locator_section_id is mandatory';
			return $response;
		}
		if( empty($new_ds_locator) || !$new_ds_locator = json_decode($new_ds_locator) ) {
			$response->msg .= 'Error locator is mandatory';
			return $response;
		}
		if( empty($ds_key) ) {
			$response->msg .= 'Error ds_key is mandatory';
			return $response;
		}
	
	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
	$component 		= component_common::get_instance( $modelo_name,
													  $component_tipo,
													  $parent,
													  'list',
													  DEDALO_DATA_NOLAN,
													  $section_tipo);

	$result = $component->remove_index_semantic( $new_ds_locator, $portal_locator_section_tipo, $portal_locator_section_id, $ds_key );
	$dato   = $component->get_dato();
	
	foreach ($dato as $dato_locator) {
		if ($dato_locator->section_tipo==$portal_locator_section_tipo && $dato_locator->section_id==$portal_locator_section_id) {
			$current_locator = $dato_locator;
			break;
		}
	}

	$html='';
	if (isset($current_locator)) {		

		$semantic_wrapper_id = $ds_key.'_'.$current_locator->section_tipo.'_'.$current_locator->section_id;
		$ds_element 		 = isset($current_locator->ds->$ds_key) ? $current_locator->ds->$ds_key : null;

		ob_start();
		include(DEDALO_LIB_BASE_PATH . '/tools/tool_semantic_nodes/html/tool_semantic_nodes_node.phtml');
		$html .= ob_get_clean();
	}


	$response->result 	= $html;
	$response->msg 		= "remove_index done successfully";

	return $response;
}//end remove_index



?>