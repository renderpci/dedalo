<?php
/*
* CLASS COMPONENT_AUTOCOMPLETE
*
*
*/
class component_autocomplete extends component_relation_common {


	protected $relation_type = DEDALO_RELATION_TYPE_LINK;

	# test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');

	# ar_target_section_tipo
	public $ar_target_section_tipo;		# Used to fix section tipo (calculado a partir del componente relacionado de tipo section) Puede ser virtual o real

	# Array of related terms in structure (one or more)
	protected $ar_terminos_relacionados;

	# referenced component tipo
	public $tipo_to_search;



	/**
	* GET_DATO
	*/
	public function get_dato() {

		$dato = parent::get_dato();

		/* des
			if (!empty($dato) && !is_array($dato)) {
				#dump($dato,"dato");
				trigger_error("Error: ".__CLASS__." dato type is wrong. Array expected and ".gettype($dato)." is received for tipo:$this->tipo, parent:$this->parent");
				$this->set_dato(array());
				$this->Save();
			}
			if ($dato===null) {
				$dato=array();
			}
			#$dato = json_handler::decode(json_encode($dato));	# Force array of objects instead default array of arrays
			*/
			#dump($dato," dato");
			/*
			if (!empty($dato)) foreach((array)$dato as $key => $value) {
				if (empty($value) || $value==='[]') {
					unset($dato[$key]);
					$this->dato = array_values($dato);
					$this->ave();
				}
			}*/

		return (array)$dato;
	}//end get_dato



	/**
	* SET_DATO
	*/
	public function set_dato($dato) {

		if (is_string($dato)) { # Tool Time machine case, dato is string
			$dato = json_handler::decode($dato);
		}

		/* des
			if (is_object($dato)) {
				$dato = array($dato); // IMPORTANT
			}else if (is_string($dato)) {
				$dato = array();
			}

			# Remove possible duplicates
			$dato_unique=array();
			foreach ((array)$dato as $locator) {
				if (!in_array($locator, $dato_unique)) {
					$dato_unique[] = $locator;
				}
			}
			$dato = $dato_unique;
			*/


		return parent::set_dato( (array)$dato );
	}//end set_dato



