<?php
// JSON data component controller



// component configuration vars
	$permissions		= $this->get_component_permissions();
	$modo				= $this->get_modo();
	$properties 		= $this->get_propiedades();



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

				// append additional info
					$current_context->allowed_extensions 	 = $this->get_allowed_extensions();
					$current_context->default_target_quality = $this->get_original_quality();

				$context[] = $current_context;
				break;
		}
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		// Available image files
			$value = [];

		//$ar_quality = $this->get_ar_image_quality();
		//foreach ($ar_quality as $quality) {
		//	$image_url = $this->get_image_url($quality, true, true, false); // ($quality=false, $test_file=true, $absolute=false, $default_add=true)
		//	if ($image_url!==false) {
		//		$item = new stdClass();
		//			#$item->lang 	= DEDALO_DATA_NOLAN;
		//			$item->url 		= $image_url;
		//			$item->quality 	= $quality;
		//		$value[] = $item;
		//	}
		//}

		$test_file = false;

		$image_item = new stdClass();
			$image_item->url 	 = $this->get_image_url(DEDALO_IMAGE_QUALITY_DEFAULT, $test_file, false, true); // $quality=false, $test_file=true, $absolute=false, $default_add=true
			$image_item->quality = DEDALO_IMAGE_QUALITY_DEFAULT;

		$value[] = $image_item;

		// data item
		$item  = $this->get_data_item($value);

		$data[] = $item;

	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
