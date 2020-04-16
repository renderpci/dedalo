<?php
// JSON data component controller



// component configuration vars
	$permissions		= $this->get_component_permissions();
	$modo				= $this->get_modo();
	$lang				= $this->get_lang();



// context
	$context = [];

	if($options->get_context===true && $permissions>0){
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$item_context = $this->get_structure_context_simple($permissions);
				break;

			default:
				$item_context = $this->get_structure_context($permissions, true);				
				break;
		}
		$context[] = $item_context;
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		// Value
		switch ($modo) {
			case 'list':
				$value 				= $this->get_valor();
				break;
			case 'edit':
			default:
				$value 				= $this->get_dato();
				$ar_list_of_values	= $this->get_ar_list_of_values2($lang, true);
				break;
		}

		// data item
		$item  = $this->get_data_item($value);

		// dataset
		if (isset($ar_list_of_values) && isset($ar_list_of_values->result)) {
			$item->datalist = $ar_list_of_values->result;
		}

		$data[] = $item;

	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
