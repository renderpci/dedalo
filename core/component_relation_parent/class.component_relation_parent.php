<?php declare(strict_types=1);
/**
* COMPONENT_RELATION_PARENT
* Class to manage parent relations between sections.
*/
class component_relation_parent extends component_relation_common {



	// Current component relation_type (used to filter locators in 'relations' container data)
	// relation_type defaults
	protected $default_relation_type		= DEDALO_RELATION_TYPE_PARENT_TIPO;
	protected $default_relation_type_rel	= null;


	// test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];

	// SQL query stored for debug only
	static $get_parents_query;


	/**
	* GET_VALOR
	* Get value . default is get dato . overwrite in every different specific component
	* @param string $lang = DEDALO_DATA_LANG
	* @return string|null $valor
	*/
	public function get_valor(?string $lang=DEDALO_DATA_LANG) : ?string {

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
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a MYSQL field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @see class.diffusion_mysql.php
	* @param string|null $lang = DEDALO_DATA_LANG
	* @param object|null $option_obj = null
	* @return string $diffusion_value
	*/
	public function get_diffusion_value( ?string $lang=DEDALO_DATA_LANG, ?object $option_obj=null ) : ?string {

		$resolve_value = isset($option_obj->resolve_value)
			? $option_obj->resolve_value
			: false;

		// custom_get_term_by_locator function.
		// This is a variant of ts_object::get_term_by_locator function, using 'get_diffusion_value' instead 'get_value'
			$custom_get_term_by_locator = function(object $locator, string $lang, object $option_obj) : ?string {

				$section_map	= section::get_section_map($locator->section_tipo);
				$thesaurus_map	= isset($section_map->thesaurus) ? $section_map->thesaurus : false;
				if ($thesaurus_map===false) {
					return null;
				}

				$ar_tipo		= is_array($thesaurus_map->term) ? $thesaurus_map->term : [$thesaurus_map->term];
				$section_id		= $locator->section_id;
				$section_tipo	= $locator->section_tipo;

				$ar_value = [];
				foreach ($ar_tipo as $tipo) {

					$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
					// $model	= RecordObj_dd::get_legacy_model_name_by_tipo($tipo);
					$component	= component_common::get_instance(
						$model,
						$tipo,
						$section_id,
						'list',
						$lang,
						$section_tipo
					);
					// process_dato_arguments
						$process_dato_arguments = $option_obj->process_dato_arguments ?? null;
					// valor
						// $valor	= $component->get_valor($lang);
						$valor		= $component->get_diffusion_value($lang, $process_dato_arguments);
						if (empty($valor)) {

							$main_lang	= hierarchy::get_main_lang( $locator->section_tipo );
							$dato_full	= $component->get_dato_full();
							$valor		= component_common::get_value_with_fallback_from_dato_full(
								$dato_full,
								true,
								$main_lang,
								$lang
							);
							if (is_array($valor)) {
								$valor = implode(', ', $valor);
							}
						}

					if (!empty($valor)) {
						$ar_value[] = $valor;
					}
				}//end foreach ($ar_tipo as $tipo)

				$value = implode(', ', $ar_value);

				return $value;
			};//end custom_get_term_by_locator function

		if (isset($option_obj->add_parents)) {

			// recursively
				$section_id		= $this->get_section_id();
				$section_tipo	= $this->section_tipo;

			// parent_section_tipo
				$parent_section_tipo = isset($option_obj->parent_section_tipo)
					? $option_obj->parent_section_tipo
					: false;

			// parents
				$parents = self::get_parents_recursive(
					$section_id,
					$section_tipo,
					(object)[
						'skip_root' => true,
						'search_in_main_hierarchy' => true
					]
				);

			// new_dato
			$new_dato = [];
			foreach ($parents as $locator) {

				// non resolve case (only section_id from current locator)
					if ($resolve_value!==true) {
						$new_dato[] = $locator->section_id;
						continue;
					}

				// to resolve cases
				if($parent_section_tipo!==false) {

					// term is autocomplete cases
					$term_dato = ts_object::get_term_dato_by_locator($locator);
					foreach ($term_dato as $term_locator) {

						// check valid locator section_tipo
							if (!isset($term_locator->section_tipo)) {
								debug_log(__METHOD__
									. " Skipped  term_locator (NOT LOCATOR) " . PHP_EOL
									. ' term_locator: ' . json_encode($term_locator, JSON_PRETTY_PRINT) . PHP_EOL
									. ' option_obj: ' . json_encode($option_obj, JSON_PRETTY_PRINT)
									, logger::DEBUG
								);
								continue;
							}

						if($parent_section_tipo===$term_locator->section_tipo){

							// value custom calculate
								$value = $custom_get_term_by_locator($locator, $lang, $option_obj);

							// new dato add
								$new_dato[] = !empty($value)
									? strip_tags($value)
									: $value;
						}
					}//end foreach ($term_dato as $term_locator)

				}else{

					$value = $custom_get_term_by_locator($locator, $lang, $option_obj);

					$current_value = !empty($value)
						? strip_tags($value)
						: $value;

					$new_dato[] = $current_value;
				}
			}//end foreach ($parents as $locator)

		}else{

			$dato = $this->get_dato();

			if ($resolve_value===true) {
				$new_dato = [];
				foreach ((array)$dato as $current_locator) {
					// $value = ts_object::get_term_by_locator(
					// 	$current_locator,
					// 	$lang,
					// 	true // bool from_cache
					// );
					$value = $custom_get_term_by_locator($current_locator, $lang, $option_obj);
					$new_dato[] = strip_tags($value);
				}
			}else{
				// default (untouched component dato)
				$new_dato = $dato;
			}
		}//end if (isset($option_obj->add_parents))

		$diffusion_value = !empty($new_dato)
			? (is_array($new_dato) ? json_encode($new_dato, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : $new_dato)
			: null;


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* add_parent
	* Add one locator to current 'dato'. Verify is exists to avoid duplicates
	* NOTE: This method updates component 'dato' and save
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
					.' ERROR. ignored action. Property "from_component_tipo" is mandatory ' . PHP_EOL
					. ' this->tipo: ' . to_string($this->tipo) . PHP_EOL
					. ' this->section_tipo: ' . to_string($this->section_tipo) . PHP_EOL
					. ' this->section_id: ' . to_string($this->section_id) . PHP_EOL
					, logger::ERROR
				);
				return false;
			}

		// Add current locator to component dato
			if (!$this->add_locator_to_dato($locator)) {
				return false;
			}

		return true;
	}//end add_parent



