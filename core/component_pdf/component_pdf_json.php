<?php
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$properties		= $this->get_properties();



// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$context[] = $this->get_structure_context_simple($permissions);
				break;

			default:
				$current_context = $this->get_structure_context($permissions);

				// append additional info
				$current_context->features = new stdClass();
					$current_context->features->allowed_extensions		= $this->get_allowed_extensions();
					$current_context->features->default_target_quality	= $this->get_original_quality();
					$current_context->features->ar_quality				= $this->get_ar_quality(); // defined in config
					$current_context->features->default_quality			= $this->get_default_quality();
					$current_context->features->quality					= $this->get_quality(); // current instance quality
					$current_context->features->resource_type			= 'pdf';

				$context[] = $current_context;
				break;
		}
	}//end if($options->get_context===true))



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		// value
			switch ($mode) {
				case 'tm':
				case 'list':
					$value = $this->get_list_value();

					// datalist
						// files_info. For fast list we add directly the default image
						$data_item = new stdClass();
							$data_item->url = $this->get_pdf_url(
								DEDALO_PDF_QUALITY_DEFAULT, // string quality
								true, // bool test_file
								false, // bool absolute
								false // bool default_add
							);
							$data_item->quality	= DEDALO_PDF_QUALITY_DEFAULT;
						$datalist = [$data_item];
					break;

				default:
				case 'edit':
					$value = $this->get_dato();

					// datalist
						$datalist = $this->get_datalist();
					break;
			}

		// data item
			$item = $this->get_data_item($value);
			// item datalist
			$item->datalist = $datalist;

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
