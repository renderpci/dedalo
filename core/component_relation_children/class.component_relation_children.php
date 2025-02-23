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
			}

		return true;
	}//end make_me_your_child



	/**
	* REMOVE_ME_AS_YOUR_CHILD
	* @param string $section_tipo
	* @param string|int $section_id
	* @return bool
	*/
	public function remove_me_as_your_child( string $section_tipo, string|int $section_id ) : bool {

		// locator compound
			$locator = new locator();
				$locator->set_type($this->relation_type);
				$locator->set_section_id($section_id);
				$locator->set_section_tipo($section_tipo);
				$locator->set_from_component_tipo($this->tipo);

		// Remove child locator
			if (!$this->remove_child($locator)) {
				return false;
			}

		return true;
	}//end remove_me_as_your_child



	/**
	* ADD_CHILD
	* Add one locator to current 'dato'. Verify is exists to avoid duplicates
	* NOTE: This method updates component 'dato' and save
	* @param locator $locator
	* @return bool
	*/
	public function add_child( locator $locator ) : bool {

		// reference self case
			if ($locator->section_tipo===$this->section_tipo && $locator->section_id==$this->parent) {
				debug_log(__METHOD__
					. " Error: Ignored invalid locator received to add child (auto-reference) " . PHP_EOL
					. ' locator: ' . to_string($locator)
					, logger::ERROR
				);
				return false; // Avoid auto-references
			}

		// from_component_tipo check
			if (!isset($locator->from_component_tipo)) {
				debug_log(__METHOD__
					.' ERROR. ignored action. Property "from_component_tipo" is mandatory '
					, logger::ERROR
				);
				return false;
			}

		// Add current locator to component dato
			if (!$this->add_locator_to_dato($locator)) {
				return false;
			}

		return true;
	}//end add_child



	/**
	* REMOVE_CHILD
	* Iterate current component 'dato' and if math requested locator, removes it the locator from the 'dato' array
	* NOTE: This method updates component 'dato'
	* @param locator $locator
	* @return bool
	*/
	public function remove_child( locator $locator ) : bool {

		// remove current locator from component dato
		if (!$this->remove_locator_from_dato($locator, ['section_id','section_tipo','type'])) {
			return false;
		}

		return true;
	}//end remove_child



	/**
	* GET_CHILDREN
	*  Recursive get children function
	* @param string|int $section_id
	* @param string $section_tipo
	* @param string|null $component_tipo = null
	* @param bool $recursive = true
	* @param bool $is_recursion = false
	*
	* @return array $ar_children_recursive
	*/
	public static function get_children( string|int $section_id, string $section_tipo, ?string $component_tipo=null, bool $recursive=true, bool $is_recursion=false ) : array {

		static $locators_resolved = array();

		// reset ar_resolved on first call
			if ($is_recursion===false) {
				$locators_resolved = [];
			}

		$ar_children_recursive = [];

		// Infinite loops prevention
			$pseudo_locator = $section_id .'_'. $section_tipo;
			if (in_array($pseudo_locator, $locators_resolved)) {
				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__." Skipped already resolved locator ".to_string($pseudo_locator), logger::DEBUG);
				}
				return [];
			}

		// Locate component children in current section when is not received
		// Search always (using cache) for allow mix different section tipo (like beginning from root hierarchy note)
		// $section_tipo, [get_called_class()], $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true, $ar_tipo_exclude_elements=false
			if (empty($component_tipo)) {
				$ar_tipos = section::get_ar_children_tipo_by_model_name_in_section(
					$section_tipo, // string section_tipo
					[get_called_class()], // array ar_model_name_required
					true, // bool from_cache
					true, // bool resolve_virtual
					true, // bool recursive
					true, // bool search_exact
					false // bool|array ar_tipo_exclude_elements
				);
				if (empty($ar_tipos)) {
					debug_log(__METHOD__
						." Ignored search get_children because this section ($section_tipo) do not have any component of model: component_relation_children "
						, logger::WARNING
					);
					return $ar_children_recursive;
				}
				$component_tipo = reset($ar_tipos);
			}

		// Create first component to get dato
			$component = component_common::get_instance(
				get_called_class(),
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo,
				false // bool cache
			);
			$dato = $component->get_dato();

		// ar_children_recursive
			if ($recursive!==true) {

				$ar_children_recursive = $dato;

			}else{

				if (!empty($dato)) {

					$ar_children_recursive = array_merge($ar_children_recursive, $dato);

					// Set as resolved to avoid loops
					$locators_resolved[] = $section_id .'_'. $section_tipo;

					foreach ((array)$dato as $current_locator) {

						$ar_children_recursive = array_merge(
							$ar_children_recursive,
							self::get_children(
								$current_locator->section_id,
								$current_locator->section_tipo,
								$component_tipo,
								$recursive,
								true // is_recursion
							)
						);
					}
				}
			}


		return $ar_children_recursive;
	}//end get_children



	/**
	* GET_SORTABLE
	* @return bool
	* 	Default is false. Override when component is sortable
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



}//end component_relation_children