	/**
	* REMOVE_PARENT
	* Iterate current component 'dato' and if math requested locator, removes it the locator from the 'dato' array
	* NOTE: This method updates component 'dato'
	* @param locator $locator
	* @return bool
	*/
	public function remove_parent( locator $locator ) : bool {

		// remove current locator from component dato
		if (!$this->remove_locator_from_dato($locator)) {
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
					.'section_tipo: ' . $section_tipo . PHP_EOL
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					$bt = debug_backtrace();
					dump($bt, ' bt ++ '.to_string());
				}
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
	* @return array $parents
	*	Array of stClass objects with properties: section_tipo, section_id, component_tipo
	*/
	public static function get_parents( int|string $section_id, string $section_tipo, ?string $from_component_tipo=null ) : array {

		$component_tipo = $from_component_tipo ?? component_relation_parent::get_parent_tipo( $section_tipo );
		if (empty($component_tipo)) {
			debug_log(__METHOD__
				. " Error! Unable to resolve component_tipo. Returning empty array" . PHP_EOL
				. ' section_id: ' . to_string($section_id) . PHP_EOL
				. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
				. ' from_component_tipo: ' . to_string($from_component_tipo) . PHP_EOL
				. ' component_tipo: ' . to_string($component_tipo)
				, logger::ERROR
			);
			return [];
		}
		$model				= RecordObj_dd::get_modelo_name_by_tipo($component_tipo);
		$parent_component	= component_common::get_instance(
			$model, // string model
			$component_tipo, // string tipo
			$section_id, // string section_id
			'list', // string mode
			DEDALO_DATA_NOLAN, // string lang
			$section_tipo // string section_tipo
		);

		$parents = $parent_component->get_dato();

		return $parents;
	}//end get_parents



	/**
	* GET_PARENTS_RECURSIVE
	* Iterate recursively all parents of current term
	* @param int|string $section_id
	* @param string $section_tipo
	* @param ?string $component_tipo
	* @return array $parents_recursive
	*/
	public static function get_parents_recursive(int|string $section_id, string $section_tipo, ?string $component_tipo = null) : array {

		$parents_recursive = component_relation_parent::get_parents($section_id, $section_tipo, $component_tipo);

		foreach ($parents_recursive as $parent) {
			$ascendants = component_relation_parent::get_parents_recursive($parent->section_id, $parent->section_tipo, $component_tipo); // Recursively get ascendants
			$parents_recursive = array_merge($parents_recursive, $ascendants);
		}

		return $parents_recursive;
	}//end get_parents_recursive



	/**
	* MAKE_ME_YOUR_PARENT
	* Add one locator to current 'dato' from children side
	* NOTE: This method updates component 'dato' and save
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



}//end class component_relation_parent
