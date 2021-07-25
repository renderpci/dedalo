<?php
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$modo			= $this->get_modo();
	$section_tipo	= $this->section_tipo;
	$lang			= $this->lang;
	$tipo			= $this->get_tipo();
	$properties		= $this->get_properties() ?? new stdClass();



// context
	// if($options->get_context===true && $permissions>0){

	// 	switch ($options->context_type) {
	// 		case 'simple':
	// 			// Component structure context_simple (tipo, relations, properties, etc.)
	// 			$context[] = $this->get_structure_context_simple($permissions, $add_rqo=true);
	// 			break;

	// 		default:
	// 			// Component structure context (tipo, relations, properties, etc.)
	// 				$current_context = $this->get_structure_context($permissions, $add_rqo=true);
	// 				// // add records_mode to properties, if not already defined
	// 				// if (!isset($current_context->properties->source->records_mode)) {
	// 				// 	if (!property_exists($current_context, 'properties')) {
	// 				// 		$current_context->properties = new stdClass();
	// 				// 	}
	// 				// 	if (!property_exists($current_context->properties, 'source')) {
	// 				// 		$current_context->properties->source = new stdClass();
	// 				// 	}
	// 				// 	$current_context->properties->source->records_mode = 'list';
	// 				// }
	// 				$context[] = $current_context;

	// 			// subcontext from element layout_map items (from_parent, parent_grouper)
	// 				$ar_subcontext = $this->get_ar_subcontext($tipo, $tipo);
	// 				foreach ($ar_subcontext as $current_context) {
	// 					$context[] = $current_context;
	// 				}
	// 			break;
	// 	}
	// }//end if($options->get_context===true)



// data
	$context	= [];
	$data		= [];

	if($permissions>0){

		$this->context	= $this->get_structure_context($permissions, $add_request_config=true);
		$context[]		= $this->context;

		$dato = $this->get_data();

		if (!empty($dato)) {

			$value		= $this->get_dato_paginated();
			$section_id	= $this->get_parent();
			$limit		= $this->pagination->limit;
			$offset		= $this->pagination->offset;

			// data item
				$item = $this->get_data_item($value);
					$item->parent_tipo			= $tipo;
					$item->parent_section_id	= $section_id;
					// fix pagination vars
						$pagination = new stdClass();
							$pagination->total	= count($dato);
							$pagination->limit	= $limit;
							$pagination->offset	= $offset;
					$item->pagination = $pagination;

				$data[] = $item;

			//used to check if the component has the request_config of the section_tipo 
			$cache_request_config = [];

			foreach ($value as $locator) {
		
				$current_section_tipo	= $locator->section_tipo;
				$current_section_id		= $locator->section_id;

				$section = section::get_instance($current_section_id, $current_section_tipo, 'related_list');

				$section_json = $section->get_json();
				$ar_subcontext	= $section_json->context;
				
				// the the different request_config to be used as configurated request_config of the component

				foreach ($ar_subcontext as $current_context) {

					if ($current_context->model ==='section' 
						&& $current_context->tipo === $current_section_tipo
						&& !in_array($current_section_tipo, $cache_request_config)) {
						// get the section request config (we will use his request config)
						// if the locator has more than 1 section_tipo, will be stored the new request inside the request_config array
						$original_request_config = $current_context->request_config;
						// select api_engine dedalo only configs
							$ar_request_config = array_find($original_request_config, function($el){
								return $el->api_engine==='dedalo';
							});
						$ddo_map = $ar_request_config->show->ddo_map;
						// change the ddo parent of the section to the component, only if the parent is the section_tipo
						// is necesary don't change the ddo with deep dependence 
						foreach ($ddo_map as $current_ddo) {						
							 $current_ddo->parent = ($current_ddo->parent === $current_section_tipo)
								 ? $tipo
								 : $current_ddo->parent;
						}
						$this->context->request_config = [$ar_request_config];

						$cache_request_config[] = $current_section_tipo;
					}

					$current_context->parent = $tipo;
					
					$context[] = $current_context;
				}					

				$ar_subdata		= $section_json->data;
				foreach ($ar_subdata as $sub_value) {
					$sub_value->parent = $tipo;
					$data[] = $sub_value;
				}
			

				// $context	= array_merge($context, $section_json->context);
				// $data		= array_merge($data, $section_json->data);

			}
	
			// if (!empty($ar_section_tipo)) {
			// 	foreach ($ar_section_tipo as $current_section_tipo) {

			// 		$section = section::get_instance(null, $current_section_tipo, 'list');

			// 		$section_options = new stdClass();
			// 				$section_options->get_context	= true;
			// 				$section_options->get_data 	 	= false;
			// 			$section_json = $section->get_json($section_options);

			// 		$context = array_merge($context, $section_json->context);
			// 	}
			// }





			// subcontext data from layout_map items
				// $ar_subdata = $this->get_ar_subdata($value);

			// $subdatum = $this->get_subdatum($tipo, $value);

			// $ar_subcontext	= $subdatum->context;
			// foreach ($ar_subcontext as $current_context) {
			// 	$context[] = $current_context;
			// }					
			
			// $ar_subdata		= $subdatum->data;


			// // subdata add
			// 	if ($modo==='list') {
			// 		foreach ($ar_subdata as $current_data) {

			// 			$current_data->parent_tipo			= $tipo;
			// 			$current_data->parent_section_id	= $section_id;

			// 			$data[] = $current_data;
			// 		}
			// 	}else{
			// 		foreach ($ar_subdata as $current_data) {
			// 			$data[] =$current_data;
			// 		}
			// 	}
		}//end if (!empty($dato))
	}//end if $options->get_data===true && $permissions>0



// JSON string
	return common::build_element_json_output($context, $data);
