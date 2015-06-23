<?php
/*
* CLASS COMPONENT PROJECT LANGS
*/


class component_project_langs extends component_common {
	
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;


	function __construct($tipo=null, $parent=null, $modo='edit', $lang=null, $section_tipo=null) {

		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;

		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

		# Dato : Verificamos que hay un dato. Si no, asignamos el dato por defecto en el idioma actual
		$dato = $this->get_dato();

		# Si se pasa un id vacío (desde class.section es lo normal), se verifica si existe en matrix y si no, se crea un registro que se usará en adelante
		if(empty($dato) && $modo=='edit') {

			# Dato
			$dato = (array)unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);
			$this->set_dato($dato);
			$result = $this->Save();

			# DEBUG
			if(SHOW_DEBUG===true) {
				#$msg = "INFO: Created component_project_langs default dato in parent:$parent with: (tipo:$tipo, lang:$lang) dato:" . to_string($dato);
				#trigger_error($msg);
			}	
		}
		if(SHOW_DEBUG) {
			#dump(debug_backtrace());
		}		
	}


	# GET DATO : Format ["lg-cat","lg-spa","lg-eng"]
	public function get_dato() {
		$dato = parent::get_dato();
		return (array)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (array)$dato );
	}



	# GET AR LANGS (Get array of langs formated as $terminoID => $lang_name)
	protected function get_ar_langs() {
		
		$dato		= $this->get_dato();
		$ar_langs	= array();
		
		if(is_array($dato)) foreach($dato as $terminoID) {
			
			$lang_name				= RecordObj_ts::get_termino_by_tipo($terminoID,null,true);			
			$ar_langs[$terminoID]	= $lang_name ;
		}
		return $ar_langs;	
	}
	
	
	/**
	* SAVE
	* Overwrite common Save . Force always maintain default langs
	*/
	public function Save() {

		# ar langs mandatory (config)
		$dedalo_projects_default_langs = (array)unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);

		# current dato langs
		$current_dato_langs = (array)$this->dato;
		
		# prepend mandatory langs if they are not inside current dato
		foreach ($dedalo_projects_default_langs as $current_lang) {
			if(!in_array($current_lang, $current_dato_langs))
				array_unshift($current_dato_langs, $current_lang);
		}

		# update object
		$this->dato = $current_dato_langs;		

		# common save
		$result = parent::Save();

		# Reset session var (stored for speed)
		unset($_SESSION['dedalo4']['config']['ar_all_langs']);

		return $result;
	}
	
	

}
?>