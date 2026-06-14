<?php declare(strict_types=1);
/**
 * CLASS TS_OBJECT
 * Represents a single thesaurus tree node (term) and drives the assembly of its
 * display data for the area_thesaurus / area_ontology UI.
 *
 * Every thesaurus term is stored as a section record in the main matrix. ts_object
 * wraps a (section_tipo, section_id) pair and, guided by the ontology configuration
 * entry 'section_list_thesaurus', fetches the term string, icon flags, and
 * child-link metadata needed to render one tree node in the client.
 *
 * Responsibilities:
 * - Build the stdClass node payload returned by get_data() and consumed by
 *   dd_ts_api / area_thesaurus JS.
 * - Batch-build arrays of children data via the static parse_child_data() entry point
 *   (called by dd_ts_api::get_children_data).
 * - Resolve permissions for per-node action buttons (button_new, button_delete).
 * - Count indexation cross-references for index-icon display (get_count_data_group_by).
 * - Delegate term-string resolution to ts_term_resolver and cache invalidation after
 *   tree mutations (invalidate_node, clear).
 *
 * Data shape produced by get_data():
 * ```
 * {
 *   section_tipo, section_id, ts_id, ts_parent, order,
 *   mode, lang, is_descriptor, is_indexable,
 *   ar_elements: [ { type, tipo, value, … }, … ],
 *   children_tipo,             // set when a 'link_children' element is present
 *   has_descriptor_children,   // bool, set alongside children_tipo
 *   permissions_button_new,    // int bitmask
 *   permissions_button_delete  // int bitmask
 * }
 * ```
 *
 * Element types that can appear in ar_elements (driven by section_list_thesaurus ddo_map):
 * - 'term'              — the human-readable label string for the node
 * - 'icon'             — an icon flag (e.g. "ND", "M", "U", "CH")
 * - 'link_children'    — sentinel indicating this node may have child nodes
 * - 'link_children_nd' — synthetic element added when non-descriptor children exist
 *
 * Sample section_list_thesaurus ddo_map (ontology JSON):
 * ```json
 * [
 *   { "tipo": "actv10", "type": "term" },
 *   { "icon": "ND", "tipo": "actv9",  "type": "icon" },
 *   { "icon": "M",  "tipo": "actv6",  "type": "icon" },
 *   { "icon": "U",  "tipo": "actv25", "type": "icon" },
 *   { "icon": "CH", "tipo": "actv23", "type": "icon" },
 *   { "tipo": "actv23", "type": "link_children" }
 * ]
 * ```
 *
 * Relationships:
 * - Instantiated by dd_ts_api and area_thesaurus PHP controllers.
 * - Uses ts_node_repository for batched SQL reads (order + is_indexable + is_descriptor).
 * - Delegates term caching / eviction to ts_term_resolver.
 * - Reads ontology configuration via ontology_node and section_map.
 *
 * @package Dédalo
 * @subpackage Core
 */

// Explicit require_once for co-located helpers.
// Both files live in the same directory and are outside the one-class-per-dir
// autoload convention, so they must be loaded manually.
	// ts_node_repository — batched SQL reads for the tree hot path (order, is_indexable, is_descriptor)
	require_once DEDALO_CORE_PATH . '/ts_object/class.ts_node_repository.php';
	// ts_term_resolver — term-string resolution with a request-scope cache
	require_once DEDALO_CORE_PATH . '/ts_object/class.ts_term_resolver.php';


class ts_object {



	/**
	* CLASS VARS
	*/

		/**
		 * Section record identifier of this thesaurus term. Required; set in __construct.
		 * @var string|int|null $section_id
		 */
		public string|int|null $section_id = null;

		/**
		 * Ontology tipo that identifies the section type (hierarchy) this term belongs to.
		 * Determines which section_list_thesaurus ddo_map is used. Required; set in __construct.
		 * @var ?string $section_tipo
		 */
		public ?string $section_tipo = null;

		/**
		 * Caller-supplied configuration bag. Optional.
		 * May carry: order (display sort key), is_indexable (bool, pre-fetched),
		 * model (bool, ontology-mode flag), have_children (bool override),
		 * area_model (string, 'area_thesaurus'|'area_ontology').
		 * @var ?object $options
		 */
		protected ?object $options = null;

		/**
		 * Rendering mode passed down from the calling area. Defaults to 'edit'.
		 * Not currently forwarded to child components (components are always
		 * instantiated in 'list_thesaurus' mode).
		 * @var ?string $mode
		 */
		protected ?string $mode = null;

		/**
		 * Numeric or string display position of this term among its siblings.
		 * Populated from $options->order in __construct; may be null when the
		 * section has no order component.
		 * @var string|int|float|null $order
		 */
		public string|int|float|null $order = null;

		/**
		 * Rendered element list for this node. Populated by get_data(); null before that call.
		 * Each entry is a stdClass with at minimum: type (string), tipo (string|array), value (mixed).
		 * @var ?array $ar_elements
		 */
		public ?array $ar_elements = null;

		/**
		 * Composite identifier for this node: "{section_tipo}_{section_id}" (e.g. "actv1_42").
		 * Set in __construct; used as the stable key in the client tree.
		 * @var ?string $ts_id
		 */
		public ?string $ts_id = null;

		/**
		 * ts_id of the parent node ("{section_tipo}_{section_id}"), or null for root nodes.
		 * Passed in from the caller so the client can reconstruct the ancestry chain.
		 * @var ?string $ts_parent
		 */
		public ?string $ts_parent = null;

		/**
		 * Request-scope cache for recursively resolved child locator sets.
		 * Key: md5 of the JSON-encoded SQO that produced the child list.
		 * Value: raw pg_fetch_all() result array.
		 * Bounded to 1 000 entries; cleared wholesale on overflow and by clear().
		 * @var array $resolved_child_cache
		 */
		public static array $resolved_child_cache = [];



	/**
	* __CONSTRUCT
	* Initialises a thesaurus node wrapper for a given (section_tipo, section_id) pair.
	*
	* Does not load any data from the DB; all fetching is deferred to get_data().
	* $options is stored verbatim — it is the caller's responsibility to clone it when
	* the same options object is shared across multiple ts_object instances (parse_child_data
	* already handles this via clone).
	*
	* @param int|string $section_id    - Matrix record identifier of the thesaurus term
	* @param string $section_tipo      - Ontology tipo of the section (determines the ddo_map)
	* @param ?object $options = null   - Optional config bag (order, is_indexable, model, etc.)
	* @param string $mode = 'edit'     - Rendering mode forwarded from the calling area
	* @param ?string $ts_parent = null - ts_id of the parent node; null for root-level terms
	*/
	public function __construct( int|string $section_id, string $section_tipo, ?object $options=null, string $mode='edit', ?string $ts_parent=null ) {

		$this->section_id   = $section_id;
		$this->section_tipo = $section_tipo;

		// set thesaurus id
		$this->ts_id = $section_tipo.'_'.$section_id;

		// set thesaurus parent (link with parent node id)
		$this->ts_parent = $ts_parent;

		# Build and set current section obj
		// $this->section = section::get_instance( $section_id, $section_tipo );

		# Fix options
		$this->options = $options;

		# Fix mode
		$this->mode = $mode;

		# Set default order
		$this->order = $options->order ?? null;
	}//end __construct



