<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/**
* SECTIONS JSON CONTROLLER
* Assembles the standard {context, data} API response for a `sections` element.
*
* This file is the JSON controller for the `sections` model. It is never invoked
* directly by a web request; it is `include`d by `common::get_json()` inside the
* calling `sections` object scope. On entry `$this` refers to the `sections`
* instance; no `$options` argument is used (sections always returns both context
* and data).
*
* Two execution paths exist depending on whether the search returned records:
*
* EMPTY-RESULT PATH (row_count === 0)
*   When the search returns no rows — typically the first request for a section
*   whose records have not yet been loaded — the controller builds a context-only
*   response. It iterates `$ar_section_tipo`, instantiates a bare `section` object
*   for each tipo, propagates pagination and view settings, then calls
*   `section::get_json()` to collect the context fragment. This ensures the client
*   receives the ontology/layout context it needs even before any records exist.
*   No data items are emitted.
*
* DATA PATH (row_count > 0)
*   When the search returns rows the controller:
*   1. Emits a single envelope `$item` of typo 'sections' that accumulates locator
*      entries (`section_tipo` + `section_id`) for every row.
*   2. For each row, resolves or reuses a cached `section` instance, enforces
*      per-record and per-section permission gates, propagates view/properties,
*      then appends a `$current_value` locator (with `paginated_key` and, in TM
*      mode, time-machine metadata) to `$item->entries`.
*   3. After all rows, calls `section::get_json()` on each cached section instance
*      to collect its context+data fragments, deduplicating context items via
*      `common::context_key()` (tipo + section_tipo + mode hash).
*
* Time Machine (TM) mode:
*   When `$mode === 'tm'` or `$this->caller_tipo === DEDALO_TIME_MACHINE_SECTION_TIPO`
*   ('dd15'), each raw database row is treated as a `tm_record`. The record is
*   converted to a regular `section_record` via `tm_record::get_section_record()`.
*   The origin section_tipo is preserved so permission checks are performed against
*   the *real* section, not the bookkeeping section `dd15` (SEC-024 guard).
*   TM metadata (matrix_id, timestamp, caller_section_tipo/id, bulk_process_id,
*   user_id) is injected into each `$current_value` entry.
*
* Security gates:
*   - SEC-026: direct HTTP access blocked at the top of the file.
*   - SEC-024: TM rows use origin section_tipo for permission resolution to avoid
*     systematically failing the dd15-vs-real-section permission mismatch.
*   - Per-record permissions are checked before the section instance is created;
*     sections scoring < 1 are collected in `$rejected_sections` and all their
*     future rows are skipped without repeating the permission call (O(1) lookup).
*
* Output shape:
*   The return value of `include()` is the result of `common::build_element_json_output()`:
*   {
*     context : array   — deduplicated dd_object context fragments
*     data    : array   — [ {typo:'sections', tipo:…, section_tipo:[], entries:[…]},
*                            …section-level data items from section::get_json() ]
*   }
*
* Scope contract (variables available on entry via the include scope):
*   @var sections  $this  The sections instance being serialised. Key properties:
*                           - $this->search_query_object  SQO with limit/offset/section_tipo
*                           - $this->caller_tipo           tipo of the calling element
*                           - $this->mode                  'list'|'edit'|'tm'|…
*                           - $this->view                  optional view override
*                           - $this->properties            optional section properties
*
* @package Dédalo
* @subpackage Core
*/



// element configuration vars
	// $ar_section_tipo	= $this->get_ar_section_tipo();
	$mode			= $this->get_mode();
	$section_class	= 'section';



