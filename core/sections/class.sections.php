<?php
/*
* CLASS SECTIONS
*/
class sections extends common {

	/**
	* CLASS VARS
	*/
		# Overwrite __construct var lang passed in this component
		protected $lang;// = DEDALO_DATA_NOLAN;

		# FIELDS
		protected $ar_locators;
		protected $ar_section_tipo;
		protected $dato;

		# modo
		protected $modo;

		# context. Full context
		public $base_context;

		# search_query_object
		public $search_query_object;



	/**
	* GET_INSTANCE
    * Singleton pattern
    * @returns array array of section objects by key
    */
    public static function get_instance($ar_locators=[], $search_query_object=null, $caller_tipo=null, $modo='edit', $lang=DEDALO_DATA_NOLAN) {

		$instance = new sections($ar_locators, $search_query_object, $caller_tipo, $modo, $lang);


        return $instance;
    }//end get_instance



	/**
	* CONSTRUCT
	* Extends parent abstract class common
	* La sección, a diferencia de los componentes, se comporta de un modo particular:
	* Si se le pasa sólo el tipo, se espera un listado (modo list)
	* Si se le pasa sólo el section_id, se espera una ficha (modo edit)
	*/
	private function __construct($ar_locators, $search_query_object, $caller_tipo, $modo, $lang) {

		// if (empty($search_query_object)) {			
		// 	// throw new Exception("Error: on construct sections : search_query_object is mandatory. ar_locators:$ar_locators, tipo:$caller_tipo, modo:$modo", 1);
		// 	$section_tipo = $caller_tipo;
		// 	$section = section::get_instance(null, $section_tipo, $modo);
		// 	$rq_context = $section->get_rq_context();
		// 	$search_query_object = array_find($rq_context, function($item){
		// 		return ($item->typo==='sqo');
		// 	});
		// }

		if(SHOW_DEBUG===true) {
			#$section_name = RecordObj_dd::get_termino_by_tipo($tipo,null,true);
			#global$TIMER;$TIMER[__METHOD__.'_' .$section_name.'_IN_'.$tipo.'_'.$modo.'_'.$ar_locators.'_'.microtime(1)]=microtime(1);
		}

		// Set general vars
			$this->ar_locators 			= $ar_locators;
			$this->search_query_object 	= $search_query_object;
			$this->caller_tipo 			= $caller_tipo;
			$this->modo 				= $modo;
			$this->lang 				= $lang;


		return true;
	}//end __construct



	/**
	* GET_DATO
	* @return array $ar_records
	*/
	public function get_dato() {

		$search_query_object = $this->search_query_object;

		$search 	= search::get_instance($search_query_object);
		$rows_data	= $search->search();

		$ar_records = $rows_data->ar_records;

		return $ar_records;
	}//end get_dato



	/**
	* GET_AR_SECTION_TIPO : alias of $this->get_tipo()
	*/
	public function get_ar_section_tipo() {

		$this->ar_section_tipo = $this->search_query_object->section_tipo;

		return $this->ar_section_tipo;
	}//end get_ar_section_tipo



}//end section
