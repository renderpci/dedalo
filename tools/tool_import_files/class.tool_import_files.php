<?php
/**
* CLASS TOOL_IMPORT_FILES
*
*
*/
class tool_import_files extends tool_common {



	protected $valid_extensions;



	/**
	* __CONSTRUCT
	* @return bool true
	*/
		// public function __construct() {

		// 	return true;
		// }//end __construct



	/**
	* SET_UP
	*/
	public function set_up(string $key_dir=null) : bool {

		# VERIFY USER IS LOGGED
			if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

		// user_id. Currently logged user
			$user_id = navigator::get_user_id();

		// upload_dir_custom
			$upload_dir_custom = isset($key_dir) ? '/'.$key_dir : null;
			if (empty($upload_dir_custom)) {
				trigger_error(__METHOD__." WARNING TOOL_IMPORT_FILES: EMPTY upload_dir_custom");
			}

		// tool import paths
			$base_path = '/upload/import_files/temp/user_' . $user_id . $upload_dir_custom . '/';
			define('TOOL_IMPORT_FILES_UPLOAD_DIR', DEDALO_MEDIA_PATH . $base_path);
			define('TOOL_IMPORT_FILES_UPLOAD_URL', DEDALO_MEDIA_URL  . $base_path);

		// extensions. Fix array of valid extensions
			$this->valid_extensions = array_merge(DEDALO_IMAGE_EXTENSIONS_SUPPORTED, DEDALO_PDF_EXTENSIONS_SUPPORTED);

		// base_folder_path. Target folder exists and create test
			$base_folder_path = DEDALO_MEDIA_PATH  .'/upload/import_files/temp/';
			if( !is_dir($base_folder_path) ) {
				if(!mkdir($base_folder_path, 0775,true)) {
					throw new Exception(" Error on read or create base_folder_path directory. Permission denied ");
				}
			}

		// user_folder_path. Target folder exists and create test
			$user_folder_path = TOOL_IMPORT_FILES_UPLOAD_DIR;
			if( !is_dir($user_folder_path) ) {
				if(!mkdir($user_folder_path, 0775,true)) {
					throw new Exception(" Error on read or create TOOL_IMPORT_FILES_UPLOAD_DIR directory. Permission denied ");
				}
			}

		// thumbnail_user_folder_path. Target folder exists and create test
			$thumbnail_user_folder_path = TOOL_IMPORT_FILES_UPLOAD_DIR.'/thumbnail';
			if( !is_dir($thumbnail_user_folder_path) ) {
				if(!mkdir($thumbnail_user_folder_path, 0775,true)) {
					throw new Exception(" Error on read or create thumbnail_user_folder_path directory. Permission denied ");
				}
			}


		return true;
	}//end set_up



	/**
	* FIND_ALL_FILES
	* Read dir (must be accessible)
	*/
	public function find_all_files(string $dir) : array {

		#$dir = str_replace('//', '/', $dir);

		$ar_data = [];

		try {
			if (!file_exists($dir)) {
				$create_dir = mkdir($dir, 0777,true);
				if(!$create_dir) throw new Exception(" Error on create directory. Permission denied \"$dir\" (1)");
			}
			$root = scandir($dir);
		} catch (Exception $e) {
			//return($e);
		}
		if (!$root) {
			return $ar_data;
		}

		natsort($root);
		foreach($root as $value) {

			# Skip non valid extensions
			$file_parts = pathinfo($value);
			if(empty($file_parts['extension']) || !in_array(strtolower($file_parts['extension']), $this->valid_extensions)) continue;

			# Case file
			if(is_file("$dir/$value")) {

				$ar_data[] = $this->get_file_data($dir, $value);
				continue;
			}
		}

		# SORT ARRAY (By custom core function build_sorter)
		# usort($ar_data, build_sorter('numero_recurso'));

		return $ar_data;
	}//end find_all_files



