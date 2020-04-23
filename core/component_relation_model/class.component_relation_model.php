<?php
/*
* CLASS COMPONENT_RELATION_MODEL
*
*
*/
class component_relation_model extends component_relation_common {
	
	
	protected $relation_type = DEDALO_RELATION_TYPE_MODEL_TIPO;

	# test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');



	/**
	* GET_VALOR
	* Get value . default is get dato . overwrite in every different specific component
	* @return string | null $valor
	*/
	public function get_valor($lang=DEDALO_DATA_LANG, $separator=', ') {

		$dato = $this->get_dato();
		if (empty($dato)) {
			return null;
		}
			
		# debug. Test dato format (b4 changed to object)
			if(SHOW_DEBUG) {
				foreach ($dato as $key => $current_value) {
					if (!is_object($current_value)) {
						if(SHOW_DEBUG) {
							dump($dato," dato");
						}
						trigger_error(__METHOD__." Wrong dato format. OLD format dato in $this->label $this->tipo .Expected object locator, but received: ".gettype($current_value) .' : '. print_r($current_value,true) );
						return null;
					}
				}
			}
		
		$ar_values = [];
		foreach ($dato as $key => $value) {
			$current_label = component_relation_common::get_locator_value($value, $lang, false);
			$ar_values[] = $current_label;
		}
		$valor = implode($separator, $ar_values);	


		return $valor;
	}//end get_valor



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
	
		$diffusion_value = $this->get_valor($lang);
		$diffusion_value = strip_tags($diffusion_value);
	
		return (string)$diffusion_value;
	}//end get_diffusion_value



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

		$target_mode = isset($this->propiedades->target_mode) ? $this->propiedades->target_mode : null;
		switch ($target_mode) {
			case 'free':
				# Defined in structure
				$ar_target_section_tipo = (array)$this->propiedades->target_values;
				break;
			
			default:				
				// try to calculate from hierarchy section looking in target model value of hierarchy
					$section_tipo 				= $this->section_tipo;
					$hierarchy_component_tipo 	= DEDALO_HIERARCHY_TARGET_SECTION_TIPO;
					$section_id = hierarchy::get_hierarchy_section($section_tipo, $hierarchy_component_tipo);

					if (!empty($section_id)) {
						// get target section model component value 
							$model 			= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO,true);
							$component 		= component_common::get_instance($model,
																			 DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO,
																			 $section_id,
																			 'list',
																			 DEDALO_DATA_NOLAN,
																			 DEDALO_HIERARCHY_SECTION_TIPO);

							$target_section_tipo 	= $component->get_valor();
							
					
					}

				// final fallback (calculated from current prefix)
					if (empty($target_section_tipo)) {
						$prefix = RecordObj_dd::get_prefix_from_tipo($section_tipo);
						$target_section_tipo = $prefix.'2';
					}
					
				// set into array 
					$ar_target_section_tipo = [$target_section_tipo];
				break;
		}
		
		
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
	public static function get_search_query( $json_field, $search_tipo, $tipo_de_dato_search, $current_lang, $search_value, $comparison_operator='=') {
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
	
	

}//end component_relation_model
?>