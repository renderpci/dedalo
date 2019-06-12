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
			
		// item_values
			$modo = $this->get_modo();
			switch ($modo) {
				case 'edit':
					# Working here !
					break;
				case 'list':
					$dato  = $this->get_dato();
					if (empty($dato)) {
						
						$item_values = [];
					
					}else{

						$value = reset($dato);
						$label = $this->get_valor();

						$item_value = new stdClass();
							$item_value->value 		= $value;
							$item_value->label 		= $label;
							$item_value->selected 	= true;
						$item_values = [$item_value];
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