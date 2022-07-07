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

	if($options->get_data===true && $permissions>0) {

		// value
			switch ($modo) {
				case 'list':
					$value			= $this->get_list_value();
					$fallback_value	= (empty($value[0]) || ($value[0]==='<br data-mce-bogus="1">'))
						? $this->get_fallback_list_value((object)['max_chars'=>200])
						: null;
					break;

				case 'edit':
				default:
					$value = $this->get_dato();
					// fallback_value. Is used to create a placeholder to display a reference data to the user
					$fallback_value	= (empty($value[0]) || ($value[0]==='<br data-mce-bogus="1">'))
						? $this->get_fallback_list_value((object)['max_chars'=>700])
						: null;
					break;
			}

		// data item
			$item = $this->get_data_item($value);

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
