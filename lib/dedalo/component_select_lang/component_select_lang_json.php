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
			
		switch ($modo) {
			case 'edit':
				$dato 							= $this->get_dato();
				$ar_all_project_select_langs 	= unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);

				foreach ((array)$ar_all_project_select_langs as $key => $item) {
				
					$label   	= lang::get_name_from_code($item);
					$code 		= $item;
					$value 		= lang::get_lang_locator_from_code($item);
					
					$item_value = new stdClass();			
						$item_value->value 			= $value;
						$item_value->label 			= $label;
						$item_value->code 			= $code;						
					
					$item_values[]= $item_value;
							
				}	
				break;

			case 'list':
				$dato 				= $this->get_valor();
		
		}			
	
		// item
		$item = new stdClass();
			$item->section_id 			= $this->get_section_id();
			$item->tipo 				= $this->get_tipo();
			$item->from_component_tipo 	= isset($this->from_component_tipo) ? $this->from_component_tipo : $item->tipo;
			$item->section_tipo 		= $this->get_section_tipo();
			$item->value 				= $dato;

	if (isset($item_values)) {
		$item->datalist 				= $item_values; //$ar_list_of_values->result;
	}

		$data[] = $item;

	}//end if($options->get_data===true && $permissions>0)
	
// JSON string
	return common::build_element_json_output($context, $data);