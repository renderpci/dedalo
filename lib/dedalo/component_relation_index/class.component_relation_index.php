<?php
/*
* CLASS COMPONENT_RELATION_INDEX
*
*
*/
class component_relation_index extends component_relation_common {
	

	public $relation_type = DEDALO_RELATION_TYPE_INDEX_TIPO;

	# test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo','component_tipo','tag_id');


	
	/**
	* GET_VALOR
	* Get value . default is get dato . overwrite in every different specific component
	* @return string | null $valor
	*/
	public function get_valor($lang=DEDALO_DATA_LANG) {
		
		$ar_valor  	= array();		
		$dato   	= $this->get_dato();
		foreach ((array)$dato as $key => $current_locator) {
			$ar_valor[] = self::get_locator_value( $current_locator, $lang );			
		}//end if (!empty($dato)) 

		# Set component valor
		# $this->valor = implode(', ', $ar_valor);
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
	* If the component need change this langs (selects, radiobuttons...) overwrite this function
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
	}#end get_valor_lang



	/**
	* ADD_LOCATOR
	* Add one locator to current 'dato'. Verify is exists to avoid duplicates
	* NOTE: This method updates component 'dato' but NOT save
	* @return bool
	*/
	public function add_locator( $locator ) {

		$locator = clone($locator);

		# Verify exists locator type
		if (!property_exists($locator,'type')) {
			$locator->type = $this->relation_type;
		}

		# Verify exists locator from_component_tipo
		if (!property_exists($locator,'from_component_tipo')) {
			$locator->from_component_tipo = $this->tipo;
		}

		if ($locator->type!=$this->relation_type) {
			debug_log(__METHOD__." Stopped add index (struct) of invalid type (valid type is $this->relation_type). Received type: ".to_string($locator->type), logger::ERROR);
			return false;
		}

		# Add current locator to component dato
		if (!$add_locator = $this->add_locator_to_dato($locator)) {
			return false;
		}
		
		return true;
	}//end add_locator



	/**
	* REMOVE_LOCATOR
	* Iterate current component 'dato' and if math requested locator, removes it the locator from the 'dato' array
	* NOTE: This method updates component 'dato' and save
	* @return bool
	*/
	public function remove_locator( $locator ) {

		$locator = clone($locator);

		# Verify exists locator type
		if (!property_exists($locator,'type')) {
			$locator->type = $this->relation_type;
		}

		# Verify exists locator from_component_tipo
		if (!property_exists($locator,'from_component_tipo')) {
			$locator->from_component_tipo = $this->tipo;
		}

		# Properties to compare for match locator to remove
		$ar_properties = [
			'type',
			'section_tipo',
			'section_id',
			'component_tipo',
			'tag_id',
			'from_component_tipo'
		];
	
		# Add current locator to component dato		
		if (!$remove_locator_locator = $this->remove_locator_from_dato($locator, $ar_properties)) {
			return false;
		}
		
		return true;
	}//end remove_locator



