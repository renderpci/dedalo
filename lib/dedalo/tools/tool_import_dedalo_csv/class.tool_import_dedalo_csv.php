<?php
/*
* CLASS TOOL_IMPORT_DEDALO_CSV
*
*
*/
class tool_import_dedalo_csv extends tool_common {
	
	protected $section_obj ;
	
	
	/**
	* __CONSTRUCT
	*/
	public function __construct($section_obj, $modo='button') {
		
		# Fix modo
		$this->modo = $modo;

		# Fix current media component
		$this->section_obj = $section_obj;
	}



	/**
	* IMPORT_DEDALO_CSV_FILE
	* @return object $result
	*/
	public static function import_dedalo_csv_file($section_tipo, $ar_csv_data) {

		$start_time = start_time();

		# Disable logging activity and time machine # !IMPORTANT
		logger_backend_activity::$enable_log = false;
		RecordObj_time_machine::$save_time_machine_version = false;

		$result = new stdClass();
			$result->result = false;
			$result->msg 	= '';
		
		# CSV MAP. The csv file map is always the first row
		$csv_map 		= $ar_csv_data[0];

		# Verify csv_map
		$verify_csv_map = self::verify_csv_map($csv_map, $section_tipo);
		if ($verify_csv_map!==true) {
			$result->result = false;
			$result->msg 	= 'Error. Current csv file first row is invalid: '.$verify_csv_map;
			return $result;
		}

		# SECTION_ID KEY COLUMN
		$section_id_key = (int)array_search('section_id', $csv_map);
			#dump($section_id_key, ' section_id_key ++ '.to_string($csv_map)); die();

		# Iterate rows
		$created_rows=array();
		$updated_rows=array();

		# sort ar_csv_data by section_id (first column)
		#uasort($ar_csv_data, function($a, $b) {
		#    return $a[0] > $b[0];
		#});
		# dump($ar_csv_data, ' ar_csv_data ++ '.to_string()); die();
		$counter = 0;
		foreach ((array)$ar_csv_data as $rkey => $row) {
			$row_start_time = start_time();

			if($rkey===0) continue; // Skip first row (used for csv_map)

			# SECTION_ID
			$section_id = !empty($row[$section_id_key]) ? $row[$section_id_key] : null;
			if (empty($section_id)) {
				debug_log(__METHOD__." ERROR on get section_id . SKIPPED record (section_tipo:$section_tipo - rkey:$rkey) ".to_string($section_id), logger::ERROR);
				continue;
			}

			# Always force create/re use section
			$section 		= section::get_instance($section_id, $section_tipo, false);
			$create_record 	= $section->forced_create_record();
			$section_id 	= $section->get_section_id();
			# dump($section_id, ' section_id ++ '.to_string());

			# Iterate fields/columns
			foreach ($row as $key => $value) {

				if ($csv_map[$key]==='section_id') continue; # Skip section_id value column

				# created_by_userID
				if ($csv_map[$key]==='created_by_userID') {
					$dato = (object)$section->get_dato();
					$dato->created_by_userID = (int)$value;
					$section->Save();
					continue;
				# created_date
				}elseif ($csv_map[$key]==='created_date') {
					$dato = (object)$section->get_dato();
					$dato->created_date = $value;
					$section->Save();
					continue;				
				# modified_date
				}elseif ($csv_map[$key]==='modified_date') {
					$dato = (object)$section->get_dato();
					$dato->modified_date = $value;
					$section->Save();
					continue;
				}
			
				# Target component is always the csv map element with current key
				$component_tipo	= $csv_map[$key];
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
				$modo 			= 'list';
				$RecordObj_dd 	= new RecordObj_dd($component_tipo);
				$traducible   	= $RecordObj_dd->get_traducible()==='si' ? true : false;
				$lang 			= $traducible===false ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;			
				$component 		= component_common::get_instance( $modelo_name,
																  $component_tipo,
																  $section_id,
																  $modo,
																  $lang,
																  $section_tipo,
																  false);
				# Configure component
					# DIFFUSION_INFO
					# Note that this process can be very long if there are many inverse locators in this section
					# To optimize save process in scripts of importation, you can dissable this option if is not really necessary
					$component->update_diffusion_info_propagate_changes = false;
					# SAVE_TO_DATABASE
					# Set component to save data but tells section that don save updated section to DDBB for now
					# No component time machine data will be saved when section saves later
					$component->save_to_database = false;


				# If value is json encoded, decode and set
				# Note: json_decode returns null when no is possible decode the value
				#if(strpos($value, '{"lg-')!==false) {
				#	$value = str_replace(EOL, "\n", $value);
				#}
				$value = trim($value); // Avoid wrong final return problems
				# Remove delimiter escape (U+003B for ;)
				$value = str_replace('U+003B', ';', $value);
				$dato_from_json = json_decode($value);
				# debug_log(__METHOD__." Result decode json: type:".gettype($dato_from_json).' -> value: '.$value.' => decoded: '.to_string($dato_from_json), logger::DEBUG);
				if($dato_from_json!==null) {
					$value = $dato_from_json;	
				}


				# Checks value contains dataframe or dato keys
				if (is_object($value)) {
					# Dataframe
					if (property_exists($value, 'dataframe')) {
						foreach ((array)$value->dataframe as $dtkey => $current_dt_locator) {
							$current_from_key 	= $current_dt_locator->from_key;
							$current_type 		= $current_dt_locator->type;
							$component->update_dataframe_element($current_dt_locator, $current_from_key, $current_type); //$ar_locator, $from_key, $type
							debug_log(__METHOD__." Added dataframe locator [$current_from_key,$current_type] ".to_string($current_dt_locator), logger::DEBUG);
						}						
					}					
					# Dato
					if (property_exists($value, 'dato')) {						
						$value = $value->dato;
					}					
				}


				# Elements 'translatables' can be formated as json values like {"lg-eng":"My value","lg-spa":"Mi valor"}				
				if ($traducible===true && is_object($value)) {
					debug_log(__METHOD__." Parsing multilanguaje value [$component_tipo - $section_tipo - $section_id]: ".to_string($value), logger::DEBUG);
					foreach ($value as $v_key => $v_value) {
						
						if (strpos($v_key, 'lg-')===0) {
							$component->set_lang( $v_key );
							$component->set_dato( $v_value );
							$component->Save();
						}else{
							debug_log(__METHOD__." ERROR ON IMPORT VALUE FROM $modelo_name [$component_tipo] - VALUE: ".to_string($value), logger::ERROR);
						}						
					}				 	
				}else{
					// Inverse locators
					if ($modelo_name==='component_portal' || $modelo_name==='component_autocomplete') {
						// This is ONLY for add INVERSE LOCATORS. NOT for save dato !!
						if(!empty($value)) {
							foreach ((array)$value as $pkey => $current_locator) {
								if (!empty($current_locator->section_tipo) && !empty($current_locator->section_id))	{
									$component->add_locator($current_locator);
								}else{
									debug_log(__METHOD__." ERROR ON ADD_LOCATOR TO $modelo_name tipo:$component_tipo, $section_tipo:$section_tipo. locator type:".gettype($current_locator).", SKIPPED EMPTY OR BAD LOCATOR: ".to_string($current_locator), logger::ERROR);
								}
							}
						}//end if(!empty($value))
					}
					// Nolan optional key check
					if (is_object($value) && property_exists($value, 'lg-nolan')) {
						$nolan = 'lg-nolan';
						$value = $value->{$nolan};
					}

					if (is_object($value) && property_exists($value, 'dataframe') && !property_exists($value, 'dato')) {
						// Element without dato. Only the dataframe is saved					
					}else{
						// Always set dato
						$component->set_dato( $value );
					}
												
					// Save of course
					// Note that $component->save_to_database = false, avoid real save.
					$component->Save();
				}				
			}//end foreach ($row as $key => $value)
			
			if($create_record) {
				$created_rows[] = $section_id;
				$action = "created"; 
			}else{
				$updated_rows[] = $section_id;
				$action = "updated";
			}

			# ROW SAVE . Save edited by components section once per row
			$section->Save();

			# Forces collection of any existing garbage cycles
			$counter++;
			if ($counter===100) {
				$counter = 0;
				gc_collect_cycles();
			}			

			#debug_log(__METHOD__." +++ $action section $section_tipo - $section_id - in ".exec_time_unit($row_start_time,'ms').' ms', logger::ERROR);		
		}//end foreach ($ar_csv_data as $key => $value) 

		if (!empty($updated_rows) || !empty($created_rows)) {
			$result->result 	  = true;
			$result->msg 		  = 'Section: '.$section_tipo.'. Total records created:'.count($created_rows).' - updated:'.count($updated_rows);
			$result->created_rows = $created_rows;
			$result->updated_rows = $updated_rows;
		}
		$result->time = exec_time_unit($start_time,'ms');

		return (object)$result;
	}//end import_dedalo_csv_file



