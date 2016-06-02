<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");




/**
* ADD_INDEX
* Add semantic term to column
*/
if($mode=='add_index') {

	# set vars
	$vars = array('tipo', 'section_tipo', 'parent', 'termino_id', 'locator_section_tipo', 'locator_section_id','ds_key');
		foreach($vars as $name) $$name = common::setVar($name);

		if( empty($tipo) ) {
			trigger_error("Error tipo is mandatory");
			if(SHOW_DEBUG) {
				throw new Exception("Trigger Error: tipo is empty ! ", 1); 
			}		
			exit();
		}
		if( empty($section_tipo) ) {
			trigger_error("Error section_tipo is mandatory");
			if(SHOW_DEBUG) {
				throw new Exception("Trigger Error: section_tipo is empty ! ", 1); 
			}
			exit();
		}
		if( empty($parent) ) {
			trigger_error("Error parent is mandatory");
			if(SHOW_DEBUG) {
				#throw new Exception("Trigger Error: parent is empty ! ", 1); 
			}
			exit();
		}
		if( empty($termino_id) ) {
			trigger_error("Error termino_id is mandatory");
			if(SHOW_DEBUG) {
				throw new Exception("Trigger Error: termino_id is empty ! ", 1); 
			}
			exit();
		}
		if( empty($locator_section_tipo) ) {
			trigger_error("Error locator_section_tipo is mandatory");
			if(SHOW_DEBUG) {
				throw new Exception("Trigger Error: locator_section_tipo is empty ! ", 1); 
			}
			exit();
		}
		if( empty($locator_section_id) ) {
			trigger_error("Error locator_section_id is mandatory");
			if(SHOW_DEBUG) {
				throw new Exception("Trigger Error: locator_section_id is empty ! ", 1); 
			}
			exit();
		}
		if( empty($ds_key) ) {
			trigger_error("Error ds_key is mandatory");
			if(SHOW_DEBUG) {
				throw new Exception("Trigger Error: ds_key is empty ! ", 1); 
			}
			exit();
		}
	
	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo);
	$component 		= component_common::get_instance( $modelo_name,
													  $tipo,
													  $parent,
													  'list',
													  DEDALO_DATA_NOLAN,
													  $section_tipo);
	$result = $component->add_index( $termino_id, $locator_section_tipo, $locator_section_id, $ds_key );
	$dato   = $component->get_dato();
	
	foreach ($dato as $dato_locator) {
		if ($dato_locator->section_tipo==$locator_section_tipo && $dato_locator->section_id==$locator_section_id) {
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

	if(SHOW_DEBUG) {
		#$html .= to_string($result);
	}

	echo $html;
	exit();

}//end add_index



/**
* REMOVE_INDEX
* Remove semantic term from column
*/
if($mode=='remove_index') {

	# set vars
	$vars = array('tipo', 'section_tipo', 'parent', 'termino_id', 'locator_section_tipo', 'locator_section_id','ds_key');
		foreach($vars as $name) $$name = common::setVar($name);

		if( empty($tipo) ) {
			trigger_error("Error tipo is mandatory");
			if(SHOW_DEBUG) {
				throw new Exception("Trigger Error: tipo is empty ! ", 1); 
			}		
			exit();
		}
		if( empty($section_tipo) ) {
			trigger_error("Error section_tipo is mandatory");
			if(SHOW_DEBUG) {
				throw new Exception("Trigger Error: section_tipo is empty ! ", 1); 
			}
			exit();
		}
		if( empty($parent) ) {
			trigger_error("Error parent is mandatory");
			if(SHOW_DEBUG) {
				#throw new Exception("Trigger Error: parent is empty ! ", 1); 
			}
			exit();
		}
		if( empty($termino_id) ) {
			trigger_error("Error termino_id is mandatory");
			if(SHOW_DEBUG) {
				throw new Exception("Trigger Error: termino_id is empty ! ", 1); 
			}
			exit();
		}
		if( empty($locator_section_tipo) ) {
			trigger_error("Error locator_section_tipo is mandatory");
			if(SHOW_DEBUG) {
				throw new Exception("Trigger Error: locator_section_tipo is empty ! ", 1); 
			}
			exit();
		}
		if( empty($locator_section_id) ) {
			trigger_error("Error locator_section_id is mandatory");
			if(SHOW_DEBUG) {
				throw new Exception("Trigger Error: locator_section_id is empty ! ", 1); 
			}
			exit();
		}
		if( empty($ds_key) ) {
			trigger_error("Error ds_key is mandatory");
			if(SHOW_DEBUG) {
				throw new Exception("Trigger Error: ds_key is empty ! ", 1); 
			}
			exit();
		}
	
	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo);
	$component 		= component_common::get_instance( $modelo_name,
													  $tipo,
													  $parent,
													  'list',
													  DEDALO_DATA_NOLAN,
													  $section_tipo);
	$result = $component->remove_index( $termino_id, $locator_section_tipo, $locator_section_id, $ds_key );
	$dato   = $component->get_dato();
	
	foreach ($dato as $dato_locator) {
		if ($dato_locator->section_tipo==$locator_section_tipo && $dato_locator->section_id==$locator_section_id) {
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

	if(SHOW_DEBUG) {
		#$html .= to_string($result);
	}

	echo $html;
	exit();

}//end remove_index



?>