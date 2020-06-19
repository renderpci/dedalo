<?php
// JSON data component controller



// component configuration vars
	$permissions		= $this->get_component_permissions();
	$modo				= $this->get_modo();
	$properties 		= $this->get_properties();



// context
	$context = [];

	if($options->get_context===true && $permissions>0){
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$context[] = $this->get_structure_context_simple($permissions);
				break;

			default:
				$current_context = $this->get_structure_context($permissions);

				// allowed_extensions
				$current_context->allowed_extensions = $this->get_allowed_extensions();
				$current_context->default_target_quality = $this->get_original_quality();

				$context[] = $current_context;
				break;
		}
	}//end if($options->get_context===true))



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		// Value
		$value = $this->get_dato();

		$valid_urls = [];
		$pdf_item = new stdClass();
			$pdf_item->url 	 	= $this->get_pdf_url(DEDALO_PDF_QUALITY_DEFAULT, true); // $quality=false, $test_file=true, $absolute=false, $default_add=false
			$pdf_item->quality 	= DEDALO_PDF_QUALITY_DEFAULT;

		$valid_urls[] = $pdf_item;

		// data item
		$item = $this->get_data_item($value);

		$item->datalist = $valid_urls;

		$data[] = $item;

	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
