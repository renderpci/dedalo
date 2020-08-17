<?php
// JSON data component controller



// component configuration vars
	$permissions		= $this->get_component_permissions();
	$modo				= $this->get_modo();
	$section_tipo 		= $this->section_tipo;
	$lang 				= $this->lang;
	$tipo 				= $this->get_tipo();
	$properties 		= $this->get_properties() ?? new stdClass();



// context
	$context = [];

	if($options->get_context===true && $permissions>0){
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$context[] = $this->get_structure_context_simple($permissions);
				break;

			default:

				// Component structure context (tipo, relations, properties, etc.)
					$current_context = $this->get_structure_context($permissions, $add_request_config=true);

					$context[] = $current_context;

				// subcontext from element layout_map items (from_parent_tipo, parent_grouper)
					$ar_subcontext = $this->get_ar_subcontext($tipo, $tipo);
					foreach ($ar_subcontext as $current_context) {
						$context[] = $current_context;
					}
				break;
		}
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){
		// get the data into DDBB
		$dato 		= $this->get_dato();
		// get the references calculated by relations with other sections
		$references = $this->get_calculated_references();

			$value		= $this->get_dato_paginated();
			$section_id	= $this->get_section_id();
			$limit		= $this->pagination->limit;
			$offset		= $this->pagination->offset;

			// data item
				$item = $this->get_data_item($value);
					$item->parent_tipo			= $tipo;
					$item->parent_section_id	= $section_id;

			if (!empty($dato)) {
				// fix pagination vars
					$pagination = new stdClass();
						$pagination->total	= count($dato);
						$pagination->limit	= $limit;
						$pagination->offset	= $offset;
				$item->pagination = $pagination;

				// subcontext data from layout_map items
				$ar_subdata = $this->get_ar_subdata($value);

				// subdata add
				foreach ($ar_subdata as $current_data) {
					$current_data->parent_tipo			= $tipo;
					$current_data->parent_section_id	= $section_id;
					$data[] = $current_data;
				}
			}//end if (!empty($dato))

		// references
		if (isset($references)) {
			$item->references = $references;
		}

		$data[] = $item;
	}//end if $options->get_data===true && $permissions>0



// JSON string
	return common::build_element_json_output($context, $data);
