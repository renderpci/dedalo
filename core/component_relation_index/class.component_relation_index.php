<?php declare(strict_types=1);
include_once 'trait.search_component_relation_index.php';
/**
* CLASS COMPONENT_RELATION_INDEX
* Manages indexation references and inverse relations in Dédalo.
*
* Core Concept and Purpose:
* - Inverse Relations: Identifies other sections/records that reference the current
*   record ("who points to me"). Used to display records linking TO the current section.
* - External Nature: Primarily calculated/dynamic. Resolves inverse locators rather than
*   relying solely on stored values.
* - Search Optimization: Values are saved to database to enable "Easy Search" without
*   recalculating the entire relationship graph.
* - Relation Type: Uses DEDALO_RELATION_TYPE_INDEX_TIPO (dd96) for reverse relations.
*
* Key Functionalities:
* - Data Retrieval (get_data): Finds "Inverse Locators" using search_related.
*   Asks "Find all records that relation-link to ME" with caching for performance.
* - Context Resolution (get_related_section_context): Displays data from OTHER calling
*   sections (e.g., list "Paintings" that cite this "Artist"). Groups by section_tipo,
*   initializes samples for request_config, and merges into unified "Related List".
* - Searching (resolve_query_object_sql):
*   * `*` (Not Empty): Finds records cited by others
*   * `!*` (Empty): Finds orphan records (not cited by anyone)
*
* Data Model:
* Array of locator objects representing incoming links:
* ```
* [{
*   "type": "dd96",
*   "section_tipo": "...",
*   "section_id": "...",
*   "component_tipo": "...",
*   "tag_id": "..."
* }]
* ```
*
* Extends component_relation_common and uses search_component_relation_index trait
* for inverse relation queries.
*
* @package Dédalo
* @subpackage Core
*/
class component_relation_index extends component_relation_common {



	// traits. Files added to current class file to split the large code.
	use search_component_relation_index;



	/**
	* CLASS VARS
	*/
		/**
		 * Static cache for referenced locators to avoid expensive lookups.
		 * Stores inverse locator results during repetitive processes like publication.
		 * @var array $referended_locators_cache
		 */
		public static array $referended_locators_cache = [];

		/**
		 * Default relation type for indexation (DEDALO_RELATION_TYPE_INDEX_TIPO - dd96).
		 * Defines the ontology tipo used for reverse relation identification.
		 * @var ?string $default_relation_type
		 */
		protected ?string $default_relation_type = DEDALO_RELATION_TYPE_INDEX_TIPO; // dd96

		/**
		 * Properties used to verify duplicate locators when adding relations.
		 * Array of property names that must match to consider two locators equal.
		 * @var array $test_equal_properties
		 */
		public array $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo','component_tipo','tag_id'];

		/**
		 * Default target section when not explicitly set in properties.
		 * Value ['all'] means all related sections that reference the current record.
		 * @var array $default_target_section
		 */
		protected array $default_target_section = ['all'];

		/**
		 * Target sections for filtering indexation references.
		 * Array of section tipos to limit which referencing sections are displayed.
		 * @var array $target_section
		 */
		public array $target_section = [];



	/**
	* GET_DATA
	* Resolve indexation references data
	* Note that this component data is always EXTERNAL (it doesn't manage data in database, it always resolve calling data, inverse locators or who is calling me)
	* because is used to display remote references of relation type (DEDALO_RELATION_TYPE_INDEX_TIPO)
	* to current section
	* But, values are saved too to allow easy search
	* @return array|null $data
	*/
	public function get_data() : ?array {

		// data_resolved. Already resolved case
			if(isset($this->data_resolved)) {
				return $this->data_resolved;
			}

		// reference_locator
			$filter_locator = $this->get_filter_locator();

		// referenced locators. Get calculated inverse locators for all matrix tables
			// $ar_inverse_locators = search_related::get_referenced_locators($reference_locator);
			$ar_inverse_locators = component_relation_index::get_referenced_locators_with_cache(
				$filter_locator,
				$this->relation_type . '_' . $this->section_tipo . '_' . $this->section_id // cache_key
			);

		if(empty($ar_inverse_locators)) {
			return null;
		}

		// format result like own data
			$new_data = component_relation_index::parse_data($ar_inverse_locators);

		return $new_data;
	}//end get_data



	/**
	* GET_DATA_PAGINATED
	* Resolve indexation references data
	* Note that this component data is always EXTERNAL
	* because is used to display remote references of relation type (DEDALO_RELATION_TYPE_INDEX_TIPO)
	* to current section
	* But, values are saved too to allow easy search
	* @param int|null $custom_limit = null
	* @return array|null $data
	*/
	public function get_data_paginated( ?int $custom_limit=null ) : array {

		// pagination
			$limit			= $custom_limit ?? $this->pagination->limit ?? null;
			$offset			= $this->pagination->offset ?? null;

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

		// format result like own data
			$new_data_paginated = component_relation_index::parse_data($ar_inverse_locators);

		return $new_data_paginated;
	}//end get_data_paginated



