<?php
// JSON data component controller



// component configuration vars
	$ar_section_tipo	= $this->get_ar_section_tipo();
	$modo				= $this->get_modo();
	$section_class 		= 'section';


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

					$section = $section_class::get_instance(null, $current_section_tipo, $modo);

					if ($modo==='tm') {
						$section->set_dd_request( $this->get_dd_request() ); // inject dd_request
					}

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

		// dato is the full result of a search using the search_query_object
		$dato = $this->get_dato();

		if (!empty($dato)) {

			// data item
				$value = array_map(function($item) use($modo){
					$locator = new stdClass();
						$locator->section_tipo 	= $item->section_tipo;
						$locator->section_id 	= $item->section_id;

					// tm case
						if($modo==='tm'){
							$locator->matrix_id = $item->id;
							$locator->timestamp = $item->timestamp;
							$locator->state 	= $item->state;
						}

					return $locator;
				}, $dato);

				$item = new stdClass();
					#$item->typo 		= 'section';
					$item->section_tipo = $ar_section_tipo[0];
					$item->tipo 		= $ar_section_tipo[0];
					$item->value 		= $value;

				$data[] = $item;

			// subdata
				foreach ($dato as $current_record) {

					$section_id   	= $current_record->section_id;
					$section_tipo 	= $current_record->section_tipo;
					// $datos			= isset($current_record->datos) ? json_decode($current_record->datos) : null;

					$section 		= $section_class::get_instance($section_id, $section_tipo, $modo, $cache=true);

					if ($modo==='tm') {
						$section->set_record($current_record); // inject whole db record as var
					}

					// inject datos
						// if (!is_null($datos)) {
							// $section->set_dato($datos);
							// $section->set_bl_loaded_matrix_data(true);
						// }

					// get the JSON data of the related component
						$section_options = new stdClass();
							$section_options->get_context	= false;
							$section_options->get_data 	 	= true;
						$section_json = $section->get_json($section_options);
					
					$data = array_merge($data, $section_json->data);
				}//end foreach ($dato as $current_record)

		}//end if (!empty($dato))

	}// end if $permissions > 0



// JSON string
	return common::build_element_json_output($context, $data);
