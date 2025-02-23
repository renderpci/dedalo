<?php declare(strict_types=1);
/**
* COMPONENT_RELATION_PARENT
* Class to manage parent relation between section.
* It does not store its own data, it only manages the component_relation_children data in 'reverse' mode
*/
class component_relation_parent extends component_relation_common {



	// Current component relation_type (used to filter locators in 'relations' container data)
	// public $relation_type = false;	// Not used. DEDALO_RELATION_TYPE_PARENT_TIPO;
	// relation_type defaults
	protected $default_relation_type		= false;
	protected $default_relation_type_rel	= null;


	// test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];

	// SQL query stored for debug only
	static $get_parents_query;



	// /**
	// * SAVE
	// * Overwrite relation common action
	// * @return int|null $section_id
	// */
	// public function Save() : ?int {
	// 	// Noting to do. This component don`t save

	// 	$section_id = !empty($this->section_id)
	// 		? (int)$this->section_id
	// 		: null;

	// 	// return section id
	// 	return $section_id;
	// }//end Save



	// /**
	// * GET DATO
	// * This component don't store data, only manages calculated data from component_relation_children generated data
	// * stored in section 'relations' container
	// * @return array|null $dato
	// *	$dato is always an array of locators
	// */
	// public function get_dato() : ?array {

	// 	// dato_resolved. Already resolved case
	// 		if(isset($this->dato_resolved)) {
	// 			return $this->dato_resolved;
	// 		}

	// 	// search mode
	// 		if ($this->mode==='search') {
	// 			return $this->dato ?? null;
	// 		}

	// 	// always get dato calculated from my parents
	// 		$dato = $this->get_my_parents();

	// 	// check dato format
	// 		if (!empty($dato) && !is_array($dato)) {
	// 			debug_log(__METHOD__
	// 				." Re-saved invalid dato. Array expected and type: ". gettype($dato)
	// 				." is received for tipo: $this->tipo, parent: $this->parent"
	// 				, logger::ERROR
	// 			);
	// 			$dato = array();
	// 			$this->set_dato( $dato );
	// 			$this->Save();
	// 		}

	// 	// rebuild dato option
	// 		if (empty($dato)) {
	// 			$dato_fixed = $dato;
	// 		}else{
	// 			$tipo			= $this->get_tipo();
	// 			$dato_fixed		= [];
	// 			$dato_length	= sizeof($dato);
	// 			for ($i=0; $i < $dato_length; $i++) {

	// 				$item = &$dato[$i];
	// 				// create a new locator and change from component tipo. Note that this component don't have relation type (!)
	// 				$locator = new locator();
	// 					$locator->set_section_tipo($item->section_tipo);
	// 					$locator->set_section_id($item->section_id);
	// 					$locator->set_from_component_tipo($tipo);

	// 				$dato_fixed[] = $locator;
	// 			}
	// 		}

	// 	// fix resolved dato
	// 		// parent::set_dato($dato_fixed);

	// 	// fix dato.
	// 		$this->dato = $dato_fixed;

	// 	// @experimental.
	// 		$this->dato_resolved = $this->dato;

	// 	// Set as loaded.
	// 		$this->bl_loaded_matrix_data = true;


	// 	return $this->dato;
	// }//end get_dato



	// /**
	// * GET_DATO_FULL
	// * @return array $dato_export
	// */
	// public function get_dato_full() : array {

	// 	$dato = $this->get_dato();
	// 	$tipo = $this->get_tipo();

	// 	if (empty($dato)) {
	// 		$dato_export = $dato;
	// 	}else{
	// 		$dato_export	= [];
	// 		$dato_length	= sizeof($dato);
	// 		for ($i=0; $i < $dato_length; $i++) {

	// 			$item = $dato[$i];
	// 			// create a new locator and change from component tipo. Note that this component dont have relation type (!)
	// 			$locator = new locator();
	// 				$locator->set_section_tipo($item->section_tipo);
	// 				$locator->set_section_id($item->section_id);
	// 				$locator->set_from_component_tipo($tipo);

	// 			$dato_export[] = $locator;
	// 		}
	// 	}

	// 	return $dato_export;
	// }//end get_dato_full



