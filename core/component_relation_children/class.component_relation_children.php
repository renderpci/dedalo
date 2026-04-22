<?php declare(strict_types=1);
include_once 'trait.search_component_relation_children.php';
/**
* COMPONENT_RELATION_CHILDREN
* Class to manage children relations between sections.
* It does not store its own data, it only manages the component_relation_parent data in 'reverse' mode.
* This component is responsible for identifying and listing sections that reference the current section
* via a parent relation component. It acts as a read-only view of these relationships from the
* perspective of the child, although it provides utility methods to modify the relationship
* by interacting with the parent component.
*
* @package Dédalo
* @subpackage Core
*/
class component_relation_children extends component_relation_common {



	// traits. Files added to current class file to split the large code.
	use search_component_relation_children;

	// relation_type defaults
	protected $default_relation_type		= DEDALO_RELATION_TYPE_CHILDREN_TIPO;
	protected $default_relation_type_rel	= null;

	// test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];

	// ar_target_section_tipo
	public $ar_target_section_tipo;	// Used to fix section tipo (calculated from the related component of type section) Could be virtual or real

	// Cache for ar_related_parent_tipo
	public static $ar_parent_tipo_cache = [];



	/**
	* SAVE
	* Overwrite relation common action.
	* This component does not store data directly, so this method simply returns true.
	*
	* @return bool Always returns true.
	*/
	public function save() : bool {
		// Noting to do. This component don`t save
		return true;
	}//end save



	/**
	* GET_DATA
	* Get data from its related parent.
	* component_relation_children doesn't store data, it retrieves its data by resolving the parent relations.
	* It searches for all sections that have the current section as a parent.
	*
	* @see component_common->get_data()
	* @return array|null An array of locators representing the children sections, or null if empty.
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
	* Gets paginated data (inverse locators from component parent result).
	* This handles strict limit and offset logic typically populated from the API request context.
	*
	* @param int|null $custom_limit Optional custom limit to override the standard pagination limit.
	* @return array The array of locators for the current page.
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


		return $data_paginated;
	}//end get_data_paginated



	/**
	* SET_DATA
	* Sets the data for the component.
	* Note that current component DOES NOT STORE DATA directly.
	* Instead, it updates the related 'component_relation_parent' to link to self.
	* This method compares the provided data with existing data and adds/removes children as necessary.
	* Don't use this method regularly; it is preferable to use 'add_children' method for every new relation.
	*
	* @param array|null $data The array of locator objects to set.
	*	When data is string is because is a JSON encoded data.
	* @return bool True on success.
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

		// force read the new value on get_data (prevent cache inconsistency)
		unset($this->data_resolved); //  = null;


		return true;
	}//end set_data



	/**
	* ADD_CHILD
	* Alias of update_parent with specific action 'add'.
	* Adds a relationship between the current section (child) and the specified parent.
	*
	* @param string $parent_section_tipo The section tipo of the parent.
	* @param mixed $parent_section_id The section ID of the parent.
	* @param string|null $parent_tipo Optional. The specific component tipo of the parent relation.
	* @return bool True on success.
	*/
	public function add_child( string $parent_section_tipo, mixed $parent_section_id, ?string $parent_tipo=null ) : bool {

		$action = 'add';

		return $this->update_parent($action, $parent_section_tipo, $parent_section_id, $parent_tipo);
	}//end add_child



	/**
	* REMOVE_CHILD
	* Alias of update_parent with specific action 'remove'.
	* Removes the relationship between the current section (child) and the specified parent.
	*
	* @param string $parent_section_tipo The section tipo of the parent.
	* @param mixed $parent_section_id The section ID of the parent.
	* @param string|null $parent_tipo Optional. The specific component tipo of the parent relation.
	* @return bool True on success.
	*/
	public function remove_child( string $parent_section_tipo, mixed $parent_section_id, ?string $parent_tipo=null ) : bool {

		$action = 'remove';

		return $this->update_parent($action, $parent_section_tipo, $parent_section_id, $parent_tipo);
	}//end remove_child



