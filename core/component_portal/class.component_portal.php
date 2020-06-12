<?php
/*
* CLASS COMPONENT_PORTAL
* former component_autocomplete
*
*/
class component_portal extends component_relation_common {


	protected $relation_type = DEDALO_RELATION_TYPE_LINK;

	# test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');

	# ar_target_section_tipo
	public $ar_target_section_tipo;		# Used to fix section tipo (calculado a partir del componente relacionado de tipo section) Puede ser virtual o real

	# Array of related terms in structure (one or more)
	// protected $ar_terminos_relacionados;

	# referenced component tipo
	// public $tipo_to_search;

	// default max records to show (paginated)
	public $max_records = 5;



	// /** (!) Used parent method
	// * GET_DATO
	// * @return array $dato
	// *	Array of objects (locators)
	// */
	// public function get_dato() {

	// 	$dato = parent::get_dato();

	// 	return (array)$dato;
	// }//end get_dato



	/**
	* GET_PROPIEDADES
	* Only to enable component_autocomplete_hi compatibility
	* @return object $properties
	*/
	public function get_propiedades() {

		$properties = parent::get_propiedades();
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
	}//end get_propiedades



	// DES
		// /**
		// * GET_TIPO_TO_SEARCH (!) Moved to relation_common
		// * Locate in structure TR the component tipo to search
		// * @return string $tipo_to_search
		// */
		// public function get_tipo_to_search($options=null) {
		//
		// 	if(isset($this->tipo_to_search)) {
		// 		return $this->tipo_to_search;
		// 	}
		//
		// 	$propiedades = $this->get_propiedades();
		//
		// 	if(isset($propiedades->source->search)){
		// 			foreach ($propiedades->source->search as $current_search) {
		// 				if($current_search->type === "internal"){
		// 					$ar_terminoID_by_modelo_name =  $current_search->components;
		// 				}
		// 			}
		// 		}else{
		// 			$ar_terminoID_by_modelo_name = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($this->tipo, 'component_', 'termino_relacionado');
		// 		}
		//
		// 		#dump($ar_terminoID_by_modelo_name, ' ar_terminoID_by_modelo_name '.$this->tipo.' ');
		// 	$tipo_to_search = reset($ar_terminoID_by_modelo_name);
		//
		// 	if (!isset($tipo_to_search)) {
		// 		throw new Exception("Error Processing Request. Inconsistency detect. This component need related component to search always", 1);
		// 	}
		//
		// 	// Fix value
		// 		$this->tipo_to_search = $tipo_to_search;
		//
		// 	return $tipo_to_search;
		// }//end get_tipo_to_search



	// DES
		// /**
		// * CREATE_NEW_AUTOCOMPLETE_RECORD
		// * Insert a new record on target section, set projects filter heritage, defaults and text ar_data
		// * Return locator object of new created section
		// * @param int $parent . section_id of current component_portal
		// * @param string $tipo . tipo of current component_portal
		// * @param string $target_section_tipo . tipo of section on create the record
		// * @param string $section_tipo . section_tipo of current component_portal
		// * @param object $ar_data . Object with all component_tipo => value of component_portal value elements
		// * @return locator object. Locator of new created section to add in current component_portal data
		// */
		// public static function create_new_autocomplete_record($parent, $tipo, $target_section_tipo, $section_tipo, $ar_data) {

		// 	// set from_component_tipo
		// 		$from_component_tipo = $tipo;

		// 	// projects heritage
		// 		if ($section_tipo!==DEDALO_SECTION_PROJECTS_TIPO) {
		// 			# All except main section Projects
		// 			$source_ar_filter = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, 'component_filter', true, true); //$section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=false
		// 			if (!isset($source_ar_filter[0])) {
		// 				if(SHOW_DEBUG===true) {
		// 					throw new Exception("Error Processing Request. component_filter is not defined! ($section_tipo)", 1);
		// 				}
		// 				return "Error: component_filter is not defined!";
		// 			}
		// 			$source_component_filter = component_common::get_instance('component_filter',
		// 																	  $source_ar_filter[0],
		// 																	  $parent,
		// 																	  'edit',
		// 																	  DEDALO_DATA_NOLAN,
		// 																	  $section_tipo);
		// 			$source_component_filter_dato = $source_component_filter->get_dato();
		// 				#dump($source_component_filter_dato, ' source_component_filter_dato'.to_string());die();
		// 		}