	// /**
	// * SET_DATO
	// * Note that current component DON´T STORE DATA.
	// * Instead, is inserted in the related 'component_relation_children' the link to self
	// * Don't use this method regularly, is preferable use 'add_parent' method for every new relation
	// * @param array|string $dato
	// *	When dato is string is because is a JSON encoded dato
	// * @return bool
	// */
	// public function set_dato($dato) : bool {

	// 	// dato format check
	// 		if (is_string($dato)) { // Tool Time machine case, dato is string
	// 			$dato = json_handler::decode($dato);
	// 		}
	// 		if (is_object($dato)) {
	// 			$dato = [$dato];
	// 		}
	// 		// Ensures is a real non-associative array (avoid JSON encode as object)
	// 		if (!is_null($dato)) {
	// 			$dato = is_array($dato)
	// 				? array_values($dato)
	// 				: (array)$dato;
	// 		}

	// 	// search mode
	// 		if ($this->mode==='search') {
	// 			// Fix dato
	// 			$this->dato = $dato;

	// 			return true;
	// 		}

	// 	// remove previous dato
	// 		$previous_dato = $this->get_dato();
	// 		if (!empty($previous_dato)) {
	// 			foreach ($previous_dato as $locator) {
	// 				$result = (bool)$this->remove_parent(
	// 					$locator->section_tipo,
	// 					$locator->section_id
	// 				);
	// 				if (!$result) {
	// 					debug_log(__METHOD__
	// 						. " Error on remove parent" . PHP_EOL
	// 						. 'result: ' . to_string($result) . PHP_EOL
	// 						. 'locator: ' . to_string($locator)
	// 						, logger::ERROR
	// 					);
	// 				}
	// 			}
	// 		}

	// 	// add the new one if any
	// 		if (!empty($dato)) {
	// 			foreach ($dato as $locator) {
	// 				$result	= (bool)$this->add_parent(
	// 					$locator->section_tipo,
	// 					$locator->section_id
	// 				);
	// 				if (!$result) {
	// 					debug_log(__METHOD__
	// 						. " Error on add parent" . PHP_EOL
	// 						. 'result: ' . to_string($result) . PHP_EOL
	// 						. 'locator: ' . to_string($locator)
	// 						, logger::ERROR
	// 					);
	// 				}
	// 			}
	// 		}

	// 	// $this->update_parents($dato);

	// 	// force read the new value on get_dato (prevent cache inconsistency)
	// 		unset($this->dato_resolved); //  = null;


	// 	return true;
	// }//end set_dato



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



	// /**
	// * UPDATE_CHILDREN
	// * Locate current section component_relation_children and remove given children_section_id, children_section_tipo combination from data
	// * @param string $action
	// * 	remove|add
	// * @param string $children_section_tipo
	// * @param int|string $children_section_id
	// * @param string|null $component_relation_children_tipo = null
	// *
	// * @return bool $result
	// */
	// private function update_children( string $action, string $children_section_tipo, int|string $children_section_id, ?string $component_relation_children_tipo=null ) : bool {

	// 	// default bool 	result
	// 		$result = false;

	// 	// short vars
	// 		$tipo			= $this->tipo;
	// 		$section_tipo	= $this->section_tipo;
	// 		$section_id		= $this->section_id;

	// 	// component_relation_children_tipo. Resolve if null
	// 		if (empty($component_relation_children_tipo)) {
	// 			$component_relation_children_tipo = component_relation_parent::get_component_relation_children_tipo($tipo);
	// 			// not found case
	// 			if (empty($component_relation_children_tipo)) {
	// 				debug_log(__METHOD__
	// 					." ERROR: Unable to resolve component_relation_children_tipo" . PHP_EOL
	// 					.' current tipo:  ' . $tipo
	// 					, logger::ERROR
	// 				);
	// 				return false;
	// 			}
	// 		}

	// 	// model. Expected 'component_relation_children'
	// 		$model = RecordObj_dd::get_modelo_name_by_tipo($component_relation_children_tipo, true);
	// 		if ($model!=='component_relation_children') {
	// 			// wrong model case
	// 			debug_log(__METHOD__
	// 				." Wrong target model. Expected 'component_relation_children" . PHP_EOL
	// 				.' current model: ' . $model . PHP_EOL
	// 				.' current tipo:  ' . $component_relation_children_tipo
	// 				, logger::ERROR
	// 			);
	// 			return false;
	// 		}

