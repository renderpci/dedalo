<?php



///////// autocomplete



	/**
	* GET VALOR
	* Get resolved string representation of current value (expected id_matrix of section or array)
	* @param $lang=DEDALO_DATA_LANG
	* @param $format='string'
	* @param $fields_separator=' | '
	* @param $records_separator='<br>'
	* @param $ar_related_terms=false
	* @param $data_to_be_used='valor'
	* @return array|string $this->valor
	*/
	$_get_valor = function( $lang=DEDALO_DATA_LANG, $format='string', $fields_separator=' | ', $records_separator='<br>', $ar_related_terms=false, $data_to_be_used='valor' ) {

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
				return null;
			}
		}

		$propiedades 	 = $this->get_propiedades();
		$search_list_add = isset($propiedades->search_list_add) ? $propiedades->search_list_add : false;

		# AR_COMPONETS_RELATED. By default, ar_related_terms is calculated. In some cases (diffusion for example) is needed overwrite ar_related_terms to obtain especific 'valor' form component
			if ($ar_related_terms===false) {

				$ar_componets_related = array();

				$ar_related_terms = $this->ontology_node->get_relations();

				foreach ((array)$ar_related_terms as $ar_value) foreach ($ar_value as $model => $component_tipo) {
					$model_name = ontology_node::get_model_name_by_tipo($component_tipo, true);
					if ($model_name!=='section'){
						$ar_componets_related[] = $component_tipo;
					}
				}

			}else{
				$ar_componets_related = (array)$ar_related_terms;
			}

		# lang never must be DEDALO_DATA_NOLAN
		if ($lang===DEDALO_DATA_NOLAN) $lang=DEDALO_DATA_LANG;


		$ar_values = array();

		// fields_separator
			// $fields_separator   = $this->get_fields_separator();
			$fields_separator = (isset($propiedades->source->divisor))
				? $propiedades->source->divisor
				: $fields_separator; // ' | ';

		foreach ($dato as $current_locator) {

			if(isset($propiedades->source->search)){
				foreach ($propiedades->source->search as $current_search) {
					if($current_search->section_tipo === $current_locator->section_tipo){
						$ar_componets_related =  $current_search->components;
					}
				}
			}

			$current_locator_json = json_encode($current_locator);

			$ar_current_value=array();
			foreach ($ar_componets_related as $component_tipo) {

				$model_name 	   = ontology_node::get_model_name_by_tipo($component_tipo, true);
				$current_component = component_common::get_instance(
					$model_name,
					$component_tipo,
					$current_locator->section_id,
					'list',
					$lang,
					$current_locator->section_tipo
				);

				$current_value = $current_component->extract_component_value_fallback($lang, true);

				#$ar_current_value[$current_locator->section_tipo.'_'.$current_locator->section_id] = $current_value;
				$value_obj = new stdClass();
					$value_obj->key 	= $current_locator_json;
					$value_obj->value 	= $current_value;

				$ar_current_value[] = $value_obj;
			}//end foreach ($ar_componets_related as $component_tipo)


			$ar_current_values_clean = [];
			foreach ($ar_current_value as $value_obj) {
				if (empty($value_obj->value) || $value_obj->value==='<mark></mark>' || $value_obj->value===' ') {
					#continue;
					$ar_current_values_clean[] = ''; // $value_obj->key; // locator encoded as json
				}else{
					$ar_current_values_clean[] = $value_obj->value;
				}
			}
			$value = implode($fields_separator, $ar_current_values_clean);

			// search_list_add . Add custom resolved values from same section. For example, add municipality for resolve a name ambiguity
				if ($search_list_add!==false) {
					$ar_dd_value = [];
					foreach ($search_list_add as $add_tipo) {
						$model_name 	= ontology_node::get_model_name_by_tipo($add_tipo,true);
						$component 		= component_common::get_instance(
							$model_name,
							$add_tipo,
							$current_locator->section_id,
							'list',
							$lang,
							$current_locator->section_tipo
						);
						$current_value = strip_tags( $component->get_valor(DEDALO_DATA_LANG) );
						if (!empty($current_value)) {
							$ar_dd_value[] = $current_value;
						}
					}
					if (!empty($ar_dd_value)) {
						$value .= $fields_separator . implode($fields_separator, $ar_dd_value); // Add string to existing value
					}
				}

			#$ar_values[$current_locator_json] = $value;
			$value_obj = new stdClass();
				$value_obj->value 	= $current_locator;
				$value_obj->label 	= $value;
			$ar_values[] = $value_obj;
		}

		if ($format==='array') {
			$valor = $ar_values;
		}else{
			#$valor = implode($fields_separator, $ar_values);
			$ar_labels = array_map(function($element){
				return $element->label;
			}, $ar_values);
			$valor = implode($fields_separator, $ar_labels);
		}


		return $valor;
	};//end get valor



	/**
	* GET_VALOR_EXPORT
	* Return component value sent to export data
	* @param $valor=null
	* @param $lang=DEDALO_DATA_LANG
	* @param $quotes=null
	* @param $add_id=null
	* @return string $valor_export
	*/
	$_get_valor_export = function ( $valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null ) {

		if (empty($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed JSON string as dato
		}

		$valor_export = $this->get_valor($lang);
		$valor_export = br2nl($valor_export);


		return $valor_export;
	};//end get_valor_export



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a MYSQL field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @param $lang=null
	* @param $option_obj=null
	* @return string $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	$_get_diffusion_value = function( $lang=null, $option_obj=null ) : string {
		// global $_get_valor;

		// force recalculate for each lang
			unset($this->valor);

		// is_publicable from propiedades. case Bibliography 'rsc368'
			$propiedades	= $this->get_propiedades(true);
			$is_publicable	= (bool)(isset($propiedades->is_publicable) && $propiedades->is_publicable===true);

		// diffusion_properties
			$diffusion_properties = $this->get_diffusion_properties();

		// fields_separator. (!) Note here that more than one value can be returned by this method. To avoid duplicity of ',' separator, use '-' as default
			$fields_separator_default = ' | ';
		// fields_separator
			// $fields_separator   = $this->get_fields_separator();
			switch (true) {
				case isset($option_obj->divisor):
					$fields_separator = $option_obj->divisor;
					break;
				case isset($this->diffusion_properties->option_obj) &&
					 isset($this->diffusion_properties->option_obj->divisor) :
					$fields_separator = $this->diffusion_properties->option_obj->divisor;
					break;
				case isset($diffusion_properties->source->divisor):
					$fields_separator = $diffusion_properties->source->divisor;
					break;
				case isset($propiedades->source->divisor):
					$fields_separator = $propiedades->source->divisor;
					break;
				case isset($diffusion_properties->separator_fields):
					$fields_separator = $diffusion_properties->separator_fields;
					break;
				// records_separator
				case isset($diffusion_properties->separator_rows):
					$records_separator = $diffusion_properties->separator_rows;
					break;
				default:
					$fields_separator = $fields_separator_default;
					break;
			}

		// get_valor : ($lang=DEDALO_DATA_LANG, $format='string', $ar_related_terms=false, $fields_separator='<br> ')
			$value = $this->get_valor($lang, 'array', $fields_separator, $records_separator ?? null);
			// value sample:
				// [
				//     {
				//         "value": {
				//             "type": "dd151",
				//             "section_id": "4551",
				//             "section_tipo": "rsc194",
				//             "from_component_tipo": "rsc139"
				//         },
				//         "label": "<mark>Ripollès Alegre (Universitat de València)</mark>, <mark>Pere Pau</mark>"
				//     },
				//     {
				//         "value": {
				//             "type": "dd151",
				//             "section_id": "3125",
				//             "section_tipo": "rsc194",
				//             "from_component_tipo": "rsc139"
				//         },
				//         "label": "<mark>Llorens Forcada</mark>, <mark>Maria del Mar</mark>"
				//     }
				// ]

		$diffusion_value_clean = [];
		foreach ($value as $item) {

			$locator_section_tipo	= $item->value->section_tipo;
			$section_table			= common::get_matrix_table_from_tipo($locator_section_tipo);
			$current_is_publicable	= (
				$is_publicable===true ||
				$section_table==='matrix_list' ||
				$section_table==='matrix_hierarchy' ||
				$section_table==='matrix_dd'
				)
				? true
				: diffusion::get_is_publicable($item->value);

			if (true===$current_is_publicable) {
				$current_label = $item->label ?? '';
				$diffusion_value_clean[] = strip_tags($current_label,'<img>');
			}
		}//end foreach ($value as $item)

		$diffusion_value = implode($fields_separator, $diffusion_value_clean);


		return (string)$diffusion_value;
	};//end get_diffusion_value
