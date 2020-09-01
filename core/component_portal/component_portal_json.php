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
		// $api_start_time=microtime(1);
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$context[] = $this->get_structure_context_simple($permissions);
				break;

			default:

				// context and subcontext from API dd_request if already exists sections					
								
				$dd_request = dd_core_api::$dd_request;

				// dd_request
					// $source	= array_find($dd_request, function($item){
					// 	return $item->typo==='source';
					// });
					// if ($source->tipo!==$this->tipo) {
					// 	debug_log(__METHOD__." $this->tipo controller Processing Request. PORTAL. ESTO ES VALIDO ??????????????????????????????????????????????????? ".to_string(), logger::ERROR);
					// 	// throw new Exception("controller Processing Request. PORTAL. ESTO ES VALIDO ??????????????????????????????????????????????????? ", 1);
					// }

				// get request_ddo object	
					$request_ddo = array_find($dd_request, function($item){
						return $item->typo==='request_ddo';
					});
					// dump($request_ddo, ' request_ddo ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ '.to_string($this->tipo));
				
				// when no empty request_ddo->value
				if ($request_ddo && !empty($request_ddo->value)) {

						
					$context = $request_ddo->value;
					// dd_core_api::$context_dd_objects = $context;					
					
				}else{

					// Component structure context (tipo, relations, properties, etc.)
						$current_context = $this->get_structure_context($permissions, $add_request_config=true);

						$context[] = $current_context;

						// dump(null, 'Time to context portal BEFORE SUBCONTEXT: '.exec_time_unit($api_start_time,'ms')." ms".to_string());
					// subcontext from element layout_map items (from_parent, parent_grouper)
						$ar_subcontext = $this->get_ar_subcontext($tipo, $tipo);
						foreach ($ar_subcontext as $current_context) {
							$context[] = $current_context;
						}
					}
				break;
		}
		// dump(null, 'Time to context portal : '.exec_time_unit($api_start_time,'ms')." ms".to_string());
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){
		// $api_start_time_data=microtime(1);

		$section_id	= $this->get_section_id();
		$limit		= $this->pagination->limit;
		$offset		= $this->pagination->offset;

		# Custom propiedades external dato
		if(	!empty($this->build_options)
			&& $this->build_options->get_dato_external === true
			&& isset($properties->source->mode)
			&& $properties->source->mode==='external') {
			$this->set_dato_external(true, true);	// Forces update dato with calculated external dato
		}

		switch ($modo) {
			case 'list':
				$dato	= $this->get_dato();
				$value	= $this->get_dato_paginated();
				break;
			case 'edit':
			default:
				$dato	= $this->get_dato();
				$value	= $this->get_dato_paginated();
				break;
		}
		if (!empty($dato)) {

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
		// dump(null, 'Time to data portal 2 : '.exec_time_unit($api_start_time_data,'ms')." ms".to_string());
	}//end if $options->get_data===true && $permissions>0



// JSON string
	return common::build_element_json_output($context, $data);
