<?php
/**
* CLASS TOOL_IMPORT_FILES
*
*
*/
class tool_import_files extends tool_common {



	/**
	* GET_FILE_DATA
	* Extract the information about given file using regex to get the file name patterns
	* @param string $dir
	* 	Directory absolute path where file is located
	* @param string $file
	* 	Full file name like 'my_photo.today.tif'
	*
	* @return array $ar_data
	* 	Associative array with all extracted data
	*/
	public static function get_file_data(string $dir, string $file) : array {	// , $regex="/(\d*)[-|_]?(\d*)_?(\w{0,}\b.*)\.([a-zA-Z]{3,4})\z/"

		$ar_data = array();

		$file_name	= pathinfo($file,PATHINFO_FILENAME);
		$extension	= pathinfo($file,PATHINFO_EXTENSION);

		// ar_data values
			$ar_data['dir_path']		= $dir;					# /Users/dedalo/media/media_mupreva/image/temp/files/user_1/
			$ar_data['file_path']		= $dir.'/'.$file;		# /Users/dedalo/media/media_mupreva/image/temp/files/user_1/45001-1.jpg
			$ar_data['file_name']		= $file_name;			# 04582_01_EsCuieram_Terracota_AD_ORIG
			$ar_data['file_name_full']	= $file;				# $ar_value[0]; # 04582_01_EsCuieram_Terracota_AD_ORIG.JPG
			$ar_data['extension']		= $extension;			# JPG (we respect upper/lower case)
			$ar_data['file_size']		= number_format(filesize($ar_data['file_path'])/1024/1024,3)." MB"; # 1.7 MB

		// des
			// $ar_data['image']['image_url']			= DEDALO_ROOT_WEB . "/inc/img.php?s=".$ar_data['file_path'];
			// $ar_data['image']['image_preview_url']	= DEDALO_LIB_BASE_URL . '/tools/tool_import_files/foto_preview.php?f='.$ar_data['file_path'];


		// Regex file info ^(.+)(-([a-zA-Z]{1}))\.([a-zA-Z]{3,4})$
			// Format result preg_match '1-2-A.jpg' and 'cat-2-A.jpg'
			// 0	=>	1-2-A.jpg 	: cat-2-A.jpg 	# full_name
			// 1	=>	1-2-A 		: cat-2-A 		# name
			// 2	=>	1 			: cat 			# base_name (name without order and letter)
			// 3	=>	1 			: 				# section_id (empty when not numeric)
			// 4	=>				: cat 			# base_string_name (empty when numeric)
			// 5	=>	-2 			: -2 			# not used
			// 6	=>	2 			: 2 			# portal_order
			// 7	=>	-A 			: -A 			# not used
			// 8	=>	A 			: A 			# target map (A,B,C..)
			// 9	=>	jpg 		: jpg 			# extension
		// regex values
			preg_match("/^((([\d]+)|([^-]+))([-](\d))?([-]([a-zA-Z]))?)\.([a-zA-Z]{3,4})$/", $file, $ar_match);
			$regex_data = new stdClass();
				$regex_data->full_name		= $ar_match[0] ?? null;
				$regex_data->name			= $ar_match[1] ?? null;
				$regex_data->base_name		= $ar_match[2] ?? null;
				$regex_data->section_id		= $ar_match[3] ?? null;
				$regex_data->portal_order	= $ar_match[6] ?? null;
				$regex_data->letter			= $ar_match[8] ?? null;
				$regex_data->extension		= $ar_match[9] ?? null;
			$ar_data['regex'] = $regex_data;


		return $ar_data;
	}//end get_file_data



