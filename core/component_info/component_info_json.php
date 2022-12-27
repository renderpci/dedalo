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

	// dump($context, ' $context ++ '.to_string($this->mode));
	// $bt = debug_backtrace();
	// dump($bt, ' $bt ++ '.to_string());

// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		// value
			switch ($mode) {

				case 'list':
					$value		= $this->get_list_value();
					break;

				case 'edit':
				default:
					$value		= $this->get_dato();
					$data_list	= $this->get_data_list();
					break;
			}

		// data item
			$item = $this->get_data_item($value);

			// data_list
			if (isset($data_list) && !empty($data_list)) {
				$item->datalist = $data_list;
			}

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
