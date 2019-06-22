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
			
		// subcontext from element layout_map items
			$ar_subcontext = $this->get_ar_subcontext();
			foreach ($ar_subcontext as $current_context) {
				$context[] = $current_context;
			}
	
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		$dato = $this->get_dato();
		if (!empty($dato)) {			
				
			// Value
				$value = $dato;
							
				$item = new stdClass();
					$item->section_id 		= $this->get_section_id();
					$item->tipo 			= $this->get_tipo();
					$item->from_parent 		= isset($this->from_parent) ? $this->from_parent : $item->tipo;
					$item->section_tipo 	= $this->get_section_tipo();
					$item->model 			= get_class($this);
					$item->value 			= $value;

				$data[] = $item;			
				
			// subdata . search self records to paginate
				$rows_data 	 = $this->get_portal_records($dato);
				$ar_locators = array_map(function($item){
					$locator = new stdClass();
						$locator->section_tipo 	= $item->section_tipo;
						$locator->section_id 	= $item->section_id;
					return $locator;
				}, $rows_data->ar_records);
	
			// subcontext data from layout_map items	
				$ar_subdata = $this->get_ar_subdata($ar_locators);

			// subdata add
				foreach ($ar_subdata as $current_data) {
					$data[] = $current_data;
				}

		}//end if (!empty($dato))
		
	}//end if $options->get_data===true && $permissions>0



// JSON string
	return common::build_element_json_output($context, $data);