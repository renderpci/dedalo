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
	$item_values = [];

	if($options->get_data===true && $permissions>0){
			
		// item_values
		$modo = $this->get_modo();
		switch ($modo) {
			case 'edit':
				# Working here !
				break;
			case 'list':

				$ar_all_project_select_langs 	= unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);
				$dato 							= $this->get_dato();
				$tipo 							= $this->get_tipo();


				foreach ((array)$ar_all_project_select_langs as $key => $item) {
				
					$label   	= lang::get_name_from_code($item);
					$code 		= $item;
					$value 		= lang::get_lang_locator_from_code($item);

					dump($item, ' item ++ '.to_string());
						dump($value, '$value ++ '.to_string());
					
					if (!property_exists($value, 'type')) {
						$value->type = DEDALO_RELATION_TYPE_LINK;
					}
					if (!property_exists($value, 'from_component_tipo')) {
						$value->from_component_tipo = $tipo;
					}

					if (locator::in_array_locator( $value, (array)$dato, $ar_properties=array('section_id','section_tipo') )) {	# dato is array always
						$selected = true;
					}else{
						$selected = false;
					}

					$item_value = new stdClass();			
						$item_value->value 			= $value;
						$item_value->code 			= $code;
						$item_value->label 			= $label;
						$item_value->selected 		= $selected;

					$item_values[]= $item_value;
					
				}				
				break;
		}

		// item
		$item = new stdClass();
			$item->section_id 			= $this->get_section_id();
			$item->tipo 				= $this->get_tipo();
			$item->from_component_tipo 	= isset($this->from_component_tipo) ? $this->from_component_tipo : $item->tipo;
			$item->section_tipo 		= $this->get_section_tipo();
			$item->value 				= $item_values;

		$data[] = $item;

	}//end if($options->get_data===true && $permissions>0)
	
// JSON string
	return common::build_element_json_output($context, $data);