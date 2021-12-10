<?php
/*
* CLASS COMPONENT_RELATION_COMMON
* Used as common base from all components tha works from section relations data, instead standar component dato
* like component_model, component_parent, etc..
*/
class component_relation_common extends component_common {


	/**
	* CLASS VARS
	*/

		# relation_type (set in constructor).
		# Defines type used in section relation locators to set own locator type
		# protected $relation_type;

		# Overwrite __construct var lang passed in this component
		protected $lang = DEDALO_DATA_NOLAN;

		# save_to_database_relations
		# On false, avoid propagate to table relation current component locators at save
		# @see class geonames::import_data
		public $save_to_database_relations = true;



	/**
	* GET_COMPONENTS_WITH_RELATIONS
	* Array of components modelo name that usin locators in dato and extends component_relation_common
	* @return array
	*/
	public static function get_components_with_relations() {

		$components_with_relations = [
			'component_autocomplete',
			'component_autocomplete_hi',
			'component_check_box',
			'component_filter',
			'component_filter_master',
			'component_portal',
			'component_publication',
			'component_radio_button',
			'component_relation_children',
			'component_relation_index',
			'component_relation_model',
			'component_relation_parent',
			'component_relation_related',
			'component_relation_struct',
			'component_select',
			'component_select_lang'
		];

		return $components_with_relations;
	}//end get_components_with_relations



