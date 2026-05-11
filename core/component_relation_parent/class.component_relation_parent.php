<?php declare(strict_types=1);
/**
* CLASS COMPONENT_RELATION_PARENT
* Manages hierarchical parent relationships between sections in Dédalo.
*
* Establishes parent-child hierarchies where records can reference other records
* as their parent, creating tree-like structures for organizing data.
* The inverse view (children) is provided by component_relation_children.
*
* Key features:
* - Parent reference storage using locator objects
* - Duplicate prevention when adding parent relations
* - Auto-reference protection (prevents a record from being its own parent)
* - Automatic child ordering when adding parents
* - Parent locator validation (type and from_component_tipo checks)
*
* Example hierarchy:
* - Section A (parent) is referenced by Section B (child)
* - Section B uses component_relation_parent pointing to Section A
* - Section A uses component_relation_children to view Sections B, C, etc.
*
* Extends component_relation_common with DEDALO_RELATION_TYPE_PARENT_TIPO relation type.
*
* @package Dédalo
* @subpackage Core
*/
class component_relation_parent extends component_relation_common {



	/**
	* CLASS VARS
	*/
		/**
		 * Default relation type for parent relations (DEDALO_RELATION_TYPE_PARENT_TIPO).
		 * Used to filter locators in the 'relations' container data.
		 * @var ?string $default_relation_type
		 */
		protected ?string $default_relation_type = DEDALO_RELATION_TYPE_PARENT_TIPO;

