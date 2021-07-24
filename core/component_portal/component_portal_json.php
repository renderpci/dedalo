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
	// $context = [];

	// if($options->get_context===true && $permissions>0){
	// 	// $api_start_time=microtime(1);
	// 	switch ($options->context_type) {
	// 		case 'simple':
	// 			// Component structure context_simple (tipo, relations, properties, etc.)
	// 				$context[] = $this->get_structure_context_simple($permissions, $add_rqo=true);
	// 			break;

	// 		default:

	// 			// Component structure context (tipo, relations, properties, etc.)
	// 				$current_context	= $this->get_structure_context($permissions, $add_request_config=true);
	// 				$context[]			= $current_context;

	// 			// subcontext from element layout_map items (from_parent, parent_grouper)
					// $ar_subcontext = $this->get_ar_subcontext($tipo, $tipo);
	// 				foreach ($ar_subcontext as $current_context) {
	// 					$context[] = $current_context;
	// 				}


	// 			break;
	// 	}
	// 	// dump(null, 'Time to context portal : '.exec_time_unit($api_start_time,'ms')." ms".to_string());
	// }//end if($options->get_context===true)



// data
	$context	= [];
	$data		= [];

	if($permissions>0){

		// context get and fix
			$this->context	= $this->get_structure_context($permissions, $add_request_config=true);
			$context[]		= $this->context;

		// short vars
			$section_id	= $this->get_section_id();
			$limit		= $this->pagination->limit;
			$offset		= $this->pagination->offset;

		// custom properties external dato
			if(	(!empty($this->build_options) && $this->build_options->get_dato_external === true) ||
				(isset($properties->source->mode) && $properties->source->mode==='external')) {
				$this->set_dato_external(true, true);	// Forces update dato with calculated external dato
			}

		$dato = $this->get_dato();

		// value
			switch ($modo) {
				case 'list':
					// data item (list mode result don't include self data, only subdata)				
					$limit  = 2; // (!) note than in list mode, limit is always 2
					$value	= $this->get_dato_paginated($limit);
					break;

				case 'search':
					$value	= $dato;
					break;

				case 'edit':
				default:
					$value	= $this->get_dato_paginated();
					break;
			}//end switch ($modo)

		// data
		if (!empty($dato)) {

			// data item (list mode result don't include self data, only subdata)
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

				$subdatum = $this->get_subdatum($tipo, $value);

				$ar_subcontext = $subdatum->context;
				foreach ($ar_subcontext as $current_context) {
					$context[] = $current_context;
				}

				$ar_subdata = $subdatum->data;
				foreach ($ar_subdata as $sub_value) {
					$data[] = $sub_value;
				}


			// // subdata from subcontext items
				// 	$ar_subdata = $this->get_ar_subdata($value);

				// 	// if ($modo==='list') {
				// 		foreach ($ar_subdata as $current_data) {

				// 			// add subdata items parent_tipo/parent_section_id to identify indirect data
				// 				// $current_data->parent_tipo			= $tipo;
				// 				// $current_data->parent_section_id	= $current_data->section_id; //	$section_id;

				// 			$data[] = $current_data;
				// 		}
				// 	// }else{
				// 	// 	foreach ($ar_subdata as $current_data) {
				// 	// 		$data[] = $current_data;
				// 	// 	}
				// 	// }


		}//end if (!empty($dato))
		// dump(null, 'Time to data portal 2 : '.exec_time_unit($api_start_time_data,'ms')." ms".to_string());
	}//end if $options->get_data===true && $permissions>0
	// dump($context, ' context ++ '.to_string($this->tipo));
	// dump($data, ' data ++ '.to_string($this->tipo));


// JSON string
	return common::build_element_json_output($context, $data);
