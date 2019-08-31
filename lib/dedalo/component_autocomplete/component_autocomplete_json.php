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
			$context[] = $this->get_structure_context($permissions, $sqo_context=true);

		// subcontext from element layout_map items
			$ar_subcontext = $this->get_ar_subcontext();
			foreach ($ar_subcontext as $current_context) {
				$context[] = $current_context;
			}

	}//end if($options->get_context===true)



// context_simple
	if($options->get_context_simple===true){

		// Component structure context_simple (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context_simple($permissions);

	}//end if($options->get_context_simple===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		$section_id	= $this->get_parent();
		$properties = $this->get_propiedades();

		switch ($modo) {
			case 'edit':
				$dato 	= $this->get_dato();
				$value 	= $this->get_dato_paginated();				
				$limit 	= $this->pagination->limit ?? $properties->max_records ?? 10;

				break;

			case 'list':
				$dato 	= $this->get_dato();
				$limit 	= $this->pagination->limit ?? $properties->list_max_records ?? 10;
				break;
		}

		if (!empty($dato)) {
			
			// data item
				$item = $this->get_data_item($value);
					$item->parent_tipo 			= $tipo;
					$item->parent_section_id 	= $section_id;
					// fix pagination vars
						$pagination = new stdClass();
							$pagination->total	= count($dato);
							$pagination->limit 	= $limit;
							$pagination->offset = $this->pagination->offset ?? 0;
					$item->pagination = $pagination;

				$data[] = $item;

			// subcontext data from layout_map items	
				$ar_subdata = $this->get_ar_subdata($value);

			// subdata add
				foreach ($ar_subdata as $current_data) {
					$current_data->parent_tipo 			= $tipo;
					$current_data->parent_section_id 	= $section_id;
					$data[] = $current_data;
				}
	
	
		}//end if (!empty($dato))		
	}//end if $options->get_data===true && $permissions>0



// JSON string
	return common::build_element_json_output($context, $data);