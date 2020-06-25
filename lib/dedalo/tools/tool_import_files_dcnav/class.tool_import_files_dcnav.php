<?php
// generic xml / rdf parser lib
require_once 'class.xml.php';
// specific parse for dcnav files
require_once 'class.xml_dcnav_parser.php';
/*
* CLASS TOOL_IMPORT_FILES_DCNAV
* Import Dublin Core XML files and related images
* Used by Navarra Government to import unified format of documentation archives
*
*/
class tool_import_files_dcnav extends tool_common {
	
	
	protected $section_obj;	# received section	
	protected $valid_extensions;

	// alias sections of 'navarra1'
	// documentation. Every record where xml files are imported one by one [import]
	public $documentation_section_tipo	= 'navarra60';
	// catalog. Root record where documents are referenced in a Documents portal [related]
	public $catalog_section_tipo		= 'navarra57';


	/**
	* __CONSTRUCT
	*/
	public function __construct($section_obj, $modo='button') {
		
		# Fix modo
		$this->modo = $modo;

		# Fix current component/section
		$this->section_obj = $section_obj;	

		$this->set_up();
	}//end __construct



	/**
	* SET_UP
	*/
	public function set_up() {

		# VERIFY USER IS LOGGED
		if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");
		
		# Usuario logeado actualmente
		$user_id		= navigator::get_user_id();	
		$media_folder 	= DEDALO_IMAGE_FOLDER;
		// tipo
		$tipo = null;
		if (isset($this->section_obj)) {
			
			$tipo = $this->section_obj->get_tipo();

		}else{

			$var_requested_t = common::get_request_var('t');			
			$tipo			 = !empty($var_requested_t) ? $var_requested_t : '';	// When varname is t (default page call)
			
			$var_requested 	 = common::get_request_var('tipo');
			$tipo			 = !empty($var_requested) ? $var_requested : $tipo;	// When varname is tipo fallback	
		}
		

		# UPLOAD_DIR_CUSTOM is section_tipo
		$upload_dir_custom = isset($tipo) ? '/'.$tipo : null;
		if (empty($upload_dir_custom)) {
			trigger_error(__METHOD__." WARNING tool_import_files_dcnav: EMPTY upload_dir_custom");
		}

		# TOOL IMPORT IMAGES
		define('TOOL_IMPORT_FILES_UPLOAD_DIR', DEDALO_MEDIA_BASE_PATH.$media_folder.'/temp'.'/files/'.'user_'.$user_id.$upload_dir_custom.'/');
		define('TOOL_IMPORT_FILES_UPLOAD_URL', DEDALO_MEDIA_BASE_URL .$media_folder.'/temp'.'/files/'.'user_'.$user_id.$upload_dir_custom.'/');

		# FILES HANDLER
		define('TOOL_IMPORT_FILES_HANDLER_URL', DEDALO_LIB_BASE_URL.'/tools/tool_import_files_dcnav/inc/files_handler.php?t='.$tipo);

		# EXTENSIONS (ARRAY OF VALID EXTENSIONS)
		$this->valid_extensions = array('jpg',
										'jpeg',
										'tif',
										'tiff',
										'psd',
										'bmp',
										'png',
										'xml');

		# BASE FOLDER
		# Target folder exists adn create test
		$base_folder_path = DEDALO_MEDIA_BASE_PATH . $media_folder .'/temp'.'/files/';
		if( !is_dir($base_folder_path) ) {
			if(!mkdir($base_folder_path, 0775,true)) {
				throw new Exception(" Error on read or create TOOL_IMPORT_IMAGES_UPLOAD_DIR directory. Permission denied ");
			}
		}
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
		// public function set_component($component_obj) {
		// 	# Fix current component/section
		// 	$this->component_obj = $component_obj;

		// 	return true;
		// }//end set_component	



	/**
	* GET_FILE_DATA
	* Extrae información de la imágen recibida usando una expresión regular para interpretar un patrón dado
	* Devuelve un array con los datos extraidos
	*/
	public static function get_file_data($dir, $file) {	// , $regex="/(\d*)[-|_]?(\d*)_?(\w{0,}\b.*)\.([a-zA-Z]{3,4})\z/" 

		$ar_data = array();
	
		$file_name  = pathinfo($file,PATHINFO_FILENAME);
		$extension 	= pathinfo($file,PATHINFO_EXTENSION);
		
		# AR_DATA
		$ar_data['dir_path']					= $dir; 				# /Users/dedalo/media/media_mupreva/image/temp/files/user_1/
		$ar_data['file_path']					= $dir.$file; 			# /Users/dedalo/media/media_mupreva/image/temp/files/user_1/45001-1.jpg
		$ar_data['file_name']					= $file_name; 			# 04582_01_EsCuieram_Terracota_AD_ORIG
		$ar_data['file_name_full']				= $file; 				# $ar_value[0]; # 04582_01_EsCuieram_Terracota_AD_ORIG.JPG		
		$ar_data['extension']					= $extension;			# JPG (respetamos mayúsculas/minúsculas)		
		$ar_data['file_size']					= number_format(filesize($ar_data['file_path'])/1024/1024,3)." MB"; # 1.7 MB

		if ($ar_data['extension']==='jpg') {
			$ar_data['image']['image_url']			= DEDALO_ROOT_WEB . "/inc/img.php?s=".$ar_data['file_path'];
			$ar_data['image']['image_preview_url']	= DEDALO_LIB_BASE_URL . '/tools/tool_import_files_dcnav/foto_preview.php?f='.$ar_data['file_path'];
		}
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

		preg_match('/^(((\d{1,5})-(\d{1,5}))-?(\d{1,5})?)\.([a-zA-Z]{3,4})$/', $file, $ar_match);
			// dump($file, ' file ++ '.to_string());
			// dump($ar_match, ' ar_match ++ '.to_string());
		$regex_data = new stdClass();
			$regex_data->full_name	= $ar_match[0]; // like 0001-0002.xml
			$regex_data->name		= $ar_match[1]; // like 0001-0001-0002
			$regex_data->code		= $ar_match[2]; // like 0001-0002
			$regex_data->base_code1	= $ar_match[3];
			$regex_data->base_code2	= $ar_match[4];
			$regex_data->base_code3	= $ar_match[5];
			$regex_data->extension	= $ar_match[6];

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
	public static function set_media_file($current_file, $target_component_tipo, $target_section_tipo, $current_section_id) {
		
		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($target_component_tipo,true);

		switch ($modelo_name) {
			case 'component_image':
				
				# COMPONENT IMAGE 
				# (Is autosaved with defaults on create)
				$component 		= component_common::get_instance($modelo_name,
																 $target_component_tipo,
																 $current_section_id,
																 'list',
																 DEDALO_DATA_NOLAN,
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
				
				// TARGET_FILENAME . Save original file name in a component_input_text
					// if (isset($tool_propiedades->target_filename)) {
					// 	$modelo_name_target_filename= RecordObj_dd::get_modelo_name_by_tipo($tool_propiedades->target_filename,true);
					// 	$component_target_filename 	= component_common::get_instance($modelo_name_target_filename, $tool_propiedades->target_filename, $current_section_id, 'list', DEDALO_DATA_LANG, $target_section_tipo);
					// 	$component_target_filename->set_dato( $file_name_full );
					// 	$component_target_filename->Save();
					// }
				
				// TARGET_DATE (From exif). Save original file date in a component_date if actual component date is empty
					// if (isset($tool_propiedades->target_date)) {
					// 	$modelo_name_target_date= RecordObj_dd::get_modelo_name_by_tipo($tool_propiedades->target_date,true);
					// 	$component_target_date 	= component_common::get_instance($modelo_name_target_date, $tool_propiedades->target_date, $current_section_id, 'list', DEDALO_DATA_LANG, $target_section_tipo);
					// 	$dato = $component_target_date->get_dato();
					// 	if (empty($dato)) {
					// 		# exif try to get date from file
					// 		$DateTimeOriginal=false;
					// 		try {							
					// 			$command 		 = MAGICK_PATH . 'identify -format "%[EXIF:DateTimeOriginal]" ' .$source_full_path;
					// 			$DateTimeOriginal= shell_exec($command);								
					// 		} catch (Exception $e) {
					// 			if(SHOW_DEBUG) {
					// 				error_log("Error on get DateTimeOriginal from image metadata");
					// 			}							
					// 		}					
					// 		if ($DateTimeOriginal && !empty($DateTimeOriginal)) {
								
					// 			$dd_date 			= new dd_date();							
					// 			$original_dato 		= (string)$DateTimeOriginal;

					// 			$regex   = "/^(-?[0-9]+)-?:?\/?.?([0-9]+)?-?:?\/?.?([0-9]+)? ?([0-9]+)?:?([0-9]+)?:?([0-9]+)?/";
					// 			preg_match($regex, $original_dato, $matches);    
					// 			if(isset($matches[1])) $dd_date->set_year((int)$matches[1]); 
					// 			if(isset($matches[2])) $dd_date->set_month((int)$matches[2]);
					// 			if(isset($matches[3])) $dd_date->set_day((int)$matches[3]);
					// 			if(isset($matches[4])) $dd_date->set_hour((int)$matches[4]);
					// 			if(isset($matches[5])) $dd_date->set_minute((int)$matches[5]);
					// 			if(isset($matches[6])) $dd_date->set_second((int)$matches[6]);

					// 			$component_target_date->set_dato($dd_date);
					// 			$component_target_date->Save();
					// 		}
					// 	}
					// }//end if (isset($tool_propiedades->target_date)) {
				
				// ORIGINAL IMAGE DESIRED STORE
					$original_path 		= DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER .'/'. DEDALO_IMAGE_QUALITY_ORIGINAL .''. $aditional_path;
					$original_file_path = $original_path .'/'. $image_id . '.'.strtolower($extension); 
					if( !is_dir($original_path) ) {
						if(!mkdir($original_path, 0777,true)) {
							throw new Exception(" Error on read or create directory. Permission denied $original_path");
						}
					}
				
				// Copy the original
					if (!copy($source_full_path, $original_file_path)) {
						throw new Exception("<div class=\"info_line\">ERROR al copiar ".$source_full_path." a ".$original_file_path."</div>");
					}

				// JPG : la convertimos a jpg si no lo es ya
					if (strtolower($extension)!=strtolower(DEDALO_IMAGE_EXTENSION)) {
						$original_file_path_jpg = DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER .'/'. DEDALO_IMAGE_QUALITY_ORIGINAL .''. $aditional_path .'/'. $image_id .'.'. DEDALO_IMAGE_EXTENSION;
						ImageMagick::convert($original_file_path, $original_file_path_jpg );
					}

				// DEFAULT QUALITY. Generate dedalo default quality version (usually 1.5MB) and thumb image
					# $default_quality_image = DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER .'/'. DEDALO_IMAGE_QUALITY_DEFAULT .'/'. $image_id  .'.'. DEDALO_IMAGE_EXTENSION;				
					$source_image 	= $original_file_path;
					$source_quality = DEDALO_IMAGE_QUALITY_ORIGINAL;
					$target_quality = DEDALO_IMAGE_QUALITY_DEFAULT;

					$component->convert_quality( $source_quality, $target_quality );
					$component->Save();

				// REMOVE ORIGINAL IMAGE AFTER IMPORT
					unlink(	$source_full_path );
				break;

			default:
				trigger_error("Error. Media type not allowed");
				break;
		}

		return true;
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
	* Iterate the files list received (ar_data) and parse it xml files and image files correspondences
	* Accep xml and jpg mixed files list
	* When importation is done, xml files ar moved to media folder to allow link
	* @param object $json_data
	*	string mode ie. 'import_files'
	*	string tipo ie. 'navarra1'
	*	string section_tipo ie. 'navarra1'
	* 	array ar_data ie. '[{"file_name": "0001-0001-0002.jpg","file_type": "image"}]'
	* @return object $response
	*/
	public function import_files($json_data) {
		
		$response = new stdClass();
			$response->result	= false;
			$response->msg		= __METHOD__ . ' Error. Request failed';


		// sort vars
			$mode					= $json_data->mode; // "import_files"
			$tipo					= $json_data->tipo; // "navarra1"
			$section_tipo			= $json_data->section_tipo; // "navarra1"
			$ar_data				= $json_data->ar_data; // [{"file_name": "0001-0001-0002.jpg","file_type": "image"}]
			// temp section data
			$user_id				= navigator::get_user_id();
			// $temp_id				= DEDALO_SECTION_ID_TEMP.'_'.$parent.'_'.$user_id;
			// current_dedalo_version
			$current_dedalo_version	= tool_administration::get_dedalo_version();
			$total					= 0;
			$ar_processed			= [];
			$ar_msg					= [];
			$files_dir				= TOOL_IMPORT_FILES_UPLOAD_DIR;

		// check target dir for xml files store
			$xml_files_path	= DEDALO_MEDIA_BASE_PATH . '/import/xml';
			if( !is_dir($xml_files_path) ) {
				if(!mkdir($xml_files_path, 0775,true)) {
					throw new Exception(" Error on read or create directory. Permission denied: $xml_files_path");
				}
			}

		// data organize and sort items
			// dump($ar_data, ' ar_data ++ '.to_string());
			$ar_xml		= [];
			$ar_image	= [];
			foreach ($ar_data as $item) {
				if ($item->file_type==='xml') {
					$ar_xml[] = $item;
				}elseif ($item->file_type==='image') {
					$ar_image[] = $item;
				}
			}
			usort($ar_xml, function($a, $b) {return strcmp($a->file_name, $b->file_name);});
			usort($ar_image, function($a, $b) {return strcmp($a->file_name, $b->file_name);});
		
		// ar_data_sorted. merge all
			// $ar_data_sorted = array_merge($ar_xml, $ar_image);
			// dump($ar_xml, ' ar_xml ++ '.to_string());		
			// dump($ar_image, ' ar_image ++ '.to_string());
			// dump($ar_data_sorted, ' ar_data_sorted ++ '.to_string());

		// ar_xml. Iterate all xml files collected from upload form (not image files)
			foreach ((array)$ar_xml as $key => $value_obj) {

				$current_file_name	= $value_obj->file_name;
				$current_file_type	= $value_obj->file_type;
				
				// file.  Check file exists
					$file_full_path = $files_dir . $current_file_name;
					if (!file_exists($file_full_path)) {
						$msg = "File ignored (not found) $current_file_name";
						if(SHOW_DEVELOPER===true) { $msg .= " - $file_full_path"; }
						$ar_msg[] = $msg;
						continue; // Skip file
					}

				// file_data
					// Example:
					// {
					//     "dir_path": "\/master_dedalo\/media_test\/media_development\/image\/temp\/files\/user_-1\/navarra60\/",
					//     "file_path": "\/master_dedalo\/media_test\/media_development\/image\/temp\/files\/user_-1\/navarra60\/0001-0001.xml",
					//     "file_name": "0001-0001",
					//     "file_name_full": "0001-0001.xml",
					//     "extension": "xml",
					//     "file_size": "0.002 MB",
					//     "regex": {
					//         "full_name": "0001-0001.xml",
					//         "name": "0001-0001",
					//         "code": "0001-0001",
					//         "base_code1": "0001",
					//         "base_code2": "0001",
					//         "base_code3": "",
					//         "extension": "xml"
					//     }
					// }
					$file_data = tool_import_files_dcnav::get_file_data($files_dir, $current_file_name);
					// dump($file_data, ' file_data ++ import_file_name_mode - '.to_string()); die(); // continue;

				// find existing section or create a new one
					$base_code1	= $file_data['regex']->base_code1; // code value from filename used in Catalog grouper
					$code		= $file_data['regex']->code; // code value from filename
					$code_tipo	= 'navarra19'; // tipo of the component_input_text where is stored code value
					$sqo = json_decode('{
						"id": "'.$section_tipo.'_list",
						"parsed": false,
						"section_tipo": ["'.$section_tipo.'"],
						"limit": 1,
						"offset": 0,
						"type": "search_json_object",
						"full_count": false,
						"order": false,
						"filter": {
							"$and": [
								{
									"q": "'.$code.'",
									"q_operator": null,
									"path": [
										{
											"section_tipo": "'.$section_tipo.'",
											"component_tipo": "'.$code_tipo.'",
											"modelo": "component_input_text",
											"name": "Code"
										}
									]
								}
							]
						},
						"select": []
					}');
					$search_development2	= new search_development2($sqo);
					$search_result			= $search_development2->search();
					$ar_records				= $search_result->ar_records;
					if(!empty($ar_records)) {
						// founded. Already created record
							$section_id = reset($ar_records)->section_id;
					}else{
						// no found. Create a new empty record
							$section	= section::get_instance(null, $section_tipo);
							$section->Save();
							$section_id	= $section->get_section_id();

						// save code : navarra19
							$code_tipo			= 'navarra19';
							$code_modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($code_tipo,true);
							$code_component		= component_common::get_instance($code_modelo_name,
																				 $code_tipo,
																				 $section_id,
																				 'list',
																				 DEDALO_DATA_LANG,
																				 $section_tipo);
							$code_component->set_dato([$code]);
							$code_component->Save();
					}				

				// clean portal old data if exists
					$portal_xml_data_tipo			= 'navarra48';
					$portal_xml_data_modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($portal_xml_data_tipo,true);
					$portal_xml_data_component		= component_common::get_instance($portal_xml_data_modelo_name,
																					 $portal_xml_data_tipo,
																					 $section_id,
																					 'list',
																					 DEDALO_DATA_LANG,
																					 $section_tipo);
					$portal_xml_data_dato = $portal_xml_data_component->get_dato();
					if (!empty($portal_xml_data_dato)) {
						foreach ($portal_xml_data_dato as $portal_xml_data_locator) {
							$delete_section = section::get_instance($portal_xml_data_locator->section_id, $portal_xml_data_locator->section_tipo);
							$delete_section->Delete('delete_record');
						}
						$portal_xml_data_component->set_dato([]);
						$portal_xml_data_component->Save();
					}

				// parse XML file
					$parsed_data = xml_dcnav_parser::parse_file($file_full_path);
					if(SHOW_DEBUG===true) {
						dump($parsed_data, ' parsed_data from file ++++++++++++++++++++++ '.to_string($current_file_name));
					}						

				// iterate parsed_data as items. Each item is a rdf node with data. First node is 'description', the others are 'access_point'
					foreach ($parsed_data as $parsed_key => $parsed_item) {

						$parsed_item_type = $parsed_item->type; // like description / access_point
						
						$image_key = 0;
						foreach ($parsed_item->value as $item_value) {

							// create new section on each item
								$section_xml_data_tipo	= 'navarra34';
								$section_xml_data		= section::get_instance(null, $section_xml_data_tipo);
								$section_xml_data->Save();
								$section_xml_data_id	= $section_xml_data->get_section_id();

							// attach section locator to document xml data portal
								$locator = new locator();
									$locator->set_section_tipo($section_xml_data_tipo);
									$locator->set_section_id($section_xml_data_id);								
								$portal_xml_data_component->add_locator($locator);
								$portal_xml_data_component->Save();

							// parsed_key (component_number)
								$save_parsed_key = (function($tipo, $section_tipo, $section_id, $value) {

									$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
									$component		= component_common::get_instance($modelo_name,
																					 $tipo,
																					 $section_id,
																					 'list',
																					 DEDALO_DATA_NOLAN,
																					 $section_tipo);
									$component->set_dato( (int)$value );
									$result = $component->Save();

									return $result;
								})('navarra52', $section_xml_data_tipo, $section_xml_data_id, $parsed_key);
							
							// prefix (component_select)
								if (isset($item_value->prefix)) {
									$save_prefix = (function($tipo, $section_tipo, $section_id, $value) {

										// target list locator
										$locator = self::get_solved_select_value('navarra41', 'navarra43', $value);

										$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
										$component		= component_common::get_instance($modelo_name,
																						 $tipo,
																						 $section_id,
																						 'list',
																						 DEDALO_DATA_NOLAN,
																						 $section_tipo);
										$component->set_dato( $locator );
										$result = $component->Save();

										return $result;
									})('navarra36', $section_xml_data_tipo, $section_xml_data_id, $item_value->prefix);
								}

							// local (component_select)
								if (isset($item_value->local)) {
									$save_local = (function($tipo, $section_tipo, $section_id, $value) {

										// target list locator
										$locator = self::get_solved_select_value('navarra44', 'navarra46', $value);

										$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
										$component		= component_common::get_instance($modelo_name,
																						 $tipo,
																						 $section_id,
																						 'list',
																						 DEDALO_DATA_NOLAN,
																						 $section_tipo);
										$component->set_dato( $locator );
										$result = $component->Save();

										return $result;
									})('navarra37', $section_xml_data_tipo, $section_xml_data_id, $item_value->local);
								}

							// cmp (component_input_text)
								if (isset($item_value->cmp) && !empty($item_value->cmp)) {
									$save_cmp = (function($tipo, $section_tipo, $section_id, $value) {

										$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
										$component		= component_common::get_instance($modelo_name,
																						 $tipo,
																						 $section_id,
																						 'list',
																						 DEDALO_DATA_NOLAN,
																						 $section_tipo);
										$component->set_dato( [$value] );
										$result = $component->Save();

										return $result;
									})('navarra38', $section_xml_data_tipo, $section_xml_data_id, $item_value->cmp);
								}

							// tip (component_input_text)
								if (isset($item_value->tip) && !empty($item_value->tip)) {
									$save_tip = (function($tipo, $section_tipo, $section_id, $value) {

										$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
										$component		= component_common::get_instance($modelo_name,
																						 $tipo,
																						 $section_id,
																						 'list',
																						 DEDALO_DATA_NOLAN,
																						 $section_tipo);
										$component->set_dato( [$value] );
										$result = $component->Save();

										return $result;
									})('navarra39', $section_xml_data_tipo, $section_xml_data_id, $item_value->tip);
								}

							// value (component_input_text_large)
								if (isset($item_value->value) && !empty($item_value->value)) {
									$save_value = (function($tipo, $section_tipo, $section_id, $value) {

										$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
										$component		= component_common::get_instance($modelo_name,
																						 $tipo,
																						 $section_id,
																						 'list',
																						 DEDALO_DATA_NOLAN,
																						 $section_tipo);										
										$value_string = is_array($value)
											? implode(PHP_EOL, $value)
											: $value;
										$value_string = nl2br($value_string);

										$component->set_dato( $value_string );
										$result = $component->Save();

										return $result;
									})('navarra40', $section_xml_data_tipo, $section_xml_data_id, $item_value->value);
								}

							// images
								if (isset($item_value->local) && $item_value->local==='hasFormat' && !empty($item_value->value)) {										

									$image_file_name		= $item_value->value;
									$image_file_full_path	= $files_dir . $image_file_name;
									if (file_exists($image_file_full_path)) {

										$image_file_data = tool_import_files_dcnav::get_file_data($files_dir, $image_file_name);
										
										// add to images section
											$add_image_section = (function($images_component_tipo, $images_section_tipo, $image_file_data, $catalog_section_tipo, $catalog_section_id, &$image_key) {

												// dump($image_file_data, ' ++++++++++++++++ hasFormat images file_data: '.to_string());
												// dump($image_file_data, ' image_file_data ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ '.to_string());

												$code				= $image_file_data['file_name']; // like '0008-0011-0002'
												$images_code_tipo	= 'rsc21';

												// check already exists image. If not found record, auto create section
													$locator = self::get_solved_select_value($images_section_tipo, $images_code_tipo, $code);
													$images_section_id	= $locator->section_id;											

												// save component image
													$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($images_component_tipo,true);
													$component		= component_common::get_instance($modelo_name,
																									 $images_component_tipo,
																									 $images_section_id,
																									 'list',
																									 DEDALO_DATA_NOLAN,
																									 $images_section_tipo);
													$image_file_name = $image_file_data['file_name_full'];
													$component->set_dato( $image_file_name );
													$component->Save();

												// set image code 'rsc21'													
													$code_modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($images_code_tipo,true);
													$code_component		= component_common::get_instance($code_modelo_name,
																										 $images_code_tipo,
																										 $images_section_id,
																										 'list',
																										 DEDALO_DATA_NOLAN,
																										 $images_section_tipo);
													
													$code_component->set_dato( $code );
													$code_component->Save();

												// move and rename image file
													self::set_media_file($image_file_data, $images_component_tipo, $images_section_tipo, $images_section_id);

												// attach created image locator to catalog portal (navarra32)																									
													$portal_tipo = ($image_key===0)
														? 'navarra11'	// identitfy image case (the first one)
														: 'navarra32';	// aditional images case (next images)													
													$modelo_name_portal	= RecordObj_dd::get_modelo_name_by_tipo($portal_tipo,true);
													$component_portal	= component_common::get_instance($modelo_name_portal,
																										 $portal_tipo,
																										 $catalog_section_id,
																										 'list',
																										 DEDALO_DATA_NOLAN,
																										 $catalog_section_tipo);
													$locator = new locator();
														$locator->set_section_tipo($images_section_tipo);
														$locator->set_section_id($images_section_id);
														$locator->set_type(DEDALO_RELATION_TYPE_LINK);

													$component_portal->add_locator($locator);
													$component_portal->Save();												

												// up $image_key
													$image_key++;

												return true;
											})('rsc29', 'rsc170', $image_file_data, $section_tipo, $section_id, $image_key);

									}//end if (file_exists($image_file_full_path))									
								}//end if (isset($item_value->local) && $item_value->local==='hasFormat')

						}//end foreach ($parsed_item->value as $item_value)


						// description only (ignore access point). Send colected data to Catalog record when container is available
						if ($parsed_item_type==='description') {
						
							// titles. save catalog usefull data
								$titles = array_reduce($parsed_item->value, function($carry, $item){
									if ($item->local==='title' && !empty($item->value)) $carry[] = $item->value;
									return $carry;
								});
								if (!empty($titles)) {
									$save_titles = (function($tipo, $section_tipo, $section_id, $value) {

										$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
										$component		= component_common::get_instance($modelo_name,
																						 $tipo,
																						 $section_id,
																						 'list',
																						 DEDALO_DATA_LANG,
																						 $section_tipo);
										$component->set_dato( (array)$value );
										$result = $component->Save();

										return $result;
									})('navarra5', $section_tipo, $section_id, $titles);
								}

							// creador. (component_autocomplete) navarra6
								$creators = array_reduce($parsed_item->value, function($carry, $item){
									if ($item->local==='creator' && !empty($item->value)) $carry[] = $item->value;							
									return $carry;
								});
								if (!empty($creators)) {
									foreach ((array)$creators as $creator) {
										$save_creator = (function($tipo, $section_tipo, $section_id, $value) {

											// target list locator. Entities : name
											$locator = self::get_solved_select_value('rsc106', 'rsc116', $value);

											$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
											$component		= component_common::get_instance($modelo_name,
																							 $tipo,
																							 $section_id,
																							 'list',
																							 DEDALO_DATA_NOLAN,
																							 $section_tipo);
											$component->add_locator_to_dato( $locator );
											$result = $component->Save();

											return $result;
										})('navarra6', $section_tipo, $section_id, $creator);
									}
								}

							// language. (component_select_lang) navarra53
								$lang = array_reduce($parsed_item->value, function($carry, $item){
									if ($item->local==='language' && !empty($item->value)) $carry = $item->value;
									return $carry;
								});
								if (!empty($lang)) {
									$save_lang = (function($tipo, $section_tipo, $section_id, $value) {

										$lang_code	= lang::get_lang_code_from_alpha2($value); // like 'lg-spa' from 'es'
										$lang		= lang::get_lang_locator_from_code( $lang_code ); // like {"type":"dd151","section_id":"17344","section_tipo":"lg1"}

										$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
										$component		= component_common::get_instance($modelo_name,
																						 $tipo,
																						 $section_id,
																						 'list',
																						 DEDALO_DATA_NOLAN,
																						 $section_tipo);
										$component->set_dato( $lang );
										$result = $component->Save();

										return $result;
									})('navarra53', $section_tipo, $section_id, $lang);
								}

							// date. (component_date) navarra26
								// $date = array_reduce($parsed_item->value, function($carry, $item){
								// 	if ($item->local==='date' && !empty($item->value)) $carry = $item->value;
								// 	return $carry;
								// });
								$found = array_find($parsed_item->value, function($item){
									return ($item->local==='date' && !empty($item->value)); // first item only
								});
								if (!empty($found)) {
									$date = $found->value;
									$save_date = (function($tipo, $section_tipo, $section_id, $value) {

										// convert format 2020.06.09 to 2020-06-09
										$timestamp = str_replace(['.','/'], '-', $value);

										$dd_date = new dd_date();
										$dd_date->get_date_from_timestamp( $timestamp );

										$lang_code	= lang::get_lang_code_from_alpha2($value); // like 'lg-spa' from 'es'
										$lang		= lang::get_lang_locator_from_code( $lang_code ); // like {"type":"dd151","section_id":"17344","section_tipo":"lg1"}

										$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
										$component		= component_common::get_instance($modelo_name,
																						 $tipo,
																						 $section_id,
																						 'list',
																						 DEDALO_DATA_NOLAN,
																						 $section_tipo);
										$dato = new stdClass();
											$dato->start = $dd_date;
	                       
										$component->set_dato( [$dato] );
										$result = $component->Save();

										return $result;
									})('navarra26', $section_tipo, $section_id, $date);
								}

							// format. (component_select) navarra7
								$format = array_reduce($parsed_item->value, function($carry, $item){
									if ($item->local==='format' && !empty($item->value)) $carry[] = $item->value;
									return $carry;
								});
								if (!empty($format)) {
									$save_format = (function($tipo, $section_tipo, $section_id, $value) {

										$dato = [];
										foreach ((array)$value as $current_value) {
											$locator	= self::get_solved_select_value('rsc312', 'rsc315', $current_value);
											$dato[]		= $locator;
										}

										$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
										$component		= component_common::get_instance($modelo_name,
																						 $tipo,
																						 $section_id,
																						 'list',
																						 DEDALO_DATA_NOLAN,
																						 $section_tipo);
										$component->set_dato( $dato );
										$result = $component->Save();

										return $result;
									})('navarra7', $section_tipo, $section_id, $format);
								}

							// coverage. (component_text_area) navarra30
								// $coverage = array_reduce($parsed_item->value, function($carry, $item){
								// 	if ($item->local==='coverage' && !empty($item->value)) $carry[] = $item->value;
								// 	return $carry;
								// });
								// if (!empty($coverage)) {
								// 	$save_coverage = (function($tipo, $section_tipo, $section_id, $value) {

								// 		$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
								// 		$component		= component_common::get_instance($modelo_name,
								// 														 $tipo,
								// 														 $section_id,
								// 														 'list',
								// 														 DEDALO_DATA_LANG,
								// 														 $section_tipo);
								// 		$dato = implode('<br>',$value);
								// 		$component->set_dato( $dato );
								// 		$result = $component->Save();

								// 		return $result;
								// 	})('navarra30', $section_tipo, $section_id, $coverage);
								// }

							// description. (component_text_area) navarra30
								$description = array_reduce($parsed_item->value, function($carry, $item){
									if ($item->local==='description' && !empty($item->value)) $carry[] = $item->value;
									return $carry;
								});
								if (!empty($description)) {
									$save_description = (function($tipo, $section_tipo, $section_id, $value) {

										$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
										$component		= component_common::get_instance($modelo_name,
																						 $tipo,
																						 $section_id,
																						 'list',
																						 DEDALO_DATA_LANG,
																						 $section_tipo);
										$dato = implode('<br>',$value);
										$dato = nl2br($dato);
										$component->set_dato( $dato );
										$result = $component->Save();

										return $result;
									})('navarra30', $section_tipo, $section_id, $description);
								}

							// identifier. (component_input_text) navarra20
								$identifier = array_reduce($parsed_item->value, function($carry, $item){
									if ($item->local==='identifier' && !empty($item->value)) $carry[] = $item->value;
									return $carry;
								});
								if (!empty($identifier)) {
									$save_identifier = (function($tipo, $section_tipo, $section_id, $value) {

										$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
										$component		= component_common::get_instance($modelo_name,
																						 $tipo,
																						 $section_id,
																						 'list',
																						 DEDALO_DATA_LANG,
																						 $section_tipo);
										$component->set_dato( (array)$value );
										$result = $component->Save();

										return $result;
									})('navarra20', $section_tipo, $section_id, $identifier);
								}
						}


					}//end foreach ($parsed_data as $parsed_key => $parsed_item)


				// xml file. Move file from upload directory to xml_files_path						
					$target_path = $xml_files_path .'/'. $current_file_name;
					rename($file_full_path, $target_path);

				// link (component_iri) navarra54 
					$save_link = (function($tipo, $section_tipo, $section_id, $value) {

						$url 	= DEDALO_MEDIA_BASE_URL .'/import/xml/'. $value;
						$title 	= $value;

						$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
						$component		= component_common::get_instance($modelo_name,
																		 $tipo,
																		 $section_id,
																		 'list',
																		 DEDALO_DATA_NOLAN,
																		 $section_tipo);
						$dato = json_decode('
						[
							{
								"iri": "'.$url.'",
								"title": "'.$title.'"
							}
						]
						');


						$component->set_dato( $dato );
						$result = $component->Save();

						return $result;
					})('navarra54', $section_tipo, $section_id, $current_file_name);


				// attach to 'Catálogo Documental' documents portal
					$attach_document = (function($tipo, $section_tipo, $section_id, $code_tipo, $base_code1) {

						// find existing or creates new setion ($section_tipo, $component_tipo, $value, $filter=null)
						$locator	= self::get_solved_select_value($this->catalog_section_tipo, $code_tipo, $base_code1);

						// portal add document locator
						$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
						$component		= component_common::get_instance($modelo_name,
																		 $tipo,
																		 $locator->section_id,
																		 'list',
																		 DEDALO_DATA_NOLAN,
																		 $this->catalog_section_tipo);
						$add_locator = new locator();
							$add_locator->set_section_tipo($section_tipo);
							$add_locator->set_section_id($section_id);
							$add_locator->set_type(DEDALO_RELATION_TYPE_LINK);
						
						$component->add_locator($add_locator);

						$result = $component->Save();

						return $result;
					})('navarra59', $section_tipo, $section_id, $code_tipo, $base_code1);


				// Add as processed
					$processed_info = new stdClass();
						$processed_info->file_name	= $value_obj->file_name;
						$processed_info->section_id	= $section_id;
						$processed_info->file_data	= $file_data;
					$ar_processed[] = $processed_info;

				debug_log(__METHOD__." Imported files and data from $section_tipo".to_string(), logger::WARNING);

				$total++;
			}//end foreach ((array)$ar_data as $key => $value_obj)
		
		
		// response
			$response->result		= true;
			$response->msg			= 'Ok. Request done';
			$response->ar_processed	= $ar_processed;
			$response->ar_msg		= $ar_msg;


		return $response;
	}//end import_files


	/**
	* GET_SOLVED_SELECT_VALUE
	* Search for received value in section. If it found, returns locator, else create the new value
	* and returns the resultant locator 
	* @return object $locator
	*/
	public static function get_solved_select_value($section_tipo, $component_tipo, $value, $filter=null) {

		$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		$name			= RecordObj_dd::get_termino_by_tipo($component_tipo, DEDALO_DATA_LANG, true, true);

		// filter
			$filter_string = !empty($filter)
				? $filter
				: '{
					"$and": [
						{
							"q": "'.$value.'",
							"q_operator": "=",
							"q_split": false,
							"path": [
								{
									"section_tipo": "'.$section_tipo.'",
									"component_tipo": "'.$component_tipo.'",
									"modelo": "'.$modelo_name.'",
									"name": "'.$name.'"
								}
							]
						}
					]
				}';
		
		$sqo = json_decode('{
			"parsed": false,
			"section_tipo": "'.$section_tipo.'",
			"limit": 1,
			"offset": 0,
			"type": "search_json_object",
			"full_count": false,
			"order": false,
			"filter": '.$filter_string.',
			"select": []
		}');
		$search_development2	= new search_development2($sqo);
		$search_result			= $search_development2->search();
		$ar_records				= $search_result->ar_records;
		if(!empty($ar_records)) {
			// founded. Already created record
				$section_id = reset($ar_records)->section_id;
		}else{
			// no found. Create a new empty record
				$section	= section::get_instance(null, $section_tipo);
				$section->Save();
				$section_id	= $section->get_section_id();

			// save new value
				$code_component	= component_common::get_instance($modelo_name,
																 $component_tipo,
																 $section_id,
																 'list',
																 DEDALO_DATA_LANG,
																 $section_tipo);
				$dato = is_array($value) ? $value : [$value];
				$code_component->set_dato( $dato );
				$code_component->Save();

			debug_log(__METHOD__." Created new non existent record value: ".to_string($value), logger::WARNING);
		}

		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);
			$locator->set_type(DEDALO_RELATION_TYPE_LINK);
		
		return $locator;
	}//end get_solved_select_value


	
}//end class
