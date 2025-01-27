<?php declare(strict_types=1);
/**
* CLASS COMPONENT_RELATION_INDEX
*
*/
class component_relation_index extends component_relation_common {


	/**
	* @var
	*/
	// relation_type defaults
	protected $default_relation_type		= DEDALO_RELATION_TYPE_INDEX_TIPO; // dd96
	protected $default_relation_type_rel	= null;
	// test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties			= ['section_tipo','section_id','type','from_component_tipo','component_tipo','tag_id'];

	// default_target_section, when is not set in properties it will set as all related sections than call.
	protected $default_target_section		= ['all'];
	public $target_section;


	/**
	* GET_DATO
	* Resolve indexation references data
	* Note that this component data is always EXTERNAL
	* because is used to display remote references of relation type (DEDALO_RELATION_TYPE_INDEX_TIPO)
	* to current section
	* But, values are saved too to allow easy search
	* @return array|null $dato
	*/
	public function get_dato() : ?array {

		// dato_resolved. Already resolved case
			if(isset($this->dato_resolved)) {
				return $this->dato_resolved;
			}

		// reference_locator
			$filter_locator = $this->get_filter_locator();

		// referenced locators. Get calculated inverse locators for all matrix tables
			// $ar_inverse_locators = search_related::get_referenced_locators($reference_locator);
			$ar_inverse_locators = component_relation_index::get_referended_locators_with_cache(
				$filter_locator,
				$this->relation_type . '_' . $this->section_tipo . '_' . $this->section_id // cache_key
			);

		// format result like own dato
			$new_data = component_relation_index::parse_data($ar_inverse_locators);

		// fix resolved dato
			parent::set_dato($new_data);


		return $this->dato;
	}//end get_dato



	/**
	* GET_DATO_PAGINATED
	* Resolve indexation references data
	* Note that this component data is always EXTERNAL
	* because is used to display remote references of relation type (DEDALO_RELATION_TYPE_INDEX_TIPO)
	* to current section
	* But, values are saved too to allow easy search
	* @param int|null $custom_limit = null
	* @return array|null $dato
	*/
	public function get_dato_paginated( ?int $custom_limit=null ) : array {

		// pagination
			$limit			= $custom_limit ?? $this->pagination->limit;
			$offset			= $this->pagination->offset;

			$target_section	= $this->get_target_section();

		// filter_locator
			$filter_locator = $this->get_filter_locator();

		// ar_inverse_locators locators. Get calculated inverse locators for all matrix tables
		// referenced_locators from search_related
			$ar_inverse_locators = search_related::get_referenced_locators(
				[$filter_locator],
				$limit,
				$offset,
				false,
				$target_section
			);

		// format result like own dato
			$new_dato_paginated = component_relation_index::parse_data($ar_inverse_locators);

		return $new_dato_paginated;
	}//end get_dato_paginated



	/**
	* PARSE_DATA
	* @param array $ar_inverse_locators
	* @return array $parse_data
	*/
	public static function parse_data( array $ar_inverse_locators ) : array {

		// format result like own dato
			$parse_data = [];
			foreach ($ar_inverse_locators as $current_locator) {

				$locator = new locator();
					$locator->set_type($current_locator->type);
					$locator->set_section_tipo($current_locator->from_section_tipo);
					$locator->set_section_id($current_locator->from_section_id);
					if(isset($current_locator->tag_component_tipo)){
						$locator->set_component_tipo($current_locator->tag_component_tipo);
					}
					if(isset($current_locator->tag_id)){
						$locator->set_tag_id($current_locator->tag_id);
					}
					if(isset($current_locator->section_top_id)){
						$locator->set_section_top_id($current_locator->section_top_id);
					}
					if(isset($current_locator->section_top_tipo)){
						$locator->set_section_top_tipo($current_locator->section_top_tipo);
					}
					if(isset($current_locator->from_component_tipo)){
						$locator->set_from_component_top_tipo($current_locator->from_component_tipo);
					}

					$parse_data[] = $locator;
			}

		return $parse_data;
	}//end parse_data



