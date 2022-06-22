<?php
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_modo();



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
					$current_context->resource_type				= 'av';

				$context[] = $current_context;

				break;
		}
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		// value as array always
			$value = $this->get_dato();
			if (!is_array($value)) {
				$value = [$value];
			}

		// data item
			$item = $this->get_data_item($value);
		// add useful parameters
			// posterframe_url
				$item->posterframe_url	= $this->get_posterframe_url(true, false, false, false); // $test_file=true, $absolute=false, $avoid_cache=false
			// default quality video URL (usually from 404)
				$item->video_url		= $this->file_exist()
					? $this->get_url(false)
					: null;
			//  files info datalist. Used for tools to know available quality versions and characteristics (size, URL, etc.)
				$item->datalist = $this->get_files_info();

		// player mode case. Send the media header when the component are working as player
			if($mode==='player') {

				// media info
				$item->media_info = $this->get_media_streams();

				// subtiltes info
				$item->subtitles = (object)[
					'subtitles_url'	=> $this->get_subtitles_url(),
					'lang_name'		=> lang::get_name_from_code(DEDALO_DATA_LANG),
					'lang'			=> lang::get_alpha2_from_code(DEDALO_DATA_LANG)
				];
			}

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
