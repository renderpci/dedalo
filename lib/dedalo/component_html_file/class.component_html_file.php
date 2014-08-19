<?php
/*
* CLASS COMPONENT_HTML













	++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

	COMPONENT_HTML_FILE : 	Boceto del componente para tener una salida de datos normalizada
							Revisar el concepto y funcionamiento

	Componente experimental de momento.
	Usado para gestionar los fichero html generados por Dédalo, no del sistema, si no de información 
	que	necesita ser guardada en fichero independiente html 
		
	++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++






















*/


class component_html_file extends component_common {
	

	# file name formated as 'tipo'-'order_id' like dd732-1
	public $html_file_id ; 
	public $html_file_url ;

	public $target_filename ;
	public $target_dir ;


	
	# COMPONENT_HTML_FILE CONSTRUCT
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
					# HTML_FILE COUNTER NUMBER 

					# Store section dato as array(key=>value)
					# Current used keys: 'counter_number', 'created_by_userID', 'created_date'
					$ar_dato  = array();	
					$ar_dato['counter']				= counter::get_counter_value($tipo)+1;	#counter::get_new_counter_value($tipo);
						#dump($ar_dato,"ar-dato for tipo $this->tipo "); die();
					if(SHOW_DEBUG) {
						error_log("Updated counter (to ".$ar_dato['counter'].") of current component_html_file (tipo:$tipo - parent:$parent - lang:$lang)");
					}

					# END HTML_FILE COUNTER NUMBER
					######################################################################################################
					
					# Dato
					$RecordObj_matrix->set_dato($ar_dato);

					$RecordObj_matrix->Save();
					$id = $RecordObj_matrix->get_ID();


					# COUNTER NUMBER UPDATE ########################################################################
					# If all is ok, update value (counter +1) in structure 'propiedades:counter'
					if ($id>0) {
						counter::update_counter($tipo);
					}


					# DEBUG
					if(SHOW_DEBUG===true) {
					$msg = "INFO: Created component_html_file record $id with: ($tipo, $parent, $lang)";
					error_log($msg);
					}
				}else{
					$msg = "Impossible create new component_html_file record ";
					if(SHOW_DEBUG===true) {
					$msg .= " ($id,$parent,$tipo,$lang)";
					}
					throw new Exception($msg, 1);
				}
			}
		}
		

		# ya tenemos registro en matrix, a continuar...
		parent::__construct($id, $tipo, $modo, $parent, $lang);

		# Set and fix current html_file_id
		$this->html_file_id = $this->get_html_file_id();		
		
		#dump($this);
	}
	
	
	
	# OVERRIDE COMPONENT_COMMON METHOD
	public function get_ar_tools_obj() {
		
		# Remove common tools (time machine and lang)
		unset($this->ar_tools_name);

		# Add tool_image_versions
		#$this->ar_tools_name[] = 'tool_html_file_versions';

		# empty
		$this->ar_tools_name = array();
		
		return parent::get_ar_tools_obj();
	}



	/**
	* GET PDF ID
	* 
	*/
	public function get_html_file_id() {

		if(isset($this->html_file_id)) return $this->html_file_id;
		
		$ar_dato 		= $this->get_dato();		

		if (empty($ar_dato['counter'])) {
			return 0;
			
			$msg = "component_html_file counter_number unavailable !";			
			#throw new Exception("counter_number unavailable !", 1);
			return $msg;
			#return "<span class=\"error\">$msg</span>";	
		}

		$counter_number	= $ar_dato['counter'];

		return $this->tipo .'-'. $counter_number;
	}

	/**
	* UPLOAD NEEDED
	*/
	public function get_target_filename() {
		return $this->html_file_id .'.'. DEDALO_HTML_FILES_EXTENSION ;
	}
	public function get_target_dir() {
		return DEDALO_MEDIA_BASE_PATH . DEDALO_HTML_FILES_FOLDER ;
	}

	/**
	* GET_html_file_URL
	*/
	public function get_html_file_url() {

		$html_file_id 	= $this->get_html_file_id();

		$final_file	= DEDALO_MEDIA_BASE_URL . DEDALO_HTML_FILES_FOLDER .'/'. $html_file_id .'.'. DEDALO_HTML_FILES_EXTENSION ;

		return $final_file;
	}
	
	/**
	* GET_html_file_PATH complete absolute file path like '/Users/myuser/works/Dedalo/pdf/standar/dd152-1.pdf'
	*/
	public function get_html_file_path() {

		$html_file_id 	= $this->get_html_file_id();

		return DEDALO_MEDIA_BASE_PATH . DEDALO_HTML_FILES_FOLDER .'/'. $html_file_id .'.'. DEDALO_HTML_FILES_EXTENSION ;
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