<?php declare(strict_types=1);
/**
* COMPONENT_SECTION_ID — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* component_section_id instance. Executed via common::get_json() inside the
* calling object scope ($this = component_section_id).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve the ontology structure context when the caller requests it
*   ($options->get_context), choosing between the full context (with tools and
*   buttons) and the lightweight 'simple' variant used by list/portal views.
*   In the full ('default') branch the parent section's CSS color is appended to
*   the context object so the client can colour-code column headers by section.
* - Resolve the section ID value for the current record and wrap it in the
*   standard data item envelope when $options->get_data is true and the caller
*   has at least read permission (permissions > 0).
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Execution context:
*   This file is not a class or function — it is an include-script evaluated
*   inside component_section_id::get_json() (inherited from component_common via
*   common::get_json()). The variables $this (component_section_id), $options
*   (stdClass request options), and SHOW_DEBUG (global constant) are injected by
*   the caller. $mode is resolved here but is not branched on because
*   component_section_id is mode-agnostic: get_data() always returns the raw
*   section_id integer regardless of edit/list/tm mode.
*
* Data shape produced (one item in $data):
*   {
*     section_id,       // int — the record's primary key in its matrix table
*     section_tipo,     // string — ontology tipo of the owning section
*     tipo,             // string — ontology tipo of this component
*     mode,             // string — 'edit' | 'list' | 'tm'
*     lang,             // string — the component's active language (language-neutral component)
*     from_component_tipo,
*     entries: [int|null]  // raw array: one element — the section_id integer or null
*   }
*
* Context shape (one dd_object entry in $context):
*   Full variant ('default'): complete ontology structure, tools, buttons, plus
*     an additional 'color' property (hex string from ontology_node::get_color)
*     identifying the parent section's display colour.
*   Simple variant ('simple'): lightweight structure (tipo, relations, properties)
*     without tools, buttons, or color — used by list/portal callers that only
*     need the minimum schema.
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
/** @var component_section_id $this */
// JSON data component controller



// component configuration vars
// Snapshot request-scoped config once. $mode is captured for structural parity
// with other JSON controllers but is not used to branch data resolution here —
// component_section_id delegates everything to get_data(), which is mode-agnostic.
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();



// context
// Accumulates dd_object entries describing the ontology structure of this
// component. Normally contains exactly one entry; skipped entirely when
// $options->get_context is false (data-only requests, e.g. optimised list loads).
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {
			case 'simple':
				// Lightweight context variant: omits tools, buttons, and color.
				// Used by list/portal wrappers that only need the minimal
				// ontology structure (tipo, relations, properties).
				// Component structure context_simple (tipo, relations, properties, etc.)
				$this->context = $this->get_structure_context_simple($permissions);
				break;

			default:
				// Full context variant: includes tools, buttons, and the parent
				// section's colour.
				// The color property is appended directly to the dd_object so the
				// client can colour-code column headers to match the section theme.
				// ontology_node::get_color() reads the 'color' property of the section
				// node from the ontology, falling back to '#b9b9b9' (grey) if unset.
				$color = ontology_node::get_color($this->section_tipo);
				$this->context = $this->get_structure_context($permissions);
					$this->context->color = $color;
				break;
		}

		$context[] = $this->context;
	}//end if($options->get_context===true)



// data
// Accumulates the data item(s) for this component. Normally exactly one entry.
// Skipped entirely when $permissions = 0 (read-denied) or get_data is false.
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
		// component_section_id is read-only and mode-agnostic: get_data() always
		// returns [int|null] regardless of 'edit', 'list', or 'tm' mode.
		// The returned array wraps the section_id integer so it matches the
		// standard multi-value entries contract (see component_common::get_data_item).
			$value = $this->get_data();

		// data item
		// Wraps $value in the standard envelope {section_id, section_tipo, tipo,
		// mode, lang, from_component_tipo, entries:[…]}. No parent_tipo or counter
		// additions are needed here because component_section_id has no dataframe.
			$item = $this->get_data_item($value);

		// debug
		// Record elapsed time and increment the global data-call counter when debug
		// metrics are active. SHOW_DEBUG is a compile-time constant.
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
