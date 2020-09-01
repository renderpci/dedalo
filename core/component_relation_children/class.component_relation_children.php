<?php
/*
* COMPONENT_RELATION_CHILDREN
*
*
*/
class component_relation_children extends component_relation_common {



	// relation_type
	protected $relation_type = DEDALO_RELATION_TYPE_CHILDREN_TIPO;

	// test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');

	// ar_target_section_tipo
	public $ar_target_section_tipo;		# Used to fix section tipo (calculado a partir del componente relacionado de tipo section) Puede ser virtual o real



	/**
	* GET_VALOR
	* Get value . default is get dato . overwrite in every different specific component
	* @return string | null $valor
	*/
	public function get_valor($lang=DEDALO_DATA_LANG) {

		$dato = $this->get_dato();
		if (empty($dato)) {
			return null;
		}

		$ar_valor = array();
		foreach ((array)$dato as $key => $current_locator) {
			$ar_valor[] = ts_object::get_term_by_locator( $current_locator, $lang, $from_cache=true );
		}

		# Set component valor
		$valor='';
		foreach ($ar_valor as $key => $value) {
			if(!empty($value)) {
				$valor .= $value;
				if(end($ar_valor)!=$value) $valor .= ', ';
			}
		}


		return (string)$valor;
	}//end get_valor


	/**
	* MAKE_ME_YOUR_CHILD
	* Add one locator to current 'dato' from parent side
	* NOTE: This method updates component 'dato' and save
	* @return bool
	*/
	public function make_me_your_child( $section_tipo, $section_id ) {

		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);
			$locator->set_type($this->relation_type);
			$locator->set_from_component_tipo($this->tipo);

		# Add children locator
		if (!$add_child = $this->add_child($locator)) {
			return false;
		}

		return true;
	}//end make_me_your_child



	/**
	* REMOVE_ME_AS_YOUR_CHILD
	* @return bool
	*/
	public function remove_me_as_your_child( $section_tipo, $section_id ) {

		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);
			$locator->set_type($this->relation_type);
			$locator->set_from_component_tipo($this->tipo);

		# Remove child locator
		if (!$remove_child = $this->remove_child($locator)) {
			return false;
		}

		return true;
	}//end remove_me_as_your_child



	/**
	* ADD_CHILD
	* Add one locator to current 'dato'. Verify is exists to avoid duplicates
	* NOTE: This method updates component 'dato' and save
	* @return bool
	*/
	public function add_child( $locator ) {

		if ($locator->section_tipo===$this->section_tipo && $locator->section_id==$this->parent) {
			return false; // Avoid autoreferences
		}

		if (!isset($locator->from_component_tipo)) {
			debug_log(__METHOD__." ERROR. ignored action. Property \"from_component_tipo\" is mandatory ".to_string(), logger::ERROR);
			return false;
		}

		# Add current locator to component dato
		if (!$add_locator = $this->add_locator_to_dato($locator)) {
			return false;
		}

		return true;
	}//end add_child



	/**
	* REMOVE_CHILD
	* Iterate current component 'dato' and if math requested locator, removes it the locator from the 'dato' array
	* NOTE: This method updates component 'dato'
	* @return bool
	*/
	public function remove_child( $locator ) {

		# Add current locator to component dato
		if (!$remove_locator_locator = $this->remove_locator_from_dato($locator)) {
			return false;
		}

		return true;
	}//end remove_child



	/**
	* GET_CHILDREN
	* @return array $ar_children_recursive
	*/
	public static function get_children($section_id, $section_tipo, $component_tipo=null, bool $recursive=true, $is_recursion=false) {

		static $locators_resolved = array();

		// reset ar_resolved on first call
			if ($is_recursion===false) {
				$locators_resolved = [];
			}

		$ar_children_recursive = [];

		# Infinite loops prevention
		$pseudo_locator = $section_id .'_'. $section_tipo;
		if (in_array($pseudo_locator, $locators_resolved)) {
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Skipped already resolved locator ".to_string($pseudo_locator), logger::DEBUG);
			}
			return [];
		}

		# Locate component children in current section when is not received
		# Search always (using cache) for allow mix different section tipo (like beginning from root hierarchy note)
		# $section_tipo, [get_called_class()], $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true, $ar_tipo_exclude_elements=false
		if (empty($component_tipo)) {
			$ar_tipos = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, [get_called_class()], true, true, true, true, false);
			$component_tipo = reset($ar_tipos);
		}

		# Create first component to get dato
		$component 		= component_common::get_instance(get_called_class(),
														 $component_tipo,
														 $section_id,
														 'list',
														 DEDALO_DATA_LANG,
														 $section_tipo,
														 false);
		$dato = $component->get_dato();

		if ($recursive!==true) {

			$ar_children_recursive = $dato;

		}else{

			if (!empty($dato)) {

				$ar_children_recursive = array_merge($ar_children_recursive, $dato);

				# Set as resolved to avoid loops
				$locators_resolved[] = $section_id .'_'. $section_tipo;

				foreach ((array)$dato as $key => $current_locator) {
					$ar_children_recursive = array_merge($ar_children_recursive, self::get_children($current_locator->section_id, $current_locator->section_tipo, $component_tipo, $recursive, $is_recursion=true));
				}
			}
		}


		return $ar_children_recursive;
	}//end get_children



}//end component_relation_children
