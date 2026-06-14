<?php declare(strict_types=1);
/**
* COMPONENT_PUBLICATION — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* component_publication instance. Executed via common::get_json() inside the
* calling object scope ($this = component_publication).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve the ontology structure context when the caller requests it
*   ($options->get_context), choosing between the full context (tools +
*   buttons) and the lightweight 'simple' variant.
* - Resolve component data for the current mode:
*     'list'/'tm' — get_list_value() walks the ontology list_of_values and
*                   returns the human-readable labels (e.g., "Yes", "No") for
*                   whichever locator is stored. Uses DEDALO_DATA_LANG for the
*                   label language; no datalist is needed for read-only views.
*     'edit' (default) — get_data_lang() returns the raw stored locator array
*                   (always under DEDALO_DATA_NOLAN, since publication status is
*                   language-neutral). get_list_of_values() provides the
*                   datalist (the two available locators: yes / no) so the
*                   client can render the toggle UI with the correct pre-selected
*                   state.
* - When a datalist is available (edit mode) it is embedded directly on the
*   data item under the 'datalist' key.
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Data shape produced (one item in $data):
*   {
*     section_id        : string,   // parent record id
*     section_tipo      : string,   // parent section tipo
*     tipo              : string,   // this component's tipo (e.g., "hierarchy38")
*     mode              : string,   // 'edit' | 'list' | 'tm'
*     lang              : string,   // always DEDALO_DATA_NOLAN (language-neutral)
*     from_component_tipo: string,
*     entries           : locator[]|string[]|null,
*                         // edit: array of stored locators (0 or 1 element)
*                         // list/tm: array of resolved label strings
*     datalist?         : [         // only in edit mode
*       { value: locator, label: string, … },
*       …                           // typically two entries: yes / no
*     ]
*   }
*
* Publication locators point to the dd_component_publication_value section.
* The component stores at most one locator (yes or no); null means undecided.
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
/** @var component_publication $this */
// JSON data component controller

// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();



// context
// Accumulates dd_object entries describing the ontology structure of this
// component. Contains exactly one entry when context is requested; empty
// when the caller sets get_context = false.
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				// Lightweight variant: omits tools and buttons.
				// Used by list/tm views and portal wrappers that only need the
				// ontology structure without the full tool/button tree.
				$this->context = $this->get_structure_context_simple($permissions);
				break;

			default:
				// Full context: includes tools and buttons; used in 'edit' and
				// 'search' views. component_publication does not require a
				// request_config in its context (no uniqueness checking or
				// inline dataframe support).
				$this->context = $this->get_structure_context($permissions);
				break;
		}

		$context[] = $this->context;
	}//end if($options->get_context===true)



// data
// Accumulates the data item(s) for this component. Normally one entry;
// permissions=0 skips the block entirely, returning an empty data array.
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
		// Resolve the stored value for the active render mode.
		// $datalist is intentionally left unset here so the isset() guard below
		// is only true when the edit branch explicitly populates it.
			switch($mode) {

				case 'list':
				case 'tm':
					// Read-only modes: resolve the human-readable label for the stored
					// locator. get_list_value() (inherited from component_relation_common)
					// walks the list_of_values against DEDALO_DATA_LANG and returns the
					// label (e.g., "Yes" / "No") for whichever locator is stored.
					// Raw locators are not exposed to callers in these modes.
					// No datalist is included in the response.
					$value = $this->get_list_value();
					break;

				case 'edit':
				default:
					// Edit mode: return the raw stored locator(s) so the client can
					// highlight the active publication choice, plus the full datalist
					// of available options so both choices (yes/no) can be rendered.
					// get_data_lang() returns locators stored under DEDALO_DATA_NOLAN
					// (publication status is language-neutral per __construct override).
					$value		= $this->get_data_lang();
					// get_list_of_values(DEDALO_DATA_LANG) fetches the two canonical
					// locators (yes/no) with their interface-language labels — the
					// lang argument controls only the label language, not the data lang.
					$datalist	= $this->get_list_of_values(DEDALO_DATA_LANG)->result ?? [];
					break;
			}

		// data item
		// Wrap value + metadata in the standard data envelope shared by all
		// components (section_id, section_tipo, tipo, mode, lang,
		// from_component_tipo, entries).
			$item = $this->get_data_item($value);

			// datalist add if exits
			// Only embed the datalist in the data item when it was populated
			// (edit mode). In list/tm modes $datalist is never declared, so
			// isset() is false and the key is absent, reducing payload size.
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