	/**
	* __CONSTRUCT
	*/
	public function __construct($tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {

		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;

		# relation_type
		# $this->relation_type = DEDALO_RELATION_TYPE_CHILDREN_TIPO;

		# Build the componente normally
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

		if(SHOW_DEBUG) {
			$traducible = $this->RecordObj_dd->get_traducible();
			if ($traducible==='si') {
				#throw new Exception("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP", 1);
				trigger_error("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP");
			}
		}
	}//end __construct



	/**
	* GET_DATO
	* Returns dato from container 'relations', not for component dato container
	* @return array $dato
	*	$dato is always an array of locators
	*/
	public function get_dato() {

		# MATRIX DATA : Load matrix data
		$this->load_component_dato();

		return $this->dato;
	}//end get_dato



	/**
	* GET_DATO_GENERIC
	* @return array $ar_generic_dato
	*/
	public function get_dato_generic() {

		# Dato without from_component_tipo property
		$ar_generic_dato = [];
		foreach ((array)$this->dato as $key => $current_locator) {
			$generic_locator = new stdClass();
				$generic_locator->section_tipo 	= $current_locator->section_tipo;
				$generic_locator->section_id 	= $current_locator->section_id;
				#$generic_locator->type 		= $current_locator->type;
			$ar_generic_dato[] = $generic_locator;
		}

		return $ar_generic_dato;
	}//end get_dato_generic



	/**
	* GET_DATO_WITH_REFERENCES
	* Return the dato to all components, except the components that has references calculated,
	* like component_relation_related
	* this will mix the real dato and the result of the calculation
	* @return array $dato
	*/
	public function get_dato_with_references() {

		return $this->get_dato();
	}//end get_dato_with_references



	/**
	* SET_DATO
	* Set raw dato overwrite existing dato.
	* Usually, dato is built element by element, adding one locator to existing dato, but some times we need
	* insert complete array of locators at once. Use this method in this cases
	*/
	public function set_dato($dato) {

		$safe_dato = [];

		if (!empty($dato)) {

			if (is_string($dato)) { # Tool Time machine case, dato is string
				$dato = json_decode($dato);
			}
			if (is_object($dato)) {
				$dato = [$dato];
			}
			
			# Ensures is a real non-associative array (avoid json encode as object)
			$dato = is_array($dato) ? array_values($dato) : (array)$dato;

			# Verify all locators are well formed
			$relation_type 		 = $this->relation_type;
			$from_component_tipo = $this->tipo;
	
			foreach ((array)$dato as $key => $current_locator) {

				if (!is_object($current_locator)) {
					$msg = " Error on set locator (is not object) ".json_encode($current_locator);
					trigger_error( __METHOD__ . $msg );
					debug_log( __METHOD__ . $msg, logger::ERROR);
					throw new Exception("Error Processing Request. Look server log for details", 1);
				}

				// section_id
				if (!isset($current_locator->section_id) || !isset($current_locator->section_tipo)) {
					debug_log(__METHOD__." IGNORED bad formed locator (empty section_id or section_tipo) [$this->section_tipo, $this->parent, $this->tipo] ". get_called_class().' - current_locator: '.to_string($current_locator), logger::ERROR);
					#throw new Exception("Error Processing Request. Look server log for details", 1);
					continue;
				}

				// type
				if (!isset($current_locator->type)) {
					debug_log(__METHOD__." Fixing bad formed locator (empty type) [$this->section_tipo, $this->parent, $this->tipo] ". get_called_class().' - current_locator: '.to_string($current_locator), logger::WARNING);
					$current_locator->type = $relation_type;
				//}else if ($current_locator->type!==$relation_type) {
					//debug_log(__METHOD__." Fixed bad formed locator (bad type $current_locator->type to $relation_type) [$this->section_tipo, $this->parent, $this->tipo] ".to_string(), logger::WARNING);
					//$current_locator->type = $relation_type;
				}
				// from_component_tipo
				if (!isset($current_locator->from_component_tipo)) {
					$current_locator->from_component_tipo = $from_component_tipo;
					#debug_log(__METHOD__." Fixed bad formed locator (empty from_component_tipo) [$this->section_tipo, $this->parent, $from_component_tipo] ".get_called_class().' '.to_string(), logger::WARNING);
				}else if ($current_locator->from_component_tipo!==$from_component_tipo) {
					debug_log(__METHOD__." Fixed bad formed locator (bad from_component_tipo $current_locator->from_component_tipo) [$this->section_tipo, $this->parent, $from_component_tipo] ".get_called_class().' '.to_string(), logger::WARNING);
					$current_locator->from_component_tipo = $from_component_tipo;
				}

				# Add
				$safe_dato[] = $current_locator;
			}
		}

		parent::set_dato( (array)$safe_dato );
	}//end set_dato



	/**
	* LOAD_COMPONENT_DATAFRAME
	* @return
	*/
	public function load_component_dataframe() {


		if( empty($this->parent) || $this->modo==='dummy' || $this->modo==='search') {
			return null;
		}

		#if( $this->bl_loaded_matrix_data!==true ) {

			if (empty($this->section_tipo)) {
				if(SHOW_DEBUG===true) {
					$msg = " Error Processing Request. section tipo not found for component $this->tipo";
					#throw new Exception("$msg", 1);
					debug_log(__METHOD__.$msg);
				}
			}
			$dato = $this->get_dato();

			$this->dataframe = [];

			foreach ($dato as $key => $current_locator) {
				if (isset($current_locator->dataframe)) {
					foreach ($current_locator->dataframe as $dataframe_obj) {
						$this->dataframe[] = $dataframe_obj;
					}
				}
			}

			# Set as loaded
			$this->bl_loaded_matrix_data = true;

		return true;
	}//end load_component_dataframe



	/**
	* LOAD MATRIX DATA
	* Get data once from matrix about parent, dato
	*/
	protected function load_component_dato() {

		if( empty($this->parent) || $this->modo==='dummy' || $this->modo==='search') {
			return null;
		}


		if( $this->bl_loaded_matrix_data!==true ) {

			# Fix dato
			$this->dato = $this->get_my_section_relations();

			# Set as loaded
			$this->bl_loaded_matrix_data = true;
		}

		return true;
	}//end load_component_dato



	/**
	* GET_MY_SECTION_RELATIONS
	* @return array $relations
	*/
	public function get_my_section_relations() {
		$my_section = $this->get_my_section();
		$relations  = $my_section->get_relations();

		# Filtered case
		#if ($filtered_by_type!==false) {
			$filtered_relations = array();
			foreach ($relations as $current_locator) {
				if( isset($current_locator->from_component_tipo) && $current_locator->from_component_tipo===$this->tipo ) {
					$filtered_relations[] = $current_locator;
				}
			}
			$relations = $filtered_relations;
		#}
		if(SHOW_DEBUG===true) {

		}

		return (array)$relations;
	}//end get_my_section_relations



	/**
	* ADD_LOCATOR_TO_DATO
	* Add one locator to current 'dato'. Verify is exists to avoid duplicates
	* @return bool
	*/
	public function add_locator_to_dato( $locator ) {

		if(empty($locator)) return false;

		if (!is_object($locator) || !isset($locator->type)) {
			if(SHOW_DEBUG===true) {
				throw new Exception("Error Processing Request. var 'locator' not contains property 'type' ", 1);
			}
			debug_log(__METHOD__." Invalid locator is received to add. Locator was ignored (type:".gettype($locator).") ".to_string($locator), logger::WARNING);
			return false;
		}

		$current_type 	= $locator->type;
		$dato 	  		= $this->get_dato();
		$added 			= false;

		# maintain array index after unset value. ! Important for encode json as array later (if keys are not correlatives, undesired object is created)
		$dato = array_values($dato);

		# Test if already exists
		/*
		$ar_properties=array('section_id','section_tipo','type');
		if (isset($locator->from_component_tipo)) 	$ar_properties[] = 'from_component_tipo';
		if (isset($locator->tag_id)) 		 		$ar_properties[] = 'tag_id';
		if (isset($locator->component_tipo)) 		$ar_properties[] = 'component_tipo';
		if (isset($locator->section_top_tipo))		$ar_properties[] = 'section_top_tipo';
		if (isset($locator->section_top_id)) 		$ar_properties[] = 'section_top_id';
		$object_exists = locator::in_array_locator( $locator, $dato, $ar_properties );
		*/
		$object_exists = locator::in_array_locator( $locator, $dato );
		if ($object_exists===false) {

			# Add to dato
			array_push($dato, $locator);

			$added = true;
		}else{
			debug_log(__METHOD__." Ignored add locator action: locator ".json_encode($locator)." already exists. Tested properties: ".to_string(), logger::DEBUG);
		}

		# Updates current dato
		if ($added===true) {
			$this->set_dato( $dato );
		}


		return $added;
	}//end add_locator_to_dato



	/**
	* REMOVE_LOCATOR_FROM_DATO
	* @return bool
	*/
	public function remove_locator_from_dato( $locator, $ar_properties=[] ) {

		if (empty($locator)) {
			return false;
		}

		$locator = clone($locator);

		if (!isset($locator->type)) {
			$locator->type = $this->relation_type;
			debug_log(__METHOD__." Received locator to remove, don't have 'type'. Autoset type: $this->relation_type to locator: ".to_string($locator), logger::DEBUG);
		}elseif ($locator->type!==$this->relation_type) {
			trigger_error("Incorrect locator type ! Expected $this->relation_type and received $locator->type. tipo:$this->tipo, section_tipo:$this->section_tipo, parent:$this->parent");
			return false;
		}

		$removed 		= false;
		$new_relations 	= array();
		$dato = (array)$this->get_dato($ar_properties);
		foreach($dato as $key => $current_locator_obj) {

			# Test if already exists
			$equal = locator::compare_locators( $current_locator_obj, $locator, $ar_properties );
			if ( $equal===true ) {

				$removed = true;

			}else{

				$new_relations[] = $current_locator_obj;
			}
		}
		#debug_log(__METHOD__." ".get_called_class()." $this->tipo, $this->section_tipo, $this->parent. To remove:".to_string($locator)." - final dato:".to_string($new_relations)." - removed: ".to_string($removed), logger::DEBUG);

		# Updates current dato relations with clean array of locators
		if ($removed===true) {
			$this->set_dato( $new_relations );
		}


		return (bool)$removed;
	}//end remove_locator_from_dato



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
		$modo 			= $this->get_modo();

		#
		# DATAFRAME MODE
		if (strpos($modo,'dataframe')===0 && isset($this->caller_dataset)) {

			#debug_log(__METHOD__." caller_dataset ".to_string($this->caller_dataset), logger::DEBUG);

			$new_tipo 			= $this->caller_dataset->component_tipo;
			$new_section_tipo 	= $this->caller_dataset->section_tipo;
			$new_parent 		= $this->caller_dataset->section_id;
			$new_modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($new_tipo, true);
			$new_component 		= component_common::get_instance( $new_modelo_name,
																  $new_tipo,
																  $new_parent,
																  'edit',
																  $lang,
																  $new_section_tipo);

			# Force load current db dato to avoid loose it
			# component that will be marked with dataframe (the original component)
			$component_dato = $new_component->get_dato();

			# Set dataframe data
			$new_component->update_dataframe_element($this->dato, $this->caller_dataset->caller_key, $this->caller_dataset->type);
			#dump($new_component, ' $new_component ++ '.to_string()); #return false;

			if (isset($this->save_to_database) && $this->save_to_database===false) {
				debug_log(__METHOD__." Stopped ?? dataframe save to DDBB $this->section_tipo : $new_section_tipo , $this->parent : $new_parent ".to_string(), logger::WARNING);
				#$new_component->save_to_database = false;
			}

			if(isset($component_dato[$this->caller_dataset->caller_key])){
				$component_dato[$this->caller_dataset->caller_key]->dataframe = $new_component->dataframe;
				$new_component->set_dato($component_dato);
			}

			return $new_component->Save();
		}//end if (strpos($modo,'dataframe')===0 && isset($this->caller_dataset))


		// Verify component main vars
			if (!isset($this->save_to_database) || $this->save_to_database!==false) {
				# PARENT : Verify parent
				if( abs(intval($parent))<1 && strpos($parent, DEDALO_SECTION_ID_TEMP)===false) {
					if(SHOW_DEBUG===true) {
						dump($this, "this section_tipo:$section_tipo - parent:$parent - tipo:$tipo - lang:$lang");
						throw new Exception("Error Processing Request. Inconsistency detected: component trying to save without parent ($parent) ", 1);
					}
					die("Error. Save component data is stopped. Inconsistency detected. Contact with your administrator ASAP");
				}

				# Verify component minumun vars before save
				if( (empty($parent) || empty($tipo) || empty($lang)) )
					throw new Exception("Save: More data are needed!  section_tipo:$section_tipo, parent:$parent, tipo,$tipo, lang,$lang", 1);
			}

		# SECTION : Preparamos la sección que será la que se encargue de salvar el dato del componente
			$section 	= section::get_instance($parent, $section_tipo);
			$section_id = $section->save_component_dato($this, 'relation');

		if(SHOW_DEBUG===true) {
			#debug_log(__METHOD__." section saved from relation common: ($section_id) ".json_encode($section), logger::DEBUG);;
		}

		# ACTIVITY
		$this->save_activity();


		# RELATIONS TABLE LINKS
		if ($this->save_to_database_relations!==false) {

			$current_dato = $this->get_dato();

			$relation_options = new stdClass();
				$relation_options->section_tipo 		= $section_tipo;
				$relation_options->section_id 			= $parent;
				$relation_options->from_component_tipo 	= $tipo;
				$relation_options->ar_locators 			= $current_dato;

			$propagate_response = search_development2::propagate_component_dato_to_relations_table($relation_options);		
		}

		// copy value
			$propiedades = $this->get_propiedades();
			if (isset($propiedades->copy_value)) {
				
				$valor	= $this->get_valor();
				$value	= (is_string($valor))
					? strip_tags($valor)
					: $valor;

				$current_tipo	= $propiedades->copy_value;
				$current_model	= RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
				$copy_component	= component_common::get_instance( $current_model,
																  $current_tipo,
																  $section_id,
																  'list',
																  DEDALO_DATA_NOLAN,
																  $section_tipo);
				
				$copy_component->set_dato($value);
				$copy_component->Save();
				debug_log(__METHOD__." Saved copy_value to component $current_model - $current_tipo - $section_tipo - value: ".to_string($value), logger::DEBUG);
			}


		# RETURN SECTION ID
		return (int)$section_id;
	}//end Save



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
	public static function get_locator_value($locator, $lang=DEDALO_DATA_LANG, $show_parents=false, $ar_componets_related=false, $divisor=', ', $include_self=true) {
		if(SHOW_DEBUG===true) {
			$start_time=microtime(1);
			#dump($ar_componets_related, ' ar_componets_related ++ '.to_string());;
		}

		if (empty($locator) || !is_object($locator)) {
			return false;
		}
		$locator = new locator($locator);
		if($ar_componets_related!==false && !empty($ar_componets_related)){

			$value  	= array();
			foreach ($ar_componets_related as $component_tipo) {
				$modelo_name 	   = RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
				$current_component = component_common::get_instance($modelo_name,
																	$component_tipo,
																	$locator->section_id,
																	'edit',
																	$lang,
																	$locator->section_tipo);

				$current_value = component_common::extract_component_value_fallback($current_component, $lang, true);
					#dump($current_value , ' $current_value  ++ '.to_string($component_tipo));

				$value[] = $current_value;
			}//end foreach ($ar_componets_related as $component_tipo)

			$ar_values_clean = [];
			foreach ((array)$value as $key => $element_value) {
				if (empty($element_value) || $element_value==='<mark></mark>' || $element_value===' ') continue;
				$ar_values_clean[] = $element_value;
			}

			$valor = implode($divisor, $ar_values_clean);

		}else{

			if ($show_parents===true) {

				$ar_values = [];
				if ($include_self===true) {
					$current_values = ts_object::get_term_by_locator( $locator, $lang, true );					
					$ar_values[] = $current_values;
				}

				#$ar_parents = component_relation_parent::get_parents_recursive( $locator );
				#$ar_parents = component_relation_parent::get_parents($locator->section_id, $locator->section_tipo, $from_component_tipo=null, $ar_tables=null);
				#$ar_parents = component_relation_parent::get_parents_recursive($locator->section_id, $locator->section_tipo);
				# NOTE: get_parents_recursive is disabled because generate some problems to fix. For now we use only first parent
				#$ar_parents	= component_relation_parent::get_parents($locator->section_id, $locator->section_tipo);
				$ar_parents   = component_relation_parent::get_parents_recursive($locator->section_id, $locator->section_tipo, $skip_root=true);
				#$n_ar_parents = count($ar_parents);
					#dump($ar_parents, ' ar_parents ++ '.to_string($locator)); die();

				#$ar_locators_resolved = [$locator->section_tipo.'_'.$locator->section_id];
				foreach ($ar_parents as $current_locator) {

					#if (true===in_array($current_locator->section_tipo.'_'.$current_locator->section_id, $ar_locators_resolved)) {
					#	debug_log(__METHOD__." SKIPPED ALREADY RESOLVED LOCATOR TO PREVENT INFINITE LOOP ".to_string($current_locator->section_tipo.'_'.$current_locator->section_id), logger::ERROR);
					#	continue;
					#}

					$current_value = ts_object::get_term_by_locator( $current_locator, $lang, true );					
					if (!empty($current_value)) {
						$ar_values[]  = $current_value;
					}
					//break;
					#$ar_locators_resolved[] = $current_locator->section_tipo.'_'.$current_locator->section_id;
				}

				#debug_log(__METHOD__."  ".to_string($ar_parents_values), logger::DEBUG);
				$valor = implode($divisor, $ar_values);

			}else{

				$valor = ts_object::get_term_by_locator( $locator, $lang, true );

			}//end if ($show_parents===true)
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
		if(SHOW_DEBUG===true) {
			$total = exec_time_unit($start_time,'ms')." ms";
			#debug_log(__METHOD__." Total time $total ".to_string(), logger::DEBUG);
		}


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

		# Activity case (in transition from component_autocomplete_ts to component_autocomplete_hi)
		# Current stored data is in format: "dd546": {"dato": {"lg-nolan": "dd242"}} bypassing the component in write
		# file rows_activity.phtml parses current value to label in current lang
		#if ($tipo==='dd545' || $tipo==='dd546') {
		#	debug_log(__METHOD__." tipo: $tipo - section_tipo: $section_tipo - section_id: $section_id - parent: $parent - value: ".to_string($value), logger::DEBUG);
		#	return $value;
		#}

		$component 	= component_common::get_instance(get_called_class(),
													 $tipo,
													 $parent,
													 $modo, //'list',
													 DEDALO_DATA_NOLAN,
													 $section_tipo);

		# Use already query calculated values for speed
		#$ar_records = (array)json_handler::decode($value);
		#$component->set_dato($ar_records);

		$component->set_identificador_unico($component->get_identificador_unico().'_'.$section_id.'_'.$caller_component_tipo); // Set unic id for build search_options_session_key used in sessions

		if ($modo==='edit_in_list') {
			$result = $component->get_html();
		}else{
			$result = $component->get_valor($lang);
		}

		return $result;
	}//end render_list_value



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

		$ar_removed=array();
		foreach ((array)$parents as $current_parent) {

			$current_component_tipo = $current_parent->from_component_tipo;
			$current_section_tipo 	= $current_parent->section_tipo;
			$current_section_id 	= $current_parent->section_id;

			if ($filter!==false) {
				# compare current with filter
				$process=false;
				foreach ($filter as $current_locator) {
					if ($current_locator->section_id==$current_section_id && $current_locator->section_tipo===$current_section_tipo) {
						$process = true; break;
					}
				}
				if(!$process) continue; // Skip current section
			}


			# Target section data
			$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true); // 'component_relation_children';
			$modo 					= 'edit';
			$lang					= DEDALO_DATA_NOLAN;
			$component_relation_children = component_common::get_instance($modelo_name,
																		  $current_component_tipo,
																		  $current_section_id,
																		  $modo,
																		  $lang,
																		  $current_section_tipo);

			# NOTE: remove_me_as_your_children deletes current section references from component_relation_children and section->relations container
			# $removed = (bool)$component_relation_children->remove_children_and_save($children_locator);
			$removed = (bool)$component_relation_children->remove_me_as_your_children( $section_tipo, $section_id );
			if ($removed===true) {
				$component_relation_children->Save();
				debug_log(__METHOD__." Removed references in component_relation_children ($current_section_id, $current_section_tipo) to $section_id, $section_tipo ".to_string(), logger::DEBUG);
				$ar_removed[] = array('section_tipo' 	=> $current_section_tipo,
									  'section_id' 	 	=> $current_section_id,
									  'component_tipo' 	=> $current_component_tipo
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
	* BUILD_SEARCH_COMPARISON_OPERATORS
	* Note: Override in every specific component
	* @param array $comparison_operators . Like array('=','!=')
	* @return object stdClass $search_comparison_operators
	*/
	public function build_search_comparison_operators( $comparison_operators=array('=','!=') ) {

		return (object)parent::build_search_comparison_operators($comparison_operators);
	}//end build_search_comparison_operators



	/**
	* GET_SEARCH_QUERY
	* Build search query for current component . Overwrite for different needs in other components
	* (is static to enable direct call from section_records without construct component)
	* Params
	* @param string $json_field . JSON container column Like 'dato'
	* @param string $search_tipo . Component tipo Like 'dd421'
	* @param string $tipo_de_dato_search . Component dato container Like 'dato' or 'valor'
	* @param string $current_lang . Component dato lang container Like 'lg-spa' or 'lg-nolan'
	* @param string $search_value . Value received from search form request Like 'paco'
	* @param string $comparison_operator . SQL comparison operator Like 'ILIKE'
	*
	* @see class.section_records.php get_rows_data filter_by_search
	* @return string $search_query . POSTGRE SQL query (like 'datos#>'{components, oh21, dato, lg-nolan}' ILIKE '%paco%' )
	*/
	public static function get_search_query($json_field, $search_tipo, $tipo_de_dato_search=null, $current_lang=null, $search_value='', $comparison_operator='=') {
		
		$search_query='';
		if ( empty($search_value) ) {
			return $search_query;
		}

		$json_field = 'a.'.$json_field; // Add 'a.' for mandatory table alias search

		if (is_array($search_value)) {
			foreach ($search_value as $key => $value) {
				if (!is_object($value)) {
					$search_value[$key] = json_decode($value);
				}
			}
			$search_value = json_encode($search_value);
		}

		if (strpos($search_value, '[')===false) {
			$search_value = '['.$search_value.']';
		}

		# Add from_component_tipo to all locators to refine the search
		if($ar_locators = json_decode($search_value)) {
			#if ($search_tipo==="hierarchy9") {
			#}
			#if (!is_array($ar_locators)) {
			#	$ar_locators = array($ar_locators);
			#}
			foreach ((array)$ar_locators as $current_locator) {
				$current_locator->from_component_tipo = $search_tipo;
			}
			$search_value = json_encode($ar_locators);
		}
		#debug_log(__METHOD__." $search_query ".to_string($search_value), logger::DEBUG);

		switch (true) {

			case $comparison_operator==='!=':
				$search_query = " ({$json_field}#>'{relations}' @> '$search_value'::jsonb)=FALSE ";
				break;

			case $comparison_operator==='=':
			default:
				$search_query = " {$json_field}#>'{relations}' @> '$search_value'::jsonb ";
				break;

		}

		if(SHOW_DEBUG) {
			#debug_log(__METHOD__." $search_query ".to_string(), logger::DEBUG);
			$search_query = " -- filter_by_search $search_tipo ". get_called_class() ." \n".$search_query;
		}

		return $search_query;
	}//end get_search_query



	/**
	* GET_SELECT_QUERY
	* Build component specific sql portion query to inject in a global query
	* Note that this select_query is used only in indirect data components (with locators)
	* For components that use direct data see:
	* @see component_common->get_select_query
	* @return string $select_query
	*/
	public static function get_select_query($request_options) {

		$options = new stdClass();
			$options->json_field  = 'dato';
			$options->search_tipo = null;
			$options->lang 		  = null;
			$options->subquery 	  = true;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$json_field = 'a.'.$options->json_field; // Add 'a.' for mandatory table alias search

		$select_query  = '';

		#if ($options->subquery===true) {
			if(SHOW_DEBUG===true) {
				$select_query .= "\n  -- ".get_called_class().' > '.__METHOD__." $options->search_tipo . Select with_relations ";
			}

			// Dedalo version
			#$current_version = tool_administration::get_dedalo_version();
			#if( $current_version[0] >= 4 && $current_version[1]>= 7 && $current_version[2]>= 1) {
			// DB version
			$db_version 	= pg_version(DBi::_getConnection())['server'];
			$ar_db_version 	= explode('.', $db_version);
			if( isset($ar_db_version[0]) && $ar_db_version[0] >= 10 ) {

				$select_query .= "\n  check_array_component((jsonb_typeof({$json_field}#>'{relations}') = 'array' AND {$json_field}#>'{relations}' != '[]' ),({$json_field}#>'{relations}')) \n";
				$select_query .= "  as {$options->search_tipo}_array_elements";

			}else{

				$select_query .= "\n  case when (jsonb_typeof({$json_field}#>'{relations}') = 'array' AND {$json_field}#>'{relations}' != '[]' ) \n";
				$select_query .= "  then jsonb_array_elements({$json_field}#>'{relations}') \n";
				$select_query .= "  else {$json_field}#>'{relations}' \n";
				$select_query .= "  end as {$options->search_tipo}_array_elements";
			}

			$select_query .= "\n  ,{$json_field}#>'{relations}' as $options->search_tipo";


		#}else{
		#	if(SHOW_DEBUG===true) {
		#		$select_query .= "\n  -- ".get_called_class().' > '.__METHOD__." $options->search_tipo . Select with_references (subquery false) ";
		#	}
		#	$select_query .= "\n  {$json_field}#>'{components, $options->search_tipo, dato, $options->lang}' as $options->search_tipo";
		#}


		return $select_query;
	}//end get_select_query



	/**
	* GET_SEARcH_QUERY2__DES
	* @return
	*/
	public static function get_search_query2__DES( $query_object ) {

		# {
		#   "q": "%pepe",
		#   "lang": "lg-spa",
		#   "path": [
		#     {
		#       "section_tipo": "oh1",
		#       "component_tipo": "oh24",
		#       "target_section": "rsc197"
		#     },
		#     {
		#       "section_tipo": "rsc197",
		#       "component_tipo": "rsc453"
		#     }
		#   ],
		#   "component_path": [
		#     "dato"
		#   ]
		# }

		#$component_tipo = end($query_object->path)->component_tipo;

		# component path
		$query_object->component_path = ['relations'];

		/*
		# split multiple
		$current_query_object = component_common::split_query($query_object);
		# conform each object
		if (search_development2::is_search_operator($current_query_object)===true) {
			foreach ($current_query_object as $operator => $ar_elements) {
				foreach ($ar_elements as $c_query_object) {
					$c_query_object = self::resolve_query_object_sql($c_query_object);
				}
			}
		}else{
			$current_query_object = self::resolve_query_object_sql($current_query_object);
		}

		# Convert to array always
		$ar_query_object = array($current_query_object);*/

		# Component class name calling here
		#$called_class = get_called_class();

		$ar_query_object = component_common::get_search_query2($query_object);


		return $ar_query_object;
	}//end get_search_query2__DES



	/**
	* GET_SELECT_QUERY2
	* @return
	*/
	public static function get_select_query2( $select_object ) {
		/*
		[path] => Array
			(
				[0] => stdClass Object
					(
						[name] => Título
						[modelo] => component_input_text
						[section_tipo] => numisdata224
						[component_tipo] => numisdata231
					)

			)

		[lang] => lg-spa
		[component_path] => valor_list
		*/

		# component path
		if(!isset($select_object->component_path)) {

			# Set default
			$select_object->component_path = ['relations'];
		}

		if(!isset($select_object->type)) {
			$select_object->type = 'jsonb';
		}


		return $select_object;
	}//end get_select_query2



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @return object $query_object
	*/
	public static function resolve_query_object_sql($query_object) {
		# Always set fixed values
		$query_object->type 	= 'jsonb';
		$query_object->unaccent = false;

		# component path
		$query_object->component_path = ['relations'];

		$q = $query_object->q;


		# For unification, all non string are json encoded
		# This allow accept mixed values (encoded and no encoded)
		if (!is_string($q)) {
			$q = json_encode($q);
		}

		// remove initial and final array square brackets if exists
			// $q = str_replace(array('[',']'), '', $q);
			if (strpos($q, '[')===0) {
				$re		= '/^(\[)(.*)(\])$/m';
				$q		= preg_replace($re, '$2', $q);
			}

		$q_operator = isset($query_object->q_operator) ? $query_object->q_operator : null;

		switch (true) {
			# IS DIFFERENT
			case ($q_operator==='!=' && !empty($q)):
				$operator = '@>';
				$q_clean  = '\'['.$q.']\'::jsonb=FALSE';
				$query_object->operator = $operator;
				$query_object->q_parsed = $q_clean;
				break;
			# IS NULL
			case ($q_operator==='!*'):
				$operator = '@>';
				$q_obj = new stdClass();
					$q_obj->from_component_tipo = end($query_object->path)->component_tipo;
				$ar_q 	  = array($q_obj);
				$q_clean  = '\''.json_encode($ar_q).'\'::jsonb=FALSE';
				$query_object->operator = $operator;
				$query_object->q_parsed	= $q_clean;
				break;
			# IS NOT NULL
			case ($q_operator==='*'):
				$operator = '@>';
				$q_obj = new stdClass();
					$q_obj->from_component_tipo = end($query_object->path)->component_tipo;
				$ar_q 	  = array($q_obj);
				$q_clean  = '\''.json_encode($ar_q).'\'';
				$query_object->operator = $operator;
				$query_object->q_parsed = $q_clean;
				break;
			# CONTAIN
			default:
				$operator = '@>';
				$q_clean  = '\'['.$q.']\'';
				$query_object->operator = $operator;
				$query_object->q_parsed	= $q_clean;
				break;
		}//end switch (true) {


		return $query_object;
	}//end resolve_query_object_sql



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() {

		$ar_operators = [
			'*'		=> 'no_vacio', // not null
			'!*'	=> 'vacio',
			'!='	=> 'distinto_de',
			'='		=> 'similar_a',
		];

		return $ar_operators;
	}//end search_operators_info



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value($lang=null) {

		$dato = $this->get_dato();

		// old
			// $diffusion_value = json_encode($dato);
		

		// new (2-9-2020). Remove non publicable values		
			if (empty($dato)) {
				
				$diffusion_value = null;
			
			}else{
				
				$diffusion_value = [];
				foreach ((array)$dato as $current_locator) {

					// Check target is publicable
						$current_is_publicable = diffusion::get_is_publicable($current_locator);
						if ($current_is_publicable!==true) {
							debug_log(__METHOD__." + Skipped locator not publicable: ".to_string($current_locator), logger::DEBUG);
							continue;
						}

					$diffusion_value[] = $current_locator;
				}
				$diffusion_value = json_encode($diffusion_value);
			}
		

		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_DIFFUSION_RESOLVE_VALUE
	* Alias of static diffusion_sql::resolve_value
	* @return 
	*/
	public function get_diffusion_resolve_value($option_obj=null) {

		// example $option_obj
			// {
			//     "process_dato_arguments": {
			//         "target_component_tipo": "numisdata698",
			//         "component_method": "get_diffusion_value"
			//     },
			//	   "lang" : "lg-spa"
			// }

		$dato = $this->get_dato();

		$lang = $option_obj->lang; // $this->lang
		
		$options = new stdClass();
			$options->lang			= $lang;
			$options->propiedades	= $option_obj;

		$value = diffusion_sql::resolve_value($options, $dato);

		return $value;
	}//end get_diffusion_resolve_value



	/**
	* GET_DIFFUSION_DATO
	* @return string $diffusion_value
	*/
	public function get_diffusion_dato() {
		
		$dato = $this->get_dato();
		if (is_array($dato)) {
			$ar_id = array();
			foreach ($dato as $current_locator) {
				$ar_id[] = $current_locator->section_id;
			}
			$final_dato = $ar_id;
		}
		$diffusion_value = isset($final_dato)
			? json_encode($final_dato)
			: json_encode([]);

		return (string)$diffusion_value;
	}//end get_diffusion_dato



	/**
	* GET_DIFFUSION_VALUE_TERM_ID
	* @return string json_encoded array
	*/
	public function get_diffusion_value_term_id() {

		$dato = $this->get_dato();

		$ar_term = [];
		foreach ((array)$dato as $key => $current_locator) {

			// Check target is publicable
				$current_is_publicable = diffusion::get_is_publicable($current_locator);
				if ($current_is_publicable!==true) {
					debug_log(__METHOD__." + Skipped locator not publicable: ".to_string($current_locator), logger::DEBUG);
					continue;
				}

			$term_id = locator::get_term_id_from_locator($current_locator);
			$ar_term[] = $term_id;
		}

		$result = json_encode($ar_term);


		return $result;
	}//end get_diffusion_value_term_id



	/**
	* SET_DATO_EXTERNAL
	* get the dato from other component that reference at the current section of the component (portal, autocomplete, select, etc)
	* the result will be the result of the search to the external section and component
	* and the combiantion with the dato of the component (portal, autocomplete, select, etc) (that save the result for user manipulation, order, etc)
	* @see used by component_autocomplete and component_portal
	* @return dato
	*/
	public function set_dato_external($save=false, $changed=false, $current_dato=false) {
		$start_time=microtime(1);

		// dato set
			if ($current_dato!==false) {
				$dato = $current_dato;
			}else{
				$dato = $this->get_dato();
			}

		// propiedades . get the properties for get search section and component
			$propiedades 				= $this->get_propiedades();
			$ar_section_to_search 		= $propiedades->source->section_to_search;
			$ar_component_to_search 	= $propiedades->source->component_to_search;

		// current section tipo/id
			$section_id 	= $this->get_parent();
			$section_tipo 	= $this->get_section_tipo();

		// data source overwrite (tool cataloging case)
			if (isset($propiedades->source->source_overwrite) && isset($propiedades->source->component_to_search)) {
				// overwrite source locator
					$component_to_search_tipo 	= reset($ar_component_to_search);
					$modelo_name 	  		   	= RecordObj_dd::get_modelo_name_by_tipo($component_to_search_tipo, true);
					$component_to_search 		= component_common::get_instance($modelo_name,
																				 $component_to_search_tipo,
																				 $section_id,
																				 'list',
																				 DEDALO_DATA_NOLAN,
																				 $section_tipo);
					$component_to_search_dato = $component_to_search->get_dato();
					foreach ($component_to_search_dato as $current_locator) {
						$locator = new locator();
							$locator->set_section_id($current_locator->section_id);
							$locator->set_section_tipo($current_locator->section_tipo);
						break; // Only first is allowed
					}

				// get overwrite source data when exists
					if (isset($locator)) {

						$data_from_field_tipo		= $propiedades->source->source_overwrite->data_from_field;
						$modelo_name 	  		   	= RecordObj_dd::get_modelo_name_by_tipo($data_from_field_tipo, true);
						$component_overwrite 		= component_common::get_instance($modelo_name,
																					 $data_from_field_tipo,
																					 $locator->section_id,
																					 'list',
																					 DEDALO_DATA_NOLAN,
																					 $locator->section_tipo);
						$overwrite_dato = $component_overwrite->get_dato();

						$this->set_dato($overwrite_dato);
						$this->Save();
					}
				return true; // task done. return

			}else{
				// default normal case
				// locator . get the locator of the current section for search in the component that call this section
					$locator = new locator();
						$locator->set_section_id($section_id);
						$locator->set_section_tipo($section_tipo);
			}

		// new dato
			$new_dato = [];

		// data_from_field. get if the search need add fields data:
			if(isset($propiedades->source->data_from_field)){
				$data_from_field  = $propiedades->source->data_from_field;

				foreach ($data_from_field as $current_component_tipo) {
					$modelo_name 	  		   = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo, true);
					$component_data_for_search = component_common::get_instance($modelo_name,
																				$current_component_tipo,
																				$locator->section_id,
																				'list',
																				DEDALO_DATA_NOLAN,
																				$locator->section_tipo,
																				false);
					$component_dato = $component_data_for_search->get_dato_with_references();

					foreach ($component_dato as $current_locator) {
						$locator_dato = new locator();
							$locator_dato->set_section_id($current_locator->section_id);
							$locator_dato->set_section_tipo($current_locator->section_tipo);

						$new_dato[] = $locator_dato;
					}
				}
			}

		// Add locator at end
			$new_dato[] = $locator;


		// Direct search (!)
			#function direct_search($new_dato, $ar_component_to_search, $ar_section_to_search, $tipo, $relation_type) {
			#	$start_time=microtime(1);
			#
			#	$value_to_search  = $new_dato;
			#	$ar_filter_fields = [];
			#	foreach ($ar_component_to_search as $component_to_search) {
			#
			#		# get the modelo_name of the componet to search
			#		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_to_search,true);
			#
			#		//get the query model of the component to secarch
			#		foreach ($value_to_search as $value) {
			#			$ar_filter_fields[]	= $modelo_name::get_search_query( $json_field='datos', $component_to_search, $tipo_de_dato_search='dato', DEDALO_DATA_NOLAN, json_encode($value), $comparison_operator='=');
			#		}
			#
			#		break; // Only one exists
			#	}
			#	$filter_fields = implode(' OR ', $ar_filter_fields);
			#	# MATRIX TABLE : Only from first term for now
			#		$matrix_table = common::get_matrix_table_from_tipo( $ar_section_to_search[0] );
			#
			#	# TARGET SECTIONS : Filter search by target sections (hierarchy_sections)
			#		$filter_target_section = '';
			#		$ar_filter=array();
			#		foreach ($ar_section_to_search as $current_section_tipo) {
			#			$ar_filter[] = "a.section_tipo='$current_section_tipo'";
			#		}
			#		$filter_target_section = '(' . implode(' OR ', $ar_filter) . ')';
			#
			#	# ORDER
			#		$order 	= "a.section_id ASC";
			#
			#	# Build the search query
			#	$strQuery = PHP_EOL.sanitize_query("
			#	 -- ".__METHOD__."
			#		SELECT a.section_id, a.section_tipo
			#		FROM \"$matrix_table\" a
			#		WHERE
			#		$filter_target_section
			#		AND ( $filter_fields )
			#		ORDER BY $order ;
			#		"
			#		);
			#	if(SHOW_DEBUG===true) {
			#		#error_log("*** set_dato_external *** ".$strQuery);
			#	}
			#
			#	$result	= JSON_RecordObj_matrix::search_free($strQuery, false);
			#
			#	if(SHOW_DEBUG===true) {
			#		#$subtotal = exec_time_unit($start_time,'ms')." ms";
			#		#debug_log(__METHOD__." Subsubtotal time $subtotal [$this->section_tipo, $this->tipo, $this->parent] ".get_class($this) .' : '. RecordObj_dd::get_termino_by_tipo($this->tipo) ." ". to_string($strQuery), logger::DEBUG);
			#	}
			#
			#	# Build the locators with the result
			#	$ar_result = array();
			#	while ($rows = pg_fetch_assoc($result)) {
			#		$locator 		= new locator();
			#			$locator->set_section_id($rows['section_id']);
			#			$locator->set_section_tipo($rows['section_tipo']);
			#			$locator->set_type($relation_type);
			#			$locator->set_from_component_tipo($tipo);
			#		$ar_result[] = $locator;
			#	}
			#	#dump($ar_result, ' ar_result 1 DIRECT ++ '.to_string());
			#
			#	return $ar_result;
			#}
			#$ar_result = direct_search($new_dato, $ar_component_to_search, $ar_section_to_search, $this->tipo, $this->get_relation_type());

			$ar_result = $this->get_external_result($new_dato, $ar_component_to_search, $ar_section_to_search);

			# From locators inside property 'relations'
			#$ar_result = $this->get_external_result($new_dato, $ar_component_to_search, $ar_section_to_search);
			# From table 'relations' (x number of locators in new_dato is fast aprox. because 'OR' problem in indexes)
				# if (isset($propiedades->source->source_overwrite)) {
				# 	# replace on the fly (tool cataloging case)
				# 		$ar_component_to_search = [$propiedades->source->source_overwrite->from_component_tipo];
				# }else{
				# 	# untouch ar_component_to_search
				# }

				// removed way of relations (!)
					#$ar_result 		 = $this->get_external_result_from_relations_table($new_dato, $ar_component_to_search);
					#dump($ar_result, ' ar_result 2 RELATIONS TABLE ++ '.to_string());

				// way of search_development2::calculate_inverse_locators. Working here (!)
					#$ar_result3 = [];
					#foreach ((array)$new_dato as $reference_locator) {
					#	$ar_related = search_development2::calculate_inverse_locators( $reference_locator, false, false, false);
					#	foreach ($ar_related as $current_related) {
					#		$found = array_filter($ar_result3, function($item) use($current_related) {
					#			if ($item->from_section_id===$current_related->from_section_id && $item->from_section_tipo===$current_related->from_section_tipo) {
					#				# ignore already added
					#			}else{
					#				return $item;
					#			}
					#		});
					#		#if (count($found)===0) {
					#			$ar_result3[] = $current_related;
					#		#}
					#	}
					#}
					#dump($ar_result3, ' ar_result 3 ++ SEARCH_DEVELOPMENT2 '.to_string());

			$total_ar_result = count($ar_result);
			$total_ar_dato   = count($dato);

			$portal_max_ordered_locators = 2000;
			if ($total_ar_result>$portal_max_ordered_locators) {
				# Not maintain order, is too expensive above 1000 locators
				if ($total_ar_dato!==$total_ar_result) {
					$changed = false; // avoid expensive save
					$this->set_dato($ar_result);
					debug_log(__METHOD__." Saving big result with different data (dato:$total_ar_dato - result:$total_ar_result) ".to_string(), logger::DEBUG);
				}
			}else{
				# maintain order
				foreach ((array)$dato as $key => $current_locator) {

					// Array filter is more fast in this case for big arrays
					$res = array_filter($ar_result, function($item) use($current_locator){
						if ($item->section_id===$current_locator->section_id && $item->section_tipo===$current_locator->section_tipo) {
							return $item;
						}
					});

					//if( locator::in_array_locator( $current_locator, $ar_result, $ar_properties=array('section_id','section_tipo') )===false){
					if (empty($res)) {
						unset($dato[$key]);
						$changed = true;
					}
				}

				// dato update
				if ($total_ar_dato!==$total_ar_result) {
					foreach ($ar_result as $key => $current_locator) {
						if(	locator::in_array_locator( $current_locator, $dato, $ar_properties=array('section_id','section_tipo') )===false ){
							array_push($dato, $current_locator);
							$changed = true;
						}
					}
				}
			}

		// changed true
			if ($changed===true) {
				$dato = array_values($dato);
				$this->set_dato($dato);
				if ($save===true) {
					$this->Save();
					debug_log(__METHOD__." Saved modified dato to sustain the order - $total_ar_result locators in section_id = $section_id ".to_string(), logger::DEBUG);
				}
			}

		// debug
			if(SHOW_DEBUG===true) {
				//$total = exec_time_unit($start_time,'ms')." ms";
				//debug_log(__METHOD__." Total time $total - $total_ar_result locators [$this->section_tipo, $this->tipo, $this->parent] ".get_class($this) .' : '. RecordObj_dd::get_termino_by_tipo($this->tipo) . to_string(), logger::DEBUG);
			}

		#return $dato;
		#$this->set_dato($ar_result);
		return true;
	}//end set_dato_external



	/**
	* GET_EXTERNAL_RESULT
	* @return array $ar_result
	* 	Array of locators
	*/
	private function get_external_result($new_dato, $ar_component_to_search, $ar_section_to_search) {
		$start_time=microtime(1);

		$value_to_search  = $new_dato;
		$ar_filter_fields = [];
		foreach ($ar_component_to_search as $component_to_search) {

			# get the modelo_name of the componet to search
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_to_search,true);

			//get the query model of the component to secarch
			foreach ($value_to_search as $value) {
				$ar_filter_fields[]	= $modelo_name::get_search_query( $json_field='datos', $component_to_search, $tipo_de_dato_search='dato', DEDALO_DATA_NOLAN, json_encode($value), $comparison_operator='=');
			}
			break; // Only one exists
		}
		$filter_fields = implode(' OR ', $ar_filter_fields);

		# MATRIX TABLE : Only from first term for now
			$matrix_table = common::get_matrix_table_from_tipo( $ar_section_to_search[0] );


		# TARGET SECTIONS : Filter search by target sections (hierarchy_sections)
			$filter_target_section = '';
			$ar_filter=array();
			foreach ($ar_section_to_search as $current_section_tipo) {
				$ar_filter[] = "a.section_tipo='$current_section_tipo'";
			}
			$filter_target_section = '(' . implode(' OR ', $ar_filter) . ')';

		# ORDER
			$order 	= "a.section_id ASC";

		# Build the search query
		$strQuery = PHP_EOL.sanitize_query("
		 -- ".__METHOD__."
			SELECT a.section_id, a.section_tipo
			FROM \"$matrix_table\" a
			WHERE
			$filter_target_section
			AND ( $filter_fields )
			ORDER BY $order ;
			"
			);

		$result	= JSON_RecordObj_matrix::search_free($strQuery, false);

		if(SHOW_DEBUG===true) {
			// $subtotal = exec_time_unit($start_time,'ms')." ms";
			// debug_log(__METHOD__." Subsubtotal time $subtotal [$this->section_tipo, $this->tipo, $this->parent] ".get_class($this) .' : '. RecordObj_dd::get_termino_by_tipo($this->tipo) ." ". to_string($strQuery), logger::DEBUG);
		}

		# Build the locators with the result
		$ar_result = array();
		while ($rows = pg_fetch_assoc($result)) {
			$locator 		= new locator();
				$locator->set_section_id($rows['section_id']);
				$locator->set_section_tipo($rows['section_tipo']);
				$locator->set_type($this->get_relation_type());
				$locator->set_from_component_tipo($this->get_tipo());
			$ar_result[] = $locator;
		}

		return $ar_result;
	}//end get_external_result



	/**
	* GET_EXTERNAL_RESULT_FROM_RELATIONS_TABLE
	* @return array $ar_result
	* 	Array of locators
	*/
	private function get_external_result_from_relations_table($new_dato, $ar_component_to_search) {
		$start_time=microtime(1);

		if (empty($new_dato)) {
			debug_log(__METHOD__." ERROR. Empty new_dato is received !! Skipped search of external results from relations table. ".to_string(), logger::ERROR);
			return [];
		}

		$value_to_search  = $new_dato;
		$ar_filter_fields = [];
		foreach ($ar_component_to_search as $component_to_search_tipo) {

			// get the query model of the component to search
			foreach ($value_to_search as $current_locator) {
				# model: (a.target_section_tipo='numisdata3' AND a.target_section_id=14 AND a.from_component_tipo='numisdata161')
				$ar_filter_fields[]	= '(target_section_tipo=\''.$current_locator->section_tipo.'\' AND target_section_id='.(int)$current_locator->section_id.' AND from_component_tipo=\''.$component_to_search_tipo.'\')';
			}
			break; // Only one exists
		}
		$filter_fields = implode( PHP_EOL.' OR ', $ar_filter_fields);


		# Build the search query
			$strQuery =  PHP_EOL.'-- '.__METHOD__ .PHP_EOL. 'SELECT section_id, section_tipo FROM "relations" WHERE' .PHP_EOL . $filter_fields;
			if(SHOW_DEBUG===true) {
				error_log("***+++ set_dato_external *** ".$strQuery);
			}

		$result	= JSON_RecordObj_matrix::search_free($strQuery, false);

		if(SHOW_DEBUG===true) {
			//$subtotal = exec_time_unit($start_time,'ms')." ms";
			//debug_log(__METHOD__." Subsubtotal time $subtotal [$this->section_tipo, $this->tipo, $this->parent] ".get_class($this) .' : '. RecordObj_dd::get_termino_by_tipo($this->tipo) ." ". to_string($strQuery), logger::DEBUG);
		}

		# Build the locators with the result
			$ar_result = array();
			while ($rows = pg_fetch_assoc($result)) {
				$locator = new locator();
					$locator->set_section_id($rows['section_id']);
					$locator->set_section_tipo($rows['section_tipo']);
					$locator->set_type($this->get_relation_type());
					$locator->set_from_component_tipo($this->get_tipo());
				$ar_result[] = $locator;
			}


		return $ar_result;
	}//end get_external_result_from_relations_table



	/**
	* SET_RELATION_TYPE
	* @return bool true
	*/
	public function set_relation_type($type) {

		$old = $this->relation_type;

		$this->relation_type = $type;

		if(SHOW_DEBUG===true) {
			if ($old!==$type) {
				debug_log(__METHOD__." Changed relation type to $type from $old ".to_string(" in component:".$this->tipo)." ".get_called_class().' '.RecordObj_dd::get_termino_by_tipo($this->tipo) , logger::DEBUG);
			}
		}


		return true;
	}//end set_relation_type



	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null) {

		if (empty($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}

		$valor_export = $this->get_valor($lang);
		$valor_export = br2nl($valor_export);

		return $valor_export;
	}//end get_valor_export



	/**
	* GET_RELATIONS_SEARCH_VALUE
	* @return bool false
	* Default response for calls to this method. Overwritten in component_autocomplete_hi
	*/
	public function get_relations_search_value() {

		return false;
	}//end get_relations_search_value



	/**
	* GET_INDEXATIONS_SEARCH
	* PROTECTED (!) not call directly
	* @see component_relation_index::get_indexations_search
	* @see component_relation_struct::get_indexations_search
	*
	* @return resource $result
	*//*
	protected static function get_indexations_search( $options ) {

		$locator = new locator();
			$locator->set_section_tipo($options->fields->section_tipo);
			$locator->set_section_id($options->fields->section_id);
			if (isset($options->fields->component_tipo) && $options->fields->component_tipo!==false) {
			$locator->set_component_tipo($options->fields->component_tipo);
			}
			if (isset($options->fields->type) && $options->fields->type!==false) {
			$locator->set_type($options->fields->type);
			}
			if (isset($options->fields->tag_id) && $options->fields->tag_id!==false) {
			$locator->set_tag_id($options->fields->tag_id);
			}

		$result = search_development2::calculate_inverse_locators( $locator, $limit=false, $offset=false, $count=false );


		return $result;
	}//end get_indexations_search
	*/



	/**
	* GET_FILTER_LIST_DATA
	* Create all data needed for build service autocomplete filter options interface
	* @param array $filter_by_list
	* @return array $filter_fields_data
	*/
	public static function get_filter_list_data($filter_by_list) {

		$filter_list_data = [];
		foreach ((array)$filter_by_list as $current_obj_value) {

			$f_section_tipo   	= $current_obj_value->section_tipo;
			$f_component_tipo 	= $current_obj_value->component_tipo;

			# Calculate list values of each element
			$c_modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($f_component_tipo,true);
			$current_component  = component_common::get_instance($c_modelo_name,
																 $f_component_tipo,
																 null,
																 'list',
																 DEDALO_DATA_LANG,
																 $f_section_tipo);

			$ar_list_of_values = $current_component->get_ar_list_of_values2(DEDALO_DATA_LANG);
			foreach ((array)$ar_list_of_values->result as $key => $item) {

				$current_label = $item->label;
				$current_value = $item->value;

				$current_locator = new locator();
					$current_locator->set_type(DEDALO_RELATION_TYPE_LINK); # Add relation type (always link)
					$current_locator->set_section_id($current_value->section_id);
					$current_locator->set_section_tipo($current_value->section_tipo);
					$current_locator->set_from_component_tipo($f_component_tipo); # Add from_component_tipo

				$current_locator_json = json_encode($current_locator);

				$input_id = hash('sha256', $current_locator_json);

				// Element
				$element = new stdClass();
					$element->id 		= $input_id;
					$element->value 	= $current_locator;
					$element->label 	= $current_label;
					$element->component_tipo = $f_component_tipo;

				$filter_list_data[] = $element;

			}//end foreach ((array)$ar_list_of_values->result as $key => $item)
		}


		return $filter_list_data;
	}//end get_filter_list_data



	/**
	* GET_FILTER_FIELDS_DATA
	* Create all data needed for build service autocomplete filter options interface
	* @param object $search_query_object
	* @return array $filter_fields_data
	*/
	public static function get_filter_fields_data($search_query_object, $propiedades) {

		$filter_obj = $search_query_object->filter;

		// exclude elements already used as filter list
			$ar_filters 	= [];
			$filter_by_list = isset($propiedades->source->filter_by_list) ? $propiedades->source->filter_by_list : [];
			foreach ($filter_by_list as $value) {
				$ar_filters[] = $value->component_tipo;
			}

		$filter_fields_data = [];

		// build fields from search_query_object->filter
			foreach ($filter_obj as $operator => $ar_filter) foreach ($ar_filter as $key => $current_filter) {

				$first_path 			= reset($current_filter->path);
				$last_path 				= end($current_filter->path);
				$base_component_tipo 	= $first_path->component_tipo;
				$base_section_tipo 		= $first_path->section_tipo;
				$section_tipo_name		= RecordObj_dd::get_termino_by_tipo($base_section_tipo,DEDALO_APPLICATION_LANG,true);
				$current_component_tipo = $last_path->component_tipo;
				$current_section_tipo 	= $last_path->section_tipo;
				$current_modelo_name 	= $last_path->modelo;
				$name 					= $last_path->name;

				if (true===in_array($base_component_tipo, $ar_filters)) continue;

				// type_map
					if (isset($propiedades->source->type_map->$base_component_tipo)) {
						$type_map = $propiedades->source->type_map->$base_component_tipo;
					}else{
						$type_map = array();
					}

				// Element
					$element = new stdClass();
						$element->section_tipo 			= $base_section_tipo;
						$element->section_tipo_name 	= $section_tipo_name;
						$element->tipo 					= $current_component_tipo;
						$element->name 					= $name;
						$element->modelo_name 			= $current_modelo_name;
						$element->type_map 				= $type_map;
						$element->base_component_tipo 	= $base_component_tipo;
						$element->search_engine 		= "search_dedalo";

					$filter_fields_data[] = $element;
			}

		// source search components
			if(isset($propiedades->source->search)) {

				$source_search = $propiedades->source->search;
				foreach ($source_search as $current_search) {

					if ($current_search->type!=='external') {
						continue; // ignore non external (already calculated from search_query_object)
					}

					$current_section_tipo 	= $current_search->section_tipo;
					$section_tipo_name 		= RecordObj_dd::get_termino_by_tipo($current_section_tipo,DEDALO_APPLICATION_LANG,true);
					$RecordObj_dd 			= new RecordObj_dd($current_section_tipo);
					$section_properties		= $RecordObj_dd->get_propiedades(true);
					$search_engine 			= isset($section_properties->search_engine) ? $section_properties->search_engine : null;


					foreach ($current_search->components as $current_component_tipo) {

						$name 					= RecordObj_dd::get_termino_by_tipo($current_component_tipo,DEDALO_APPLICATION_LANG,true);
						$current_modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);
						$RecordObj_dd 			= new RecordObj_dd($current_component_tipo);
						$section_properties		= $RecordObj_dd->get_propiedades(true);
						$fields_map 			= isset($section_properties->fields_map) ? $section_properties->fields_map : null;


						// type_map
							if (isset($propiedades->source->type_map->$current_component_tipo)) {
								$type_map = $propiedades->source->type_map->$current_component_tipo;
							}else{
								$type_map = array();
							}

						// Element
						$element = new stdClass();
							$element->section_tipo 			= $current_section_tipo;
							$element->section_tipo_name 	= $section_tipo_name;
							$element->tipo 					= $current_component_tipo;
							$element->name 					= $name;
							$element->modelo_name 			= $current_modelo_name;
							$element->type_map 				= $type_map;
							$element->base_component_tipo 	= $current_component_tipo;
							$element->search_engine 		= $search_engine;
							$element->fields_map 			= $fields_map;

						$filter_fields_data[] = $element;
					}
				}
			}//end if(isset($propiedades->source->search))


		return $filter_fields_data;
	}//end get_filter_fields_data



	/**
	* PARSE_STATS_VALUES
	* @return array $ar_clean
	*/
	public static function parse_stats_values($tipo, $section_tipo, $propiedades, $lang=DEDALO_DATA_LANG, $selector='valor_list') {

		// Search
			if (isset($propiedades->stats_look_at)) {
				$related_tipo = reset($propiedades->stats_look_at);
				if (isset($propiedades->valor_arguments)) {
					$selector = 'dato';
				}
			}else{
				$related_tipo = false; //$current_column_tipo;
			}
			$path 		= search_development2::get_query_path($tipo, $section_tipo, true, $related_tipo);
			$end_path 	= end($path);
			$end_path->selector = $selector;

			$search_query_object = '{
			  "section_tipo": "'.$section_tipo.'",
			  "allow_sub_select_by_id": false,
			  "remove_distinct": true,
			  "limit": 0,
			  "select": [
				{
				  "path": '.json_encode($path).'
				}
			  ]
			}';
			#dump($search_query_object, ' search_query_object ** ++ '.to_string());
			$search_query_object = json_decode($search_query_object);
			$search_development2 = new search_development2($search_query_object);
			$result 			 = $search_development2->search();
			#dump($result, ' result ** ++ '.to_string());

		// Parse results for stats
			$ar_clean = [];
			foreach ($result->ar_records as $key => $item) {

				#$uid = $locator->section_tipo.'_'.$locator->section_id;

				$item_array	= get_object_vars($item);
				$value		= end($item_array) ?? '';

				// locators case (like component_select)
				if (strpos($value, '[{')===0 && !isset($propiedades->valor_arguments)) {
					$ar_locators = json_decode($value);
					foreach ((array)$ar_locators as $locator) {

						$label = ts_object::get_term_by_locator( $locator, $lang, true ) ?? '';
						$label = strip_tags(trim($label));

						$uid = $locator->section_tipo.'_'.$locator->section_id;

						if(!isset($ar_clean[$uid])){
							$ar_clean[$uid] = new stdClass();
							$ar_clean[$uid]->count = 0;
							$ar_clean[$uid]->tipo  = $tipo;
						}

						$ar_clean[$uid]->count++;
						$ar_clean[$uid]->value = $label;
					}
				// resolved string case (like component_portal)
				}else{

					$label = !empty($value)
						? strip_tags(trim($value))
						: '';
						if ($label==='[]') {
							$label = 'not defined';
						}

					// Override label with custom component parse
					if (isset($propiedades->stats_look_at) && isset($propiedades->valor_arguments)) {
						$modelo_name = RecordObj_dd::get_modelo_name_by_tipo(reset($propiedades->stats_look_at), true);
						$label 		 = $modelo_name::get_stats_value_with_valor_arguments($value, $propiedades->valor_arguments);
					}

					$uid = $label;

					if(!isset($ar_clean[$uid])){
						$ar_clean[$uid] = new stdClass();
						$ar_clean[$uid]->count = 0;
						$ar_clean[$uid]->tipo  = $tipo;
					}

					$ar_clean[$uid]->count++;
					$ar_clean[$uid]->value = $label;
				}

			}
			#dump($ar_clean, ' ar_clean ++ ** '.to_string());


		return $ar_clean;
	}//end parse_stats_values


