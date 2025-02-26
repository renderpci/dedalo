<?php declare(strict_types=1);
/**
* COMPONENT_RELATION_CHILDREN
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



	// /**
	// * MAKE_ME_YOUR_CHILD
	// * Add one locator to current 'dato' from parent side
	// * NOTE: This method updates component 'dato' and save
	// * @param string $section_tipo
	// * @param string|int $section_id
	// * @return bool
	// */
	// public function make_me_your_child( string $section_tipo, string|int $section_id ) : bool {

	// 	// locator compound
	// 		$locator = new locator();
	// 			$locator->set_type($this->relation_type);
	// 			$locator->set_section_id($section_id);
	// 			$locator->set_section_tipo($section_tipo);
	// 			$locator->set_from_component_tipo($this->tipo);

	// 	// Add children locator
	// 		if (!$this->add_child( $locator )) {
	// 			return false;
	// 		}

	// 	return true;
	// }//end make_me_your_child



	// /**
	// * REMOVE_ME_AS_YOUR_CHILD
	// * @param string $section_tipo
	// * @param string|int $section_id
	// * @return bool
	// */
	// public function remove_me_as_your_child( string $section_tipo, string|int $section_id ) : bool {

	// 	// locator compound
	// 		$locator = new locator();
	// 			$locator->set_type($this->relation_type);
	// 			$locator->set_section_id($section_id);
	// 			$locator->set_section_tipo($section_tipo);
	// 			$locator->set_from_component_tipo($this->tipo);

	// 	// Remove child locator
	// 		if (!$this->remove_child($locator)) {
	// 			return false;
	// 		}

	// 	return true;
	// }//end remove_me_as_your_child



	// /**
	// * ADD_CHILD
	// * Add one locator to current 'dato'. Verify is exists to avoid duplicates
	// * NOTE: This method updates component 'dato' and save
	// * @param locator $locator
	// * @return bool
	// */
	// public function add_child( locator $locator ) : bool {

	// 	// reference self case
	// 		if ($locator->section_tipo===$this->section_tipo && $locator->section_id==$this->parent) {
	// 			debug_log(__METHOD__
	// 				. " Error: Ignored invalid locator received to add child (auto-reference) " . PHP_EOL
	// 				. ' locator: ' . to_string($locator)
	// 				, logger::ERROR
	// 			);
	// 			return false; // Avoid auto-references
	// 		}

	// 	// from_component_tipo check
	// 		if (!isset($locator->from_component_tipo)) {
	// 			debug_log(__METHOD__
	// 				.' ERROR. ignored action. Property "from_component_tipo" is mandatory '
	// 				, logger::ERROR
	// 			);
	// 			return false;
	// 		}

	// 	// Add current locator to component dato
	// 		if (!$this->add_locator_to_dato($locator)) {
	// 			return false;
	// 		}

	// 	return true;
	// }//end add_child



	// /**
	// * REMOVE_CHILD
	// * Iterate current component 'dato' and if math requested locator, removes it the locator from the 'dato' array
	// * NOTE: This method updates component 'dato'
	// * @param locator $locator
	// * @return bool
	// */
	// public function remove_child( locator $locator ) : bool {

	// 	// remove current locator from component dato
	// 	if (!$this->remove_locator_from_dato($locator, ['section_id','section_tipo','type'])) {
	// 		return false;
	// 	}

	// 	return true;
	// }//end remove_child



	// /**
	// * GET_CHILDREN
	// *  Recursive get children function
	// * @param string|int $section_id
	// * @param string $section_tipo
	// * @param string|null $component_tipo = null
	// * @param bool $recursive = true
	// * @param bool $is_recursion = false
	// *
	// * @return array $ar_children_recursive
	// */
	// public static function get_children( string|int $section_id, string $section_tipo, ?string $component_tipo=null, bool $recursive=true, bool $is_recursion=false ) : array {

	// 	static $locators_resolved = array();

	// 	// reset ar_resolved on first call
	// 		if ($is_recursion===false) {
	// 			$locators_resolved = [];
	// 		}

	// 	$ar_children_recursive = [];

	// 	// Infinite loops prevention
	// 		$pseudo_locator = $section_id .'_'. $section_tipo;
	// 		if (in_array($pseudo_locator, $locators_resolved)) {
	// 			if(SHOW_DEBUG===true) {
	// 				debug_log(__METHOD__." Skipped already resolved locator ".to_string($pseudo_locator), logger::DEBUG);
	// 			}
	// 			return [];
	// 		}

	// 	// Locate component children in current section when is not received
	// 	// Search always (using cache) for allow mix different section tipo (like beginning from root hierarchy note)
	// 	// $section_tipo, [get_called_class()], $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true, $ar_tipo_exclude_elements=false
	// 		if (empty($component_tipo)) {
	// 			$ar_tipos = section::get_ar_children_tipo_by_model_name_in_section(
	// 				$section_tipo, // string section_tipo
	// 				[get_called_class()], // array ar_model_name_required
	// 				true, // bool from_cache
	// 				true, // bool resolve_virtual
	// 				true, // bool recursive
	// 				true, // bool search_exact
	// 				false // bool|array ar_tipo_exclude_elements
	// 			);
	// 			if (empty($ar_tipos)) {
	// 				debug_log(__METHOD__
	// 					." Ignored search get_children because this section ($section_tipo) do not have any component of model: component_relation_children "
	// 					, logger::WARNING
	// 				);
	// 				return $ar_children_recursive;
	// 			}
	// 			$component_tipo = reset($ar_tipos);
	// 		}

	// 	// Create first component to get dato
	// 		$component = component_common::get_instance(
	// 			get_called_class(),
	// 			$component_tipo,
	// 			$section_id,
	// 			'list',
	// 			DEDALO_DATA_LANG,
	// 			$section_tipo,
	// 			false // bool cache
	// 		);
	// 		$dato = $component->get_dato();

	// 	// ar_children_recursive
	// 		if ($recursive!==true) {

	// 			$ar_children_recursive = $dato;

	// 		}else{

	// 			if (!empty($dato)) {

	// 				$ar_children_recursive = array_merge($ar_children_recursive, $dato);

	// 				// Set as resolved to avoid loops
	// 				$locators_resolved[] = $section_id .'_'. $section_tipo;

	// 				foreach ((array)$dato as $current_locator) {

	// 					$ar_children_recursive = array_merge(
	// 						$ar_children_recursive,
	// 						self::get_children(
	// 							$current_locator->section_id,
	// 							$current_locator->section_tipo,
	// 							$component_tipo,
	// 							$recursive,
	// 							true // is_recursion
	// 						)
	// 					);
	// 				}
	// 			}
	// 		}


	// 	return $ar_children_recursive;
	// }//end get_children



	// /**
	// * GET_SORTABLE
	// * @return bool
	// * 	Default is false. Override when component is sortable
	// */
	// public function get_sortable() : bool {

	// 	return true;
	// }//end get_sortable





	/**********************************************

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

		// always get dato calculated from my parents that call the current section
			$dato = $this->get_my_data();

		// fix dato.
			$this->dato = $dato;

		// set dato_resolve and cache it
			$this->dato_resolved = $this->dato;

		// Set as loaded.
			$this->bl_loaded_matrix_data = true;


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
	* Note that current component DON´T STORE DATA.
	* Instead, is inserted in the related 'component_relation_parent' the link to self
	* Don't use this method regularly, is preferable use 'add_children' method for every new relation
	* @param array|string $dato
	*	When dato is string is because is a JSON encoded dato
	* @return bool
	*/
	public function set_dato( $dato ) : bool {

		// dato format check
			if (is_string($dato)) { // Tool Time machine case, dato is string
				$dato = json_handler::decode($dato);
			}
			if (is_object($dato)) {
				$dato = [$dato];
			}
			// Ensures is a real non-associative array (avoid JSON encode as object)
			if (!is_null($dato)) {
				$dato = is_array($dato)
					? array_values($dato)
					: (array)$dato;
			}

		// remove previous dato
			$previous_dato = $this->get_dato();
			if (!empty($previous_dato)) {
				foreach ($previous_dato as $locator) {

					$exist = locator::in_array_locator( $locator, $dato, ['section_tipo','section_id','from_component_tipo']);
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
			if (!empty($dato)) {
				foreach ($dato as $locator) {

					$exist = locator::in_array_locator( $locator, $previous_dato, ['section_tipo','section_id','from_component_tipo']);
					if($exist===true){
						continue;
					}

					$result	= (bool)$this->add_child(
						$locator->section_tipo,
						$locator->section_id
					);
					if (!$result) {
						debug_log(__METHOD__
							. " Error on add children" . PHP_EOL
							. 'result: ' . to_string($result) . PHP_EOL
							. 'locator: ' . to_string($locator)
							, logger::ERROR
						);
					}
				}
			}

		// $this->update_parents($dato);

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
				if (empty($parent_tipo)) {
					debug_log(__METHOD__
						." ERROR: Unable to resolve parent_tipo" . PHP_EOL
						.' current tipo:  ' . $tipo
						, logger::ERROR
					);
					return false;
				}
				$parent_tipo = $ar_parent_tipo[0];
			}

		// model. Expected 'component_relation_parent'
			$model = RecordObj_dd::get_modelo_name_by_tipo($parent_tipo, true);
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
				case 'remove':
					$changed = (bool)$component_relation_parent->make_me_your_parent(
						$section_tipo,
						$section_id
					);
					break;

				case 'add':
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
	* GET_MY_DATA
	* @return array $data
	*/
	private function get_my_data() : array {

		$data = [];

		// empty section_id case
			if(empty($this->section_id)){
				return $data;
			}

		// get the ontology node tipo of the related component_relation_parent assigned to my tipo.
		$ar_parent_tipo = component_relation_children::get_ar_related_parent_tipo( $this->tipo, $this->section_tipo);

		if( empty($ar_parent_tipo) ){

			debug_log(__METHOD__
				. " component children without parent associated " . PHP_EOL
				. 'tipo: ' . to_string($this->tipo) . PHP_EOL
				. 'section_tipo: ' . to_string($this->section_tipo) . PHP_EOL
				. 'section_id: ' . to_string($this->section_id)
				, logger::ERROR
			);

			return $data;
		}

		foreach ($ar_parent_tipo as $parent_tipo) {
			$data = array_merge(
				$data,
				component_relation_children::get_children(
					$this->section_id,
					$this->section_tipo,
					$parent_tipo,
					null,
					(object)[
						'search_in_main_hierarchy' => true
					]
				)
			);
		}


		return $data;
	}//end get_my_data



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
			$ar_parent_tipo = component_relation_children::get_ar_related_parent_tipo( $component_tipo, $section_tipo);

			if( empty($ar_parent_tipo) ){
				return $children;
			}
			$parent_tipo = $ar_parent_tipo[0];

			$filter_locator = new locator();
				$filter_locator->set_section_tipo($section_tipo);
				$filter_locator->set_section_id($section_id);
				$filter_locator->set_from_component_tipo($parent_tipo);
				$filter_locator->set_type(DEDALO_RELATION_TYPE_PARENT_TIPO);

		// new way done in relations field with standard sqo
			$sqo = new search_query_object();
				$sqo->set_section_tipo( [$section_tipo] );
				$sqo->set_mode( 'related' );
				$sqo->set_full_count( false );
				$sqo->set_filter_by_locators( [$filter_locator] );

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

		static $ar_parent_tipo_cache;

		if( isset($ar_parent_tipo_cache) ){
			return $ar_parent_tipo_cache;
		}

		// get ontology related parent
		$ar_parent_tipo = common::get_ar_related_by_model( 'component_relation_parent', $tipo );

		// fallback; to search the parent related tipo in the section components
		if( empty($ar_parent_tipo) ){

			debug_log(__METHOD__
				. " Bad definition in ontology, this related_children has not related his parent, please assign the component_relation_parent to it. ---||--- using section_tipo to resolve it " . PHP_EOL
				. 'children tipo: ' . to_string($tipo)
				, logger::ERROR
			);
			// Look component parent across related section
			// Resolve parent component tipo from children_section_tipo
				$ar_parent_tipo = section::get_ar_children_tipo_by_model_name_in_section(
					$section_tipo, // string $section_tipo
					['component_relation_parent'], // array $ar_model_name_required
					true, // bool from_cache
					true, // bool resolve_virtual
					true, // bool recursive
					true, // bool search_exact
					false // array|bool ar_tipo_exclude_elements
				);
		}

		$ar_parent_tipo_cache = $ar_parent_tipo;

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

						$model_name	= RecordObj_dd::get_modelo_name_by_tipo($children_component_tipo, true); // component_relation_children
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



}//end component_relation_children
