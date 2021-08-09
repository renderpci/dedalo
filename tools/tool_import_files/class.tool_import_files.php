<?php
/*
* CLASS TOOL_IMPORT_FILES
*
*
*/
class tool_import_files extends tool_common {



	// protected $component_obj;	# received section
	protected $valid_extensions;


	/**
	* __CONSTRUCT
	*/
	public function __construct($component_obj=null, $modo='button') {

		# Fix modo
		$this->modo = $modo;

		# Fix current component/section
		// $this->component_obj = $component_obj;

		// $this->set_up();
	}//end __construct



	/**
	* SET_UP
	*/
	public function set_up($key_dir=null) {

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
			$base_path = '/upload/temp/files/user_' . $user_id . $upload_dir_custom . '/';
			define('TOOL_IMPORT_FILES_UPLOAD_DIR', DEDALO_MEDIA_PATH . $base_path);
			define('TOOL_IMPORT_FILES_UPLOAD_URL', DEDALO_MEDIA_URL  . $base_path);

		// extensions. Fix array of valid extensions
			$this->valid_extensions = array_merge(DEDALO_IMAGE_EXTENSIONS_SUPPORTED, DEDALO_PDF_EXTENSIONS_SUPPORTED);

		// base_folder_path. Target folder exists and create test
			$base_folder_path = DEDALO_MEDIA_PATH  .'/upload/temp/files/';
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
	* Read dir (can be accessible)
	*/
	public function find_all_files($dir, $recursive=false) {

		#$dir = str_replace('//', '/', $dir);

		$ar_data = array();
		try {
			if (!file_exists($dir)) {
				$create_dir 	= mkdir($dir, 0777,true);
				if(!$create_dir) throw new Exception(" Error on create directory. Permission denied \"$dir\" (1)");
			}
			$root 	 = scandir($dir);
		} catch (Exception $e) {
			//return($e);
		}
		if (!$root) {
			return array();
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
			/*
			# Case dir ($recursive==true)
			if($recursive) foreach(self::find_all_files("$dir/$value", $recursive) as $value) {
				$ar_data[] = $value;
			}
			*/
		}

		# SORT ARRAY (By custom core function build_sorter)
		#usort($ar_data, build_sorter('numero_recurso'));

		return $ar_data;
	}//end find_all_files



	/**
	* SET_COMPONENT
	* @return bool
	*/
	public function set_component($component_obj) {
		# Fix current component/section
		$this->component_obj = $component_obj;

		return true;
	}//end set_component



	/**
	* GET_FILE_DATA
	* Extrae información de la imágen recibida usando una expresión regular para interpretar un patrón dado
	* Devuelve un array con los datos extraidos
	*/
	public static function get_file_data($dir, $file) {	// , $regex="/(\d*)[-|_]?(\d*)_?(\w{0,}\b.*)\.([a-zA-Z]{3,4})\z/"

		$ar_data = array();

		$file_name  = pathinfo($file,PATHINFO_FILENAME);
		$extension 	= pathinfo($file,PATHINFO_EXTENSION);

		# AR_DATA
		$ar_data['dir_path'] 					= $dir; 				# /Users/dedalo/media/media_mupreva/image/temp/files/user_1/
		$ar_data['file_path'] 					= $dir.$file; 			# /Users/dedalo/media/media_mupreva/image/temp/files/user_1/45001-1.jpg
		$ar_data['file_name'] 					= $file_name; 			# 04582_01_EsCuieram_Terracota_AD_ORIG
		$ar_data['file_name_full'] 				= $file; 				# $ar_value[0]; # 04582_01_EsCuieram_Terracota_AD_ORIG.JPG
		$ar_data['extension'] 					= $extension;			# JPG (respetamos mayúsculas/minúsculas)
		$ar_data['file_size'] 					= number_format(filesize($ar_data['file_path'])/1024/1024,3)." MB"; # 1.7 MB

		$ar_data['image']['image_url'] 			= DEDALO_ROOT_WEB . "/inc/img.php?s=".$ar_data['file_path'];
		// $ar_data['image']['image_preview_url']	= DEDALO_LIB_BASE_URL . '/tools/tool_import_files/foto_preview.php?f='.$ar_data['file_path'];

		# Regeg file info ^(.+)(-([a-zA-Z]{1}))\.([a-zA-Z]{3,4})$
		# Format result preg_match '1-2-A.jpg' and 'gato-2-A.jpg'
		# 0	=>	1-2-A.jpg 	: gato-2-A.jpg 	# full_name
		# 1	=>	1-2-A 		: gato-2-A 		# name
		# 2	=>	1 			: gato 			# base_name (name without order and letter)
		# 3	=>	1 			: 				# section_id (empty when not numeric)
		# 4	=>				: gato 			# base_string_name (empty when numeric)
		# 5	=>	-2 			: -2 			# not used
		# 6	=>	2 			: 2 			# portal_order
		# 7	=>	-A 			: -A 			# not used
		# 8	=>	A 			: A 			# target map (A,B,C..)
		# 9	=>	jpg 		: jpg 			# extension

		preg_match("/^((([\d]+)|([^-]+))([-](\d))?([-]([a-zA-Z]))?)\.([a-zA-Z]{3,4})$/", $file, $ar_match);

		$regex_data = new stdClass();
			$regex_data->full_name 	  = $ar_match[0];
			$regex_data->name 		  = $ar_match[1];
			$regex_data->base_name    = $ar_match[2];
			$regex_data->section_id   = $ar_match[3];
			$regex_data->portal_order = $ar_match[6];
			$regex_data->letter 	  = $ar_match[8];
			$regex_data->extension 	  = $ar_match[9];

		$ar_data['regex'] = $regex_data;


		return $ar_data;
	}//end get_file_data



	/**
	* SET_MEDIA_FILE
	* Insert in target section, current uploaded file
	* @param array $current_file
	* @param string tipo $target_section_tipo
	* @param int section_id $current_section_id
	* @param string tipo $target_component
	* @return (bool)
	*/
	public static function set_media_file($current_file, $target_section_tipo, $current_section_id, $tool_propiedades) {

		$target_component 	= $tool_propiedades->target_component;
		$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($target_component,true);

		switch ($modelo_name) {
			case 'component_image':

				#
				# COMPONENT IMAGE
				# (Is autosaved with defaults on create)
				$component 	 = component_common::get_instance($modelo_name,
																$target_component,
																$current_section_id,
																'list',
																DEDALO_DATA_LANG,
																$target_section_tipo);
				#
				# get_image_id
				$image_id 		= $component->get_image_id();
				$image_path 	= $component->get_image_path();
				$aditional_path = $component->get_aditional_path();

				#
				# FILE VARS
				# Path of file like '/Users/pepe/Dedalo/media/media_mupreva/image/temp/files/user_1/'
				$source_path 		= $current_file['dir_path'];
				# Full path to file located in temporal files uploads like '/Users/pepe/Dedalo/media/media_mupreva/image/temp/files/user_1/1253-2.jpg'
				$source_full_path 	= $current_file['file_path'];
				# File current extension like 'jpg'
				$extension 			= $current_file['extension'];
				# File name full like '1253-2.jpg'
				$file_name_full 	= $current_file['file_name_full'];
				# File name without extension
				$file_name 			= $current_file['file_name'];

				# Safe paths
				if (strpos($source_path, '../')!==false ||
					strpos($source_full_path, '../')!==false ||
					strpos($extension, '../')!==false ||
					strpos($file_name_full, '../')!==false ||
					strpos($file_name, '../')!==false
					) {
					throw new Exception("Error Processing Request. Unauthorized path", 1);
					return false;
				}


				#
				# TARGET_FILENAME
				# Save original file name in a component_input_text
				if (isset($tool_propiedades->target_filename)) {
					$modelo_name_target_filename= RecordObj_dd::get_modelo_name_by_tipo($tool_propiedades->target_filename,true);
					$component_target_filename 	= component_common::get_instance($modelo_name_target_filename, $tool_propiedades->target_filename, $current_section_id, 'list', DEDALO_DATA_LANG, $target_section_tipo);
					$component_target_filename->set_dato( $file_name_full );
					$component_target_filename->Save();
				}

				#
				# TARGET_DATE (From exif)
				# Save original file date in a component_date if actual component date is empty
				if (isset($tool_propiedades->target_date)) {
					$modelo_name_target_date= RecordObj_dd::get_modelo_name_by_tipo($tool_propiedades->target_date,true);
					$component_target_date 	= component_common::get_instance($modelo_name_target_date, $tool_propiedades->target_date, $current_section_id, 'list', DEDALO_DATA_LANG, $target_section_tipo);
					$dato = $component_target_date->get_dato();
					if (empty($dato)) {
						# exif try to get date from file
						$DateTimeOriginal=false;
						try {
							$command 		 = MAGICK_PATH . 'identify -format "%[EXIF:DateTimeOriginal]" ' .$source_full_path;
							$DateTimeOriginal= shell_exec($command);
						} catch (Exception $e) {
							if(SHOW_DEBUG) {
								error_log("Error on get DateTimeOriginal from image metadata");
							}
						}
						if ($DateTimeOriginal && !empty($DateTimeOriginal)) {

							$dd_date 			= new dd_date();
							$original_dato 		= (string)$DateTimeOriginal;

							$regex   = "/^(-?[0-9]+)-?:?\/?.?([0-9]+)?-?:?\/?.?([0-9]+)? ?([0-9]+)?:?([0-9]+)?:?([0-9]+)?/";
							preg_match($regex, $original_dato, $matches);
							if(isset($matches[1])) $dd_date->set_year((int)$matches[1]);
							if(isset($matches[2])) $dd_date->set_month((int)$matches[2]);
							if(isset($matches[3])) $dd_date->set_day((int)$matches[3]);
							if(isset($matches[4])) $dd_date->set_hour((int)$matches[4]);
							if(isset($matches[5])) $dd_date->set_minute((int)$matches[5]);
							if(isset($matches[6])) $dd_date->set_second((int)$matches[6]);

							$component_target_date->set_dato($dd_date);
							$component_target_date->Save();
						}
					}
				}//end if (isset($tool_propiedades->target_date)) {


				#
				# ORIGINAL IMAGE DESIRED STORE
				$original_path 		= DEDALO_MEDIA_PATH.DEDALO_IMAGE_FOLDER .'/'. DEDALO_IMAGE_QUALITY_ORIGINAL .''. $aditional_path;
				$original_file_path = $original_path .'/'. $image_id . '.'.strtolower($extension);
				if( !is_dir($original_path) ) {
					if(!mkdir($original_path, 0777,true)) {
						throw new Exception(" Error on read or create directory. Permission denied $original_path");
					}
				}

				# Copy the original
				if (!copy($source_full_path, $original_file_path)) {
					throw new Exception("<div class=\"info_line\">ERROR al copiar ".$source_full_path." a ".$original_file_path."</div>");
				}

				# JPG : la convertimos a jpg si no lo es ya
				if (strtolower($extension)!=strtolower(DEDALO_IMAGE_EXTENSION)) {
					$original_file_path_jpg = DEDALO_MEDIA_PATH.DEDALO_IMAGE_FOLDER .'/'. DEDALO_IMAGE_QUALITY_ORIGINAL .''. $aditional_path .'/'. $image_id .'.'. DEDALO_IMAGE_EXTENSION;
					ImageMagick::convert($original_file_path, $original_file_path_jpg );
					#chmod($original_file_path, 0777);
					#chmod($original_file_path_jpg, 0777);
				}

				# DEFAULT QUALITY
				# Generate dedalo default quality version (usually 1.5MB) and thumb image
				# $default_quality_image = DEDALO_MEDIA_PATH.DEDALO_IMAGE_FOLDER .'/'. DEDALO_IMAGE_QUALITY_DEFAULT .'/'. $image_id  .'.'. DEDALO_IMAGE_EXTENSION;
				$source_image 	= $original_file_path;
				$source_quality = DEDALO_IMAGE_QUALITY_ORIGINAL;
				$target_quality = DEDALO_IMAGE_QUALITY_DEFAULT;

				$component->convert_quality( $source_quality, $target_quality );
				$component->Save();

				# REMOVE ORIGINAL IMAGE AFTER IMPORT
				unlink(	$source_full_path );
				break;

			default:
				trigger_error("Error. Media type not allowed");
				break;
		}
	}//end set_media_file



	/**
	* FILE_PROCESSOR
	* @return
	*/
	public static function file_processor($request_options) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		$options = new stdClass();
			$options->file_processor 			= null;
			$options->file_processor_properties = null;
			$options->file_name 				= null;
			$options->files_dir 				= null;
			$options->section_tipo 				= null;
			$options->section_id 				= null;
			$options->target_section_tipo 		= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}


