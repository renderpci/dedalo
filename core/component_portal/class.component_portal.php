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



	/**
	* GET_properties
	* Only to enable component_autocomplete_hi compatibility
	* @return object $properties
	*/
	public function get_properties() {

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


}//end class
