<?php
/**
* RECORDS_SEARCH
*
*
*/
class records_search extends common {

	
	protected $section_obj;
	protected $modo;
	
	protected $section_tipo;
	#protected $search_list_tipo;

	protected $ar_components_tipo;
	protected $ar_components_search;

	protected $ar_component_obj;
	protected $ar_components_search_obj;
	protected $ar_buttons_search_obj;

	
	/**
	* __CONSTRUCT
	*/
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
	}//end __construct



	/**
	* GET_HTML
	* NOTAS PACO : Como los elementos del formulario son independientes (button search / max per page / button reset), si hacemos caché del html no se notifica la carga de
	* los ficheros css / js ... PROPUESTA: El cálculo del search form html lleva aprox 100 ms. ¿Integrar los botones para permitir hacer caché del html? ¿forzar la carga
	* de los css / js necesarios siempre en modo list? ... DECIDIR OPCIÓN
	*/
	public function get_html() { // Aprox 100 ms
		
		ob_start();
		include ( __CLASS__ .'.php' );
		$html =  ob_get_clean();

		# CACHE
		#$_SESSION['dedalo4']['config']['records_search'][$section_to_cache]['html'] = $html;		
		
		return (string)$html;
	}//end get_html



}//end records_search
?>