	// 	// component instance
	// 		$component_relation_children = component_common::get_instance(
	// 			$model,
	// 			$component_relation_children_tipo,
	// 			$children_section_id,
	// 			'edit',
	// 			DEDALO_DATA_NOLAN,
	// 			$children_section_tipo
	// 		);

	// 	// change link to me in relation_children
	// 		switch ($action) {
	// 			case 'remove':
	// 				$changed = (bool)$component_relation_children->remove_me_as_your_child(
	// 					$section_tipo,
	// 					$section_id
	// 				);
	// 				break;

	// 			case 'add':
	// 				$changed = (bool)$component_relation_children->make_me_your_child(
	// 					$section_tipo,
	// 					$section_id
	// 				);
	// 				break;

	// 			default:
	// 				$changed = false;
	// 				debug_log(__METHOD__
	// 					." Error on update_children. Invalid action ". PHP_EOL
	// 					.' action: ' .$action
	// 					, logger::ERROR
	// 				);
	// 				break;
	// 		}

	// 	// save if changed
	// 		if ($changed===true) {

	// 			$saved = $component_relation_children->Save();
	// 			if ($saved && $saved>0) {
	// 				$result = true;
	// 			}

	// 			// force read the new value on get_dato (prevent cache inconsistency)
	// 			$this->dato_resolved = null;
	// 			$this->get_dato();
	// 		}


	// 	return (bool)$result;
	// }//end update_children



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



	// /**
	// * ADD_PARENT
	// * Alias of update_children with specific action 'add'
	// * @param string $children_section_tipo
	// * @param mixed $children_section_id
	// * @param string|null $component_relation_children_tipo = null
	// * @return bool
	// */
	// public function add_parent( string $children_section_tipo, mixed $children_section_id, ?string $component_relation_children_tipo=null ) : bool {

	// 	$action = 'add';

	// 	return $this->update_children($action, $children_section_tipo, $children_section_id, $component_relation_children_tipo);
	// }//end add_parent



	// /**
	// * REMOVE_PARENT
	// * 	Alias of update_children with specific action 'remove'
	// * @param string $children_section_tipo
	// * @param mixed $children_section_id
	// * @param string|null $component_relation_children_tipo = null
	// * @return bool
	// */
	// public function remove_parent( string $children_section_tipo, mixed $children_section_id, ?string $component_relation_children_tipo=null ) : bool {

	// 	$action = 'remove';

	// 	return $this->update_children($action, $children_section_tipo, $children_section_id, $component_relation_children_tipo);
	// }//end remove_parent



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
	* GET_MY_PARENTS
	* @return array $parents
	*/
	protected function get_my_parents() : array {

		$parents = [];

		// empty section_id case
			if(empty($this->section_id)){
				return $parents;
			}

		$target_component_children_tipos = component_relation_parent::get_target_component_children_tipos($this->tipo);

		if (!empty($target_component_children_tipos)) {
			foreach ($target_component_children_tipos as $children_component_tipo) {
				$parents = array_merge(
					$parents,
					component_relation_parent::get_parents(
						$this->section_id,
						$this->section_tipo,
						$children_component_tipo,
						null,
						(object)[
							'search_in_main_hierarchy' => true
						]
					)
				);
			}
		}

		return $parents;
	}//end get_my_parents



