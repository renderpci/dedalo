<?php
// JSON data component controller



// component configuration vars
	$permissions		= $this->get_component_permissions();
	$mode				= $this->get_mode();
	$section_tipo		= $this->section_tipo;
	$lang				= $this->lang;
	$tipo				= $this->get_tipo();
	$properties			= $this->get_properties() ?? new stdClass();
	$caller_dataframe	= $this->get_caller_dataframe();

// context
// data
	$context	= [];
	$data		= [];

	// context get and fix
		$this->context = $this->get_structure_context(
			$permissions,
			true // bool add_request_config
		);

		// $this->context->view = 'dataframe';
		
		$context[] = $this->context;

	if($permissions>0) {
	// if($options->get_data===true ){
		// short vars
			$section_id	= $this->get_section_id();
			$limit		= $this->pagination->limit;
			$offset		= $this->pagination->offset;

		$dato = $this->get_dato();

		// value
			switch ($mode) {

				case 'solved':
					$value	= $dato;

					$item = $this->get_data_item($value);
						$item->parent_tipo			= $tipo;
						$item->parent_section_id	= $section_id;
						
					$data[] = $item;
					break;

				case 'list':
				case 'tm':
					// data item (list mode result don't include self data, only subdata)
					// (!) limit note that in list mode, limit is always 1
					$value	= $this->get_dato_paginated($limit);
					break;

				case 'search':
					$value	= $dato;
					break;

				case 'edit':
				default:
					$value	= $this->get_dato_paginated();
					break;
			}//end switch ($mode)

		// data

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
						// specific properties for dataframe
						$item->section_id_key	= $caller_dataframe->section_id_key;
						// $item->tipo_key			= $caller_dataframe->tipo_key;


					$data[] = $item;
			if (!empty($dato) && $mode!='solved') {
				// subdatum
					$subdatum = $this->get_subdatum($tipo, $value);

					$ar_subcontext = $subdatum->context;
					foreach ($ar_subcontext as $current_context) {
						$context[] = $current_context;
					}

					$ar_subdata = $subdatum->data;
					foreach ($ar_subdata as $sub_value) {
						$data[] = $sub_value;
					}

			}//end if (!empty($dato))
		// }// end get_data
	}//end if $options->get_data===true && $permissions>0

// JSON string
	return common::build_element_json_output($context, $data);