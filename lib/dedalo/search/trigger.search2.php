<?php
$start_time=microtime(1);
include( dirname(dirname(__FILE__)).'/config/config4.php');

# Common vars
define('_PRESETS_LIST_SECTION_TIPO', 				'dd623');
define('_PRESETS_LIST_FIELD_NAME_TIPO', 			'dd624');
define('_PRESETS_LIST_FIELD_SECTION_NAME_TIPO', 	'dd642');
define('_PRESETS_LIST_FIELD_SAVE_ARGUMENTS_TIPO', 	'dd648');
define('_PRESETS_LIST_FIELD_JSON_DATA_TIPO', 		'dd625');

# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* GET_COMPONENTS_FROM_SECTION
* @return object $response
*/
function get_components_from_section($json_data) {
	global $start_time;

	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';
	
	# set vars
	$vars = array('section_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			# if ($name==='dato') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.safe_xss($name).' (is mandatory)';
				return $response;
			}
		}


	$components_from_section = search::get_components_from_section($section_tipo);

	
	$response->result 	= $components_from_section->result;
	$response->msg 		= $components_from_section->msg;

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
}//end get_components_from_section



/**
* LOAD_COMPONENTS
* @return object $response
*/
function load_components($json_data) {
	global $start_time;
	
	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed';

	# set vars
	$vars = array('components');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			# if ($name==='modo') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.safe_xss($name).' (is mandatory)';
				return $response;
			}
		}

	if (!is_array($components)) {
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed. components is not an array!';
		return $response;
	}

	
	$html = '';
	foreach ((array)$components as $key => $component_info) {
		
		if (empty($component_info->modo)) {
			# Default
			$component_info->modo = 'search';
		}
	
		$component_tipo = $component_info->component_tipo;

		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_info->component_tipo,true);
		$component 		= component_common::get_instance($modelo_name,
														 $component_info->component_tipo,
														 $component_info->section_id,
														 $component_info->modo,
														 DEDALO_DATA_LANG,
														 $component_info->section_tipo);
		#if ($component_info->modo==="search") {
		#	$component->search_input_name = $component_info->component_tipo.'_'.$component_info->section_id;
		#}

		# DATO CLEAN
		if (isset($component_info->clean) && $component_info->clean===true) {
			$component->set_dato(null);
		}

		# DATO SET CUSTOM VALUE
		if (!empty($component_info->current_value)) {
			$current_value = $component_info->current_value;
			$component->set_dato($current_value);
			#debug_log(__METHOD__." [trigger.search2.load_components] Set current_value as  ".to_string($current_value), logger::DEBUG);
		}

		# Q_OPERATOR
		if(isset($component_info->q_operator)) {			
			$component->q_operator = $component_info->q_operator;  // Inject q_operator value
		}

		$component_html = $component->get_html();
		
		$html .= $component_html;
	}
	
	
	$response->result 	= $html;
	$response->msg 		= 'Ok. Request done';

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
}//end load_components



/**
* GET_COMPONENT_PRESETS
* @return object $response
*/
function get_component_presets($json_data) {
	global $start_time;
	
	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed';

	# set vars
	$vars = array('target_section_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			# if ($name==='modo') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.safe_xss($name).' (is mandatory)';
				return $response;
			}
		}


	$logged_user_id 		= navigator::get_user_id();
	$ar_component_presets 	= search::get_component_presets($logged_user_id, $target_section_tipo);

	# Get permissions to allow/disallow buttons
	$section_tipo 		 	= _PRESETS_LIST_SECTION_TIPO; // Presets list
	$section_permissions 	= common::get_permissions($section_tipo, $section_tipo);
	
	$response->result 		= $ar_component_presets;
	$response->permissions 	= $section_permissions;
	$response->msg 	  		= 'Ok. Request done';

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
}//end get_component_presets



