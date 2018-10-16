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
#session_write_close();



/**
* IMPORT_FILES
* Process previously uploaded images 
*/
function import_files($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';
	
	$vars = array('tipo','section_tipo','parent','top_tipo','top_id','import_mode','ar_data','import_file_name_mode','file_processor_properties','copy_all_filenames_to','optional_copy_filename');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='import_mode' || $name==='top_id' || $name==='file_processor_properties' || $name==='copy_all_filenames_to'|| $name==='optional_copy_filename') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	# IMPORT_MODE 
		$import_mode = isset($import_mode) ? $import_mode : 'default';
	
	# TEMP SECTION DATA
		$user_id = navigator::get_user_id();
		#$temp_id = DEDALO_SECTION_ID_TEMP.'_'.$parent.'_'.$user_id;

	# CURRENT_DEDALO_VERSION
		$current_dedalo_version = tool_administration::get_dedalo_version();

	# Init tool_import_files
	$tool_import_files = new tool_import_files(null);
		

	$ar_msg = [];
	$total  = 0;

	# AR_DATA
	# All files collected from siles upload form
		$ar_processed = [];
		$files_dir = TOOL_IMPORT_FILES_UPLOAD_DIR;
		foreach ((array)$ar_data as $key => $value_obj) {

			$current_file_name 			= $value_obj->file_name;
			$current_file_processor 	= $value_obj->file_processor; # Note that var $current_file_processor is only the current element processor selection
			$current_target_portal_tipo = $value_obj->target_portal_tipo;

			# Check file exists
				$file_full_path = $files_dir . $current_file_name;
				if (!file_exists($file_full_path)) {
					$msg = "File ignored (not found) $current_file_name";
					if(SHOW_DEVELOPER===true) { $msg .= " - $file_full_path"; }
					$ar_msg[] = $msg;
					continue; // Skip file		
				}
			# Check proper mode config
				if ($import_file_name_mode==='numbered' && $import_mode!=='section') {
					$msg = "Invalid import mode: $import_mode . Ignored action";
					debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
					$ar_msg[] = $msg;
					continue; // Skip file			
				}

			# Init file import
			//debug_log(__METHOD__." Init file import_mode:$import_mode - import_file_name_mode:$import_file_name_mode - file_full_path ".to_string($file_full_path), logger::DEBUG);

			# FILE_DATA
			$file_data = tool_import_files::get_file_data($files_dir, $current_file_name);
			

			# SWITCH IMPORT_FILE_NAME_MODE
			switch ($import_file_name_mode) {
				case 'numbered':					
					if (!empty($file_data['regex']->section_id)) {
						
						// Direct numeric case like 1.jpg
						$section = section::get_instance($file_data['regex']->section_id, $section_tipo);
						$section->forced_create_record(); // First record of current section_id force create record. Next files with same section_id, not.
						$_base_section_id = $section->get_section_id();
						//debug_log(__METHOD__." +++ USING SECTION_ID FROM FILE NAME: ".$_base_section_id." - $section_tipo - ".to_string($file_data['regex']->section_id), logger::DEBUG);
					
					}

					$portal_parent = (int)$_base_section_id;										
					break;
				case 'namered':

						// String case like ánfora.jpg
						// Look already imported files

						$ar_filter_result = array_filter($ar_processed, function($element) use($file_data) {
							return $file_data['regex']->base_name === $element->file_data['regex']->base_name;
						});
						$filter_result = reset($ar_filter_result);
						if (!empty($filter_result->section_id)) {							
							# Re-use safe already created section_id (file with same base_name like 'ánforas')
							$_base_section_id = $filter_result->section_id;
							//debug_log(__METHOD__." +++ RE USING SAFE SECTION_ID _base_section_id: ".$_base_section_id." - $section_tipo ".to_string(), logger::DEBUG);
						}else{							
							$section = section::get_instance(null, $section_tipo,'edit',false);
							$current_section_id = $section->Save();
							$_base_section_id = $section->get_section_id();
							//debug_log(__METHOD__." +++ SAVED SECTION _base_section_id: ".$_base_section_id." - $section_tipo - base_name: ".to_string($file_data['regex']->base_name), logger::DEBUG);							
						}
					

					$portal_parent = (int)$_base_section_id;										
					break;
				
				default:
					# IMPORT
					$portal_parent = $parent; // Default
					if ($import_mode==='section') {
						# Create new section
						# Always force create/re use section
						$section 		= section::get_instance(null, $section_tipo);
						#$create_record 	= $section->forced_create_record();
						$section->Save();
						$portal_parent 	= $section->get_section_id();
					}
					break;
			}//end switch ($import_file_name_mode)
			#dump($portal_parent, ' portal_parent ++ '.$section_tipo." - ".to_string($file_data['regex']->section_id)); continue;


			#
			# COMPONENT PORTAL
			# Component (expected portal)
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_target_portal_tipo, true);
				$component_portal 	 = component_common::get_instance(	$modelo_name,
																$current_target_portal_tipo,
																$portal_parent,
																'edit',
																DEDALO_DATA_NOLAN,
																$section_tipo
															 );	
				# Portal target_section_tipo
				$target_section_tipo = $component_portal->get_ar_target_section_tipo()[0];
			
			#
			# SECTION
			# Create a new section for each file from current portal		
			$request_options = new stdClass();
				$request_options->section_target_tipo 	= $target_section_tipo;
				$request_options->top_tipo 				= TOP_TIPO;
				$request_options->top_id 				= TOP_ID;
			$portal_response = (object)$component_portal->add_new_element( $request_options );
			if ($portal_response->result===false) {
				$response->result 	= false;
				$response->msg 		= "Error on create portal children: ".$portal_response->msg;
				return $response;
			}
			// Fix new section created as current_section_id
			$current_section_id = $portal_response->section_id;

			#
			# COMPONENT PORTAL NEW SECTION ORDER
			# Order portal record when is $import_file_name_mode=numbered
			if ($import_file_name_mode==='numbered' || $import_file_name_mode==='namered' ) {
				$portal_norder = $file_data['regex']->portal_order!=='' ? (int)$file_data['regex']->portal_order : false;
				if ($portal_norder!==false) {												
					$changed_order = $component_portal->set_locator_order( $portal_response->added_locator, $portal_norder );
					if ($changed_order===true) {
						$component_portal->Save();
					}
					debug_log(__METHOD__." CHANGED ORDER FOR : ".$file_data['regex']->portal_order." ".to_string($file_data['regex']), logger::DEBUG);
				}
			}

			#
			# TEMP SECTION DATA
			# Add to new created record, the temp section data
			$temp_section_tipo = $target_section_tipo; // Default
			if ($import_mode==='section') {
				$temp_section_tipo = $section_tipo;
			}
			$temp_data_uid = $temp_section_tipo .'_'. DEDALO_SECTION_ID_TEMP ;//$temp_id;
			if (isset($_SESSION['dedalo4']['section_temp_data'][$temp_data_uid])) {
				$temp_section_data = $_SESSION['dedalo4']['section_temp_data'][$temp_data_uid];
				$response->temp_section_data = $temp_section_data;
			}
			$response->temp_data_uid = $temp_data_uid;
		
			#
			# PROPAGATE_TEMP_SECTION_DATA
			# Update created section with temp section data
			if (!empty($temp_section_data)) {
				$temp_section_id = $current_section_id; // new portal target section created record
				if ($import_mode==='section') {
					$temp_section_id = $portal_parent; // new main section tipo created record
				}
				#$tool_import_files->propagate_temp_section_data($temp_section_data, $temp_section_tipo, $temp_section_id);
				section::propagate_temp_section_data($temp_section_data, $temp_section_tipo, $temp_section_id);
			}
	
			#
			# COPY_ALL_FILENAMES_TO
			if (!empty($copy_all_filenames_to)) {

				$RecordObj_dd 	= new RecordObj_dd($copy_all_filenames_to->component_tipo);
				$current_lang  	= $RecordObj_dd->get_traducible()!=='si' ? DEDALO_DATA_NOLAN :  DEDALO_DATA_LANG;			
				
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($copy_all_filenames_to->component_tipo,true);
				$component 		= component_common::get_instance( $modelo_name,
																  $copy_all_filenames_to->component_tipo,
																  $current_section_id,
																  'edit',
																  $current_lang,
																  $target_section_tipo);	
				$component->set_dato($current_file_name);
				$component->Save();
			}

			#
			# OPTIONAL_COPY_FILENAME
			if (!empty($optional_copy_filename)) {

				foreach ($optional_copy_filename as $component => $destination) {

					if($current_target_portal_tipo === $component){
	
						$RecordObj_dd 	= new RecordObj_dd($destination->component_tipo);
						$current_lang  	= $RecordObj_dd->get_traducible()!=='si' ? DEDALO_DATA_NOLAN :  DEDALO_DATA_LANG;

						$section_id 	=  $destination->section_tipo === $section_tipo ? $portal_parent : $current_section_id;	
						
						$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($destination->component_tipo,true);
						$component 		= component_common::get_instance( $modelo_name,
																		  $destination->component_tipo,
																		  $section_id,
																		  'edit',
																		  $current_lang,
																		  $destination->section_tipo);

						$component->set_dato($file_data['regex']->base_name);
						$component->Save();
					}
				}
			}

			#
			# FILE_PROCESSOR
			# Global var button propiedades json data array
			# Optional aditional file script processor defined in button import propiedaes
			# Note that var $file_processor_properties is the button propiedades json data, NOT current element processor selection
			if (!empty($current_file_processor) && !empty($file_processor_properties)) {
				$processor_options = new stdClass();
					$processor_options->file_processor 				= $current_file_processor;
					$processor_options->file_processor_properties 	= $file_processor_properties;
					# Standard arguments					
					$processor_options->file_name 					= $current_file_name;
					$processor_options->files_dir 					= $files_dir;
					$processor_options->section_tipo 				= $section_tipo;
					$processor_options->section_id 					= $portal_parent;
					$processor_options->target_section_tipo 		= $target_section_tipo;
				$response_file_processor = tool_import_files::file_processor($processor_options);				
			}//end if (!empty($file_processor_properties))


			#
			# SET_MEDIA_FILE
			# Move uploaded file to media folder and create default versions
			#$file_data = tool_import_files::get_file_data($files_dir, $current_file_name);  
			#$tool_import_files->set_media_file($file_data, $target_section_tipo, $current_section_id, $tool_propiedades);
			$portal_propiedades  = $component_portal->get_propiedades();
			$tool_propiedades 	 = $portal_propiedades->ar_tools_name->tool_import_files;
			tool_import_files::set_media_file($file_data, $target_section_tipo, $current_section_id, $tool_propiedades);
			

			// Add as processed
			$processed_info = new stdClass();
				$processed_info->file_name 			= $value_obj->file_name;
				$processed_info->file_processor 	= $value_obj->file_processor;
				$processed_info->target_portal_tipo = $value_obj->target_portal_tipo;
				$processed_info->section_id 		= $portal_parent;
				$processed_info->file_data 			= $file_data;
			$ar_processed[] = $processed_info;

			debug_log(__METHOD__." Imported files and data from $section_tipo - $portal_parent".to_string(), logger::WARNING);

			$total++;
		}//end foreach ((array)$ar_data as $key => $value_obj)

	// Reset the temporary section of the components, for empty the fields.
		if (isset($_SESSION['dedalo4']['section_temp_data'][$temp_data_uid])) {
				unset( $_SESSION['dedalo4']['section_temp_data'][$temp_data_uid]);
		}

	// Consolidate counter. Set counter value to last section_id in section
		if ($total>0) {
			$matrix_table = 'matrix';//common::get_matrix_table_from_tipo($section_tipo);
			counter::consolidate_counter( $section_tipo, $matrix_table );
			if (isset($target_section_tipo)) {
				$matrix_table = common::get_matrix_table_from_tipo($target_section_tipo);
				counter::consolidate_counter( $target_section_tipo, $matrix_table );
			}
		}	

	$response->result 	= true;
	$response->msg 		= 'Import files done successfully. Total: '.$total ." of " .count($ar_data);


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