	/**
	* GET_PARENTS
	* Get parents of current section
	* If you call this method from component_relation_parent, always send $from_component_tipo var to avoid recreate the component statically
	* @param int|string $section_id
	* @param string $section_tipo
	* @param string|null $from_component_tipo = null
	*	Optional. Previously calculated from structure using current section tipo info or calculated inside from section_tipo
	* @param array $ar_tables
	*	Optional. If set, union tables search is made over all tables received
	* @param object|null $options
	*	Optional parameter to enable additional calculations like hierarchy section search for parents (Thesaurus case)
	* @return array $parents
	*	Array of stClass objects with properties: section_tipo, section_id, component_tipo
	*/
	public static function get_parents( int|string $section_id, string $section_tipo, ?string $from_component_tipo=null, ?array $ar_tables=null, ?object $options=null ) : array {
		$start_time=start_time();

		// options
			// search_in_main_hierarchy. Enable to add parents from hierarchy section (hierarchy1)
			$search_in_main_hierarchy = $options->search_in_main_hierarchy ?? false;
			// main_table
			$main_table = $options->main_table ?? ( ( strpos($section_tipo,'ontology')!==false ) ? ontology::$main_table : hierarchy::$main_table );
			// hierarchy_from_component_tipo. When 'search_in_main_hierarchy' is true, it allows to select the component_reation_children component to be searched.
			$hierarchy_from_component_tipo = $options->hierarchy_from_component_tipo ?? DEDALO_HIERARCHY_CHILDREN_TIPO;

			// debug
				// if ($search_in_main_hierarchy===false) {
				// 	$bt = debug_backtrace();
				// 	dump($bt[1], ' bt[1] ++ '.to_string($options));
				// }

		// parents array container
			$parents = [];

		// hierarchy1 case (root)
			if ($section_tipo===DEDALO_HIERARCHY_SECTION_TIPO) {
				return $parents; // We are in last level of parent 'hierarchy1'
			}

		// from_component_tipo filter option
			$filter = '';
			if (!is_null($from_component_tipo)) {
				/*
					# Locate current section component parent tipo
					$ar_model_name_required = array('component_relation_parent');
					$ar_children_tipo 	 	 = section::get_ar_children_tipo_by_model_name_in_section($section_tipo, $ar_model_name_required, $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true);
					$component_parent_tipo 	 = reset($ar_children_tipo);
					# Calculate current target component_relation_children_tipo from structure
					$from_component_tipo 	 = component_relation_parent::get_component_relation_children_tipo($component_parent_tipo);
					*/
				$filter = ',"from_component_tipo":"'.$from_component_tipo.'"';
			}

		// compare
			$type		= DEDALO_RELATION_TYPE_CHILDREN_TIPO;
			$compare	= '{"section_tipo":"'.$section_tipo.'","section_id":"'.$section_id.'","type":"'.$type.'"'.$filter.'}';

		// tables query
			$strQuery	= '';
			$sql_select	= 'section_tipo, section_id, datos#>\'{relations}\' AS relations';
			$sql_where	= 'datos#>\'{relations}\' @> \'['.$compare.']\'::jsonb';
			if (is_null($ar_tables)) {
				// Calculated from section_tipo (only search in current table)
				$table = common::get_matrix_table_from_tipo($section_tipo);
				if (empty($table)) {
					debug_log(__METHOD__
						. " Error on get table from section. Empty result is received. Empty parents will be return" . PHP_EOL
						. ' Check that section "' .$section_tipo . '" already exists. If not, check hierarchies to create it' . PHP_EOL
						. ' section_id: ' . to_string($section_id) . PHP_EOL
						. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
						. ' from_component_tipo: ' . to_string($from_component_tipo)
						, logger::ERROR
					);
					return [];
				}
				$strQuery  .= "SELECT $sql_select FROM \"$table\" WHERE $sql_where ";
			}else{
				// Iterate tables and make union search
				$ar_query = array();
				foreach ($ar_tables as $table) {
					$ar_query[] = "SELECT $sql_select FROM \"$table\" WHERE $sql_where ";
				}
				$strQuery .= implode(" UNION ALL ", $ar_query);
			}

		// search_in_main_hierarchy. Add hierarchy main parents
		// By default, only self section is searched. When in case parent is a hierarchy (like 'hierarchy256')
		// we also need to search in main_hierarchy table the "target" parent
			// $search_in_main_hierarchy = true;
			if($search_in_main_hierarchy===true) {
				$main_filter	= ",\"from_component_tipo\":\"$hierarchy_from_component_tipo\"";
				$main_compare	= "{\"section_tipo\":\"$section_tipo\",\"section_id\":\"$section_id\",\"type\":\"$type\"".$main_filter."}";
				$sql_where		= "datos#>'{relations}' @> '[$main_compare]'::jsonb";
				$strQuery	   .= "\nUNION ALL \nSELECT $sql_select FROM \"$main_table\" WHERE $sql_where ";
			}

		// Set order to maintain results stable
			$strQuery .= ' ORDER BY section_id ASC';

		// debug
			if(SHOW_DEBUG===true) {
				// store query
				component_relation_parent::$get_parents_query = $strQuery;
			}

		// search exec
			$result	= JSON_RecordObj_matrix::search_free($strQuery);
			if ($result===false) {
				debug_log(__METHOD__
					. " Error on get search free result. False result is received " . PHP_EOL
					. ' strQuery: ' . $strQuery . PHP_EOL
					. ' section_id: ' . to_string($section_id) . PHP_EOL
					. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
					. ' from_component_tipo: ' . to_string($from_component_tipo) . PHP_EOL
					. ' ar_tables: ' . to_string($ar_tables)
					, logger::ERROR
				);
			}else{

				// debug
					if(SHOW_DEVELOPER===true) {
						$exec_time = exec_time_unit($start_time,'ms');
						if (!empty(dd_core_api::$rqo)) {
							dd_core_api::$sql_query_search[] = '-- [get_parents] TIME ms: '. $exec_time . PHP_EOL . $strQuery;
						}
					}

				while ($row = pg_fetch_object($result)) {

					$current_section_id		= $row->section_id;
					$current_section_tipo	= $row->section_tipo;
					$current_relations		= json_decode($row->relations);

					// check infinite loop
						if ($current_section_id==$section_id && $current_section_tipo===$section_tipo) {
							debug_log(__METHOD__
								." ERROR: Error on get parent. Parent is set a itself parent creating a infinite loop. Ignored locator"
								.' section_id: ' .$section_id . PHP_EOL
								.' section_tipo: ' .$section_tipo . PHP_EOL
								, logger::ERROR
							);
							continue;
						}

					// Hierarchy parent case locator, force from_component_tipo
						if ($current_section_tipo===DEDALO_HIERARCHY_SECTION_TIPO) { // 'hierarchy1'
							$from_component_tipo = DEDALO_HIERARCHY_CHILDREN_TIPO;
						}

					// from_component_tipo. Calculated_from_component_tipo on empty. Search 'from_component_tipo' in locators when no is received
						if (empty($from_component_tipo)) {

							$reference_locator = new locator();
								$reference_locator->set_section_tipo($section_tipo);
								$reference_locator->set_section_id($section_id);
								$reference_locator->set_type($type);

							foreach ((array)$current_relations as $current_locator) {
								if(true===locator::compare_locators($current_locator, $reference_locator, ['section_tipo','section_id','type'])) {
									if (!isset($current_locator->from_component_tipo)) {
										dump($current_locator, "Bad locator.'from_component_tipo' property not found in locator (get_parents: $section_id, $section_tipo)");
										debug_log(__METHOD__
											." Bad locator.'from_component_tipo' property not found in locator (get_parents: $section_id, $section_tipo)" . PHP_EOL
											.' current_locator:' . json_encode($current_locator, JSON_PRETTY_PRINT)
											, logger::ERROR
										);
									}
									// calculated_from_component_tipo overwrite empty value
									$from_component_tipo = $current_locator->from_component_tipo;
									break;
								}
							}
						}//end if (empty($from_component_tipo))

					// parent_locator
						$parent_locator = new locator();
							$parent_locator->set_section_tipo($current_section_tipo);
							$parent_locator->set_section_id($current_section_id);
							$parent_locator->set_type(DEDALO_RELATION_TYPE_CHILDREN_TIPO);
							$parent_locator->set_from_component_tipo($from_component_tipo);

					// parents add locator
						$parents[] = $parent_locator;
				}//end while
			}

		// debug
			if(SHOW_DEBUG===true) {
				// $total=round(start_time()-$start_time,3);
				// debug_log(__METHOD__." section_id:$section_id, section_tipo:$section_tipo, from_component_tipo:$from_component_tipo, ar_tables:$ar_tables - $strQuery ".exec_time_unit($start_time,'ms').' ms' , logger::DEBUG);
				// $total = exec_time_unit($start_time,'ms')." ms";
				// dump($total, ' ///////// total ++ '.to_string("$section_id, $section_tipo, $from_component_tipo, $ar_tables") .PHP_EOL. " $strQuery");
			}


		return $parents;
	}//end get_parents