	/**
	* GET_AR_ELEMENTS
	* Reads the section_list_thesaurus ontology node for $section_tipo and returns
	* the ddo_map array that describes which components to render for each tree node.
	*
	* Resolution order:
	* 1. Look for a child of $section_tipo with model 'section_list_thesaurus'.
	* 2. If not found (virtual section), fall back to the real (non-virtual) section tipo.
	* 3. Extract properties->show->ddo_map from the resolved ontology node.
	*
	* $model controls whether the result is for a live term display or for an ontology
	* model-builder display:
	* - $model === false (default): 'link_children_model' entries are skipped.
	* - $model === true: 'link_children' entries for the hierarchy/ontology root are
	*   skipped, and 'link_children_model' entries are promoted to 'link_children'.
	*
	* @param string $section_tipo - Section tipo whose ddo_map is requested
	* @param ?bool $model = false - Whether to return the model variant of the map
	* @return array $ar_elements  - Ordered array of ddo_map entry objects; empty when
	*                               section_list_thesaurus is not configured
	*/
	public static function get_ar_elements( string $section_tipo, ?bool $model=false ) : array {

		$ar_elements = [];

		// Elements are stored in current section > section_list_thesaurus
		// Search element in current section
			$ar_model_name_required = array('section_list_thesaurus');

		// Search in current section
			$ar_children = section::get_ar_children_tipo_by_model_name_in_section(
				$section_tipo, // tipo
				$ar_model_name_required, // ar_modelo_name_required
				true, // from_cache
				false, // resolve_virtual
				false, // recursive
				true // search_exact
			);
			// relation map defined in properties
			$children_tipo	= $ar_children[0] ?? null;
			$properties		= null;
			if ($children_tipo) {
				$ontology_node	= ontology_node::get_instance($ar_children[0]);
				$properties		= $ontology_node->get_properties();
			}

			// Fallback to real section when in virtual
			// Virtual sections inherit the ddo_map of their real counterpart.
			if ( empty($properties) ) {
				$section_real_tipo = section::get_section_real_tipo_static($section_tipo);
				if ($section_tipo!==$section_real_tipo) {
					$ar_children  = section::get_ar_children_tipo_by_model_name_in_section(
						$section_real_tipo,
						$ar_model_name_required,
						true, // from_cache
						false, // resolve_virtual
						false, // recursive
						true // search_exact
					);
					// relation map defined in properties
					if (isset($ar_children[0])) {
						$ontology_node	= ontology_node::get_instance($ar_children[0]);
						$properties		= $ontology_node->get_properties();
					}
				}
			}//end if (empty($properties))

		// If element exists (section_list_thesaurus) we get element 'properties' JSON value as array
			if ( isset($properties->show) && isset($properties->show->ddo_map) ) {

				$ddo_map = $properties->show->ddo_map;
				foreach ($ddo_map as $current_ddo) {

					$type = $current_ddo->type ?? null;

					// link children exception
					// 'link_children_model' is an ontology-builder variant of 'link_children';
					// in normal ($model===false) display it must be suppressed entirely.
					// In model mode, the hierarchy/ontology roots never have expandable children
					// (they are structural containers), so 'link_children' is skipped there.
						if ($model===false && $type==='link_children_model') {
							continue;
						}else if ($model===true) {
							if ( $type==='link_children' && ($section_tipo===DEDALO_HIERARCHY_SECTION_TIPO || $section_tipo===DEDALO_ONTOLOGY_SECTION_TIPO) ) {
								// unset($properties[$key]);
								continue;
							}else if ( $type==='link_children_model' ) {
								$current_ddo->type = 'link_children';
							}
						}
					// add
					$ar_elements[] = $current_ddo;
				}//end foreach ($properties as $key => $value_obj)
			}


		return $ar_elements;
	}//end get_ar_elements



	/**
	* PARSE_CHILD_DATA
	* Converts an array of child locators into an array of ts_object data objects,
	* ready to be sent to the client as the children of a tree node.
	*
	* Called by get_children_data() (which is itself called by dd_ts_api) after
	* component_relation_children supplies the raw locator list.
	*
	* Performance strategy:
	* - Resolves the order component tipo once from the first locator's section_tipo
	*   (assumes homogeneous children — all locators share the same section_tipo).
	* - Calls ts_node_repository::fetch_node_info() to pre-fetch order and is_indexable
	*   for all locators in a single SQL query per section_tipo group.
	* - Falls back to per-child component_common::get_instance() when the batch fails.
	*
	* Each locator must be an object with at least section_tipo and section_id. Invalid
	* or unresolvable locators are logged and skipped.
	*
	* @param array $locators           - Child locator objects (section_tipo + section_id required)
	* @param string $area_model = 'area_thesaurus'
	*                                  - Area context; currently unused, reserved for routing
	* @param ?object $ts_object_options = null
	*                                  - Config bag forwarded to each ts_object; cloned per child
	*                                    to prevent cross-child mutation
	* @return array $child_data        - Array of stdClass objects as returned by ts_object::get_data()
	*/
	public static function parse_child_data( array $locators, string $area_model='area_thesaurus', ?object $ts_object_options=null ) : array {

		$children_data = [];

		$first_locator = $locators[0] ?? null;
		if (empty($first_locator)) {
			return $children_data;
		}

		// Validate first locator has required properties
		if (!isset($first_locator->section_tipo)) {
			debug_log(__METHOD__
				. " Invalid first locator: missing section_tipo property" . PHP_EOL
				. ' locator: ' . to_string($first_locator)
				, logger::ERROR
			);
			return $children_data;
		}

		// Get component order.
		// To prevent calculate the component order for each locator,
		// we assume that all locators are from the same section or compatible sections
		$component_order_tipo = ts_object::get_component_order_tipo($first_locator->section_tipo);

		// Validate component_order_tipo before using it
		if (empty($component_order_tipo)) {
			debug_log(__METHOD__
				. " Unable to get component_order_tipo for section: {$first_locator->section_tipo}" . PHP_EOL
				. ' Skipping order assignment for all locators'
				, logger::WARNING
			);
			// Continue without order - set to null for all items
			$component_order_model = null;
		} else {
			$component_order_model = ontology_node::get_model_by_tipo($component_order_tipo);
		}

		// Prefetch. Batched order + is_indexable resolution for all locators
		// (one query per section_tipo group) replacing the per-child component
		// instantiations below. On failure (null) the legacy path runs unchanged.
		$prefetched_info = ts_node_repository::fetch_node_info($locators);

		foreach ($locators as $key => $locator) {

			// Validate locator has required properties
			if (!isset($locator->section_id) || !isset($locator->section_tipo)) {
				debug_log(__METHOD__
					. " Invalid locator at index $key: missing required properties" . PHP_EOL
					. ' locator: ' . to_string($locator)
					, logger::ERROR
				);
				continue;
			}

			$section_id   = $locator->section_id;
			$section_tipo = $locator->section_tipo;

			// Clone ts_object_options to avoid mutating the original object
			$ts_options = empty($ts_object_options)
				? new stdClass()
				: clone $ts_object_options;

			// Do not set order here because could overwrite the custom order !
			// set order of locator in the ts_options
			// $ts_options->order = $key+1;

			// prefetched node info (order + is_indexable from one batched query)
			$node_info = $prefetched_info[$section_tipo . '_' . (int)$section_id] ?? null;

			// Set order from component number value
			if ($node_info!==null) {
				$ts_options->order = !empty($component_order_tipo)
					? $node_info->order
					: null;
				$ts_options->is_indexable = $node_info->is_indexable;
			} else if (!empty($component_order_model) && !empty($component_order_tipo)) {
				// legacy fallback: per-child order component load
				$component = component_common::get_instance(
					$component_order_model,
					$component_order_tipo,
					$locator->section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$locator->section_tipo
				);
				$data = $component->get_data() ?? [];
				$order = $data[0]->value ?? null;
				$ts_options->order = $order;
			} else {
				// No order component available
				$ts_options->order = null;
			}

			// Create ts_object
			$ts_object    = new ts_object( $section_id, $section_tipo, $ts_options );
			$child_object = $ts_object->get_data();

			if (empty($child_object->ar_elements)) {
				$tld = get_tld_from_tipo($locator->section_tipo);
				debug_log(__METHOD__
					. " Empty ar_elements child. Maybe this tld ($tld) is not installed " . PHP_EOL
					. ' locator: ' . to_string($locator)
					, logger::ERROR
				);
			}

			$children_data[] = $child_object;
		}


		return $children_data;
	}//end parse_child_data



