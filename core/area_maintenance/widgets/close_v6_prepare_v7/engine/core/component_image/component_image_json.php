<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var component_image $this */
// JSON data component controller

/**
* COMPONENT_IMAGE JSON CONTROLLER
* Builds the JSON API response for a component_image instance.
*
* This file is NOT a class. It is included by common::get_json() with the
* calling component_image instance as $this, so all instance methods are
* available without any argument passing. The caller also sets up $options
* (an stdClass with boolean flags) before the include.
*
* Execution flow:
*   1. Read permission level, render mode, and ontology properties for the
*      current component instance.
*   2. If $options->get_context is true, build the structure-context object:
*      - 'simple' context_type: lightweight stub (tipo + relations only)
*      - default context_type: full ontology context plus an image-specific
*        'features' sub-object (see below)
*   3. If $options->get_data is true AND the caller has non-zero permissions,
*      build the data item:
*      - 'list' / 'tm' modes: reduced file-list info via get_list_value()
*        (only default-quality + thumb quality entries, suitable for grid views)
*      - 'edit' / default modes: full per-language file list via get_data_lang()
*        plus external_source and base_svg_url for the SVG overlay editor
*   4. Return the assembled {context, data} object via build_element_json_output().
*
* image-specific 'features' fields (default context only):
*   - allowed_extensions   : array  Upload whitelist from DEDALO_IMAGE_EXTENSIONS_SUPPORTED
*   - default_target_quality : string  'original' quality identifier
*   - ar_quality           : array  Full quality ladder from DEDALO_IMAGE_AR_QUALITY
*   - default_quality      : string  Working-quality identifier (e.g. '1.5MB')
*   - quality              : string  Quality active on this instance
*   - key_dir              : string  Subdirectory key used to shard the media store
*                                    (pattern: 'image_{tipo}_{section_tipo}')
*   - alternative_extensions : array|null  Extra output formats (e.g. ['webp','avif'])
*                                          or null when not configured
*   - extension            : string  Primary file extension (e.g. 'jpg')
*
* Called by:
*   common::get_json()  →  includes this file  →  returns result
*
* @see class.component_image.php
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
				$this->context = $this->get_structure_context_simple($permissions);
				break;

			default:
				$this->context = $this->get_structure_context($permissions);

				// append additional info
				// image-specific features exposed to the client for upload validation,
				// quality-picker UI, and SVG overlay rendering. None of these fields
				// are available in the 'simple' context branch above.
				$this->context->features = new stdClass();
					// Upload whitelist: extensions the server will accept from the client
					$this->context->features->allowed_extensions		= $this->get_allowed_extensions();
					// 'original' quality — the highest-fidelity, unresized master
					$this->context->features->default_target_quality	= $this->get_original_quality();
					// Full ordered quality ladder (e.g. ['original','modified','100MB',…,'thumb'])
					$this->context->features->ar_quality				= $this->get_ar_quality(); // defined in config
					// The everyday working quality (e.g. '1.5MB') shown in the edit view
					$this->context->features->default_quality			= $this->get_default_quality();
					// Quality currently active on this component instance
					$this->context->features->quality					= $this->get_quality(); // current instance quality
					// Media-store shard key: subdirectory that isolates files per component+section type
					$this->context->features->key_dir					= 'image_'.$this->tipo.'_'.$this->section_tipo;
					// Optional alternative output formats (e.g. ['webp','avif']); null when unconfigured
					$this->context->features->alternative_extensions	= $this->get_alternative_extensions();
					// Primary file extension of the stored images (normally 'jpg')
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
					// value. list_value is a reduced files list info
					// Returns only default-quality and thumb entries from files_info,
					// keeping the payload small for grid/list views and thesaurus mode.
					$value = $this->get_list_value();

					// data item
					$item = $this->get_data_item($value);

					// external source (link to image outside Dédalo media)
					// Populated when properties->external_source references a component_iri;
					// the IRI value is used as the image URL instead of the local media path.
					$item->external_source = $this->get_external_source();
					break;

				case 'edit':
				default:
					// value. full files list info
					// Returns the complete files_info array for the current language,
					// including all quality variants and metadata, for the edit panel.
					$value = $this->get_data_lang();

					// data item
					$item = $this->get_data_item($value);

					// external source (link to image outside Dédalo media)
					$item->external_source = $this->get_external_source();

					// base_svg_url
					// URL of the companion SVG file used by the editor overlay (annotation layer).
					// Passing true tests for file existence; returns null when no SVG exists yet.
					$item->base_svg_url = $this->get_base_svg_url(true);
					break;
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