	/**
	* GET_PARENTS_RECURSIVE
	* Iterate recursively all parents of current term
	* @param int|string $section_id
	* @param string $section_tipo
	* @param object|null $options
	* @param array $parents_recursive = []
	* 	Accumulates results to allow check for duplicates
	* @param bool $is_recursion = false
	* 	Used to prevent cache recursions
	* @return array $parents_recursive
	*/
	public static function get_parents_recursive(int|string $section_id, string $section_tipo, ?object $options, array $parents_recursive=[], bool $is_recursion=false) : array {

		// options
			// skip_root. Allows you to avoid including the root term as a parent
			$skip_root = $options->skip_root ?? false;
			// search_in_main_hierarchy. Enable to add parents from hierarchy section (hierarchy1)
			$search_in_main_hierarchy = $options->search_in_main_hierarchy ?? false;
			// hierarchy_from_component_tipo. When 'search_in_main_hierarchy' is true, it allows to select the component_reation_children component to be searched.
			$hierarchy_from_component_tipo = $options->hierarchy_from_component_tipo ?? DEDALO_HIERARCHY_CHILDREN_TIPO;

		// cache key_resolve
			static $parents_recursive_resolved;
			$key_resolve = $section_tipo.'_'.$section_id.'_'.(int)$skip_root.'_'.(int)$search_in_main_hierarchy.'_'.(int)$hierarchy_from_component_tipo;
			if (isset($parents_recursive_resolved[$key_resolve])) {
				return $parents_recursive_resolved[$key_resolve];
			}

		// parents
		$ar_parents = component_relation_parent::get_parents(
			$section_id,
			$section_tipo,
			null, // from_component_tipo
			null, // ar_tables
			$options // object options
		);
		if (!empty($ar_parents)) {
			foreach ($ar_parents as $current_locator) {

				// root skip case
					if ($skip_root===true && $current_locator->section_tipo===DEDALO_HIERARCHY_SECTION_TIPO) {
						continue;
					}

				// skip self
					if ($current_locator->section_tipo===$section_tipo && $current_locator->section_id==$section_id) {
						// debug_log(__METHOD__
						// 	. " Reference to self is omitted (current_locator) " . PHP_EOL
						// 	. ' current_locator: ' . to_string($current_locator)
						// 	, logger::WARNING
						// );
						continue;
					}

				// skip already added
					if (locator::in_array_locator($current_locator, $parents_recursive, ['section_tipo','section_id'])) {
						// debug_log(__METHOD__
						// 	. " Already added locator is omitted (current_locator) " . PHP_EOL
						// 	. ' current_locator: ' . to_string($current_locator)
						// 	, logger::WARNING
						// );
						continue;
					}

				// add current
					$parents_recursive[] = $current_locator;

				// recursion
					$parent_parents_recursive = component_relation_parent::get_parents_recursive(
						$current_locator->section_id,
						$current_locator->section_tipo,
						$options,
						$parents_recursive,
						true // is_recursion
					);
					if (!empty($parent_parents_recursive)) {
						foreach ($parent_parents_recursive as $parent_locator) {

							// skip self
								if ($parent_locator->section_tipo===$section_tipo && $parent_locator->section_id==$section_id) {
									// debug_log(__METHOD__
									// 	. " Reference to self is omitted (parent_locator) " . PHP_EOL
									// 	. ' parent_locator: ' . to_string($parent_locator)
									// 	, logger::WARNING
									// );
									continue;
								}

							// skip already added
								if (locator::in_array_locator($parent_locator, $parents_recursive, ['section_tipo','section_id'])) {
									// debug_log(__METHOD__
									// 	. " Already added locator is omitted (parent_locator) " . PHP_EOL
									// 	. ' parent_locator: ' . to_string($parent_locator)
									// 	, logger::WARNING
									// );
									continue;
								}

							// add current
								$parents_recursive[] = $parent_locator;
						}
					}
			}//end foreach ($ar_parents as $current_locator)
		}

		// cache Set as resolved
			if ($is_recursion===false) {
				$parents_recursive_resolved[$key_resolve] = $parents_recursive;
			}


		return $parents_recursive;
	}//end get_parents_recursive



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

