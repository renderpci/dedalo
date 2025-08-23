<?php declare(strict_types=1);
/**
* COMPONENT_RELATION_CHILDREN
* Class to manage children relations between sections.
* It does not store its own data, it only manages the component_relation_parent data in 'reverse' mode
*
*/
class component_relation_children extends component_relation_common {



	// relation_type defaults
	protected $default_relation_type		= DEDALO_RELATION_TYPE_CHILDREN_TIPO;
	protected $default_relation_type_rel	= null;

	// test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');

	// ar_target_section_tipo
	public $ar_target_section_tipo;	// Used to fix section tipo (calculated from the related component of type section) Could be virtual or real



	/**
	* GET_VALOR
	* Get value . Default is get dato . overwrite in every different specific component
	* @param string|null $lang = DEDALO_DATA_LANG
	* @return string|null $valor
	*/
	public function get_valor( ?string $lang=DEDALO_DATA_LANG ) : ?string {

		$dato = $this->get_dato();

		// empty case
			if (empty($dato)) {
				return null;
			}

		// resolve locators
			$ar_valor = [];
			foreach ((array)$dato as $current_locator) {
				$ar_valor[] = ts_object::get_term_by_locator(
					$current_locator,
					$lang,
					true // bool from_cache
				);
			}

		// component valor
			$ar_valor_clean = [];
			foreach ($ar_valor as $value) {
				if (empty($value)) {
					continue;
				}
				if(!empty(trim($value))) {
					$ar_valor_clean[] = $value;
				}
			}
			$valor = implode(', ', $ar_valor_clean);


		return $valor;
	}//end get_valor


	/**
	* SAVE
	* Overwrite relation common action
	* @return int|null $section_id
	*/
	public function Save() : ?int {
		// Noting to do. This component don`t save

		$section_id = !empty($this->section_id)
			? (int)$this->section_id
			: null;

		// return section id
		return $section_id;
	}//end Save



	/**
	* GET DATO
	* This component don't store data, only manages calculated data from component_relation_parent generated data
	* stored in section 'relations' container
	* @return array $dato
	*	$dato is always an array of locators
	*/
	public function get_dato() : array {

		// dato_resolved. Already resolved case
			if(isset($this->dato_resolved)) {
				return $this->dato_resolved;
			}

		// empty section_id case
			if(empty($this->section_id)){
				return [];
			}

		// always get dato calculated from my parents that call the current section
			$dato = component_relation_children::get_children(
				$this->section_id,
				$this->section_tipo,
				$this->tipo
			);

		// fix dato.
			$this->dato = $dato;

		// set dato_resolve and cache it
			$this->dato_resolved = $this->dato;

		// Set as loaded.
			$this->is_loaded_matrix_data = true;


		return $dato;
	}//end get_dato



	/**
	* GET_DATO_FULL
	* @return array|null $dato
	*/
	public function get_dato_full() : ?array {

		$dato = $this->get_dato();

		return $dato;
	}//end get_dato_full



