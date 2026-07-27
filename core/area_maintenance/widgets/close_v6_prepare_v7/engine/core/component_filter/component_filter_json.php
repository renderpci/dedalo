<?php declare(strict_types=1);
/**
* COMPONENT_FILTER — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* component_filter instance. Executed via common::get_json() inside the calling
* object scope ($this = component_filter).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3). The .htaccess <FilesMatch>
*   rule is layer 1; the isset($this) guard below is a server-agnostic layer 2.
* - Resolve the ontology structure context when the caller requests it
*   ($options->get_context), choosing between the full context (tools + buttons)
*   and the lightweight 'simple' variant. In the default branch the resolved
*   target-section metadata (tipo + human-readable label) is attached to the
*   context object so the client knows which project section this filter points to
*   (typically DEDALO_SECTION_PROJECTS_TIPO, e.g. 'dd153').
* - Resolve component data for the current mode:
*     'list'/'tm' — get_list_value() returns label strings for the projects
*                   assigned to this record, filtered to only those projects
*                   authorized for the logged-in user. Raw locators are never
*                   sent in these modes.
*     'edit' (default) — get_data_lang() returns the stored locator array;
*                   paired with get_datalist() (user-authorized project list,
*                   alphabetically sorted) so the client can render the
*                   checkbox grid.
* - component_filter always stores data under DEDALO_DATA_NOLAN (language-neutral)
*   because project assignments are language-independent. The constructor enforces
*   this regardless of the lang passed by the caller.
* - When a datalist is available (edit mode) it is embedded directly on the data
*   item under the 'datalist' key.
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Data shape produced (one item in $data — edit mode):
*   {
*     section_id, section_tipo, tipo, mode, lang,
*     from_component_tipo,
*     entries: [locator, …],   // raw stored filter locators (or null if none)
*     datalist: [              // only in edit mode; absent in list/tm
*       {
*         type:         'project',
*         label:        string,       // project name in display language
*         section_tipo: string,       // e.g. 'dd153'
*         section_id:   int|string,
*         value:        locator,
*         parent:       mixed,
*         order:        int
*       },
*       …
*     ]
*   }
*
* In 'list'/'tm' mode $data[0]->entries contains an array of label strings
* (not locators) for the subset of assigned projects that the current user can
* see, or null when no projects are assigned.
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
/** @var component_filter $this */
// JSON data component controller



// component configuration vars
// Snapshot the two most-used per-request values so they are not re-fetched
// from the object on every use below.
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();



// context
// Accumulates dd_object entries describing the ontology structure of this
// component and its related target sections. The array contains exactly one
// entry when context is requested.
	$context = [];

	if($options->get_context===true) {
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
				// add_request_config is false because component_filter does not
				// need a request_config object in its context; project assignments
				// use a fixed target section (DEDALO_SECTION_PROJECTS_TIPO) and
				// do not require inline dataframe support.

				// item_context
					$this->context = $this->get_structure_context(
						$permissions,
						false // bool add_request_config
					);
				// target_sections add
				// Build a minimal descriptor for each section tipo that this filter
				// component targets. get_ar_target_section_tipo() returns an array
				// containing DEDALO_SECTION_PROJECTS_TIPO (e.g. ['dd153']) when the
				// constant is defined, or [] as a safe fallback. The label is resolved
				// from the ontology using DEDALO_DATA_LANG (interface language) so the
				// client can display the human-readable section name without an extra
				// ontology look-up.
				// Result shape: [['tipo' => 'dd153', 'label' => 'Projects'], …]
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
// Accumulates the data item(s) for this component. Normally one entry.
// The entire block is skipped when permissions=0, returning an empty data
// array — this enforces that unauthorized callers receive no payload at all.
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
		// Resolve the stored value for the active render mode.
		// $datalist is intentionally left undeclared here; the isset() guard below
		// is only true when the edit branch explicitly populates it.
			switch ($mode) {

				case 'list':
				case 'tm':
					// Read-only and time-machine modes: resolve label strings for
					// assigned projects. get_list_value() intersects the stored
					// locators with the user's authorized project list, returning
					// only the labels of projects the caller is allowed to see.
					// Raw locators are never exposed to callers in these modes.
					// No datalist is needed (no checkbox grid to render).
					$value		= $this->get_list_value();
					break;

				case 'edit':
				default:
					// Edit mode: return raw stored locators so the client can
					// pre-select the correct checkboxes, plus the full datalist of
					// projects available to this user so every option can be rendered.
					// get_data_lang() retrieves all locators stored under DEDALO_DATA_NOLAN
					// (component_filter always uses the language-neutral slot), or null
					// when no project has been assigned yet.
					$value		= $this->get_data_lang();
					// get_datalist() calls component_filter_master::get_user_authorized_projects()
					// and returns the parsed project list sorted alphabetically by label.
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
