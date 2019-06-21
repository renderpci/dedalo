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

		// subdata
			if (!empty($dato)) {

				// search self records to paginate
					$rows_data = $this->get_portal_records($dato);

				// subcontext from layout_map items					
					$layout_map = $this->get_layout_map();
					foreach ($layout_map as $dd_object) {

						$dd_object 		= (object)$dd_object;
						$current_tipo 	= $dd_object->tipo;							
						$mode 			= $dd_object->mode ?? 'list';
						$model 			= RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);							
						$current_lang 	= $dd_object->lang ?? component_common::get_component_lang($current_tipo, DEDALO_DATA_LANG);					
						
						foreach ($rows_data->ar_records as $current_record) {
							
							$current_component = component_common::get_instance( $model,
																				 $current_tipo,
																				 $current_record->section_id,
																				 $mode,
																				 $current_lang,
																				 $current_record->section_tipo);

							// Inject this tipo as related component from_component_tipo
								$current_component->from_component_tipo = $this->tipo;
								$current_component->from_section_tipo 	= $this->section_tipo;

							// get component json
								$get_json_options = new stdClass();
									$get_json_options->get_context 	= false;
									$get_json_options->get_data 	= true;
								$component_json = $current_component->get_json($get_json_options);

							// data add
								$data = array_merge($data, $component_json->data);

						}//end foreach ($rows_data->ar_records as $current_record)
					
					}//end foreach ($layout_map as $section_tipo => $ar_list_tipos) foreach ($ar_list_tipos as $current_tipo)
							
			}//end if (!empty($dato))


		// Value
			$value = $dato;
						
			$item = new stdClass();
				$item->section_id 			= $this->get_section_id();
				$item->tipo 				= $this->get_tipo();
				$item->from_parent 			= isset($this->from_parent) ? $this->from_parent : $item->tipo;
				$item->section_tipo 		= $this->get_section_tipo();
				$item->model 				= get_class($this);
				$item->value 				= $value;

			$data[] = $item;
			
	}//end if $options->get_data===true && $permissions>0



// JSON string
	return common::build_element_json_output($context, $data);