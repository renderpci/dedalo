<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var component_av $this */
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
				$this->context = $this->get_structure_context_simple($permissions);
				break;

			default:
				$this->context = $this->get_structure_context($permissions);

				// append additional info
				$this->context->features = new stdClass();
					$this->context->features->allowed_extensions		= $this->get_allowed_extensions();
					$this->context->features->default_target_quality	= $this->get_original_quality();
					$this->context->features->ar_quality				= $this->get_ar_quality(); // defined in config
					$this->context->features->default_quality			= $this->get_default_quality();
					$this->context->features->quality					= $this->get_quality(); // current instance quality
					$this->context->features->key_dir					= 'av';
					$this->context->features->alternative_extensions	= $this->get_alternative_extensions();
					$this->context->features->extension				= $this->get_extension();
				break;
		}

		$context[] = $this->context;
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
					$value = $this->get_data_lang();
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
