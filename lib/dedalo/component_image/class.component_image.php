<?php
/*
* CLASS COMPONENT IMAGE
*/
require_once(DEDALO_LIB_BASE_PATH . '/media_engine/class.ImageObj.php');


class component_image extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	# file name formated as 'tipo'-'order_id' like dd732-1
	public $image_id ;
	public $image_url ;
	public $quality ;

	public $target_filename ;
	public $target_dir ;
	
	public $aditional_path;
	public $initial_media_path;	# A optional file path to files to conform path as /media/images/my_initial_media_path/<1.5MB/..

	public $ImageObj ; # Instance of ImageObj with current data 

	# Default image dimensions (as showed in section edit)
	public $widht 	= 539 ;
	public $height 	= 404 ;

	

	
	# COMPONENT_IMAGE CONSTRUCT
	function __construct($tipo, $parent, $modo='edit', $lang=null, $section_tipo=null) {

		if(SHOW_DEBUG) {
			$start_time = microtime(1);
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$tipo.'_'.$modo.'_'.microtime(1)]=microtime(1);
		}
		
		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;			

		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

		/*
		# Dato : Verificamos que hay un dato. Si no, asignamos el dato por defecto en el idioma actual		
		# Force calculate and set initial dato
		$dato = $this->get_dato();
			#dump(empty($dato)," dato $modo");

		$this->need_save=false;
		if($this->parent>0 && !isset($dato->section_id)) {

			#####################################################################################################
			# DEFAULT DATO
			$locator = new locator();
				$locator->set_component_tipo($this->tipo);
				$locator->set_section_tipo($this->section_tipo);
				$locator->set_section_id($this->parent);			
			# END DEFAULT DATO
			######################################################################################################

			# Dato
			$this->set_dato($locator);
			$this->need_save=true;
		}#end if(empty($dato->counter) && $this->parent>0)
		*/

			#
			# CONFIGURACIÓN NECESARIA PARA PODER SALVAR (Al salvar se guarda una versión valor_list html que no funciona si no no están estas variables asignadas)
			#
				# IMAGE_ID : Set and fix current image_id
				$this->image_id = $this->get_image_id();
					#dump($this->image_id,"image_id $modo");
				
				# INITIAL MEDIA PATH SET
				$this->initial_media_path = $this->get_initial_media_path();
					#dump($this->initial_media_path, ' this->initial_media_path');

				# ADITIONAL_PATH : Set and fix current aditional image path
				$this->aditional_path = $this->get_aditional_path();
					#dump($this->aditional_path,'$this->aditional_path');

				# IMAGEOBJ : Add a ImageObj obj
				$this->ImageObj = new ImageObj( $this->get_image_id(), $this->get_quality(), $this->aditional_path, $this->initial_media_path );
					#dump($this->ImageObj,"ImageObj en construct");

			
		/*
		if ($this->need_save) {
			
			# result devuelve el id de la sección parent creada o editada
			$result = $this->Save();
			if(SHOW_DEBUG) {
				$total=round(microtime(true)-$start_time,3);
				error_log("Updated ".RecordObj_dd::get_termino_by_tipo($this->tipo)." locator (to ".$locator->get_flat().") of current ".get_called_class()." (tipo:$this->tipo - section_tipo:$this->section_tipo - parent:$this->parent - lang:$this->lang) $total ms");
			}
					
		}#end if ($this->need_save)
		*/

		if(SHOW_DEBUG) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}	

	}#end __construct



	/**
	* SAVE
	* @return int $parent (section_id)
	*/
	public function Save() {

		#####################################################################################################
		# DEFAULT DATO
		$locator = new locator();
			$locator->set_component_tipo($this->tipo);
			$locator->set_section_tipo($this->section_tipo);
			$locator->set_section_id($this->parent);			
		# END DEFAULT DATO
		######################################################################################################

		# Dato
		$this->set_dato($locator);
		
		# Generate default image quality from original if need
		$default = $this->generate_default($overwrite=false);

		# Generate thumb image quality from default allways (if default exits)
		$thumb 	 = $this->generate_thumb();

		if(SHOW_DEBUG) {
			error_log("SAVING COMPONENT IMAGE: generate_thumb response: ".to_string($thumb));
		}

		return parent::Save();

	}#end Save


	


	/**
	* GET_INITIAL_MEDIA_PATH
	*
	*/
	public function get_initial_media_path() {
		$component_tipo = $this->tipo;
		$parent_section = section::get_instance($this->parent,$this->section_tipo);
		$propiedades 	= $parent_section->get_propiedades();
			#dump($propiedades," propiedades component_tipo:$component_tipo"); 
			#dump($propiedades->initial_media_path->$component_tipo," ");

		if (isset($propiedades->initial_media_path->$component_tipo)) {
			$this->initial_media_path = $propiedades->initial_media_path->$component_tipo;
			# Add / at begin if not exits
			if ( substr($this->initial_media_path, 0, 1) != '/' ) {
				$this->initial_media_path = '/'.$this->initial_media_path;
			}
		}else{
			$this->initial_media_path = false;
		}
		return $this->initial_media_path;
	}


	# GET DATO : Format {"component_tipo":"dd42","section_tipo":"rsc20","section_id":"7"}
	public function get_dato() {
		$dato = parent::get_dato();		

		if(SHOW_DEBUG) {			
			#dump($dato,"dato  (tipo:$this->tipo - section_tipo:$this->section_tipo - parent:$this->parent - lang:$this->lang)");
			/*
			if (!isset($dato->component_tipo)) {
				throw new Exception("Error Processing Request. Wrong dato format (locator component_tipo)", 1);				
			}
			if (!isset($dato->section_tipo)) {
				throw new Exception("Error Processing Request. Wrong dato format (locator section_tipo)", 1);				
			}
			if (!isset($dato->section_id)) {
				throw new Exception("Error Processing Request. Wrong dato format (locator section_id)", 1);				
			}
			*/
		}
		return (object)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (object)$dato );
	}



	/**
	* GET VALOR
	* LIST:
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	*/
	public function get_valor() {
		return $this->valor = $this->get_image_id();	
	}

	/**
	* GET IMAGE ID
	* Por defecto se construye con el tipo del component_image actual y el número de orden, ej. 'dd20_rsc750_1'
	* Se puede sobreescribir en propiedades con json ej. {"image_id":"dd851"} y se leerá del contenido del componente referenciado
	*/
	public function get_image_id() {

		if(isset($this->image_id)) return $this->image_id;		

		#
		# CASE 1 REFERENCED NAME : If isset propiedades "image_id" overwrite name with field ddx content
		$propiedades = $this->get_propiedades();
		if (isset($propiedades->image_id)) {

			$component_tipo 	= $propiedades->image_id;
			$component_modelo 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);

			$component 	= component_common::get_instance($component_modelo, $component_tipo, $this->parent, 'edit', DEDALO_DATA_NOLAN, $this->section_tipo);
			$dato 		= trim($component->get_dato());
				#dump($dato,"dato - compoent tipo $this->tipo - section_tipo: ".$this->section_tipo);

			if(!empty($dato) && strlen($dato)>0) {
				return $dato;
			}
		}

		#
		# CASE 2 FALLBACK DEFAULT NAME : Default behavior like 'dd20_rsc750_1'
		/*
		$dato = $this->get_dato();
		if (!isset($dato->section_id)) {			
			if(SHOW_DEBUG) {
				if($this->parent>0)			
				trigger_error(__METHOD__." Warning: Component image dato is empty. component_tipo:$component_tipo, parent:$this->parent, section_tipo:$this->section_tipo");
			}
			return 0;	
		}
		$locator  = new locator($dato);
		$image_id = $locator->get_flat($dato);
			#dump($image_id,'image_id');	
		*/
		$image_id = $this->tipo.'_'.$this->section_tipo.'_'.$this->parent;

		return $this->image_id = $image_id;
	}


	/**
	* GET_ADITIONAL_PATH
	* Calculate image aditional path from 'propiedades' json config.
	*/
	public function get_aditional_path() {

		static $ar_aditional_path;

		#if(isset($ar_aditional_path[$this->image_id])) return $ar_aditional_path[$this->image_id];
		if(isset($this->aditional_path)) return $this->aditional_path;

		$propiedades = $this->get_propiedades();
		
		if (isset($propiedades->aditional_path)) {
			
			switch (true) {

				case (is_string($propiedades->aditional_path)):
					$component_tipo 	= $propiedades->aditional_path;
					$component_modelo 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo);

					$component 	= component_common::get_instance($component_modelo, $component_tipo, $this->parent, 'edit', DEDALO_DATA_NOLAN, $this->section_tipo);
					$dato 		= trim($component->get_dato());			

					# Add / at begin if not exits
					if ( substr($dato, 0, 1) != '/' ) {
						$dato = '/'.$dato;
					}

					# Remove / at end if exists
					if ( substr($dato, -1) === '/' ) {
						$dato = substr($dato, 0, -1);
					}
					#dump($dato,'$dato');

					$ar_aditional_path[$this->image_id] = $dato;

					if(isset($propiedades->max_items_folder) && empty($dato)) {

						$max_items_folder  = $propiedades->max_items_folder;
						$parent_section_id = $this->parent;

						$ar_aditional_path[$this->image_id] = '/'.$max_items_folder*(floor($parent_section_id / $max_items_folder));

						$component->set_dato( $ar_aditional_path[$this->image_id] );
						$component->Save();
					}

					#dump(gettype($propiedades->aditional_path),'$propiedades->aditional_path');
					break;

				/*
				case (is_object($propiedades->aditional_path) ):
					//dump(gettype($propiedades->aditional_path),'$propiedades->aditional_path');
					if(isset($propiedades->aditional_path->max_items_folder)){
						$max_items_folder = $propiedades->aditional_path->max_items_folder;
						$parent_section_id = $this->parent;

						$ar_aditional_path[$this->image_id] = '/'.$max_items_folder*(floor($parent_section_id / $max_items_folder));
					}

					break;
				*/
			}
			

		}else{
			$ar_aditional_path[$this->image_id] = false;
		}



		return $this->aditional_path = $ar_aditional_path[$this->image_id];
	}


	/**
	* GET_IMAGE_PATH 
	* Get complete absolute file path like '/Users/myuser/works/Dedalo/images/1.5MB/dd152-1.jpg'
	* @param string $quality optional default (bool)false
	* @return string $image_path
	*/
	public function get_image_path($quality=false) {

		if(!$quality) {
		$quality = $this->get_quality();	
		}		

		$ImageObj = $this->ImageObj;
		$ImageObj->set_quality($quality);
			
		return $ImageObj->get_local_full_path();		
	}

	/**
	* GET_IMAGE_URL
	* @param string $quality optional default (bool)false
	*/
	public function get_image_url($quality=false) {
		
		if(!$quality)
		$quality 	= $this->get_quality();
		$image_id 	= $this->get_image_id();

			#dump($this->ImageObj,"ImageObj");dump($this,"this");
		if (!isset($this->ImageObj)) {
			throw new Exception("Error Processing Request (get_image_url)", 1);			
		}

		$ImageObj = (object)$this->ImageObj;
		$ImageObj->set_quality($quality);

		# FILE EXISTS TEST : If not, show '0' dedalo image logo
		$file 		= $ImageObj->get_local_full_path();
		if(!file_exists($file)) $image_id = '0';
	
		return $ImageObj->get_media_path() . $image_id .'.'. $ImageObj->get_extension() ;		
	}

	
	# OVERRIDE COMPONENT_COMMON METHOD
	public function get_ar_tools_obj() {
		
		# Remove common tools (time machine and lang)
		unset($this->ar_tools_name);

		# Add tool_transcription
		$this->ar_tools_name[] = 'tool_transcription';

		# Add tool_image_versions
		$this->ar_tools_name[] = 'tool_image_versions';
		
		return parent::get_ar_tools_obj();
	}

	

	

	/**
	* GET QUALITY
	*/
	public function get_quality() {
		if(!isset($this->quality))	return DEDALO_IMAGE_QUALITY_DEFAULT;
		return $this->quality;
	}

	/**
	* SET_QUALITY
	* Sync this / ImageObj quality value
	*/
	public function set_quality($quality) {
		$this->quality = $quality;
		$this->ImageObj->set_quality($quality);
	}

	/**
	* UPLOAD NEEDED
	*/
	public function get_target_filename() {
		#$this->ImageObj->set_quality( $this->get_quality() );
		return $this->ImageObj->get_target_filename();	# Like d758-1.jpg
		#return $this->image_id .'.'. DEDALO_IMAGE_EXTENSION ;
	}
	public function get_target_dir() {
		#$this->ImageObj->set_quality( $this->get_quality() );
		return $this->ImageObj->get_media_path_abs();
		#return DEDALO_MEDIA_BASE_PATH . DEDALO_IMAGE_FOLDER .'/'. $this->get_quality() . $this->aditional_path  ;
	}

	/**
	* GET_ORIGINAL
	* Si se sube un archivo de extensión distinta a DEDALO_IMAGE_EXTENSION, se convierte a DEDALO_IMAGE_EXTENSION. Los archivos originales
	* se guardan renombrados pero conservando la terminación. Se usa esta función para localizarlos comprobando si hay mas de uno.
	*/
	public function get_original() {

		$ar_originals 	= array();
		$target_dir 	= $this->get_target_dir();
		
		if(!file_exists($target_dir)) return null;

		if ($handle = opendir($target_dir)) {
		    while (false !== ($file = readdir($handle))) {		        
		        // note that '.' and '..' is returned even
		        $findme = $this->get_image_id() . '.';
		        if( strpos($file, $findme)!==false && strpos($file, $this->get_target_filename())===false) {
		        	$ar_originals[] = $file;
		        }		        
		    }
		    closedir($handle);
		}
		$n = count($ar_originals);
		if ($n==0) {
			return null;
		}elseif($n==1) {
			#$path = $_FILES['image']['name'];
			$ext = pathinfo($ar_originals[0], PATHINFO_EXTENSION);
			return $ext;
		}else{
			foreach ($ar_originals as $current_original) {
				$ext = pathinfo($current_original, PATHINFO_EXTENSION);
				if(strtolower($ext)!=='jpg') return $ext;
			}
			throw new Exception("Error Processing Request. Too much original files found", 1);			
		}

		#foreach (glob($target_dir."$image_id.*") as $filename) {
		#    echo "<br>$filename size " . filesize($filename) . "\n";
		#}
	}

	
	/**
	* GET_IMAGE_SIZE
	* Alias of $ImageObj->get_size()
	*/
	public function get_image_size($quality=false) {
		
		if(!$quality) $quality = $this->get_quality();
		
		$ImageObj 		= $this->ImageObj;
		$ImageObj->set_quality($quality);

		return $ImageObj->get_size();
	}


	/**
	* CONVERT_QUALITY
	* @return (BOOL)
	*/
	public function convert_quality( $source_quality, $target_quality ) {

		$image_id 			= $this->get_image_id();
		$aditional_path 	= $this->get_aditional_path();
		$initial_media_path = $this->get_initial_media_path();
		
		# Image source
		$source_ImageObj		= new ImageObj($image_id, $source_quality, $aditional_path, $initial_media_path);
		$source_image 			= $source_ImageObj->get_local_full_path();		#dump($source_image, ' source_image');
		$source_pixels_width	= $source_ImageObj->get_image_width();
		$source_pixels_height	= $source_ImageObj->get_image_height();
			#dump($source_ImageObj,'ImageObj');
			#dump($source_image,"source_image $source_pixels_width x $source_pixels_height");

		# Image target
		$target_ImageObj		= new ImageObj($image_id, $target_quality, $aditional_path, $initial_media_path);
		$target_image 			= $target_ImageObj->get_local_full_path();
		$ar_target 				= ImageObj::get_target_pixels_to_quality_conversion($source_pixels_width, $source_pixels_height, $target_quality);
		$target_pixels_width 	= $ar_target[0];
		$target_pixels_height 	= $ar_target[1];
			#dump($target_image,"target_image $target_pixels_width x $target_pixels_height");

		# TARGET FOLDER VERIFY (EXISTS AND PERMISSIONS)				
		$target_dir = $target_ImageObj->get_media_path_abs() ;
		if( !is_dir($target_dir) ) {
			if(!mkdir($target_dir, 0777,true)) throw new Exception(" Error on read or create directory \"$target_quality\". Permission denied $target_dir (2)");
		}			
		
		if($target_pixels_width<1)  $target_pixels_width  = 720;
		if($target_pixels_height<1) $target_pixels_height = 720;

		$flags = '-thumbnail '.$target_pixels_width.'x'.$target_pixels_height ;
		ImageMagick::convert($source_image, $target_image, $flags);
			#dump($flags,"$source_image, $target_image");
			#chmod($source_image, 0777);
			#chmod($target_image, 0777);

		# THUMB . Generate allways when current target quality is default
		if ($target_quality==DEDALO_IMAGE_QUALITY_DEFAULT) {
			# make thumb
			#$this->generate_thumb();
		}

		return true;

	}#end convert_quality


	/**
	* GENERATE_DEFAULT
	* @return bool true / false
	*/
	public function generate_default($overwrite=false) {

		# common data
		$image_id 			 = $this->get_image_id();
		$aditional_path 	 = $this->get_aditional_path();
		$initial_media_path  = $this->get_initial_media_path();

		# source data (default quality is source)
		$source_ImageObj	 = new ImageObj($image_id, DEDALO_IMAGE_QUALITY_ORIGINAL, $aditional_path, $initial_media_path);
		$original_image_path = $source_ImageObj->get_local_full_path();

		if (!file_exists($original_image_path)) {
			return false;
		}

		# target data (target quality is thumb)
		$ImageObj			 = new ImageObj($image_id, DEDALO_IMAGE_QUALITY_DEFAULT, $aditional_path, $initial_media_path);
		$image_default_path  = $ImageObj->get_local_full_path();

		if ($overwrite || !file_exists($image_default_path)) {
			$this->convert_quality( DEDALO_IMAGE_QUALITY_ORIGINAL, DEDALO_IMAGE_QUALITY_DEFAULT );		
		}

		return true;
		
	}#end generate_default


	/**
	* GENERATE_THUMB
	* @return array url,path of thumb file path OR bool false if default quality file not exts
	*/
	public function generate_thumb() {

		if(SHOW_DEBUG) {
			error_log("DEBUG INFO: Called generate_thumb");
		}

		# common data
		$image_id 			 = $this->get_image_id();
		$aditional_path 	 = $this->get_aditional_path();
		$initial_media_path  = $this->get_initial_media_path();

		# source data (default quality is source)
		$source_ImageObj	 = new ImageObj($image_id, DEDALO_IMAGE_QUALITY_DEFAULT, $aditional_path, $initial_media_path);
		$default_image_path  = $source_ImageObj->get_local_full_path();

		if (!file_exists($default_image_path)) {
			if(SHOW_DEBUG) {
				#error_log("DEBUG INFO: Default image quality don't exists. Skip create thumb.");
			}
			return false;
		}
		#error_log("DEBUG INFO: Default image quality exists. Building thumb.");
		
		# target data (target quality is thumb)
		$ImageObj			 = new ImageObj($image_id, DEDALO_IMAGE_THUMB_DEFAULT, $aditional_path, $initial_media_path);
		$image_thumb_path 	 = $ImageObj->get_local_full_path();
		$image_thumb_url 	 = $ImageObj->get_url();	//$this->get_image_url($quality=DEDALO_IMAGE_THUMB_DEFAULT);
		if(file_exists($image_thumb_path)) {
			#unlink($image_thumb_path);
			$image_thumb_path_des = $image_thumb_path.'_DES';
			shell_exec("mv $image_thumb_path $image_thumb_path_des");
			#error_log("DEBUG INFO: thumb exists. renaming thumb.");
		}
		
		# thumb generate
		$dd_thumb = ImageMagick::dd_thumb( 'list', $default_image_path, $image_thumb_path, $dimensions="102x57", $initial_media_path);

		#error_log("DEBUG INFO: dd_thumb function called.");

		if(SHOW_DEBUG) {
			//dump($dd_thumb, ' generate_thumb: dd_thumb ++ '.to_string());
			#if(!file_exists($image_thumb_path)) {
				#dump($default_image_path, ' default_image_path ++ '.to_string());
				#dump($image_thumb_path, ' image_thumb_path ++ '.to_string());
				#dump($initial_media_path, ' initial_media_path ++ '.to_string());
				#throw new Exception("Error Processing Request. NO SE HA GENERADO EL THUMB: $image_thumb_path", 1);		
			#}
			#error_log("RESPONSE generate_thumb: $dd_thumb");
			#error_log("RESPONSE image_thumb_url: $image_thumb_url");
		}		

		return array('path'=>$image_thumb_path,
					 'url' =>$image_thumb_url,
					);
		#return $dd_thumb;

	}#end generate_thumb


	/**
	* GET_THUMB_URL
	* @return 
	*/
	public function get_thumb_url() {
		# common data
		$image_id 			 = $this->get_image_id();
		$aditional_path 	 = $this->get_aditional_path();
		$initial_media_path  = $this->get_initial_media_path();
		
		# target data (target quality is thumb)
		$ImageObj			 = new ImageObj($image_id, DEDALO_IMAGE_THUMB_DEFAULT, $aditional_path, $initial_media_path);		
		$image_thumb_url 	 = $ImageObj->get_url();

		return $image_thumb_url;

	}#end get_thumb_url

	/**
	* GET_THUMB_PATH
	* @return 
	*/
	public function get_thumb_path() {
		# common data
		$image_id 			 = $this->get_image_id();
		$aditional_path 	 = $this->get_aditional_path();
		$initial_media_path  = $this->get_initial_media_path();
		
		# target data (target quality is thumb)
		$ImageObj			 = new ImageObj($image_id, DEDALO_IMAGE_THUMB_DEFAULT, $aditional_path, $initial_media_path);
		$image_thumb_path 	 = $ImageObj->get_local_full_path();
		
		return $image_thumb_path;
		
	}#end get_thumb_path


	/**
	* GET_IMAGE_PRINT_DIMENSIONS
	*/
	public function get_image_print_dimensions($quality) {

		$ImageObj = $this->ImageObj;
		$ImageObj->set_quality($quality);

		$ar_info = $ImageObj->pixel_to_centimetres($quality, $dpi=DEDALO_IMAGE_PRINT_DPI);
		return $ar_info;
	}
	
	

	/**
	* GET_SOURCE_QUALITY_TO_BUILD
	* Iterate array DEDALO_IMAGE_AR_QUALITY (Order by quality big to small)
	*//*
	public function get_source_quality_to_build__DEPRECATED__($target_quality) {	
		
		$ar_quality_source_valid = array();
		$ar_quality 			 = unserialize(DEDALO_IMAGE_AR_QUALITY);
			#dump($ar_quality,'$ar_quality');		

		foreach($ar_quality as $current_quality) {

			# Current file
			$filename = $this->get_image_path($current_quality);			
			
			if (file_exists($filename)) {

				# Add current quality as source valid 
				$ar_quality_source_valid[] = $current_quality;
					#dump($filename,'$file_exists');
			}else{

				# Return first value found inside array of quality
				if(!empty($ar_quality_source_valid)) foreach ($ar_quality_source_valid as $quality_source) {

					if ($current_quality == $target_quality) return $quality_source;						
				}
			}
			
		}#end foreach($ar_quality as $quality)
		
		return false;
	}
	*/


	/**
	* CONVERT_QUALITY_TO_MEGABYTES
	*/
	public static function convert_quality_to_megabytes($quality) {

		# patern : '1MB' | '1.5MB' | <1MB | >100MB

		# Eliminamos el texto de megabytes ('MB') en el nopmbre de la calidad
		$string = substr($quality, 0,-2);

		switch (true) {

			case ( strpos($string, '>')===0 ):
				# Ejemplo >100 será 100
				$number = intval(substr($string,1)) + 1;
				break;

			case ( strpos($string, '<')===0 ):
				# Ejemplo <1 será 1
				$number = floatval( substr($string,1) - 0.1 );
				break;		

			default:
				# Default 1.5 será 1.5
				$number = $string;
				break;
		}

		# Float value
		$number = floatval($number);

		return $number;
	}


	
	
	/**
	* REMOVE_COMPONENT_MEDIA_FILES
	* "Remove" (rename and move files to deleted folder) all media file vinculated to current component (all quality versions)
	* Is triggered wen section tha contain media elements is deleted
	* @see section:remove_section_media_files
	*/
	public function remove_component_media_files() {

		$date=date("Y-m-d_Hi");

		#
		# Image remove
		$ar_quality = (array)unserialize(DEDALO_IMAGE_AR_QUALITY);
		foreach ($ar_quality as $current_quality) {
			# media_path
			$media_path = $this->get_image_path($current_quality);
			if(SHOW_DEBUG) {
				dump($media_path, ' media_path $current_quality:'.$current_quality." - ".$this->get_target_dir() );
			}
			if (!file_exists($media_path)) continue; # Skip
			
			# move / rename file
			$folder_path_del 	= $this->get_target_dir()  . 'deleted';

			# delete folder exists ?
			if( !is_dir($folder_path_del) ) {
			$create_dir 	= mkdir($folder_path_del, 0777,true);
			if(!$create_dir) throw new Exception(" Error on read or create directory \"deleted\". Permission denied.") ;
			}

			$image_name 		= $this->get_image_id();
			$media_path_moved 	= $folder_path_del . "/$image_name" . '_deleted_' . $date . '.' . DEDALO_IMAGE_EXTENSION;			
			if( !rename($media_path, $media_path_moved) ) throw new Exception(" Error on move files to folder \"deleted\" . Permission denied . The files are not deleted");

			if(SHOW_DEBUG) {
				$msg=__METHOD__." \nMoved file \n$media_path to \n$media_path_moved";
				error_log($msg);
				#dump($msg, ' msg');
			}
		}#end foreach

		#
		# Original image remove
		# remove aditional source images like 'original_image.tif'
		# WORK IN PROGRESS !!
		

		return true;
	}#end remove_component_media_files

	

	/**
	* RESTORE_COMPONENT_MEDIA_FILES
	* "Restore" last version of deleted media files (renamed and stored in 'deleted' folder)
	* Is triggered when tool_time_machine recover a section
	* @see tool_time_machine::recover_section_from_time_machine
	*/
	public function restore_component_media_files() {

		#
		# Image restore
		$ar_quality = (array)unserialize(DEDALO_IMAGE_AR_QUALITY);
		foreach ($ar_quality as $current_quality) {

			# media_path
			$media_path = $this->get_image_path($current_quality);
			$media_path = pathinfo($media_path,PATHINFO_DIRNAME).'/deleted';
			$image_id 	= $this->get_image_id();
			if(SHOW_DEBUG) {
				dump($media_path, "media_path current_quality:$current_quality - get_image_id:$image_id");
			}
			$file_pattern 	= $media_path.'/'.$image_id.'_*.'.DEDALO_IMAGE_EXTENSION;
			$ar_files 		= glob($file_pattern);
			if(SHOW_DEBUG) {
				#dump($ar_files, ' ar_files');#continue;
			}
			if (empty($ar_files)) {
				error_log("No files to restore were found for image_id:$image_id. Nothing was restored (1)");
				continue; // Skip
			}
			natsort($ar_files);	# sort the files from newest to oldest
			$last_file_path = end($ar_files);
			$new_file_path 	= $this->get_image_path($current_quality);		
			if( !rename($last_file_path, $new_file_path) ) throw new Exception(" Error on move files to restore folder. Permission denied . Nothing was restored (2)");

			if(SHOW_DEBUG) {
				$msg=__METHOD__." \nMoved file \n$last_file_path to \n$new_file_path";
				error_log($msg);
				#dump($msg, ' msg');
			}

		}#end foreach

		return true;
	}#end restore_component_media_files





	/**
	* __DESTRUCT
	* @return 
	*/
	public function __destruct() {
		/*
		if ($this->need_save) {

			$this->generate_thumb();
			
			# result devuelve el id de la sección parent creada o editada
			$result = $this->Save();
			if(SHOW_DEBUG) {
				#$total=round(microtime(true)-$start_time,3);
				#error_log("Updated ".RecordObj_dd::get_termino_by_tipo($this->tipo)." locator (to ".$locator->get_flat().") of current ".get_called_class()." (tipo:$this->tipo - section_tipo:$this->section_tipo - parent:$this->parent - lang:$this->lang) $total ms");
			}					
		}#end if ($this->need_save)
		*/
	}#end __destruct



}
?>