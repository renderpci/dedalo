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
				$add_request_config = isset($properties->unique) ? true : false;
				// Component structure context (tipo, relations, properties, etc.)
					$context[] = $this->get_structure_context($permissions, $add_request_config);

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
				$value 		= $this->get_dato();
				$datalist 	= $this->get_datalist();
				break;
		}

		// data item
		$item  = $this->get_data_item($value);
		$item->parent_tipo 			= $this->get_tipo();
		$item->parent_section_id 	= $this->get_section_id();


		// dataset
		if (isset($datalist) && isset($datalist->result)) {
			$item->datalist = $datalist->result;
		}

		$data[] = $item;

	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
