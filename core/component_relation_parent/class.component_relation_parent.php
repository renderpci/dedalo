<?php
/**
* COMPONENT_RELATION_PARENT
* Class to manage parent relation between section.
* Not store his own data, only manage component_relation_childrens data in 'reverse' mode
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
	* This component don't store data, only manages calculated data from component_relation_children generated data
	* stored in section 'relations' container
	* @return array|null $dato
	*	$dato is always an array of locators
	*/
	public function get_dato() : ?array {

		// dato_resolved. Already resolved case
			if(isset($this->dato_resolved)) {
				return $this->dato_resolved;
			}

		// search mode
			if ($this->mode==='search') {
				return $this->dato ?? null;
			}

		// always get dato calculated from my parents
			$dato = $this->get_my_parents();

		// check dato format
			if (!empty($dato) && !is_array($dato)) {
				debug_log(__METHOD__
					." Re-saved invalid dato. Array expected and type: ". gettype($dato)
					." is received for tipo: $this->tipo, parent: $this->parent"
					, logger::ERROR
				);
				$dato = array();
				$this->set_dato( $dato );
				$this->Save();
			}

		// rebuild dato option
			if (empty($dato)) {
				$dato_fixed = $dato;
			}else{
				$tipo			= $this->get_tipo();
				$dato_fixed		= [];
				$dato_length	= sizeof($dato);
				for ($i=0; $i < $dato_length; $i++) {

					$item = &$dato[$i];
					// create a new locator and change from component tipo. Note that this component don't have relation type (!)
					$locator = new locator();
						$locator->set_section_tipo($item->section_tipo);
						$locator->set_section_id($item->section_id);
						$locator->set_from_component_tipo($tipo);

					$dato_fixed[] = $locator;
				}
			}

		// fix resolved dato
			// parent::set_dato($dato_fixed);

		// fix dato.
			$this->dato = $dato_fixed;

		// @experimental.
			$this->dato_resolved = $this->dato;

		// Set as loaded.
			$this->bl_loaded_matrix_data = true;


		return $this->dato;
	}//end get_dato



	/**
	* GET_DATO_FULL
	* @return array $dato_export
	*/
	public function get_dato_full() : array {

		$dato = $this->get_dato();
		$tipo = $this->get_tipo();

		if (empty($dato)) {
			$dato_export = $dato;
		}else{
			$dato_export	= [];
			$dato_length	= sizeof($dato);
			for ($i=0; $i < $dato_length; $i++) {

				$item = $dato[$i];
				// create a new locator and change from component tipo. Note that this component dont have relation type (!)
				$locator = new locator();
					$locator->set_section_tipo($item->section_tipo);
					$locator->set_section_id($item->section_id);
					$locator->set_from_component_tipo($tipo);

				$dato_export[] = $locator;
			}
		}

		return $dato_export;
	}//end get_dato_full



	/**
	* SET_DATO
	* Note that current component DON´T STORE DATA.
	* Instead, is inserted in the related 'component_relation_children' the link to self
	* Don't use this method regularly, is preferable use 'add_parent' method for every new relation
	* @param array|string $dato
	*	When dato is string is because is a JSON encoded dato
	* @return bool
	*/
	public function set_dato($dato) : bool {

		// format check
			if (is_string($dato)) { # Tool Time machine case, dato is string
				$dato = json_decode($dato);
			}
			if (is_object($dato)) {
				$dato = array($dato);
			}
			# Ensures is a real non-associative array (avoid JSON encode as object)
			$dato = is_array($dato) ? array_values($dato) : (array)$dato;

		// search mode
			if ($this->mode==='search') {
				# Fix dato
				$this->dato = $dato;

				return true;
			}

		// changed_data. Updates and SAVE data in component children associated with the current component
			if (isset($this->changed_data)) {

				// changed_data case

				// format object:
					// {
					//     "action": "remove",
					//     "key": 3,
					//     "value": null
					//     "to_remove": {locator}
					// }
				$changed_data = $this->changed_data;
				switch ($changed_data->action) {
					case 'remove':
						if (isset($changed_data->to_remove)) {
							$locator	= $changed_data->to_remove;
							$result		= (bool)$this->remove_parent($locator->section_tipo, $locator->section_id);
							if (!$result) {
								debug_log(__METHOD__
									. " Error on remove parent" . PHP_EOL
									. 'result: ' . to_string($result) . PHP_EOL
									. 'locator: ' . to_string($locator)
									, logger::ERROR
								);
							}
						}
						break;
					case 'insert':
					case 'update':
						if (isset($dato[$changed_data->key])) {
							$locator	= $dato[$changed_data->key];
							$result		= (bool)$this->add_parent($locator->section_tipo, $locator->section_id);
							if (!$result) {
								debug_log(__METHOD__
									. " Error on add parent" . PHP_EOL
									. 'result: ' . to_string($result)
									. 'locator: ' . to_string($locator)
									, logger::ERROR
								);
							}
						}
						break;
					default:
						debug_log(__METHOD__
							." Error. action: '$changed_data->action' not defined ! "
							, logger::ERROR
						);
						break;
				}
			}else{

				// import case

				// remove previous dato
					$previous_dato = $this->get_dato();
					if (!empty($previous_dato)) {
						foreach ($previous_dato as $locator) {
							$result		= (bool)$this->remove_parent($locator->section_tipo, $locator->section_id);
							if (!$result) {
								debug_log(__METHOD__
									. " Error on remove parent" . PHP_EOL
									. 'result: ' . to_string($result) . PHP_EOL
									. 'locator: ' . to_string($locator)
									, logger::ERROR
								);
							}
						}
					}

				// add the new one
					if (!empty($dato)) {
						foreach ($dato as $locator) {
							$result		= (bool)$this->add_parent($locator->section_tipo, $locator->section_id);
							if (!$result) {
								debug_log(__METHOD__
									. " Error on add parent" . PHP_EOL
									. 'result: ' . to_string($result)
									. 'locator: ' . to_string($locator)
									, logger::ERROR
								);
							}
						}
					}
			}

			// $this->update_parents($dato);

		return true;
	}//end set_dato



	/**
	* UPDATE_CHILDREN
	* Locate current section component_relation_children and remove given children_section_id, children_section_tipo combination from data
	* @param string $action
	* 	remove|add
	* @param string $children_section_tipo
	* @param mixed $children_section_id
	* @param string $component_relation_children_tipo = null
	*
	* @return bool $result
	*/
	private function update_children(string $action, string $children_section_tipo, $children_section_id, string $component_relation_children_tipo=null) : bool {

		$result = false;

		// short vars
			$tipo			= $this->tipo;
			$section_tipo	= $this->section_tipo;
			$section_id		= $this->section_id;


		// component_relation_children_tipo. Resolve if null
			if (empty($component_relation_children_tipo)) {
				$component_relation_children_tipo = component_relation_parent::get_component_relation_children_tipo($tipo);
				// not found case
				if (empty($component_relation_children_tipo)) {
					debug_log(__METHOD__
						." ERROR: Unable to resolve component_relation_children_tipo" . PHP_EOL
						.' current tipo:  ' . $tipo
						, logger::ERROR
					);
					return false;
				}
			}

		// model. Expected 'component_relation_children'
			$model = RecordObj_dd::get_modelo_name_by_tipo($component_relation_children_tipo, true);
			if ($model!=='component_relation_children') {
				// wrong model case
				debug_log(__METHOD__
					." Wrong target model. Expected 'component_relation_children" . PHP_EOL
					.' current model: ' . $model . PHP_EOL
					.' current tipo:  ' . $component_relation_children_tipo
					, logger::ERROR
				);
				return false;
			}

		// component instance
			$component_relation_children = component_common::get_instance(
				$model,
				$component_relation_children_tipo,
				$children_section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$children_section_tipo
			);

		// change link to me in relation_children
			switch ($action) {
				case 'remove':
					$changed = (bool)$component_relation_children->remove_me_as_your_child($section_tipo, $section_id);
					break;

				case 'add':
					$changed = (bool)$component_relation_children->make_me_your_child($section_tipo, $section_id);
					break;

				default:
					$changed = false;
					debug_log(__METHOD__
						." Error on update_children. Invalid action ". PHP_EOL
						.' action: ' .$action
						, logger::ERROR
					);
					break;
			}

		// save if changed
			if ($changed===true) {
				$saved = $component_relation_children->Save();
				if ($saved && $saved>0) {
					$result = true;
				}
			}


		return (bool)$result;
	}//end update_children



	/**
	* ADD_PARENT
	* 	Alias of update_children with specific action 'add'
	* @return bool
	*/
	public function add_parent(string $children_section_tipo, $children_section_id, string $component_relation_children_tipo=null) : bool {

		$action = 'add';

		return $this->update_children($action, $children_section_tipo, $children_section_id, $component_relation_children_tipo);
	}//end add_parent



	/**
	* REMOVE_PARENT
	* 	Alias of update_children with specific action 'remove'
	* @return bool
	*/
	public function remove_parent(string $children_section_tipo, $children_section_id, string $component_relation_children_tipo=null) : bool {

		$action = 'remove';

		return $this->update_children($action, $children_section_tipo, $children_section_id, $component_relation_children_tipo);
	}//end remove_parent



	/**
	* GET_COMPONENT_RELATION_CHILDREN_TIPO
	* @param string $component_tipo
	* @return string $component_relation_children_tipo
	*/
	public static function get_component_relation_children_tipo(string $component_tipo) : ?string {

		$model_name 	 = 'component_relation_children';
		$ar_children 	 = (array)common::get_ar_related_by_model($model_name, $component_tipo);
		$ar_children_len = count($ar_children);
		if ($ar_children_len===0) {

			debug_log(__METHOD__
				." Error: component_relation_children not found in this section" . PHP_EOL
				.' component_tipo: '. $component_tipo . PHP_EOL
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
		$component_relation_children_tipo = reset($ar_children);

		return $component_relation_children_tipo;
	}//end get_component_relation_children_tipo



	/**
	* GET_MY_PARENTS
	* @return array $parents
	*/
	protected function get_my_parents() : array {

		$target_component_children_tipos = (array)component_relation_parent::get_target_component_children_tipos($this->tipo);

		$parents = [];
		foreach ($target_component_children_tipos as $children_component_tipo) {
			$parents = array_merge($parents, component_relation_parent::get_parents($this->section_id, $this->section_tipo, $children_component_tipo));
		}

		return $parents;

		/*
			# Calculate current target component_relation_children_tipo from structure
			$from_component_tipo = component_relation_parent::get_component_relation_children_tipo($this->tipo);

			#$parents = component_relation_parent::get_parents($this->parent, $this->section_tipo, $from_component_tipo);

			#
			# Look in children properties different possible sources
			$RecordObj 								= new RecordObj_dd($from_component_tipo);
			$my_component_children_tipo_properties = $RecordObj->get_properties(true);

			# hierarchy_sections
			$hierarchy_types 	= isset($my_component_children_tipo_properties->source->hierarchy_types) 	 ? $my_component_children_tipo_properties->source->hierarchy_types : null;
			$hierarchy_sections = isset($my_component_children_tipo_properties->source->hierarchy_sections) ? $my_component_children_tipo_properties->source->hierarchy_sections : null;
			# Resolve hierarchy_sections for speed
			if (!empty($hierarchy_types)) {
				$hierarchy_sections = component_relation_common::get_hierarchy_sections_from_types($hierarchy_types, (array)$hierarchy_sections);
			}
			#dump($hierarchy_sections, ' hierarchy_sections ++ '.to_string());

			if (empty($hierarchy_sections)) {
				# Only from current section component children
				$parents = component_relation_parent::get_parents($this->parent, $this->section_tipo, $from_component_tipo);
			}else{
				# Look component children across all related sections
				$model_name = 'component_relation_children';
				$parents 	 = [];
				$ar_resolved = [];
				foreach ($hierarchy_sections as $children_section_tipo) {
					# Resolve children component tipo from children_section_tipo
					$ar_children_component_tipo = section::get_ar_children_tipo_by_model_name_in_section(	$children_section_tipo,
																											[$model_name],
																											true, # from_cache
																											true, # resolve_virtual
																											true, # recursive
																											true, # search_exact
																											false); # ar_tipo_exclude_elements
					$children_component_tipo = reset($ar_children_component_tipo);
					if (in_array($children_component_tipo, $ar_resolved)) {
						continue;
					}

						#dump($children_component_tipo, ' children_component_tipo ++ '.to_string($children_section_tipo));
					$parents = array_merge($parents, component_relation_parent::get_parents($this->parent, $this->section_tipo, $children_component_tipo));
					#dump($parents, ' parents ++ children_component_tipo - '." parent:$this->parent, section_tipo:$this->section_tipo, children_component_tipo:$children_component_tipo ".to_string());
					debug_log(__METHOD__." parent:$this->parent, section_tipo:$this->section_tipo, children_component_tipo:$children_component_tipo ".to_string($parents), logger::DEBUG);
					$ar_resolved[] = $children_component_tipo;
				}
			}

			return (array)$parents;
		*/
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
	*
	* @return array $parents
	*	Array of stClass objects with properties: section_tipo, section_id, component_tipo
	*/
	public static function get_parents(int|string $section_id, string $section_tipo, ?string $from_component_tipo=null, ?array $ar_tables=null) : array {

		$parents = array();

		// hierarchy1 case (root)
			if ($section_tipo===DEDALO_HIERARCHY_SECTION_TIPO) {
				return $parents; // We are in last level of parent 'hierarchy1'
			}

		// from_component_tipo filter option
			$filter ='';
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
				$table 	   = common::get_matrix_table_from_tipo($section_tipo);
				$strQuery .= "SELECT $sql_select FROM \"$table\" WHERE $sql_where ";
			}else{
				// Iterate tables and make union search
				$ar_query = array();
				foreach ($ar_tables as $table) {
					$ar_query[] = "SELECT $sql_select FROM \"$table\" WHERE $sql_where ";
				}
				$strQuery .= implode(" UNION ALL ", $ar_query);
			}

		// Add hierarchy main parents
		// By default, only self section is searched. When in case parent is a hierarchy (like 'hierarchy256')
		// we need search too in main_hierarchy table the "target" parent
			$search_in_main_hierarchy = true;
			if($search_in_main_hierarchy===true) {
				$main_from_component_tipo = DEDALO_HIERARCHY_CHILDREN_TIPO;
				$main_filter	= ",\"from_component_tipo\":\"$main_from_component_tipo\"";
				$main_compare	= "{\"section_tipo\":\"$section_tipo\",\"section_id\":\"$section_id\",\"type\":\"$type\"".$main_filter."}";
				$sql_where		= "datos#>'{relations}' @> '[$main_compare]'::jsonb";
				$table			= hierarchy::$table;
				$strQuery		.= "\nUNION ALL \nSELECT $sql_select FROM \"$table\" WHERE $sql_where ";
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

		// debug
			if(SHOW_DEBUG===true) {
				#$total=round(start_time()-$start_time,3);
				#debug_log(__METHOD__." section_id:$section_id, section_tipo:$section_tipo, from_component_tipo:$from_component_tipo, ar_tables:$ar_tables - $strQuery ".exec_time_unit($start_time,'ms').' ms' , logger::DEBUG);
				// $total = exec_time_unit($start_time,'ms')." ms";
				// dump($total, ' ///////// total ++ '.to_string("$section_id, $section_tipo, $from_component_tipo, $ar_tables") .PHP_EOL. " $strQuery");
			}


		return $parents;
	}//end get_parents



	/**
	* GET_PARENTS_RECURSIVE
	* Iterate recursively all parents of current term
	* @param int $section_id
	* @param string $section_tipo
	* @param bool $skip_root = true
	* @return array $parents_recursive
	*/
	public static function get_parents_recursive($section_id, string $section_tipo, bool $skip_root=true) : array {

		// static vars set
			static $ar_parents_recursive_resolved	= array();
			static $locators_resolved				= array();

		// key_resolve
			$key_resolve = $section_tipo.'_'.$section_id;
			if (isset($ar_parents_recursive_resolved[$key_resolve])) {
				return $ar_parents_recursive_resolved[$key_resolve];
			}

		// parents_recursive set
			$parents_recursive = array();

		// Add first level
			$ar_parents			= component_relation_parent::get_parents($section_id, $section_tipo);
			$parents_recursive	= $ar_parents;


		// Self include as resolved
			$lkey						= $section_tipo.'_'.$section_id;
			$locators_resolved[$lkey]	= $ar_parents;

		// iterate ar_parents
			foreach ($ar_parents as $current_locator) {

				// Check self recursion
					$lkey = $current_locator->section_tipo.'_'.$current_locator->section_id;
					if (array_key_exists($lkey, $locators_resolved)) {
						$parents_recursive = array_merge($parents_recursive, $locators_resolved[$lkey]);
						continue;
					}

				// Add every parent level
					$current_ar_parents = component_relation_parent::get_parents_recursive(
						$current_locator->section_id,
						$current_locator->section_tipo,
						$skip_root
					);
					$current_ar_parents_safe = [];
					foreach ($current_ar_parents as $c_parent) {
						#debug_log(__METHOD__." c_parent ".to_string($c_parent), logger::DEBUG);
						if ($skip_root===true) {
							if ($c_parent->section_tipo===DEDALO_HIERARCHY_SECTION_TIPO) continue; // Skip root hierarchy term
						}

						// Add to array
							$current_ar_parents_safe[] = $c_parent;

						// Self include as resolved
							#$locators_resolved[$c_parent->section_tipo.'_'.$c_parent->section_id] = [$c_parent];
					}

				// Self include as resolved
					$locators_resolved[$lkey] = $current_ar_parents_safe;

				// add
					$parents_recursive = array_merge($parents_recursive, $current_ar_parents_safe);
			}

		// Set as resolved
			$ar_parents_recursive_resolved[$key_resolve] = $parents_recursive;


		return $parents_recursive;
	}//end get_parents_recursive



	// DES
		// /**
		// * GET_PARENT_RECURSIVE2
		// * @return array $parents
		// */
		// public static function get_parent_recursive2__UNUSED($section_id, $section_tipo) {

		// 	# Sólo test de momento

		// 	$matrix_table = common::get_matrix_table_from_tipo($section_tipo);

		// 	$strQuery = 'SELECT section_id FROM '.$matrix_table.' WHERE section_tipo = \''.$section_tipo.'\' AND datos#>\'{relations}\' @> \'[{"section_tipo":"'.$section_tipo.'","section_id":"'.$section_id.'","type":"'.DEDALO_RELATION_TYPE_CHILDREN_TIPO.'"}]\' LIMIT 1;';
		// 	$result	  = JSON_RecordObj_matrix::search_free($strQuery);

		// 	$parents = array();
		// 	while ($rows = pg_fetch_assoc($result)) {
		// 		$current_section_id = $rows['section_id'];

		// 		$locator = new locator();
		// 			$locator->set_section_tipo($section_tipo);
		// 			$locator->set_section_id($current_section_id);
		// 			$locator->set_component_tipo('hierarchy49');

		// 		# Add current
		// 		$parents[] = $locator;

		// 		# Recursion
		// 		$parents = array_merge($parents, self::get_parent_recursive2($current_section_id, $section_tipo));
		// 	}

		// 	return $parents;
		// }//end get_parent_recursive2



	/**
	* GET_VALOR
	* Get value . default is get dato . overwrite in every different specific component
	* @param string $lang = DEDALO_DATA_LANG
	* @return string|null $valor
	*/
	public function get_valor($lang=DEDALO_DATA_LANG) {

		$dato = $this->get_dato();
		if (empty($dato)) {
			return null;
		}

		$ar_valor = [];
		foreach ((array)$dato as $current_locator) {
			$ar_valor[] = ts_object::get_term_by_locator(
				$current_locator,
				$lang,
				true // bool from_cache
			);
		}

		# Set component valor
			$valor='';
			foreach ($ar_valor as $value) {
				if(!empty($value)) {
					$valor .= $value;
					if(end($ar_valor)!=$value) $valor .= ', ';
				}
			}

		return (string)$valor;
	}//end get_valor



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @param string|null $lang = DEDALO_DATA_LANG
	* @param object $option_obj = null
	* @return string $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( ?string $lang=DEDALO_DATA_LANG, object $option_obj=null ) : ?string {

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
					$component	= component_common::get_instance(
						$model,
						$tipo,
						$section_id,
						'list',
						$lang,
						$section_tipo
					);
					// $valor = $component->get_valor($lang);
					$process_dato_arguments = $option_obj->process_dato_arguments ?? null;
					$valor = $component->get_diffusion_value($lang, $process_dato_arguments);
					if (empty($valor)) {

						$main_lang = hierarchy::get_main_lang( $locator->section_tipo );

						$dato_full	= $component->get_dato_full();
						$valor		= component_common::get_value_with_fallback_from_dato_full($dato_full, true, $main_lang, $lang);
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
					true, // bool skip_root
					false // bool is_recursion
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
		}

		$diffusion_value = !empty($new_dato)
			? (is_array($new_dato) ? json_encode($new_dato, JSON_UNESCAPED_UNICODE) : $new_dato)
			: null;


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* RESOLVE_CHILDREN
	* @return
	*/
		// private function resolve_children() {

		// 	return true;
		// }//end resolve_children



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @param object $query_object
	* @return object $query_object
	*/
	public static function resolve_query_object_sql(object $query_object) : object {

		$q = $query_object->q;

		# Like
		# [section_tipo] => on1
		# [section_id] => 6286
		# [type] => dd48
		# [from_component_tipo] => hierarchy49

		$parent_locators = json_decode($q);
		if (!is_array($parent_locators)) {
			$parent_locators = [$parent_locators];
		}

		$ar_childrens = [];
		foreach ($parent_locators as $current_locator) {

			$current_component_relation_parent_tipo	= $current_locator->from_component_tipo;
			$target_component_children_tipos		= component_relation_parent::get_target_component_children_tipos($current_component_relation_parent_tipo);

			$parents = [];
			foreach ($target_component_children_tipos as $children_component_tipo) {

				$model_name 	= RecordObj_dd::get_modelo_name_by_tipo($children_component_tipo,true); // component_relation_children
				$component 		= component_common::get_instance(
					$model_name,
					$children_component_tipo,
					$current_locator->section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$current_locator->section_tipo
				);
				$component_children_dato = $component->get_dato();
				foreach ($component_children_dato as $children_locator) {
					$ar_childrens[] = $children_locator->section_id;
				}
			}
		}
		#dump($ar_childrens, ' ar_childrens ++ '.to_string());

		# Always set fixed values
		$query_object->type = 'number';

		# Always set format to column
		$query_object->format = 'column';

		# component path
		$query_object->component_path = ['section_id'];

		# unaccent
		$query_object->unaccent = false;

		// old format
			// {
			//		"q": "{\"section_tipo\":\"es1\",\"section_id\":\"8842\",\"type\":\"dd151\",\"from_component_tipo\":\"hierarchy36\"}",
			//		"q_operator": null,
			//		"path": [{
			//			"section_tipo": "es1",
			//			"component_tipo": "hierarchy36",
			//			"model": "component_relation_parent",
			//			"name": "Dependent of"
			//		}],
			//		"component_path": [
			//			"section_id"
			//		],
			//		"lang": "all",
			//		"type": "number",
			//		"format": "column",
			//		"unaccent": false,
			//		"operator": "=",
			//		"q_parsed": 8125
			// }

		// new format
			$base_sqo = (object)[
				'format'		=> 'column',
				'q_parsed'		=> null,
				'operator'		=> '=',
				'column_name'	=> 'section_id',
				'path'			=> []
			];
			// {
			//		"format": "column",
			//		"q_parsed": 8125,
			//		"operator": "=",
			//		"column_name": "section_id"
			// }

		$ar_parts 	= $ar_childrens;
		$ar_result  = [];
		foreach ($ar_parts as $key => $value) {
			$value = (int)$value;
			if ($value<1) continue;
			$query_object_current = clone $query_object;
				$query_object_current->operator = '=';
				$query_object_current->q_parsed	= $value;
			$ar_result[] = $query_object_current;
		}
		// Return an subquery instead object
		$cop = '$or';
		$new_object = new stdClass();
			$new_object->{$cop} = $ar_result;
		$query_object = $new_object;


			/*
			{
			    "q": "3",
			    "q_operator": null,
			    "path": [
			        {
			            "section_tipo": "oh1",
			            "component_tipo": "oh62",
			            "model": "component_section_id",
			            "name": "Id"
			        }
			    ],
			    "type": "number",
			    "component_path": [
			        "section_id"
			    ],
			    "lang": "all",
			    "format": "column",
			    "unaccent": false,
			    "column_name": "section_id",
			    "operator": "=",
			    "q_parsed": 3
			}
			*/
			dump($query_object, ' query_object WORKING HERE ++///////////////////////////******************//////////////////////////////////////// '.to_string());


		return $query_object;
	}//end resolve_query_object_sql



	/**
	* GET_TARGET_COMPONENT_CHILDREN_TIPOS
	* Resolve all possible component relation children targeted to current component relation parent
	* @param string $component_tipo
	* @return array|null $target_component_children_tipos
	*/
	public static function get_target_component_children_tipos(string $component_tipo) : ?array {

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

				return null;
			}

		// Look in children properties different possible sources
			$RecordObj								= new RecordObj_dd($from_component_tipo);
			$my_component_children_tipo_properties	= $RecordObj->get_properties();

		// hierarchy_sections
			$hierarchy_types	= !empty($my_component_children_tipo_properties->source->hierarchy_types) 	 ? $my_component_children_tipo_properties->source->hierarchy_types : null;
			$hierarchy_sections	= !empty($my_component_children_tipo_properties->source->hierarchy_sections) ? $my_component_children_tipo_properties->source->hierarchy_sections : null;

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
