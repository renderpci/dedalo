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
	$context = [];

	if($options->get_context===true && $permissions>0){
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$context[] = $this->get_structure_context_simple($permissions, $add_rqo=true);
				break;

			default:
				// Component structure context (tipo, relations, properties, etc.)
					$current_context = $this->get_structure_context($permissions, $add_rqo=true);
					// // add records_mode to properties, if not already defined
					// if (!isset($current_context->properties->source->records_mode)) {
					// 	if (!property_exists($current_context, 'properties')) {
					// 		$current_context->properties = new stdClass();
					// 	}
					// 	if (!property_exists($current_context->properties, 'source')) {
					// 		$current_context->properties->source = new stdClass();
					// 	}
					// 	$current_context->properties->source->records_mode = 'list';
					// }
					$context[] = $current_context;

				// subcontext from element layout_map items (from_parent, parent_grouper)
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


		# Custom propiedades external dato
		if(	(!empty($this->build_options) && $this->build_options->get_dato_external === true) ||
			(isset($properties->source->mode) && $properties->source->mode==='external')) {
			
			$reference_locator = new locator();
				$reference_locator->set_section_tipo($this->section_tipo);
				$reference_locator->set_section_id($this->section_id);

			# Get calculated inverse locators for all matrix tables
			$ar_inverse_locators = search_related::get_referenced_locators( $reference_locator );

			$new_dato = [];
			foreach ($ar_inverse_locators as $reference_locator) {
				$locator = new locator();
					$locator->set_type($reference_locator->type);
					$locator->set_section_tipo($reference_locator->from_section_tipo);
					$locator->set_section_id($reference_locator->from_section_id);
					$locator->set_component_tipo($reference_locator->tag_component_tipo);
					$locator->set_tag_id($reference_locator->tag_id);
					$locator->set_section_top_id($reference_locator->section_top_id);
					$locator->set_section_top_tipo($reference_locator->section_top_tipo);

					$new_dato[] = $locator;

			}
			$this->set_dato($new_dato);

		}

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

			// subcontext data from layout_map items
				$ar_subdata = $this->get_ar_subdata($value);

			// subdata add
				if ($modo==='list') {
					foreach ($ar_subdata as $current_data) {

						$current_data->parent_tipo			= $tipo;
						$current_data->parent_section_id	= $section_id;

						$data[] = $current_data;
					}
				}else{
					foreach ($ar_subdata as $current_data) {
						$data[] =$current_data;
					}
				}
		}//end if (!empty($dato))
	}//end if $options->get_data===true && $permissions>0



// JSON string
	return common::build_element_json_output($context, $data);
