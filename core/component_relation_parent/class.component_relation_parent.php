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

	// errors. Store statically the class errors
	static $errors;



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

					$model		= ontology_node::get_modelo_name_by_tipo($tipo,true);
					// $model	= ontology_node::get_legacy_model_name_by_tipo($tipo);
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
					$this->tipo
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
	* @return array $parents
	*	Array of stClass objects with properties: section_tipo, section_id, component_tipo
	*/
	public static function get_parents( int|string $section_id, string $section_tipo, ?string $from_component_tipo=null ) : array {

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
		$model				= ontology_node::get_modelo_name_by_tipo($component_tipo);
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
		$direct_parents = self::get_parents($section_id, $section_tipo, $component_tipo);

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
