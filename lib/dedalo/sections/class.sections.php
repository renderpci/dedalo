<?php
/*
* CLASS SECTIONS
*/
class sections extends common {

	/**
	* CLASS VARS
	*/ 
		# Overwrite __construct var lang passed in this component
		protected $lang = DEDALO_DATA_NOLAN;

		# FIELDS
		protected $ar_locators;
		protected $ar_section_tipo;
		protected $dato;

		# STATE
		protected $modo;

		public $search_query_object;
	


	/**
	* GET_INSTANCE
    * Singleton pattern
    * @returns array array of section objects by key
    */
    public static function get_instance($ar_locators=[], $search_query_object, $caller_tipo=null, $modo='edit', $lang=null) {

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

		if ($search_query_object===false) {
			throw new Exception("Error: on construct sections : search_query_object is mandatory. ar_locators:$ar_locators, tipo:$caller_tipo, modo:$modo", 1);
		}	

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
		
		$search = new search($this->search_query_object);
		$rows_data 			 = $search->search();

		$ar_records = $rows_data->ar_records;

		return $ar_records;
	}//end get_dato



	/**
	* GET_AR_SECTION_TIPO : alias of $this->get_tipo()
	*/
	public function get_ar_section_tipo() {

		$this->get_ar_section_tipo = $this->search_query_object->section_tipo;
		
		return $this->get_ar_section_tipo;
	}//end get_ar_section_tipo
	


	/**
	* GET_SQO_CONTEXT
	* @return 
	*//*
	public function get_sqo_context() {

		$sqo_context = new stdClass();

		$show = [];

		$section_tipo 	= $this->tipo;
		$section_id 	= $this->section_id;
		$mode 			= $this->modo;
		$lang 			= $this->lang;


		// Records_html. Render search form html using search.
		// We know the current record id but we search like a list filtered by id for maintain always the same criterion 
			$self_locator = new locator();
				$self_locator->set_section_tipo($section_tipo);
				$self_locator->set_section_id($section_id);

			# SEARCH_QUERY_OBJECT . Add search_query_object to options
			$search_query_object_options = new stdClass();
				$search_query_object_options->limit  		= 1;
				$search_query_object_options->offset 		= 0;
				$search_query_object_options->filter_by_id 	= [$self_locator];
				$search_query_object_options->tipo 			= $section_tipo;
				$search_query_object_options->section_tipo 	= [$section_tipo];
			#$search_query_object = $this->build_search_query_object($search_query_object_options);
			$search_query_object = common::build_search_query_object($search_query_object_options);

			# Create new options object
			$show[] = $search_query_object;

		$sqo_context->show 		= $show;
		$sqo_context->search 	= [];

		return $sqo_context;		
	}//end get_sqo_context
	*/



}//end section
?>