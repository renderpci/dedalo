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

			$item = new stdClass();
				$item->url 		= $this->get_image_url(DEDALO_IMAGE_QUALITY_DEFAULT, false, false, false);
				$item->quality 	= DEDALO_IMAGE_QUALITY_DEFAULT;
			$value[] = $item;


			$item = new stdClass();
				$item->section_id 			= $this->get_section_id();
				$item->tipo 				= $this->get_tipo();
				$item->from_parent		 	= isset($this->from_parent) ? $this->from_parent : $item->tipo;
				$item->from_section_tipo 	= isset($this->from_section_tipo) ? $this->from_section_tipo : $this->get_section_tipo();
				$item->section_tipo 		= $this->get_section_tipo();
				$item->value 				= $value;

			$data[] = $item;

	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);