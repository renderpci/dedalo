<?php
$start_time=microtime(1);
set_time_limit ( 345600 );  // 4 dias: 4 * 24 * 3600
$session_duration_hours = 96;
include( dirname(dirname(dirname(__FILE__))) .'/config/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();


# Disable logging activity and time machine # !IMPORTANT
logger_backend_activity::$enable_log = false;
#RecordObj_time_machine::$save_time_machine_version = false;

# Write session to unlock session file
session_write_close();

# Ignore user close browser
ignore_user_abort(true);



/**
* GET_DIR_FILES
*/
function get_dir_files($json_data) {
	global $start_time;
	
	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('dir');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	$response = (object)tool_import_dedalo_csv::get_csv_files( $dir );

	
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
}//end get_dir_files



/**
* DELETE_CSV_FILE
*/
function delete_csv_file($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';
	
	$vars = array('dir','file_name');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	$file_full_path = $dir .'/'. $file_name;

	if (file_exists($file_full_path)) {
		if( unlink($file_full_path) ) {
			$response->result 	= true;
			$response->msg 		= 'Ok. Request file '.$file_name.' is deleted';
		}else{
			$response->msg 		= 'Error. File exists but you don\'t have permissions to delete this file';
		}
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
}//end delete_csv_file



/**
* IMPORT_SELETED_FILES
*/
function import_seleted_files($json_data) {
	global $start_time;

	# Write session to unlock session file
	session_write_close();

	# Ignore user close browser
	ignore_user_abort(true);

	# Disable logging activity and time machine # !IMPORTANT
	logger_backend_activity::$enable_log = false;
	#RecordObj_time_machine::$save_time_machine_version = false;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';
	
	$vars = array('files','dir');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	# Files is a json encoded array
	$files = json_decode($files);

	$import_response=array();
	foreach ((array)$files as $current_file_obj) {

		$current_file = $current_file_obj->file;
		$section_tipo = $current_file_obj->section_tipo;
		
		# FILE
		$file = $dir . '/' . $current_file;
		if (!file_exists($file)) {
			$response->msg = "Error. File not found: ".$file;
			return $response;
		}
		$ar_csv_data = tool_common::read_csv_file_as_array( $file, $skip_header=false, ';');
			#dump($ar_csv_data, ' $ar_csv_data ++ '.to_string($file)); die();
			#debug_log(__METHOD__." ar_csv_data ".to_string($ar_csv_data), logger::DEBUG);

		$ar_csv_data_final = array();
		foreach ($ar_csv_data as $key => $value) {			
		 	$ar_csv_data_final[$key] = $value;
		} 

		// Consolidate counter. Set counter value to last section_id in section 			
			counter::consolidate_counter( $section_tipo, common::get_matrix_table_from_tipo($section_tipo) );

		# IMPORT
		$import_response[] = (object)tool_import_dedalo_csv::import_dedalo_csv_file($section_tipo, $ar_csv_data_final);
	}
	#dump($result, ' result ++ '.to_string()); exit();

	if (!empty($import_response)) {
		
		$response->result 			= true;
		$response->msg 	  			= "Import task done";
		$response->import_response  = $import_response;

	}else{
	
		$response->msg 	  			= "Import task failed";
		$response->import_response  = $import_response;
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
}//end import_seleted_files



/**
* RENAME_FILES
*/
function rename_files($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('csv_file_path','images_dir','section_tipo','old_name_column','action'); // component_tipo
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	/*
		if (!file_exists($csv_file_path)) {
			$response->msg[] = "Sorry. csv_file_path not found: ".$csv_file_path;
			return $response;
		}
		if (!is_dir($images_dir)) {
			$response->msg[] = "Sorry. images_dir not found: ".$images_dir;
			return $response;
		}

		$ar_csv_data = tool_common::read_csv_file_as_array( $csv_file_path, $skip_header=false, ';');
			#dump($ar_csv_data, ' $ar_csv_data ++ '.to_string());

		# CSV MAP. The csv file map is always the first row
		$csv_map 		= $ar_csv_data[0];

		# Verify csv_map
		$verify_csv_map = tool_import_dedalo_csv::verify_csv_map($csv_map, $section_tipo);
		if ($verify_csv_map!==true) {		
			$result->msg[] 	= "Error. Current csv file first row is invalid for section_tipo: $section_tipo . csv_map: ".to_string($csv_map);
			return $result;
		}

		$old_name_column = (int)$old_name_column;
		$component_tipo  = $csv_map[$old_name_column];


		if ($action==='copy') {
			$dir_target = $images_dir .'/copy'; // Don´t touch original files
		}else{
			$dir_target = $images_dir; // Rename original files
		}
		
		if (!is_dir($dir_target)) {
			if(!mkdir($dir_target, 0777, true)) {			
				$response->msg[] = "Error on create folder: ".$dir_target;
				return $response;
			}
		}

		# format rsc29_rsc170_3 (component_tipo section_tipo section_id)
		foreach ($ar_csv_data as $key => $value) {

			if ($key===0) continue; // Skip first row
					
			$section_id  	 = $value[0];		
			$old_name 	 	 = $value[$old_name_column];

			$extension 		 = pathinfo($old_name,PATHINFO_EXTENSION);
			if(empty($extension)) {
				$extension = 'jpg';
				$old_name .= '.'.$extension;
			}
			$new_name 		 = $component_tipo.'_'.$section_tipo.'_'.$section_id .'.'. $extension;

			$old_file_path 	 = $images_dir .'/' . $old_name ;
			$new_file_path 	 = $dir_target .'/' . $new_name ;

			#echo "[$section_id] -> ". $old_file_path ." \n  ". $new_file_path."\n"; #continue;
		
			if (!file_exists($old_file_path)) {
				$response->msg[] = "Skipped file not found: $old_file_path";			
				debug_log(__METHOD__." Skipped file not found: $old_file_path ".to_string(), logger::ERROR);
				continue;			
			}

			if ($action==='copy') {
				if (!copy($old_file_path, $new_file_path)) {		
					$response->msg[] = "Error on copy file: $old_file_path $new_file_path";	
				    debug_log(__METHOD__." Error on copy file: $old_file_path $new_file_path ".to_string(), logger::ERROR);
					continue;
				}
			}else{
				if (!rename($old_file_path, $new_file_path)) {			
					$response->msg[] = "Error on rename file: $old_file_path $new_file_path";	
				    debug_log(__METHOD__." Error on rename file: $old_file_path $new_file_path ".to_string(), logger::ERROR);
					continue;
				}
			}		
			
			$response->result[] = $new_file_path;
		}//end foreach ($ar_csv_data as $key => $value)

		if (!empty($response->result)) {
			$response->msg[] = "Total files afected : ".count($response->result);
		}
		*/

	$options = new stdClass();
		$options->csv_file_path 	= $csv_file_path;
		$options->images_dir 		= $images_dir;
		$options->section_tipo 		= $section_tipo;
		$options->old_name_column 	= $old_name_column;
		$options->action 			= $action;

	$response = (object)tool_import_dedalo_csv::rename_files($options);

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
}//end rename_files



/**
* IMPORT_IMAGES_CUSTOM
* @return object $response
*/
function import_images_custom($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('csv_file_path','images_dir','section_tipo','component_tipo','images_inside_column','portal_tipo','portal_section_tipo');
		/*
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}*/

		# Defaults
		if (!$csv_file_path)
			#$csv_file_path = '/Users/paco/Trabajos/Dedalo/site_dedalo_plataforma_40/media_test/media_mdcat/import/files/expresos_images_prueba.csv';
			#$csv_file_path = DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH .'/expresos_images_prueba.csv';
			$csv_file_path = DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH .'/expressos-mdcat681.csv';
		
		if (!$images_dir) 
			$images_dir = '/Users/paco/Trabajos/Dedalo/site_dedalo_plataforma_40/media_test/media_mdcat/import/files/Tiff';
			$images_dir = DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH . '/Tiff';	

		if (!$section_tipo) 
			$section_tipo = 'rsc170';
			#$section_tipo = 'rsc176';

		if (!$component_tipo) 
			$component_tipo = 'rsc29';
			#$component_tipo = 'rsc37';

		if (!$images_inside_column) 
			$images_inside_column = 1; // Note that starts with 0

		if (!$portal_tipo) 
			$portal_tipo = 'mdcat718';

		if (!$portal_section_tipo)
			$portal_section_tipo = 'mdcat681';

		#$last_section_id = 997 ;
		$last_section_id = 5435 ;


	# CSV file
	if (!file_exists($csv_file_path)) return "Sorry. csv_file_path not found: ".$csv_file_path;
	$ar_csv_data = tool_common::read_csv_file_as_array( $csv_file_path, $skip_header=true, ';');
		#dump($ar_csv_data, ' $ar_csv_data ++ '.to_string()); die();


	# format rsc29_rsc170_3 (component_tipo section_tipo section_id)
	$i = (int)$last_section_id+1;
	foreach ($ar_csv_data as $key => $value) {
				
		$portal_section_id  = $value[0];
		$ar_locators = array();	

		# Iterate images inside folder
		$images_inside_folder = $value[(int)$images_inside_column];
		$dir 				  = $images_dir .'/'. $images_inside_folder;
		#$dir_target 		  = $dir .'/copy';
		#$dir_target 		  = '/Users/paco/Trabajos/Dedalo/site_dedalo_plataforma_40/media_test/media_mdcat/image/original';
		#$dir_target 		  = DEDALO_MEDIA_BASE_PATH .''. DEDALO_IMAGE_FOLDER .'/'. DEDALO_IMAGE_QUALITY_ORIGINAL;

		
		$ar_files = tool_common::read_files($dir, $valid_extensions=array('tif'));
		foreach ($ar_files as $current_file) {

			# Create new record for each file
			#$section = section::get_instance(null, $section_tipo);
			#$current_section_id = $section->Save();

			$section = section::get_instance($i, $section_tipo);
			$section->forced_create_record();
			$current_section_id = $i;

			$max_items_folder 	  = 1000;
			$ar_aditional_path 	  = '/'.$max_items_folder*(floor($current_section_id / $max_items_folder));
			$dir_target 		  = DEDALO_MEDIA_BASE_PATH .'/'. DEDALO_IMAGE_FOLDER .'/'. DEDALO_IMAGE_QUALITY_ORIGINAL . $ar_aditional_path ;

			if (!is_dir($dir_target)) {
				if(!mkdir($dir_target, 0777, true)) die('Fallo al crear las carpetas... ' . $dir_target);
			}

			# Copy and rename files
			$extension	= pathinfo($current_file,PATHINFO_EXTENSION);
			$new_name	= $component_tipo.'_'.$section_tipo.'_'.$current_section_id .'.'. $extension;

			$old_file_path 	 = $dir .'/'. $current_file;
			$new_file_path 	 = $dir_target .'/'. $new_name;
			

			echo "[$current_section_id] ". $old_file_path ." \n  ". $new_file_path."\n"; #$i++; continue;

			if (!copy($old_file_path, $new_file_path)) {
				echo "\n ERROR on copy file: $old_file_path $new_file_path . Record is created ($current_section_id) but no file is attached";
			    debug_log(__METHOD__." ERROR on copy file: $old_file_path $new_file_path. Record is created ($current_section_id) but no file is attached ".to_string(), logger::ERROR);
				continue;
			}

			# Create quality x format
			$component_image = component_common::get_instance($modelo_name='component_image',
															  $component_tipo,
															  $current_section_id,
															  'edit',
															  DEDALO_DATA_NOLAN,
															  $section_tipo);
			$component_image->generate_default_from_original_real($overwrite=true);
			$component_image->Save(); // Save command generates thumb


			# Link new files to portal later
			$locator = new locator();
				$locator->set_section_tipo($section_tipo);
				$locator->set_section_id($current_section_id);
			
			$ar_locators[] = $locator;

			$response->result[] = $new_name;
			$i++;
			#break;
		}//end foreach ($ar_files as $current_file)


		# Portal
		$component_portal = component_common::get_instance($modelo_name='component_portal',
														  $portal_tipo,
														  $portal_section_id,
														  $modo='edit',
														  DEDALO_DATA_NOLAN,
														  $portal_section_tipo);
		foreach ($ar_locators as $current_locator) {
			$component_portal->add_locator($current_locator);
			#echo "Added locator ($portal_section_tipo - $portal_tipo - $portal_section_id) ".to_string($current_locator);
		}
		$component_portal->Save();

		#break;
	}//end foreach ($ar_csv_data as $key => $value)


	if (!empty($response->result)) {
		$response->msg = "Total files afected : ".count($response->result);
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
}//end import_images_custom



?>