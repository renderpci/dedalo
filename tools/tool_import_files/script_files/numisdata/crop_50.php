<?php declare(strict_types=1);

/**
* CROP_50
* Split images with white background into obverse and reverse and insert then in the images portal
* Used to crop coins in numismatic object (numisdata4)
* Images needs to be clear differentiate the subject and the background
* Don't use for images with other background.
* @param object $request_options
* @return object $response
*/
function crop_50( object $request_options ) : object {

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed';

	$options = new stdClass();
		$options->section_tipo			= null;
		$options->section_id			= null;
		$options->target_component		= null;
		$options->file_name				= null;
		$options->file_path				= null;
		$options->tool_config			= null;
		$options->key_dir				= null;
		$options->custom_target_quality	= null;
		$options->custom_arguments 		= null;
		$options->components_temp_data	= null;
		foreach ($request_options as $key => $value) {
			if (property_exists($options, $key)) {
				$options->$key = $value;
				$$key = $value; // Create simple variables for easy select
			}
		}

	// target component info
		$target_ddo = array_find($tool_config->ddo_map, function($item){
			return $item->role === 'target_component';
		});
		$target_component_tipo	= $target_ddo->tipo;
		$target_component_model	= RecordObj_dd::get_modelo_name_by_tipo($target_component_tipo, true);

	$file_data 		= tool_import_files::get_file_data($file_path, $file_name);
	$source_image 	= $file_data['file_path'];

	$bit_image =  $file_data['dir_path'] . '/' .$file_data['file_name'] . '_projection.png';// . $file_data['extension'];

	// Cropping the image

	// Step 1: Generate 1-pixel grayscale image
	$conver_to_bit = ImageMagick::get_imagemagick_installed_path() . " \"$source_image\" -colorspace gray -negate -threshold 5% -type bilevel \"$bit_image\"";
	shell_exec($conver_to_bit);

	// Step 2: Extract grayscale values
	$objects_info = $file_data['dir_path'] . '/objects_info.txt';
	$cmd = ImageMagick::get_imagemagick_installed_path() . " \"$bit_image\" -define connected-components:verbose=true -define connected-components:area-threshold=30000 -connected-components 8 null: | awk 'NR>1{print $2, $5}' > \"$objects_info\"";
	shell_exec($cmd);

	// Step 3: Parse bounding boxes from connected components data
	$data = file_get_contents($objects_info);
	preg_match_all('/(\d+)x(\d+)\+(\d+)\+(\d+) gray\(255\)/', $data, $matches, PREG_SET_ORDER);

	// step 4: get the regions found.
	$regions = [];
	foreach ($matches as $match) {
		[$full, $w, $h, $x, $y ] = $match;

		// Skip small blobs (noise)
		if ($w > 50 && $h > 50) {
			$regions[] = ['x' => $x, 'y' => $y, 'w' => $w, 'h' => $h];
		}
	}

	// remove the process files.
		unlink($bit_image);
		unlink($objects_info);

	// if the image has more than 2 regions, stop the process, the image background is not clean enough.
	if( count($regions) !== 2){
		$response->msg = 'Error. Image with a dirty background, impossible to identify the subject, to many matches';
		return $response;
	}

	// max height
	// it will used to set the most higher value of the height to the other image.
	usort($regions, fn($a, $b) => $b['h'] <=> $a['h']);
	$max_height = $regions[0]['h'];

	// Step 5: Sort regions left to right
	usort($regions, fn($a, $b) => $a['x'] <=> $b['x']);

	// Step 6: Crop each coin from original image and add the white space for the smallest height image.
	foreach ($regions as $key => $region) {
		$outputFile = $file_data['dir_path'] . '/' .$file_data['file_name'] . '_crop-' .$key. '.' . $file_data['extension'];

			$cmd = sprintf(
				ImageMagick::get_imagemagick_installed_path() . " \"%s\" -crop %dx%d+%d+%d +repage -background white -gravity center -extent %dx%d \"%s\"",
				$source_image,
				$region['w'], // crop width
				$region['h'], // crop height
				$region['x'], // crop from x point
				$region['y'], // crop from y point
				$region['w'],// expand to the width
				$max_height, // expand to the max_height (the tiny image will expand with white to sustain the height in both images)
				$outputFile,
			);

			exec($cmd);
	}

	$crop_number = 0;
	foreach ($custom_arguments as $destination => $component_tipo) {

		$model_name 		= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		$component_portal 	= component_common::get_instance(
			$model_name,
			$component_tipo,
			$section_id,
			'edit',
			DEDALO_DATA_NOLAN,
			$section_tipo
		);

		// Portal target_section_tipo
		$target_section_tipo = $component_portal->get_ar_target_section_tipo()[0];
		// $properties 		 = $component_portal->get_properties();
		// $tool_properties 	 = $properties->ar_tools_name->tool_import_files;

		$portal_response = (object)$component_portal->add_new_element((object)[
			'target_section_tipo' => $target_section_tipo
		]);
		if ($portal_response->result===false) {
			$response->result 	= false;
			$response->msg 		= "Error on create portal children: ".$portal_response->msg;
			return $response;
		}
		// save portal if all is OK
		$component_portal->Save();

		$current_section_id = $portal_response->section_id;

		// File target name
		$crop_file_name	= $file_data['file_name'] . "_crop-" . $crop_number . '.' . $file_data['extension'];

		// File target data
		$file_crop_data = tool_import_files::get_file_data($file_data['dir_path'], $crop_file_name);

		// Set components data
		// set data into target section of the component adding information provided by the user.
			$components_data_options = new stdClass();
				$components_data_options->ar_ddo_map					= $tool_config->ddo_map ?? [];
				$components_data_options->section_tipo					= $section_tipo;
				$components_data_options->section_id					= $section_id;
				$components_data_options->target_section_id				= $current_section_id;
				$components_data_options->target_ddo_component			= $target_ddo;
				$components_data_options->file_data						= $file_data;
				$components_data_options->current_file_name				= $file_name;
				$components_data_options->target_component_model		= $target_component_model;
				$components_data_options->components_temp_data			= $components_temp_data;

			tool_import_files::set_components_data($components_data_options);

		// set_media_file. Move uploaded file to media folder and create default versions
		$add_file_options = new stdClass();
			$add_file_options->name			= $crop_file_name; // string original file name like 'IMG_3007.jpg'
			$add_file_options->key_dir		= $key_dir; // string upload caller name like 'oh1_oh1'
			$add_file_options->tmp_dir		= 'DEDALO_UPLOAD_TMP_DIR'; // constant string name like 'DEDALO_UPLOAD_TMP_DIR'
			$add_file_options->tmp_name		= $crop_file_name; // string like 'phpJIQq4e'
			$add_file_options->quality		= $custom_target_quality;
			$add_file_options->source_file	= null;
			$add_file_options->size			= $file_crop_data['file_size'];
			$add_file_options->extension	= $file_crop_data['extension'];

		// Save file and verions
		tool_import_files::set_media_file(
			$add_file_options,
			$target_section_tipo,
			$current_section_id,
			$target_component_tipo
		);

		$crop_number++;
	}

	$response->result	= true;
	$response->msg		= 'OK. Request done';


	return $response;
}//end crop_50
