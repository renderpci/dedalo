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

		# dd_request. Full dd_request
		public $dd_request;

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

		if(SHOW_DEBUG===true) {
			#$section_name = RecordObj_dd::get_termino_by_tipo($tipo,null,true);
			#global$TIMER;$TIMER[__METHOD__.'_' .$section_name.'_IN_'.$tipo.'_'.$modo.'_'.$ar_locators.'_'.microtime(1)]=microtime(1);
		}

		// Set general vars
			$this->ar_locators			= $ar_locators;
			$this->search_query_object	= $search_query_object;
			$this->caller_tipo			= $caller_tipo;
			$this->modo					= $modo;
			$this->lang					= $lang;


		return true;
	}//end __construct



	/**
	* GET_DATO
	* Get records from database using current sqo (search_query_object)
	* @return array $this->dato ($ar_records)
	*/
	public function get_dato() {

		// already calculated case
			if (isset($this->dato)) {
				return $this->dato;
			}

		// sqo. Use sqo.mode to define the search class manager to run your search
			$search_query_object = $this->search_query_object;

		// search
			$search		= search::get_instance($search_query_object);
			$rows_data	= $search->search();

		// fix result ar_records as dato
			$this->dato = $rows_data->ar_records;

		return $this->dato;
	}//end get_dato



	/**
	* GET_AR_SECTION_TIPO : alias of $this->get_tipo()
	* @return array $this->ar_section_tipo
	*/
	public function get_ar_section_tipo() {

		// already calculated case
			if (isset($this->ar_section_tipo)) {
				return $this->ar_section_tipo;
			}

		// if the sqo has related mode, get the section_tipo from data, 
		// It's not possible know the sections because data is a list of references to the source.
		// In some cases that sqo has specific sections because the search will be filtered only for those sections. 
		// in these case we get the section_tipo from the SQL self definition
		if(isset($this->search_query_object->mode) && $this->search_query_object->mode==='related'){
			
			// ar_section_tipo. If is defined, we done. Else, case 'all' get data to resolve used sections
				$this->ar_section_tipo = (reset($this->search_query_object->section_tipo)!=='all')
					? $this->search_query_object->section_tipo
					: false;

			// calculated
				if($this->ar_section_tipo===false){
					
					// force load dato
					$dato = $this->get_dato();

					$ar_section_tipo = [];
					foreach ($dato as $record) {
						
						$current_section_tipo = $record->section_tipo;
						if (!in_array($current_section_tipo, $ar_section_tipo)) {
							$ar_section_tipo[] = $current_section_tipo;
						}
					}
					$this->ar_section_tipo = $ar_section_tipo;
				}
	
		}else{
			$this->ar_section_tipo = $this->search_query_object->section_tipo;
		}
		

		return $this->ar_section_tipo;
	}//end get_ar_section_tipo



	/**
	* GET_AR_ALL_SECTION_ID
	* @return array $ar_all_section_id
	*/
	public function get_ar_all_section_id() {
		
		$ar_all_section_id = isset($this->search_query_object)
			? (function($sqo){
				// sqo config
					$sqo->limit			= 0;
					$sqo->offset		= 0;
					$sqo->full_count	= false;
					$sqo->select		= [];
					$sqo->parsed		= true;
				// search
				$search		= search::get_instance($sqo);
				$rows_data	= $search->search();

				return array_map(function($row){
					return (int)$row->section_id;
				}, $rows_data->ar_records);
			
			})($this->search_query_object)
			: [];

		return $ar_all_section_id;
	}//end get_ar_all_section_id



}//end section