	/**
	* UPDATE_PARENT
	* Locate current section component_relation_children and remove given parent_section_id, parent_section_tipo combination from data.
	* This method interacts with the corresponding component_relation_parent to update the relationship.
	*
	* @param string $action The action to perform: 'remove' or 'add'.
	* @param string $parent_section_tipo The section tipo of the parent to update.
	* @param int|string $parent_section_id The section ID of the parent to update.
	* @param string|null $parent_tipo Optional. The specific component tipo of the parent relation. If null, it is resolved automatically.
	* @return bool True on success, false on failure.
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
				// if ($this->mode === 'search') {
				// 	$result = true;
				// }else{
					$saved = $component_relation_parent->save();
					if ($saved) {
						$result = true;
					}
				// }

				// force read the new value on get_data (prevent cache inconsistency)
				// $this->data_resolved = null;
				$this->get_data();
			}


		return (bool)$result;
	}//end update_parent



	/**
	* GET_CHILDREN
	* Get children data of current section.
	* This component has not real data, to obtain its data search the component_related_parent that call this section
	* the found sections will be the children_data.
	* @param int|string $section_id
	* @param string $section_tipo
	* @param string|null $component_tipo = null
	*	Optional. Previously calculated from structure using current section tipo info or calculated inside from section_tipo
	* @param int|null $limit = 0
	* @param int|null $offset = 0
	* @return array $children
	*	Array of locators
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
	* GET_CHILDREN_OF_TYPE
	* Get children filtered by descriptor type (descriptor or non_descriptor).
	* Uses the unified build_children_sqo() with descriptor_type option.
	*
	* @param int|string $section_id The section ID of the parent.
	* @param string $section_tipo The section tipo of the parent.
	* @param string $type The descriptor type: 'descriptor' or 'non_descriptor' (default 'descriptor').
	* @param string|null $component_tipo Optional. Previously calculated component tipo or resolved internally.
	* @param int|null $limit Limit results (default 0 = no limit).
	* @param int|null $offset Offset for pagination (default 0).
	* @return array Array of locators.
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
	* @param int|string $section_id
	* @param string $section_tipo
	* @param ?string $component_tipo
	* @param array $visited
	* @return array $all_children
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
	* GET_AR_RELATED_PARENT_TIPO
	* Get the parent node(s) in the ontology related to the component_relation_children.
	* This determines which parent relation component in the ontology corresponds to this children relation.
	*
	* @param string $tipo The tipo of the children relation component.
	* @param string $section_tipo The section tipo context.
	* @return array An array of related parent component tipos.
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
	* Get the ontology tipo for the component_relation_children within a given section_tipo.
	* This identifies the specific component instance in the structure that handles children relations for the section.
	*
	* @param string $section_tipo The tipo of the section to search within.
	* @return string|null The component tipo (e.g., 'dd123') or null if not found.
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
	* Update all component_relation_parent affected by
	* the order change in this component 'value'
	* The order is provided by a list of locators, usually from
	* dd_ts_api in a Thesaurus API call
	* @param string $section_tipo
	* @param array $locators
	* 	ascending order locators
	* @param string $parent_section_tipo
	* 	the parent section tipo to use as context for the order
	* @param int $parent_section_id
	* 	the parent section id to use as context for the order
	* @return array|false $changed
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
	* Build a standardized search_query_object for children searches.
	* Centralizes SQO construction used by get_children() and has_children_of_type().
	*
	* @param int|string $section_id The section ID of the parent.
	* @param string $section_tipo The section tipo of the parent.
	* @param string $component_tipo The component_relation_children tipo.
	* @param string $parent_tipo The related component_relation_parent tipo.
	* @param array $options {
	*    @type int    $limit             Limit results (default 0 = no limit)
	*    @type int    $offset            Offset for pagination (default 0)
	*    @type bool   $order             Apply section_map order (default true)
	*    @type string $descriptor_type   Filter by descriptor type: 'descriptor', 'non_descriptor', or null for all (default null)
	*    @type array  $additional_locators Extra locators to filter by (default [])
	*    @type string $filter_operator   Operator for multiple locators: 'AND' or 'OR' (default null = single locator)
	* }
	* @return search_query_object|null Configured SQO or null on error
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

					$path = [
						(object)[
							'component_tipo'	=> $order_component_tipo,
							'model'				=> SHOW_DEBUG===true ? ontology_node::get_model_by_tipo($order_component_tipo,true) : $order_component_tipo,
							'name'				=> SHOW_DEBUG===true ? ontology_node::get_term_by_tipo($order_component_tipo) : $order_component_tipo,
							'section_tipo'		=> $section_tipo,
							'column'			=> '(jsonb_path_query_first(number, \'$.'.$order_component_tipo.'[*] ? (@.section_tipo_key == "'.$section_tipo.'" && @.section_id_key == '.$section_id.').value\') #>> \'{}\')::integer'
						]
					];
					$order_obj = (object)[
						'direction'	=> 'ASC',
						'path'		=> $path
					];
					$sqo->set_order([$order_obj]);
				}
			}

		return $sqo;
	}//end build_children_sqo



	/**
	* HAS_CHILDREN_OF_TYPE
	* Check if the given child has any child descriptor or non descriptor.
	* Used in Thesaurus to verify if a term has specific types of children (e.g., descriptors vs non-descriptors).
	*
	* @param int|string $section_id The section ID of the child.
	* @param string $section_tipo The section tipo of the child.
	* @param string $component_tipo The component tipo representing the relationship.
	* @param string $type The type to check: 'descriptor' or 'non_descriptor'.
	* @return bool True if children of the specified type exist, false otherwise.
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

			// check if the result is empty,
			// if yes return false the child has any non descriptor
			// if no return true the child has almost 1 non descriptor
			$result	= $db_result->row_count() === 0 ? false : true ;


		return $result;
	}//end has_children_of_type



	/**
	* SEARCH_OPERATORS_INFO
	* Overrides relation common operators.
	* @return array $ar_operators
	*/
	public function search_operators_info() : array {

		$ar_operators = [];

		return $ar_operators;
	}//end search_operators_info



}//end component_relation_children
