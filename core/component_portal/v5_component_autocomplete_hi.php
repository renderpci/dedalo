<?php

///////// autocomplete_hi




	/**
	* GET VALOR
	* Get resolved string representation of current tesauro value
	*/
	$_get_valor = function($lang=DEDALO_DATA_LANG, $format='string', $separator='<br>') {

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
			$propiedades 	= $this->get_propiedades();
			$show_parents 	= (isset($propiedades->value_with_parents) && $propiedades->value_with_parents===true) ? true : false;

		// dato iterate	and resolve each locator
			$ar_valor = array();
			foreach ($dato as $key => $current_locator) {

				// params: $locator, $lang=DEDALO_DATA_LANG, $section_tipo, $show_parents=false, $ar_componets_related=false, $divisor=false
				$current_valor = component_relation_common::get_locator_value($current_locator, $lang, $show_parents);

				$current_locator_string 			= json_encode($current_locator);
				$ar_valor[$current_locator_string]  = $current_valor;
			}//end foreach ($dato as $key => $current_locator)

		// set value based on format
			$valor = ($format==='array')
				? $ar_valor
				: implode($separator, $ar_valor);


		return $valor;
	};//end get_valor




	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
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
	* @return string $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	$get_diffusion_value = function ($lang=DEDALO_DATA_LANG, $option_obj=null) {

		// separator. (!) Note here that more than one value can be returned by this method. To avoid duplicity of ',' separator, use '-' as default
			$separator = ' - ';

		// load dato
			$dato = $this->get_dato();
			if (empty($dato)) {
				return null;
			}

		if (empty($option_obj)) {

			// default case
			$diffusion_value = $this->get_valor($lang, 'string', $separator);

		}else{

			// properties options defined
			foreach ($option_obj as $key => $value) {

				if ($key==='add_parents') {

					$show_parents = (bool)$value;

					// parents recursive resolve
						$ar_diffusion_value = [];
						foreach ($dato as $current_locator) {

							// self term plus parents.
							// $locator, $lang=DEDALO_DATA_LANG, $show_parents=false, $ar_componets_related=false, $divisor=', ', $include_self=true
								$ar_diffusion_value[] = component_relation_common::get_locator_value($current_locator, $lang, $show_parents, false);

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
							// 	// $diffusion_value .= $separator . implode($separator, $ar_terms);
							// 	$ar_diffusion_value = array_merge($ar_diffusion_value, $ar_terms);
							// }
						}

					$diffusion_value = implode($separator, $ar_diffusion_value);

				}else if ($key==='custom_parents') {

					$ar_diffusion_value = [];
					foreach ($dato as $current_locator) {

						$locator_terms = [];

						// self include. $locator, $lang=DEDALO_DATA_LANG, $show_parents=false, $ar_componets_related=false, $divisor=', ', $include_self=true
							$locator_terms[] = component_relation_common::get_locator_value($current_locator, $lang, false, false);

						// get_parents_recursive($section_id, $section_tipo, $skip_root=true, $is_recursion=false)
							$ar_parents = component_relation_parent::get_parents_recursive($current_locator->section_id, $current_locator->section_tipo, true);

						// iterate parents
							$stopped  = false;
							$ar_terms = [];
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
										$ar_tipo   = section::get_ar_children_tipo_by_modelo_name_in_section($parent_locator->section_tipo,['component_relation_model'],true, true, true, true);
										$component = component_common::get_instance('component_relation_model',
																					 $ar_tipo[0],
																					 $parent_locator->section_id,
																					 'list',
																					 DEDALO_DATA_NOLAN,
																					 $parent_locator->section_tipo);
										$component_dato = $component->get_dato();
										if(isset($component_dato[0])){
											$current_term_id = $component_dato[0]->section_tipo.'_'.$component_dato[0]->section_id;
											if(in_array($current_term_id, $value->parent_end_by_model)){
												$stopped = true;
												break;
											}
										}
									}

									$term = ts_object::get_term_by_locator($parent_locator, $lang, $from_cache=true);
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
						$diffusion_value = implode($separator, $ar_diffusion_value);

				}//end if ($key==='custom_parents')
			}//end foreach ($option_obj as $key => $value)
		}

		// clean untranslated tags (<mark>)
			$diffusion_value = strip_tags($diffusion_value);


		return (string)$diffusion_value;
	};//end get_diffusion_value


