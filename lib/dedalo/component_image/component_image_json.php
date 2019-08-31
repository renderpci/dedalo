<?php
// JSON data component controller



// component configuration vars
	$permissions		= $this->get_component_permissions();
	$modo				= $this->get_modo();



// context
	$context = [];

	if($options->get_context===true){

		// Component structure context (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context($permissions);

	}//end if($options->get_context===true)



// context_simple
	if($options->get_context_simple===true){

		// Component structure context_simple (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context_simple($permissions);

	}//end if($options->get_context_simple===true)



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
			$image_item = new stdClass();
				$image_item->url 	 = $this->get_image_url(DEDALO_IMAGE_QUALITY_DEFAULT, false, false, false);
				$image_item->quality = DEDALO_IMAGE_QUALITY_DEFAULT;
			
			$value[] = $image_item;

			// data item
			$item  = $this->get_data_item($value);

			$data[] = $item;

	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);