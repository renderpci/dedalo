<?php

/**
* CROP_50
* @return
*/
function crop_50($request_options, $custom_arguments) {

	$options = new stdClass();
		$options->section_tipo 		= null;
		$options->section_id 		= null;
		$options->target_component	= null;
		$options->file_name			= null;
		$options->file_path 		= null;
		$options->tool_config 		= null;
		foreach ($request_options as $key => $value) {
			if (property_exists($options, $key)) {
				$options->$key = $value;
				$$key = $value; // Create simple variables for easy select
			}
		}

	// target component info
		$target_ddo = array_find($ar_ddo_map, function($item){
			return $item->role === 'target_component';
		});
		$target_component_tipo	= $target_ddo->tipo;
		$target_component_model	= RecordObj_dd::get_modelo_name_by_tipo($target_component_tipo, true);


	$file_data 		= (object)tool_import_files::get_file_data($options->file_path, $options->file_name);
	$source_image 	= $file_data->file_path;
	$crop_image		= $file_data->dir_path . $file_data->file_name . '_crop.' . $file_data->extension;

	$process_script = 'test=`convert '.$source_image.' -format "%[fx:(w/h>1)?1:0]" info:`
						if [ $test -eq 1 ]; then
						convert '.$source_image.' -crop 50%x100% '.$crop_image.'
						else
						convert '.$source_image.' -crop 100%x50% '.$crop_image.'
						fi';
	# Exec imagemagick command
	$command_exec 	= shell_exec($process_script);

	$crop_number = 0;
	foreach ($custom_arguments as $destination => $component_tipo) {

		$model_name 		= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		$component_portal 	= component_common::get_instance($model_name,
															 $component_tipo,
															 $section_id,
															 'edit',
															 DEDALO_DATA_NOLAN,
															 $section_tipo);

		# Portal target_section_tipo
		$target_section_tipo = $component_portal->get_ar_target_section_tipo()[0];
		$properties 		 = $component_portal->get_properties();
		$tool_properties 	 = $properties->ar_tools_name->tool_import_files;

		$portal_response = (object)$component_portal->add_new_element((object)[
			'target_section_tipo' => $target_section_tipo
		]);
		if ($portal_response->result===false) {
			$response->result 	= false;
			$response->msg 		= "Error on create portal children: ".$portal_response->msg;
			return $response;
		}
		// save portal if all is all ok
		$component_portal->Save();

		$current_section_id = $portal_response->section_id;

		# File target name
		$crop_file_name	= $file_data->file_name . "_crop-" . $crop_number . '.' . $file_data->extension;

		# File target data
		$file_crop_data = (array)tool_import_files::get_file_data($file_data->dir_path, $crop_file_name);

		# Save file and verions
		tool_import_files::set_media_file($file_crop_data, $target_section_tipo, $current_section_id, $target_component_tipo);

		$crop_number++;
	}


	return true;
}//end crop_50


?>