<?php
$start_time=microtime(1);
set_time_limit ( 259200 );  // 3 dias
$session_duration_hours = 72;
include( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();

# Disable logging activity and time machine # !IMPORTANT
logger_backend_activity::$enable_log = false;
#RecordObj_time_machine::$save_time_machine_version = false;

# Write session to unlock session file
session_write_close();



/**
* IMPORT_FILES
* Process previously uploaded images 
*/
function import_files($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';
	
	$vars = array('tipo','section_tipo','parent','top_tipo','top_id','import_mode');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='import_mode' || $name==='top_id' ) continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	// Set get var to allow class recover the tipo
	#$_GET['tipo'] = $tipo;
	
	# Component (expected portal)
	$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
	$component 	 = component_common::get_instance(	$modelo_name,
													$tipo,
													$parent,
													'edit',
													DEDALO_DATA_LANG,
													$section_tipo
												 );	
	# Portal target_section_tipo
	$target_section_tipo = $component->get_ar_target_section_tipo()[0];
	$propiedades 		 = $component->get_propiedades();
	$tool_propiedades 	 = $propiedades->ar_tools_name->tool_import_files;
	/*
	# main section
	# Section that contain current component
	$main_section = section::get_instance($parent, $section_tipo);

	# Current data to heritage
	$main_component_filter 		= $main_section->get_ar_children_objects_by_modelo_name_in_section('component_filter');
	$main_component_filter_dato = $main_component_filter->get_dato();
	*/

	# TEMP SECTION DATA
	$user_id 			= navigator::get_user_id();
	$temp_id 			= DEDALO_SECTION_ID_TEMP.'_'.$parent.'_'.$user_id;
	$temp_section_tipo  = $target_section_tipo; // Default
	if ($import_mode==='section') {
		$temp_section_tipo = $section_tipo;
	}
	$temp_data_uid 	= $temp_section_tipo.'_'.$temp_id;
	if (isset($_SESSION['dedalo4']['section_temp_data'][$temp_data_uid])) {
		$temp_section_data = $_SESSION['dedalo4']['section_temp_data'][$temp_data_uid];
		
		$response->temp_section_data = $temp_section_data;
	}
	#debug_log(__METHOD__." temp_section_data ".to_string($temp_section_data), logger::ERROR);
	$response->temp_data_uid = $temp_data_uid;
	#return $response;

	#
	# TOOL_IMPORT_FILES Class create setup path vars
	$tool_import_files = new tool_import_files($component);

	#
	# FILES
	# Get uploaded files and info
	$files_dir 	  = TOOL_IMPORT_FILES_UPLOAD_DIR;
	$ar_all_files = $tool_import_files->find_all_files($files_dir);
		#dump($ar_all_files, ' ar_all_files ++ '.to_string($files_dir));
		if (empty($ar_all_files)) {
			$response->msg = "Nothing to import";
			return $response;
		}

	# IMPORT_MODE 
	$import_mode = isset($import_mode) ? $import_mode : 'default';

	# TEMP_SECTION_TIPO default is 'target_section_tipo'
	# The data to propagate normally is data of the portal target section, but in case of $import_mode==='section'
	# data to propagate is from the main section (like 'oh1')
	$temp_section_tipo = $target_section_tipo;
	if ($import_mode==='section') {
		# The propagate section tipo for temporal section data is main section_tipo
		$temp_section_tipo = $section_tipo;
	}

	foreach ($ar_all_files as $key => $current_file) {

		$portal_parent = $parent;
		if ($import_mode==='section') {
			# Create new section
			# Always force create/re use section
			$section 		= section::get_instance(null, $section_tipo);
			$create_record 	= $section->forced_create_record();
			$portal_parent 	= $section->get_section_id();
			# dump($portal_parent, ' portal_parent ++ '.to_string());
		}

		#
		# SECTION
		# Create a new section for each file		
		#$current_section 	 = section::get_instance(null, $target_section_tipo);
		#$current_section_id  = $current_section->Save();
		$current_section_id  = component_portal::create_new_portal_record( 
													$portal_parent,
													$portal_tipo=$tipo,
													$portal_section_target_tipo=$target_section_tipo,
													$top_tipo,
													$top_id,
													$section_tipo
													);
		#
		# SET_MEDIA_FILE
		$tool_import_files->set_media_file($current_file, $target_section_tipo, $current_section_id, $tool_propiedades);

		#
		# PROPAGATE_TEMP_SECTION_DATA
		# Update created section with temp section data
		if (!empty($temp_section_data)) {
			$temp_section_id = $current_section_id; // new portal target section created record
			if ($import_mode==='section') {
				$temp_section_id = $portal_parent; // new main section tipo created record
			}
			$tool_import_files->propagate_temp_section_data($temp_section_data, $temp_section_tipo, $temp_section_id);
		}

		debug_log(__METHOD__." Imported files and data from $section_tipo - $portal_parent".to_string(), logger::WARNING);
	}//end foreach ($ar_all_files as $key => $current_file) {

	$response->result 	= true;
	$response->msg 		= 'Import files done successfully. Total: '.count($ar_all_files);


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
}//end if ($mode=='import_files')



?>