	/**
	* SET_MEDIA_FILE
	* Insert in target section, current uploaded file
	* @param object $add_file_options
	* @param string tipo $target_section_tipo
	* @param int section_id $current_section_id
	* @param string tipo $target_component
	* @return bool
	*/
	public static function set_media_file(
		object $add_file_options,
		string $target_section_tipo,
		int $current_section_id,
		string $target_component_tipo
		) : bool {

		$model = RecordObj_dd::get_modelo_name_by_tipo($target_component_tipo, true);
		switch ($model) {
			case 'component_image':

				// custom_target_quality
					$custom_target_quality = $add_file_options->quality ?? DEDALO_IMAGE_QUALITY_ORIGINAL;

				// logger activity. Note that this log is here because generic service_upload
				// is not capable to know if the uploaded file is the last one in a chunked file scenario
					// safe_file_data. Prevent single quotes problems like file names as L'osuna.jpg
					$file_data_encoded	= json_encode($add_file_options, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
					$safe_file_data		= pg_escape_string(DBi::_getConnection(), $file_data_encoded);
					logger::$obj['activity']->log_message(
						'UPLOAD COMPLETE',
						logger::INFO,
						$target_component_tipo,
						NULL,
						[
							'msg'			=> 'Upload file complete. Processing uploaded file',
							'file_data'		=> $safe_file_data
							// 'file_name'	=> $file_data->name,
							// 'file_size'	=> format_size_units($file_data->size),
							// 'time_sec'	=> $file_data->time_sec,
							// 'f_error'	=> $file_data->error || null
						]
					);

				// component_image
					$component = component_common::get_instance(
						$model,
						$target_component_tipo,
						$current_section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$target_section_tipo
					);

				// fix current component target quality (defines the destination directory for the file, like 'original')
					$component->set_quality($custom_target_quality);

				// add file
					$add_file = $component->add_file($add_file_options);
					if ($add_file->result===false) {
						// $response->msg .= $add_file->msg;
						// return $response;

						// CLI process data
						if ( running_in_cli()===true ) {
							common::$pdata->errors[] = $add_file->msg;
							// send to output
							print_cli(common::$pdata);
						}
						return false;
					}

				// post processing file (add_file returns final renamed file with path info)
					$process_file = $component->process_uploaded_file($add_file->ready);
					if ($process_file->result===false) {
						// $response->msg .= 'Errors occurred when processing file: '.$process_file->msg;
						// return $response;

						// CLI process data
						if ( running_in_cli()===true ) {
							common::$pdata->errors[] = $process_file->msg;
							// send to output
							print_cli(common::$pdata);
						}
						return false;
					}

				// Delete the thumbnail copy
					$user_id		= logged_user_id();
					$source_path	= DEDALO_UPLOAD_TMP_DIR . '/'. $user_id . '/' . $add_file_options->key_dir;

					$thumbnail_name			= pathinfo($add_file_options->name, PATHINFO_FILENAME);
					$original_file_thumb	= $source_path .'/thumbnail/'. $thumbnail_name. '.jpg';

					if (file_exists($original_file_thumb)) {
						if(!unlink($original_file_thumb)){
							debug_log(__METHOD__
								." Thumb Delete ERROR of: ".to_string($original_file_thumb)
								, logger::ERROR
							);
							return false;
						}
					}
				break;

			default:
				debug_log(__METHOD__." Error. Media type not allowed ".to_string(), logger::ERROR);
				break;
		}


		return true;
	}//end set_media_file



	/**
	* GET_MEDIA_FILE_DATE
	*
	* @param array $media_file
	* 	Assoc array with file info like file_path
	* @return object|null dd_date $dd_date
	*/
	public static function get_media_file_date(array $media_file, string $model) : ?object {

		$dd_date			= null;
		$source_full_path	= $media_file['file_path'];

		switch ($model) {
			case 'component_image':
				$dd_date = ImageMagick::get_date_time_original($source_full_path);
				break;

			default:
				debug_log(__METHOD__
					. " Error. get_media_file_date . Model is not defined ". PHP_EOL
					. ' source_full_path: ' . $source_full_path .PHP_EOL
					. ' model: ' .$model
					, logger::ERROR
				);
				// CLI process data
					if ( running_in_cli()===true ) {
						common::$pdata->errors[] = 'Error. get_media_file_date . Model is not defined';
						// send to output
						print_cli(common::$pdata);
					}
				break;
		}//end switch ($model)


		return $dd_date;
	}//end get_media_file_date



	/**
	* FILE_PROCESSOR
	* @param $options
	* @return object $response
	*/
	public static function file_processor(object $options) : object {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		// options
			$file_processor				=  $options->file_processor ?? null;
			$file_processor_properties	=  $options->file_processor_properties ?? null;
			$file_name					=  $options->file_name ?? null;
			$file_path					=  $options->file_path ?? null;
			$section_tipo				=  $options->section_tipo ?? null;
			$section_id					=  $options->section_id ?? null;
			$target_section_tipo		=  $options->target_section_tipo ?? null;
			$tool_config				=  $options->tool_config ?? null;

		# FILE_PROCESSOR
		# Global var button properties JSON data array
		# Optional additional file script processor defined in button import properties
		# Note that var $file_processor_properties is the button properties JSON data, NOT current element processor selection

		# Iterate each processor
		foreach ((array)$file_processor_properties as $file_processor_obj) {

			if ($file_processor_obj->function_name!==$file_processor) {
				continue;
			}

			$script_file = str_replace(['DEDALO_EXTRAS_PATH'], [DEDALO_EXTRAS_PATH], $file_processor_obj->script_file);
			if(include_once($script_file)) {

				$function_name 	  = $file_processor_obj->function_name;
				if (is_callable($function_name)) {
					$custom_arguments = (array)$file_processor_obj->custom_arguments;
					$standard_options = [
						'file_name'				=> $file_name,
						'file_path'				=> $file_path,
						'section_tipo'			=> $section_tipo,
						'section_id'			=> $section_id,
						'target_section_tipo'	=> $target_section_tipo,
						'tool_config'			=> $tool_config
					];
					$result = call_user_func($function_name, $standard_options, $custom_arguments);
				}else{
					debug_log(__METHOD__
						." Error on call file processor function: " . PHP_EOL
						.' function_name: ' . to_string($function_name)
						, logger::ERROR
					);

					// CLI process data
						if ( running_in_cli()===true ) {
							common::$pdata->errors[] = 'Error on call file processor function';
							print_cli(common::$pdata);
						}
				}
			}else{
				debug_log(__METHOD__
					." Error on include file processor file script_file: " . PHP_EOL
					.' script_file: ' .to_string($script_file)
					, logger::ERROR
				);
				// CLI process data
					if ( running_in_cli()===true ) {
						common::$pdata->errors[] = 'Error on include file processor file script_file';
						print_cli(common::$pdata);
					}
			}

			debug_log(__METHOD__
				." Processed file function_name $function_name with script $script_file"
				, logger::DEBUG
			);
		}//end foreach ((array)$options->file_processor_properties as $key => $file_processor_obj)


		$response->result	= true;
		$response->msg		= 'OK. Request done';


		return (object)$response;
	}//end file_processor



	/**
	* IMPORT_FILES
	* Process previously uploaded images
	* @param object $options
	* @return object $response
	*/
	public static function import_files(object $options) : object {
		$start_time=start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			// tipo. string component tipo like 'oh17'
			$tipo						= $options->tipo ?? null;
			// section_tipo. string current section tipo like 'oh1'
			$section_tipo				= $options->section_tipo ?? null;
			// section_id. int current section id like '5'
			$section_id					= $options->section_id ?? null;
			// tool_config. object like: '{"ddo_map":[{"role":"target_component","tipo":"rsc29","section_id":"self","section_tipo":"rsc170","model":"component_image","label":"Image"}],"import_file_name_mode":null}'
			$tool_config				= $options->tool_config ?? null;
			// files data. array of objects like: '[{"name":"_290000_rsc29_rsc170_290437.jpg","previewTemplate":{},"previewElement":{},"size":734061,"component_option":""}]'
			$files_data					= $options->files_data ?? null;
			// components_temp_data. array of objects like: '[{"section_id":"tmp","section_tipo":"rsc170","tipo":"rsc23","lang":"lg-eng","from_component_tipo":"rsc23","value":[],"parent_tipo":"rsc23","parent_section_id":"tmp","fallback_value":[null],"debug":{"exec_time":"0.740 ms"},"debug_model":"component_input_text","debug_label":"Title","debug_mode":"edit"}]'
			$components_temp_data		= $options->components_temp_data ?? null;
			// key_dir. string like: 'oh17_oh1' (contraction section_tipo + component tipo)
			$key_dir					= $options->key_dir ?? null;
			// custom_target_quality. Optional media quality to store uploaded files
			$custom_target_quality		= $options->custom_target_quality ?? null;

		// check files data
			if (empty($files_data)) {
				$response->msg = 'Error. Empty files_data';
				return $response;
			}

		// import_mode
			$import_mode			= $tool_config->import_mode ?? 'default';
			$import_file_name_mode	= $tool_config->import_file_name_mode ?? null;

		// ddo_map
			$ar_ddo_map = $tool_config->ddo_map;

		// target component info
			$target_ddo_component = array_find($ar_ddo_map, function($item){
				return $item->role==='target_component';
			});
			$target_component_tipo	= $target_ddo_component->tipo;
			$target_component_model	= RecordObj_dd::get_modelo_name_by_tipo($target_component_tipo, true);

		// file_processor_properties
			$file_processor_properties = $tool_config->file_processor ?? null;

		// init vars
			$ar_msg							= [];	// messages for response info
			$imput_components_section_tipo	= [];	// all different used section tipo in section_temp
			$total_processed				= 0;
			$total							= count($files_data);	// n of files
			$counter						= 0;

		// CLI process data
			if ( running_in_cli()===true ) {
				common::$pdata = new stdClass(); // init $pdata object
					common::$pdata->msg			= (label::get_label('processing') ?? 'Processing');
					common::$pdata->counter		= $counter;
					common::$pdata->total		= $total;
					common::$pdata->total_ms	= exec_time_unit($start_time);
					common::$pdata->errors		= [];
				// send to output
				print_cli(common::$pdata);
			}

		// ar_data. All files collected from files upload form
			$ar_processed	= [];
			// $tmp_dir		= TOOL_IMPORT_FILES_UPLOAD_DIR;
			$user_id = logged_user_id();
			$tmp_dir = DEDALO_UPLOAD_TMP_DIR . '/'. $user_id . '/' . $key_dir;

			foreach ((array)$files_data as $value_obj) {

				$start_time2=start_time();
				$counter++;

				$current_file_name				= rawurldecode($value_obj->name); // Note that name is JS encodeURI from browser
				$current_file_processor			= $value_obj->file_processor ?? null; // Note that var $current_file_processor is only the current element processor selection
				$current_component_option_tipo	= $value_obj->component_option ?? null;

				// CLI process data
					if ( running_in_cli()===true ) {
						common::$pdata->counter	= $counter;
						common::$pdata->file	= $current_file_name;
						// send to output
						print_cli(common::$pdata);
					}

				// Check file exists
					$file_full_path = $tmp_dir .'/'. $current_file_name;
					if (!file_exists($file_full_path)) {
						$msg = "File ignored (not found) $current_file_name";
						$ar_msg[] = $msg;
						debug_log(__METHOD__
							." $msg ". PHP_EOL
							.' file_full_path: ' .$file_full_path
							, logger::ERROR
						);
						common::$pdata->errors[] = $msg;
						continue; // Skip file
					}
				// Check proper mode config
					if ($import_file_name_mode==='enumerate' && $import_mode!=='section') {
						$msg = "Invalid import mode: $import_mode . Ignored action";
						debug_log(__METHOD__
							." $msg "
							, logger::ERROR
						);
						$ar_msg[] = $msg;
						common::$pdata->errors[] = $msg;
						continue; // Skip file
					}

				// file_data
					$file_data = tool_import_files::get_file_data($tmp_dir, $current_file_name);

				// target_ddo
					if ($import_mode==='section') {
						// switch import_file_name_mode
						switch ($import_file_name_mode) {

							case 'enumerate':
								if (!empty($file_data['regex']->section_id)) {
									// Direct numeric case like 1.jpg
									$section = section::get_instance($file_data['regex']->section_id, $section_tipo);
									$section->forced_create_record(); // First record of current section_id force create record. Next files with same section_id, not.
									$_base_section_id = $section->get_section_id();
								}else{
									$section = section::get_instance(null, $section_tipo,'edit',false);
									$section->Save();
									$_base_section_id = $section->get_section_id();
								}
								$section_id = (int)$_base_section_id;
								break;

							case 'named':
								// String case like ánfora.jpg
								// Look already imported files
								$ar_filter_result = array_filter($ar_processed, function($element) use($file_data) {
									return $file_data['regex']->base_name === $element->file_data['regex']->base_name;
								});
								$filter_result = reset($ar_filter_result);
								if (!empty($filter_result->section_id)) {
									# Re-use safe already created section_id (file with same base_name like 'ánforas')
									$_base_section_id = $filter_result->section_id;
								}else{
									$section = section::get_instance(null, $section_tipo,'edit',false);
									$section->Save();
									$_base_section_id = $section->get_section_id();
								}
								$section_id = (int)$_base_section_id;
								break;

							default:
								# IMPORT
								# Create new section
								$section 		= section::get_instance(null, $section_tipo);
								$section->Save();
								$section_id 	= $section->get_section_id();
								break;
						}//end switch ($import_file_name_mode)
						// set target_ddo from tool_config ddo_map
						$target_ddo = array_find($ar_ddo_map, function($item) use($current_component_option_tipo){
							return $item->role === 'component_option' && $item->tipo===$current_component_option_tipo;
						});
					}else{
						// target ddo will be the caller portal, used when the tool is loaded by specific portal and all files will be stored inside these portal
						$target_ddo = new dd_object();
							$target_ddo->set_tipo($tipo);
							$target_ddo->set_section_tipo($section_tipo);
							$target_ddo->set_model(RecordObj_dd::get_modelo_name_by_tipo($tipo, true));
					}//end if($import_mode==='section')

				// target_ddo check
					if(empty($target_ddo)){
						debug_log(__METHOD__
							." target_ddo is empty and will be ignored "
							, logger::ERROR
						);
						continue;
					}

				// component portal. Component (expected portal)
					$component_portal = component_common::get_instance(
						$target_ddo->model,
						$target_ddo->tipo,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$target_ddo->section_tipo
					);
					// Portal target_section_tipo
					$target_section_tipo = $target_ddo->target_section_tipo ?? $component_portal->get_ar_target_section_tipo()[0];

				// section. Create a new section for each file from current portal
					$portal_response = (object)$component_portal->add_new_element((object)[
						'target_section_tipo' => $target_section_tipo
					]);
					if ($portal_response->result===false) {
						$response->result 	= false;
						$response->msg 		= "Error on create portal children: ".$portal_response->msg;
						debug_log(__METHOD__." $response->msg ", logger::ERROR);
						return $response;
					}
					// save portal if all is all ok
					$component_portal->Save();

					// Fix new section created as current_section_id
					$target_section_id = $portal_response->section_id;

				// component portal new section order. Order portal record when is $import_file_name_mode=enumerate
					// if ($import_file_name_mode==='enumerate' || $import_file_name_mode==='named' ) {
					// 	$portal_norder = $regex']->portal_order!=='' ? (int)$regex']->portal_order : false;
					// 	if ($portal_norder!==false) {
					// 		$changed_order = $component_portal->set_locator_order( $portal_response->added_locator, $portal_norder );
					// 		if ($changed_order===true) {
					// 			$component_portal->Save();
					// 		}
					// 		debug_log(__METHOD__
					// 			." CHANGED ORDER FOR : ".$regex']->portal_order." ".to_string($regex'])
					// 			, logger::DEBUG
					// 		);
					// 	}
					// }

				// ar_ddo_map iterate. role based actions
					// Create the ddo components with the data to store with the import
					// when the component has a input in the tool propagate temp section_data
					// Update created section with temp section data
					// when the component stored the filename, get the filename and save it
					foreach ($ar_ddo_map as $ddo) {

						if($ddo->role === 'component_option'){
							continue;
						}

						$model					= RecordObj_dd::get_modelo_name_by_tipo($ddo->tipo,true);
						$current_lang			= RecordObj_dd::get_translatable($ddo->tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
						$destination_section_id	= ($ddo->section_tipo===$section_tipo)
							? $section_id
							: $target_section_id;

						$component = component_common::get_instance(
							$model,
							$ddo->tipo,
							$destination_section_id,
							'list',
							$current_lang,
							$ddo->section_tipo
						);

						switch ($ddo->role) {
							case 'target_filename':

								// file_name. Stores the original file name like 'My añorada.foto.jpg' to a component_input_text
									$component->set_dato($current_file_name);
									$component->Save();
								break;

							case 'target_date':

								// media_file_date (using EXIF or similar metadata source into the file)
									$dd_date = tool_import_files::get_media_file_date($file_data, $target_component_model);
									if (!empty($dd_date)) {
										$dato = new stdClass();
											$dato->start = $dd_date;
										$component->set_dato([$dato]);
										$component->Save();
									}
								break;

							case 'input_component':

								// imput_components_section_tipo store
									if(!in_array($ddo->section_tipo, $imput_components_section_tipo)){
										$imput_components_section_tipo[] = $ddo->section_tipo;
									}

								// component_data. Get from request and save
									$component_data = array_find($components_temp_data, function($item) use($ddo){
										return isset($item->tipo) && $item->tipo===$ddo->tipo && $item->section_tipo===$ddo->section_tipo;
									});
									if(!empty($component_data) && !empty($component_data->value)){
										$component->set_dato($component_data->value);
										$component->Save();
									}

								// component_filter. Propagate the project to the media section, that will be the target_section_tipo
									if($model==='component_filter'){
										// get the component_filter of the target_ddo section_tipo
										$ar_children_tipo = section::get_ar_children_tipo_by_model_name_in_section(
											$target_ddo_component->section_tipo,
											[$model],
											true,
											true
										);
										$component_filter_tipo= $ar_children_tipo[0];

										$target_component = component_common::get_instance(
											$model,
											$component_filter_tipo,
											$target_section_id,
											'list',
											$current_lang,
											$target_ddo_component->section_tipo
										);
										$target_component->set_dato($component_data->value);
										$target_component->Save();
									}
								break;

							default:
								// Nothing to do here
								break;
						}//end switch ($ddo->role)
					}//end foreach ($ar_ddo_map as $ddo)

				// file_processor
					// Global var button properties json data array
					// Optional additional file script processor defined in button import properties
					// Note that var $file_processor_properties is the button properties json data, NOT current element processor selection
					if (!empty($current_file_processor) && !empty($file_processor_properties)) {
						$processor_options = new stdClass();
							$processor_options->file_processor				= $current_file_processor;
							$processor_options->file_processor_properties	= $file_processor_properties;
							# Standard arguments
							$processor_options->file_name					= $current_file_name;
							$processor_options->file_path					= $tmp_dir;
							$processor_options->section_tipo				= $section_tipo;
							$processor_options->section_id					= $section_id;
							$processor_options->target_section_tipo			= $target_section_tipo;
							$processor_options->tool_config					= $tool_config;
						$response_file_processor = tool_import_files::file_processor($processor_options);
					}//end if (!empty($file_processor_properties))

				// set_media_file. Move uploaded file to media folder and create default versions
					$add_file_options = new stdClass();
						$add_file_options->name			= $current_file_name; // string original file name like 'IMG_3007.jpg'
						$add_file_options->key_dir		= $key_dir; // string upload caller name like 'oh1_oh1'
						$add_file_options->tmp_dir		= 'DEDALO_UPLOAD_TMP_DIR'; // constant string name like 'DEDALO_UPLOAD_TMP_DIR'
						$add_file_options->tmp_name		= $current_file_name; // string like 'phpJIQq4e'
						$add_file_options->quality		= $custom_target_quality;
						$add_file_options->source_file	= null;
						$add_file_options->size			= $file_data['file_size'];
						$add_file_options->extension	= $file_data['extension'];

					tool_import_files::set_media_file(
						$add_file_options,
						$target_section_tipo,
						$target_section_id,
						$target_component_tipo
					);

				// ar_processed. Add as processed
					$processed_info = new stdClass();
						$processed_info->file_name				= $value_obj->name;
						$processed_info->file_processor			= $value_obj->file_processor ?? null;
						$processed_info->target_component_tipo	= $target_component_tipo;
						$processed_info->section_id				= $section_id;
						$processed_info->file_data				= $file_data;
					$ar_processed[] = $processed_info;

				// CLI process data
					if ( running_in_cli()===true ) {
						common::$pdata->current_time	= exec_time_unit($start_time2, 'ms');
						common::$pdata->total_ms		= common::$pdata->total_ms + common::$pdata->current_time; // cumulative time
						// send to output
						print_cli(common::$pdata);
					}

				$total_processed++;

				debug_log(__METHOD__
					." Imported files and data from $section_tipo - $section_id"
					, logger::WARNING
				);
			}//end foreach ((array)$files_data as $key => $value_obj)

		// Reset the temporary section of the components, for empty the fields.
			foreach ($imput_components_section_tipo as $current_section_tipo) {
				$temp_data_uid = $current_section_tipo .'_'. DEDALO_SECTION_ID_TEMP; // Like 'rsc197_tmp'
				if (isset($_SESSION['dedalo']['section_temp_data'][$temp_data_uid])) {
					unset( $_SESSION['dedalo']['section_temp_data'][$temp_data_uid]);
				}
			}

		// response
			$response->result	= true;
			$response->msg		= ($total_processed<$total || count(common::$pdata->errors)>0)
				? 'Import files done with errors. Imported: '.$total_processed." of " .$total
				: 'Import files done successfully. Imported: '.$total_processed." of " .$total;
			$response->time		= exec_time_unit_auto($start_time);
			$response->memory	= dd_memory_usage();
			$response->errors	= common::$pdata->errors;


		return $response;
	}//end import_files



}//end class tool_import_files
