<?php declare(strict_types=1);
include_once 'trait.search_component_relation_index.php';
/**
* CLASS COMPONENT_RELATION_INDEX
* Manages indexation references and inverse relations in Dédalo.
*
* Core Concept and Purpose:
* -------------------------
* This component answers the question "who points to me?" — it identifies every
* other section/record in the system that holds a relation locator targeting the
* current record. Rather than storing its own data (like a normal editable
* component), it works by querying the relation graph at read time and caching
* the result for performance-critical paths such as bulk publication.
*
* The component serves two distinct but related roles:
*
* 1. DISPLAY — It fetches all inverse locators (incoming references) and, for
*    each one, instantiates the pointing section in "related_list" mode so that
*    the client receives a fully-resolved context + data tree. This allows a UI
*    card for an "Artist" record, for example, to list every "Painting" that cites
*    that artist via a relation component.
*
* 2. SEARCH INDEX — Although the data is computed dynamically, values are also
*    persisted to the database so that standard full-text / operator searches
*    ("has any reference" / "has no reference") can run as plain SQL IN/NOT IN
*    clauses rather than re-traversing the relation graph on every query.
*
* Key Functionalities:
* --------------------
* - get_data / get_data_paginated:
*     Calls search_related::get_referenced_locators() to discover every locator
*     in any matrix table that points at the current section record via
*     DEDALO_RELATION_TYPE_INDEX_TIPO (dd96). Results are page-aware and cached.
*
* - get_related_section_context:
*     Groups the incoming references by pointing section_tipo, fetches one
*     representative row per tipo, instantiates the section in "related_list"
*     mode, and merges the resulting context/sub-context into the component
*     output. This is triggered only on the first page load (offset === 0).
*
* - get_section_datum_from_locator:
*     Resolves context + data for a single related section identified by a
*     locator. Mutates $this->context->request_config (merging ddo_map and
*     section_tipo from the sub-section's dedalo api_engine config) so that
*     subsequent JSON builds reflect all dynamically discovered sections.
*
* - resolve_query_object_sql (via search_component_relation_index trait):
*     '*' (Not Empty) → section_id IN (list of section_ids that are referenced)
*     '!*' (Empty)    → section_id NOT IN (same list) — orphan/uncited records
*
* Data shape stored / returned:
* -----------------------------
* An array of locator objects representing incoming links. Each entry uses the
* dd96 relation type and identifies the *pointing* record (not the target):
* ```
* [
*   {
*     "type"                : "dd96",
*     "section_tipo"        : "rsc170",
*     "section_id"          : "1",
*     "from_component_top_tipo" : "rsc1054"
*   }, …
* ]
* ```
* Note: parse_data() remaps fields from the raw search_related row format
* (from_section_tipo / from_section_id / tag_component_tipo …) into standard
* locator properties before returning the array.
*
* Static cache ($referended_locators_cache):
* ------------------------------------------
* During publication, many languages are resolved for every record; the inverse
* locator set is identical across all languages. The class-static cache keyed by
* "{relation_type}_{section_tipo}_{section_id}" prevents redundant DB lookups.
* The cache is capped at 1 000 entries and fully flushed when the cap is reached
* (see get_referenced_locators_with_cache).
*
* Inheritance / composition:
* --------------------------
* Extends component_relation_common (locator lifecycle, grid/export value
* resolution, diffusion / import pipelines).
* Uses trait search_component_relation_index (resolve_query_object_sql and
* operator dispatcher methods).
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
		 * Keyed by "{relation_type}_{section_tipo}_{section_id}"; flushed when count > 1000.
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
		 * Used by the deduplication logic in the parent's locator-add pipeline.
		 * @var array $test_equal_properties
		 */
		public array $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo','component_tipo','tag_id'];

		/**
		 * Default target section when not explicitly set in properties.
		 * Value ['all'] means all related sections that reference the current record.
		 * Used as the fallback in get_target_section() when neither $this->target_section
		 * nor a request_config sqo->section_tipo is available.
		 * @var array $default_target_section
		 */
		protected array $default_target_section = ['all'];

		/**
		 * Target sections for filtering indexation references.
		 * Array of section tipos to limit which referencing sections are displayed.
		 * Can be injected at runtime (e.g., by dd_grid) to restrict results to a
		 * specific subset of sections that point to the current record.
		 * @var array $target_section
		 */
		public array $target_section = [];



	/**
	* GET_DATA
	* Resolve and return the full (non-paginated) set of inverse locators for this record.
	*
	* Unlike most components, component_relation_index does NOT manage its own data in the
	* database — its dato is always computed dynamically by searching the relation graph for
	* every record that holds a dd96 locator targeting the current section/section_id.
	*
	* Values are also persisted to the matrix table to enable operator-based searches
	* ('*' / '!*') without re-traversing the graph every time.
	*
	* The result is cached on $this->data_resolved so repeated calls within the same request
	* are free. The inverse locator lookup itself uses the class-static
	* $referended_locators_cache (see get_referenced_locators_with_cache).
	*
	* @return array|null $data  Array of locator objects representing incoming references,
	*                           or null when the current record has no incoming references.
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
	* Resolve a single page of inverse locators for this record.
	*
	* Unlike get_data(), which returns the full set via the static cache, this method
	* passes pagination parameters (limit / offset) and an optional target_section filter
	* directly to search_related::get_referenced_locators() so that only the requested
	* window of results is fetched from the database.
	*
	* Used by component_relation_index_json.php as the primary data source for the
	* client-side list — the first page also triggers get_related_section_context()
	* to build the per-section-tipo context that the client needs to render sub-records.
	*
	* @param int|null $custom_limit = null  Override pagination->limit when provided.
	* @return array $data  Array of locator objects for the current page (may be empty).
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
	* Convert raw search_related result rows into standard locator objects.
	*
	* search_related::get_referenced_locators() returns rows using the naming
	* convention of the relation matrix (from_section_tipo, from_section_id,
	* tag_component_tipo, etc.). This static method re-maps those fields onto the
	* standard locator API (set_section_tipo / set_section_id / set_component_tipo …)
	* so the rest of the component stack can treat the result as ordinary locators.
	*
	* Only properties that actually exist on the raw row are copied; missing optional
	* fields (tag_id, section_top_id, section_top_tipo, from_component_tipo) are
	* silently skipped to keep the resulting locator lean.
	*
	* @param array $ar_inverse_locators  Raw result rows from search_related.
	* @return array $parse_data          Array of locator instances ready for use as component data.
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
	* Return the total number of sections that hold a reference to the current record.
	*
	* Builds a relation-mode SQO that filters by the current record's filter locator and
	* asks the search engine for a full count (no data rows returned). The result is stored
	* in $this->pagination->total so that subsequent calls within the same request are free.
	*
	* Typically called from component_relation_index_json.php to populate the pagination
	* object that the client uses to determine how many pages of related records exist.
	*
	* @return int $total  Total number of referencing records across all section tipos.
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
	* Count referencing records broken down by a given criteria, plus an overall total.
	*
	* Builds a relation-mode SQO with a group_by clause so the search engine returns one
	* count row per unique value of the grouping key (e.g. section_tipo). The response
	* object exposes both individual group counts ($count_data_group_by->totals_group)
	* and an aggregate total.
	*
	* Primary consumer is get_related_section_context(), which passes ['section_tipo'] to
	* discover all pointing section tipos and retrieve one representative record per tipo
	* for context instantiation.
	*
	* @param array      $group_by         Fields to group by, e.g. ['section_tipo'].
	* @param array|null $filter_locators  Optional override for the filter locators. When null,
	*                                     the current record's own filter locator is used.
	* @return object $count_data_group_by  Result object with totals_group and overall total.
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
	* Build the context tree for every section tipo that holds a reference to this record.
	*
	* Because component_relation_index aggregates incoming links from many different section
	* tipos simultaneously, and because a request_config cannot be pre-defined in the
	* ontology for every possible combination of calling sections, this method resolves
	* context dynamically at runtime:
	*
	*   1. Calls count_data_group_by(['section_tipo']) to get one count row per unique
	*      pointing section tipo — this avoids fetching every locator row.
	*   2. For each discovered section tipo, validates that a matrix table exists (skips
	*      tipos from TLDs that are not installed/activated on the current instance).
	*   3. Runs a limit-1 search to obtain any valid section_id for that tipo.
	*   4. Delegates to get_section_datum_from_locator() which instantiates the section in
	*      "related_list" mode, extracts its context/sub-context, and mutates
	*      $this->context->request_config to accumulate the merged ddo_map.
	*   5. Merges each datum's context array into the growing $context return value.
	*
	* This method is invoked only on the first page load (offset === 0) from
	* component_relation_index_json.php, keeping subsequent paginated requests lightweight.
	*
	* @return array $context  Flat array of context objects (sections + their sub-contexts),
	*                         ready to be appended to the component's own context array.
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
	* Resolve context + data for a single related section and merge its request_config
	* into this component's own context.
	*
	* Responsibilities:
	* -----------------
	* a) Ensures $this->context exists (calculates it on first call).
	* b) Instantiates the section identified by $locator in "related_list" mode and
	*    adds a single section_record so that get_json() returns populated data.
	* c) For each subcontext item emitted by the section whose tipo matches
	*    $locator->section_tipo, extracts the "dedalo" api_engine request_config and
	*    merges its sqo->section_tipo list and show->ddo_map into the component's own
	*    $final_request_config. This accumulation ensures that subsequent data builds
	*    reference every section tipo that has been discovered dynamically, without
	*    duplicating section tipos.
	* d) Stamps each subcontext item with `parent = $this->tipo` so the client JS
	*    framework can locate sub-components within the component's context tree.
	*
	* Error handling:
	* ---------------
	* If section_tipo is empty, or if section::get_instance() fails, the method logs
	* the error and returns an empty datum object ({context: [], data: []}) instead of
	* throwing, keeping the rendering pipeline fault-tolerant.
	*
	* Side-effects:
	* -------------
	* (!) Mutates $this->context->request_config in place — adds section tipos and merges
	* ddo_map entries from discovered sub-sections. This is intentional; the component
	* has no static request_config of its own (it cannot enumerate all possible calling
	* section tipos at ontology design time).
	*
	* @param locator $locator  Locator identifying the target section and record.
	* @return object $datum    stdClass with:
	*                            ->context  array  — sub-context items from the section
	*                            ->data     mixed  — section data items (from get_json()->data)
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
	* Remove a matching locator from this component's stored data and persist the change.
	*
	* Clones the incoming locator to avoid mutating the caller's object, then fills in any
	* missing fields ('type' and 'from_component_tipo') that are required for an unambiguous
	* match before delegating to the parent's remove_locator_from_data().
	*
	* The match is performed across six properties:
	*   type, section_tipo, section_id, component_tipo, tag_id, from_component_tipo
	* All six must agree for a locator to be considered equal and removed.
	*
	* @param object $locator  Locator to remove. Must at minimum carry section_tipo and section_id.
	* @return bool            True when the locator was found and removed; false otherwise.
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
	* Return all section_ids that have been indexed (referenced) by other records for a
	* given section tipo and relation type.
	*
	* Used as an intermediate step by the search operator handlers in
	* search_component_relation_index (resolve_relation_index_not_empty_sql /
	* resolve_relation_index_empty_sql). Those handlers convert the returned id list into
	* an SQL IN / NOT IN clause.
	*
	* The lookup is wrapped in get_referenced_locators_with_cache() so that calls for the
	* same section_tipo during a single publication or search run are served from memory.
	*
	* @param string      $section_tipo   The target section tipo to look up (e.g. 'tch1').
	* @param string|null $relation_type  Override the relation type; defaults to
	*                                    DEDALO_RELATION_TYPE_INDEX_TIPO (dd96).
	* @return array $references          Flat array of section_id values (strings).
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
	* Retrieve inverse locators from cache or, on miss, from search_related.
	*
	* During multi-language publication each language pass resolves the same relation graph
	* for the same record, making the lookup redundant. This wrapper stores results in the
	* class-static $referended_locators_cache indexed by $cache_key and returns the cached
	* value on subsequent calls.
	*
	* Cache management:
	* -----------------
	* (!) The cache has no TTL. It is intentionally unbounded within a single PHP request /
	* worker life-cycle. To prevent runaway memory growth the entire cache is cleared when
	* the entry count exceeds 1 000. This is a coarse but predictable safety valve;
	* callers should not rely on any specific eviction order.
	*
	* @param object $locator    Filter locator identifying the target record (type + section_tipo
	*                           + optional section_id). Passed as a single-element array to
	*                           search_related::get_referenced_locators().
	* @param string $cache_key  Unique string key for this lookup, e.g.
	*                           "dd96_tch1_42" (relation_type_section_tipo_section_id).
	* @return array $referenced_locators  Array of raw locator result objects from search_related.
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
	* Resolve the effective list of section tipos to filter indexation references by.
	*
	* Resolution priority (first match wins):
	*   1. $this->target_section if non-empty — runtime injection by e.g. dd_grid
	*      (user selects a specific section tipo from the UI).
	*   2. $this->properties->source->request_config is set — extracts the section
	*      tipo list from the component's ontology-defined request_config via
	*      get_ar_target_section_tipo() (inherited from component_common).
	*   3. $this->default_target_section (['all']) — no restriction; query all
	*      sections that point to the current record.
	*
	* A final guard ensures an empty array is never returned (would crash the search
	* query builder), replacing an empty result with the default ['all'] value.
	*
	* @return array $target_section  Non-empty array of section tipo strings, or ['all'].
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
	* Build a minimal locator object that identifies the current record as a lookup target.
	*
	* The returned locator carries:
	*   - type         → $this->relation_type  (dd96 by default)
	*   - section_tipo → the section tipo this component belongs to
	*   - section_id   → the record id this component belongs to
	*
	* Used by get_data(), get_data_paginated(), and count_data() as the filter argument
	* passed to search_related::get_referenced_locators() to retrieve all incoming links.
	*
	* @return locator $filter_locator  Locator identifying the current record as the lookup target.
	*/
	private function get_filter_locator() : locator {

		// filter_locator
			$filter_locator = new locator();
				$filter_locator->set_type( $this->relation_type ); // dd96
				$filter_locator->set_section_tipo($this->section_tipo);
				$filter_locator->set_section_id($this->section_id);

		return $filter_locator;
	}//end get_filter_locator



	/**
	* RESOLVE_EXPORT_DDO_CHILDREN
	* Dynamically compute the ddo_map and direct-children list for export resolution
	* when the component has no pre-configured export ddo paths of its own.
	*
	* Background:
	* -----------
	* component_relation_index has no fixed request_config in the ontology because it
	* aggregates pointing sections that are only known at runtime. When the export
	* pipeline calls get_export_value() it needs a ddo_map and a set of direct children
	* to iterate over child components. The parent class resolve_export_ddo_children()
	* handles the normal (pre-configured) case; this override handles the dynamic case:
	*
	*   1. If $ddo_direct_children is already populated (caller supplied export ddo paths),
	*      delegate immediately to the parent — no dynamic resolution needed.
	*   2. Otherwise, call get_section_datum_from_locator() to obtain the pointing
	*      section's context and extract its "dedalo" api_engine request_config.
	*   3. Find the section's component_section_id child tipo so a ddo for the section_id
	*      column can be prepended (mirrors the legacy get_grid_value inline logic).
	*   4. Build resolved_ddo_map = [section_id_ddo, ...section_relation_list_ddo_map].
	*   5. Filter resolved_ddo_map to direct children (parent === $this->tipo) and return
	*      both arrays as a plain object for the export pipeline.
	*
	* @see component_relation_common::get_export_value
	* @param array  $ddo_map             The current ddo_map from the export call context.
	* @param array  $ddo_direct_children Direct-children ddos already resolved by the caller.
	* @param object $locator             The locator of the pointing record being exported.
	* @return object  stdClass with:
	*                   ->ddo_map            array — full resolved ddo_map
	*                   ->ddo_direct_children array — subset with parent === $this->tipo
	*/
	protected function resolve_export_ddo_children( array $ddo_map, array $ddo_direct_children, object $locator ) : object {

		// already resolved by the caller (export ddo paths exist): use them
			if (!empty($ddo_direct_children)) {
				return parent::resolve_export_ddo_children($ddo_map, $ddo_direct_children, $locator);
			}

		// get the locator pointed section context and his relation_list request config
			$datum		= $this->get_section_datum_from_locator($locator);
			$context	= $datum->context ?? [];

			$section_context = array_find($context, function($el) use ($locator){
				return $el->section_tipo === $locator->section_tipo;
			}) ?? (object)['request_config'=>[]];

			// get the correct rqo (use only the dedalo api_engine)
			$dd_request_config = array_find($section_context->request_config ?? [], function($el){
				return $el->api_engine==='dedalo';
			});

		// section_id_tipo of the pointed section
			$ar_section_id_tipo	= section::get_ar_children_tipo_by_model_name_in_section(
				$locator->section_tipo,
				['component_section_id'],
				true, // bool from cache
				true, // bool resolve_virtual
				true, // bool recursive
				true // search_exact
			);
			$section_id_tipo = reset($ar_section_id_tipo);

			$ddo_section_id = new dd_object();
				$ddo_section_id->set_tipo($section_id_tipo);
				$ddo_section_id->set_section_tipo($locator->section_tipo);
				$ddo_section_id->set_parent($this->tipo);

		// ddo_map. section_id ddo + the pointed section relation_list ddo_map
			$current_ddo_map = is_object($dd_request_config) && isset($dd_request_config->show)
				? ($dd_request_config->show->ddo_map ?? [])
				: [];
			$resolved_ddo_map = [$ddo_section_id, ...$current_ddo_map];

			$resolved_children = array_filter($resolved_ddo_map, function($el){
				return $el->parent === $this->tipo;
			});

		return (object)[
			'ddo_map'				=> $resolved_ddo_map,
			'ddo_direct_children'	=> $resolved_children
		];
	}//end resolve_export_ddo_children



}//end class component_relation_index
