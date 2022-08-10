<?php
// JSON data component controller


// component configuration vars
	$permissions	= $this->get_component_permissions();
	$modo			= $this->get_modo();
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
					$current_context->allowed_extensions		= $this->get_allowed_extensions();
					$current_context->default_target_quality	= $this->get_original_quality();
					$current_context->ar_quality				= $this->get_ar_quality(); // defined in config
					$current_context->default_quality			= $this->get_default_quality();
					$current_context->quality					= $this->get_quality(); // current instance quality
					$current_context->resource_type				= 'image';

				$context[] = $current_context;
				break;
		}
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		// value
			switch ($modo) {
				case 'list':
					$value = $this->get_list_value();

					// datalist
						// files_info. For fast list we add directly the default image
						$thumb_data_item = new stdClass();
							$thumb_data_item->url		= $this->get_url(DEDALO_IMAGE_THUMB_DEFAULT, false, false, false);
							$thumb_data_item->quality	= DEDALO_IMAGE_THUMB_DEFAULT;

						$default_data_item = new stdClass();
							$default_data_item->url		= $this->get_url(DEDALO_IMAGE_QUALITY_DEFAULT, false, false, false);
							$default_data_item->quality	= DEDALO_IMAGE_QUALITY_DEFAULT;

						$datalist = [$thumb_data_item, $default_data_item ];
					break;

				case 'edit':
				default:
					$value = $this->get_dato();

					// datalist. get the quality url of the available image files
						$datalist = $this->get_files_info();
					break;
			}

		// data item
			$item = $this->get_data_item($value);
			// base_svg_url
			$item->base_svg_url = $this->get_base_svg_url(true);
			// item datalist
			$item->datalist = $datalist;


		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
