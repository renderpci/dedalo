<?php
/*
* CLASS COMPONENT_RELATION_COMMON
* Used as common base from all components tha works from section relations data, instead standar component dato
* like component_model, component_parent, etc..
*/

class component_relation_common extends component_common {

	# relation_type (set in constructor). 
	# Defines type used in section relation locators to set own locator type
	# protected $relation_type;

	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;


	/**
	* __CONSTRUCT
	*/
	function __construct($tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {

		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;

		# relation_type
		# $this->relation_type = DEDALO_RELATION_TYPE_CHILDREN_TIPO;

		# Build the componente normally
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

		if(SHOW_DEBUG) {
			$traducible = $this->RecordObj_dd->get_traducible();
			if ($traducible=='si') {
				throw new Exception("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP", 1);
			}
		}
	}//end __construct
	


	/**
	* GET_MY_SECTION
	* @return 
	*/
	public function get_my_section() {
		return section::get_instance($this->parent, $this->section_tipo);
	}//end get_my_section



	/**
	* GET_MY_SECTION_RELATIONS
	* @return 
	*/
	public function get_my_section_relations( $filtered_by=false ) {
		$my_section = $this->get_my_section();
		$relations  = $my_section->get_relations();

		# Filtered case
		if ($filtered_by) {
			$filtered_relations = array();
			foreach ($relations as $current_locator) {
				if( isset($current_locator->type) && $current_locator->type===$filtered_by 
				 && isset($current_locator->from_component_tipo) && $current_locator->from_component_tipo===$this->tipo
				 ) {
					$filtered_relations[] = $current_locator;
				}
			}
			$relations = $filtered_relations;
		}

		return (array)$relations;
	}//end get_my_section_relations



	/**
	* ADD_LOCATOR_TO_DATO
	* Add one locator to current 'dato'. Verify is exists to avoid duplicates
	* @return bool
	*/
	public function add_locator_to_dato( $locator ) {

		if (!is_object($locator)) {
			return false;
		}
		$locator = new locator($locator);

		if ($locator->section_tipo==="undefined" || $locator->section_id==="undefined") {
			return false;
		}

		$section = $this->get_my_section();
		$added 	 = (bool)$section->add_relation($locator);

		# Save
		if ($added===true) {
			// Unset component dato to force reload from section
			unset($this->dato);
			$this->get_dato();

			//$this->Save();
		}
		return (bool)$added;

		/*
		$relation_type 		   = $this->relation_type;
		$test_equal_properties = $this->test_equal_properties;

		# Verify locator type
		if (!isset($locator->type)) {
			# Added manually
			$locator->type = $relation_type;
			debug_log(__METHOD__." Forced add mandatory locator type $relation_type not present in received locator ".to_string(), logger::WARNING);
		}else if ($locator->type!==$relation_type) {
			# Bad type
			throw new Exception("Bad locator type. Received type is incorrect ($locator->type). Expected is ".$relation_type, 1);
		}
		
		$ar_locator = $this->get_dato();

		# Dato exits test
		$exists = (bool)locator::in_array_locator( $locator, $ar_locator, $test_equal_properties );
		if($exists===false) {
			$ar_locator[] = $locator;

			# Update component dato
			$this->set_dato($ar_locator);
		
			return true;
		}else{
			debug_log(__METHOD__." Ignored add locator action: locator already exists. Tested properties: ".to_string($test_equal_properties), logger::DEBUG);
		}	

		return false;
		*/
	}//end add_locator_to_dato



	/**
	* REMOVE_LOCATOR_FROM_DATO
	* @return bool
	*/
	public function remove_locator_from_dato( $locator ) {

		if (!is_object($locator)) {
			return false;
		}
		$locator = new locator($locator);

		# Remove locator relations from current section before save (for fast access later only)
		$section = $this->get_my_section();
		$removed = (bool)$section->remove_relation($locator);

		# Save
		if ($removed===true) {

			// Unset component dato to force reload from section
			unset($this->dato);
			$this->get_dato();

			//$this->Save();
		}
		return (bool)$removed;

		/*
			$ar_locator 			= $this->get_dato();
			$relation_type 		    = $this->relation_type;		

			# Iterate and search current locator in component dato
			foreach ($ar_locator as $key => $current_locator) {
				$equal = locator::compare_locators( $current_locator, $locator, $test_equal_properties );
				if ( $equal===true ) {
					unset($ar_locator[$key]);

					# Recreate indexes (avoid json read this array as object)
					$ar_locator = array_values($ar_locator);

					# Update component dato
					$this->set_dato($ar_locator);

					# Remove locator relations from current section before save (for fast access later only)
					$section = $this->get_my_section();
					$section->remove_relation($locator, $test_equal_properties);

					# Save
					$this->Save();
					
					return true;
				}
			}
			return false;	
			*/	
	}//end remove_locator_from_dato



	/**
	* LOAD_COMPONENT_DATO
	* Overwrite component common behaviour and get dato from section relations container
	*/
	public function load_component_dato() {
		$this->dato = $this->get_my_section_relations( $this->relation_type );
	}//end load_component_dato



	/**
	* GET_DATO
	* Returns dato from container 'relations', not for component dato container
	* @return array $dato
	*	$dato is always an array of locators
	*/
	public function get_dato() {

		if(isset($this->dato)) {
			$dato = $this->dato;
		}else{
			$dato = $this->get_my_section_relations( $this->relation_type );
		}

		if (!empty($dato) && !is_array($dato)) {
			#dump($dato,"dato");
			trigger_error("Error: ".__CLASS__." dato type is wrong. Array expected and ".gettype($dato)." is received for tipo:$this->tipo, parent:$this->parent");
			$this->set_dato(array());
			$this->Save();
		}
		if ($dato===null) {
			$dato=array();
		}	

		return (array)$dato;
	}//end get_dato



	/**
	* SET_DATO
	* Set raw dato overwrite existing dato.
	* Usually, dato is builded element by element, adding one locator to existing dato, but some times we need 
	* insert complete array of locators at once. Use this method in this cases
	*/
	public function set_dato( $dato ) {

		if (is_string($dato)) { # Tool Time machine case, dato is string
			$dato = json_handler::decode($dato);
		}
		if (is_object($dato)) {
			$dato = array($dato);
		}
		# Ensures is a real non-associative array (avoid json encode as object)
		$dato = is_array($dato) ? array_values($dato) : (array)$dato;
		
		# Verify all locators are well formed
		$relation_type = $this->relation_type;
		foreach ((array)$dato as $key => $current_locator) {
			// Type
			if (!isset($current_locator->type)) {
				$current_locator->type = $relation_type;
				debug_log(__METHOD__." Fixed bad formed locator (empty type) [$this->section_tipo, $this->parent, $this->tipo] ".to_string(), logger::WARNING);
			}else if ($current_locator->type!==$relation_type) {
				$current_locator->type = $relation_type;
				debug_log(__METHOD__." Fixed bad formed locator (bad type $current_locator->type) [$this->section_tipo, $this->parent, $this->tipo] ".to_string(), logger::WARNING);
			}
			// from_component_tipo
			if (!isset($current_locator->from_component_tipo)) {
				$current_locator->from_component_tipo = $this->tipo;
				debug_log(__METHOD__." Fixed bad formed locator (empty from_component_tipo) [$this->section_tipo, $this->parent, $this->tipo] ".to_string(), logger::WARNING);
			}else if ($current_locator->from_component_tipo!==$this->tipo) {
				$current_locator->from_component_tipo = $this->tipo;
				debug_log(__METHOD__." Fixed bad formed locator (bad from_component_tipo $current_locator->from_component_tipo) [$this->section_tipo, $this->parent, $this->tipo] ".to_string(), logger::WARNING);
			}
		}


		$my_section = $this->get_my_section();
		$my_section->add_relations( (array)$dato, $remove_previous_of_current_type=true );

		# UNSET previous calculated valor
		unset($this->valor);

		$this->dato = (array)$dato;

		return $this->dato;
	}//end set_dato



	/**
	* SAVE
	* Save component data in matrix using parent section
	* Verify all necessary vars to save and call section 'save_component_dato($this)'
	* @see section->save_component_dato($this)
	* @return int $section_matrix_id
	*/
	public function Save() {

		# MAIN VARS	
		$section_tipo	= $this->get_section_tipo();
		$parent 		= $this->get_parent();
		$tipo 			= $this->get_tipo();
		$lang 			= DEDALO_DATA_LANG;

		# PARENT : Verify parent
		if(abs($parent)<1 && strpos($parent, DEDALO_SECTION_ID_TEMP)===false) {
			if(SHOW_DEBUG===true) {
				dump($this, "this section_tipo:$section_tipo - parent:$parent - tipo:$tipo - lang:$lang");
				throw new Exception("Error Processing Request. Inconsistency detected: component trying to save without parent ($parent) ", 1);;
			}			
			die("Error. Save component data is stopped. Inconsistency detected. Contact with your administrator ASAP");		
		}

		# Verify component minumun vars before save
		if( (empty($parent) || empty($tipo) || empty($lang)) )
			throw new Exception("Save: More data are needed!  section_tipo:$section_tipo, parent:$parent, tipo,$tipo, lang,$lang", 1);
		

		# SECTION
		# When section is saved, component dato is saved with her
		$section 	= $this->get_my_section();

		#
		# TIME MACHINE DATA
		# We save only current component lang 'dato' in time machine
		$save_options = new stdClass();
			$save_options->time_machine_data = $this->get_dato();
			$save_options->time_machine_lang = $this->get_lang();
			$save_options->time_machine_tipo = $this->get_tipo();

		$section_id = $section->Save($save_options);
		
		# ACTIVITY
		$this->save_activity();


		# RETURN SECTION ID
		return (int)$parent;
	}#end Save



	/**
	* SAVE_INVERSE_LOCATOR_FROM_LOCATOR
	* Build and save inverse locator in target section referenced in locator
	* @return int section_id
	*/
	private function save_inverse_locator_from_locator( $locator ) {

		if (!is_object($locator)) {
			return false;
		}
		$locator = new locator($locator);

		$relation_type_inverse = $this->relation_type_inverse;
		
		# Add locator relations to target section (for fast access later only)
		$reverse_locator  = new locator();
			$reverse_locator->set_section_tipo($locator->section_tipo);
			$reverse_locator->set_section_id($this->parent);
			$reverse_locator->set_type($relation_type_inverse);

		$children_section = section::get_instance($locator->section_id, $locator->section_tipo);
		$children_section->add_relation($reverse_locator);

		return $children_section->Save();
	}//end save_inverse_locator_from_locator



	/**
	* GET_VALOR_LIST_HTML_TO_SAVE
	* Usado por section:save_component_dato
	* Devuelve a section el html a usar para rellenar el 'campo' 'valor_list' al guardar
	* Por defecto será el html generado por el componente en modo 'list', pero en algunos casos
	* es necesario sobre-escribirlo, como en component_portal, que ha de resolverse obigatoriamente en cada row de listado
	*
	* En este caso, usaremos únicamente el valor en bruto devuelto por el método 'get_dato_unchanged'
	*
	* @see class.section.php
	* @return mixed $result
	*/
	public function get_valor_list_html_to_save() {
		$result = $this->get_dato_unchanged();

		return $result;
	}//end get_valor_list_html_to_save



	/**
	* GET_LOCATOR_VALUE
	* Resolve locator to string value to show in list etc.
	* @return string $valor
	*/
	public static function get_locator_value( $locator, $lang=DEDALO_DATA_LANG, $section_tipo, $show_parents=false ) {

		if (!is_object($locator)) {
			return false;
		}
		$locator = new locator($locator);

		$valor = ts_object::get_term_by_locator( $locator, $lang );

		if ($show_parents===true) {
			#$ar_parents = relation::get_parents_recursive( $locator );
			#$ar_parents = component_relation_parent::get_parents($locator->section_id, $locator->section_tipo, $from_component_tipo=null, $ar_tables=null);
			$ar_parents = component_relation_parent::get_parents_recursive($locator->section_id, $locator->section_tipo);
				#dump($ar_parents, ' $ar_parents ++ '.to_string($locator));

			$ar_parents_resolved = array();
			foreach ($ar_parents as $current_locator) {
				$current_value 			= ts_object::get_term_by_locator( $current_locator, $lang );
				$ar_parents_resolved[]  = $current_value;
			}
			if (!empty($ar_parents_resolved)) {
				$valor .= ', '.implode(', ', $ar_parents_resolved);
			}				
		}	

		/*
		# En proceso. De momento devuelve el locator en formato json, sin resolver..
		if (!isset($valor)) {
			$valor = json_encode($locator);
		}

		if(SHOW_DEBUG===true) {
			$valor .= " <span class=\"debug_info notes\">".json_encode($locator)."</span>";
		}
		*/
		
		return (string)$valor;
	}//end get_locator_value




	/**
	* RENDER_LIST_VALUE
	* Overwrite for non default behaviour
	* Receive value from section list and return proper value to show in list
	* Sometimes is the same value (eg. component_input_text), sometimes is calculated (e.g component_portal)
	* @param string $value
	* @param string $tipo
	* @param int $parent
	* @param string $modo
	* @param string $lang
	* @param string $section_tipo
	* @param int $section_id
	*
	* @return string $list_value
	*/
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id, $current_locator=null, $caller_component_tipo=null) {

		$component 	= component_common::get_instance(get_called_class(),
													 $tipo,
												 	 $parent,
												 	 'list',
													 DEDALO_DATA_NOLAN,
												 	 $section_tipo);

		
		# Use already query calculated values for speed
		#$ar_records = (array)json_handler::decode($value);
		#$component->set_dato($ar_records);
		$component->set_identificador_unico($component->get_identificador_unico().'_'.$section_id.'_'.$caller_component_tipo); // Set unic id for build search_options_session_key used in sessions
		
		return  $component->get_valor($lang);
	}#end render_list_value



