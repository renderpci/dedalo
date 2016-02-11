<?php
/**
* TRIGGER_TOOL_IMPORT_FILES
*
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* IMPORT_FILES
* Process previously uploaded images 
*/
if ($mode=='import_files') {
	
	$vars = array('tipo','section_tipo','parent','top_tipo','top_id');
		foreach($vars as $name) $$name = common::setVar($name);
	
	if ( empty($tipo) || empty($section_tipo) || empty($parent) ) {
		exit("Sorry few fars received");
	}

	
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

	
	#
	#
	# TOOL_IMPORT_FILES Class create setup path vars
	$tool_import_files = new tool_import_files($component);

	
	#
	# FILES
	# Get uploaded files and info
	$files_dir = TOOL_IMPORT_FILES_UPLOAD_DIR;
	$ar_all_files = $tool_import_files->find_all_files($files_dir);
		#dump($ar_all_files, ' ar_all_files ++ '.to_string($files_dir));

	if (empty($ar_all_files)) {
		exit('Nothing to import');
	}

	# TEMP SECTION DATA
	$user_id 		= navigator::get_user_id();
	$temp_id 		= DEDALO_SECTION_ID_TEMP.'_'.$parent.'_'.$user_id;
	$temp_data_uid 	= $target_section_tipo.'_'.$temp_id;
	if (isset($_SESSION['dedalo4']['section_temp_data'][$temp_data_uid])) {
		#exit("Sorry, section_temp_data $temp_data_uid not found");
		$temp_section_data = $_SESSION['dedalo4']['section_temp_data'][$temp_data_uid];
	}
	

	foreach ($ar_all_files as $key => $current_file) {		

		#
		# SECTION
		# Create a new section for each file		
		#$current_section 	 = section::get_instance(null, $target_section_tipo);
		#$current_section_id  = $current_section->Save();
		$current_section_id  = component_portal::create_new_portal_record( $portal_parent=$parent, 
													$portal_tipo=$tipo,
													$portal_section_target_tipo=$target_section_tipo,
													$top_tipo,
													$top_id,
													$section_tipo
													);
		#
		# PROPAGATE_TEMP_SECTION_DATA
		# Update created section with temp section data
		if (isset($temp_section_data)) {
			$tool_import_files->propagate_temp_section_data($temp_section_data, $target_section_tipo, $current_section_id);
		}	


		#
		# SET_MEDIA_FILE
		$tool_import_files->set_media_file($current_file, $target_section_tipo, $current_section_id, $tool_propiedades);



	}//end foreach ($ar_all_files as $key => $current_file) {





}//end if ($mode=='import_files') {


?>