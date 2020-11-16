<?php
/*
* COMPONENT_RELATION_PARENT
* Class to manage parent relation between section.
* Not store his own data, only manage component_relation_childrens data in 'reverse' mode
*/
class component_relation_parent extends component_relation_common {


	# Current component relation_type (used to filter locators in 'relations' container data)
	public $relation_type = false;	// Not used. DEDALO_RELATION_TYPE_PARENT_TIPO;

	# test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');

	# sql query stored for debug only
	static $get_parents_query;


	/**
	* SAVE
	* Overwrite relation common action
	* @return bool true
	*/
	public function Save() {
		# Noting to do. This component don`t save

		$section_id = $this->parent;

		# RETURN SECTION ID
		return (int)$section_id;
	}//end Save



	# Override component_common method
	# This component don't save dato. Is only a computed value in current moment
	public function get_ar_tools_obj() {
		return NULL;
	}



	/**
	* GET DATO
	* This component don't store data, only manages calculated data from component_relation_children generated data
	* stored in section 'relations' container
	* @return array $dato
	*	$dato is always an array of locators
	*/
	public function get_dato() {
		# get_my_parents always
		$dato = $this->get_my_parents();

		if (!empty($dato) && !is_array($dato)) {
			debug_log(__METHOD__." Re-saved invalid dato. Array expected and ".gettype($dato)." is received for tipo:$this->tipo, parent:$this->parent", logger::ERROR);
			$dato = array();
			$this->set_dato( $dato );
			$this->Save();
		}


		// rebuild dato option
			/*
			if (empty($dato)) {
				$dato_clean = $dato;
			}else{
				$tipo 		 = $this->get_tipo();
				$dato_clean = [];
				foreach ((array)$dato as $key => $item) {

					// create a new locator and change from component tipo. Note that this component dont have relation type (!)
					$locator = new locator();
						$locator->set_section_tipo($item->section_tipo);
						$locator->set_section_id($item->section_id);
						$locator->set_from_component_tipo($tipo);

					$dato_clean[] = $locator;
				}
			}

			return (array)$dato_clean;
			*/

		return (array)$dato;
	}//end get_dato



	/**
	* SET_DATO
	* Note that current component DON´T STORE DATA.
	* Instead, is inserted in the related 'component_relation_children' the link to self
	* Don't use this method regularly, is preferable use 'add_parent' method for every new relation
	* @param array|string $dato
	*	When dato is string is because is a json encoded dato
	*/
	public function set_dato($dato) {

		if (is_string($dato)) { # Tool Time machine case, dato is string
			$dato = json_handler::decode($dato);
		}
		if (is_object($dato)) {
			$dato = array($dato);
		}
		# Ensures is a real non-associative array (avoid json encode as object)
		$dato = is_array($dato) ? array_values($dato) : (array)$dato;

		// search mode
		if ($this->modo==="search") {
			# Fix dato
			$this->dato = $dato;

			return true;
		}

		# Add (used only in importations and similar) Note that SAVE (component_relation_children) !!
		$component_relation_children_tipo = component_relation_parent::get_component_relation_children_tipo($this->tipo);
		foreach ($dato as $current_locator) {

			$children_section_tipo 	= $current_locator->section_tipo;
			$children_section_id 	= $current_locator->section_id;
			if (empty($children_section_tipo) || empty($children_section_id))  {
				debug_log(__METHOD__." Skipped Bad locator found on set dato ($this->tipo, $this->parent, $this->section_tipo): locator: ".to_string($current_locator), logger::ERROR);
				continue;
			}
			# Note component_relation_children saves here
			$result = component_relation_parent::add_parent($this->tipo, $this->parent, $this->section_tipo, $children_section_tipo, $children_section_id, $component_relation_children_tipo);
		}

		return true;
	}//end set_dato