// context and data
	$context	= [];
	$data		= [];

	// dato is the full result of a search using the search_query_object
	$sections_data = $this->get_data();

	if ( $sections_data->row_count()===0 ) {

		// empty-result path
		// When the search returns no records we still need to emit context so the
		// client can render a placeholder or empty list correctly. Iterate each
		// requested section_tipo and collect its context fragment.
		$ar_section_tipo = $this->get_ar_section_tipo();

		foreach ((array)$ar_section_tipo as $current_section_tipo) {

			// section instance
				$section = $section_class::get_instance(
					$current_section_tipo,
					$mode
				);

			// pagination. fix pagination vars (defined in class component_common)
				$limit	= $this->search_query_object->limit;
				$offset	= $this->search_query_object->offset;
				$pagination = new stdClass();
					$pagination->limit	= $limit;
					$pagination->offset	= $offset;
				$section->pagination = $pagination;

			// view fix. Section instance inherits the view (from API request)
				if (isset($this->view)) {
					$section->set_view($this->view);
				}

			// section JSON context
				$section_json = $section->get_json();

			$context = [...$context, ...$section_json->context];
		}
	}else{

		// data item (first data item. Note that 'value' and 'section_tipo' are fulfilled on each dato iteration)
			// The 'entries' array is populated per-row below; section_tipo is left
			// empty at construction because a single sections request may span
			// multiple section tipos (e.g. a portal searching across 'oh1' and
			// 'oh2'). The client resolves the actual tipos from each entry's
			// section_tipo field.
			$item = new stdClass();
				$item->typo			= 'sections';
				$item->tipo			= $this->caller_tipo;
				$item->section_tipo	= []; // $ar_section_tipo;
				$item->entries		= []; // $entries;

			$data[] = $item;

		// get pagination of the result of search
			$limit	= $this->search_query_object->limit;
			$offset	= $this->search_query_object->offset;
			// $pagination = new stdClass();
			// 	$pagination->limit	= $limit;
			// 	$pagination->offset	= $offset;

			// $grouped_sections = [];
			// sections

			// section_instances: O(1) keyed cache of already-built section objects,
			// avoiding repeated get_instance() calls for the same section_tipo when
			// a single search result contains many rows from the same section.
			$section_instances = []; // O(1) lookup instead of O(n) in_array
			// key: per-row counter used together with $offset to produce paginated_key
			$key = 0;
			$section = null;
			// context_index: declared but not used in the current implementation.
			// (!) Left-over variable — no writes or reads below; may be a remnant
			// from a refactor that moved context deduplication to the $seen_context
			// pattern further down. Do not remove: rule 3 prohibits dead-code removal.
			$context_index = [];
			// rejected_sections: tracks section tipos that failed the permission
			// check so that subsequent rows from the same tipo are skipped without
			// re-evaluating permissions on every iteration.
			$rejected_sections = [];

			foreach ($sections_data as $current_record) {
				// SEC-024 (§9.4 follow-up): in TM mode the section_record
				// produced by `tm_record::get_section_record()` is synthesised
				// in the bookkeeping section `dd15`, NOT in the section the
				// TM entry actually describes (e.g. `numisdata3`). The
				// per-record permission check below would therefore use
				// `common::get_permissions('dd15','dd15')` and reject every
				// row for any non-superuser caller — leaving the response
				// with empty `context` and `data`. Capture the origin
				// section_tipo *before* the conversion so we can resolve
				// permissions against the real underlying section.
				$tm_origin_section_tipo = null;
				// when the caller is a Time Machine section
				// $current_record is a Time Machine Record then we need to convert it into a Section Record
				if( $mode === 'tm' || $this->caller_tipo === DEDALO_TIME_MACHINE_SECTION_TIPO ){
					$tm_record = tm_record::get_instance( (int)$current_record->id );
					$tm_record->set_data( $current_record );
					// preserve origin section_tipo before overwrite for SEC-024 permission gate
					$tm_origin_section_tipo = $current_record->section_tipo ?? null;
					// OVERWRITE! section_id and section_tipo to convert it into a regular section record
					$current_record = $tm_record->get_section_record();
				}

				$section_tipo	= $current_record->section_tipo;
				$section_id		= (int)$current_record->section_id;

				// section record
					$section_record = section_record::get_instance( $section_tipo, $section_id );
					$section_record->set_data( $current_record );

					// Section Record Permissions
					if (!empty($tm_origin_section_tipo)) {
						// TM row: gate by the origin section schema
						// permissions, not by the dd15 bookkeeping perms.
						$section_record_permissions = common::get_permissions(
							$tm_origin_section_tipo,
							$tm_origin_section_tipo
						);
					} else {
						$section_record_permissions = $section_record->get_permissions();
					}
					if ($section_record_permissions < 1) {
						continue; // skip this section and its records
					}

				// create or reuse cached section instance
					if ( !isset($section_instances[$section_tipo]) && !isset($rejected_sections[$section_tipo]) ) {

						// mark section_tipo as seen
						// get or create cached section instance
						$section = $section_class::get_instance(
							$section_tipo,
							$mode,
							true // bool cache
						);

						// Safety check: ensure $section is a valid object before using it
						if (!$section instanceof section) {
							debug_log('sections_json'
								. " Skip invalid section_tipo: $section_tipo [record section_id: $section_id]" . PHP_EOL
								. " section::get_instance returned false (likely non-section model)"
								, logger::WARNING
							);
							continue;
						}

						// permissions check: skip section and its all section_records without at least read access
						// Only sections with at least read access are included in the result

						// If the section record has permissions, use them, otherwise use the section permissions
						$permissions = $section_record_permissions > 0
							? $section_record_permissions
							: $section->get_section_permissions();
						if ($permissions < 1) {
							$rejected_sections[$section_tipo] = true;
							continue; // skip this section and its records
						}

						// Set permissions when the section record has permissions > 0
						// allow to override section permissions
						// in cases as Time Machine notes or User panel
						// in those cases the user could get access to its own notes or user panel
						if($section_record_permissions > 0){
							$section->set_permissions($section_record_permissions);
						}

						// set section instance in cache
						$section_instances[$section_tipo] = $section;
					}

					// Adding section record instances
					$section->add_section_record( $section_record );

					// properties optional
					if (!empty($this->properties)){
						$section->set_properties($this->properties);
					}

					// view fix. Section instance inherits the view (from API request)
					if (isset($this->view)) {
						$section->set_view($this->view);
					}

					// item sections value. Update in each iteration
					// Each entry is a minimal locator used by the client to position
					// and render the section record within a paginated list.
					$current_value = new stdClass();
						$current_value->section_tipo	= $section_tipo;
						$current_value->section_id		= $section_id;

					// // section info (information about creation, modification and publication of current section)
					// 	$section_info = $section->get_section_info();
					// 	if (!empty($section_info)) {
					// 		foreach ($section_info as $si_key => $si_value) {
					// 			$current_value->{$si_key} = $si_value;
					// 		}
					// 	}

					// paginated_key
					// Absolute position in the full result set (offset + per-page counter).
					// Used by the client to maintain stable ordering across paginated fetches.
						$current_value->paginated_key = $key + $offset;
						$key++;

					// tm case: inject time machine record metadata
					// These fields are consumed by the TM viewer to display who changed what and when.
						if ($mode === 'tm' || $this->caller_tipo === DEDALO_TIME_MACHINE_SECTION_TIPO ) {
							$tm_data = $tm_record->get_data();
							// Note: id/matrix_id is in tm_record instance, not in get_data() result
							$matrix_id = $tm_record->id;
							$current_value->matrix_id			= $matrix_id;
							$current_value->timestamp			= $tm_data->timestamp ?? null;
							$current_value->caller_section_tipo = $tm_data->section_tipo ?? null;
							$current_value->caller_section_id 	= $tm_data->section_id ?? null;
							$current_value->bulk_process_id		= (int)($tm_data->bulk_process_id ?? 0);
							$current_value->user_id				= $tm_data->user_id ?? null;
						}

					// add value to item
						$item->entries[] = $current_value;
			}

		// subdatum
			// seen_context. Keyed dedup (tipo+section_tipo+mode) instead of a linear
			// search per item; seed it with any context already collected above.
			// The hash key is produced by common::context_key(), which concatenates
			// tipo, section_tipo, and mode to form a cheap identity token.
			$seen_context = [];
			foreach ($context as $context_item) {
				$seen_context[ common::context_key($context_item) ] = true;
			}
			// Iterate the per-tipo section cache. Each call to section::get_json()
			// triggers component get_subdatum() expansion for all records accumulated
			// during the row-iteration loop above, returning context and data fragments.
			foreach ($section_instances as $section_tipo => $section) {

				$section_json = $section->get_json();

				// CONTEXT. prevent duplicated context. Get the unique context and subcontext that will be need to used in client.
				// it's necessary to have all context called but only one it's necessary, in a list the context its calculated for every row and column, getting duplicated context and subcontext
				// include the context that wasn't included in the previous loops.
					foreach ($section_json->context as $context_item) {
						$context_item_key = common::context_key($context_item);
						if (isset($seen_context[$context_item_key])) {
							continue;
						}
						$seen_context[$context_item_key] = true;
						$context[] = $context_item;
					}

				// data
				// Spread-append all section data items (component datum objects) to
				// the top-level $data array so the client receives a flat list.
					array_push($data, ...$section_json->data);
			}

	}//end if (empty($sections_data))



// JSON string
	return common::build_element_json_output($context, $data);
