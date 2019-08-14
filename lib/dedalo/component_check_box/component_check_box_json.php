<?php
// JSON data component controller



// component configuration vars
	$permissions		= $this->get_component_permissions();
	$modo				= $this->get_modo();



// context
	$context = [];

	if($options->get_context===true){

		// Component structure context (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context($permissions);

	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){
	
		// Value
		switch ($modo) {			
			case 'list':
				$value 				= $this->get_valor(null,'array');
				break;

			case 'edit':
			default:
				$value 				= $this->get_dato();
				$ar_list_of_values	= $this->get_ar_list_of_values2();
				break;		
		}

		// data item
		$item  = $this->get_data_item($value);

		if (isset($ar_list_of_values) && isset($ar_list_of_values->result)) {
			$item->datalist = $ar_list_of_values->result;
		}
		
		$data[] = $item;

	}//end if($options->get_data===true && $permissions>0)


	
// JSON string
	return common::build_element_json_output($context, $data);