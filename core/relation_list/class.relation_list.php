<?php declare(strict_types=1);
/**
* CLASS RELATION_LIST
* Resolves and presents the set of external sections that hold a relation pointing
* back to the current section/record (inverse-relation view).
*
* In Dédalo's relational model, components store forward pointers (locators) to
* other sections. relation_list inverts that graph: given a host section (identified
* by $tipo + $section_tipo + $section_id), it finds every external record whose
* stored relations include a locator that targets the host. The results are returned
* as a structured context/data pair suitable for the edit UI, JSON API, and
* diffusion pipelines.
*
* Responsibilities:
* - Build a search_query_object with 'mode=related' and filter_by_locators targeting
*   the host section, then delegate to sections::get_data() for the actual DB query.
* - Transform the flat list of inverse references into a grid-like object whose
*   @context describes the column definitions (section tipo, component tipo labels)
*   and whose @data holds the per-record resolved component values.
* - Provide multiple diffusion output strategies ('dato', 'valor', 'dato_full',
*   'filtered_values', 'custom') controlled by $diffusion_properties->data_to_be_used.
* - Skip any referenced record that fails the diffusion_utils::is_publishable() check
*   before including it in export output.
*
* Relationships:
* - Extends common (inherits __call accessor magic: get_diffusion_properties() /
*   set_diffusion_properties() work through the GetAccessor / SetAccessor bridge).
* - Consumed by relation_list_json.php (edit mode UI), diffusion pipelines
*   (get_diffusion_dato / get_diffusion_value / get_diffusion_data), and any caller
*   that needs to know who points at the current record.
* - Delegates grid-column resolution to section_map::get_scope('relation_list') when
*   available; falls back to ontology_node::get_relations() on the legacy
*   'relation_list' child node.
*
* @package Dédalo
* @subpackage Core
*/
class relation_list extends common {



	/**
	* CLASS VARS
	*/

		/**
		 * Search Query Object used to scope inverse-reference queries.
		 * Injected by the caller (e.g. relation_list_json.php) before get_json() is
		 * called. When null, get_data() / get_diffusion_dato() build their own SQO
		 * internally. The sqo is also read inside relation_list_json.php to pass
		 * directly to get_inverse_references() in edit mode.
		 * @var ?object $sqo
		 */
		public ?object $sqo = null;

		/**
		 * Flag or count used by relation_list_json.php to switch between returning
		 * a raw row-count and returning the full context/data object.
		 * When set to boolean true the JSON controller returns the raw
		 * get_inverse_references() result instead of passing it through
		 * get_relation_list_obj().
		 * @var ?int $count
		 */
		public ?int $count = null;

		/**
		 * Diffusion properties injected by the diffusion pipeline before calling
		 * get_diffusion_dato() or get_diffusion_value(). Shape mirrors the ontology
		 * element properties block:
		 * {
		 *   "data_to_be_used": "dato"|"valor"|"dato_full"|"filtered_values"|"custom",
		 *   "process_dato_arguments": {
		 *     "filter_section":   ["<section_tipo>", ...],
		 *     "filter_component": ["<component_tipo>", ...],
		 *     "format":           "section_id",
		 *     "target_component_tipo": "<tipo>",
		 *     "output":           "array"|"string",
		 *     "separator":        " | ",
		 *     "direct_value":     true|false,
		 *     "component_method": "get_diffusion_value"|...,
		 *     "custom_map":       [...],
		 *     "remove_duplicates": true
		 *   }
		 * }
		 * Accessed through the __call accessor bridge as get_diffusion_properties()
		 * / set_diffusion_properties().
		 * @var ?object $diffusion_properties
		 */
		public ?object $diffusion_properties = null;

		/**
		 * Request-scoped static cache keyed by tipo + section_tipo + section_id +
		 * encoded process_dato_arguments. Prevents re-running the inverse-reference
		 * query and locator filtering inside get_diffusion_dato() when the same
		 * relation_list is resolved more than once during a single diffusion pass
		 * (e.g. when multiple DDO map entries share the same host section).
		 * (!) Cleared via common::clear() between requests in persistent-worker mode.
		 * @var array $diffusion_dato_cache
		 */
		public static array $diffusion_dato_cache = [];

		/**
		 * Request-scoped static cache keyed by tipo + section_tipo + section_id +
		 * data_to_be_used + encoded diffusion_properties. Mirrors $diffusion_dato_cache
		 * but stores the fully formatted output of get_diffusion_value() (the value that
		 * ends up written to the target diffusion field) rather than the raw locators.
		 * (!) Cleared via common::clear() between requests in persistent-worker mode.
		 * @var array $diffusion_value_cache
		 */
		public static array $diffusion_value_cache = [];

		/**
		 * When set, restricts the 'section_tipo' axis of the SQO so that only
		 * records belonging to these section tipos are returned by the inverse-reference
		 * query. Populated by set_section_filter() or injected via ddo->section_filter
		 * inside get_diffusion_data().
		 * @var ?array $section_filter
		 */
		protected ?array $section_filter = null;

		/**
		 * When set, causes get_data() to emit one filter_by_locators entry per entry in
		 * this array, each carrying a 'from_component_tipo' constraint. This restricts
		 * which component tipos are considered as the originating pointer, letting callers
		 * scope inverse references to a single relationship type. Populated by
		 * set_component_filter() or injected via ddo->component_filter inside
		 * get_diffusion_data().
		 * @var ?array $component_filter
		 */
		protected ?array $component_filter = null;




	/**
	* SET_SECTION_FILTER
	* Restricts inverse-reference queries to the given set of section tipos.
	* Stored in $section_filter and consumed by get_data() when building the SQO
	* 'section_tipo' axis. Pass null to remove the restriction and allow all sections.
	* @param ?array $section_filter [= null] - Array of section tipo strings, or null to clear
	* @return static - Fluent interface: returns $this for chaining
	*/
	public function set_section_filter(?array $section_filter) : static {
		$this->section_filter = $section_filter;
		return $this;
	}



	/**
	* SET_COMPONENT_FILTER
	* Restricts inverse-reference queries to pointers that originated from the given
	* component tipos. When set, get_data() emits one filter_by_locators entry per
	* tipo, each carrying a 'from_component_tipo' key so the search layer can match
	* only relations stored by those specific components. Pass null to allow all
	* component tipos (default behaviour).
	* (!) Note: the property is named $component_filter even though the original
	* doc-block said "section filter" — the actual effect is on component tipos.
	* @param ?array $component_filter [= null] - Array of component tipo strings, or null to clear
	* @return static - Fluent interface: returns $this for chaining
	*/
	public function set_component_filter(?array $component_filter) : static {
		$this->component_filter = $component_filter;
		return $this;
	}