	/**
	* COUNT_DATA
	* Full count of data.
	* Get the total sections that are calling the component (usually a thesaurus term)
	* @return int $total
	*/
	public function count_data() : int {

		if(isset($this->pagination->total)){
			return $this->pagination->total;
		}

		// filter_locator
			$filter_locator = $this->get_filter_locator();

		// target section
			$target_section	= $this->get_target_section();

		// create a sqo to count all the references
			$sqo_count = new search_query_object();
				$sqo_count->set_section_tipo( $target_section );
				$sqo_count->set_mode('related');
				$sqo_count->set_filter_by_locators([$filter_locator]);

		// search to get
			$search		= search::get_instance($sqo_count);
			$count_data	= $search->count();


		// fix total
			$total	= $count_data->total;

			$this->pagination->total = $total;

		return $total;
	}//end count_data



	/**
	* COUNT_DATA_GROUP_BY
	* Full count of records, but breakdown by a criteria
	* Use the group_by variable to count by any criteria the records
	* the result include the total as sum of all.
	* @param array $group_by
	*  as ['section_tipo']
	* @param array|null $filter_locators = null
	* @return object $count_data_group_by
	*/
	public function count_data_group_by( array $group_by, ?array $filter_locators=null ) : object {

		// reference_locator
			$filter_by_locators = !empty($filter_locators)
				? $filter_locators
				: [$this->get_filter_locator()];

		// target section
			$target_section	= $this->get_target_section();


		// create a sqo to count all the references
			$sqo_count = new search_query_object();
				$sqo_count->set_section_tipo($target_section);
				$sqo_count->set_mode('related');
				$sqo_count->set_filter_by_locators($filter_by_locators);
				$sqo_count->set_group_by($group_by);

		// search to get
			$search					= search::get_instance($sqo_count);
			$count_data_group_by	= $search->count();

		return $count_data_group_by;
	}//end count_data_group_by



	/**
	* GET_DATO_FULL
	* Returns dato. Alias of get_dato
	* @return array $dato
	*	$dato is always an array of locators or an empty array
	*/
	public function get_dato_full() : ?array {

		return $this->get_dato();
	}//end get_dato_full



	/**
	* GET_RELATED_SECTION_CONTEXT
	* Get all calling sections and create his context and sub-context.
	* As the relation_index use the calling sections to get his data,
	* it's necessary to get all context of every the calling section.
	* Relation_index has not a request_config definition in ontology,
	* (is not possible create all combinations for every calling sections)
	* his creation depends of the calling sections.
	* When the original section is calling by a lot of other sections
	* the context is not possible get it for the data.
	* This function will ask for get all calling sections and all section_tipo
	* and get 1 section_id to create a valid locator.
	* The locator is necessary to calculate the sub-context of every calling section.
	* The calculated context and sub-context will be mixed into the source section.
	* @return array $context
	*/
	public function get_related_section_context() : array {

		// context to be return
			$context = [];

		// get all calling sections
		// use the count grouped by section_tipo to get unique rows for every calling section
			$ar_section		= $this->count_data_group_by(['section_tipo']);
			$totals_group	= $ar_section->totals_group;
			if( empty($totals_group) ){
				return $context;
			}

		// get the ar_section_tipo of the counter
		// the total_goup set the key as array of the $group_by set
		// in this case the key will be an array with the section_tipo as : ['tch1']
			$ar_section_tipo = array_map(function( $item ){
				return $item->key; // array
			}, $totals_group );

		// create a SQO limited to 1 record
		// the query will get one valid record to create a section instance
		// {"section_tipo" : "tch1", "section_id" : 1}
		$sqo = new search_query_object();
			$sqo->set_limit( 1 );

		foreach ($ar_section_tipo as $current_section_tipo) {

			// set/update section tipo
			$sqo->set_section_tipo( $current_section_tipo );
			// search to get any row of the database
			// it will be use to create an instance section
			$search_instace = search::get_instance(
				$sqo, // object sqo
			);

			$search_response = $search_instace->search();
			// as the SQO is limited to 1, the result will be only 1
			$row = reset( $search_response->ar_records );

			// create a valid locator to build the section instance
			// this instance can calculate his context and his sub-context
			$locator = new locator();
				$locator->set_section_tipo($row->section_tipo);
				$locator->set_section_id($row->section_id);

			$datum = $this->get_section_datum_from_locator($locator);

			// context become calculated and merged with previous
			$context = array_merge($context, $datum->context);
		}

		return $context;
	}//end get_related_section_context



