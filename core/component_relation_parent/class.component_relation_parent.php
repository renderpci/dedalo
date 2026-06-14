<?php declare(strict_types=1);
/**
* CLASS COMPONENT_RELATION_PARENT
* Stores and manages the upward (parent) link in a Dédalo hierarchical tree.
*
* Each record that participates in a hierarchy holds exactly one
* component_relation_parent whose dato is an array of locator objects pointing
* to the parent record(s).  The complementary downward view is owned by
* component_relation_children on the parent record.
*
* Responsibilities
* ----------------
* - Validates incoming locators before insertion: rejects auto-references, descendant
*   cycles, and malformed locators missing 'type' or 'from_component_tipo'.
* - Delegates duplicate detection to component_relation_common::add_locator_to_data
*   using $test_equal_properties as the equality key.
* - Maintains sibling order via a context-keyed component_number (the 'order' field
*   from the section_map thesaurus block) when a parent is added or removed.
* - Provides static tree-traversal helpers (get_parents, get_parents_recursive,
*   is_ancestor, fetch_ancestors_recursive) used by the TS-tree subsystem and the
*   add_parent cycle guard.
* - Exposes get_possible_root_hierarchy to locate the hierarchy-root locator when a
*   record is declared a root node inside the Dédalo ontology hierarchy section.
*
* Data shape
* ----------
* The component dato (stored in the 'relation' matrix column) is a JSON array of
* locator objects, each with at minimum:
*   { section_tipo, section_id, type: DEDALO_RELATION_TYPE_PARENT_TIPO ('dd47'),
*     from_component_tipo }
* In a well-formed tree each child has exactly one parent locator; the array length
* is normally 1, but the code tolerates and returns multiple parents.
*
* Ordering
* --------
* Child order within a parent is stored in the child's own component_number whose
* tipo comes from section_map->thesaurus->order.  Each order datum is context-keyed
* (section_tipo_key + section_id_key) to the parent record so that a child with
* multiple parents carries independent order values per parent.
*
* Relationships
* -------------
* Extends: component_relation_common.
* Inverse: component_relation_children (parent-side view of the same edges).
* Uses: section::get_section_map, component_relation_children::get_children_of_type,
*       hierarchy::get_hierarchy_section, ontology_node::get_model_by_tipo.
*
* @package Dédalo
* @subpackage Core
*/
class component_relation_parent extends component_relation_common {



	/**
	* CLASS VARS
	*/
		/**
		 * Fallback relation type for parent locators.
		 * Resolves to DEDALO_RELATION_TYPE_PARENT_TIPO ('dd47') and is used as the
		 * 'type' field written into every locator stored in this component's dato.
		 * Overrides the null default defined in component_relation_common so that
		 * __construct picks the correct value when the ontology properties do not
		 * supply config_relation->relation_type explicitly.
		 * @var ?string $default_relation_type
		 */
		protected ?string $default_relation_type = DEDALO_RELATION_TYPE_PARENT_TIPO;

