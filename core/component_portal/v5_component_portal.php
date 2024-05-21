<?php



///////// portal



	/**
	* GET VALOR
	* Get resolved string representation of current values (locators)
	* @return string|null $valor
	*/
	$_get_valor = function( $lang=DEDALO_DATA_LANG, $format='string', $fields_separator=', ', $records_separator='<br>', $ar_related_terms=false, $data_to_be_used='valor' ) {

		$options = new stdClass();
			$options->lang				= $lang;
			$options->data_to_be_used	= $data_to_be_used;
			$options->records_separator	= $records_separator;
			$options->fields_separator	= $fields_separator;

		/**
		* GET_VALOR_FROM_AR_LOCATORS
		* Return resolved string from all values of all locators. Used by component_portal
		* @param object $request_options
		* @return object $valor_from_ar_locators {result,info}
		*/
		$get_valor_from_ar_locators = function( $request_options ) {

			$start_time = start_time();

			$valor_from_ar_locators	= new stdClass();

			$options = new stdClass();
				$options->lang				= DEDALO_DATA_LANG;
				$options->data_to_be_used	= 'valor';
				$options->fields_separator	= ', ';
				$options->records_separator	= '<br>';
				$options->ar_locators		= false;
				foreach ($request_options as $key => $value) {
					if (property_exists($options, $key)) $options->$key = $value;
				}

			#
			# LOCATORS (If empty, return '') if we sent the ar_locator property to resolve it, the resolution will be directly without check the structure of the component.
			# if the caller is a component that send your own dato is necessary calculate the component structure.
			if($options->ar_locators === false){
				$ar_locators = (array)$this->get_dato();
				if (empty($ar_locators)) {
					$valor_from_ar_locators->result = '';
					$valor_from_ar_locators->debug  = 'No locators found '.$this->get_tipo();
					return $valor_from_ar_locators;
				}

				#
				# TERMINOS_RELACIONADOS . Obtenemos los terminos relacionados del componente actual
				$ar_terminos_relacionados = (array)$this->RecordObj_dd->get_relaciones();

				#
				# FIELDS AND MATRIX_TABLE
				$fields=array();
				foreach ($ar_terminos_relacionados as $key => $ar_value) {

					$model		= key($ar_value);
					$tipo		= $ar_value[$model];
					$model_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
					if ($model_name==='section') {
						$section_tipo = $tipo;
						$matrix_table = common::get_matrix_table_from_tipo( $section_tipo );
					}else{
						$fields[] = $tipo;
					}
				}
			}else{
				$fields=array();
				$ar_locators = $options->ar_locators;
				foreach ($options->ar_locators as $current_locator) {
					$fields[] = $current_locator->component_tipo;
					$current_section_tipo = $current_locator->section_tipo;
				}
				$matrix_table = common::get_matrix_table_from_tipo( $current_section_tipo );

			}// end if(!isset($options->ar_locators))


			# Selector de terminos relacionados en DB
			# SELECT :
			$strQuery_select='';
			foreach ($fields as $current_tipo) {

				#$model_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
				#if (strpos($model_name,'component_')===false) {
				#	debug_log(__METHOD__." Skipped  $current_tipo - $model_name ".to_string(), logger::DEBUG);
				#	continue;
				#}

				# SELECCIÓN EN EL LENGUAJE ACTUAL
				$RecordObj_dd 	= new RecordObj_dd($current_tipo);
				$current_lang 	= $RecordObj_dd->get_traducible() ==='no' ? DEDALO_DATA_NOLAN : $options->lang;
				$strQuery_select .= "\n datos #>>'{components,$current_tipo,$options->data_to_be_used,$current_lang}' AS $current_tipo";
				if($current_tipo !== end($fields)) $strQuery_select .= ',';
			}

			#
			# WHERE : Filtro de locators en DB
			$strQuery_where='';
			foreach ($ar_locators as $current_locator) {
				if (empty($current_locator->section_id)) {
					debug_log(__METHOD__
						." IGNORED BAD LOCATOR: ". PHP_EOL
						.' locator' . to_string($current_locator)
						, logger::ERROR
					);
					continue;
				}
				$current_section_id 	= $current_locator->section_id;
				$current_section_tipo 	= $current_locator->section_tipo;

				$strQuery_where .= "\n (section_id = $current_section_id AND section_tipo = '$current_section_tipo') OR";
			}
			if (!empty($strQuery_where)) {
				$strQuery_where = substr($strQuery_where, 0, -2);
			}
			$strQuery_where = '('.$strQuery_where.')';

			# QUERY
			$strQuery = "-- ".__METHOD__."\n SELECT $strQuery_select FROM $matrix_table WHERE $strQuery_where";

			$result	  = JSON_RecordObj_matrix::search_free($strQuery);
			$ar_final = array();
			while ($rows = pg_fetch_assoc($result)) {
				$string ='';
				foreach ($fields as $current_tipo) {
					$string .= (string)$rows[$current_tipo];
					if($current_tipo !== end($fields)) $string .= $options->fields_separator;
				}
				$ar_final[] = $string;
			}//end while

			$valor_from_ar_locators->result = implode($options->records_separator, $ar_final);

			// debug
				if(SHOW_DEBUG===true) {
					$limit_time			= SLOW_QUERY_MS/100;
					$total_list_time	= exec_time_unit($start_time,'ms');
					if ($total_list_time > $limit_time) {
						debug_log(__METHOD__
							. " v5 component_portal get_valor SLOW QUERY: " . PHP_EOL
							. ' strQuery: ' . $strQuery . PHP_EOL
							. ' time: '. $total_list_time.' ms'
							, logger::WARNING
						);
					}
				}

			return (object)$valor_from_ar_locators;
		};//end get_valor_from_ar_locators

		$valor_from_ar_locators = $get_valor_from_ar_locators($options);

		if(SHOW_DEBUG===true) {
			#$total_list_time = round(start_time()-$start_time,3);
			#$bt = debug_backtrace();
			#dump($bt, ' bt');
			#debug_log(__METHOD__." WARNING CALLED GET VALOR IN COMPONENT PORTAL !! ({$total_list_time}ms) ".$this->tipo, logger::WARNING);
		}

		$valor = $valor_from_ar_locators->result;


		return $valor;
	};//end get_valor



	/**
	* GET_VALOR_EXPORT
	* Return component value sent to export data
	* @return array $valor_export
	*/
	$_get_valor_export = function( $valor=null, $lang=DEDALO_DATA_LANG, $quotes='"', $add_id=false ) {

		if (empty($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}

		$dato = $this->get_dato();

		// inject in tool export: Note that user can override 'relaciones' data selecting in checkbox of tool export (!)

		// TERMINOS_RELACIONADOS . Obtenemos los terminos relacionados del componente actual
			$ar_terminos_relacionados = (array)$this->RecordObj_dd->get_relaciones();

		// FIELDS
			$fields=array();
			foreach ($ar_terminos_relacionados as $key => $ar_value) {
				foreach ($ar_value as $current_tipo) {

					$model_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
					if (strpos($model_name, 'component_')!==false) {
						$fields[] = $current_tipo;
					}
				}
			}

		$ar_resolved=array();
		foreach( (array)$dato as $value) {

			$section_tipo	= $value->section_tipo;
			$section_id		= $value->section_id;

			// always add section_id
				$item = new stdClass();
					$item->section_id 			= $section_id;
					$item->component_tipo 		= 'section_id';
					$item->section_tipo 		= $section_tipo;
					$item->from_section_tipo 	= $this->section_tipo;
					$item->from_component_tipo 	= $this->tipo;
					$item->model 				= null;
					$item->value 				= $section_id;

				$ar_resolved[] = $item;

			foreach ($fields as $current_tipo) {

				$model_name 	= RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
				$component 		= component_common::get_instance(
					$model_name,
					$current_tipo,
					$section_id,
					'list',
					$lang,
					$section_tipo
				);
				$current_value_export = $component->get_valor_export( null, $lang, $quotes, $add_id );

				$item = new stdClass();
					$item->section_id 			= $section_id;
					$item->component_tipo 		= $current_tipo;
					$item->section_tipo 		= $section_tipo;
					$item->from_section_tipo 	= $this->section_tipo;
					$item->from_component_tipo 	= $this->tipo;
					$item->model 				= $model_name;
					$item->value 				= $current_value_export;

				$ar_resolved[] = $item;
			}
		}//end foreach( (array)$dato as $key => $value)

		$valor_export = $ar_resolved;


		return $valor_export;
	};//end get_valor_export



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a MYSQL field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string|array|null $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	$_get_diffusion_value = function( $lang=null , ?object $option_obj=null) { //  ?string

		$diffusion_value = null;

		$propiedades = $this->get_propiedades();

		// fields_separator. (!) Note here that more than one value can be returned by this method. To avoid duplicity of ',' separator, use '-' as default
			$fields_separator_default = ', ';
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
				case isset($propiedades->source->divisor):
					$fields_separator = $propiedades->source->divisor;
					break;
				default:
					$fields_separator = $fields_separator_default;
					break;
			}

		// records_separator_default
			$records_separator_default = ' | ';
		// records_separator
			$records_separator = (isset($propiedades->source->records_separator))
				? $propiedades->source->records_separator
				: $option_obj->divisor_parents ?? $records_separator_default;


		# Propiedades of diffusion element that references this component
		# (!) Note that is possible overwrite real component properties injecting properties from diffusion (see diffusion_sql::resolve_value)
		# 	  This is useful to change the 'data_to_be_used' param of target component (indirectly)
		$diffusion_properties = $this->get_diffusion_properties();
		$data_to_be_used = isset($diffusion_properties->data_to_be_used) ? $diffusion_properties->data_to_be_used : 'dato';
		switch ($data_to_be_used) {

			case 'valor_list':
				$diffusion_value = $this->get_valor(
					$lang,
					'string', // string format
					$fields_separator, // ', ', // string fields_separator
					$records_separator, // '<br>', // string records_separator
					false, // array|bool ar_related_terms
					$data_to_be_used // array data_to_be_used
				);
				break;

			case 'valor':
				$dato = $this->get_dato();
				if (!empty($dato)) {
					// inject in tool export: Note that user can override 'relaciones' data selecting in checkbox of tool export (!)
					// terminos_relacionados . Obtenemos los terminos relacionados del componente actual
						$ar_terminos_relacionados = (array)$this->RecordObj_dd->get_relaciones();

					// fields
						$fields=array();
						foreach ($ar_terminos_relacionados as $key => $ar_value) {
							foreach ($ar_value as $current_tipo) {

								$model_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
								if (strpos($model_name, 'component_')!==false) {
									$fields[] = $current_tipo;
								}
							}
						}

					$ar_resolved=array();
					foreach( (array)$dato as $key => $current_locator) {

						// Check target is publicable
							$current_is_publicable = diffusion::get_is_publicable($current_locator);
							if ($current_is_publicable!==true) {
								// debug_log(__METHOD__." + Skipped locator not publicable: ".to_string($current_locator), logger::DEBUG);
								continue;
							}

						$section_tipo	= $current_locator->section_tipo;
						$section_id		= $current_locator->section_id;

						foreach ($fields as $current_tipo) {

							$model_name	= RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
							$component	= component_common::get_instance(
								$model_name,
								$current_tipo,
								$section_id,
								'list',
								$lang,
								$section_tipo
							);
							$current_value_export = $component->get_diffusion_value( $lang );

							$ar_resolved[] = $current_value_export;
						}
					}//end foreach( (array)$dato as $key => $current_locator)

					$diffusion_value = implode(' | ', $ar_resolved);
				}
				break;

			case 'dato_full':
				$dato = $this->get_dato();
				if (empty($dato)) {
					$diffusion_value = null;
				}else{
					$diffusion_value = [];
					foreach ((array)$dato as $current_locator) {

						// Check target is publicable
							$current_is_publicable = diffusion::get_is_publicable($current_locator);
							if ($current_is_publicable!==true) {
								// debug_log(__METHOD__." + Skipped locator not publicable: ".to_string($current_locator), logger::DEBUG);
								continue;
							}

						$diffusion_value[] = $current_locator;
					}
				}
				break;

			case 'dato':
			default:
				$dato = $this->get_dato();
				if (empty($dato)) {
					$diffusion_value = null;
				}else{
					$diffusion_value = [];
					foreach ((array)$dato as $current_locator) {

						// Check target is publicable
							$current_is_publicable = diffusion::get_is_publicable($current_locator);
							if ($current_is_publicable!==true) {
								// debug_log(__METHOD__." + Skipped locator not publicable: ".to_string($current_locator), logger::DEBUG);
								continue;
							}

						$diffusion_value[] = $current_locator->section_id;
					}
				}
				break;
		}//end switch ($data_to_be_used)


		return $diffusion_value;
	};//end get_diffusion_value
