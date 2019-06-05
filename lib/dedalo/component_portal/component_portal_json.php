<?php
// JSON data component controller

// context
	$context = [];

		// Component structure context (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context($this->tipo);
			

// data
	$data = [];

		// Building real value			
			$dato = $this->get_dato();
			if (!empty($dato)) {
						
				$ar_target_section_tipo = $this->get_ar_target_section_tipo();
				$target_section_tipo	= reset($ar_target_section_tipo);
				$max_records 			= 1;
				$offset 				= 0;

				// search_query_object_options 
					$search_query_object_options = new stdClass();
						$search_query_object_options->filter_by_locator  = (array)$dato;
						$search_query_object_options->section_tipo 		 = $target_section_tipo;
						$search_query_object_options->tipo 		 		 = $this->tipo;
						
						# paginations options
						$search_query_object_options->limit 		 	= $max_records;
						$search_query_object_options->offset 		 	= $offset;

						// Order
							$order_values = array_map(function($locator){
								return (int)$locator->section_id;
							}, $dato);					
							$item = new stdClass();
								$item->column_name 	 = 'section_id';
								$item->column_values = $order_values;		
							$search_query_object_options->order_custom = [$item];

					$search_query_object = component_portal::build_search_query_object($search_query_object_options);
					$search_query_object->select = [];

				// search 
					$search_development2 = new search_development2($search_query_object);
					$rows_data 		 	 = $search_development2->search();

				// layout_map 
					$layout_map 	= $this->get_layout_map();
					$ar_subcontext 	= [];
					foreach ($layout_map as $section_tipo => $ar_list_tipos) foreach ($ar_list_tipos as $current_tipo) {
							
						$modo 			= 'list';
						$model 			= RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
						$RecordObj_dd 	= new RecordObj_dd($current_tipo);
						$lang 			= ($RecordObj_dd->get_traducible()==='si') ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;

						foreach ($rows_data->ar_records as $current_record) {
						
							$related_component = component_common::get_instance($model,
																		 $current_tipo,
																		 $current_record->section_id,
																		 $modo,
																		 $lang,
																		 $current_record->section_tipo);

							// Inject this tipo as related component from_component_tipo
								$related_component->from_component_tipo = $this->tipo;
								$related_component->from_section_tipo 	= $this->section_tipo;

							$component_json = $related_component->get_json();

							// Add data
								$data = array_merge($data, $component_json->data);

							// temp ar_subcontext
								$ar_subcontext = array_merge($ar_subcontext, $component_json->context);

						}//end foreach ($rows_data->ar_records as $current_record)
					
					}//end foreach ($layout_map as $section_tipo => $ar_list_tipos) foreach ($ar_list_tipos as $current_tipo)

				// ar_subcontext add everyone
					foreach ($ar_subcontext as $value) {
						if (!in_array($value, $context)) {
							$context[] = $value;
						}
					}

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
			

// JSON string
	return common::build_element_json_output($context, $data);