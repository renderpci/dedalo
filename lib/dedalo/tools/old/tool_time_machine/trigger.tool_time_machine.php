<?php
$start_time=microtime(1);
#$TOP_TIPO = 'rsc170';
include( dirname(dirname(dirname(__FILE__))) .'/config/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* LOAD PREVIEW COMPONENT (RIGHT SIDE)
* @param $json_data
*/
function load_preview_component($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('parent','tipo','current_tipo_section','id_time_machine','lang','top_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='id_time_machine') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	#
	# COMPONENT
	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
	$component 		= component_common::get_instance($modelo_name,
													 $tipo,
													 $parent,
													 'edit',
													 $lang,
													 $current_tipo_section);
	#dump($component,"component");#die();
	$component->set_identificador_unico( $component->get_identificador_unico().'_preview' );

	#
	# TOOL
	$tool_time_machine 	= new tool_time_machine($component, 'preview');

	# Configure obj
	$tool_time_machine->set_id_time_machine($id_time_machine);
		#dump($id_time_machine,'$id_time_machine');
	$tool_time_machine->set_current_tipo_section($current_tipo_section);
		#dump($current_tipo_section,'$current_tipo_section');
	
	$html = $tool_time_machine->get_html();
		#dump($tool_time_machine, ' tool_time_machine ++ '.to_string());
	
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
}//end load_preview_component



/**
* ASSIGN TIME MACHINE VALUE
* @param $json_data
*/
function assign_time_machine_value($json_data) {
	global $start_time;

	#debug_log(__METHOD__." TOP_TIPO: ".TOP_TIPO." - TOP_ID: ".TOP_ID.to_string(), logger::DEBUG);

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('parent','tipo','section_tipo','lang','id_time_machine','current_tipo_section','top_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='id_time_machine') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	# Extraemos el dato de matrix_time_machine
	$RecordObj_time_machine = new RecordObj_time_machine($id_time_machine);
	$dato_time_machine 		= $RecordObj_time_machine->get_dato();
		#debug_log(__METHOD__." dato_time_machine ".to_string($dato_time_machine), logger::DEBUG);
		
	
	$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($tipo,true); 
	$component_obj_to_save	= component_common::get_instance($modelo_name,
															 $tipo,
															 $parent,
															 'edit',
															 $lang,
															 $current_tipo_section);

	# Set dato overwrite current component dato
	$component_obj_to_save->set_dato($dato_time_machine);	

	# Save component with nee updated dato from time machine
	$component_obj_to_save->Save();
	

	$response->result 	= true;
	$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			foreach($vars as $name) {
				$debug->{$name} = $$name;
			}
			#$debug->dato_time_machine = $dato_time_machine;

		$response->debug = $debug;
	}
	
	return (object)$response;
}//end assign_time_machine_value



/**
* SECTION LIST LOAD AND SHOW ROWS HISTORY
* @param $json_data
* Load and show in section list view (when user click on Time Machine icon at bottom), all deleted records with this section tipo that are found in matrix_time_machine 
*/
function section_records_load_rows_history($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('current_tipo_section','top_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='id_time_machine') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}	
	
	# SECTIONS_TIME_MACHINE : Array of tm_id records of current section current_tipo_section with status 'deleted'
	$ar_sections_time_machine = (array)tool_time_machine::get_ar_sections_time_machine($current_tipo_section);
		#dump($ar_sections_time_machine,'$ar_sections_time_machine'); die();

	if (empty($ar_sections_time_machine)) {
		if(SHOW_DEBUG) {
			#dump($ar_sections_time_machine,"ar_sections_time_machine is empty");
		}
		$html = "<div class=\"no_results_msg\">No records are deleted</div>";
		
		$response->result 	= $html;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';
		
	}else{

		# New section in 'list_tm' mode
		$section = section::get_instance(NULL,$current_tipo_section,'list_tm');
		$context = new stdClass();
			$context->context_name = 'default';
		$section->set_context($context);

		# AR_LOCATORS : locator build
		# For compatibility with standar section_records way of manage "get_rows_data", we convert tm_id to section_id_matrix inside locator object
		# like '$locator->section_id = $tm_id'
		$ar_locators=array();
		foreach ($ar_sections_time_machine as $key => $tm_id) {
			$locator = new stdClass();
				$locator->section_id = (string)$tm_id;
			$ar_locators[] = $locator;			
		}		
		
		$options = new stdClass();
			$options->filter_by_id = $ar_locators;

		$html_content = $section->get_html($options);
		
		$response->result 	= $html_content;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';
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
}//end section_records_load_rows_history



/**
* SECTION LIST RECOVER SECTION
* @param $json_data
*/
function section_records_recover_section($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('current_tipo_section','id_time_machine','top_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='id_time_machine') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	$id_time_machine = (int)$id_time_machine;
	$section_tipo 	 = (string)$current_tipo_section;

	#
	# RECOVER RESTRICTIONS TEST
	$user_can_recover_sections = (bool)tool_time_machine::user_can_recover_sections( $section_tipo, navigator::get_user_id() );
		#dump($user_can_recover_sections," user_can_recover_sections"); die();	
		if (!$user_can_recover_sections) {			
			$response->msg = 'Trigger Error: ('.__FUNCTION__.') Sorry. Only administrators can recover sections. Please contact with your admin';
			return $response;
		}
	
	#
	# RECOVER SECTION	
	#$tool_time_machine = new tool_time_machine(NULL);
	#$recover 			= $tool_time_machine->recover_section_from_time_machine($id_time_machine);
	$recover = (bool)tool_time_machine::recover_section_from_time_machine($id_time_machine);
	
	if($recover) {
		$response->result 	= true;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';
	}else{		
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.'] Unable recover section';
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
}//end section_records_recover_section



/**
* LOAD_ROWS
* @param $json_data
*/
function load_rows($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('parent','tipo','section_tipo','lang','limit','offset');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='limit' || $name==='offset') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}		
	
	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true); 
	$component_obj	= component_common::get_instance($modelo_name,
													 $tipo,
													 $parent,
													 'list', // (!) Must be 'list' to avoid automatic change of component_text_area to original lang
													 $lang,
													 $section_tipo);
	# tool time machine
	$tool_time_machine 	= new tool_time_machine($component_obj, 'rows');

	# Set rows options
	$tool_time_machine->limit  = $limit;
	$tool_time_machine->offset = $offset;

	# result
	#$rows_html = $tool_time_machine->get_html();
	$rows_json 	= $tool_time_machine->get_json();

	# Now result is a json encoded array
	$ar_rows 	= json_decode($rows_json);
	

	$response->result 	= $ar_rows;
	$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			foreach($vars as $name) {
				$debug->{$name} = $$name;
			}
			#$debug->dato_time_machine = $dato_time_machine;

		$response->debug = $debug;
	}
	
	return (object)$response;
}//end load_rows



?>