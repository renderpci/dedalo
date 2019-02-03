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


				// ar_list_map 
					$ar_components_with_relations = component_relation_common::get_components_with_relations();
					$ar_list_map = new stdClass();
					// section list
					$layout_map = $this->get_layout_map();
					$ar_subcontext = [];
					foreach ($layout_map as $ar_value) {
						foreach ($ar_value as $current_tipo) {
							
							$item = new stdClass();
								$item->tipo 	 = $current_tipo;

							$ar_list_map->$target_section_tipo[] = $item;

							$modo 			 = 'list';
							$RecordObj_dd 	 = new RecordObj_dd($current_tipo);
							$model 			 = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
							$is_translatable = $RecordObj_dd->get_traducible();
							$lang 			 = ($is_translatable ==='si') ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;								

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
								#$context[0]->json_related_component = $current_tipo;
								#$data =$component_json

								// Add data when current component is not with relations
									#if (!in_array($model, $ar_components_with_relations)) {
										$data = array_merge($data, $component_json->data);
									#}

									#if (!in_array($model, $ar_components_with_relations)) {
									#	$section_info = new stdClass();
									#		$section_info->type 		= 'section_info';
									#		$section_info->modo 		= 'list';
									#		$section_info->section_label= RecordObj_dd::get_termino_by_tipo($current_record->section_tipo, DEDALO_APPLICATION_LANG, true);
									#		$section_info->section_tipo = $current_record->section_tipo;
									#	if (!in_array($section_info, $context)) {
									#		$context[] = $section_info;
									#	}										
									#}

								// Temp ar_subcontext
									$ar_subcontext = array_merge($ar_subcontext, $component_json->context);
									$context[0]->json_related_component[] = $current_tipo;
							}
						}
					}//end foreach ($layout_map as $ar_value)
				
				// sub_context
					$context[0]->sub_context = $ar_subcontext;

					#$current_subcontext 	 = isset($component_json->context[0]->sub_context) ? $component_json->context[0]->sub_context : [];
					#$context[0]->sub_context = array_merge($context[0]->sub_context, $current_subcontext);

					#dump($ar_list_map, ' ar_list_map ++ '.to_string());
				
					#dump($rows_data, ' rows_data ++ '.to_string());
					#$json_rows = section::build_json_rows($rows_data, 'list', $ar_list_map);
					#dump($json_rows, ' json_rows ++ '.to_string());

					#$context = array_merge($context, $json_rows->context);

				// sub_context add temp container if not exists
					foreach ($context[0]->sub_context as $value) {
						if (!in_array($value, $context)) {
							$context[] = $value;
						}
					}
					
				
				// remove after use temporal container
					unset($context[0]->sub_context);

			}//end if (!empty($dato))


		// Value. Gets paginated dato value (1 record for list)
			$value = reset($this->get_dato());	
			
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