	/**
	* SET_COMPONENT
	* @return bool
	*/
	public function set_component(object $component_obj) : bool{
		# Fix current component/section
		$this->component_obj = $component_obj;

		return true;
	}//end set_component



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
			$ar_data['file_path']		= $dir.$file;			# /Users/dedalo/media/media_mupreva/image/temp/files/user_1/45001-1.jpg
			$ar_data['file_name']		= $file_name;			# 04582_01_EsCuieram_Terracota_AD_ORIG
			$ar_data['file_name_full']	= $file;				# $ar_value[0]; # 04582_01_EsCuieram_Terracota_AD_ORIG.JPG
			$ar_data['extension']		= $extension;			# JPG (respetamos mayúsculas/minúsculas)
			$ar_data['file_size']		= number_format(filesize($ar_data['file_path'])/1024/1024,3)." MB"; # 1.7 MB

		// des
			// $ar_data['image']['image_url']			= DEDALO_ROOT_WEB . "/inc/img.php?s=".$ar_data['file_path'];
			// $ar_data['image']['image_preview_url']	= DEDALO_LIB_BASE_URL . '/tools/tool_import_files/foto_preview.php?f='.$ar_data['file_path'];


		// Regex file info ^(.+)(-([a-zA-Z]{1}))\.([a-zA-Z]{3,4})$
			// Format result preg_match '1-2-A.jpg' and 'gato-2-A.jpg'
			// 0	=>	1-2-A.jpg 	: gato-2-A.jpg 	# full_name
			// 1	=>	1-2-A 		: gato-2-A 		# name
			// 2	=>	1 			: gato 			# base_name (name without order and letter)
			// 3	=>	1 			: 				# section_id (empty when not numeric)
			// 4	=>				: gato 			# base_string_name (empty when numeric)
			// 5	=>	-2 			: -2 			# not used
			// 6	=>	2 			: 2 			# portal_order
			// 7	=>	-A 			: -A 			# not used
			// 8	=>	A 			: A 			# target map (A,B,C..)
			// 9	=>	jpg 		: jpg 			# extension
		// regex values
			preg_match("/^((([\d]+)|([^-]+))([-](\d))?([-]([a-zA-Z]))?)\.([a-zA-Z]{3,4})$/", $file, $ar_match);
			$regex_data = new stdClass();
				$regex_data->full_name		= $ar_match[0];
				$regex_data->name			= $ar_match[1];
				$regex_data->base_name		= $ar_match[2];
				$regex_data->section_id		= $ar_match[3];
				$regex_data->portal_order	= $ar_match[6];
				$regex_data->letter			= $ar_match[8];
				$regex_data->extension		= $ar_match[9];
			$ar_data['regex'] = $regex_data;


