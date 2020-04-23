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
	function __construct($tipo, $parent, $modo='edit', $lang=DEDALO_DATA_LANG, $section_tipo=null) {
		
		if(SHOW_DEBUG) {
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$tipo.'_'.$modo.'_'.microtime(1)]=microtime(1);
		}

		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

		# Dato : Verificamos que hay un dato. Si no, asignamos el dato por defecto en el idioma actual
		$dato = $this->get_dato();
			#dump(empty($dato)," dato $modo");

		$need_save=false;
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
			$need_save=true;
		}#end if(empty($dato->counter) && $this->parent>0)	

			#
			# CONFIGURACIÓN NECESARIA PARA PODER SALVAR (Al salvar se guarda una versión valor_list html que no funciona si no no están estas variables asignadas)
			#
				# Set and fix current html_file_id
				$this->html_file_id = $this->get_html_file_id();	
			
		
		if ($need_save) {
			# result devuelve el id de la sección parent creada o editada
			$result = $this->Save();
			if(SHOW_DEBUG) {
				error_log("Updated ".RecordObj_dd::get_termino_by_tipo($this->tipo)." locator (to ".$locator->get_flat().") of current ".get_called_class()." (tipo:$this->tipo - section_tipo:$this->section_tipo - parent:$this->parent - lang:$this->lang)");
			}			
		}#end if ($need_save)
		

		if(SHOW_DEBUG) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

	}

	# GET DATO : Format {"counter":1}
	public function get_dato() {
		$dato = parent::get_dato();
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
		return $this->get_html_file_id();
	}
	
	/**
	* GET PDF ID
	* 
	*/
	public function get_html_file_id() {

		if(isset($this->html_file_id)) return $this->html_file_id;
		
		$dato = $this->get_dato();
		if (!isset($dato->section_id)) {
			if(SHOW_DEBUG) {
				trigger_error(__METHOD__." Component dato is empty");
			}
			return 0;	
		}
		$locator  = new locator($dato);
		$html_file_id = $locator->get_flat($dato);
			#dump($html_file_id,'html_file_id');	

		return $this->html_file_id = $html_file_id;
	}

	/**
	* UPLOAD NEEDED
	*/
	public function get_target_filename() {
		return $this->html_file_id .'.'. DEDALO_HTML_FILES_EXTENSION ;
	}
	public function get_target_dir() {
		return DEDALO_MEDIA_PATH . DEDALO_HTML_FILES_FOLDER ;
	}

	/**
	* GET_html_file_URL
	*/
	public function get_html_file_url() {

		$html_file_id 	= $this->get_html_file_id();

		$final_file	= DEDALO_MEDIA_URL . DEDALO_HTML_FILES_FOLDER .'/'. $html_file_id .'.'. DEDALO_HTML_FILES_EXTENSION ;

		return $final_file;
	}
	
	/**
	* GET_html_file_PATH complete absolute file path like '/Users/myuser/works/Dedalo/pdf/standar/dd152-1.pdf'
	*/
	public function get_html_file_path() {

		$html_file_id 	= $this->get_html_file_id();

		return DEDALO_MEDIA_PATH . DEDALO_HTML_FILES_FOLDER .'/'. $html_file_id .'.'. DEDALO_HTML_FILES_EXTENSION ;
	}

	
	

	



	/**
	* REMOVE_COMPONENT_MEDIA_FILES
	* "Remove" (rename and move files to deleted folder) all media file vinculated to current component (all quality versions)
	* Is triggered wen section tha contain media elements is deleted
	* @see section:remove_section_media_files
	*/
	public function remove_component_media_files() {		
		
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
		
		# WORK IN PROGRESS !!
		return true;
	}


}
?>