	/**
	* SET_DATO
	* Note that current component DON'T STORE DATA.
	* Instead, is inserted in the related 'component_relation_parent' the link to self
	* Don't use this method regularly, is preferable use 'add_children' method for every new relation
	* @param array|string $dato
	*	When dato is string is because is a JSON encoded dato
	* @return bool
	*/
	public function set_dato( $dato ) : bool {

		// Normalize dato to an array of locator objects
			$normalized_dato = match (true) {
				is_string($dato) => (array)json_handler::decode($dato),
				is_object($dato) => [$dato],
				is_array($dato) => array_values($dato),
				default => [],
			};

		// remove previous dato
			$previous_dato = $this->get_dato();
			if (!empty($previous_dato)) {
				foreach ($previous_dato as $locator) {

					$exist = locator::in_array_locator( $locator, $normalized_dato, ['section_tipo','section_id','from_component_tipo']);
					if($exist===true){
						continue;
					}

					$result = (bool)$this->remove_child(
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
			if (!empty($normalized_dato)) {
				foreach ($normalized_dato as $locator) {

					$exist = locator::in_array_locator( $locator, $previous_dato, ['section_tipo','section_id','from_component_tipo']);
					if($exist===true){
						continue;
					}

					$result	= (bool)$this->add_child(
						$locator->section_tipo,
						$locator->section_id
					);
					if (!$result) {
						$from_component_tipo_model = isset($locator->from_component_tipo)
							? ontology_node::get_model_by_tipo($locator->from_component_tipo,true)
							: null;
						debug_log(__METHOD__
							. " Error on add children" . PHP_EOL
							. ' result: ' . to_string($result) . PHP_EOL
							. ' section_tipo: ' . to_string($this->section_tipo) . PHP_EOL
							. ' section_id: ' . to_string($this->section_id) . PHP_EOL
							. ' result: ' . to_string($result) . PHP_EOL
							. ' locator: ' . to_string($locator) . PHP_EOL
							. ' locator type: ' .  get_relation_name($locator->type) . PHP_EOL
							. ' locator from_component_tipo: ' . ($locator->from_component_tipo ?? null) . PHP_EOL
							. ' from_component_tipo model: ' . $from_component_tipo_model
							, logger::ERROR
						);
						if(SHOW_DEBUG===true) {
							dump($normalized_dato, ' dato ++ '.to_string());
						}
					}
				}
			}

		// $this->update_parents($normalized_dato);

		// force read the new value on get_dato (prevent cache inconsistency)
			unset($this->dato_resolved); //  = null;


		return true;
	}//end set_dato



	/**
	* ADD_CHILD
	* Alias of update_parent with specific action 'add'
	* @param string $parent_section_tipo
	* @param mixed $parent_section_id
	* @param string|null $parent_tipo = null
	* @return bool
	*/
	public function add_child( string $parent_section_tipo, mixed $parent_section_id, ?string $parent_tipo=null ) : bool {

		$action = 'add';

		return $this->update_parent($action, $parent_section_tipo, $parent_section_id, $parent_tipo);
	}//end add_child



	/**
	* REMOVE_CHILD
	* Alias of update_parent with specific action 'remove'
	* @param string $parent_section_tipo
	* @param mixed $parent_section_id
	* @param string|null $parent_tipo = null
	* @return bool
	*/
	public function remove_child( string $parent_section_tipo, mixed $parent_section_id, ?string $parent_tipo=null ) : bool {

		$action = 'remove';

		return $this->update_parent($action, $parent_section_tipo, $parent_section_id, $parent_tipo);
	}//end remove_child



	/**
	* UPDATE_PARENT
	* Locate current section component_relation_children and remove given parent_section_id, parent_section_tipo combination from data
	* @param string $action
	* 	remove|add
	* @param string $parent_section_tipo
	* @param int|string $parent_section_id
	* @param string|null $parent_tipo = null
	* @return bool $result
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

		// component instance
			$component_relation_parent = component_common::get_instance(
				$model,
				$parent_tipo,
				$parent_section_id,
				'edit',
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

				$saved = $component_relation_parent->Save();
				if ($saved && $saved>0) {
					$result = true;
				}

				// force read the new value on get_dato (prevent cache inconsistency)
				$this->dato_resolved = null;
				$this->get_dato();
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
	* @return array $parents
	*	Array of stClass objects with properties: section_tipo, section_id, component_tipo
	*/
	public static function get_children( int|string $section_id, string $section_tipo, ?string $component_tipo=null ) : array {

		$children = [];

		// Locate component children in section when is not received
		// Search always (using cache) for allow mix different section tipo (like beginning from root hierarchy note)
			if (empty($component_tipo)) {
				$component_tipo = component_relation_children::get_children_tipo($section_tipo);
			}

		// get the ontology node tipo of the related component_relation_parent assigned to my tipo.
			$ar_parent_tipo = component_relation_children::get_ar_related_parent_tipo( $component_tipo, $section_tipo );
			if( empty($ar_parent_tipo) ){
				return $children;
			}
			$parent_tipo = $ar_parent_tipo[0];

		// filter locator
			$filter_locator = new locator();
				$filter_locator->set_section_tipo($section_tipo);
				$filter_locator->set_section_id($section_id);
				$filter_locator->set_from_component_tipo($parent_tipo);
				$filter_locator->set_type(DEDALO_RELATION_TYPE_PARENT_TIPO);

		// new way done in relations field with standard sqo
			$sqo = new search_query_object();
			$sqo->set_section_tipo( ['all'] ); // open wide for Ontology cross section parents
				$sqo->set_mode( 'related' );
				$sqo->set_full_count( false );
				$sqo->set_filter_by_locators( [$filter_locator] );
				$sqo->set_limit( 1000 ); // set limit for security. Overwrite when needed.

			// order. It is defined in section 'section_map' item as {"order":"ontology41"}
			// This tipo is used to build the JSON path for the search
			// sample:
			// SELECT ... ,jsonb_path_query_first(datos, \'strict $.components.ontology41.dato."lg-nolan"[0]\', silent => true) as ontology41_order
			// WHERE ...
			// ORDER BY ontology41_order ASC NULLS LAST , section_id ASC
				$section_map = section::get_section_map( $section_tipo );
				if (isset($section_map->thesaurus->order)) {
					$order_component_tipo = $section_map->thesaurus->order; // 'ontology41' for Ontology
					$path = [
						(object)[
							'component_tipo'	=> $order_component_tipo,
							'model'				=> SHOW_DEBUG===true ? ontology_node::get_model_by_tipo($order_component_tipo,true) : $order_component_tipo,
							'name'				=> SHOW_DEBUG===true ? ontology_node::get_term_by_tipo($order_component_tipo) : $order_component_tipo,
							'section_tipo'		=> $section_tipo,
							'column'			=> "jsonb_path_query_first(datos, 'strict $.components.{$order_component_tipo}.dato.\"lg-nolan\"[0]', silent => true)"
						]
					];
					$order_obj = (object)[
						'direction'	=> 'ASC',
						'path'		=> $path
					];
					$sqo->set_order( [$order_obj] );
				}

			$search		= search::get_instance($sqo);
			$rows_data	= $search->search();

			// fix result ar_records as dato
			$result	= $rows_data->ar_records;

			$children = array_map( function($row) use($component_tipo){

				$locator = new locator();
					$locator->set_section_tipo($row->section_tipo);
					$locator->set_section_id($row->section_id);
					$locator->set_from_component_tipo($component_tipo);
					$locator->set_type(DEDALO_RELATION_TYPE_CHILDREN_TIPO);

				return $locator;

			}, $result);


		return $children;
	}//end get_children



	/**
	* GET_CHILDREN_RECURSIVE
	* @param int|string $section_id
	* @param string $section_tipo
	* @param ?string $component_tipo
	* @return
	*/
	public static function get_children_recursive(int|string $section_id, string $section_tipo, ?string $component_tipo = null) : array {

		$all_children = component_relation_children::get_children($section_id, $section_tipo, $component_tipo);

		foreach ($all_children as $child) {
			$descendants = component_relation_children::get_children_recursive($child->section_id, $child->section_tipo, $component_tipo); // Recursively get descendants
			$all_children = array_merge($all_children, $descendants);
		}

		return $all_children;
	}//end get_children_recursive



	/**
	* GET_AR_RELATED_PARENT_TIPO
	* Get the parent node in ontology related to the component_related_children
	* @param string $tipo
	* @param string $section_tipo
	* @return array $ar_parent_tipo
	*/
	public static function get_ar_related_parent_tipo( string $tipo, string $section_tipo ) : array {

		// cache
		static $ar_parent_tipo_cache;
		$cache_key = $tipo . '_' . $section_tipo;
		if( isset($ar_parent_tipo_cache[$cache_key]) ){
			return $ar_parent_tipo_cache[$cache_key];
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
		$ar_parent_tipo_cache[$cache_key] = $ar_parent_tipo;


		return $ar_parent_tipo;
	}//end get_ar_related_parent_tipo



	/**
	* GET_CHILDREN_TIPO
	* get ontology tipo for component_related_children of the section_tipo given
	* @param string $section_tipo
	* @return string|null $children_tipo
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
	* RESOLVE_QUERY_OBJECT_SQL
	* @param object $query_object
	* @return object $query_object
	*/
	public static function resolve_query_object_sql(object $query_object) : object {

		// q
			$q = $query_object->q;
			// q sample :
			// [
			//     {
			//         "section_tipo": "test3",
			//         "section_id": "7974",
			//         "from_component_tipo": "test71"
			//     }
			// ]

		// children_locators
			$children_locators = is_string($q)
				? json_decode($q)
				: $q;
			if (!is_array($children_locators)) {
				$children_locators = [$children_locators];
			}

		// children
			$ar_parent = [];
			foreach ($children_locators as $current_locator) {

				$child_compnent_tipo	= $current_locator->from_component_tipo;
				$ar_target_parent_tipo	= component_relation_children::get_ar_related_parent_tipo(
					$child_compnent_tipo,
					'hierarchy20' // ITS NOT CORRECT, but is not possible know the section_tipo here
				);
				if (!empty($ar_target_parent_tipo)) {
					foreach ($ar_target_parent_tipo as $children_component_tipo) {

						$model_name	= ontology_node::get_model_by_tipo($children_component_tipo, true); // component_relation_children
						$component	= component_common::get_instance(
							$model_name,
							$children_component_tipo,
							$current_locator->section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$current_locator->section_tipo
						);
						$component_parent_dato = $component->get_dato();
						foreach ($component_parent_dato as $parent_locator) {
							$ar_parent[] = $parent_locator->section_id;
						}
					}//end foreach ($ar_target_parent_tipo as $children_component_tipo)
				}
			}

		// q_clean
			$q_clean = array_map(function($el){
				return (int)$el;
			}, $ar_parent);

		// query_object
			$query_object->operator			= 'IN';
			$query_object->q_parsed			= implode(',', $q_clean);
			$query_object->format			= 'in_column';
			$query_object->type				= 'number';
			$query_object->column_name		= 'section_id';
			$query_object->component_path	= ['section_id'];
			$query_object->unaccent			= false;


		return $query_object;
	}//end resolve_query_object_sql



	/**
	* SORT_CHILDREN
	* Update all component_relation_parent affected by
	* the order change in this component 'value'
	* The order is provided by a list of locators, usually from
	* dd_ts_api in a Thesaurus API call
	* @param string $section_tipo
	* @param array $locators
	* 	ascending order locators
	* @return array|false $changed
	* @see dd_ts_api::save_order
	*/
	public static function sort_children( string $section_tipo, array $locators ) : array|false {

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

			$value = $component->get_value();

			// check if value changes
			if ((int)$value===$order) {
				// remains unchanged
				continue;
			}

			// save changed value
			$component->set_dato([$order]);
			$component->Save();

			$changed[] = (object)[
				'value'		=> $order,
				'locator'	=> $locator
			];
		}


		return $changed;
	}//end sort_children



	/**
	* HAS_CHILDREN_OF_TYPE
	* Check if the given child has any child descriptor or non descriptor
	* @param int|string $section_id
	* @param string $section_tipo
	* @param string $component
	* @param string $type  descriptor|non_descriptor
	* @return bool $result
	*/
	public static function has_children_of_type( int|string $section_id, string $section_tipo, string $component_tipo, string $type ) : bool {

		//get the descriptor component
		// if the section_map has not defined the descriptor component return, this component has any non descriptor
			$section_map = section::get_section_map( $section_tipo );
			$is_descriptor_tipo = $section_map->thesaurus->is_descriptor ?? null;
			if (empty($is_descriptor_tipo)) {
				return false;
			}

			switch ( $type ) {
				case 'descriptor':
					$target_section_id = NUMERICAL_MATRIX_VALUE_YES;
					break;

				case 'non_descriptor':
					$target_section_id = NUMERICAL_MATRIX_VALUE_NO;
					break;

				default:
					debug_log(__METHOD__
						. ' Invalid type ' . PHP_EOL
						. 'type: ' . to_string( $type )
						, logger::ERROR
					);
					return false;
			}

			$is_descriptor_locator = new locator();
				$is_descriptor_locator->set_section_tipo( DEDALO_SECTION_SI_NO_TIPO );
				$is_descriptor_locator->set_section_id( $target_section_id );
				$is_descriptor_locator->set_from_component_tipo( $is_descriptor_tipo );
				$is_descriptor_locator->set_type( DEDALO_RELATION_TYPE_LINK );

		// get the ontology node tipo of the related component_relation_parent assigned to my tipo.
			$ar_parent_tipo = component_relation_children::get_ar_related_parent_tipo( $component_tipo, $section_tipo );
			if( empty($ar_parent_tipo) ){
				return false;
			}
			$parent_tipo = $ar_parent_tipo[0];

		// filter locator
			$filter_locator = new locator();
				$filter_locator->set_section_tipo( $section_tipo );
				$filter_locator->set_section_id( $section_id );
				$filter_locator->set_from_component_tipo( $parent_tipo );
				$filter_locator->set_type( DEDALO_RELATION_TYPE_PARENT_TIPO );

		// new way done in relations field with standard sqo
			$sqo = new search_query_object();
			$sqo->set_section_tipo( ['all'] ); // open wide for Ontology cross section parents
				$sqo->set_mode( 'related' );
				$sqo->set_full_count( false );
				$sqo->set_filter_by_locators( [$filter_locator, $is_descriptor_locator] );
				$sqo->set_filter_by_locators_op( 'AND' );
				$sqo->set_limit( 1 ); // set limit for security. Overwrite when needed.

			$search		= search::get_instance($sqo);
			$rows_data	= $search->search();

			// check if the result is empty,
			// if yes return false the child has any non descriptor
			// if no return true the child has almost 1 non descriptor
			$result	= empty($rows_data->ar_records) ? false : true ;


		return $result;
	}//end has_children_of_type



}//end component_relation_children
