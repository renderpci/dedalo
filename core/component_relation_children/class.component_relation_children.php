<?php declare(strict_types=1);
include_once 'trait.search_component_relation_children.php';
/**
* CLASS COMPONENT_RELATION_CHILDREN
* Manages hierarchical child relationships between sections in Dédalo.
*
* Provides a read-only view of sections that reference the current section
* as their parent via component_relation_parent. Acts as the inverse of
* component_relation_parent, showing "downstream" relationships from the
* parent's perspective.
*
* Key characteristics:
* - No database storage (use_db_data = false)
* - Data is calculated from component_relation_parent records
* - Lists all child sections referencing the current record as parent
* - Provides utility methods to modify relationships via the parent component
* - Search mode uses parent behavior for stored data compatibility
*
* Example hierarchy:
* - Section A (parent) has component_relation_children showing Section B and C
* - Section B and C have component_relation_parent pointing to Section A
*
* Extends component_relation_common and uses search_component_relation_children trait
* for hierarchical relationship queries.
*
* @package Dédalo
* @subpackage Core
*/
class component_relation_children extends component_relation_common {



	use search_component_relation_children;



	/**
	* CLASS VARS
	*/
		/**
		 * Default relation type for children relationships.
		 * Inherited from DEDALO_RELATION_TYPE_CHILDREN_TIPO constant.
		 * Defines the type of relationship for parent-child hierarchical links.
		 * @var ?string $default_relation_type
		 */
		protected ?string $default_relation_type = DEDALO_RELATION_TYPE_CHILDREN_TIPO;