	/**
	* PARSE_DATA
	* @param array $ar_inverse_locators
	* @return array $parse_data
	*/
	public static function parse_data( array $ar_inverse_locators ) : array {

		// format result like own data
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
				$sqo_count->set_breakdown(false);
				$sqo_count->set_full_count(true);

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
				// $sqo_count->set_select([]);
				$sqo_count->set_section_tipo($target_section);
				$sqo_count->set_mode('related');
				$sqo_count->set_filter_by_locators($filter_by_locators);
				$sqo_count->set_group_by($group_by);
				$sqo_count->set_full_count(true);

		// search to get
			$search					= search::get_instance($sqo_count);
			$count_data_group_by	= $search->count();

		return $count_data_group_by;
	}//end count_data_group_by



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

			// check if section_tipo is available (or the tld is not installed/activated)
			// extract the first element if it's an array, otherwise use as-is
			$section_tipo_value = is_array($current_section_tipo) ? ($current_section_tipo[0] ?? null) : $current_section_tipo;
			if(empty($section_tipo_value)){
				continue;
			}
			$current_matrix_table = common::get_matrix_table_from_tipo($section_tipo_value);
			if(empty($current_matrix_table)){
				continue;
			}

			// set/update section tipo
			$sqo->set_section_tipo( $current_section_tipo );
			// search to get any row of the database
			// it will be use to create an instance section
			$search_instace = search::get_instance(
				$sqo, // object sqo
			);

			$db_result = $search_instace->search();
			// as the SQO is limited to 1, the result will be only 1
			$row = $db_result
				? ($db_result->fetch_one() ?? null)
				: null;

			if (empty($row)) {
				debug_log(__METHOD__ . ' - No row found for section_tipo: ' . to_string($current_section_tipo));
				continue;
			}

			// create a valid locator to build the section instance
			// this instance can calculate his context and his sub-context
			$locator = new locator();
				$locator->set_section_tipo($row->section_tipo);
				$locator->set_section_id($row->section_id);

			$datum = $this->get_section_datum_from_locator($locator);

