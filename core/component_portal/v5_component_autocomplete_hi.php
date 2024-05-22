<?php



///////// autocomplete_hi



	/**
	* GET VALOR
	* Get resolved string representation of current thesaurus value
	*/
	$_get_valor = function($lang=DEDALO_DATA_LANG, $format='string', $fields_separator=', ', $records_separator='<br>', $ar_related_terms=false, $data_to_be_used='valor') {

		// load data
			$dato = $this->get_dato();
			if ( empty($dato) ) {
				return ($format==='array') ? [] : '';
			}

		// check format
			if(!is_array($dato)) {
				return "Sorry, type:" .gettype($dato). " not supported yet (Only array format)";
			}

		// lang never must be DEDALO_DATA_NOLAN
			if ($lang===DEDALO_DATA_NOLAN) {
				$lang = DEDALO_DATA_LANG; // Force current lang as lang
			}

		// properties
			$propiedades	= $this->get_propiedades();
			$show_parents	= (isset($propiedades->value_with_parents) && $propiedades->value_with_parents===true) ? true : false;

		// dato iterate	and resolve each locator
			$ar_valor = array();
			foreach ($dato as $current_locator) {

				// current_valor array|null
				$current_valor = component_relation_common::get_locator_value(
					$current_locator, // object locator
					$lang, // string lang
					$show_parents, // bool show_parents
					null // array|null ar_components_related
				);
				if (!empty($current_valor)) {
					$current_valor = implode($fields_separator, $current_valor);
				}
				// $current_locator_string				= json_encode($current_locator);
				// $ar_valor[$current_locator_string]	= $current_valor;
				$ar_valor[]								= $current_valor;
			}//end foreach ($dato as $key => $current_locator)

		// set value based on format
			$valor = ($format==='array')
				? $ar_valor
				: implode($records_separator, $ar_valor);


		return $valor;
	};//end get_valor



	/**
	* GET_VALOR_EXPORT
	* Return component value sent to export data
	* @return string $valor
	*/
	$_get_valor_export = function ( $valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null ) {

		if (empty($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}

		$valor_export = $this->get_valor($lang);
		$valor_export = br2nl($valor_export);


		return $valor_export;
	};//end get_valor_export



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string|null $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	$_get_diffusion_value = function ( ?string$lang=DEDALO_DATA_LANG, object $option_obj=null) : ?string {

		$diffusion_value = null;

		$propiedades			= $this->get_propiedades();
		$diffusion_properties	= $this->get_diffusion_properties();

		// fields_separator. (!) Note here that more than one value can be returned by this method. To avoid duplicity of ',' separator, use '-' as default
			$fields_separator_default = ' - ';
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
				default:
					$fields_separator = $fields_separator_default;
					break;
			}

		// records_separator_default
			$records_separator_default = ', ';
			// records_separator
			// $records_separator   = $this->get_records_separator();
			switch (true) {
				case isset($option_obj->records_separator):
					$records_separator = $option_obj->records_separator;
					break;
				case isset($this->diffusion_properties->option_obj) &&
					 isset($this->diffusion_properties->option_obj->records_separator) :
					$records_separator = $this->diffusion_properties->option_obj->records_separator;
					break;
				case isset($diffusion_properties->source->records_separator):
					$records_separator = $diffusion_properties->source->records_separator;
					break;
				default:
					$records_separator = $records_separator_default;
					break;
			}

		// load dato
			$dato = $this->get_dato();
			if (empty($dato)) {
				return null;
			}

		if (empty($option_obj) || isset($option_obj->check_publishable)) {

			// default case
				// $diffusion_value = $this->get_valor($lang, 'string', $fields_separator, $records_separator);

			// lang never must be DEDALO_DATA_NOLAN
				if ($lang===DEDALO_DATA_NOLAN) {
					$lang = DEDALO_DATA_LANG; // Force current lang as lang
				}

			// properties
				$propiedades	= $this->get_propiedades();
				$show_parents	= (isset($propiedades->value_with_parents) && $propiedades->value_with_parents===true) ? true : false;

			// dato iterate	and resolve each locator
				$ar_value = [];
				foreach ($dato as $key => $current_locator) {

					// check_publishable
					if (isset($option_obj->check_publishable) && $option_obj->check_publishable===true) {
						$current_is_publicable = diffusion::get_is_publicable($current_locator);
						if ($current_is_publicable!==true) {
							// debug_log(__METHOD__." +++ Skip locator non publishable ".to_string($current_locator), logger::ERROR);
							continue;
						}
					}

					$current_value = component_relation_common::get_locator_value(
						$current_locator,
						$lang,
						$show_parents
					);
					if (!empty($current_value)) {
						$ar_value[] = implode($fields_separator, $current_value);
					}
				}//end foreach ($dato as $key => $current_locator)

			// set value based on format
				$diffusion_value = implode($records_separator, $ar_value);

		}else if(isset($option_obj->parent_section_tipo)) {

			$ar_parent_section_tipo = is_array($option_obj->parent_section_tipo)
				? $option_obj->parent_section_tipo
				: [$option_obj->parent_section_tipo];

			$add_parents = $option_obj->add_parents ?? false;

			$terms = [];
			foreach ($dato as $current_locator) {

				if (!in_array($current_locator->section_tipo, $ar_parent_section_tipo)) {
					continue; // ignore non desired sections
				}

				if (isset($option_obj->parent_term_id)) {

					// filtered by parents_recursive_data. We want only terms with parent given (see propiedades of isad98)
					// This is useful when we want to discriminate thesaurus branch by top parent in web

					// get_parents_recursive($section_id, $section_tipo, $skip_root=true, $is_recursion=false)
						$ar_parents = component_relation_parent::get_parents_recursive(
							$current_locator->section_id,
							$current_locator->section_tipo,
							(object)[
								'skip_root' => true
							]
						);

					$skip = true;
					foreach ($ar_parents as $current_parent_locator) {
						$current_term_id = $current_parent_locator->section_tipo.'_'.$current_parent_locator->section_id;
						if ($current_term_id===$option_obj->parent_term_id) {
							$skip = false;
							break;
						}
					}
					if ($skip===true) {
						continue; // ignore non desired items from different branch
					}
				}

				// Resolve terms
				$locator_values = component_relation_common::get_locator_value(
					$current_locator,
					$lang,
					$add_parents
				);
				foreach ($locator_values as $current_lv) {
					$terms[] = $current_lv;
				}
			}

			$diffusion_value = (isset($option_obj->parents_recursive_data) && $option_obj->parents_recursive_data===true)
				? json_encode($terms)
				: implode($fields_separator, $terms);

		}else{

			// properties options defined
			foreach ($option_obj as $key => $value) {

				if ($key==='add_parents') {

					$show_parents = (bool)$value;

					// parents recursive resolve
						$ar_diffusion_value = [];
						foreach ($dato as $current_locator) {

							// self term plus parents.
								// current_value array|null
								$current_value = component_relation_common::get_locator_value(
									$current_locator, // object locator
									$lang, // string lang
									$show_parents, // bool show_parents
									null // array|null ar_components_related
								);

								if (!empty($current_value)) {
									$ar_diffusion_value[] = implode($fields_separator, (array)$current_value);
								}

							// // get_parents_recursive($section_id, $section_tipo, $skip_root=true, $is_recursion=false)
							// $ar_parents = component_relation_parent::get_parents_recursive($current_locator->section_id, $current_locator->section_tipo, true);
							// $ar_terms = [];
							// foreach ($ar_parents as $parent_locator) {
							// 	$term = ts_object::get_term_by_locator( $parent_locator, $lang, $from_cache=true );
							// 	if (!empty($term)) {
							// 		$ar_terms[] = $term;
							// 	}
							// }
							// if (!empty($ar_terms)) {
							// 	// $diffusion_value .= $fields_separator . implode($fields_separator, $ar_terms);
							// 	$ar_diffusion_value = array_merge($ar_diffusion_value, $ar_terms);
							// }
						}

					$diffusion_value = implode($records_separator, $ar_diffusion_value);

				}else if ($key==='custom_parents') {

					$ar_diffusion_value = [];
					foreach ($dato as $current_locator) {

						$locator_terms = [];

						// self include. $locator, $lang=DEDALO_DATA_LANG, $show_parents=false, $ar_componets_related=false, $fields_separator=', ', $include_self=true
							// current_value array|null
							$current_value = component_relation_common::get_locator_value(
								$current_locator, // object locator
								$lang, // string lang
								false, // bool show_parents
								null // array|null ar_components_related
							);
							if (!empty($current_value)) {
								$locator_terms[] = implode(', ', $current_value);
							}

						// get_parents_recursive($section_id, $section_tipo, $skip_root=true, $is_recursion=false)
							$ar_parents = component_relation_parent::get_parents_recursive(
								$current_locator->section_id,
								$current_locator->section_tipo,
								(object)[
									'skip_root' => true
								]
							);

						// iterate parents
							$stopped	= false;
							$ar_terms	= [];
							foreach ($ar_parents as $parent_locator) {

								// parent_end_by_term_id. Uses a term_id as last valid parent
									if(isset($value->parent_end_by_term_id)){
										$current_term_id = $parent_locator->section_tipo.'_'.$parent_locator->section_id;
										if(in_array($current_term_id, $value->parent_end_by_term_id)){
											$stopped = true;
											break;
										}
									}

								// parent_end_by_model. Uses a model as last valid parent
									if(isset($value->parent_end_by_model)){
										$ar_tipo = section::get_ar_children_tipo_by_model_name_in_section(
											$parent_locator->section_tipo,
											['component_relation_model'],
											true,
											true,
											true,
											true
										);
										$component = component_common::get_instance(
											'component_relation_model',
											$ar_tipo[0],
											$parent_locator->section_id,
											'list',
											DEDALO_DATA_NOLAN,
											$parent_locator->section_tipo
										);
										$component_dato = $component->get_dato();
										if(isset($component_dato[0])){
											$current_term_id = $component_dato[0]->section_tipo.'_'.$component_dato[0]->section_id;
											if(in_array($current_term_id, $value->parent_end_by_model)){
												$stopped = true;
												break;
											}
										}
									}

									$term = ts_object::get_term_by_locator(
										$parent_locator,
										$lang,
										true // bool from_cache
									);
									if (!empty($term)) {
										$ar_terms[] = $term;
									}
							}

						// append whole or part of results when no empty
							if (!empty($ar_terms)) {

								// parents_splice. Selects a portion of the complete parents array
									if($stopped===false){
										if(isset($value->parents_splice)){
											$splice_values = is_array($value->parents_splice) ? $value->parents_splice : [$value->parents_splice];
											if (isset($splice_values[1])) {
												array_splice($ar_terms, $splice_values[0], $splice_values[1]);
											}else{
												array_splice($ar_terms, $splice_values[0]);
											}
										}
									}
								// append terms
									$locator_terms = array_merge($locator_terms, $ar_terms);
							}

						// join locator terms and append
							$ar_diffusion_value[] = implode(', ', $locator_terms);

					}//end foreach ($dato as $current_locator)

					// join all locator values
						$diffusion_value = implode($fields_separator, $ar_diffusion_value);

				}//end if ($key==='custom_parents')
			}//end foreach ($option_obj as $key => $value)
		}//end if (empty($option_obj))

		// clean untranslated tags (<mark>)
			$diffusion_value = !empty($diffusion_value)
				? strip_tags($diffusion_value)
				: '';


		return $diffusion_value;
	};//end get_diffusion_value
