<?php
/*
* COMPONENT_AUTOCOMPLETE_HI
* Replaces component_autocomplete_ts
*
*/
class component_autocomplete_hi extends component_reference_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	# Array of related terms in structure (one or more)
	protected $ar_terminos_relacionados;

	# referenced component tipo
	public $ar_referenced_tipo;

	# Used by get_value (avoid recalculate value on every call)
	private $ar_valor_resolved;

	

	function __construct($tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {

		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;

		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

		if(SHOW_DEBUG===true) {
			$traducible = $this->RecordObj_dd->get_traducible();
			if ($traducible==='si') {
				throw new Exception("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP", 1);
			}
		}
	}//end __construct



	/**
	* GET DATO : 
	* OLD Format: "es967"
	* NEW Format: Array(locator1,locator2,..)
	*/
	public function get_dato() {
		$dato = parent::get_dato();

		# Verify type
		if (!is_array($dato) && !is_null($dato)) {
			debug_log(__METHOD__." Error on get dato from DB. Current dato is not array: ".gettype($dato).". Dato returned will be conveted to array".to_string(), logger::ERROR);
		}
		
		return (array)$dato;
	}//end get_dato



	/**
	* SET_DATO
	* @param array $dato
	*/
	public function set_dato($dato) {
		
		if (is_string($dato)) {
			$dato = json_decode($dato);
		}elseif (is_object($dato)) {
			$dato = array($dato); // IMPORTANT 
		}

		# Remove possible duplicates and sure well formed array keys
		$dato_unique=array();
		foreach ((array)$dato as $locator) {
			if ( !locator::in_array_locator( $locator, $dato_unique, $ar_properties=array('section_tipo','section_id')) ) {
				$dato_unique[] = $locator;
			}
		}
		$dato = $dato_unique;

		
		return parent::set_dato( (array)$dato );
	}//end set_dato



	/**
	* GET VALOR 
	* Get resolved string representation of current tesauro value
	*/
	public function get_valor( $lang=DEDALO_DATA_LANG, $format='string' ) {
		
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
			$recursive 	 = (isset($propiedades->value_with_parents) && $propiedades->value_with_parents===true) ? true : false;
			#dump($propiedades, ' propiedades ++ '.to_string());
	#$recursive = false; 
	
			$ar_valor = array();
			foreach ($dato as $key => $current_locator) {
			
				$current_valor = component_relation_common::get_locator_value( $current_locator, $lang, $this->section_tipo, $recursive );
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
			$valor = implode("<br>", $ar_valor);
		}

		return $valor;
	}//end get_valor



	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id ) {
		
		if (is_null($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}

		$valor_export = $this->get_valor($lang);
		$valor_export = br2nl($valor_export);

		if(SHOW_DEBUG===true) {
			#return "AUTOCOMPLETE_hi: ".$valor_export;
		}

		return $valor_export;
	}#end get_valor_export



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
	}#end get_dato_search
	*/


	/**
	* CONVERT_DATO_TO_LOCATOR
	* Convert old dato like 'es352' to standar locator like {"section_id":"es352","section_tipo":"es"}
	* Warning: this is a temporal locator (22-10-2015) and will be changed in tesaurized versions
	* @return object locator
	*/
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
	}#end convert_dato_to_locator



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
	}#end get_terminoID_by_locator



	/**
	* GET_AR_REFERENCED_TIPO
	*//*
	public function get_ar_referenced_tipo() {

		if(isset($this->ar_referenced_tipo)) return $this->ar_referenced_tipo;
		
		$ar_referenced_tipo = array();

		# COMPONENT PROPIEDADES VAR
		$propiedades = $this->get_propiedades();
		$source_mode = $this->get_source_mode();

		if ( isset($propiedades->jer_tipo) ) {
			
			# TEMPORAL
			$ar_tesauro_by_jer_tipo = RecordObj_jer::get_ar_tesauro_by_jer_tipo($propiedades->jer_tipo);
			foreach ($ar_tesauro_by_jer_tipo as $tld) {
				$ar_referenced_tipo[] = strtolower($tld)."1";
			}
			debug_log(__METHOD__." Deprecated source mode. Please use new format like 'propiedades->source->mode' ".to_string(), logger::ERROR);

		}else if (isset($propiedades->source->mode) && isset($propiedades->source->value)) {

			# New source format
			switch ($propiedades->source->mode) {
				case 'jer_tipo':
					$ar_tesauro_by_jer_tipo = RecordObj_jer::get_ar_tesauro_by_jer_tipo( (int)$propiedades->source->value );
					foreach ($ar_tesauro_by_jer_tipo as $tld) {
						$ar_referenced_tipo[] = strtolower($tld)."1";
					}
						
					break;
				case 'childrens_of':
					$ar_parents = (array)$propiedades->source->value;
					foreach ($ar_parents as $current_parent) {						
						$ar_childrens = RecordObj_ts::get_ar_childrens($current_parent, $order_by='norden');
							#dump($ar_childrens, ' ar_childrens'.to_string());
						foreach ((array)$ar_childrens as $current_tipo) {
							$ar_referenced_tipo[] = $current_tipo;

						}
					}

					break;
				case 'tree':
					# Tipos to hide / exclude

					$ar_referenced_tipo = $propiedades->source->value;
					break;
				default:
					debug_log(__METHOD__." Invalid source->mode ".to_string($propiedades->source->mode), logger::ERROR);
			}

		}else{			
			debug_log(__METHOD__." Not defined source->mode (propiedades->source->mode)", logger::ERROR);
		}
		#dump($ar_referenced_tipo, ' ar_referenced_tipo ++ '.to_string());		
				
		return $this->ar_referenced_tipo = $ar_referenced_tipo;
	}//end get_ar_referenced_tipo
	*/



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
	}#end get_source_mode



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

		foreach ((array)$hierarchy_types as $tipology_section_id) {
		
			#
			# HIERARCHIES OF CURRENT TIPO Like 'España' for tipology_section_id 2
			$search_hierarchies_options = area_thesaurus::get_options_for_search_hierarchies(DEDALO_HIERARCHY_TYPES_SECTION_TIPO, $tipology_section_id);
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

		return (array)$hierarchy_sections_from_types;
	}//end get_hierarchy_sections_from_types




	/**
	* ADD_HIERARCHY_SECTIONS_FROM_TYPES
	* Merge resolved hierarchy_sections_from_types with received hierarchy_sections
	* and create an array unique
	* @return array $hierarchy_sections
	*/
	public static function add_hierarchy_sections_from_types($hierarchy_types, $hierarchy_sections=array()) {		

		$hierarchy_sections_from_types = component_autocomplete_hi::get_hierarchy_sections_from_types( $hierarchy_types );
			#dump($hierarchy_sections_from_types, ' hierarchy_sections_from_types ++ '.to_string()); die();
		// Mix result with hierarchy_sections
		$hierarchy_sections = array_merge((array)$hierarchy_sections_from_types, (array)$hierarchy_sections);
		// Remove duplicates
		$hierarchy_sections = array_unique($hierarchy_sections);


		return (array)$hierarchy_sections;
	}//end add_hierarchy_sections_from_types

	
	/**
	* AUTOCOMPLETE_HI_SEARCH
	* Used by trigger on ajax call
	* @param array ar_referenced_tipo like ['es1','fr1'] (parent where start to search)
	* @param string_to_search
	* @return array ar_result 
	*	Array format: id_matrix=>dato_string 
	*/
	public static function autocomplete_hi_search($hierarchy_types, $hierarchy_sections, $string_to_search, $max_results=30, $show_modelo_name=false, $show_parent_name=false) {		
		if(SHOW_DEBUG===true) $start_time = start_time();

		#$show_modelo_name=false;
		#$show_parent_name=false;
		
		# HIERARCHY_SECTIONS_FROM_TYPES : search all target section of all hierarchies with type=$hierarchy_types
		/* Already calculated in compoonent modo edit
		if (!empty($hierarchy_types)) {
			$hierarchy_sections = component_autocomplete_hi::add_hierarchy_sections_from_types($hierarchy_types, (array)$hierarchy_sections);
		}*/

		# FILTER SECTIONS : Filter search by target sections (hierarchy_sections)
		$ar_filter=array();
		foreach ($hierarchy_sections as $target_section_tipo) {
			$ar_filter[] = "a.section_tipo='$target_section_tipo'";
		}
		$filter_sections = '(' . implode(' OR ', $ar_filter) . ')';
			#dump($filter_sections, ' filter_sections ++ '.to_string()); die();

		# MATRIX TABLE : Only from first term for now
		#$matrix_table = common::get_matrix_table_from_tipo( $hierarchy_sections[0] );
		$matrix_table = 'matrix_hierarchy';

		# TERM_TIPO : Only from first term for now		
		#$thesaurus_map 	= section::get_section_map( $hierarchy_sections[0] )->thesaurus;
		#$term_tipo 		= $thesaurus_map->term;
		$term_tipo = DEDALO_THESAURUS_TERM_TIPO;

		# String to search
		$string_to_search = pg_escape_string($string_to_search);

		# SQL Query
		$strQuery = PHP_EOL.sanitize_query("
		-- component_autocomplete_hi::autocomplete_hi_search
		 SELECT a.id, a.section_id, a.section_tipo,
		 a.datos#>>'{components, $term_tipo, valor}' AS term,
		 a.datos#>>'{relations}' AS relations
		 FROM \"$matrix_table\" a
		 WHERE
		 $filter_sections
		 AND f_unaccent(a.datos#>>'{components, $term_tipo, dato}') ILIKE f_unaccent('%[\"{$string_to_search}%')
		 ORDER BY term ASC
		 LIMIT $max_results
		 ;");	
		
		$result	= JSON_RecordObj_matrix::search_free($strQuery, false);
			#dump(null, ' strQuery ++ '.to_string($strQuery)); die(); // --ORDER BY term ASC
		#error_log($strQuery);

		$ar_term = array();
		while ($rows = pg_fetch_assoc($result)) {			
			$current_section_tipo 	= $rows['section_tipo'];
			$current_section_id 	= $rows['section_id'];
			$current_term_obj 		= json_decode($rows['term']);
			
			# current_term. Select lang name
			if (property_exists($current_term_obj, DEDALO_DATA_LANG)) {
				$term_lang = DEDALO_DATA_LANG;
				$current_term = $current_term_obj->{$term_lang};
			}elseif (property_exists($current_term_obj, 'lg-eng')) {
				$term_lang = 'lg-eng';
				$current_term = $current_term_obj->{$term_lang};
			}else{
				$current_term = reset($current_term_obj);
			}
			

			$locator = new locator();
				$locator->set_section_tipo($current_section_tipo);
				$locator->set_section_id($current_section_id);
			$locator_json = json_encode($locator);

			# Aditional info
			# Model name . model locator is in relations, in current record
			if($show_modelo_name===true) {
				$relations  = json_decode($rows['relations']);
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

			# Parent name . parent locator is always calculated and is not in current record (data is as locator children in parent record)
			if($show_parent_name===true) {
				$parent_name= false;
				$component = component_common::get_instance('component_relation_parent',
															 DEDALO_THESAURUS_RELATION_PARENT_TIPO,
															 $current_section_id,
															 'list',
															 DEDALO_DATA_NOLAN,
															 $current_section_tipo);
				$dato = $component->get_dato();
				if (isset($dato[0])) {
					$parent_name = ts_object::get_term_by_locator( $dato[0], DEDALO_DATA_LANG, $from_cache=true );
					if (!empty($parent_name)) {
						$current_term .= ' (' . $parent_name . ')';
					}
				}
			}

			if(SHOW_DEBUG===true) {
				$current_term .= ' ['.$current_section_tipo.'_'.$current_section_id.']';
			}	

			# Store key - value
			$current_term = strip_tags($current_term);
			$ar_term[$locator_json] = $current_term;
		}
		#dump($ar_term, ' ar_term ++ '.to_string());

		if(SHOW_DEBUG===true) {
			#$total_start_time_search = exec_time_unit($start_time_search,'ms');
			#$total = exec_time_unit($start_time,'ms');
			#debug_log(__METHOD__." Total: $total ms. Search: $total_start_time_search ms", logger::DEBUG);
		}
		
		return (array)$ar_term;
	}//end autocomplete_hi_search

	

	/**
	* BUILD_SEARCH_COMPARISON_OPERATORS 
	* Note: Override in every specific component
	* @param array $comparison_operators . Like array('=','!=')
	* @return object stdClass $search_comparison_operators
	*/
	public function build_search_comparison_operators( $comparison_operators=array('=','!=') ) {
		return (object)parent::build_search_comparison_operators($comparison_operators);
	}#end build_search_comparison_operators



	/**
	* GET_SEARCH_QUERY (OVERWRITE COMPONENT COMMON)
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
	*//*
	public static function get_search_query( $json_field, $search_tipo, $tipo_de_dato_search, $current_lang, $search_value, $comparison_operator='=') {		
		
		$search_value = json_decode($search_value);
			if ( !$search_value || empty($search_value) ) {
				return false;
			}

		$json_field = 'a.'.$json_field; // Add 'a.' for mandatory table alias search

		$search_query='';
		# Fixed
		$tipo_de_dato_search='dato';
		switch (true) {
			case $comparison_operator==='!=':
				foreach ((array)$search_value as $current_value) {
					$current_value = json_encode($current_value);
					$search_query = " ($json_field#>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' @> '[$current_value]'::jsonb)=FALSE OR \n";
				}
				$search_query = substr($search_query, 0,-5);
				break;

			case $comparison_operator==='=':
			default:
				foreach ((array)$search_value as $current_value) {
					$current_value = json_encode($current_value);
					$search_query .= " $json_field#>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' @> '[$current_value]'::jsonb OR \n";
				}
				$search_query = substr($search_query, 0,-5);
				break;			
		}
		
		if(SHOW_DEBUG===true) {
			$search_query = " -- filter_by_search $search_tipo ". get_called_class() ." \n".$search_query;
			#dump($search_query, " search_query for search_value: ".to_string($search_value)); #return '';
		}
		return $search_query;
	}//end get_search_query
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
	*/
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
	}#end render_list_value



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
	*/
	public function get_valor_list_html_to_save() {
		
		$dato = $this->get_dato();
		
		return $dato;
	}//end get_valor_list_html_to_save



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
					$ar_filter_options[$hs_section_tipo] = RecordObj_dd::get_termino_by_tipo($hs_section_tipo, DEDALO_DATA_LANG, true, true);
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
					$ar_list_of_values = $current_component->get_ar_list_of_values(DEDALO_DATA_LANG, false, false, false, $value_container='valor');
						#dump($ar_list_of_values, ' ar_list_of_values ++ '.to_string());
					foreach ((array)$ar_list_of_values->result as $hs_value => $hs_name) {
						$ar_filter_options[$hs_value] = $hs_name;
					}
				}
				break;
		}
		
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



}
?>