	/**
	 * GET_DATA
	 * Builds and returns the complete data payload for this thesaurus node.
	 *
	 * Reads the section_list_thesaurus ddo_map for this node's section_tipo, then
	 * iterates over each element entry, delegating per-element processing to
	 * process_element_details(). The resulting ar_elements array is what the
	 * area_thesaurus JS renders as a tree row.
	 *
	 * Side effects:
	 * - Resolves and attaches is_indexable from the pre-fetched options bag when
	 *   available, otherwise falls back to a live is_indexable() call.
	 * - Resolves button_new / button_delete permissions via get_permissions_element().
	 * - Populates $data->children_tipo and $data->has_descriptor_children when a
	 *   'link_children' element is present in the ddo_map.
	 * - May add a synthetic 'link_children_nd' element when non-descriptor children exist.
	 *
	 * @return object $child_data - stdClass with the full node payload (see class doc-block
	 *                              for the complete property list)
	 */
	public function get_data() : object {

		// Is index-able check. Prefetched (batched) by parse_child_data when
		// available; resolved per node otherwise.
		$is_indexable = isset($this->options->is_indexable)
			? (bool)$this->options->is_indexable
			: self::is_indexable($this->section_tipo, $this->section_id);

		// Permissions calculation
		$permissions_button_new		= $this->get_permissions_element('button_new');
		$permissions_button_delete	= $this->get_permissions_element('button_delete');

		// Global object
		$data = new stdClass();
			$data->section_tipo					= $this->section_tipo;
			$data->section_id					= $this->section_id;
			$data->ts_id						= $this->ts_id;
			$data->ts_parent					= $this->ts_parent;
			$data->order						= $this->order;
			$data->mode							= 'list';
			$data->lang							= DEDALO_DATA_LANG;
			$data->is_descriptor				= true;
			$data->is_indexable					= $is_indexable;
			$data->ar_elements					= [];
			$data->permissions_button_new		= $permissions_button_new;
			$data->permissions_button_delete	= $permissions_button_delete;

		// model boolean
		$model = $this->options->model ?? null;

		// Get elements configuration
		$ar_elements = ts_object::get_ar_elements($this->section_tipo, $model);

		foreach ($ar_elements as $current_object) {

			// Validate and resolve current element tipo
			$current_element_tipo = $current_object->tipo ?? null;
			if (empty($current_element_tipo)) {
				debug_log(__METHOD__
					." Warning. Ignored bad formed empty element_tipo in current_object" . PHP_EOL
					.' current_element_tipo:'. to_string($current_element_tipo) . PHP_EOL
					.' current_object:'. to_string($current_object)
					, logger::WARNING
				);
				continue;
			}

			// No descriptors do not have children config
			if ($data->is_descriptor===false && $current_object->type==='link_children') {
				$data->children_tipo = null;
				continue;
			}

			// normalize to array
			$ar_element_tipo = is_array($current_element_tipo)
				? $current_element_tipo
				: [$current_element_tipo];

			// Initialize element object
			$element_obj = new stdClass();
			$element_obj->type	= $current_object->type;
			$element_obj->tipo	= $current_element_tipo;

			// Process details
			$is_valid_element = $this->process_element_details($current_object, $ar_element_tipo, $element_obj, $data);

			if ($is_valid_element) {
				$data->ar_elements[] = $element_obj;
			}
		}// end foreach $ar_elements

		return $data;
	}//end get_data



	/**
	* GET_CHILDREN_DATA
	* Loads, paginates, and formats the direct children of the current node,
	* returning a structured response consumed by dd_ts_api.
	*
	* Workflow:
	* 1. Instantiates the component_relation_children component identified by
	*    $options->children_tipo (the tipo from the 'link_children' ddo_map entry).
	* 2. Determines or computes the total child count; uses a lightweight SQL COUNT
	*    (component_relation_children::count_children) before falling back to a full load.
	* 3. Applies pagination: fetches all children when total <= limit, otherwise calls
	*    get_data_paginated() for the requested slice.
	* 4. Calls ts_object::parse_child_data() to build the node-data array.
	*
	* (!) $options->children_tipo MUST belong to a component with model
	*     'component_relation_children'; an incorrect model causes an early error return.
	*
	* @param object $options - Required keys:
	*   - children_tipo (string)        — tipo of the component_relation_children
	*   - default_limit (int)           — page size when caller supplies no pagination
	*   - area_model (string)           — forwarded to parse_child_data
	*   - ts_object_options (?object)   — forwarded to parse_child_data
	*   - pagination (?object)          — {limit, offset[, total]}; null uses default_limit
	* @return object $response - stdClass with:
	*   - result (object|false): { ar_children_data: array, pagination: object }
	*   - msg (string)
	*   - errors (array)
	*/
	public function get_children_data( object $options ) : object {

		// options
			$children_tipo		= $options->children_tipo;
			$default_limit		= $options->default_limit;
			$area_model			= $options->area_model;
			$ts_object_options	= $options->ts_object_options;
			$pagination			= $options->pagination;

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// Calculate children from parent
			$model = ontology_node::get_model_by_tipo($children_tipo,true);
			if ($model!=='component_relation_children') {
				$response->errors[] = 'Wrong model';
				$response->msg .= ' Expected model (component_relation_children) but calculated: ' . $model;
				return $response;
			}

		// component_relation_children
			$component_relation_children = component_common::get_instance(
				$model,
				$children_tipo,
				$this->section_id,
				'list_thesaurus',
				DEDALO_DATA_NOLAN,
				$this->section_tipo
			);

			// Set default pagination if not defined
			$current_pagination = $pagination;
			if (empty($current_pagination)) {
				$current_pagination = (object)[
					'limit' => $default_limit,
					'offset' => 0,
				];
			}

			// Calculate total if not set. SQL count avoids loading every child
			// row just to count it (falls back to the load-and-count path).
			if (!isset($current_pagination->total)) {
				$total = component_relation_children::count_children(
					$this->section_id,
					$this->section_tipo,
					$children_tipo
				);
				if ($total===null) {
					$data = $component_relation_children->get_data();
					$total = (is_countable($data) ? count($data) : 0);
				}
				$current_pagination->total = $total;
			}
			// Fix pagination to the component (used when get_data_paginated is called from the class)
			$component_relation_children->pagination = $current_pagination;

		// Get data (paginated or full based on actual need, not just total count)
		// Note: get_data() returns null for nodes without children; normalize
		// to an empty array (parse_child_data expects an array).
			$use_pagination = $current_pagination->limit > 0 && $current_pagination->total > $current_pagination->limit;
			$children = $use_pagination
				? $component_relation_children->get_data_paginated()
				: ($component_relation_children->get_data() ?? []);

		// parse_child_data
			$ar_children_data = ts_object::parse_child_data(
				$children,
				$area_model,
				$ts_object_options
			);

		// build children_data result object
			$children_data = (object)[
				'ar_children_data'	=> $ar_children_data,
				'pagination'		=> $current_pagination
			];

		// response
			$response->result	= $children_data;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning! Request done with errors';


		return $response;
	}//end get_children_data



