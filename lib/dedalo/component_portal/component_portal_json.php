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
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$context[] = $this->get_structure_context_simple($permissions);
				break;

			default:
				// Component structure context (tipo, relations, properties, etc.)
					$current_context = $this->get_structure_context($permissions);
					// add records_mode if not defined to properties
					if (!isset($properties->source->records_mode)) {
						$current_context->properties->source->records_mode = 'list';
					}
					$context[] = $current_context;

				// subcontext from element layout_map items
					$ar_subcontext = $this->get_ar_subcontext();
					foreach ($ar_subcontext as $current_context) {
						$context[] = $current_context;
					}
				break;
		}
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		$dato = $this->get_dato();
		if (!empty($dato)) {

			// Value
				$value = $dato;

				// data item
				$item  = $this->get_data_item($value);

				$data[] = $item;

			// subdata . search self records to paginate
				$rows_data 	 = $this->get_portal_records($dato);
				$ar_locators = array_map(function($item){
					$locator = new stdClass();
						$locator->section_tipo 	= $item->section_tipo;
						$locator->section_id 	= $item->section_id;
					return $locator;
				}, $rows_data->ar_records);

			// subcontext data from layout_map items
				$ar_subdata = $this->get_ar_subdata($ar_locators);

			// subdata add
				foreach ($ar_subdata as $current_data) {
					$data[] = $current_data;
				}

		}//end if (!empty($dato))

	}//end if $options->get_data===true && $permissions>0



// JSON string
	return common::build_element_json_output($context, $data);
