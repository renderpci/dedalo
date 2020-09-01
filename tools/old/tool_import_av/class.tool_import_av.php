<?php
/*
* CLASS TOOL_IMPORT_AV
*/
require_once( DEDALO_CONFIG_PATH .'/config.php');

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# UPLOAD_DIR_CUSTOM is button_tipo
$var_requested 		= common::get_request_var('button_tipo');
$upload_dir_custom  = !empty($var_requested) ? '/'.$var_requested : '';
if (empty($upload_dir_custom)) {
	error_log("WARNING TOOL_IMPORT_AV: EMPTY upload_dir_custom");
}

# TOOL IMPORT IMAGES
define('TOOL_IMPORT_AV_UPLOAD_DIR'	, DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER .'/temp'.'/files/' .'user_'.$_SESSION['dedalo']['auth']['user_id'].$upload_dir_custom.'/' );
define('TOOL_IMPORT_AV_UPLOAD_URL'	, DEDALO_MEDIA_URL  . DEDALO_AV_FOLDER .'/temp'.'/files/' .'user_'.$_SESSION['dedalo']['auth']['user_id'].$upload_dir_custom.'/');


class tool_import_av extends tool_common {


	protected $component_obj;	# received section
	protected $button_import_properties;
	#protected $process_script_folder;
	protected $valid_extensions;


	public function __construct($component_obj, $modo='button') {

		# Fix modo
		$this->modo = $modo;

		# Fix current component/section
		$this->component_obj = $component_obj;


		$this->section_tipo  = $component_obj->get_section_tipo();

		/* pasado a controlador -> page
		# Fix parameters
		$button_import_obj = $this->get_button_import_obj();
		*/

		#$this->process_script_folder = 'process_script';

		$this->valid_extensions = unserialize(DEDALO_AV_EXTENSIONS_SUPPORTED); // 'mp4','wave','wav','aiff','aif','mp3'
	}


	/**
	* GET_BUTTON_IMPORT_OBJ
	* @param string $button_tipo (Request 'button_tipo')
	* @return button $button_import_obj
	* Get button tipo fron url vars and build button object and fix $this->button_import_properties where are custom options
	*/
	function get_button_import_obj( $button_tipo=null ) {

		if ($button_tipo==null) { // From REQUEST
			$vars = array('button_tipo');
				foreach($vars as $name) $$name = common::setVar($name);
		}


		if(empty($button_tipo)) {
			throw new Exception("Error Processing Request. button_tipo not found", 1);
		}

		$button_import_obj = new button_import($button_tipo, null, $this->section_tipo);

		$properties = $button_import_obj->RecordObj_dd->get_properties();

		# Fix properties
		$this->button_import_properties = $properties;

		return $button_import_obj;
	}


	/**
	* FIND_ALL_AV_FILES
	* Read dir (can be accessible)
	*/
	public function find_all_av_files($dir, $recursive=false) {

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
	}




	/**
	* GET_FILE_DATA
	* Extrae información de la imágen recibida usando una expresión regular para interpretar un patrón dado
	* Devuelve un array con los datos extraidos
	*/
	function get_file_data( $dir, $file_name ) {	// , $regex="/(\d*)[-|_]?(\d*)_?(\w{0,}\b.*)\.([a-zA-Z]{3,4})\z/"

		$ar_data = array();
		#$target_component_tipo = $this->button_import_properties->campo_destino;
			#if(empty($target_component_tipo)) throw new Exception("Error Processing Request", 1);

		##
		# REGEX
		# Para cada caso será distinto oel patrón regex. Incluiremos la definición de la expresión regular al principio del script
		# en formato tipo imagenes_mupreva : $regex = "/((\w+)-(\d*)).([a-zAZ]+)\z/";
		$process=0;
		#require(DEDALO_CORE_PATH . $this->button_import_properties->process_script);
		#$regex = "/((\w+)-(\d*)).([a-zAZ]+)\z/";


		#if(empty($regex)) throw new Exception("Error Processing Request. Empty var regex in import script. Please define var in first line of script", 1);

		if (!defined('IMPORT_VERIFY_FILE_NAME')) {
			define('IMPORT_VERIFY_FILE_NAME', true);
		}


		$nombre_fichero = pathinfo($file_name,PATHINFO_FILENAME);
		$extension 		= pathinfo($file_name,PATHINFO_EXTENSION);

		# AR_DATA
		$ar_data['dir_path'] 					= $dir; 				# /Users/dedalo/media/media_mupreva/image/temp/files/user_1/
		$ar_data['file_path'] 					= $dir.$file_name; 		# /Users/dedalo/media/media_mupreva/image/temp/files/user_1/45001-1.jpg
		$ar_data['nombre_fichero'] 				= $nombre_fichero; 		# 04582_01_EsCuieram_Terracota_AD_ORIG
		$ar_data['nombre_fichero_completo'] 	= $file_name; 			# $ar_value[0]; # 04582_01_EsCuieram_Terracota_AD_ORIG.JPG
		$ar_data['extension'] 					= $extension;			# JPG (respetamos mayúsculas/minúsculas)
		$ar_data['tamano_archivo'] 				= number_format(filesize($ar_data['file_path'])/1024/1024,3)." MB"; # 1.7 MB
		#$ar_data['imagen']['image_url'] 		= DEDALO_ROOT_WEB . "/inc/img.php?s=".$ar_data['file_path'];
		#$ar_data['imagen']['image_preview_url']	= DEDALO_CORE_URL . '/tools/tool_import_av/foto_preview.php?f='.$ar_data['file_path'];

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

		return $path_final;
	}





}#end class
?>
