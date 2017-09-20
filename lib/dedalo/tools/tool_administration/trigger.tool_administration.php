<?php
$start_time=microtime(1);
$session_duration_hours = 72;
include( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();

# IGNORE_USER_ABORT
#ignore_user_abort(true);



/**
* MAKE_BACKUP
* Force unlock all components
*/
function make_backup($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$response = (object)tool_administration::make_backup();

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			
		$response->debug = $debug;
	}

	return $response;
}//end make_backup



/**
* FORCE_UNLOCK_ALL_COMPONENTS
* Force unlock all components
*/
function force_unlock_all_components($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	include DEDALO_LIB_BASE_PATH . '/lock_components/class.lock_components.php';

	$response = (object)lock_components::force_unlock_all_components();

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";			

		$response->debug = $debug;
	}

	return $response;
}//end force_unlock_all_components



/**
* GET_ACTIVE_USERS
* Force unlock all components
*/
function get_active_users($json_data) {
	global $start_time;

	include DEDALO_LIB_BASE_PATH . '/lock_components/class.lock_components.php';

	$response = (object)lock_components::get_active_users();

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";			

		$response->debug = $debug;
	}

	return (object)$response;
}//end get_active_users



/**
* BUILD_STRUCTURE_CSS
* Force unlock all components
*/
function build_structure_css($json_data) {
	global $start_time;

	$response = (object)css::build_structure_css();

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";			

		$response->debug = $debug;
	}

	return (object)$response;
}//end build_structure_css



/**
* UPDATE_STRUCTURE
* Loads structure databases and overwrite existing data
*/
function update_structure($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= '';


	# Remote server case
	if(defined('STRUCTURE_FROM_SERVER') && STRUCTURE_FROM_SERVER===true) {

		# Check remote server status before begins
		$remote_server_status = (object)backup::check_remote_server();
		if ($remote_server_status->result===true) {
			$response->msg 		.= $remote_server_status->msg;
		}else{
			$response->msg 		.= $remote_server_status->msg;
			$response->result 	= false;
			return (object)$response;
		}		
	}


	# EXPORT. Before import, EXPORT ;-)
		$db_name = 'dedalo4_development_str_'.date("Y-m-d_Hi").'.custom';
		$res_export_structure = (object)backup::export_structure($db_name, $exclude_tables=false);	// Full backup
		if ($res_export_structure->result===false) {
			$response->msg = $res_export_structure->msg;
			return $response;
		}else{
			# Append msg
			$response->msg .= $res_export_structure->msg;
			# Exec time
			$export_exec_time	= exec_time_unit($start_time,'ms')." ms";
			$prev_time 			= microtime(1);	
		}
		

	# IMPORT
		$res_import_structure = backup::import_structure();

		if ($res_import_structure->result===false) {
			$response->msg .= $res_import_structure->msg;
			return $response;
		}else{
			$response->msg .= $res_import_structure->msg;
			# Exec time
			$import_exec_time = exec_time_unit($prev_time,'ms')." ms";
		}
	

	# Delete session config (force to recalculate)
	unset($_SESSION['dedalo4']['config']);

	# Delete session permissions table (force to recalculate)
	unset($_SESSION['dedalo4']['auth']['permissions_table']);

	session_write_close();


	$response->result 	= true;
	
	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time			= exec_time_unit($start_time,'ms')." ms";
			$debug->export_exec_time 	= $export_exec_time;
			$debug->import_exec_time 	= $import_exec_time;			
					
		$response->debug = $debug;
	}

	return (object)$response;
}//end update_structure



/**
* BUILD_STRUCTURE_CSS
* Force unlock all components
*/
function delete_component_tipo_in_matrix_table($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('component_tipo','section_tipo','language','save');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	$component_tipo = json_decode($component_tipo);
	$section_tipo 	= json_decode($section_tipo);
	$language 		= json_decode($language);
	$save 			= json_decode($save);

	if(empty($component_tipo)){
		$response->msg .= "<span class='error'> Error: '".label::get_label('component_tipo')."' is mandatory</span>";
		return $response;
	}else if(empty($section_tipo)){
		$response->msg .= "<span class='error'> Error: '".label::get_label('section_tipo')."' is mandatory</span>";
		return $response;
	}
	if(!empty($language) && (empty($component_tipo) || empty($section_tipo)) ){
		$response->msg .= "<span class='error'> Error: Need component_tipo and section_tipo for delete Language</span>";
		return $response;
	}

	$response = (object)tool_administration::delete_component_tipo_in_matrix_table($section_tipo,$component_tipo,$language,$save);

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
}//end build_structure_css



