<?php declare(strict_types=1);
/**
* COMPONENT_DATAFRAME_JSON
* API data controller for component_dataframe: builds the context + data arrays
* returned to the client as a JSON object by common::get_json().
*
* This file is included (not required) by common::get_json() inside the
* calling component_dataframe instance scope — $this refers to that instance
* throughout. It must not declare classes, functions, or globals; its only
* output is the return value at the bottom of the file.
*
* Responsibilities:
* - Resolve the structure-context entry (ontology metadata + request_config).
* - Guard that a valid caller_dataframe pairing context is present in every
*   mode except 'search' (logs ERROR and continues if missing).
* - Dispatch to the correct value accessor per mode:
*     solved  → raw locator array with parent_tipo / parent_section_id decorations
*     list/tm → paginated slice (component_common::get_data_paginated with explicit limit)
*     search  → full unpaginated locator array (filter/autocomplete widgets)
*     edit    → paginated slice (default, get_data_paginated with default pagination)
* - Decorate the data-item with pagination metadata and the pairing keys
*   (id_key / main_component_tipo) so the client can bind the frame button to the
*   correct main-component data item.
* - In modes other than 'solved', expand subdatum for every frame locator in the
*   current page so the client receives component data for linked frame records
*   in a single round-trip.
*
* Key difference from component_portal_json.php:
* Unlike its portal parent, this controller always works within a caller_dataframe
* context that narrows data to the pairing subset (one main-component item → its
* frame locators). The frame target records are fetched via the same get_subdatum()
* expansion path as portals, but the data-item carries the extra pairing keys so
* the client frame button knows which item id it qualifies.
*
* Data shapes:
* - context[] — one dd_object from get_structure_context(); get_subdatum() appends
*   one context entry per unique component visible inside the frame target records.
* - data[] — first entry is a data-item object built by get_data_item() and
*   augmented with parent_tipo / parent_section_id / pagination / id_key /
*   main_component_tipo; subsequent entries are subdatum rows for each frame record.
*
* Return value:
*   stdClass { context: dd_object[], data: object[] }
*   assembled by common::build_element_json_output().
*
* @see common::get_json()                  — caller; provides $options and $this scope
* @see component_common::get_subdatum()    — frame-target-record component data expansion
* @see component_common::build_element_json_output() — final response wrapper
* @see component_dataframe::get_data()    — caller-filtered frame locator retrieval
* @see docs/core/components/component_dataframe.md — full data model documentation
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
/** @var component_dataframe $this */
// JSON data component controller



// component configuration vars
	$permissions		= $this->get_component_permissions();
	$mode				= $this->get_mode();
	$section_tipo		= $this->section_tipo;
	$lang				= $this->lang;
	$tipo				= $this->get_tipo();
	$properties			= $this->get_properties() ?? new stdClass();
	$caller_dataframe	= $this->get_caller_dataframe();

	// caller_dataframe guard
	// component_dataframe requires a pairing context (caller_dataframe) in every mode
	// except 'search' so that get_data() can filter the relations bag to only the
	// frame locators that belong to the specific main-component data item being rendered.
	// Without it, all frame locators for the entire slot would leak into the response,
	// breaking the per-item isolation that is the whole point of the dataframe.
	// unified pairing: id_key + main_component_tipo are mandatory (outside search mode)
	if ( $mode!=='search' && ( empty($caller_dataframe) || !isset($caller_dataframe->id_key) || !isset($caller_dataframe->main_component_tipo) ) ){
		$bt = debug_backtrace();
		debug_log(__METHOD__
			. " Mandatory caller_dataframe not found " . PHP_EOL
			. ' tipo: ' . $tipo . PHP_EOL
			. ' section_tipo: ' . $section_tipo . PHP_EOL
			. ' section_id: ' . $this->get_section_id() . PHP_EOL
			. ' mode: ' . $mode
			, logger::ERROR
		);
		dump($bt, ' bt ++ '.to_string($this->tipo));
	}