		// 	// section : Create a new section
		// 		$section 	= section::get_instance(null,$target_section_tipo);
		// 		$section_id = $section->Save();

		// 	// filter : Set heritage of projects
		// 		if ($section_tipo!==DEDALO_SECTION_PROJECTS_TIPO) {
		// 			# All except main section Projects
		// 			$target_ar_filter  = section::get_ar_children_tipo_by_modelo_name_in_section($target_section_tipo, 'component_filter', true, true);
		// 			if (!isset($target_ar_filter[0])) {
		// 				if(SHOW_DEBUG===true) {
		// 					throw new Exception("Error Processing Request. target component_filter is not defined! ($target_section_tipo)", 1);
		// 				}
		// 				return "Error: target component_filter is not defined!";
		// 			}
		// 			$target_component_filter = component_common::get_instance('component_filter',
		// 																	  $target_ar_filter[0],
		// 																	  $section_id,
		// 																	  'list', // 'list' mode avoid autosave default project
		// 																	  DEDALO_DATA_NOLAN,
		// 																	  $target_section_tipo);
		// 			$target_component_filter->set_dato($source_component_filter_dato);
		// 			$target_component_filter->Save();
		// 		}

		// 	// component_portal
		// 		$component_portal 	= component_common::get_instance('component_portal',
		// 																	  $tipo,
		// 																	  $section_id,
		// 																	  'edit',
		// 																	  DEDALO_DATA_NOLAN,
		// 																	  $section_tipo);

		// 	// propiedades
		// 		$propiedades = $component_portal->get_propiedades();
		// 		if (!empty($propiedades)) {

		// 			if (isset($propiedades->filtered_by)) foreach($propiedades->filtered_by as $current_tipo => $current_value) {

		// 				$current_lang = DEDALO_DATA_LANG;
		// 				$RecordObj_dd = new RecordObj_dd($current_tipo);
		// 				if ($RecordObj_dd->get_traducible()==='no') {
		// 					$current_lang = DEDALO_DATA_NOLAN;
		// 				}

		// 				$curren_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
		// 				$component 			= component_common::get_instance($curren_modelo_name,
		// 																	$current_tipo,
		// 																	$section_id,
		// 																	'edit',
		// 																	$current_lang,
		// 																	$target_section_tipo);
		// 				$component->set_dato($current_value);
		// 				$component->Save();

		// 				debug_log(__METHOD__." Updated target section component $current_tipo [$curren_modelo_name] to ".to_string($current_value), logger::DEBUG);
		// 			}
		// 		}
		// 		#dump($propiedades, ' propiedades');	die("section_id: $section_id B");

		// 	// components
		// 		# Format:
		// 		# value: stdClass Object
		// 		# (
		// 		#    [rsc85] => a
		// 		#    [rsc86] => b
		// 		# )
		// 		#
		// 		foreach ($ar_data as $current_tipo => $current_value) {

		// 			$current_lang = DEDALO_DATA_LANG;
		// 			$RecordObj_dd = new RecordObj_dd($current_tipo);
		// 			if ($RecordObj_dd->get_traducible()==='no') {
		// 				$current_lang = DEDALO_DATA_NOLAN;
		// 			}

		// 			$curren_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
		// 			$component = component_common::get_instance($curren_modelo_name,
		// 														$current_tipo,
		// 														$section_id,
		// 														'edit',
		// 														$current_lang,
		// 														$target_section_tipo);
		// 			$component->set_dato( $current_value );
		// 			$component->Save();
		// 		}

		// 	// locator . return locator object of created section
		// 		$locator = new locator();
		// 			$locator->set_type(DEDALO_RELATION_TYPE_LINK);
		// 			$locator->set_section_id($section_id);
		// 			$locator->set_section_tipo($target_section_tipo);
		// 			$locator->set_from_component_tipo($from_component_tipo);
		// 				#dump($locator,'locator');


		// 	return $locator;
		// }//end create_new_autocomplete_record



	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-save its data
	* Note that the first action is always load dato to avoid save empty content
	* @see class.tool_update_cache.php
	* @return bool
	*/
	public function regenerate_component() {

		# Custom propiedades external dato
		$propiedades = $this->get_propiedades();

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


}//end class