	/**
	* __CONSTRUCT
	* Initialises a relation_list for the specified host section record.
	* No DB access occurs here; queries are deferred to get_data() /
	* get_inverse_references() / get_json().
	* @param string $tipo        - Ontology tipo of this relation_list element
	* @param mixed  $section_id  - Numeric or string ID of the host record
	* @param string $section_tipo - Ontology tipo of the host section
	* @param string $mode        [= 'list'] - Rendering mode: 'list' | 'edit'
	*/
	public function __construct(string $tipo, $section_id, string $section_tipo, string $mode='list') {

		$this->tipo			= $tipo;
		$this->section_id	= $section_id;
		$this->section_tipo	= $section_tipo;
		$this->mode			= $mode;
	}//end __construct



	/**
	* GET_INVERSE_REFERENCES
	* Executes the given SQO against the sections layer and returns every external
	* record that holds a relation pointing to the host section. The returned rows
	* carry the full section dato (including 'relations' array) as fetched from the
	* JSONB matrix table.
	*
	* The SQO must have 'mode' = 'related' and 'filter_by_locators' set to at least
	* one locator targeting the host section. All filtering (section_tipo, component
	* filter, publishability) is applied by callers after this method returns.
	*
	* Row shape returned (via sections::get_data()->fetch_all()):
	* {
	*   "section_tipo": "<tipo>",
	*   "section_id":   "<id>",
	*   "datos": {
	*     "relations": [
	*       { "type": "<dd_tipo>", "section_id": "...", "section_tipo": "...",
	*         "from_component_tipo": "<tipo>" },
	*       ...
	*     ]
	*   }
	* }
	*
	* @see search_related (performs the actual SQL JSONB query over relations arrays)
	* @param object $sqo - Fully configured search_query_object
	* @return array       - Flat array of stdClass row objects; empty when no matches
	*/
	public function get_inverse_references(object $sqo) : array {

		// sections
		$sections = sections::get_instance(null, $sqo, $this->section_tipo, $this->mode);
		$db_result = $sections->get_data();

		$inverse_sections = $db_result->fetch_all();


		return $inverse_sections;
	}//end get_inverse_references



	/**
	* GET_RELATION_LIST_OBJ
	* Transforms a flat array of inverse-reference rows into a grid-like object
	* usable by the edit UI and by some diffusion output modes.
	*
	* The returned object has two keys:
	*   context — ordered list of column descriptor objects, each with
	*             { section_tipo, section_label, component_tipo, component_label }.
	*             The first column per section tipo is always a synthetic 'id'
	*             column; subsequent columns come from the resolved relation_list
	*             component definitions.
	*   data    — flat array of value cell objects, each with
	*             { section_tipo, section_id, component_tipo [, value] }.
	*             The first cell per record is a synthetic 'id' cell (no value key).
	*
	* Column resolution (per unique section_tipo, first occurrence only):
	*   1. section_map::get_scope($section_tipo, 'relation_list', strict=true) —
	*      preferred: reads explicit 'term' tipos from the section's scope config.
	*   2. Fallback: locates the first child component with model_name='relation_list'
	*      in the ontology tree and calls ontology_node::get_relations() on it.
	*      Tries without virtual resolution first; retries with resolve_virtual=true
	*      when the initial lookup returns empty.
	*
	* A WARNING is logged (not thrown) if a section_tipo has no relation_list
	* component definition — the section's rows will appear in $data with only the
	* 'id' cell and no value cells.
	*
	* @param array $ar_inverse_references - Rows from get_inverse_references()
	* @return object                       - stdClass { context: array, data: array }
	*/
	public function get_relation_list_obj(array $ar_inverse_references) : object {

		$json		= new stdClass;
		$ar_context	= [];
		$ar_data	= [];

		$sections_related		= [];
		$ar_relation_components	= [];
		# loop the locators that call to the section
		foreach ($ar_inverse_references as $current_record) {

			$current_section_tipo = $current_record->section_tipo;

			# 1 get the @context
			if (!in_array($current_section_tipo, $sections_related )){

				$sections_related[] =$current_section_tipo;

				//get the id
				$current_id = new stdClass;
					$current_id->section_tipo		= $current_section_tipo;
					$current_id->section_label		= ontology_node::get_term_by_tipo($current_section_tipo,DEDALO_APPLICATION_LANG, true);
					$current_id->component_tipo		= 'id';
					$current_id->component_label	= 'id';

					$ar_context[] = $current_id;

				//get the columns of the @context
				// Prefer the section_map 'relation_list' scope (strict, no chain): its
				// term tipos become the grid columns. Falls back to the legacy
				// relation_list ontology node 'relations' when the scope is absent.
				$rl_scope = section_map::get_scope($current_section_tipo, 'relation_list', true);
				if ($rl_scope!==null && !empty($rl_scope->term)) {

					$rl_term_tipos = is_array($rl_scope->term)
						? array_values($rl_scope->term)
						: [$rl_scope->term];
					// Normalize to the same shape as get_relations(): a list of
					// iterables yielding component tipos (here keyed 'term').
					$ar_relation_components[$current_section_tipo] = array_map(
						fn($t) => ['term' => $t],
						$rl_term_tipos
					);

				} else {

					$ar_model_name_required	= array('relation_list');
					$resolve_virtual		= false;

					// Locate relation_list element in current section (virtual or not)
					$ar_children = section::get_ar_children_tipo_by_model_name_in_section($current_section_tipo, $ar_model_name_required, $from_cache=true, $resolve_virtual, $recursive=false, $search_exact=true);

					// If not found children, try resolving real section
					if (empty($ar_children)) {
						$resolve_virtual = true;
						$ar_children = section::get_ar_children_tipo_by_model_name_in_section($current_section_tipo, $ar_model_name_required, $from_cache=true, $resolve_virtual, $recursive=false, $search_exact=true);
					}// end if (empty($ar_children))

					if( isset($ar_children[0]) ) {
						$current_children	= reset($ar_children);
						$ontology_node		= ontology_node::get_instance($current_children);
						$ar_relation_components[$current_section_tipo] = $ontology_node->get_relations();
					}
				}

				// Build @context columns from the resolved relation components (either source)
				if( !empty($ar_relation_components[$current_section_tipo]) ){
					foreach ($ar_relation_components[$current_section_tipo] as $current_relation_component) {
						foreach ($current_relation_component as $tipo) {

							$current_relation_list = new stdClass;
								$current_relation_list->section_tipo	= $current_section_tipo;
								$current_relation_list->section_label	= ontology_node::get_term_by_tipo($current_section_tipo,DEDALO_APPLICATION_LANG, true);
								$current_relation_list->component_tipo	= $tipo;
								$current_relation_list->component_label	= ontology_node::get_term_by_tipo($tipo, DEDALO_APPLICATION_LANG, true);

							$ar_context[] = $current_relation_list;
						}
					}
				}

			}// end if (!in_array($current_section_tipo, $sections_related )

			# 2 get ar_data
			$ar_components = $ar_relation_components[$current_section_tipo] ?? [];
			if (empty($ar_components)) {
				debug_log(__METHOD__
					." Section without relation_list. Please, define relation_list for section: $current_section_tipo "
					, logger::WARNING
				);
			}
			$ar_data_result = $this->get_ar_data($current_record, $ar_components);
			$ar_data = [...$ar_data, ...$ar_data_result];
		}// end foreach

		// $context = 'context';
		$json->context	= $ar_context;
		$json->data		= $ar_data;

		return $json;
	}//get_relation_list_obj



