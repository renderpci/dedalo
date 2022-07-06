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
					$current_context->resource_type				= 'svg';

				$context[] = $current_context;
				break;
		}
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		// // Available image files
		// 	$value = [];

		// $test_file = true;

		// $svg_item = new stdClass();
		// 	$svg_item->url = $this->get_url(false, $test_file, false, true); // $quality=false, $test_file=true, $absolute=false, $default_add=true
		// 	$svg_item->quality = DEDALO_SVG_QUALITY_DEFAULT;

		// $value[] = $svg_item;

		// value as array always
			$value = $this->get_dato();
			if (!is_null($value) && !is_array($value)) {
				$value = [$value];
			}

		// get the quality url of the available image files
			switch ($modo) {
				case 'edit':
					$datalist = $this->get_files_info();
					break;

				case 'list':
				default:
					// files_info. For fast list we add directly the default image
						$quality	= DEDALO_SVG_QUALITY_DEFAULT;
						$url		= $this->get_url($quality, false, false, false);
						$image_item = new stdClass();
							$image_item->url		= $url;
							$image_item->quality	= $quality;
						$datalist = [$image_item];
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
