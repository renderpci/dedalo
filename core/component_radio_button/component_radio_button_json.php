<?php declare(strict_types=1);
/**
* COMPONENT_RADIO_BUTTON — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* component_radio_button instance. Executed via common::get_json() inside the
* calling object scope ($this = component_radio_button).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve the ontology structure context when the caller requests it
*   ($options->get_context), choosing between the full context (tools +
*   buttons + request_config) and the lightweight 'simple' variant. In the
*   default branch the resolved target-section metadata (tipo + human-readable
*   label) is attached to the context object so the client knows which sections
*   the radio-button options point to.
* - Resolve component data for the current mode:
*     'list' — get_list_value() returns label strings of the selected option
*              resolved through the ontology list-of-values rather than the
*              raw locator; used by read-only list views.
*     'tm'   — time-machine mode has two sub-paths:
*              · when $this->caller_dataframe is set (this instance was
*                instantiated as the source component inside a dataframe row),
*                get_data_lang() + get_list_of_values() are both returned so
*                the dataframe client can reconstruct the full per-row scenario
*                (raw locator + available options).
*              · otherwise get_list_value() is used, identical to 'list'.
*     'edit' (default) — get_data_lang() returns the single stored locator
*              for the current language, paired with get_list_of_values() so
*              the client can render all radio options with the correct one
*              pre-selected.
* - When a datalist is available (edit mode or tm-inside-dataframe) it is
*   embedded directly on the data item under the 'datalist' key.
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Data shape produced (one item in $data):
*   {
*     section_id, section_tipo, tipo, mode, lang,
*     from_component_tipo,
*     entries: [locator],        // single-item array or null (radio = single-select)
*     datalist?: [               // only in edit mode or tm-inside-dataframe
*       { value: locator, label: string },
*       …
*     ]
*   }
*
* Unlike component_check_box (multi-select), component_radio_button enforces
* single-value selection; the 'entries' array therefore contains at most one
* locator.
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
/** @var component_radio_button $this */
// JSON data component controller



// component configuration vars
// Snapshot of the three most-used per-request config values so they are not
// re-fetched from the object on every use below.
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$lang			= $this->get_lang();



// context
// Accumulates dd_object entries that describe the ontology structure of this
// component and its related target sections. The array will contain exactly
// one entry when context is requested.
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				// Lightweight context variant: skips tools and buttons, used by
				// list/tm views and portal wrappers that only need the ontology
				// structure without the full tool/button tree.
				// add_request_config=true because radio-button has target sections
				// and the client may need the request_config to resolve them.
				$this->context = $this->get_structure_context_simple($permissions,true);
				break;

			default:
				// Full context: includes tools, buttons, and request_config
				// (add_request_config=true) for edit/search views.

				// item_context
					$this->context = $this->get_structure_context(
						$permissions,
						true // add_request_config
					);

				// target_sections add
				// Build a minimal descriptor for each section tipo that this
				// radio-button component can link to. The label is resolved
				// from the ontology using DEDALO_DATA_LANG (interface language)
				// so the client can display human-readable section names without
				// an extra ontology look-up.
				// Result shape: [['tipo' => 'ts1', 'label' => 'Thesaurus'], …]
					$target_sections = array_map(function($tipo) {
						return [
							'tipo'	=> $tipo,
							'label'	=> ontology_node::get_term_by_tipo($tipo, DEDALO_DATA_LANG, true, true)
						];
					}, $this->get_ar_target_section_tipo());
					$this->context->set_target_sections($target_sections);
				break;
		}

		$context[] = $this->context;
	}//end if($options->get_context===true)



// data
// Accumulates the data item for this component. Normally one entry;
// permissions=0 skips the block entirely, returning an empty data array.
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
		// Resolve the stored value for the active render mode.
		// $datalist is intentionally left unset here so the isset() guard below
		// is only true when a branch explicitly populates it.
			switch($mode) {
				case 'list':
					// Read-only list mode: resolve label strings for the selected option.
					// get_list_value() walks the component's list_of_values, finds the
					// entry whose locator matches the stored value, and returns only
					// that entry's label. Raw locators are never exposed in this mode.
					$value = $this->get_list_value();
					break;
				case 'tm':
					if ( isset($this->caller_dataframe) ) {
						// inside dataframe case
						// dataframe needs the data and the datalist of the component when it's in tm mode to re-build his scenario
						// When this radio-button is the source component of a dataframe
						// row in time-machine mode, the dataframe client needs both the
						// raw locator value and the full option list so it can
						// reconstruct the per-row scenario at each historical revision.
						$value		= $this->get_data_lang();
						$datalist	= $this->get_list_of_values(DEDALO_DATA_LANG)->result ?? [];
					}else{
						// regular time machine data case
						// Standard tm view (not inside a dataframe): only the resolved
						// label is needed — same behaviour as 'list' mode.
						$value = $this->get_list_value();
					}
					break;
				case 'edit':
				default:
					// Edit mode: return the raw stored locator so the client can
					// pre-select the correct radio button, plus the full datalist so
					// every available option can be rendered.
					// get_data_lang() returns the locator stored under $lang, or null
					// when no selection has been saved yet.
					$value		= $this->get_data_lang();
					$datalist	= $this->get_list_of_values(DEDALO_DATA_LANG)->result ?? [];
					break;
			}

		// data item
		// Wrap value + metadata in the standard data envelope used by all
		// components. The envelope includes section_id, section_tipo, tipo,
		// mode, lang, from_component_tipo, and the entries array.
			$item = $this->get_data_item($value);

			// datalist add if exits
			// Only embed the datalist when it was populated (edit mode or
			// tm-inside-dataframe). In list/plain-tm modes $datalist is never
			// declared, so isset() is false and the key is absent from the
			// response — reducing payload size for read-only consumers.
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
