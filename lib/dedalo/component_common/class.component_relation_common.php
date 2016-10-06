<?php
/*
* CLASS COMPONENT_RELATION_COMMON
* Used as common base from all components tha works from section relations data, instead standar component dato
* like component_model, component_parent, etc..
*/

class component_relation_common extends component_common {

	# relation_tipo (set in constructor). 
	# Defines type used in section relation locators to set own locator type
	protected $relation_tipo;
	

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
				if(isset($current_locator->type) && $current_locator->type==$filtered_by) {
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

		$relation_type = $this->relation_type;

		# Verify locator type
		if (!isset($locator->type) || $locator->type!=$relation_type) {
			throw new Exception("Error Processing Request. Current locator type is incorrect ($locator->type). Expected is ".$relation_type, 1);			
		}
		
		$ar_locator = $this->get_dato();

		# Dato exits test
		$exists = (bool)locator::in_array_locator( $locator, $ar_locator, $ar_properties=array('section_tipo','section_id','type','from_component_tipo') );
		if($exists===false) {
			$ar_locator[] = $locator;

			# Update component dato
			$this->set_dato($ar_locator);		
		
			return true;
		}		

		return false;
	}//end add_locator_to_dato



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
	* @return 
	*/
	public function get_dato() {

		if(isset($this->dato)) {
			$dato = $this->dato;
		}else{
			$dato = $this->get_my_section_relations( $this->relation_type );
		}		

		return (array)$dato;
	}//end get_dato



	/**
	* SET_DATO
	*/
	public function set_dato( $dato ) {

		$my_section = $this->get_my_section();
		$my_section->add_relations( (array)$dato, $remove_previous_of_current_type=true );

		# UNSET previous calculated valor
		unset($this->valor);

		$this->dato = (array)$dato;
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
			if(SHOW_DEBUG) {
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


		# RETURN MATRIX ID
		return (int)$parent;
	}#end Save



	/**
	* SAVE_INVERSE_LOCATOR_FROM_LOCATOR
	* Build and save inverse locator in target section referenced in locator
	* @return int section_id
	*/
	private function save_inverse_locator_from_locator( $locator ) {

		$relation_type_inverse = $this->relation_type_inverse;
		
		# Add locator relations to target section (for fast access later only)
		$reverse_locator  = new locator();
			$reverse_locator->set_section_tipo($locator->section_tipo);
			$reverse_locator->set_section_id($this->parent);
			$reverse_locator->set_type($relation_type_inverse);

		$children_section = section::get_instance($locator->section_id, $locator->section_tipo);
		$children_section->add_relation($reverse_locator,false);

		return $children_section->Save();
	}//end save_inverse_locator_from_locator



	/**
	* REMOVE_LOCATOR_FROM_DATO
	* @return 
	*/
	public function remove_locator_from_dato( $locator ) {

		$ar_locator = $this->get_dato();
		# Iterate and search current locator in component dato
		foreach ($ar_locator as $key => $current_locator) {
			$equal = locator::compare_locators( $current_locator, $locator, $ar_properties=array('section_tipo','section_id','type','from_component_tipo') );
			if ( $equal===true ) {
				unset($ar_locator[$key]);

				# Recreate indexes (avoid json read this array as object)
				$ar_locator = array_values($ar_locator);

				# Update component dato
				$this->set_dato($ar_locator);

				# Remove locator relations from current section before save (for fast access later only)
				$section = $this->get_my_section();
				$section->remove_relation($locator);

				# Save
				$this->Save();

				# Remove locator relations from target section (for fast access later only)
				$reverse_locator  = new locator();
					$reverse_locator->set_section_tipo($locator->section_tipo);
					$reverse_locator->set_section_id($this->parent);
					$reverse_locator->set_type(DEDALO_RELATION_TYPE_PARENT_TIPO);

				$children_section = section::get_instance($locator->section_id, $locator->section_tipo);
				$children_section->remove_relation($reverse_locator);
				$children_section->Save();

				return true;
			}
		}		

		return false;		
	}//end remove_locator_from_dato



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
	public function get_locator_value( $locator, $lang=DEDALO_DATA_LANG ) {

		# En proceso. De momento devuelve el locator en formato json, sin resolver..
		# $valor = json_encode($locator);

		# Temporal
		if( RecordObj_dd::get_prefix_from_tipo($locator->section_tipo)===RecordObj_dd::get_prefix_from_tipo($this->section_tipo)) {		

			$tipo 		 	= DEDALO_THESAURUS_TERM_TIPO; // input_text
			$parent 		= $locator->section_id;
			$section_tipo 	= $locator->section_tipo;
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component 		= component_common::get_instance( $modelo_name,
															  $tipo,
															  $parent,
															  $modo='edit',
															  $lang,
															  $section_tipo);
			$valor = $component->get_valor($lang);
			
			if (empty($valor)) {
				$main_lang = hierarchy::get_main_lang( $locator->section_tipo );
				if($lang!=$main_lang) {
					$component->set_lang($main_lang);
					$valor = $component->get_valor($main_lang);
					if (strlen($valor)>0) {
						$valor = component_common::decore_untranslated( $valor );
					}		

					# return component to previous lang
					$component->set_lang($lang);
				}				
			}		
		}


		# En proceso. De momento devuelve el locator en formato json, sin resolver..
		$valor = isset($valor) ? json_encode($locator).' '.$valor : json_encode($locator);
		
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
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id) {

		$component 	= component_common::get_instance(get_called_class(),
													 $tipo,
												 	 $parent,
												 	 'list',
													 DEDALO_DATA_NOLAN,
												 	 $section_tipo);

		
		# Use already query calculated values for speed
		$ar_records = (array)json_handler::decode($value);
		$component->set_dato($ar_records);
		$component->set_identificador_unico($component->get_identificador_unico().'_'.$section_id); // Set unic id for build search_options_session_key used in sessions
		
		return  $component->get_valor($lang);
	}#end render_list_value

	

}//end component_relation_common























class desactiva{

