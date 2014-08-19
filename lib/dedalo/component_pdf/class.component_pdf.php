<?php
/*
* CLASS COMPONENT AV
*/
require_once(DEDALO_LIB_BASE_PATH . '/media_engine/class.PdfObj.php');


class component_pdf extends component_common {
	

	# file name formated as 'tipo'-'order_id' like dd732-1
	public $pdf_id ; 
	public $pdf_url ;
	public $quality ;

	public $target_filename ;
	public $target_dir ;


	
	# COMPONENT_PDF COSNTRUCT
	function __construct($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
			
		
		# Si se pasa un id vacío (desde class.section es lo normal), se verifica si existe en matrix y si no, se crea un registro que se usará en adelante
		if(empty($id)) {

			# Despeja el id si existe a partir del tipo y el parent
			$id = component_common::get_id_by_tipo_parent($tipo, $parent, $lang);	
				#dump($id,'id',"para tipo:$tipo - parent:$parent - lang:$lang");

			# Si no existe, creamos un registro, SI O SI
			if(empty($id) && $modo=='edit') {

				if( !empty($tipo) && strlen($parent)>0 ) {
					$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
					$RecordObj_matrix 	= new RecordObj_matrix($matrix_table,NULL, $parent, $tipo, $lang);	#($id=NULL, $parent=false, $tipo=false, $lang=DEDALO_DATA_LANG, $matrix_table='matrix')					
					$RecordObj_matrix->set_parent($parent);
					$RecordObj_matrix->set_tipo($tipo);

					# TRADUCIBLE
					# Si el elemento no es traducible, lo crearemos como lag 'DEDALO_DATA_NOLAN'. En otro caso aplicamos el idioma de los adatos actual
					$RecordObj_ts 	= new RecordObj_ts($tipo);
					$traducible 	= $RecordObj_ts->get_traducible();
					if ($traducible=='no') {
						$lang = DEDALO_DATA_NOLAN;
					}
					$RecordObj_matrix->set_lang($lang);
				
					#####################################################################################################
					# PDF COUNTER NUMBER 

					# Store section dato as array(key=>value)
					# Current used keys: 'counter_number', 'created_by_userID', 'created_date'
					$ar_dato  = array();	
					$ar_dato['counter']				= counter::get_counter_value($tipo)+1;	#counter::get_new_counter_value($tipo);
						#dump($ar_dato,"ar-dato for tipo $this->tipo "); die();
					if(SHOW_DEBUG) {
						error_log("Updated counter (to ".$ar_dato['counter'].") of current component_pdf (tipo:$tipo - parent:$parent - lang:$lang)");
					}

					# END PDF COUNTER NUMBER
					######################################################################################################
					
					# Dato
					$RecordObj_matrix->set_dato($ar_dato);

					$RecordObj_matrix->Save();
					$id = $RecordObj_matrix->get_ID();


					# PDF COUNTER NUMBER UPDATE ########################################################################
					# If all is ok, update value (counter +1) in structure 'propiedades:counter'
					if ($id>0) {
						counter::update_counter($tipo);
					}


					# DEBUG
					if(SHOW_DEBUG===true) {
					$msg = "INFO: Created component_pdf record $id with: ($tipo, $parent, $lang)";
					error_log($msg);
					}
				}else{
					$msg = "Impossible create new component_pdf record ";
					if(SHOW_DEBUG===true) {
					$msg .= " ($id,$parent,$tipo,$lang)";
					}
					throw new Exception($msg, 1);
				}
			}
		}
		

		# ya tenemos registro en matrix, a continuar...
		parent::__construct($id, $tipo, $modo, $parent, $lang);

		# Set and fix current pdf_id
		$this->pdf_id = $this->get_pdf_id();		
		
		#dump($this);
	}
	
	
	
	# OVERRIDE COMPONENT_COMMON METHOD
	public function get_ar_tools_obj() {
		
		# Remove common tools (time machine and lang)
		unset($this->ar_tools_name);

		# Add tool_image_versions
		$this->ar_tools_name[] = 'tool_pdf_versions';

		
		return parent::get_ar_tools_obj();
	}



	/**
	* GET PDF ID
	* 
	*/
	public function get_pdf_id() {

		if(isset($this->pdf_id)) return $this->pdf_id;
		
		$ar_dato 		= $this->get_dato();		

		if (empty($ar_dato['counter'])) {
			return 0;
			
			$msg = "pdf counter_number unavailable !";			
			#throw new Exception("counter_number unavailable !", 1);
			return $msg;
			#return "<span class=\"error\">$msg</span>";	
		}

		$counter_number	= $ar_dato['counter'];

		return $this->tipo .'-'. $counter_number;
	}

	
	/**
	* GET QUALITY
	*/
	public function get_quality() {
		if(!isset($this->quality))	return DEDALO_PDF_QUALITY_DEFAULT;
		return $this->quality;
	}

	/**
	* UPLOAD NEEDED
	*/
	public function get_target_filename() {
		return $this->pdf_id .'.'. DEDALO_PDF_EXTENSION ;
	}
	public function get_target_dir() {
		return DEDALO_MEDIA_BASE_PATH . DEDALO_PDF_FOLDER .'/'. $this->get_quality() ;
	}

	/**
	* GET_PDF_URL
	*/
	public function get_pdf_url($quality=false) {

		if(!$quality)
		$quality 	= DEDALO_PDF_QUALITY_DEFAULT;
		$pdf_id 	= $this->get_pdf_id();
		
		#$file 		= DEDALO_MEDIA_BASE_PATH . DEDALO_PDF_FOLDER .'/'. $quality .'/'. $pdf_id .'.'. DEDALO_PDF_EXTENSION ;
		#if(!file_exists($file)) $pdf_id = '0';

		$final_file	= DEDALO_MEDIA_BASE_URL . DEDALO_PDF_FOLDER .'/'. $quality .'/'. $pdf_id .'.'. DEDALO_PDF_EXTENSION ;

		return $final_file;
	}
	
	/**
	* GET_PDF_PATH complete absolute file path like '/Users/myuser/works/Dedalo/pdf/standar/dd152-1.pdf'
	*/
	public function get_pdf_path($quality=false) {

		if(!$quality)
		$quality 	= $this->get_quality();
		$pdf_id 	= $this->get_pdf_id();

		return DEDALO_MEDIA_BASE_PATH . DEDALO_PDF_FOLDER .'/'. $quality . '/'. $pdf_id .'.'. DEDALO_PDF_EXTENSION ;
	}

	/**
	* GET_PDF_SIZE
	* Alias of $ImageObj->get_size()
	*/
	public function get_pdf_size($quality=false) {
		
		if(!$quality)
		$quality 	= $this->get_quality();
		$pdf_id 	= $this->get_pdf_id();
		$PdfObj 	= new PdfObj($pdf_id, $quality);
		return $PdfObj->get_size();
	}

	/**
	* GET_FILE_EXISTS
	*/
	public function get_file_exists($quality=false) {

		if(!$quality)
		$quality 	= $this->get_quality();
		$pdf_id 	= $this->get_pdf_id();
		$PdfObj 	= new PdfObj($pdf_id, $quality);
		
		return $PdfObj->get_file_exists();
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



}
?>