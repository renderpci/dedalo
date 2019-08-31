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



// context_simple
	if($options->get_context_simple===true){

		// Component structure context_simple (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context_simple($permissions);

	}//end if($options->get_context_simple===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){
		
		// Value
		switch ($modo) {
			case 'list':
				$value = $this->get_valor();
				break;
			case 'edit':
			default:
				$value 							= $this->get_dato();
				// datalist
				$ar_all_project_select_langs 	= unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);
				$datalist = [];
				foreach ((array)$ar_all_project_select_langs as $key => $item) {
				
					$label   	= lang::get_name_from_code($item);
					$code 		= $item;
					$value 		= lang::get_lang_locator_from_code($item);
					
					$item_value = new stdClass();			
						$item_value->value 	= $value;
						$item_value->label 	= $label;
						$item_value->code 	= $code;						
					
					$datalist[]= $item_value;							
				}	
				break;
		}			
	
		// data item
		$item  = $this->get_data_item($value);

		// datalist
		if (isset($datalist)) {
			$item->datalist = $datalist;
		}

		$data[] = $item;

	}//end if($options->get_data===true && $permissions>0)
	
// JSON string
	return common::build_element_json_output($context, $data);