<?php
// JSON data component controller



// component configuration vars
	$permissions		= $this->get_component_permissions();
	$modo				= $this->get_modo();
	$section_tipo 		= $this->section_tipo;
	$lang 				= $this->lang;
	$tipo 				= $this->get_tipo();



// context
	$context = [];

	if($options->get_context===true){

		// Component structure context (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context($permissions);		

	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		// Building real value			
			$dato = $this->get_dato();
			if (!empty($dato)) {
						
				// process dato ?
				
				
			}//end if (!empty($dato))



		// Value
			$value = reset($dato); // For now; Only the first for the list (in probe)
						
			$item = new stdClass();
				$item->section_id 			= $this->get_section_id();
				$item->tipo 				= $this->get_tipo();
				$item->from_component_tipo 	= isset($this->from_component_tipo) ? $this->from_component_tipo : $item->tipo;
				$item->section_tipo 		= $this->get_section_tipo();
				$item->model 				= get_class($this);
				$item->value 				= $value;

			$data[] = $item;
			
	}// end if $permissions > 0



// JSON string
	return common::build_element_json_output($context, $data);