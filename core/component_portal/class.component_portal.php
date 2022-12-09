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
	public $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];

	# ar_target_section_tipo
	public $ar_target_section_tipo;		# Used to fix section tipo (get the section from relation terms, section can be real or virtual.

	# Array of related terms in structure (one or more)
	// protected $ar_terminos_relacionados;

	# referenced component tipo
	// public $tipo_to_search;



	/**
	* GET_PROPERTIES DES
	* Only to enable component_autocomplete_hi compatibility
	* @return object $properties
	*/
		// public function get_properties_DES() {

		// 	$properties = parent::get_properties();
		// 		#dump($properties, ' properties ++ '.to_string($this->tipo));

		// 	// component_portal_hi compatibility
		// 	$legacy_model = RecordObj_dd::get_legacy_model_name_by_tipo($this->tipo);
		// 	if ($legacy_model==='component_autocomplete_hi') {
		// 		// convert from
		// 		// {
		// 		//   "source": {
		// 		//     "mode": "autocomplete",
		// 		//     "hierarchy_types": [
		// 		//       2
		// 		//     ],
		// 		//     "hierarchy_sections": []
		// 		//   },
		// 		//   "value_with_parents": true,
		// 		//   "css": {
		// 		//     ".wrap_component": {
		// 		//       "mixin": [
		// 		//         ".vertical",
		// 		//         ".width_33",
		// 		//         ".line_top"
		// 		//       ],
		// 		//       "style": {
		// 		//         "clear": "left"
		// 		//       }
		// 		//     },
		// 		//     ".content_data": {
		// 		//       "style": {}
		// 		//     }
		// 		//   }
		// 		// }

		// 		$source_string = trim('
		// 		{
		// 			"config_context": [
		// 		      {
		// 		        "type": "internal",
		// 		        "hierarchy_types": '.((isset($properties->source->hierarchy_types) && !empty($properties->source->hierarchy_types)) ? json_encode($properties->source->hierarchy_types) : '[2]').',
		// 		        "search": [
		// 		          "hierarchy25"
		// 		        ],
		// 		        "select": [
		// 		          "hierarchy25",
		// 		          "hierarchy41"
		// 		        ],
		// 		        "show": [
		// 		          "hierarchy25"
		// 		        ]
		// 		      }
		// 			],
		// 		    "section_to_search": '.((isset($properties->source->hierarchy_sections) && !empty($properties->source->hierarchy_sections)) ? json_encode($properties->source->hierarchy_sections) : '[]').',
		// 		    "filter_by_list": [],
		// 		    "fields_separator": " | ",
		// 		    "type_map": {},
		// 		    "operator": "or",
		// 		    "records_mode": "list"
		// 		}
		// 		');
		// 		// dump(json_decode($source_string), ' source_string ++ '.to_string($this->tipo));

		// 		$new_properties = new stdClass();
		// 			$new_properties->source 			= json_decode($source_string);
		// 			$new_properties->value_with_parents = isset($properties->value_with_parents) ? $properties->value_with_parents : false;
		// 			$new_properties->css  				= isset($properties->css) ? $properties->css : null;

		// 		$properties = $new_properties;
		// 	}//end if ($legacy_model==='component_portal_hi')


		// 	return $properties;
		// }//end get_properties



	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-save its data
	* Note that the first action is always load dato to avoid save empty content
	* @see class.tool_update_cache.php
	* @return bool
	*/
	public function regenerate_component() : bool {

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
	* Add the new record section id to current component data (as locator) and save it
	* @param object $request_options
	* @return object $response
	*/
	public function add_new_element( object $request_options ) : object {

		// options
			$options = new stdClass();
				$options->target_section_tipo = null;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';

		// target_section_tipo check
			if(empty($options->target_section_tipo)){
				$response->msg .= ' Is mandatory to specify target_section_tipo';
				return $response;
			}


		// 1 PROJECTS GET
			// We get current portal filter data (projects) to heritage in the new portal record
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
			}

		// 2 SECTION
			// Section record . create new empty section in target section tipo
			$target_section_tipo	= $options->target_section_tipo;
			$section_new			= section::get_instance(null, $target_section_tipo);

			$save_options = new stdClass();
				$save_options->caller_dato				= $this->get_dato();
				$save_options->component_filter_dato	= $component_filter_dato;

			$new_section_id = $section_new->Save( $save_options );

			if($new_section_id<1) {
				$msg = __METHOD__." Error on create new section: new section_id is not valid ! ";
				trigger_error($msg);
				$response->msg .= $msg;
				return $response;
			}

		// 3 PORTAL
			// Portal dato. add current section id to component portal dato array
			// Basic locator
			$locator = new locator();
				$locator->set_section_id($new_section_id);
				$locator->set_section_tipo($target_section_tipo);
				$locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator->set_from_component_tipo($this->tipo);

			$added = $this->add_locator_to_dato($locator);
			if ($added!==true) {
				$msg = __METHOD__." Error add_locator_to_dato. New locator is not added ! ";
				trigger_error($msg);
				$response->msg .= $msg;
				return $response;
			}

		// Save current component updated data
			// $this->Save();

		// response OK
			$response->result			= true;
			$response->section_id		= $new_section_id;
			$response->added_locator	= $locator;
			$response->msg				= 'OK. Request done '.__METHOD__;


		return $response;
	}//end add_new_element



	/**
	* REMOVE_ELEMENT
	*
	* @param object $request_options
	* @return object $response
	*/
	public function remove_element( object $request_options ) : object {

		// options
			$options = (object)[
				'locator'		=> $request_options->locator ?? null,
				'remove_mode'	=> $request_options->remove_mode ?? 'delete_link' // delete_link | delete_all (deletes link and resource)
			];

		// short vars
			$locator = $options->locator;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';

		// Remove locator from data
			$result = $this->remove_locator( $locator );
			if ($result!==true) {
				$response->msg .= " Error on remove locator. Skipped action ";
				return $response;
			}

		// Remove target record
			if ($options->remove_mode==='delete_all') {

				$section = section::get_instance(
					$locator->section_id, // string section_id
					$locator->section_tipo // string section_tipo
				);
				$delete  = $section->Delete(
					'delete_record' // string delete_mode
				);
				if ($delete!==true) {
					$response->msg .= " Error on remove target section ($locator->section_tipo - $locator->section_id). Skipped action ";
					return $response;
				}
			}

		// Update state
		// DELETE AND UPDATE the component state of this section and his parents
			$state = $this->remove_state_from_locator( $locator );

		// Save current component updated data
			$this->Save();

		// response
			$response->result		= true;
			$response->remove_mode	= $options->remove_mode;
			$response->msg			= 'OK. Request done '.__METHOD__;


		return $response;
	}//end remove_element



	/**
	* GET_CURRENT_SECTION_FILTER_DATA
	* Search component filter in current section and get the component data
	* @return array $component_filter_dato
	*/
	public function get_current_section_filter_data() : array {

		$section_id		= $this->get_section_id();
		$section_tipo	= $this->get_section_tipo();

		# 1.1 PROYECTOS DE PROYECTOS : Portales de la sección proyectos
		if ($section_tipo===DEDALO_FILTER_SECTION_TIPO_DEFAULT) {

			#$component_filter_dato 	= array($section_id=>"2"); # Será su propio filtro
			$filter_locator = new locator();
				$filter_locator->set_section_tipo($section_tipo);
				$filter_locator->set_section_id($section_id);
			$component_filter_dato = [$filter_locator];

		}else{
			// $section		= section::get_instance($section_id, $section_tipo);
			$ar_search_model	= ['component_filter'];
			$ar_children_tipo	= section::get_ar_children_tipo_by_modelo_name_in_section(
				$section_tipo, // section_tipo
				$ar_search_model,
				true, // bool from_cache
				true, // bool resolve_virtual
				true, // bool recursive
				true, // bool search_exact
				false // array|bool ar_tipo_exclude_elements
			);

			if (empty($ar_children_tipo[0])) {
				throw new Exception("Error Processing Request: 'component_filter' is empty 1", 1);
			}else {
				$component_filter_tipo	= $ar_children_tipo[0];
				$model					= RecordObj_dd::get_modelo_name_by_tipo($component_filter_tipo, true);

				$component_filter = component_common::get_instance(
					$model,
					$component_filter_tipo,
					$section_id,
					'edit',
					DEDALO_DATA_LANG,
					$section_tipo
				);

				$component_filter_dato 	= $component_filter->get_dato_generic(); // Without 'from_component_tipo' and 'type' properties
			}
		}


		return $component_filter_dato;
	}//end get_current_section_filter_data



	/**
	* UPDATE_DATO_VERSION
	* @param object $request_options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_dato_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the dato don't need change"
	*/
	public static function update_dato_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version 	= null;
			$options->dato_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version	= $options->update_version;
			$dato_unchanged	= $options->dato_unchanged;
			$reference_id	= $options->reference_id;


		$update_version = implode(".", $update_version);
		switch ($update_version) {

			case '6.0.0':

				# Update the locator to move old ds and dataframe to v6 dataframe model.
				if (!empty($dato_unchanged) && is_array($dato_unchanged)) {
					$RecordObj_dd			= new RecordObj_dd($options->tipo);
					$properties				= $RecordObj_dd->get_properties();
					$v6_update_dataframe	= $properties->v6_update_dataframe ?? null;

					$clean_locators		= [];
					$new_dataframe		= [];
					$need_to_be_updated	= false;
					foreach ((array)$dato_unchanged as $key => $current_locator) {

						if(isset($current_locator->ds) || isset($current_locator->dataframe)){
							$need_to_be_updated = true;
							if(empty($v6_update_dataframe)){
								throw new Exception("The current component doesn't has defined v6_update_dataframe in preferences. tipo:".$options->tipo, 1);
							}

							// ds case
							if(!empty($current_locator->ds)){
								debug_log(__METHOD__." ----> Located locator->ds  ($options->section_tipo - $options->section_id) ".to_string($current_locator->ds), logger::WARNING);

								foreach((array)$current_locator->ds as $current_ds) {
									// change to new from_component_tipo
									$current_ds->from_component_tipo	= $v6_update_dataframe->v6->from_component_tipo;
									$current_ds->section_id_key			= (int)$current_locator->section_id;

									$new_dataframe[] = $current_ds;
									// debug_log(__METHOD__." ----> Changed ds locator ($options->section_tipo - $options->section_id) ".to_string($current_ds), logger::WARNING);
								}
								// delete old ds
								unset($current_locator->ds);
							}

							// dataframe case
							if(isset($current_locator->dataframe)){
								$old_dataframe = $current_locator->dataframe;
								foreach ($old_dataframe as $current_dataframe) {

									// change to new from_component_tipo
									$current_dataframe->from_component_tipo	= $v6_update_dataframe->v6->from_component_tipo;
									$current_dataframe->type				= $v6_update_dataframe->v6->type;
									$current_dataframe->section_id_key		= (int)$current_locator->section_id;

									unset($current_dataframe->from_key);

									$new_dataframe[] = $current_dataframe;
								}
								// delete old ds
								unset($current_locator->dataframe);
							}
						}

						$clean_locators[] = $current_locator;
					}//end foreach ((array)$dato_unchanged as $key => $clocator)

					if($need_to_be_updated === true){

						$ar_locators	= array_merge($clean_locators, $new_dataframe);
						$new_dato		= (array)$ar_locators;

						// section update and save locators
							$section_to_save = section::get_instance(
								$options->section_id, // string|null section_id
								$options->section_tipo, // string section_tipo
								'list', // string mode
								false // bool bool
							);
							$section_to_save->remove_relations_from_component_tipo( $options->tipo , 'relations' );
							foreach ($ar_locators as $current_locator) {
								$section_to_save->add_relation($current_locator);
							}
							$section_to_save->Save();
							debug_log(__METHOD__." ----> Saved ($options->section_tipo - $options->section_id) ".to_string($ar_locators), logger::WARNING);

						$response = new stdClass();
							$response->result	= 3;
							$response->new_dato	= $new_dato;
							$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";

					}else{

						$response = new stdClass();
							$response->result	= 2;
							$response->msg		= "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
					}// end if($need_to_be_updated === true)
				}else{

						$response = new stdClass();
							$response->result	= 2;
							$response->msg		= "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
				}// end (!empty($dato_unchanged))
				break;

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
			}


		return $response;
	}//end update_dato_version



	/**
	* GET_VALOR
	* @return
	*/
	public function get_valor($lang=DEDALO_DATA_LANG, $format='string', $fields_separator=', ', $records_separator='<br>', $ar_related_terms=false, $data_to_be_used='valor') {

		$legacy_model = RecordObj_dd::get_legacy_model_name_by_tipo($this->tipo);


		// if ($legacy_model==='component_portal') {
		// 	return 'unavailable';
		// }

		$path = DEDALO_CORE_PATH .'/'. __CLASS__ .'/v5_'. $legacy_model .'.php';
		include $path;

		// $_get_valor = Closure::bind($_get_valor, $this);
		// $lang=DEDALO_DATA_LANG, $format='string', $ar_related_terms=false, $fields_separator='<br> '

		$valor =  Closure::bind($_get_valor, $this)($lang=DEDALO_DATA_LANG, $format='string', $fields_separator=', ', $records_separator='<br>', $ar_related_terms=false, $data_to_be_used='valor');

		return $valor;
	}//end get_valor



	/**
	* GET_VALOR_EXPORT
	* @return
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null ) {

		$legacy_model = RecordObj_dd::get_legacy_model_name_by_tipo($this->tipo);

		if ($legacy_model==='component_portal') {
			return 'unavailable';
		}

		$path = DEDALO_CORE_PATH .'/'. __CLASS__ .'/v5_'. $legacy_model .'.php';
		include $path;

		// $_get_valor_export = Closure::bind($_get_valor_export, $this);
		$valor =  Closure::bind($_get_valor_export, $this)( $valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null );

		return $valor;
	}//end get_valor_export



	/**
	* GET_DIFFUSION_VALUE
	* @return string|null $diffusion_value
	*/
	// public function get_diffusion_value( $lang=DEDALO_DATA_LANG, $option_obj=null ) {
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		$legacy_model = RecordObj_dd::get_legacy_model_name_by_tipo($this->tipo);
		if ($legacy_model==='component_portal') {
			return 'unavailable';
		}

		$path = DEDALO_CORE_PATH .'/'. __CLASS__ .'/v5_'. $legacy_model .'.php';
		include $path;

		// $_get_diffusion_value = Closure::bind($_get_diffusion_value, $this);
		$valor =  Closure::bind($_get_diffusion_value, $this)( $lang=DEDALO_DATA_LANG, $option_obj=null );

		$diffusion_value = $valor;
		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_SORTABLE
	* @return bool
	* 	Default is true. Override when component is sortable
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



	/**
	* GET_ORDER_PATH
	* Calculate full path of current element to use in columns order path (context)
	* @param string $component_tipo
	* @param string $section_tipo
	* @return array $path
	*/
	public function get_order_path(string $component_tipo, string $section_tipo) : array {

		$path = [];

		// from_section_tipo. If exists and is distinct to section_tipo, build and prepend the caller item
			if (isset($this->from_section_tipo) && $this->from_section_tipo!==$section_tipo) {
				$path[] = (object)[
					'component_tipo'	=> $this->from_component_tipo,
					'modelo'			=> RecordObj_dd::get_modelo_name_by_tipo($this->from_component_tipo,true),
					'name'				=> RecordObj_dd::get_termino_by_tipo($this->from_component_tipo),
					'section_tipo'		=> $this->from_section_tipo
				];
			}

		// self component path
			$path[] = (object)[
				'component_tipo'	=> $component_tipo,
				'modelo'			=> RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true),
				'name'				=> RecordObj_dd::get_termino_by_tipo($component_tipo),
				'section_tipo'		=> $section_tipo
			];

		// ddo_map. request_config show ddo_map first item is used to sort
		// must be calculated previously by the get_structure_context method
			$request_config_item = array_find($this->request_config, function($el){
				return $el->api_engine==='dedalo';
			});
			$show = $request_config_item->show ?? null;
			if (empty($show)) {

				debug_log(__METHOD__.
					" Ignored empty request_config_item->show (mode:$this->mode) [$this->section_tipo - $this->tipo]",
					logger::ERROR
				);

			}else{

				$first_item	= $show->ddo_map[0] ?? null;

				if (empty($first_item)) {
					debug_log(__METHOD__." Ignored show empty first_item (mode:$this->mode) [$this->section_tipo - $this->tipo]", logger::ERROR);
					dump($show, ' show empty first_item ++++++++ '.to_string($this->tipo));
				}else{
					// target component
					$path[] = (object)[
						'component_tipo'	=> $first_item->tipo,
						'modelo'			=> RecordObj_dd::get_modelo_name_by_tipo($first_item->tipo,true),
						'name'				=> RecordObj_dd::get_termino_by_tipo($first_item->tipo),
						// note that section_tipo is used only to give a name to the join item.
						// results are not really filtered by this section_tipo
						'section_tipo'		=> is_array($first_item->section_tipo)
							? reset($first_item->section_tipo)
							: $first_item->section_tipo
					];
				}
			}


		return $path;
	}//end get_order_path



}//end class component_portal
