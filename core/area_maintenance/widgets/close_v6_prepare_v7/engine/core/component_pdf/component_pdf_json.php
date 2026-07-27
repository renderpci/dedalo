<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var component_pdf $this */
// JSON data component controller

/**
* COMPONENT_PDF JSON CONTROLLER
* Builds the JSON API response for a component_pdf instance.
*
* This file is NOT a class. It is included by common::get_json() with the
* calling component_pdf instance as $this, so all instance methods are
* available without any argument passing. The caller (common::get_json())
* constructs the $options object from the incoming request_options before
* the include, and this controller returns the assembled value via
* build_element_json_output().
*
* Execution flow:
*   1. Read permission level, render mode, and ontology properties for the
*      current component instance.
*   2. If $options->get_context is true, build the structure-context object:
*      - 'simple' context_type: lightweight stub (tipo + relations only),
*        used by list/grid views that do not need the full feature set.
*      - default context_type: full ontology context plus a PDF-specific
*        'features' sub-object (see below).
*   3. If $options->get_data is true AND the caller has non-zero permissions,
*      build the data item:
*      - 'list' / 'tm' modes: reduced file-list via get_list_value()
*        (only default-quality + thumb quality entries, kept small for grids).
*      - 'edit' / default modes: full per-language file info via get_data_lang().
*   4. Return the assembled {context, data} object via build_element_json_output().
*
* PDF-specific 'features' fields (default context only):
*   - allowed_extensions     : array   Upload whitelist from DEDALO_PDF_EXTENSIONS_SUPPORTED
*   - default_target_quality : string  'original' quality identifier (highest-fidelity master)
*   - ar_quality             : array   Full quality ladder from DEDALO_PDF_AR_QUALITY config constant
*   - default_quality        : string  Everyday working quality (from DEDALO_PDF_QUALITY_DEFAULT)
*   - quality                : string  Quality currently active on this component instance
*   - key_dir                : string  Fixed value 'pdf' — the media-store subdirectory key;
*                                      unlike component_image, PDF uses a flat key rather than
*                                      a per-tipo shard
*   - alternative_extensions : array|null  Extra output formats (e.g. ['jpg']) or null when
*                                          DEDALO_PDF_ALTERNATIVE_EXTENSIONS is not configured
*   - extension              : string  Primary file extension (normally 'pdf')
*
* Called by:
*   common::get_json()  →  includes this file  →  returns result
*
* @see class.component_pdf.php
* @see core/common/class.common.php  common::get_json(), common::build_element_json_output()
* @see core/component_media_common/class.component_media_common.php  get_list_value(), get_data_lang()
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
				$this->context = $this->get_structure_context_simple($permissions);
				break;

			default:
				$this->context = $this->get_structure_context($permissions);

				// append additional info
				// PDF-specific features exposed to the client for upload validation,
				// quality-picker UI, and text-extraction configuration.
				// These fields are absent from the 'simple' context branch above.
				$this->context->features = new stdClass();
					// Upload whitelist: extensions the server will accept from the client
					$this->context->features->allowed_extensions		= $this->get_allowed_extensions();
					// 'original' quality — the unmodified uploaded master file
					$this->context->features->default_target_quality	= $this->get_original_quality();
					// Full ordered quality ladder (e.g. ['original','web','thumb'])
					$this->context->features->ar_quality				= $this->get_ar_quality(); // defined in config
					// The everyday working quality displayed in the edit view
					$this->context->features->default_quality			= $this->get_default_quality();
					// Quality currently active on this component instance
					$this->context->features->quality					= $this->get_quality(); // current instance quality
					// Media-store directory key. PDF uses the fixed value 'pdf' (unlike
					// component_image which uses a per-tipo shard like 'image_{tipo}_{section_tipo}').
					$this->context->features->key_dir					= 'pdf';
					// Optional alternative output formats (e.g. ['jpg'] for cover previews);
					// null when DEDALO_PDF_ALTERNATIVE_EXTENSIONS is not defined in config
					$this->context->features->alternative_extensions	= $this->get_alternative_extensions();
					// Primary file extension of stored PDFs (normally 'pdf')
					$this->context->features->extension				= $this->get_extension();
				break;
		}

		$context[] = $this->context;
	}//end if($options->get_context===true))



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
		// Mode determines how much file metadata is returned:
		// 'list'/'tm' → compact (default-quality + thumb only, for grids/thesaurus)
		// 'edit'/default → full per-language files_info array for the edit panel
			switch ($mode) {

				case 'list':
				case 'tm':
					$value = $this->get_list_value();
					break;

				default:
				case 'edit':
					$value = $this->get_data_lang();
					break;
			}

		// data item
		// Wraps $value in a standard data-item envelope (section_id, tipo, lang, value, …)
			$item = $this->get_data_item($value);

		// debug
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