		/**
		 * Properties used to verify duplicate locators when adding relations.
		 * Array of property names that must match to consider two locators equal.
		 * @var array $test_equal_properties
		 */
		public array $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];

		/**
		 * Last SQL query executed for get_parents operations.
		 * Stored for debugging purposes only.
		 * @var ?string $get_parents_query
		 */
		public static ?string $get_parents_query = null;

		/**
		 * Static storage for class-level errors.
		 * Accumulates errors encountered during parent relation operations.
		 * @var array $errors
		 */
		public static array $errors = [];



	/**
	* add_parent
	* Add one locator to current 'data'. Verify is exists to avoid duplicates
	* NOTE: This method updates component 'data' and save
	* @param locator $locator
	* @return bool
	*/
	public function add_parent( locator $locator ) : bool {

		// reference self case
			if ($locator->section_tipo===$this->section_tipo && $locator->section_id==$this->section_id) {
				debug_log(__METHOD__
					. " Error: Ignored invalid locator received to add parent (auto-reference) " . PHP_EOL
					. ' locator: ' . to_string($locator) . PHP_EOL
					. ' this->tipo: ' . to_string($this->tipo) . PHP_EOL
					. ' this->section_tipo: ' . to_string($this->section_tipo) . PHP_EOL
					. ' this->section_id: ' . to_string($this->section_id) . PHP_EOL
					, logger::ERROR
				);
				return false; // Avoid auto-references
			}

		// from_component_tipo check
			if (!isset($locator->from_component_tipo)) {
				debug_log(__METHOD__
					.' WARNING. forgotten property "from_component_tipo" it is mandatory ' . PHP_EOL
					. ' this->tipo: ' . to_string($this->tipo) . PHP_EOL
					. ' this->section_tipo: ' . to_string($this->section_tipo) . PHP_EOL
					. ' this->section_id: ' . to_string($this->section_id) . PHP_EOL
					, logger::WARNING
				);
				$locator->from_component_tipo = $this->tipo;
			}

		// type check
			if (!isset($locator->type)) {
				debug_log(__METHOD__
					.' WARNING. forgotten property "type" it is mandatory ' . PHP_EOL
					. ' this->tipo: ' . to_string($this->tipo) . PHP_EOL
					. ' this->section_tipo: ' . to_string($this->section_tipo) . PHP_EOL
					. ' this->section_id: ' . to_string($this->section_id) . PHP_EOL
					, logger::WARNING
				);
				$locator->type = $this->default_relation_type;
			}

		// Set order for new parent
			$this->set_child_order($locator->section_tipo, (int)$locator->section_id);

		// Add current locator to component data
			if (!$this->add_locator_to_data($locator)) {
				return false;
			}

		return true;
	}//end add_parent



	/**
	* REMOVE_PARENT
	* Iterate current component 'data' and if math requested locator, removes it the locator from the 'data' array
	* NOTE: This method updates component 'data'
	* @param locator $locator
	* @return bool
	*/
	public function remove_parent( locator $locator ) : bool {

		// Remove order and recalculate siblings
		$this->remove_child_order($locator->section_tipo, (int)$locator->section_id);

		// remove current locator from component data
		if (!$this->remove_locator_from_data($locator)) {
			return false;
		}

		return true;
	}//end remove_parent



	/**
	* GET_COMPONENT_RELATION_CHILDREN_TIPO
	* @param string $component_tipo
	* @return string $component_relation_children_tipo
	*/
	public static function get_component_relation_children_tipo(string $component_tipo) : ?string {

		$model_name			= 'component_relation_children';
		$ar_children		= (array)common::get_ar_related_by_model($model_name, $component_tipo);
		$ar_children_len	= count($ar_children);
		if ($ar_children_len===0) {

			debug_log(__METHOD__
				." Error: component_relation_children not found in this section" . PHP_EOL
				.' model_name: '. $model_name . PHP_EOL
				.' component_tipo: '. $component_tipo . PHP_EOL
				, logger::ERROR
			);

			return null;

		}elseif ($ar_children_len>1) {

			debug_log(__METHOD__
				." Sorry, more than 1 component_relation_children found in section for this component_tipo. First component will be used."
				.' component_tipo: ' . $component_tipo . PHP_EOL
				.' ar_children: ' . json_encode($ar_children, JSON_PRETTY_PRINT) . PHP_EOL
				.' used: ' . $ar_children[0]
				, logger::ERROR
			);
		}

		// component_relation_children_tipo. Select first
		$component_relation_children_tipo = $ar_children[0] ?? null;


		return $component_relation_children_tipo;
	}//end get_component_relation_children_tipo



	/**
	* GET_PARENT_TIPO
	* get ontology tipo for component_relation_parent of the section_tipo given
	* @param string $section_tipo
	* @return string|null $children_tipo
	*/
	public static function get_parent_tipo( string $section_tipo ) : ?string {

		$children_tipo = null;

		// Locate component children in section when is not received
		// Search always (using cache) for allow mix different section tipo (like beginning from root hierarchy note)
			$ar_parent_tipo = section::get_ar_children_tipo_by_model_name_in_section(
				$section_tipo, // string section_tipo
				['component_relation_parent'], // array ar_model_name_required
				true, // bool from_cache
				true, // bool resolve_virtual
				true, // bool recursive
				true, // bool search_exact
				false // bool|array ar_tipo_exclude_elements
			);
			if (empty($ar_parent_tipo)) {
				debug_log(__METHOD__
					." Ignored search get_parent because this section ($section_tipo) do not have any component of model: component_relation_parent " . PHP_EOL
					.' section_tipo: ' . $section_tipo
					, logger::ERROR
				);
				// if(SHOW_DEBUG===true) {
				// 	$bt = debug_backtrace();
				// 	dump($bt, ' bt ++ '.to_string());
				// }
				return $children_tipo;
			}
			$children_tipo = reset($ar_parent_tipo);


		return $children_tipo;
	}//end get_parent_tipo



	/**
	* GET_PARENTS
	* Get parents of current section
	* If you call this method from component_relation_parent, always send $from_component_tipo var to avoid recreate the component statically
	* @param int|string $section_id
	* @param string $section_tipo
	* @param string|null $from_component_tipo = null
	*	Optional. Previously calculated from structure using current section tipo info or calculated inside from section_tipo
	* @return array|null $parents
	*	Array of stClass objects with properties: section_tipo, section_id, component_tipo
	*/
	public static function get_parents( int|string $section_id, string $section_tipo, ?string $from_component_tipo=null ) : ?array {

		$component_tipo = $from_component_tipo ?? component_relation_parent::get_parent_tipo( $section_tipo );
		if (empty($component_tipo)) {
			debug_log(__METHOD__
				. " Error! Unable to resolve component_tipo. Returning empty array" . PHP_EOL
				. ' section_id: ' . json_encode($section_id) . PHP_EOL
				. ' section_tipo: ' . json_encode($section_tipo) . PHP_EOL
				. ' from_component_tipo: ' . json_encode($from_component_tipo) . PHP_EOL
				. ' component_tipo: ' . json_encode($component_tipo)
				, logger::ERROR
			);
			return [];
		}
		$model				= ontology_node::get_model_by_tipo($component_tipo);
		$parent_component	= component_common::get_instance(
			$model, // string model
			$component_tipo, // string tipo
			$section_id, // string section_id
			'list', // string mode
			DEDALO_DATA_NOLAN, // string lang
			$section_tipo // string section_tipo
		);

		$parents = $parent_component->get_data();

		return $parents;
	}//end get_parents



	/**
	* GET_PARENTS_RECURSIVE
	* Public facing function to get all unique ancestor parents recursively.
	* This acts as a clean entry point and initializes the process.
	* @param int|string $section_id
	* 	The starting section ID.
	* @param string $section_tipo
	* 	The starting section type.
	* @param string|null $component_tipo
	* 	Optional component type filter passed to get_parents.
	* @return array
	* 	An array of unique parent objects/arrays, generally ordered from direct parents upwards.
	*/
	public static function get_parents_recursive(int|string $section_id, string $section_tipo, ?string $component_tipo = null): array {

		// reset self::$errors
		// On each call, the class errors are cleaned to allow display errors from client
		// when a infinite loop is detected fro example.
		self::$errors = [];

		// Initialize the master list, keyed by 'type_id' for uniqueness
		$unique_ancestors = [];

		// Call the internal recursive helper, passing the ancestor list by reference.
		// The initial visited array is empty.
		self::fetch_ancestors_recursive($section_id, $section_tipo, $component_tipo, $unique_ancestors, []);

		// Return the values of the populated ancestor list as a numerically indexed array.
		return array_values($unique_ancestors);
	}//end get_parents_recursive



	/**
	* FETCH_ANCESTORS_RECURSIVE
	* Optimized internal recursive function to fetch ancestors.
	* Prevents duplicates and cycles efficiently. Avoids redundant processing of already visited nodes.
	* @param int|string $section_id
	* 	The ID of the current section being processed.
	* @param string $section_tipo
	* 	The type of the current section being processed.
	* @param string|null $component_tipo
	* 	Optional component type filter.
	* @param array &$unique_ancestors
	* 	Associative array (passed by reference) to collect unique ancestors, keyed by 'type_id'.
	* @param array $visited
	*	Associative array tracking nodes visited *in the current recursion path* to detect cycles. Keys are 'type_id'. Passed by value.
	* @return void
	* 	This function modifies $unique_ancestors directly.
	*/
	private static function fetch_ancestors_recursive(
		int|string $section_id,
		string $section_tipo,
		?string $component_tipo,
		array &$unique_ancestors, // Pass master list by reference
		array $visited // Pass current path's visited nodes by value
	): void {

		// Create a unique key for the current node.
		$current_node_key = $section_tipo . '_' . $section_id;

		// Cycle Detection (Current Path)
		// If this node is already in the visited list *for this specific path*, we have a cycle. Stop this path.
		if (isset($visited[$current_node_key])) {
			debug_log(__METHOD__
				. " Loop detected at: " . PHP_EOL
				. ' current_node_key: ' . to_string($current_node_key) . PHP_EOL
				. ' unique_ancestors: ' . to_string($unique_ancestors)
				, logger::ERROR
			);
			self::$errors[] = (object)[
				'type'			=> 'get_parents_recursive',
				'msg'			=> 'Loop detected',
				'info' 			=> (object)[
					'section_tipo'	=> $section_tipo,
					'section_id'	=> $section_id
				]
			];
			return;
		}
		// Mark current node as visited for this path to detect cycles further down.
		$visited[$current_node_key] = true;

		// 1. Get the direct parents of the current node.
		$direct_parents = self::get_parents($section_id, $section_tipo, $component_tipo) ?? [];

		// 2. Process direct parents and recurse if necessary.
		foreach ($direct_parents as $parent) {
			// Basic validation: Ensure the parent structure is as expected.
			if (is_object($parent) && isset($parent->section_id) && isset($parent->section_tipo)) {
				$parent_key = $parent->section_tipo . '_' . $parent->section_id;

				// Avoid Re-processing
				// Check if this parent has *already* been added to the final unique list.
				// If yes, its ancestors are also already included (or being processed), so we can skip recursing for it.
				if (!isset($unique_ancestors[$parent_key])) {

					// Add the direct parent to the master unique list *before* recursing.
					$unique_ancestors[$parent_key] = $parent;

					// --- Recurse for the newly found parent ---
					self::fetch_ancestors_recursive(
						$parent->section_id,
						$parent->section_tipo,
						$component_tipo,
						$unique_ancestors, // Pass the master list by reference
						$visited          // Pass the current path's visited state (by value copy)
					);
				}
				// If the parent *was* already in $unique_ancestors, we don't need to do anything here.
			} else {
				 // Optional: Log or handle cases where parent data isn't structured as expected.
				 // error_log("Invalid parent structure encountered while processing node $current_node_key: " . print_r($parent, true));
				debug_log(__METHOD__
					. " Invalid parent object encountered while processing node: $current_node_key " . PHP_EOL
					. ' parent: ' . to_string($parent)
					, logger::ERROR
				);
			}
		}
		// Note: $visited state for this node automatically disappears when this function call returns,
		// because it was passed by value. This correctly allows the node to be visited again via a *different* path.
	}//end fetch_ancestors_recursive



	/**
	* GET_POSSIBLE_ROOT_HIERARCHY
	* Searches if the current section is defined as a root node in any hierarchy.
	* It is used mainly for diffusion compatibility.
	* Key steps:
	* 1. Resolves the hierarchy section ID associated with the current section tipo via hierarchy::get_hierarchy_section.
	* 2. Loads the 'hierarchy_children' portal (DEDALO_HIERARCHY_CHILDREN_TIPO) for that hierarchy section.
	* 3. Iterates through the children portal data to see if it contains a locator pointing to the current section record.
	* 4. If found, returns a locator object representing the link to the root hierarchy.
	*
	* @return object|null A locator-like object {section_tipo, section_id, from_component_tipo, type} or null if not found.
	*/
	public function get_possible_root_hierarchy() : ?object {

		$section_tipo	= $this->section_tipo;
		$section_id		= $this->section_id;
		$tipo			= $this->tipo;
		$relation_type	= $this->default_relation_type;

		$component_target_section_tipo = DEDALO_HIERARCHY_TARGET_SECTION_TIPO; // hierarchy53

		$hierarchy_section_id = hierarchy::get_hierarchy_section(
			$section_tipo,
			$component_target_section_tipo
		);
		if (empty($hierarchy_section_id)) {
			return null;
		}

		// Component portal
		$component_portal_tipo	= DEDALO_HIERARCHY_CHILDREN_TIPO; // hierarchy45
		$current_model			= ontology_node::get_model_by_tipo($component_portal_tipo);
		if (empty($current_model)) {
			return null;
		}

		$current_component = component_common::get_instance(
			$current_model,
			$component_portal_tipo,
			$hierarchy_section_id,
			'list',
			DEDALO_DATA_NOLAN,
			DEDALO_HIERARCHY_SECTION_TIPO // hierarchy1
		);
		if (empty($current_component)) {
			return null;
		}

		$data = $current_component->get_data();
		if(empty($data)) {
			return null;
		}

		foreach ($data as $current_locator) {

			if (is_object($current_locator) && isset($current_locator->section_tipo) && isset($current_locator->section_id) && $current_locator->section_tipo === $section_tipo && (int)$current_locator->section_id === (int)$section_id) {

				return (object)[
					'section_tipo' => DEDALO_HIERARCHY_SECTION_TIPO,
					'section_id' => $hierarchy_section_id,
					'from_component_tipo' => $tipo,
					'type' => $relation_type
				];
			}
		}

		return null;
	}//end get_possible_root_hierarchy



	/**
	* MAKE_ME_YOUR_PARENT
	* Add one locator to current 'data' from children side
	* NOTE: This method updates component 'data' and save
	* @param string $section_tipo
	* @param string|int $section_id
	* @return bool
	*/
	public function make_me_your_parent( string $section_tipo, string|int $section_id ) : bool {

		// locator compound
			$locator = new locator();
				$locator->set_type($this->relation_type);
				$locator->set_section_id($section_id);
				$locator->set_section_tipo($section_tipo);
				$locator->set_from_component_tipo($this->tipo);

		// Add children locator
			if (!$this->add_parent( $locator )) {
				return false;
			}

		return true;
	}//end make_me_your_parent



	/**
	* REMOVE_ME_AS_YOUR_PARENT
	* @param string $section_tipo
	* @param string|int $section_id
	* @return bool
	*/
	public function remove_me_as_your_parent( string $section_tipo, string|int $section_id ) : bool {

		// locator compound
			$locator = new locator();
				$locator->set_type($this->relation_type);
				$locator->set_section_id($section_id);
				$locator->set_section_tipo($section_tipo);
				$locator->set_from_component_tipo($this->tipo);

		// Remove child locator
			if (!$this->remove_parent($locator)) {
				return false;
			}

		return true;
	}//end remove_me_as_your_parent




	/**
	* GET_SORTABLE
	* @return bool
	* 	Default is false. Override when component is sortable
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



	/**
	* GET_ORDER_DATAFRAME
	* Get the order component (dataframe) for this section from section_map
	* @return component_number|null
	*/
	protected function get_order_dataframe() : ?component_number {
		$section_map = section::get_section_map($this->section_tipo);

		$order_tipo = $section_map->thesaurus->order ?? null;
		if (empty($order_tipo)) {
			return null;
		}

		return component_common::get_instance(
			'component_number',
			$order_tipo,
			$this->section_id,
			'edit',
			DEDALO_DATA_NOLAN,
			$this->section_tipo
		);
	}//end get_order_dataframe



	/**
	* SET_CHILD_ORDER
	* Set order value for the new parent by getting parent's children count
	* @param string $parent_section_tipo
	* @param int $parent_section_id
	* @return bool
	*/
	protected function set_child_order(string $parent_section_tipo, int $parent_section_id) : bool {
		$section_map = section::get_section_map($this->section_tipo);
		$order_tipo = $section_map->thesaurus->order ?? null;
		if (empty($order_tipo)) {
			debug_log(__METHOD__ . " No order component defined in section_map", logger::WARNING);
			return false;
		}

		// Get parent's children count using component_relation_children
		$children = component_relation_children::get_children_of_type(
			$parent_section_id,
			$parent_section_tipo,
			'descriptor'
		);

		$next_order = count($children) + 1;

		// Set this child's order in THEIR own order component
		$order_component = $this->get_order_dataframe();
		if ($order_component === null) {
			return false;
		}

		$add_result = $order_component->add_value_with_context(
			$next_order,
			$parent_section_tipo,
			$parent_section_id
		);

		if($add_result===true){
			return $order_component->save();
		}
		return false;
	}//end set_child_order



	/**
	* REMOVE_CHILD_ORDER
	* Remove order for removed parent and recalculate siblings
	* @param string $parent_section_tipo
	* @param int $parent_section_id
	* @return bool
	*/
	protected function remove_child_order(string $parent_section_tipo, int $parent_section_id) : bool {
		$section_map = section::get_section_map($this->section_tipo);
		$order_tipo = $section_map->thesaurus->order ?? null;
		if (empty($order_tipo)) {
			return false;
		}

		// Set this child's order in THEIR own order component
		$order_component = $this->get_order_dataframe();
		if ($order_component === null) {
			return false;
		}

		$remove_result = $order_component->remove_by_context(
			$parent_section_tipo,
			$parent_section_id
		);

		if($remove_result===true){
			return $order_component->save();
		}

		return true;
	}//end remove_child_order



	/**
	* GET_NEXT_ORDER_IN_CONTEXT
	* Get the next order value by asking parent for children count
	* @param string $parent_section_tipo
	* @param int $parent_section_id
	* @return int
	*/
	public function get_next_order_in_context(string $parent_section_tipo, int $parent_section_id) : int {
		$children = component_relation_children::get_children_of_type(
			$parent_section_id,
			$parent_section_tipo,
			'descriptor'
		);

		return count($children) + 1;
	}//end get_next_order_in_context



	/**
	* RECALCULATE_SIBLING_ORDERS
	* Recalculate orders for all siblings of a given parent
	* @param string $parent_section_tipo
	* @param int $parent_section_id
	* @return bool
	*/
	public function recalculate_sibling_orders(string $parent_section_tipo, int $parent_section_id) : bool {

		return self::recalculate_sibling_orders_static(
			$this->section_tipo,
			$parent_section_tipo,
			$parent_section_id
		);
	}//end recalculate_sibling_orders



	/**
	* RECALCULATE_SIBLING_ORDERS_STATIC
	* Static version to recalculate orders for all siblings of a given parent
	* @param string $section_tipo
	* @param string $parent_section_tipo
	* @param int $parent_section_id
	* @return bool
	*/
	public static function recalculate_sibling_orders_static( string $section_tipo, string $parent_section_tipo, int $parent_section_id ) : bool {

		$section_map = section::get_section_map($section_tipo);
		$order_tipo = $section_map->thesaurus->order ?? null;
		if (empty($order_tipo)) {
			return false;
		}

		// Get all children of the parent
		$children = component_relation_children::get_children_of_type(
			$parent_section_id,
			$parent_section_tipo,
			'descriptor'
		);

		// Update each sibling's order in THEIR own component
		$order = 1;
		foreach ($children as $child_locator) {
			$sibling_order_component = component_common::get_instance(
				'component_number',
				$order_tipo,
				$child_locator->section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$child_locator->section_tipo
			);

			// Get current value to skip unchanged
			$current_value = $sibling_order_component->get_value_by_context(
				$parent_section_tipo,
				$parent_section_id
			);

			// Skip if order already correct
			if ((int)$current_value === $order) {
				$order++;
				continue;
			}

			$order_result = $sibling_order_component->update_value_by_context(
				$order++,
				$parent_section_tipo,
				$parent_section_id
			);
			if($order_result === true){
				$sibling_order_component->save();
			}
		}

		return true;
	}//end recalculate_sibling_orders_static



	}//end class component_relation_parent
