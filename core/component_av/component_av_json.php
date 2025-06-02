<?php
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$quality		= $this->get_quality();



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
					$current_context->features->key_dir					= 'av';
					$current_context->features->alternative_extensions	= $this->get_alternative_extensions();
					$current_context->features->extension				= $this->get_extension();

				$context[] = $current_context;
				break;
		}
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
			switch ($mode) {

				case 'list':
				case 'tm':
					$value = $this->get_list_value();
					break;

				case 'edit':
				default:
					$value = $this->get_dato();
					break;
			}

		// item
			$item = $this->get_data_item($value);

			// posterframe_url
				$item->posterframe_url = empty($value)
					? null
					: $this->get_posterframe_url();

		// player mode case. Send the media header when the component are working as player
			if($mode==='edit') {

				// subtitles info
					$item->subtitles = (object)[
						'subtitles_url'	=> $this->get_subtitles_url(),
						'lang_name'		=> lang::get_name_from_code(DEDALO_DATA_LANG),
						'lang'			=> lang::get_alpha2_from_code(DEDALO_DATA_LANG)
					];

				// debug
					if(SHOW_DEBUG===true) {
						// quality add
						$item->debug_quality = $quality;
					}
			}

		// debug
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