			// context become calculated and merged with previous
			if (isset($datum->context) && is_array($datum->context)) {
				$context = [...$context, ...$datum->context];
			}
		}

		return $context;
	}//end get_related_section_context



	/**
	* GET_SECTION_DATUM_FROM_LOCATOR
	* Retrieves the data and context of a related section identified by the provided locator.
	* It also dynamically updates the component's internal request configuration by merging
	* the target section's 'ddo_map' and 'section_tipo'. This ensures that any subsequent
	* data resolution processes have the adequate config to format the related section properly.
	*
	* If the target section cannot be found or instantiated, it gracefully returns an empty
	* datum object structure rather than throwing a fatal error.
	*
	* @param locator $locator The reference object containing the target `section_tipo` and `section_id`
	* @return stdClass $datum An object containing the solved `context` (array) and `data` (object/array) for the target section.
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
				return isset($el->api_engine) && $el->api_engine==='dedalo';
			});

		// short vars
			$current_section_tipo	= $locator->section_tipo ?? null;
			$current_section_id		= $locator->section_id ?? null;

		// section
			if (empty($current_section_tipo)) {
				debug_log(__METHOD__
					. " Error. current_section_tipo is empty. "
					. " Trace: " . to_string($locator)
					, logger::ERROR
				);
				// datum object
				$datum = new stdClass();
					$datum->context	= [];
					$datum->data	= [];
				return $datum;
			}
			$section = section::get_instance(
				$current_section_tipo,
				'related_list'
			);

		// section record, Add section record to section instance to get the subdatum with current locator
			$section_record	= section_record::get_instance($current_section_tipo, (int)$current_section_id);

			// section check
			if (!is_object($section)) {
				debug_log(__METHOD__
					. " Error. Unable to create section instance for tipo: '$current_section_tipo'. "
					. " Trace: " . to_string($locator)
					, logger::ERROR
				);
				// datum object
				$datum = new stdClass();
					$datum->context	= [];
					$datum->data	= [];
				return $datum;
			}

			$section->add_section_record($section_record);

		$section_datum	= $section->get_json();
		$ar_subcontext	= $section_datum->context ?? [];

		// the the different request_config to be used as configured request_config of the component
		$context = [];
		foreach ((array)$ar_subcontext as $current_context) {

			if (is_object($current_context)
				&& isset($current_context->model) && $current_context->model==='section'
				&& isset($current_context->tipo) && $current_context->tipo===$current_section_tipo
				&& !in_array($current_section_tipo, $solved_section_datum_tipo)) {

				// get the section request config (we will use his request config)
				// if the locator has more than 1 section_tipo, will be stored the new request inside the request_config array
				// select api_engine dedalo only config
				$section_request_config = array_find($current_context->request_config ?? [], function($el){
					return isset($el->api_engine) && $el->api_engine==='dedalo';
				});

				// invalid or empty request_config case
					if (!is_object($section_request_config)) {
						debug_log(__METHOD__
							. " Error. Invalid request_config " . PHP_EOL
							. " No valid api_engine dedalo request config found ! Ignored current_context configuration update " . PHP_EOL
							. ' current_context: ' . to_string($current_context)
							, logger::ERROR
						);
						// We don't 'continue' here anymore so we don't accidentally drop $current_context from the final $context array
					} else {
						// update the component request_config ddo_map and section_tipo with the current subcontext
						// because ddo_map if fulfilled with calculated subcontext ddo
						// add once the section_tipo
							if (is_object($final_request_config)) {
								$sr_section_tipos = $section_request_config->sqo->section_tipo ?? [];

								foreach ((array)$sr_section_tipos as $current_sr_section_tipo) {

									$final_sqo = $final_request_config->sqo ?? new stdClass();
									$final_section_tipos = $final_sqo->section_tipo ?? [];

									if (!in_array($current_sr_section_tipo, (array)$final_section_tipos)) {

										// add section tipo
										if (!isset($final_request_config->sqo)) {
											$final_request_config->sqo = new stdClass();
										}
										if (!isset($final_request_config->sqo->section_tipo)) {
											$final_request_config->sqo->section_tipo = (array)$final_section_tipos;
										}
										$final_request_config->sqo->section_tipo[] = $current_sr_section_tipo;

										// add ddo_map
										if (!isset($final_request_config->show)) {
											$final_request_config->show = new stdClass();
										}
										$final_request_config->show->ddo_map = [
											...($final_request_config->show->ddo_map ?? []),
											...($section_request_config->show->ddo_map ?? [])
										];
									}
								}
							}
					}

				// track as solved to prevent duplicates section_tipo in subcontext
					$solved_section_datum_tipo[] = $current_section_tipo;
			}

			// set parent to engage this tipo to be used by JS instance to get his context and data
			if(is_object($current_context)) {
				$current_context->parent = $this->tipo;
			}

			// add resolved subcontext to component context
			$context[] = $current_context;
		}//end foreach ($ar_subcontext as $current_context)

		// datum object
			$datum = new stdClass();
				$datum->context	= $context;
				$datum->data	= $section_datum->data ?? [];

		return $datum;
	}//end get_section_datum_from_locator



	/**
	* REMOVE_LOCATOR
	* Iterate current component 'data' and if math requested locator, removes it the locator from the 'data' array
	* NOTE: This method updates component 'data' and save
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

		// Add current locator to component data
			if (!$this->remove_locator_from_data($locator, $ar_properties)) {
				return false;
			}

		return true;
	}//end remove_locator



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
			$referenced_locators = component_relation_index::get_referenced_locators_with_cache(
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
	* GET_REFERENCED_LOCATORS_WITH_CACHE
	* Get inverse locators using cache
	* Note that, in publication process, many languages are resolved for every record and the result
	* for all of them is the same. Use this cache-able function to prevent calculate inverse locators
	* for every language
	* @param object $locator
	* @param string $cache_key
	* @return array $referenced_locators
	*/
	public static function get_referenced_locators_with_cache( object $locator, string $cache_key ) : array {

		// cache
			// Safe control: prevent big array memory and performance problems
			if (count(self::$referended_locators_cache) > 1000) {
				self::$referended_locators_cache = [];
			}

			if (isset(self::$referended_locators_cache[$cache_key])) {
				return self::$referended_locators_cache[$cache_key];
			}

		// referenced_locators from search_related
			$referenced_locators = search_related::get_referenced_locators([$locator]);

		// cache
			self::$referended_locators_cache[$cache_key] = $referenced_locators;


		return $referenced_locators;
	}//end get_referenced_locators_with_cache



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
			$target_section	= !empty($this->target_section)
				? $this->target_section
				: (isset( $this->properties->source->request_config )
					? $this->get_ar_target_section_tipo()
					: $this->default_target_section);

		// Ensure target_section is not empty to avoid search errors
			if (empty($target_section)) {
				$target_section = $this->default_target_section;
			}

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