	/**
	* BUILD_LIST_DATA
	* Build list data to manage with service_list
	* @return array
	*/
	public function build_list_data($request_options=[]) {

		$start_time=microtime(1);

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= __METHOD__.' Error. Request failed';

		// Options
			$options = new stdClass();
				$options->limit 	= 10;
				$options->offset 	= 0;

				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// Search records . Search filtering with component dato allow paginate records for big portals, etc.
			$tipo 					= $this->get_tipo();
			$dato 					= (array)$this->get_dato();
			$filter_by_locator 		= (array)$dato;
			$ar_target_section_tipo = $this->get_ar_target_section_tipo();
			$propiedades 			= $this->get_propiedades();

			// Select. Generate select columns based on propedades.data_list array of objects
				$select_group = [];
				if (isset($propiedades->data_list)) {

					# Create from related terms
					foreach ($propiedades->data_list as $item) {

						$current_section_tipo = ($item->section_tipo==='current') ? reset($ar_target_section_tipo) : $item->section_tipo;

						$path = search_development2::get_query_path($item->component_tipo, $current_section_tipo, false);

						// Select_element (select_group)
							$select_element = new stdClass();
								$select_element->path = $path;

							$select_group[] = $select_element;
					}
				}

			// Filter. Generate filter based on dato locators
				$filter_group  = null;
				$ar_section_id = [];
				if (!empty($filter_by_locator)) {

					// Is an array of objects
					foreach ((array)$filter_by_locator as $key => $value_obj) {
						$current_section_id = (int)$value_obj->section_id;
						if (!in_array($current_section_id, $ar_section_id)) {
							$ar_section_id[] = $current_section_id;
						}
					}

					$ar_filter_element = [];
					foreach ($ar_target_section_tipo as $target_section_tipo) {

						$filter_element = new stdClass();
							$filter_element->q 		= json_encode($ar_section_id);
							$filter_element->path 	= json_decode('[
								{
									"section_tipo": "'.$target_section_tipo.'",
									"component_tipo": "dummy",
									"modelo": "component_section_id",
									"name": "build_list_data searching"
								}
							]');
						$ar_filter_element[] = $filter_element;
					}


					$op = '$and';
					$filter_group = new stdClass();
						$filter_group->$op = $ar_filter_element;

				}//end if ($filter_by_locator!==false)
				$total_locators = count($ar_section_id);

			// Order
				$order_values = array_map(function($locator){
					return (int)$locator->section_id;
				}, $dato);
				$item = new stdClass();
					$item->column_name 	 = 'section_id';
					$item->column_values = $order_values;
				$order_custom = [$item];

			// Search query object
				$search_query_object = new stdClass();
					$search_query_object->section_tipo  = $ar_target_section_tipo;
					$search_query_object->limit   		= $options->limit;
					$search_query_object->offset  		= $options->offset;
					$search_query_object->full_count  	= $total_locators>0 ? $total_locators : false ;
					$search_query_object->order_custom  = $order_custom;
					$search_query_object->filter  		= $filter_group;
					$search_query_object->select  		= $select_group;

			// Search
				$search_develoment2  = new search_development2($search_query_object);
				$rows_data 		 	 = $search_develoment2->search();
					#dump($rows_data, ' rows_data ++ '.to_string());

			// Resolve columns
				$rows_resolved = [];
				foreach ($rows_data->ar_records as $key => $row) {

					// Iterate row object
					foreach ($row as $column_key => $column_value) {

						// Skip temp columns
							if (strpos($column_key, 'ordering')===0) {
								continue;
							}

						// label. Resolve non control column keys
							preg_match('/section/', $column_key, $output_array);
							$control_column = isset($output_array[0]) ? true : false;
							$label = ($control_column===true) ? $column_key : RecordObj_dd::get_termino_by_tipo($column_key,DEDALO_APPLICATION_LANG,true);

						// value. Resolve non control column values
							if ($control_column===false) {
								$column_tipo 		= $column_key;
								$section_id  		= $row->section_id;
								$render_list_mode 	= 'list';
								$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($column_tipo,true);
								$target_section_tipo= $row->section_tipo;

								$value = (string)$modelo_name::render_list_value($column_value, // value string from db
																				 $column_tipo, // current component tipo
																				 $section_id, // current portal row section id
																				 $render_list_mode, // mode get form properties or default
																				 DEDALO_DATA_LANG, // current data lang
																				 $target_section_tipo, // current section tipo
																				 $section_id // Current portal parent
																				 #$current_locator, // Used by text_area to select fragment
																				 #$tipo // Current component_portal tipo
																				);
							}else{
								$value = $column_value;
							}
						$item = new stdClass();
							$item->tipo  = $column_key;
							$item->label = $label;
							$item->value = $value;

						$rows_resolved[$key][] = $item;
					}
				}
				#dump($result, ' result ++ '.to_string());

			// Final object
				$result = new stdClass();
					$result->rows = $rows_resolved;

				if(SHOW_DEBUG===true) {
					$result->generated_time = $rows_data->generated_time;
					$result->generated_time['total_time'] = exec_time_unit($start_time,'sec') .' sec';
					dump($result, ' result ++ '.to_string());
				}

			// response
				$response->result 	= $result;
				$response->msg 		= 'Error. Request failed';

		return $response;
	}//end build_list_data