	/**
	* GET_AR_DATA
	* Resolves the component values for a single inverse-reference record and
	* returns the ordered array of cell objects that represents one data row in the
	* grid produced by get_relation_list_obj().
	*
	* The method:
	*   1. Obtains (or creates) a cached section instance for the record's section_tipo.
	*   2. Injects the raw 'datos' from the DB row directly into the section so that
	*      component_common::get_instance() can read component data without an extra
	*      DB round-trip.
	*   3. Prepends a synthetic 'id' cell (no 'value' key) matching the grid's first
	*      context column.
	*   4. Iterates $ar_components (same shape as ontology_node::get_relations() or the
	*      section_map-derived list) and for each component tipo instantiates the
	*      component, calls get_value(), and appends a value cell.
	*
	* Cell shapes:
	*   id cell:    { section_tipo, section_id, component_tipo: 'id' }
	*   value cell: { section_tipo, section_id, component_tipo, value }
	*
	* @param object $current_record - Row from get_inverse_references() with at least
	*                                 section_tipo, section_id, and optional datos
	* @param array  $ar_components  - Component descriptor list; each entry is an
	*                                 iterable whose values are component tipo strings
	* @return array                  - Ordered array of cell stdClass objects for one grid row
	*/
	public function get_ar_data(object $current_record, array $ar_components) : array {

		$data = [];

		$section_tipo	= $current_record->section_tipo;
		$section_id		= $current_record->section_id;

		// section instance
			$section = section::get_instance(
				$section_tipo,
				$this->mode,
				true // cache
			);
		// inject dato to section when the dato come from db and set as loaded
			$datos = $current_record->datos ?? null;
			if (!is_null($datos)) {
				$section->set_dato($datos);
			}

		$current_id = new stdClass;
			$current_id->section_tipo	= $section_tipo;
			$current_id->section_id		= $section_id;
			$current_id->component_tipo	= 'id';

		$data[] = $current_id;

		if(!empty($ar_components)){
			foreach ($ar_components as $current_relation_component) {
				foreach ($current_relation_component as $modelo => $tipo) {
					// $model_name		= ontology_node::get_model_by_tipo($modelo, true);
					$model_name			= ontology_node::get_model_by_tipo($tipo, true);
					$current_component	= component_common::get_instance(
						$model_name,
						$tipo,
						$section_id,
						'list',
						DEDALO_DATA_LANG,
						$section_tipo
					);
					// $value = $current_component->get_valor();
					$value = $current_component->get_value();

					$component_object = new stdClass;
						$component_object->section_tipo		= $section_tipo;
						$component_object->section_id 		= $section_id;
						$component_object->component_tipo	= $tipo;
						$component_object->value 			= $value;

					$data[] = $component_object;
				}
			}
		}

		return $data;
	}//end get_data



	/**
	* GET_JSON
	* Loads and executes the relation_list_json.php controller in the scope of this
	* instance and returns the resulting JSON-ready object.
	*
	* The controller reads $this->sqo, $this->count, $this->mode, and $this->section_tipo
	* to decide whether to return a full context/data grid (edit mode) or an empty
	* stub (other modes). Permissions are evaluated inside the controller.
	*
	* Returned object shape (edit mode, permissions > 0):
	* {
	*   "context": [ { section_tipo, section_label, component_tipo, component_label }, ... ],
	*   "data":    [ { section_tipo, section_id, component_tipo [, value] }, ... ]
	* }
	*
	* @param object|null $request_options [= null] - Reserved for future use; not currently
	*                                                consumed by the controller
	* @return object - stdClass with context and data arrays
	*/
	public function get_json( ?object $request_options=null ) : object {

		$path = DEDALO_CORE_PATH .'/'. get_called_class() .'/'. get_called_class() .'_json.php';

		// controller include
			$json = include( $path );

		return $json;
	}//end get_json



