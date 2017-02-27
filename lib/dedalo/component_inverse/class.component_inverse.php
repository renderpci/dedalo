<?php
/*
* CLASS COMPONENT_INVERSE
*
*
*/
class component_inverse extends component_common {
	


	/**
	* GET_DATO
	* This component don't store data, only access to section inverse_locators data
	* @return array $dato
	*/
	public function get_dato() {

		$section = section::get_instance($this->parent, $this->section_tipo);
		$dato 	 = $section->get_inverse_locators();

		return (array)$dato;
	}//end get_dato


	
	/**
	* GET_VALOR
	* @return string $valor
	*/
	public function get_valor() {

		$dato = $this->get_dato();

		return (string)json_encode($dato);
	}//end get_valor


	/**
	* RENDER_LIST_VALUE
	* (Overwrite for non default behaviour)
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
		
		$component 	= component_common::get_instance(__CLASS__,
													 $tipo,
												 	 $parent,
												 	 'list',
													 DEDALO_DATA_NOLAN,
												 	 $section_tipo);

		
		# Use already query calculated values for speed
		$ar_records   = (array)json_handler::decode($value);
		$component->set_dato($ar_records);
		$component->set_identificador_unico($component->get_identificador_unico().'_'.$section_id.'_'.$caller_component_tipo); // Set unic id for build search_options_session_key used in sessions

		$value = $component->get_html();

		return $value;
	}//end render_list_value


	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null ) {

		# When is received 'valor', set as dato to avoid trigger get_dato against DB 
		# Received 'valor' is a json string (array of locators) from previous database search
		if (!is_null($valor)) {
			$dato = json_decode($valor);
			$this->set_dato($dato);
		}else{
			$dato = $this->get_dato();
		}
		
			
		$inverse_show = $this->get_propiedades()->inverse_show;

		$ar_lines = [];
		foreach ($dato as $key => $current_locator) {

			$line = '';
			foreach ($inverse_show as $ikey => $ivalue) {
				if ($ivalue===false) continue;

				# section_id
				if ($ikey === 'section_id') {
					if(strlen($line)>0) $line .= ' ';
					$line .= $current_locator->section_id;
				}

				# section_tipo
				if ($ikey === 'section_tipo') {
					if(strlen($line)>0) $line .= ' ';
					$line .= $current_locator->section_tipo;
				}

				# section_label
				if ($ikey === 'section_label') {
					if(strlen($line)>0) $line .= ' ';
					$label = RecordObj_dd::get_termino_by_tipo($current_locator->section_tipo, $lang);
					$line .= $label;
				}

				# component_tipo
				if ($ikey === 'component_tipo') {
					if(strlen($line)>0) $line .= ' ';
					$line .= $current_locator->component_tipo;
				}

				# component_label
				if ($ikey === 'component_label') {
					if(strlen($line)>0) $line .= ' ';
					$label = RecordObj_dd::get_termino_by_tipo($current_locator->component_tipo, $lang);
					$line .= $label;
				}
			}			
			
			$ar_lines[] = $line;
		}
		$lines = implode(PHP_EOL, $ar_lines);
		
		
		return $lines;
	}#end get_valor_export



	/**
	* BUILD_SEARCH_COMPARISON_OPERATORS 
	* Note: Override in every specific component
	* @param array $comparison_operators . Like array('=','!=')
	* @return object stdClass $search_comparison_operators
	*/
	public function build_search_comparison_operators( $comparison_operators=array('=','!=') ) {
		return (object)parent::build_search_comparison_operators($comparison_operators);
	}//end build_search_comparison_operators



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

		$search_value_edit = '[{"section_id":"'.$search_value.'"}]';

		switch (true) {
			case $comparison_operator==='!=':
				$search_query = " ($json_field#>'{inverse_locators}' @> '".$search_value_edit."'::jsonb)=FALSE ";
				break;

			case $comparison_operator==='=':
			default:
				$search_query = " $json_field#>'{inverse_locators}' @> '".$search_value_edit."'::jsonb "; 
				break;
		}
		
		
		
		if(SHOW_DEBUG) {
			$search_query = " -- filter_by_search $search_tipo ". get_called_class() ." \n".$search_query;
			#dump($search_query, " search_query for search_value: ".to_string($search_value)); #return '';
		}
		return $search_query;
	}//end get_search_query

	
	
	
}//end class component_inverse
?>