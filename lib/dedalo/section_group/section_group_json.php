<?php
// JSON data for section_group controller



// configuration vars
	$tipo				= $this->get_tipo();
	$section_tipo		= $this->get_section_tipo();
	$permissions		= common::get_permissions($section_tipo,$tipo);



// context
	$context = [];

	if($options->get_context===true){

		// Element structure context (tipo, relations, properties, etc.)
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

		$data = $this->get_ar_subdata();
		/*
		$section_id 	= $this->section_id; // injected in section json controller
		$section_tipo 	= $this->section_tipo;

		// Iterate dd_object for colums
			$layout_map = $this->get_layout_map();	#dump($layout_map, ' layout_map ++ '.to_string());
			foreach ((array)$layout_map as $dd_object) {
			
				$dd_object 		= (object)$dd_object;
				$current_tipo 	= $dd_object->tipo;
				$mode 			= $dd_object->mode ?? 'list';
				$model			= RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
				$current_lang 	= $dd_object->lang ?? component_common::get_component_lang($current_tipo, DEDALO_DATA_LANG);
				
				switch (true) {
					// components case
					case (strpos($model, 'component_')===0):

						// components
							$current_component  = component_common::get_instance($model,
																				 $current_tipo,
																				 $section_id,
																				 $mode,
																				 $current_lang,
																				 $section_tipo);
						// properties
							if (isset($dd_object->properties)){
								$current_component->set_properties($dd_object->properties);
							}

						// get component json
							$get_json_options = new stdClass();
								$get_json_options->get_context 	= false;
								$get_json_options->get_data 	= true;
							$element_json = $current_component->get_json($get_json_options);						
						break;

					// grouper case
					case (in_array($model, layout_map::$groupers)):
						
						$related_element = new $model($current_tipo, $section_tipo, $mode);

						// inject section_id
							$related_element->section_id = $section_id;

						// get component json
							$get_json_options = new stdClass();
								$get_json_options->get_context 	= false;
								$get_json_options->get_data 	= true;
							$element_json = $related_element->get_json($get_json_options);
						break;

					// oters
					default:
						# not defined model from context / data
						debug_log(" Section json 2 [data]. Ignored model '$model' - current_tipo: '$current_tipo' ".to_string(), logger::WARNING);
						break;
				}

				// data add
					if (isset($element_json)) {
						// data add
							$data = array_merge($data, $element_json->data);
					}					

			}//end foreach ((array)$layout_map as $dd_object) {
		*/
	}//end if($options->get_data===true && $permissions>0)

// JSON string
	return common::build_element_json_output($context, $data);