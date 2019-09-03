<?php
// JSON data component controller



// component configuration vars
	$ar_section_tipo	= $this->get_ar_section_tipo();
	$modo				= $this->get_modo();



// context
	$context = [];

	if($options->get_context===true){
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$context[] = $this->get_structure_context_simple($permissions);
				break;
			
			default:
				foreach ((array)$ar_section_tipo as $current_section_tipo) {
			
					$section = section::get_instance(null, $current_section_tipo, $modo);

					// get the JSON context of the related component
						$section_options = new stdClass();
							$section_options->get_context	= true;
							$section_options->get_data 	 	= false;
						$section_json = $section->get_json($section_options);		
			
					$context = array_merge($context, $section_json->context);
				}
				break;
		}
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true){

		$dato = $this->get_dato();
		
		if (!empty($dato)) {

			// data item
				$value = array_map(function($item){
					$locator = new stdClass();
						$locator->section_tipo 	= $item->section_tipo;
						$locator->section_id 	= $item->section_id;
					return $locator;
				}, $dato);

				//$item = $this->get_data_item($value);

				$item = new stdClass();
					$item->typo 		= 'section';
					$item->section_tipo = $ar_section_tipo[0];
					$item->tipo 		= $ar_section_tipo[0];
					$item->value 		= $value;
				
				$data[] = $item;


			foreach ($dato as $current_record) {
			
				$section_id   	= $current_record->section_id;
				$section_tipo 	= $current_record->section_tipo;
				$datos			= json_decode($current_record->datos);

				$section = section::get_instance($section_id,$section_tipo, $modo, $cache=true);

				// get the JSON context of the related component
					$section_options = new stdClass();
						$section_options->get_context	= false;
						$section_options->get_data 	 	= true;
					$section_json = $section->get_json($section_options);		

				$data = array_merge($data, $section_json->data);
			}

		}//end if (!empty($dato))	
		
	}// end if $permissions > 0



// JSON string
	return common::build_element_json_output($context, $data);