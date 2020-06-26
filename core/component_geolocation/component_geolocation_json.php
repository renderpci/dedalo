<?php
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$modo			= $this->get_modo();
	$properties		= $this->get_properties() ?? new stdClass();



// context
	$context = [];

	if($options->get_context===true && $permissions>0){
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$context[] = $this->get_structure_context_simple($permissions);
				break;

			default:
				$structure_context = $this->get_structure_context($permissions);				
				
				// geo_provider add
					$geo_provider = (isset($properties->geo_provider)) ? $properties->geo_provider : DEDALO_GEO_PROVIDER;
					$structure_context->geo_provider = $geo_provider;

				$context[] = $structure_context;
				break;
		}
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

			// Value
			$value = $this->get_dato();
			if (!is_array($value)) {
				$value = [$value];
			}

			// data item
			$item  = $this->get_data_item($value);

			$data[] = $item;

	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
