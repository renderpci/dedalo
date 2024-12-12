<?php declare(strict_types=1);
/**
* CLASS SECTIONS
*
*
*/
class sections extends common {



	/**
	* CLASS VARS
	*/
		// FIELDS
		protected $ar_locators;
		protected $ar_section_tipo;
		// protected $dato;

		// dd_request. Full dd_request
		public $dd_request;

		// search_query_object
		public $search_query_object;

		// string (section/portal)
		public $caller_tipo;



	/**
	* GET_INSTANCE
	* Singleton pattern
	* @param array|null $ar_locators
	* @param object|null $search_query_object = null
	* @param string|null $caller_tipo = null
	* 	normally will be section or component_portal
	* @param string $mode = list
	* @param string $lang = DEDALO_DATA_NOLAN
	* @return object $instance
	* 	Instance of sections class
	*/
	public static function get_instance( ?array $ar_locators, ?object $search_query_object=null, ?string $caller_tipo=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN ) : object {

		$instance = new sections($ar_locators, $search_query_object, $caller_tipo, $mode, $lang);

		return $instance;
	}//end get_instance



	/**
	* CONSTRUCT
	* @param array|null $ar_locators
	* @param object $search_query_object
	* @param string $caller_tipo
	* @param string $mode
	* @param string $lang
	*
	* @return void
	*/
	private function __construct(?array $ar_locators, object $search_query_object, string $caller_tipo, string $mode, string $lang) {

		// Set general vars
		$this->ar_locators			= $ar_locators;
		$this->search_query_object	= $search_query_object;
		$this->caller_tipo			= $caller_tipo;
		$this->mode					= $mode;
		$this->lang					= $lang;
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
			// $search_query_object = clone($this->search_query_object);

		// limit check
			if (!isset($search_query_object->limit)) {

				if ($this->mode==='edit') {

					$search_query_object->limit = 1;

				}else{

					$caller_model = RecordObj_dd::get_modelo_name_by_tipo($this->caller_tipo,true);
					if ($caller_model==='section') {

						// section case
						$section = section::get_instance(
							null, // string|null section_id
							$this->caller_tipo // string section_tipo
						);
						// request_config (is array)
						$request_config = $section->build_request_config();

						$found = array_find($request_config, function($el){
							return isset($el->api_engine) && $el->api_engine==='dedalo';
						});
						if (is_object($found)) {
							if (isset($found->sqo) && isset($found->sqo->limit)) {
								$search_query_object->limit = $found->sqo->limit;
							}
						}
					}
				}
			}

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
	public function get_ar_section_tipo() : array {

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
	public function get_ar_all_section_id() : array {

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



}//end class sections
