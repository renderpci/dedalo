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
	* GET_PROPERTIES DES
	* Only to enable component_autocomplete_hi compatibility
	* @return object $properties
	*/
		// public function get_properties_DES() {

		// 	$properties = parent::get_properties();
		// 		#dump($properties, ' properties ++ '.to_string($this->tipo));

		// 	// component_portal_hi compatibility
		// 	$real_model = RecordObj_dd::get_real_model_name_by_tipo($this->tipo);
		// 	if ($real_model==='component_autocomplete_hi') {
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
		// 		    "divisor": " | ",
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
		// 	}//end if ($real_model==='component_portal_hi')


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
	* @return object $response
	*/
	public function add_new_element( object $request_options ) : object {

		$options = new stdClass();
			$options->target_section_tipo 	= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';


		if(empty($options->target_section_tipo)){
			$response->msg .= ' Is mandatory to specify target_section_tipo';
			return $response;
		}

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
			}

		#
		# 2 SECTION . Creamos un nuevo registro vacío en la sección a que apunta el portal
		# Section record . create new empty section in target section tipo
			$target_section_tipo	= $options->target_section_tipo;
			$section_new			= section::get_instance(null, $target_section_tipo);

			$save_options = new stdClass();
				$save_options->component_filter_dato = $component_filter_dato;
			$new_section_id = $section_new->Save( $save_options );

			if($new_section_id<1) {
				$msg = __METHOD__." Error on create new section: new section_id is not valid ! ";
				trigger_error($msg);
				$response->msg .= $msg;
				return $response;
			}

		#
		# 3 PORTAL . Insertamos en dato (el array de 'id_madrix' del component_portal actual) el nuevo registro creado
		# Portal dato. add current section id to component portal dato array
			# Basic locator
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
	public function remove_element( object $request_options ) : object {

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
			$ar_children_tipo	= section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_search_model, true, true);

			if (empty($ar_children_tipo[0])) {
				throw new Exception("Error Processing Request: 'component_filter' is empty 1", 1);
			}else {
				$component_filter_tipo	= $ar_children_tipo[0];
				$model					= RecordObj_dd::get_modelo_name_by_tipo($component_filter_tipo, true);

				$component_filter = component_common::get_instance($model,
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
	* @return object $response
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
	* @return string|null $diffusion_value
	*/
	// public function get_diffusion_value( $lang=DEDALO_DATA_LANG, $option_obj=null ) {
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		$real_model = RecordObj_dd::get_real_model_name_by_tipo($this->tipo);
		if ($real_model==='component_portal') {
			return 'unavailable';
		}

		$path = DEDALO_CORE_PATH .'/'. __CLASS__ .'/v5_'. $real_model .'.php';
		include $path;

		// $_get_diffusion_value = Closure::bind($_get_diffusion_value, $this);
		$valor =  Closure::bind($_get_diffusion_value, $this)( $lang=DEDALO_DATA_LANG, $option_obj=null );

		$diffusion_value = $valor;
		return $diffusion_value;
	}//end get_diffusion_value



}//end class component_portal
