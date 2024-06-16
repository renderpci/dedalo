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

		// relation index use his own data_paginated
		// data of get_dato is a full data as others portals
		// and it can't be get all references of all calling sections
		// sometimes it could be thousands records and is better paginated it.
		$dato = $this->get_dato_paginated();

		if (!empty($dato)) {

			$value		= $dato;
			$section_id	= $this->get_parent();
			$limit		= $this->pagination->limit;
			$offset		= $this->pagination->offset;
			$total 		= $this->pagination->total ?? null;

			// get all section context at first call of the component
			// it get all section_tipo and the first record to get the context and subcontext
			// of every section, when the component is paginated ($offset > 0) do not calculate again
			if($offset === 0){
				$related_section_context = $this->get_related_section_context();
				$context = array_merge($context, $related_section_context);
			}

			// data item
				$item = $this->get_data_item($value);
					$item->parent_tipo			= $tipo;
					$item->parent_section_id	= $section_id;
					// fix pagination vars
						$pagination = new stdClass();
						// if total is set, use it, else calculate
							$pagination->total	= isset($total)
								? $total
								: $this->count_data();
							$pagination->limit	= $limit;
							$pagination->offset	= $offset;
					$item->pagination = $pagination;

				$data[] = $item;

			// subdatum
				foreach ($value as $locator) {

					$datum = $this->get_section_datum_from_locator($locator);

					// context become calculated and merged with previous
					$context = array_merge($context, $datum->context);

					$ar_subdata	= $datum->data;
					foreach ($ar_subdata as $sub_value) {
						$sub_value->parent = $tipo;
						$data[] = $sub_value;
					}
				}//end foreach ($value as $locator)

			// update parents (only when parent is into the sqo sections list).
			// To allow client JS to get calculated subdatum, it is necessary to change
			// the parent of each ddo within the request config
				$found = array_find($context, function($el){
					return $el->tipo===$this->tipo;
				});
				if (is_object($found)) {
					$found_request_config = array_find($found->request_config, function($el){
						return $el->api_engine==='dedalo';
					});
					if (is_object($found_request_config)) {

						$ar_section_tipo = array_map(function($el){
							return $el->tipo;
						}, $found_request_config->sqo->section_tipo);

						foreach ($found_request_config->show->ddo_map as $current_ddo) {
							// change the ddo parent of the section to the component, only if the parent is the section_tipo
							// is necessary don't change the ddo with deep dependence
							if (in_array($current_ddo->parent, $ar_section_tipo)) {
								$current_ddo->parent = $tipo;
							}
						}
					}
				}

			// des
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
