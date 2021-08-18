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
	* ADD_NEW_ELEMENT
	* Creates a new record in target section and propagates filter data
	* Add the new record section id to current component data (as locator) and save
	* @return object $response
	*/
	public function add_new_element( $request_options ) {

		$options = new stdClass();
			$options->section_target_tipo 	= null;
			$options->top_tipo 				= TOP_TIPO;
			$options->top_id 				= TOP_ID;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		#
		# 1 PROJECTS GET. Obtenemos los datos del filtro (proyectos) de la sección actual para heredarlos en el registro del portal
		# We get current portal filter data (projects) to heritage in the new portal record
			$section_id				= $this->get_section_id();
			$component_filter_dato	= (strpos($section_id, DEDALO_SECTION_ID_TEMP)!==false)
				? null
				: $this->get_current_section_filter_data();
			if(empty($component_filter_dato)) {

				debug_log(__METHOD__." Empty filter value in current section. Default project value will be used (section tipo: $this->section_tipo, section_id: $section_id) ".to_string(), logger::WARNING);

				# Default value is used
				# Temp section case Use default project here
				$locator = new locator();
					$locator->set_section_tipo(DEDALO_SECTION_PROJECTS_TIPO);
					$locator->set_section_id(DEDALO_DEFAULT_PROJECT);
				$component_filter_dato = [$locator];

				#$msg = __METHOD__." Error on get filter data from this section ! ";
				#trigger_error($msg);
				#$response->msg .= $msg;
				#return $response;
			}

		#
		# 2 SECTION . Creamos un nuevo registro vacío en la sección a que apunta el portal
		# Section record . create new empty section in target section tipo
		# TRUE : Se le pasa 'true' al comando "Save" para decirle que SI es un portal
			if (empty($options->section_target_tipo)) {
				$ar_target_section_tipo = $this->get_ar_target_section_tipo();
				$section_target_tipo 	= reset($ar_target_section_tipo);
			}else{
				$section_target_tipo 	= $options->section_target_tipo;
			}
			$section_new = section::get_instance(null, $section_target_tipo);

			$save_options = new stdClass();
				$save_options->is_portal 	= true; // Important set true !
				$save_options->portal_tipo 	= $this->tipo;
				$save_options->top_tipo 	= $options->top_tipo;
				$save_options->top_id 		= $options->top_id;

			$new_section_id = $section_new->Save( $save_options );


			if($new_section_id<1) {
				$msg = __METHOD__." Error on create new section: new section_id is not valid ! ";
				trigger_error($msg);
				$response->msg .= $msg;
				return $response;
			}

		#
		# 3 PROYECTOS SET. Creamos un nuevo registro de filtro ('component_filter') hijo de la nueva sección creada, que heredará los datos del filtro de la sección principal
		# Set target section projects filter settings as current secion
		# Los proyectos se heredan desde el registro actual donde está el portal hacia el registro destino del portal
			#$ar_component_filter = (array)$section_new->get_ar_children_objects_by_modelo_name_in_section('component_filter',true);
			$ar_tipo_component_filter = section::get_ar_children_tipo_by_modelo_name_in_section($section_target_tipo, 'component_filter', $from_cache=true, $resolve_virtual=true);
			if (!isset($ar_tipo_component_filter[0])) {
				$msg = __METHOD__." Error target section 'component_filter' not found in $section_target_tipo ! ";
				trigger_error($msg);
				$response->msg .= $msg;
				return $response;
			}else{
				$component_filter 	= component_common::get_instance('component_filter',
																	 $ar_tipo_component_filter[0],
																	 $new_section_id,
																	 'list', // Important 'list' to avoid auto save default value !!
																	 DEDALO_DATA_NOLAN,
																	 $section_target_tipo
																	);
				$component_filter->set_dato($component_filter_dato);
				$component_filter->Save();
			}

		#
		# 4 PORTAL . Insertamos en dato (el array de 'id_madrix' del component_portal actual) el nuevo registro creado
		# Portal dato. add current section id to component portal dato array

			# Basic locator
			$locator = new locator();
				$locator->set_section_id($new_section_id);
				$locator->set_section_tipo($section_target_tipo);
				$locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator->set_from_component_tipo($this->tipo);

			$added = $this->add_locator_to_dato($locator);
			if ($added!==true) {
				$msg = __METHOD__." Error add_locator_to_dato. New locator is not added ! ";
				trigger_error($msg);
				$response->msg .= $msg;
				return $response;
			}


		# Save current component updated data
		$this->Save();


		$response->result 		= true;
		$response->section_id 	= $new_section_id;
		$response->added_locator= $locator;
		$response->msg 			= 'Ok. Request done '.__METHOD__;

		return $response;
	}//end add_new_element



	/**
	* REMOVE_ELEMENT
	* @return object $response
	*/
	public function remove_element( $request_options ) {

		$options = new stdClass();
			$options->locator 		= null;
			$options->remove_mode	= 'delete_link';	// delete_link | delete_all (deletes link and resource)
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$locator = $options->locator;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		# Remove locator from data
		$result = $this->remove_locator( $locator );
		if ($result!==true) {
			$response->msg .= " Error on remove locator. Skipped action ";
			return $response;
		}

		# Remove target record
		if ($options->remove_mode==='delete_all') {

			$section = section::get_instance($locator->section_id, $locator->section_tipo);
			$delete  = $section->Delete($delete_mode='delete_record');
			if ($delete!==true) {
				$response->msg .= " Error on remove target section ($locator->section_tipo - $locator->section_id). Skipped action ";
				return $response;
			}
		}

		# Update state
		# DELETE AND UPDATE the component state of this section and his parents
		$state = $this->remove_state_from_locator( $locator );

		# Save current component updated data
		$this->Save();

		$response->result 		= true;
		$response->remove_mode 	= $options->remove_mode;
		$response->msg 			= 'Ok. Request done '.__METHOD__;

		return $response;
	}//end remove_element



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
	public function get_value($lang=DEDALO_DATA_LANG, $ddo=null) {

		// set the separator if the ddo has a specific separator, it will be used instead the component default separator
			$separator_fields	= $ddo->separator_fields ?? null;
			$separator_rows		= $ddo->separator_rows ?? null;
			$format_columns		= $ddo->format_columns ?? null;
			$class_list 		= $ddo->class_list ?? null;


		$value = new dd_grid_cell_object();

		$data = $this->get_dato();

		// set the label of the component as column label
		$label = $this->get_label();
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
		// OLD
			// foreach ($ddo_map as $ddo) {
			// 	// ar_values are the values of the component without the gird_cell_object context, only the values
			// 	// these values will be inject to de column.
			// 	// grid_cell_object only use one column with all values of the all locators, in an unique value.
			// 	$ar_values = [];
			// 	// the same with the fallback_values
			// 	$ar_fallback_values = [];
			// 	$current_column = new stdClass();
			// 	foreach($data as $locator){
			// 		$RecordObj_dd		= new RecordObj_dd($ddo->tipo);
			// 		$current_lang		= $RecordObj_dd->get_traducible()==='si' ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
			// 		$component_model	= RecordObj_dd::get_modelo_name_by_tipo($ddo->tipo,true);
			// 		// dump($component_model,'$component_model');
			// 		$current_component 	= component_common::get_instance($component_model,
			// 															 $ddo->tipo,
			// 															 $locator->section_id,
			// 															 $this->modo,
			// 															 $current_lang,
			// 															 $locator->section_tipo);

			// 		$current_component->set_locator($this->locator);

			// 		// get the value and fallback_value of the component and stored to be joined
			// 		$current_column = $current_component->get_value($lang, $separator_fields, $separator_rows, $format_columns);
			// 		$ar_values = isset($current_column->value)
			// 			? array_merge($ar_values, $current_column->value)
			// 			: [];
			// 		$ar_fallback_values = isset($current_column->fallback_value)
			// 			? array_merge($ar_fallback_values, $current_column->fallback_value)
			// 			: [];

			// 		// set the final value and fallback_value to the unique column
			// 		$current_column->value = $ar_values;
			// 		$current_column->fallback_value = $ar_fallback_values;
			// 	}
			// 	// store the current column with all values
			// 	$ar_cells[] = $current_column;
			// }

		$sub_row_count = null;
		foreach($data as $locator){

			$ar_columns = [];
			foreach ($ddo_map as $ddo) {
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
				$current_column = $current_component->get_value($lang, $ddo);

				$sub_row_count = $current_column->row_count ?? null;

				$grid_column = new dd_grid_cell_object();
					$grid_column->set_type('column');
					$grid_column->set_value([$current_column]);
				$ar_columns[] = $grid_column;
			}

			//create the row of the portal
			$grid_row = new dd_grid_cell_object();
				$grid_row->set_type('row');
				$grid_row->set_value($ar_columns);

			// store the current column with all values
			$ar_cells[] = $grid_row;
		}

		// get the total of locators of the data, it will be use to render the rows separated.
			$locator_count = sizeof($data);
			$row_count = $sub_row_count ?? $locator_count + $sub_row_count;

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

		$value->set_type('column');
		$value->set_row_count($row_count);
		$value->set_label($label);
		if(isset($class_list)){
			$value->set_class_list($class_list);
		}
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