
<?php
/*
* CLASS COMPONENT_CALCULATION
*/

class component_calculation extends component_common {
	
	# GET DATO
	public function get_dato() {
		$dato = parent::get_dato();
		
		return $dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( $dato );			
	}
	
	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {

		# Dato candidate to save
		$dato = $this->dato;

		# Unactive
		logger_backend_activity::$enable_log = false;	# Disable logging activity and time machine # !IMPORTANT
		RecordObj_time_machine::$save_time_machine_version = false; # Disable logging activity and time machine # !IMPORTANT

		# Save		
		$result = parent::Save();
		
		# Reactivate
		logger_backend_activity::$enable_log = true;	# Disable logging activity and time machine # !IMPORTANT
		RecordObj_time_machine::$save_time_machine_version = true; # Disable logging activity and time machine # !IMPORTANT

		return $result;
	}#end Save

	/**
	* GET_JSON_FORMULA
	* @return $propiedades->formula;
	*/
	public function get_JSON_formula() {

		$propiedades = $this->get_propiedades();

		if(empty($propiedades->formula)){
			return false;
		}else{
			return $propiedades->formula;
		}
		
	}//end get_JSON_formula

	/**
	* RESOLVE_DATA_FOR_FORMULA
	* @return 
	*/
	public function resolve_data_for_formula($data) {

		if(!isset($data)) return false;

		$data_resolved = new StdClass;

		//set the section tipo
		if ($data->section_tipo == 'current') {
			 $section_tipo = $this->section_tipo;
		}else{
			 $section_tipo = $data->section_tipo ;
		}

		//set the section id
		switch ($data->section_id) {
			case 'current':
				$section_id = $this->parent;

				foreach ($data->component_tipo as $component_tipo) {
					$component 		= new RecordObj_dd($component_tipo);
					$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);

					if($component->get_traducible() === 'no'){
						$lang = DEDALO_DATA_NOLAN;
					}else{
						$lang = DEDALO_DATA_LANG;
					}

					$current_componet = component_common::get_instance($modelo_name,
																		 $component_tipo,
																		 $section_id,
																		 'edit',
																		 $lang,
																		 $section_tipo);
					$data_resolved->$component_tipo = $current_componet->get_valor();
				}// end foreach ($data->component_tipo as $component_tipo)

				break;
			case 'all':
			/*
				$search_options_session_key = 'section_'.$this->section_tipo.$this->component_tipo;
					#dump($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key], ' _SESSION[] ++ '.to_string());
				$current_options = $_SESSION['dedalo4']['config']['search_options'][$search_options_session_key];


				if (isset($_SESSION['dedalo4']['config']['sum_total'][$search_options_session_key])) {
					
					# Precalculated value
					$total = $_SESSION['dedalo4']['config']['sum_total'][$search_options_session_key];

				}else{
*/
					foreach ($data->component_tipo as $component_tipo) {
						$component 		= new RecordObj_dd($component_tipo);
						$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);

						if($component->get_traducible() === 'no'){
							$lang = DEDALO_DATA_NOLAN;
						}else{
							$lang = DEDALO_DATA_LANG;
						}

						$search_options = new StdClass;
						$search_options->section_tipo =$section_tipo;
						$search_options->component_tipo =$component_tipo;
						$search_options->matrix_table =common::get_matrix_table_from_tipo($section_tipo);

						$data_resolved->$component_tipo = $this->get_sum_from_component_tipo($search_options);
					}

					# Store for speed
					#$_SESSION['dedalo4']['config']['sum_total'][$search_options_session_key] = $total;
				#}

				break;
			default:
				$section_id = $data->section_id ;
				break;
		}

		// set the value of true variable
		switch (true) {
			case isset($data->true) && isset($data->true->ar_locators):

				$ar_locators = json_decode( str_replace("'", '"', $data->true->ar_locators) );
				
				$options = new stdClass();
					$options->lang 				= DEDALO_DATA_LANG;	
					$options->data_to_be_used 	= 'valor';
					$options->ar_locators 		= $ar_locators;
					$options->separator_rows 	= isset($data->true->separator_rows) ? $data->true->separator_rows : false;
					$options->separator_fields 	= isset($data->true->separator_fields) ? $data->true->separator_fields : false;

					$valor_from_ar_locators 	= $this->get_valor_from_ar_locators($options);
						#dump($valor_from_ar_locators, ' valor_from_ar_locators');$valor_from_ar_locators->result
					$data_resolved->true = $valor_from_ar_locators->result;
				break;
			case isset($data->true):
				$data_resolved->true = $data->true;
				break;
			}

		// set the value of false variable
		switch (true) {
			case isset($data->false) && isset($data->false->ar_locators):
				$ar_locators = json_decode( str_replace("'", '"', $data->false->ar_locators) );
				
				$options = new stdClass();
					$options->lang 				= DEDALO_DATA_LANG;	
					$options->data_to_be_used 	= 'valor';
					$options->ar_locators 		= $ar_locators;
					$options->separator_rows 	= isset($data->false->separator_rows) ? $data->false->separator_rows : false;
					$options->separator_fields 	= isset($data->false->separator_fields) ? $data->false->separator_fields : false;

				$valor_from_ar_locators 	= $this->get_valor_from_ar_locators($options);
						#dump($valor_from_ar_locators, ' valor_from_ar_locators');$valor_from_ar_locators->result
				$data_resolved->false = $valor_from_ar_locators->result;
				break;
			case isset($data->flase):
				$data_resolved->false = $data->true;
				break;
		}

		//set the filter
		// NEED TO BE DEFINED
		
		return $data_resolved;
	}//end resolve_data_for_formula


	/**
	* APPLY_FORMULA
	* @return 
	*/
	public function preprocess_formula() {
		$formula 	= $this->get_JSON_formula();
			//dump($formula, ' formula ++ '.to_string());
		
		foreach ($formula as $current_formula) {
			$data 		= $this->resolve_data_for_formula($current_formula->data);
			$rules 		= $current_formula->rules;
		}
		$preprocess_formula 		= new StdClass;
		$preprocess_formula->data 	= $data;
		$preprocess_formula->rules 	= $rules;

		#dump($preprocess_formula, ' preprocess_formula ++ '.to_string());

		return $preprocess_formula;	
		
	}//end apply_formula


	/**
	* GET_SUM_FROM_COMPONENT_TIPO
	* @return 
	*/
	public function get_sum_from_component_tipo($search_options) {

		$options = new stdClass();
			$options->section_tipo 		= $search_options->section_tipo;
			#$options->section_real_tipo = $current_options->section_real_tipo;
			#$options->json_field 		= $current_options->json_field;
			$options->modo 				= 'list';
			$options->matrix_table 		= $search_options->matrix_table;
			#$options->limit 			= 0;	//$current_options->limit_list;
			#$options->full_count 		= false; //$current_options->full_count;
			#$options->offset 			= 0;	//$current_options->offset_list;
			$options->sql_columns 		= "a.id";
			$options->query_wrap 		 = "\n SELECT SUM( CAST( a.datos#>>'{components, $search_options->component_tipo, dato, lg-nolan}' AS REAL )) AS total";
			$options->query_wrap 		.= "\n FROM \"$search_options->matrix_table\" a";
			$options->query_wrap 		.= " WHERE a.id IN (%s);";
		
		$rows_data = search::get_records_data($options);
			#dump($rows_data, ' $rows_data ++ '.to_string());

		$total = isset($rows_data->result[0][0]['total']) ? $rows_data->result[0][0]['total'] : 0;
			#dump($total, ' total ++ '.to_string());

		return $total;
		
	}//end get_sum_from_component_tipo
		
}
?>