<?php declare(strict_types=1);
/**
* CLASS COMPONENT_RELATION_RELATED
* Manages associative (related-term) relationships between thesaurus records in Dédalo.
*
* This component stores an array of locators whose 'type' is DEDALO_RELATION_TYPE_RELATED_TIPO
* ('dd89') and whose 'type_rel' records the directionality of the link:
*
*   - Unidirectional (dd620): A → B is stored only on A; B has no stored reference to A.
*   - Bidirectional   (dd467): A → B is stored on A; the inverse B → A is computed on the fly
*     by get_references_recursive() and surfaced through get_calculated_references().
*   - Multidirectional (dd621): the full associative graph is resolved recursively — every term
*     that either references, or is referenced by, the current term (and their neighbours) is
*     included; cycles are broken via $references_recursive_resolved_cache.
*
* The component overrides the parent get_data_with_references() to merge the stored dato with
* the computed inverse references so that callers always see the logically complete set.  The
* JSON controller (component_relation_related_json.php) exposes the computed references as a
* separate 'references' property on the item data object (shown in 'edit' mode only).
*
* Data shape (stored locator)
* ---------------------------
*   {
*     "id":                 1,          // stable item id for dataframe pairing
*     "type":               "dd89",     // DEDALO_RELATION_TYPE_RELATED_TIPO
*     "type_rel":           "dd620",    // directionality: dd620 | dd467 | dd621
*     "section_id":         "2",
*     "section_tipo":       "test3",
*     "from_component_tipo":"test54"
*   }
*
* Key relationships
* -----------------
* - Extends component_relation_common (locator lifecycle, JSONB search, export, grid).
* - $default_relation_type  overrides the parent null to DEDALO_RELATION_TYPE_RELATED_TIPO.
* - $default_relation_type_rel seeds the directionality used when ontology properties do not
*   specify config_relation->relation_type_rel.
* - get_sortable() returns true (parent returns false), enabling sort_data_by_column().
* - get_order_path() adds a second path hop to DEDALO_THESAURUS_TERM_TIPO ('hierarchy25') so
*   that sort_data_by_column() orders by the term label of the linked thesaurus record.
*
* @package Dédalo
* @subpackage Core
*/
class component_relation_related extends component_relation_common {



	/**
	* CLASS VARS
	*/
		/**
		 * Default locator 'type' for this component.
		 * Overrides the parent null to DEDALO_RELATION_TYPE_RELATED_TIPO ('dd89').
		 * Used by validate_data_element() when a locator arrives without a 'type' property
		 * and as the type-check key in remove_locator_from_data().
		 * @var ?string $default_relation_type
		 */
		protected ?string $default_relation_type = DEDALO_RELATION_TYPE_RELATED_TIPO;

		/**
		 * Default directionality stored inside every locator as 'type_rel'.
		 * Overrides the parent null to DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO ('dd620').
		 * Resolved from ontology properties->config_relation->relation_type_rel in __construct();
		 * only falls back to this default when the ontology entry carries no relation_type_rel.
		 * Determines the behaviour of get_calculated_references(): unidirectional returns [], while
		 * bidirectional and multidirectional trigger the recursive reference resolver.
		 * @var ?string $default_relation_type_rel
		 */
		protected ?string $default_relation_type_rel = DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO;

