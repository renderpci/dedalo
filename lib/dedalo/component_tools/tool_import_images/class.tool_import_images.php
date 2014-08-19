<?php
/*
* CLASS TOOL_IMPORT_IMAGES
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

# TOOL IMPORT IMAGES
define('TOOL_IMPORT_IMAGES_UPLOAD_DIR'	, DEDALO_MEDIA_BASE_PATH . DEDALO_IMAGE_FOLDER .'/temp'.'/files/' .'user_'.$_SESSION['auth4']['userID_matrix'].'/' );
define('TOOL_IMPORT_IMAGES_UPLOAD_URL'	, DEDALO_MEDIA_BASE_URL  . DEDALO_IMAGE_FOLDER .'/temp'.'/files/' .'user_'.$_SESSION['auth4']['userID_matrix'].'/' );


class tool_import_images extends tool_common {
	
	# received component
	protected $component_obj ;
	protected $button_import_propiedades;
	protected $process_script_folder;
	protected $valid_extensions;


	public function __construct($component_obj, $modo='button') {
		
		# Fix modo
		$this->modo = $modo;

		# Fix current component
		$this->component_obj = $component_obj;


		# Fix parameters
		$button_import_obj = $this->get_button_import_obj();

		$this->process_script_folder = 'process_script';

		$this->valid_extensions = array('jpg','jpeg','tif','tiff','psd','bmp','png');

		
	}


	function get_button_import_obj() {

		$vars = array('button_tipo');foreach($vars as $name) $$name = common::setVar($name);

		if(empty($button_tipo)) {
			throw new Exception("Error Processing Request. button_tipo not found", 1);
		}			

		$button_import_obj = new button_import($button_tipo,null);
			#dump($button_import_obj,'button_import_obj');

		$propiedades = json_handler::decode($button_import_obj->RecordObj_ts->get_propiedades());

		# Fix propiedades
		$this->button_import_propiedades = $propiedades;

		return $button_import_obj;
	}


	/**
	* FIND_ALL_IMAGE_FILES
	* Read dir (can be accessible)
	*/
	public function find_all_image_files($dir, $recursive=false) {		

		$ar_data = array();
		$root 	= scandir($dir);
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
		#dump($ar_data,'$ar_data');
		return $ar_data;
	}




	/**
	* GET_FILE_DATA
	* Extrae información de la imágen recibida usando una expresión regular para interpretar un patrón dado
	* Devuelve un array con los datos extraidos
	*/
	function get_file_data($dir, $file_name) {		

		$ar_data = array();
		$target_component_tipo = $this->button_import_propiedades->campo_destino;
			if(empty($target_component_tipo)) throw new Exception("Error Processing Request", 1);				

		##
		# REGEX
		# Para cada caso será distinto oel patrón regex. Incluiremos la definición de la expresión regular al principio del script
		# en formato tipo imagenes_mupreva : $regex = "/((\w+)-(\d*)).([a-zAZ]+)\z/";
		$process=0; 
		require($this->process_script_folder . $this->button_import_propiedades->script_proceso);
		#$regex = "/((\w+)-(\d*)).([a-zAZ]+)\z/";

		if(empty($regex)) throw new Exception("Error Processing Request. Empty var regex in import script. Please define var in first line of script", 1);		

		/*
		Regex para 04582_01_EsCuieram_Terracota_AD_ORIG.JPG "/(\d*)[-|_]?(\d*)_?(\w{0,}\b.*)\.([a-zA-Z]{3,4})\z/" o '((\w+)-(\d*)).([a-zAZ]+)\z'		
			[0] => 04582_01_EsCuieram_Terracota_AD_ORIG.JPG
		    [1] => 04582
		    [2] => 01
		    [3] => EsCuieram_Terracota_AD_ORIG
		    [4] => JPG
		*/
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
						return $ar_data['INFO']="<span class=\"error\"> ".label::get_label('formato_incorrecto')." [$i] - ".label::get_label('numero_recurso')." ($file_name)</span>";
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
		$ar_data['dir_path'] 				= $dir; 				# /Users/dedalo/media/media_mupreva/image/temp/files/user_1/
		$ar_data['file_path'] 				= $dir.$file_name; 		# /Users/dedalo/media/media_mupreva/image/temp/files/user_1/45001-1.jpg
		$ar_data['nombre_fichero'] 			= $ar_value[0]; 		# 04582_01_EsCuieram_Terracota_AD_ORIG
		$ar_data['nombre_fichero_completo'] = $file_name; 			# $ar_value[0]; # 04582_01_EsCuieram_Terracota_AD_ORIG.JPG
		$ar_data['numero_inventario']		= intval($ar_value[1]); # 04582
		$ar_data['numero_recurso']			= intval($ar_value[2]);	# 01
		$ar_data['info_fichero']			= $ar_value[3];			# EsCuieram_Terracota_AD_ORIG
		$ar_data['extension'] 				= $ar_value[4];			# JPG (respetamos mayúsculas/minúsculas)
		$ar_data['nombre_automatico'] 		= $target_component_tipo.'-'.$ar_data['numero_recurso']; # dd750-1
		$ar_data['tamano_archivo'] 			= number_format(filesize($ar_data['file_path'])/1024/1024,3)." MB"; # 1.7 MB
		
		$ar_data['imagen']['image_url'] 		= DEDALO_ROOT_WEB . "/inc/img.php?s=".$ar_data['file_path'];
		$ar_data['imagen']['image_preview_url']	= DEDALO_LIB_BASE_URL . '/component_tools/tool_import_images/foto_preview.php?f='.$ar_data['file_path'];
		$colorspace_info  						= shell_exec( MAGICK_PATH . "identify " .$ar_data['file_path']);
		$ar_data['imagen_info'] 				= str_replace($ar_data['file_path'], '', $colorspace_info);
		
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





	
}#end class
?>