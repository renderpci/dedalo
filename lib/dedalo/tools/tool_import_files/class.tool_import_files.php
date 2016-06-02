<?php
/*
* CLASS TOOL_IMPORT_FILES
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');



class tool_import_files extends tool_common {
	
	
	protected $component_obj;	# received section	
	protected $valid_extensions;
	


	public function __construct($component_obj, $modo='button') {
				
		# Fix modo
		$this->modo = $modo;

		# Fix current component/section
		$this->component_obj = $component_obj;	
			#dump($component_obj, ' component_obj ++ '.to_string());

		$this->set_up();
	}


	/**
	* SET_UP
	*/
	public function set_up() {

		# VERIFY USER IS LOGGED
		if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

		

		$user_id 		= $_SESSION['dedalo4']['auth']['user_id'];
		$media_folder 	= DEDALO_IMAGE_FOLDER;
		$tipo 			= isset($_GET['t']) ? $_GET['t'] : '';	// When varname is t (default page call)
		$tipo 			= isset($_REQUEST['tipo']) ? $_REQUEST['tipo'] : $tipo;	// When varname is tipo fallback

		# UPLOAD_DIR_CUSTOM is section_tipo
		$upload_dir_custom = isset($tipo) ? '/'.$tipo : '';
		if (empty($upload_dir_custom)) {
			trigger_error(__METHOD__." WARNING TOOL_IMPORT_FILES: EMPTY upload_dir_custom: $upload_dir_custom");
		}

		# TOOL IMPORT IMAGES
		define('TOOL_IMPORT_FILES_UPLOAD_DIR', DEDALO_MEDIA_BASE_PATH.$media_folder.'/temp'.'/files/'.'user_'.$user_id.$upload_dir_custom.'/');
		define('TOOL_IMPORT_FILES_UPLOAD_URL', DEDALO_MEDIA_BASE_URL .$media_folder.'/temp'.'/files/'.'user_'.$user_id.$upload_dir_custom.'/');
		#dump(TOOL_IMPORT_FILES_UPLOAD_DIR, 'TOOL_IMPORT_FILES_UPLOAD_DIR');

		# FILES HANDLER
		define('TOOL_IMPORT_FILES_HANDLER_URL', DEDALO_LIB_BASE_URL.'/tools/tool_import_files/inc/files_handler.php?t='.$tipo);

		# EXTENSIONS (ARRAY OF VALID EXTENSIONS)
		$this->valid_extensions = array('jpg',
										'jpeg',
										'tif',
										'tiff',
										'psd',
										'bmp',
										'png',
										'pdf',
										'raw');

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
		#dump($ar_data,'$ar_data');
		
		return $ar_data;
	}


	
	


	/**
	* GET_FILE_DATA
	* Extrae información de la imágen recibida usando una expresión regular para interpretar un patrón dado
	* Devuelve un array con los datos extraidos
	*/
	function get_file_data( $dir, $file ) {	// , $regex="/(\d*)[-|_]?(\d*)_?(\w{0,}\b.*)\.([a-zA-Z]{3,4})\z/" 	

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
		$ar_data['image']['image_preview_url']	= DEDALO_LIB_BASE_URL . '/tools/tool_import_files/foto_preview.php?f='.$ar_data['file_path'];
			#dump($ar_data, ' ar_data');
		
		return $ar_data;
	}



	/**
	* PROPAGATE_TEMP_SECTION_DATA
	* @param object $temp_section_data
	* @param object $current_section
	*/
	public function propagate_temp_section_data($temp_section_data, $section_tipo, $section_id) {		

		$ar_current_component = reset($temp_section_data);
		foreach ($ar_current_component as $current_tipo => $current_component) {

			$RecordObj_dd 	= new RecordObj_dd($current_tipo);
			$traducible  	= $RecordObj_dd->get_traducible();
			if ($traducible!='si') {
				$current_lang = DEDALO_DATA_NOLAN;
			}else{
				$current_lang = DEDALO_DATA_LANG;
			}
			
			$component_dato_current_lang = $current_component->dato->$current_lang;

			if (!isset($component_dato_current_lang)) {
				if(SHOW_DEBUG) {
					dump($current_component, ' $current_component ++ '.to_string());
					trigger_error("Error: element $current_tipo without dato");
				}
				continue;
			}			
			
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
			$component 	 = component_common::get_instance($modelo_name, $current_tipo, $section_id, 'edit', $current_lang, $section_tipo);
			$component->set_dato( $component_dato_current_lang );
			$component->Save();
			
		}//end foreach ($temp_section_data as $key => $value) {

		return true;

	}#end propagate_temp_section_data



	/**
	* SET_MEDIA_FILE
	* Insert in target section, current uploaded file
	* @param array $current_file
	* @param string tipo $target_section_tipo
	* @param int section_id $current_section_id
	* @param string tipo $target_component 
	* @return (bool)
	*/
	public function set_media_file($current_file, $target_section_tipo, $current_section_id, $tool_propiedades) {

		$target_component 	= $tool_propiedades->target_component;
		$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($target_component,true);

		switch ($modelo_name) {
			case 'component_image':
				
				#
				# COMPONENT IMAGE 
				# (Is autosaved with defaults on create)
				$component 	 = component_common::get_instance($modelo_name, $target_component, $current_section_id, 'edit', DEDALO_DATA_LANG, $target_section_tipo);				

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


				#
				# TARGET_FILENAME 
				# Save original file name in a component_input_text
				if (isset($tool_propiedades->target_filename)) {
					$modelo_name_target_filename= RecordObj_dd::get_modelo_name_by_tipo($tool_propiedades->target_filename,true);
					$component_target_filename 	= component_common::get_instance($modelo_name_target_filename, $tool_propiedades->target_filename, $current_section_id, 'edit', DEDALO_DATA_LANG, $target_section_tipo);
					$component_target_filename->set_dato( $file_name_full );
					$component_target_filename->Save();
				}

				#
				# TARGET_DATE (From exif)
				# Save original file date in a component_date if actual component date is empty
				if (isset($tool_propiedades->target_date)) {
					$modelo_name_target_date= RecordObj_dd::get_modelo_name_by_tipo($tool_propiedades->target_date,true);
					$component_target_date 	= component_common::get_instance($modelo_name_target_date, $tool_propiedades->target_date, $current_section_id, 'edit', DEDALO_DATA_LANG, $target_section_tipo);
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
						#dump($DateTimeOriginal, " $DateTimeOriginal ".to_string($command));	
						if ($DateTimeOriginal && !empty($DateTimeOriginal)) {
							
							$dd_date 			= new dd_date();							
							$original_dato 		= (string)$DateTimeOriginal;

							$regex   = "/^(-?[0-9]+)-?:?\/?.?([0-9]+)?-?:?\/?.?([0-9]+)? ?([0-9]+)?:?([0-9]+)?:?([0-9]+)?/";
							preg_match($regex, $original_dato, $matches);    
							  #dump($matches, ' matches');
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
				$original_path 		= DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER .'/'. DEDALO_IMAGE_QUALITY_ORIGINAL .''. $aditional_path;
				$original_file_path = $original_path .'/'. $image_id . '.'.strtolower($extension); 
				if( !is_dir($original_path) ) {
					if(!mkdir($original_path, 0777,true)) {
						throw new Exception(" Error on read or create directory. Permission denied $original_path");
					}
				}
				
				# Copiamos el original
				if (!copy($source_full_path, $original_file_path)) {
				    throw new Exception("<div class=\"info_line\">ERROR al copiar ".$source_full_path." a ".$original_file_path."</div>");
				}

				# JPG : la convertimos a jpg si no lo es ya
				if (strtolower($extension)!=strtolower(DEDALO_IMAGE_EXTENSION)) {
					$original_file_path_jpg = DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER .'/'. DEDALO_IMAGE_QUALITY_ORIGINAL .''. $aditional_path .'/'. $image_id .'.'. DEDALO_IMAGE_EXTENSION;
					ImageMagick::convert($original_file_path, $original_file_path_jpg );
					#chmod($original_file_path, 0777);
					#chmod($original_file_path_jpg, 0777);
				}

				# DEFAULT QUALITY
				# Generate dedalo default quality version (usually 1.5MB) and thumb image
				# $default_quality_image = DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER .'/'. DEDALO_IMAGE_QUALITY_DEFAULT .'/'. $image_id  .'.'. DEDALO_IMAGE_EXTENSION;				
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
		
	}#end set_media_file


	
}#end class
?>