	/**
	* GET VALOR
	* Get resolved string representation of current value (expected id_matrix of section or array)
	* @return array $this->valor
	*/
	public function get_valor($lang=DEDALO_DATA_LANG, $format='string', $ar_related_terms=false, $divisor='<br> ') {

		if (isset($this->valor)) {
			if(SHOW_DEBUG===true) {
				#error_log("Catched valor !!! from ".__METHOD__);
			}
			return $this->valor;
		}

		$dato = $this->get_dato();

		if (empty($dato)) {
			if ($format==='array') {
				return array();
			}else{
				return '';
			}
		}

		# Test dato format (b4 changed to object)
		foreach ($dato as $key => $value) {
			if (!is_object($value)) {
				if(SHOW_DEBUG===true) {
					dump($dato," dato ($value) is not object!! gettype:".gettype($value)." section_tipo:$this->section_tipo - tipo:$this->tipo - parent:$this->parent " );
				}
				trigger_error(__METHOD__." Wrong dato format. OLD format dato in $this->label $this->tipo [section_id:$this->parent].Expected object locator, but received: ".gettype($value) .' : '. print_r($value,true) );
				return $this->valor = null;
			}
		}

		$propiedades 	 = $this->get_propiedades();
		$search_list_add = isset($propiedades->search_list_add) ? $propiedades->search_list_add : false;


		# AR_COMPONETS_RELATED. By default, ar_related_terms is calculated. In some cases (diffusion for example) is needed overwrite ar_related_terms to obtain especific 'valor' form component
			if ($ar_related_terms===false) {

				$ar_componets_related = array();

				$ar_related_terms = $this->RecordObj_dd->get_relaciones();

				foreach ((array)$ar_related_terms as $ar_value) foreach ($ar_value as $modelo => $component_tipo) {
					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
					if ($modelo_name!=='section'){
						$ar_componets_related[] = $component_tipo;
					}
				}

			}else{
				$ar_componets_related = (array)$ar_related_terms;
			}
			#dump($ar_componets_related, ' ar_componets_related ++ '.to_string($this->tipo));

		# lang never must be DEDALO_DATA_NOLAN
		if ($lang===DEDALO_DATA_NOLAN) $lang=DEDALO_DATA_LANG;



		$ar_values = array();
		$divisor   = $this->get_divisor();
		foreach ($dato as $current_locator) {

			if(isset($propiedades->source->search)){
				foreach ($propiedades->source->search as $current_search) {
					if($current_search->section_tipo === $current_locator->section_tipo){
						$ar_componets_related =  $current_search->components;
					}
				}
			}

			$current_locator_json = json_encode($current_locator);

			$ar_current_value=array();
			foreach ($ar_componets_related as $component_tipo) {

				$modelo_name 	   = RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
				$current_component = component_common::get_instance($modelo_name,
																	$component_tipo,
																	$current_locator->section_id,
																	'list',
																	$lang,
																	$current_locator->section_tipo);

				$current_value = component_common::extract_component_value_fallback($current_component,$lang,true);

				#$ar_current_value[$current_locator->section_tipo.'_'.$current_locator->section_id] = $current_value;
				$value_obj = new stdClass();
					$value_obj->key 	= $current_locator_json;
					$value_obj->value 	= $current_value;

				$ar_current_value[] = $value_obj;
			}//end foreach ($ar_componets_related as $component_tipo)


			$ar_current_values_clean = [];
			foreach ($ar_current_value as $value_obj) {
				if (empty($value_obj->value) || $value_obj->value==='<mark></mark>' || $value_obj->value===' ') {
					#continue;
					$ar_current_values_clean[] = ''; // $value_obj->key; // locator encoded as json
				}else{
					$ar_current_values_clean[] = $value_obj->value;
				}
			}
			$value = implode($divisor, $ar_current_values_clean);

			// search_list_add . Add custom resolved values from same section. For example, add municipality for resolve a name ambiguity
				if ($search_list_add!==false) {
					$ar_dd_value = [];
					foreach ($search_list_add as $add_tipo) {
						$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($add_tipo,true);
						$component 		= component_common::get_instance($modelo_name,
																		 $add_tipo,
																		 $current_locator->section_id,
																		 'list',
																		 $lang,
																		 $current_locator->section_tipo);
						$current_value = strip_tags( $component->get_valor(DEDALO_DATA_LANG) );
						if (!empty($current_value)) {
							$ar_dd_value[] = $current_value;
						}
					}
					if (!empty($ar_dd_value)) {
						$value .= $divisor . implode($divisor, $ar_dd_value); // Add string to existing value
					}
				}

			#$ar_values[$current_locator_json] = $value;
			$value_obj = new stdClass();
				$value_obj->value 	= $current_locator;
				$value_obj->label 	= $value;
			$ar_values[] = $value_obj;
		}

		if ($format==='array') {
			$valor = $ar_values;
		}else{
			#$valor = implode($divisor, $ar_values);
			$ar_labels = array_map(function($element){
				return $element->label;
			}, $ar_values);
			$valor = implode($divisor, $ar_labels);
		}
		#dump($valor, ' valor ++ '.to_string($lang));
		#$this->valor = $valor;

		return $valor;
	}//end get valor



	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id) {

		if (empty($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}

		$valor_export = $this->get_valor($lang);
		$valor_export = br2nl($valor_export);

		return $valor_export;


		/* REMOVED 14-10-2019 (Unified with component_relation_common using 'get_valor') (!)
		if (empty($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
			$dato = $this->get_dato();
		}

		$propiedades = $this->get_propiedades();


		// TERMINOS_RELACIONADOS . Obtenemos los terminos relacionados del componente actual
			$ar_terminos_relacionados = (array)$this->RecordObj_dd->get_relaciones();


		// FIELDS
			$fields=array();
			foreach ($ar_terminos_relacionados as $key => $ar_value) {
				foreach ($ar_value as $current_tipo) {

					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
					if (strpos($modelo_name, 'component_')!==false) {
						$fields[] = $current_tipo;
					}
				}
			}

		$ar_resolved=array();
		foreach( (array)$dato as $key => $value) {

			$section_tipo 	= $value->section_tipo;
			$section_id 	= $value->section_id;

			if(isset($propiedades->source->search)){
				foreach ($propiedades->source->search as $current_search) {
					if($current_search->section_tipo === $section_tipo){
						$ar_componets_related =  $current_search->components;
					}
				}
			}

			foreach ($fields as $current_tipo) {

				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
				$component 		= component_common::get_instance($modelo_name,
																 $current_tipo,
																 $section_id,
																 'list',
																 $lang,
																 $section_tipo);
				$current_value_export = $component->get_valor_export( null, $lang, $quotes, $add_id );

				$item = new stdClass();
					$item->section_id 			= $section_id;
					$item->component_tipo 		= $current_tipo;
					$item->section_tipo 		= $section_tipo;
					$item->from_section_tipo 	= $this->section_tipo;
					$item->from_component_tipo 	= $this->tipo;
					$item->model 				= $modelo_name;
					$item->value 				= $current_value_export;

				$ar_resolved[] = $item;
			}
		}//end foreach( (array)$dato as $key => $value)
		#dump($dato, ' dato ++ '.to_string($this->tipo));
		#dump($ar_resolved, ' ar_resolved ++ '.to_string($this->tipo));

		$valor_export = $ar_resolved;


		return $valor_export; */
	}//end get_valor_export



	/**
	* GET_TIPO_TO_SEARCH
	* Locate in structure TR the component tipo to search
	* @return string $tipo_to_search
	*/
	public function get_tipo_to_search($options=null) {

		if(isset($this->tipo_to_search)) {
			return $this->tipo_to_search;
		}

		$propiedades 	 = $this->get_propiedades();

		if(isset($propiedades->source->search)){
				foreach ($propiedades->source->search as $current_search) {
					if($current_search->type === "internal"){
						$ar_terminoID_by_modelo_name =  $current_search->components;
					}
				}
			}else{
				$ar_terminoID_by_modelo_name = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($this->tipo, 'component_', 'termino_relacionado');
			}

			#dump($ar_terminoID_by_modelo_name, ' ar_terminoID_by_modelo_name '.$this->tipo.' ');
		$tipo_to_search = reset($ar_terminoID_by_modelo_name);

		if (!isset($tipo_to_search)) {
			throw new Exception("Error Processing Request. Inconsistency detect. This component need related component to search always", 1);
		}

		// Fix value
			$this->tipo_to_search = $tipo_to_search;

		return $tipo_to_search;
	}//end get_tipo_to_search



	/**
	* AUTOCOMPLETE_SEARCH2
	* @return array $ar_result
	*//*
	public function autocomplete_search2($search_query_object, $divisor=', ') {

		#$request_options = new stdClass();
		#	$request_options->q 	 			= $string_to_search;
		#	$request_options->limit  			= $max_results;
		#	$request_options->offset 			= 0;
		#	$request_options->logical_operator 	= $logical_operator;

		# Remove option of sub_select_by_id (not work on left joins)
		$search_query_object->allow_sub_select_by_id = false;
		# Avoid auto add filter by user projects in search
		if (!property_exists($search_query_object,'skip_projects_filter')) {
			$search_query_object->skip_projects_filter 	= true;
		}


		if(SHOW_DEBUG===true) {
			debug_log(__METHOD__." search_query_object - modo:$this->modo - ".json_encode($search_query_object, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), logger::DEBUG);
		}

		$search_development2 = new search_development2($search_query_object);
		$rows_data 		 	 = $search_development2->search();
			#dump($rows_data, ' rows_data ++ '.to_string());

		$propiedades 	 = $this->get_propiedades();
		$search_list_add = isset($propiedades->search_list_add) ? $propiedades->search_list_add : false;
			#dump($propiedades, ' propiedades ++ '.to_string());

		$components_with_relations = component_relation_common::get_components_with_relations();

		$ar_result = [];
		foreach ($rows_data->ar_records as $key => $row) {
			#dump($row, ' row ++ '.to_string());

			$locator = new locator();
				$locator->set_section_tipo($row->section_tipo);
				$locator->set_section_id($row->section_id);
				$locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator->set_from_component_tipo($this->tipo);

			$locator_json = json_encode($locator);

			# Join all fields except 2 first fixed (section_id, section_tipo)
			$ar_full_label = [];
			foreach ($row as $key => $value) {
				if ($key==='section_id' || $key==='section_tipo') continue;
				if(!empty($value)) {

					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($key,true);
					if (in_array($modelo_name, $components_with_relations) || $modelo_name==='component_text_area') {
						// Resolve value with component
						$value = $modelo_name::render_list_value($value, $key, $row->section_id, 'list', DEDALO_DATA_LANG, $row->section_tipo, $row->section_id, null, null);
					}else{
						// Extract value from row data
						#dump($value, ' value ++ '.to_string());
						$value = component_common::get_value_with_fallback_from_dato_full( $value, $mark=false );

					}

					#$value = to_string($value);
					if (is_string($value)) {
						$value = strip_tags($value);
					}else{
						$value = to_string($value); //gettype($value);
					}
					$ar_full_label[] = $value;
				}
			}

			$value = implode($divisor, $ar_full_label);

			// Add custom resolved values from same section. For example, add municipality for resolve a name ambiguity
			if ($search_list_add!==false) {
				$ar_dd_value = [];
				foreach ($search_list_add as $add_tipo) {
					$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($add_tipo,true);
					$component 		= component_common::get_instance($modelo_name,
																	 $add_tipo,
																	 $row->section_id,
																	 'list',
																	 DEDALO_DATA_LANG,
																	 $row->section_tipo);
					$current_value = strip_tags( $component->get_valor(DEDALO_DATA_LANG) );
					if (!empty($current_value)) {
						$ar_dd_value[] = $current_value;
					}
				}
				if (!empty($ar_dd_value)) {
					$value .= $divisor . implode($divisor, $ar_dd_value); // Add string to existing value
				}
			}

			$value_obj = new stdClass();
				$value_obj->value = $value;
				$value_obj->label = $value;
				$value_obj->key   = $locator_json;

			$ar_result[] = $value_obj;
		}


		return (array)$ar_result;
	}//end autocomplete_search2
	*/



	/**
	* GET_SEARCH_SUBQUERY
	* Used by autocomplete_search
	* @see autocomplete_search
	* @return array
	*/
	public static function get_search_subquery($field, $string_to_search) {

		$ar_subquery = array();

		// When key 'search' is defined, use it as search values. Else use normal default values. ar_search : set always as array
			if (isset($field->search)) {
				# subquery_type = 'with_reference';
				$ar_search 		= (array)$field->search;
				$search_in 		= $field->component_tipo.'_array_elements'."->>'section_id'";
				#$search_in 		= $field->component_tipo.''."->>'section_id'";
			}else{
				# subquery_type = 'default';
				$ar_search 		= array($field);
				$search_in 		= 'section_id::text';
			}

		// Iterate fields
			foreach ($ar_search as $search_field) {

				# Select elements
				$current_section_tipo   = $search_field->section_tipo;
				$current_component_tipo = $search_field->component_tipo;

				#$RecordObj_dd = new RecordObj_dd($current_component_tipo);
				#$current_lang = $RecordObj_dd->get_traducible()!=='si' ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;
				$search_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);

				# COMPONENTS_WITH_REFERENCES case like autocomplete, select, etc..
				$search_query = array();
				if(in_array($search_modelo_name, component_relation_common::get_components_with_relations())) {
					$search_query 	= (array)component_autocomplete::get_search_subquery($search_field, $string_to_search);
					$subquery_type 	= 'with_references';
				}else{
					$search_query[] = $search_modelo_name::get_search_query('datos', $current_component_tipo, 'dato', 'all', $string_to_search);
					$subquery_type 	= '';
				}

				#$bracket 	  = ($search_modelo_name==='component_input_text') ? '[' : '';
				#$search_query = "f_unaccent(a.datos#>>'{components, $current_component_tipo, dato}') ILIKE f_unaccent('%{$bracket}\"{$string_to_search}%')"; # Force custom search instead standar ?
				#error_log($search_query); continue;
				foreach ($search_query as $current_query) {
					$options = new stdClass();
						$options->search_in 	 		= $search_in;
						$options->search_tipo 	 		= $current_component_tipo;
						$options->search_section_tipo 	= $current_section_tipo;
						$options->matrix_table 	 		= common::get_matrix_table_from_tipo( $current_section_tipo );
						$options->search_query 	 		= $current_query;
						$options->subquery_type 		= $subquery_type;
					$subquery = search::get_subquery($options);
					$ar_subquery[] = $subquery;
				}
			}

		return $ar_subquery;
	}//end get_search_subquery



	/**
	* GET_VALOR_LANG
	* Return the main component lang
	* If the component need change this langs (selects, radiobuttons...) overwritte this function
	* @return string $lang
	*/
	public function get_valor_lang() {

		$relacionados = (array)$this->RecordObj_dd->get_relaciones();
		if(empty($relacionados)){
			return $this->lang;
		}

		$termonioID_related = array_values($relacionados[0])[0];
		$RecordObj_dd 		= new RecordObj_dd($termonioID_related);

		$lang = ($RecordObj_dd->get_traducible()==='no') ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;


		return $lang;
	}//end get_valor_lang



	/**
	* CREATE_NEW_AUTOCOMPLETE_RECORD
	* Insert a new record on target section, set projects filter heritage, defdaults and text ar_data
	* Return locator object of new created section
	* @param int $parent . section_id of current component_autocomplete
	* @param string $tipo . tipo of current component_autocomplete
	* @param string $target_section_tipo . tipo of section on create the record
	* @param string $section_tipo . section_tipo of current component_autocomplete
	* @param object $ar_data . Object with all component_tipo => value of component_autocomplete value elements
	* @return locator object. Locator of new created section to add in current component_autocomplete data
	*/
	public static function create_new_autocomplete_record($parent, $tipo, $target_section_tipo, $section_tipo, $ar_data) {

		// set from_component_tipo
			$from_component_tipo = $tipo;

		// projects heritage
			if ($section_tipo!==DEDALO_SECTION_PROJECTS_TIPO) {
				# All except main section Projects
				$source_ar_filter = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, 'component_filter', true, true); //$section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=false
				if (!isset($source_ar_filter[0])) {
					if(SHOW_DEBUG===true) {
						throw new Exception("Error Processing Request. component_filter is not defined! ($section_tipo)", 1);
					}
					return "Error: component_filter is not defined!";
				}
				$source_component_filter = component_common::get_instance('component_filter',
																		  $source_ar_filter[0],
																		  $parent,
																		  'edit',
																		  DEDALO_DATA_NOLAN,
																		  $section_tipo);
				$source_component_filter_dato = $source_component_filter->get_dato();
					#dump($source_component_filter_dato, ' source_component_filter_dato'.to_string());die();
			}

		// section : Create a new section
			$section 	= section::get_instance(null,$target_section_tipo);
			$section_id = $section->Save();

		// filter : Set heritage of projects
			if ($section_tipo!==DEDALO_SECTION_PROJECTS_TIPO) {
				# All except main section Projects
				$target_ar_filter  = section::get_ar_children_tipo_by_modelo_name_in_section($target_section_tipo, 'component_filter', true, true);
				if (!isset($target_ar_filter[0])) {
					if(SHOW_DEBUG===true) {
						throw new Exception("Error Processing Request. target component_filter is not defined! ($target_section_tipo)", 1);
					}
					return "Error: target component_filter is not defined!";
				}
				$target_component_filter = component_common::get_instance('component_filter',
																		  $target_ar_filter[0],
																		  $section_id,
																		  'list', // 'list' mode avoid autosave default project
																		  DEDALO_DATA_NOLAN,
																		  $target_section_tipo);
				$target_component_filter->set_dato($source_component_filter_dato);
				$target_component_filter->Save();
			}

		// component_autocomplete
			$component_autocomplete 	= component_common::get_instance('component_autocomplete',
																		  $tipo,
																		  $section_id,
																		  'edit',
																		  DEDALO_DATA_NOLAN,
																		  $section_tipo);

		// propiedades
			$propiedades = $component_autocomplete->get_propiedades();
			if (!empty($propiedades)) {

				if (isset($propiedades->filtered_by)) foreach($propiedades->filtered_by as $current_tipo => $current_value) {

					$current_lang = DEDALO_DATA_LANG;
					$RecordObj_dd = new RecordObj_dd($current_tipo);
					if ($RecordObj_dd->get_traducible()==='no') {
						$current_lang = DEDALO_DATA_NOLAN;
					}

					$curren_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
					$component 			= component_common::get_instance($curren_modelo_name,
																		$current_tipo,
																		$section_id,
																		'edit',
																		$current_lang,
																		$target_section_tipo);
					$component->set_dato($current_value);
					$component->Save();

					debug_log(__METHOD__." Updated target section component $current_tipo [$curren_modelo_name] to ".to_string($current_value), logger::DEBUG);
				}
			}
			#dump($propiedades, ' propiedades');	die("section_id: $section_id B");

		// components
			# Format:
			# value: stdClass Object
			# (
			#    [rsc85] => a
			#    [rsc86] => b
			# )
			#
			foreach ($ar_data as $current_tipo => $current_value) {

				$current_lang = DEDALO_DATA_LANG;
				$RecordObj_dd = new RecordObj_dd($current_tipo);
				if ($RecordObj_dd->get_traducible()==='no') {
					$current_lang = DEDALO_DATA_NOLAN;
				}

				$curren_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
				$component = component_common::get_instance($curren_modelo_name,
															$current_tipo,
															$section_id,
															'edit',
															$current_lang,
															$target_section_tipo);
				$component->set_dato( $current_value );
				$component->Save();
			}

		// locator . return locator object of created section
			$locator = new locator();
				$locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator->set_section_id($section_id);
				$locator->set_section_tipo($target_section_tipo);
				$locator->set_from_component_tipo($from_component_tipo);
					#dump($locator,'locator');


		return $locator;
	}//end create_new_autocomplete_record



	/**
	* IMPORT_PLAIN_VALUE (IN PROGRESS)
	* @return
	*/
	public function import_plain_value( $value ) {

		return false;


		if($this->tipo!='rsc49') return false;

		$target_section_tipo = common::get_ar_related_by_model('section', $this->tipo);

		# RELACIONES : Search and add relations to current component
		$relaciones = (array)$this->RecordObj_dd->get_relaciones();
			#dump($relaciones,'$relaciones');

		$ar_related = array();
		foreach ($relaciones as $ar_rel_value) foreach ($ar_rel_value as $current_tipo) {
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
			if ($modelo_name==='section') {
				$target_section_tipo = $current_tipo;
			}else{
				$ar_related[$current_tipo] = $modelo_name;
			}
		}

		// Unify value format as array
			$ar_value = (strpos($value,',')!==false) ? explode(',', $value) : array($value);
				dump($ar_value, ' $ar_value ++ '.to_string());


		#
		# SEARCH FOR EXISTING ITEMS
			/*
			#
			# FILTER
			$filter_by_search = new stdClass();
				$i=0;foreach ($ar_related as $related_tipo => $related_modelo_name) {
					$filter_by_search->$related_tipo = trim($ar_value[$i]);
				$i++;}

					dump($filter_by_search, ' $filter_by_search ++ '.to_string()); #die();
			#
			# OPERATORS
			$operators = new stdClass();

				$comparison_operator = new stdClass();
					$i=0;foreach ($ar_related as $related_tipo => $related_modelo_name) {
						$comparison_operator->$related_tipo = 'ILIKE';
					$i++;}

				$operators->comparison_operator = $comparison_operator;

				$logical_operator = new stdClass();
					$i=0;foreach ($ar_related as $related_tipo => $related_modelo_name) {
						$logical_operator->$related_tipo = 'AND';
					$i++;}

				$operators->logical_operator = $logical_operator;

			# OPTIONS
			$options = new stdClass();
				$options->section_tipo  			 = $target_section_tipo;
				$options->filter_by_search 			 = $filter_by_search;
				$options->operators 			 	 = $operators;
				$options->layout_map  				 = array();
				$options->modo  					 = 'edit';
				$options->limit 					 = false; # IMPORTANT : No limit is applicated to portal list. All records are viewed always
				$options->search_options_session_key = 'import_plain_value';

			$rows_data = search::get_records_data($options);
				dump($rows_data, ' rows_data ++ '.to_string());
			*/

		return true;
	}//end import_plain_value



	/**
	* GET_ORDER_BY_LOCATOR
	* OVERWRITE COMPONENT COMMON METHOD
	* @return bool
	*/
	public static function get_order_by_locator() {

		return true;
	}//end get_order_by_locator



	/**
	* SET_DATO_FROM_CSV
	* Receive a plain text value from csv file and set this value as dato.
	* @param object $data
	* @return bool
	*//*
	public function set_dato_from_csv( $data ) {

		$value 					= $data->value;
		$target_section_tipo 	= $data->target_section_tipo;
		$target_component_tipo 	= $data->target_component_tipo;

		$target_component_model = RecordObj_dd::get_modelo_name_by_tipo($target_component_tipo, true);

		$ection_id_from_value = component_common::get_section_id_from_value( $value, $target_section_tipo, $target_component_tipo );
			dump($ection_id_from_value, ' section_id_from_value ++ '.to_string());


		$this->set_dato();


		return true;
	}//end set_dato_from_csv
	*/



	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-save its data
	* Note that the first action is always load dato to avoid save empty content
	* @see class.tool_update_cache.php
	* @return bool
	*/
	public function regenerate_component() {

		# Custom propiedades external dato
		$propiedades = $this->get_propiedades();

		# Force loads dato always !IMPORTANT
		$this->get_dato();

		debug_log(__METHOD__." Ignored regenerate action in this component. USE generate_relations_table_data TO REGENERATE RELATIONS ".to_string($this->tipo), logger::WARNING);

		if(empty($dato)) return true;

		# Save component data
		#$this->Save();

		return true;
	}//end regenerate_component



	/**
	* UPDATE_DATO_VERSION
	* @return object $response
	*/
	public static function update_dato_version($request_options) {

		$options = new stdClass();
			$options->update_version 	= null;
			$options->dato_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version = $options->update_version;
			$dato_unchanged = $options->dato_unchanged;
			$reference_id 	= $options->reference_id;


		$update_version = implode(".", $update_version);

		switch ($update_version) {
			case '4.8.0':

				if ($options->context==='update_component_dato') {
					# Current component is already get and set dato with component_relation_common (in "relations")
					# We need recover here the old dato from section->components->tipo->dato
					# This context is different to time machine update dato
					$section  		= section::get_instance($options->section_id, $options->section_tipo);
					$dato_unchanged = $section->get_component_dato($options->tipo, DEDALO_DATA_NOLAN, $lang_fallback=false);
				}

				# Compatibility old dedalo instalations
				if (!empty($dato_unchanged) && is_array($dato_unchanged)) {

					$ar_locators = array();
					foreach ((array)$dato_unchanged as $key => $current_locator) {
						$locator = new locator();
							$locator->set_section_tipo($current_locator->section_tipo);
							$locator->set_section_id($current_locator->section_id);
							$locator->set_type(DEDALO_RELATION_TYPE_LINK);
							$locator->set_from_component_tipo($options->tipo);
						$ar_locators[] = $locator;
					}//end foreach ((array)$dato_unchanged as $key => $clocator)

					$new_dato = (array)$ar_locators;

					$response = new stdClass();
						$response->result   = 1;
						$response->new_dato = $new_dato;
						$response->msg = "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
					return $response;

				}else{

					$response = new stdClass();
						$response->result = 2;
						$response->msg = "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
					return $response;
				}
				break;

			case '4.9.0':
				# Remember DELETE ALL OLD COMPONENT DATO (inside section->components->tipo) !!!!!!!!!!!!!!!!
				throw new Exception("Error Processing Request. Remember DELETE ALL OLD COMPONENT DATO (inside section->components->tipo)", 1);
				# PENDING TO DO !!
				break;
		}
	}//end update_dato_version



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

		// force recalculate for each lang
			$this->valor = null;
			$this->set_lang($lang);

		// get_valor : ($lang=DEDALO_DATA_LANG, $format='string', $ar_related_terms=false, $divisor='<br> ')
		$value = $this->get_valor($lang, 'array');

		$diffusion_value_clean = array_map(function($item){
			return strip_tags($item->label);
		}, $value);

		$diffusion_value = implode(' | ', $diffusion_value_clean);

		return (string)$diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_DIFFUSION_DATO
	* @return string $diffusion_value
	*/
	public function get_diffusion_dato() {

		$dato = $this->get_dato();
		if (is_array($dato)) {
			$ar_id =array();
			foreach ($dato as $current_locator) {
				$ar_id[] = $current_locator->section_id;
			}
			$final_dato = $ar_id;
		}
		$diffusion_value = json_encode($final_dato);

		return (string)$diffusion_value;
	}//end get_diffusion_dato



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


		$result = $component->get_html();


		return $result;
	}//end render_list_value



	/**
	* GET_COMPONENT_INFO
	* @return object | json string $component_info
	*/
	public function get_component_info($format='json') {

		$component_info_obj = parent::get_component_info(false);

		// external mode check
			$propiedades = $this->get_propiedades();
			if(isset($propiedades->source->search)){

				$component_info_obj->external_data = [];

				foreach ($propiedades->source->search as $current_search) {
					if ($current_search->type === 'external'){

						$external_section_tipo = $current_search->section_tipo;
						$current_recordObjdd = new RecordObj_dd($external_section_tipo);
						$external_section_properties = $current_recordObjdd->get_propiedades(true);

						if (isset($external_section_properties->external_data)) {

							$external_data = $external_section_properties->external_data;
							$external_data->section_tipo = $external_section_tipo;

							$component_info_obj->external_data[] = $external_data;
						}
					}
				}
			}

			if ($format === 'json') {
				$component_info =  json_encode($component_info_obj);
			}else{
				$component_info = $component_info_obj;
			}

		return $component_info;
	}//end get_component_info



}// component_autocomplete