	/**
	 * HAS_CHILDREN_OF_TYPE
	 * Returns true if at least one locator in $ar_children matches the requested
	 * descriptor / non-descriptor classification.
	 *
	 * The 'descriptor' flag is stored in the is_descriptor relation component of each
	 * thesaurus term record. A section_id value of 1 means descriptor; 2 means
	 * non-descriptor (ND).
	 *
	 * Performance strategy (mirrors parse_child_data):
	 * - First tries ts_node_repository::batch_descriptor_flags() for a single SQL query
	 *   per section_tipo group covering all children at once.
	 * - Falls back to per-child component_common::get_instance() when the batch returns null.
	 * - A local $cache_models map avoids re-resolving model and section_map for repeated
	 *   section_tipos within the same call.
	 *
	 * Edge case: when $ar_children is empty and $type === 'descriptor', the
	 * $options->have_children override is checked. This supports nodes (e.g. persons)
	 * whose child count is injected at call time without actual child locators.
	 *
	 * @param array $ar_children - Array of locator objects (section_tipo + section_id)
	 * @param string $type       - 'descriptor' (section_id === 1) or 'nd' (section_id === 2)
	 * @return bool              - true when at least one child matches $type
	 */
	public function has_children_of_type( array $ar_children, string $type ) : bool {

		if (empty($ar_children)) {
			// options forced have_children cases (persons for example from trigger.ts_object.php)
			if ($type==='descriptor') {
				return $this->options->have_children ?? false;
			}
			return false;
		}

		$descriptor_value = ($type==='descriptor') ? 1 : 2;  # 1 for descriptors, 2 for non descriptors

		// Batched resolution: one query per section_tipo group instead of one
		// component load per child. Falls back to the legacy loop on failure.
		$batched_flags = ts_node_repository::batch_descriptor_flags($ar_children);
		if ($batched_flags!==null) {
			foreach ($ar_children as $current_locator) {
				$key = $current_locator->section_tipo . '_' . (int)$current_locator->section_id;
				if (isset($batched_flags[$key]) && $batched_flags[$key]===$descriptor_value) {
					return true;
				}
			}
			return false;
		}

		// Local cache to avoid repetitive DB/Config lookups for the same section_tipo
		$cache_models = [];

		foreach($ar_children as $current_locator) {

			$section_tipo = $current_locator->section_tipo;

			// Resolve cache
			if (!isset($cache_models[$section_tipo])) {
				$model = ontology_node::get_model_by_tipo($section_tipo, true);
				if (empty($model)) {
					// cache explicit false to avoid retry
					$cache_models[$section_tipo] = false;
					debug_log(__METHOD__ . " Ignored non resolved model for section: $section_tipo", logger::ERROR);
					continue;
				}

				$component_tipo = section_map::get_first_element_tipo($section_tipo, 'is_descriptor', 'thesaurus');
				if (empty($component_tipo)) {
					$cache_models[$section_tipo] = false;
					debug_log(__METHOD__ . " Invalid section_map for section $section_tipo", logger::ERROR);
					continue;
				}

				$model_name     = ontology_node::get_model_by_tipo($component_tipo, true);

				$cache_models[$section_tipo] = (object)[
					'component_tipo' => $component_tipo,
					'model_name'     => $model_name
				];
			}

			// Check cached value
			if ($cache_models[$section_tipo] === false) {
				continue;
			}

			$info = $cache_models[$section_tipo];

			$component = component_common::get_instance(
				$info->model_name,
				$info->component_tipo,
				$current_locator->section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$data = $component->get_data();

			// When first element is found, return true
			if (isset($data[0])
				&& isset($data[0]->section_id)
				&& (int)$data[0]->section_id == $descriptor_value) {
				return true;
			}
		}

		return false;
	}//end has_children_of_type



	/**
	* IS_INDEXABLE
	* Determines whether a specific thesaurus term record is marked as indexable.
	*
	* An "indexable" term is one that cataloguers may assign as an index entry to
	* documentary records. Non-indexable terms (categories, structural nodes, etc.)
	* exist in the hierarchy but are not selectable for indexation.
	*
	* Resolution steps:
	* 1. Immediately returns false for hierarchy/ontology root sections — they are
	*    always structural and never indexable.
	* 2. Resolves the model for $section_tipo; logs and returns false on failure
	*    (uninstalled TLD, unknown tipo).
	* 3. Reads the 'is_indexable' entry from the section_map's 'thesaurus' scope.
	*    Returns false when the entry is null or explicitly set to false.
	* 4. Instantiates the is_indexable component (a relation component) and checks
	*    whether its first locator has section_id === 1 (yes).
	*
	* Note: the batched variant of this check lives in ts_node_repository::fetch_node_info().
	* This method is the per-node fallback and is also used directly in get_data() when
	* $options->is_indexable is not pre-fetched.
	*
	* @param string $section_tipo      - Section tipo of the thesaurus term
	* @param int|string $section_id    - Record identifier of the thesaurus term
	* @return bool                     - true when the term is marked indexable
	*/
	public static function is_indexable( string $section_tipo, int|string $section_id ) : bool {

		if (strpos($section_tipo, 'hierarchy')===0 || strpos($section_tipo, 'ontology')===0) {
			// Root hierarchies are always false
			return false;
		}

		$model = ontology_node::get_model_by_tipo($section_tipo,true);
		if (empty($model)) {
			debug_log(__METHOD__
				. " Ignored non resolved model for section: $section_tipo" . PHP_EOL
				. ' Maybe is a non installed TLD : ' . get_tld_from_tipo($section_tipo)
				, logger::ERROR
			);
			return false;
		}

		$is_indexable = section_map::get_element_tipo( $section_tipo, 'is_indexable', 'thesaurus' );
		if ($is_indexable===null) {
			debug_log(__METHOD__." Invalid section_map 'is_indexable' property from section $section_tipo ".to_string(section_map::get_map($section_tipo)), logger::ERROR);
			return false;
		}

		if ($is_indexable===false) {
			// properties set as false case
			return false;
		}

		$component_tipo	= $is_indexable;
		$model_name		= ontology_node::get_model_by_tipo($component_tipo,true);
		$component		= component_common::get_instance(
			$model_name,
			$component_tipo,
			$section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$section_tipo
		);
		$data = $component->get_data();

		$indexable_value = 1; // Yes

		// When first element is found, return true
		if (isset($data[0]) && isset($data[0]->section_id) && (int)$data[0]->section_id===$indexable_value) {
			return true;
		}

		return false;
	}//end is_indexable



	/**
	* GET_DESCRIPTORS_FROM_CHILDREN
	* (!) Dead code — entire method body is commented out. Preserved for historical
	* reference; the active replacement is has_children_of_type() + ts_node_repository.
	* @return
	*/
		// public static function get_descriptors_from_children__DES( $ar_children ) {

		// 	$ar_descriptors = array();

		// 	foreach ((array)$ar_children as $key => $current_locator) {

		// 		$section_map = section::get_section_map( $current_locator->section_tipo );
		// 		#dump($section_map['thesaurus']->is_descriptor, ' $section_map ++ '.to_string($current_locator->section_tipo));

		// 		if (!isset($section_map['thesaurus']->is_descriptor)) {
		// 			debug_log(__METHOD__." Invalid section_map 'is_descriptor' property fro section $current_locator->section_tipo ".to_string($section_map), logger::ERROR);
		// 			continue;
		// 		}

		// 		$component_tipo = $section_map['thesaurus']->is_descriptor;

		// 		$model_name = ontology_node::get_model_by_tipo($component_tipo,true);
		// 		$component 	 = component_common::get_instance($model_name,
		// 													  $component_tipo,
		// 													  $current_locator->section_id,
		// 													  'list',
		// 													  DEDALO_DATA_NOLAN,
		// 													  $current_locator->section_tipo);
		// 		$dato = $component->get_dato();

		// 		if (isset($dato[0]) && isset($dato[0]->section_id) && (int)$dato[0]->section_id===1) {
		// 			$ar_descriptors[] = $current_locator;
		// 		}
		// 	}


		// 	return $ar_descriptors;
		// }//end get_descriptors_from_children



	/**
	* SET_TERM_AS_ND
	* Mutates the already-built ar_elements array to mark the term element as
	* belonging to a non-descriptor (ND) node.
	*
	* Called from resolve_element_value() when the 'ND' icon component reveals that
	* this term's is_descriptor component has section_id === 2. The method finds the
	* first element of type 'term' and (currently) leaves its value unchanged — the
	* commented-out wrapping in a <span class="no_descriptor"> was the original intent
	* but was deferred; the break still stops further processing to avoid touching
	* unrelated elements.
	*
	* (!) Passes $ar_elements by reference and also returns it — callers may use either
	*     form, but the in-place mutation is the operative effect.
	*
	* @param array &$ar_elements - The node's ar_elements array; mutated in place
	* @return array $ar_elements - The same array (reference return for chaining)
	*/
	public static function set_term_as_nd( array &$ar_elements ) : array {

		foreach ($ar_elements as $key => $obj_value) {

			if ($obj_value->type==='term') {

				if (!is_string($obj_value->value)) {
					debug_log(__METHOD__
						."  ".'$obj_value->value ++ EXPECTED STRING. But received type: '.gettype($obj_value->value) . PHP_EOL
						.' obj_value->value type: ' . gettype($obj_value->value) . PHP_EOL
						.' obj_value->value: ' . to_string($obj_value->value)
						, logger::ERROR
					);
				}

				// $ar_elements[$key]->value = $obj_value->value; //'<span class="no_descriptor">' .  . '</span>';
				break;
			}
		}

		return $ar_elements;
	}//end set_term_as_nd



	/**
	* GET_TERM_DATA_BY_LOCATOR
	* Returns the raw component data array (merged across all 'term' tipos of the
	* section_map 'thesaurus' scope) for the term identified by $locator.
	*
	* Thin static delegate to ts_term_resolver::get_term_data_by_locator(). Kept
	* on ts_object because diffusion, export, and portal code targets this class
	* directly; the resolution logic lives entirely in ts_term_resolver.
	*
	* @param object $locator      - Locator object with section_tipo and section_id
	* @return array|null $final_value - Merged data items or null on failure
	*/
	public static function get_term_data_by_locator( object $locator ) : ?array {

		return ts_term_resolver::get_term_data_by_locator($locator);
	}//end get_term_data_by_locator



	/**
	 * GET_TERM_BY_LOCATOR
	 * Returns the display string for the term identified by $locator, in $lang,
	 * with optional request-scope caching.
	 *
	 * Thin static delegate to ts_term_resolver::get_term_by_locator(). Kept on
	 * ts_object because diffusion, export, and portal code targets this class.
	 * Passes the $scope parameter at its default ('thesaurus') so callers that
	 * rely on ts_object do not need to know about scope resolution.
	 *
	 * @param object $locator         - Locator with section_tipo and section_id
	 * @param string $lang = DEDALO_DATA_LANG - Language code for the term lookup
	 * @param bool $from_cache = false - When true, check $term_by_locator_data_cache
	 *                                   before loading the component
	 * @return string|null            - Resolved term string, or null on failure
	 */
	public static function get_term_by_locator( object $locator, string $lang=DEDALO_DATA_LANG, bool $from_cache=false ) : ?string {

		return ts_term_resolver::get_term_by_locator($locator, $lang, $from_cache);
	}//end get_term_by_locator



	/**
	* INVALIDATE_NODE
	* Targeted cache eviction after a tree mutation (add_child, move, reorder).
	*
	* Evicts the affected node's term strings from ts_term_resolver's cache (all langs,
	* all scopes) and purges the entire $resolved_child_cache. The child cache is keyed
	* by SQO hash, not by node identity, so a node mutation invalidates an unknown set
	* of child lists — a full purge is simpler and cheap to rebuild on the next request.
	*
	* Called by the ts_tree add/move/reorder operations after a successful DB write.
	*
	* @param string $section_tipo   - Section tipo of the mutated node
	* @param int|string $section_id - Record ID of the mutated node
	* @return void
	*/
	public static function invalidate_node( string $section_tipo, int|string $section_id ) : void {

		ts_term_resolver::invalidate_node($section_tipo, $section_id);
		self::$resolved_child_cache = [];
	}//end invalidate_node



	/**
	* CLEAR
	* Full static cache reset for all ts_object request-scope caches.
	*
	* Resets both ts_term_resolver::$term_by_locator_data_cache and the local
	* $resolved_child_cache. Registered in the RoadRunner worker cache_manager so
	* that persistent workers never serve data cached in a previous HTTP request.
	*
	* @return void
	*/
	public static function clear() : void {

		ts_term_resolver::clear();
		self::$resolved_child_cache = [];
	}//end clear



	/**
	* RESOLVE_LOCATOR
	* Instance-method alias of the static get_term_by_locator().
	* Provided for callers that hold a ts_object instance and prefer instance-method
	* call syntax over the static form.
	*
	* @param object $locator         - Locator with section_tipo and section_id
	* @param string $lang = DEDALO_DATA_LANG - Language code
	* @param bool $from_cache = false - Pass true to use the request-scope term cache
	* @return string|null            - Resolved term string or null on failure
	*/
	public function resolve_locator( object $locator, string $lang=DEDALO_DATA_LANG, bool $from_cache=false ) : ?string {
		return ts_object::get_term_by_locator($locator, $lang, $from_cache);
	}//end resolve_locator



	/**
	* GET_COMPONENT_ORDER_TIPO
	* Returns the ontology tipo of the 'order' component for the given section.
	*
	* The order component (typically a component_number) stores the display sort
	* position of a term within its parent. Its tipo is read from the section_map
	* 'thesaurus' scope under the 'order' key.
	*
	* This is an alias of hierarchy::get_element_tipo_from_section_map() kept on
	* ts_object so parse_child_data can call it without depending on hierarchy directly.
	* Returns null when no order component is configured for the section.
	*
	* @param string $section_tipo - Section tipo to inspect
	* @return string|null $element_tipo - Tipo of the order component, or null
	*/
	public static function get_component_order_tipo( string $section_tipo ) : ?string {

		// Calculated way
		$element_tipo = hierarchy::get_element_tipo_from_section_map( $section_tipo, 'order', 'thesaurus' );


		return $element_tipo;
	}//end get_component_order_tipo



	/**
	* GET_PERMISSIONS_ELEMENT
	* Resolves the permission bitmask for a named UI control on this thesaurus node.
	*
	* The root hierarchy (DEDALO_HIERARCHY_SECTION_TIPO) and thesaurus root
	* (DEDALO_THESAURUS_SECTION_TIPO) have hardcoded tipo constants for their
	* standard buttons; all other sections resolve the button tipo dynamically from
	* the section's child components via a closure.
	*
	* Known element names and their handling:
	* - 'button_new'    — hierarchy: uses DEDALO_HIERARCHY_BUTTON_NEW_TIPO;
	*                     thesaurus: uses DEDALO_THESAURUS_BUTTON_NEW_TIPO;
	*                     other: resolved non-recursively from section children.
	* - 'button_delete' — hierarchy: always 0 (deletion of hierarchy roots is disallowed);
	*                     thesaurus: uses DEDALO_THESAURUS_BUTTON_DELETE_TIPO;
	*                     other: resolved non-recursively from section children.
	* - any other       — resolved recursively from section children.
	*
	* @param string $element_name - UI control name (e.g. 'button_new', 'button_delete')
	* @return int $permissions    - Permission bitmask (0 = no access)
	*/
	public function get_permissions_element( string $element_name ) : int {

		$permissions = 0;

		// Helper closure for repeated logic
		$get_child_permissions = function (string $element_name, bool $recursive = false): int {
			$ar_children = section::get_ar_children_tipo_by_model_name_in_section(
				$this->section_tipo,
				[$element_name],
				true,  // from_cache
				true,  // resolve_virtual
				$recursive,
				true,   // search_exact
				[] // ar_tipo_exclude_elements
			);

			if (!empty($ar_children[0])) {
				return common::get_permissions($this->section_tipo, $ar_children[0]);
			}

			// debug_log(__METHOD__ . " WARNING: Element not defined: $element_name", logger::DEBUG);
			return 0;
		};

		switch ($element_name) {
			case 'button_new':
				if ($this->section_tipo === DEDALO_HIERARCHY_SECTION_TIPO) {
					$tipo = DEDALO_HIERARCHY_BUTTON_NEW_TIPO;
					$permissions = common::get_permissions($this->section_tipo, $tipo);
				} elseif ($this->section_tipo === DEDALO_THESAURUS_SECTION_TIPO) {
					$tipo = DEDALO_THESAURUS_BUTTON_NEW_TIPO;
					$permissions = common::get_permissions($this->section_tipo, $tipo);
				} else {
					$permissions = $get_child_permissions($element_name, false);
				}
				break;

			case 'button_delete':
				if ($this->section_tipo === DEDALO_HIERARCHY_SECTION_TIPO) {
					$permissions = 0; // Always 0 for hierarchy
				} elseif ($this->section_tipo === DEDALO_THESAURUS_SECTION_TIPO) {
					$tipo = DEDALO_THESAURUS_BUTTON_DELETE_TIPO;
					$permissions = common::get_permissions($this->section_tipo, $tipo);
				} else {
					$permissions = $get_child_permissions($element_name, false);
				}
				break;

			default:
				$permissions = $get_child_permissions($element_name, true);
				break;
		}


		return (int)$permissions;
	}//end get_permissions_element



	/**
	* GET_COUNT_DATA_GROUP_BY
	* Returns a grouped count of indexation cross-references for this node's icon display.
	*
	* When a section_list_thesaurus entry is an 'icon' of type component_relation_index and
	* includes a 'show_data' key, the icon must display the total number of documentary
	* records that reference this term (or any of its descendant terms). This method
	* computes that count.
	*
	* When 'show_data' is present:
	* - Builds a search_query_object (SQO) anchored to this node and its recursive children.
	* - Caches the raw child result set by SQO hash (up to 1 000 entries) to avoid
	*   repeated DB queries when multiple icons request the same subtree.
	* - Wraps each matched record in a locator filtered by the component's relation_type,
	*   then delegates counting to component->count_data_group_by().
	*
	* When 'show_data' is absent, delegates directly to component->count_data_group_by()
	* with no filter (counts all direct indexation references).
	*
	* The result shape mirrors component_relation_index::count_data_group_by():
	* ```
	* {
	*   total: int,
	*   totals_group: [ { key: string, label: string, count: int }, … ]
	* }
	* ```
	*
	* @param object $component                  - Instantiated component_relation_index
	* @param object $section_list_thesaurus_item - The ddo_map entry driving this icon, e.g.:
	*   { "icon": "TCHI", "tipo": "tchi59", "type": "icon", "show_data": "children" }
	* @return object $count_data_group_by       - Aggregated count result
	*/
	public function get_count_data_group_by( object $component, object $section_list_thesaurus_item ) : object {

		// cache


		// filter_locators
		// get all children of the current term to be used to count the indexations of the term
		// Used to get all callers of a term and its children together.
		// In TCHI, show all objects(TCH) related to all statigraphic units (children of the current sector) into the sector (current term).
		// see `hierarchy44`
			if (isset($section_list_thesaurus_item->show_data)) {

				// filter_by_locator
					$filter_by_locator = new locator();
						$filter_by_locator->set_section_tipo($this->section_tipo);
						$filter_by_locator->set_section_id($this->section_id);

				// sqo
					$sqo = new search_query_object();
						$sqo->set_section_tipo([$this->section_tipo]);
						$sqo->set_limit(0);
						$sqo->set_offset(0);
						$sqo->set_filter_by_locators([$filter_by_locator]);
						$sqo->set_children_recursive(true);

				// search
					// This search is for resolve children recursively
					// Store same sqo search to prevent duplicate queries
					$hash = md5(json_encode($sqo));
					if (isset(self::$resolved_child_cache[$hash])) {
						// return from cache
						$ar_records = self::$resolved_child_cache[$hash];
					}else{
						$search = search::get_instance(
							$sqo // object sqo
						);
						$db_result	= $search->search();
						$ar_records	= $db_result->fetch_all();
						// cache
						if (count(self::$resolved_child_cache) >= 1000) {
							self::$resolved_child_cache = [];
						}
						self::$resolved_child_cache[$hash] = $ar_records;
					}

				// relation_type is used to filter in relations
				$relation_type = $component->get_relation_type();

				$filter_locators = [];
				foreach ($ar_records as $current_row) {

					// filter_locator
					$filter_locator = new locator();
						$filter_locator->set_type( $relation_type ); // as dd96
						$filter_locator->set_section_tipo($current_row->section_tipo);
						$filter_locator->set_section_id($current_row->section_id);

					$filter_locators[] = $filter_locator;
				}
			}//end if (isset($section_list_thesaurus_item->show_data))

		// count_data_group_by. Get the total sections that are calling and the totals of every specific section
			$count_data_group_by = $component->count_data_group_by(
				['section_tipo'],
				$filter_locators ?? null
			);


		return $count_data_group_by;
	}//end get_count_data_group_by



	/**
	* IS_ONTOLOGY
	* Returns true when this node is being rendered in the area_ontology context.
	*
	* The rendering area is set in $options->area_model at construct time by the
	* calling controller (dd_ts_api). The distinction matters for certain display
	* rules (e.g. 'link_children' suppression for root sections in get_ar_elements).
	*
	* @return bool - true when options->area_model === 'area_ontology'
	*/
	public function is_ontology() : bool {
		$area_model = $this->options->area_model ?? null;

		return $area_model==='area_ontology';
	}//end is_ontology



	/**
	 * PROCESS_ELEMENT_DETAILS
	 * Resolves component data for a single ddo_map entry and populates $element_obj.
	 *
	 * Called once per ddo_map entry by get_data(). $ar_element_tipo is normalised to an
	 * array upstream so that composite tipos (arrays in the ddo_map) are handled uniformly.
	 * For each tipo in the array the method:
	 * 1. Validates the model (returns false for 'box elements' or unresolvable types).
	 * 2. Checks for a legacy component_relation_struct model (skipped; that model was
	 *    replaced by component_relation_index).
	 * 3. Instantiates the component via load_component_instance().
	 * 4. Fetches and formats component data via format_component_data().
	 * 5. Assigns the element's value and side-effects via resolve_element_value().
	 * 6. Captures model_value for 'M' (model) icon elements.
	 * 7. Attaches show_data when present in the ddo_map entry.
	 *
	 * Returns false to signal that the calling get_data() loop must skip (not add) this
	 * element_obj — used when the element has no data, is an excluded icon type, or an
	 * invalid model is detected.
	 *
	 * @param object $current_object  - The ddo_map entry object (type, tipo, icon?, show_data?)
	 * @param array $ar_element_tipo  - Normalised array of tipo strings from $current_object
	 * @param object $element_obj     - Output element being assembled (mutated by reference)
	 * @param object $data            - The node's main data object; mutated for side effects
	 *                                  (children_tipo, is_descriptor, ar_elements extras)
	 * @return bool                   - true when $element_obj is ready to add; false to skip it
	 */
	protected function process_element_details(object $current_object, array $ar_element_tipo, object $element_obj, object $data) : bool {

		foreach ($ar_element_tipo as $element_tipo) {

			$model_name = ontology_node::get_model_by_tipo($element_tipo, true);

			// Check validity of model
			if (empty($model_name) || $model_name === 'box elements') {
				return false;
			}
			// Special legacy check for component_relation_struct
			if ($model_name === 'component_relation_index') {
				$legacy_model = ontology_node::get_legacy_model_by_tipo($element_tipo);
				if ($legacy_model === 'component_relation_struct') {
					return false;
				}
			}

			// Load component instance
			$component = $this->load_component_instance($model_name, $element_tipo);

			// Retrieve component data
			$component_data = $model_name !== 'component_relation_index'
				? ($component->get_data_lang() ?? [])
				: [];

			// Format component data based on specific rules
			$component_data = $this->format_component_data($model_name, $element_tipo, $component, $component_data);

			// Process the value and update element_obj or data
			$processing_success = $this->resolve_element_value(
				$current_object,
				$element_obj,
				$element_tipo,
				$model_name,
				$component,
				$component_data,
				$data
			);

			// if false, it means we should abort adding this element_obj (equivalent to continue 3 in original loop)
			if ($processing_success === false) {
				return false;
			}

			// Capture ontology model value if applicable
			if (isset($element_obj->value) && $element_obj->value === 'M') {
				$element_obj->model_value = $component->get_value();
			}

			// Set model if not already set
			if (!isset($element_obj->model)) {
				$element_obj->model = $model_name;
			}

			// Set data_type if configured
			if (isset($current_object->show_data)) {
				$element_obj->show_data = $current_object->show_data;
			}

		} // end foreach

		return true;
	}

	/**
	 * LOAD_COMPONENT_INSTANCE
	 * Instantiates a component for the given tipo relative to this node's section.
	 *
	 * Always uses mode 'list_thesaurus' regardless of $this->mode, because thesaurus
	 * node rendering always reads the same language-aware list format.
	 * The language is resolved via common::get_element_lang() to respect per-elemento
	 * language overrides (e.g. monolingual components).
	 *
	 * @param string $model_name  - Component model class name (e.g. 'component_input_text')
	 * @param string $element_tipo - Ontology tipo of the component to instantiate
	 * @return component_common   - Instantiated component
	 */
	protected function load_component_instance(string $model_name, string $element_tipo) : component_common {
		$lang = common::get_element_lang($element_tipo, DEDALO_DATA_LANG);
		return component_common::get_instance(
			$model_name,
			$element_tipo,
			$this->section_id,
			'list_thesaurus',
			$lang,
			$this->section_tipo
		);
	}

	/**
	 * FORMAT_COMPONENT_DATA
	 * Applies model-specific post-processing to raw component data before value assignment.
	 *
	 * Switch cases by model/tipo combination:
	 * - hierarchy portals: data passed through unchanged (portal data is not term-resolved).
	 * - component_autocomplete_hi / component_portal: each locator in the data array is
	 *   resolved to a term string via get_term_by_locator() with cache enabled.
	 * - component_relation_related: merges inverse (bidirectional) related references into
	 *   the data array (only when the relation type is not unidirectional).
	 * - component_svg: replaces the data array with a URL string (with cache-bust query)
	 *   or an empty string when the file does not exist on disk.
	 * - all others: data is returned unmodified.
	 *
	 * @param string $model_name          - Model class name of the component
	 * @param string $element_tipo        - Ontology tipo of the component
	 * @param component_common $component - The already-instantiated component
	 * @param mixed $component_data       - Raw data as returned by get_data_lang() or []
	 * @return mixed $component_data      - Post-processed data, ready for resolve_element_value()
	 */
	protected function format_component_data(string $model_name, string $element_tipo, component_common $component, mixed $component_data): mixed {

		switch (true) {
			case (in_array($element_tipo, hierarchy::$hierarchy_portals_tipo)):
				// Do not change main hierarchy portals data
				break;

			case ($model_name === 'component_autocomplete_hi' || $model_name === 'component_portal'):
				if (!empty($component_data)) {
					$values = [];
					foreach ($component_data as $current_locator) {
						$values[] = ts_object::get_term_by_locator(
							$current_locator,
							DEDALO_DATA_LANG,
							true
						);
					}
					$component_data = $values;
				}
				break;

			case ($model_name === 'component_relation_related'):
				// Add inverse related (bidirectional only)
				$type_rel = $component->get_type_rel();
				if ($type_rel !== DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO) {
					$component_rel = $component->get_references();
					$component_data = [...$component_data, ...$component_rel];
				}
				break;

			case ($model_name === 'component_svg'):
				// file exists check
				$file_path = $component->get_media_filepath(DEDALO_SVG_QUALITY_DEFAULT);
				$file_url = (file_exists($file_path) === true)
					? $component->get_url() . '?' . start_time()
					: '';

				$component_data = $file_url;
				break;
		}

		return $component_data;
	}

	/**
	 * RESOLVE_ELEMENT_VALUE
	 * Assigns a value to $element_obj (and triggers side effects on $data) based on
	 * the element's 'type' field. Returns false when the element should be suppressed.
	 *
	 * Type dispatch:
	 * - 'term': concatenates the (possibly multi-field) term string into element_obj->value
	 *   with a space separator; falls back to the component's lang-fallback data when the
	 *   primary language data is empty and decorates the fallback with an "untranslated" marker.
	 * - 'icon':
	 *   * 'CH' icon — always skipped (suppressed in this context).
	 *   * 'ND' icon — when the is_descriptor component shows section_id === 2, marks the
	 *     node as non-descriptor (calls set_term_as_nd, sets data->is_descriptor = false);
	 *     always returns false (the ND icon itself is not rendered as a visible element).
	 *   * component_relation_index icons — calls get_count_data_group_by(); skips when
	 *     total is 0; enriches count_result->totals_group with labels.
	 *   * other icons — skipped when component_data is empty.
	 * - 'link_children': sets data->children_tipo and data->has_descriptor_children;
	 *   appends a synthetic 'link_children_nd' element when ND children are detected.
	 * - default: assigns $component_data directly as the element value.
	 *
	 * @param object $current_object      - The ddo_map entry (type, tipo, icon?, show_data?)
	 * @param object $element_obj         - Element being assembled (mutated)
	 * @param string $element_tipo        - The specific tipo being processed
	 * @param string $model_name          - Model class name of the component
	 * @param component_common $component - The instantiated component
	 * @param mixed $component_data       - Formatted data from format_component_data()
	 * @param object $data                - Node data object; mutated for side effects
	 * @return bool                       - false signals the caller to skip this element
	 */
	protected function resolve_element_value(object $current_object, object $element_obj, string $element_tipo, string $model_name, component_common $component, mixed $component_data, object $data): bool {

		switch (true) {

			case ($element_obj->type === 'term'):
				$separator = ' ';
				// Term uses lang fallback if data is empty
				if (empty($component_data)) {
					$data_item_fallback = $component->get_component_data_fallback();
					$element_value = $data_item_fallback[0]->value ?? $data_item_fallback[0] ?? '';
					$element_value = component_common::decorate_untranslated($element_value);
				} else {
					$element_value = $component_data[0]->value ?? $component_data[0] ?? '';
				}

				// Cumulative value addition
				$element_obj->value = isset($element_obj->value)
					? to_string($element_obj->value) . $separator . to_string($element_value)
					: to_string($element_value);
				break;

			case ($element_obj->type === 'icon'):

				if ($current_object->icon === 'CH') {
					return false; // Skip element
				}

				// ND element check
				if ($current_object->icon === 'ND') {
					if (isset($component_data[0])
						&& isset($component_data[0]->section_id)
						&& (int)$component_data[0]->section_id === 2) {
						ts_object::set_term_as_nd($data->ar_elements);
						$data->is_descriptor = false;
					}
					return false; // Skip element after processing logic
				}

				// Basic icon value
				$element_obj->value = $current_object->icon;

				if ($model_name === 'component_relation_index') {
					// Count indexation
					$count_data_group_by = $this->get_count_data_group_by($component, $current_object);

					if ($count_data_group_by->total === 0) {
						return false; // Nothing to display, skip
					}

					$element_obj->value .= ':' . $count_data_group_by->total;

					// Enrich totals logic
					array_map(function($item){
						$item->label	= ontology_node::get_term_by_tipo($item->key[0]);
						$item->key		= $item->key[0];
					}, $count_data_group_by->totals_group);

					$element_obj->count_result = $count_data_group_by;

				} else {
					// Empty data check for standard icons
					if (is_empty($component_data) === true) {
						return false; // Skip empty icon value
					}
				}
				break;

			case ($element_obj->type === 'link_children'):
				$data->children_tipo = $element_tipo;

				// Has descriptor children
				$data->has_descriptor_children = empty($component_data)
					? false
					: $this->has_children_of_type($component_data, 'descriptor');

				$element_obj->value = ($data->has_descriptor_children === true)
					? 'button show children'
					: 'button show children unactive';

				// ND children check
				$has_children_of_type_result = empty($component_data)
					? false
					: $this->has_children_of_type($component_data, 'nd');

				if ($has_children_of_type_result === true) {
					$nd_element = new stdClass();
					$nd_element->type	= 'link_children_nd';
					$nd_element->tipo	= $element_tipo;
					$nd_element->value	= 'ND';

					$data->ar_elements[] = $nd_element;
				}
				break;

			default:
				$element_obj->value = $component_data;
				break;
		}

		return true;
	}


	# ACCESSORS
	# Generic dynamic getter/setter pattern used across Dédalo components.
	# Calls of the form $obj->set_foo($val) and $obj->get_foo() are intercepted
	# here and routed to SetAccessor / GetAccessor without requiring individual
	# per-property methods.

	/**
	* __CALL
	* Magic method that intercepts calls to undefined instance methods matching the
	* 'set_*' or 'get_*' naming convention and routes them to SetAccessor / GetAccessor.
	*
	* Prefix 'set_' writes the first argument to the property named by the suffix.
	* Prefix 'get_' reads and returns the property named by the suffix.
	* Any other prefix returns false.
	*
	* @param string $strFunction   - The called method name (e.g. 'set_order', 'get_mode')
	* @param array $arArguments    - Arguments passed to the dynamic call
	* @return mixed                - Property value (get), true/false (set), or false on mismatch
	*/
	final public function __call(string $strFunction, array $arArguments) {

		$strMethodType 		= substr($strFunction, 0, 4); # like set or get_
		$strMethodMember 	= substr($strFunction, 4);
		switch($strMethodType) {
			case 'set_' :
				if(!isset($arArguments[0])) return(false);
				return($this->SetAccessor($strMethodMember, $arArguments[0]));
				break;
			case 'get_' :
				return($this->GetAccessor($strMethodMember));
				break;
		}
		return(false);
	}

	/**
	* SETACCESSOR
	* Writes $strNewValue to the named property when it exists on the instance.
	* Returns false (not an exception) when the property does not exist, preserving
	* the lenient accessor contract used across the codebase.
	*
	* @param string $strMember   - Property name (without 'set_' prefix)
	* @param mixed $strNewValue  - Value to assign
	* @return bool               - true on success, false when property is not defined
	*/
	# SET
	final protected function SetAccessor(string $strMember, $strNewValue) : bool {

		if(property_exists($this, $strMember)) {

			// fix value
			$this->$strMember = $strNewValue;

			return true;
		}else{
			return false;
		}
	}

	/**
	* GETACCESSOR
	* Reads and returns the named property when it exists on the instance.
	* Returns false (not null) when the property does not exist, preserving
	* the lenient accessor contract used across the codebase.
	*
	* @param string $strMember - Property name (without 'get_' prefix)
	* @return mixed            - Property value, or false when property is not defined
	*/
	# GET
	final protected function GetAccessor(string $strMember) {

		return property_exists($this, $strMember)
			? $this->$strMember
			: false;
	}//end GetAccessor



}//end class ts_object
