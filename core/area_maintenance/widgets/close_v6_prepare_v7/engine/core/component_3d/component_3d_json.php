<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var component_3d $this */
// JSON data component controller (this controls the context and the data, coming from the PHP class, that are sent to client -> JS object)

// COMPONENT_3D JSON CONTROLLER
// Builds the API response object for a component_3d instance.
//
// Execution context
//   This file is NOT a class; it is included by common::get_json() using PHP's
//   include() inside the calling object scope. As a result:
//     - $this   = the component_3d instance that initiated the request.
//     - $options = stdClass injected by common::get_json() before the include.
//
// $options shape (set by common::get_json, never by the caller directly):
//   bool   $options->get_context   – whether to include the context block.
//   string $options->context_type  – 'simple' for reduced context, or 'default'
//                                    for the full structure context with features.
//   bool   $options->get_data      – whether to include the data block (also
//                                    gated on $permissions > 0).
//
// Return value
//   Returns the object produced by common::build_element_json_output(), which
//   has the shape: { context: array, data: array }.
//   This value is captured by common::get_json() and forwarded to the API layer.
//
// Related files
//   core/component_3d/class.component_3d.php         – host class
//   core/component_media_common/class.component_media_common.php – base class
//   core/common/class.common.php :: get_json()        – caller / include host



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();



// context
	$context = [];

	if($options->get_context===true) {
		switch ($options->context_type) {

			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$this->context = $this->get_structure_context_simple($permissions);
				break;

			default:
				$this->context = $this->get_structure_context($permissions);

				// append additional info
				// features block: 3D-specific capabilities and quality descriptors consumed by the
				// client JS widget to configure upload UI, player, and quality switching.
				$this->context->features = new stdClass();
					$this->context->features->allowed_extensions		= $this->get_allowed_extensions();
					$this->context->features->default_target_quality	= $this->get_original_quality();
					$this->context->features->ar_quality				= $this->get_ar_quality(); // defined in config
					$this->context->features->default_quality			= $this->get_default_quality();
					$this->context->features->quality					= $this->get_quality(); // current instance quality
					$this->context->features->key_dir					= '3d';
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
		// Select the data shape based on the render mode:
		//   'list' / 'tm' – reduced representation used in record lists and
		//                   time-machine previews (get_list_value returns a
		//                   subset of file metadata).
		//   'edit' / *    – full file data for the editor (get_data_lang returns
		//                   the complete per-language file descriptor array).
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
		// Attach the posterframe URL to the item so the client can render a
		// thumbnail/preview before the 3D viewer loads.
		// Returns null when no value (i.e. no file has been uploaded yet).
			$item->posterframe_url = empty($value)
				? null
				: $this->get_posterframe_url();

		// player mode case. Send the media header when the component are working as player
			if($mode==='edit') {

				// media info
				// (!) get_media_streams() is not defined on component_3d or its parent
				// component_media_common. The method exists only on component_av (which
				// takes a required $quality argument). Calling it here will produce a
				// fatal PHP error at runtime. This block appears to be copied from
				// component_av_json.php and has not yet been adapted for 3D media.
				// Do not remove — flag for fix upstream (see class.component_3d.php).
					$item->media_info = $this->get_media_streams();
			}

		// debug
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}

		$data[] = $item;  // append to the end of the array
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
