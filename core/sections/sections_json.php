<?php
// JSON data component controller



// element configuration vars
	// $ar_section_tipo	= $this->get_ar_section_tipo();
	$mode			= $this->get_mode();
	$section_class	= 'section';



// context

	// DES
		// if($options->get_context===true){
		// 	switch ($options->context_type) {
		// 		case 'simple':
		// 			// Component structure context_simple (tipo, relations, properties, etc.)
		// 			$context[] = $this->get_structure_context_simple($permissions);
		// 			break;

		// 		default:
		// 			foreach ((array)$ar_section_tipo as $current_section_tipo) {

		// 				$section = $section_class::get_instance(null, $current_section_tipo, $mode);

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
	$context	= [];
	$data		= [];

	// dato is the full result of a search using the search_query_object
	$dato = $this->get_dato();

	if (empty($dato)) {

		$ar_section_tipo = $this->get_ar_section_tipo();

		foreach ((array)$ar_section_tipo as $current_section_tipo) {

			// section instance
				$section = $section_class::get_instance(
					null,
					$current_section_tipo,
					$mode
				);

			// pagination. fix pagination vars (defined in class component_common)
				$limit	= $this->search_query_object->limit;
				$offset	= $this->search_query_object->offset;
				$pagination = new stdClass();
					$pagination->limit	= $limit;
					$pagination->offset	= $offset;
				$section->pagination = $pagination;

			// view fix. Section instance inherits the view (from API request)
				if (isset($this->view)) {
					$section->set_view($this->view);
				}

			// section JSON context
				$section_json = $section->get_json();

			$context = array_merge($context, $section_json->context);
		}
	}else{

		// data item (first data item. Note that 'value' and 'section_tipo' are fulfilled on each dato iteration)
			$item = new stdClass();
				$item->typo			= 'sections';
				$item->tipo			= $this->caller_tipo;
				$item->section_tipo	= []; // $ar_section_tipo;
				$item->value		= []; // $value;

			$data[] = $item;

		// get pagination of the result of search
			$limit	= $this->search_query_object->limit;
			$offset	= $this->search_query_object->offset;
			// $pagination = new stdClass();
			// 	$pagination->limit	= $limit;
			// 	$pagination->offset	= $offset;

		// subdatum
			foreach ($dato as $key => $current_record) {

				$section_tipo	= $current_record->section_tipo;
				$section_id		= $current_record->section_id;

				// load data into JSON_RecordObj_matrix (used by section to get his data)
					$matrix_table			= common::get_matrix_table_from_tipo($section_tipo);
					$JSON_RecordObj_matrix	= JSON_RecordObj_matrix::get_instance(
						$matrix_table,
						$section_id,
						$section_tipo,
						true // bool cache
					);
					$datos = $current_record->datos ?? null;
					if (!is_null($datos)) {
						$JSON_RecordObj_matrix->set_dato($datos);
					}

				// section instance
					$section = $section_class::get_instance(
						$section_id,
						$section_tipo,
						$mode,
						true // bool cache
					);

				// permissions check
					$permissions = $section->get_section_permissions();

					// check if the permissions permit the access to this information.
					if($permissions<1){
						// in any other cases stop the process
						continue;
					}

				// properties optional
					if (!empty($this->properties)){
						$section->set_properties($this->properties);
					}

				// pagination. fix pagination vars (defined in class component_common)
					// $section->pagination = $pagination;

				// view fix. Section instance inherits the view (from API request)
					if (isset($this->view)) {
						$section->set_view($this->view);
					}

				// set dato
					if ($mode==='tm') {
						$section->set_record($current_record); // inject whole db record as var
					}
					// else{
						// inject dato to section when the dato come from db and set as loaded
						// $datos = $current_record->datos ?? null;
						// if (!is_null($datos)) {
						// 	$section->set_dato($datos);
						// }else{
						// 	// inject dato when the dato comes from ar_locators
						// 	// $section->set_dato($current_record);
						// }
					// }

				// get the instance JSON context and data
					$section_json = $section->get_json();

				// CONTEXT. prevent duplicated context. Get the unique context and subcontext that will be need to used in client.
				// it's necessary to have all context called but only one it's necessary, in a list the context its calculated for every row and column, getting duplicated context and subcontext
				// include the context that wasn't included in the previous loops.
					$current_context = $section_json->context;
					foreach ($current_context as $context_item) {
						$found = array_find($context, function($el) use($context_item){
							return 	$el->tipo===$context_item->tipo &&
									$el->section_tipo===$context_item->section_tipo &&
									$el->mode===$context_item->mode;
						});
						if ($found===null) {
							// add if not already exists
							$context[] = $context_item;
						}
					}

				// data
					$data = array_merge($data, $section_json->data);

				// item sections value. Update in each iteration
					$current_value = new stdClass();
						$current_value->section_tipo	= $section_tipo;
						$current_value->section_id		= $section_id;
					// section info (information about creation, modification and publication of current section)
						$section_info = $section->get_section_info();
						foreach ($section_info as $si_key => $si_value) {
							$current_value->{$si_key} = $si_value;
						}
					// paginated_key
						$current_value->paginated_key = $key + $offset;
					// tm case
						if($mode==='tm'){
							$current_value->matrix_id	= $current_record->id;
							$current_value->timestamp	= $current_record->timestamp;
							$current_value->state		= $current_record->state;
						}
					// add value
						$item->value[] = $current_value;
					// add section_tipo if not already exists
						if (!in_array($section_tipo, $item->section_tipo)) {
							$item->section_tipo[] = $section_tipo;
						}
			}//end foreach ($dato as $current_record)
	}//end if (empty($dato))



// JSON string
	return common::build_element_json_output($context, $data);
