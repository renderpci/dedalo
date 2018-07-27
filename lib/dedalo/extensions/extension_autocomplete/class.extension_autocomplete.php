<?php
/*
* CLASS EXTENSION_AUTOCOMPLETE
* search extension for components
* need at least, section_tipo and component_tipo for search.
* create the JSON_query_object, do the autocomplete to the matrix tables
* return the selected locator to the component that call it
*/
class extension_autocomplete extends extension_common {


	# ar_target_section_tipo. Used to fix section tipo (calculado a partir del componente relacionado de tipo section) Puede ser virtual o real
	public	$ar_target_section_tipo;
	public	$show_fields;
	public	$search_fields;
	public	$divisor;
	public	$modo;
	public	$filter_by_value;
	public	$filter_by_list;
	public	$limit;


	/*
	$ar_target_section_tipo	= $this->get_ar_target_section_tipo();
	$search_fields			= $this->get_search_fields();
	$show_fields			= $this->get_show_fields();
	$divisor 				= $this->get_divisor();
	$modo					= $this->get_modo();
	$filter_by_value		= $this->get_filter_by_value();
	$filter_by_list 		= $this->get_filter_by_list();
	$limit 					= $this->get_limit();
	*/


	/**
	* BUILD_SEARCH_QUERY_OBJECT
	* @return object $query_object
	*/
	public function build_search_query_object( $request_options ) {

		$start_time=microtime(1);
	
		$options = new stdClass();
			$options->q 	 			= null;
			$options->limit  			= 10;
			$options->offset 			= 0;
			$options->lang 				= 'all';
			$options->logical_operator 	= '$or';
			$options->id 				= 'temp';
			$options->section_tipo		= null;
			$options->add_filter		= true;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$id 				= $options->id;
		$logical_operator 	= $options->logical_operator;

		# Defaults
		$filter_group = null;
		$select_group = array();

		# Default from options
		$section_tipo = $options->section_tipo;

		# iterate related terms
		$ar_related_section_tipo = common::get_ar_related_by_model('section', $this->tipo);
		if (isset($ar_related_section_tipo[0])) {	

			# Create from related terms
			$section_tipo 				= reset($ar_related_section_tipo); // Note override section_tipo here !
			$ar_terminos_relacionados 	= RecordObj_dd::get_ar_terminos_relacionados($this->tipo, true, true);		
			foreach ($ar_terminos_relacionados as $current_tipo) {
				
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo, true);
				if (strpos($modelo_name,'component')!==0) continue;

				$path = search_development2::get_query_path($current_tipo, $section_tipo);

				# FILTER . filter_element (operator_group)
					if ($options->add_filter===true) {	
									
						$filter_element = new stdClass();
							$filter_element->q 		= $options->q;
							$filter_element->lang 	= $options->lang;
							$filter_element->path 	= $path;

						if(!isset($filter_group)) {
							$filter_group = new stdClass();
						}
						$filter_group->$logical_operator[] = $filter_element;
					}
				# SELECT . Select_element (select_group)
					# Add options lang
					$end_path = end($path);
					$end_path->lang = $options->lang;

					$select_element = new stdClass();
						$select_element->path = $path;						

					$select_group[] = $select_element;
			}
		}
				
		$query_object = new stdClass();
			$query_object->id  	   		= $id;
			$query_object->section_tipo = $section_tipo;
			$query_object->filter  		= $filter_group;
			$query_object->select  		= $select_group;			
			$query_object->limit   		= $options->limit;
			$query_object->offset  		= $options->offset;
		
		#dump( json_encode($query_object, JSON_PRETTY_PRINT), ' query_object ++ '.to_string());
		#debug_log(__METHOD__." query_object ".json_encode($query_object, JSON_PRETTY_PRINT), logger::DEBUG);totaol
		#debug_log(__METHOD__." total time ".exec_time_unit($start_time,'ms').' ms', logger::DEBUG);
		

		return (object)$query_object;
	}//end build_search_query_object



	/**
	* GET_SHOW_FIELDS
	* @return 
	*/
	public function get_show_fields() {

		$propiedades = $this->get_propiedades();
		$show_fields = false;

		if(isset($propiedades->show_fileds)){
			$show_fields = $propiedades->show_fileds;
		}

		return $show_fields;
	}//end get_show_fields


	/**
	* GET_DIVISOR
	* @return 
	*/
	public function get_divisor() {

		$propiedades = $this->get_propiedades();
		$divisor = " | ";

		if(isset($propiedades->divisor)){
			$divisor = $propiedades->divisor;
		}

		return $divisor;		
	}//end get_divisor


	/**
	* GET_FILTER_BY_VALUE
	* @return 
	*/
	public function get_filter_by_value() {

		$propiedades = $this->get_propiedades();
		$filter_by_value = null;

		if(isset($propiedades->filter_by_value)){
			$filter_by_value = $propiedades->filter_by_value;
		}

		return $filter_by_value;		
	}//end get_filter_by_value


	/**
	* GET_FILTER_BY_LIST
	* @return 
	*/
	public function get_filter_by_list() {

		$propiedades = $this->get_propiedades();
		$filter_by_list = null;

		if(isset($propiedades->filter_by_list)){
			$filter_by_list = $propiedades->filter_by_list;
		}

		return $filter_by_list;		
	}//end get_filter_by_list


	/**
	* GET_LIMIT
	* @return 
	*/
	public function get_limit() {

		$propiedades = $this->get_propiedades();
		$limit = 40;

		if(isset($propiedades->limit)){
			$limit = $propiedades->limit;
		}

		return $limit;		
	}//end get_limit




	/**
	* GET_TIPO_TO_SEARCH
	* Locate in structure TR the component tipo to search
	* @return string $tipo_to_search
	*/
	public function get_tipo_to_search($options=null) {

		if(isset($this->tipo_to_search)) {
			return $this->tipo_to_search;
		}

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
	* @return array $ar_result
	*/
	public function autocomplete_search($search_query_object, $divisor=', ') {
	
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
					#if (!empty($value)) {
						$ar_full_label[] = strip_tags($value);
					#}
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
	}//end autocomplete_search



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



}
?>