		#
		# FILE_PROCESSOR
		# Global var button propiedades json data array
		# Optional aditional file script processor defined in button import propiedaes
		# Note that var $file_processor_properties is the button propiedades json data, NOT current element processor selection

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
						"file_name" 		  => $options->file_name,
						"file_path" 		  => $options->files_dir,
						"section_tipo" 		  => $options->section_tipo,
						"section_id" 		  => $options->section_id,
						"target_section_tipo" => $options->target_section_tipo
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
	public static function import_files($request_options) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			$options = new stdClass();
				$options->tipo						= null;
				$options->section_tipo				= null;
				$options->section_id				= null;
				$options->top_tipo					= null;
				$options->top_id					= null;
				$options->import_mode				= null;
				$options->ar_data					= null;
				$options->import_file_name_mode		= null;
				$options->file_processor_properties	= null;
				$options->copy_all_filenames_to		= null;
				$options->optional_copy_filename	= null;

				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// vars
			$tipo						= $options->tipo;
			$section_tipo				= $options->section_tipo;
			$section_id					= $options->section_id;
			$top_tipo					= $options->top_tipo;
			$top_id						= $options->top_id;
			$import_mode				= $options->import_mode;
			$ar_data					= $options->ar_data;
			$import_file_name_mode		= $options->import_file_name_mode;
			$file_processor_properties	= $options->file_processor_properties;
			$copy_all_filenames_to		= $options->copy_all_filenames_to;
			$optional_copy_filename		= $options->optional_copy_filename;

		// $vars = array('tipo','section_tipo','parent','top_tipo','top_id','import_mode','ar_data','import_file_name_mode','file_processor_properties','copy_all_filenames_to','optional_copy_filename');
			// 	foreach($vars as $name) {
			// 		$$name = common::setVarData($name, $json_data);
			// 		# DATA VERIFY
			// 		if ($name==='import_mode' || $name==='top_id' || $name==='file_processor_properties' || $name==='copy_all_filenames_to'|| $name==='optional_copy_filename') continue; # Skip non mandatory
			// 		if (empty($$name)) {
			// 			$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
			// 			return $response;
			// 		}
			// 	}

		// import_mode
			$import_mode = $import_mode ?? 'default';

		// user_id
			$user_id = navigator::get_user_id();

		// current_dedalo_version
			$current_dedalo_version = tool_administration::get_dedalo_version();


		$ar_msg = [];
		$total  = 0;

		# AR_DATA
		# All files collected from siles upload form
			$ar_processed	= [];
			$files_dir		= TOOL_IMPORT_FILES_UPLOAD_DIR;
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

		// response
			$response->result 	= true;
			$response->msg 		= 'Import files done successfully. Total: '.$total ." of " .count($ar_data);


		// debug
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



}//end class tool_import_files
