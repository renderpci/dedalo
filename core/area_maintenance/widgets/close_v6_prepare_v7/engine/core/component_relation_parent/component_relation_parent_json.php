<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var component_relation_parent $this */
// JSON data component controller — component_relation_parent
//
// This file is included by common::get_json() and executes inside the scope
// of the calling component_relation_parent instance. It assembles the full
// API response envelope {context, data} for one component_relation_parent
// instance and returns it to common::get_json() for JSON serialisation.
//
// component_relation_parent stores hierarchical upward-links: locators that
// point from the current section record to its ontological parent(s). The
// inverse direction (which records point to this one as their parent) is
// served by component_relation_children.
//
// Responsibility chain:
//   1. Capture per-request configuration scalars.
//   2. Build context: always emitted, even when data is empty or inaccessible.
//      The 'Add' button is suppressed here (show_interface->button_add = false)
//      because adding a parent is managed by the children side of the relation.
//   3. Build data (gated by permissions > 0):
//      a. get_data_lang() loads the raw locator array for this component.
//      b. get_data_paginated() returns the current page slice.
//      c. get_data_item() builds the standard envelope with parent_tipo,
//         parent_section_id, and a corrected pagination sub-object reflecting
//         the full (un-paged) count.
//      d. get_subdatum() resolves the referenced parent sections into context
//         descriptors and formatted data rows; subcontext is merged into the
//         top-level $context array, subdata into $data.
//      e. Any errors collected by component_relation_parent::$errors (e.g. cycle
//         detection during ancestor traversal) are attached to $item->errors so
//         the client can surface them to the user.
//   4. Return via common::build_element_json_output() which wraps $context and
//      $data into the standard {context: [...], data: [...]} envelope.



// component configuration vars
// Captured once to avoid repeated method calls and to give clear local names
// that are referenced throughout this file's logic below.
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$section_tipo	= $this->section_tipo;
	$lang			= $this->lang;
	$tipo			= $this->get_tipo();
	$properties		= $this->get_properties() ?? new stdClass();



// context
// get_structure_context() returns the frozen schema descriptor for this component
// (tipo, relations, properties, request_config, etc.). The second argument 'true'
// embeds the request_config inside the returned context object so that downstream
// calls to get_subdatum() can find it on $this->context->request_config.
// Properties are deep-cloned by build_structure_context() before stamping, so
// the mutations below (show_interface) do not pollute the class-static cache.
	$context = [];

	$this->context = $this->get_structure_context(
		$permissions,
		true // bool add_request_config
	);

	// properties : show_interface set as false to prevent + button creation in client
	// The 'Add parent' action is always initiated from the children/portal side.
	// Suppressing button_add here prevents the client from rendering an inline
	// 'add' affordance on the parent-relation component itself, which would be
	// semantically confusing and potentially unsafe (users should only attach
	// a child to a parent, never the other way round from this view).
		$properties = $this->context->properties ?? new stdClass();
		$properties->show_interface = $properties->show_interface ?? new stdClass();
		$properties->show_interface->button_add = false;
		$this->context->properties = $properties;

	$context[] = $this->context;



// data
	$data = [];

	if($permissions>0) {

		$start_time=start_time();

		// get_data_lang: returns the language-filtered locator array stored for this
		// component. Each locator object holds at minimum:
		//   {section_tipo, section_id, type, from_component_tipo}
		// An empty result means no parent has been set for the current record.
		$data_value = $this->get_data_lang();

		if (!empty($data_value)) {

			// Paginated page slice of $data_value. Applies offset/limit from
			// $this->pagination so only the requested window is resolved by get_subdatum.
			$value		= $this->get_data_paginated();
			// get_parent() returns the ontology parent tipo (e.g. 'oh2') for this
			// component, used as parent_section_id in the data item so the client
			// can locate the relation owner within the section hierarchy.
			$section_id	= $this->get_parent();
			$limit		= $this->pagination->limit;
			$offset		= $this->pagination->offset;

			// data item
			// get_data_item() builds the standard component envelope object:
			//   {section_id, section_tipo, tipo, mode, lang, from_component_tipo, entries}
			// We extend it with parent_tipo / parent_section_id so the client can
			// back-reference the relation owner when rendering inline rows.
			// The pagination sub-object is replaced with one that carries the full
			// un-paged count ($data_value length) rather than the slice length from
			// $value, which is what the client needs to render accurate page controls.
				$item = $this->get_data_item($value);
					$item->parent_tipo			= $tipo;
					$item->parent_section_id	= $section_id;
					// fix pagination vars
						$pagination = new stdClass();
							$pagination->total	= count($data_value);
							$pagination->limit	= $limit;
							$pagination->offset	= $offset;
					$item->pagination = $pagination;

				$data[] = $item;

			// subdatum
			// get_subdatum() resolves the paged $value locator slice into schema
			// descriptors (context) and formatted row objects (data) for each
			// referenced parent section. Only the page slice is resolved — not the
			// full $data_value set — to keep the payload consistent with the
			// pagination window.
				$subdatum = $this->get_subdatum($tipo, $value);

				// add subcontext
				// Merge the parent-section component schema objects into the top-level
				// $context array. Duplicate schemas are skipped internally by
				// get_subdatum (seen_context dedup by tipo+section_tipo+mode).
				$ar_subcontext = $subdatum->context;
				foreach ($ar_subcontext as $current_context) {
					$context[] = $current_context;
				}

				// add subdata
				// In 'list' and 'tm' modes each resolved row also receives
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

			// errors. Add specific class static errors
			// component_relation_parent::$errors accumulates errors during the
			// current request (e.g. cycle detection triggered by is_ancestor() or
			// fetch_ancestors_recursive()). Attaching them to $item->errors lets
			// the client surface actionable messages (e.g. "Loop detected") to the
			// user without requiring a separate error endpoint.
				if (!empty(component_relation_parent::$errors)) {
					$item->errors = component_relation_parent::$errors;
				}
		}//end if (!empty($data_value))

		// debug
		// metrics::add_metric() accumulates timing and call-count telemetry collected
		// by the performance monitor and exposed in debug output.
		// add_metric('data_total_time', $start_time) records elapsed nanoseconds
		// since $start_time; add_metric('data_total_calls') increments a counter.
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}
	}//end if $options->get_data===true && $permissions>0



// JSON string
// common::build_element_json_output() wraps $context and $data into the standard
// API envelope: {context: [...], data: [...]}. The caller (common::get_json())
// JSON-encodes this object and sends it as the HTTP response body.
	return common::build_element_json_output($context, $data);
