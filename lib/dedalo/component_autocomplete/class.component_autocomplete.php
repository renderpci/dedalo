<?php
/*
* CLASS component_autocomplete
*
*
*/
class component_autocomplete extends component_relation_common {


	protected $relation_type = DEDALO_RELATION_TYPE_LINK;

	# test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');


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
		/*
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
		/*
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
		$dato = $dato_unique;*/
		#dump($dato, ' set dato ++ '.to_string());

		return parent::set_dato( (array)$dato );
	}//end set_dato



	/**
	* GET VALOR 
	* Get resolved string representation of current value (expected id_matrix of section or array)
	* @return array $this->valor
	*/
	public function get_valor( $lang=DEDALO_DATA_LANG, $format='string', $ar_related_terms=false, $divisor="<br> " ) {
		
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
		
		# AR_COMPONETS_RELATED. By default, ar_related_terms is calculated. In some cases (diffusion for example) is needed overwrite ar_related_terms to obtain especific 'valor' form component
		if ($ar_related_terms===false) {
			$ar_related_terms = $this->RecordObj_dd->get_relaciones();
			$ar_componets_related = array();			
			foreach ((array)$ar_related_terms as $ar_value) foreach ($ar_value as $modelo => $component_tipo) {
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
				if ($modelo_name !== 'section'){
					$ar_componets_related[] = $component_tipo;
				}
			}
		}else{
			$ar_componets_related = (array)$ar_related_terms;
		}
		#dump($ar_componets_related, ' ar_componets_related ++ '.to_string($this->tipo));

		# lang never must be DEDALO_DATA_NOLAN
		if ($lang===DEDALO_DATA_NOLAN) $lang=DEDALO_DATA_LANG;
			
		$ar_values=array();
		foreach ($dato as $current_locator) {
			$value=array();

			foreach ($ar_componets_related as $component_tipo) {
				$modelo_name 	   = RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
				$current_component = component_common::get_instance($modelo_name,
																	$component_tipo,
																	$current_locator->section_id,
																	'edit',
																	$lang,
																	$current_locator->section_tipo);

				$current_value = component_common::extract_component_value_fallback($current_component,$lang,true);
					#dump($modelo_name , ' $modelo_name  ++ '.to_string());
				
				$value[] = $current_value;
			}//end foreach ($ar_componets_related as $component_tipo) 

			$current_locator_json = json_encode($current_locator);
			$current_value_string = '';
				
			$ar_values_clean = [];
			foreach ((array)$value as $key => $element_value) {
				if (empty($element_value) || $element_value==='<mark></mark>' || $element_value===' ') continue;
				$ar_values_clean[] = $element_value;
			}
			$divisor = $this->get_divisor();
			$ar_values[$current_locator_json] = implode($divisor, $ar_values_clean);			
		}

		if ($format==='array') {
			$valor = $ar_values;
		}else{
			$valor = implode($divisor, $ar_values);
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
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id ) {
		
		if (empty($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}

		#$valor = $this->get_valor($lang);
		$dato = $this->get_dato();
		if (empty($dato)) {
			if(SHOW_DEBUG===true) {
				#return "AUTOCOMPLETE: ";
			}
			return '';
		}

		#
		# TERMINOS_RELACIONADOS . Obtenemos los terminos relacionados del componente actual	
		$ar_terminos_relacionados = (array)$this->RecordObj_dd->get_relaciones();
			#dump($ar_terminos_relacionados, ' ar_terminos_relacionados');
		
		#
		# FIELDS
		$fields=array();
		$ar_skip = array(MODELO_SECTION, $modelo_exclude_elements='dd1129');
		foreach ($ar_terminos_relacionados as $key => $ar_value) {
			$modelo = key($ar_value);
			$tipo 	= $ar_value[$modelo];
			if (!in_array($modelo, $ar_skip)) {
				$fields[] = $tipo;
			}
		}

		$ar_resolved=array();
		foreach( (array)$dato as $key => $value) {
			#dump($value, ' value ++ '.to_string());
			$section_tipo 	= $value->section_tipo;
			$section_id 	= $value->section_id;

			foreach ($fields as $current_tipo) {				
			
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
				$component 		= component_common::get_instance($modelo_name,
																 $current_tipo,
																 $section_id,
																 'list',
																 $lang,
																 $section_tipo);
				$ar_resolved[$section_id][] = $component->get_valor_export( null, $lang, $quotes, $add_id );
			}
		}
		#dump($ar_resolved, ' $ar_resolved ++ '.to_string());

		$valor_export='';
		foreach ($ar_resolved as $key => $ar_value) {
			$valor_export .= implode("\n", $ar_value) . "\n";
		}
		$valor_export = trim($valor_export);

		if(SHOW_DEBUG===true) {
			#return "AUTOCOMPLETE: ".$valor_export;
		}

		return $valor_export;
	}//end get_valor_export



	/**
	* GET_ar_target_section_tipo
	* Locate in structure TR the target section (remember, components are from real section, but you can target to virtual setion)
	* @return string $ar_target_section_tipo
	*//*
	public function get_ar_target_section_tipo($options=null) {
		#dump($this->RecordObj_dd->get_relaciones(), ' var');
		$ar_related_terms = (array)$this->RecordObj_dd->get_relaciones();		
		
		foreach ($ar_related_terms as $related_terms)
		foreach ($related_terms as $modelo => $current_tipo) {
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
			if ($modelo_name=='section') {
				$ar_target_section_tipo = $current_tipo; break;
			}
		}
		if (!isset($ar_target_section_tipo)) {
			throw new Exception("Error Processing Request. Inconsistency detect. This component need related section always", 1);			
		}
		#dump($ar_target_section_tipo, ' ar_target_section_tipo');

		return $ar_target_section_tipo;
	}//end get_ar_target_section_tipo
	*/



	/**
	* GET_TIPO_TO_SEARCH
	* Locate in structure TR the component tipo to search
	* @return string $tipo_to_search
	*/
	public function get_tipo_to_search($options=null) {

		if(isset($this->tipo_to_search)) {
			return $this->tipo_to_search;
		}

		# DESECHADO POR PROBLEMAS AL SELECCIONAR EL PRIMERO. EL ORDEN NO ES RESPETADO...
		# $ar_related_terms = (array)$this->RecordObj_dd->get_relaciones();
		# 	#dump($ar_related_terms, ' ar_related_terms');
		# foreach ($ar_related_terms as $related_terms)		
		# foreach ($related_terms as $modelo => $current_tipo) {
		# 	$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
		# 	# Get first component only
		# 	if (strpos($modelo_name, 'component_')!==false) {
		# 		$tipo_to_search = $current_tipo; break;
		# 	}
		# }		

		$ar_terminoID_by_modelo_name = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($this->tipo, 'component_', 'termino_relacionado'); 
				#dump($ar_terminoID_by_modelo_name, ' ar_terminoID_by_modelo_name '.$this->tipo.' ');
		$tipo_to_search = reset($ar_terminoID_by_modelo_name);

		if (!isset($tipo_to_search)) {
			throw new Exception("Error Processing Request. Inconsistency detect. This component need related component to search always", 1);			
		}
		#dump($tipo_to_search, ' tipo_to_search');

		# Fix value
		$this->tipo_to_search = $tipo_to_search;

		return $tipo_to_search;
	}//end get_tipo_to_search



	/**
	* AUTOCOMPLETE_SEARCH
	* Used by trigger on ajax call
	* This function search is almost identical to component_common->get_ar_list_of_values
	* @param string tipo
	* @param string string_to_search
	* @return array $output 
	*	Array format: id_matrix=>dato_string 
	*//*
	public static function autocomplete_search($tipo, $ar_target_section_tipo, $string_to_search, $max_results=30, $filter_sections, $search_fields, $divisor=', ') {
			
		$ar_result=array();	
		
		# foreach((array)$ar_target_section_tipo as $target_section_tipo) {
		# 	
		# 	$component = component_common::get_instance(null, $tipo, null, 'edit', DEDALO_DATA_LANG, $target_section_tipo);
		# 	# ar list of values ($lang=DEDALO_DATA_LANG, $id_path=false, $referenced_section_tipo=false, $filter_custom=false, $value_container='valor')
		# 	$ar_list_of_values  = $component->get_ar_list_of_values(DEDALO_DATA_LANG, $id_path, $target_section_tipo, false, 'valor_list');
		# 		#dump($ar_list_of_values, ' ar_list_of_values ++ '.to_string($target_section_tipo));
		# 	$result 			= search_string_in_array($ar_list_of_values->result,(string)$string_to_search);
		# 		dump($ar_result," ar_result"); die();
		# 	$ar_result 			= array_merge($ar_result,$result);
		# 		#dump($ar_list_of_values, ' ar_list_of_values ++ '.to_string($target_section_tipo));				
		# }		
		
		# $search_fields = '[
		#   {
		# 	"section_tipo": "numisdata3",
		# 	"component_tipo": "numisdata27"
		#   },
		#   {
		# 	"section_tipo": "numisdata3",
		# 	"component_tipo": "numisdata30",
		# 	"search": [
		# 	  {
		# 		"section_tipo": "numisdata6",
		# 		"component_tipo": "numisdata16"
		# 	  }
		# 	]
		#   }
		# ]';
		# $search_fields = json_decode($search_fields);
		# dump($search_fields, ' search_fields ++ '.to_string()); return;

		# Columns
			$ar_columns=array();
			# Fixed columns
			$ar_columns[] = 'id';
			$ar_columns[] = 'section_id';
			$ar_columns[] = 'section_tipo';

		# SELECT
			$ar_select=array();			
			foreach ($search_fields as $key => $field) {

				# Select elements
				$current_section_tipo   = $field->section_tipo;
				$current_component_tipo = $field->component_tipo;

				$ar_columns[] = $current_component_tipo;

				#$filter 	 = "a.datos#>>'{components, $current_component_tipo, valor}' AS $current_component_tipo";
				#$RecordObj_dd = new RecordObj_dd($current_component_tipo);
				$modelo_name  = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);
								
				$options = new stdClass();
					$options->json_field  = 'datos';
					$options->search_tipo = $current_component_tipo;
					$options->lang 		  = 'all';	//$RecordObj_dd->get_traducible()!=='si' ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;
					$options->modelo_name = $modelo_name;
					#$options->all_langs   = true;	// Important true								
				$filter 	  = $modelo_name::get_select_query($options);
				#error_log("filter: ".$filter);
				$ar_select[]  = $filter;
			}
			$select = '' . implode(', ', $ar_select) . '';			

		# MATRIX TABLE : Only from first term for now
			$matrix_table = common::get_matrix_table_from_tipo( $ar_target_section_tipo[0] );		


		# TARGET SECTIONS : Filter search by target sections (hierarchy_sections)
			$filter_target_section = '';
			$ar_filter=array();
			foreach ($ar_target_section_tipo as $current_section_tipo) {
				$ar_filter[] = "a.section_tipo='$current_section_tipo'";
			}
			$filter_target_section = '(' . implode(' OR ', $ar_filter) . ')';

		# SEARCH_CUSTOM
		# From propiedades. Add custom filter to current section search to avoid manage massive array of records in some circunstances
			$filter_search_custom = '';
			$RecordObj_dd 	= new RecordObj_dd($tipo);
			$current_propiedades = $RecordObj_dd->get_propiedades();
			if($propiedades = json_decode($current_propiedades)) {
				
				if ( isset($propiedades->search_custom) ) {
					$ar_filter=array();
					foreach ((array)$propiedades->search_custom as $field_search) {						
						if ($field_search==='section_id') {
							$current_string_to_search = (int)$string_to_search;
							$ar_filter[] = "a.{$field_search}=$current_string_to_search";
						}else{
							$current_string_to_search = $string_to_search;
							$ar_filter[] = "a.{$field_search}='$current_string_to_search'";
						}						
					}
					$filter_search_custom = 'AND (' . implode(' OR ', $ar_filter) . ')';
					#error_log("filter_search_custom: $filter_search_custom");
				}
			}

		# FILTER_BY_LIST : Filter search by filter sections
			$filter_by_list = '';			
			if(!empty($filter_sections)) {
				#dump($filter_sections, ' $filter_sections ++ '.to_string());
				$ar_filter=array();
				foreach ($filter_sections as $current_locator) {
					
					$current_section_tipo 	= $current_locator->section_tipo;
					$current_section_id 	= (int)$current_locator->section_id;
					$current_component_tipo = $current_locator->component_tipo;
					
					$search_value = '[{"section_tipo":"'.$current_section_tipo.'","section_id":"'.$current_section_id.'"}]';
					
					$modelo_name  = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);
					$search_query = $modelo_name::get_search_query( $json_field='datos', $current_component_tipo, 'dato', DEDALO_DATA_NOLAN, $search_value, $comparison_operator='=');
					#error_log($search_query);
					$ar_filter[$current_section_tipo][] = "\n".$search_query;
				}
				if (!empty($ar_filter)) {
					foreach ($ar_filter as $k_section_tipo => $ar_section_query) {
						$filter_by_list .= "\n  AND (" . implode(' OR ', $ar_section_query) . ')';
					}
				}
			}

		# FILTER_SUBQUERY : Filter by string_to_search						
			$ar_subquery=array();			
			foreach ($search_fields as $field) {

				# Select modelo name				
				#$select_modelo_name  = RecordObj_dd::get_modelo_name_by_tipo($field->component_tipo,true);
				$ar_search_subquery = component_autocomplete::get_search_subquery($field, $string_to_search);
				$ar_subquery = array_merge($ar_subquery,$ar_search_subquery);

			}
			$filter_subquery = '' . implode(' OR ', $ar_subquery) . '';

		# ORDER			
			$order = '';

			# $ar_order=array();
			# foreach ($search_fields as $field) {
			# 	$filter 	= "a.datos#>>'{components, $field->component_tipo, valor, ".DEDALO_DATA_LANG."}' ASC";
			# 	$ar_order[] = $filter;
			# 	break; // Stop here
			# }
			# $order = 'ORDER BY ' . implode(', ', $ar_order) . '';
			# error_log($order);		

		# QUERY
			$strQuery = PHP_EOL.sanitize_query("
			SELECT ".implode(', ',$ar_columns)." FROM (
			  SELECT a.id, a.section_id, a.section_tipo, $select
			  FROM \"$matrix_table\" a 
			  WHERE $filter_target_section $filter_search_custom $filter_by_list
			  $order
			) AS base
			WHERE $filter_subquery
			GROUP BY ".implode(', ',array_reverse($ar_columns))."
			LIMIT $max_results ;
			");
			if(SHOW_DEBUG===true) {
				#error_log($strQuery); #return;
			}

		
		$result	= JSON_RecordObj_matrix::search_free($strQuery, false);
		while ($rows = pg_fetch_assoc($result)) {

			$current_section_tipo 	= $rows['section_tipo'];
			$current_section_id 	= $rows['section_id'];

			$ar_resolved = array();
			foreach ($search_fields as $key => $field) {
				$current_component_tipo = $field->component_tipo;
				$ar_resolved_obj[$current_component_tipo] = json_decode($rows[$current_component_tipo]);
			}
			#dump($ar_resolved_obj, ' ar_resolved_obj ++ '.to_string()); #continue;

			#$flat_locator = "{\"section_tipo\":\"$current_section_tipo\",\"section_id\":\"$current_section_id\"}";
			$locator = new locator();
				$locator->set_section_tipo($current_section_tipo);
				$locator->set_section_id($current_section_id);
				$locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator->set_from_component_tipo($tipo);
			
			#$flat_locator = '{"section_tipo":"'.$current_section_tipo.'","section_id":"'.$current_section_id.'"}';
			$flat_locator = json_encode($locator);
			$ar_label 	  = array();
			foreach ($ar_resolved_obj as $ctipo => $current_term_obj) {
				#dump($current_term_obj, ' current_term_obj ++ '.to_string($ctipo));
				
				# current_term. Select lang name
				if(empty($current_term_obj)) {
					#$ar_label[] = ""; 
					continue;
				}

				$modelo_name  = RecordObj_dd::get_modelo_name_by_tipo($ctipo,true);

				if (in_array($modelo_name,component_common::get_ar_components_with_references())) {
					# Resolve					
					#dump($current_term_obj, ' current_term_obj ++ '.to_string());
					$ar_locators = array_filter((array)$current_term_obj,function($item) use($ctipo) {
						return $item->from_component_tipo = $ctipo;
					});
					#dump($ar_locators, ' ar_locators ++ '.to_string());
					$current_term = $modelo_name::render_list_value($ar_locators, $ctipo, $current_section_id, 'list', DEDALO_DATA_LANG, $current_section_tipo, $current_section_id);

				}else{
					if (property_exists($current_term_obj, DEDALO_DATA_LANG)) {
						
						$term_lang = DEDALO_DATA_LANG;						
						$current_term = $current_term_obj->{$term_lang};
					
					}elseif (property_exists($current_term_obj, 'lg-eng')) {
						
						$term_lang = 'lg-eng';
						$current_term = $current_term_obj->{$term_lang};
					
					}elseif (property_exists($current_term_obj, 'lg-nolan')) {
						
						$term_lang 	  = 'lg-nolan';
						#dump($current_term_obj, ' current_term_obj ++ '.to_string($ctipo));
						#$current_term = $current_term_obj->{$term_lang};
						$current_term = $modelo_name::render_list_value($current_term_obj->{$term_lang}, $ctipo, $current_section_id, 'list', DEDALO_DATA_LANG, $current_section_tipo, $current_section_id);
					
					}else{
						
						$current_term = reset($current_term_obj);
					}
				}
				if (is_array($current_term)) {
					$current_term = implode(',',$current_term);
				}				
				$current_term = strip_tags( $current_term );
				if(!empty($current_term)) $ar_label[] = strip_tags($current_term);
			}
			$ar_result[$flat_locator] = implode($divisor, $ar_label);
		}
		#dump($ar_result, ' ar_result ++ '.to_string());

		
		#// Sort results
		# asort($ar_result, SORT_NATURAL);
		# 
		# $output = array_slice($ar_result, 0, $max_results, true);
		# 	#dump($output," ar_result");
		

		return (array)$ar_result;
	}//end autocomplete_search */



	/**
	* AUTOCOMPLETE_SEARCH2
	* @return array $ar_result
	*/
	public function autocomplete_search2($search_query_object, $divisor=', ') {
	
		#$request_options = new stdClass();
		#	$request_options->q 	 			= $string_to_search;
		#	$request_options->limit  			= $max_results;
		#	$request_options->offset 			= 0;
		#	$request_options->logical_operator 	= $logical_operator;

		#$query_object = $this->build_search_query_object($request_options);
		#dump(null, ' query_object ++ '. json_encode($query_object, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)); die();

		# Remove option of sub_select_by_id (not work on left joins)
		$search_query_object->allow_sub_select_by_id = false;
		# Avoid auto add filter by user projects in search
		$search_query_object->skip_projects_filter 	 = true;

		if(SHOW_DEBUG===true) {
			debug_log(__METHOD__." search_query_object ".json_encode($search_query_object, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), logger::DEBUG);
		}		
		
		$search_development2 = new search_development2($search_query_object);
		$rows_data 		 	 = $search_development2->search();
			#dump($rows_data, ' rows_data ++ '.to_string());

		$ar_result = [];
		foreach ($rows_data->ar_records as $key => $row) {			

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
					#if ($decoded_value = json_decode($value)) {
					#	if (is_object($decoded_value)) {
							$value = component_common::get_value_with_fallback_from_dato_full( $value, $mark=false );
					#	}
					#}
					$ar_full_label[] = $value;
				}
			}
			$ar_result[$locator_json] = implode($divisor, $ar_full_label);
		}

		
		return (array)$ar_result;
	}//end autocomplete_search2



	/**
	* GET_SEARCH_SUBQUERY
	* Used by autocomplete_search
	* @see autocomplete_search
	* @return array
	*/
	public static function get_search_subquery($field, $string_to_search) {
		$ar_subquery = array();
				# ar_search : set always as array
		# When key 'search' is defined, use it as search values. Else use normal default values
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

		
		foreach ($ar_search as $search_field) {
			
			# Select elements
			$current_section_tipo   = $search_field->section_tipo;
			$current_component_tipo = $search_field->component_tipo;

			#$RecordObj_dd = new RecordObj_dd($current_component_tipo);
			#$current_lang = $RecordObj_dd->get_traducible()!=='si' ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;
			$search_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);

			# COMPONENTS_WITH_REFERENCES case like autocomplete, select, etc.. 
			$search_query = array();
			if(in_array($search_modelo_name, component_common::get_ar_components_with_references())) {
				$search_query 		= (array)component_autocomplete::get_search_subquery($search_field, $string_to_search);
				$subquery_type 		= 'with_references';
			}else{
				$search_query[] 	= $search_modelo_name::get_search_query('datos', $current_component_tipo, 'dato', 'all', $string_to_search);
				$subquery_type 		= '';
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
		$RecordObj_dd = new RecordObj_dd($termonioID_related);

		if($RecordObj_dd->get_traducible() === 'no'){
			$lang = DEDALO_DATA_NOLAN;
		}else{
			$lang = DEDALO_DATA_LANG;
		}

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
	public static function create_new_autocomplete_record($parent, $tipo, $target_section_tipo, $section_tipo, $ar_data ) {

		# Set from_component_tipo
		$from_component_tipo = $tipo;
		
		#
		# PROJECTS HERITAGE
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
		
		#
		# SECTION : Create a new section
		$section 	= section::get_instance(null,$target_section_tipo);
		$section_id = $section->Save();			
		
		#
		# FILTER : Set heritage of projects
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

		#
		# component_autocomplete
		$component_autocomplete 	= component_common::get_instance('component_autocomplete',
																	  $tipo,
																	  $section_id,
																	  'edit',
																	  DEDALO_DATA_NOLAN,
																	  $section_tipo);

		#
		# PROPIEDADES
		$propiedades = $component_autocomplete->get_propiedades();
		if (!empty($propiedades)) {
			
			if (isset($propiedades->filtered_by)) foreach($propiedades->filtered_by as $current_tipo => $current_value) {
				#dump($current_value, ' current_tipo - '.$current_tipo);

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

		#
		# COMPONENTS
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


		#
		# RETURN LOCATOR OBJECT OF CREATED SECTION
		$locator = new locator();
			$locator->set_type(DEDALO_RELATION_TYPE_LINK);
			$locator->set_section_id($section_id);
			$locator->set_section_tipo($target_section_tipo);			
			$locator->set_from_component_tipo($from_component_tipo);
				#dump($locator,'locator');


		return $locator;
	}//end create_new_autocomplete_record



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
	
		$component 	= component_common::get_instance(__CLASS__,
													 $tipo,
													 $parent,
													 $modo,
													 DEDALO_DATA_NOLAN,
													 $section_tipo);


		# Use already query calculated values for speed
		#$ar_records   = (array)json_handler::decode($value);
		#$component->set_dato($ar_records);
		$dato = $component->get_dato();
		$component->set_identificador_unico($component->get_identificador_unico().'_'.$section_id.'_'.$caller_component_tipo); // Set unic id for build search_options_session_key used in sessions
		
		if($modo === 'portal_list' || $modo === 'edit_in_list') {
			$valor = $component->get_html();
		}else{
			$valor = $component->get_valor($lang, 'string', false, "<br> "); // $lang=DEDALO_DATA_LANG, $format='string', $ar_related_terms=false, $divisor="<br> "
		}

		return $valor;
	}//end render_list_value */



	/**
	* IMPORT_plain_VALUE (IN PROGRESS)
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
	*//*
	public function get_valor_list_html_to_save() {
		$result = $this->get_dato_unchanged();

		return $result;		
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
		#if(isset($propiedades->source->mode) && $propiedades->source->mode === 'external'){
		#	$this->set_dato_external();	// Forces update dato with calculated external dato	
		#}

		# Force loads dato always !IMPORTANT
		$this->get_dato();

		debug_log(__METHOD__." Ignored regenerate action in this component. USE generate_relations_table_data TO REGENERATE RELATIONS ".to_string($this->tipo), logger::WARNING);

		if(empty($dato)) return true;
		
		# Save component data
		#$this->Save();
		
		return true;
	}//end regenerate_component



	/**
	* GET_SEARCH_FIELDS
	* @return array $search_fields
	* Sample: 
	[
	  {
		"section_tipo": "numisdata3",
		"component_tipo": "numisdata27"
	  },
	  {
		"section_tipo": "numisdata3",
		"component_tipo": "numisdata30",
		"search": [
		  {
			"section_tipo": "numisdata6",
			"component_tipo": "numisdata16"
		  }
		]
	  }
	]
	*/
	public function get_search_fields($search_tipo) {
		//chenk the recursion 

		$current_tipo 				= $search_tipo;
		$ar_target_section_tipo 	= common::get_ar_related_by_model('section',$current_tipo);
		$target_section_tipo    	= reset($ar_target_section_tipo);
		$ar_terminos_relacionados 	= RecordObj_dd::get_ar_terminos_relacionados($current_tipo, true, true);
		
		$search_fields = array();
		foreach ($ar_terminos_relacionados as $key => $c_tipo) {
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($c_tipo,true);
			if ($modelo_name==='section') continue;
			
			$field = new stdClass();
				$field->section_tipo 	= $target_section_tipo;
				$field->component_tipo 	= $c_tipo;

			# COMPONENTS_WITH_REFERENCES case like autocomplete, select, etc.. 
			if(in_array($modelo_name, component_common::get_ar_components_with_references())) {
				$field->search 	= $this->get_search_fields($c_tipo);
			}

			$search_fields[] = $field;
		}

		return $search_fields;
	}//end get_search_fields



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
	*//*
	public function get_diffusion_value( $lang=null ) {

		$dato 	= $this->get_dato();		
		$valor	= $this->get_valor( $lang );			

		if (empty($valor) && !empty($dato) ) {

			#debug_log(__METHOD__.' sorry resolve value diffusion component_autocomplete in progress.. ('.$this->get_tipo().', '.$this->get_parent().', '.$this->get_section_tipo().') '.to_string(), logger::WARNING);
			$valor = ""; // 'sorry resolve value in progress..';
		}				
		$diffusion_value = $valor;
		

		return (string)$diffusion_value;
	}//end get_diffusion_value*/



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
	
		$this->valor = null;
	
		$this->set_lang($lang);

		$diffusion_value = $this->get_valor($lang);
		$diffusion_value = strip_tags($diffusion_value);

		return (string)$diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_DIFFUSION_DATO
	* @return 
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



}
?>