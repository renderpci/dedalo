<?php
// JSON data component controller



// component configuration vars
	$tipo				= $this->get_tipo();
	$permissions		= common::get_permissions($tipo, $tipo);
	$modo				= $this->get_modo();



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

				$section_id 	= $this->section_id;
				$section_tipo 	= $this->tipo;
		
				// Iterate dd_object for colums
					$layout_map = $this->get_layout_map(); 	#dump($layout_map, ' layout_map DATA ++ '.to_string());
					foreach ((array)$layout_map as $dd_object) {

						$dd_object 		= (object)$dd_object;
						$current_tipo 	= $dd_object->tipo;
						$mode 			= $dd_object->mode ?? 'list';
						$model			= RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
						$current_lang 	= $dd_object->lang ?? component_common::get_component_lang($current_tipo, DEDALO_DATA_LANG);
						
						switch (true) {

							case (strpos($model, 'component_')===0):

								// components
									$current_component  = component_common::get_instance($model,
																						 $current_tipo,
																						 $section_id,
																						 $mode,
																						 $current_lang,
																						 $section_tipo);
								// component ar_layout_map
									#$ar_layout_map = array_filter($layout_map, function($item) use($tipo){
									#	 if($item->typo==='ddo' && $item->parent===$tipo) return $item;
									#});									
									#if (!empty($ar_layout_map)) {
									#	$current_component->layout_map 	= $ar_layout_map;
									#}

								// properties
									if (isset($dd_object->properties)){
										$current_component->set_properties($dd_object->properties);
									}
	
								// get component json
									$get_json_options = new stdClass();
										$get_json_options->get_context 	= false;
										$get_json_options->get_data 	= true;
									$component_json = $current_component->get_json($get_json_options);

								// data add
									$data = array_merge($data, $component_json->data);
								break;

							default:
								# not defined model from context / data
								debug_log(" Section json 2 [data]. Ignored model '$model' - current_tipo: '$current_tipo' ".to_string(), logger::WARNING);
								break;
						}							

					}//end iterate display_items
				
			}//end if (!empty($dato))
			
	}// end if $permissions > 0



// JSON string
	return common::build_element_json_output($context, $data);