	/**
	* GET_COMPONENT_RELATION_CHILDREN_TIPO
	* @return string $component_relation_children_tipo
	*/
	public static function get_component_relation_children_tipo( $component_tipo ) {

		$modelo_name 	 = 'component_relation_children';
		$ar_children 	 = (array)common::get_ar_related_by_model($modelo_name, $component_tipo);
		$ar_children_len = count($ar_children);
		if ($ar_children_len===0) {
			debug_log(__METHOD__." Sorry, component_relation_children not found in this section ($component_tipo) ".to_string(), logger::ERROR);
			return false;
		}elseif ($ar_children_len>1) {
			debug_log(__METHOD__." Sorry, more than 1 component_relation_children found in this section ($component_tipo). First component will be used. ".to_string($ar_children), logger::ERROR);
		}
		$component_relation_children_tipo = reset($ar_children);

		return (string)$component_relation_children_tipo;
	}//end get_component_relation_children_tipo



	/**
	* GET_MY_PARENTS
	* @return array $parents
	*/
	protected function get_my_parents() {

		$target_component_children_tipos = component_relation_parent::get_target_component_children_tipos($this->tipo);

		$parents = [];
		foreach ($target_component_children_tipos as $children_component_tipo) {
			$parents = array_merge($parents, component_relation_parent::get_parents($this->parent, $this->section_tipo, $children_component_tipo));
		}

		return (array)$parents;

		/*
			# Calculate current target component_relation_children_tipo from structure
			$from_component_tipo = component_relation_parent::get_component_relation_children_tipo($this->tipo);

			#$parents = component_relation_parent::get_parents($this->parent, $this->section_tipo, $from_component_tipo);

			#
			# Look in children propiedades different possible sources
			$RecordObj 								= new RecordObj_dd($from_component_tipo);
			$my_component_children_tipo_propiedades = $RecordObj->get_propiedades(true);

			# hierarchy_sections
			$hierarchy_types 	= isset($my_component_children_tipo_propiedades->source->hierarchy_types) 	 ? $my_component_children_tipo_propiedades->source->hierarchy_types : null;
			$hierarchy_sections = isset($my_component_children_tipo_propiedades->source->hierarchy_sections) ? $my_component_children_tipo_propiedades->source->hierarchy_sections : null;
			# Resolve hierarchy_sections for speed
			if (!empty($hierarchy_types)) {
				$hierarchy_sections = component_autocomplete_hi::add_hierarchy_sections_from_types($hierarchy_types, (array)$hierarchy_sections);
			}
			#dump($hierarchy_sections, ' hierarchy_sections ++ '.to_string());

			if (empty($hierarchy_sections)) {
				# Only from current section component children
				$parents = component_relation_parent::get_parents($this->parent, $this->section_tipo, $from_component_tipo);
			}else{
				# Look component children across all related sections
				$modelo_name = 'component_relation_children';
				$parents 	 = [];
				$ar_resolved = [];
				foreach ($hierarchy_sections as $children_section_tipo) {
					# Resolve children component tipo from children_section_tipo
					$ar_children_component_tipo = section::get_ar_children_tipo_by_modelo_name_in_section(	$children_section_tipo,
																											[$modelo_name],
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
	* @param int $section_id
	* @param string $section_tipo
	* @param string $from_component_tipo
	*	Optional. Previously calculated from structure using current section tipo info or calculated inside from section_tipo
	* @param array $ar_tables
	*	Optional. If set, union tables search is made over all tables received
	*
	* @return array $parents
	*	Array of stClass objects with properties: section_tipo, section_id, component_tipo
	*/
	public static function get_parents($section_id, $section_tipo, $from_component_tipo=null, $ar_tables=null) {
		#dump($ar_tables, ' $ar_tables ++ '.to_string());

		if ($section_tipo===DEDALO_HIERARCHY_SECTION_TIPO) {
			return array(); // We are in last level of parent
		}

		if(SHOW_DEBUG===true) {
			$start_time=microtime(1);
		}

		# FROM_COMPONENT_TIPO FILTER OPTION
		$filter ='';
		if (!is_null($from_component_tipo)) {
			/*
				# Locate current section component parent tipo
				$ar_modelo_name_required = array('component_relation_parent');
				$ar_children_tipo 	 	 = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true);
				$component_parent_tipo 	 = reset($ar_children_tipo);
				# Calculate current target component_relation_children_tipo from structure
				$from_component_tipo 	 = component_relation_parent::get_component_relation_children_tipo($component_parent_tipo);
				*/
			$filter = ",\"from_component_tipo\":\"$from_component_tipo\"";
		}

		$type 	  = DEDALO_RELATION_TYPE_CHILDREN_TIPO;
		$compare  = "{\"section_tipo\":\"$section_tipo\",\"section_id\":\"$section_id\",\"type\":\"$type\"".$filter."}";

		# TABLES strQuery
		$strQuery  = '';
		$sql_select = "section_tipo, section_id, datos#>'{relations}' AS relations";
		$sql_where  = "datos#>'{relations}' @> '[$compare]'::jsonb";
		if (is_null($ar_tables)) {
			// Calculated from section_tipo (only search in current table)
			try {
				$table = common::get_matrix_table_from_tipo($section_tipo);
			} catch (Exception $e) {
				debug_log(__METHOD__." Error on get matrix_table_from_tipo: ".to_string($section_tipo), logger::ERROR);
			}
			if (!empty($table)) {
				$strQuery .= "SELECT $sql_select FROM \"$table\" WHERE $sql_where ";
			}else{
				return []; // stop here
			}
		}else{
			// Iterate tables and make union search
			$ar_query=array();
			foreach ((array)$ar_tables as $table) {
				$ar_query[] = "SELECT $sql_select FROM \"$table\" WHERE $sql_where ";
			}
			$strQuery .= implode(" UNION ALL ", $ar_query);
		}

		#
		# Add hierarchy main parents
		# By default, only self section is searched. When in case parent is a hierarchy (like 'hierarchy256')
		# we need search too in main_hierarchy table the "target" parent
		$search_in_main_hierarchy = true;
		if($search_in_main_hierarchy===true) {
			$main_from_component_tipo = DEDALO_HIERARCHY_CHIDRENS_TIPO;
			$main_filter  = ",\"from_component_tipo\":\"$main_from_component_tipo\"";
			$main_compare = "{\"section_tipo\":\"$section_tipo\",\"section_id\":\"$section_id\",\"type\":\"$type\"".$main_filter."}";
			$sql_where    = "datos#>'{relations}' @> '[$main_compare]'::jsonb";
			$table 	   	  = hierarchy::$table;
			$strQuery .= "\nUNION ALL \nSELECT $sql_select FROM \"$table\" WHERE $sql_where ";
		}


		// Set order to maintain results stable
		$strQuery .= " ORDER BY section_id ASC";

		if(SHOW_DEBUG) {
			component_relation_parent::$get_parents_query = $strQuery;
			#dump($strQuery, ' $strQuery ++ '.to_string($ar_tables));
		}
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);

		$parents = array();
		while ($rows = pg_fetch_assoc($result)) {

			$current_section_id   	= $rows['section_id'];
			$current_section_tipo 	= $rows['section_tipo'];
			$current_relations 		= json_decode($rows['relations']);

			if ($current_section_id==$section_id && $current_section_tipo===$section_tipo) {
				debug_log(__METHOD__." Error on get parent. Parent is set at itself as loop. Ignored locator. ($section_id - $section_tipo) ".to_string(), logger::ERROR);
				continue;
			}

			# Hierarchy parent case locator, force from_component_tipo
			if ($current_section_tipo==='hierarchy1') {
				$from_component_tipo = DEDALO_HIERARCHY_CHIDRENS_TIPO;
			}

			// Search 'from_component_tipo' in locators when no is received
			if (empty($from_component_tipo)) {

				$reference_locator = new locator();
					$reference_locator->set_section_tipo($section_tipo);
					$reference_locator->set_section_id($section_id);
					$reference_locator->set_type($type);

				foreach ((array)$current_relations as $current_locator) {
					# dump( $current_locator, ' $current_locator ++ '.to_string($reference_locator));
					if( $match = locator::compare_locators( $current_locator, $reference_locator, $ar_properties=array('section_tipo','section_id','type')) ){
						if (!isset($current_locator->from_component_tipo)) {
							dump($current_locator, "Bad locator.'from_component_tipo' property not found in locator (get_parents: $section_id, $section_tipo)".to_string());
							debug_log(__METHOD__." Bad locator.'from_component_tipo' property not found in locator (get_parents: $section_id, $section_tipo) ".to_string($current_locator), logger::DEBUG);
						}
						$calculated_from_component_tipo = $current_locator->from_component_tipo;
						break;
					}
				}
			}//end if (empty($from_component_tipo)) {

			# Changed by locator full 19-07-2018
			#$parent = new stdClass();
			#	$parent->section_tipo	= $current_section_tipo;
			#	$parent->section_id 	= $current_section_id;
			#	$parent->component_tipo = empty($from_component_tipo) ? $calculated_from_component_tipo : $from_component_tipo;

			// {"section_tipo":"on1","section_id":"2411","type":"dd48","from_component_tipo":"hierarchy49"}
			$current_from_component_tipo = empty($from_component_tipo) ? $calculated_from_component_tipo : $from_component_tipo;
			$parent_locator = new locator();
				$parent_locator->set_section_tipo($current_section_tipo);
				$parent_locator->set_section_id($current_section_id);
				$parent_locator->set_type(DEDALO_RELATION_TYPE_CHILDREN_TIPO);
				$parent_locator->set_from_component_tipo($current_from_component_tipo);

			# parents
			$parents[] = $parent_locator;
		}//end while

		if(SHOW_DEBUG===true) {
			#$total=round(microtime(1)-$start_time,3);
			#debug_log(__METHOD__." section_id:$section_id, section_tipo:$section_tipo, from_component_tipo:$from_component_tipo, ar_tables:$ar_tables - $strQuery ".exec_time_unit($start_time,'ms').' ms' , logger::DEBUG);
		}
			#dump($parents, ' parents ++ '.to_string());

		return (array)$parents;
	}//end get_parents



