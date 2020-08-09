<?php
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$modo			= $this->get_modo();
	$properties		= $this->get_properties();



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

		$value = $this->get_dato();
		// get the quality url of the available image files
			$valid_urls		= [];
			$test_file 			= ($modo==='list') ? false : true;
			$absolute  			= false;
			$image_ar_quality 	= ($modo==='edit')
				? unserialize(DEDALO_IMAGE_AR_QUALITY)
				: [DEDALO_IMAGE_QUALITY_DEFAULT];

			foreach ($image_ar_quality as $current_quality) {

				if($current_quality===DEDALO_IMAGE_THUMB_DEFAULT) continue;

				$default_add = $current_quality===DEDALO_IMAGE_QUALITY_DEFAULT ? true : false;

				$current_url = $this->get_image_url($current_quality, $test_file, $absolute, $default_add); // $quality=false, $test_file=true, $absolute=false, $default_add=true

				if ($current_url!==false) {

					$image_item = new stdClass();
						$image_item->url 	 = $current_url;
						$image_item->quality = $current_quality;

					$valid_urls[] = $image_item;
				}
			}

		// data item
		$item = $this->get_data_item($value);

		$item->datalist = $valid_urls;

		// base_svg_url
			$item->base_svg_url = $this->get_base_svg_url();
		
		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
