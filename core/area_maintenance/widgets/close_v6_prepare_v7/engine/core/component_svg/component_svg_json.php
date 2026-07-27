<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var component_svg $this */
// JSON data component controller

/**
* COMPONENT_SVG JSON CONTROLLER
* Builds the JSON API response for a component_svg instance.
*
* This file is NOT a class. It is included by common::get_json() with the
* calling component_svg instance as $this, so all instance methods are
* available without any argument passing. The caller also sets $options
* (an stdClass with boolean flags) before the include.
*
* Execution flow:
*   1. Read permission level, render mode, and ontology properties for the
*      current component instance.
*   2. If $options->get_context is true, build the structure-context object:
*      - 'simple' context_type: lightweight stub (tipo + relations only),
*        sufficient for read-only list display without SVG-specific metadata.
*      - default context_type: full ontology context plus an SVG-specific
*        'features' sub-object (see fields below).
*   3. If $options->get_data is true AND the caller has non-zero permissions,
*      build the data item:
*      - 'list' / 'tm' modes: reduced file-list info via get_list_value()
*        (only default-quality and thumb entries, suitable for grid views
*        and thesaurus mode where full file metadata is unnecessary).
*      - 'edit' / default modes: full per-language file info via get_data_lang(),
*        which returns all quality variants and metadata needed by the editor.
*   4. Return the assembled {context, data} object via build_element_json_output().
*
* SVG-specific 'features' fields (default context only):
*   - allowed_extensions      : array   Upload whitelist from DEDALO_SVG_EXTENSIONS_SUPPORTED.
*   - default_target_quality  : string  'original' quality identifier (DEDALO_SVG_QUALITY_ORIGINAL).
*   - ar_quality              : array   Full quality ladder from DEDALO_SVG_AR_QUALITY.
*   - default_quality         : string  Working-quality identifier (DEDALO_SVG_QUALITY_DEFAULT).
*   - quality                 : string  Quality currently active on this component instance.
*   - key_dir                 : string  Fixed value 'svg' — the media-store subdirectory key
*                                       used by the client to route file requests.
*                                       Unlike component_image, this is NOT sharded per tipo/section_tipo.
*   - alternative_extensions  : array|null  Extra output formats, or null when not configured.
*   - extension               : string  Primary file extension for stored SVG files
*                                       (normally 'svg', from DEDALO_SVG_EXTENSION).
*
* Called by:
*   common::get_json()  →  includes this file  →  returns result
*
* @see class.component_svg.php
* @see class.common.php  common::get_json(), common::build_element_json_output()
*/



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$properties		= $this->get_properties();



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
				// SVG-specific features exposed to the client for upload validation,
				// quality-picker UI, and media-store routing. These fields are NOT
				// present in the 'simple' context branch above.
				$current_context->features = new stdClass();
					// Upload whitelist: extensions the server will accept from the client
					$current_context->features->allowed_extensions		= $this->get_allowed_extensions();
					// 'original' quality — the highest-fidelity, unresized master
					$current_context->features->default_target_quality	= $this->get_original_quality();
					// Full ordered quality ladder (e.g. ['original', 'standard', 'thumb'])
					$current_context->features->ar_quality				= $this->get_ar_quality(); // defined in config
					// The everyday working quality identifier (e.g. 'standard')
					$current_context->features->default_quality			= $this->get_default_quality();
					// Quality currently active on this component instance
					$current_context->features->quality					= $this->get_quality(); // current instance quality
					// (!) Fixed media-store subdirectory key for all SVG components.
					// Unlike component_image, SVG does not shard by tipo/section_tipo;
					// all SVG files share a single 'svg' directory under the media root.
					$current_context->features->key_dir					= 'svg';
					// Optional alternative output formats; null when not configured
					$current_context->features->alternative_extensions	= $this->get_alternative_extensions();
					// Primary file extension of the stored SVG files (normally 'svg')
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
		// Mode determines how much file metadata is fetched:
		// list/tm modes use a reduced subset to keep response payloads small
		// for grid views and thesaurus displays; edit/default fetches the
		// full per-language file info needed by the SVG editor.
			switch ($mode) {

				case 'list':
				case 'tm':
					// Reduced file-list info: default-quality + thumb entries only.
					// Avoids loading full quality-ladder metadata in non-edit contexts.
					$value = $this->get_list_value();
					break;

				case 'edit':
				default:
					// Full per-language file info including all quality variants
					// and file metadata, required for the SVG upload/editor panel.
					$value = $this->get_data_lang();
					break;
			}

		// data item
		// Wraps the resolved value in the standard Dédalo data-item envelope
		// ({tipo, section_id, section_tipo, value, …}) consumed by the client.
			$item = $this->get_data_item($value);

		// debug
		// Accumulate timing and call-count metrics when debug mode is active.
		// These are aggregated across the full request and logged at response time.
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
// Serialises {context, data} arrays into the standard Dédalo JSON API envelope
// and returns it to common::get_json() for transmission to the client.
	return common::build_element_json_output($context, $data);
