<?php

class records_search extends common {

	
	protected $section_obj;
	protected $modo;
	
	protected $section_tipo;
	protected $search_list_tipo;

	protected $ar_components_tipo;
	protected $ar_components_search;

	protected $ar_component_obj;
	protected $ar_components_search_obj;
	protected $ar_buttons_search_obj;

	
	function __construct( section $section_obj, $modo="search" ) {

		# CONTEXT : 'component_portal_inside_portal_list'
		# En este contexto (portal dentro de portal) no calcularemos el html
		#$context	= $section_records->section_obj->get_context();
			#dump($context,'context');
		#if($context=='component_portal_inside_portal_list') return null;


		#$this->section_records = $section_records;
		$this->section_obj 	= $section_obj;
		$this->section_tipo = $section_obj->get_tipo();
		$this->modo 		= $modo;

	}
	





	/**
	* GET_HTML
	* NOTAS PACO : Como los elementos del formulario son independientes (button search / max per page / button reset), si hacemos caché del html no se notifica la carga de
	* los ficheros css / js ... PROPUESTA: El cálculo del search form html lleva aprox 100 ms. ¿Integrar los botones para permitir hacer caché del html? ¿forzar la carga
	* de los css / js necesarios siempre en modo list? ... DECIDIR OPCIÓN
	*/
	public function get_html() { // Aprox 100 ms

		if(SHOW_DEBUG) {
			#$start_time = start_time();
			#global$TIMER;$TIMER[__METHOD__.'_ROW_SEARCH_IN_'.$this->section_tipo.'_'.microtime(1)]=microtime(1);
		}



		# CACHE	
		#unset($_SESSION['dedalo4']['config']['records_search'][$this->section_tipo]['html']);
		if(!SHOW_DEBUG && isset($_SESSION['dedalo4']['config']['records_search'][$this->section_tipo]['html'])) {
			return $_SESSION['dedalo4']['config']['records_search'][$this->section_tipo]['html'];
		}

		# Structure defined search element tipo
		# if not exists, return empty string
		$search_list_tipo = $this->get_search_list_tipo();
		if(!$search_list_tipo)	{
			return '';
		}
		
		ob_start();
		include ( __CLASS__ .'.php' );
		$html =  ob_get_clean();

		#dump($html,'html');

		# CACHE
		$_SESSION['dedalo4']['config']['records_search'][$this->section_tipo]['html'] = $html;
		
		if(SHOW_DEBUG) {
			#$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' [records_search]', "html");
			#global$TIMER;$TIMER[__METHOD__.'_ROW_SEARCH_OUT_'.$this->section_tipo.'_'.microtime(1)]=microtime(1);
		}

		return $html;
	}





	/**
	* GET_SEARCH_LIST_TIPO
	*/
	protected function get_search_list_tipo() {

		if(isset($this->search_list_tipo)) return $this->search_list_tipo;
		

		# SEARCH_LIST : Buscamos el termino relacionado de modelo 'search_list'
		$ar_search_list_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($this->section_tipo, 'search_list', true);
			#dump($search_list_tipo, 'search_list_tipo');

		if(empty($ar_search_list_tipo[0])) {
			$search_list_tipo = false;
			#throw new Exception("Error Processing Request. Please define search_list for ". RecordObj_dd::get_termino_by_tipo($section_tipo). " [$section_tipo]", 1);
		}else{
			$search_list_tipo = $ar_search_list_tipo[0];			
		}

		# Fix search_list_tipo
		$this->search_list_tipo = $search_list_tipo;		

		return $search_list_tipo;
	}




	/**
	* GET_AR_SEARCH_FIELDS
	* Localiza los componentes de la sección actual que quedarán disponibles como filtros para las búsquedas
	*/
	protected function get_ar_search_fields() {

		# CACHE	
		#unset($_SESSION['dedalo4']['config']['records_search'][$this->section_tipo]['ar_search_fields']);
		#if(isset($_SESSION['dedalo4']['config']['records_search'][$this->section_tipo]['ar_search_fields'])) {
		#	return unserialize($_SESSION['dedalo4']['config']['records_search'][$this->section_tipo]['ar_search_fields']);
		#}
		

		$ar_search_fields 	= array();

		# SEARCH_LIST : Buscamos el termino relacionado de modelo 'search_list'
		$search_list_tipo = $this->get_search_list_tipo();

		$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($search_list_tipo, true, $simple=true);
			#dump($ar_terminos_relacionados,'ar_terminos_relacionados');

		foreach ($ar_terminos_relacionados as $current_element_tipo) {

			$current_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_element_tipo,true);

			if( strpos($current_modelo_name, 'component_')!==false ) {

				#$section_tipo = component_common::get_section_tipo_from_component_tipo($current_element_tipo);
					#dump($section_tipo,'section_tipo current_element_tipo:'.$current_element_tipo);

				# NOTA: Se pasará SIEMPRE '$this->section_tipo' como sección aunque el componente relacionado pertenezaca a otra sección (nombre del informante por ejemplo)
				# Esto no es correcto pero no afecta el funcionamiento en este ámbito ya que los componentes no manejan datos en modo search
				$ar_search_fields[$current_element_tipo] = component_common::get_instance($current_modelo_name,
																						  $current_element_tipo,
																						  NULL,
																						  'search',
																						  DEDALO_DATA_LANG,
																						  $this->section_tipo);	#($tipo=NULL, $parent=NULL, $modo='edit', $lang=DEDALO_DATA_LANG)
					#dump($ar_search_fields[$current_element_tipo],'$ar_search_fields[$current_element_tipo]');
			}
		}
		#dump($this->get_ar_components_search(),'$this->ar_components_search');