	/**
	* REMOVE_PARENT_REFERENCES
	* Calculate parents and removes references to current section
	* @param string $section_tipo
	* @param int $section_id
	* @param array $filter
	* 	Is array of locators. Default is bool false
	*
	* @return object $response
	*/
	public static function remove_parent_references($section_tipo, $section_id, $filter=false) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';
		
		$section_table 	= common::get_matrix_table_from_tipo($section_tipo); // Normally 'matrix_hierarchy'
		$hierarchy_table= hierarchy::$table;	// Normally 'hierarchy'. Look too in 'matrix_hierarchy_main' table for references
		$ar_tables 		= array( $section_table, $hierarchy_table);
		$parents 		= component_relation_parent::get_parents($section_id, $section_tipo, $from_component_tipo=null, $ar_tables);
		# dump($parents, ' $parents ++ '.to_string("$section_id, $section_tipo")); die();

		$ar_removed=array();
		foreach ((array)$parents as $current_parent) {

			if ($filter!==false) {				
				# compare current with filter
				$process=false;
				foreach ($filter as $current_locator) {
					if ($current_locator->section_id==$current_parent->section_id && $current_locator->section_tipo===$current_parent->section_tipo) {
						$process = true; break;
					}
				}
				if(!$process) continue; // Skip current section
			}
		
			# Target section data
			$modelo_name 	= 'component_relation_children';
			$modo 			= 'edit';
			$lang			= DEDALO_DATA_NOLAN;
			$component_relation_children = component_common::get_instance($modelo_name,
																		  $current_parent->component_tipo,
																		  $current_parent->section_id,
																		  $modo,
																		  $lang,
																		  $current_parent->section_tipo);
			
			# NOTE: remove_me_as_your_children deletes current section references from component_relation_children and section->relations container
			# $removed = (bool)$component_relation_children->remove_children_and_save($children_locator);
			$removed = (bool)$component_relation_children->remove_me_as_your_children( $section_tipo, $section_id );
			if ($removed) {
				$component_relation_children->Save();
				debug_log(__METHOD__." Removed references in component_relation_children ($current_parent->section_id, $current_parent->section_tipo) to $section_id, $section_tipo ".to_string(), logger::DEBUG);
				$ar_removed[] = array('section_tipo' 	=> $current_parent->section_tipo,
									  'section_id' 	 	=> $current_parent->section_id,
									  'component_tipo' 	=> $current_parent->component_tipo
									 );
			}
		}//end foreach ((array)$parents as $current_parent)

		if (!empty($ar_removed)) {
			$response->result 		= true;
			$response->msg 			= 'Removed references: '.count($ar_removed);
			$response->ar_removed 	= $ar_removed;
		}

		return (object)$response;
	}//end remove_parent_references



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( $lang=null ) {
	
		$dato = $this->get_dato();		
		/*
		$ar_data = array();
		foreach ((array)$dato as $current_locator) {
			$ar_data[] = $current_locator->section_id;
		}
		$diffusion_value = json_encode($ar_data);
		*/
		$diffusion_value = json_encode($dato);

		return (string)$diffusion_value;
	}//end get_diffusion_value


	

}//end component_relation_common
?>