		return $ar_data;
	}//end get_file_data



	/**
	* SET_MEDIA_FILE
	* Insert in target section, current uploaded file
	* @param array $media_file
	* @param string tipo $target_section_tipo
	* @param int section_id $current_section_id
	* @param string tipo $target_component
	* @return (bool)
	*/
	public static function set_media_file($media_file, string $target_section_tipo, int $current_section_id, string $target_component_tipo) : bool {

		$model = RecordObj_dd::get_modelo_name_by_tipo($target_component_tipo, true);

		switch ($model) {
			case 'component_image':

				// component_image (Is auto saved with defaults on create)
					$component = component_common::get_instance(
						$model,
						$target_component_tipo,
						$current_section_id,
						'list',
						DEDALO_DATA_LANG,
						$target_section_tipo
					);
				// get_image_id
					$image_id			= $component->get_image_id();
					$image_path			= $component->get_image_path();
					$additional_path	= $component->get_additional_path();

				// file vars
					# Path of file like '/Users/pepe/Dedalo/media/media_mupreva/image/temp/files/user_1/'
					$source_path		= $media_file['dir_path'];
					# Full path to file located in temporal files uploads like '/Users/pepe/Dedalo/media/media_mupreva/image/temp/files/user_1/1253-2.jpg'
					$source_full_path	= $media_file['file_path'];
					# File current extension like 'jpg'
					$extension			= $media_file['extension'];
					# File name full like '1253-2.jpg'
					$file_name_full		= $media_file['file_name_full'];
					# File name without extension
					$file_name			= $media_file['file_name'];

				// safe paths check
					if (strpos($source_path, '../')!==false ||
						strpos($source_full_path, '../')!==false ||
						strpos($extension, '../')!==false ||
						strpos($file_name_full, '../')!==false ||
						strpos($file_name, '../')!==false
						) {
						throw new Exception("Error Processing Request. Unauthorized path", 1);
						return false;
					}

				// original image desired store
					$original_path		= DEDALO_MEDIA_PATH.DEDALO_IMAGE_FOLDER .'/'. DEDALO_IMAGE_QUALITY_ORIGINAL .''. $additional_path;
					$original_file_path	= $original_path .'/'. $image_id . '.'.strtolower($extension);
					if( !is_dir($original_path) ) {
						if(!mkdir($original_path, 0777,true)) {
							throw new Exception(" Error on read or create directory. Permission denied $original_path");
						}
					}

				// copy the original
					if (!copy($source_full_path, $original_file_path)) {
						throw new Exception("<div class=\"info_line\">ERROR al copiar ".$source_full_path." a ".$original_file_path."</div>");
					}

				// Delete the thumbnail copy
					$original_file_thumb = $source_path .'/thumbnail/'. $file_name_full;
					if(!unlink($original_file_thumb)){
						throw new Exception("Thumb Delete ERROR of: ".$original_file_thumb);
					}

				// extension unify. convert JPG to jpg
					if (strtolower($extension)!=strtolower(DEDALO_IMAGE_EXTENSION)) {
						$original_file_path_jpg = DEDALO_MEDIA_PATH.DEDALO_IMAGE_FOLDER .'/'. DEDALO_IMAGE_QUALITY_ORIGINAL .''. $additional_path .'/'. $image_id .'.'. DEDALO_IMAGE_EXTENSION;
						ImageMagick::convert($original_file_path, $original_file_path_jpg );
					}

				// default quality
					// Generate dedalo default quality version (usually 1.5MB) and thumb image
					// $default_quality_image = DEDALO_MEDIA_PATH.DEDALO_IMAGE_FOLDER .'/'. DEDALO_IMAGE_QUALITY_DEFAULT .'/'. $image_id  .'.'. DEDALO_IMAGE_EXTENSION;
					$source_image	= $original_file_path;
					$source_quality	= DEDALO_IMAGE_QUALITY_ORIGINAL;
					$target_quality	= DEDALO_IMAGE_QUALITY_DEFAULT;

					$component->convert_quality( $source_quality, $target_quality );

					$value = new stdClass();
						$value->original_file_name		= $file_name_full;
						$value->original_upload_date	= component_date::get_date_now();
					$component->set_dato([$value]);
					$component->Save();

				// generate the svg file
					$svg_string_node = $component->create_default_svg_file();

				// remove original image after import
					unlink(	$source_full_path );
				break;

			default:
				trigger_error("Error. Media type not allowed");
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
	public static function get_media_file_date(array $media_file, string $model) {

		$dd_date			= null;
		$source_full_path	= $media_file['file_path'];

		switch ($model) {
			case 'component_image':

				# EXIF try to get date from file metadata
				$DateTimeOriginal=false;
				try {
					$command			= MAGICK_PATH . 'identify -format "%[EXIF:DateTimeOriginal]" ' .'"'.$source_full_path.'"';
					$DateTimeOriginal	= shell_exec($command);
					$regex   = "/^(-?[0-9]+)[-:\/.]?([0-9]+)?[-:\/.]?([0-9]+)? ?([0-9]+)?:?([0-9]+)?:?([0-9]+)?$/";

					if(empty($DateTimeOriginal)){
						$command			= MAGICK_PATH . 'identify -format "%[date:modify]" ' .'"'.$source_full_path.'"';
						$DateTimeOriginal	= shell_exec($command);
						$regex   = "/^(\d{4})[-:\/.]?(\d{2})[-:\/.]?(\d{2})T?(\d{2}):(\d{2}):(\d{2})[.]?(\d+)?[\+]?(\d{2})?[-:\/.]?(\d{2})?/";
					}


				} catch (Exception $e) {
					if(SHOW_DEBUG) {
						error_log("Error on get DateTimeOriginal from image metadata");
					}
				}

				if (!empty($DateTimeOriginal)) {

					$dd_date		= new dd_date();
					$original_dato	= (string)$DateTimeOriginal;

					preg_match($regex, $original_dato, $matches);

					if(isset($matches[1])) $dd_date->set_year((int)$matches[1]);
					if(isset($matches[2])) $dd_date->set_month((int)$matches[2]);
					if(isset($matches[3])) $dd_date->set_day((int)$matches[3]);
					if(isset($matches[4])) $dd_date->set_hour((int)$matches[4]);
					if(isset($matches[5])) $dd_date->set_minute((int)$matches[5]);
					if(isset($matches[6])) $dd_date->set_second((int)$matches[6]);
					if(isset($matches[7])) $dd_date->set_ms((int)$matches[7]);
					// if(isset($matches[8])) $dd_date->set_timezonehh((int)$matches[8]);
					// if(isset($matches[9])) $dd_date->set_timezonemm((int)$matches[9]);
				}
				break;

			default:
				trigger_error("Error. Model is not defined");
				break;
		}

		return $dd_date;
	}//end get_media_file_date



	/**
	* FILE_PROCESSOR
	* @return object $response
	*/
	public static function file_processor(object $request_options) : object {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		$options = new stdClass();
			$options->file_processor			= null;
			$options->file_processor_properties	= null;
			$options->file_name					= null;
			$options->file_path					= null;
			$options->section_tipo				= null;
			$options->section_id				= null;
			$options->target_section_tipo		= null;
			$options->tool_config				= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		# FILE_PROCESSOR
		# Global var button properties JSON data array
		# Optional additional file script processor defined in button import properties
		# Note that var $file_processor_properties is the button properties JSON data, NOT current element processor selection

		# Iterate each processor
		foreach ((array)$options->file_processor_properties as $key => $file_processor_obj) {

			if ($file_processor_obj->function_name!==$options->file_processor) {
				continue;
			}

			$script_file = str_replace(['DEDALO_EXTRAS_PATH'], [DEDALO_EXTRAS_PATH], $file_processor_obj->script_file);
			if(include_once($script_file)) {

				$function_name 	  = $file_processor_obj->function_name;
				if (is_callable($function_name)) {
					$custom_arguments = (array)$file_processor_obj->custom_arguments;
					$standard_options = [
						"file_name"				=> $options->file_name,
						"file_path"				=> $options->file_path,
						"section_tipo"			=> $options->section_tipo,
						"section_id"			=> $options->section_id,
						"target_section_tipo"	=> $options->target_section_tipo,
						"tool_config"			=> $options->tool_config
					];
					$result = call_user_func($function_name, $standard_options, $custom_arguments);
				}else{ debug_log(__METHOD__." Error on call file processor function: ".to_string($function_name), logger::ERROR); }
			}else{ debug_log(__METHOD__." Error on include file processor file script_file: ".to_string($script_file), logger::ERROR); }

			debug_log(__METHOD__." Processed file function_name $function_name with script $script_file".to_string(), logger::DEBUG);
		}//end foreach ((array)$options->file_processor_properties as $key => $file_processor_obj)


		$response->result 	= true;
		$response->msg 		= 'Ok. Request done';


		return (object)$response;
	}//end file_processor



	/**
	* IMPORT_FILES
	* Process previously uploaded images
	*/
	public static function import_files(object $request_options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			$options = new stdClass();
				$options->tipo					= null;
				$options->section_tipo			= null;
				$options->section_id			= null;
				$options->tool_config			= null;
				$options->files_data			= null;
				$options->components_temp_data	= null;
				$options->key_dir				= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// short vars
			// tipo. string component tipo like 'oh17'
			$tipo						= $options->tipo;
			// section_tipo. string current section tipo like 'oh1'
			$section_tipo				= $options->section_tipo;
			// section_id. int current section id like '5'
			$section_id					= $options->section_id;
			 // key_dir. string like: 'oh17_oh1' (contraction section_tipo + component tipo)
			$key_dir					= $options->key_dir;
			// files data. array of objects like: '[{"name":"_290000_rsc29_rsc170_290437.jpg","previewTemplate":{},"previewElement":{},"size":734061,"component_option":""}]'
			$files_data					= $options->files_data;
			// components_temp_data. array of objects like: '[{"section_id":"tmp","section_tipo":"rsc170","tipo":"rsc23","lang":"lg-eng","from_component_tipo":"rsc23","value":[],"parent_tipo":"rsc23","parent_section_id":"tmp","fallback_value":[null],"debug":{"exec_time":"0.740 ms"},"debug_model":"component_input_text","debug_label":"Title","debug_mode":"edit"}]'
			$components_temp_data		= $options->components_temp_data;
			// tool_config. object like: '{"ddo_map":[{"role":"target_component","tipo":"rsc29","section_id":"self","section_tipo":"rsc170","model":"component_image","label":"Image"}],"import_file_name_mode":null}'
			$tool_config				= $options->tool_config;

		// tool_import_files setup
			$tool_import_files = new tool_import_files(
				$section_id,
				$section_tipo
			);
			$tool_import_files->set_up($key_dir);

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

		// user_id
			$user_id = navigator::get_user_id();

		// init vars
			$ar_msg							= [];	// messages for response info
			$imput_components_section_tipo	= [];	// all different used section tipo in section_temp
			$total							= 0;	// n of files processed

		// ar_data. All files collected from files upload form
			$ar_processed	= [];
			$files_dir		= TOOL_IMPORT_FILES_UPLOAD_DIR;
			foreach ((array)$files_data as $value_obj) {

				$current_file_name				= $value_obj->name;
				$current_file_processor			= $value_obj->file_processor ?? null; # Note that var $current_file_processor is only the current element processor selection
				$current_component_option_tipo	= $value_obj->component_option;

				// Check file exists
					$file_full_path = $files_dir . $current_file_name;
					if (!file_exists($file_full_path)) {
						$msg = "File ignored (not found) $current_file_name";
						if(SHOW_DEVELOPER===true) { $msg .= " - $file_full_path"; }
						$ar_msg[] = $msg;
						continue; // Skip file
					}
				// Check proper mode config
					if ($import_file_name_mode==='enumerate' && $import_mode!=='section') {
						$msg = "Invalid import mode: $import_mode . Ignored action";
						debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
						$ar_msg[] = $msg;
						continue; // Skip file
					}

				// debug.  Init file import
				// debug_log(__METHOD__." Init file import_mode:$import_mode - import_file_name_mode:$import_file_name_mode - file_full_path ".to_string($file_full_path), logger::DEBUG);

				// file_data
					$file_data = tool_import_files::get_file_data($files_dir, $current_file_name);

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
						debug_log(__METHOD__." target_ddo is empty will be ignored ".to_string(), logger::ERROR);
						continue;
					}

				// component portal. Component (expected portal)
					$component_portal = component_common::get_instance( $target_ddo->model,
																		$target_ddo->tipo,
																		$section_id,
																		'edit',
																		DEDALO_DATA_NOLAN,
																		$target_ddo->section_tipo);
					// Portal target_section_tipo
					$target_section_tipo = $target_ddo->target_section_tipo ?? $component_portal->get_ar_target_section_tipo()[0];

				// section. Create a new section for each file from current portal
					$portal_response = (object)$component_portal->add_new_element((object)[
						'target_section_tipo' => $target_section_tipo
					]);
					if ($portal_response->result===false) {
						$response->result 	= false;
						$response->msg 		= "Error on create portal children: ".$portal_response->msg;
						return $response;
					}
					// save portal if all is all ok
					$component_portal->Save();

					// Fix new section created as current_section_id
					$target_section_id = $portal_response->section_id;

				// component portal new section order. Order portal record when is $import_file_name_mode=enumerate
					if ($import_file_name_mode==='enumerate' || $import_file_name_mode==='named' ) {
						$portal_norder = $file_data['regex']->portal_order!=='' ? (int)$file_data['regex']->portal_order : false;
						if ($portal_norder!==false) {
							$changed_order = $component_portal->set_locator_order( $portal_response->added_locator, $portal_norder );
							if ($changed_order===true) {
								$component_portal->Save();
							}
							debug_log(__METHOD__." CHANGED ORDER FOR : ".$file_data['regex']->portal_order." ".to_string($file_data['regex']), logger::DEBUG);
						}
					}

				// ar_ddo_map iterate. role based actions
					// Create the ddo components with the data to store with the import
					// when the component has a input in the tool propagate temp section_data
					// Update created section with temp section data
					// when the component stored the filename, get the filename and save it
					foreach ($ar_ddo_map as $ddo) {

						$RecordObj_dd	= new RecordObj_dd($ddo->tipo);
						$current_lang	= $RecordObj_dd->get_traducible()!=='si' ? DEDALO_DATA_NOLAN :  DEDALO_DATA_LANG;

						$destination_section_id = ($ddo->section_tipo===$section_tipo)
							? $section_id
							: $target_section_id;

						$model		= RecordObj_dd::get_modelo_name_by_tipo($ddo->tipo,true);
						$component	= component_common::get_instance($model,
																	 $ddo->tipo,
																	 $destination_section_id,
																	 'list',
																	 $current_lang,
																	 $ddo->section_tipo);
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
										$ar_children_tipo = section::get_ar_children_tipo_by_modelo_name_in_section(
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


					// $input_elements_in_source = array_filter($ar_ddo_map, function($item) use($current_component_option_tipo){
					// 	return $item->role==='component_option' && $item->tipo===$current_component_option_tipo;
					// });

					// $input_elements_in_target = array_filter($ar_ddo_map, function($item) use($target_section_tipo){
					// 	return $item->role === 'component_option' && $item->section_tipo===$target_section_tipo;
					// });

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
							$processor_options->file_path					= $files_dir;
							$processor_options->section_tipo				= $section_tipo;
							$processor_options->section_id					= $section_id;
							$processor_options->target_section_tipo			= $target_section_tipo;
							$processor_options->tool_config					= $tool_config;
						$response_file_processor = tool_import_files::file_processor($processor_options);
					}//end if (!empty($file_processor_properties))

				// set_media_file. Move uploaded file to media folder and create default versions
					tool_import_files::set_media_file($file_data, $target_section_tipo, $target_section_id, $target_component_tipo);

				// ar_processed. Add as processed
					$processed_info = new stdClass();
						$processed_info->file_name				= $value_obj->name;
						$processed_info->file_processor			= $value_obj->file_processor ?? null;
						$processed_info->target_component_tipo	= $target_component_tipo;
						$processed_info->section_id				= $section_id;
						$processed_info->file_data				= $file_data;
					$ar_processed[] = $processed_info;


				debug_log(__METHOD__." Imported files and data from $section_tipo - $section_id".to_string(), logger::WARNING);

				$total++;
			}//end foreach ((array)$files_data as $key => $value_obj)

		// Reset the temporary section of the components, for empty the fields.
			foreach ($imput_components_section_tipo as $current_section_tipo) {
				$temp_data_uid = $current_section_tipo .'_'. DEDALO_SECTION_ID_TEMP; // Like 'rsc197_tmp'
				if (isset($_SESSION['dedalo']['section_temp_data'][$temp_data_uid])) {
					unset( $_SESSION['dedalo']['section_temp_data'][$temp_data_uid]);
				}
			}

		// Consolidate counter. Set counter value to last section_id in section
			// if ($total>0) {
			// 	$matrix_table = 'matrix';//common::get_matrix_table_from_tipo($section_tipo);
			// 	counter::consolidate_counter( $section_tipo, $matrix_table );
			// 	if (isset($target_section_tipo)) {
			// 		$matrix_table = common::get_matrix_table_from_tipo($target_section_tipo);
			// 		counter::consolidate_counter( $target_section_tipo, $matrix_table );
			// 	}
			// }

		// response
			$response->result	= true;
			$response->msg		= 'Import files done successfully. Total: '.$total ." of " .count($files_data);


		return (object)$response;
	}//end if ($mode=='import_files')



	/**
	* LIST_UPLOADED_FILES
	* Used by the upload lib (Dropzone) to get the list of already uploaded files on server
	* @param object $request_options
	* 	Object with only the key_dir name like { key_dir: 'oh1_4' }
	* @return object $response
	* 	response->result:
	* 	Array of objects like: [{
	* 		url : server generated thumbnail url,
	* 		name : file name like 'my_photo51.jpg',
	* 		size : informative file size in bytes like 6528743 (from original file, not from the thumb)
	* 	}]
	*/
	public static function list_uploaded_files(object $request_options) : object {

		// unlock session
			session_write_close();
			ignore_user_abort();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		// options
			$options = new stdClass();
				$options->key_dir		= null;
				$options->section_tipo	= null;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// short vars
			$key_dir = $options->key_dir; // key_dir. Contraction of tipo + section_tipo, like: 'rsc29_rsc176'

		// tool_import_files
			$tool_import_files = new tool_import_files(
				null,
				$options->section_tipo
			);
			$tool_import_files->set_up($key_dir);

			// dir
				$upload_dir	= TOOL_IMPORT_FILES_UPLOAD_DIR; // like /home/httpdocs/dedalo/media/upload/temp/files/user_2/rsc56/';
				$upload_url	= TOOL_IMPORT_FILES_UPLOAD_URL; // like /dedalo/media/upload/temp/files/user_2/rsc56/';

			// read files dir
				$files		= [];
				$files_raw	= scandir($upload_dir);
				foreach ($files_raw as $file_name) {
					$file_path = $upload_dir . $file_name;
					if (strlen($file_name) > 0 && $file_name[0]!=='.' && is_file($file_path)) {

						$info		= pathinfo($file_name);
						$basemane	= basename($file_name,'.'.$info['extension']);

						$files[] = (object)[
							'url'	=> $upload_url .'/thumbnail/'. $basemane . '.jpg',
							'name'	=> $file_name,
							'size'	=> filesize($file_path)
						];
					}
				}

		// response
			$response->result	= $files;
			$response->msg		= 'OK. Request done';

		return $response;
	}//end list_uploaded_files



	/**
	* DELETE_UPLOADED_FILE
	* Used by the upload lib (Dropzone) to delete already uploaded files on server
	* @param object $request_options
	* 	Object like { file_name: 'my_photo_452.jpg', key_dir: 'rsc29_rsc176' }
	* @return object $response
	* 	reponse->result
	* 	Returns false if file do not exists or the unlink call do not return true
	*/
	public static function delete_uploaded_file(object $request_options) : object {

		// unlock session
			session_write_close();
			ignore_user_abort();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// options
			$options = new stdClass();
				$options->file_name		= null;
				$options->key_dir		= null;
				$options->section_tipo	= null;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// short vars
			$file_names	= is_array($options->file_name) ? $options->file_name : [$options->file_name];
			$key_dir	= $options->key_dir; // key_dir. Contraction of tipo + section_tipo, like: 'rsc29_rsc176'

		// tool_import_files
			$tool_import_files = new tool_import_files(
				null,
				$options->section_tipo
			);
			$tool_import_files->set_up($key_dir);

		// dir
			$upload_dir = TOOL_IMPORT_FILES_UPLOAD_DIR; // like /home/httpdocs/dedalo/media/upload/temp/files/user_2/rsc56/';
			$upload_url = TOOL_IMPORT_FILES_UPLOAD_URL; // like /dedalo/media/upload/temp/files/user_2/rsc56/';

		// delete each file
			foreach ($file_names as $file_name) {

				// file_path
					$file_path = $upload_dir . $file_name;

				// delete file
					if (!file_exists($file_path)) {
						$response->result	= false;
						$response->msg		= "Error on delete file (the file do not exists): ".to_string($file_path);
						debug_log(__METHOD__." $response->msg", logger::ERROR);
						return $response;
					}
					if (!unlink($file_path)) {
						$response->result	= false;
						$response->msg		= "Error on delete file (unable to unlink file): ".to_string($file_path);
						debug_log(__METHOD__." $response->msg", logger::ERROR);
						return $response;
					}

				// path thumb
					$info				= pathinfo($file_name);
					$basemane			= basename($file_name,'.'.$info['extension']);
					$file_path_thumb	= $upload_dir . '/thumbnail/' . $basemane . '.jpg';

				// delete thumb
					if (file_exists($file_path_thumb) && !unlink($file_path_thumb)) {
						$response->result	= false;
						$response->msg		= "Error on delete thumb file (unable to unlink file): ".to_string($file_path_thumb);
						debug_log(__METHOD__." $response->msg", logger::ERROR);
						return $response;
					}
			}//end foreach ($file_names as $file_name)

		// response
			$response->result	= true;
			$response->msg		= 'OK. Request done';


		return $response;
	}//end delete_uploaded_file



}//end class tool_import_files
