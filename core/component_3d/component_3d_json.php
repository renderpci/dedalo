<?php
// JSON data component controller (this controls the context and the data, coming from the PHP class, that are sent to client -> JS object)



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();



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
					$current_context->features->resource_type			= '3d_'.$this->tipo.'_'.$this->section_tipo;

				$context[] = $current_context;

				break;
		}
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		// value
			switch ($mode) {
				case 'list':
					$value = $this->get_list_value();
					break;

				case 'edit':
				default:
					$value = $this->get_dato();
					break;
			}

		// item
			$item = $this->get_data_item($value);
			// add useful properties
			// posterframe_url
				$item->posterframe_url = $this->get_posterframe_url(
					false, // test_file
					false, // absolute
					false // avoid_cache
				);
			// model_url. Default quality video URL (usually from 404)
				$item->model_url = $this->file_exist()
					? $this->get_url(false)
					: null;
			// datalist. Files info datalist. Used for tools to know available quality versions and characteristics (size, URL, etc.)
				// $item->datalist = $this->get_files_info();
				$item->datalist = $this->get_datalist();

		// player mode case. Send the media header when the component are working as player
			if($mode==='edit') {

				// media info
					$item->media_info = $this->get_media_streams();
			}

		$data[] = $item;  // append to the end of the array
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