	/**
	* GET_DIFFUSION_DATO
	* Builds the raw diffusion dato for this relation_list: a list of locator objects
	* (or formatted values) representing every external record that points to the host
	* section, filtered to only publishable records.
	*
	* Steps:
	*   1. Reads $diffusion_properties->process_dato_arguments for filter_section,
	*      filter_component, and format options.
	*   2. Issues a 'mode=related' SQO targeting the host section_tipo/section_id.
	*   3. Expands each returned row's 'relations' array and selects only the locators
	*      that target the host (matching section_tipo + section_id). This re-inversion
	*      is necessary because the search returns full rows, not filtered locators.
	*   4. Applies filter_section and filter_component guards to drop unwanted sources.
	*   5. Skips any source record that fails diffusion_utils::is_publishable().
	*   6. Optionally transforms each surviving locator: when process_dato_arguments
	*      ->format = 'section_id', returns only the source section_id string rather
	*      than the full locator object.
	*   7. Caches the result in self::$diffusion_dato_cache for the lifetime of the
	*      request (or until common::clear() is called in persistent-worker mode).
	*
	* Typical consumers: get_diffusion_value('filtered_values'), diffusion pipelines
	* that need a raw list of pointing-section locators.
	*
	* @see numisdata1021 (relations_coins), dmmgobes28 (graves_data) — live examples
	* @return array - Array of locator objects (stdClass) or formatted scalar values;
	*                 empty array when no publishable inverse references exist
	*/
	public function get_diffusion_dato() : array {

		// Properties of diffusion element that references this component
		// (!) Note that is possible overwrite real component properties injecting properties from diffusion (see diffusion_sql::resolve_value)
		// 	  This is useful to change the 'data_to_be_used' param of target component (indirectly)
		// sample v5 properties:
		// {
		//   "data_to_be_used": "dato",
		//   "process_dato_arguments": {
		//     "filter_section": ["dmm480"]
		//   }
		// }
		$diffusion_properties	= $this->get_diffusion_properties();
		$process_dato_arguments	= isset($diffusion_properties->process_dato_arguments)
			? $diffusion_properties->process_dato_arguments
			: null;

		$process_dato_arguments_key = !empty($process_dato_arguments)
			? json_encode($process_dato_arguments)
			: '';

		$filter_section = isset($process_dato_arguments->filter_section)
			? (array)$process_dato_arguments->filter_section
			: null;

		$filter_component = isset($process_dato_arguments->filter_component)
			? (array)$process_dato_arguments->filter_component
			: null;

		// cache
			$cache_key = $this->tipo.'_'.$this->section_tipo.'_'.$this->section_id.'_'.$process_dato_arguments_key.'_'.to_string($filter_section).'_'.to_string($filter_component);
			if (isset(self::$diffusion_dato_cache[$cache_key])) {
				return self::$diffusion_dato_cache[$cache_key];
			}

		// sqo . Common used to get inverse locators
			$sqo = new search_query_object();
				$sqo->set_section_tipo(['all']);
				$sqo->set_mode('related');
				$sqo->set_limit(null);
				$sqo->set_offset(0);

				// Create filter locator
				$filter_locator = new locator();
					$filter_locator->set_section_tipo($this->section_tipo);
					$filter_locator->set_section_id($this->section_id);

				$sqo->set_filter_by_locators([$filter_locator]);

		// inverse_references
			$ar_inverse_references = $this->get_inverse_references($sqo);
				// sample. Full section dato
				// {
				//     "section_tipo": "numisdata300",
				//     "section_id": "1",
				//     "datos": {
				//         "label": "Catálogo",
				//         "relations": [
				//             {
				//                 "type": "dd675",
				//                 "section_id": "1",
				//                 "section_tipo": "dd153",
				//                 "from_component_tipo": "numisdata304"
				//             }, ...
				//          ]
				//     }
				// }

		// clean references as locators that point here (this section_tipo, this section_id)
			$ar_locators = [];
			foreach ($ar_inverse_references as $section_dato) {
				if (isset($section_dato->datos->relations)) {
					foreach ($section_dato->datos->relations as $current_locator) {
						if ($current_locator->section_tipo===$this->section_tipo && $current_locator->section_id==$this->section_id) {
							// add modified version
							$pseudo_locator = new stdClass();
								// same data
								$pseudo_locator->section_tipo			= $current_locator->section_tipo;
								$pseudo_locator->section_id				= $current_locator->section_id;
								$pseudo_locator->from_component_tipo	= $current_locator->from_component_tipo;
								// add useful data
								$pseudo_locator->from_section_tipo		= $section_dato->section_tipo;
								$pseudo_locator->from_section_id		= $section_dato->section_id;

							$ar_locators[] = $pseudo_locator;
						}
					}
				}
			}

		$ar_values = [];
		foreach ($ar_locators as $current_locator) {

			// filter_section
				if (!empty($filter_section)) {
					if (!in_array($current_locator->from_section_tipo, $filter_section)) {
						continue;
					}
				}

			// filter_component
				if (!empty($filter_component)) {
					if (!in_array($current_locator->from_component_tipo, $filter_component)) {
						continue;
					}
				}

			// locator restored from inverse
				$locator = new locator();
					$locator->set_section_tipo($current_locator->from_section_tipo);
					$locator->set_section_id($current_locator->from_section_id);

			// Check target is publishable
				$current_is_publicable = diffusion_utils::is_publishable($locator);
				if ($current_is_publicable!==true) {
					// debug_log(__METHOD__." + Skipped locator not publishable: ".to_string($locator), logger::DEBUG);
					continue;
				}

			// value. Default is locator. To override it, set:  diffusion_properties->process_dato_arguments->format
				$value = (isset($process_dato_arguments->format))
					? (function($locator, $format) {
						switch ($format) {
							case 'section_id':
								return $locator->section_id;
								break;
							default:
								# code...
								break;
						}
						return $locator;
					  })($locator, $process_dato_arguments->format)
					: $locator;// default is built locator


			$ar_values[] = $value;
		}//end foreach ($ar_locators as $current_locator)

		// cache
			self::$diffusion_dato_cache[$cache_key] = $ar_values;


		return $ar_values;
	}//end get_diffusion_dato



