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
	public static function get_file_data( string $dir, string $file ) : array {

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


		// PREVIOUS
			// it only allow digits in middle of the filename as : 712-2-A.jpg
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

			// previous regex, it only allow digits in middle of the filename as : 712-2-A.jpg
			// preg_match("/^((([\d]+)|([^-]+))([-](\d))?([-]([a-zA-Z]))?)\.([a-zA-Z]{3,4})$/", $file, $ar_match);
			// $regex_data = new stdClass();
			//	$regex_data->full_name		= $ar_match[0] ?? null;
			//	$regex_data->name			= $ar_match[1] ?? null;
			//	$regex_data->base_name		= $ar_match[2] ?? null;
			//	$regex_data->section_id		= $ar_match[3] ?? null;
			//	$regex_data->portal_order	= $ar_match[6] ?? null;
			//	$regex_data->letter			= $ar_match[8] ?? null;
			//	$regex_data->extension		= $ar_match[9] ?? null;

		// Regex
			// the name can identify the section_id to insert the media
			// the name can identify the field to insert the media (usually a portal)
			// the name can has other information about the media
			// separator between concepts is `-`
			// extension could be set with 3 or 4 letters
			// Formats supported:
			// section_id-filename-field.extension		| 73-my image-A.tiff
			// section_id-field.extension 				| 73-A.tiff
			// section_id.extension 					| 73.jpg
			// section_id-filename.extension 			| 73-my image.tif
			// filename-field.extension					| My image-A.tiff
			// filename.extension						| My image.tiff

			// Regex groups
			// group 1 : section_id
			// group 2 : filename
			// group 3 : field
			// group 4 : extension
			//
			// ^(\d*)?-?(?(?=.\.)|(.*?))(?(?=-)-([a-zA-Z])|)\.([a-zA-Z]{3,4})$
			// (\d*)? 					| group 1 | get the section_id it could be present or not
			// -? 						| check - | check if - exists to create the next groups
			// (?(?=.\.)|(.*?)) 		| group 2 | conditional, if the next character is only 1 following by the point go to next group, else capture all until next rule
			// (?(?=-)-([a-zA-Z])|) 	| group 3 | conditional, if the next character is a - get the letter to identify the field, else go next group
			// \.([a-zA-Z]{3,4})		| group 4 | get the extension
			// see an example : https://regex101.com/r/APaAxA/1

			// preg_match result examples
			//
			// | # | 73-my image-A.tiff | 73-A.tiff	| 73.jpg | 73-my image.tif | My image-A.tiff | My image.tiff | comment |
			// |---| ------------------ | --------- | ------ | --------------- | --------------- | ------------- | ------- |
			// | 0 | 73-my image-A.tiff | 73-A.tiff	| 73.jpg | 73-my image.tif | My image-A.tiff | My image.tiff | full_name |
			// | 1 | 73                 | 73        | 73     | 73              |                 |               | section_id (empty when not numeric) |
			// | 2 | my image			|           |        | my image        | My image        | My image      | base_name (name without order and letter) |
			// | 3 | A                  | A         |        |                 | A               |               | target field map (A,B,C..) |
			// | 4 | tiff               | tiff      | jpg    | tif             | tiff            | tiff          | extension |

			preg_match("/^(\d*)?-?(?(?=.\.)|(.*?))(?(?=-)-([a-zA-Z]{1,2})|)\.([a-zA-Z]{3,4})$/", $file, $ar_match);
			$regex_data = new stdClass();
				$regex_data->full_name		= $ar_match[0] ?? null;
				$regex_data->section_id		= $ar_match[1] ?? null;
				$regex_data->base_name		= $ar_match[2] ?? null;
				$regex_data->letter			= $ar_match[3] ?? null;
				$regex_data->extension		= $ar_match[4] ?? null;
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


		// logger activity. Note that this log is here because generic service_upload
		// is not capable to know if the uploaded file is the last one in a chunked file scenario
			// safe_file_data. Prevent single quotes problems like file names as L'osuna.jpg
			$file_data_encoded	= json_encode($add_file_options, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
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
				],
				logged_user_id() // int
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

		// get the quality specified if is not set get the original quality.
			$custom_target_quality = $add_file_options->quality ?? $component->get_original_quality();

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
			$process_file = $component->process_uploaded_file(
				$add_file->ready,
				null
			);
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

		return true;
	}//end set_media_file



	/**
	* GET_MEDIA_FILE_DATE
	* Calculates the media file date
	* @param array $media_file
	* 	Assoc array with file info like file_path
	* @return object|null dd_date $dd_date
	*/
	public static function get_media_file_date( array $media_file, string $model ) : ?object {

		$dd_date			= null;
		$source_full_path	= $media_file['file_path'];

		switch ($model) {
			case 'component_image':
				$dd_date = ImageMagick::get_date_time_original($source_full_path);
				break;

			case 'component_av':
				$dd_date = Ffmpeg::get_date_time_original($source_full_path);
				break;

			case 'component_pdf':
				$command = ImageMagick::get_imagemagick_pdfinfo_path() . ' -rawdates ' . $source_full_path . ' | grep -i CreationDate';

				// exec command
				$result = exec($command.' 2>&1', $output, $worked_result);
				// error case
					if ($worked_result!=0) {
						debug_log(__METHOD__
							. ' exec command bad result' . PHP_EOL
							. ' command:' . to_string($command) . PHP_EOL
							. ' worked_result:' . to_string($worked_result) . PHP_EOL
							. ' result: ' .to_string($result) . PHP_EOL
							. ' output: ' . to_string($output). PHP_EOL
							, logger::WARNING
						);
						if(SHOW_DEBUG===true) {
							$bt = debug_backtrace();
							dump($bt[1], ' bt[1] -- source_full_path: ++ '.to_string($source_full_path));
						}
						if (stripos(to_string($output), 'ERROR:')!==false) {
							break;
						}
					}

				// PDF date format is:
				// D:20110816234339-04'00'
				// all is optional except the first 4 digits that are the year
				$regex = '/(D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(-|\+|Z{1})?(\d{2})?(\'{1})?(\d{2})?(\'{1})?/';
				preg_match($regex, $result, $matches);

				$dd_date		= new dd_date();
				if(isset($matches[2])) $dd_date->set_year((int)$matches[2]);
				if(isset($matches[3])) $dd_date->set_month((int)$matches[3]);
				if(isset($matches[4])) $dd_date->set_day((int)$matches[4]);

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
	public static function file_processor( object $options ) : object {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';
			$response->errors	= [];

		// options
			$file_processor				= $options->file_processor ?? null;
			$file_processor_properties	= $options->file_processor_properties ?? null;
			$file_name					= $options->file_name ?? null;
			$file_path					= $options->file_path ?? null;
			$section_tipo				= $options->section_tipo ?? null;
			$section_id					= $options->section_id ?? null;
			$target_section_tipo		= $options->target_section_tipo ?? null;
			$tool_config				= $options->tool_config ?? null;
			$key_dir					= $options->key_dir ?? null;
			$custom_target_quality		= $options->custom_target_quality ?? null;

		# FILE_PROCESSOR
		# Global var button properties JSON data array
		# Optional additional file script processor defined in button import properties
		# Note that var $file_processor_properties is the button properties JSON data, NOT current element processor selection

		# Iterate each processor
		foreach ((array)$file_processor_properties as $file_processor_obj) {

			if ($file_processor_obj->function_name!==$file_processor) {
				continue;
			}

			$script_file =  dirname(__FILE__).$file_processor_obj->script_file;
			if(include_once($script_file)) {

				$function_name 	  = $file_processor_obj->function_name;
				if (is_callable($function_name)) {
					$custom_arguments = $file_processor_obj->custom_arguments;
					$standard_options = (object)[
						'file_name'				=> $file_name,
						'file_path'				=> $file_path,
						'section_tipo'			=> $section_tipo,
						'section_id'			=> $section_id,
						'target_section_tipo'	=> $target_section_tipo,
						'tool_config'			=> $tool_config,
						'key_dir'				=> $key_dir,
						'custom_target_quality'	=> $custom_target_quality,
						'custom_arguments' 		=> $custom_arguments
					];
					$current_response = call_user_func($function_name, $standard_options);
					if($current_response->result === false){
						$response->result = false;
						$response->errors[] = $current_response->msg;
					}
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


		$response->result	= empty($response->errors);
		$response->msg		= empty($response->errors)
			? 'OK. Request done'
			: 'Errors happened';


		return $response;
	}//end file_processor



	/**
	* IMPORT_FILES
	* Process previously uploaded images
	* @param object $options
	* @return object $response
	*/
	public static function import_files( object $options ) : object {
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
			$ar_ddo_map = $tool_config->ddo_map ?? [];

		// target component info
			$target_ddo_component = array_find($ar_ddo_map, function($item){
				return $item->role==='target_component';
			});
			if (!is_object($target_ddo_component)) {
				$response->msg .= ' Invalid target_component';
				return $response;
			}
			$target_component_tipo	= $target_ddo_component->tipo;
			$target_component_model	= RecordObj_dd::get_modelo_name_by_tipo($target_component_tipo, true);

		// file_processor_properties
			$file_processor_properties = $tool_config->file_processor ?? null;

		// init vars
			$ar_msg							= [];	// messages for response info
			$input_components_section_tipo	= [];	// all different used section tipo in section_temp
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
							// match case
							// used to find the filename in the previous uploaded files.
							// it use the filename to match into image section.
							case 'match_freename':
							case 'match':

								$target_section_tipo = $target_ddo_component->section_tipo;
								$target_filename = array_find($ar_ddo_map, function($item) use ($target_section_tipo){
									return $item->role==='target_filename' && $item->section_tipo === $target_section_tipo;
								});
								// get the id of name of the file and match the id of the caller section
								// then use the match to find the image section and match with the filename
								// it match filenames as 1-1-A.jpg
								if( $import_file_name_mode === 'match' ){

									$match_options = new stdClass();
										$match_options->section_id			= $file_data['regex']->section_id;
										$match_options->section_tipo		= $section_tipo;
										$match_options->full_name			= $current_file_name;
										$match_options->target_section_tipo	= $target_section_tipo;
										$match_options->target_filename		= $target_filename;

									$ar_target_section_id = tool_import_files::get_media_section_match_from_souce( $match_options );

								}
								// get the filename and match directly into the image section
								// the match will be into the original filename field into the image section
								// it match filenames as: 0a90723c2936028b08093d7560a098cb-b.jpg
								else if( $import_file_name_mode === 'match_freename' ){

									$match_options = new stdClass();
										$match_options->target_filename		= $target_filename;
										$match_options->full_name			= $current_file_name;

									$ar_target_section_id = tool_import_files::get_media_section_match( $match_options );
								}

								// in both cases is not possible close the search to 1 record
								// so assume that the file could match in multiple image sections
								foreach ($ar_target_section_id as $target_section_id) {

									$target_filename = $current_file_name;
									// as target section_id could has multiple matches for the same image
									// then copy the image with the section_id and do not touch the original file
									// it will be copied for other sections.
									// last section_id will copy the file without create a copy, it remove the uploaded file.
									if( $target_section_id !== end($ar_target_section_id) ){

										$basename_value		= pathinfo($current_file_name)['filename'];
										$basename_extension	= pathinfo($current_file_name)['extension'];

										$target_filename = $basename_value .'_'. $target_section_id .'.'. $basename_extension;
										$source_file	= $tmp_dir . '/' . $current_file_name;
										$target_file	= $tmp_dir . '/' . $target_filename;
										if (false===copy($source_file, $target_file)) {
											debug_log(__METHOD__
												.' Error coping file: ' . PHP_EOL
												. ' source_file: ' . $source_file . PHP_EOL
												. ' target_file: ' . $target_file
												, logger::ERROR
											);
										}
									}

									// set_media_file. Move uploaded file to media folder and create default versions
										$add_file_options = new stdClass();
											$add_file_options->name			= $target_filename; // string original file name like 'IMG_3007.jpg'
											$add_file_options->key_dir		= $key_dir; // string upload caller name like 'oh1_oh1'
											$add_file_options->tmp_dir		= 'DEDALO_UPLOAD_TMP_DIR'; // constant string name like 'DEDALO_UPLOAD_TMP_DIR'
											$add_file_options->tmp_name		= $target_filename; // string like 'phpJIQq4e'
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

										// component processor
										$compoonet_processor_options = new stdClass();
											$compoonet_processor_options->ar_ddo_map					= $ar_ddo_map;
											$compoonet_processor_options->section_tipo					= $section_tipo;
											$compoonet_processor_options->section_id					= $section_id;
											$compoonet_processor_options->target_section_id				= $target_section_id;
											$compoonet_processor_options->input_components_section_tipo	= $input_components_section_tipo;
											$compoonet_processor_options->target_ddo_component			= $target_ddo_component;
											$compoonet_processor_options->file_data						= $file_data;
											$compoonet_processor_options->current_file_name				= $target_filename;
											$compoonet_processor_options->target_component_model		= $target_component_model;
											$compoonet_processor_options->components_temp_data			= $components_temp_data;

										 tool_import_files::set_components_data($compoonet_processor_options);
								}

								// stop the other processes done by other modes and go to the next image
								// match mode is not compatible with the other process
								// continue 2 skip the switch() and the foreach() of images.
								continue 2;
								breaK;
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
								$file_data['regex']->base_name = empty($file_data['regex']->base_name)
									? $file_data['regex']->section_id
									: $file_data['regex']->base_name;

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

				// component processor
					$compoonet_processor_options = new stdClass();
						$compoonet_processor_options->ar_ddo_map					= $ar_ddo_map;
						$compoonet_processor_options->section_tipo					= $section_tipo;
						$compoonet_processor_options->section_id					= $section_id;
						$compoonet_processor_options->target_section_id				= $target_section_id;
						$compoonet_processor_options->input_components_section_tipo	= $input_components_section_tipo;
						$compoonet_processor_options->target_ddo_component			= $target_ddo_component;
						$compoonet_processor_options->file_data						= $file_data;
						$compoonet_processor_options->current_file_name				= $current_file_name;
						$compoonet_processor_options->target_component_model		= $target_component_model;
						$compoonet_processor_options->components_temp_data			= $components_temp_data;

					 tool_import_files::set_components_data($compoonet_processor_options);

				// file_processor
					// Global var button properties JSON data array
					// Optional additional file script processor defined in button import properties
					// Note that var $file_processor_properties is the button properties JSON data, NOT current element processor selection
					if (!empty($current_file_processor) && !empty($file_processor_properties)) {
						$processor_options = new stdClass();
							$processor_options->file_processor				= $current_file_processor;
							$processor_options->file_processor_properties	= $file_processor_properties;
							// Standard arguments
							$processor_options->file_name				= $current_file_name;
							$processor_options->file_path				= $tmp_dir;
							$processor_options->section_tipo			= $section_tipo;
							$processor_options->section_id				= $section_id;
							$processor_options->target_section_tipo		= $target_section_tipo;
							$processor_options->tool_config				= $tool_config;
							$processor_options->key_dir					= $key_dir;
							$processor_options->custom_target_quality	= $custom_target_quality;
						tool_import_files::file_processor($processor_options);
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
			foreach ($input_components_section_tipo as $current_section_tipo) {
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



	/**
	* GET_MEDIA_SECTION_MATCH_FROM_SOUCE
	* check the filename uploaded with the previous names saved into media sections (image, av, document)
	* 1 get the target section to get all media files into the section_id (as tch11)
	* 2 get all filenames saved into the uploaded filename (as 11-1.tiff)
	* 3 match the filename without the extensions 11-1 === 11-1
	* return all section_id of the image section that filename match.
	* @param  object $options
	* @return array $match_section_id
	*/
	public static function get_media_section_match_from_souce( object $options ) : array {

		$section_id				= $options->section_id;
		$section_tipo			= $options->section_tipo;
		$target_section_tipo	= $options->target_section_tipo;
		$full_name				= $options->full_name;
		$target_filename		= $options->target_filename;

		// target section of the tool as tch, tch1,...
		// as filename could has the section_id as 11-1.tiff (section_id = 11)
		// create the section and give his all data.
		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo // string section_tipo
		);

		$data = $section->get_dato();

		// give all locators that match with the target_section_tipo (as rsc170, image section)
		$target_locators = array_filter($data->relations, function( $item ) use ($target_section_tipo){
			return $item->section_tipo === $target_section_tipo;
		});

		// create the image section and check the filename saved previously.
		$match_section_id = [];
		foreach ($target_locators as $target_locator) {

			$tipo	= $target_filename->tipo;

			$model	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$lang	= RecordObj_dd::get_translatable($tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;

			// component with the previous filename saved
			$target_name_component = component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$target_locator->section_id, // string section_id
				'list', // string mode
				$lang, // string lang
				$target_locator->section_tipo // string section_tipo
			);

			$value = $target_name_component->get_value();

			// check without extension, uploaded files could be different format of the previous upload.
			$basename_value		= pathinfo($value)['filename'];
			$basename_full_name	= pathinfo($full_name)['filename'];

			if($basename_value === $basename_full_name){
				$match_section_id[] = $target_locator->section_id;
			}
		}


		return $match_section_id;
	}//end get_media_section_match_from_souce




	/**
	* GET_MEDIA_SECTION_MATCH
	* uses the name of the uploaded file as: 7ftTgmN-Mn.tiff | 456Mnc.mov
	* remove the extension but use the '.' to close match in the search
	* the sections that match will returned as array of his section_id
	* @param  object $options
	* @return array $match_section_id
	*/
	public static function get_media_section_match( object $options ) : array {

		// short vars
		$target_tipo			= $options->target_filename->tipo; // string tipo
		$target_section_tipo	= $options->target_filename->section_tipo; // string section_tipo
		$full_name 				= $options->full_name;

		// path of the component to be find
		$path = search::get_query_path(
			$target_tipo, // string tipo
			$target_section_tipo, // string section_tipo
			true // bool resolve_related
		);
		// the image has extension, is possible that the image can change the extension
		// the original is a .jpg and modified is a .tiff with alpha channel.
		$basename_full_name	= pathinfo($full_name)['filename'];

		// build the search
			$operator = '$and';
			$filter = new stdClass();
				$filter->{$operator} = [];

			// set the filter with the base name and add '.' to the final,
			// the point is between name and extension
			// adding it could avoid false match with short names
			// as my_image.tiff and my_image2.tiff
			// searching `my_image.` will remove the second case
			$filter_item = new stdClass();
				$filter_item->q = $basename_full_name .'.';
				$filter_item->path = $path;

			$filter->{$operator}[] = $filter_item;

			$sqo = new search_query_object();
				$sqo->set_section_tipo([$target_section_tipo]);
				$sqo->set_limit(0);
				$sqo->set_skip_projects_filter(true);
				$sqo->set_filter($filter);


		// search exec
			$search				= search::get_instance($sqo);
			$records_data		= $search->search();
			$ar_current_dato	= $records_data->ar_records;

		// stored the section_id of the match sections.
		$match_section_id = [];
		foreach ($ar_current_dato as $section_data) {
			$match_section_id[] = $section_data->section_id;
		}

		return $match_section_id;
	}//end get_media_section_match



	/**
	* SET_COMPONENTS_DATA
	* @param object $options
	* @return void
	*/
	public static function set_components_data( object $options ) {

		// options
			$ar_ddo_map						= $options->ar_ddo_map;
			$section_tipo					= $options->section_tipo;
			$section_id						= $options->section_id;
			$target_section_id				= $options->target_section_id;
			$input_components_section_tipo	= $options->input_components_section_tipo;
			$target_ddo_component			= $options->target_ddo_component;
			$file_data						= $options->file_data;
			$current_file_name				= $options->current_file_name;
			$target_component_model			= $options->target_component_model;
			$components_temp_data			= $options->components_temp_data ?? [];

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

					// fill the component with image data only when the field is empty
					// if the ddo of component has ddo->only_basename and is set to true, remove the section_id, field and extension
					$component_data = $component->get_dato();

					if(empty($component_data)){
						// file_name. Stores the original file name like 'My añorada.foto.jpg' to a component_input_text
						$name_to_save = (isset($ddo->only_basename) && $ddo->only_basename === true)
							? $file_data['regex']->base_name // only the name of the file without section_id or field
							: $current_file_name; // full name with extension

						$component->set_dato([$name_to_save]);
						$component->Save();
					}
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

					// input_components_section_tipo store
						if(!in_array($ddo->section_tipo, $input_components_section_tipo)){
							$input_components_section_tipo[] = $ddo->section_tipo;
						}

					// component_data save
						$is_translatable = RecordObj_dd::get_translatable($ddo->tipo);
						if ($is_translatable===false) {

							// use value from request

							// component_data. Get from request and save
							$component_data = array_find($components_temp_data, function($item) use($ddo){
								return isset($item->tipo) && $item->tipo===$ddo->tipo && $item->section_tipo===$ddo->section_tipo;
							});
							if(is_object($component_data) && !empty($component_data->value)){
								$component->set_dato($component_data->value);
								$component->Save();
							}

						}else{

							// get value from instances of the temporal component in each lang

							$temp_component = component_common::get_instance(
								$model,
								$ddo->tipo,
								DEDALO_SECTION_ID_TEMP,
								'list',
								$current_lang,
								$ddo->section_tipo
							);

							$ar_langs		= $temp_component->get_component_ar_langs();
							$original_lang	= $current_lang;
							foreach ($ar_langs as $current_lang) {

								$temp_component->set_lang($current_lang);
								$temp_dato = $temp_component->get_dato();

								if (empty($temp_dato)) {
									continue;
								}

								// apply value
								$component->set_lang($current_lang);
								$component->set_dato($temp_dato);
								$component->Save();
							}
							// restore lang
							$component->set_lang($original_lang);
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
	}//end set_components_data



}//end class tool_import_files