/**
* SAVE_PRESET
* @return object $response
*/
function save_preset($json_data) {
	global $start_time;

	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';
	
	# set vars
	$vars = array('filter','data_section_tipo','preset_section_id');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='options') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.safe_xss($name).' (is mandatory)';
				return $response;
			}
		}

	$presets_section_tipo = _PRESETS_LIST_SECTION_TIPO; // Presets list	

	if (strpos($preset_section_id, DEDALO_SECTION_ID_TEMP)!==false || empty($preset_section_id)) {

		// Create new record
		$section = section::get_instance(null, $presets_section_tipo);
		$section->forced_create_record();
		$parent  = $section->get_section_id();

		#
		# SECTION TIPO FIELD
			$component_tipo = _PRESETS_LIST_FIELD_SECTION_NAME_TIPO; // Section tipo
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($modelo_name,
															 $component_tipo,
															 $parent,
															 'edit',
															 DEDALO_DATA_NOLAN,
															 $presets_section_tipo);
			$component->set_dato($data_section_tipo); // Like oh1
			# Save component
			$component->Save();		
		
		#
		# NAME, PUBLIC, DEFAULT (TEMPORAL SECTION)
		# Propagate all section temp data to the new created real section
			$temp_data_uid = $preset_section_id;
			if (isset($_SESSION['dedalo4']['section_temp_data'][$temp_data_uid])) {
				$temp_section_data = $_SESSION['dedalo4']['section_temp_data'][$temp_data_uid];
				section::propagate_temp_section_data($temp_section_data, $presets_section_tipo, $parent);
				#debug_log(__METHOD__." propagate_temp_section_data $temp_data_uid  ".to_string($temp_section_data), logger::DEBUG);
			}
	
		/*
		#
		# NAME FIELD
			$component_tipo = _PRESETS_LIST_FIELD_NAME_TIPO; // Name
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($modelo_name,
															 $component_tipo,
															 $parent,
															 'edit',
															 DEDALO_DATA_NOLAN,
															 $presets_section_tipo);

			$preset_name = $preset_name ? $preset_name : "Untitled $parent";
			$component->set_dato([$preset_name]);
			# Save component
			$component->Save();
		*/
				
	
	}else{
		$parent  = $preset_section_id;
	}


	#
	# JSON DATA FIELD (Always is saved)
		$component_tipo = _PRESETS_LIST_FIELD_JSON_DATA_TIPO; // JSON data
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		$component 		= component_common::get_instance($modelo_name,
														 $component_tipo,
														 $parent,
														 'edit',
														 DEDALO_DATA_NOLAN,
														 $presets_section_tipo);

		$component->set_dato( $filter );
		# Save component
		$result = $component->Save();


	#	
	# USER
		$user_id 		= navigator::get_user_id();
		$component_tipo = 'dd654'; // component_select
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		$component 		= component_common::get_instance($modelo_name,
														 $component_tipo,
														 $parent,
														 'edit',
														 DEDALO_DATA_NOLAN,
														 $presets_section_tipo);
		$user_locator = new locator();
			$user_locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
			$user_locator->set_section_id($user_id);
			$user_locator->set_from_component_tipo($component_tipo);
			$user_locator->set_type(DEDALO_RELATION_TYPE_LINK);
		$component->set_dato( array($user_locator) );		
		$result[] = $component->Save();	

	
	
	$response->result 		= $result;
	$response->msg 	  		= 'Ok. Request done (section_id: '.$parent.')';

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
}//end save_preset



/**
* DELETE_PRESET
* @return object $response
*/
function delete_preset($json_data) {
	global $start_time;

	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';
	
	# set vars
	$vars = array('section_id');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='options') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.safe_xss($name).' (is mandatory)';
				return $response;
			}
		}

	$presets_section_tipo = _PRESETS_LIST_SECTION_TIPO; // Presets list

	$section = section::get_instance($section_id, $presets_section_tipo);
		
	# Delete section
	$result = $section->Delete('delete_record');
	
	
	$response->result 		= $result;
	$response->msg 	  		= 'Ok. Request done (section_id: $parent)';

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
}//end delete_preset




/**
* SEARCH
* @return object $response
*/
function search($json_data) {
	global $start_time;

	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';
	
	# set vars
	$vars = array('search_query_object');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='options') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.safe_xss($name).' (is mandatory)';
				return $response;
			}
		}
	

	$search = new search($search_query_object);
	$result = $search->search();
	
	
	$response->result 		= $result;
	$response->msg 	  		= 'Ok. Request done';

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
}//end search



/**
* SAVE_TEMP_PRESET
* @return object $response
*/
function save_temp_preset($json_data) {
	global $start_time;

	session_write_close();
	ignore_user_abort(true);

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('section_tipo','filter_obj');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			# if ($name==='dato') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.safe_xss($name).' (is mandatory)';
				return $response;
			}
		}

	$user_id = navigator::get_user_id();
	
	$save_temp_preset = search::save_temp_preset($user_id, $section_tipo, $filter_obj);
	if ($save_temp_preset===true) {
		$response->result 	= $save_temp_preset;
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
}//end save_temp_preset



/**
* LOAD_TEMP_FILTER
* @return object $response
*/
function load_temp_filter($json_data) {
	global $start_time;

	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';
	
	# set vars
	$vars = array('section_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			# if ($name==='dato') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.safe_xss($name).' (is mandatory)';
				return $response;
			}
		}


	$user_id 	 = navigator::get_user_id();
	$temp_preset = search::get_preset(DEDALO_TEMP_PRESET_SECTION_TIPO, $user_id, $section_tipo);
	$temp_filter = isset($temp_preset->json_filter) ? $temp_preset->json_filter : null;
	
	$response->result 	= $temp_filter;
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
}//end load_temp_filter




?>