		// parent_locators
			$parent_locators = is_string($q)
				? json_decode($q)
				: $q;
			if (!is_array($parent_locators)) {
				$parent_locators = [$parent_locators];
			}

		// children
			$ar_children = [];
			foreach ($parent_locators as $current_locator) {

				$current_component_relation_parent_tipo	= $current_locator->from_component_tipo;
				$target_component_children_tipos		= component_relation_parent::get_target_component_children_tipos(
					$current_component_relation_parent_tipo
				);
				if (!empty($target_component_children_tipos)) {
					foreach ($target_component_children_tipos as $children_component_tipo) {

						$model_name	= RecordObj_dd::get_modelo_name_by_tipo($children_component_tipo, true); // component_relation_children
						$component	= component_common::get_instance(
							$model_name,
							$children_component_tipo,
							$current_locator->section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$current_locator->section_tipo
						);
						$component_children_dato = $component->get_dato();
						foreach ($component_children_dato as $children_locator) {
							$ar_children[] = $children_locator->section_id;
						}
					}//end foreach ($target_component_children_tipos as $children_component_tipo)
				}
			}

		// q_clean
			$q_clean = array_map(function($el){
				return (int)$el;
			}, $ar_children);

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
	* GET_TARGET_COMPONENT_CHILDREN_TIPOS
	* Resolve all possible component relation children targeted to current component relation parent
	* @param string $component_tipo
	* @return array $target_component_children_tipos
	*/
	public static function get_target_component_children_tipos(string $component_tipo) : array {

		// Static cache
			static $ar_resolved_target_component_children_tipos = [];
			if (isset($ar_resolved_target_component_children_tipos[$component_tipo])) {
				return $ar_resolved_target_component_children_tipos[$component_tipo];
			}

		$target_component_children_tipos = [];

		// from_component_tipo. Calculate current target component_relation_children_tipo from structure
			$from_component_tipo = component_relation_parent::get_component_relation_children_tipo($component_tipo);
			if (empty($from_component_tipo)) {
				debug_log(__METHOD__
					." Error on get from_component_tipo. Ontology item don't have relation with a component_relation_children" .PHP_EOL
					.' component_tipo: ' . $component_tipo
					, logger::ERROR
				);

				return $target_component_children_tipos;
			}

		// Look in children properties different possible sources
			$RecordObj								= new RecordObj_dd($from_component_tipo);
			$my_component_children_tipo_properties	= $RecordObj->get_properties();

		// hierarchy_sections
			$hierarchy_types	= !empty($my_component_children_tipo_properties->source->hierarchy_types)
				? $my_component_children_tipo_properties->source->hierarchy_types
				: null;
			$hierarchy_sections	= !empty($my_component_children_tipo_properties->source->hierarchy_sections)
				? $my_component_children_tipo_properties->source->hierarchy_sections
				: null;

		// Resolve hierarchy_sections for speed
			if (!empty($hierarchy_types)) {
				$hierarchy_types_sections	= component_relation_common::get_hierarchy_sections_from_types($hierarchy_types);
				$hierarchy_sections			= array_merge((array)$hierarchy_sections, $hierarchy_types_sections);
			}

		// target_component_children_tipos
			if (empty($hierarchy_sections)) {

				// Default
				$target_component_children_tipos[] = $from_component_tipo;

			}else{

				// Look component children across all related sections
				$model_name = 'component_relation_children';
				foreach ($hierarchy_sections as $children_section_tipo) {
					// Resolve children component tipo from children_section_tipo
					$ar_children_component_tipo = section::get_ar_children_tipo_by_model_name_in_section(
						$children_section_tipo, // string $section_tipo
						[$model_name], // array $ar_model_name_required
						true, // bool from_cache
						true, // bool resolve_virtual
						true, // bool recursive
						true, // bool search_exact
						false // array|bool ar_tipo_exclude_elements
					);
					$children_component_tipo = !empty($ar_children_component_tipo)
						? reset($ar_children_component_tipo)
						: null;
					if (!empty($children_component_tipo) && !in_array($children_component_tipo, $target_component_children_tipos)) {
						$target_component_children_tipos[] = $children_component_tipo;
					}
				}
			}

		// Static cache
			$ar_resolved_target_component_children_tipos[$component_tipo] = $target_component_children_tipos;


		return $target_component_children_tipos;
	}//end get_target_component_children_tipos



}//end class component_relation_parent
