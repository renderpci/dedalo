<?php
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
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


	// context
		$this->context = $this->get_structure_context(
			$permissions,
			true // add_request_config
		);
		$context[] = $this->context;


	if($permissions>0) {

		$dato = $this->get_dato();

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

			// used to check if the component has the request_config of the section_tipo
				// $cache_request_config = [];

			foreach ($value as $locator) {

				$datum = $this->get_section_datum_from_locator($locator);

				// context become calculated and merge with previous
				$context = array_merge($context, $datum->context);

				$ar_subdata	= $datum->data;
				foreach ($ar_subdata as $sub_value) {
					$sub_value->parent = $tipo;
					$data[] = $sub_value;
				}

				// $context	= array_merge($context, $section_json->context);
				// $data	= array_merge($data, $section_json->data);
			}//end foreach ($value as $locator)

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
			// 	if ($mode==='list') {
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
