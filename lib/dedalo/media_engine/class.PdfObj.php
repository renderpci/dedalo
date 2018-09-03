<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.MediaObj.php');


class PdfObj extends MediaObj {
	
	protected $pdf_id ;			# pdf_id
	protected $quality ;
		
	function __construct($pdf_id, $quality=false, $aditional_path=false, $initial_media_path) {		
		
		# SPECIFIC VARS
		$this->set_pdf_id($pdf_id);
		$this->set_name($pdf_id);
		$this->set_quality($quality);

		$this->initial_media_path = $initial_media_path; // No usada de momento
		$this->aditional_path 	  = $aditional_path;
		
		parent::__construct($pdf_id);

	}
	
	
	# MANDATORY DEFINITIONS
	protected function define_name(){
		return $this->pdf_id ;
	}
	protected function define_type() {
		return DEDALO_PDF_TYPE;
	}
	protected function define_extension() {
		return DEDALO_PDF_EXTENSION;
	}
	protected function define_media_path() {
		return $this->get_media_path();
	}
	protected function define_media_path_abs() {
		return $this->get_media_path_abs();
	}
	protected function define_media_path_server() {
		return $this->get_media_path_server();
	}
	protected function define_mime_type() {	
		return DEDALO_PDF_MIME_TYPE;
	}

	public function get_media_path() {
		return DEDALO_MEDIA_BASE_URL . DEDALO_PDF_FOLDER . $this->initial_media_path . '/' . $this->quality . $this->aditional_path . '/';
	}
	public function get_media_path_abs() {
		return DEDALO_MEDIA_BASE_PATH . DEDALO_PDF_FOLDER. $this->initial_media_path. '/'  . $this->quality . $this->aditional_path . '/';
	}	
	
	public function get_media_path_server() {
			return DEDALO_MEDIA_BASE_PATH . DEDALO_IMAGE_FOLDER. $this->initial_media_path. '/'  . DEDALO_IMAGE_QUALITY_ORIGINAL . $this->aditional_path . '/';
	}

	# GET DEFAULT QUALITY
	public static function get_quality_default() {
		return DEDALO_PDF_QUALITY_DEFAULT;		
	}
	
	# GET ARRAY QUALITY OPTIONS
	public static function get_ar_quality() {			
		return unserialize(DEDALO_PDF_AR_QUALITY);		
	}	
	
	
	
	/**
	* SET QUALITY
	* Asigna la calidad recibida verificando que existe en el arary de calidades definido en config
	* So no existe, asigna la calidad por defecto
	*/
	protected function set_quality($quality) {
		
		$default	= $this->get_quality_default();
		$ar_valid 	= $this->get_ar_quality();
		
		if(empty($quality)) {
			$this->quality = $default;
			return $this->quality;
		}
		#dump($quality,"QUALITY HERE");
		#$quality 	= strtolower($quality);			
		
		if(!is_array($ar_valid)) {
			throw new Exception("config ar_valid is not defined!", 1);
		}
		
		if(!in_array($quality,$ar_valid)) {
			$quality = $default ;		#dump($ar_valid,"$quality NO IS IN ARRAY !!!!!");
		}

		$this->quality = $quality;
		
		return $this->quality;
	}
	
	
	# QUALITY FOLDERS WITH EXISTING FILES 
	# Return array whith existing quality files
	public function get_ar_quality_with_file() {
		
		$ar_quality 			= self::get_ar_quality();
		$ar_quality_with_file	= array();
		 
		if(is_array($ar_quality)) foreach($ar_quality as $quality) {
			
			#$obj = new PdfObj($this->image_id, $quality);
			$obj = new PdfObj($this->pdf_id, $quality, $this->aditional_path, $this->initial_media_path);

			 
			if($obj->get_file_exists()) {
				 				
				 $ar_quality_with_file[] = $quality ;
			}			 
		}		
		return $ar_quality_with_file ;	
	}
	
	

	
}
?>