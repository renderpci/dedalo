<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var component_relation_children $this */
// JSON data component controller
// This file is included by common::get_json() and runs inside the scope of the
// calling component_relation_children instance. It assembles the full API response
// object {context, data} for one component_relation_children instance.
//
// Responsibility chain:
//   1. Capture configuration scalars used throughout.
//   2. Build context: structure/schema descriptor for this component, always present.
//   3. Build data: the actual child-locator entries plus subdatum (resolved labels
//      for the referenced child sections), gated by permission level > 0.
//   4. Return a JSON-serialisable object via common::build_element_json_output().
//
// component_relation_children is the inverse of component_relation_parent:
//   - It does NOT store data itself (no database row); the locators are derived
//     by scanning component_relation_parent records that point to this section.
//   - In 'search' mode, however, get_data_lang() delegates to the parent class
//     so that stored search filter data is returned instead of the calculated set.
//   - The data item ($item) is always emitted, even when $data_value is empty,
//     to give the client a stable container with pagination metadata.



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$section_tipo	= $this->section_tipo;
	$lang			= $this->lang;
	$tipo			= $this->get_tipo();
	$properties		= $this->get_properties() ?? new stdClass();



// data
	$context	= [];
	$data		= [];

	// Component structure context (tipo, relations, properties, etc.)
	// get_structure_context() returns the frozen schema descriptor for this component,
	// including request_config (used later by get_subdatum to resolve which child
	// columns to load). The second arg 'true' requests that request_config be embedded
	// in the returned context object.
		$this->context = $this->get_structure_context(
			$permissions,
			true // bool add_rqo
		);
		$context[] = $this->context;

	if($permissions>0) {

		$start_time=start_time();

		// get_data_lang: language-filtered locator array for this component.
		// For component_relation_children the underlying get_data() dynamically
		// resolves children from their component_relation_parent records, except
		// in 'search' mode where it falls back to stored data so filters work.
		$data_value = $this->get_data_lang();

		// value: paginated slice to include in the response entries.
		// In 'search' mode the full data_value is returned unsliced; in all other
		// modes get_data_paginated() applies offset/limit from $this->pagination.
		// An empty $data_value always yields an empty array (no slice needed).
		$value = ( !empty($data_value) && $this->mode==='search' )
			? $data_value // Search case: use data_resolved
			: ( !empty($data_value) ? $this->get_data_paginated() : [] );

		// get_parent(): the ontology parent tipo of this component (e.g. 'oh2').
		// Used as parent_section_id in the data item to give the client enough
		// context to place the entries within the section hierarchy.
		$section_id	= $this->get_parent();

		$limit	= $this->pagination->limit;
		$offset	= $this->pagination->offset;

		// data item
		// get_data_item() builds the standard envelope object:
		//   {section_id, section_tipo, tipo, mode, lang, from_component_tipo, entries}
		// We extend it with parent_tipo / parent_section_id so the client can
		// render the "add child" relationship correctly, and we override the
		// pagination sub-object with the *total* count from the un-paged
		// $data_value rather than the slice length from $value.
			$item = $this->get_data_item($value);
				$item->parent_tipo			= $tipo;
				$item->parent_section_id	= $section_id;
				// fix pagination vars
				// $item->pagination from get_data_item() reflects the slice; we
				// replace it with an object that carries the full count so the
				// client can render correct page controls.
					$pagination = new stdClass();
						$pagination->total	= !empty($data_value) ? count($data_value) : 0;
						$pagination->limit	= $limit;
						$pagination->offset	= $offset;
				$item->pagination = $pagination;

			$data[] = $item;


		if (!empty($data_value)) {

			// subdatum: resolves the referenced child sections into context + data entries.
			// get_subdatum() walks the request_config embedded in $this->context and
			// loads every DDO listed there for the locators in $value, returning:
			//   subdatum->context : component schema objects for the child columns
			//   subdatum->data    : resolved row objects for each child locator
			// Only the paged $value slice is resolved, not the full $data_value set,
			// to keep the payload consistent with the pagination window.
				$subdatum = $this->get_subdatum($tipo, $value);

				// add subcontext
				// Merge child-section component schemas into the top-level context array.
				// Duplicate context items are skipped by get_subdatum internally
				// (seen_context dedup by tipo+section_tipo+mode).
				$ar_subcontext	= $subdatum->context;
				foreach ($ar_subcontext as $current_context) {
					$context[] = $current_context;
				}

				// add subdata
				// In 'list' and 'tm' modes, each resolved row also receives
				// parent_tipo / parent_section_id so the client can back-reference
				// the relation owner when rendering inline rows.
				// In all other modes (edit, solved, etc.) rows are appended as-is.
				$ar_subdata = $subdatum->data;
				if ($mode==='list' || $mode==='tm') {
					foreach ($ar_subdata as $current_data) {
						$current_data->parent_tipo			= $tipo;
						$current_data->parent_section_id	= $section_id;

						$data[] = $current_data;
					}
				}else{
					foreach ($ar_subdata as $current_data) {
						$data[] = $current_data;
					}
				}
		}//end if (!empty($data_value))

		// debug
		// metrics::add_metric() accumulates timing and call-count telemetry that is
		// collected by the performance monitor and exposed in debug output.
		// add_metric('data_total_time', $start_time) records elapsed nanoseconds
		// since $start_time; add_metric('data_total_calls') increments a counter.
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}
	}//end if $options->get_data===true && $permissions>0



// JSON string
// common::build_element_json_output() wraps context and data into the standard
// API envelope: {context: [...], data: [...]}. The caller (common::get_json())
// JSON-encodes this object and sends it as the HTTP response body.
	return common::build_element_json_output($context, $data);
