<?php declare(strict_types=1);
/**
* SECTION_GROUP — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* section_group instance. Executed by common::get_json() inside the calling
* object scope ($this = section_group).
*
* section_group is a pure layout/structural element — it carries no data of its
* own. As a result this controller produces a non-empty $context array (when
* requested) and always an empty $data array. The context object is what drives
* the client's DDO-based rendering: it tells the browser what label and
* structural properties the grouper panel has.
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve ontology permissions for the owning section.
* - Build the structure context object when $options->get_context is true and
*   the caller has at least read access (permissions > 0), choosing between the
*   full variant (get_structure_context) and the lightweight 'simple' variant
*   (get_structure_context_simple).
* - Patch the returned context's add_label flag based on the element's legacy
*   ontology model: 'section_group_div' nodes suppress their panel header label
*   (add_label = false); all other group types display it (add_label = true).
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Execution context:
*   Called via common::get_json($request_options). The $options stdClass and
*   $this (section_group) are injected into scope by get_json() before the
*   include. $options has the fields:
*     - get_context    bool  (default true)  — whether to build context
*     - context_type   string (default 'default') — 'simple' or 'default'
*     - get_data       bool  (default true)  — ignored; section_group has no data
*     - get_request_config bool (default false) — not used here
*
* Context object shape (one item pushed to $context):
*   dd_object {
*     tipo, section_tipo, mode, lang, model, label,
*     permissions, properties, tools, buttons, …
*     add_label: bool   // patched below; false for section_group_div
*   }
*
* Data shape: always [] (groupers carry no storable data).
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
/** @var section_group $this */
// JSON data for section_group controller



// configuration vars
// Snapshot of identity values used throughout this controller.
// $permissions drives whether the context block runs at all.
	$tipo				= $this->get_tipo();
	$section_tipo		= $this->get_section_tipo();
	$permissions		= common::get_permissions($section_tipo,$tipo);


// context
// Accumulates the single dd_object context entry for this grouper.
// section_group produces at most one context item; $data remains empty.
	$context = [];

	if($options->get_context===true && $permissions>0){

		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				// Lightweight variant: omits tool and button resolution.
				// Used by list/portal wrappers that only need structure metadata.
				$current_context = $this->get_structure_context_simple($permissions);
				break;

			default:
				// Element structure context (tipo, relations, properties, etc.)
				// Full variant: includes tools and buttons for edit-mode rendering.
				// section_group::get_tools() always returns [] so the tool walk is
				// a no-op, but the full context path is preserved for consistency
				// with other element types in the JSON pipeline.
				$current_context = $this->get_structure_context($permissions);
				break;
		}

		// add_label patch
		// The client's render_section_group.js reads context.add_label to decide
		// whether to render the collapsible header label for this panel.
		// 'section_group_div' is a legacy ontology model that maps to section_group
		// in v7 but must suppress its header in the UI (it acts as a plain div
		// container rather than a labelled box). All other group types keep their
		// label visible (add_label = true).
		// get_legacy_model_by_tipo() reads the ontology node's raw model_tipo term
		// so the check is against the pre-v7-alias name ('section_group_div'), not
		// against the resolved v7 class name.
		// set add_label value based on former model (false for section_group_div)
		$legacy_model	= ontology_node::get_legacy_model_by_tipo($tipo);
		$no_label	= [
			'section_group_div'
		];
		$current_context->add_label = !in_array($legacy_model, $no_label);

		// add
		$context[] = $current_context;
	}//end if($options->get_context===true)



// data
// section_group is a structural/presentational element with no storable data.
// The $data array is always empty; the API response carries only $context.
	$data = [];


// JSON string
// Assemble the standard {context: array, data: array} response envelope and
// return it to common::get_json(), which serialises it for the API caller.
	return common::build_element_json_output($context, $data);
