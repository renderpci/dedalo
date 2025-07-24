<?php
/**
* CLASS TOOL_IMAGE_ROTATION
* Handle the images rotation tool logic
*/
class tool_image_rotation extends tool_common {



	/**
	* APPLY_ROTATION
	* Render the image file using the user selected rotation parameters
	* @param object $options
	* @return object $response
	*/
	public static function apply_rotation(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options
			$tipo			= $options->tipo ?? null;
			$section_id		= $options->section_id	?? null;
			$section_tipo	= $options->section_tipo ?? null;
			// rotation_degrees is a double-precision floating-point value indicating
			// the current rotation in degrees.
			$degrees			= $options->rotation_degrees ?? 0;
			$background_color	= $options->background_color ?? '#ffffff';
			$alpha				= $options->alpha?? null;
			$rotation_mode		= $options->rotation_mode?? 'default';
			$crop_area 			= $options->crop_area ?? null;

		// component
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
			$component	= component_common::get_instance(
				$model,
				$tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

		$dato		= $component->get_dato()[0];
		$files_info	= $dato->files_info ?? [];
		// $value

		$result = true;
		if($degrees !== "0"){
			foreach ($files_info as $value) {

				if($value->quality === 'original'){
					continue;
				}
				if($value->file_exist === true){

					$rotation_options = new stdClass();
						$rotation_options->quality			= $value->quality;
						$rotation_options->extension		= $value->extension;
						$rotation_options->degrees			= $degrees;
						$rotation_options->rotation_mode	= $rotation_mode;
						$rotation_options->background_color	= $background_color;
						$rotation_options->alpha			= $alpha ?? null;

					// result boolean
					$command_result = $component->rotate($rotation_options);
					if (!empty($command_result)){
						$result				= false;
						$response->errors[]	= $command_result;
					}
				}
			}
		}

		// crop
		if( isset($crop_area) && isset($crop_area->x) ){
			$default_quality	= $component->get_default_quality();
			$default_file		= $component->get_media_filepath($default_quality);
			$default_size		= $component->get_image_dimensions($default_file);

			foreach ($files_info as $value) {

				if($value->quality === 'original'){
					continue;
				}
				if($value->file_exist === true){

					$current_file		= $component->get_media_filepath($value->quality, $value->extension);
					$current_size		= $component->get_image_dimensions($current_file);
					// get the area proportions
					$width_proportion	= $current_size->width / $default_size->width;
					$height_proportion	= $current_size->height / $default_size->height;
					// set the area to crop with the proportions of the current image size
					$current_crop_area = (object)[
						'x'			=> $crop_area->x 		* $width_proportion,
						'y'			=> $crop_area->y 		* $height_proportion,
						'width'		=> $crop_area->width 	* $width_proportion,
						'height'	=> $crop_area->height 	* $height_proportion
					];

					$crop_options = new stdClass();
						$crop_options->quality			= $value->quality;
						$crop_options->extension		= $value->extension;
						$crop_options->crop_area		= $current_crop_area;

					// result boolean
					$command_result = $component->crop($crop_options);
					if (!empty($command_result)){
						$result				= false;
						$response->errors[]	= $command_result;
					}
				}
			}
		}



		// response
		$response->result	= $result;
		$response->msg		= ($result === true)
			? 'Success. Request done.'
			: 'Error on rotate file.';


		return $response;
	}//end apply_rotation



}//end class tool_image_rotation
