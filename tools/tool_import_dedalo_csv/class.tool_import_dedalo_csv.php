<?php declare(strict_types=1);
/**
* CLASS TOOL_IMPORT_DEDALO_CSV
* Tool to import data into Dédalo.
* Often used to import CSV files previously exported from Dédalo tool_export in raw format.
*
*/
class tool_import_dedalo_csv extends tool_common {



	/**
	* GET_FILES_PATH
	* Default CSV upload directory for current logged user
	* @return string $files_path
	*/
	public static function get_files_path() : string {

		$files_path = DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH .'/'. logged_user_id();


		return $files_path;
	}//end get_files_path



	/**
	* GET_CSV_FILES
	* Read requested directory and return all files of the request extension found
	* @param object $options = new stdClass()
	* @return object $response
	* {
	* 	result	: array $files_info,
	* 	msg		: string,
	* 	error	: string|null
	* }
	*/
	public static function get_csv_files(object $options=new stdClass()) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options
			$dir = $options->files_path ?? tool_import_dedalo_csv::get_files_path();

		// read_files
			$files_list	= tool_common::read_files(
				$dir,
				['csv'] // array $valid_extensions
			);

		// files info
			$files_info = [];
			foreach ($files_list as $current_file_name) {

				$file = $dir .'/'. $current_file_name;

				try {

					// data . extract csv data from file
					$ar_data = tool_common::read_csv_file_as_array(
						$file, // file string
						false, // skip_header bool
						';', // csv_delimiter string
						'"', // enclosure string
						'"' // escape string
					);

					if (empty($ar_data) || empty($ar_data[0])) {
						debug_log(__METHOD__
							. ' Error on read file 1. The file will be ignored' .PHP_EOL
							. ' file: ' .to_string($file)
							, logger::ERROR
						);
						$response->errors[] = 'error reading file';
						continue;
					}

					$file_info	= (array)$ar_data[0];
					$n_records	= count($ar_data)-1;
					$n_columns	= count($file_info);

					// ar_columns_map
						$ar_columns_map = array_map(function($el){
							return (object)[
								'tipo'	=> $el,
								'label'	=> RecordObj_dd::get_termino_by_tipo($el, DEDALO_APPLICATION_LANG, true),
								'model'	=> $el!=='section_id' && !empty($el) ? RecordObj_dd::get_model_name_by_tipo($el, true) : $el
							];
						}, $file_info);

				} catch (Exception $e) {

					$response->errors[] =  'Error on read file: '.to_string($file);

					debug_log(__METHOD__
						. ' Error on read file 2:  The file will be ignored' .PHP_EOL
						. ' file: ' .to_string($file) .PHP_EOL
						. ' exception: ' .$e->getMessage()
						, logger::ERROR
					);
					continue;
				}

				// sample data of first n rows to verify is valid
					$sample_data		= [];
					$sample_data_errors	= [];
					$preview_max		= 10;
					foreach ($ar_data as $dkey => $current_line) {

						if (empty($current_line)) {
							continue;
						}

						foreach ($current_line as $value) {
							if (empty($value)) {
								continue;
							}

							$value = str_replace('U+003B', ';', $value);

							# Test valid JSON
							if (strpos($value,'[')===0 || strpos($value,'{')===0) {

								$test = json_decode($value);

								if ($test===null) {
									debug_log(__METHOD__
										." ERROR!! BAD JSON FORMAT  " . PHP_EOL
										.' value: ' . to_string($value)
										, logger::ERROR
									);

									$sample_data_errors[] = $current_line;
								}

								if(json_last_error()!==JSON_ERROR_NONE){
									debug_log(__METHOD__
										." JSON decode error has occurred:" . PHP_EOL
										.' json_last_error_msg: '. json_last_error_msg()
										, logger::ERROR
									);
								}
							}
						}

						// add skipping header line
							if ($dkey>0) {
								$sample_data[] = $current_line;
							}

						// Stop on reach limit
						if ($dkey>=$preview_max) break;
					}//end foreach ($ar_data as $dkey => $current_line)

				// files_info
					$item = (object)[
						'dir'					=> $dir,
						'name'					=> $current_file_name,
						'data'					=> $ar_data, // $ar_data,
						'n_records'				=> $n_records,
						'n_columns'				=> $n_columns,
						'file_info'				=> $file_info,
						'ar_columns_map'		=> $ar_columns_map,
						'sample_data'			=> $sample_data,
						'sample_data_errors'	=> $sample_data_errors
					];

					$files_info[] = $item;
			}//end foreach ($files_list as $current_file_name)


		// response
			$response->result	= $files_info;
			$response->msg		= !empty($files_info)
				? "Found ".count($files_info)." files"
				: "No files found at $dir";