		/**
		 * Property names compared to decide whether two locators are duplicates.
		 * add_locator_to_data (component_relation_common) iterates the existing dato
		 * and compares each stored locator against the candidate using these keys; a
		 * full match on all four properties blocks the insert.
		 * Mirrors the identical property set used by component_relation_children.
		 * @var array $test_equal_properties
		 */
		public array $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];

		/**
		 * Last SQL query string produced during a get_parents call.
		 * Populated only when SHOW_DEBUG is true; use for diagnostic inspection only.
		 * Not used for any runtime logic.
		 * @var ?string $get_parents_query
		 */
		public static ?string $get_parents_query = null;

		/**
		 * Accumulated error objects from the most recent get_parents_recursive call.
		 * Reset to [] at the start of every get_parents_recursive invocation so that
		 * callers can inspect cycle/loop errors after the call returns.
		 * Each entry is a stdClass with properties: type (string), msg (string), info (object).
		 * @var array $errors
		 */
		public static array $errors = [];



	/**
	* ADD_PARENT
	* Validate and append a parent locator to this component's dato array.
	*
	* Performs three safety checks before delegating to add_locator_to_data:
	* 1. Auto-reference guard — rejects a locator pointing to the same record
	*    (section_tipo + section_id) as the component's own host record.
	* 2. Descendant-cycle guard — rejects a locator whose target is already a
	*    descendant of the current node (would create an ancestor-of-self cycle).
	*    Calls is_ancestor() which walks the prospective parent's ancestor chain.
	* 3. Missing-property repair — silently sets from_component_tipo and type to
	*    their expected defaults if the caller omitted them, logging a WARNING.
	*
	* When all checks pass, the method also assigns a sibling order value to the
	* child (this record) within the new parent via set_child_order(), then
	* delegates the actual insertion to add_locator_to_data which performs final
	* duplicate detection using $test_equal_properties.
	*
	* (!) This method mutates component data in-memory but does NOT save to the
	* database; callers must call save() separately.
	*
	* @param locator $locator - The parent locator to add; must have section_tipo and section_id set.
	* @return bool - false on any validation failure or duplicate; true on success.
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

		// descendant cycle case. Reject when the prospective parent is a descendant
		// of the current node: linking would make the node an ancestor of itself.
		// Checked here (and not only in API callers) so every entry point is covered.
			if (true===self::is_ancestor($this->section_tipo, $this->section_id, $locator->section_tipo, (int)$locator->section_id)) {
				debug_log(__METHOD__
					. " Error: Ignored invalid locator received to add parent (descendant cycle) " . PHP_EOL
					. ' locator: ' . to_string($locator) . PHP_EOL
					. ' this->tipo: ' . to_string($this->tipo) . PHP_EOL
					. ' this->section_tipo: ' . to_string($this->section_tipo) . PHP_EOL
					. ' this->section_id: ' . to_string($this->section_id) . PHP_EOL
					, logger::ERROR
				);
				self::$errors[] = (object)[
					'type'	=> 'add_parent',
					'msg'	=> 'cycle',
					'info'	=> (object)[
						'section_tipo'	=> $this->section_tipo,
						'section_id'	=> $this->section_id
					]
				];
				return false; // Avoid descendant cycles
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
	* Remove a parent locator from this component's dato array and clean up the
	* associated sibling order entry.
	*
	* Calls remove_child_order() first so the child's order datum for this parent
	* context is deleted before the locator itself is removed; the sibling list
	* maintained by component_number is then implicitly compacted on the next
	* recalculate_sibling_orders call.
	*
	* Delegates the actual locator removal to remove_locator_from_data, which
	* matches against the full locator identity using the default equality set.
	*
	* (!) Mutates data in-memory only; callers must call save() after this method.
	*
	* @param locator $locator - The parent locator to remove; must match a stored locator.
	* @return bool - false when the locator was not found or removal failed; true on success.
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
	* Resolve the ontology tipo of the component_relation_children sibling that
	* corresponds to the given component_relation_parent tipo.
	*
	* Uses common::get_ar_related_by_model to walk the ontology tree for the
	* section that contains $component_tipo and collect all sibling components
	* whose model is 'component_relation_children'.  Returns the first match.
	*
	* Logs an ERROR and returns null when no component_relation_children is
	* found in the same section, and an ERROR (with first-match fallback) when
	* more than one is found.  The multi-result case should not occur in a
	* well-formed ontology but is tolerated for robustness.
	*
	* @param string $component_tipo - Tipo of the component_relation_parent whose inverse is needed.
	* @return ?string - The component_relation_children tipo, or null when none exists in the section.
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
	* Resolve the ontology tipo of the component_relation_parent component that
	* belongs to the given section tipo.
	*
	* Calls section::get_ar_children_tipo_by_model_name_in_section with recursive
	* and resolve_virtual flags enabled so that virtual/alias section nodes are
	* also traversed.  The from_cache flag is always true: ontology topology is
	* stable at runtime and the cache avoids repeated traversals.
	*
	* Logs an ERROR and returns null when the section does not contain any
	* component of model 'component_relation_parent'.
	*
	* @param string $section_tipo - Section tipo to inspect.
	* @return ?string - The component_relation_parent tipo, or null when absent.
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
	* Return the raw dato array of the component_relation_parent for the given
	* section record, i.e. the direct parent locators (not recursive).
	*
	* Instantiates a component_relation_parent in 'list' mode for the target
	* record and calls get_data(), which reads the stored locator array from the
	* matrix 'relation' column.  The result is whatever the component stores:
	* typically an array with one locator object per parent.
	*
	* The $from_component_tipo parameter allows callers that already hold the
	* component tipo to bypass the ontology lookup in get_parent_tipo().
	* When called from within component_relation_parent itself, always supply
	* $from_component_tipo to avoid an unnecessary static reconstruction.
	*
	* @param int|string $section_id - Target record ID.
	* @param string $section_tipo - Target section tipo.
	* @param string|null $from_component_tipo = null - Pre-resolved component_relation_parent tipo.
	*   When null, resolved via get_parent_tipo($section_tipo).
	* @return array|null - Flat array of locator objects, or [] when no parent component found.
	*   Each locator has at minimum: section_tipo, section_id, type, from_component_tipo.
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
	* Public entry point: collect every unique ancestor of a given section record
	* by walking the parent chain upward, breadth-first, avoiding cycles.
	*
	* Resets self::$errors on every call so that the caller can inspect errors
	* (e.g. cycle detections) after the traversal completes.  Delegates the
	* actual depth-first walk to fetch_ancestors_recursive(), passing the
	* $unique_ancestors accumulator by reference for efficiency.
	*
	* The returned array is numerically indexed; order reflects the BFS/DFS
	* discovery order (direct parents first, then their parents, and so on).
	* Duplicate paths converging on the same ancestor are deduplicated by the
	* 'section_tipo_section_id' key used inside fetch_ancestors_recursive.
	*
	* @param int|string $section_id - The starting record ID.
	* @param string $section_tipo - The starting section tipo.
	* @param string|null $component_tipo = null - Optional component_relation_parent tipo override passed
	*   through to each get_parents() call; null triggers auto-resolution per section tipo.
	* @return array - Numerically indexed array of unique ancestor locator objects.
	*   Empty when the node has no parents or only self-referencing edges.
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
	* IS_ANCESTOR
	* Determine whether one node is an ancestor of another by walking the parent
	* chain of the target node upward.
	*
	* Returns true when the node identified by ($node_section_tipo, $node_section_id)
	* appears anywhere in the ancestor chain of ($of_section_tipo, $of_section_id).
	*
	* Designed as the descendant-cycle guard used by add_parent: before accepting
	* a new parent link, add_parent calls is_ancestor(current, prospective_parent)
	* to ensure the prospective parent is not already a descendant of the current
	* node.  Walking ancestors (tree depth) is far cheaper than enumerating the
	* full subtree of descendants (subtree width), which may be unbounded.
	*
	* The same-node case ($node === $of) returns false because the auto-reference
	* guard in add_parent already handles it separately.
	*
	* @param string $node_section_tipo - Tipo of the candidate ancestor node.
	* @param int|string $node_section_id - ID of the candidate ancestor node.
	* @param string $of_section_tipo - Tipo of the node whose ancestors are searched.
	* @param int|string $of_section_id - ID of the node whose ancestors are searched.
	* @return bool - true if $node is an ancestor of $of; false otherwise.
	*/
	public static function is_ancestor( string $node_section_tipo, int|string $node_section_id, string $of_section_tipo, int|string $of_section_id ) : bool {

		// same node is not its own ancestor (the auto-reference case is
		// handled separately by callers)
		if ($node_section_tipo===$of_section_tipo && (int)$node_section_id===(int)$of_section_id) {
			return false;
		}

		$node_key	= $node_section_tipo . '_' . (int)$node_section_id;
		$ancestors	= self::get_parents_recursive($of_section_id, $of_section_tipo);

		foreach ($ancestors as $ancestor) {
			if (!is_object($ancestor) || !isset($ancestor->section_tipo, $ancestor->section_id)) {
				continue;
			}
			$ancestor_key = $ancestor->section_tipo . '_' . (int)$ancestor->section_id;
			if ($ancestor_key===$node_key) {
				return true;
			}
		}

		return false;
	}//end is_ancestor



	/**
	* FETCH_ANCESTORS_RECURSIVE
	* Internal recursive worker that populates the $unique_ancestors accumulator.
	*
	* Two complementary data structures prevent infinite loops and redundant work:
	*
	* - $visited (passed BY VALUE): tracks nodes on the current call-stack path.
	*   Because it is passed by value, each recursive branch receives an independent
	*   copy; a node that appears on one path can legitimately be visited again via
	*   a different path (diamond inheritance in a DAG).  If the same node appears
	*   twice on a single path a true cycle exists — logged to self::$errors and
	*   aborted for that branch.
	*
	* - $unique_ancestors (passed BY REFERENCE): global accumulator keyed by
	*   'section_tipo_section_id'.  When a parent is already in this map its entire
	*   ancestor subtree has already been (or is currently being) added, so further
	*   recursion into that parent is skipped; this is the memoisation that keeps
	*   the algorithm O(nodes) rather than O(paths).
	*
	* Parents are added to $unique_ancestors BEFORE recursing so that concurrent
	* recursive branches triggered by diamond inheritance converge without
	* re-processing the shared ancestor.
	*
	* (!) Private: call get_parents_recursive() from outside the class.
	*
	* @param int|string $section_id - Record ID of the node currently being expanded.
	* @param string $section_tipo - Section tipo of the node currently being expanded.
	* @param string|null $component_tipo - Optional component_relation_parent tipo override; null = auto-resolve.
	* @param array &$unique_ancestors - Accumulator of unique parent objects, keyed by 'tipo_id' string.
	*   Modified in-place by every recursive call.
	* @param array $visited - Path-local cycle-detection map (keys are 'tipo_id' strings). Passed by value.
	* @return void - Results accumulate in $unique_ancestors.
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
	* Determine whether the current record is declared as a root node in a
	* Dédalo ontology hierarchy, and return a synthetic locator pointing to that
	* hierarchy section if so.
	*
	* Used primarily by the diffusion pipeline, which needs an explicit parent
	* locator for records that sit at the top of a tree and would otherwise have
	* an empty component_relation_parent dato.
	*
	* Algorithm:
	* 1. Calls hierarchy::get_hierarchy_section($section_tipo, DEDALO_HIERARCHY_TARGET_SECTION_TIPO)
	*    to find the hierarchy1 section ID that governs the current section tipo.
	*    Returns null immediately when no matching hierarchy section exists.
	* 2. Instantiates the hierarchy_children portal component (DEDALO_HIERARCHY_CHILDREN_TIPO,
	*    i.e. 'hierarchy45') on that hierarchy section in 'list' mode and loads its dato.
	* 3. Scans the portal locators for one whose section_tipo + section_id match the
	*    current record.  On match, returns a synthetic locator object:
	*    { section_tipo: DEDALO_HIERARCHY_SECTION_TIPO ('hierarchy1'),
	*      section_id: $hierarchy_section_id,
	*      from_component_tipo: $this->tipo,
	*      type: DEDALO_RELATION_TYPE_PARENT_TIPO }
	* 4. Returns null when the current record is not listed as a root child of any
	*    hierarchy section.
	*
	* @return object|null - Synthetic locator object when the record is a hierarchy root; null otherwise.
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
	* Convenience wrapper: register the given child record ($section_tipo, $section_id)
	* as a child of the section that owns this component_relation_parent.
	*
	* Constructs a locator pointing to the child and delegates to add_parent().
	* This method is called from the children side of a newly created parent-child
	* link (i.e. when a user selects a parent in the child's form), keeping the
	* naming intention readable from the parent component's perspective.
	*
	* (!) Mutates data in-memory only; callers must call save() after this method.
	*
	* @param string $section_tipo - Section tipo of the child record to register.
	* @param string|int $section_id - Record ID of the child to register.
	* @return bool - false when add_parent rejects the locator; true on success.
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
	* Convenience wrapper: unregister the given child record ($section_tipo, $section_id)
	* from the section that owns this component_relation_parent.
	*
	* Constructs the matching locator and delegates to remove_parent().
	* Mirror of make_me_your_parent; called when a parent-child link is severed
	* from the child's perspective.
	*
	* (!) Mutates data in-memory only; callers must call save() after this method.
	*
	* @param string $section_tipo - Section tipo of the child record to deregister.
	* @param string|int $section_id - Record ID of the child to deregister.
	* @return bool - false when remove_parent cannot find the locator; true on success.
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
	* Report that this component supports manual reordering of its entries.
	*
	* Overrides the component_common base which returns false.  Returning true
	* enables the drag-reorder UI in list/grid modes and signals the client that
	* save-order API calls should be dispatched after drag operations.
	*
	* @return bool - Always true: component_relation_parent entries are user-sortable.
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



	/**
	* GET_ORDER_DATAFRAME
	* Instantiate the component_number that stores sibling-order values for the
	* current record within its parent context.
	*
	* Reads the 'order' key from the section_map thesaurus block
	* (section_map->thesaurus->order) to obtain the component tipo that holds
	* order data.  Returns null when the section_map does not define an order
	* component (some sections do not participate in ordered hierarchies).
	*
	* The returned component is loaded in 'edit' mode with DEDALO_DATA_NOLAN so
	* its dato is the raw context-keyed array rather than a language-resolved
	* scalar.  The instance is NOT cached; each call creates a fresh object.
	*
	* @return component_number|null - Fresh component_number instance, or null when the
	*   section has no order component defined in its section_map.
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
	* Assign an initial sibling-order position to the current record within a
	* newly added parent context.
	*
	* Strategy: count the parent's existing children via
	* component_relation_children::get_children_of_type() and use (count + 1) as
	* the next order value.  The value is written into the current record's own
	* component_number (the 'order' component from section_map) using
	* add_value_with_context(), which attaches the parent context key
	* ($parent_section_tipo, $parent_section_id) so that the order is scoped to
	* this specific parent.
	*
	* (!) Race condition: the count-then-write pattern is not atomic.  Concurrent
	* add_parent calls may produce colliding order values unless the caller holds
	* the parent advisory lock inside a PostgreSQL transaction (see
	* matrix_db_manager::acquire_node_lock).  A warning is logged in debug mode
	* when set_child_order is called outside a transaction.
	*
	* (!) add_value_with_context is marked @deprecated in trait.dataframe_common.php
	* (superseded by the dataframe locator pairing contract).  This call site uses
	* the legacy context-key mechanism intentionally for the pre-dataframe order
	* subsystem and should be migrated when the order system is updated.
	*
	* @param string $parent_section_tipo - Section tipo of the parent receiving the new child.
	* @param int $parent_section_id - Record ID of the parent receiving the new child.
	* @return bool - false when no order component exists or the save fails; true on success.
	*/
	protected function set_child_order(string $parent_section_tipo, int $parent_section_id) : bool {

		// Count-then-write is only race-free when the caller holds the parent
		// advisory lock inside a transaction (see matrix_db_manager::acquire_node_lock).
		// Flag unprotected call sites.
		if (SHOW_DEBUG===true) {
			$conn = DBi::_getConnection();
			if ($conn!==false && pg_transaction_status($conn)===PGSQL_TRANSACTION_IDLE) {
				debug_log(__METHOD__
					. " Warning: set_child_order called outside a transaction; concurrent adds may collide on order values" . PHP_EOL
					. ' section_tipo: ' . $this->section_tipo . PHP_EOL
					. ' section_id: ' . to_string($this->section_id) . PHP_EOL
					. ' parent: ' . $parent_section_tipo . '_' . $parent_section_id
					, logger::WARNING
				);
			}
		}

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
	* Delete the sibling-order datum for the current record within the given
	* parent context, typically called just before remove_locator_from_data.
	*
	* Calls component_number::remove_by_context() to strip the context-keyed
	* order entry (matching $parent_section_tipo + $parent_section_id) from the
	* order component's dato, then saves the component.
	*
	* Returns false early (without saving) when the section has no order
	* component or when get_order_dataframe() returns null.
	*
	* (!) Note: when remove_by_context() returns false the method returns true
	* unconditionally, which masks any removal failure.  This is existing
	* behaviour; document-flag only.
	*
	* (!) remove_by_context is marked @deprecated in trait.dataframe_common.php.
	* This call site uses the legacy context-key mechanism intentionally and
	* should be migrated when the order system is updated.
	*
	* @param string $parent_section_tipo - Section tipo of the parent being unlinked.
	* @param int $parent_section_id - Record ID of the parent being unlinked.
	* @return bool - false when no order component exists; otherwise the result of save()
	*   when removal succeeded, or true when remove_by_context() returned false.
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
	* Compute the next available sibling-order integer for a new child within the
	* specified parent context.
	*
	* Delegates to component_relation_children::get_children_of_type() with the
	* 'descriptor' type filter to obtain the current ordered children list, then
	* returns count + 1.  The result is 1 when the parent has no children yet.
	*
	* (!) Shares the same count-then-use race condition as set_child_order.
	* Use only from within a transaction that holds the parent node lock when
	* order uniqueness matters.
	*
	* @param string $parent_section_tipo - Section tipo of the parent.
	* @param int $parent_section_id - Record ID of the parent.
	* @return int - Next order value (1-based).
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
	* Instance-method façade: recompute the sibling-order values for all current
	* children of $parent after a removal or reorder operation.
	*
	* Delegates to the static recalculate_sibling_orders_static() using the
	* instance's own $section_tipo as the child section tipo.  Providing an
	* instance method allows callers holding a component object to call this
	* without knowing the static class name.
	*
	* @param string $parent_section_tipo - Section tipo of the parent whose children will be renumbered.
	* @param int $parent_section_id - Record ID of the parent whose children will be renumbered.
	* @return bool - Result of recalculate_sibling_orders_static().
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
	* Renumber the sibling-order values for every child of a given parent in
	* dense ascending order (1, 2, 3, …), skipping children whose stored order
	* is already correct to avoid unnecessary saves.
	*
	* Algorithm:
	* 1. Resolve the order component tipo from section_map->thesaurus->order for
	*    $section_tipo.  Returns false early when none is configured.
	* 2. Fetch the current ordered children list via
	*    component_relation_children::get_children_of_type() (type='descriptor').
	*    The list is already sorted by stored order, so its iteration order is
	*    the canonical desired order after renumbering.
	* 3. For each child, instantiate its component_number in 'edit' mode and call
	*    get_value_by_context() to read the existing value.  If the current value
	*    already equals the target position the child is skipped (no save).
	*    Otherwise update_value_by_context() + save() writes the new value.
	*
	* This method is typically called after a child is removed or reordered so
	* that the remaining siblings form a gapless sequence starting at 1.
	*
	* (!) update_value_by_context is marked @deprecated in trait.dataframe_common.php.
	* Used here intentionally as part of the legacy context-key order subsystem.
	*
	* @param string $section_tipo - Section tipo of the children being renumbered.
	* @param string $parent_section_tipo - Section tipo of the parent.
	* @param int $parent_section_id - Record ID of the parent.
	* @return bool - false when no order component exists; true after processing all siblings.
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