		/**
		 * Properties used to detect duplicate locators when adding child relationships.
		 * Locators with identical values for all these properties are considered duplicates.
		 * - section_tipo : Target child section type identifier
		 * - section_id : Target child section record ID
		 * - type : Relation type (typically children type)
		 * - from_component_tipo : Source component tipo creating the relation
		 * @var array $test_equal_properties
		 */
		public array $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];

		/**
		 * Array of target section tipos for this children component.
		 * Calculated from the related component of type section (could be virtual or real).
		 * Used to determine which sections can be children of the current section.
		 * Empty array indicates no restriction on child section types.
		 * @var array $ar_target_section_tipo
		 */
		protected array $ar_target_section_tipo = [];

		/**
		 * Static cache for parent tipo lookups.
		 * Maps section tipos to their related parent component tipos.
		 * Avoids repeated ontology queries for parent relationship resolution.
		 * @var array $ar_parent_tipo_cache
		 */
		public static array $ar_parent_tipo_cache = [];



	/**
	* SAVE
	* No-op override of the parent relation save pipeline.
	* component_relation_children never stores its own rows — its data is derived
	* entirely from the component_relation_parent records of the child sections.
	* Saving is performed on those parent components instead (see update_parent()).
	*
	* @return bool Always returns true (nothing to persist).
	*/
	public function save() : bool {
		// Nothing to do. This component doesn't save its own rows.
		return true;
	}//end save



	/**
	* GET_DATA
	* Returns the calculated list of child-section locators for this record.
	*
	* This component stores no rows itself. Instead, get_data() queries the database
	* for every record whose component_relation_parent points to the current
	* ($section_tipo, $section_id) pair. The result is a flat array of locator objects
	* where each locator->from_component_tipo is the tipo of this children component.
	*
	* The resolved result is cached in $this->data_resolved to avoid repeated SQL
	* calls within the same request. Calling set_data() invalidates the cache via
	* unset($this->data_resolved).
	*
	* In search mode the method delegates to parent::get_data() so that search filter
	* values (stored in the matrix) can be read back normally.
	*
	* @see component_common->get_data()
	* @return array|null An array of locators representing the children sections, or null when the current section has no children.
	*/
	public function get_data() : ?array {

		/**
		 * SEARCH MODE: Special case behavior
		 * In search mode, this component delegates data retrieval to the parent class
		 * because search operations require actual stored data (unlike normal mode
		 * where data is calculated from component_relation_parent relations).
		 * This maintains consistency with set_dato() which also uses parent behavior in search mode.
		 */
		if ($this->mode === 'search') {
			return parent::get_data();
		}

		// data_resolved. Already resolved case
		if(isset($this->data_resolved)) {
			return $this->data_resolved;
		}

		// always get data calculated from my parents that call the current section
			$data = component_relation_children::get_children(
				$this->section_id,
				$this->section_tipo,
				$this->tipo
			);

		// set data_resolved and cache it
			$this->data_resolved = $data;

		// empty cases
			if(empty($data)) {
				return null;
			}


		return $data;
	}//end get_data



	/**
	* GET_DATA_PAGINATED
	* Returns one page of child locators and populates $this->pagination->total.
	*
	* The total row count is resolved via a dedicated SQL COUNT query (count_children())
	* rather than loading every child row, so pagination is efficient for large hierarchies.
	* If count_children() returns null (e.g., when the SQO cannot be built), the method
	* falls back to counting the full get_data() array.
	*
	* $this->pagination->limit and ->offset are set by the request config; a caller
	* may override the page size by passing $custom_limit.
	*
	* @param int|null $custom_limit [= null] Override the pagination limit from $this->pagination->limit. Pass null to use the configured value.
	* @return array Locators for the requested page (may be empty if the offset exceeds total).
	*/
	public function get_data_paginated( ?int $custom_limit=null ) : array {

		// limit
			$limit = isset($custom_limit)
				? $custom_limit
				: $this->pagination->limit;

		// offset
			$offset = $this->pagination->offset ?? 0;

		// always get data calculated from my parents that call the current section
			$data_paginated = component_relation_children::get_children(
				$this->section_id,
				$this->section_tipo,
				$this->tipo,
				$limit,
				$offset
			);

		// set total (count all children) only when the caller did not provide
		// it already: loading every child row just to count defeats pagination
			if (!isset($this->pagination->total)) {
				$total = self::count_children(
					$this->section_id,
					$this->section_tipo,
					$this->tipo
				);
				if ($total===null) {
					$data = $this->get_data();
					$total = is_array($data) ? count($data) : 0;
				}
				$this->pagination->total = $total;
			}


		return $data_paginated;
	}//end get_data_paginated



	/**
	* SET_DATA
	* Synchronises the child list by diffing $data against the existing children.
	*
	* Because this component owns no rows, "setting data" means:
	*  1. For every existing child locator NOT present in $data → call remove_child().
	*  2. For every incoming locator NOT already in the existing list → call add_child().
	*
	* Each add/remove operation writes through to the counterpart component_relation_parent
	* record (see update_parent()). The diff compares on ['section_tipo','section_id','from_component_tipo'].
	*
	* After the sync, $this->data_resolved is invalidated so the next get_data() call
	* re-reads the freshly saved state from the database.
	*
	* Prefer add_child() / remove_child() for incremental changes; this method is mainly
	* used by the generic save pipeline when a full replacement is required.
	*
	* In search mode the call delegates entirely to parent::set_data() (stored filter values
	* must be persisted in the matrix, unlike the read path which is always derived).
	*
	* @param array|null $data Array of locator objects to set as the new child list. Pass null or [] to remove all children.
	* @return bool True on success (individual child errors are logged but do not abort the loop).
	*/
	public function set_data( ?array $data ) : bool {

		/**
		 * SEARCH MODE: Special case behavior
		 * In search mode, this component delegates data storage to the parent class
		 * because search operations require actual data persistence (unlike normal mode
		 * where data is calculated from component_relation_parent relations).
		 * This maintains consistency with get_dato() which also uses parent behavior in search mode.
		 */
		if ($this->mode === 'search') {
			return parent::set_data($data);
		}

		// empty data: [] to null
		if ( empty($data) ) {
			$data = null;
		}

		// remove previous data
			$previous_data = $this->get_data() ?? [];
			if (!empty($previous_data)) {
				foreach ($previous_data as $locator) {

					$exist = locator::in_array_locator( $locator, $data ?? [], ['section_tipo','section_id','from_component_tipo']);
					if($exist===true){
						continue;
					}

					$result = $this->remove_child(
						$locator->section_tipo,
						$locator->section_id
					);
					if (!$result) {
						debug_log(__METHOD__
							. " Error on remove children" . PHP_EOL
							. 'result: ' . to_string($result) . PHP_EOL
							. 'locator: ' . to_string($locator)
							, logger::ERROR
						);
					}
				}
			}

		// add the new one if any
			if (!empty($data)) {
				foreach ($data as $locator) {

					$exist = locator::in_array_locator( $locator, $previous_data, ['section_tipo','section_id','from_component_tipo']);
					if($exist===true){
						continue;
					}

					$result	= (bool)$this->add_child(
						$locator->section_tipo,
						$locator->section_id
					);
					if (!$result) {
						$model = isset($locator->from_component_tipo)
							? ontology_node::get_model_by_tipo($locator->from_component_tipo,true)
							: 'Unknown';
						debug_log(__METHOD__
							. " Error on add children" . PHP_EOL
							. ' result: ' . to_string($result) . PHP_EOL
							. ' section_tipo: ' . to_string($this->section_tipo) . PHP_EOL
							. ' section_id: ' . to_string($this->section_id) . PHP_EOL
							. ' result: ' . to_string($result) . PHP_EOL
							. ' locator: ' . to_string($locator) . PHP_EOL
							. ' locator type: ' .  get_relation_name($locator->type ?? '') . PHP_EOL
							. ' from_component_tipo model: ' . $model . PHP_EOL
							, logger::ERROR
						);
						if(SHOW_DEBUG===true) {
							dump($data, ' data ++ '.to_string());
						}
					}
				}
			}

		// $this->update_parents($data);

		// cache invalidation
		// Force the next get_data() call to re-query the database so callers do not
		// see stale pre-save children after a set_data(). The assignment form
		// '= null' was replaced by unset() to fully remove the property and trigger
		// the isset() guard in get_data() rather than the null-check path.
		unset($this->data_resolved); //  = null;


		return true;
	}//end set_data



	/**
	* ADD_CHILD
	* Adds the current section as a child of the specified parent record.
	*
	* Delegates to update_parent() with action='add', which locates the target
	* component_relation_parent instance in $parent_section_tipo/$parent_section_id
	* and calls make_me_your_parent() on it before saving.
	*
	* @param string $parent_section_tipo The section tipo of the target parent record.
	* @param mixed $parent_section_id The section ID of the target parent record.
	* @param string|null $parent_tipo [= null] Explicit component tipo of the component_relation_parent. Resolved automatically when null.
	* @return bool True when the parent was updated and saved; false on resolution or save failure.
	*/
	public function add_child( string $parent_section_tipo, mixed $parent_section_id, ?string $parent_tipo=null ) : bool {

		$action = 'add';

		return $this->update_parent($action, $parent_section_tipo, $parent_section_id, $parent_tipo);
	}//end add_child



	/**
	* REMOVE_CHILD
	* Removes the current section from the child list of the specified parent record.
	*
	* Delegates to update_parent() with action='remove', which locates the target
	* component_relation_parent instance and calls remove_me_as_your_parent() on it
	* before saving.
	*
	* @param string $parent_section_tipo The section tipo of the target parent record.
	* @param mixed $parent_section_id The section ID of the target parent record.
	* @param string|null $parent_tipo [= null] Explicit component tipo of the component_relation_parent. Resolved automatically when null.
	* @return bool True when the parent was updated and saved; false on resolution or save failure.
	*/
	public function remove_child( string $parent_section_tipo, mixed $parent_section_id, ?string $parent_tipo=null ) : bool {

		$action = 'remove';

		return $this->update_parent($action, $parent_section_tipo, $parent_section_id, $parent_tipo);
	}//end remove_child



	/**
	* UPDATE_PARENT
	* Core write-through mechanism: modifies the component_relation_parent of a target
	* record so that the current section appears (or disappears) in its child list.
	*
	* Flow:
	*  1. Resolve $parent_tipo via get_ar_related_parent_tipo() when not provided.
	*  2. Guard: ensure the resolved tipo model is 'component_relation_parent'.
	*  3. Instantiate the component_relation_parent for ($parent_section_tipo, $parent_section_id).
	*  4. Call make_me_your_parent() or remove_me_as_your_parent() depending on $action.
	*  5. Save the parent component if the call reported a change.
	*  6. Call get_data() to warm the local cache with the updated state.
	*
	* The component instance is created with the caller's current mode so that search-
	* mode modifications do not accidentally persist to the live data store.
	*
	* Commented-out blocks are preserved from the original implementation; see inline
	* comments for context.
	*
	* @param string $action The mutation to apply: 'add' or 'remove'.
	* @param string $parent_section_tipo The section tipo of the parent record to modify.
	* @param int|string $parent_section_id The section ID of the parent record to modify.
	* @param string|null $parent_tipo [= null] Explicit component_relation_parent tipo. Resolved automatically when null.
	* @return bool True when the parent component was saved successfully; false on any resolution or save error.
	*/
	private function update_parent( string $action, string $parent_section_tipo, int|string $parent_section_id, ?string $parent_tipo=null ) : bool {

		// default bool result
			$result = false;

		// short vars
			$tipo			= $this->tipo;
			$section_tipo	= $this->section_tipo;
			$section_id		= $this->section_id;

		// parent_tipo. Resolve if null
			if (empty($parent_tipo)) {
				$ar_parent_tipo = component_relation_children::get_ar_related_parent_tipo($tipo, $section_tipo);
				// not found case
				if (empty($ar_parent_tipo)) {
					debug_log(__METHOD__
						." ERROR: Unable to resolve parent_tipo" . PHP_EOL
						.' tipo: ' . to_string($tipo) . PHP_EOL
						.' section_tipo: ' . to_string($section_tipo) . PHP_EOL
						.' section_id: ' . to_string($section_id) . PHP_EOL
						.' parent_section_tipo: ' . to_string($parent_section_tipo) . PHP_EOL
						.' parent_section_id: ' . to_string($parent_section_id) . PHP_EOL
						.' parent_tipo: ' . to_string($parent_tipo)
						, logger::ERROR
					);
					return false;
				}
				$parent_tipo = $ar_parent_tipo[0];
			}

		// model. Expected 'component_relation_parent'
			$model = ontology_node::get_model_by_tipo($parent_tipo, true);
			if ($model!=='component_relation_parent') {
				// wrong model case
				debug_log(__METHOD__
					." Wrong target model. Expected 'component_relation_parent" . PHP_EOL
					.' current model: ' . $model . PHP_EOL
					.' current tipo:  ' . $parent_tipo
					, logger::ERROR
				);
				return false;
			}

		// component_relation_parent instance
			$component_relation_parent = component_common::get_instance(
				$model,
				$parent_tipo,
				$parent_section_id,
				$this->mode,  // CRITICAL: Preserve the current mode to ensure consistency.
						      // In search mode, the parent component must also operate in search mode
						      // to prevent accidental data persistence when modifying relations.
				DEDALO_DATA_NOLAN,
				$parent_section_tipo
			);

		// change link to me in relation_children
			switch ($action) {
				case 'add':
					$changed = (bool)$component_relation_parent->make_me_your_parent(
						$section_tipo,
						$section_id
					);
					break;

				case 'remove':
					$changed = (bool)$component_relation_parent->remove_me_as_your_parent(
						$section_tipo,
						$section_id
					);
					break;

				default:
					$changed = false;
					debug_log(__METHOD__
						." Error on update_parent. Invalid action ". PHP_EOL
						.' action: ' .$action
						, logger::ERROR
					);
					break;
			}

		// save if changed
			if ($changed===true) {

				// search cases do not update parent data
				// An earlier guard here prevented saves in search mode, but it was
				// removed because search-mode set_data() now delegates entirely to
				// parent::set_data() before reaching this method, making the guard
				// redundant. Left as documentation only.
				// if ($this->mode === 'search') {
				// 	$result = true;
				// }else{
					$saved = $component_relation_parent->save();
					if ($saved) {
						$result = true;
					}
				// }

				// cache warm-up
				// Re-query after save so subsequent get_data() calls in the same request
				// see the updated children list without a redundant DB round-trip.
				// The earlier approach of setting $this->data_resolved = null is also
				// sufficient; get_data() is called here to pre-populate the cache.
				// $this->data_resolved = null;
				$this->get_data();
			}


		return (bool)$result;
	}//end update_parent



	/**
	* GET_CHILDREN
	* Returns direct (non-recursive) children of a section as an array of locators.
	*
	* The data is not stored in this component's own column; instead the method
	* queries the matrix table for records whose component_relation_parent locator
	* points to ($section_tipo, $section_id). Each matching record becomes a locator
	* in the returned array:
	*   locator->section_tipo       : child section tipo
	*   locator->section_id         : child section id
	*   locator->from_component_tipo: the component_relation_children tipo
	*   locator->type               : DEDALO_RELATION_TYPE_CHILDREN_TIPO ('dd48')
	*
	* The SQO is built via build_children_sqo() which applies limit/offset and an
	* optional section_map-based ORDER BY. Pass limit=0 to retrieve all children.
	*
	* @param int|string $section_id The ID of the parent record.
	* @param string $section_tipo The tipo of the parent section.
	* @param string|null $component_tipo [= null] The component_relation_children tipo. Resolved from $section_tipo when null.
	* @param int|null $limit [= 0] Maximum rows to return (0 = no limit).
	* @param int|null $offset [= 0] Row offset for pagination.
	* @return array Flat array of locator objects; empty array when no children or resolution fails.
	*/
	public static function get_children( int|string $section_id, string $section_tipo, ?string $component_tipo=null, ?int $limit=0, ?int $offset=0 ) : array {

		$children = [];

		// Locate component children in section when is not received
		// Search always (using cache) for allow mix different section tipo (like beginning from root hierarchy note)
			if (empty($component_tipo)) {
				$component_tipo = component_relation_children::get_children_tipo($section_tipo);
			}

		// get the ontology node tipo of the related component_relation_parent assigned to my tipo.
			$ar_parent_tipo = component_relation_children::get_ar_related_parent_tipo( $component_tipo, $section_tipo );
			if( empty($ar_parent_tipo) || !isset($ar_parent_tipo[0])){
				return $children;
			}
			$parent_tipo = $ar_parent_tipo[0];

		// build SQO using unified builder
			$sqo = self::build_children_sqo(
				$section_id,
				$section_tipo,
				$component_tipo,
				$parent_tipo,
				[
					'limit'		=> $limit,
					'offset'	=> $offset,
					'order'		=> true
				]
			);
			if ($sqo === null) {
				return $children;
			}

			$search		= search::get_instance($sqo);
			$db_result	= $search->search();

			foreach ($db_result as $row) {

				$locator = new locator();
					$locator->set_section_tipo($row->section_tipo);
					$locator->set_section_id($row->section_id);
					$locator->set_from_component_tipo($component_tipo);
					$locator->set_type(DEDALO_RELATION_TYPE_CHILDREN_TIPO);

				$children[] = $locator;
			}

		return $children;
	}//end get_children



	/**
	* COUNT_CHILDREN
	* Returns the total number of direct children without loading child rows.
	*
	* Builds the same SQO as get_children() but calls search::count() instead of
	* search::search(), which issues a SQL COUNT(*) query. This avoids fetching all
	* locator data just to measure the list length — critical for large hierarchies
	* where get_data_paginated() needs a total for the pagination footer.
	*
	* Returns null (not 0) when the SQO cannot be built, so callers can distinguish
	* "zero children" from "count unavailable" and apply a fallback strategy.
	*
	* @param int|string $section_id The ID of the parent record.
	* @param string $section_tipo The tipo of the parent section.
	* @param string|null $component_tipo [= null] The component_relation_children tipo. Resolved from $section_tipo when null.
	* @return int|null Total child count, or null if the count query could not be executed.
	*/
	public static function count_children( int|string $section_id, string $section_tipo, ?string $component_tipo=null ) : ?int {

		// Locate component children in section when is not received
			if (empty($component_tipo)) {
				$component_tipo = component_relation_children::get_children_tipo($section_tipo);
			}

		// get the ontology node tipo of the related component_relation_parent assigned to my tipo.
			$ar_parent_tipo = component_relation_children::get_ar_related_parent_tipo( $component_tipo, $section_tipo );
			if( empty($ar_parent_tipo) || !isset($ar_parent_tipo[0])){
				return 0;
			}
			$parent_tipo = $ar_parent_tipo[0];

		// build SQO using unified builder (no order: irrelevant for counting)
			$sqo = self::build_children_sqo(
				$section_id,
				$section_tipo,
				$component_tipo,
				$parent_tipo,
				[
					'limit'	=> 0,
					'order'	=> false
				]
			);
			if ($sqo === null) {
				return null;
			}
			$sqo->set_full_count(true);

		$search			= search::get_instance($sqo);
		$records_data	= $search->count();

		if (!isset($records_data->total)) {
			return null;
		}

		return (int)$records_data->total;
	}//end count_children



	/**
	* GET_CHILDREN_OF_TYPE
	* Returns direct children filtered by their descriptor classification.
	*
	* Builds the same SQO as get_children() but adds a second filter locator that
	* constrains results to records whose is_descriptor component points to the
	* DEDALO_SECTION_SI_NO section (dd64) with section_id matching the requested type:
	*   'descriptor'     → NUMERICAL_MATRIX_VALUE_YES (1)
	*   'non_descriptor' → NUMERICAL_MATRIX_VALUE_NO  (2)
	*
	* The is_descriptor component tipo is read from section_map->thesaurus->is_descriptor.
	* If that key is absent in the section map the descriptor filter is silently skipped
	* and all children are returned (matching the unfiltered get_children() behaviour).
	*
	* Primarily used by the Thesaurus tree to separate preferred-term children from
	* non-preferred (USE/UF) alternatives.
	*
	* @param int|string $section_id The ID of the parent record.
	* @param string $section_tipo The tipo of the parent section.
	* @param string $type [= 'descriptor'] Descriptor class to return: 'descriptor' or 'non_descriptor'.
	* @param string|null $component_tipo [= null] The component_relation_children tipo. Resolved from $section_tipo when null.
	* @param int|null $limit [= 0] Maximum rows to return (0 = no limit).
	* @param int|null $offset [= 0] Row offset for pagination.
	* @return array Flat array of locators for matching children; empty array on resolution failure or no match.
	*/
	public static function get_children_of_type(
		int|string $section_id,
		string $section_tipo,
		string $type = 'descriptor',
		?string $component_tipo = null,
		?int $limit = 0,
		?int $offset = 0
	) : array {

		$children = [];

		// Locate component children in section when is not received
			if (empty($component_tipo)) {
				$component_tipo = component_relation_children::get_children_tipo($section_tipo);
			}

		// get the ontology node tipo of the related component_relation_parent assigned to my tipo.
			$ar_parent_tipo = component_relation_children::get_ar_related_parent_tipo($component_tipo, $section_tipo);
			if (empty($ar_parent_tipo) || !isset($ar_parent_tipo[0])) {
				return $children;
			}
			$parent_tipo = $ar_parent_tipo[0];

		// build SQO using unified builder with descriptor_type filter
			$sqo = self::build_children_sqo(
				$section_id,
				$section_tipo,
				$component_tipo,
				$parent_tipo,
				[
					'limit'				=> $limit,
					'offset'			=> $offset,
					'order'				=> true,
					'descriptor_type'	=> $type
				]
			);
			if ($sqo === null) {
				return $children;
			}

			$search		= search::get_instance($sqo);
			$db_result	= $search->search();

			foreach ($db_result as $row) {

				$locator = new locator();
					$locator->set_section_tipo($row->section_tipo);
					$locator->set_section_id($row->section_id);
					$locator->set_from_component_tipo($component_tipo);
					$locator->set_type(DEDALO_RELATION_TYPE_CHILDREN_TIPO);

				$children[] = $locator;
			}

		return $children;
	}//end get_children_of_type



	/**
	* GET_CHILDREN_RECURSIVE
	* Returns all descendants of the given section by recursively expanding children.
	*
	* Each level calls get_children() for direct children, then recurses into each
	* child. Results are accumulated into a flat array — the returned list contains
	* all descendants at every depth, not just direct children.
	*
	* Cycle detection is enforced via the $visited map (keyed by "$section_tipo_$section_id").
	* A node already in $visited is skipped and returns [] to prevent infinite loops in
	* circular or diamond-shaped hierarchies. $visited is passed by value, so independent
	* subtrees do not share visit state; use get_children_recursive_batch() or
	* get_children_recursive_shared() when a shared accumulator is needed.
	*
	* (!) Warning: this method can issue O(depth × branching_factor) SQL queries.
	* For large hierarchies prefer get_children_recursive_batch() which shares the
	* visited map and avoids redundant subtree expansion.
	*
	* @param int|string $section_id The ID of the root record to expand.
	* @param string $section_tipo The tipo of the root section.
	* @param string|null $component_tipo [= null] The component_relation_children tipo. Resolved from $section_tipo when null.
	* @param array $visited [= []] Already-expanded nodes (keyed by "tipo_id"). Pass [] on first call.
	* @return array Flat array of descendant locators at all depths; empty array when the root has no children or is already visited.
	*/
	public static function get_children_recursive(int|string $section_id, string $section_tipo, ?string $component_tipo = null, array $visited = []) : array {

		// Cycle detection
		$current_node_key = $section_tipo . '_' . $section_id;
		if (isset($visited[$current_node_key])) {
			return [];
		}
		$visited[$current_node_key] = true;

		$all_children = component_relation_children::get_children($section_id, $section_tipo, $component_tipo);

		foreach ($all_children as $child) {
			$descendants = component_relation_children::get_children_recursive($child->section_id, $child->section_tipo, $component_tipo, $visited); // Recursively get descendants
			$all_children = [...$all_children, ...$descendants];
		}

		return $all_children;
	}//end get_children_recursive



	/**
	* GET_CHILDREN_RECURSIVE_BATCH
	* Resolves the recursive children of many root records in a single pass, sharing one
	* cycle-detection/visited set across all roots. This avoids re-walking subtrees that are
	* shared between roots (the per-root get_children_recursive() always starts with an empty
	* visited set, so a node reachable from N roots is expanded N times).
	* Used by search::search_children_recursive to collapse its per-parent-row N+1 loop.
	* @param array $roots
	* 	List of objects/locators exposing ->section_id and ->section_tipo
	* @param ?string $component_tipo = null
	* @return array $all_children
	* 	Flat list of descendant locators (deduplicated by section_tipo+section_id)
	*/
	public static function get_children_recursive_batch( array $roots, ?string $component_tipo=null ) : array {

		$visited		= [];
		$all_children	= [];

		foreach ($roots as $root) {

			$section_id		= $root->section_id ?? null;
			$section_tipo	= $root->section_tipo ?? null;
			if ($section_id===null || $section_tipo===null) {
				continue;
			}

			// Shared $visited (passed by reference) prevents re-expanding subtrees already
			// reached from a previous root, and dedups the returned descendants.
			$descendants = self::get_children_recursive_shared($section_id, $section_tipo, $component_tipo, $visited);
			if (!empty($descendants)) {
				$all_children = [...$all_children, ...$descendants];
			}
		}

		return $all_children;
	}//end get_children_recursive_batch



	/**
	* GET_CHILDREN_RECURSIVE_SHARED
	* Same as get_children_recursive but takes $visited BY REFERENCE so a single accumulator
	* can be shared across multiple root expansions (see get_children_recursive_batch). A node
	* already in $visited is skipped, so each node is expanded at most once per batch.
	* @param int|string $section_id
	* @param string $section_tipo
	* @param ?string $component_tipo
	* @param array $visited (by reference)
	* @return array $all_children
	*/
	public static function get_children_recursive_shared(int|string $section_id, string $section_tipo, ?string $component_tipo, array &$visited) : array {

		// Cycle / shared-subtree detection
		$current_node_key = $section_tipo . '_' . $section_id;
		if (isset($visited[$current_node_key])) {
			return [];
		}
		$visited[$current_node_key] = true;

		$all_children = component_relation_children::get_children($section_id, $section_tipo, $component_tipo);

		foreach ($all_children as $child) {
			$descendants = self::get_children_recursive_shared($child->section_id, $child->section_tipo, $component_tipo, $visited);
			if (!empty($descendants)) {
				$all_children = [...$all_children, ...$descendants];
			}
		}

		return $all_children;
	}//end get_children_recursive_shared



	/**
	* GET_AR_RELATED_PARENT_TIPO
	* Resolves the ontology tipo(s) of the component_relation_parent that is paired
	* with the given component_relation_children $tipo.
	*
	* Resolution order:
	*  1. Return from static cache ($ar_parent_tipo_cache) if already resolved.
	*  2. Call common::get_ar_related_by_model('component_relation_parent', $tipo) to
	*     find the explicitly linked parent component in the ontology.
	*  3. Fallback: search the section for any component of model component_relation_parent
	*     via section::get_ar_children_tipo_by_model_name_in_section(). This path
	*     indicates an incomplete ontology definition and logs a logger::ERROR warning.
	*  4. If neither path yields a result, log a second ERROR and return [].
	*
	* Results are cached in self::$ar_parent_tipo_cache so repeated calls (e.g.,
	* inside get_children() loops) do not re-query the ontology.
	*
	* @param string $tipo The tipo of the component_relation_children instance.
	* @param string $section_tipo The containing section tipo (used only in the fallback lookup).
	* @return array Array of related component_relation_parent tipos (usually one element); empty array on failure.
	*/
	public static function get_ar_related_parent_tipo( string $tipo, string $section_tipo ) : array {

		// cache
		$cache_key = $tipo . '_' . $section_tipo;
		if( isset(self::$ar_parent_tipo_cache[$cache_key]) ){
			return self::$ar_parent_tipo_cache[$cache_key];
		}

		// debug
		$model = ontology_node::get_model_by_tipo($tipo,true);
		if ($model!==get_called_class()) {
			debug_log(__METHOD__
				. " Error! Calling get_ar_related_by_model expected 'component_relation_children' but resolved: " .$model . PHP_EOL
				. ' children tipo: ' . to_string($tipo) . PHP_EOL
				. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
				. ' model: ' . to_string($model)
				, logger::ERROR
			);
		}

		// get ontology related parent
		$ar_parent_tipo = common::get_ar_related_by_model( 'component_relation_parent', $tipo );

		// fallback: search the parent related tipo in the section components
		if( empty($ar_parent_tipo) ){

			// Look component parent across related section
			// Resolve parent component tipo from section_tipo
				$ar_parent_tipo = section::get_ar_children_tipo_by_model_name_in_section(
					$section_tipo, // string $section_tipo
					['component_relation_parent'], // array $ar_model_name_required
					true, // bool from_cache
					true, // bool resolve_virtual
					true, // bool recursive
					true // bool search_exact
				);

				debug_log(__METHOD__
					. " Bad definition in ontology, this related_children has not related his parent, please assign the component_relation_parent to it. ---||--- using section_tipo to resolve it " . PHP_EOL
					. ' children tipo: ' . to_string($tipo) . PHP_EOL
					. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
					. ' calculated parent tipo: ' . to_string($ar_parent_tipo)
					, logger::ERROR
				);

				if( empty($ar_parent_tipo) ){
					debug_log(__METHOD__
						. " Error! Unable to resolve related_parent_tipo from get_ar_children_tipo_by_model_name_in_section " . PHP_EOL
						. ' children tipo: ' . to_string($tipo) . PHP_EOL
						. ' section_tipo: ' . to_string($section_tipo)
						, logger::ERROR
					);
				}
		}

		// cache
		self::$ar_parent_tipo_cache[$cache_key] = $ar_parent_tipo;


		return $ar_parent_tipo;
	}//end get_ar_related_parent_tipo



	/**
	* GET_CHILDREN_TIPO
	* Returns the ontology tipo of the first component_relation_children found in
	* a given section's component tree.
	*
	* Used by get_children() and count_children() when $component_tipo is not already
	* known, to convert a $section_tipo into the concrete children-component tipo
	* needed to build the SQO filter locator. Virtual sections are resolved
	* and the search is recursive across nested section components.
	*
	* Returns null if no component_relation_children exists in the section, logging an
	* ERROR so the hierarchy can be diagnosed at the ontology level.
	*
	* @param string $section_tipo The tipo of the section to inspect.
	* @return string|null The component tipo of the first component_relation_children instance, or null if none is defined.
	*/
	public static function get_children_tipo( string $section_tipo ) : ?string {

		$children_tipo = null;

		// Locate component children in section when is not received
		// Search always (using cache) for allow mix different section tipo (like beginning from root hierarchy note)
			$ar_children_tipo = section::get_ar_children_tipo_by_model_name_in_section(
				$section_tipo, // string section_tipo
				['component_relation_children'], // array ar_model_name_required
				true, // bool from_cache
				true, // bool resolve_virtual
				true, // bool recursive
				true, // bool search_exact
				false // bool|array ar_tipo_exclude_elements
			);
			if (empty($ar_children_tipo)) {
				debug_log(__METHOD__
					." Ignored search get_children because this section ($section_tipo) do not have any component of model: component_relation_children "
					, logger::ERROR
				);
				return $children_tipo;
			}
			$children_tipo = reset($ar_children_tipo);


		return $children_tipo;
	}//end get_children_tipo







	/**
	* SORT_CHILDREN
	* Persists a new sort order for the children of a given parent record.
	*
	* The display order of children is stored in a dedicated order component (typically
	* component_number) identified by section_map->thesaurus->order for the section.
	* This component uses the dataframe pattern: each value is scoped to a parent
	* context (parent_section_tipo + parent_section_id), so the same child record can
	* have different positions under different parents.
	*
	* The method iterates $locators in ascending order position (1, 2, 3 …) and:
	*  1. Reads the current context-scoped value via get_value_by_context().
	*  2. Skips the record if the order value is already correct.
	*  3. Writes the new position via update_value_by_context() + save().
	*  4. Appends an entry to $changed so callers know which records were mutated.
	*
	* Returns false when section_map->thesaurus->order is not defined.
	*
	* @param string $section_tipo The tipo of the child section (determines the order component).
	* @param array $locators Ordered list of locator objects (each must have ->section_tipo and ->section_id). Position is 1-based ascending.
	* @param string $parent_section_tipo The section tipo of the parent used as order context.
	* @param int $parent_section_id The section ID of the parent used as order context.
	* @return array|false Array of changed-position records (each has 'value' and 'locator'), or false on configuration error.
	* @see dd_ts_api::save_order
	*/
	public static function sort_children(
		string $section_tipo,
		array $locators,
		string $parent_section_tipo,
		int $parent_section_id
	) : array|false {

		$changed = [];

		$section_map = section::get_section_map( $section_tipo );
		if (!isset($section_map->thesaurus->order)) {
			debug_log(__METHOD__
				. " Error. Invalid section map. order property not found in section list of section '$section_tipo'. Ignored sort_children action." . PHP_EOL
				. ' section_map: ' . to_string($section_map)
				, logger::ERROR
			);
			return false;
		}

		// component commons
		$component_tipo	= $section_map->thesaurus->order;
		$model			= ontology_node::get_model_by_tipo($component_tipo,true); // component_number expected

		$order = 0;
		foreach ($locators as $locator) {

			$order++;

			$component = component_common::get_instance(
				$model, // string model
				$component_tipo, // string tipo
				$locator->section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_NOLAN, // string lang
				$locator->section_tipo // string section_tipo
			);

			// Get current value for this parent context
			$current_value = $component->get_value_by_context(
				$parent_section_tipo,
				$parent_section_id
			);

			// check if value changes (skip if same value)
			if ((int)$current_value === $order) {
				continue;
			}

			// Update value with parent context using dataframe method
			$updated = $component->update_value_by_context(
				$order,
				$parent_section_tipo,
				$parent_section_id
			);

			if ($updated === true) {
				$component->save();
				$changed[] = (object)[
					'value'		=> $order,
					'locator'	=> $locator
				];
			}
		}


		return $changed;
	}//end sort_children



	/**
	* BUILD_CHILDREN_SQO
	* Builds a configured search_query_object for querying children of a parent record.
	*
	* This is the single SQO factory used by get_children(), count_children(),
	* get_children_of_type(), and has_children_of_type(). Centralising construction
	* ensures that all callers apply the same table, mode, filter, and order logic.
	*
	* The core filter locator represents the parent reference stored in the children's
	* component_relation_parent column:
	*   section_tipo       → $section_tipo (the parent)
	*   section_id         → $section_id   (the parent)
	*   from_component_tipo→ $parent_tipo  (the component_relation_parent tipo)
	*   type               → DEDALO_RELATION_TYPE_PARENT_TIPO ('dd47')
	*
	* The SQO operates in 'related' mode targeting only the matrix table derived
	* from $section_tipo, so cross-table children of unrelated sections are excluded.
	*
	* Ordering uses the section_map->thesaurus->order component as a context-scoped
	* integer dataframe value. The SQL fragment uses column_sql (not column) so the
	* trait.order handler treats it as a trusted server-built expression rather than
	* a user-supplied identifier.
	*
	* @param int|string $section_id The section ID of the parent record.
	* @param string $section_tipo The section tipo of the parent record.
	* @param string $component_tipo The component_relation_children tipo (used only when logging; $parent_tipo carries the SQO filter).
	* @param string $parent_tipo The component_relation_parent tipo used as the from_component_tipo in the filter locator.
	* @param array $options {
	*    @type int    $limit              Maximum rows (0 = no limit; default 0).
	*    @type int    $offset             Row offset for pagination (default 0).
	*    @type bool   $order              Whether to apply section_map sort order (default true).
	*    @type string|null $descriptor_type Filter by descriptor status: 'descriptor' maps to NUMERICAL_MATRIX_VALUE_YES (1);
	*                                     'non_descriptor' maps to NUMERICAL_MATRIX_VALUE_NO (2); null returns all (default null).
	*    @type array  $additional_locators Extra filter locators merged after the parent locator (default []).
	*    @type string|null $filter_operator Operator joining multiple filter locators: 'AND' or 'OR' (default null — single locator).
	* }
	* @return search_query_object|null Fully configured SQO ready for search::get_instance(), or null on descriptor_type validation error.
	*/
	private static function build_children_sqo(
		int|string $section_id,
		string $section_tipo,
		string $component_tipo,
		string $parent_tipo,
		array $options = []
	) : ?search_query_object {

		// options with defaults
			$limit				= $options['limit'] ?? 0;
			$offset				= $options['offset'] ?? 0;
			$order				= $options['order'] ?? true;
			$descriptor_type	= $options['descriptor_type'] ?? null;
			$additional_locators= $options['additional_locators'] ?? [];
			$filter_operator	= $options['filter_operator'] ?? null;

		// filter locator
			$filter_locator = new locator();
				$filter_locator->set_section_tipo($section_tipo);
				$filter_locator->set_section_id($section_id);
				$filter_locator->set_from_component_tipo($parent_tipo);
				$filter_locator->set_type(DEDALO_RELATION_TYPE_PARENT_TIPO);

		// build filter locators array
			$filter_locators = [$filter_locator];

		// descriptor filter: add is_descriptor locator if descriptor_type is specified
			if ($descriptor_type !== null) {
				$section_map = section::get_section_map($section_tipo);
				$is_descriptor_tipo = $section_map->thesaurus->is_descriptor ?? null;
				if (!empty($is_descriptor_tipo)) {
					switch ($descriptor_type) {
						case 'descriptor':
							$target_section_id = NUMERICAL_MATRIX_VALUE_YES;
							break;
						case 'non_descriptor':
							$target_section_id = NUMERICAL_MATRIX_VALUE_NO;
							break;
						default:
							debug_log(__METHOD__
								. ' Invalid descriptor_type ' . PHP_EOL
								. 'descriptor_type: ' . to_string($descriptor_type)
								, logger::ERROR
							);
							return null;
					}

					$is_descriptor_locator = new locator();
						$is_descriptor_locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
						$is_descriptor_locator->set_section_id($target_section_id);
						$is_descriptor_locator->set_from_component_tipo($is_descriptor_tipo);
						$is_descriptor_locator->set_type(DEDALO_RELATION_TYPE_LINK);

					$filter_locators[] = $is_descriptor_locator;
					$filter_operator = 'AND'; // Always AND for descriptor filter
				}
			}

			if (!empty($additional_locators)) {
				$filter_locators = array_merge($filter_locators, $additional_locators);
			}

		// table
			$table = common::get_matrix_table_from_tipo($section_tipo);

		// build SQO
			$sqo = new search_query_object();
				// section_tipo ['all']: the child rows may belong to any section tipo
				// within the table, so we open the section_tipo filter wide. The actual
				// table is constrained via set_tables([$table]) below, which limits the
				// query to the parent section's matrix table and avoids cross-table hits.
				$sqo->set_section_tipo(['all']); // open wide for Ontology cross section parents
				$sqo->set_mode('related');
				$sqo->set_full_count(false);
				$sqo->set_filter_by_locators($filter_locators);
				if (!empty($filter_operator)) {
					$sqo->set_filter_by_locators_op($filter_operator);
				}
				$sqo->set_limit($limit);
				$sqo->set_offset($offset);
				$sqo->set_tables([$table]); // Search references only in current table

		// order. It is defined in section 'section_map' item as {"order":"ontology41"}
			if ($order === true) {
				$section_map = section::get_section_map($section_tipo);
				if (isset($section_map->thesaurus->order)) {
					$order_component_tipo = $section_map->thesaurus->order;

						// SEC-036 follow-up: defence-in-depth on the server-built SQL fragment.
					// `$order_component_tipo`/`$section_tipo` originate from the section
					// ontology map (server-internal) but `safe_tipo()` is applied anyway;
					// `$section_id` is interpolated as plain integer. Field name is
					// `column_sql` (not `column`) so `trait.order.php` recognises this
					// as a trusted server-built fragment and skips the strict identifier
					// regex; HTTP-supplied SQO must not carry `column_sql`.
					$safe_order_tipo	= safe_tipo((string)$order_component_tipo);
					$safe_section_tipo	= safe_tipo((string)$section_tipo);
					$safe_section_id	= (int)$section_id;
					if ($safe_order_tipo===false || $safe_section_tipo===false) {
						debug_log(__METHOD__
							." Ignored order build: invalid order/section tipo" . PHP_EOL
							.' order_component_tipo: ' . to_string($order_component_tipo) . PHP_EOL
							.' section_tipo: ' . to_string($section_tipo)
							, logger::ERROR
						);
					} else {
						$path = [
							(object)[
								'component_tipo'	=> $safe_order_tipo,
								'model'				=> SHOW_DEBUG===true ? ontology_node::get_model_by_tipo($safe_order_tipo,true) : $safe_order_tipo,
								'name'				=> SHOW_DEBUG===true ? ontology_node::get_term_by_tipo($safe_order_tipo) : $safe_order_tipo,
								'section_tipo'		=> $safe_section_tipo,
								'column_sql'		=> '(jsonb_path_query_first(number, \'$.'.$safe_order_tipo.'[*] ? (@.section_tipo_key == "'.$safe_section_tipo.'" && @.section_id_key == '.$safe_section_id.').value\') #>> \'{}\')::integer'
							]
						];
						$order_obj = (object)[
							'direction'	=> 'ASC',
							'path'		=> $path
						];
						$sqo->set_order([$order_obj]);
					}
				}
			}

		return $sqo;
	}//end build_children_sqo



	/**
	* HAS_CHILDREN_OF_TYPE
	* Returns true if the given section record has at least one child of the requested
	* descriptor type; false otherwise.
	*
	* Issues a LIMIT 1 search via build_children_sqo() with the descriptor_type option
	* so only a single matching row is fetched rather than loading the full child list.
	* The descriptor status is stored in the section field identified by
	* section_map->thesaurus->is_descriptor and resolved against the DEDALO_SECTION_SI_NO
	* boolean section (dd64), where NUMERICAL_MATRIX_VALUE_YES (1) = descriptor,
	* NUMERICAL_MATRIX_VALUE_NO (2) = non-descriptor.
	*
	* Used in the Thesaurus UI to toggle expand/collapse indicators for descriptor
	* and non-descriptor child branches without loading all descendants.
	*
	* @param int|string $section_id The section ID of the parent record to inspect.
	* @param string $section_tipo The section tipo of the parent record.
	* @param string $component_tipo The component_relation_children tipo for this section.
	* @param string $type The descriptor classification to check: 'descriptor' or 'non_descriptor'.
	* @return bool True when at least one child of the requested type exists; false on no match or resolution failure.
	*/
	public static function has_children_of_type( int|string $section_id, string $section_tipo, string $component_tipo, string $type ) : bool {

		// get the ontology node tipo of the related component_relation_parent assigned to my tipo.
			$ar_parent_tipo = component_relation_children::get_ar_related_parent_tipo( $component_tipo, $section_tipo );
			if( empty($ar_parent_tipo) ){
				return false;
			}
			$parent_tipo = $ar_parent_tipo[0];

		// build SQO using unified builder with descriptor_type filter
			$sqo = self::build_children_sqo(
				$section_id,
				$section_tipo,
				$component_tipo,
				$parent_tipo,
				[
					'limit'				=> 1,
					'order'				=> false,
					'descriptor_type'	=> $type
				]
			);
			if ($sqo === null) {
				return false;
			}

			$search		= search::get_instance($sqo);
			$db_result	= $search->search();

			// Existence check: at least one matching row means the type is present.
			// row_count() === 0 → no child of requested type → return false.
			// row_count() >= 1 → at least one match found  → return true.
			// (The stale comment below is from an earlier iteration and is misleading;
			// the logic is correct regardless of descriptor vs non_descriptor type.)
			$result	= $db_result->row_count() === 0 ? false : true ;


		return $result;
	}//end has_children_of_type



	/**
	* SEARCH_OPERATORS_INFO
	* Suppresses the search operators exposed by the trait.
	*
	* The trait search_component_relation_children defines a full operator set
	* (!*, *, !=, !==) in its own search_operators_info() implementation. This
	* class-level override returns an empty array to hide those operators from the
	* UI operator picker for this specific component — it does NOT disable the SQL
	* resolution methods, which remain callable from trait dispatch.
	*
	* (!) If search operators need to be re-enabled for this component, remove this
	* method and let the trait implementation take effect.
	*
	* @return array Always returns an empty array, suppressing all visible search operators.
	*/
	public function search_operators_info() : array {

		$ar_operators = [];

		return $ar_operators;
	}//end search_operators_info



}//end component_relation_children