	/**
	* GET_SECTION_DATUM_FROM_LOCATOR
	* @param locator $locator
	* @return object $datum
	*/
	public function get_section_datum_from_locator( locator $locator ) : object {

		// cache
			$solved_section_datum_tipo = [];

		// self context. Calculate if not already resolved
			if(!isset($this->context)) {
				$permissions	= $this->get_component_permissions();
				$this->context	= $this->get_structure_context(
					$permissions,
					true // add_request_config
				);
			}
			// final_request_config. Find request_config with api_engine dedalo
			// this will be changed (ddo_map and section_tipo) on every subcontext resolution in the ar_subcontext loop
			// this var is not used here, its used only to modify/update the component context->request_config
			$final_request_config = array_find($this->context->request_config ?? [], function($el){
				return $el->api_engine==='dedalo';
			});

		// short vars
			$current_section_tipo	= $locator->section_tipo;
			$current_section_id		= $locator->section_id;

		// section
			$section = section::get_instance(
				$current_section_id,
				$current_section_tipo,
				'related_list'
			);

		$section_datum	= $section->get_json();
		$ar_subcontext	= $section_datum->context;

		// the the different request_config to be used as configured request_config of the component
		$context = [];
		foreach ($ar_subcontext as $current_context) {

			if ($current_context->model==='section'
				&& $current_context->tipo===$current_section_tipo
				&& !in_array($current_section_tipo, $solved_section_datum_tipo)) {

				// get the section request config (we will use his request config)
				// if the locator has more than 1 section_tipo, will be stored the new request inside the request_config array
				// select api_engine dedalo only config
				$section_request_config = array_find($current_context->request_config ?? [], function($el){
					return $el->api_engine==='dedalo';
				});

				// invalid or empty request_config case
					if (!is_object($section_request_config)) {
						debug_log(__METHOD__
							. " Error. Invalid request_config " . PHP_EOL
							. " No valid api_engine dedalo request config found ! Ignored current_context " . PHP_EOL
							. ' current_context: ' . to_string($current_context)
							, logger::ERROR
						);
						continue;
					}

				// update the component request_config ddo_map and section_tipo with the current subcontext
				// because ddo_map if fulfilled with calculated subcontext ddo
				// add once the section_tipo
					if (is_object($final_request_config)) {
						foreach ((array)$section_request_config->sqo->section_tipo as $current_sr_section_tipo) {

							if (!in_array($current_sr_section_tipo, $final_request_config->sqo->section_tipo)) {

								// add section tipo
								$final_request_config->sqo->section_tipo[] = $current_sr_section_tipo;

								// add ddo_map
								$final_request_config->show->ddo_map = array_merge(
									$final_request_config->show->ddo_map,
									$section_request_config->show->ddo_map
								);
							}
						}
					}

				// track as solved to prevent duplicates section_tipo in subcontext
					$solved_section_datum_tipo[] = $current_section_tipo;
			}

			// set parent to engage this tipo to be used by JS instance to get his context and data
			$current_context->parent = $this->tipo;

			// add resolved subcontext to component context
			$context[] = $current_context;
		}//end foreach ($ar_subcontext as $current_context)

		// datum object
			$datum = new stdClass();
				$datum->context	= $context;
				$datum->data	= $section_datum->data;


		return $datum;
	}//end get_section_datum_from_locator



	/**
	* GET_VALOR
	* Get value . default is get dato . overwrite in every different specific component
	* @param string $lang = DEDALO_DATA_LANG
	* @return string|null $valor
	*/
	public function get_valor( ?string $lang=DEDALO_DATA_LANG ) : ?string {

		$dato = $this->get_dato();

		// empty dato case
			if (empty($dato)) {
				return null;
			}

		// resolve locators
			$ar_valor = array();
			foreach ((array)$dato as $current_locator) {
				// get_locator_value returns array|null
				$ar_valor[] = self::get_locator_value(
					$current_locator, // object locator
					$lang, // string lang
					false // bool show_parents
				);
			}//end foreach ((array)$dato as $current_locator)

		// component valor
			$ar_valor_clean = [];
			foreach ($ar_valor as $value) {
				if (empty($value)) {
					continue;
				}
				$ar_valor_clean[] = to_string($value);
			}
			$valor = implode(', ', $ar_valor_clean);


		return $valor;
	}//end get_valor



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a MySQL field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @see class.diffusion_mysql.php
	*
	* @param string|null $lang = null
	* @param object|null $option_obj = null
	* @return string|null $diffusion_value
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		$dato = $this->get_dato();

