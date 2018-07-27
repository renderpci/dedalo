<?php
/*
* CLASS TOOL_IMPORT_IMAGES
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# UPLOAD_DIR_CUSTOM is button_tipo
$upload_dir_custom = isset($_REQUEST['button_tipo']) ? '/'.safe_xss($_REQUEST['button_tipo']) : '';
if (empty($upload_dir_custom)) {
	debug_log(__METHOD__." WARNING TOOL_IMPORT_IMAGES: EMPTY upload_dir_custom: $upload_dir_custom".to_string(), logger::WARNING);
}

# TOOL IMPORT IMAGES
define('TOOL_IMPORT_IMAGES_UPLOAD_DIR'	, DEDALO_MEDIA_BASE_PATH . DEDALO_IMAGE_FOLDER .'/temp'.'/files/' .'user_'.$_SESSION['dedalo4']['auth']['user_id'].$upload_dir_custom.'/' );
define('TOOL_IMPORT_IMAGES_UPLOAD_URL'	, DEDALO_MEDIA_BASE_URL  . DEDALO_IMAGE_FOLDER .'/temp'.'/files/' .'user_'.$_SESSION['dedalo4']['auth']['user_id'].$upload_dir_custom.'/');
#dump(TOOL_IMPORT_IMAGES_UPLOAD_DIR, 'TOOL_IMPORT_IMAGES_UPLOAD_DIR');


class tool_import_images extends tool_common {
	
	
	protected $component_obj;	# received section
	protected $button_import_propiedades;
	#protected $process_script_folder;
	protected $valid_extensions;


	public function __construct($component_obj, $modo='button') {
			
		# Fix modo
		$this->modo = $modo;

		# Fix current component/section
		$this->component_obj = $component_obj;

		# Note that 'component_obj' is really a section
		$this->section_tipo = $this->component_obj->get_tipo();

		/* pasado a controlador -> page
		# Fix parameters
		$button_import_obj = $this->get_button_import_obj();
		*/

		#$this->process_script_folder = 'process_script';

		$this->valid_extensions = array('jpg','jpeg','tif','tiff','psd','bmp','png','pdf');

	}


	/**
	* GET_BUTTON_IMPORT_OBJ
	* @param string $button_tipo (Request 'button_tipo')
	* @return button $button_import_obj
	* Get button tipo fron url vars and build button object and fix $this->button_import_propiedades where are custom options
	*/
	function get_button_import_obj( $button_tipo=null ) {

		if ($button_tipo===null) { // From REQUEST
			$vars = array('button_tipo');
				foreach($vars as $name) $$name = common::setVar($name);
		}		

		if(empty($button_tipo)) {
			throw new Exception("Error Processing Request. button_tipo not found", 1);
		}

		$button_import_obj = new button_import($button_tipo, null, $this->section_tipo);
			#dump($button_import_obj,'button_import_obj');

		$propiedades = json_handler::decode($button_import_obj->RecordObj_dd->get_propiedades());

		# Fix propiedades
		$this->button_import_propiedades = $propiedades;
			#dump($propiedades, ' propiedades ++ '.to_string());

		return $button_import_obj;
	}


	/**
	* FIND_ALL_IMAGE_FILES
	* Read dir (can be accessible)
	*/
	public function find_all_image_files($dir, $recursive=false) {		

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
	function get_file_data( $dir, $file_name ) {	// , $regex="/(\d*)[-|_]?(\d*)_?(\w{0,}\b.*)\.([a-zA-Z]{3,4})\z/" 	

		$ar_data = array();
		#$target_component_tipo = $this->button_import_propiedades->campo_destino;
			#if(empty($target_component_tipo)) throw new Exception("Error Processing Request", 1);

		##
		# REGEX
		# Para cada caso será distinto oel patrón regex. Incluiremos la definición de la expresión regular al principio del script
		# en formato tipo imagenes_mupreva : $regex = "/((\w+)-(\d*)).([a-zAZ]+)\z/";
		$process=0; 
		#require(DEDALO_LIB_BASE_PATH . $this->button_import_propiedades->process_script);
		#$regex = "/((\w+)-(\d*)).([a-zAZ]+)\z/";


		#if(empty($regex)) throw new Exception("Error Processing Request. Empty var regex in import script. Please define var in first line of script", 1);	

		if (!defined('IMPORT_VERIFY_FILE_NAME')) {
			define('IMPORT_VERIFY_FILE_NAME', true);
		}	

		/*
		Regex para 04582_01_EsCuieram_Terracota_AD_ORIG.JPG "/(\d*)[-|_]?(\d*)_?(\w{0,}\b.*)\.([a-zA-Z]{3,4})\z/" o '((\w+)-(\d*)).([a-zAZ]+)\z'		
			[0] => 04582_01_EsCuieram_Terracota_AD_ORIG.JPG
		    [1] => 04582
		    [2] => 01
		    [3] => EsCuieram_Terracota_AD_ORIG
		    [4] => JPG
		*//*
		preg_match($regex, $file_name, $ar_value);
			#dump($ar_value,'value '.$file_name);

		# FORMAT TEST : Verify all preg_match is ok
		for ($i=0; $i < 5; $i++) {

			if(empty($ar_value[$i])) {

				switch ($i) {
					case 0:
						return $ar_data['INFO']="<span class=\"error\"> ".label::get_label('formato_incorrecto')." [$i] - ".label::get_label('nombre_fichero')." ($file_name)</span>";
						break;
					case 1:
						return $ar_data['INFO']="<span class=\"error\"> ".label::get_label('formato_incorrecto')." [$i] - ".label::get_label('numero_inventario')." ($file_name)</span>";
						break;
					case 2:
						#return $ar_data['INFO']="<span class=\"error\"> ".label::get_label('formato_incorrecto')." [$i] - ".label::get_label('numero_recurso')." ($file_name)</span>";
						$ar_value[2] = 1;  # numero_recurso Info fichero ([2]) es opcional. Si no existe, lo rellenamos con valor 1
						break;
					case 3:
						$ar_value[3] = ' '; # Info fichero ([3]) es opcional. Si no existe, lo rellenamos con un espacio
						break;
					case 4:
						return $ar_data['INFO']="<span class=\"error\"> ".label::get_label('formato_incorrecto')." [$i] - ".label::get_label('extension')." ($file_name)</span>";
						break;
				}
			}#end if(empty($ar_value[$i]))
		}#end for ($i=0; $i < 5; $i++)

		# AR_DATA
		$ar_data['dir_path'] 					= $dir; 				# /Users/dedalo/media/media_mupreva/image/temp/files/user_1/
		$ar_data['file_path'] 					= $dir.$file_name; 		# /Users/dedalo/media/media_mupreva/image/temp/files/user_1/45001-1.jpg
		$ar_data['nombre_fichero'] 				= $ar_value[0]; 		# 04582_01_EsCuieram_Terracota_AD_ORIG
		$ar_data['nombre_fichero_completo'] 	= $file_name; 			# $ar_value[0]; # 04582_01_EsCuieram_Terracota_AD_ORIG.JPG
		$ar_data['numero_inventario']			= intval($ar_value[1]); # 04582
		$ar_data['numero_recurso']				= intval($ar_value[2]);	# 01
		$ar_data['info_fichero']				= $ar_value[3];			# EsCuieram_Terracota_AD_ORIG
		$ar_data['extension'] 					= $ar_value[4];			# JPG (respetamos mayúsculas/minúsculas)
		$ar_data['nombre_automatico'] 			= $target_component_tipo.'-'.$ar_data['numero_recurso']; # dd750-1
		$ar_data['tamano_archivo'] 				= number_format(filesize($ar_data['file_path'])/1024/1024,3)." MB"; # 1.7 MB
		
		$ar_data['imagen']['image_url'] 		= DEDALO_ROOT_WEB . "/inc/img.php?s=".$ar_data['file_path'];
		$ar_data['imagen']['image_preview_url']	= DEDALO_LIB_BASE_URL . '/tools/tool_import_images/foto_preview.php?f='.$ar_data['file_path'];
		*/

		$nombre_fichero = pathinfo($file_name,PATHINFO_FILENAME);
		$extension 		= pathinfo($file_name,PATHINFO_EXTENSION);
		
		# AR_DATA
		$ar_data['dir_path'] 					= $dir; 				# /Users/dedalo/media/media_mupreva/image/temp/files/user_1/
		$ar_data['file_path'] 					= $dir.$file_name; 		# /Users/dedalo/media/media_mupreva/image/temp/files/user_1/45001-1.jpg
		$ar_data['nombre_fichero'] 				= $nombre_fichero; 		# 04582_01_EsCuieram_Terracota_AD_ORIG
		$ar_data['nombre_fichero_completo'] 	= $file_name; 			# $ar_value[0]; # 04582_01_EsCuieram_Terracota_AD_ORIG.JPG
		#$ar_data['numero_inventario']			= intval($ar_value[1]); # 04582
		#$ar_data['numero_recurso']				= intval($ar_value[2]);	# 01
		#$ar_data['info_fichero']				= $ar_value[3];			# EsCuieram_Terracota_AD_ORIG
		$ar_data['extension'] 					= $extension;			# JPG (respetamos mayúsculas/minúsculas)
		#$ar_data['nombre_automatico'] 			= $target_component_tipo.'-'.$ar_data['numero_recurso']; # dd750-1
		$ar_data['tamano_archivo'] 				= number_format(filesize($ar_data['file_path'])/1024/1024,3)." MB"; # 1.7 MB
		
		$ar_data['imagen']['image_url'] 		= DEDALO_ROOT_WEB . "/inc/img.php?s=".$ar_data['file_path'];
		$ar_data['imagen']['image_preview_url']	= DEDALO_LIB_BASE_URL . '/tools/tool_import_images/foto_preview.php?f='.$ar_data['file_path'];
			#dump($ar_data, ' ar_data');
		
		return $ar_data;
	}

	
	
	/**
	* NUMERO_TO_LOCAL_PATH
	* Usado para crear 'aditional_path' en archivos que agrupan sus archivos en subcarpetas tipo 45000/45100
	* como por ejemplo el MUPREVA
	*/
	public static function numero_to_local_path($numero, $levels) {

		$numero = intval($numero);
		if ($numero<1) {
			return false;
		}
		$levels = intval($levels);
		if ($levels<1) {
			return false;
		}

		$ar_folder=array();
		
		# Calcualmos cada una de las carpetas
		#$numero=42136;
		#$levels = 2;
		for ($i=$levels; $i >= 1 ; $i--) { 
			$n = pow(10, $i+1);
			$ar_folder[$i] = floor($numero / $n) * $n;
		}

		# Creamos el path final
		$path_final = '/'.implode('/', $ar_folder);
			#dump($path_final,'path_final for '.$numero);
	
		return $path_final;
	}


	/**
	* GET_INVENTORY_SECTION_ID
	* Return section_id of Inventory record searched by 'numero_inventario' as value in field 'component_tipo'
	* @param string $component_tipo 
	* @param string $numero_inventario
	*/
	public static function get_inventory_section_id($component_tipo, $section_tipo, $numero_inventario) {
		global $log_messages;
		$inventory_section_id = null;

		static $ar_inventory_section_id;

		if (isset($ar_inventory_section_id[$numero_inventario])) {
			#error_log("From cache $numero_inventario: ".$ar_inventory_section_id[$numero_inventario]);
			return $ar_inventory_section_id[$numero_inventario];
		}

		$matrix_table		= common::get_matrix_table_from_tipo($section_tipo);
		#$strQuery='
		#SELECT id FROM "'.$matrix_table.'"
		#WHERE
		#datos @> \'{"components":{"'.$component_tipo.'":{"dato":{"lg-nolan":"'.$numero_inventario.'"}}}}\'::jsonb
		#ORDER BY id ASC
		#LIMIT 1
		#';
		$strQuery=" -- tool_import_imagenes: get_inventory_section_id
		SELECT section_id FROM \"$matrix_table\"
		WHERE
		section_tipo = '$section_tipo' AND
		datos #> '{components,$component_tipo,dato}' @> '{\"lg-nolan\":\"$numero_inventario\"}'::jsonb
		ORDER BY id ASC
		";
		#dump($strQuery, 'strQuery'); #die();
		$result		= JSON_RecordObj_matrix::search_free($strQuery);
		$ar_result 	= pg_fetch_assoc($result);
			#dump($ar_result['section_id']," ar_result $strQuery ");

		if(empty($ar_result['section_id'])) {
			$log_messages = "<div class=\"warning\">La ficha de inventario con número '$numero_inventario' no existe en 'Inventario'. Será ignorada</div>";
			$msg = __METHOD__." Warning: La ficha de inventario con número '$numero_inventario' no existe en 'Inventario'";
			if(SHOW_DEBUG) {
				#dump($strQuery, "DEBUG ONLY WARNING: strQuery $msg ");
			 	#error_log($msg);
			 }
		}else{
			$inventory_section_id = (int)$ar_result['section_id'];
		}

		$ar_inventory_section_id[$numero_inventario] = $inventory_section_id;

		return $inventory_section_id;
	}









	/**
	* GET_FILE_DATA_STATIC
	* Extrae información de la imágen recibida usando una expresión regular para interpretar un patrón dado
	* Devuelve un array con los datos extraidos
	*/
	static function get_file_data_static( $dir, $file_name, $regex='/(.*).([a-zA-Z]{3,4})\z/' ) {

		$ar_data = array();	

		#$regex = '/(.*).([a-zA-Z]{3,4})\z/';
		preg_match($regex, $file_name, $ar_value);

		
		# AR_DATA
		$ar_data['dir_path'] 					= $dir; 				# /Users/dedalo/media/media_mupreva/image/temp/files/user_1/
		$ar_data['file_path'] 					= $dir.$file_name; 		# /Users/dedalo/media/media_mupreva/image/temp/files/user_1/45001-1.jpg
		$ar_data['nombre_fichero'] 				= $ar_value[1]; 			# 04582_01_EsCuieram_Terracota_AD_ORIG
		$ar_data['nombre_fichero_completo'] 	= $file_name; 			# $ar_value[0]; # 04582_01_EsCuieram_Terracota_AD_ORIG.JPG	
		$ar_data['extension'] 					= $ar_value[2];			# JPG (respetamos mayúsculas/minúsculas)		
		$ar_data['tamano_archivo'] 				= number_format(filesize($ar_data['file_path'])/1024/1024,3)." MB"; # 1.7 MB
		
		$ar_data['imagen']['image_url'] 		= DEDALO_ROOT_WEB . "/inc/img.php?s=".$ar_data['file_path'];
		$ar_data['imagen']['image_preview_url']	= DEDALO_LIB_BASE_URL . '/tools/tool_import_images/foto_preview.php?f='.$ar_data['file_path'];
		/*
		$colorspace_info  						= shell_exec( MAGICK_PATH . "identify " .$ar_data['file_path']);
		$fecha_info  							= shell_exec( MAGICK_PATH. "identify -format '%[EXIF:DateTimeOriginal]' ".$ar_data['file_path']);
		#$fecha_info2  							= shell_exec( MAGICK_PATH. "identify -format %[EXIF:DateTime] ".$ar_data['file_path']);
		$ar_data['imagen_info'] 				= str_replace($ar_data['file_path'], '', $colorspace_info) . " DateTimeOriginal: $fecha_info ";
		*/
			#dump($ar_value, " ar_value ".to_string());
		return $ar_data;
	}

	
}#end class
?>