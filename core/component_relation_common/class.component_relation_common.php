<?php
/*
* CLASS COMPONENT_RELATION_COMMON
* Used as common base from all components that works from section relations data, instead standar component dato
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
		// protected $lang = DEDALO_DATA_NOLAN;

		# save_to_database_relations
		# On false, avoid propagate to table relation current component locators at save
		# @see class geonames::import_data
		public $save_to_database_relations = true;

		// $dato_full. component dato with all langs
		public $dato_full;



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
	public function __construct($tipo=null, $parent=null, $modo='edit', $lang=null, $section_tipo=null) {

		# Force always DEDALO_DATA_NOLAN
		// $lang = $this->lang;

		$RecordObj_dd = new RecordObj_dd($tipo);
		$translatable = $RecordObj_dd->get_traducible();
		if ($translatable==='si') {
			if (empty($lang)) {
				$lang = DEDALO_DATA_LANG;
			}else{
				if ($lang===DEDALO_DATA_NOLAN) {
					debug_log(__METHOD__." Changed component wrong lang [translatable $section_tipo - $tipo] from $lang to ".DEDALO_DATA_LANG, logger::ERROR);
					$lang = DEDALO_DATA_LANG;
				}
			}
		}else{
			if (empty($lang)) {
				$lang = DEDALO_DATA_NOLAN;
			}else{
				if ($lang!==DEDALO_DATA_NOLAN) {
					debug_log(__METHOD__." Changed component wrong lang [non translatable $section_tipo - $tipo] from $lang to ".DEDALO_DATA_NOLAN, logger::ERROR);
					$lang = DEDALO_DATA_NOLAN;
				}
			}
		}

		# relation_type
		# $this->relation_type = DEDALO_RELATION_TYPE_CHILDREN_TIPO;
		# Build the componente normally
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

		// if(SHOW_DEBUG) {
		// 	$traducible = $this->RecordObj_dd->get_traducible();
		// 	if ($traducible==='si') {
		// 		#throw new Exception("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP", 1);
		// 		trigger_error("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP");
		// 	}
		// }

		return true;
	}//end __construct



	/**
	* GET_DATO
	* Returns dato from container 'relations', not for component dato container
	* @return array $dato
	*	$dato is always an array of locators or an empy array
	*/
	public function get_dato() {

		if(isset($this->dato_resolved)) {
			return $this->dato_resolved;
		}

		// time machine mode case
			if ($this->modo==='tm') {

				if (empty($this->matrix_id)) {
					debug_log(__METHOD__." ERROR. 'matrix_id' IS MANDATORY IN TIME MACHINE MODE  ".to_string(), logger::ERROR);
					return false;
				}

				// tm dato. Note that no lang or section_id is needed, only matrix_id
				$dato_tm = component_common::get_component_tm_dato($this->tipo, $this->section_tipo, $this->matrix_id);
				// inject dato to component
				$this->dato_resolved = $dato_tm;

				return $this->dato_resolved;
			}

		// load. Load matrix data and set this->dato
			$this->load_component_dato();

		$dato = $this->dato;

		return $dato;
	}//end get_dato



	/**
	* GET_DATO_FULL
	* Returns dato from container 'relations', not for component dato container
	* @return array $dato
	*	$dato is always an array of locators or an empy array
	*/
	public function get_dato_full() {

		// load. Load matrix data and set this->dato
			$this->load_component_dato();

		$dato_full = $this->dato_full;

		return $dato_full;
	}//end get_dato_full



	/**
	* LOAD MATRIX DATA
	* Get data once from matrix about parent, dato
	*/
	protected function load_component_dato() {

		if( empty($this->parent) || $this->modo==='dummy' || $this->modo==='search') {
			return null;
		}

		if( $this->bl_loaded_matrix_data!==true ) {

			// dato full
			$this->dato_full = $this->get_all_data();

			// dato
			if (!empty($this->dato_full)) {

				$this->dato = [];
				$translatable = $this->RecordObj_dd->get_traducible();
				foreach ($this->dato_full as $locator) {
					if ($translatable!=='si') {
						$this->dato[] = $locator;
					}else if($locator->lang === $this->lang){
						$this->dato[] = $locator;
					}
				}
			}else{
				$this->dato = $this->dato_full;
			}

			# Set as loaded
			$this->bl_loaded_matrix_data = true;
		}

		return true;
	}//end load_component_dato



	/**
	* GET_DATO_FULL
	* Returns dato from container 'relations', not for component dato container
	* @return array $dato
	*	$dato is always an array of locators or an empy array
	*/
	public function get_all_data() {

		$my_section = $this->get_my_section();
		$relations  = $my_section->get_relations();

		# Filtered case
		$component_relations = [];
		foreach ($relations as $locator) {
			if(	isset($locator->from_component_tipo) && $locator->from_component_tipo===$this->tipo ) {
				$component_relations[] = $locator;
			}
		}
		$all_data = $component_relations;

		return $all_data;
	}//end get_all_data



	/**
	* GET_DATO_GENERIC
	* Get the component dato locators with no other property than section_tipo and section_id
	* @return array $dato_generic
	*/
	public function get_dato_generic() {

		# Dato without from_component_tipo property
		$dato_generic = [];
		foreach ((array)$this->dato as $key => $current_locator) {
			$generic_locator = new stdClass();
				$generic_locator->section_tipo 	= $current_locator->section_tipo;
				$generic_locator->section_id 	= $current_locator->section_id;
				#$generic_locator->type 		= $current_locator->type;
			$dato_generic[] = $generic_locator;
		}

		return $dato_generic;
	}//end get_dato_generic



	/**
	* GET_DATO_WITH_REFERENCES
	* Return the dato to all components, except the components that has references calculated,
	* like component_relation_related
	* this will mix the real dato and the result of the calculation
	* (!) Default is the component dato, but overwrite it if component need it
	* @return array $dato_with_references
	*/
	public function get_dato_with_references() {

		$dato_with_references = $this->get_dato();

		return $dato_with_references;
	}//end get_dato_with_references



	/**
	* SET_DATO
	* Set raw dato overwrite existing dato.
	* Usually, dato is builded element by element, adding one locator to existing dato, but some times we need
	* insert complete array of locators at once. Use this method in this cases
	*/
	public function set_dato($dato) {
		
		$safe_dato = [];

		$translatable = $this->RecordObj_dd->get_traducible();
		$lang = $this->get_lang();

		if (!empty($dato)) {

			// Tool Time machine case, dato is string
			if (is_string($dato)) {
				$dato = json_decode($dato);
			}

			// Bad formed array case
			if (is_object($dato)) {
				$dato = array($dato);
			}

			// Ensures dato is a real non-associative array (avoid json encode as object)
			$dato = is_array($dato) ? array_values($dato) : (array)$dato;

			# Verify all locators are well formed
			$relation_type 		 = $this->relation_type;
			$from_component_tipo = $this->tipo;

			foreach ((array)$dato as $key => $current_locator) {

				// is_object check
				if (!is_object($current_locator)) {
					$msg = " Error on set locator (is not object) json_ecoded: ".json_encode($current_locator);
					trigger_error( __METHOD__ . $msg );
					debug_log( __METHOD__ . $msg, logger::ERROR);
					throw new Exception("Error Processing Request. Look server log for details", 1);
				}

				// section_id
				if (!isset($current_locator->section_id) || !isset($current_locator->section_tipo)) {
					debug_log(__METHOD__." IGNORED bad formed locator (empty section_id or section_tipo) [$this->section_tipo, $this->parent, $this->tipo] ". get_called_class().' - current_locator: '.to_string($current_locator), logger::ERROR);
					continue;
				}

				// type
				if (!isset($current_locator->type)) {
					debug_log(__METHOD__." Fixing bad formed locator (empty type) [$this->section_tipo, $this->parent, $this->tipo] ". get_called_class().' - current_locator: '.to_string($current_locator), logger::WARNING);
					$current_locator->type = $relation_type;
				}
				// from_component_tipo
				if (!isset($current_locator->from_component_tipo)) {
					$current_locator->from_component_tipo = $from_component_tipo;
				}else if ($current_locator->from_component_tipo!==$from_component_tipo) {
					debug_log(__METHOD__." Fixed bad formed locator (bad from_component_tipo $current_locator->from_component_tipo) [$this->section_tipo, $this->parent, $from_component_tipo] ".get_called_class().' '.to_string(), logger::WARNING);
					$current_locator->from_component_tipo = $from_component_tipo;
				}

				// lang
				if ($translatable==='si') {
					if (!isset($current_locator->lang)) {
						$current_locator->lang = $lang;
					}else if ($current_locator->lang!==$lang) {
						debug_log(__METHOD__." Fixed bad formed locator (bad lang $current_locator->lang) [$this->section_tipo, $this->parent, $lang] ".get_called_class().' '.to_string(), logger::WARNING);
						$current_locator->lang = $lang;
					}// end if (!isset($current_locator->lang))
				}// end if ($translatable==='si')

				# Add
				$safe_dato[] = $current_locator;
			}
		}

		parent::set_dato( (array)$safe_dato );


		// translatable cases
		if ($translatable==='si') {
			$new_dato_full = [];
			// remove old locators of current lang
			foreach ((array)$this->dato_full as $locator) {
				if (!isset($locator->lang) || $locator->lang!==$lang) {
					$new_dato_full[] = $locator;
				}
			}
			// merge data and cleaned dato_full
			$this->dato_full = array_merge($new_dato_full, (array)$safe_dato);
		}else{
			$this->dato_full =  (array)$safe_dato;
		}

		return true;
	}//end set_dato



	/**
	* GET_VALOR_LANG
	* Return the component lang depending of is translatable or not
	* If the component need change this langs (selects, radiobuttons...) overwritte this function
	* @return string $lang
	*/
	public function get_valor_lang() {

		$related = (array)$this->RecordObj_dd->get_relaciones();
		if(empty($related)){
			return $this->lang;
		}

		$termonioID_related = array_values($related[0])[0];
		$RecordObj_dd 		= new RecordObj_dd($termonioID_related);

		$lang = ($RecordObj_dd->get_traducible()==='no') ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;


		return $lang;
	}//end get_valor_lang



	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id ) {

		if (empty($valor)) {
			// if not already receved 'valor', force component load 'dato' from DB
			$dato = $this->get_dato();
		}else{
			// use parsed received json string as dato
			$this->set_dato( json_decode($valor) );
		}

		$valor_export = $this->get_valor($lang);

		// replace html '<br>'' for plain text return '\nl'
		$valor_export = br2nl($valor_export);

		return $valor_export;
	}//end get_valor_export



	/**
	* LOAD_COMPONENT_DATAFRAME
	* @return
	*/
	public function load_component_dataframe() {

		if( empty($this->parent) || $this->modo==='dummy' || $this->modo==='search') {
			return null;
		}

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

		// short vars
			$section_tipo	= $this->get_section_tipo();
			$parent 		= $this->get_parent();
			$tipo 			= $this->get_tipo();
			$lang 			= DEDALO_DATA_LANG;
			$modo 			= $this->get_modo();

		// dataframe mode
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


		// save_to_database. Verify component main vars
			if (!isset($this->save_to_database) || $this->save_to_database!==false) {
				// parent : Verify parent
					if( abs($parent)<1 && strpos($parent, DEDALO_SECTION_ID_TEMP)===false) {
						if(SHOW_DEBUG===true) {
							dump($this, "this section_tipo:$section_tipo - parent:$parent - tipo:$tipo - lang:$lang");
							throw new Exception("Error Processing Request. Inconsistency detected: component trying to save without parent ($parent) ", 1);
						}
						die("Error. Save component data is stopped. Inconsistency detected. Contact with your administrator ASAP");
					}

				// Verify component minumun vars before save
					if( (empty($parent) || empty($tipo) || empty($lang)) ) {
						throw new Exception("Save: More data are needed!  section_tipo:$section_tipo, parent:$parent, tipo,$tipo, lang,$lang", 1);
					}
			}

		// section : Preparamos la sección que será la que se encargue de salvar el dato del componente
			$section 	= section::get_instance($parent, $section_tipo);
			$section_id = $section->save_component_dato($this, 'relation');


		// activity
			$this->save_activity();


		// relations table links
			if ($this->save_to_database_relations!==false) {

				$current_dato = $this->get_dato_full();

				$relation_options = new stdClass();
					$relation_options->section_tipo 		= $section_tipo;
					$relation_options->section_id 			= $parent;
					$relation_options->from_component_tipo 	= $tipo;
					$relation_options->ar_locators 			= $current_dato;

				$propagate_response = search::propagate_component_dato_to_relations_table($relation_options);
			}

		# Observers
		// the observers will be need to be notified for re-calculate your own dato with the new component dato
			$this->propagate_to_observers();

		return (int)$section_id;
	}//end Save


	/**
	* GET_LOCATOR_VALUE
	* Resolve locator to string value to show in list etc.
	* @return string $locator_value
	*/
	public static function get_locator_value( $locator, $lang=DEDALO_DATA_LANG, $show_parents=false, $ar_componets_related=false, $divisor=', ', $include_self=true ) {
		if(SHOW_DEBUG===true) {
			$start_time=microtime(1);
			#dump($ar_componets_related, ' ar_componets_related ++ '.to_string());;
		}

		if (empty($locator) || !is_object($locator)) {
			return false;
		}
		$locator = new locator($locator);
		if($ar_componets_related!==false && !empty($ar_componets_related)){

			$value = array();
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

			$locator_value = implode($divisor, $ar_values_clean);

		}else{

			if ($show_parents===true) {

				$ar_values = [];
				if ($include_self===true) {
					$ar_values[] = ts_object::get_term_by_locator( $locator, $lang, true );
				}

				#$ar_parents = component_relation_parent::get_parents_recursive($locator->section_id, $locator->section_tipo);
				# NOTE: get_parents_recursive is disabled because generate some problems to fix. For now we use only first parent
				#$ar_parents	= component_relation_parent::get_parents($locator->section_id, $locator->section_tipo);
				$ar_parents   = component_relation_parent::get_parents_recursive($locator->section_id, $locator->section_tipo, $skip_root=true);
				#$n_ar_parents = count($ar_parents);
					#dump($ar_parents, ' ar_parents ++ '.to_string($locator)); die();

				foreach ($ar_parents as $current_locator) {

					$current_value = ts_object::get_term_by_locator( $current_locator, $lang, true );
					if (!empty($current_value)) {
						$ar_values[]  = $current_value;
					}
				}

				#debug_log(__METHOD__."  ".to_string($ar_parents_values), logger::DEBUG);
				$locator_value = implode($divisor, $ar_values);

			}else{

				$locator_value = ts_object::get_term_by_locator( $locator, $lang, true );

			}//end if ($show_parents===true)
		}

		if(SHOW_DEBUG===true) {
			$total = exec_time_unit($start_time,'ms')." ms";
			#debug_log(__METHOD__." Total time $total ".to_string(), logger::DEBUG);
		}


		return (string)$locator_value;
	}//end get_locator_value



	/**
	* REMOVE_PARENT_REFERENCES
	* Calculate parents and removes references to current section
	* @param string $section_tipo
	* @param int $section_id
	* @param array $filter
	* 	Is array of locators. Default is bool false
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

		$q = str_replace(array('[',']'), '', $q);

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
			'!='	=> 'distinto_de',
			'!*'	=> 'vacio',
			'*'		=> 'no_vacio' // not null
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
		$diffusion_value = json_encode($dato);

		return (string)$diffusion_value;
	}//end get_diffusion_value


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
			#dump($dato, ' dato ++ '.to_string());

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

			$ar_result 		 = $this->get_external_result_from_relations_table($new_dato, $ar_component_to_search);
			$total_ar_result = count($ar_result);
			$total_ar_dato   = count($dato);

			if ($total_ar_result>1000) {
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
	* GET_RELATIONS_SEARCH_VALUE
	* @return bool false
	* Default response for calls to this method. Overwritten in component_autocomplete_hi
	*/
	public function get_relations_search_value() {

		return false;
	}//end get_relations_search_value



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
																 'edit',
																 DEDALO_DATA_LANG,
																 $f_section_tipo);
			// get section json
				$get_json_options = new stdClass();
					$get_json_options->get_context 	= false;
					$get_json_options->get_data 	= true;
				$filter_list_data[] = $current_component->get_json($get_json_options);


		}

		return $filter_list_data;
	}//end get_filter_list_data



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
			$path 		= search::get_query_path($tipo, $section_tipo, true, $related_tipo);
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
			$search 			 = search::get_instance($search_query_object);
			$result 			 = $search->search();
			#dump($result, ' result ** ++ '.to_string());

		// Parse results for stats
			$ar_clean = [];
			foreach ($result->ar_records as $key => $item) {

				#$uid = $locator->section_tipo.'_'.$locator->section_id;

				$value = end($item);

				// locators case (like component_select)
				if (strpos($value, '[{')===0 && !isset($propiedades->valor_arguments)) {
					$ar_locators = $value;
					foreach ((array)$ar_locators as $locator) {

						$label = ts_object::get_term_by_locator( $locator, $lang, true );
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

					$label = strip_tags(trim($value));
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
	* GET_SQO_CONTEXT
	* Calculate the sqo for the components or section that need search by own (section, autocomplete, portal, ...)
	* The search_query_object_context (sqo_context) have at least:
	* one sqo, that define the search with filter, offest, limit, etc, the select option is not used (it will use the ddo)
	* one ddo for the searched section (source ddo)
	* one ddo for the component searched.
	* 	is possible create more than one ddo for different components.
	* @return object | json
	*/
	public function get_sqo_context() {

		// already calculated
			if (isset($this->sqo_context)) {
				return $this->sqo_context;
			}

		// sort vars
			$section_tipo 	= $this->get_section_tipo();
			$tipo			= $this->get_tipo();
			$lang 			= $this->get_lang();
			$section_id		= $this->get_parent();
			$mode 			= $this->get_modo();
			$propiedades	= $this->get_propiedades();


		// SEARCH
			$search = [];
			// typo SOURCE SEARCH
				$source_search = new stdClass();
					$source_search->typo 			= 'source';
					$source_search->action 			= 'search';
					$source_search->tipo 			= $tipo;
					$source_search->section_tipo 	= $section_tipo;
					$source_search->lang 			= $lang;
					$source_search->mode 			= 'list';

				$search[] = $source_search;

			// typo SEARCH
				// filter_custom
					$filter_custom = [];
				// hierarchy_terms_filter
					if (isset($propiedades->source->hierarchy_terms)) {
						$hierarchy_terms_filter = $this->get_hierarchy_terms_filter();
						$filter_custom = array_merge($filter_custom, $hierarchy_terms_filter);
					}
				// propiedades filter custom
					if (isset($propiedades->source->filter_custom)) {
						$filter_custom = array_merge($filter_custom, $propiedades->source->filter_custom);
					}
				// Limit
					$limit = isset($propiedades->limit) ? (int)$propiedades->limit : 40;
				// operator can be injected by api
					$operator = isset($propiedades->source->operator) ? '$'.$propiedades->source->operator : null;
				// search_sections
					$ar_target_section_tipo = $this->get_ar_target_section_tipo();
					$search_sections 		= array_values( array_unique($ar_target_section_tipo) );

				// search_query_object build
					$search_sqo_options = new stdClass();
						$search_sqo_options->q 	 				  = null;
						$search_sqo_options->limit  			  = $limit;
						$search_sqo_options->offset 			  = 0;
						$search_sqo_options->section_tipo 		  = $search_sections;
						$search_sqo_options->tipo 				  = $tipo;
						$search_sqo_options->logical_operator 	  = $operator;
						$search_sqo_options->add_select 		  = false;
						$search_sqo_options->filter_custom 		  = !empty($hierarchy_terms_filter) ? $hierarchy_terms_filter : null;
						$search_sqo_options->skip_projects_filter = true; // skip_projects_filter true on edit mode

					$search_query_object = common::build_search_query_object($search_sqo_options);

				// value_with_parents
					if (isset($propiedades->value_with_parents) && $propiedades->value_with_parents===true){

						$search_query_object->value_with_parents 	= true;
						$search_query_object->source_component_tipo = $tipo;

					}// end $value_with_parent = true

				// add sqo
					$search[] = $search_query_object;


		// SHOW
			$show= [];
			// search_query_object_options

				$limit 	= $propiedades->max_records ?? $this->max_records;
				$offset = 0;

				$pagination = new stdClass();
					$pagination->limit 	= $limit;
					$pagination->offset = $offset;

				$show_sqo_options = new stdClass();
					$show_sqo_options->section_tipo = $search_sections;
					$show_sqo_options->tipo			= $tipo;
					$show_sqo_options->full_count	= false;
					$show_sqo_options->add_select 	= false;
					$show_sqo_options->add_filter 	= true;
					// paginations options
					$show_sqo_options->limit 		 = $limit;
					$show_sqo_options->offset 		 = $offset;

				$search_query_object = common::build_search_query_object($show_sqo_options);

				// value_with_parents
					if (isset($propiedades->value_with_parents) && $propiedades->value_with_parents===true){
						$search_query_object->value_with_parents 	= true;
						$search_query_object->source_component_tipo = $tipo;
					}// end $value_with_parent = true

				// add sqo
					$show[] = $search_query_object;


		// LAYOUT MAP // fields for select / show. add ddo

			// subcontext from layout_map items
			// search
				$layout_map_options = new stdClass();
					$layout_map_options->section_tipo 			= $section_tipo;
					$layout_map_options->tipo 					= $tipo;
					$layout_map_options->modo 					= $mode;
					$layout_map_options->add_section 			= true;
					$layout_map_options->config_context_type 	= 'select';
				$search = array_merge( $search, layout_map::get_layout_map($layout_map_options) );

			// show
				$layout_map_options->config_context_type 		= 'show';
				$show = array_merge( $show, layout_map::get_layout_map($layout_map_options) );


			$sqo_context = new stdClass();
				$sqo_context->show 		= $show;
				$sqo_context->search 	= $search;


			///////////////////////////////////////////

			/*
			$search = json_decode('[
				{
					"typo": "sqo",
					"id": "temp",
					"section_tipo": ["numisdata3"],
					"filter": {
						"$or": [
							{
								"q": null,
								"lang": "all",
								"path": [
									{
										"name"				: "Catálogo",
										"modelo"			: "component_select",
										"section_tipo"		: "numisdata3",
										"component_tipo"	: "numisdata309"
									},
									{
										"name"				: "Catálogo",
										"modelo"			: "component_input_text",
										"section_tipo"		: "numisdata300",
										"component_tipo"	: "numisdata303",
										"lang_DES"				: "all"
									}
								]
							},
							{
								"q"		: null,
								"lang"	: "all",
								"path"	: [
									{
										"name"				: "Número",
										"modelo"			: "component_input_text",
										"section_tipo"		: "numisdata3",
										"component_tipo"	: "numisdata27",
										"lang_DES"				: "all"
									}
								]
							}
						]
					},
					"limit": 40,
					"offset": 0,
					"skip_projects_filter": true
				},
				{
					"typo"			: "ddo",
					"model"			: "section",
					"tipo" 			: "numisdata3",
					"section_tipo" 	: "numisdata3",
					"mode" 			: "list",
					"lang" 			: "no-lan",
					"parent"		: "root"
				},
				{
					"typo"			: "ddo",
					"tipo" 			: "numisdata27",
					"section_tipo" 	: "numisdata3",
					"mode" 			: "list",
					"lang" 			: "lg-nolan",
					"parent"		: "numisdata3",
					"model"			: "component_input_text"
				},
				{
					"typo"			: "ddo",
					"tipo" 			: "numisdata309",
					"section_tipo" 	: "numisdata3",
					"mode" 			: "list",
					"lang" 			: "lg-nolan",
					"parent"		: "numisdata3",
					"model"			: "component_select"
				},
				{
					"typo"			: "ddo",
					"tipo" 			: "numisdata81",
					"section_tipo" 	: "numisdata3",
					"mode" 			: "list",
					"lang" 			: "lg-eng",
					"parent"		: "numisdata3",
					"model"			: "component_input_text"
				}
			]');
			*/

		// fix
		$this->sqo_context	= $sqo_context;
		$this->pagination	= $pagination;


		return $sqo_context;
	}//end get_sqo_context



	/**
	* GET_HIERARCHY_TERMS_FILTER
	* Create a sqo filter from
	* @return array $filter_custom
	* @see get_sqo_context
	*/
	public function get_hierarchy_terms_filter() {

		$filter_custom = [];

		$properties = $this->get_propiedades();

		$terms = $properties->source->hierarchy_terms;
		foreach ($terms as $current_item) {
			$resursive = (bool)$current_item->recursive;
			# Get childrens
			$ar_childrens = component_relation_children::get_childrens($current_item->section_id, $current_item->section_tipo, null, $resursive);
			$component_section_id_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($current_item->section_tipo, ['component_section_id'], true, true, true, true, false);

			$path = new stdClass();
				$path->section_tipo 	= $current_item->section_tipo;
				$path->component_tipo 	= reset($component_section_id_tipo);
				$path->modelo 			= 'component_section_id';
				$path->name 			= 'Id';

			$ar_section_id = array_map(function($children){
				return $children->section_id;
			}, $ar_childrens);

			$filter_item = new stdClass();
				$filter_item->q 	= implode(',', $ar_section_id);
				$filter_item->path 	= [$path];

				$filter_custom[] = $filter_item;
		}//end foreach


		return $filter_custom;
	}//end get_hierarchy_terms_filter



}//end component_relation_common
