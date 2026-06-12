<?php declare(strict_types=1);
/**
 * CLASS TS_OBJECT
 * Manage thesaurus hierarchical elements. Every element is a section used as thesaurus term
 *
 * This class handles the retrieval and formatting of thesaurus objects, including terms, icons,
 * and child relationships. It processes the configuration defined in the ontology (section_list_thesaurus)
 * to build the object representation.
 *
 * Example of Use:
 * ```php
 * $ts_obj = new ts_object($section_id, $section_tipo);
 * $data = $ts_obj->get_data();
 * echo $data->ar_elements[0]->value;
 * ```
 *
 * Sample of elements from Ontology 'section_list_thesaurus' properties:
 * [
 *     {
 *         "tipo": "actv10",
 *         "type": "term"
 *     },
 *     {
 *         "icon": "ND",
 *         "tipo": "actv9",
 *         "type": "icon"
 *     },
*     {
*         "icon": "M",
*         "tipo": "actv6",
*         "type": "icon"
*     },
*     {
*         "icon": "U",
*         "tipo": "actv25",
*         "type": "icon"
*     },
*     {
*         "icon": "CH",
*         "tipo": "actv23",
*         "type": "icon"
*     },
*     {
*         "tipo": "actv23",
*         "type": "link_children"
*     }
 * ]
 */

// ts_node_repository. Batched raw row access used by the tree hot path
// (lives in this directory, outside the one-class-per-dir autoload convention)
require_once DEDALO_CORE_PATH . '/ts_object/class.ts_node_repository.php';
// ts_term_resolver. Term resolution and its request-scope cache
require_once DEDALO_CORE_PATH . '/ts_object/class.ts_term_resolver.php';


class ts_object {



	/**
	* CLASS VARS
	*/

		/**
		 * Section ID of the thesaurus term record. Mandatory.
		 * Identifies the specific term within the section (thesaurus hierarchy).
		 * @var string|int|null $section_id
		 */
		public string|int|null $section_id = null;

		/**
		 * Section tipo of the thesaurus term. Mandatory.
		 * Defines which hierarchy/ontology type this term belongs to.
		 * @var ?string $section_tipo
		 */
		public ?string $section_tipo = null;

		/**
		 * Optional configuration object for this thesaurus element.
		 * Defines display options, children behavior, and rendering preferences.
		 * @var ?object $options
		 */
		protected ?object $options = null;

		/**
		 * Display mode for this thesaurus object. Default 'edit'.
		 * Controls how the term is rendered (edit, list, search, etc.).
		 * @var ?string $mode
		 */
		protected ?string $mode = null;

		/**
		 * Display order/position of this term within its parent hierarchy.
		 * Used for sorting siblings in the thesaurus tree view.
		 * @var string|int|float|null $order
		 */
		public string|int|float|null $order = null;

		/**
		 * Array of UI elements (term, icons, links) for this thesaurus object.
		 * Populated from ontology section_list_thesaurus configuration.
		 * @var ?array $ar_elements
		 */
		public ?array $ar_elements = null;

		/**
		 * Thesaurus ID combining section_tipo and section_id. Format: "dd1_1".
		 * Unique identifier for the term within the thesaurus tree structure.
		 * @var ?string $ts_id
		 */
		public ?string $ts_id = null;

		/**
		 * Parent thesaurus ID linking this term to its parent node. Format: "dd1_1".
		 * Establishes the hierarchical parent-child relationship in the tree.
		 * @var ?string $ts_parent
		 */
		public ?string $ts_parent = null;

		/**
		 * Static cache for resolved child thesaurus objects.
		 * Stores pre-computed child arrays to optimize tree traversal.
		 * @var array $resolved_child_cache
		 */
		public static array $resolved_child_cache = [];



	/**
	* __CONSTRUCT
	* @param int|string $section_id
	* @param string $section_tipo
	* @param object|null $options
	*	Default null
	* @param string $mode
	*	Default 'edit'
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
	* Get elements from section_list_thesaurus -> properties
	* @param string $section_tipo
	* @param boolean|null $model = false
	* @return array $ar_elements
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
	* Auxiliary function used in dd_ts_api
	* Iterates locators extracting the child data of each one
	* @see get_data
	* @param array $locators
	* @param string $area_model
	*   Default 'area_thesaurus' (currently unused, reserved for future functionality)
	* @param object|null $ts_object_options
	*   Optional ts_object options (will be cloned to avoid mutation)
	* @return array $child_data
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
	 * Builds and returns the data object for the thesaurus element.
	 * This method iterates through the configured elements (from ontology) and processes them.
	 *
	 * @return object $child_data
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
	*
	* @param object $options
	* @return object $response
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
	 * Checks if any of the children matching the criteria exists.
	 * Optimized with local caching for model and section map lookups.
	 *
	 * @param array $ar_children Array of locators
	 * @param string $type Criteria type ('descriptor' or 'nd')
	 * @return bool
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

				$section_map = section::get_section_map($section_tipo);
				if (empty($section_map) || !isset($section_map->thesaurus->is_descriptor)) {
					$cache_models[$section_tipo] = false;
					debug_log(__METHOD__ . " Invalid section_map for section $section_tipo", logger::ERROR);
					continue;
				}

				$component_tipo = $section_map->thesaurus->is_descriptor;
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
	* @param string $section_tipo
	* @param int $section_id
	* @return bool
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

		$section_map = section::get_section_map( $section_tipo );
		if (!isset($section_map->thesaurus->is_indexable)) {
			debug_log(__METHOD__." Invalid section_map 'is_indexable' property from section $section_tipo ".to_string($section_map), logger::ERROR);
			return false;
		}

		if ($section_map->thesaurus->is_indexable===false) {
			// properties set as false case
			return false;
		}

		$component_tipo	= $section_map->thesaurus->is_indexable;
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
	* Modifies received array data on term to set as ND (no descriptor)
	* @return array $ar_elements
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
	* GET_TERM_DATO_BY_LOCATOR
	* Delegate of ts_term_resolver::get_term_dato_by_locator (kept here because
	* diffusion/export/portal code calls it on ts_object).
	* @param object $locator
	* @return array|null $final_value
	*/
	public static function get_term_dato_by_locator( object $locator ) : ?array {

		return ts_term_resolver::get_term_dato_by_locator($locator);
	}//end get_term_dato_by_locator