	/**
	* GET_DIFFUSION_VALUE
	* Overrides component_common::get_diffusion_value() to provide the relation_list's
	* formatted output for a target diffusion field (typically a MariaDB column managed
	* by the Bun diffusion engine).
	*
	* The method dispatches on $diffusion_properties->data_to_be_used (defaulting to
	* 'dato' when absent). Each mode produces a different output shape:
	*
	*   'dato' (default)
	*       Returns get_diffusion_dato(): an array of locator objects for every
	*       publishable record that points to the host section.
	*
	*   'valor'
	*       Returns get_relation_list_obj() applied to publishable inverse locators:
	*       a full context/data grid object (same shape as the edit UI).
	*       (!) $ar_values is populated with locator objects but passed to
	*       get_relation_list_obj() which expects row objects — see FLAGS.
	*
	*   'dato_full'
	*       Returns an array of locator objects for every publishable inverse reference
	*       (equivalent to the 'valor' locator list without the grid transformation).
	*
	*   'filtered_values'
	*       Calls get_diffusion_dato() to obtain filtered source locators, then for
	*       each locator resolves the value of a target component tipo specified in
	*       process_dato_arguments->target_component_tipo. Supports two sub-modes:
	*         direct_value=true  — instantiates the component on the source record and
	*                              calls get_value() or a configured $component_method.
	*         direct_value=false — forces the locator as the component dato (portal style)
	*                              and calls get_value().
	*       Output can be coerced to 'string' (with a configurable separator) or left
	*       as array (default). Empty results are normalised to null.
	*
	*   'custom'
	*       Iterates inverse references and applies a custom_map array defined in the
	*       ontology properties. Each map item matches a source section_tipo and
	*       describes how to build a value object. Supports a 'related' sub-traversal
	*       that recurses into a second relation_list. v6 process_dato handlers
	*       (diffusion_sql::*) log an ERROR and resolve as null — see migration notes.
	*
	* Result is cached in self::$diffusion_value_cache per tipo+section_tipo+section_id
	* +data_to_be_used+diffusion_properties combination. An optional remove_duplicates
	* guard (array_unique SORT_REGULAR) is applied before caching when configured.
	*
	* @see diffusion_chain_processor, diffusion_sql (v7 replacement for v6 resolve_value)
	* @param string|null $lang [= null] - Target language; passed to component methods
	*                                     that accept it (e.g. get_diffusion_value)
	* @return array|string|null - Formatted diffusion output; null when empty or unpublishable
	*/
	public function get_diffusion_value( ?string $lang=null ) {

		$diffusion_value = null;

		// properties of diffusion element that references this component
			// (!) Note that is possible overwrite real component properties injecting properties from diffusion (see diffusion_sql::resolve_value)
			// This is useful to change the 'data_to_be_used' param of target component (indirectly)
			$diffusion_properties = $this->get_diffusion_properties();

		// data_to_be_used
			// Read from the top-level properties first (standard location), then
			// allow process_dato_arguments->data_to_be_used to override it.
			// This two-level read lets an injected diffusion context (set via
			// set_diffusion_properties()) selectively change the output mode without
			// altering the ontology element's base properties object.
			$data_to_be_used = isset($diffusion_properties->data_to_be_used)
				? $diffusion_properties->data_to_be_used
				: 'dato';
			// overwrite data_to_be_used
			if (isset($diffusion_properties->process_dato_arguments) && isset($diffusion_properties->process_dato_arguments->data_to_be_used)) {
				$data_to_be_used = $diffusion_properties->process_dato_arguments->data_to_be_used;
			}

		$diffusion_properties_key = !empty($diffusion_properties)
			? json_encode($diffusion_properties)
			: '';

		// cache

			$cache_key = $this->tipo.'_'.$this->section_tipo.'_'.$this->section_id.'_'.$data_to_be_used.'_'.$diffusion_properties_key;
			if (isset(self::$diffusion_value_cache[$cache_key])) {
				return self::$diffusion_value_cache[$cache_key];
			}

		// sqo
		$sqo_data = (object)[
			'section_tipo'			=> ['all'],
			'mode'					=> 'related',
			'limit'					=> false,
			'offset'				=> 0,
			'filter_by_locators'	=> [
				(object)[
					'section_tipo'	=> $this->section_tipo,
					'section_id'	=> $this->section_id
				]
			]
		];
		$sqo = new search_query_object($sqo_data);

		switch ($data_to_be_used) {

			case 'custom':
				// see sample at: qdp341, mdcat4338
				$ar_values = [];

				$custom_map = $diffusion_properties->process_dato_arguments->custom_map;

				// ar_inverse_references
				// $ar_inverse_references = $this->get_inverse_references($sqo);
				$ar_inverse_references = array_map(function($row){
					return (object)[
						'section_tipo'	=> $row->section_tipo,
						'section_id'	=> $row->section_id
					];
				}, $this->get_inverse_references($sqo));

				// foreach ($ar_inverse_references as $current_locator) {
				foreach ($ar_inverse_references as $section_dato) {

					$current_locator = (object)[
						'from_section_tipo'	=> $section_dato->section_tipo,
						'from_section_id'	=> $section_dato->section_id
					];

					// check valid locator
						if (!isset($current_locator->from_section_tipo) || !isset($current_locator->from_section_id)) {
							debug_log(__METHOD__
								. " Error: Invalid locator. Expected from_section_tipo and from_section_id " . PHP_EOL
								. ' current_locator: ' . json_encode($current_locator, JSON_PRETTY_PRINT) . PHP_EOL
								. ' custom_map: ' . json_encode($custom_map, JSON_PRETTY_PRINT) . PHP_EOL
								. ' sqo: ' . json_encode($sqo, JSON_PRETTY_PRINT)
								, logger::ERROR
							);
							throw new Exception("Error Processing Request", 1);
						}

					$custom_locator = new locator();
						$custom_locator->set_section_tipo($current_locator->from_section_tipo);
						$custom_locator->set_section_id($current_locator->from_section_id);

					// Check target is publishable
						$current_is_publicable = diffusion_utils::is_publishable($custom_locator);
						if ($current_is_publicable!==true) {
							debug_log(__METHOD__
								." + Skipped locator not publishable: " . PHP_EOL
								. json_encode($custom_locator, JSON_PRETTY_PRINT)
								, logger::DEBUG
							);
							continue;
						}

					// custom_map reference
						// [
						// {
						// 	"section_tipo": "qdp1",
						// 	"table": "objects",
						// 	"image": {
						// 	  "component_method": "get_diffusion_resolve_value",
						// 	  "custom_arguments": {
						// 		"process_dato_arguments": {
						// 		  "target_component_tipo": "qdp66",
						// 		  "dato_splice": [
						// 			1
						// 		  ],
						// 		  "component_method": "get_diffusion_resolve_value",
						// 		  "custom_arguments": [
						// 			{
						// 			  "process_dato_arguments": {
						// 				"target_component_tipo": "rsc29",
						// 				"component_method": "get_diffusion_value",
						// 				"dato_splice": [
						// 				  1
						// 				]
						// 			  }
						// 			}
						// 		  ]
						// 		}
						// 	  }
						// 	},
						// 	"title": {
						// 	  "component_method": "get_diffusion_resolve_value",
						// 	  "custom_arguments": {
						// 		"process_dato_arguments": {
						// 		  "target_component_tipo": "qdp152",
						// 		  "component_method": "get_diffusion_value",
						// 		  "dato_splice": [
						// 			1
						// 		  ]
						// 		}
						// 	  }
						// 	}
						// }
						// ]
					foreach ((array)$custom_map as $map_item) {

						// match current locator section tipo with defined maps section_tipo. If not exist, ignore it
						if ($map_item->section_tipo!==$current_locator->from_section_tipo) {
							continue;
						}

						$value_obj = new stdClass();
							$value_obj->section_tipo	= $current_locator->from_section_tipo;
							$value_obj->section_id		= $current_locator->from_section_id;

						$related_value_obj = new stdClass();

						$is_related = false;

						// iterate object map_item
						foreach ($map_item as $map_key => $map_obj) {

							// section_tipo
								if ($map_key==='section_tipo') {
									continue;
								}

							// table
								if ($map_key==='table') {
									$value_obj->table			= $map_obj;
									$related_value_obj->table	= $map_obj;
									continue;
								}

							// related case (@see mdcat4338 properties)
								if(isset($map_obj->related)) {

									$deep_relation_list = new relation_list(
										$map_obj->related->target_component_tipo, //string tipo
										$current_locator->from_section_id, // mixed section_id
										$current_locator->from_section_tipo, // string section_tipo
										'edit'
									);
									$current_dato = $deep_relation_list->get_diffusion_dato();

									// sqo . Common used to get inverse locators
									$deep_sqo = (object)[
										'section_tipo'			=> ['all'],
										'mode'					=> 'related',
										'limit'					=> false,
										'offset'				=> 0,
										'filter_by_locators'	=> [
											(object)[
												'section_tipo'	=> $deep_relation_list->section_tipo,
												'section_id'	=> $deep_relation_list->section_id
											]
										]
									];

									// inverse_references
									// return all records found
									$current_dato = array_map(function($row){
										return (object)[
											'section_tipo'	=> $row->section_tipo,
											'section_id'	=> $row->section_id
										];
									}, $deep_relation_list->get_inverse_references($deep_sqo));

									$filtered_result = [];
									foreach ((array)$current_dato as $current_dato_value) {
										// filter_section
										// if (!in_array($current_dato_value->from_section_tipo, (array)$map_obj->related->filter_section)) {
										if (!in_array($current_dato_value->section_tipo, (array)$map_obj->related->filter_section)) {
											continue;
										}

										$filtered_result[] = $current_dato_value; // add row
									}

									if (!empty($filtered_result)) {
										foreach ($filtered_result as $filtered_value) {

											$filtered_custom_locator = new locator();
												$filtered_custom_locator->set_section_tipo($filtered_value->section_tipo);
												$filtered_custom_locator->set_section_id($filtered_value->section_id);

											// Check target is publicable
												$filtered_current_is_publicable = diffusion_utils::is_publishable($filtered_custom_locator);
												if ($filtered_current_is_publicable!==true) {
													debug_log(__METHOD__
														." + Skipped locator not publicable: ". PHP_EOL
														.' filtered_custom_locator:' . to_string($filtered_custom_locator)
														, logger::DEBUG
													);
													continue;
												}

											// current_value
												// v6 'process_dato' resolution (diffusion_sql::resolve_value) was
												// removed in v7: diffusion values are processed by the Bun engine
												// parsers. An ontology config reaching this point was not migrated.
												$current_value = null;
												debug_log(__METHOD__
													. " UNMIGRATED v6 process_dato config detected (resolve_value). Value resolved as null." . PHP_EOL
													. " Migrate this ontology config to v7 parsers (see diffusion/migration/migrate_diffusion_properties.php)." . PHP_EOL
													. ' tipo: ' . to_string($this->tipo) . PHP_EOL
													. ' map_obj: ' . json_encode($map_obj)
													, logger::ERROR
												);

											if ($is_related===false) {
												$related_value_obj->section_tipo	= $filtered_value->section_tipo;
												$related_value_obj->section_id		= $filtered_value->section_id;
											}

											$related_value_obj->{$map_key}	= $current_value;

										}//end foreach ($filtered_result as $filtered_value)
									}
									$is_related = true;
									continue;
								}//end if(isset($map_obj->related))

							// reference
								// "type": "dd151",
								// "section_id": "7",
								// "section_tipo": "technique1",
								// "from_component_tipo": "qdp168",
								// "from_section_tipo": "qdp1",
								// "from_section_id": "2"

							$custom_locator = new locator();
								$custom_locator->set_section_tipo($current_locator->from_section_tipo);
								$custom_locator->set_section_id($current_locator->from_section_id);

							$current_dato = [$custom_locator];

							// $is_direct distinguishes two legacy ontology config shapes:
							// direct (process_dato lives at map_obj root) vs
							// indirect (process_dato lives nested under custom_arguments).
							// Both paths resolve as null for v6 handlers; see migration note above.
							$is_direct = !isset($map_obj->custom_arguments->process_dato_arguments);
							if ($is_direct) {

								// direct case @see 'mdcat4338' (changed to calculated value 31-03-2025)
								$process_dato_arguments	= $map_obj->process_dato_arguments;
								$process_dato_arguments->lang = $lang;

								// function_handler. Configured in ontology properties as 'class::method'.
								// v6 handlers (diffusion_sql::*) were removed in v7: unmigrated configs
								// resolve as null and are reported for migration.
								$function_handler = $map_obj->process_dato;

								if (is_callable($function_handler)) {
									$current_properties = new stdClass();
										$current_properties->process_dato_arguments = $process_dato_arguments;
									$current_options = new stdClass();
										$current_options->properties = $current_properties;
									$current_value = $function_handler($current_options, $current_dato);
								}else{
									$current_value = null;
									debug_log(__METHOD__
										. " UNMIGRATED v6 process_dato config detected (not callable). Value resolved as null." . PHP_EOL
										. " Migrate this ontology config to v7 parsers (see diffusion/migration/migrate_diffusion_properties.php)." . PHP_EOL
										. ' function_handler: ' . to_string($function_handler) . PHP_EOL
										. ' tipo: ' . to_string($this->tipo)
										, logger::ERROR
									);
								}

							}else{

								// v6 'process_dato' resolution (diffusion_sql::resolve_value) was removed
								// in v7: diffusion values are processed by the Bun engine parsers.
								// An ontology config reaching this point was not migrated.
								$current_value = null;
								debug_log(__METHOD__
									. " UNMIGRATED v6 process_dato config detected (resolve_value). Value resolved as null." . PHP_EOL
									. " Migrate this ontology config to v7 parsers (see diffusion/migration/migrate_diffusion_properties.php)." . PHP_EOL
									. ' tipo: ' . to_string($this->tipo) . PHP_EOL
									. ' map_obj: ' . json_encode($map_obj)
									, logger::ERROR
								);
							}

							$value_obj->{$map_key} = $current_value;
						}//end foreach ($map_item as $map_key => $map_obj)

						if (!in_array($value_obj, $ar_values) && $is_related===false) {
							$ar_values[] = $value_obj;
						}else if(!in_array($related_value_obj, $ar_values) && $is_related===true){
							$ar_values[] = $related_value_obj;
						}

					}//end foreach ($custom_map as $map_item)
				}//end foreach ($ar_inverse_references as $section_dato) {

				$diffusion_value = $ar_values;
				break;

			case 'valor':
				$ar_values = [];
				$ar_inverse_references = $this->get_inverse_references($sqo);
				foreach ($ar_inverse_references as $inverse_reference) {

					$current_locator = new locator();
						$current_locator->set_section_tipo($inverse_reference->section_tipo);
						$current_locator->set_section_id($inverse_reference->section_id);

					// Check target is publicable
					$current_is_publicable = diffusion_utils::is_publishable($current_locator);
					if ($current_is_publicable!==true) {
						debug_log(__METHOD__
							." + Skipped locator not publishable: ". PHP_EOL
							. ' current_locator: ' . json_encode($current_locator, JSON_PRETTY_PRINT)
							, logger::DEBUG
						);
						continue;
					}
					$ar_values[] = $current_locator;
				}

				// (!) get_relation_list_obj() expects rows with section_tipo + section_id
				// (same minimal shape as the locator objects built above), so passing
				// $ar_values directly is intentional here even though the method was
				// originally designed for rows returned by get_inverse_references().
				$ar_relations_lists	= $this->get_relation_list_obj($ar_values);
				$diffusion_value	= $ar_relations_lists;
				break;

			case 'dato_full':
				$ar_values = [];
				$ar_inverse_references = $this->get_inverse_references($sqo);
				foreach ($ar_inverse_references as $inverse_reference) {

					$current_locator = new locator();
						$current_locator->set_section_tipo($inverse_reference->section_tipo);
						$current_locator->set_section_id($inverse_reference->section_id);

					// Check target is publicable
					$current_is_publicable = diffusion_utils::is_publishable($current_locator);
					if ($current_is_publicable!==true) {
						debug_log(__METHOD__
							." + Skipped locator not publishable: ". PHP_EOL
							. ' current_locator: ' . json_encode($current_locator, JSON_PRETTY_PRINT)
							, logger::DEBUG
						);
						continue;
					}
					// if (count($ar_values)>10) {
					// 	break;
					// }
					$ar_values[] = $current_locator;
				}

				$diffusion_value = $ar_values;
				break;

			case 'filtered_values': // inject each relation value (locator) to target component and request the processed value
				// see sample at: numisdata1302

				// get relations filtered dato (by section_tipo and component_tipo)
					$diffusion_value = $this->get_diffusion_dato();

				// params from properties
					$target_component_tipo	= $diffusion_properties->process_dato_arguments->target_component_tipo;
					$output					= $diffusion_properties->process_dato_arguments->output ?? 'array';
					$separator				= $diffusion_properties->process_dato_arguments->separator ?? ' | ';
					$direct_value			= $diffusion_properties->process_dato_arguments->direct_value ?? false;
					$component_method		= $diffusion_properties->process_dato_arguments->component_method ?? null;
					$options				= $diffusion_properties->process_dato_arguments->options ?? null;

				// ar_value. Iterate locators and store component processed value
					$ar_value = [];
					foreach ($diffusion_value as $current_locator) {

						$model = ontology_node::get_model_by_tipo($target_component_tipo,true);

						if ($direct_value===true) {

							// direct component value case (@see 'dmmgobes29')

							$translatable = ontology_node::get_translatable( $target_component_tipo );
							$lang = ( $translatable===true) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
							$current_component = component_common::get_instance(
								$model,
								$target_component_tipo,
								$current_locator->section_id,
								'list',
								$lang,
								$current_locator->section_tipo
							);

							if ($component_method==='get_diffusion_value') {
								// sample at 'dmmgobes31'
									// {
									//   "data_to_be_used": "filtered_values",
									//   "process_dato_arguments": {
									//     "output": "string",
									//     "direct_value": true,
									//     "filter_section": "dmm480",
									//     "target_component_tipo": "dmm500",
									//     "component_method": "get_diffusion_value",
									//     "options": {
									//       "custom_parents": {
									//         "info": " Select by model code (province '8870' from es2)",
									//         "select_model": [
									//           "es2_8870"
									//         ]
									//       }
									//     }
									//   }
									// }
								$ar_value[] = $current_component->{$component_method}($lang, $options);
							}else if ( isset($component_method) ) {
								$component_data = $current_component->{$component_method}();

								if(is_string($component_data)){
									try {
										$data_parse = json_decode($component_data);
										if($data_parse !== null){
											$component_data = $data_parse;
										}
									} catch (Exception $e) {

									}
								}
								if(!empty($component_data)){
									if(is_array($component_data)){
										$ar_value = [...$ar_value, ...$component_data];
									}else{
										$ar_value[] = $component_data;
									}
								}
							}else{
								$ar_value[] = $current_component->get_value();
							}

						}else{

							// default related value case (portals, etc.) @see 'numisdata1302'

							$current_component = component_common::get_instance(
								$model,
								$target_component_tipo,
								$this->section_id,
								'list',
								DEDALO_DATA_LANG,
								$this->section_tipo
							);
							$current_component->set_dato($current_locator); // force set dato
							$ar_value[] = $current_component->get_value();
						}
					}

				// diffusion_value as string or array (default array)
					$diffusion_value = ($output==='string')
						? implode($separator, $ar_value)
						: $ar_value;
					// unify empty values to null
					if (empty($diffusion_value) && $diffusion_value!==null) {
						$diffusion_value = null;
					}
				break;

			case 'dato':
			default:
				// DES
					// $ar_values = [];
					// $ar_inverse_references = $this->get_inverse_references($limit=false, $offset=0, $count=false);
					// foreach ($ar_inverse_references as $current_locator) {

					// 	// Check target is publicable
					// 	$current_is_publicable = diffusion_utils::is_publishable($current_locator);
					// 	if ($current_is_publicable!==true) {
					// 		debug_log(__METHOD__." + Skipped locator not publicable: ".to_string($current_locator), logger::DEBUG);
					// 		continue;
					// 	}
					// 	$ar_values[] = $current_locator->section_tipo;
					// }

					// $diffusion_value = array_unique($ar_values);

				$diffusion_value = $this->get_diffusion_dato();
				break;
		}

		// remove duplicates option
			if (isset($diffusion_properties->process_dato_arguments)
				&& isset($diffusion_properties->process_dato_arguments->remove_duplicates)
				&& $diffusion_properties->process_dato_arguments->remove_duplicates===true) {

				if (is_array($diffusion_value)) {
					$diffusion_value = array_unique($diffusion_value, SORT_REGULAR);
				}
			}

		// cache
			self::$diffusion_value_cache[$cache_key] = $diffusion_value;


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_DATA
	* Returns the inverse-reference result set as a flat array of minimal locator
	* objects { section_tipo, section_id } — one per external record that holds a
	* relation pointing to the host section.
	*
	* Unlike get_diffusion_dato(), this method does NOT apply a publishability check
	* and does NOT filter by process_dato_arguments. It is the raw data source for
	* get_diffusion_data() and is intended for contexts (diffusion_chain_processor,
	* direct API consumption) where the caller handles further filtering.
	*
	* SQO construction:
	*   - section_tipo: $section_filter if set, otherwise ['all'].
	*   - mode: 'related' (triggers the search_related path in the search layer).
	*   - filter_by_locators: when $component_filter is empty, a single locator
	*     targeting (section_tipo, section_id); when $component_filter is set, one
	*     locator per component tipo, each carrying 'from_component_tipo' to narrow
	*     the relation origin.
	*
	* @return array - Array of stdClass { section_tipo, section_id }; empty when no
	*                 external records reference the host section
	*
	* @test false
	*/
	public function get_data() : array {

		// Build filter locators
		$ar_filter_locators = [];
		if (empty($this->component_filter)) {
			// default: one locator without component filter
			$ar_filter_locators[] = (object)[
				'section_tipo'	=> $this->section_tipo,
				'section_id'	=> $this->section_id
			];
		} else {
			// multiple locators: one for each component type in the filter
			foreach ((array)$this->component_filter as $tipo) {
				$ar_filter_locators[] = (object)[
					'section_tipo'			=> $this->section_tipo,
					'section_id'			=> $this->section_id,
					'from_component_tipo'	=> $tipo
				];
			}
		}

		// sqo . Common used to get inverse locators
		$sqo_data = (object)[
			'section_tipo'			=> !empty($this->section_filter) ? $this->section_filter : ['all'],
			'mode'					=> 'related',
			'limit'					=> false,
			'offset'				=> 0,
			'filter_by_locators'	=> $ar_filter_locators
		];

		// sqo
			$sqo = new search_query_object($sqo_data);

		// inverse_references
			$ar_inverse_references = $this->get_inverse_references($sqo);
				// sample. Full section dato
				// {
				//     "section_tipo": "numisdata300",
				//     "section_id": "1",
				//     "realtion": [
				//         {
				//             "type": "dd675",
				//             "section_id": "1",
				//             "section_tipo": "dd153",
				//             "from_component_tipo": "numisdata304"
				//         }, ...
				//     ]
				// }

		// create its data with the inverse references
		$data = array_map( function($el) {
			return (object)[
				'section_tipo' => $el->section_tipo,
				'section_id' => $el->section_id
			];
		}, $ar_inverse_references);


		return $data;
	}//end get_data



	/**
	* GET_DIFFUSION_DATA
	* Entry point for the diffusion_chain_processor: returns an array of
	* diffusion_data_object instances representing the data items that this
	* relation_list contributes to a diffusion run.
	*
	* Resolution order:
	*   1. Custom function override (ddo->fn):
	*      If ddo provides a function name, the method checks whether it is callable
	*      on $this (class method) or via diffusion_fn (static mixin). For a native
	*      class method, the return value is set as the single diffusion_data_object
	*      value and returned. For a diffusion_fn method, the return value must itself
	*      be an array of diffusion_data_object instances. Errors caught as Throwable
	*      are logged at ERROR level; the result is treated as null.
	*
	*   2. Default resolution (no ddo->fn):
	*      Applies ddo->section_filter and ddo->component_filter if present (via the
	*      set_* fluent setters), then calls get_data(). An optional ddo->data_slice
	*      { offset, length } trims the result array before it is stored as the
	*      diffusion_data_object value.
	*
	* The diffusion_data_object is always pre-constructed with tipo=$this->tipo and
	* id=ddo->id before any resolution, so a failed custom function still returns a
	* well-formed (value=null) object to prevent chain breakage.
	*
	* @see diffusion_chain_processor - Consumes the returned array of diffusion_data_object
	* @param object       $ddo                    - DDO map entry; relevant keys: fn, section_filter,
	*                                               component_filter, data_slice, id
	* @param string|null  $diffusion_element_tipo [= null] - Tipo of the diffusion element;
	*                                               forwarded to custom fn calls
	* @return array - Single-element array of diffusion_data_object (or multi-element when
	*                 a diffusion_fn returns multiple items)
	*
	* @test false
	*/
	public function get_diffusion_data( object $ddo, ?string $diffusion_element_tipo=null ) : array {

		$diffusion_data = [];

		// Default diffusion data object
		$diffusion_data_object = new diffusion_data_object( (object)[
			'tipo'	=> $this->tipo,
			'lang'	=> null,
			'value'	=> null,
			'id'	=> $ddo->id ?? null
		]);

		$diffusion_data[] = $diffusion_data_object;

		// Custom function case
			// If ddo provide a specific function to get its diffusion data
			// check if it exists and can be used by diffusion environment
			// if all is ok, use this function and return the value returned by this function
			$fn = $ddo->fn ?? null;

			if( $fn ){
				// check if the function exist
				// if not, return a null value in diffusion data
				// and stop the resolution.
				// is_callable([$this, $fn]) returns true for both real methods and
				// magic methods routed through __call (diffusion_fn mixins).
				if( !is_callable([$this, $fn]) ){
					debug_log(__METHOD__
						. " function doesn't exist " . PHP_EOL
						. " function name: ". $fn
						, logger::ERROR
					);

					return $diffusion_data;
				}

				// execute the function directly since it's already validated
				try {
					$fn_data = $this->$fn( $ddo, $diffusion_element_tipo );

					switch (true) {
						// if the function is a method of the current component
						// it will return any kind of values.
						case method_exists($this, $fn):
							$diffusion_data_object->set_value( $fn_data );

							return $diffusion_data;
						// default, diffusion_fn method loaded by common __call
						// it will return an array of diffusion_data_object
						// and the default diffusion_data_object will be replaced
						default:
							// overwrite default diffusion data
							$diffusion_data = $fn_data;
							break;
					}
				} catch (Throwable $e) {
					debug_log(__METHOD__
						. " error executing diffusion function " . PHP_EOL
						. " function name: ". $fn . PHP_EOL
						. " error: " . $e->getMessage()
						, logger::ERROR
					);
					$fn_data = null;
				}
				// overwrite default diffusion data
				$diffusion_data = $fn_data;

				return $diffusion_data;
			}

		// Resolve the data by default
			// apply filters from ddo if provided
			if (!empty($ddo->section_filter)) {
				$this->set_section_filter((array)$ddo->section_filter);
			}
			if (!empty($ddo->component_filter)) {
				$this->set_component_filter((array)$ddo->component_filter);
			}

			// Default: retrieve the raw inverse-reference locator list.
			// (!) The comment below is a copy-paste relic from component_common;
			// for relation_list the default always calls get_data(), not get_url().
			$data = $this->get_data();

			// if the ddo provides a data_slice property, use it to slice the data
			if(isset($ddo->data_slice)){
				$data = array_slice($data, $ddo->data_slice->offset, $ddo->data_slice->length);
			}

			$diffusion_value = !empty($data)
				? $data
				: null;

			$diffusion_data_object->set_value( $diffusion_value );


		return $diffusion_data;
	}//end get_diffusion_data



}//end class relation_list
