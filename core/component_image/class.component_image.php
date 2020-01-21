<?php
/*
* CLASS COMPONENT IMAGE
*/
require_once(DEDALO_CORE_PATH . '/media_engine/class.ImageObj.php');

class component_image extends component_media_common {


	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	# file name formated as 'tipo'-'order_id' like dd732-1
	public $image_id;
	public $image_url;
	public $quality;

	public $target_filename;
	public $target_dir;

	public $aditional_path;
	public $initial_media_path;	# A optional file path to files to conform path as /media/images/my_initial_media_path/<1.5MB/..
	public $external_source;

	public $ImageObj; # Instance of ImageObj with current data

	# Default image dimensions (as showed in section edit)
	public $widht 	= 539;
	public $height 	= 404;



	/**
	* __CONSTRUCT
	*/
	public function __construct($tipo, $parent, $modo='edit', $lang=null, $section_tipo=null) {

		if(SHOW_DEBUG===true) {
			$start_time = microtime(1);
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$tipo.'_'.$modo.'_'.microtime(1)]=microtime(1);
		}

		// lang. Force always DEDALO_DATA_NOLAN
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
		}//end if(empty($dato->counter) && $this->parent>0)
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

				# ADITIONAL_PATH : Set and fix current aditional image path
				$this->external_source = $this->get_external_source();

				# IMAGEOBJ : Add a ImageObj obj
				$this->ImageObj = new ImageObj( $this->get_image_id(), $this->get_quality(), $this->aditional_path, $this->initial_media_path, $this->external_source);
					#dump($this->ImageObj,"ImageObj en construct");


		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		return true;
	}//end __construct



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
		$overwrite 	= ($this->quality===$this->get_original_quality()) ? true : false;
		$default 	= $this->generate_default($overwrite);

		# Generate thumb image quality from default always (if default exits)
		$thumb 	 = $this->generate_thumb();

		if(SHOW_DEBUG===true) {
			debug_log(__METHOD__." SAVING COMPONENT IMAGE: generate_thumb response: ".to_string($thumb), logger::DEBUG);
		}

		return parent::Save();
	}//end Save



	/**
	* GET_INITIAL_MEDIA_PATH
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
	}//end get_initial_media_path



	/**
	* GET DATO : Format {"component_tipo":"dd42","section_tipo":"rsc20","section_id":"7"}
	*/
	public function get_dato() {
		$dato = parent::get_dato();

		if(SHOW_DEBUG===true) {
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
	}//end get_dato



	/**
	* SET_DATO
	*/
	public function set_dato($dato) {

		parent::set_dato( (object)$dato );
	}//end set_dato



	/**
	* GET VALOR
	* LIST:
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	*/
	public function get_valor() {

		return $this->valor = $this->get_image_id() .'.'. DEDALO_IMAGE_EXTENSION;
	}//end get_valor



	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor_export
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null ) {

		if (empty($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}

		#$valor = $this->get_valor();
		#$valor .= '.'.DEDALO_IMAGE_EXTENSION;

		$image_quality  = DEDALO_IMAGE_QUALITY_DEFAULT;	// DEDALO_IMAGE_THUMB_DEFAULT
		$test_file 		= true;	// output dedalo image placeholder when not file exists
		$absolute 		= true;	// otuput absolute path like 'http://myhost/mypath/myimage.jpg'

		$valor 			= $this->get_image_url($image_quality, $test_file, $absolute);


		return $valor;
	}//end get_valor_export


	/**
	* GET_ID
	* Alias of get_image_id
	*/
	public function get_id() {

		return $this->get_image_id();
	}//end get_id



	/**
	* GET IMAGE ID
	* By default it's built with the type of the current component_image and the order number, eg. 'dd20_rsc750_1'
	* It can be overwritten in properties with json ex. {"image_id": "dd851"} and will be read from the content of the referenced component
	*
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

			$component 	= component_common::get_instance($component_modelo,
														 $component_tipo,
														 $this->parent,
														 'edit',
														 DEDALO_DATA_NOLAN,
														 $this->section_tipo);
			$dato 		= trim($component->get_valor(0));
				#dump($dato,"dato - compoent tipo $this->tipo - section_tipo: ".$this->section_tipo);

			if(!empty($dato) && strlen($dato)>0) {
				return $dato;
			}
		}

		#
		# CASE 2 EXTERNAL SOURCE:
		$external_source = $this->get_external_source();
		if($external_source){
			$external_parts = pathinfo($external_source);
			$image_id = $external_parts['filename'];
			return $image_id;
		}

		$image_id = $this->tipo.'_'.$this->section_tipo.'_'.$this->parent;

		return $this->image_id = $image_id;
	}//end get_image_id



	/**
	* GET_ADITIONAL_PATH
	* Calculate image aditional path from 'propiedades' json config.
	*/
	public function get_aditional_path() {

		static $ar_aditional_path;

		#if(isset($ar_aditional_path[$this->image_id])) return $ar_aditional_path[$this->image_id];
		if(isset($this->aditional_path)) return $this->aditional_path;

		$propiedades = $this->get_propiedades();

		if (isset($propiedades->aditional_path) && !empty($this->get_parent()) ) {

			switch (true) {

				case (is_string($propiedades->aditional_path)):
					$component_tipo 	= $propiedades->aditional_path;
					$component_modelo 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);

					$component 	= component_common::get_instance($component_modelo,
																 $component_tipo,
																 $this->get_parent(),
																 'edit',
																 DEDALO_DATA_NOLAN,
																 $this->get_section_tipo());
					$dato 		= trim($component->get_valor(0));

					# Add / at begin if not exits
					if ( substr($dato, 0, 1)!=='/' ) {
						$dato = '/'.$dato;
					}

					# Remove / at end if exists
					if ( substr($dato, -1)==='/' ) {
						$dato = substr($dato, 0, -1);
					}
					#dump($dato,'$dato');

					$ar_aditional_path[$this->image_id] = $dato;

					if(isset($propiedades->max_items_folder) && empty($dato)) {

						$max_items_folder  = $propiedades->max_items_folder;
						$parent_section_id = $this->parent;

						$ar_aditional_path[$this->image_id] = '/'.$max_items_folder*(floor($parent_section_id / $max_items_folder));

						# Final dato must be an array to saved into component_input_text
						$final_dato = array( $ar_aditional_path[$this->image_id] );
						$component->set_dato( $final_dato );
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
	}//end get_aditional_path



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
	}//end get_image_path



	/**
	* GET_IMAGE_URL
	* Get image url for current quality
	* @param string | bool $quality
	*	optional default (bool)false
	* @param bool $test_file
	*	Check if file exists. If not use 0.jpg as output. Default true
	* @param bool $absolute
	*	Return relative o absolute url. Default false (relative)
	*/
	public function get_image_url($quality=false, $test_file=true, $absolute=false, $default_add=true) {

		// quality fallback to default
			if(!$quality)
			$quality 	= $this->get_quality();

		// image id
			$image_id 	= $this->get_image_id();

		// Check ImageObj
			if (!isset($this->ImageObj)) {
				throw new Exception("Error Processing Request (get_image_url)", 1);
			}

		// ImageObj
			$ImageObj = (object)$this->ImageObj;
			$ImageObj->set_quality($quality);

		// url
			$image_url = $ImageObj->get_media_path() .'/'. $image_id .'.'. $ImageObj->get_extension();

		// File exists test : If not, show '0' dedalo image logo
			if($test_file===true) {
				$file = $ImageObj->get_local_full_path();
				if(!file_exists($file)) {
					if ($default_add===false) {
						return false;
					}
					$image_url = DEDALO_CORE_URL . '/themes/default/0.jpg';
				}
			}

		// Absolute (Default false)
			if ($absolute===true) {
				$image_url = DEDALO_PROTOCOL . DEDALO_HOST . $image_url;
			}

		return $image_url;
	}//end get_image_url




	public function get_external_source(){

		$propiedades = $this->get_propiedades();

		$external_source = false;
		if (isset($propiedades->external_source) && !empty($this->get_parent()) ) {

			$component_tipo 	= $propiedades->external_source;
			$component_model 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);

			$component 	= component_common::get_instance($component_model,
														 $component_tipo,
														 $this->get_parent(),
														 'edit',
														 DEDALO_DATA_NOLAN,
														 $this->get_section_tipo());


			$dato	= $component->get_dato();
			if($dato){
				$dato = reset($dato);
			}

			#dump(empty($dato->dataframe));
			if(!empty($dato->dataframe)){
				if(isset($dato->iri) && !empty($dato->iri)){
				$external_source = $dato->iri;
				}
			}

		}
		return $external_source;
	}//end get_external_source



	/**
	* GET QUALITY
	*/
	public function get_quality() {
		if(!isset($this->quality))	return DEDALO_IMAGE_QUALITY_DEFAULT;

		return $this->quality;
	}//end get_quality



	/**
	* SET_QUALITY
	* Sync this / ImageObj quality value
	*/
	public function set_quality($quality) {
		$this->quality = $quality;
		$this->ImageObj->set_quality($quality);

		return true;
	}//end set_quality



	/**
	* GET_TARGET_FILENAME
	* Upload needed
	*/
	public function get_target_filename() {

		return $this->ImageObj->get_target_filename();	# Like d758-1.jpg
	}//end get_target_filename



	/**
	* GET_TARGET_DIR
	*/
	public function get_target_dir() {

		return $this->ImageObj->get_media_path_abs();
	}//end get_target_dir



	/**
	* GET_IMAGE_SIZE
	* Alias of $ImageObj->get_size()
	* Get file size in KB, MB, etc..
	*/
	public function get_image_size($quality=false) {

		if($quality===false) $quality = $this->get_quality();

		$ImageObj 		= $this->ImageObj;
		$ImageObj->set_quality($quality);

		return $ImageObj->get_size();
	}//end get_image_size



	/**
	* CONVERT_QUALITY
	* @return bool
	*/
	public function convert_quality( $source_quality, $target_quality ) {

		// invalid targets check
			if ($target_quality===DEDALO_IMAGE_QUALITY_ORIGINAL || $target_quality===DEDALO_IMAGE_THUMB_DEFAULT) {
				if(SHOW_DEBUG===true) {
					throw new Exception("Error Processing Request. Wrong target quality: $target_quality", 1);
				}
				return false;
			}

		// vars
			$image_id 			= $this->get_image_id();
			$aditional_path 	= $this->get_aditional_path();
			$initial_media_path = $this->get_initial_media_path();

		// Image source
			$source_ImageObj		= new ImageObj($image_id, $source_quality, $aditional_path, $initial_media_path);
			$source_image 			= $source_ImageObj->get_local_full_path();
			$image_dimensions 		= $source_ImageObj->get_image_dimensions();
			$source_pixels_width  	= $image_dimensions[0] ?? null;
			$source_pixels_height 	= $image_dimensions[1] ?? null;
			// $source_pixels_width	= $source_ImageObj->get_image_width();
			// $source_pixels_height	= $source_ImageObj->get_image_height();
				// dump($source_ImageObj,'ImageObj');
				// dump($source_image, "source_image - pixels_width: $source_pixels_width x pixels_height: $source_pixels_height");

		// Image target
			$target_ImageObj		= new ImageObj($image_id, $target_quality, $aditional_path, $initial_media_path);
			$target_image 			= $target_ImageObj->get_local_full_path();
			$ar_target 				= ImageObj::get_target_pixels_to_quality_conversion($source_pixels_width, $source_pixels_height, $target_quality);
			$target_pixels_width 	= $ar_target[0];
			$target_pixels_height 	= $ar_target[1];
				#dump($target_image,"target_image $target_pixels_width x $target_pixels_height");

		# Target folder verify (EXISTS AND PERMISSIONS)
			$target_dir = $target_ImageObj->get_media_path_abs() ;
			if( !is_dir($target_dir) ) {
				if(!mkdir($target_dir, 0777,true)) throw new Exception(" Error on read or create directory \"$target_quality\". Permission denied $target_dir (2)");
			}

		# Avoid enlarge images
			if ( ($source_pixels_width*$source_pixels_height)<($target_pixels_width*$target_pixels_height) ) {
				$target_pixels_width  = $source_pixels_width;
				$target_pixels_height = $source_pixels_height;
			}

		// defaults when no value is available
			if($target_pixels_width<1)  $target_pixels_width  = 720;
			if($target_pixels_height<1) $target_pixels_height = 720;

		// convert with ImageMagick command
			$flags = '-thumbnail '.$target_pixels_width.'x'.$target_pixels_height;
			ImageMagick::convert($source_image, $target_image, $flags);


		return true;
	}//end convert_quality



	/**
	* GENERATE_DEFAULT
	* @return bool
	*/
	public function generate_default($overwrite=true) {

		// vars
			$image_id 			 = $this->get_id();
			$aditional_path 	 = $this->get_aditional_path();
			$initial_media_path  = $this->get_initial_media_path();

		// quality retouched
			if (defined('DEDALO_IMAGE_QUALITY_RETOUCHED') && DEDALO_IMAGE_QUALITY_RETOUCHED!==false) {
				# source data (modified is source)
				$source_ImageObj	 = new ImageObj($image_id, DEDALO_IMAGE_QUALITY_RETOUCHED, $aditional_path, $initial_media_path);
				$original_image_path = $source_ImageObj->get_local_full_path();
				$real_orig_quality	 = DEDALO_IMAGE_QUALITY_RETOUCHED;	// Modified
			}

		// quality original
			if (!isset($original_image_path) || !file_exists($original_image_path)) {
				# source data (default quality is source)
				$source_ImageObj	 = new ImageObj($image_id, DEDALO_IMAGE_QUALITY_ORIGINAL, $aditional_path, $initial_media_path);
				$original_image_path = $source_ImageObj->get_local_full_path();
				$real_orig_quality	 = DEDALO_IMAGE_QUALITY_ORIGINAL; // Original
			}
			// check original file again
			if (!file_exists($original_image_path)) {
				debug_log(__METHOD__." Unable locate original_image. File not exists in $original_image_path ".to_string(), logger::ERROR);
				return false;
			}

		// quality default
			$ImageObj			 = new ImageObj($image_id, DEDALO_IMAGE_QUALITY_DEFAULT, $aditional_path, $initial_media_path);
			$image_default_path  = $ImageObj->get_local_full_path();
			// overwrite or create default quality image version
			if ($overwrite===true || !file_exists($image_default_path)) {
				$this->convert_quality( $real_orig_quality, DEDALO_IMAGE_QUALITY_DEFAULT );
			}

		return true;
	}//end generate_default



	/**
	* GENERATE_DEFAULT_FROM_ORIGINAL_REAL
	* @return bool true
	*/
	public function generate_default_from_original_real($overwrite=true) {

		# common data
		$image_id 			 = $this->get_image_id();
		$aditional_path 	 = $this->get_aditional_path();
		$initial_media_path  = $this->get_initial_media_path();

		# source data (default quality is source)
		$source_ImageObj	 = new ImageObj($image_id, DEDALO_IMAGE_QUALITY_ORIGINAL, $aditional_path, $initial_media_path);
		$original_image_path = $source_ImageObj->get_local_full_path();

		$path = pathinfo($original_image_path);

		$original_image_extension = $this->get_original( DEDALO_IMAGE_QUALITY_ORIGINAL, $exclude_converted=true );
		$original_image_path_real = $path['dirname'] . '/' .  $path['filename'] . '.' . $original_image_extension;
			#dump($original_image_path, ' $original_image_path ++ '.to_string(DEDALO_IMAGE_QUALITY_ORIGINAL));

		if (!file_exists($original_image_path_real)) {
			return false;
		}

		# target data (target quality is thumb)
		$ImageObj			 = new ImageObj($image_id, DEDALO_IMAGE_QUALITY_DEFAULT, $aditional_path, $initial_media_path);
		$image_default_path  = $ImageObj->get_local_full_path();

		if ($overwrite===true ) { //|| !file_exists($image_default_path)
			#$this->convert_quality( DEDALO_IMAGE_QUALITY_ORIGINAL, DEDALO_IMAGE_QUALITY_DEFAULT );
			Imagemagick::convert($original_image_path_real, $original_image_path);
			Imagemagick::convert($original_image_path, $image_default_path);
		}

		return true;
	}//end generate_default_from_original_real



	/**
	* GENERATE_THUMB
	* Called on save
	* @return array url,path of thumb file path OR bool false if default quality file not exts
	*/
	public function generate_thumb() {

		// common data
			$image_id 			 = $this->get_image_id();
			$aditional_path 	 = $this->get_aditional_path();
			$initial_media_path  = $this->get_initial_media_path();

		// source data (default quality is source)
			$source_ImageObj	 = new ImageObj($image_id, DEDALO_IMAGE_QUALITY_DEFAULT, $aditional_path, $initial_media_path);
			$default_image_path  = $source_ImageObj->get_local_full_path();

		// check default quality image
			if (!file_exists($default_image_path)) {
				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__." Default image quality don't exists. Skip create thumb. ".to_string(), logger::ERROR);
				}
				return false;
			}

		// old thumb rename
			$ImageObj			 = new ImageObj($image_id, DEDALO_IMAGE_THUMB_DEFAULT, $aditional_path, $initial_media_path);
			$image_thumb_path 	 = $ImageObj->get_local_full_path();
			$image_thumb_url 	 = $ImageObj->get_url();	//$this->get_image_url($quality=DEDALO_IMAGE_THUMB_DEFAULT);
			if(file_exists($image_thumb_path)) {
				#unlink($image_thumb_path);
				$image_thumb_path_des = $image_thumb_path.'_DES';
				shell_exec("mv $image_thumb_path $image_thumb_path_des");
			}

		// thumb generate
			$dd_thumb = ImageMagick::dd_thumb('list', $default_image_path, $image_thumb_path, false, $initial_media_path);

		// debug
			debug_log(__METHOD__." dd_thumb function called and executed. ".to_string(), logger::DEBUG);

		// result
			$result = [
				'path' => $image_thumb_path,
				'url'  => $image_thumb_url
			];


		return $result;
	}//end generate_thumb



	/**
	* GET_THUMB_URL
	* @return string $image_thumb_url
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
	}//end get_thumb_url



	/**
	* GET_THUMB_PATH
	* @return string $image_thumb_path
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
	}//end get_thumb_path



	/**
	* GET_IMAGE_PRINT_DIMENSIONS
	* @return array $ar_info
	*/
	public function get_image_print_dimensions($quality) {

		$ImageObj = $this->ImageObj;
		$ImageObj->set_quality($quality);

		$ar_info = $ImageObj->pixel_to_centimetres($quality, $dpi=DEDALO_IMAGE_PRINT_DPI);

		return $ar_info;
	}//end get_image_print_dimensions



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
	}//end convert_quality_to_megabytes



	/**
	* GET_ORIGINAL
	* Si se sube un archivo de extensión distinta a DEDALO_IMAGE_EXTENSION, se convierte a DEDALO_IMAGE_EXTENSION. Los archivos originales
	* se guardan renombrados pero conservando la terminación. Se usa esta función para localizarlos comprobando si hay mas de uno.
	* @return bool | string (file extension)
	*/
	public function get_original( $quality=false, $exclude_converted=true ) {

		if (!$quality) {
			$quality = $this->get_quality();
		}
		$result = false;
		$initial_quality = $this->get_quality();

		$this->set_quality($quality); // change current component quality temporally
		$ar_originals 	= array();
		$target_dir 	= $this->get_target_dir();

		if(!file_exists($target_dir)) return false;

		if ($handle = opendir($target_dir)) {
		    while (false !== ($file = readdir($handle))) {

		        // note that '.' and '..' is returned even
		        $findme = $this->get_image_id() . '.';
		        if( strpos($file, $findme) !== false ) {
		        	if ($exclude_converted) {
		        		# Verify too that extension is different to dedalo extension (like .tiff)
		        		if (strpos($file, $this->get_target_filename()) === false) {
		        			$ar_originals[] = $file;
		        		}
		        	}else{
		        		# Included all originals (witl all extensions)
		        		$ar_originals[] = $file;
		        	}
		        }
		    }
		    closedir($handle);
		}
		#dump($ar_originals, ' target_dir ++ '.to_string($target_dir));

		$n = count($ar_originals);
		if ($n===0) {
			$result = false;
		}elseif($n===1) {
			#$path = $_FILES['image']['name'];
			$ext = pathinfo($ar_originals[0], PATHINFO_EXTENSION);
			$result = $ext;
		}else{
			foreach ($ar_originals as $current_original) {
				$ext = pathinfo($current_original, PATHINFO_EXTENSION);
				if(strtolower($ext)!=strtolower(DEDALO_IMAGE_EXTENSION)) {
					$result = $ext;
				}
			}
			if(!isset($ext)) {
				trigger_error("Error Processing Request. Too much original files found ($n)");
				#throw new Exception("Error Processing Request. Too much original files found", 1);
			}
		}

		// return current component quality
		$this->quality 	= $initial_quality;

		return $result;
	}//end get_original_file_path



	/**
	* REMOVE_COMPONENT_MEDIA_FILES
	* "Remove" (rename and move files to deleted folder) all media file vinculated to current component (all quality versions)
	* Is triggered wen section tha contain media elements is deleted
	* @see section:remove_section_media_files
	*/
	public function remove_component_media_files( $ar_quality=array() ) {

		$date=date("Y-m-d_Hi");

		#
		# Image remove
		if (empty($ar_quality)) {
			$ar_quality = (array)unserialize(DEDALO_IMAGE_AR_QUALITY);
		}
		foreach ($ar_quality as $current_quality) {
			# media_path is full path of file like '/www/dedalo/media_test/media_development/image/thumb/rsc29_rsc170_77.jpg'
			$media_path = $this->get_image_path($current_quality);
			if(SHOW_DEBUG===true) {
				#dump($media_path, "DEBUG INFO ".__METHOD__.' media_path $current_quality:'.$current_quality." - ".$this->get_target_dir() );
			}
			if (!file_exists($media_path)) continue; # Skip

			# move / rename file
			$folder_path_del 	= $this->get_target_dir()  . 'deleted';

			# delete folder exists ?
			if( !is_dir($folder_path_del) ) {
				if( !mkdir($folder_path_del, 0777,true) ) throw new Exception(" Error on read or create directory \"deleted\". Permission denied.") ;
			}

			$image_name 		= $this->get_image_id();
			$media_path_moved 	= $folder_path_del . '/' . $image_name . '_deleted_' . $date . '.' . DEDALO_IMAGE_EXTENSION;
			if( !rename($media_path, $media_path_moved) ) {
				#throw new Exception(" Error on move files to folder \"deleted\" . Permission denied . The files are not deleted");
				trigger_error(" Error on move files to folder \"deleted\" [1]. Permission denied . The files are not deleted");
			}
			debug_log(__METHOD__." Moved file \n$media_path to \n$media_path_moved ".to_string(), logger::DEBUG);

			// Move original files too (PNG,TIF,Etc.)
			// NOTE : 'original files' are NOT 'original quality'. Are uploaded files with extension different to DEDALO_IMAGE_EXTENSION
			$original_extension = $this->get_original( $current_quality );
			$path_parts 		= pathinfo($media_path);
			$original_file  	= $path_parts['dirname'].'/'.$path_parts['filename'].'.'.$original_extension;
			#$original_file_moved= $path_parts['dirname'].'/'.$path_parts['filename'].'_deleted_'.$date.'.'.$original_extension;
			$original_file_moved= $folder_path_del.'/'.$path_parts['filename'].'_deleted_'.$date.'.'.$original_extension;
			if (file_exists($original_file)) {
				if( !rename($original_file, $original_file_moved) ) {
					#throw new Exception(" Error on move files to folder \"deleted\" . Permission denied . The files are not deleted");
					trigger_error(" Error on move files to folder \"deleted\" [2]. Permission denied . The files are not deleted");
				}
			}

		}//end foreach

		#
		# Original image remove
		# remove aditional source images like 'original_image.tif'
		# WORK IN PROGRESS !!

		return true;
	}//end remove_component_media_files



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
			$media_path 	 = $this->get_image_path($current_quality);
			$folder_path_del = pathinfo($media_path,PATHINFO_DIRNAME).'/deleted';
			$image_id 		 = $this->get_image_id();
			if(SHOW_DEBUG===true) {
				#dump($folder_path_del, "folder_path_del current_quality:$current_quality - get_image_id:$image_id");
			}
			$file_pattern 	= $folder_path_del .'/'.$image_id.'_*.'.DEDALO_IMAGE_EXTENSION;
			$ar_files 		= glob($file_pattern);
			if(SHOW_DEBUG===true) {
				#dump($ar_files, ' ar_files');#continue;
			}
			if (empty($ar_files)) {
				debug_log(__METHOD__."  No files to restore were found for image_id:$image_id in quality:$current_quality. Nothing was restored for this quality ".to_string(), logger::DEBUG);
				continue; // Skip
			}
			natsort($ar_files);	# sort the files from newest to oldest
			$last_file_path = end($ar_files);
			$new_file_path 	= $this->get_image_path($current_quality);
			if( !rename($last_file_path, $new_file_path) ) throw new Exception(" Error on move files to restore folder. Permission denied . Nothing was restored (2)");


			/* POR ACABAR
			// Move original files too (PNG,TIF,Etc.)
			// NOTE : 'original files' are NOT 'original quality'. Are uploaded files with extension different to DEDALO_IMAGE_EXTENSION
			$original_extension = $this->get_original( $current_quality );
			$path_parts 		= pathinfo($media_path);
			$original_file  	= $path_parts['dirname'].'/'.$path_parts['filename'].'.'.$original_extension;
			#$original_file_moved= $path_parts['dirname'].'/'.$path_parts['filename'].'_deleted_'.$date.'.'.$original_extension;
			$original_file_moved= $folder_path_del.'/'.$path_parts['filename'].'_deleted_'.$date.'.'.$original_extension;
			if (file_exists($original_file)) {
				if( !rename($original_file, $original_file_moved) ) {
					#throw new Exception(" Error on move files to folder \"deleted\" . Permission denied . The files are not deleted");
					trigger_error(" Error on move files to folder \"deleted\" [2]. Permission denied . The files are not deleted");
				}
			}
			*/

			debug_log(__METHOD__." Successful Moved file \n$last_file_path to \n$new_file_path ".to_string(), logger::DEBUG);

		}//end foreach

		return true;
	}//end restore_component_media_files



	/**
	* IMAGE_VALUE_IN_TIME_MACHINE
	* @param string $image_value . Is valor_list of current image. We need replace path to enable view deleted image
	* @return
	*//*
	public static function image_value_in_time_machine( $image_value ) {

		# Example of url: /dedalo4/media_test/media_development/image/thumb/rsc29_rsc170_33.jpg

		preg_match("/src=\"(.+)\"/", $image_value, $output_array);
		if(!isset($output_array[1])) return $image_value;
		$image_url = $output_array[1];

		$image_id = pathinfo($image_url,PATHINFO_FILENAME);
			#dump($name, ' name ++ '.to_string());

		$image_deleted = self::get_deleted_image( $quality=DEDALO_IMAGE_THUMB_DEFAULT, $image_id );
			#dump($image_deleted, ' image_deleted ++ '.to_string());

		$ar_parts 		 = explode(DEDALO_MEDIA_PATH, $image_deleted);
		if(!isset($ar_parts[1])) return $image_value;
		$final_image_url = DEDALO_MEDIA_URL .$ar_parts[1];
			#dump($final_image_url, ' final_image_url ++ '.to_string());

		$final_image_value = str_replace($image_url, $final_image_url, $image_value);
			#dump($final_image_value, ' final_image_value ++ '.to_string());

		return (string)$final_image_value;
	}//end image_value_in_time_machine
	*/



	/**
	* GET_DELETED_IMAGE
	* @return string $last_file_path
	*/
	public function get_deleted_image( $quality ) {

		# media_path
		$media_path 	 = $this->get_image_path($quality);
		$folder_path_del = pathinfo($media_path,PATHINFO_DIRNAME).'/deleted';
		$image_id 		 = $this->get_image_id();

		#$media_path 	= DEDALO_MEDIA_PATH . DEDALO_IMAGE_FOLDER .'/'.$quality.'/deleted';
		$file_pattern 	= $folder_path_del.'/'.$image_id.'_*.'.DEDALO_IMAGE_EXTENSION;
		$ar_files 		= glob($file_pattern);
		if(SHOW_DEBUG===true) {
			#dump($ar_files, ' ar_files');#continue;
		}
		if (empty($ar_files)) {
			debug_log(__METHOD__." No files were found for image_id:$image_id in quality:$quality. ".to_string(), logger::DEBUG);
			return false;
		}
		natsort($ar_files);	# sort the files from newest to oldest
		$last_file_path = end($ar_files);

		return $last_file_path;
	}//end get_deleted_image



	/**
	* RENDER_LIST_VALUE
	* Overwrite for non default behaviour
	* Receive value from section list and return proper value to show in list
	* Sometimes is the same value (eg. component_input_text), sometimes is calculated (e.g component_portal)
	* @param string $value
	* @param string $tipo
	* @param int $parent
	* @param string $modo
	* @param string $lang
	* @param string $section_tipo
	* @param int $section_id
	*
	* @return string $value
	*
	* In time machine mode (list_tm) image is always calculated
	*/
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id, $current_locator=null, $caller_component_tipo=null) {

		//if ( (empty($value) && $modo==='portal_list') || $modo==='list_tm' || $modo==='portal_list_view_mosaic' || $modo==='edit' || $modo==='edit_in_list') {

			$component	= component_common::get_instance(__CLASS__,
														 $tipo,
														 $parent,
														 $modo,
														 $lang,
														 $section_tipo);
			$value 		= $component->get_html();
		//}

		return $value;
	}//end render_list_value



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( $lang=null ) {

		$diffusion_value = $this->get_image_url(DEDALO_IMAGE_QUALITY_DEFAULT);


		return (string)$diffusion_value;
	}//end get_diffusion_value



	/**
	* BUILD_STANDARD_IMAGE_FORMAT
	* If uploaded file is not in Dedalo standar format (jpg), is converted, and original is conserved (like filename.tif)
	* Used in tool_upload postprocessing file
	*/
	public static function build_standard_image_format($uploaded_file_path) {

		$f_extension = strtolower(pathinfo($uploaded_file_path, PATHINFO_EXTENSION));
		if ($f_extension!==DEDALO_IMAGE_EXTENSION) {

			# Create new file path
			$new_file_path = substr($uploaded_file_path, 0, -(strlen($f_extension)) ).DEDALO_IMAGE_EXTENSION;
			# Convert
			ImageMagick::convert($uploaded_file_path, $new_file_path);

			$file_path = $new_file_path;

		}else{

			# Unchanged path
			$file_path = $uploaded_file_path;
		}

		return $file_path;
	}//end build_standard_image_format



	/**
	* GET_AR_IMAGE_QUALITY
	* Get the list of defined image qualities in Dédalo config
	* @return array $ar_image_quality
	*/
	public function get_ar_image_quality() {

		$ar_image_quality = unserialize(DEDALO_IMAGE_AR_QUALITY);

		return $ar_image_quality;
	}//end get_ar_image_quality



	/**
	* GET_ALLOWED_EXTENSIONS
	* @return array $allowed_extensions
	*/
	public function get_allowed_extensions() {

		$allowed_extensions = is_array(DEDALO_IMAGE_EXTENSIONS_SUPPORTED)
			? DEDALO_IMAGE_EXTENSIONS_SUPPORTED
			: unserialize(DEDALO_IMAGE_EXTENSIONS_SUPPORTED);

		return $allowed_extensions;
	}//end get_allowed_extensions



	/**
	* GET_ORIGINAL_QUALITY
	* @return array $original_quality
	*/
	public function get_original_quality() {

		$original_quality = defined('DEDALO_IMAGE_QUALITY_ORIGINAL')
			? DEDALO_IMAGE_QUALITY_ORIGINAL
			: DEDALO_IMAGE_QUALITY_DEFAULT;

		return $original_quality;
	}//end get_original_quality



	/**
	* PROCESS_UPLOADED_FILE
	* @param object $file_data
	*	Data from trigger upload file
	* @return object $response
	*/
	public function process_uploaded_file($file_data) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__METHOD__.'] ';

		// vars
			$original_file_name = $file_data->original_file_name; 	// kike "my photo785.jpg"
			$full_file_name 	= $file_data->full_file_name;		// like "test175_test65_1.jpg"
			$full_file_path 	= $file_data->full_file_path;		// like "/mypath/media/image/1.5MB/test175_test65_1.jpg"

		// imagemagick. Normalize uploaded image format to Dédalo working format like jpg from tif
			try {

				// default_image_format : If uploaded file is not in Dedalo standar format (jpg), is converted,
				// and original file is conserved (like myfilename.tif and myfilename.jpg)
					$standard_file_path = self::build_standard_image_format($full_file_path);


				// target_filename. Save original file name in a component_input_text if defined
					$properties = $this->get_propiedades();
					if (isset($properties->target_filename)) {

						$current_section_id  		= $this->get_section_id();
						$target_section_tipo 		= $this->get_section_tipo();
						$model_name_target_filename = RecordObj_dd::get_modelo_name_by_tipo($properties->target_filename,true);
						$component_target_filename 	= component_common::get_instance(
																			$model_name_target_filename,
																			$properties->target_filename,
																			$current_section_id,
																			'edit',
																			DEDALO_DATA_NOLAN,
																			$target_section_tipo
																			);
						$component_target_filename->set_dato( $original_file_name );
						$component_target_filename->Save();
					}

				// custom_postprocessing_image. postprocessing_image_script
					if (defined('POSTPROCESSING_IMAGE_SCRIPT')) {
						sleep(1);
						require( POSTPROCESSING_IMAGE_SCRIPT );
						$result = custom_postprocessing_image($this);
					}

				// Save component image. Force update data and create default and thumb qualitys
					$this->Save();

				// all is ok
					$response->result 	= true;
					$response->msg 		= 'Ok. Request done ['.__METHOD__.'] ';

			} catch (Exception $e) {
				$msg = 'Exception[process_uploaded_file][ImageMagick]: ' .  $e->getMessage() . "\n";
				debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
				$response->msg .= ' - '.$msg;
			}


		return $response;
	}//end process_uploaded_file



}//end class
