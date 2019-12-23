<?php
$start_time=microtime(1);
include( dirname(dirname(__FILE__)).'/config/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();


/**
* SAVE
* @return object $response
*/
function save($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed [save]';

	# Write session to unlock session file
	#session_write_close();

	$vars = array('portal_tipo','portal_parent','section_tipo','dato');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='dato') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}
	
	
	# Verify vars
	if( $dato===false ) {
		$response->msg .= 'Trigger Error: ('.__FUNCTION__.') Empty dato (is mandatory)';
		return $response;
	}
	$dato 		= json_decode($dato);
	$dato_count = count($dato);

	$modelo_name 	  = RecordObj_dd::get_modelo_name_by_tipo($portal_tipo, true);
	$modo 			  = 'edit';
	$component_portal = component_common::get_instance( $modelo_name,
														$portal_tipo,
														$portal_parent,
														$modo,
														DEDALO_DATA_NOLAN,
														$section_tipo,
														false);
	# EXPECTED FORMAT IS :
	# value: Array
	#	(
	#	    [0] => stdClass Object
	#	        (
	#	            [section_id] => 225077
	#	        )
	#
	#	    [1] => stdClass Object
	#	        (
	#	            [tag_id] => 2
	#	            [component_tipo] => dd751
	#	            [section_id] => 225041
	#	        )
	#
	#	    [2] => stdClass Object
	#	        (
	#	            [section_id] => 225050
	#	        )
	#
	#	)
	#	type: array

	# Verify first element
	/*
	if (isset($dato[0]) && !is_object($dato[0])) {
		if(SHOW_DEBUG===true) {
			dump($dato,"debug dato");
		}
		die("Error: dato format is wrong");
	}*/

	$component_portal->set_dato($dato);
	$component_portal->Save();
	#debug_log(__METHOD__." Saved component portal $section_tipo $portal_tipo $portal_parent with values: ".to_string($dato), logger::DEBUG);

	
	$response->result 	= true;
	$response->msg 		= "Ok. Request done. Saved $section_tipo $portal_tipo $portal_parent. Received elements: $dato_count. [save]";
	
	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time 	= exec_time_unit($start_time,'ms')." ms";
			$debug->modelo_name = $modelo_name;
			$debug->label 		= $component_portal->get_label();
			$debug->tipo 		= $portal_tipo;
			$debug->section_tipo= $section_tipo;
			$debug->section_id 	= $portal_parent;
			$debug->lang 		= DEDALO_DATA_NOLAN;
			$debug->modo 		= $modo;
			$debug->dato 		= $dato;

		$response->debug = $debug;
	}


	return (object)$response;
}//end save



/**
* ADD_NEW_ELEMENT
* Save on matrix current relation
* @param $portal_id (Int id matrix from portal component)
* @param $portal_tipo (String tipo from portal
* @param $target_section_tipo (String tipo from section)
* @return object $response
*/
function add_new_element($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# Write session to unlock session file
	#session_write_close();

	$vars = array('portal_tipo','portal_parent','portal_section_tipo','target_section_tipo','top_tipo','top_id');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}
		
	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($portal_tipo, true);
	$component 		= component_common::get_instance($modelo_name,
													 $portal_tipo,
													 $portal_parent,
													 'edit',
													 DEDALO_DATA_NOLAN,
													 $portal_section_tipo);
	$add_options = new stdClass();
		$add_options->section_target_tipo 	= $target_section_tipo;
		$add_options->top_tipo 				= $top_tipo;
		$add_options->top_id 				= $top_id;

	$response = $component->add_new_element($add_options);	
	
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
}//end add_new_element



/**
* REMOVE_ELEMENT
* @return object $response
*/
function remove_element($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';


	$vars = array('tipo','parent','section_tipo','locator','remove_mode');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
	$component 		= component_common::get_instance($modelo_name,
													 $tipo,
													 $parent,
													 'edit',
													 DEDALO_DATA_NOLAN,
													 $section_tipo);
	
	$remove_options = new stdClass();
		$remove_options->locator 	 = $locator;
		$remove_options->remove_mode = $remove_mode;
	$response = $component->remove_element( $remove_options );


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
}//end remove_element



/**
* BUILD_COMPONENT_JSON_DATA
* @return object $response 
*/
function build_component_json_data($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';


	$vars = array('tipo','parent','modo','lang','section_tipo','propiedades','dato','context','build_options');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='propiedades' || $name==='dato' || $name==='context') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}
	#debug_log(__METHOD__." Portal trigger ** build_options ".to_string($build_options), logger::DEBUG); #die();

	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
	$component   	= component_common::get_instance($modelo_name,
													 $tipo,
													 $parent,
													 $modo,
													 $lang,
													 $section_tipo);

	// Inject custom propiedades here as needed
	if (!empty($propiedades)) {
		$component->set_propiedades($propiedades);
	}

	// Context
	if (!empty($context)) {
		$component->set_context($context);

		// Inject received dato here ONLY when context_name is tool_time_machine
		if (isset($context->context_name) && $context->context_name==='tool_time_machine') {
			$component->set_dato($dato);
		}
	}

	$result = $component->build_component_json_data($build_options);

	$response->result 	= $result;
	$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

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
}//end build_component_json_data


?>