// context
// data
	$context	= [];
	$data		= [];

	// context get and fix
	// Always build the full structure context (with request_config) regardless of
	// permissions: the client needs it even for read-only display and must know
	// which frame fields to render. add_request_config=true embeds the ddo_map so
	// the client can drive subdatum expansion without a separate context request.
		$this->context = $this->get_structure_context(
			$permissions,
			true // bool add_request_config
		);
		$context[] = $this->context;

	if($permissions>0) {

		$start_time=start_time();

		// short vars
			$section_id	= $this->get_section_id();
			$limit		= $this->pagination->limit ?? 10;
			$offset		= $this->pagination->offset ?? 0;

		// Read the caller-filtered, language-filtered frame locator array once here.
		// Re-used in the mode switch (for 'solved'/'search'), in the pagination
		// metadata (total count), and in the subdatum expansion guard below.
		// component_dataframe::get_data() narrows the full relations bag to only the
		// entries matching this instance's caller_dataframe context.
		$data_value = $this->get_data_lang();

		// value
		// Dispatch to the correct value accessor for the requested rendering mode.
			switch ($mode) {

				case 'solved':
					// solved mode: compact summary card for the frame button.
					// The raw locator array is used directly; parent_tipo and
					// parent_section_id are injected so the client can build
					// back-links to the host record. No subdatum expansion — only
					// the dataframe item itself is returned, pushed here and skipped
					// in the general data block below.
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
					// list/tm mode: the frame button appears as a cell in a results table.
					// An explicit $limit is forwarded so the single-item cell does not
					// pull the full frame set. In 'tm' the locators come from the merged
					// Time Machine row (already filtered to this caller context by
					// component_common::get_time_machine_data_to_save).
					$value	= $this->get_data_paginated($limit);
					break;

				case 'search':
					// search mode: return the full, unpaginated locator array for use
					// by filter widgets or search matchers that enumerate linked targets.
					// Note: caller_dataframe is NOT required in this mode (see guard above),
					// so data_value may contain the unfiltered slot set.
					$value	= $data_value;
					break;

				case 'edit':
				default:
					// edit mode (default): paginated view in the record editor.
					// No explicit limit is passed, so get_data_paginated() falls back to
					// $this->pagination->limit (resolved above, default 10).
					$value	= $this->get_data_paginated();
					break;
			}//end switch ($mode)

		// data

			// data item (list mode result don't include self data, only subdata)
			// Build the dataframe's own data-item and decorate it with:
			// - parent_tipo / parent_section_id  (back-link to the host record)
			// - pagination metadata              (total, limit, offset for pager)
			// - pairing keys                     (id_key, main_component_tipo, etc.)
			// This item is NOT pushed in 'solved' mode (already pushed in the switch).
			$item = $this->get_data_item($value);
				$item->parent_tipo			= $tipo;
				$item->parent_section_id	= $section_id;
				// fix pagination vars
				// Use the total count from the unsliced data_value (not the page slice)
				// so the client pager shows the correct total rather than the page size.
				$item->pagination = (object)[
					'total'		=> empty($data_value) ? 0 : count($data_value),
					'limit'		=> $limit,
					'offset'	=> $offset
				];
				// specific properties for dataframe
				// Inject the pairing keys onto the data-item so the client frame button
				// knows which main-component data item (id_key) and which main component
				// (main_component_tipo) this frame qualifies. Dual-read: prefer id_key
				// Unified contract: only id_key (the main item id) + main_component_tipo
				// are written onto the data-item, so the client persists the clean
				// id_key-only frame shape.
				if ( !empty($caller_dataframe)
					&& isset($caller_dataframe->id_key)
					&& isset($caller_dataframe->main_component_tipo)  ) {
					$item->id_key				= $caller_dataframe->id_key;
					$item->main_component_tipo	= $caller_dataframe->main_component_tipo;
				}

			$data[] = $item;

			// solved mode
			// Expand frame target records into subdatum entries (skipped in 'solved'
			// mode, which is already a lightweight single-item response, and when
			// data_value is empty, meaning no frames exist yet for this main item).
			// get_subdatum() follows each frame locator's section_tipo + section_id,
			// fetches the component data for every field visible in that target record
			// (driven by request_config->ddo_map), and returns context + data entries.
			if (!empty($data_value) && $mode!=='solved') {
				// subdatum
				$subdatum = $this->get_subdatum($tipo, $value);

				// Unpack the subcontext entries and append them to the flat context array.
				// Unlike component_portal_json.php this controller does not call
				// merge_unique_context(); duplicate context entries for shared frame
				// components across items are therefore possible when several frame
				// locators point at the same target section.
				$ar_subcontext = $subdatum->context;
				foreach ($ar_subcontext as $current_context) {
					$context[] = $current_context;
				}

				// Unpack subdatum data rows and append to the flat data array.
				// Each row contains data for a single component field inside one frame
				// target record; the client reassembles them using section_id+tipo keys.
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
