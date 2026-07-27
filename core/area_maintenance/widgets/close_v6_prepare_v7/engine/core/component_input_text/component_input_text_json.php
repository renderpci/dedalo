<?php declare(strict_types=1);
/**
* COMPONENT_INPUT_TEXT — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* component_input_text instance. Executed via common::get_json() inside the
* calling object scope ($this = component_input_text).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve the ontology structure context when the caller requests it
*   ($options->get_context), choosing between the full context (tools +
*   buttons) and the lightweight 'simple' variant.
* - Resolve component data for the current mode (edit/list/tm/search) and
*   language, including multi-language fallback and transliteration metadata.
* - Handle the special activity-section 'Where' field (tipo dd546): replaces
*   the raw ontology tipo value stored in $value[0]->value with its
*   human-readable label so the activity log is readable to end-users.
* - Delegate dataframe subdatum resolution to the shared trait helper
*   (build_dataframe_subdatum), merging any produced context and data entries
*   into the controller's own arrays.
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Data shape produced (one item in $data):
*   {
*     section_id, section_tipo, tipo, mode, lang,
*     from_component_tipo, entries: [{value, lang, id?}],
*     parent_tipo, parent_section_id,
*     fallback_value: array|null,    // non-null when current lang is empty
*     counter?: int,                 // dataframe row counter (has_dataframe only)
*     transliterate_value?: array    // cross-lang data (with_lang_versions only)
*   }
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
/** @var component_input_text $this */
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$properties		= $this->get_properties();
	// unique flag. When true the component requires a request_config object in its context
	// so the client search autocomplete can resolve uniqueness constraints server-side.
	$unique			= isset($properties->unique) ? $properties->unique : false;
	// has_dataframe flag. When true, get_structure_context receives add_rqo=true so the
	// dataframe's own request_config is included in the context payload, and
	// build_dataframe_subdatum is called later to produce the subdatum entries.
	$has_dataframe	= isset($properties->has_dataframe) ? $properties->has_dataframe : false;



// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0

		// add_rqo. True when either uniqueness checking or dataframe support is active:
		// both require the request_config to be included in the returned context so the
		// client-side component can send correct autocomplete / subdatum fetch requests.
		$add_rqo = ($unique || $has_dataframe)
			? true
			: false;

		switch ($options->context_type) {

			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				// 'simple' omits tools and buttons; used when the caller only needs the
				// ontology structure (e.g., list/tm views, portal wrappers).
				$this->context	= $this->get_structure_context_simple(
					$permissions,
					$add_rqo
				);
				$context[] = $this->context;
				break;

			default:
				// Component structure context (tipo, relations, properties, etc.)
				// Full context includes tools and buttons; used in 'edit' and 'search' views.
				$this->context	= $this->get_structure_context(
					$permissions,
					$add_rqo
				);
				$context[] = $this->context;
				break;
		}
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
		// Resolve the data items for the current mode.
		// 'list'/'tm': get_list_value() returns the language-filtered slice,
		//   applying the Root-user special case defined in component_input_text.
		// 'search': no stored value is needed; the client drives its own query UI.
		// 'edit' (default): get_data_lang() returns the full array of items for
		//   $this->lang, or null when the component carries no data yet.
		switch ($mode) {

			case 'list':
			case 'tm':
				$value			= $this->get_list_value();
				// fallback. When the current-lang slice is empty, attempt to resolve
				// data from another lang (main lang → nolan → any).
				$fallback_value	= $this->is_empty_data( $value )
					? $this->get_component_data_fallback($this->lang)
					: null;
				break;

			case 'search':
				$value			= [];
				$fallback_value	= false;
				break;

			case 'edit':
			default:
				$value			= $this->get_data_lang();
				// fallback. Mirrors the list case; $fallback_value is set on the data item
				// so the client can display it differently (e.g., dimmed) from real data.
				$fallback_value	= $this->is_empty_data( $value )
					? $this->get_component_data_fallback($this->lang)
					: null;
				break;
		}

		// activity exceptions
		// The activity-log section stores the 'Where' location as a raw ontology
		// tipo in dd546 (component_input_text inside DEDALO_ACTIVITY_SECTION_TIPO).
		// End-users should see the human-readable term label rather than the tipo
		// code, so we resolve it here before packing the value into the data item.
			if ($this->get_section_tipo()===DEDALO_ACTIVITY_SECTION_TIPO) {
				// activity 'Where' case
				if ($this->tipo==='dd546') {
					$first_value = $value[0]->value ?? null;
					if( !empty($first_value) ){
						// Resolve the ontology term label; fall back to empty string
						// when the tipo is no longer resolvable (deleted node).
						$term = ontology_node::get_term_by_tipo($first_value, DEDALO_DATA_LANG, true, true) ?? '';
						// Append the raw tipo in brackets for traceability:
						// e.g., "Section users [dd17]"
						$value[0]->value = $term . ' ['. $first_value."]";
					}
				}
			}

		// dataframe. If it exists, calculate the subdatum (shared trait helper)
		// build_dataframe_subdatum() returns null when has_dataframe is false or
		// mode is 'search'. When non-null, its context entries (dataframe component
		// structures) and data entries (resolved subdatum rows) are merged into the
		// controller's own $context/$data arrays so the client receives everything in
		// a single response payload.
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
		// Build the standard data envelope. parent_tipo and parent_section_id are
		// added so the client can derive the parent component locator when needed
		// (e.g., inline-relation or dataframe contexts).
			$item = $this->get_data_item($value);
				$item->parent_tipo			= $this->get_tipo();
				$item->parent_section_id	= $this->get_section_id();
				$item->fallback_value		= $fallback_value;

		// counter. Used by edit views to build the provisional dataframe
		// render context (counter+1) for new blank rows
			if ($dataframe_subdatum!==null) {
				$item->counter = $dataframe_subdatum->counter;
			}

		// Transliterate components
		// If the component has with_lang_versions = true in properties,
		// it could be transliterated to other languages (e.g., used into translate component inside tool_lang).
		// transliterate_value is used to inform the users that this data has a translation
		// or, inside the tool_lang, to show the original data in DEDALO_DATA_NOLAN.
			$with_lang_versions = $this->with_lang_versions;
			if($with_lang_versions===true) {

				$original_lang = $this->lang;

				// If the original_lang is nolan, get the transliterable data in current data lang.
				// If the original_lang is any other lang, get it in nolan (used into translate component inside tool_lang)
				$transliterable_lang = ($original_lang === DEDALO_DATA_NOLAN)
					? DEDALO_DATA_LANG
					: DEDALO_DATA_NOLAN;

				$item->transliterate_value = $this->get_data_lang($transliterable_lang);
			}

		// $item->fallback_lang_applied	= $fallback_lang_applied ?? false;

		// debug
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
