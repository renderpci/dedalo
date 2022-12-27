<?php
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();



// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$context[] = $this->get_structure_context_simple($permissions);
				break;

			default:
				$context[] = $this->get_structure_context($permissions);
				break;
		}
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		// value
		switch ($mode) {

			case 'list':
				$value = $this->get_dato();
				break;

			case 'edit':
			default:
				// Building real value
				$value = $this->get_dato();
				break;
		}

		// data item
		$item = $this->get_data_item($value);

		$data[] = $item;
	}//end if $permissions>0



// JSON string
	return common::build_element_json_output($context, $data);
