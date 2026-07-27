<?php declare(strict_types=1);
/**
* COMPONENT_PORTAL_JSON
* API data controller for component_portal: builds the context + data arrays
* returned to the client as a JSON object by common::get_json().
*
* This file is included (not required) by common::get_json() via eval-scope injection,
* which means it executes INSIDE the calling component_portal instance scope — $this
* refers to that instance throughout. It must not declare classes, functions, or
* globals; its only output is the return value at the bottom of the file.
*
* Responsibilities:
* - Resolve the structure-context entry (ontology metadata + request_config).
* - When the portal is in 'external' source mode and the client has signalled
*   get_data_external=true, recompute and save the inverse/calculated locator list
*   before serving data (set_data_external).
* - Dispatch to the correct value accessor per mode:
*     solved  → raw locator array with parent_tipo / parent_section_id decorations
*     list/tm → paginated slice (component_common::get_data_paginated)
*     search  → full locator array as-is (used by search matchers)
*     edit    → paginated slice (default, same as list/tm)
* - In modes other than 'solved', collect subdatum context and data for every
*   locator in the current page so the client receives component data for each
*   linked record in a single round-trip.
*
* Data shapes:
* - context[] — each entry is a dd_object from get_structure_context(); only one
*   portal context entry is added, but get_subdatum() appends one context entry
*   per unique component visible inside the linked records (deduped by
*   merge_unique_context).
* - data[] — first entry is a data-item object built by get_data_item() and
*   augmented with parent_tipo / parent_section_id / pagination; subsequent
*   entries are subdatum rows for each linked record component.
*
* Return value:
*   stdClass { context: dd_object[], data: object[] }
*   assembled by common::build_element_json_output().
*
* @see common::get_json()                  — caller; provides $options and $this scope
* @see component_portal::set_data_external — inverse locator recalculation
* @see common::get_subdatum()              — linked-record component data expansion
* @see common::merge_unique_context()      — dedup context entries
* @see common::build_element_json_output() — final response wrapper
*/

// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var component_portal $this */
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$section_tipo	= $this->section_tipo;
	$tipo			= $this->get_tipo();
	$properties		= $this->get_properties() ?? new stdClass();


// data
	$context	= [];
	$data		= [];

	// context get and fix
	// Always build the full structure context (with request_config) regardless of
	// permissions: the client needs the context even for read-only display and must
	// know which fields to render. add_request_config=true embeds the ddo_map so the
	// client can drive subdatum expansion without a separate context request.
		$this->context = $this->get_structure_context(
			$permissions,
			true // bool add_request_config
		);
		$context[] = $this->context;


	if($permissions>0) {

		$start_time=start_time();

		// short vars
			$section_id	= $this->get_section_id();
			$limit		= $this->pagination->limit ?? null;
			$offset		= $this->pagination->offset ?? 0;

		// external source refresh gate
		// A portal with properties->source->mode === 'external' stores inverse/computed
		// locators derived from other sections rather than explicitly linked ones. Those
		// locators can grow stale between saves. The client UI sends build_options with
		// get_data_external=true when the user clicks the "sync external data" button,
		// which forces a full recompute+save before the regular data fetch below.
		// The guard prevents recalculation on every normal page load or pagination request.
			if(	(($this->build_options->get_data_external ?? false) === true) &&
				(isset($properties->source->mode) && $properties->source->mode==='external')) {
		 		// set_data_external: $save=false, $changed=false, $current_data=false, $references_limit=0
				$options = new stdClass();
					$options->save				= true; // $mode==='edit' ? true : false;
					$options->changed			= false; // $mode==='edit' ? true : false;
					$options->current_data		= false; // $this->get_data();
					$options->references_limit	= 0; // (!) Set to zero to get all references to enable sort

				$this->set_data_external($options);	// Forces update data with calculated external data
			}

		// get_data_lang returns the full language-specific locator array (or null).
		// Read once here; re-used both in the mode switch and in the subdatum block below
		// to avoid a second DB hit.
		$data_value = $this->get_data_lang();

		// value
		// Dispatch to the correct value accessor for the requested rendering mode.
		// 'solved' mode is a lightweight single-item render (no pagination, no subdata);
		// all other modes that need linked-record details go through the subdatum path below.
			switch ($mode) {

				case 'solved':
					// solved mode: the component renders itself in a compact summary card.
					// The raw locator array is used directly; parent_tipo / parent_section_id
					// are injected so the client can build back-links to the host record.
					// No subdatum expansion is performed — only the portal item itself is returned.
					$value	= $data_value;

					$item = $this->get_data_item($value);
						$item->parent_tipo			= $tipo;
						$item->parent_section_id	= $section_id;

					$data[] = $item;
					break;

				case 'list':
				case 'tm':
					// data item (list mode result don't include self data, only subdata)
					// (!) limit note that in list mode, limit is always 1
					// list/tm mode: the portal appears as a column cell in a results table.
					// Pagination is still applied so that a single-row table cell does not
					// carry the full linked-record set when only a label is needed.
					$value	= $this->get_data_paginated( $limit );
					break;

				case 'search':
					// search mode: the full unpaginated locator array is returned for
					// use by the search subsystem or filter widgets that need to enumerate
					// all linked records to build autocomplete suggestions.
					$value	= $data_value;
					break;

				case 'edit':
				default:
					// edit mode (default): standard paginated view used in the record editor.
					// The page slice is determined by $limit/$offset already resolved above.
					$value	= $this->get_data_paginated( $limit );
					break;
			}//end switch ($mode)

		// data
		// Build and push the portal's own data-item, then expand subdatum for every
		// locator in the current page. Skipped for 'solved' mode (already pushed above)
		// and when data_value is empty (no links exist yet for this record).
			if (!empty($data_value) && $mode!='solved') {

				// data item (list mode result don't include self data, only subdata)
				// parent_tipo and parent_section_id allow the client to render a link
				// back to this record from within each linked target record card.
					$item = $this->get_data_item($value);
						$item->parent_tipo			= $tipo;
						$item->parent_section_id	= $section_id;
						// fix pagination vars
						// Override the pagination metadata on the item with the actual
						// total count and the effective limit/offset for this request so
						// the client can render a correct pager without a second COUNT call.
						$pagination = new stdClass();
							$pagination->total	= count($data_value);
							$pagination->limit	= $limit;
							$pagination->offset	= $offset;
						$item->pagination = $pagination;

					$data[] = $item;

				// subdatum
				// Expand each locator in the current page into component data for every
				// field visible inside the linked record (driven by request_config->ddo_map).
				// get_subdatum internally deduplicates context entries by tipo+section_tipo+mode
				// so identical column descriptors are not transmitted more than once per response.
					$subdatum = $this->get_subdatum($tipo, $value);

				// subcontext add. get_subdatum already dedups internally; guard here against
				// items colliding with the already-added portal context (tipo+section_tipo+mode)
					$context = common::merge_unique_context($context, $subdatum->context);

				// Unpack subdatum rows and append to the flat data array.
				// Each row contains data for a single component field inside one linked record;
				// the client reassembles them into per-record view models using section_id+tipo keys.
					$ar_subdata = $subdatum->data;
					foreach ($ar_subdata as $sub_value) {
						$data[] = $sub_value;
					}
			}//end if (!empty($data_value))

		// debug
		// Record cumulative wall-clock time and invocation count for this data build
		// under the SHOW_DEBUG profiler. Visible in the /performance API endpoint.
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}
	}//end if $options->get_data===true && $permissions>0



// JSON string
// Assemble the final { context, data } response envelope and return it to common::get_json().
	return common::build_element_json_output($context, $data);
