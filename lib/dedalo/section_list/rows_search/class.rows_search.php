<?php
require_once(DEDALO_LIB_BASE_PATH . '/common/class.common.php');


class rows_search extends common {

	protected $tipo;
	protected $modo;
	protected $section_list;
	protected $section;
	protected $search_list_tipo;

	protected $ar_components_tipo;
	protected $ar_components_search;


	protected $lang;

	protected $ar_component_obj;
	protected $ar_components_search_obj;
	protected $ar_buttons_search_obj;

	function __construct( section_list $section_list ) {

		# CONTEXT : 'component_portal_inside_portal_list'
		# En este contexto (portal dentro de portal) no calcularemos el html
		$context	= $section_list->section_obj->get_context();
			#dump($context,'context');
		if($context=='component_portal_inside_portal_list') return null;


		$this->section_list = $section_list;
		$this->section 		= $section_list->get_section_obj();
		$this->tipo 		= $section_list->get_tipo();
		$this->modo 		= $section_list->get_modo();
	}
	


	/**
	* GET_HTML
	*/
	public function get_html() {

		if(SHOW_DEBUG) $start_time = start_time();

		$search_list_tipo = $this->get_search_list_tipo();
		if(!$search_list_tipo)	return '<br>';

		ob_start();
		include ( get_called_class() .'.php' );
		$html =  ob_get_clean();
		

		
		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' [rows_search]', "html");
			global$TIMER;$TIMER[__METHOD__.'_'.$this->tipo.'_'.microtime(1)]=microtime(1);
		}

		return $html;
	}


	/**
	* GET_SEARCH_LIST_TIPO
	*/
	protected function get_search_list_tipo() {

		if(isset($this->search_list_tipo)) return $this->search_list_tipo;

		$section_tipo = $this->section->get_tipo();

		# SEARCH_LIST : Buscamos el termino relacionado de modelo 'search_list'
		$search_list_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, 'search_list');
			#dump($search_list_tipo, 'search_list_tipo');
		if(empty($search_list_tipo[0])) {
			return false;
			#throw new Exception("Error Processing Request. Please define search_list for ". RecordObj_ts::get_termino_by_tipo($section_tipo). " [$section_tipo]", 1);
		}

		# Fix search_list_tipo
		$this->search_list_tipo = $search_list_tipo[0];

		return $search_list_tipo[0];
	}




	/**
	* GET_AR_SEARCH_FIELDS
	* Localiza los componentes de la sección actual (todos) que serán disponibles como filtros para las búsquedas
	*/
	protected function get_ar_search_fields() {

		# CACHE
		$section_tipo = $this->section->get_tipo();	#unset($_SESSION['config4']['rows_search'][$section_tipo]);
		#if(isset($_SESSION['config4']['rows_search'][$section_tipo]['ar_search_fields'])) {
			#return unserialize($_SESSION['config4']['rows_search'][$section_tipo]['ar_search_fields']);
		#}

		$ar_search_fields 	= array();

		# SEARCH_LIST : Buscamos el termino relacionado de modelo 'search_list'
		$search_list_tipo = $this->get_search_list_tipo();

		$ar_terminos_relacionados = RecordObj_ts::get_ar_terminos_relacionados($search_list_tipo, $cache=false, $simple=true);
			#dump($ar_terminos_relacionados,'ar_terminos_relacionados');

		foreach ($ar_terminos_relacionados as $current_element_tipo) {

			$current_modelo_name = RecordObj_ts::get_modelo_name_by_tipo($current_element_tipo);

			if( strpos($current_modelo_name, 'component_')!==false ) {

				#$section_tipo = component_common::get_section_tipo_from_component_tipo($current_element_tipo);
					#dump($section_tipo,'section_tipo current_element_tipo:'.$current_element_tipo);

				$ar_search_fields[$current_element_tipo] = new $current_modelo_name('dummy',$current_element_tipo,'search');
			}
		}
		#dump($this->get_ar_components_search(),'$this->ar_components_search');

		# CACHE
		#$_SESSION['config4']['rows_search'][$section_tipo]['ar_search_fields'] = serialize($ar_search_fields);

		return $ar_search_fields ;
	}



	/**
	* GET_AR_TOOLS_SEARCH
	* Obtenemos los campos de la lista (equivale a los términos relacionados)
	*/
	public function get_ar_tools_search() {

		# CACHE
		$section_tipo = $this->section->get_tipo();
		#if(isset($_SESSION['config4']['rows_search'][$section_tipo]['ar_tools_search'])) {
			#return unserialize($_SESSION['config4']['rows_search'][$section_tipo]['ar_tools_search']);
		#}

		$ar_tools_search = array();

		# SEARCH_LIST : Buscamos el termino relacionado de modelo 'search_list'
		$search_list_tipo = $this->get_search_list_tipo();


		$tools_search_tipo 	= RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($search_list_tipo, 'tools_search', 'termino_relacionado')[0];
		if(empty($tools_search_tipo)) {
			throw new Exception("Error Processing Request: tools_search:tools_search_tipo not found in structure", 1);
			#trigger_error("Warning: tools_search_tipo not found in structure");
			#return false;
		}
		#dump($tools_search_tipo,'tools_search_tipo');


		$ar_childrens  = RecordObj_ts::get_ar_childrens($tools_search_tipo);
			#dump($ar_childrens,'ar_childrens '.$tools_search_tipo);

		foreach ($ar_childrens as $current_element_tipo) {

			$current_modelo_name = RecordObj_ts::get_modelo_name_by_tipo($current_element_tipo);

			switch (true) {

				case ( strpos($current_modelo_name, 'button_')!==false ) :
					$current_element 	 = new $current_modelo_name($current_element_tipo,null);
					break;

				case ( strpos($current_modelo_name, 'component_')!==false ) :
					$current_element 	 = new $current_modelo_name('dummy',$current_element_tipo,'search');
					break;
			}

			$ar_tools_search[$current_element_tipo] = $current_element;
		}

		# CACHE
		#$_SESSION['config4']['rows_search'][$section_tipo]['ar_tools_search'] = serialize($ar_tools_search);

		#dump($ar_tools_search,'$ar_tools_search');
		return $ar_tools_search ;
	}










	# SET AR COMPONENTS
	public function set_ar_component_search_obj() {

		$ar_component_search			= array();

		if( is_array($this->ar_components_search)) foreach($this->ar_components_search as $terminoID_group) {


			$RecordObj_ts	= new RecordObj_ts($terminoID_group);
			$tools_search	= $RecordObj_ts->get_ar_childrens_of_this();

			if( is_array($tools_search) ) foreach($tools_search as $tipo) {

				$RecordObj_ts	= new RecordObj_ts($tipo);
				$modeloID		= $RecordObj_ts->get_modelo();
				$modelo			= RecordObj_ts::get_termino_by_tipo($modeloID);

				switch($modelo) {

					case (strpos($modelo, 'component_') !== false)	: 	$this->ar_components_search_obj[]	= new $modelo(NULL, $tipo, 'search', 0, DEDALO_DATA_LANG);	#component_common::load_component(NULL, $tipo, 'search');
																		break;

					case (strpos($modelo, 'button_') 	!== false)	: 	$this->ar_buttons_search_obj[]		= new $modelo($tipo, NULL, 'search', 0, DEDALO_DATA_LANG);
																		break;
				}

			}
		}
		#dump($this->ar_components_search_obj,'$this->ar_components_search_obj');
	}


	# RECORRE Y CARGA TODOS LOS COMPONENTES DE ESTE ROW EN UN ARRAY COMO OBJETOS
	public function set_ar_component_obj() {

		$ar_component_obj= array();
		$parent = 0;

		if( is_array($this->ar_components_tipo)) foreach($this->ar_components_tipo as $current_tipo) {

			$modelo_name = RecordObj_ts::get_modelo_name_by_tipo($current_tipo);
			$this->ar_component_obj[] = new $modelo_name(null,$current_tipo,'search',$parent);	#$id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) 

			# LOAD CURRENT COMPONENT			
			#$this->ar_component_obj[]	= component_common::load_component(NULL, $current_tipo, 'search', $parent);	# load_component($current_id=NULL, $current_tipo=NULL, $modo='edit', $parent=NULL, $lang=NULL)
		}
	}







}
?>