	/**
	 * GET_TERM_BY_LOCATOR
	 * Retrieves the string representation of a term given its locator.
	 * Delegate of ts_term_resolver::get_term_by_locator (kept here because
	 * diffusion/export/portal code calls it on ts_object).
	 *
	 * @param object $locator
	 * @param string $lang
	 * @param bool $from_cache
	 * @return string|null
	 */
	public static function get_term_by_locator( object $locator, string $lang=DEDALO_DATA_LANG, bool $from_cache=false ) : ?string {

		return ts_term_resolver::get_term_by_locator($locator, $lang, $from_cache);
	}//end get_term_by_locator



	/**
	* INVALIDATE_NODE
	* Targeted cache eviction after a tree mutation (add_child, move, reorder):
	* drops the node's cached term strings and the resolved children cache
	* (sqo-hash keyed: tree mutations invalidate broadly and it is cheap to rebuild).
	* @param string $section_tipo
	* @param int|string $section_id
	* @return void
	*/
	public static function invalidate_node( string $section_tipo, int|string $section_id ) : void {

		ts_term_resolver::invalidate_node($section_tipo, $section_id);
		self::$resolved_child_cache = [];
	}//end invalidate_node



	/**
	* CLEAR
	* Full static cache reset. Registered in worker cache_manager (RoadRunner)
	* so long-running workers never serve tree data cached in a previous request.
	* @return void
	*/
	public static function clear() : void {

		ts_term_resolver::clear();
		self::$resolved_child_cache = [];
	}//end clear



	/**
	* RESOLVE_LOCATOR
	* Alias of get_term_by_locator
	* @return string|null
	*/
	public function resolve_locator( object $locator, string $lang=DEDALO_DATA_LANG, bool $from_cache=false ) : ?string {
		return ts_object::get_term_by_locator($locator, $lang, $from_cache);
	}//end resolve_locator



	/**
	* GET_COMPONENT_ORDER_TIPO
	* Alias of hierarchy::get_element_tipo_from_section_map
	* @param string $section_tipo
	* @return string|null $element_tipo
	*/
	public static function get_component_order_tipo( string $section_tipo ) : ?string {

		// Calculated way
		$element_tipo = hierarchy::get_element_tipo_from_section_map( $section_tipo, 'order' );


		return $element_tipo;
	}//end get_component_order_tipo



	/**
	* GET_PERMISSIONS_ELEMENT
	* Resolve permissions value for given element name (model)
	* E.g. 'button_new'
	* @param string $element_name
	* @return int $permissions
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
	* Counts indexation related items
	* @param object $component
	* 	component indexation
	* @param object section_list_thesaurus_item
	* sample:
	* {
	*	"icon": "TCHI",
	*	"tipo": "tchi59",
	*	"type": "icon",
	*	"show_data": "children"
	* }
	* @return object $count_data_group_by
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
	* Checks if current context is in ontology or in thesaurus
	* as boolean based on $this->options->area_model set on construct.
	* @return bool
	*/
	public function is_ontology() : bool {
		$area_model = $this->options->area_model ?? null;

		return $area_model==='area_ontology';
	}//end is_ontology



	/**
	 * PROCESS_ELEMENT_DETAILS
	 * Iterates over the element types configuration and processes the data for the current object.
	 *
	 * @param object $current_object
	 * @param array $ar_element_tipo
	 * @param object $element_obj
	 * @param object $data Global data object
	 * @return bool Returns true if the element is valid and should be added, false if it should be skipped.
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
	 * Helper to instantiate a component
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
	 * detailed data formatting logic
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
	 * Processes the logic for assigning values to the element object based on its type.
	 *
	 * @return bool Returns false if the processing indicates the element should be skipped.
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
	# GET
	final protected function GetAccessor(string $strMember) {

		return property_exists($this, $strMember)
			? $this->$strMember
			: false;
	}//end GetAccessor



}//end class ts_object
