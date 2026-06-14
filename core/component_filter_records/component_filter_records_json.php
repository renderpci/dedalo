<?php declare(strict_types=1);
/**
* COMPONENT_FILTER_RECORDS — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* component_filter_records instance. Executed via common::get_json() inside the
* calling object scope ($this = component_filter_records).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3). The .htaccess <FilesMatch>
*   rule is layer 1; the isset($this) guard below is a server-agnostic layer 2.
* - Resolve the ontology structure context when the caller requests it
*   ($options->get_context), choosing between the full context (tools + buttons)
*   and the lightweight 'simple' variant.
* - Resolve component data for the current mode:
*     'list'/'tm' — get_list_value() returns the stored entries as label strings
*                   suitable for read-only display (time-machine and list views).
*     'edit' (default) — get_data_lang() returns the raw entry array under
*                   DEDALO_DATA_NOLAN; paired with get_datalist() (the logged
*                   user's authorized sections, alphabetically sorted) so the
*                   client can render one editable input row per section.
* - component_filter_records is non-translatable: all data lives under
*   DEDALO_DATA_NOLAN regardless of the lang passed by the caller. The
*   component_common constructor enforces this.
* - When a datalist is available (edit mode) it is embedded directly on the
*   data item under the 'datalist' key; it is absent from list/tm responses.
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Data shape produced (one item in $data — edit mode):
*   {
*     section_id, section_tipo, tipo, mode, lang,
*     from_component_tipo,
*     entries: [                    // raw stored entries, or null if none
*       { id: int, tipo: string, value: int[] },
*       …
*     ],
*     datalist: [                   // only in edit mode; absent in list/tm
*       { tipo: string, permissions: int, label: string },
*       …
*     ]
*   }
*
* In 'list'/'tm' mode $data[0]->entries contains the serialised/label form
* of the stored entries (via get_list_value()), or null when empty.
*
* This controller is used exclusively in the Users section (dd128) context where
* each user record carries one instance of this component (tipo dd478 /
* DEDALO_USER_COMPONENT_FILTER_RECORDS_TIPO). Direct use outside that section
* is not expected.
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
/** @var component_filter_records $this */
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();



// context
// Accumulates the dd_object entry describing the ontology structure of this
// component. Contains exactly one entry when context is requested.
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {
			case 'simple':
				// Lightweight context variant: skips tools and buttons.
				// Used by list/tm views and portal wrappers that only need the
				// ontology structure (tipo, relations, properties) without the
				// full tool/button tree.
				// Component structure context_simple (tipo, relations, properties, etc.)
				$this->context = $this->get_structure_context_simple($permissions);
				break;

			default:
				// Full context: includes tools and buttons for edit and search views.
				// component_filter_records does not need a request_config object in
				// its context (no dataframe subdatum, no uniqueness checking), so the
				// default get_structure_context() call is used without add_rqo.
				$this->context = $this->get_structure_context($permissions);
				break;
		}

		$context[] = $this->context;
	}//end if($options->get_context===true)



// data
// Accumulates the data item(s) for this component. Normally one entry.
// The entire block is skipped when permissions === 0, returning an empty data
// array — this enforces that unauthorized callers receive no payload at all.
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
		// Resolve the stored entries for the active render mode.
		// $datalist is intentionally left undeclared here; the isset() guard below
		// is only true when the edit branch explicitly populates it.
			switch ($mode) {

				case 'list':
				case 'tm':
					// Read-only and time-machine modes: return label-form entries.
					// No datalist is needed (no editable grid to render).
					$value		= $this->get_list_value();
					break;

				case 'edit':
				default:
					// Edit mode: return the raw stored entry array so the client can
					// pre-populate each editable id input, plus the datalist of
					// sections authorized for this user so every row can be rendered.
					// get_data_lang() retrieves the entries stored under DEDALO_DATA_NOLAN
					// (component_filter_records always uses the language-neutral slot),
					// or null when no entries have been saved yet.
					$value		= $this->get_data_lang();
					// get_datalist() calls security::get_ar_authorized_areas_for_user(),
					// filters to sections with write+ access (value >= 2), resolves each
					// section label from the ontology, and returns the list sorted
					// alphabetically by label. Each item: { tipo, permissions, label }.
					$datalist	= $this->get_datalist();
					break;
			}

		// data item
		// Wrap the value and component metadata in the standard data envelope used
		// by all components (section_id, section_tipo, tipo, mode, lang, entries …).
			$item = $this->get_data_item($value);

			// datalist
			// Embed the datalist directly on the item only when it was populated
			// (edit mode). In list/tm modes $datalist is not declared, so isset()
			// is false and the key is absent from the response, reducing payload size.
			if (isset($datalist)) {
				$item->datalist = $datalist;
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