		/**
		 * Properties used to detect duplicate locators when adding relations.
		 * Passed to locator::in_array_locator() inside add_locator_to_data() and
		 * to locator::compare_locators() inside remove_locator_from_data().
		 * Including 'from_component_tipo' means two locators pointing at the same section/record
		 * but originating from different components are NOT considered duplicates.
		 * Note: get_locator_properties_to_check() (called from validate_data_element) uses a
		 * separate, hash-based mechanism — this array is the legacy add/remove guard.
		 * @var array $test_equal_properties
		 */
		public array $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];

		/**
		 * Request-lifecycle cache for resolved inverse-reference sets.
		 * Keyed by pseudo-locator strings ("{section_tipo}_{section_id}_{lang}") accumulated during
		 * a single get_references_recursive() traversal.  Reset to [] at the start of every
		 * top-level call ($recursion===false) to prevent cross-request bleed.
		 * (!) Being static, this cache survives across calls within a persistent-worker process.
		 *     The $recursion===false reset at the entry point is the only protection; do not
		 *     populate it outside of get_references_recursive().
		 * @var array $references_recursive_resolved_cache
		 */
		public static array $references_recursive_resolved_cache = [];



	/**
	* GET_DATA_WITH_REFERENCES
	* Returns the effective locator list for this component: the stored dato merged with any
	* dynamically computed inverse references (terms that point to the current record).
	*
	* Overrides the parent component_relation_common::get_data_with_references(), which simply
	* delegates to get_data(). This override calls get_calculated_references(true) with only_data=true
	* to obtain raw inverse-reference locators (no label objects) and spreads them onto the stored
	* dato array using the spread operator. The merged array is used by callers such as
	* search and export that need the full logical set of related terms, not just the stored ones.
	*
	* For unidirectional components get_calculated_references(true) returns [] so the
	* result equals get_data() with no overhead beyond the switch in get_calculated_references.
	*
	* @return array $data_with_references - Merged array of locator objects; never null.
	*/
	public function get_data_with_references() : array {

		$data		= $this->get_data();
		$references	= $this->get_calculated_references(true);

		$data_with_references = [...($data ?? []), ...$references];

		return $data_with_references;
	}//end get_data_with_references



	/**
	* GET_CALCULATED_REFERENCES
	* Resolves and returns the computed inverse references for the current term.
	*
	* For bidirectional and multidirectional directionality types, this delegates to
	* get_references_recursive(), which searches the database for every term whose
	* component_relation_related dato contains a locator pointing at the current section
	* record and then (for MULTIDIRECTIONAL) recursively expands the graph.
	*
	* For unidirectional (or any unrecognised type_rel), returns an empty array immediately
	* — no database query is issued.
	*
	* When $only_data is false (the default), each resolved locator is wrapped in an item object:
	*   { value: <locator>, label: <string|null> }
	* and the label is built from the ddo_map in the component's request_config. The
	* fields_separator from the show object (or ' | ' as fallback) is used to join multi-field
	* labels. This form is used by the JSON controller to populate item->references for client
	* display.
	*
	* When $only_data is true, the raw locator array is returned without wrapping. This form
	* is consumed by get_data_with_references() to merge inverse refs with stored data.
	*
	* @param bool $only_data [= false] - When true, return plain locator objects (no label wrap).
	* @return array $references - For only_data=true: array of locator objects.
	*                             For only_data=false: array of {value, label} item objects.
	*/
	public function get_calculated_references(bool $only_data=false) : array {

		switch ($this->relation_type_rel) {

			case DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO:
			case DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO:
				$current_locator = new stdClass();
					$current_locator->section_tipo			= $this->section_tipo;
					$current_locator->section_id			= $this->section_id;
					$current_locator->from_component_tipo	= $this->tipo;
				$references = component_relation_related::get_references_recursive(
					$this->tipo,
					$current_locator,
					$this->relation_type_rel,
					false, // bool recursion
					$this->lang
				);
				break;

			case DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO:
			default:
				$references = [];
				break;
		}

		// only_data. Return the locators without label,
		// used by merge with the real data of the component ($data_full or get_data_with_references())
			if($only_data===true){
				return $references;
			}

		// get the request_config of the component to get the show object, it will use to format the label of the reference.
			$request_config			= $this->get_request_config_object();
			$show					= $request_config->show;
			$ar_componets_related	= array_map(function($ddo){
				return $ddo->tipo;
			}, $show->ddo_map);

		$fields_separator = (isset($show->fields_separator)) ?  $show->fields_separator : ' | ';

		$references = array_map(function($locator) use($ar_componets_related, $fields_separator) {

			$ar_current_label = self::get_locator_value(
				$locator, // object locator
				DEDALO_DATA_LANG, // string lang
				false, // bool show_parents
				$ar_componets_related, // array|null ar_components_related
				true // bool include_self
			);
			$current_label = !empty($ar_current_label)
				? implode($fields_separator, $ar_current_label)
				: $ar_current_label; // null case

			$item = new stdClass();
				$item->value	= $locator;
				$item->label	= $current_label; // string|null

			return $item;
		}, $references);


		return $references;
	}//end get_calculated_references



	/**
	* GET_TYPE_REL
	* Returns the active directionality tipo for this component instance.
	*
	* The value is resolved in __construct() from ontology properties->config_relation->relation_type_rel,
	* falling back to $default_relation_type_rel (DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO).
	* Possible values:
	*   DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO  ('dd620') — one-way, no inverse lookup
	*   DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO   ('dd467') — inverse lookup enabled
	*   DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO ('dd621') — full graph traversal
	*
	* @return string - The relation_type_rel value for this instance.
	*/
	public function get_type_rel() : string {

		return $this->relation_type_rel;
	}//end get_type_rel



	/**
	* GET_REFERENCES_RECURSIVE
	* Traverses the associative-relationship graph to collect all terms that reference the
	* given locator, following bidirectional or multidirectional links.
	*
	* Algorithm overview
	* ------------------
	* 1. On the first (top-level) call ($recursion===false), the static pseudo-locator cache is
	*    reset so a fresh traversal starts cleanly.
	* 2. The current locator is registered in the cache and a component_relation_related instance
	*    is built for the matching section record.  get_references() is called on it to find all
	*    database records whose dato contains a locator pointing at the current record.  Each new
	*    result locator (not already in cache) is added to $ar_references.
	* 3. For MULTIDIRECTIONAL only: the stored dato of the same component instance (terms the
	*    current record itself points TO) is also traversed.  Each unvisited data locator is added
	*    to the cache and, when $recursion===true (i.e., not the root call), added to $ar_references
	*    as well.  Then get_references_recursive() is called on each data locator to pull in their
	*    own inverse references.
	* 4. Finally, for MULTIDIRECTIONAL, get_references_recursive() is called on each reference
	*    already collected to further expand the graph.  The cache prevents infinite loops.
	*
	* Top-level (entry point) call: $recursion=false, $tipo = owning component tipo.
	* Recursive calls pass $recursion=true and the locator being expanded.
	*
	* (!) The root call does NOT add items from the stored dato to $ar_references (only_data
	*     at the call site already holds the stored dato via get_data()).  Only recursion=true
	*     calls add data items, so the root term itself is never duplicated.
	*
	* @param string $tipo      - The component tipo of the owning component_relation_related.
	* @param object $locator   - Locator representing the term to resolve ({section_tipo, section_id, from_component_tipo}).
	* @param string $type_rel [= DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO]
	*                         - Directionality constant that controls graph depth.
	* @param bool $recursion [= false] - False on top-level call; true on every recursive call.
	* @param string $lang [= DEDALO_DATA_LANG] - Language code forwarded to child get_instance() calls.
	* @return array $ar_references - Flat array of locator objects that belong to the resolved graph.
	*/
	public static function get_references_recursive(
		string $tipo,
		object $locator,
		string $type_rel=DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO,
		bool $recursion=false,
		string $lang=DEDALO_DATA_LANG
		) : array {


		// reset ar_resolved on first call
			if ($recursion===false) {
				self::$references_recursive_resolved_cache = [];
			}

		$pseudo_locator	= $locator->section_tipo .'_'. $locator->section_id . '_'. $lang;
		self::$references_recursive_resolved_cache[]	= $pseudo_locator; // set self as resolved
		$ar_references	= [];

		// References to me
		if (isset($locator->section_id) && isset($locator->section_tipo)) {
			// $model_name 	= ontology_node::get_model_by_tipo($locator->from_component_tipo,true); // get_class();
			$ref_component 	= component_common::get_instance(
				'component_relation_related',
				$locator->from_component_tipo,
				$locator->section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$locator->section_tipo
			);
			$ar_result = $ref_component->get_references();

			foreach ($ar_result as $result_locator) {
				$pseudo_locator = $result_locator->section_tipo .'_'. $result_locator->section_id . '_'. $lang;
				if (in_array($pseudo_locator, self::$references_recursive_resolved_cache)) {
					continue;
				}
				$ar_references[]	= $result_locator;
				self::$references_recursive_resolved_cache[]		= $pseudo_locator; // set as resolved
			}
		}

		// Only DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO
		if ($type_rel===DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO) {

			// ref_component data
			if (isset($ref_component)) {
				$data = $ref_component->get_data() ?? [];
				foreach ($data as $data_locator) {

					$pseudo_locator = $data_locator->section_tipo .'_'. $data_locator->section_id . '_'. $lang;
					if (in_array($pseudo_locator, self::$references_recursive_resolved_cache)) {
						continue;
					}

					$element = new stdClass();
						$element->section_tipo			= $data_locator->section_tipo;
						$element->section_id			= $data_locator->section_id;
						$element->from_component_tipo	= $data_locator->from_component_tipo;

					// Only add data when is recursion, not at the first call
					if ($recursion===true) {
						$ar_references[] = $element;
					}

					self::$references_recursive_resolved_cache[] = $pseudo_locator; // set as resolved

					// References to data
					// Recursion (data)
					$ar_result		= self::get_references_recursive($tipo, $data_locator, $type_rel, true, $lang);
					$ar_references	= [...$ar_references, ...$ar_result];
				}
			}

			// References to references
			foreach ($ar_references as $current_locator) {
				// Recursion (references)
				$ar_result		= self::get_references_recursive($tipo, $current_locator, $type_rel, true, $lang);
				$ar_references	= [...$ar_references, ...$ar_result];
			}
		}//end if ($type_rel===DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO)


		return $ar_references;
	}//end get_references_recursive



	/**
	* GET_REFERENCES
	* Queries the database for all section records whose component_relation_related dato contains
	* a locator pointing at the current component's own section record.
	*
	* This is the foundational reverse-lookup that powers get_references_recursive(). It builds
	* a search_query_object against the host section tipo, using the 'relations' component_path to
	* search inside the JSONB 'relation' column of the matrix table.  The locator used as a filter
	* carries {section_tipo, section_id, from_component_tipo} matching the current component; an
	* optional $type_rel narrows the search to a specific directionality.
	*
	* The returned array contains plain-object locators (not full locator class instances) with
	* exactly three properties:
	*   { section_tipo: string, section_id: string, from_component_tipo: string }
	* from_component_tipo is always set to $this->tipo (the querying component), not to the
	* from_component_tipo stored in the matched row, because the caller needs to instantiate the
	* same component type to recurse.
	*
	* (!) limit=0 means unlimited — for heavily connected thesaurus terms this query can return
	*     large result sets. The recursive caller's cache prevents re-visiting the same node but
	*     does not bound the total number of database results per traversal step.
	*
	* @param string|null $type_rel [= null] - Optional directionality tipo to narrow the filter
	*   (e.g. DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO). When null, all type_rel values match.
	* @return array $ar_result - Array of plain locator objects [{section_tipo, section_id, from_component_tipo}].
	*/
	public function get_references( ?string $type_rel=null ) : array {

		$locator = new locator();
			$locator->set_section_tipo($this->section_tipo);
			$locator->set_section_id($this->section_id);
			$locator->set_from_component_tipo($this->tipo);

		if (!empty($type_rel)) {
			// Add type_rel filter
			$locator->set_type_rel($type_rel);
		}

		// Path
		$base_path = new stdClass();
			$base_path->name			= $this->label;
			$base_path->model			= get_class($this);
			$base_path->section_tipo	= $this->section_tipo;
			$base_path->component_tipo	= $this->tipo;

		$path = [$base_path];

		// Component path
		$component_path = ['relations'];

		// Filter
		$filter_group = new stdClass();
			$filter_group->q				= $locator;
			$filter_group->lang				= 'all';
			$filter_group->path				= $path;
			$filter_group->component_path	= $component_path;

		$filter = (object)[
			'$and' => [$filter_group]
		];

		// search_query_object
		$search_query_object = new search_query_object();
			$search_query_object->set_select([]);
			$search_query_object->set_id('temp');
			$search_query_object->set_section_tipo([$this->section_tipo]);
			$search_query_object->set_filter($filter);
			$search_query_object->set_limit(0);
			$search_query_object->set_offset(0);
			$search_query_object->set_full_count(false);

		$search		= search::get_instance($search_query_object);
		$db_result	= $search->search();

		$ar_result = [];
		foreach ($db_result as $row) {

			$element = new stdClass();
				$element->section_tipo			= $row->section_tipo;
				$element->section_id			= $row->section_id;
				$element->from_component_tipo	= $this->tipo;

			$ar_result[] = $element;
		}


		return $ar_result;
	}//end get_references


	/**
	* GET_SORTABLE
	* Overrides the parent component_relation_common::get_sortable() (which returns false) to
	* enable column-based sorting for component_relation_related instances.
	*
	* Returning true allows sort_data_by_column() to be invoked from the 'sort_by_column' changed_data
	* action and exposes the sortable affordance in the client context (context->sortable: true in
	* component_relation_related_json.php output).
	*
	* @return bool - Always true for component_relation_related.
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



	/**
	* GET_ORDER_PATH
	* Builds the two-hop ddo path used by sort_data_by_column() to construct the ORDER BY clause
	* for sorting this component's locator array by the thesaurus term label of the linked record.
	*
	* The path contains two elements:
	*   1. The owning component itself (component_relation_related at $component_tipo / $section_tipo).
	*   2. The thesaurus term component (DEDALO_THESAURUS_TERM_TIPO = 'hierarchy25', a
	*      component_input_text in the thesaurus section) — this is the column whose string value
	*      drives the alphabetical sort of the related-term list.
	*
	* This two-hop structure mirrors the ddo_map path configured in the ontology:
	*   component_relation_related → hierarchy25 (term label)
	* and matches the path built by get_order_path() in other portal-type components that resolve
	* through a linked thesaurus record.
	*
	* @param string $component_tipo - The tipo of this component_relation_related instance.
	* @param string $section_tipo   - The host section tipo that owns this component.
	* @return array $path - Two-element array of path objects [{component_tipo, model, name, section_tipo}, …].
	*/
	public function get_order_path(string $component_tipo, string $section_tipo) : array {

		$path = [
			// self component path
			(object)[
				'component_tipo'	=> $component_tipo,
				'model'				=> ontology_node::get_model_by_tipo($component_tipo,true),
				'name'				=> ontology_node::get_term_by_tipo($component_tipo),
				'section_tipo'		=> $section_tipo
			],
			// thesaurus langs (component_input_text hierarchy25, section_tipo lg-1)
			(object)[
				'component_tipo'	=> DEDALO_THESAURUS_TERM_TIPO,
				'model'				=> ontology_node::get_model_by_tipo(DEDALO_THESAURUS_TERM_TIPO,true),
				'name'				=> ontology_node::get_term_by_tipo(DEDALO_THESAURUS_TERM_TIPO),
				'section_tipo'		=> $section_tipo
			]
		];

		return $path;
	}//end get_order_path



}//end class component_relation_related