	/**
	* SAVE_RELATIONS
	* @return int $result
	*	section returns section_id on save
	* When save component, section is saved, not explicit section save is needed here
	*/
	public function save_relations() {

		# Set section relation locators for fast access
		$my_section = $this->get_my_section();

		$dato = $this->get_dato();		
		foreach ((array)$dato as $current_locator) {
			$my_section->add_relation($current_locator, false);
		}
	}//end save_relations

	
	


	/**
	* GET DATO
	* @return array $dato
	*	$dato is always an array of locators from first level of section (not from component)
	*/
	public function get_dato() {

		$section_relations = $this->get_my_section_relations();

		$dato = array();
		foreach ((array)$section_relations as $current_locator) {
			if($current_locator->type===DEDALO_RELATION_TYPE_MODEL_TIPO) {
				$dato[] = $current_locator;
			}
		}
		$this->dato = $dato;

		return (array)$dato;
	}//end get_dato



	/**
	* SET_DATO
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

		if (empty($dato)) {
			$res = parent::set_dato( null );
		}else{
			$my_section = $this->get_my_section();
			$my_section->add_relations($dato);

			$res = parent::set_dato( (array)$dato );
		}
		
		return $res;		
	}//end set_dato


	
	/**
	* GET_VALOR
	* Get value . default is get dato . overwrite in every different specific component
	* @return string | null $valor
	*/
	public function get_valor($lang=DEDALO_DATA_LANG) {

		if (isset($this->valor)) {
			if(SHOW_DEBUG) {
				//error_log("Catched valor !!! from ".__METHOD__);
			}
			return $this->valor;
		}

		$valor  = null;		
		$dato   = $this->get_dato();
		if (!empty($dato)) {
			
			# Test dato format (b4 changed to object)
			if(SHOW_DEBUG) {
				foreach ($dato as $key => $current_value) {
					if (!is_object($current_value)) {
						if(SHOW_DEBUG) {
							dump($dato," dato");
						}
						trigger_error(__METHOD__." Wrong dato format. OLD format dato in $this->label $this->tipo .Expected object locator, but received: ".gettype($current_value) .' : '. print_r($current_value,true) );
						return $valor;
					}
				}
			}		

			# Always run list of values
			$ar_list_of_values	= $this->get_ar_list_of_values( $lang, null ); # Importante: Buscamos el valor en el idioma actual

			foreach ($ar_list_of_values->result as $locator => $label) {
				$locator = json_handler::decode($locator);	# Locator is json encoded object
					#dump($label, ' label ++ '.to_string($locator));
				if (in_array($locator, $dato)) {
					$valor = $label;
					break;
				}
			}

		}//end if (!empty($dato)) 

		# Set component valor
		$this->valor = $valor;

		return $valor;
	}//end get_valor



	/*
	* GET_VALOR_LANG
	* Return the main component lang
	* If the component need change this langs (selects, radiobuttons...) overwritte this function
	*/
	public function get_valor_lang(){

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
		return $lang;
	}//end get_valor_lang



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

		$prefix = RecordObj_dd::get_prefix_from_tipo($this->section_tipo);
			#dump($prefix, ' prefix ++ '.to_string());

		$ar_target_section_tipo = array($prefix.'2');
		
		# Fix value
		$this->ar_target_section_tipo = $ar_target_section_tipo;
		
		return (array)$ar_target_section_tipo;
	}//end get_ar_target_section_tipo



	/**
	* GET_REFERENCED_TIPO
	* Alias of get_ar_target_section_tipo
	* Select source section/s
	* Overrides component common method
	* @return string $this->referenced_tipo
	*/
	public function get_referenced_tipo() {

		if (!$this->tipo) return null;
		if (isset($this->referenced_tipo)) return $this->referenced_tipo;

		# For future compatibility, we use get_ar_target_section_tipo to obtain section target tipo
		$ar_target_section_tipo = $this->get_ar_target_section_tipo();
		
		$this->referenced_tipo = reset($ar_target_section_tipo);
		
		return (string)$this->referenced_tipo;
	}//end get_referenced_tipo

}
?>