	/**
	* GET_PARENTS_RECURSIVE
	* Iterate recursively all parents of current term
	* @param int $section_id
	* @param string $section_tipo
	* @return array $parents_recursive
	*/
	public static function get_parents_recursive($section_id, $section_tipo, $skip_root=true, $is_recursion=false) {

		// static vars set
			static $ar_parents_recursive_resolved = array();
			static $locators_resolved 			  = array();

		// reset on first call
			if ($is_recursion!==true) {
				#$ar_parents_recursive_resolved  = [];
				$locators_resolved 				= [];
			}

		// key_resolve
			$key_resolve = $section_tipo.'_'.$section_id;
			if (isset($ar_parents_recursive_resolved[$key_resolve])) {
				#debug_log(__METHOD__." RETURN ALREADY RESOLVED VALUE FROM ".to_string($key_resolve), logger::DEBUG);
				return $ar_parents_recursive_resolved[$key_resolve];
			}

		// parents_recursive set
			$parents_recursive = array();

		// Add first level
			$ar_parents 	   = component_relation_parent::get_parents($section_id, $section_tipo);
			foreach ($ar_parents as $current_parent_locator) {
				if ($skip_root===true) {
					if ($current_parent_locator->section_tipo===DEDALO_HIERARCHY_SECTION_TIPO) continue; // Skip root hierarchy term
				}
				$parents_recursive[] = $current_parent_locator;
			}
			#$parents_recursive = $ar_parents;

		// Self include as resolved
			$lkey 						= $section_tipo.'_'.$section_id;
			$locators_resolved[$lkey] 	= $ar_parents;

		// iterate ar_parents
			foreach ($ar_parents as $current_locator) {

				// Check self recursion
					$lkey = $current_locator->section_tipo.'_'.$current_locator->section_id;
					if (array_key_exists($lkey, $locators_resolved)) {
						#debug_log(__METHOD__." SKIPPED $section_id, $section_tipo . Skipped resolution ".to_string(), logger::ERROR);
						$parents_recursive = array_merge($parents_recursive, $locators_resolved[$lkey]);
						continue;
					}

				// Add every parent level
					$current_ar_parents		 = component_relation_parent::get_parents_recursive($current_locator->section_id, $current_locator->section_tipo, $skip_root, $is_recursion=true);
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



	/**
	* GET_PARENT_RECURSIVE2
	* @return array $parents
	*/
	public static function get_parent_recursive2__UNUSED($section_id, $section_tipo) {

		# Sólo test de momento

		$matrix_table = common::get_matrix_table_from_tipo($section_tipo);

		$strQuery = 'SELECT section_id FROM '.$matrix_table.' WHERE section_tipo = \''.$section_tipo.'\' AND datos#>\'{relations}\' @> \'[{"section_tipo":"'.$section_tipo.'","section_id":"'.$section_id.'","type":"'.DEDALO_RELATION_TYPE_CHILDREN_TIPO.'"}]\' LIMIT 1;';
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);

		$parents = array();
		while ($rows = pg_fetch_assoc($result)) {
			$current_section_id = $rows['section_id'];

			$locator = new locator();
				$locator->set_section_tipo($section_tipo);
				$locator->set_section_id($current_section_id);
				$locator->set_component_tipo('hierarchy49');

			# Add current
			$parents[] = $locator;

			# Recursion
			$parents = array_merge($parents, self::get_parent_recursive2($current_section_id, $section_tipo));
		}

		return $parents;
	}//end get_parent_recursive2



	/**
	* GET_VALOR
	* Get value . default is get dato . overwrite in every different specific component
	* @return string | null $valor
	*/
	public function get_valor($lang=DEDALO_DATA_LANG) {
		
		$ar_valor  	= array();
		$dato   	= $this->get_dato();
		foreach ((array)$dato as $key => $current_locator) {
			$ar_valor[] = ts_object::get_term_by_locator( $current_locator, $lang, $from_cache=true );
		}//end if (!empty($dato))

		# Set component valor
		#$this->valor = implode(', ', $ar_valor);
		$valor='';
		foreach ($ar_valor as $key => $value) {
			if(!empty($value)) {
				$valor .= $value;
				if(end($ar_valor)!=$value) $valor .= ', ';
			}
		}

		return (string)$valor;
	}//end get_valor



	/*
	* GET_VALOR_LANG
	* Return the main component lang
	* If the component need change this langs (selects, radiobuttons...) overwritte this function
	*/
	public function get_valor_lang(){
		return "working here! ".__METHOD__;
		/*
		$relacionados = (array)$this->RecordObj_dd->get_relaciones();

		#dump($relacionados,'$relacionados');
		if(empty($relacionados)){
			return $this->lang;
		}

		$termonioID_related = array_values($relacionados[0])[0];
		$RecordObjt_dd = new RecordObj_dd($termonioID_related);

		if($RecordObjt_dd->get_traducible() =='no'){
			$lang = DEDALO_DATA_NOLAN;
		}else{
			$lang = DEDALO_DATA_LANG;
		}

		return $lang;*/
	}//end get_valor_lang



	/**
	* ADD_PARENT
	* Add a children to referenced component_relation_children
	* @return bool $result
	*/
	public static function add_parent($tipo, $parent, $section_tipo, $children_section_tipo, $children_section_id) {
		#dump($tipo, ' tipo ++ '."tipo:$tipo, parent:$parent, section_tipo:$section_tipo, children_section_tipo:$children_section_tipo, children_section_id:$children_section_id, children_component_tipo:$children_component_tipo".to_string());
		$result = false;

		$modelo_name = 'component_relation_children';

		# Resolve children component tipo from children_section_tipo
		$ar_children_component_tipo = section::get_ar_children_tipo_by_modelo_name_in_section(	$children_section_tipo,
																								[$modelo_name],
																								true, # from_cache
																								true, # resolve_virtual
																								true, # recursive
																								true, # search_exact
																								false); # ar_tipo_exclude_elements
		$children_component_tipo = reset($ar_children_component_tipo);

		$component_relation_children   = component_common::get_instance($modelo_name,
														  				$children_component_tipo,
														  				$children_section_id,
														  				'edit',
														  				DEDALO_DATA_NOLAN,
														  				$children_section_tipo);

		$added = (bool)$component_relation_children->make_me_your_children( $section_tipo, $parent );
		if ($added===true) {
			$component_relation_children->Save();
			$result = true;
		}

		return (bool)$result;
	}//end add_parent



	/**
	* REMOVE_PARENT
	* @return bool $result
	*/
	public static function remove_parent($tipo, $parent, $section_tipo, $children_section_tipo, $children_section_id, $children_component_tipo) {

		$result=false;

		$modelo_name 	= 'component_relation_children';
		#$component_tipo = self::get_component_relation_children_tipo($tipo);
		$modo 			= 'edit';
		$lang 			= DEDALO_DATA_NOLAN;
		$component_relation_children   = component_common::get_instance($modelo_name,
														  				$children_component_tipo,
														  				$children_section_id,
														  				$modo,
														  				$lang,
														  				$children_section_tipo);

		$removed = (bool)$component_relation_children->remove_me_as_your_children( $section_tipo, $parent );
		if ($removed===true) {
			$component_relation_children->Save();
			$result = true;
		}

		return (bool)$result;
	}//end remove_parent



	/**
	* RESOLVE_CHILDRENS
	* @return
	*/
	private function resolve_childrens() {

		return true;
	}//end resolve_childrens



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @return object $query_object
	*/
	public static function resolve_query_object_sql($query_object) {

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
		foreach ($parent_locators as $key => $current_locator) {

			$current_component_relation_parent_tipo = $current_locator->from_component_tipo;
			$target_component_children_tipos 		= component_relation_parent::get_target_component_children_tipos($current_component_relation_parent_tipo);

			$parents = [];
			foreach ($target_component_children_tipos as $children_component_tipo) {

				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($children_component_tipo,true); // component_relation_children
				$component 		= component_common::get_instance($modelo_name,
																 $children_component_tipo,
																 $current_locator->section_id,
																 'list',
																 DEDALO_DATA_NOLAN,
																 $current_locator->section_tipo);
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

		return $query_object;
	}//end resolve_query_object_sql



	/**
	* GET_TARGET_COMPONENT_CHILDREN_TIPOS
	* Resolve all possible component relation children targeted to current component relation parent
	* @return array $target_component_children_tipos
	*/
	public static function get_target_component_children_tipos($component_tipo) {

		# Static cache
		static $ar_resolved_target_component_children_tipos = [];
		if (isset($ar_resolved_target_component_children_tipos[$component_tipo])) {
			return $ar_resolved_target_component_children_tipos[$component_tipo];
		}

		$target_component_children_tipos = [];

		# Calculate current target component_relation_children_tipo from structure
		$from_component_tipo = component_relation_parent::get_component_relation_children_tipo($component_tipo);

		#
		# Look in children propiedades different possible sources
		$RecordObj 								= new RecordObj_dd($from_component_tipo);
		$my_component_children_tipo_propiedades = $RecordObj->get_propiedades(true);

		# hierarchy_sections
		$hierarchy_types 	= isset($my_component_children_tipo_propiedades->source->hierarchy_types) 	 ? $my_component_children_tipo_propiedades->source->hierarchy_types : null;
		$hierarchy_sections = isset($my_component_children_tipo_propiedades->source->hierarchy_sections) ? $my_component_children_tipo_propiedades->source->hierarchy_sections : null;
		# Resolve hierarchy_sections for speed
		if (!empty($hierarchy_types)) {
			$hierarchy_sections = component_autocomplete_hi::add_hierarchy_sections_from_types($hierarchy_types, (array)$hierarchy_sections);
		}

		if (empty($hierarchy_sections)) {
			# Default
			$target_component_children_tipos[] = $from_component_tipo;
		}else{
			# Look component children across all related sections
			$modelo_name = 'component_relation_children';
			foreach ($hierarchy_sections as $children_section_tipo) {
				# Resolve children component tipo from children_section_tipo
				$ar_children_component_tipo = section::get_ar_children_tipo_by_modelo_name_in_section(	$children_section_tipo,
																										[$modelo_name],
																										true, # from_cache
																										true, # resolve_virtual
																										true, # recursive
																										true, # search_exact
																										false); # ar_tipo_exclude_elements
				$children_component_tipo = reset($ar_children_component_tipo);
				if (!in_array($children_component_tipo, $target_component_children_tipos)) {
					$target_component_children_tipos[] = $children_component_tipo;
				}
			}
		}

		# Static cache
		$ar_resolved_target_component_children_tipos[$component_tipo] = $target_component_children_tipos;

		return $target_component_children_tipos;
	}//end get_target_component_children_tipos



	/**
	* GET_DATO_EXPORT
	* @return array $dato_export
	*/
	public function get_dato_export() {

		$dato = $this->get_dato();
		$tipo = $this->get_tipo();

		if (empty($dato)) {
			$dato_export = $dato;
		}else{
			$dato_export = [];
			foreach ((array)$dato as $key => $item) {

				// create a new locator and change from component tipo. Note that this component dont have relation type (!)
				$locator = new locator();
					$locator->set_section_tipo($item->section_tipo);
					$locator->set_section_id($item->section_id);
					$locator->set_from_component_tipo($tipo);

				$dato_export[] = $locator;
			}
		}

		return $dato_export;
	}//end get_dato_export



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value($lang=DEDALO_DATA_LANG, $option_obj=null) {

		$resolve_value = isset($option_obj->resolve_value) ? $option_obj->resolve_value : false;
		
		if (isset($option_obj->add_parents)) {
			
			// recursively
			$section_id		= $this->get_parent();
			$section_tipo	= $this->section_tipo;
			
			$parent_section_tipo = isset($option_obj->parent_section_tipo) ? $option_obj->parent_section_tipo : false;
	
			$parents = self::get_parents_recursive($section_id, $section_tipo, $skip_root=true, $is_recursion=false);

			// new_dato
			$new_dato = [];
			foreach ($parents as $locator) {
				
				if ($resolve_value===true) {

					if($parent_section_tipo!==false) {

						// term is autocomplete cases
						$term_dato = ts_object::get_term_dato_by_locator($locator);						
						foreach ($term_dato as $term_locator) {							
							if($parent_section_tipo===$term_locator->section_tipo){
								// $value = ts_object::get_term_by_locator($locator);

								// custom get term by locator resolution
									$custom_get_term_by_locator = function($locator, $lang, $option_obj) {

										$section_map 	= section::get_section_map($locator->section_tipo);
										$thesaurus_map 	= isset($section_map->thesaurus) ? $section_map->thesaurus : false;
										if ($thesaurus_map===false) return false;

										$ar_tipo 		= is_array($thesaurus_map->term) ? $thesaurus_map->term : [$thesaurus_map->term];
										$section_id 	= $locator->section_id;
										$section_tipo 	= $locator->section_tipo;
										
										$ar_value = [];
										foreach ($ar_tipo as $tipo) {
													
											$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);											
											$component 		= component_common::get_instance( $modelo_name,
																							  $tipo,
																							  $section_id,
																							  'list',
																							  $lang,
																							  $section_tipo);											
											// $valor = $component->get_valor($lang);
											$valor = $component->get_diffusion_value($lang, $option_obj->process_dato_arguments);	
											if (empty($valor)) {
														
												$main_lang = hierarchy::get_main_lang( $locator->section_tipo );												

												$dato_full = $component->get_dato_full();
												$valor = component_common::get_value_with_fallback_from_dato_full($dato_full, true, $main_lang, $lang);
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
									};

								$value = $custom_get_term_by_locator($locator, $lang, $option_obj);								
								$new_dato[] = strip_tags($value);								
							}
						}
						
					}else{

						$value = ts_object::get_term_by_locator( $locator, $lang, $from_cache=true );
						$new_dato[] = strip_tags($value);
					}
										
				}else{
					$new_dato[] = $locator->section_id;
				}
			}
			
		}else{

			if ($resolve_value===true) {
				$value = ts_object::get_term_by_locator( $locator, $lang, $from_cache=true );
				$new_dato = strip_tags($value);
			}else{
				// default
				$new_dato = $this->get_dato();
			}			
		}
				
		$diffusion_value = json_encode($new_dato, JSON_UNESCAPED_UNICODE);


		return (string)$diffusion_value;
	}//end get_diffusion_value



}//end component_relation_parent
