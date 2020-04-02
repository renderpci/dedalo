<?php
// JSON data component controller



// component configuration vars
	$permissions		= $this->get_component_permissions();
	$modo				= $this->get_modo();
	$properties			= $this->get_propiedades();



// context
	$context = [];

	if($options->get_context===true && $permissions>0){
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$context[] = $this->get_structure_context_simple($permissions);
				break;

			default:
				$sqo_context = isset($properties->unique) ? true : false;
				// Component structure context (tipo, relations, properties, etc.)
					$context[] = $this->get_structure_context($permissions, $sqo_context);

				// add buttons
					$context = array_merge($context, $this->get_structure_buttons($permissions));
				break;
		}
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		// Value
		switch ($modo) {
			case 'list':
				$value = component_common::extract_component_dato_fallback($this, $lang=DEDALO_DATA_LANG, $main_lang=DEDALO_DATA_LANG_DEFAULT);
				break;
			case 'edit':
			default:
				$value = $this->get_dato();
				break;
		}

		// activity exceptions
			if ($this->get_section_tipo()===DEDALO_ACTIVITY_SECTION_TIPO) {
				// activity 'Where' case
					if ($this->tipo==='dd546') {
						$first_value = reset($value);
						$term = RecordObj_dd::get_termino_by_tipo($first_value, DEDALO_DATA_LANG, true, true);
						$term = strip_tags($term);
						$value = [$term . ' ['. $first_value."]"];
					}
				// activity 'Data' case
					if ($this->tipo==='dd551') {
						$value = [json_encode($value, JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT)];
					}elseif (!is_array($value)) {
						$value = [$value];
					}
			}

		// data item
			$item  = $this->get_data_item($value);
				$item->parent_tipo 		 = $this->get_tipo();		// (? used)
 				$item->parent_section_id = $this->get_section_id();	// (? used)

		$data[] = $item;

	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
