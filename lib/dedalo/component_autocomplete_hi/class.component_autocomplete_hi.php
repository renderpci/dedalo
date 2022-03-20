<?php
/*
* COMPONENT_AUTOCOMPLETE_HI
* Manage thesaurus relations (replaces component_autocomplete_ts)
*
*/
class component_autocomplete_hi extends component_relation_common {


	# relation_type
	protected $relation_type = DEDALO_RELATION_TYPE_LINK;

	# test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');

	# Array of related terms in structure (one or more)
	protected $ar_terminos_relacionados;

	# referenced component tipo
	public $ar_referenced_tipo;

	# Used by get_value (avoid recalculate value on every call)
	private $ar_valor_resolved;

	# component_relations_search . Locator's array of current component parents used for search only
	protected $component_relations_search;



	/**
	* GET VALOR
	* Get resolved string representation of current tesauro value
	*/
	public function get_valor($lang=DEDALO_DATA_LANG, $format='string', $separator='<br>') {

		// load data
			$dato = $this->get_dato();
			if ( empty($dato) ) {
				return ($format==='array') ? [] : '';
			}

		// check format
			if(!is_array($dato)) {
				return "Sorry, type:" .gettype($dato). " not supported yet (Only array format)";
			}
		
		// lang never must be DEDALO_DATA_NOLAN
			if ($lang===DEDALO_DATA_NOLAN) {
				$lang = DEDALO_DATA_LANG; // Force current lang as lang
			}

		// properties
			$propiedades 	= $this->get_propiedades();
			$show_parents 	= (isset($propiedades->value_with_parents) && $propiedades->value_with_parents===true) ? true : false;
		
		// dato iterate	and resolve each locator
			$ar_valor = array();
			foreach ($dato as $key => $current_locator) {

				// params: $locator, $lang=DEDALO_DATA_LANG, $section_tipo, $show_parents=false, $ar_componets_related=false, $divisor=false
				$current_valor = component_relation_common::get_locator_value($current_locator, $lang, $show_parents);
				
				$current_locator_string 			= json_encode($current_locator);
				$ar_valor[$current_locator_string]  = $current_valor;
			}//end foreach ($dato as $key => $current_locator)

		// set value based on format
			$valor = ($format==='array')
				? $ar_valor
				: implode($separator, $ar_valor);
		

		return $valor;
	}//end get_valor



	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null ) {

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
	* @return array $relations_search_value
	* Array of locators calculated with thesaurus parents of current section and used only for search
	*/
	public function get_relations_search_value() {

		$relations_search_value = false;

		$dato = $this->get_dato();
		if (!empty($dato)) {

			$relations_search_value = [];

			foreach ((array)$dato as $key => $current_locator) {

				$section_id 	= $current_locator->section_id;
				$section_tipo 	= $current_locator->section_tipo;

				$parents_recursive = component_relation_parent::get_parents_recursive($section_id, $section_tipo, $skip_root=true, $is_recursion=false);
					#dump($parents_recursive, ' parents_recursive ++ '."$section_id, $section_tipo");
				foreach ($parents_recursive as $key => $parent_locator) {

					$locator = new locator();
						$locator->set_section_tipo($parent_locator->section_tipo);
						$locator->set_section_id($parent_locator->section_id);
						$locator->set_from_component_tipo($this->tipo);
						$locator->set_type($this->relation_type); // mandatory and equal as component dato relation_type

					if (!in_array($locator, $relations_search_value)) {
						$relations_search_value[] = $locator;
					}
				}
			}
		}

		return $relations_search_value;
	}//end get_relations_search_value



	/**
	* GET_TERMINOID_BY_LOCATOR
	* @param object $locator
	* @return string $terminoID
	*/
	public static function get_terminoID_by_locator( $locator ) {

		if(!isset($locator->section_tipo) || !isset($locator->section_id)) {
			dump($locator, ' locator ++ '.to_string());
			debug_log(__METHOD__." Error on get terminoID_by_locator from locator: ".to_string($locator), logger::DEBUG);
			return '';
		}
		$section_tipo = $locator->section_tipo;
		$section_id   = $locator->section_id;
		$terminoID 	  = substr($section_tipo,0,strlen($section_tipo)-1).$section_id;

		return (string)$terminoID;
	}//end get_terminoID_by_locator



	/**
	* GET_SOURCE_MODE
	* @return string|null
	*/
	public function get_source_mode() {

		# COMPONENT PROPIEDADES VAR
		$propiedades = $this->get_propiedades();

		if ( isset($propiedades->jer_tipo) ) {
			# TEMPORAL
			debug_log(__METHOD__." Deprecated source mode format. Please use new format like 'propiedades->source->mode' ".to_string(), logger::ERROR);
			return 'jer_tipo';
		}else if (isset($propiedades->source->mode)) {
			# New source format
			return $propiedades->source->mode;
		}else{
			debug_log(__METHOD__." Not defined source->mode (propiedades->source->mode)", logger::ERROR);
			return '';
		}
	}//end get_source_mode



	/**
	* GER_AR_LINK_FIELDS
	*/
	public function ger_ar_link_fields(){
		$ar_link_fields = array();

		$tipo 			= $this->get_tipo();
		$RecordObj_dd 	= new RecordObj_dd($tipo);
		$relaciones 	= $RecordObj_dd->get_relaciones();

		if (!empty($relaciones) && is_array($relaciones)) foreach($relaciones as $ar_relaciones) {

			foreach($ar_relaciones as $tipo_modelo => $current_link_fields) {
				#dump($ar_referenced_tipo,'$ar_referenced_tipo');
				$modelo_name = RecordObj_dd::get_termino_by_tipo($tipo_modelo,null,true);

				$ar_link_fields[$modelo_name] = $current_link_fields;
			}
		}
		//dump($ar_link_fields,'$ar_link_fields');

		return $ar_link_fields;
	}//END ger_ar_link_fields



	/**
	* GET_HIERARCHY_SECTIONS_FROM_TYPES
	* Calculate hierarchy sections (target section tipo) of types requested, like es1,fr1,us1 from type 2 (Toponymy)
	* @return array $hierarchy_sections_from_types
	*/
	public static function get_hierarchy_sections_from_types( $hierarchy_types ) {

		$hierarchy_sections_from_types = array();


		$hierarchy_section_tipo = DEDALO_HIERARCHY_SECTION_TIPO;
		$hierarchy_name_tipo 	= DEDALO_HIERARCHY_TERM_TIPO;


		$ar_filter = [];
		# Active
		$active_locator = new locator();
			$active_locator->set_section_id(NUMERICAL_MATRIX_VALUE_YES);
			$active_locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
			$active_locator->set_type(DEDALO_RELATION_TYPE_LINK);
			$active_locator->set_from_component_tipo(DEDALO_HIERARCHY_ACTIVE_TIPO);

		$ar_filter[] = '{
				"q": '.json_encode(json_encode($active_locator)).',
				"path": [
					{
						"section_tipo": "'.$hierarchy_section_tipo.'",
						"component_tipo": "'.DEDALO_HIERARCHY_ACTIVE_TIPO.'",
						"modelo": "'.RecordObj_dd::get_modelo_name_by_tipo(DEDALO_HIERARCHY_ACTIVE_TIPO,true).'",
						"name": "Active"
					}
				]
			}';
		# Typology
		foreach ((array)$hierarchy_types as $key => $value) {

			$typology_locator = new locator();
				$typology_locator->set_section_id($value);
				$typology_locator->set_section_tipo(DEDALO_HIERARCHY_TYPES_SECTION_TIPO);
				$typology_locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$typology_locator->set_from_component_tipo(DEDALO_HIERARCHY_TIPOLOGY_TIPO);

			$ar_filter[] = '{
				"q": '.json_encode(json_encode($typology_locator)).',
				"path": [
					{
						"section_tipo": "hierarchy1",
						"component_tipo": "hierarchy9",
						"modelo": "component_select",
						"name": "Typology"
					}
				]
			}';
		}//end foreach ((array)$hierarchy_types as $key => $value)

		$filter = implode(',',$ar_filter);

		$search_query_object = json_decode('
			{
			  "id": "get_hierarchy_sections_from_types",
			  "section_tipo": "'.$hierarchy_section_tipo.'",
			  "skip_projects_filter":"true",
			  "limit":0,
			  "filter": {
				"$and": [
				  '.$filter.'
				]
			  },
			  "select": [
				{
				  "path": [
					{
					  "section_tipo": "'.$hierarchy_section_tipo.'",
					  "component_tipo": "'.$hierarchy_name_tipo.'",
					  "modelo": "'.RecordObj_dd::get_modelo_name_by_tipo($hierarchy_name_tipo,true).'",
					  "name": "Hierarchy name",
					  "lang": "all"
					}
				  ]
				},
				{
				  "path": [
					{
					  "section_tipo": "'.$hierarchy_section_tipo.'",
					  "component_tipo": "'.DEDALO_HIERARCHY_TARGET_SECTION_TIPO.'",
					  "modelo": "'.RecordObj_dd::get_modelo_name_by_tipo($hierarchy_name_tipo,true).'",
					  "name": "Target thesaurus"
					}
				  ]
				}
			  ]
			}
		');
		#dump( json_encode($search_query_object, JSON_PRETTY_PRINT), ' search_query_object ++ '.to_string());
		#debug_log(__METHOD__."  ".json_encode($search_query_object, JSON_PRETTY_PRINT).to_string(), logger::DEBUG);

		$search_development2 = new search_development2($search_query_object);
		$result = $search_development2->search();
			#dump($result, ' result ++ '.to_string());

		/* OLD WAY
		foreach ((array)$hierarchy_types as $tipology_section_id) {

			#
			# HIERARCHIES OF CURRENT TIPO Like 'España' for tipology_section_id 2
			$search_hierarchies_options = area_thesaurus::get_options_for_search_hierarchies(DEDALO_HIERARCHY_TYPES_SECTION_TIPO, $tipology_section_id);
				#dump($search_hierarchies_options, ' search_hierarchies_options ++ '.to_string());
			# Calculate rows from database using search class like lists
			$hierarchies_rows_obj = search::get_records_data($search_hierarchies_options);
				#dump($hierarchies_rows_obj, ' hierarchies_rows_obj ++ '.to_string());
			foreach ($hierarchies_rows_obj->result as $key => $value) {
				$ar_value = reset($value);
				$target_section_tipo = json_decode($ar_value[DEDALO_HIERARCHY_TARGET_SECTION_TIPO]);
					#dump($ar_value, ' ar_value ++ current_section_id '.to_string($target_section_tipo));
					#dump($target_section_tipo, ' target_section_tipo ++ '.to_string());
				if (is_array($target_section_tipo)) {
					$hierarchy_sections_from_types[] = reset($target_section_tipo);
				}
			}
		}
		dump($hierarchy_sections_from_types, ' hierarchy_sections_from_types ++ '.to_string()); */

		$target_section_tipo = DEDALO_HIERARCHY_TARGET_SECTION_TIPO;
		foreach ($result->ar_records as $key => $row) {
			$hierarchy_sections_from_types[] = $row->{$target_section_tipo};
		}


		return (array)$hierarchy_sections_from_types;
	}//end get_hierarchy_sections_from_types



	/**
	* ADD_HIERARCHY_SECTIONS_FROM_TYPES
	* Merge resolved hierarchy_sections_from_types with received hierarchy_sections
	* and create an array unique
	* @return array $hierarchy_sections
	*/
	public static function add_hierarchy_sections_from_types($hierarchy_types, $hierarchy_sections=array()) {

		$hierarchy_sections = [];

		$hierarchy_sections_from_types = [];
		foreach ((array)$hierarchy_types as $current_type) {
			$sections_from_types = component_autocomplete_hi::get_hierarchy_sections_from_types( $current_type );
			$hierarchy_sections_from_types = array_merge($hierarchy_sections_from_types, $sections_from_types);
		}
		#dump($hierarchy_sections_from_types, ' hierarchy_sections_from_types ++ '.to_string($hierarchy_types)); #die();

		# Add hierarchy_sections_from_types
		foreach ($hierarchy_sections_from_types as $current_section_tipo) {
			if (!in_array($current_section_tipo, $hierarchy_sections)) {
				$hierarchy_sections[] = $current_section_tipo;
			}
		}

		# Add hierarchy_sections
		foreach ($hierarchy_sections as $current_section_tipo) {
			if (!in_array($current_section_tipo, $hierarchy_sections)) {
				$hierarchy_sections[] = $current_section_tipo;
			}
		}

		$hierarchy_sections = array_values($hierarchy_sections);


		return (array)$hierarchy_sections;
	}//end add_hierarchy_sections_from_types



	/**
	* BUILD_SEARCH_QUERY_OBJECT
	* @return object $search_query_object
	*/
	public static function build_search_query_object($request_options) {

		$options = new stdClass();
			$options->q 	 			= null;
			$options->limit  			= 40;
			$options->offset 			= 0;
			$options->lang 				= 'all';
			$options->logical_operator 	= '$or';
			$options->id 				= 'temp';
			$options->section_tipo		= []; // Normally hierarchy_sections
			$options->search_tipos 		= [DEDALO_THESAURUS_TERM_TIPO];
			$options->distinct_values	= false;
			$options->show_modelo_name 	= true;
			$options->filter_custom 	= null;
			$options->tipo				= null;
			$options->filter_items 		= false;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		# search_query_object (can be string or object)
		$search_query_object = new stdClass();
			$search_query_object->id 				= $options->id;
			$search_query_object->modo 				= 'list';
			$search_query_object->section_tipo 		= $options->section_tipo; // $hierarchy_sections;
			$search_query_object->limit 			= (int)$options->limit;
			$search_query_object->distinct_values 	= $options->distinct_values;

			// filter
				$search_query_object->filter = new stdClass();

				$search_tipos_op = count($options->search_tipos)>1 ? '$or' : '$and';
				foreach ($options->search_tipos as $current_search_tipo) {
					$filter_obj = new stdClass();
						$filter_obj->q 			= $options->q;
						$filter_obj->q_operator = null;
						$filter_obj->q_split 	= false;

							$path_obj = new stdClass();
								$path_obj->section_tipo 	= DEDALO_THESAURUS_SECTION_TIPO; // Fixed (is not important here)
								$path_obj->component_tipo 	= $current_search_tipo;
								$path_obj->modelo 			= 'component_input_text';
								$path_obj->name 			= 'Term';

						$filter_obj->path 		= [$path_obj];
						$filter_obj->lang 		= 'all';

					$search_query_object->filter->{$search_tipos_op}[] = $filter_obj;
				}//end foreach

				# propiedades filter_custom or hierarchy_terms constrain
				if (!empty($options->filter_custom)) {
					$op_and = '$and';
					$op_or 	= '$or';
					$group = new stdClass();
						$group->{$op_or} = [];
					foreach ((array)$options->filter_custom as $current_filter) {
						#$search_query_object->filter->{$op}[] = $current_filter;
						$group->{$op_or}[] = $current_filter;
					}
					$search_query_object->filter->{$op_and}[] = $group;
				}

			// select
				$search_query_object->select = [];

				foreach ($options->search_tipos as $current_search_tipo) {
					$select_obj = new stdClass();

					$path_obj = new stdClass();
						$path_obj->section_tipo 	= DEDALO_THESAURUS_SECTION_TIPO; // Fixed (is not important here)
						$path_obj->component_tipo 	= $current_search_tipo; //$term_tipo;
						$path_obj->modelo 			= 'component_input_text';
						$path_obj->name 			= 'Term';
						$path_obj->selector 		= 'valor';
						$path_obj->lang 			= 'all';
					$select_obj->path = [$path_obj];

					# Select add
					$search_query_object->select[] = $select_obj;
				}

				if($options->show_modelo_name===true) {
					$select_obj = new stdClass();

					$path_obj = new stdClass();
						$path_obj->section_tipo 	= DEDALO_THESAURUS_SECTION_TIPO;
						$path_obj->component_tipo 	= DEDALO_THESAURUS_RELATION_MODEL_TIPO;
						$path_obj->modelo 			= 'component_relation_model';
						$path_obj->name 			= 'Model';
					$select_obj->path = [$path_obj];

					# Select add (model)
					$search_query_object->select[] = $select_obj;
				}

		#dump( json_encode($search_query_object, JSON_PRETTY_PRINT) , ' search_query_object ++ '.to_string());

		return (object)$search_query_object;
	}//end build_search_query_object



	/**
	* GET_ORDER_BY_LOCATOR
	* OVERWRITE COMPONENT COMMON METHOD
	* @return bool
	*/
	public static function get_order_by_locator() {
		return true;
	}//end get_order_by_locator



	/**
	* GET_AR_FILTER_OPTIONS
	* Build an array of elements to show in options filter
	* Can be a list of sections form hierarchy, or a list of value=>label for general use
	* @return array $ar_filter_options
	*/
	public function get_ar_filter_options($type, $ar_value) {

		$ar_filter_options = array();

		switch ($type) {
			// Default is hierarchy use
			case 'hierarchy':
				foreach ((array)$ar_value as $hs_section_tipo) {

					$current_key	= $hs_section_tipo;
					$current_label	= RecordObj_dd::get_termino_by_tipo($hs_section_tipo, DEDALO_DATA_LANG, true, true) ?? '';
					$current_label	= strip_tags($current_label);
					if (empty($current_label)) {
						$current_label = $hs_section_tipo .' (!)';
					}

					$element = new stdClass();
						$element->key 	= $current_key;
						$element->label	= $current_label;

					$ar_filter_options[] = $element;
				}
				break;
			// Generic use compatible with old component_autocomplete
			case 'generic':
				foreach ($ar_value as $current_obj_value) {

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
					foreach ((array)$ar_list_of_values->result as $hs_value => $item) {

						$current_label 	= strip_tags($item->label);
						$current_key 	= json_encode($item->value);

						$element = new stdClass();
							$element->key 	= $current_key;
							$element->label = $current_label;

						$ar_filter_options[] = $element;
					}
				}
				break;
		}

		// Sort elements
		//asort($ar_filter_options, SORT_NATURAL);
		usort($ar_filter_options, function($a, $b){
			return strcmp($a->label, $b->label);
		});

		return $ar_filter_options;
	}//end get_ar_filter_options



	/**
	* GET_OPTIONS_TYPE
	* @return string $options_type
	*/
	public function get_options_type() {
		$propiedades = $this->get_propiedades();
		if(isset($propiedades->source->filter_by_list)) {
			$options_type = 'generic'; // Used with generic sections
		}else{
			$options_type = 'hierarchy'; // Used with hierarchical sections
		}

		return $options_type;
	}//end get_options_type



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

		// separator. (!) Note here that more than one value can be returned by this method. To avoid duplicity of ',' separator, use '-' as default
			$separator			= $option_obj->divisor ?? ' - ';
			$divisor_parents	= $option_obj->divisor_parents ?? ', ';

		// load dato
			$dato = $this->get_dato();
			if (empty($dato)) {
				return null;
			}

		if (empty($option_obj)) {
			
			// default case
			$diffusion_value = $this->get_valor($lang, 'string', $separator);

		}else{
			
			// properties options defined
			foreach ($option_obj as $key => $value) {
				if ($key==='divisor' || $key==='divisor_parents' ) continue;
							
				if ($key==='add_parents') {

					$show_parents = (bool)$value;

					// parents recursive resolve
						$ar_diffusion_value = [];
						foreach ($dato as $current_locator) {

							// self term plus parents.
							// $locator, $lang=DEDALO_DATA_LANG, $show_parents=false, $ar_componets_related=false, $divisor=', ', $include_self=true
								$ar_diffusion_value[] = component_relation_common::get_locator_value($current_locator, $lang, $show_parents, false, $divisor_parents);

							// // get_parents_recursive($section_id, $section_tipo, $skip_root=true, $is_recursion=false)
							// $ar_parents = component_relation_parent::get_parents_recursive($current_locator->section_id, $current_locator->section_tipo, true);
							// $ar_terms = [];
							// foreach ($ar_parents as $parent_locator) {
							// 	$term = ts_object::get_term_by_locator( $parent_locator, $lang, $from_cache=true );
							// 	if (!empty($term)) {
							// 		$ar_terms[] = $term;
							// 	}
							// }
							// if (!empty($ar_terms)) {
							// 	// $diffusion_value .= $separator . implode($separator, $ar_terms);
							// 	$ar_diffusion_value = array_merge($ar_diffusion_value, $ar_terms);
							// }
						}
					
					$diffusion_value = implode($separator, $ar_diffusion_value);				

				}else if ($key==='custom_parents') {

					$ar_diffusion_value = [];
					foreach ($dato as $current_locator) {

						$locator_terms = [];

						// self include. $locator, $lang=DEDALO_DATA_LANG, $show_parents=false, $ar_componets_related=false, $divisor=', ', $include_self=true
							$locator_terms[] = component_relation_common::get_locator_value($current_locator, $lang, false, false);

						// get_parents_recursive($section_id, $section_tipo, $skip_root=true, $is_recursion=false)
							$ar_parents = component_relation_parent::get_parents_recursive($current_locator->section_id, $current_locator->section_tipo, true);
							
						// iterate parents
							$stopped  = false;
							$ar_terms = [];
							foreach ($ar_parents as $parent_locator) {

								// parent_end_by_term_id. Uses a term_id as last valid parent
									if(isset($value->parent_end_by_term_id)){
										$current_term_id = $parent_locator->section_tipo.'_'.$parent_locator->section_id;
										if(in_array($current_term_id, $value->parent_end_by_term_id)){
											$stopped = true;
											break;
										}
									}

								// parent_end_by_model. Uses a model as last valid parent
									if(isset($value->parent_end_by_model)){
										$ar_tipo   = section::get_ar_children_tipo_by_modelo_name_in_section($parent_locator->section_tipo,['component_relation_model'],true, true, true, true);										
										$component = component_common::get_instance('component_relation_model',
																					 $ar_tipo[0],
																					 $parent_locator->section_id,
																					 'list',
																					 DEDALO_DATA_NOLAN,
																					 $parent_locator->section_tipo);
										$component_dato = $component->get_dato();
										if(isset($component_dato[0])){
											$current_term_id = $component_dato[0]->section_tipo.'_'.$component_dato[0]->section_id;
											if(in_array($current_term_id, $value->parent_end_by_model)){
												$stopped = true;
												break;
											}
										}
									}

									$term = ts_object::get_term_by_locator($parent_locator, $lang, $from_cache=true);
									if (!empty($term)) {
										$ar_terms[] = $term;
									}
							}

						// append whole or part of results when no empty
							if (!empty($ar_terms)) {
								
								// parents_splice. Selects a portion of the complete parents array
									if($stopped===false){
										if(isset($value->parents_splice)){
											$splice_values = is_array($value->parents_splice) ? $value->parents_splice : [$value->parents_splice];
											if (isset($splice_values[1])) {
												array_splice($ar_terms, $splice_values[0], $splice_values[1]);
											}else{
												array_splice($ar_terms, $splice_values[0]);
											}											
										}
									}
								// append terms
									$locator_terms = array_merge($locator_terms, $ar_terms);
							}

						// join locator terms and append
							$ar_diffusion_value[] = implode(', ', $locator_terms);

					}//end foreach ($dato as $current_locator)

					// join all locator values
						$diffusion_value = implode($separator, $ar_diffusion_value);

				}//end if ($key==='custom_parents')
			}//end foreach ($option_obj as $key => $value)
		}

		// clean untranslated tags (<mark>)
			$diffusion_value = strip_tags($diffusion_value);


		return (string)$diffusion_value;
	}//end get_diffusion_value



	### GET_LEGACY_MODEL



	/**
	* GET_POLITICAL_TOPONYMY
	* @return string $term
	*/
	public static function get_political_toponymy( $request_options ) {

		// options parse
			$options = new stdClass();
				$options->locator 	= null;
				$options->lang 		= DEDALO_DATA_LANG;
				$options->type 		= 'municipality';
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// sort vars
			$locator = $options->locator;
			$lang 	 = $options->lang;
			$type 	 = $options->type;

		// empty locator case
			if (empty($locator)) {
				return null;
			}

		// self option
			if ($options->type==='self') {

				// term plain without parents
					$term = ts_object::get_term_by_locator( $locator, $options->lang, true );

			}else{

				// section data of current locator
					$section_tipo 	= $options->locator->section_tipo;
					$section_id 	= $options->locator->section_id;

				// political_map
					$political_map 	= self::get_legacy_political_map($section_tipo);
					if(empty($political_map)){

						debug_log(__METHOD__." Empty political_map (ignored resolution by political_map for section: $section_tipo) ".to_string(), logger::WARNING);
						return null;

					}else{

						// current_map check
							$current_map = array_reduce($political_map, function($carry, $item) use($type){
								return $item->type===$type ? $item : $carry;
							});
							if (empty($current_map)) {
								debug_log(__METHOD__." Empty political_map type (ignored resolution by political_map for type: $options->type in section: $section_tipo) ".to_string(), logger::WARNING);
								return null;
							}
					}

				// component_model_tipo of current section
					$ar_component_model_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, ['component_relation_model'], $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true);
					$component_model_tipo 	 = reset($ar_component_model_tipo);
					if (empty($component_model_tipo)) {
						debug_log(__METHOD__." Empty section component_model_tipo. Please, review structure of section: '$section_tipo' and add a component_relation_model ) ".to_string(), logger::ERROR);
						return null;
					}

				// compare model
					$compare_model = function($section_tipo, $section_id, $component_model_tipo, $current_map) {

						// get model value
							$component_model 	= component_common::get_instance('component_relation_model',
																				 $component_model_tipo,
																				 $section_id,
																				 'list',
																				 DEDALO_DATA_NOLAN,
																				 $section_tipo);
							$model_dato 	= $component_model->get_dato();
							if (empty($model_dato)) {
								return false;
							}

							$model_locator 	= reset($model_dato);

						// check match 'section_tipo','section_id'
							$result = locator::compare_locators( $current_map, $model_locator, ['section_tipo','section_id'] );

						return $result;
					};

				// self term check
					if (true===$compare_model($section_tipo, $section_id, $component_model_tipo, $current_map)) {
						// term
							$term = ts_object::get_term_by_locator( $locator, $options->lang, true );
				// childrens check
					}else{
						// search in parents recursive
							$parents_recursive = component_relation_parent::get_parents_recursive($locator->section_id, $locator->section_tipo, true);
							foreach ($parents_recursive as $key => $current_parent_locator) {
								if (true===$compare_model($current_parent_locator->section_tipo, $current_parent_locator->section_id, $component_model_tipo, $current_map)) {
									// term
										$term = ts_object::get_term_by_locator( $current_parent_locator, $options->lang, true );
									break;
								}
							}
					}
			}

		// term
			$term = isset($term) ? strip_tags($term) : null;


		return $term;
	}//end get_political_toponymy



	/**
	* GET_legacy_POLITICAL_MAP
	* Return an array of political map models of each country
	* This is a legacy function for compatibility with old publication tables
	* and is NOT a future way of work
	* @return
	*/
	public static function get_legacy_political_map( $section_tipo ) {

		switch ($section_tipo) {
			# Spain
			case 'es1':
				# models
				$ar_models = [
					(object)['type' => 'country', 				'section_tipo' => 'es2', 'section_id' => '8868'],
					(object)['type' => 'autonomous_community', 	'section_tipo' => 'es2', 'section_id' => '8869'],
					(object)['type' => 'province', 				'section_tipo' => 'es2', 'section_id' => '8870'],
					(object)['type' => 'region', 				'section_tipo' => 'es2', 'section_id' => '8871'], // comarca
					(object)['type' => 'municipality', 			'section_tipo' => 'es2', 'section_id' => '8872']
				];
				break;
			# France
			case 'fr1':
				# models
				$ar_models = [
					(object)['type' => 'country', 				'section_tipo' => 'fr2', 'section_id' => '41189'],
					(object)['type' => 'autonomous_community'],
					(object)['type' => 'province', 				'section_tipo' => 'fr2', 'section_id' => '41190'],
					(object)['type' => 'region', 				'section_tipo' => 'fr2', 'section_id' => '41191'], // comarca
					(object)['type' => 'municipality', 			'section_tipo' => 'fr2', 'section_id' => '41192']
				];
				break;
			# Cuba
			case 'cu1':
				# models
				$ar_models = [
					(object)['type' => 'country', 				'section_tipo' => 'cu2', 'section_id' => '325'],
					(object)['type' => 'autonomous_community'],
					(object)['type' => 'province', 				'section_tipo' => 'cu2', 'section_id' => '326'],
					(object)['type' => 'region', 				'section_tipo' => 'cu2', 'section_id' => '329'], // comarca | reparto
					(object)['type' => 'municipality', 			'section_tipo' => 'cu2', 'section_id' => '327']
				];
				break;
			default:
				$ar_models = [];
				break;
		}


		return $ar_models;
	}//end get_legacy_political_map



	/**
	* GET_LEGACY_MODEL
	* @return object $model_obj
	*/
	public static function get_legacy_model( $locator, $lang=DEDALO_DATA_LANG ) {

		$parent 		= $locator->section_id;
		$section_tipo	= $locator->section_tipo;
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_THESAURUS_RELATION_MODEL_TIPO, true);
		$component 		= component_common::get_instance($modelo_name,
														 DEDALO_THESAURUS_RELATION_MODEL_TIPO,
														 $parent,
														 'list',
														 $lang,
														 $section_tipo);
		$dato  = (array)$component->get_dato();
		$value = $component->get_valor($lang);

		$model_obj = new stdClass();
			$model_obj->name 	= $value;
			$model_obj->locator = reset($dato);

		return $model_obj;
	}//end get_legacy_model



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @return object $query_object
	*/
	public static function resolve_query_object_sql($query_object) {

		#debug_log(__METHOD__." query_object ".to_string($query_object), logger::DEBUG);
		#if (is_string($query_object->q) && strpos($query_object->q,'{')===false ) {
		#	return null;
		#}

		# Parse query_object normally with relation common method
		$result_query_object = parent::resolve_query_object_sql($query_object);

		// q_operator
			$q_operator = $result_query_object->q_operator ?? null;

		# Clone and modify query_object for search in relations_search too
		$relation_search_obj = clone $result_query_object;
			$relation_search_obj->component_path = ['relations_search'];

		# Group the two query_object in a 'or' clause
		$operator = '$or';
		if ($q_operator==='!=') {
			$operator = '$and';
		}
		$group = new stdClass();
			$group->{$operator} = [$result_query_object,$relation_search_obj];


		return $group;
	}//end resolve_query_object_sql



}
?>
