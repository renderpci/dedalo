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
	public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null) {

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

			$section_id   	= $current_locator->from_section_id;
			$section_tipo 	= $current_locator->from_section_tipo;
			$component_tipo = $current_locator->from_component_tipo;

			$line = '';
			foreach ($inverse_show as $ikey => $ivalue) {
				if ($ivalue===false) continue;

				# section_id
				if ($ikey === 'section_id') {
					if(strlen($line)>0) $line .= ' ';
					#$line .= $current_locator->section_id;
					$line .= $section_id;
				}

				# section_tipo
				if ($ikey === 'section_tipo') {
					if(strlen($line)>0) $line .= ' ';
					#$line .= $current_locator->section_tipo;
					$line .= $section_tipo;
				}

				# section_label
				if ($ikey === 'section_label') {
					if(strlen($line)>0) $line .= ' ';
					$label = RecordObj_dd::get_termino_by_tipo($section_tipo, $lang);
					$line .= $label;
				}

				# component_tipo
				if ($ikey === 'component_tipo' || $ikey === 'from_component_tipo') {
					if(strlen($line)>0) $line .= ' ';
					$line .= $component_tipo;
				}

				# component_label
				if ($ikey === 'component_label') {
					if(strlen($line)>0) $line .= ' ';
					$label = RecordObj_dd::get_termino_by_tipo($component_tipo, $lang);
					$line .= $label;
				}
			}			
			
			$ar_lines[] = $line;
		}
		$lines = implode(PHP_EOL, $ar_lines);
		
		
		return $lines;
	}//end get_valor_export



	/**
	* BUILD_SEARCH_COMPARISON_OPERATORS 
	* Note: Override in every specific component
	* @param array $comparison_operators . Like array('=','!=')
	* @return object stdClass $search_comparison_operators
	*/
	public function build_search_comparison_operators($comparison_operators=array('=','!=')) {
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
	public static function get_search_query($json_field, $search_tipo, $tipo_de_dato_search=null, $current_lang=null, $search_value='', $comparison_operator='=') {
		
		debug_log(__METHOD__." DISABLED OPTION !!! ".to_string(), logger::ERROR);
	}//end get_search_query



	/**
	* GET_INVERSE_VALUE
	* @return string $inverse_value
	*/
	public function get_inverse_value($locator) {

		$tipo = $this->get_tipo();			
		
		$ar_look_section_tipo = common::get_ar_related_by_model('section', $tipo);
		if (!isset($ar_look_section_tipo[0])) {
			return null;
		}
		$look_section_tipo = $ar_look_section_tipo[0];		
		if ($locator->from_section_tipo!==$look_section_tipo) {
			//debug_log(__METHOD__." Ignored section tipo ".to_string(), logger::DEBUG);
			return null;
		}

		$ar_value=array();
		$ar_related = $this->RecordObj_dd->get_relaciones();
		foreach ($ar_related as $key => $value) {
			#dump($value, ' value ++ '.to_string()); 
			$current_tipo = reset($value);
			$modelo_name  = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
			if ($modelo_name!=='section') {			
				# Components
				$component = component_common::get_instance( $modelo_name,
															 $current_tipo,
															 $locator->from_section_id,
															 'list',
															 DEDALO_DATA_LANG,
															 $locator->from_section_tipo);
				$value = $component->get_valor();
					#dump($value, ' value ++ '.to_string());
				#$ar_value[] = $modelo_name::render_list_value($locator, $current_tipo, $locator->section_id, 'list', DEDALO_DATA_LANG, $locator->from_section_tipo, $locator->section_id);
				$ar_value[] = $value;
			}
		}
		#dump($ar_value, ' $ar_value ++ '.$look_section_tipo.' -- '.to_string($locator));
		$inverse_value = implode('/ ',$ar_value);

		
		return (string)$inverse_value;	
	}//end get_inverse_value

	
	
	
}//end class component_inverse
?>