		// v5 compatibly workaround
			// Note that this component in v5, stores data from related tag as
			// [{
			// 	"type": "dd96",
			// 	"tag_id": "1",
			// 	"section_id": "501",
			// 	"section_tipo": "rsc167",
			// 	"component_tipo": "rsc36",
			// 	"section_top_id": "501",
			// 	"section_top_tipo": "oh1",
			// 	"from_component_tipo": "rsc1051"
			// }]

		// empty dato case
			if (empty($dato)) {
				return null;
			}

		// preserve v5 order (old webs compatibility
		// [{"type":"dd96","tag_id":"29","section_id":"30","section_tipo":"rsc167","component_tipo":"rsc36","section_top_id":"26","section_top_tipo":"oh1","from_component_tipo":"hierarchy40"}]
		$diffusion_dato = [];
		foreach ($dato as $current_locator) {

			$locator = new locator();

			// type
			$locator->set_type($current_locator->type ?? $this->relation_type );

			// tag_id
			if (isset($current_locator->tag_id)) {
				$locator->set_tag_id($current_locator->tag_id);
			}

			// section_id
			$locator->set_section_id($current_locator->section_id);

			// section_tipo
			$locator->set_section_tipo($current_locator->section_tipo);

			// component_tipo
			if (isset($current_locator->component_tipo)) {
				$locator->set_component_tipo($current_locator->component_tipo);
			}

			// section_top_id
			if (isset($current_locator->section_top_id)) {
				$locator->set_section_top_id($current_locator->section_top_id);
			}

			// section_top_tipo
			if (isset($current_locator->section_top_tipo)) {
				$locator->set_section_top_tipo($current_locator->section_top_tipo);
			}

			// from_component_tipo
			$locator->set_from_component_tipo($current_locator->from_component_tipo);

			// from_component_top_tipo
			if (isset($current_locator->from_component_top_tipo)) {
				$locator->set_from_component_top_tipo($current_locator->from_component_top_tipo);
			}

			$diffusion_dato[] = $locator;
		}

		// diffusion_value
		$diffusion_value = !empty($diffusion_dato)
			? json_encode($diffusion_dato)
			: null;


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* REMOVE_LOCATOR
	* Iterate current component 'dato' and if math requested locator, removes it the locator from the 'dato' array
	* NOTE: This method updates component 'dato' and save
	* @param object $locator
	* @return bool
	*/
	public function remove_locator( object $locator ) : bool {

		$locator = clone($locator);

		// type. Verify exists locator type
			if (!property_exists($locator,'type')) {
				$locator->type = $this->relation_type;
			}

		// from_component_tipo. Verify exists locator from_component_tipo
			if (!property_exists($locator,'from_component_tipo')) {
				$locator->from_component_tipo = $this->tipo;
			}

		// Properties to compare for match locator to remove
			$ar_properties = [
				'type',
				'section_tipo',
				'section_id',
				'component_tipo',
				'tag_id',
				'from_component_tipo'
			];

		// Add current locator to component dato
			if (!$this->remove_locator_from_dato($locator, $ar_properties)) {
				return false;
			}

		return true;
	}//end remove_locator



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @todo This method do not works if no references are found !
	*
	* @param object $query_object
	* @return object $query_object
	*/
	public static function resolve_query_object_sql( object $query_object ) : object {

		$with_references = false;

		// q_operator check
			$q_operator = $query_object->q_operator ?? null;
			if (	$q_operator==='*' // It contains information
				|| 	$q_operator==='!*' // Empty
				) {

				// section_tipo from path
				$section_tipo = end($query_object->path)->section_tipo;

				// references to current section tipo and type
				$references = component_relation_index::get_references_to_section(
					$section_tipo
				);
				if (!empty($references)) {

					// format. Always set format to column (but in sequence case)
					$query_object->format = 'column';
					// component path  array
					$query_object->component_path = ['section_id'];
					// operator
					$query_object->operator	= $q_operator==='!*'
						? 'NOT IN'
						: 'IN';
					// in column sentence
					$q_clean = array_map(function($el){
						return (int)$el;
					}, $references);
					$query_object->q_parsed	= implode(',', $q_clean);
					$query_object->format	= 'in_column';

					$with_references = true;
				}
			}

		// no references case
			if ($with_references===false) {
				// @todo This method do not works if no references are found !
				// Working here !
			}


		return $query_object;
	}//end resolve_query_object_sql



