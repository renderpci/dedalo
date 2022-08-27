<?php
require_once( DEDALO_CONFIG_PATH .'/config.php');
// require_once( DEDALO_CORE_PATH . '/media_engine/class.MediaObj.php');


class PdfObj extends MediaObj {



	protected $pdf_id;
	protected $quality;



	function __construct(?string $pdf_id, $quality=false, $aditional_path=false, $initial_media_path=false) {

		# specific vars
		$this->set_pdf_id($pdf_id);
		$this->set_name($pdf_id);
		$this->set_quality($quality);

		$this->initial_media_path	= $initial_media_path; // No usada de momento
		$this->aditional_path		= $aditional_path;

		parent::__construct($pdf_id);
	}//end __construct



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
		return DEDALO_MEDIA_URL . DEDALO_PDF_FOLDER . $this->initial_media_path . '/' . $this->quality . $this->aditional_path;
	}
	public function get_media_path_abs() {
		return DEDALO_MEDIA_PATH . DEDALO_PDF_FOLDER. $this->initial_media_path. '/'  . $this->quality . $this->aditional_path;
	}

	public function get_media_path_server() {
		return DEDALO_MEDIA_PATH . DEDALO_IMAGE_FOLDER. $this->initial_media_path. '/'  . DEDALO_IMAGE_QUALITY_ORIGINAL . $this->aditional_path;
	}

	# GET DEFAULT QUALITY
	public static function get_quality_default() {
		return DEDALO_PDF_QUALITY_DEFAULT;
	}

	# GET ARRAY QUALITY OPTIONS
	public static function get_ar_quality() {
		return DEDALO_PDF_AR_QUALITY;
	}



	/**
	* SET QUALITY
	* Assigns the quality received verifying that it exists in the qualities array defined in config
	* If it does not exist, it assigns the default quality
	* @param string $quality = null
	* @return string $his->quality
	*/
	protected function set_quality(string $quality=null) : string {

		$default	= $this->get_quality_default();
		$ar_valid	= $this->get_ar_quality();

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
	}//end set_quality


	/**
	* GET_AR_QUALITY_WITH_FILE
	* Quality folders with existing files
	* Return array with existing quality files
	* @return array $ar_quality_with_file
	*/
	public function get_ar_quality_with_file() : array {

		$ar_quality 			= self::get_ar_quality();
		$ar_quality_with_file	= [];

		if(is_array($ar_quality)) foreach($ar_quality as $quality) {

			#$obj = new PdfObj($this->image_id, $quality);
			$obj = new PdfObj(
				$this->pdf_id,
				$quality,
				$this->aditional_path,
				$this->initial_media_path
			);

			if($obj->get_file_exists()) {
				 $ar_quality_with_file[] = $quality ;
			}
		}
		return $ar_quality_with_file;
	}//end get_ar_quality_with_file



}//end class PdfObj
