<?php
// JSON data component controller



// element configuration vars
	// $ar_section_tipo	= $this->get_ar_section_tipo();
	$mode			= $this->get_mode();
	$section_class	= 'section';



// context and data
	$context	= [];
	$data		= [];

	// dato is the full result of a search using the search_query_object
	$sections_data = $this->get_data();

	if ( $sections_data->row_count()===0 ) {

		$ar_section_tipo = $this->get_ar_section_tipo();

		foreach ((array)$ar_section_tipo as $current_section_tipo) {

			// section instance
				$section = $section_class::get_instance(
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

			// $grouped_sections = [];
			// sections
		
			$section_instances = []; // O(1) lookup instead of O(n) in_array
			$key = 0;
			$section = null;
			$context_index = [];
			$rejected_sections = [];

			foreach ($sections_data as $current_record) {
				// when the caller is a Time Machine section 
				// $current_record is a Time Machine Record then we need to convert it into a Section Record
				if( $mode ==='tm' || $this->caller_tipo ==='dd15' ){
					$tm_record = tm_record::get_instance( $current_record->id );
					$tm_record->set_data( $current_record );
					$current_record = $tm_record->get_section_record();
				}

				$section_tipo	= $current_record->section_tipo;
				$section_id		= $current_record->section_id;

				// section record
					$section_record = section_record::get_instance( $section_tipo, $section_id );
					$section_record->set_data( $current_record );

				// create or reuse cached section instance
					if ( !isset($section_instances[$section_tipo]) && !isset($rejected_sections[$section_tipo]) ) {

						// mark section_tipo as seen
						// get or create cached section instance				
						$section = $section_class::get_instance(
							$section_tipo,
							$mode,
							true // bool cache
						);						

						// permissions check: skip section and its all section_records without at least read access
						// Only sections with at least read access are included in the result
						$permissions = $section->get_section_permissions();
						if ($permissions < 1) {
							$rejected_sections[$section_tipo] = true;
							continue; // skip this section and its records
						}

						// set section instance in cache
						$section_instances[$section_tipo] = $section;
					}					

					// Adding section record instances
					$section->add_section_record( $section_record );

					// properties optional
					if (!empty($this->properties)){
						$section->set_properties($this->properties);
					}

					// view fix. Section instance inherits the view (from API request)
					if (isset($this->view)) {
						$section->set_view($this->view);
					}

					// set dato
					if ($mode==='tm') {
						$section->set_record($current_record); // inject whole db record as var
					}					

					// item sections value. Update in each iteration
					$current_value = new stdClass();
						$current_value->section_tipo	= $section_tipo;
						$current_value->section_id		= $section_id;
					
					// // section info (information about creation, modification and publication of current section)
					// 	$section_info = $section->get_section_info();
					// 	if (!empty($section_info)) {
					// 		foreach ($section_info as $si_key => $si_value) {
					// 			$current_value->{$si_key} = $si_value;
					// 		}
					// 	}
					
					// paginated_key
						$current_value->paginated_key = $key + $offset;
						$key++;
					
					// tm case: inject time machine record metadata
						if ($mode === 'tm') {
							$current_value->matrix_id		= $current_record->id ?? null;
							$current_value->timestamp		= $current_record->timestamp ?? null;
							$current_value->state			= $current_record->state ?? null;
							$current_value->bulk_process_id	= (int)($current_record->bulk_process_id ?? 0);
							$current_value->user_id			= $current_record->userID ?? null;
						}
					
					// add value to item
						$item->value[] = $current_value;					
			}

		// subdatum
			foreach ($section_instances as $section_tipo => $section) {				

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
			}

	}//end if (empty($sections_data))



// JSON string
	return common::build_element_json_output($context, $data);