	/**
	* VERIFY_CSV_MAP
	* @return mixed true|string
	*/
	public static function verify_csv_map($csv_map, $section_tipo) {
		
		$ar_component_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, array('component_'), $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=false);
		foreach ($csv_map as $key => $component_tipo) {
				
			if($component_tipo==='section_id' || 
				$component_tipo==='created_by_userID' || 
				$component_tipo==='created_date' || 
				$component_tipo==='modified_date') continue;

			if (!in_array($component_tipo, $ar_component_tipo)) {
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
				return "Sorry, component tipo:$component_tipo ($modelo_name) not found in section:$section_tipo";
			}
		}

		return true;
	}//end verify_csv_map



	/**
	* GET_CSV_FILES
	* Read requested dir and return all files of request extension found
	* @param string $dir
	*	Folder path for find csv files
	* @return object $response
	*/
	public static function get_csv_files( $dir ) {
		
		$result = tool_common::read_files($dir, $valid_extensions=array('csv'));
		#dump($result, ' result ++ '.to_string()); exit();

		$files_info = array();
		foreach ($result as $current_file_name) {
			$file = $dir .'/'. $current_file_name;
			$ar_data 	= tool_common::read_csv_file_as_array( $file, $skip_header=false, ';');
			$file_info 	= (array)$ar_data[0];
			$n_records 	= count($ar_data)-1;
			$n_columns 	= count($file_info);
			$files_info[$current_file_name] = 'Records: '.$n_records.' - Columns: '.$n_columns.'<br>'.implode(', ', $file_info).'';

			# Reference first row		
			$ar_reference = array(); foreach ($ar_data[1] as $key => $value) {
				$current_key = $key.']['.$ar_data[0][$key];

				$value = str_replace('U+003B', ';', $value);

				# Test valid json
				if (strpos($value,'[')===0 || strpos($value,'{')===0) {
					$test = json_decode($value);
					if ($test===null) {
						$value = "<span class=\"error\">ERROR!! BAD JSON FORMAT</span>: ".$value;
					}
				}
				
				$ar_reference[$current_key] = $value;
			}
			$files_info[$current_file_name] .= "<pre style=\"white-space:pre;display:none\">Reference row 1: ".print_r($ar_reference,true)."</pre>";
		}

		$response = new stdClass();
			$response->result 		= !empty($result) && is_array($result) ? true : false;
			$response->msg 	  		= !empty($result) && is_array($result) ? "Found ".count($result)." files" : "No files found at $dir";
			$response->files  		= $result;
			$response->files_info  = $files_info;

		return (object)$response;
	}//end get_csv_files



	/**
	* RENAME_FILES
	* @return 
	*/
	public static function rename_files( $request_options ) {
		// 'csv_file_path','images_dir','section_tipo','old_name_column','action'); // component_tipo

		$options = new stdClass();
			$options->csv_file_path 	= false;
			$options->images_dir 		= false;
			$options->section_tipo 		= false;
			$options->old_name_column 	= false;
			$options->action 			= false;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
			debug_log(__METHOD__." Options: ".to_string($options), logger::WARNING);

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= array();

		# CSV_FILE_PATH
		if (!file_exists($options->csv_file_path)) {
			$response->msg[] = "Sorry. csv_file_path not found: ".$options->csv_file_path;
			return $response;
		}
		if (!is_dir($options->images_dir)) {
			$response->msg[] = "Sorry. images_dir not found: ".$options->images_dir;
			return $response;
		}

		# ACTION
		if ($options->action==='copy') {
			$dir_target = $options->images_dir .'/copy'; // Don´t touch original files
		}else{
			$dir_target = $options->images_dir; // Rename original files
		}
		
		# DIR_TARGET
		if (!is_dir($dir_target)) {
			if(!mkdir($dir_target, 0777, true)) {			
				$response->msg[] = "Error on create folder: ".$dir_target;
				return $response;
			}
		}

		# section_tipo
		$section_tipo    = (string)$options->section_tipo;
		$old_name_column = (int)$options->old_name_column;
		$images_dir 	 = (string)$options->images_dir;

		# CSV DATA
		$ar_csv_data = tool_common::read_csv_file_as_array( $options->csv_file_path, $skip_header=false, ';');
			#dump($ar_csv_data, ' $ar_csv_data ++ '.to_string());

		# CSV MAP. The csv file map is always the first row
		$csv_map 		= $ar_csv_data[0];

		# Verify csv_map		
		$verify_csv_map = tool_import_dedalo_csv::verify_csv_map($csv_map, $section_tipo);
		if ($verify_csv_map!==true) {		
			$result->msg[] 	= "Error. Current csv file first row is invalid for section_tipo: $section_tipo . csv_map: ".to_string($csv_map);
			return $result;
		}

		# COMPONENT_TIPO
		$component_tipo  = $csv_map[$old_name_column];

		# CSV DATA . Format rsc29_rsc170_3 (component_tipo section_tipo section_id)
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
			debug_log(__METHOD__."[$section_id] -> ". $old_file_path ." \n  ". $new_file_path."\n", logger::DEBUG);
		
			if (!file_exists($old_file_path)) {
				$response->msg[] = "Skipped file not found: $old_file_path";			
				debug_log(__METHOD__." Skipped file not found: $old_file_path ".to_string(), logger::ERROR);
				continue;			
			}

			if ($options->action==='copy') {
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

		return (object)$response;
	}//end rename_files




}//end tool_import_dedalo_csv
?>