	/**
	* MAP_LOCATOR_TO_TERM_ID [diffusion]
	* Alias of diffusion_sql::map_locator_to_term_id
	* Used in diffusion by component_autocomplete and component_portal (!)
	* @return string | null $term_id
	*/
	public function map_locator_to_term_id() { // Diffusion method

		$term_id = null;

		$dato = $this->get_dato();

		if (!empty($dato)) {

			// arguments from properties->process_dato_arguments->custom_arguments
				$args 	 = func_get_args(); // is array of objects
				$options = new stdClass();
				if (!empty($args)) {
					foreach ($args as $value_obj) {
						foreach ($value_obj as $key => $value) {
							$options->{$key} = $value;
						}
					}
				}

			// add parents option
				$new_dato = [];
				if (isset($options->add_parents) && $options->add_parents===true) {
					# calculate parents and add to dato
					foreach ((array)$dato as $current_locator) {
						// get_parents_recursive($section_id, $section_tipo, $skip_root=true, $is_recursion=false)
						$ar_parents = component_relation_parent::get_parents_recursive($current_locator->section_id, $current_locator->section_tipo, true);
						foreach ($ar_parents as $parent_locator) {
							$new_dato[] = $parent_locator;
						}
					}
					$dato = array_merge($dato, $new_dato);
				}

			// send to diffusion for normalize formats
				$term_id = diffusion_sql::map_locator_to_term_id(null, $dato);
		}

		return $term_id;
	}//end map_locator_to_term_id



}//end component_relation_common
?>