	/**
	* GET_INDEXATIONS_FROM_TAG
	* Used by tool_indexation to get list of terms with index relation to current tag
	* @return array $ar_indexations
	*/
	public static function get_indexations_from_tag($component_tipo, $section_tipo, $section_id, $tag_id, $lang=DEDALO_DATA_LANG, $type=DEDALO_RELATION_TYPE_INDEX_TIPO) {
		
		# Search relation index in hierarchy tables		
		$options = new stdClass();
			$options->fields 	= new stdClass();
				$options->fields->section_tipo 	= $section_tipo;
				$options->fields->section_id 	= $section_id;
				$options->fields->component_tipo= $component_tipo;
				$options->fields->type 			= $type;
				$options->fields->tag_id 		= $tag_id;
			#$options->ar_tables = array('matrix_hierarchy');

		/*
		$result = component_relation_index::old_get_indexations_search( $options );

		$ar_indexations = array();
		while ($rows = pg_fetch_assoc($result)) {

			$current_section_id   	= $rows['section_id'];
			$current_section_tipo 	= $rows['section_tipo'];
			$relations 				= json_decode($rows['relations']);
				#dump($relation, ' relation ++ '.to_string());			

			// Full relation index locator contains from component tipo info
			$relation_index_locator = component_relation_index::get_locator_from_ar_relations($relations, $section_tipo, $section_id, DEDALO_RELATION_TYPE_INDEX_TIPO, $tag_id);
				#dump($relation_index_locator, ' relation_index_locator ++ '.to_string());

			$locator = new locator();
				$locator->set_section_tipo($current_section_tipo);
				$locator->set_section_id($current_section_id);

			$term_label = ts_object::get_term_by_locator( $locator, DEDALO_DATA_LANG, $from_cache=true );

			$data = new stdClass();		
				$data->section_tipo = $current_section_tipo;
				$data->section_id 	= $current_section_id;
				$data->term 		= strip_tags($term_label);
				$data->locator 		= $relation_index_locator;

			$ar_indexations[] = $data;
			
			#$thesaurus_map 	= section::get_section_map( $current_section_tipo )->thesaurus;
			#if (isset($thesaurus_map->term)) {
			#	$term_tipo 		= $thesaurus_map->term;				
			#	$term_label 	= component_input_text::render_list_value($value, $term_tipo, $current_section_id, 'list', $lang, $current_section_tipo);
			#
			#	$data = new stdClass();		
			#		$data->section_tipo = $current_section_tipo;
			#		$data->section_id 	= $current_section_id;
			#		$data->term 		= strip_tags($term_label);
			#		$data->locator 		= $relation_index_locator;
			#
			#	$ar_indexations[] = $data;
			#}			
		}//end while
		#dump($ar_indexations, ' ar_indexations 1 ++ '.to_string());
		*/

		$result = component_relation_index::get_indexations_search( $options );

		$ar_indexations_resolved = [];
		foreach ($result as $key => $inverse_locator) {

			$locator = new locator();
			 	$locator->set_section_tipo($inverse_locator->section_tipo);
			 	$locator->set_section_id($inverse_locator->section_id);
			 	$locator->set_from_component_tipo($inverse_locator->from_component_tipo);
			 	$locator->set_component_tipo($inverse_locator->component_tipo);
			 	$locator->set_type($inverse_locator->type);
			 	$locator->set_tag_id($inverse_locator->tag_id);

			$locator_resolve_term = new locator();
				$locator_resolve_term->set_section_tipo($inverse_locator->from_section_tipo);
			 	$locator_resolve_term->set_section_id($inverse_locator->from_section_id);

			$term_label = ts_object::get_term_by_locator( $locator_resolve_term, $lang, $from_cache=true ); 
			
			$data = new stdClass();		
				$data->section_tipo = $inverse_locator->from_section_tipo;
				$data->section_id 	= $inverse_locator->from_section_id;
				$data->term 		= strip_tags($term_label);
				$data->locator 		= $locator;

			$ar_indexations_resolved[] = $data;
		}
		$ar_indexations = $ar_indexations_resolved;
		

		return (array)$ar_indexations;
	}//end get_indexations_from_tag	



	/**
	* GET_INDEXATIONS_SEARCH
	* @return resource $result
	*/
	public static function get_indexations_search( $request_options ) {
	
		$options = new stdClass();
			$options->fields = new stdClass();
				$options->fields->section_tipo 	= false;
				$options->fields->section_id 	= false;
				$options->fields->component_tipo= false;
				$options->fields->type 			= DEDALO_RELATION_TYPE_INDEX_TIPO;
				$options->fields->tag_id 		= false;
			#$options->ar_tables 			= array('matrix_hierarchy');

			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}


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
		