		# CACHE
		#$_SESSION['dedalo4']['config']['records_search'][$this->section_tipo]['ar_search_fields'] = serialize($ar_search_fields);

		return $ar_search_fields ;
	}



	/**
	* GET_AR_TOOLS_SEARCH
	* Obtenemos los campos de la lista (equivale a los términos relacionados)
	*/
	public function get_ar_tools_search() {

		# CACHE
		#$section_tipo = $this->section->get_tipo();
		#if(isset($_SESSION['dedalo4']['config']['records_search'][$section_tipo]['ar_tools_search'])) {
			#return unserialize($_SESSION['dedalo4']['config']['records_search'][$section_tipo]['ar_tools_search']);
		#}

		$ar_tools_search = array();

		# SEARCH_LIST : Buscamos el termino relacionado de modelo 'search_list'
		$search_list_tipo = $this->get_search_list_tipo();


		$tools_search_tipo 	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($search_list_tipo, 'tools_search', 'termino_relacionado');
		if(empty($tools_search_tipo[0])) {			
			if(SHOW_DEBUG) {
				#throw new Exception("Error Processing Request: tools_search:tools_search_tipo not found in structure ($search_list_tipo)", 1);
				error_log("tools_search:tools_search_tipo not found in structure ($search_list_tipo)");
			}
			#trigger_error("Warning: tools_search_tipo not found in structure");
			#return false;
			return array();
		}
		$tools_search_tipo = $tools_search_tipo[0];
		#dump($tools_search_tipo,'tools_search_tipo');


		#$ar_childrens	= RecordObj_dd::get_ar_childrens($tools_search_tipo, false);
		$RecordObj_dd 	= new RecordObj_dd($tools_search_tipo);
		$ar_childrens 	= $RecordObj_dd->get_ar_childrens_of_this('si',null,null);
			#dump($ar_childrens,'ar_childrens '.$tools_search_tipo);

		foreach ($ar_childrens as $current_element_tipo) {

			$current_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_element_tipo,true);

			switch (true) {

				case ( strpos($current_modelo_name, 'button_')!==false ) :
					$current_element 	 = new $current_modelo_name($current_element_tipo,null);
					$ar_tools_search[$current_element_tipo] = $current_element;
					break;

				case ( strpos($current_modelo_name, 'component_')!==false ) :
					$current_element 	 = component_common::get_instance($current_modelo_name, $current_element_tipo, NULL, $this->modo, DEDALO_DATA_LANG, $this->section_tipo);
					$ar_tools_search[$current_element_tipo] = $current_element;
					break;
			}			
		}

		# CACHE
		#$_SESSION['dedalo4']['config']['records_search'][$section_tipo]['ar_tools_search'] = serialize($ar_tools_search);

		#dump($ar_tools_search,'$ar_tools_search');
		return $ar_tools_search ;
	}










	# SET AR COMPONENTS
	public function set_ar_component_search_obj() {

		$ar_component_search			= array();

		if( is_array($this->ar_components_search)) foreach($this->ar_components_search as $terminoID_group) {


			$RecordObj_dd	= new RecordObj_dd($terminoID_group);
			$tools_search	= $RecordObj_dd->get_ar_childrens_of_this();

			if( is_array($tools_search) ) foreach($tools_search as $tipo) {

				#$RecordObj_dd	= new RecordObj_dd($tipo);
				#$modeloID		= $RecordObj_dd->get_modelo();
				#$modelo		= RecordObj_dd::get_termino_by_tipo($modeloID);
				$modelo			= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
				
				switch($modelo) {

					case (strpos($modelo, 'component_') !== false)	: 	$this->ar_components_search_obj[]	= component_common::get_instance($modelo, $tipo, 'search', $this->section->get_ID(), DEDALO_DATA_LANG);
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

			#$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
			$this->ar_component_obj[] = component_common::get_instance(null, $current_tipo, $parent, 'search');

			# LOAD CURRENT COMPONENT
		}
	}







}
?>