/**
* UPDATE_VERSION
* Update the version, components, SQL, etc, the script look the updates.php file and apply to the current installation data
*/
function update_version($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	set_time_limit (0); // Set time limit unlimited

	ini_set('memory_limit', -1); // unlimited memory

	// Free browser session
	// session_write_close();

	$result = tool_administration::update_version();

	$response->result 	= $result;
	$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';	

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";		

		$response->debug = $debug;
	}

	return (object)$response;
}//end update_version



/**
* SKIP_PUBLICATION_STATE_CHECK
* Update the version, components, SQL, etc, the script look the updates.php file and apply to the current installation data
*/
function skip_publication_state_check($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('value');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	$value = json_decode($value);

	tool_administration::skip_publication_state_check($value);

	$response = new stdClass();
		$response->result 	= true;
		$response->msg 		= 'Set skip_publication_state_check successfully: '.to_string($value);
	
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
}//end skip_publication_state_check



/**
* REMOVE_AV_TEMPORALS
* Remove av ffmpeg sh temprals
*/
function remove_av_temporals($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$result = tool_administration::remove_av_temporals();
	
	$response->result = !empty($result) ? true : false;
	$response->msg 	  = !empty($result) ? "Removed files: <br>".implode('<br>', (array)$result) : "No files found";

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";		

		$response->debug = $debug;
	}

	return (object)$response;
}//end remove_av_temporals



/**
* MOVE_COMPONENT_DATA
*/
function move_component_data($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('source_section_tipo','source_section_id','source_delete','source_portal_tipo','target_section_tipo','target_section_id','map_components');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	if (!empty($source_section_id)) {
		if ($ar_source = json_decode($source_section_id)) {
			$source_section_id = (array)$ar_source;
		}else{
			$source_section_id = (array)$source_section_id;
		}
	}	

	$options = new stdClass();
		# Source options
		$options->source_section_tipo 	= $source_section_tipo;
		$options->source_section_id 	= $source_section_id; // array or null for all records
		$options->source_delete 		= json_decode($source_delete); // bool
		$options->source_portal_tipo 	= $source_portal_tipo;	// portal tipo where hook the target section
		# Target options
		$options->target_section_tipo 	= $target_section_tipo;
		$options->target_section_id 	= $target_section_id; // array or null for all records			
		# Others
		$options->map_components 		= json_decode($map_components); // key is source component tipo. value is target component tipo

		#debug_log(__METHOD__." [trigger_tool_administration] Options ".to_string($options), logger::DEBUG);

	$response = (object)tool_administration::move_component_data($options);	
	
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
}//end move_component_data



/**
* REMOVE_INVERSE_LOCATORS_IN_SECTION
* @return json string
*/
function remove_inverse_locators_in_section($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	session_write_close();	
	
	# set vars
	$vars = array('section_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);			
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}	

	$result = (bool)tool_update_cache::remove_inverse_locators_in_section($section_tipo);
	$response->result = $result;

	if ($result===true) {
		$response->msg = "Removed all inverse locators in section '$section_tipo' successfully";
	}else{
		$response->msg = "Error on remove inverse locators: ".to_string($result);
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
}//end remove_inverse_locators_in_section



/**
* UPDATE_JER_FROM_4_0_TO_4_1
* @return 
*/
function update_jer_from_4_0_to_4_1($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	set_time_limit ( 259200 );  // 3 dias

	# set vars
	$vars = array('tld','modelo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);			
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	$tld 	= (string)strtolower($tld);
	$modelo = (string)$modelo;
	if ($modelo!=='si') {
		$modelo = 'no';
	}
	
	$response =	(object)hierarchy::update_jer_from_4_0_to_4_1($tld, $modelo);

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
}//end update_jer_from_4_0_to_4_1



?>