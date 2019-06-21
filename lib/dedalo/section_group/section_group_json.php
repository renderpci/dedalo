<?php
// JSON data for section_group controller


// configuration vars
	$tipo				= $this->get_tipo();
	$section_tipo		= $this->get_section_tipo();
	$permissions		= common::get_permissions($section_tipo,$tipo);

// context
	$context = [];

		// Element structure context (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context($permissions);
			/*
			// from requested context if exists
				if (isset(dd_api::$ar_dd_objects)) {
				 	$ar_request_dd_object = array_filter(dd_api::$ar_dd_objects, function($item) use($tipo, $section_tipo){
						if ($item->parent===$tipo && $item->section_tipo===$section_tipo) {
							return $item;
						}
					});
				}

			// subcontext from layout_map items
				if (!empty($ar_request_dd_object)) {
									
					$ar_subcontext 	= [];
					foreach ($ar_request_dd_object as $dd_object) {

						$dd_object 				= (object)$dd_object;
						$current_tipo 			= $dd_object->tipo;
						$current_section_tipo 	= $dd_object->section_tipo;					
						$mode 					= $dd_object->mode ?? 'list';
						$model 					= RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);

						switch (true) {
							case (strpos($model, 'component_')===0):						
								
								$current_lang 	 = $dd_object->lang ?? component_common::get_component_lang($current_tipo, DEDALO_DATA_LANG);
								
								$related_element = component_common::get_instance( 	$model,
																					$current_tipo,
																					null,
																					$mode,
																					$current_lang,
																					$current_section_tipo);
								break;
							
							case (in_array($model, layout_map::$groupers)):
								
								$related_element = new $model($current_tipo, $current_section_tipo, $mode);											
								break;

							default:
								debug_log(" Section json 1 [context]. Ignored model '$model' - current_tipo: '$current_tipo' ".to_string(), logger::WARNING);
								break;
						}
						
						if (isset($related_element)) {				
						
							// get the JSON context of the related component
								$item_options = new stdClass();
									$item_options->get_context 	 = true;
									$item_options->get_data 	 = false;
								$element_json = $related_element->get_json($options);

							// temp ar_subcontext
								$ar_subcontext = array_merge($ar_subcontext, $element_json->context);
					
						}
					
					}//end foreach ($layout_map as $section_tipo => $ar_list_tipos) foreach ($ar_list_tipos as $current_tipo)

					// ar_subcontext add everyone
						foreach ($ar_subcontext as $value) {
							#if (!in_array($value, $context)) {
								$context[] = $value;
							#}
						}

				}//end if (!empty($ar_request_dd_object))
			*/


// data
	$data = [];



// JSON string
	return common::build_element_json_output($context, $data);