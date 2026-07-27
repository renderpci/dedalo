<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var component_relation_related $this */
// JSON data component controller
// This file is included by common::get_json() and runs inside the scope of the
// calling component_relation_related instance. It assembles the full API response
// object {context, data} for one component_relation_related component.
//
// component_relation_related manages associative (non-hierarchical) relationships
// between thesaurus terms. Three directionality modes are supported:
//   - Unidirectional  : A → B. B does not automatically know about A.
//   - Bidirectional   : A ↔ B. Inverses are computed server-side via
//                       get_calculated_references() and merged into the response.
//   - Multidirectional: Graph walk — A is linked to B and to every term that
//                       B knows about, recursively.
//
// Responsibility chain:
//   1. Capture configuration scalars used throughout.
//   2. Build context: structure/schema descriptor for this component, always
//      present regardless of permissions. The context also carries request_config,
//      which get_subdatum() consults to know which DDO columns to resolve.
//      button_add is forced to false here so the client never renders an "add"
//      button; new relations are managed through a dedicated UI pathway.
//   3. Build data (gated by permissions > 0):
//      a. Retrieve the full stored locator array (get_data()) for pagination math.
//      b. Retrieve the paged slice (get_data_paginated()) as the actual entries
//         that will be sent to the client.
//      c. Wrap the paged slice in a data item envelope that carries pagination
//         metadata (total from full set, limit/offset from request).
//      d. Resolve subdatum: for each locator in the paged slice, load the
//         referenced section's component values (labels, etc.) via get_subdatum().
//         In 'list' / 'tm' modes, each resolved row is also stamped with
//         parent_tipo / parent_section_id so the client can back-reference the
//         relation owner when rendering inline rows.
//      e. Resolve back-references (bidirectional / multidirectional modes only):
//         get_calculated_references() walks the relation graph and returns locators
//         with human-readable labels. Skipped entirely in 'search' mode because
//         filter evaluation does not need the computed inverse set.
//   4. Return the assembled envelope via common::build_element_json_output().



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$tipo			= $this->get_tipo();



// data
	$context	= [];
	$data		= [];

	// context
	// get_structure_context() returns the frozen schema descriptor for this component
	// (tipo, model, relations, properties, request_config, etc.). The second argument
	// 'true' embeds the request_config object inside the returned context so that
	// get_subdatum() can resolve which DDO columns to load without a second call.
		$this->context = $this->get_structure_context(
			$permissions,
			true // bool add_request_config
		);

		// properties update : show_interface set as false to prevent + button creation in client
		// component_relation_related does not expose its own "add" affordance in the
		// standard toolbar — new relations are added through a separate flow. Forcing
		// button_add = false here overrides whatever the ontology-configured default is,
		// ensuring the client renderer never shows the "+" button regardless of stored
		// properties.
		$properties = $this->context->properties ?? new stdClass();
		$properties->show_interface = $properties->show_interface ?? new stdClass();
		$properties->show_interface->button_add = false;
		$this->context->properties = $properties;

		$context[] = $this->context;


	if($permissions>0) {

		$start_time=start_time();

		// short vars
			$section_id	= $this->get_section_id();
			$limit		= $this->pagination?->limit ?? null;
			$offset		= $this->pagination?->offset ?? 0;

		// value. Get the data into DDBB
		// get_data() returns the full stored locator array (un-paged) from the database.
		// It is held separately so we can count all entries for accurate pagination math.
		// get_data_paginated() applies the offset/limit slice from $this->pagination;
		// passing $limit explicitly allows a custom cap (e.g. null = unlimited).
			$data_entries = $this->get_data() ?? [];
			$value        = $this->get_data_paginated( $limit ) ?? [];

		// data item. Main item representing this component instance.
		// Must be available even when empty to allow adding references from client.
		// get_data_item() builds the standard envelope object:
		//   {section_id, section_tipo, tipo, mode, lang, from_component_tipo, entries}
		// We extend it with parent_tipo / parent_section_id so the client can
		// trace the owning section, then replace the pagination sub-object with one
		// that carries the *total* entry count from the un-paged $data_entries rather
		// than the length of the current slice.
			$item = $this->get_data_item($value);
				$item->parent_tipo			= $tipo;
				$item->parent_section_id	= $section_id;
				// fix pagination vars
				// get_data_item() does not include a pagination object; build one here
				// carrying the *total* entry count from the un-paged $data_entries so that
				// client paging controls know the full result size, not just the slice size.
				$pagination = new stdClass();
					$pagination->total	= count($data_entries);
					$pagination->limit	= $limit;
					$pagination->offset	= $offset;
				$item->pagination = $pagination;

		// subdatum: resolve related sections context and data (labels, etc.)
		// Merge subcontext (related components) and subdata (formatted values)
		// In 'list'/'tm' modes, inject parent_tipo/section_id into each subdata item.
			if (!empty($data_entries)) {

				// subdatum
				// get_subdatum() walks the request_config DDO map embedded in $this->context
				// and loads the requested component values for each locator in $value (the
				// paged slice, not the full set). It returns:
				//   subdatum->context : component schema objects for the referenced columns
				//   subdatum->data    : resolved row objects keyed by locator
					$subdatum = $this->get_subdatum($tipo, $value);

					// subcontext add
					// Merge referenced-section component schemas into the top-level context array.
					$ar_subcontext	= $subdatum->context;
					foreach ($ar_subcontext as $current_context) {
						$context[] = $current_context;
					}

					// subdata add
					// In 'list' and 'tm' modes each resolved row receives parent_tipo /
					// parent_section_id so the client can back-reference the relation owner
					// when rendering inline rows (e.g. for inline editing in list views).
					// In all other modes (edit, solved, search, …) rows are appended as-is.
					$ar_subdata	= $subdatum->data;
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
			}//end if (!empty($data_entries))

		// references: resolve bidirectional/multidirectional back-references
		// (sections that point TO current term). Skipped in search mode.
		// get_calculated_references() returns [] for unidirectional relations and
		// performs a recursive graph walk for bi/multidirectional ones. Each element
		// is an object {value: locator, label: string|null}. Skipping in 'search'
		// mode avoids expensive back-reference resolution during filter evaluation,
		// where the client only needs stored data to build search criteria.
			if ($mode!=='search') {
				$references = $this->get_calculated_references();
				// references. Add to item if exists
				if (!empty($references)) {
					$item->references = $references;
				}
			}

		// debug
		// metrics::add_metric() accumulates timing and call-count telemetry exposed
		// in debug output. 'data_total_time' records elapsed nanoseconds since
		// $start_time; 'data_total_calls' increments a request-scoped counter.
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}


		$data[] = $item;
	}//end if $permissions>0



// JSON string
// common::build_element_json_output() wraps context and data into the standard
// API envelope: {context: [...], data: [...]}. The caller (common::get_json())
// JSON-encodes this object and sends it as the HTTP response body.
	return common::build_element_json_output($context, $data);