		# calculate_inverse_locators: $locator, $limit=false, $offset=false, $count=false
		$result = search_development2::calculate_inverse_locators( $locator );

			
		/*
		$ar_filter=array();
		foreach ($options->fields as $key => $value) {

			if ($value!==false) {
				$ar_filter[] = "\"$key\":\"$value\"";
			}
		}
		$compare = '{'. implode(",", $ar_filter). '}';
			#dump($compare, ' compare ++ '.to_string($options));
		
		// Iterate tables and make union search		
		$ar_query=array();
		foreach ((array)$options->ar_tables as $table) {
			$query  = " SELECT section_tipo, section_id, datos#>'{relations}' AS relations 
						FROM \"$table\" 
						WHERE datos#>'{relations}' @> '[$compare]'::jsonb 
						";
			$ar_query[] = $query;
		}

		$strQuery  = '';
		$strQuery .= implode(" UNION ALL ", $ar_query);
		// Set order to maintain results stable
		$strQuery .= " ORDER BY section_id ASC";
		#dump(null, ' strQuery ++ '.to_string($strQuery));

		$result = JSON_RecordObj_matrix::search_free($strQuery);

		$ar_rows = [];
		while ($rows = pg_fetch_assoc($result)) {
			$ar_rows[] = $rows;
		}
		#dump($ar_rows, ' ar_rows ++ '.PHP_EOL . to_string($strQuery));
		*/
				

