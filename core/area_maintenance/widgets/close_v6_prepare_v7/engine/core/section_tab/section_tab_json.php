<?php declare(strict_types=1);
/**
* SECTION_TAB — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* section_tab instance. Executed by common::get_json() inside the calling
* object scope ($this = section_tab).
*
* section_tab is a structural/presentational element that carries no storable
* data of its own. This controller therefore always produces an empty $data
* array while optionally building a $context entry when requested.
*
* The ontology distinguishes two legacy models that share the section_tab PHP
* class and this controller:
*
*   'tab'          — A single tab panel (a child of a section_tab container).
*                    In context: view is set to 'tab'; no children list is
*                    populated. The client's render_section_tab subscribes to a
*                    'tab_active_<tipo>' event to show/hide itself.
*
*   'section_tab'  — The tabbed container itself (holds multiple 'tab' children).
*                    In context: view is set to 'section_tab'; a children list
*                    is populated from the ontology, restricted to the tabs that
*                    are valid within the owning section.
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve ontology permissions for the owning section.
* - Build the structure context object when $options->get_context is true and
*   the caller has at least read access (permissions > 0).
* - Determine the element's legacy ontology model and branch accordingly:
*     'tab'         → set view = 'tab' only.
*     anything else → set view = 'section_tab', then build the children list.
* - For the 'section_tab' branch, populate context->children with the direct
*   ontology children of this tipo that are also valid tabs in the owning
*   section (resolved by section::get_ar_children_tipo_by_model_name_in_section).
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Execution context:
*   Called via common::get_json($request_options). The $options stdClass and
*   $this (section_tab) are injected into scope by get_json() before the
*   include. $options has the fields:
*     - get_context    bool  (default true)  — whether to build context
*     - context_type   string (default 'default') — not branched here
*     - get_data       bool  (default true)  — ignored; section_tab has no data
*     - get_request_config bool (default false) — not used here
*
* Context object shape (one item pushed to $context when conditions are met):
*   dd_object {
*     tipo, section_tipo, mode, lang, model, label,
*     permissions, properties, tools, buttons, …
*     view: string           // 'tab' | 'section_tab'
*     children?: array       // only present when view === 'section_tab'
*       [ { tipo: string, label: string }, … ]
*   }
*
* Data shape: always [] (section_tab carries no storable data).
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
/** @var section_tab $this */
// JSON data section_tab controller


// configuration vars
// Snapshot of identity values used throughout this controller.
// $permissions drives whether the context block runs at all (must be > 0).
	$tipo				= $this->get_tipo();
	$section_tipo		= $this->get_section_tipo();
	$permissions		= common::get_permissions($section_tipo, $tipo);


// context
// Accumulates the single dd_object context entry for this element.
// section_tab produces at most one context item; $data remains empty.
	$context = [];

		if($options->get_context===true && $permissions>0) {

			// Element structure context (tipo, relations, properties, etc.)
				$current_context = $this->get_structure_context($permissions);

			// tab / section_tab specific
			// Note that 'tab' ontology items are mapped as 'section_tab' to reduce pollution
			// Now, set context specific params to each one
			// get_legacy_model_by_tipo() reads the raw ontology model_tipo term, bypassing the
			// v7 alias map, so the result is 'tab' or 'section_tab' as stored in the ontology.
			$legacy_model	= ontology_node::get_legacy_model_by_tipo($tipo);
			if ($legacy_model==='tab') {

				// view (tab)
				// This elemento is a leaf tab panel. The client subscribes to the
				// 'tab_active_<tipo>' event published by the container to toggle visibility.
				// No children list is needed; the tab renders its own child components
				// directly via the DDO tree.
					$current_context->view = 'tab';

			}else{

				// view (section_tab)
				// This element is the tabbed container that owns one or more 'tab' children.
				// The client builds the tab bar from context->children and publishes
				// 'tab_active_<tipo>' events when the user switches tabs.
					$current_context->view = 'section_tab';

				// children
				// Populate the tab bar descriptor list. We first gather all direct ontology
				// children of this tipo (order by order_number asc), then filter to only
				// those that are valid tabs in the owning section. This two-step approach
				// handles virtual sections and exclude_elements overrides cleanly:
				//   1. get_ar_children_of_this() returns raw ontology children (direct only).
				//   2. get_ar_children_tipo_by_model_name_in_section() returns the full set of
				//      model-filtered tipos that are active in $section_tipo, including virtual
				//      resolution and exclude_elements rules.
				// The intersection (in_array check below) keeps only children that pass both
				// filters, which prevents phantom tabs from appearing in restricted sections.
					$current_context->children = [];
					$ontology_node	= ontology_node::get_instance($tipo);
					$children_tipo	= $ontology_node->get_ar_children_of_this();

					// get the valid tabs of the section
					// Args: section_tipo, model name list, from_cache=true,
					//       resolve_virtual=true, recursive=true, search_exact=true
					$valid_tabs = section::get_ar_children_tipo_by_model_name_in_section(
						$section_tipo,
						['section_tab','tab'],
						true,
						true,
						true,
						true
					);

					foreach ($children_tipo as $child_tipo) {
						if(!in_array($child_tipo, $valid_tabs)){
							continue;
						}
						$current_context->children[] = (object)[
							'tipo'	=> $child_tipo,
							'label'	=> ontology_node::get_term_by_tipo($child_tipo, DEDALO_APPLICATION_LANG)
						];
					}
			}

			$context[] = $current_context;
		}//end if($options->get_context===true)

// data
// section_tab is a structural/presentational element with no storable data.
// The $data array is always empty; the API response carries only $context.
	$data = [];

// JSON string
// Assemble the standard {context: array, data: array} response envelope and
// return it to common::get_json(), which serialises it for the API caller.
	return common::build_element_json_output($context, $data);
