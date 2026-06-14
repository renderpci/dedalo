<?php declare(strict_types=1);
/**
* COMPONENT_CHECK_BOX — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* component_check_box instance. Executed via common::get_json() inside the
* calling object scope ($this = component_check_box).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve the ontology structure context when the caller requests it
*   ($options->get_context), choosing between the full context (tools +
*   buttons) and the lightweight 'simple' variant. In the default branch the
*   resolved target-section metadata (tipo + human-readable label) is attached
*   to the context object so the client knows which sections the checkboxes
*   point to.
* - Resolve component data for the current mode:
*     'list'/'tm' — get_list_value() returns the label strings of checked
*                   items (resolved through the ontology list of values) rather
*                   than raw locators; used by read-only list and time-machine
*                   views.
*     'edit' (default) — get_data_lang() returns the stored locator array for
*                   the current language, paired with get_datalist() so the
*                   client can render the full checkbox grid with pre-selected
*                   states.
* - When a datalist is available (edit mode) it is embedded directly on the
*   data item under the 'datalist' key.
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Data shape produced (one item in $data):
*   {
*     section_id, section_tipo, tipo, mode, lang,
*     from_component_tipo,
*     entries: [locator, …],     // raw stored locators (edit) or null (list)
*     datalist?: [               // only in edit mode; absent in list/tm
*       { value: locator, label: string, …tool_metadata? },
*       …
*     ]
*   }
* For the security-tools component (tipo = DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO /
* dd1353) the datalist entries are additionally hydrated with tool_common metadata
* (name, always_active, icon, etc.) by get_datalist() before being sent.
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
/** @var component_check_box $this */
// JSON data component controller



// component configuration vars
// Snapshot of the three most-used per-request config values so they are not
// re-fetched from the object on every use below.
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$lang			= $this->get_lang();



// context
// Accumulates dd_object entries that describe the ontology structure of this
// component and, when relevant, its related target sections. The array will
// contain exactly one entry when context is requested.
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
				// Full context: includes tools and buttons for edit/search views.
				// add_request_config is false because component_check_box does not
				// require a request_config object in its context (no uniqueness
				// checking or inline dataframe support).

				// item_context
					$this->context = $this->get_structure_context(
						$permissions,
						false // bool add_request_config
					);

				// target_sections add
				// Build a minimal descriptor for each section tipo that this
				// checkbox component can link to. The label is resolved from the
				// ontology using DEDALO_DATA_LANG (interface lang) so the client
				// can display human-readable section names in the UI without an
				// extra ontology look-up.
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
					// Read-only modes: resolve label strings for selected items.
					// get_list_value() walks the component's list_of_values and
					// returns only the labels of entries whose locator appears in
					// the stored data — raw locators are never exposed to callers
					// in these modes. No datalist is needed.
					$value		= $this->get_list_value();
					break;

				case 'edit':
				default:
					// Edit mode: return raw stored locators so the client can
					// re-check the correct boxes, plus the full datalist so every
					// available option can be rendered.
					// get_data_lang() returns all locators stored under $lang, or
					// null when no data has been saved yet.
					$value		= $this->get_data_lang();
					// get_datalist() invokes get_list_of_values() and, for the
					// security-tools component (dd1353), hydrates each entry with
					// extra tool metadata (see class.component_check_box.php).
					$datalist	= $this->get_datalist();
					break;
			}

		// data item
		// Wrap value + metadata in the standard data envelope used by all
		// components. The envelope includes section_id, section_tipo, tipo,
		// mode, lang, from_component_tipo, and the entries array.
			$item = $this->get_data_item($value);

		// datalist add if exits
		// Only embed the datalist in the data item when it was populated (edit
		// mode). In list/tm modes $datalist is not declared, so isset() is
		// false and the key is absent from the response — reducing payload size.
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
