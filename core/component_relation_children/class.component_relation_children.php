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
	* GET_AR_TARGET_SECTION_TIPO
	* Select source section/s
	* Overrides component common method
	*/
	public function get_ar_target_section_tipo() {

		if (!$this->tipo) return null;

		if(isset($this->ar_target_section_tipo)) {
			return $this->ar_target_section_tipo;
		}

		$target_mode = isset($this->properties->target_mode) ? $this->properties->target_mode : null;
		switch ($target_mode) {

			case 'hierarchy_root_values':
				# Resolve DEDALO_HIERARCHY_TLD2_TIPO data
				$target_values = (array)$this->properties->target_values;
				foreach ((array)$target_values as $key => $current_component_tipo) {
					$modelo_name 	 = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);
					$component 		 = component_common::get_instance($modelo_name,
																	  $current_component_tipo,
																	  $this->parent,
																	  $modo='edit',
																	  $lang=DEDALO_DATA_LANG,
																	  $this->section_tipo);
					$valor = $component->get_valor(DEDALO_DATA_LANG);
					$ar_target_section_tipo[] = strtolower($valor).'1'; // Like 'es1'
				}
				break;

			case 'free':
				# target_values are directly the target section tipo
				$target_values = (array)$this->properties->target_values;
				$ar_target_section_tipo = $target_values;
				break;

			default:
				# Default is self section
				$ar_target_section_tipo = array($this->section_tipo);
				break;
		}

		# Fix value
		$this->ar_target_section_tipo = $ar_target_section_tipo;
		

		return (array)$ar_target_section_tipo;
	}//end get_ar_target_section_tipo



	/**
	* MAKE_ME_YOUR_CHILDREN
	* Add one locator to current 'dato' from parent side
	* NOTE: This method updates component 'dato' and save
	* @return bool
	*/
	public function make_me_your_children( $section_tipo, $section_id ) {

		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);
			$locator->set_type($this->relation_type);
			$locator->set_from_component_tipo($this->tipo);

		# Add children locator
		if (!$add_children = $this->add_children($locator)) {
			return false;
		}

		return true;
	}//end make_me_your_children



	/**
	* REMOVE_ME_AS_YOUR_CHILDREN
	* @return bool
	*/
	public function remove_me_as_your_children( $section_tipo, $section_id ) {

		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);
			$locator->set_type($this->relation_type);
			$locator->set_from_component_tipo($this->tipo);

		# Remove children locator
		if (!$remove_children = $this->remove_children($locator)) {
			return false;
		}

		return true;
	}//end remove_me_as_your_children



	/**
	* ADD_CHILDREN
	* Add one locator to current 'dato'. Verify is exists to avoid duplicates
	* NOTE: This method updates component 'dato' and save
	* @return bool
	*/
	public function add_children( $locator ) {

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
	}//end add_children



	/**
	* REMOVE_CHILDREN
	* Iterate current component 'dato' and if math requested locator, removes it the locator from the 'dato' array
	* NOTE: This method updates component 'dato'
	* @return bool
	*/
	public function remove_children( $locator ) {

		# Add current locator to component dato
		if (!$remove_locator_locator = $this->remove_locator_from_dato($locator)) {
			return false;
		}

		return true;
	}//end remove_children



	/**
	* GET_CHILDRENS
	* @return array $ar_childrens_recursive
	*/
	public static function get_childrens($section_id, $section_tipo, $component_tipo=null, bool $recursive=true, $is_recursion=false) {

		static $locators_resolved = array();

		// reset ar_resolved on first call
			if ($is_recursion===false) {
				$locators_resolved = [];
			}

		$ar_childrens_recursive = [];

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

			$ar_childrens_recursive = $dato;

		}else{

			if (!empty($dato)) {

				$ar_childrens_recursive = array_merge($ar_childrens_recursive, $dato);

				# Set as resolved to avoid loops
				$locators_resolved[] = $section_id .'_'. $section_tipo;

				foreach ((array)$dato as $key => $current_locator) {
					$ar_childrens_recursive = array_merge($ar_childrens_recursive, self::get_childrens($current_locator->section_id, $current_locator->section_tipo, $component_tipo, $recursive, $is_recursion=true));
				}
			}
		}


		return $ar_childrens_recursive;
	}//end get_childrens



}//end component_relation_children