		return $result;
	}//end get_indexations_search



	/**
	* OLD_GET_INDEXATIONS_SEARCH
	* @return resource $result
	*//* DEPRECATED !
	public static function old_get_indexations_search( $request_options ) {

		$options = new stdClass();
			$options->fields = new stdClass();
				$options->fields->section_tipo 	= false;
				$options->fields->section_id 	= false;
				$options->fields->component_tipo= false;
				$options->fields->type 			= DEDALO_RELATION_TYPE_INDEX_TIPO;
				$options->fields->tag_id 		= false;
			$options->ar_tables 			= array('matrix_hierarchy');

			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		#$result = component_relation_common::get_indexations_search($options);
		
		$ar_filter=array();
		foreach ($options->fields as $key => $value) {

			if ($value!==false) {
				$ar_filter[] = "\"$key\":\"$value\"";
			}
		}
		$compare = '{'. implode(",", $ar_filter). '}';
			#dump($compare, ' compare ++ '.to_string($options));
		
		// Iterate tables and make union search		
		$ar_query=array();
		foreach ((array)$options->ar_tables as $table) {
			$query  = " SELECT section_tipo, section_id, datos#>'{relations}' AS relations 
						FROM \"$table\" 
						WHERE datos#>'{relations}' @> '[$compare]'::jsonb 
						";
			$ar_query[] = $query;
		}

		$strQuery  = '';
		$strQuery .= implode(" UNION ALL ", $ar_query);
		// Set order to maintain results stable
		$strQuery .= " ORDER BY section_id ASC";
		#dump(null, ' strQuery ++ '.to_string($strQuery));

		$result = JSON_RecordObj_matrix::search_free($strQuery);

		#$ar_rows = [];
		#while ($rows = pg_fetch_assoc($result)) {
		#	$ar_rows[] = $rows;
		#}
		#dump($ar_rows, ' ar_rows ++ '.PHP_EOL . to_string($strQuery));
			dump(null, 'null $strQuery ++ '.to_string($strQuery));
				

		return $result;
	}//end old_get_indexations_search
	*/



	/**
	* GET_INDEXATIONS_FOR_LOCATOR
	* @return array $ar_indexations
	*//* DEPRECATED !
	public static function get_indexations_for_locator( $locator ) {
		
		$ar_indexations = array();

		$options = new stdClass();
			$options->fields = new stdClass();
				$options->fields->section_tipo 	= $locator->section_tipo;
				$options->fields->section_id 	= $locator->section_id;
				$options->fields->type 			= DEDALO_RELATION_TYPE_INDEX_TIPO;	
			$options->ar_tables 			= array('matrix_hierarchy');
				#dump($options, ' options ++ '.to_string()); die();

		$result = component_relation_index::old_get_indexations_search( $options );
		$count = 0;
		while ($rows = pg_fetch_assoc($result)) {

			$current_section_id   	= $rows['section_id'];
			$current_section_tipo 	= $rows['section_tipo'];
			
			#$relations 				= json_decode($rows['relations']);
			#	#dump($relations, ' $relations **** ++ '.to_string($locator->section_tipo."-".$locator->section_id));
			#$relation_index_locator = component_relation_index::get_locator_from_ar_relations($relations, $locator->section_tipo, $locator->section_id, $options->fields->type, $tag_id=false);
			#	#dump($relation_index_locator, ' $relation_index_locator **** ++ '.to_string($locator->section_tipo."-".$locator->section_id." -- $current_section_tipo-$current_section_id"));
			
			$pseudo_locator = new locator();
				$pseudo_locator->set_section_tipo($current_section_tipo);
				$pseudo_locator->set_section_id($current_section_id);

			
			$locator_json = json_encode($pseudo_locator);
			$ar_indexations[$locator_json] = 1;
				#dump($locator_json, ' locator_json ++ '.to_string());
		}
		dump($ar_indexations, ' ar_indexations +++++++!! '.to_string($locator->section_tipo."-".$locator->section_id));

		return (array)$ar_indexations;
	}//end get_indexations_for_locator
	*/



	/**
	* GET_LOCATOR_FROM_AR_RELATIONS
	* Find searched locator in array of locators
	* Used to locate the correct locator inside relations container returned for SQL search
	* @return objet $current_locator | null
	*/
	public static function get_locator_from_ar_relations($relations, $section_tipo, $section_id, $type, $tag_id=false) {

		// Locator to find
		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);
			$locator->set_type($type);
			
			if ($tag_id!==false) 
				$locator->set_tag_id($tag_id);			
			

		$ar_properties = array_keys((array)$locator);
			#dump($ar_properties, ' $ar_properties ++ '.to_string());	

		foreach ((array)$relations as $current_locator) {
			
			if (true===locator::compare_locators($current_locator, $locator, $ar_properties) ) {
				// Full locator (with from tipo)
				return $current_locator;
			}
		}
		debug_log(__METHOD__." Zero locators are located in relations data. This is abnormal situation. Please review this data. ar_relations: ".to_string($relations), logger::ERROR);
		
		return null;
	}//end get_locator_from_ar_relations

	

	/**
	* BUILD_SEARCH_COMPARISON_OPERATORS 
	* Note: Override in every specific component
	* @param array $comparison_operators . Like array('=','!=')
	* @return object stdClass $search_comparison_operators
	*//* DEPRECATED
	public function build_search_comparison_operators( $comparison_operators=array('=','!=') ) {
		
		return (object)parent::build_search_comparison_operators($comparison_operators);
	}#end build_search_comparison_operators
	*/



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
	public static function get_search_query( $json_field, $search_tipo, $tipo_de_dato_search=null, $current_lang=null, $search_value='', $comparison_operator='=') {
		$search_query='';
		if ( empty($search_value) ) {
			return $search_query;
		}
		$json_field = 'a.'.$json_field; // Add 'a.' for mandatory table alias search
		
		switch (true) {
			case $comparison_operator==='=':
				$search_query = " {$json_field}#>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' @> '[$search_value]'::jsonb ";
				break;
			case $comparison_operator==='!=':
				$search_query = " ({$json_field}#>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' @> '[$search_value]'::jsonb)=FALSE ";
				break;
		}
		
		if(SHOW_DEBUG) {
			$search_query = " -- filter_by_search $search_tipo ". get_called_class() ." \n".$search_query;
			#dump($search_query, " search_query for search_value: ".to_string($search_value)); #return '';
		}

		return $search_query;
	}//end get_search_query



	/**
	* GET_COMPONENT_RELATION_INDEX_FROM_SECTION_TIPO
	* @return 
	*//*
	public static function get_component_relation_index_from_section_tipo($section_tipo) {
		
		$ar_children = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, array('component_relation_index'), $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true);
	}//end get_component_relation_index_from_section_tipo
	*/



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() {
		
		$ar_operators = [
			'*' 	 => 'no_vacio', // not null
			'=' 	 => 'vacio'
		];

		return $ar_operators;
	}//end search_operators_info
	
	

}//end component_relation_index
?>