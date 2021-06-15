<?php
// JSON data controller



// configuration vars
	$tipo			= $this->get_tipo();
	$permissions	= common::get_permissions($tipo, $tipo);
	$modo			= $this->get_modo();



// context
	$context = [];
	
	if($options->get_context===true  && $permissions>0){
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$context[] = $this->get_structure_context_simple($permissions, $add_rqo=false);
				break;

			default:
				if ($modo==='tm') {
					// Component structure context (tipo, relations, properties, etc.)
						$context = $this->get_tm_context($permissions);
					
				}else{

					// section structure context (tipo, relations, properties, etc.)
						$context[] = $this->get_structure_context($permissions, $add_rqo=true);
				
					// subcontext from element layout_map items (from_parent_tipo, parent_grouper)
						$ar_subcontext = $this->get_ar_subcontext($tipo, $tipo);
						foreach ($ar_subcontext as $current_context) {
							$context[] = $current_context;
						}
						
					// $rqo = dd_core_api::$rqo;

						// $request_ddo = array_find($dd_request, function($item){
						// 	return $item->typo==='request_ddo';
						// });
						// dump($request_ddo, ' request_ddo ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ '.to_string($this->tipo));
					
					// when no empty request_ddo->value
					// if ($request_ddo && !empty($request_ddo->value)) {
						
					// 	$context = $request_ddo->value;
					// 	// dd_core_api::$context_dd_objects = $context;
						
					// }else{

						// // section structure context (tipo, relations, properties, etc.)
						// 	$context[] = $this->get_structure_context($permissions, $add_rqo=true);
						
						// // subcontext from element layout_map items (from_parent_tipo, parent_grouper)
						// 	$ar_subcontext = $this->get_ar_subcontext($tipo, $tipo);
						// 	foreach ($ar_subcontext as $current_context) {
						// 		$context[] = $current_context;
						// 	}						
					// }
				}
				break;
		}

		$this->context = $context;
	}//end if($options->get_context===true)




// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		if ($modo==='tm') {
			
			// subdata add
				$data = $this->get_tm_ar_subdata();

		}else{

			// data
				// $locator = new stdClass();
				// 	$locator->section_tipo 	= $this->tipo;
				// 	$locator->section_id 	= $this->section_id;

				// $item = new stdClass();
				// 	#$item->typo 		= 'section';
				// 	$item->section_tipo = $this->tipo;
				// 	$item->tipo 		= $this->tipo;
				// 	$item->value 		= [$locator];

				// $data[] = $item;
				// 	dump($data, ' data +----+ '.to_string());


			// subdata
				// default locator build with this section params
					$section_id		= $this->get_section_id();
					$section_tipo	= $this->get_tipo();

					$locator = new locator();
					 	$locator->set_section_tipo($section_tipo);
					 	$locator->set_section_id($section_id);

					$value = [$locator];

				// subdata add
					$sub_data = $this->get_ar_subdata($value);
					foreach ($sub_data as $value) {
						$data[] = $value;
					}
		}

	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