		return $response;
	}//end get_csv_files



	/**
	* DELETE_CSV_FILE
	* 	Delete given CSV file from server
	* @param object $options
	* {
	* 	file_name: string name.csv,
	* 	files_path: string '/path' // optional
	* }
	* @return object $response
	* {
	* 	result : bool,
	* 	msg : string
	* }
	*/
	public static function delete_csv_file(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// options
			$file_name	= $options->file_name ?? '';
			$dir		= $options->files_path ?? tool_import_dedalo_csv::get_files_path();

		// remove file is exists
			$file_full_path = $dir .'/'. $file_name;
			if (file_exists($file_full_path)) {

				// check is file (prevent to delete directories accidentally)
				if (!is_file($file_full_path)) {
					$response->msg = 'Error. This path does not correspond to a file. Ignored delete_csv_file action';
					$response->errors[] = 'invalid file path';
					debug_log(__METHOD__
						." response->msg: $response->msg" . PHP_EOL
						.' file_full_path: ' .$file_full_path
						, logger::ERROR
					);
					return $response;
				}

				if( unlink($file_full_path) ) {

					$response->result 	= true;
					$response->msg 		= 'OK. Request file '.$file_name.' is deleted';
					debug_log(__METHOD__
						." response->msg: $response->msg"
						, logger::DEBUG
					);

				}else{

					$response->msg = 'Error. File exists but you don\'t have permissions to delete this file';
					$response->errors[] = 'insufficient permissions';
					debug_log(__METHOD__
						." response->msg: $response->msg" . PHP_EOL
						.' file_full_path: ' .$file_full_path
						, logger::ERROR
					);
				}
			}


		return $response;
	}//end delete_csv_file



	/**
	* IMPORT_FILES
	* 	Import user selected files
	* @param object $options
	* {
	* 	files: array,
	* 	time_machine_save: bool,
	* 	files_path: string optional
	* }
	* @return object $response
	* {
	* 	result : bool,
	* 	msg : string,
	* 	debug : object
	* }
	*/
	public static function import_files(object $options) : object {
		$start_time = start_time();

		// Ignore user close browser
			ignore_user_abort(true);

		// options
			$files				= $options->files ?? [];
			$time_machine_save	= $options->time_machine_save ?? null;
			$dir				= $options->files_path ?? tool_import_dedalo_csv::get_files_path();

		// process information
			$process_info = new stdClass();
				$process_info->msg = null;

		// import each file
			$import_response=[];
			foreach ((array)$files as $current_file_obj) {

				$current_file		= $current_file_obj->file; // string like 'exported_oral-history_-1-oh1.csv'
				$section_tipo		= $current_file_obj->section_tipo; // string like 'oh1'
				$ar_columns_map		= $current_file_obj->ar_columns_map; // array of objects like [{checked: false, label: "", mapped_to: "", model: "", tipo: "section_id"}]
				$bulk_process_label	= $current_file_obj->bulk_process_label; // string like 'exported_oral-history_-1-oh1.csv'

				// CLI. print the process_info
					if ( running_in_cli()===true ) {
						$process_info->msg			= label::get_label('reading');
						$process_info->current_file	= $current_file;
						print_cli($process_info);
					}

				// file
					$file = $dir . '/' . $current_file;
					if (!file_exists($file)) {
						$current_file_response = new stdClass();
							$current_file_response->result			= false;
							$current_file_response->msg				= "Error. File not found: ".$file;
							$current_file_response->file			= $current_file;
							$current_file_response->section_tipo	= $section_tipo;
						$import_response[] = $current_file_response;
						continue;
					}
					$ar_csv_data = tool_common::read_csv_file_as_array(
						$file, // string file
						false, // bool skip_header
						';' // string csv delimiter
					);

				// counter. Consolidate counter. Set counter value to last section_id in section
					$matrix_table = common::get_matrix_table_from_tipo($section_tipo);
					// Ignore invalid empty matrix tables
					if (empty($matrix_table)) {
						debug_log(__METHOD__
							. " ERROR: Ignored invalid empty matrix table. Unable to resolve section_record_exists! " . PHP_EOL
							. ' section_tipo: ' . $section_tipo . PHP_EOL
							. ' current_file_obj: ' . to_string($current_file_obj)
							, logger::ERROR
						);
						continue;
					}
					counter::consolidate_counter(
						$section_tipo, $matrix_table
					);

				// import exec
					$import_csv_options = new stdClass();
						$import_csv_options->section_tipo		= $section_tipo;
						$import_csv_options->ar_csv_data		= $ar_csv_data;
						$import_csv_options->time_machine_save	= $time_machine_save;
						$import_csv_options->ar_columns_map		= $ar_columns_map;
						$import_csv_options->current_file		= $current_file;
						$import_csv_options->bulk_process_label	= $bulk_process_label;

					$current_file_response = (object)tool_import_dedalo_csv::import_dedalo_csv_file($import_csv_options);
					$current_file_response->file			= $current_file;
					$current_file_response->section_tipo	= $section_tipo;

				$import_response[] = $current_file_response;
			}//end foreach ((array)$files as $current_file_obj)

		// response
			$response = new stdClass();
				$response->result	= $import_response;
				$response->msg		= 'Request done';

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms').' ms';
					$debug->options		= $options;
				$response->debug = $debug;
			}


		return (object)$response;
	}//end import_files


	/**
	* IMPORT_DEDALO_CSV_FILE
	* 	Import CSV array data to Dédalo
	*
	* @param object $options
	* {
	* 	"section_tipo"		: "oh1", 				// string $section_tipo
	* 	"ar_csv_data"		: [], 					// array $ar_csv_data
	* 	"time_machine_save"	: true, 				// bool $time_machine_save
	* 	"ar_columns_map"	: [] 					// array $ar_columns_map
	* 	""current_file" 	: my_import_csv-oh1 	// string $current_file
	* }
	*
	* @return object $response
	* {
	* 	result			: bool,
	* 	msg				: string
	*	created_rows	: array
	*	updated_rows	: array
	*	failed_rows		: array;
	*	time			: string
	* }
	*/
	public static function import_dedalo_csv_file(object $options) : object {
		$start_time = start_time();

		$section_tipo		= $options->section_tipo;
		$ar_csv_data		= $options->ar_csv_data;
		$time_machine_save	= $options->time_machine_save;
		$ar_columns_map		= $options->ar_columns_map;
		$current_file		= $options->current_file;
		$bulk_process_label	= $options->bulk_process_label;

		// Disable logging activity (!) IMPORTANT
			logger_backend_activity::$enable_log = false;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';
				$response->errors	= [];

		// csv_map
			$csv_map = $ar_columns_map;
			// Verify csv_map
			$verify_csv_map = self::verify_csv_map($csv_map, $section_tipo);
			if ($verify_csv_map->result!==true) {

				// Restore logging activity # !IMPORTANT
					logger_backend_activity::$enable_log = true;

				$response->result	= false;
				$response->msg		= 'Error. Current CSV file first row (headers) is invalid (1): '.$verify_csv_map->msg;

				return $response;
			}

		// section_id key column
			$columns		= array_column($csv_map, 'model');
			$section_id_key	= array_search('component_section_id', $columns);

		// Fixed private section tipos
			$modified_section_tipos = section::get_modified_section_tipos();
				$created_by_user	= array_find($modified_section_tipos, function($el){ return $el['name']==='created_by_user'; }); 	// array('tipo'=>'dd200', 'model'=>'component_select');
				$created_date		= array_find($modified_section_tipos, function($el){ return $el['name']==='created_date'; }); 	// array('tipo'=>'dd199', 'model'=>'component_date');
				$modified_by_user	= array_find($modified_section_tipos, function($el){ return $el['name']==='modified_by_user'; }); // array('tipo'=>'dd197', 'model'=>'component_select');
				$modified_date		= array_find($modified_section_tipos, function($el){ return $el['name']==='modified_date'; }); 	// array('tipo'=>'dd201', 'model'=>'component_date');

		// process information
			$process_info = new stdClass();
				$process_info->msg				= null;
				$process_info->section_tipo		= $section_tipo;
				$process_info->section_id		= null;
				$process_info->component_tipo	= null;
				$process_info->compomnent_label	= null;
				$process_info->current_file		= $current_file;


		// rows info statistics
			$created_rows	= [];
			$updated_rows	= [];
			$failed_rows	= [];

		$counter		= 0;
		$csv_head_row	= $ar_csv_data[0];

		// PROCESS
			// create new process section
				$bulk_process_section = section::get_instance(
					null, // string|null section_id
					DEDALO_BULK_PROCESS_SECTION_TIPO // string section_tipo
				);
				$bulk_process_section->Save();

			// get the bulk_process_id as the section_id of the section process
				$bulk_process_id = $bulk_process_section->get_section_id();

			// Save the file name into the process section
				$bulk_file_component = component_common::get_instance(
					'component_input_text', // string model
					DEDALO_BULK_PROCESS_FILE_TIPO, // string tipo
					$bulk_process_id, // string section_id
					'list', // string mode
					DEDALO_DATA_NOLAN, // string lang
					DEDALO_BULK_PROCESS_SECTION_TIPO // string section_tipo
				);
				$bulk_file_component->set_dato($current_file);
				$bulk_file_component->Save();

			// Save the process name into the process section
				$bulk_process_label_component = component_common::get_instance(
					'component_input_text', // string model
					DEDALO_BULK_PROCESS_LABEL_TIPO, // string tipo
					$bulk_process_id, // string section_id
					'list', // string mode
					DEDALO_DATA_NOLAN, // string lang
					DEDALO_BULK_PROCESS_SECTION_TIPO // string section_tipo
				);
				$bulk_process_label_component->set_dato($bulk_process_label);
				$bulk_process_label_component->Save();


		foreach ($ar_csv_data as $rkey => $columns) {

			// header row
				if($rkey===0) continue; // Skip first row, the header row

			// section_id (cast to int the section_id of the row)
				$section_id = !empty($columns[$section_id_key]) ? (int)$columns[$section_id_key] : null;
				if (empty($section_id)) {
					$error = "ERROR on get MANDATORY section_id. SKIPPED record (section_tipo: $section_tipo - rkey: $rkey - section_id: $section_id)";
					debug_log(__METHOD__
						." $error". PHP_EOL
						.' section_id: '. to_string($section_id),
						logger::ERROR
					);
					$response->errors[] = $error;
					continue;
				}

			// section. Always force create/re-use section
				$section = section::get_instance(
					$section_id,
					$section_tipo,
					'list',
					true // set cache always to true important (!)
				);
				$create_record = $section->forced_create_record();

			// set the information about the process
				$process_info->section_id = $section_id;
				$process_info->msg = ($create_record===true)
					? label::get_label('creating') ?? 'Creating'
					: label::get_label('updating') ?? 'Updating';

			// SAVE_TIME_MACHINE
				// Set section to save data for time machine
				// No component time machine data will be saved when section saves later
				// (based on checkbox value 'Save time machine history on import')
				$section->save_tm = ($time_machine_save===true)
					? true
					: false;


			// Iterate fields/columns
				foreach ($columns as $key => $value) {

					$column_map = $csv_map[$key];
					// column_map sample:
						// {
						// 	"tipo": "dd197",
						// 	"label": "Modified by user",
						// 	"model": "component_select",
						// 	"column_name": "dd197",
						// 	"checked": true,
						// 	"map_to": "dd197"
						// 	"decimal": "."
						// }

					// excluded columns
						// by name
						if($column_map->model === 'section_id' || $column_map->model === 'component_section_id') {
							continue; # Skip section_id value column
						}
						// by checked property
						if(!isset($column_map->checked) || $column_map->checked=== false || !isset($column_map->map_to)) {
							continue;
						}
						// by head comparison. Check if the column_map is correct with the current column in the csv file (match needed)
						$current_csv_head_column = $csv_head_row[$key];
						if($current_csv_head_column !== $column_map->tipo) {
							continue;
						}

					// value general fixes
						// Prevent wrong final return problems
						$value = trim($value);
						// Remove delimiter escape (U+003B for ;)
						$value = str_replace('U+003B', ';', $value);

					// component_tipo
						$component_tipo	= $column_map->map_to;
						// check if the component_tipo is empty, forgotten case.
						if (empty($component_tipo)) {
							debug_log(__METHOD__
								. " Error: !!!!!!!! ignored empty component_tipo on csv_map key: $key ". PHP_EOL
								. " csv_map: ".to_string($csv_map)
								, logger::ERROR
							);
							continue;
						}

					// component base
						$model_name		= RecordObj_dd::get_model_name_by_tipo($component_tipo, true);
						$translate		= RecordObj_dd::get_translatable($component_tipo); //==='si' ? true : false;
						$lang			= $translate===false ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;
						$component		= component_common::get_instance(
							$model_name,
							$component_tipo,
							$section_id,
							'list',
							$lang,
							$section_tipo,
							false, // cache
						);
						// set the bulk_process_id to save it into time_machine
						// this allow to revert the bulk import
						$component->set_bulk_process_id($bulk_process_id);

						if($model_name==='component_number' && isset($column_map->decimal)){
							$component->decimal = $column_map->decimal;
						}

						// with_lang_versions
							$with_lang_versions	= $component->with_lang_versions;

						// configure component
							// DIFFUSION_INFO
							// Note that this process can be very long if there are many inverse locators in this section
							// To optimize save process in scripts of importation, you can disable this option if is not really necessary
							$component->update_diffusion_info_propagate_changes = false;


						// conform imported value with every component rules.
							$conform_import_data_response = $component->conform_import_data($value, $column_map->column_name);
							// if the component has errors, include it into failed rows
							if(!empty($conform_import_data_response->errors)){
								foreach ($conform_import_data_response->errors as $current_error) {
									$failed_rows[] = $current_error;
								}
								// continue 2; // go to next row
								continue; // go to next column
							}

						// conformed_value. value conformed replacement
							$conformed_value = $conform_import_data_response->result;
								// dump($value, ' value ++ '.to_string($component_tipo).' - '.$model_name);
								// dump($conformed_value, ' conformed_value ++ '.to_string($component_tipo).' - '.$model_name);

					switch (true) {

						// created_date
						case ($component_tipo===$created_date['tipo']): // dd199
						// modified_date. Place it at end columns to prevent overwrite
						case ($component_tipo===$modified_date['tipo']): // dd201

							// section set_created_date add
								if (isset($conformed_value[0]) && isset($conformed_value[0]->start)) {
									$dd_date	= new dd_date($conformed_value[0]->start);
									$timestamp	= $dd_date->get_dd_timestamp();
									// set value to section
									if ($component_tipo===$created_date['tipo']) {
										$component->get_my_section()->set_created_date($timestamp);
									}elseif ($component_tipo===$modified_date['tipo']) {
										$component->get_my_section()->set_modified_date($timestamp);
									}
								}

							// save_modified. Only for modified_date, set section save_modified to false
								if ($component_tipo===$modified_date['tipo']) {
									$component->get_my_section()->save_modified = false; // (!) important set to false
								}

							// component save
								$component->set_dato($conformed_value);
								$component->Save();
							break;

						// created_by_user
						case ($component_tipo===$created_by_user['tipo']): // dd200
						// modified_by_user. Place it at end columns to prevent overwrite
						case ($component_tipo===$modified_by_user['tipo']): // dd197

							// section set_created_by_userID/set_modified_by_userID add
								if (isset($conformed_value[0]) && isset($conformed_value[0]->section_id)) {
									// set value to section
									if ($component_tipo===$created_by_user['tipo']) {
										$component->get_my_section()->set_created_by_userID(
											(int)$conformed_value[0]->section_id
										);
									}elseif ($component_tipo===$modified_by_user['tipo']) {
										$component->get_my_section()->set_modified_by_userID(
											(int)$conformed_value[0]->section_id
										);
									}
								}

							// save_modified. Only for modified_by_user, set section save_modified to false
								if ($component_tipo===$modified_by_user['tipo']) {
									$component->get_my_section()->save_modified = false; // (!) important set to false
								}

							// component save
								$component->set_dato($conformed_value);
								$component->Save();
							break;

						default:

							// Elements 'translatable' can be formatted as JSON values like {"lg-eng":"My value","lg-spa":"Mi valor"}
							if (($translate===true || $with_lang_versions===true) && is_object($conformed_value)) {

								debug_log(__METHOD__
									. " Parsing multi-language value [$component_tipo - $section_tipo - $section_id]: " .PHP_EOL
									. ' value:' . to_string($conformed_value)
									, logger::DEBUG
								);
								foreach ($conformed_value as $v_key => $v_value) {

									if (strpos($v_key, 'lg-')===0) {
										$component->set_lang( $v_key );
										$component->set_dato( $v_value );
										$component->Save();
									}else{
										debug_log(__METHOD__
											. " ERROR ON IMPORT VALUE FROM $model_name [$component_tipo]"
											. ' value:' . to_string($conformed_value)
											, logger::ERROR
										);
									}
								}
							}else{

								// check every locator to be sure is valid!!
									if( !empty($conformed_value) &&
										in_array($model_name, component_relation_common::get_components_with_relations())
										) {
										foreach ((array)$conformed_value as $current_locator) {
											if (empty($current_locator->section_tipo) || empty($current_locator->section_id)) {
												$error = empty($current_locator->section_id)
													? 'section_id is not valid'
													: 'section_tipo is not valid';
												$failed = new stdClass();
													$failed->section_id		= $section_id;
													$failed->data			= $current_locator;
													$failed->component_tipo	= $component->get_tipo();
													$failed->msg			= 'IGNORED: malformed locator '. $error;
												$failed_rows[] = $failed;
												continue 3;
											}
										}
									}//end if(!empty($conformed_value))

								// Nolan optional key check
									if (is_object($conformed_value) && property_exists($conformed_value, 'lg-nolan')) {
										$nolan				= 'lg-nolan';
										$conformed_value	= $conformed_value->{$nolan};
									}

								// set dato
									if ( is_object($conformed_value) &&
										 property_exists($conformed_value, 'dataframe') &&
										!property_exists($conformed_value, 'dato')) {
										// Element without dato. Only the dataframe is saved
									}else{

										// Removed direct call
										// unified with API calls with changed_data_item object
											// $component->set_dato( $conformed_value );
											// $component->observable_dato = ($component->model === 'component_relation_related')
											// 	? $component->get_dato_with_references()
											// 	: $conformed_value;

										// added changed data object to set data and observable data
										$changed_data_item = new stdClass();
											$changed_data_item->action = 'set_data';
											$changed_data_item->value = $conformed_value;

										$component->update_data_value($changed_data_item);
									}

								// Save of course
								// Note that $component->save_to_database = false, avoid real save.
									$component->Save();
							}
							break;
					}//end switch (true)


					// set the information about the process
					$process_info->component_tipo = $component_tipo;
					$process_info->compomnent_label = RecordObj_dd::get_termino_by_tipo($component_tipo,DEDALO_APPLICATION_LANG, true);

					// print the process_info
					if ( running_in_cli()===true ) {
						print_cli($process_info);
					}
				}//end foreach ($columns as $key => $value)

			// action add for statistics
				if($create_record===true) {
					$created_rows[] = $section_id;
				}else{
					$updated_rows[] = $section_id;
				}

			// Forces collection of any existing garbage cycles
				$counter++;
				if ($counter===100) {
					$counter = 0;
					gc_collect_cycles();
				}
		}//end foreach ($ar_csv_data as $key => $value)

		// Restore logging activity # !IMPORTANT
			logger_backend_activity::$enable_log = true;

		// response
			if (!empty($updated_rows) || !empty($created_rows)) {
				$response->result		= true;
				$response->msg			= 'Section: '.$section_tipo.'. Total records created:'.count($created_rows).' - updated:'.count($updated_rows).' - failed:'.count($failed_rows);
				$response->created_rows	= $created_rows;
				$response->updated_rows	= $updated_rows;
				$response->failed_rows	= $failed_rows;
			}
			$response->time = exec_time_unit($start_time,'ms');


		return (object)$response;
	}//end import_dedalo_csv_file



	/**
	* VERIFY_CSV_MAP
	* @param array $csv_map
	* @param string $section_tipo
	* @return object $response
	* {
	* 	result : bool
	* 	msg : string
	* }
	*/
	public static function verify_csv_map(array $csv_map, string $section_tipo) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';

		// ar_section_info
			// $ar_section_info = [
			// 	'dd200',
			// 	'dd199',
			// 	'dd197',
			// 	'dd201',
			// 	'dd271',
			// 	'dd1223',
			// 	'dd1224',
			// 	'dd1225'
			// ];
			$ar_section_info = RecordObj_dd::get_ar_children(DEDALO_SECTION_INFO_SECTION_GROUP);

		// ar_component_tipo
			$ar_possible_component_tipo = section::get_ar_children_tipo_by_model_name_in_section(
				$section_tipo, // section_tipo
				['component_'], // ar_model_name
				true, // from_cache
				true, // resolve_virtual
				true, // recursive
				false // search_exact
			);

		// check if the csv_map has any "map_to" it's necessary to create any component to mach with the csv columns.
			$map_to		= array_column($csv_map, 'map_to');
			$non_empty	= array_filter($map_to);
			if(empty($non_empty)) {
				return $response;
			}

		// csv_map iterate
			foreach ($csv_map as $column_map) {

				// if the column don't has the checked property or the checked is false or the map_to property is missing the column will not processed
				// this situation is not a error and go ahead with the other columns
				if(!isset($column_map->checked) || $column_map->checked ===false || empty($column_map->map_to) ){
					continue;
				}

				// sample item (from ar_columns_map)
					// {
					// 	"tipo": "dd199",
					// 	"label": "Creation date",
					// 	"model": "component_date",
					// 	"checked": true,
					// 	"map_to": "dd199"
					// }

				$component_tipo = $column_map->map_to;

				// custom tipos
					if(	   $component_tipo==='section_id'
						|| $component_tipo==='created_by_user'
						|| $component_tipo==='created_date'
						|| $component_tipo==='modified_by_user'
						|| $component_tipo==='modified_date'
						|| in_array($component_tipo, $ar_section_info)
					) continue;

				// error case (ar_possible_component_tipo)
					if (!in_array($component_tipo, $ar_possible_component_tipo)) {

						$model_name = RecordObj_dd::get_model_name_by_tipo($component_tipo, true);

						$response->result	= false;
						$response->msg		= "Sorry, component tipo: $component_tipo (model: $model_name) not found in section: $section_tipo";
						debug_log(__METHOD__
							. " $response->msg " . PHP_EOL
							. ' component_tipo: ' .$component_tipo
							, logger::ERROR
						);
						return $response;
					}
			}

		// response
			$response->result	= true;
			$response->msg		= 'OK. Request done successfully';


		return $response;
	}//end verify_csv_map



	/**
	* BUILD_USER_LOCATOR
	* @param string $value
	* @param string $from_component_tipo
	* Create a safe locator from CSV value.
	* Value can be a int like 2 or an complete locator like {"type": "dd151","section_id": "2","section_tipo": "dd128","from_component_tipo": "dd197"}
	* @return object|null $locator
	*/
		// public static function build_user_locator(string $value, string $from_component_tipo) : ?object {

		// 	$value = trim($value);

		// 	// no value case
		// 		if (empty($value)) {
		// 			return null;
		// 		}

		// 	// try to JSON decode (null on not decode)
		// 	$value_json = json_handler::decode($value);
		// 	if (!$value_json) {

		// 		// old format (section_id)
		// 		// is int. Builds complete locator and set section_id from value
		// 		$locator = new locator();
		// 			$locator->set_type(DEDALO_RELATION_TYPE_LINK);
		// 			$locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
		// 			$locator->set_from_component_tipo($from_component_tipo);
		// 			$locator->set_section_id($value);
		// 	}else{

		// 		// locator or array of locators is received
		// 			$locator_base = is_array($value_json)
		// 				? reset($value_json)
		// 				: $value_json;

		// 		// is full locator. Inject safe fixed properties to avoid errors
		// 			$locator = new locator($locator_base);
		// 				if (!property_exists($locator_base, 'type')) {
		// 					$locator->set_type(DEDALO_RELATION_TYPE_LINK);
		// 				}
		// 				if (!property_exists($locator_base, 'section_tipo')) {
		// 					$locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
		// 				}
		// 				if (!property_exists($locator_base, 'from_component_tipo')) {
		// 					$locator->set_from_component_tipo($from_component_tipo);
		// 				}
		// 	}

		// 	// fail case
		// 		if (!isset($locator) || !isset($locator->section_id)) {
		// 			debug_log(__METHOD__
		// 				. " Error on get user locator value" .PHP_EOL
		// 				. ' value: ' . json_encode($value, JSON_PRETTY_PRINT)
		// 				, logger::ERROR
		// 			);
		// 			return null;
		// 		}

		// 	return $locator;
		// }//end build_user_locator


	/**
	* BUILD_AR_LOCATORS
	* @param string $value
	* @param string $from_component_tipo
	* Create a safe locator from CSV value.
	* Value can be a int like 2 or an complete locator like {"type": "dd151","section_id": "2","section_tipo": "dd128","from_component_tipo": "dd197"}
	* @return array|null $locator
	*/
		// public static function build_ar_locators(object $options) : ?array {

		// 	// options
		// 		$type			= $options->type;
		// 		$column_name	= $options->column_name;
		// 		$section_tipo	= $options->section_tipo;
		// 		$value			= $options->value;

		// 	// no value case
		// 		if (empty($value)) {
		// 			return null;
		// 		}

		// 	// return value
		// 		$ar_locators = [];

		// 	// column name could be only the tipo as "rsc85" or a identifier as "rsc85_rsc197"
		// 	// the component tipo are always the first tipo in the column name
		// 	$ar_tipos				= explode(locator::DELIMITER, $column_name);
		// 	$from_component_tipo	= $ar_tipos[0];
		// 	$target_section_tipo	= $ar_tipos[1] ?? null;

		// 	// check if the value is not a valid json or if it's a int,
		// 	// cases: 1 || 4,5
		// 	// 1 is an int and 4,5 is string
		// 	// but not the locator [{"section_tipo":"oh1","section_id":"1"}] it's valid json
		// 	if (is_string($value) || is_int($value)) {

		// 		// $target_section_tipo
		// 			if( empty($target_section_tipo)) {
		// 				$model_name	= RecordObj_dd::get_model_name_by_tipo($from_component_tipo);
		// 				$component	= component_common::get_instance(
		// 					$model_name, // string model
		// 					$from_component_tipo, // string tipo
		// 					null, // string section_id
		// 					'list', // string modo
		// 					DEDALO_DATA_LANG, // string lang
		// 					$section_tipo // string section_tipo
		// 				);

		// 				$ar_target_section_tipo = $component->get_ar_target_section_tipo();

		// 				if(count($ar_target_section_tipo)>1){
		// 					debug_log(__METHOD__
		// 						." Trying to import multiple section_tipo without clear target" .PHP_EOL
		// 						.' ar_target_section_tipo: ' . json_encode($ar_target_section_tipo, JSON_PRETTY_PRINT)
		// 						, logger::ERROR
		// 					);
		// 					return null;
		// 				}
		// 				$target_section_tipo = reset($ar_target_section_tipo);
		// 			}

		// 		$ar_values	= explode(',', $value);
		// 		foreach ($ar_values as $section_id) {
		// 			// old format (section_id)
		// 			// is int. Builds complete locator and set section_id from value
		// 			$locator = new locator();
		// 				$locator->set_type($type);
		// 				$locator->set_section_tipo($target_section_tipo);
		// 				$locator->set_from_component_tipo($from_component_tipo);
		// 				$locator->set_section_id(trim($section_id));

		// 			$ar_locators[] = $locator;
		// 		}
		// 	}else{

		// 		// Locator case
		// 		foreach ((array)$value as $current_locator) {

		// 		// is full locator. Inject safe fixed properties to avoid errors
		// 			$locator = new locator($current_locator);
		// 				if (!property_exists($current_locator, 'type')) {
		// 					$locator->set_type($type);
		// 				}
		// 				if (!property_exists($current_locator, 'from_component_tipo')) {
		// 					$locator->set_from_component_tipo($from_component_tipo);
		// 				}

		// 			$ar_locators[] = $locator;
		// 		}
		// 	}

		// 	return $ar_locators;
		// }//end build_ar_locators



	/**
	* BUILD_DATE_FROM_VALUE
	* @param string $value
	* @return object|null $date
	*/
		// public static function build_date_from_value(string $value) : ?object {

		// 	$value = trim($value);

		// 	// empty case
		// 		if (empty($value)) {
		// 			return null;
		// 		}

		// 	if ( strpos($value, '{')===0 || strpos($value, '[')===0 ) {
		// 		// is full date. Check object to avoid errors

		// 		# Format
		// 		# {
		// 		#   "start": {
		// 		#     "day": 24,
		// 		#     "hour": 12,
		// 		#     "time": 64891630498,
		// 		#     "year": 2018,
		// 		#     "month": 12,
		// 		#     "minute": 54,
		// 		#     "second": 58
		// 		#   }
		// 		# }
		// 		if ($value_obj = json_decode($value)) {

		// 			// normalize array and object values as single object always
		// 				$value_obj = is_array($value_obj) ? reset($value_obj) : $value_obj;

		// 			// remove lang
		// 				if (isset($value_obj->{DEDALO_DATA_NOLAN})) {
		// 					$value_obj = is_array($value_obj->{DEDALO_DATA_NOLAN})
		// 						? reset($value_obj->{DEDALO_DATA_NOLAN})
		// 						: $value_obj->{DEDALO_DATA_NOLAN};
		// 				}

		// 			// Add start property if not present
		// 				if (!isset($value_obj->start)) {

		// 					$new_value_obj = new stdClass();
		// 						$new_value_obj->start = $value_obj;

		// 					$value_obj = $new_value_obj; // replace here
		// 					debug_log(__METHOD__
		// 						." Warning. Added property start to data value " . PHP_EOL
		// 						.' value: ' . to_string($value)
		// 						, logger::ERROR
		// 					);
		// 				}

		// 			// Check object mandatory properties
		// 				$ar_properties = ['year','month','day']; // ,'hour','minute','second'
		// 				foreach ($ar_properties as $name) {
		// 					if (!isset($value_obj->start->{$name})) {
		// 						debug_log(__METHOD__
		// 							." Error. ignored invalid date value (property '$name' not found)" . PHP_EOL
		// 							.' value: ' .to_string($value)
		// 							, logger::ERROR
		// 						);
		// 						return null;
		// 					}
		// 				}

		// 			// time property is recalculated always for security
		// 				$dd_date	= new dd_date($value_obj->start);
		// 				$time		= dd_date::convert_date_to_seconds($dd_date);
		// 				$value_obj->start->time = $time;

		// 			// date in timestamp format
		// 				$timestamp = $dd_date->get_dd_timestamp();

		// 			// result
		// 				$result = (object)[
		// 					'component_dato'	=> $value_obj,
		// 					'timestamp'			=> $timestamp
		// 				];
		// 		}else{
		// 			return null;
		// 		}

		// 	}else{
		// 		// is date timestamp. Builds complete date object from value

		// 		$dd_date = dd_date::get_dd_date_from_timestamp( $value );

		// 		$value_obj = new stdClass();
		// 			$value_obj->start = $dd_date;

		// 		// result
		// 			$result = (object)[
		// 				'component_dato'	=> $value_obj,
		// 				'timestamp'			=> $value
		// 			];
		// 	}


		// 	return (object)$result;
		// }//end build_date_from_value



	/**
	* GET_SECTION_COMPONENTS_LIST
	* @param string $value
	* @return object $response
	*/
	public static function get_section_components_list(object $options) : object {

		// options
			$section_tipo = $options->section_tipo;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';

		try {

			// model safe
				$model = RecordObj_dd::get_model_name_by_tipo($section_tipo, true);
				if ($model!=='section') {
					$response->msg .= ' Invalid model (expected section): '.$model;
					return $response;
				}

			// components_list
				$components_list = section::get_ar_children_tipo_by_model_name_in_section(
					$section_tipo, // section_tipo
					['component'], // ar_model_name_required
					true, // from_cache
					true, // resolve_virtual
					true, // recursive
					false, // search_exact
					false // ar_tipo_exclude_elements (on false, look for 'exclude_elements' model in virtaul section and apply)
				);

			if (!empty($components_list)) {

				// section info components
				$section_info_components = RecordObj_dd::get_ar_children(DEDALO_SECTION_INFO_SECTION_GROUP);
				foreach ($section_info_components as $tipo) {
					$components_list[] = $tipo;
				}

				$result = [];
				foreach ($components_list as $tipo) {
					$result[] = (object)[
						'label'	=> RecordObj_dd::get_termino_by_tipo($tipo, DEDALO_APPLICATION_LANG, true),
						'value'	=> $tipo,
						'model'	=> RecordObj_dd::get_model_name_by_tipo($tipo, true)
					];
				}

				$response->result	= $result;
				$response->label	= RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_APPLICATION_LANG, true);
				$response->msg		= 'OK. Request done';
			}

		} catch (Exception $e) {
			$response->msg .= ' ' . $e->getMessage();
			debug_log(__METHOD__
				. " $response->msg "
				, logger::ERROR
			);
		}


		return $response;
	}//end get_section_components_list



	/**
	* PROCESS_UPLOADED_FILE
	* Simply moves previously uploaded temp file to the definitive location and name
	* It's called from tool_import_dedalo after event 'upload_file_' + id is published
	* from 'tool_import_dedalo_csv.js' file
	* @param object $options
	* 	Object $options->file_data
	* Sample:
	* {
	*	error: 0
	*	extension: "csv"
	*	name: "name-rsc197.csv"
	*	size: 184922784
	*	tmp_name: "/hd/media/upload/service_upload/tmp/csv/phpPJQvCp"
	*	type: "text/csv"
	* }
	* @return object $response
	*/
	public static function process_uploaded_file(object $options) : object {
		$start_time=start_time();

		// response
			$response = new stdClass();
				$response->result 	= false;
				$response->msg 		= 'Error. Request failed. '.__METHOD__.' ';

		// options
			$file_data = $options->file_data;

		// file_data sample
			// {
			// 	"name": "name-rsc197.csv",
			// 	"type": "text/csv",
			// 	"tmp_dir": "DEDALO_UPLOAD_TMP_DIR",
			// 	"key_dir": "tool_upload",
			// 	"tmp_name": "phpJIQq4e",
			// 	"error": 0,
			// 	"size": 22131522,
			// 	"extension": "csv"
			// }

		// short vars
			$name		= $file_data->name; // string original file name like 'name-rsc197.csv'
			$key_dir	= $file_data->key_dir; // string upload caller name like 'tool_upload'
			$tmp_name	= $file_data->tmp_name; // string like 'phpJIQq4e'

			$user_id = logged_user_id();
			$tmp_dir = DEDALO_UPLOAD_TMP_DIR . '/'. $user_id . '/' . $key_dir;

			$source_file = $tmp_dir . '/' . $tmp_name;

		// check source file file
			if (!file_exists($source_file)) {
				$response->msg .= ' Source file not found: ' . basename($source_file);
				debug_log(__METHOD__
					. " $response->msg " .PHP_EOL
					. ' source_file: ' .$source_file
					, logger::ERROR
				);
				return $response;
			}

		// target_file
			$dir			= tool_import_dedalo_csv::get_files_path();
			$target_file	= $dir . '/' . $name;

		// check target directory
			$dir = tool_import_dedalo_csv::get_files_path();
			if (!is_dir($dir)) {
				if(!mkdir($dir, 0775,true)) {
					$response->msg .= " Error on read or create default directory. Permission denied ";
					debug_log(__METHOD__
						. " $response->msg "
						, logger::ERROR
					);
					return $response;
				}
				// success
				debug_log(__METHOD__
					." CREATED DIR: $dir "
					, logger::DEBUG
				);
			}

		// move file
			$moved = rename($source_file, $target_file);
			if ($moved!==true) {
				debug_log(__METHOD__
					. ' Error on move source file to target_dir' . PHP_EOL
					. ' source_file: ' . $source_file . PHP_EOL
					. ' target_file: ' . $target_file
					, logger::ERROR
				);
				$response->msg .= ' Error on move source file to target_dir';
				return $response;
			}

		// response OK
			$response->result		= true;
			$response->file_name	= $name;
			$response->msg			= 'OK. Request done successfully';

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				$response->debug = $debug;
			}


		return $response;
	}//end process_uploaded_file



}//end class tool_import_dedalo_csv
