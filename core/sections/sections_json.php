<?php
// JSON data component controller



// element configuration vars
	// $ar_section_tipo	= $this->get_ar_section_tipo();
	$modo				= $this->get_modo();
	$section_class		= 'section';


// context
	$context = [];
	
	// if($options->get_context===true){
	// 	switch ($options->context_type) {
	// 		case 'simple':
	// 			// Component structure context_simple (tipo, relations, properties, etc.)
	// 			$context[] = $this->get_structure_context_simple($permissions);
	// 			break;

	// 		default:
	// 			foreach ((array)$ar_section_tipo as $current_section_tipo) {
					
	// 				$section = $section_class::get_instance(null, $current_section_tipo, $modo);

	// 				// set dd_request always to allow components know request context
	// 					// $section->set_dd_request( $this->get_dd_request() ); // inject dd_request

	// 				// pagination. fix pagination vars (defined in class component_common)
	// 					$limit	= $this->search_query_object->limit;
	// 					$offset	= $this->search_query_object->offset;
	// 					$pagination = new stdClass();
	// 						$pagination->limit	= $limit;
	// 						$pagination->offset	= $offset;
	// 					$section->pagination = $pagination;
				
	// 				// section JSON context
	// 					$section_options = new stdClass();
	// 						$section_options->get_context	= true;
	// 						$section_options->get_data 	 	= false;
	// 					$section_json = $section->get_json($section_options);

	// 				$context = array_merge($context, $section_json->context);
	// 			}
				
	// 			// $dd_request = dd_core_api::$dd_request;
	// 			// $request_ddo = array_find($dd_request, function($item){
	// 			// 	return $item->typo==='request_ddo';
	// 			// });
	// 			// // when no empty request_ddo->value
	// 			// if ($request_ddo && !empty($request_ddo->value)) {
	// 			// 	dd_core_api::$context_dd_objects = $request_ddo->value;
	// 			// 	$context						 = $request_ddo->value;
	// 			// }
	// 			break;
	// 	}
	// }//end if($options->get_context===true)


// data
	$data = [];

	// if($options->get_data===true){
	
		// dato is the full result of a search using the search_query_object
		$dato = $this->get_dato();



		if (!empty($dato)) {

			// data item
				$value = array_map(function($item) use($modo){
					
					$locator = new stdClass();
						$locator->section_tipo	= $item->section_tipo;
						$locator->section_id	= $item->section_id;

					// tm case
						if($modo==='tm'){
							$locator->matrix_id	= $item->id;
							$locator->timestamp	= $item->timestamp;
							$locator->state		= $item->state;
						}

					return $locator;
				}, $dato);

				$ar_section_tipo = array_map(function($locator){
					return $locator->section_tipo;
				}, $dato);


				
				$item = new stdClass();
					$item->typo			= 'sections';
					$item->section_tipo	= $ar_section_tipo;
					$item->tipo			= $this->caller_tipo;
					$item->value		= $value;

				$data[] = $item;


			// subdatum
				$ar_calculated_context = [];
				foreach ($dato as $key => $current_record) {

					$section_id		= $current_record->section_id;
					$section_tipo	= $current_record->section_tipo;

					// section instance
						$section = $section_class::get_instance($section_id, $section_tipo, $modo, $cache=true);


					// switch ($options->context_type) {
					// 	case 'simple':
					// 		// Component structure context_simple (tipo, relations, properties, etc.)
					// 		$context[] = $this->get_structure_context_simple($permissions);
					// 		break;

					// 	default:								
							// pagination. fix pagination vars (defined in class component_common)
								$limit	= $this->search_query_object->limit;
								$offset	= $this->search_query_object->offset;
								$pagination = new stdClass();
									$pagination->limit	= $limit;
									$pagination->offset	= $offset;
								$section->pagination = $pagination;															
					// 		break;
					// }

					

					if ($modo==='tm') {
						$section->set_record($current_record); // inject whole db record as var
					}else{
						// inject datos to section and set as loaded
						$datos = $current_record->datos ?? null;
						if (!is_null($datos)) {
							$section->set_dato($datos);
							$section->set_bl_loaded_matrix_data(true);
						}
					}

					// get the JSON data of the related component
						$section_json = $section->get_json();

					$key_context = $section_tipo.'_'.$modo;

					// prevent duplicated context (get the first context only)
					if (!isset($ar_calculated_context[$key_context])) {
						$context	= array_merge($context, $section_json->context);
						$ar_calculated_context[$key_context] = $context;
					}
					$data		= array_merge($data, $section_json->data);

				}//end foreach ($dato as $current_record)

		}//end if (!empty($dato))

	// }// end if $permissions > 0



// JSON string
	return common::build_element_json_output($context, $data);
