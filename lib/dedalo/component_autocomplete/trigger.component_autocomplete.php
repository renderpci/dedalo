<?php
$start_time=microtime(1);
include( dirname(dirname(__FILE__)).'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* AUTOCOMPLETE
* Get list of mathed DB results for current string by ajax call
* @param string $tipo_to_search
* @param string $string_to_search
*/
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
																40,
																$filter_sections,
																$search_fields,
																$divisor);
	
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
}#end function autocomplete')



/**
* SUBMIT_NEW_ELEMENT
* Fire submit form of new element
*/
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
}//end add_locator



/**
* SUBMIT_NEW_ELEMENT
* Fire submit form of new element
*/
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
}//end remove_locator



/**
* NEW_ELEMENT
* Render form to submit new record to source list
* @param string $tipo (component autocomplete tipo)
* @param int $parent (component autocomplete parent id matrix)
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
	
	$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($tipo, true, true);
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
}#end function new_element')



/**
* SUBMIT_NEW_ELEMENT
* Fire submit form of new element
*/
function submit_new_element($json_data) {
	global $start_time;

	# Write session to unlock session file
	#session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('tipo','parent','section_tipo','target_section_tipo','ar_data','propiedades','top_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='dato') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}
	
	$ar_data = json_decode($ar_data);
	if (empty($target_section_tipo)) {		
		$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty target_section_tipo is not valid!';
		return $response;
	}	

	$referenced_tipo = key($ar_data);
	if ( !is_object($ar_data) || empty($referenced_tipo) ) {
		$response->msg = 'Trigger Error: ('.__FUNCTION__.') ar_data is not object!';
		return $response;
	}

	$new_autocomplete_record = component_autocomplete::create_new_autocomplete_record($parent, $tipo, $target_section_tipo, $section_tipo, $ar_data);

	$response->result 	= $new_autocomplete_record;
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
}#end function submit_new_element')







?>