	/**
	* GET_REFERENCES_TO_SECTION
	* Get all references to current section tipo and relation type (indexation)
	* This is used as intermediate search to get indexations from another
	* sections to current section
	* @param string $section_tipo
	* @param string relation_type = null
	* @return array $references
	*/
	public static function get_references_to_section( string $section_tipo, ?string $relation_type=null ) : array {
		$start_time=start_time();

		$references = [];

		$type = $relation_type ?? DEDALO_RELATION_TYPE_INDEX_TIPO;

		// locator
			$locator = new stdClass();
				$locator->type			= $type;
				$locator->section_tipo	= $section_tipo;

		// referenced_locators
			// $referenced_locators = search_related::get_referenced_locators($locator);
			$referenced_locators = component_relation_index::get_referended_locators_with_cache(
				$locator,
				$type . '_' . $section_tipo // cache_key
			);

		// references. Add section_id once
			foreach ($referenced_locators as $locator) {
				if (!in_array($locator->section_id, $references)) {
					$references[] = $locator->section_id;
				}
			}

		// debug
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__
					. " total_time " . PHP_EOL
					. exec_time_unit($start_time,'ms').' ms'
					, logger::DEBUG
				);
			}


		return $references;
	}//end get_references_to_section



	/**
	* GET_REFERENDED_LOCATORS_WITH_CACHE
	* Get inverse locators using cache
	* Note that, in publication process, many languages are resolved for every record and the result
	* for all of them is the same. Use this cache-able function to prevent calculate inverse locators
	* for every language
	* @param object $locator
	* @param string $cache_key
	* @return array $referenced_locators
	*/
	public static function get_referended_locators_with_cache( object $locator, string $cache_key ) : array {

		// cache
			static $referended_locators_cache;
			if (isset($referended_locators_cache[$cache_key])) {
				return $referended_locators_cache[$cache_key];
			}

		// referenced_locators from search_related
			$referenced_locators = search_related::get_referenced_locators([$locator]);

		// cache
			$referended_locators_cache[$cache_key] = $referenced_locators;


		return $referenced_locators;
	}//end get_referended_locators_with_cache



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'*'		=> 'no_empty',
			'!*'	=> 'empty'
		];

		return $ar_operators;
	}//end search_operators_info


	/**
	* GET_TARGET_SECTION
	* Return the target section in different situations.
	* target section could be defined in the request_config -> sqo -> section_tipo
	* dd_grid could inject the target section selected by users, in this case use $this->target_section
	* and target section could be not defined, in this case use the default_target_section defined in the class ['all']
	* @return array $target_section
	*/
	private function get_target_section() : array {

		// target section
			$target_section	= isset($this->target_section)
				? $this->target_section
				: (isset( $this->properties->source->request_config )
					? $this->get_ar_target_section_tipo()
					: $this->default_target_section);

		return $target_section;
	}//end get_target_section



	/**
	* GET_FILTER_LOCATOR
	* @return locator $filter_locator
	*/
	private function get_filter_locator() : locator {

		// filter_locator
			$filter_locator = new locator();
				$filter_locator->set_type( $this->relation_type ); // dd96
				$filter_locator->set_section_tipo($this->section_tipo);
				$filter_locator->set_section_id($this->section_id);

		return $filter_locator;
	}//end get_filter_locator



}//end class component_relation_index
