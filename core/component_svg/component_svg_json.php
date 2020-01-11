<?php
// JSON data component controller



// component configuration vars
	$permissions		= $this->get_component_permissions();
	$modo				= $this->get_modo();



// context
	$context = [];

	if($options->get_context===true && $permissions>0){
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

	if($options->get_data===true && $permissions>0){

		// Available image files
			$value = [];

		$test_file = false;

		$svg_item = new stdClass();
			$svg_item->url = $this->get_url(false, $test_file, false, true); // $quality=false, $test_file=true, $absolute=false, $default_add=true

		$value[] = $svg_item;

		// data item
		$item  = $this->get_data_item($value);

		$data[] = $item;

	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
