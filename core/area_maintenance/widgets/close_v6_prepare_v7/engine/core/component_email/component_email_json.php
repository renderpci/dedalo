<?php declare(strict_types=1);
/**
* COMPONENT_EMAIL_JSON
* JSON API response controller for component_email.
*
* This file is included (not required) by common::get_json() inside the calling
* component_email object scope, so $this refers to the component_email instance.
* It assembles the two-envelope API response — context (ontology structure) and
* data (user-stored e-mail addresses) — and returns them as a single JSON-ready
* object via common::build_element_json_output().
*
* Responsibilities:
* - Enforce the permission gate: data is never emitted when $permissions === 0.
* - Honour the $options->get_context / $options->get_data flags so callers can
*   request only what they need (e.g. context-only for ontology lookups, data-
*   only for incremental refreshes).
* - Resolve the optional dataframe subdatum when properties->has_dataframe is true:
*   qualifier-frame context and data items are merged into the response envelopes
*   alongside the primary e-mail data item.
* - Route value resolution to the correct helper based on $mode:
*   'list'/'tm' → get_list_value() (flattened string array for list renders),
*   all other modes → get_data_lang() (full item array for edit renders).
*
* NOTE: component_email is always non-translatable. The component's constructor
* fixes lang to DEDALO_DATA_NOLAN before any data is fetched, so get_data_lang()
* and get_list_value() always operate on the 'lg-nolan' language group.
*
* This controller does NOT add a 'fallback_value' or 'transliterate_value' to the
* data item, because e-mail addresses have no language-specific fallbacks and are
* never transliterated. Compare component_input_text_json.php for those paths.
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
/** @var component_email $this */
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$properties		= $this->get_properties();
	// has_dataframe
	// When true, the component carries qualifier-frame records (component_dataframe
	// subdatum). The flag is read once here to decide both context forwarding
	// (add_request_config=true pushes the dataframe DDO into the client RQO) and
	// whether build_dataframe_subdatum() will actually build any subdatum.
	$has_dataframe	= isset($properties->has_dataframe) && $properties->has_dataframe===true;



// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				// Lightweight variant: omits relation lists; used in list/portal renders
				// where the full context structure is not needed.
				// When has_dataframe is true, add_request_config=true so the client
				// receives the dataframe DDO inside the RQO (Request Query Object).
					$context[] = $this->get_structure_context_simple(
						$permissions,
						$has_dataframe // bool add_request_config (dataframe ddo must reach the client RQO)
					);
				break;

			default:
				// Component structure context (tipo, relations, properties, etc.)
				// Full variant: includes relation lists, tools, and all ontology
				// properties. Used in edit mode and whenever the client needs the
				// complete component descriptor.
					$context[] = $this->get_structure_context(
						$permissions,
						$has_dataframe // bool add_request_config (dataframe ddo must reach the client RQO)
					);

				break;
		}
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
		// Route to the appropriate value resolver based on the current render mode.
		// 'list' and 'tm' use get_list_value(), which returns a flattened array of
		// plain strings suitable for compact list and time-machine renders.
		// All other modes (edit, search, …) use get_data_lang(), which returns the
		// full array of {id, lang, value} item objects needed by the edit UI.
		// component_email is always DEDALO_DATA_NOLAN; both helpers operate on that
		// language group.
			switch ($mode) {

				case 'list':
				case 'tm':
					$value = $this->get_list_value();
					break;

				default:
					$value = $this->get_data_lang();
					break;
			}

		// dataframe. If it exists, calculate the subdatum (shared trait helper)
		// build_dataframe_subdatum() is a no-op (returns null) when:
		//   - properties->has_dataframe is not true, or
		//   - mode is 'search' (frames are never rendered in search mode).
		// When it returns a non-null object its context (dataframe DDO context items)
		// is merged into $context and its data (frame section data items) into $data,
		// so the client receives everything it needs in a single API call.
			$dataframe_subdatum = $this->build_dataframe_subdatum($value, $mode);
			if ($dataframe_subdatum!==null) {
				foreach ($dataframe_subdatum->context as $current_context) {
					$context[] = $current_context;
				}
				foreach ($dataframe_subdatum->data as $sub_value) {
					$data[] = $sub_value;
				}
			}

		// data item
		// Wraps $value in the standard envelope object and annotates it with the
		// component's own tipo and section_id. These two fields let the client
		// route the item back to the correct component instance on save.
			$item = $this->get_data_item($value);
				$item->parent_tipo			= $this->get_tipo();
				$item->parent_section_id	= $this->get_section_id();

			// counter. Used by edit views to build the provisional dataframe
			// render context (counter+1) for new blank rows
			// Only attached when a dataframe subdatum was built; the client reads it
			// to know the next available item id when the user adds a blank row.
			if ($dataframe_subdatum!==null) {
				$item->counter = $dataframe_subdatum->counter;
			}

		// debug
		// Accumulate wall-clock time and call counts into the request-level metrics
		// collector so the debug panel can surface slow components.
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
// Serialise the two envelopes into the standard {context:[…], data:[…]} response
// object. The caller (common::get_json()) encodes this to a JSON string and returns
// it to the API layer.
	return common::build_element_json_output($context, $data);
