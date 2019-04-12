 <?php
$start_time=microtime(1);
include( dirname(dirname(__FILE__)).'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* NEW_ELEMENT
* Render form to submit new record to source list
* @param object $json_data
*/
function new_element($json_data) {
	global $start_time;

	# Write session to unlock session file
	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('tipo','parent','section_tipo','target_section_tipo','tipo_to_search','top_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='dato') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}
	
	
	$lang = DEDALO_DATA_LANG;
	$RecordObj_dd = new RecordObj_dd($tipo);
	$propiedades 	 = $RecordObj_dd->get_propiedades(true);

	if(isset($propiedades->source->search)){
			foreach ($propiedades->source->search as $current_search) {
				if($current_search->type === "internal"){
					$ar_terminos_relacionados =  $current_search->components;
				}
			}
		}else{
			$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($tipo, true, true);
		}
		#dump($ar_terminos_relacionados, ' ar_terminos_relacionados ++ '.to_string());
	
	if(SHOW_DEBUG) {
		#$ar_related = common::get_ar_related_by_model('section' $tipo);
		if (empty($ar_terminos_relacionados)) {
			$response->msg = 'Trigger Error: ('.__FUNCTION__.') Missing required ar_terminos_relacionados for current component';
			return $response;
		}		
	}
	
	// View html page
	$page_html	= DEDALO_LIB_BASE_PATH .'/component_autocomplete/html/component_autocomplete_new.phtml';
	ob_start();
	include ( $page_html );
	$html = ob_get_clean();


	$response->result 	= $html;
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
}//end function new_element')



/**
* SUBMIT_NEW_ELEMENT
* Fire submit form of new element
* @param object $json_data
*/
function submit_new_element($json_data) {
	global $start_time;

	# Write session to unlock session file
	#session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	#$vars = array('tipo','parent','section_tipo','target_section_tipo','ar_data','propiedades','top_tipo');
	$vars = array('tipo','parent','section_tipo','target_section_tipo','ar_data','top_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='dato') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	if (!$ar_data = json_decode($ar_data)) {
		$response->msg = 'Trigger Error: ('.__FUNCTION__.') Error on json decode ar_data!';
		return $response;
	}
	
	if (empty($target_section_tipo)) {		
		$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty target_section_tipo is not valid!';
		return $response;
	}	

	$referenced_tipo = key($ar_data);
	if ( !is_object($ar_data) || empty($referenced_tipo) ) {
		$response->msg = 'Trigger Error: ('.__FUNCTION__.') ar_data is not object!';
		return $response;
	}

	$new_locator = (object)component_autocomplete::create_new_autocomplete_record($parent, $tipo, $target_section_tipo, $section_tipo, $ar_data);

	$response->result 	= $new_locator;
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
}//end function submit_new_element')



/**
* AUTOCOMPLETE
* Get list of mathed DB results for current string by ajax call
* @param object $json_data
*//*
function autocomplete($json_data) {
	global $start_time;

	# Write session to unlock session file
	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('tipo','ar_target_section_tipo','string_to_search','top_tipo','search_fields','filter_sections','divisor');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='filter_sections') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}
	
	if (!$search_fields = json_decode($search_fields)) {
		$response->msg = "Trigger Error. Invalid search_fields";
		return $response;
	}
	if (!$ar_target_section_tipo = json_decode($ar_target_section_tipo)) {
		$response->msg = "Trigger Error. Invalid ar_target_section_tipo";
		return $response;
	}	

	$result = (array)component_autocomplete::autocomplete_search($tipo,
																$ar_target_section_tipo,
																$string_to_search,
																100,
																$filter_sections,
																$search_fields,
																$divisor);
	
	$response->result 	= $result;
	$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

	#error_log(json_encode($result));

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
}//end function autocomplete')*/


/**
* AUTOCOMPLETE
* Get list of mathed DB results for current string by ajax call
* @param object $json_data
*//*
function autocomplete2($json_data) {
	global $start_time;

	# Write session to unlock session file
	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('tipo','section_tipo','top_tipo','divisor','search_query_object');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='filter_sections') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}
	
	
	if (!$search_query_object = json_decode($search_query_object)) {
		$response->msg = "Trigger Error. Invalid search_query_object";
		return $response;
	}
	if(SHOW_DEBUG===true) {
		#debug_log(__METHOD__." search_query_object ".to_string($search_query_object), logger::DEBUG);
		#dump(null, ' trigger search_query_object ++ '. json_encode($search_query_object, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)); die();
	}	

	$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);

	$component_autocomplete = component_common::get_instance($modelo_name,
															 $tipo,
															 null,
															 'list',
															 DEDALO_DATA_NOLAN,
															 $section_tipo);

	$result = (array)$component_autocomplete->autocomplete_search2(
															 $search_query_object,
															 $divisor);
	
	$response->result 	= $result;
	$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

	#error_log(json_encode($result));

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
}//end function autocomplete')
*/



/**
* ADD_LOCATOR
* Fire submit form of new element
*//*
function add_locator($json_data) {
	global $start_time;

	# Write session to unlock session file
	#session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('tipo','parent','section_tipo','locator');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='dato') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}
	
	if(!$locator = json_decode($locator)){
		$response->msg = 'Trigger Error: ('.__FUNCTION__.') Invalid locator';
		return $response;
	}

	$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
	$component_autocomplete = component_autocomplete::get_instance( $modelo_name,
																	$tipo,
																	$parent,
																	'edit',
																	DEDALO_DATA_NOLAN,
																	$section_tipo);

	$final = $component_autocomplete->add_locator($locator);

	$response->result 	= $final;
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
}//end add_locator*/



/**
* REMOVE_LOCATOR
* Fire submit form of new element
*//*
function remove_locator($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('tipo','parent','section_tipo','locator');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='dato') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}
	
	if(!$locator = json_decode($locator)){
		$response->msg = 'Trigger Error: ('.__FUNCTION__.') Invalid locator';
		return $response;
	}

	$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
	$component_autocomplete = component_autocomplete::get_instance( $modelo_name,
																	$tipo,
																	$parent,
																	'edit',
																	DEDALO_DATA_NOLAN,
																	$section_tipo);

	$final = $component_autocomplete->remove_locator($locator);

	$response->result 	= $final;
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
}//end remove_locator*/


