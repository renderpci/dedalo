<?php declare(strict_types=1);
/**
* COMPONENT_JSON — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* component_json instance. Executed via common::get_json() inside the calling
* object scope ($this = component_json).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve the ontology structure context when the caller requests it
*   ($options->get_context), choosing between the full context (tools +
*   buttons, including the upload tool) and the lightweight 'simple' variant
*   used by list/portal views.
*   In the default (full) branch, a 'features' sub-object is appended to the
*   context carrying upload-related metadata understood by service_upload and
*   service_dropzone:
*     - allowed_extensions : string[]  always ['json'] for this component
*     - default_target_quality : null  component_json has no quality levels;
*       the field is present for structural parity with media components so
*       the client upload service can read it unconditionally.
* - Resolve component data for the current mode:
*     'list' / 'tm' — get_list_value() returns the stored items filtered for
*                     read-only table cells and Time Machine diff views.
*     'edit' (default) — get_data_lang() returns the full array of stored
*                     value items for the current language (always
*                     DEDALO_DATA_NOLAN; component_json is non-translatable).
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Execution context:
*   This file is NOT a class or function — it is an include-script evaluated
*   inside component_json::get_json() (inherited from component_common via
*   common). The variables $this (component_json), $options (request options
*   object), and SHOW_DEBUG (global constant) are injected by the caller.
*
* Data shape produced (one item in $data):
*   {
*     section_id        : string,
*     section_tipo      : string,
*     tipo              : string,
*     mode              : string,
*     lang              : string,          // always 'lg-nolan'
*     from_component_tipo : string,
*     entries           : array|null       // [{id, value}] or null when empty
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
/** @var component_json $this */
// JSON data component controller



// component configuration vars
// Snapshot these once; they do not change during this include's execution.
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();



// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				// 'simple' omits tools and buttons; used when the caller only needs the
				// ontology structure (e.g., list/tm views, portal wrappers).
					$this->context = $this->get_structure_context_simple($permissions);
				break;

			default:
				// Full context: includes tools (upload, time machine, propagate) and
				// buttons, used in 'edit' and 'search' views.
				$this->context = $this->get_structure_context($permissions);

				// append additional info
				// 'features' carries upload-service metadata. Peer media components
				// (component_av, component_image, component_svg) also set this block so
				// the client upload service (service_upload / service_dropzone) can read
				// it unconditionally regardless of component type.
				$this->context->features = new stdClass();
					// allowed_extensions
					// component_json only accepts '.json' files via the upload tool.
					$this->context->features->allowed_extensions		= $this->get_allowed_extensions();
					// default_target_quality
					// Always null: component_json stores the file content as JSON data,
					// not as a media asset with quality levels. The field is kept for
					// structural parity with media-component context shapes so client
					// code that reads features->default_target_quality never throws.
					$this->context->features->default_target_quality	= null;
				break;
		}

		$context[] = $this->context;
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
		// Mode determines which slice of the stored data to return:
		//   'list' / 'tm' — lightweight representation for read-only table cells
		//                   and Time Machine diff displays.
		//   'edit' (default) — full array of stored value items for the current
		//                   language (DEDALO_DATA_NOLAN, since component_json is
		//                   language-neutral).
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

		// data item
		// Wraps $value in a standard data-item envelope (section_id, section_tipo,
		// tipo, mode, lang, from_component_tipo, entries) consumed by the client.
			$item = $this->get_data_item($value);

		// debug
		// Accumulate per-call timing and call-count metrics under SHOW_DEBUG so
		// the profiler can report aggregate data-resolution cost across the request.
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
// Packs $context and $data into the standard {context:[], data:[]} envelope
// consumed by the client API layer.
	return common::build_element_json_output($context, $data);
