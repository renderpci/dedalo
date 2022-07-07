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
	// 	// $api_start_time=start_time();
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

	// context get and fix
		$this->context	= $this->get_structure_context($permissions, $add_request_config=true);
		$context[]		= $this->context;

	if($permissions>0) {

		// short vars
			$section_id	= $this->get_section_id();
			$limit		= $this->pagination->limit;
			$offset		= $this->pagination->offset;

		// custom properties external dato
		// Only is recalculated in edit mode and when is not a pagination request (section request rqo is action=search)
			if ($modo==='edit' && isset(dd_core_api::$rqo) && dd_core_api::$rqo->source->action==='search') {
				if(	(!empty($this->build_options) && $this->build_options->get_dato_external===true) ||
					(isset($properties->source->mode) && $properties->source->mode==='external')) {

					// set_dato_external: $save=false, $changed=false, $current_dato=false, $references_limit=0
					$save				= true; // $modo==='edit' ? true : false;
					$changed			= true; // $modo==='edit' ? true : false;
					$current_dato		= false; // $this->get_dato();
					$references_limit	= 0; // (!) Set to zero to get all references to enable sort
					$this->set_dato_external($save, $changed, $current_dato, $references_limit);	// Forces update dato with calculated external dato
				}
			}

		$dato = $this->get_dato();

		// value
			switch ($modo) {
				case 'list':
					// data item (list mode result don't include self data, only subdata)
					$limit	= 2; // (!) note than in list mode, limit is always 2
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
								// $pagination->offset	= $offset>=$pagination->total
								// 	? floor($pagination->total/$limit) * $limit
								// 	: $offset;

						$item->pagination = $pagination;

					$data[] = $item;

					$subdatum = $this->get_subdatum($tipo, $value);

						// dump($subdatum, ' subdatum +--------------------------------+ '.to_string());

					$ar_subcontext = $subdatum->context;
					foreach ($ar_subcontext as $current_context) {
						$context[] = $current_context;
					}

					$ar_subdata = $subdatum->data;
					foreach ($ar_subdata as $sub_value) {
						$data[] = $sub_value;
					}

				// subdata from subcontext items
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
	}//end if $options->get_data===true && $permissions>0



// JSON string
	return common::build_element_json_output($context, $data);
