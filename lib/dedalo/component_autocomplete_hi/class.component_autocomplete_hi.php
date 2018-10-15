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
	public function get_valor( $lang=DEDALO_DATA_LANG, $format='string', $separator='<br>' ) {
		
		$dato = $this->get_dato();

		if ( empty($dato) ) {
			if ($format==='array') {
				return array();
			}else{
				return '';
			}
		}

		if(!is_array($dato)) return "Sorry, type:" .gettype($dato). " not supported yet (Only array format)";
		
		if (isset($this->ar_valor_resolved)) {
			
			$ar_valor = $this->ar_valor_resolved;
		
		}else{

			# lang never must be DEDALO_DATA_NOLAN
			if ($lang===DEDALO_DATA_NOLAN) {
				$lang = DEDALO_DATA_LANG; // Force current lang as lang
			}

			# Propiedades
			$propiedades = $this->get_propiedades();
			$show_parents 	 = (isset($propiedades->value_with_parents) && $propiedades->value_with_parents===true) ? true : false;
			if(SHOW_DEBUG===true) {
				#dump($propiedades, ' propiedades ++ '.to_string());
				#dump($show_parents, ' show_parents ++ '.to_string());
				#$show_parents = false; 
			}			
			
	
			$ar_valor = array();
			foreach ($dato as $key => $current_locator) {
			
				# $locator, $lang=DEDALO_DATA_LANG, $section_tipo, $show_parents=false, $ar_componets_related=false, $divisor=false )
				$current_valor = component_relation_common::get_locator_value($current_locator, $lang, $show_parents);
				#dump($current_valor, ' current_valor ++ '.to_string()); break;

				#
				# REMOVE TAGS FROM NON TRANSLATED TERMS
				# $current_valor = strip_tags($current_valor);
				
				$current_locator_string 			= json_encode($current_locator);
				$ar_valor[$current_locator_string]  = $current_valor;

			}//end foreach ($dato as $key => $current_locator)

			$this->ar_valor_resolved = $ar_valor;
		}
		

		if ($format==='array') {
			$valor = $ar_valor;
		}else{
			$valor = implode($separator, $ar_valor);
		}

		return $valor;
	}//end get_valor



	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id ) {
		
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
				
				$parents_recursive = component_relation_parent::get_parents_recursive($section_id, $section_tipo, $skip_root=true);
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
	* GET_DATO_SEARCH
	* Generate an array prepared to search containing self and all parents
	* @return 
	*//*
	public function get_dato_search() {
		trigger_error( __METHOD__ . " DEPRECATED METHOD!");
		$dato_search=array();

		$dato = $this->get_dato();
		foreach ((array)$dato as $current_locator) {
			
			# self
			$dato_search[] 	= $current_locator;

			# parents
			$terminoID 		= self::get_terminoID_by_locator($current_locator);
			$RecordObj_ts 	= new RecordObj_ts($terminoID);
			$ar_parents 	= (array)$RecordObj_ts->get_ar_parents_of_this();
			foreach ($ar_parents as $current_terminoID) {
				
				$locator = self::convert_dato_to_locator($current_terminoID);
				if (!in_array($locator, $dato_search)) {
					$dato_search[] = $locator;
				}
			}
		}
		#dump($dato_search, ' dato_search1 ++ '.to_string());		

		return $dato_search;
	}//end get_dato_search
	*/



	/**
	* CONVERT_DATO_TO_LOCATOR
	* Convert old dato like 'es352' to standar locator like {"section_id":"es352","section_tipo":"es"}
	* Warning: this is a temporal locator (22-10-2015) and will be changed in tesaurized versions
	* @return object locator
	*//*
	public static function convert_dato_to_locator($old_dato) {
		trigger_error( __METHOD__ . " DEPRECATED METHOD!");
		if (is_object($old_dato)) {
			return $old_dato;	// unnecessary convert
		}
		if (is_array($old_dato) || !is_string($old_dato)) {			
			if(SHOW_DEBUG===true) {
				dump($dato, ' dato ++ '.to_string());
			}
			trigger_error("Ops.. dato is not valid for convert ");
			return $old_dato;
		}

		$prefix = RecordObj_dd::get_prefix_from_tipo($old_dato);

		$section_id 	= (string)str_replace($prefix, '', $old_dato);
		$section_tipo 	= (string)$prefix.'1';

		$locator = new locator();
			$locator->set_section_id($section_id);		
			$locator->set_section_tipo($section_tipo);
			#dump($locator, ' locator ++ '.to_string()); die();
		
		return (object)$locator;
	}//end convert_dato_to_locator */



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
	* FIRE_TREE_RESOLUTION
	*//*
	public static function get_tree_resolution($tipo) {

		$is_root = component_autocomplete_hi::is_root($tipo);
			#dump($is_root,'is_root for '.$tipo);

		# No calculate tree for root tipo
		if($is_root==true) return null;

		#unset($_SESSION['dedalo4']['config']['ar_recursive_childrens'][$tipo]);		
		
		if(isset($_SESSION['dedalo4']['config']['ar_recursive_childrens'][$tipo])) {

			$ar_recursive_childrens = $_SESSION['dedalo4']['config']['ar_recursive_childrens'][$tipo];
				#dump("returned values from session",'returned values from session');
		}else{

			# Buscamos TODOS los hijos recursivamente
			$RecordObj_ts 			= new RecordObj_ts($tipo);
			$ar_recursive_childrens = $RecordObj_ts->get_ar_recursive_childrens_of_this($tipo);
			# Store in php session for speed
			$_SESSION['dedalo4']['config']['ar_recursive_childrens'][$tipo] = $ar_recursive_childrens;
		}
		
		#dump($_SESSION['dedalo4']['config']['ar_recursive_childrens'][$tipo]);
		return $ar_recursive_childrens ;
	}
	*/



	/*
	public static function is_root($tipo) {

		$tipo_id = intval(substr($tipo, 2));
			#dump($tipo_id);
		if($tipo_id===1) {
			return true;
		}else{
			return false;
		}	
	}
	*/



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
	* AUTOCOMPLETE_HI_SEARCH
	* Used by trigger on ajax call
	* @param array ar_referenced_tipo like ['es1','fr1'] (parent where start to search)
	* @param string_to_search
	* @return array ar_result 
	*	Array format: id_matrix=>dato_string 
	*//*
	public static function autocomplete_hi_search__DEPRECATED($request_options) {
		if(SHOW_DEBUG===true) $start_time = start_time();
	
		$options = new stdClass();
			$options->hierarchy_types 		= null;
			$options->hierarchy_sections 	= null;
			$options->string_to_search 		= null;
			$options->max_results 			= 40;
			$options->show_modelo_name 		= false;
			$options->show_parent_name 		= false;
			$options->distinct_values 		= false;
			$options->from_component_tipo 	= null;
			$options->relation_type 		= DEDALO_RELATION_TYPE_LINK;
			$options->search_tipos 			= [DEDALO_THESAURUS_TERM_TIPO];
			$options->filter_custom 		= false;
			$options->op 					= '$and';
			foreach ($request_options as $key => $value) {
				if (property_exists($options, $key)) {
					$options->$key = $value;
					// Fix as regular var
					$$key = $value;
				}
			}

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		#$show_modelo_name=false;
		#$show_parent_name=false;
		
		# HIERARCHY_SECTIONS_FROM_TYPES : search all target section of all hierarchies with type=$hierarchy_types
		# Already calculated in compoonent modo edit
		#if (!empty($hierarchy_types)) {
		#	$hierarchy_sections = component_autocomplete_hi::add_hierarchy_sections_from_types($hierarchy_types, (array)$hierarchy_sections);
		#}
		#dump($hierarchy_sections, ' hierarchy_sections ++ '.to_string());

		# FILTER SECTIONS : Filter search by target sections (hierarchy_sections)
		$ar_filter=array();
		foreach ($hierarchy_sections as $target_section_tipo) {
			$ar_filter[] = "a.section_tipo='$target_section_tipo'";
		}
		$filter_sections = '(' . implode(' OR ', $ar_filter) . ')';
		#debug_log(__METHOD__." options ".to_string($options), logger::DEBUG);

		# MATRIX TABLE : Only from first term for now
		#$matrix_table = common::get_matrix_table_from_tipo( $hierarchy_sections[0] );
		$matrix_table = 'matrix_hierarchy';

		# TERM_TIPO : Only from first term for now
		#$thesaurus_map 	= section::get_section_map( $hierarchy_sections[0] )->thesaurus;
		#$term_tipo 		= $thesaurus_map->term;
		$term_tipo = reset($options->search_tipos); // DEDALO_THESAURUS_TERM_TIPO;

		# distinct_values
		if ($distinct_values===true) {
			$distinct_values = $term_tipo;
		}

		# String to search
		#$string_to_search = pg_escape_string($string_to_search);
		$q = $string_to_search;
		
		// Prepare q string
		$q = component_common::remove_first_and_last_quotes($q);
		#$q = pg_escape_string(stripslashes($q));

		if (substr($q,0,1)!=='=') {
			$q .= '*'; // Begins with.. by default
		}

		$op = $options->op; // '$and';

		// NEW WAY
		# search_query_object (can be string or object)		
		$search_query_object_options = new stdClass();
			$search_query_object_options->q 	 			= $q;
			$search_query_object_options->limit  			= (int)$max_results;
			$search_query_object_options->offset 			= 0;
			$search_query_object_options->lang 				= 'all';
			$search_query_object_options->logical_operator 	= $op;
			$search_query_object_options->id 				= 'autocomplete_hi_search';
			$search_query_object_options->section_tipo		= $hierarchy_sections; // Normally hierarchy_sections
			$search_query_object_options->search_tipos 		= $options->search_tipos;
			$search_query_object_options->distinct_values	= $distinct_values;
			$search_query_object_options->show_modelo_name 	= $options->show_modelo_name;
			$search_query_object_options->filter_custom 	= $options->filter_custom;
		$search_query_object = component_autocomplete_hi::build_search_query_object($search_query_object_options);

		$freeze_search_query_object = json_encode($search_query_object); // , JSON_UNESCAPED_UNICODE | JSON_HEX_APOS
		

		if(SHOW_DEBUG===true) {
			debug_log(__METHOD__." search_query_object ".PHP_EOL.json_encode($search_query_object, JSON_PRETTY_PRINT), logger::DEBUG);
			if (empty($search_query_object)) {
				debug_log(__METHOD__." ERROR: BAD JSON search_query_object ".to_string($search_query_object), logger::ERROR);
			}
		}
				
		$search_development2 = new search_development2($search_query_object);
		$search_result 		 = $search_development2->search();
		$ar_records 		 = $search_result->ar_records;
	
		$ar_term = array();		
		foreach ($ar_records as $key => $row) {
			
			$current_section_tipo 	= $row->section_tipo;
			$current_section_id 	= $row->section_id;			
			$current_relations 		= $row->{DEDALO_THESAURUS_RELATION_MODEL_TIPO};

			$current_term_tipo 		= ''; //$row->{$term_tipo};
			foreach ($options->search_tipos as $current_search_tipo) {
				if (!empty($row->{$current_search_tipo})) {
					$current_term_tipo = $row->{$current_search_tipo};
					break;
				}				
			}	
		
			$current_term  = component_common::get_value_with_fallback_from_dato_full( $current_term_tipo, $decore_untranslated=false );
			$original_term = $current_term;
				
			# Parent name . 
			# Parent locator is always calculated and is not in current record (data is as locator children in parent record)
			if($show_parent_name===true) {

				# Build locator
				$locator = new locator();
					$locator->set_section_tipo($current_section_tipo);
					$locator->set_section_id($current_section_id);
					$locator->set_type($relation_type);
					$locator->set_from_component_tipo($from_component_tipo);
				$locator_json = json_encode($locator);
				
				// Directly, with recursive options true
				// $locator, $lang=DEDALO_DATA_LANG, $section_tipo, $show_parents=false, $ar_componets_related=false, $divisor=false
				$current_valor = component_relation_common::get_locator_value( $locator, DEDALO_DATA_LANG, $show_parents=true, false, ', ');
				#debug_log(__METHOD__." current_valor ".to_string($current_valor), logger::DEBUG);
				if (!empty($current_valor)) {
					$current_term = $current_valor;
				}
			}

			# Aditional info
			# Model name . model locator is in relations, in current record
			if($show_modelo_name===true) {
				$relations  = json_decode($current_relations);
				$model_name = false;
				foreach ((array)$relations as $rel_locator) {
					if ($rel_locator->type===DEDALO_RELATION_TYPE_MODEL_TIPO) {
						$model_name = ts_object::get_term_by_locator( $rel_locator, DEDALO_DATA_LANG, $from_cache=true );
						if (!empty($model_name)) {
							$current_term .= ' - ' . $model_name;
						}
						break;
					}
				}
			}

			if(SHOW_DEBUG===true) {
				$current_term .= ' ['.$current_section_tipo.'_'.$current_section_id.']';
			}	

			# Store key - value
			$current_term = strip_tags($current_term);

			$value_obj = new stdClass();
				$value_obj->value = strip_tags($original_term);
				$value_obj->label = $current_term;
				$value_obj->key   = $locator_json;

			$ar_term[] = $value_obj;
		}
		#dump($ar_term, ' ar_term ++ '.to_string());

		if(SHOW_DEBUG===true) {
			#$total_start_time_search = exec_time_unit($start_time_search,'ms');
			#$total = exec_time_unit($start_time,'ms');
			#debug_log(__METHOD__." Total: $total ms. Search: $total_start_time_search ms", logger::DEBUG);
		}

		$response->result 				= (array)$ar_term;
		$response->msg 					= 'Ok. Request done';
		$response->search_query_object 	= $freeze_search_query_object; // Is string
		
		return $response;
	}//end autocomplete_hi_search
	*/



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
			# Filter
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
				}
				
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
			# Select
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
	* AUTOCOMPLETE_SEARCH
	* @return array $ar_result
	*//*
	public function autocomplete_search__DEPRECATED(object $search_query_object, string $divisor=', ') {

		// Exec search
			$search_development2 = new search_development2($search_query_object);
			$search_result 		 = $search_development2->search();

		// Set defaults for resolve row additions
			$search_tipos 			= [DEDALO_THESAURUS_TERM_TIPO];
			$show_modelo_name 		= true;
			$show_parent_name 		= true;
			$relation_type 			= DEDALO_RELATION_TYPE_LINK;
			$from_component_tipo 	= $this->tipo;		
		
		// Iterate rows to conform as final array result
			$ar_result = array();
			foreach ($search_result->ar_records as $key => $row) {
				
				// Row data. Row is a locator. Extact locator data here
					$current_section_tipo 	= $row->section_tipo;
					$current_section_id 	= $row->section_id;			
					$current_relations 		= $row->{DEDALO_THESAURUS_RELATION_MODEL_TIPO};

					$current_term_tipo 		= ''; //$row->{$term_tipo};
					foreach ($search_tipos as $current_search_tipo) {
						if (!empty($row->{$current_search_tipo})) {
							$current_term_tipo = $row->{$current_search_tipo};
							break;
						}
					}	
			
				// Resolve value with lang fallback
					$current_term  = component_common::get_value_with_fallback_from_dato_full( $current_term_tipo, $decore_untranslated=false );
					$original_term = $current_term;
					
				// Parent name. Parent locator is always calculated and is not in current record (data is as locator children in parent record)
					if($show_parent_name===true) {

						# Build locator
						$locator = new locator();
							$locator->set_section_tipo($current_section_tipo);
							$locator->set_section_id($current_section_id);
							$locator->set_type($relation_type);
							$locator->set_from_component_tipo($from_component_tipo);
						$locator_json = json_encode($locator);
						
						// Directly, with recursive options true
						// $locator, $lang=DEDALO_DATA_LANG, $section_tipo, $show_parents=false, $ar_componets_related=false, $divisor=false
						$current_valor = component_relation_common::get_locator_value($locator, DEDALO_DATA_LANG, true, false, ', ');
						#debug_log(__METHOD__." current_valor ".to_string($current_valor), logger::DEBUG);
						if (!empty($current_valor)) {
							$current_term = $current_valor;
						}
					}

				// Aditional info. Model name . model locator is in relations, in current record
					if($show_modelo_name===true) {
						$relations  = json_decode($current_relations);
						$model_name = false;
						foreach ((array)$relations as $rel_locator) {
							if ($rel_locator->type===DEDALO_RELATION_TYPE_MODEL_TIPO) {
								$model_name = ts_object::get_term_by_locator( $rel_locator, DEDALO_DATA_LANG, $from_cache=true );
								if (!empty($model_name)) {
									$current_term .= ' - ' . $model_name;
								}
								break;
							}
						}
					}

				// // Debug added
					if(SHOW_DEBUG===true) {
						$current_term .= ' ['.$current_section_tipo.'_'.$current_section_id.']';
					}	

				// Final value. Store key - value
					$current_term = strip_tags($current_term);

					$value_obj = new stdClass();
						$value_obj->value = strip_tags($original_term);
						$value_obj->label = $current_term;
						$value_obj->key   = $locator_json;

					$ar_result[] = $value_obj;
			}
			#debug_log(__METHOD__." ar_result: ".to_string($ar_result), logger::DEBUG);

		
		return (array)$ar_result;
	}//end autocomplete_search
	*/



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
	*//*
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id, $current_locator=null, $caller_component_tipo=null) {
		
		$component	= component_common::get_instance(__CLASS__,
													 $tipo,
													 $parent,
													 $modo,
													 $lang,
													 $section_tipo);

		// Injects received value (array of locators) to current component to avoid connect to database again
		if (!empty($value) && strpos($value, '[{')===0) {
			$dato_from_value = json_decode($value);
			$component->set_dato($dato_from_value);
		}

		$value = $component->get_html();
		
		return $value;
	}//end render_list_value */



	/**
	* GET_VALOR_LIST_HTML_TO_SAVE
	* Usado por section:save_component_dato
	* Devuelve a section el html a usar para rellenar el 'campo' 'valor_list' al guardar
	* Por defecto será el html generado por el componente en modo 'list', pero en algunos casos
	* es necesario sobre-escribirlo, como en component_portal, que ha de resolverse obigatoriamente en cada row de listado
	* @see class.section.php
	* @return string $html
	*//*
	public function get_valor_list_html_to_save() {

		# Return direct value for store in 'valor_list'. NOT read html file list
		$html 	= $this->get_valor($lang,'string');
		
		return (string)$html;
	}//end get_valor_list_html_to_save
	*/



	/**
	* GET_ORDER_BY_LOCATOR
	* OVERWRITE COMPONENT COMMON METHOD
	* @return bool
	*/
	public static function get_order_by_locator() {
		return true;
	}//end get_order_by_locator



	/**
	* GET_VALOR_LIST_HTML_TO_SAVE
	* Usado por section:save_component_dato
	* Devuelve a section el html a usar para rellenar el 'campo' 'valor_list' al guardar
	* Por defecto será el html generado por el componente en modo 'list', pero en algunos casos
	* es necesario sobre-escribirlo, como en component_portal, que ha de resolverse obigatoriamente en cada row de listado
	* @see class.section.php
	* @return string $html
	*/ /*
	public function get_valor_list_html_to_save() {
		
		$dato = $this->get_dato();
		
		return $dato;
	}//end get_valor_list_html_to_save */



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

					$current_label 	= strip_tags(RecordObj_dd::get_termino_by_tipo($hs_section_tipo, DEDALO_DATA_LANG, true, true));
					$current_key 	= $hs_section_tipo;
					
					$ar_filter_options[$current_key] = $current_label;
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

						$ar_filter_options[$current_key] = $current_label;
					}
				}
				break;
		}

		// Sort elements		
		asort($ar_filter_options, SORT_NATURAL);
		
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
	public function get_diffusion_value( $lang=null, $type=false ) {
	
		$diffusion_value = $this->get_valor($lang, 'string', ', ');
		$diffusion_value = strip_tags($diffusion_value);	
			#dump($diffusion_value, ' diffusion_value ++ '.to_string());
		#$term = $this->get_legacy_political_map_term( DEDALO_DATA_LANG, $dato_key=0, $type='municipality');
			#dump($term, ' term ++ '.to_string());

		return (string)$diffusion_value;
	}//end get_diffusion_value



	/**
	* MAP_LOCATOR_TO_TERM_ID
	* Alias of diffusion_sql::map_locator_to_term_id
	* @return string | null $term_id
	*/
	public function map_locator_to_term_id() {

		$term_id = null;

		$dato = $this->get_dato();
		if (!empty($dato)) {
			$term_id = diffusion_sql::map_locator_to_term_id(null, $dato);
		}

		return $term_id;
	}//end map_locator_to_term_id



	### GET_LEGACY_MODEL



	/**
	* get_legacy_political_map_term
	* @return 
	*/
	public function get_legacy_political_map_term( $lang=DEDALO_DATA_LANG, $dato_key=0, $type='municipality' ) {
		$value = '';

		$dato = $this->get_dato();
		if (!empty($dato[$dato_key])) {			

			$ar_hierarchy 	= [];
			$locator		= $dato[$dato_key];
			$political_map 	= self::get_legacy_political_map($locator->section_tipo);
				#dump($political_map, ' political_map ++ '.to_string());
			if (!empty($political_map[$type])) {

				# political_model_locator. Get current model locator to requested type (like es2,8868 for municipality in spain)
				$political_model_locator = reset($political_map[$type]);
					#dump($political_model_locator, ' political_model_locator ++ '.to_string());
				# model_obj. Get model info (name and locator)
				$model_obj 				 = self::get_legacy_model($locator, $lang);
					#dump($model_obj, ' model_obj ++ '.to_string());

				if ($political_model_locator->section_tipo===$model_obj->locator->section_tipo && 
					$political_model_locator->section_id==$model_obj->locator->section_id) {

					$term = ts_object::get_term_by_locator( $locator, $lang, $from_cache=true );
					return strip_tags($term);
				}
				#$ar_hierarchy[] = $locator;

				$ar_parents	= component_relation_parent::get_parents($locator->section_id, $locator->section_tipo);
				while (!empty($ar_parents[0])) {				
					$locator 	= $ar_parents[0];
					$model_obj	= self::get_legacy_model($locator, $lang);
					#$ar_hierarchy[] = $locator;
					if ($political_model_locator->section_tipo===$model_obj->locator->section_tipo &&
						$political_model_locator->section_id==$model_obj->locator->section_id) {

						$term = ts_object::get_term_by_locator( $locator, $lang, $from_cache=true );
						return strip_tags($term);
					}

					$ar_parents	= component_relation_parent::get_parents($locator->section_id, $locator->section_tipo);
				}
				#dump($ar_hierarchy, ' ar_hierarchy ++ '.to_string());
				/*
					$ar_term = [];
					foreach ($ar_hierarchy as $key => $locator) {
						$term = ts_object::get_term_by_locator( $locator, $lang, $from_cache=true );
						$ar_term[] = strip_tags($term);
					}
					dump($ar_term, ' $ar_term ++ '.to_string());

					# [0] => <mark>Cornellà de Llobregat</mark>
					# [1] => <mark>Baix Llobregat</mark>
					# [2] => <mark>Barcelona</mark>
					# [3] => <mark>Catalunya</mark>
					# [4] => <mark>España</mark>
					# [5] => Espanya

					switch ($type) {
						case 'municipality':
							$value = reset($ar_term);
							break;
						case 'country':
							$value = end($ar_term);
							break;
						case 'comarca':					
							switch ($locator->section_tipo) {						
								case 'es1':						
								default:
									$level = 1;
									break;
							}					
							$value = isset($ar_term[$level]) ? $ar_term[$level] : '';										
							break;


						default:
							# code...
							break;
					}
				*/
				#$value = strip_tags($value);
			}//end if (!empty($political_map[$type])) {
		}//end if (!empty($dato[$dato_key]))
		


		return $value;
	}//end get_legacy_political_map_term



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
				$country 				= json_decode('[{"section_tipo":"es2","section_id":"8868"}]');
				$autonomous_community 	= json_decode('[{"section_tipo":"es2","section_id":"8869"}]');
				$province 				= json_decode('[{"section_tipo":"es2","section_id":"8870"}]');
				$comarca 				= json_decode('[{"section_tipo":"es2","section_id":"8871"}]');
				$municipality 			= json_decode('[{"section_tipo":"es2","section_id":"8872"}]');
				# models
				$ar_models = [
					'country' 				=> $country,
					'autonomous_community' 	=> $autonomous_community,
					'province' 				=> $province,
					'comarca' 				=> $comarca,
					'municipality' 			=> $municipality
				];
				break;
			# France
			case 'fr1':
				$country 				= json_decode('[{"section_tipo":"fr2","section_id":"41189"}]');
				$autonomous_community 	= json_decode('[]');
				$province 				= json_decode('[{"section_tipo":"fr2","section_id":"41190"}]');
				$comarca 				= json_decode('[{"section_tipo":"fr2","section_id":"41191"}]');
				$municipality 			= json_decode('[{"section_tipo":"fr2","section_id":"41192"}]');
				# models
				$ar_models = [
					'country' 				=> $country,
					'autonomous_community' 	=> $autonomous_community,
					'province' 				=> $province,
					'comarca' 				=> $comarca,
					'municipality' 			=> $municipality
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

		# Clone and modify query_object for search in relations_search too
		$relation_search_obj = clone $result_query_object;
			$relation_search_obj->component_path = ['relations_search'];

		# Group the two query_object in a 'or' clause
		$operator = '$or';
		$group = new stdClass();
			$group->{$operator} = [$result_query_object,$relation_search_obj];


		return $group;
	}//end resolve_query_object_sql




}
?>