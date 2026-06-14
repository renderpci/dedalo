<?php declare(strict_types=1);
/**
* COMPONENT_GEOLOCATION — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* component_geolocation instance. Executed via common::get_json() inside the
* calling object scope ($this = component_geolocation).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve the ontology structure context when the caller requests it
*   ($options->get_context), choosing between the full context (tools +
*   buttons + features) and the lightweight 'simple' variant.
*   When the full context is built, a 'features' sub-object is appended
*   carrying the geo_provider identifier so the client map widget can select
*   the correct tile/provider backend (see below).
* - Resolve component geographic data for the current mode:
*     'list' / 'tm' — get_list_value() returns a flat representation suitable
*                     for read-only table cells and Time Machine diff views.
*     'edit' (default) — get_data_lang() returns the stored value array
*                     (each item: {lat, lon, zoom, alt, lib_data?}) under
*                     DEDALO_DATA_NOLAN; component_geolocation is always
*                     non-translatable.
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Execution context:
*   This file is NOT a class or function — it is an include-script evaluated
*   inside the get_json() method (inherited from component_common). The
*   variables $this (component_geolocation) and $options (request options
*   stdClass) are injected by the caller.
*
* Geo-provider feature (default context only):
*   $this->context->features->geo_provider is a string constant that controls
*   which Leaflet tile provider the client map widget initialises. Possible
*   values (configured per installation in config.php):
*     ''       — OpenStreetMap only (simple OSM layer)
*     'VARIOUS'— OSM base layer with additional layer-switcher support
*   The value is read first from $properties->geo_provider (instance override)
*   and falls back to the DEDALO_GEO_PROVIDER global constant.
*
* Data item shape (one entry in $data):
*   {
*     section_id, section_tipo, tipo, mode, lang,
*     from_component_tipo,
*     entries: [
*       {
*         lat: float,   // latitude  in decimal degrees (WGS-84)
*         lon: float,   // longitude in decimal degrees (WGS-84)
*         zoom: int,    // initial map zoom level
*         alt: int,     // altitude in metres (0 when unknown)
*         lib_data?: [  // optional drawn shapes (Leaflet/GeoMan layers)
*           { layer_id: int, layer_data: GeoJSON FeatureCollection }
*         ]
*       }, …
*     ]
*   }
*
* @see class.component_geolocation.php
* @see class.common.php  common::get_json(), common::build_element_json_output()
* @package Dédalo
* @subpackage Core
*/
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var component_geolocation $this */
// JSON data component controller



// component configuration vars
// Snapshot the three request-scoped config values once so they are not
// re-fetched from the object on every use below.
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	// Null-coalesced to an empty stdClass so that optional property reads
	// (e.g. $properties->geo_provider) are safe without extra isset() guards.
	$properties		= $this->get_properties() ?? new stdClass();



// context
// Accumulates dd_object entries that describe the ontology structure of this
// component. Normally contains exactly one entry; skipped entirely when
// $options->get_context is false (e.g. data-only requests).
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {
			case 'simple':
				// Lightweight context variant: skips tools, buttons, and the
				// geo-provider features object. Used by list/portal wrappers that
				// only need the ontology structure (tipo, relations, properties)
				// without the full edit-view payload.
				// Component structure context_simple (tipo, relations, properties, etc.)
				$this->context = $this->get_structure_context_simple($permissions);
				break;

			default:
				// Full context: includes tools and buttons for edit/search views.
				$this->context = $this->get_structure_context($permissions);

				// features. geo_provider add
				// Append the geo_provider string so the client map widget knows which
				// Leaflet tile backend to initialise (OSM-only vs. layer-switcher, etc.).
				// Instance-level override in properties takes precedence over the global
				// DEDALO_GEO_PROVIDER constant defined in config.php.
				// The 'simple' branch above deliberately omits this object because
				// list/portal views never render an interactive map.
					$this->context->features = (object)[
						'geo_provider' => $properties->geo_provider ?? DEDALO_GEO_PROVIDER
					];
				break;
		}

		$context[] = $this->context;
	}//end if($options->get_context===true)



// data
// Accumulates the data item(s) for this component. Normally one entry.
// Skipped entirely when permissions = 0 (read-denied) or get_data is false.
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
		// Resolve the stored geographic value for the active render mode.
		// component_geolocation is always non-translatable: both branches read
		// from DEDALO_DATA_NOLAN. The switch is retained for structural parity
		// with other JSON controllers and to allow future mode-specific handling.
			switch ($mode) {

				case 'list':
				case 'tm':
					// Read-only modes: get_list_value() returns a compact representation
					// suitable for table cells and Time Machine diff views.
					$value = $this->get_list_value();
					break;

				case 'edit':
				default:
					// Edit mode: get_data_lang() returns the full array of stored
					// geographic items under DEDALO_DATA_NOLAN, or null when no data
					// has been saved yet. Each item: {lat, lon, zoom, alt, lib_data?}.
					$value = $this->get_data_lang();
					break;
			}

		// data item
		// Wrap value + metadata in the standard data envelope. The envelope
		// includes section_id, section_tipo, tipo, mode, lang, from_component_tipo,
		// and the entries array with the resolved geographic value items.
			$item = $this->get_data_item($value);

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
