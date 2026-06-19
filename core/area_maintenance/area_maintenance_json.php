<?php declare(strict_types=1);
/**
* AREA_MAINTENANCE_JSON
* JSON data controller for the area_maintenance element.
*
* This file is the model-specific JSON controller included by common::get_json()
* via a PHP include() call. It executes in the calling object's scope, which means:
*   - $this    => the area_maintenance instance that called get_json()
*   - $options => a stdClass created by common::get_json() from $request_options,
*                 with boolean flags: get_context, get_data, get_request_config.
*
* Responsibilities:
*   - Build the CONTEXT block when $options->get_context is true:
*       standard structure context (tipo, relations, properties, tools) for the
*       area, with add_rqo=true so that the client receives the request_config
*       necessary for subsequent API calls.
*   - Build the DATA block when $options->get_data is true and the caller has
*       permissions > 0:
*       1. Build an empty $value array (the area has no per-record data of its own).
*       2. Wrap it in a standard data item via common::get_data_item().
*       3. Attach the full widget list via area_maintenance::get_ar_widgets() as
*          $item->datalist, so the client render_area_maintenance.js can build
*          each widget panel dynamically.
*   - Return the standard envelope via common::build_element_json_output($context, $data).
*
* Invocation path:
*   dd_area_maintenance_api → area_maintenance::get_json() (resolves to area_common::get_json()
*   → parent::get_json() (common::get_json())) → include(area_maintenance_json.php)
*
* Data shape returned:
*   {
*     context: [ area_maintenance_context_object ],  // if get_context===true
*     data:    [ {                                   // if get_data===true && permissions>0
*       section_id:          null,                   // area has no section_id
*       section_tipo:        null,                   // area has no section_tipo
*       tipo:                string,                 // area_maintenance tipo (e.g. 'dd_maintenance')
*       pagination:          object,                 // standard pagination placeholder
*       from_component_tipo: string,                 // same as tipo (self-referential)
*       value:               [],                     // always empty for this area
*       datalist:            array<widget_object>    // one entry per available maintenance widget
*     } ]
*   }
*
* Widget object shape (each entry in datalist — produced by widget_factory()):
*   {
*     id:         string,       // widget identifier, e.g. 'make_backup', 'check_config'
*     class:      string|null,  // optional CSS modifier class(es) for the panel element
*     category:   string,       // sidebar group key, e.g. 'data', 'config', 'system', 'migration'
*     type:       'widget',     // always 'widget'
*     tipo:       string,       // ontology tipo of the parent area (or item override)
*     parent:     string,       // tipo of the containing area (used for context routing)
*     label:      string,       // human-readable label, resolved via label::get_label()
*     info:       string|null,  // optional secondary info text
*     body:       string|null,  // optional HTML body pre-injected into the panel
*     run:        array,        // list of JS action descriptors; empty by default
*     trigger:    mixed|null,   // client-side trigger descriptor; null by default
*     value:      mixed|null,   // pre-loaded payload; may contain {files:array} for migration
*                               //   widgets or {src:string} for iframe widgets (e.g. php_info)
*     background: bool          // when true JS loads the widget value lazily at idle time
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
/** @var area_maintenance $this */
// JSON data controller



// configuration vars
	$tipo			= $this->get_tipo();
	$permissions	= common::get_permissions($tipo, $tipo);
	$mode			= $this->get_mode();



// context
	$context = [];

	if($options->get_context===true) {

		// set self from_parent
		// The area reports itself as its own parent so the structure-context
		// resolver can locate its own ddo/sqo configuration without climbing
		// to a containing section that does not exist.
			$this->from_parent = $tipo;

		// Element structure context (tipo, relations, properties, etc.)
		// add_rqo=true embeds the request_config in the context so that the
		// client knows the endpoint and parameters for subsequent data requests.
			$context[] = $this->get_structure_context(
				$permissions,
				true // add_rqo
			);

	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		// value
		// area_maintenance has no record-level data of its own; $value is always
		// an empty array — the real payload is carried by $item->datalist below.
			$value = [];

		// item value
		// Wraps $value in the standard data-item envelope (section_id, section_tipo,
		// tipo, pagination, from_component_tipo, value).
			$item = $this->get_data_item($value);

		// datalist (list of widgets)
		// get_ar_widgets() returns the full ordered list of maintenance widget
		// definitions. Each widget carries the metadata the client needs to load
		// and render the widget panel: id, category, label, and the pre-loaded
		// value descriptor (which may carry an iframe src for sandboxed widgets
		// like php_info).
			$item->datalist	= $this->get_ar_widgets();

		// data add
			 $data[] = $item;

	}//end if $permissions > 0



// JSON string
// Wraps $context and $data into the standard {context, data} envelope consumed
// by the client data_manager and rendered by render_area_maintenance.js.
	return common::build_element_json_output($context, $data);
