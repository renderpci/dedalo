<?php
/*
* CLASS COMPONENT_PORTAL
* former component_autocomplete
*
*/
class component_portal extends component_relation_common {



	// relation_type defaults
	protected $default_relation_type		= DEDALO_RELATION_TYPE_LINK;
	protected $default_relation_type_rel	= null;

	# test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');

	# ar_target_section_tipo
	public $ar_target_section_tipo;		# Used to fix section tipo (get the section from relation terms, section can be real or virtual.

	# Array of related terms in structure (one or more)
	// protected $ar_terminos_relacionados;

	# referenced component tipo
	// public $tipo_to_search;



	/**
	* GET_properties
	* Only to enable component_autocomplete_hi compatibility
	* @return object $properties
	*/
	public function get_properties_DES() {

		$properties = parent::get_properties();
			#dump($properties, ' properties ++ '.to_string($this->tipo));

		// component_portal_hi compatibility
		$real_model = RecordObj_dd::get_real_model_name_by_tipo($this->tipo);
		if ($real_model==='component_autocomplete_hi') {
			// convert from
			// {
			//   "source": {
			//     "mode": "autocomplete",
			//     "hierarchy_types": [
			//       2
			//     ],
			//     "hierarchy_sections": []
			//   },
			//   "value_with_parents": true,
			//   "css": {
			//     ".wrap_component": {
			//       "mixin": [
			//         ".vertical",
			//         ".width_33",
			//         ".line_top"
			//       ],
			//       "style": {
			//         "clear": "left"
			//       }
			//     },
			//     ".content_data": {
			//       "style": {}
			//     }
			//   }
			// }

			$source_string = trim('
			{
				"config_context": [
			      {
			        "type": "internal",
			        "hierarchy_types": '.((isset($properties->source->hierarchy_types) && !empty($properties->source->hierarchy_types)) ? json_encode($properties->source->hierarchy_types) : '[2]').',
			        "search": [
			          "hierarchy25"
			        ],
			        "select": [
			          "hierarchy25",
			          "hierarchy41"
			        ],
			        "show": [
			          "hierarchy25"
			        ]
			      }
				],
			    "section_to_search": '.((isset($properties->source->hierarchy_sections) && !empty($properties->source->hierarchy_sections)) ? json_encode($properties->source->hierarchy_sections) : '[]').',
			    "filter_by_list": [],
			    "divisor": " | ",
			    "type_map": {},
			    "operator": "or",
			    "records_mode": "list"
			}
			');
			// dump(json_decode($source_string), ' source_string ++ '.to_string($this->tipo));

			$new_properties = new stdClass();
				$new_properties->source 			= json_decode($source_string);
				$new_properties->value_with_parents = isset($properties->value_with_parents) ? $properties->value_with_parents : false;
				$new_properties->css  				= isset($properties->css) ? $properties->css : null;

			$properties = $new_properties;
		}//end if ($real_model==='component_portal_hi')


		return $properties;
	}//end get_properties


	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-save its data
	* Note that the first action is always load dato to avoid save empty content
	* @see class.tool_update_cache.php
	* @return bool
	*/
	public function regenerate_component() {

		# Custom properties external dato
		$properties = $this->get_properties();

		# Force loads dato always !IMPORTANT
		$this->get_dato();

		debug_log(__METHOD__." Ignored regenerate action in this component. USE generate_relations_table_data TO REGENERATE RELATIONS ".to_string($this->tipo), logger::WARNING);

		if(empty($dato)) return true;

		# Save component data
		#$this->Save();

		return true;
	}//end regenerate_component



	/**
	* UPDATE_DATO_VERSION
	* @return object $response
	*/
	public static function update_dato_version($request_options) {

		$options = new stdClass();
			$options->update_version 	= null;
			$options->dato_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version = $options->update_version;
			$dato_unchanged = $options->dato_unchanged;
			$reference_id 	= $options->reference_id;


		$update_version = implode(".", $update_version);

		switch ($update_version) {
			case '4.8.0':

				if ($options->context==='update_component_dato') {
					# Current component is already get and set dato with component_relation_common (in "relations")
					# We need recover here the old dato from section->components->tipo->dato
					# This context is different to time machine update dato
					$section  		= section::get_instance($options->section_id, $options->section_tipo);
					$dato_unchanged = $section->get_component_dato($options->tipo, DEDALO_DATA_NOLAN, $lang_fallback=false);
				}

				# Compatibility old dedalo instalations
				if (!empty($dato_unchanged) && is_array($dato_unchanged)) {

					$ar_locators = array();
					foreach ((array)$dato_unchanged as $key => $current_locator) {
						$locator = new locator();
							$locator->set_section_tipo($current_locator->section_tipo);
							$locator->set_section_id($current_locator->section_id);
							$locator->set_type(DEDALO_RELATION_TYPE_LINK);
							$locator->set_from_component_tipo($options->tipo);
						$ar_locators[] = $locator;
					}//end foreach ((array)$dato_unchanged as $key => $clocator)

					$new_dato = (array)$ar_locators;

					$response = new stdClass();
						$response->result   = 1;
						$response->new_dato = $new_dato;
						$response->msg = "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
					return $response;

				}else{

					$response = new stdClass();
						$response->result = 2;
						$response->msg = "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
					return $response;
				}
				break;

			case '4.9.0':
				# Remember DELETE ALL OLD COMPONENT DATO (inside section->components->tipo) !!!!!!!!!!!!!!!!
				throw new Exception("Error Processing Request. Remember DELETE ALL OLD COMPONENT DATO (inside section->components->tipo)", 1);
				# PENDING TO DO !!
				break;
		}
	}//end update_dato_version


	/**
	* GET_VALUE
	* Get the value of the components. By default will be get_dato().
	* overwrite in every different specific component
	* Some the text components can set the value with the dato directly
	* the relation components need to process the locator to resolve the value
	* @return object $value
	*/
	public function get_value($lang=DEDALO_DATA_LANG, $separator_fields=null, $separator_rows=null, $format_columns=null) {

		$value = new dd_grid_cell_object();

		$data = $this->get_dato();

		// get the total of locators of the data, it will be use to render the rows separated.
		$row_count = sizeof($data);
		// set the label of the component as column label
		$column = $this->get_label();
		// get the request request_config of the component
		// the caller can built a request_config that will used instead the default request_config
		$request_config = isset($this->request_config)
			? $this->request_config
			: $this->build_request_config();

		// get the correct rqo (use only the dedalo api_engine)
		$dedalo_request_config = array_find($request_config, function($el){
			return $el->api_engine==='dedalo';
		});

		// get the ddo_map to be used to create the components related to the portal
		$ddo_map = $dedalo_request_config->show->ddo_map;

		$ar_cells = [];
		foreach ($ddo_map as $ddo) {
			// ar_values are the values of the component without the gird_cell_object context, only the values
			// these values will be inject to de column.
			// grid_cell_object only use one column with all values of the all locators, in an unique value.
			$ar_values = [];
			// the same with the fallback_values
			$ar_fallback_values = [];
			$current_column = new stdClass();
			foreach($data as $locator){
				$RecordObj_dd		= new RecordObj_dd($ddo->tipo);
				$current_lang		= $RecordObj_dd->get_traducible()==='si' ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
				$component_model	= RecordObj_dd::get_modelo_name_by_tipo($ddo->tipo,true);
				// dump($component_model,'$component_model');
				$current_component 	= component_common::get_instance($component_model,
																	 $ddo->tipo,
																	 $locator->section_id,
																	 $this->modo,
																	 $current_lang,
																	 $locator->section_tipo);

				$current_component->set_locator($this->locator);

				// get the value and fallback_value of the component and stored to be joined
				$current_column = $current_component->get_value($lang, $separator_fields, $separator_rows, $format_columns);
				$ar_values = isset($current_column->value)
					? array_merge($ar_values, $current_column->value)
					: [];
				$ar_fallback_values = isset($current_column->fallback_value)
					? array_merge($ar_fallback_values, $current_column->fallback_value)
					: [];

				// set the final value and fallback_value to the unique column
				$current_column->value = $ar_values;
				$current_column->fallback_value = $ar_fallback_values;
			}
			// store the current column with all values
			$ar_cells[] = $current_column;
		}
		// set the separator text that will be used to render the column
		// separator will be the "glue" to join data in the client and can be set by caller or could be defined in preferences of the component.
		$properties = $this->get_properties();

		$separator_fields = isset($separator_fields)
			? $separator_fields
			: (isset($properties->separator_fields)
				? $properties->separator_fields
				: ', ');

		$separator_rows = isset($separator_rows)
			? $separator_rows
			: (isset($properties->separator_rows)
				? $properties->separator_rows
				: ' | ');

		$value->set_row_count($row_count);
		$value->set_column($column);
		$value->set_separator_fields($separator_fields);
		$value->set_separator_rows($separator_rows);
		$value->set_value($ar_cells);

		return $value;
	}//end get_value



	/**
	* GET_VALOR
	* @return
	*/
	public function get_valor($lang=DEDALO_DATA_LANG, $format='string', $separator_fields=', ', $separator_rows='<br>', $ar_related_terms=false, $data_to_be_used='valor') {

		$real_model = RecordObj_dd::get_real_model_name_by_tipo($this->tipo);


		// if ($real_model==='component_portal') {
		// 	return 'unavailable';
		// }

		$path = DEDALO_CORE_PATH .'/'. __CLASS__ .'/v5_'. $real_model .'.php';
		include $path;

		// $_get_valor = Closure::bind($_get_valor, $this);
		// $lang=DEDALO_DATA_LANG, $format='string', $ar_related_terms=false, $divisor='<br> '

		$valor =  Closure::bind($_get_valor, $this)($lang=DEDALO_DATA_LANG, $format='string', $separator_fields=', ', $separator_rows='<br>', $ar_related_terms=false, $data_to_be_used='valor');

		return $valor;
	}//end get_valor


	/**
	* GET_VALOR_EXPORT
	* @return
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null ) {

		$real_model = RecordObj_dd::get_real_model_name_by_tipo($this->tipo);

		if ($real_model==='component_portal') {
			return 'unavailable';
		}

		$path = DEDALO_CORE_PATH .'/'. __CLASS__ .'/v5_'. $real_model .'.php';
		include $path;

		// $_get_valor_export = Closure::bind($_get_valor_export, $this);
		$valor =  Closure::bind($_get_valor_export, $this)( $valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null );

		return $valor;
	}//end get_valor_export


	/**
	* GET_DIFFUSION_VALUE
	* @return
	*/
	public function get_diffusion_value( $lang=DEDALO_DATA_LANG, $option_obj=null ) {

		$real_model = RecordObj_dd::get_real_model_name_by_tipo($this->tipo);

		if ($real_model==='component_portal') {
			return 'unavailable';
		}

		$path = DEDALO_CORE_PATH .'/'. __CLASS__ .'/v5_'. $real_model .'.php';
		include $path;

		// $_get_diffusion_value = Closure::bind($_get_diffusion_value, $this);
		$valor =  Closure::bind($_get_diffusion_value, $this)( $lang=DEDALO_DATA_LANG, $option_obj=null );

		return $valor;
	}//end get_diffusion_value



}//end class component_portal