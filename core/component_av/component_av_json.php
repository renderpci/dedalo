<?php declare(strict_types=1);
/**
* COMPONENT_AV — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* component_av instance. Executed via common::get_json() inside the calling
* object scope ($this = component_av).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve the ontology structure context when the caller requests it
*   ($options->get_context), choosing between the full context (tools +
*   buttons) and the lightweight 'simple' variant used by list/portal views.
*   In the full (default) context branch the response is extended with an
*   AV-specific 'features' object that lets the client know which file
*   formats are accepted, which quality levels exist, and what the current
*   instance quality is — avoiding an extra round-trip.
* - Resolve component AV data for the current mode:
*     'list' / 'tm' — get_list_value() returns a compact array of file_info
*                     objects limited to the default quality and the thumb
*                     quality, suitable for read-only table cells and Time
*                     Machine diff views.
*     'edit' (default) — get_data_lang() returns the full stored array of
*                     file objects for the current language (including
*                     files_info entries for every quality level).
* - Augment the data item:
*     posterframe_url — absolute or relative URL to the poster image for the
*       AV file; null when no data exists yet.
*     subtitles       — (edit mode only) URL plus resolved language metadata
*       for the VTT/SRT subtitle file corresponding to DEDALO_DATA_LANG.
*     debug_quality   — (debug mode + edit only) echoes the resolved quality
*       string to help trace transcoding issues.
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Execution context:
*   This file is not a class or function — it is an include-script evaluated
*   inside component_av::get_json() (inherited from common). The
*   variables $this (component_av), $options (request options object), and
*   SHOW_DEBUG / DEDALO_DATA_LANG (global constants) are injected by the
*   caller.
*
* Data shape produced (one item in $data):
*   {
*     section_id:          string,
*     section_tipo:        string,
*     tipo:                string,
*     mode:                string,
*     lang:                string,
*     from_component_tipo: string,
*     entries:             array|null,   // file objects from get_data_lang() / get_list_value()
*     posterframe_url:     string|null,  // always present
*     subtitles?: {                      // edit mode only
*       subtitles_url: string,
*       lang_name:     string,
*       lang:          string            // ISO 639-1 two-letter code
*     },
*     debug_quality?: string             // SHOW_DEBUG + edit mode only
*   }
*
* Context shape (features object in full context):
*   $this->context->features = {
*     allowed_extensions:      array,   // e.g. ['mp4','mov','avi',…]
*     default_target_quality:  string,  // e.g. 'original'
*     ar_quality:              array,   // all configured quality names
*     default_quality:         string,  // e.g. '1.5MB'
*     quality:                 string,  // current instance quality
*     key_dir:                 'av',    // fixed; identifies the media subfolder
*     alternative_extensions:  array,   // secondary formats (e.g. webm)
*     extension:               string   // primary playback extension (e.g. 'mp4')
*   }
*
* @package Dédalo
* @subpackage Core
*/
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var component_av $this */
// JSON data component controller



// component configuration vars
// Snapshot the three request-scoped config values once so they are not
// re-fetched from the object on every use below.
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$quality		= $this->get_quality();



// context
// Accumulates dd_object entries that describe the ontology structure of this
// component. Normally contains exactly one entry; skipped entirely when
// $options->get_context is false (e.g. data-only requests).
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {

			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$this->context = $this->get_structure_context_simple($permissions);
				break;

			default:
				// Full context including tools and buttons for edit/search views.
				$this->context = $this->get_structure_context($permissions);

				// append additional info
				// The 'features' object carries AV-specific client configuration that
				// would otherwise require separate API calls. All values are sourced
				// from config constants and the current instance state.
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
// Accumulates the data item(s) for this component. Normally one entry for
// the component itself. Skipped entirely when permissions = 0 (read-denied).
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
		// Resolve the stored AV file data for the active render mode.
		// list/tm modes return a compact subset (default + thumb qualities only)
		// to minimise payload size for table cells and Time Machine diffs.
		// Edit mode returns the full files_info array across all quality levels.
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
		// Wrap value + metadata in the standard data envelope used by all
		// components. The envelope includes section_id, section_tipo, tipo,
		// mode, lang, from_component_tipo, and the entries array.
			$item = $this->get_data_item($value);

			// posterframe_url
			// Always present in the data item so the client can render a thumbnail
			// preview even in list/tm modes without an extra request.
			// Null is returned instead of a URL when no AV file exists yet.
				$item->posterframe_url = empty($value)
					? null
					: $this->get_posterframe_url();

		// player mode case. Send the media header when the component are working as player
		// The subtitles object is only needed in edit mode where the full AV player
		// is rendered; list and tm modes only show a thumbnail, so sending subtitle
		// metadata there would be wasted payload.
			if($mode==='edit') {

				// subtitles info
				// Build the subtitles descriptor for DEDALO_DATA_LANG so the client
				// can load the correct VTT/SRT track and label it in the player UI.
				// lang_name is the human-readable full name; lang is the two-letter
				// ISO 639-1 code expected by the HTML5 <track> element.
					$item->subtitles = (object)[
						'subtitles_url'	=> $this->get_subtitles_url(),
						'lang_name'		=> lang::get_name_from_code(DEDALO_DATA_LANG),
						'lang'			=> lang::get_alpha2_from_code(DEDALO_DATA_LANG)
					];

				// debug
				// Expose the resolved quality string so developers can verify which
				// transcoding tier the instance is serving without inspecting $this.
					if(SHOW_DEBUG===true) {
						// quality add
						$item->debug_quality = $quality;
					}
			}

		// debug
		// Record elapsed time and increment the global data-call counter when
		// debug metrics are active. SHOW_DEBUG is a compile-time constant.
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
// Assemble the final response object {context: array, data: array} and return
// it to common::get_json(), which serialises it for the API caller.
	return common::build_element_json_output($context, $data);
