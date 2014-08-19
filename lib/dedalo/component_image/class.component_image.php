<?php
/*
* CLASS COMPONENT AV
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

	public $ImageObj ; # Instance of ImageObj with current data 

	# Default image dimensions (as showed in section edit)
	public $widht 	= 539 ;
	public $height 	= 404 ;

	
	# COMPONENT_IMAGE COSNTRUCT
	function __construct($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=NULL) {
		
		# Force allways DEDALO_DATA_NOLAN
		$lang = $this->lang;				
	

		# Si se pasa un id vacío (desde class.section es lo normal), se verifica si existe en matrix y si no, se crea un registro que se usará en adelante
		if(empty($id)) {

			# Despeja el id si existe a partir del tipo y el parent
			$id = component_common::get_id_by_tipo_parent($tipo, $parent, $lang);	
				#dump($id,"para tipo:$tipo - parent:$parent - lang:$lang");

			# Si no existe, creamos un registro, si o si
			if(empty($id) && $modo=='edit') {

				if( !empty($tipo) && strlen($parent)>0 ) {
					$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
					$RecordObj_matrix 	= new RecordObj_matrix($matrix_table, NULL, $parent, $tipo, $lang);	#($id=NULL, $parent=false, $tipo=false, $lang=DEDALO_DATA_LANG, $matrix_table='matrix')
					$RecordObj_matrix->set_parent($parent);
					$RecordObj_matrix->set_tipo($tipo);
					$RecordObj_matrix->set_lang($lang);
				
					#####################################################################################################
					# IMAGE COUNTER NUMBER 

					# Store section dato as array(key=>value)
					# Current used keys: 'counter_number', 'created_by_userID', 'created_date'
					$ar_dato  = array();	
					$ar_dato['counter']				= counter::get_counter_value($tipo)+1;	#counter::get_new_counter_value($tipo);
						#dump($ar_dato,"ar-dato for tipo $this->tipo "); die();
					if(SHOW_DEBUG) {
						error_log("Updated counter (to ".$ar_dato['counter'].") of current component_image (tipo:$tipo - parent:$parent - lang:$lang)");
					}

					# END IMAGE COUNTER NUMBER
					######################################################################################################
					
					# Dato
					$RecordObj_matrix->set_dato($ar_dato);

					$RecordObj_matrix->Save();
					$id = $RecordObj_matrix->get_ID();


					# IMAGE COUNTER NUMBER UPDATE ########################################################################
					# If all is ok, update value (counter +1) in structure 'propiedades:counter'
					if ($id>0) {
						counter::update_counter($tipo);
					}

					$dato = $RecordObj_matrix->get_dato();


					# DEBUG
					if(SHOW_DEBUG===true) {
					#dump($dato,'dato');
					$msg = "INFO: Created component_image record $id with: ($tipo, $parent, $lang) dato:". print_r($dato,true) ;
					#error_log($msg);
					}
				}else{
					$msg = "Impossible create new component_image record ";
					if(SHOW_DEBUG===true) {
					$msg .= " ($id,$parent,$tipo,$lang)";
					}
					throw new Exception($msg, 1);
				}
			}
		}

		# ya tenemos registro en matrix, a continuar...
		parent::__construct($id, $tipo, $modo, $parent, $lang);

		
		# IMAGE_ID : Set and fix current image_id
		$this->image_id = $this->get_image_id();

		
		# ADITIONAL_PATH : Set and fix current aditional image path
		$this->aditional_path = $this->get_aditional_path();
			#dump($this->aditional_path,'$this->aditional_path');


		# IMAGEOBJ : Add a ImageObj obj
		$this->ImageObj = new ImageObj( $this->get_image_id(), $this->get_quality(), $this->get_aditional_path() );
		
		#dump($this);

	}#end __construct


	/**
	* GET IMAGE ID
	* Por defecto se construye con el tipo del component_image actual y el número de orden, ej. 'dd750-1'
	* Se puede sobreescribir en propiedades con json ej. {"image_id":"dd851"} y se leerá del contenido del componente referenciado
	*/
	public function get_image_id() {

		if(isset($this->image_id)) return $this->image_id;

		# 1 REFERENCED NAME : If isset propiedades "image_id" overwrite name with field ddx content
		$propiedades = $this->get_propiedades();
		if (isset($propiedades->image_id)) {

			$component_tipo 	= $propiedades->image_id;
			$component_modelo 	= RecordObj_ts::get_modelo_name_by_tipo($component_tipo);

			$component 	= new $component_modelo(null, $component_tipo, 'edit', $this->parent, DEDALO_DATA_NOLAN);
			$dato 		= trim($component->get_dato());
				#dump($dato,'$dato');

			if(!empty($dato) && strlen($dato)>0) return $dato;
		}

		# 2 DEFAULT NAME : Default behavior like 'dd750-1'
		$ar_dato 		= $this->get_dato();
		$counter_number	= $ar_dato['counter'];

		if (empty($counter_number)) {
			return 0;
			
			$msg = "image counter_number unavailable !";
			#throw new Exception("counter_number unavailable !", 1);
			return $msg;
			#return "<span class=\"error\">$msg</span>";	
		}
		$image_id = $this->tipo .'-'. $counter_number;		
			#dump($image_id,'image_id');	

		return $image_id;
	}


	/**
	* GET_ADITIONAL_PATH
	*/
	public function get_aditional_path() {

		static $ar_aditional_path;

		#if(isset($ar_aditional_path[$this->image_id])) return $ar_aditional_path[$this->image_id];
		if(isset($this->aditional_path)) return $this->aditional_path;

		$propiedades = $this->get_propiedades();
		if (isset($propiedades->aditional_path)) {

			$component_tipo 	= $propiedades->aditional_path;
			$component_modelo 	= RecordObj_ts::get_modelo_name_by_tipo($component_tipo);

			$component 	= new $component_modelo(null, $component_tipo, 'edit', $this->parent, DEDALO_DATA_NOLAN);
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

		}else{
			$ar_aditional_path[$this->image_id] = false;
		}

		return $ar_aditional_path[$this->image_id];
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
	* GET VALOR
	* LIST:
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	*/
	public function get_valor() {
		# SID like "dd75-1"
		return $this->get_tipo() .'-'. $this->get_dato()['counter'];
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
	* GET_IMAGE_PATH complete absolute file path like '/Users/myuser/works/Dedalo/images/1.5MB/dd152-1.jpg'
	*/
	public function get_image_path($quality=false) {

		if(!$quality)
		$quality 	= $this->get_quality();

		$ImageObj = $this->ImageObj; #new ImageObj($this->get_image_id(), $quality, $this->get_aditional_path() );	#($image_id, $quality=false, $aditional_path=false)
		$ImageObj->set_quality($quality);
			#dump($ImageObj->get_local_full_path(),'$ImageObj '.$quality);
		return $ImageObj->get_local_full_path();
		#return DEDALO_MEDIA_BASE_PATH . DEDALO_IMAGE_FOLDER .'/'. $quality . $this->aditional_path . '/' . $image_id .'.'. DEDALO_IMAGE_EXTENSION ;
	}

	/**
	* GET_IMAGE_URL
	*/
	public function get_image_url($quality=false) {

		if(!$quality)
		$quality 	= $this->get_quality();
		$image_id 	= $this->get_image_id();

		$ImageObj = $this->ImageObj; #new ImageObj($image_id, $quality, $this->get_aditional_path() );	#($image_id, $quality=false, $aditional_path=false)
		$ImageObj->set_quality($quality);

		# FILE EXISTS TEST : If not, show '0' dedalo image logo
		$file 		= $ImageObj->get_local_full_path();
		if(!file_exists($file)) $image_id = '0';

		return $ImageObj->media_path() . $image_id .'.'. $ImageObj->get_extension() ;		
	}

	/**
	* GET_IMAGE_SIZE
	* Alias of $ImageObj->get_size()
	*/
	public function get_image_size($quality=false) {
		
		if(!$quality)
		$quality 		= $this->get_quality();
		$image_id 		= $this->get_image_id();
		$aditional_path	= $this->get_aditional_path();

		$ImageObj 		= $this->ImageObj; #new ImageObj($this->image_id, $quality, $aditional_path);
		$ImageObj->set_quality($quality);

		return $ImageObj->get_size();		
	}


	/**
	* GET_IMAGE_DIMENSIONS
	*//*
	public function get_image_dimensions($quality) {
		$ImageObj = new ImageObj($this->image_id, $quality, $aditional_path);
		$ar_info = $ImageObj->get_image_dimensions($quality);
		return $ar_info;
	}
	*/


	/**
	* GET_IMAGE_PRINT_DIMENSIONS
	*/
	public function get_image_print_dimensions($quality) {

		$ImageObj = $this->ImageObj; #new ImageObj($this->image_id, $quality, $this->aditional_path);
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


	
	


	



}
?>