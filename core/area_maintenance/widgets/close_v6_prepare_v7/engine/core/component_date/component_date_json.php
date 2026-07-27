<?php declare(strict_types=1);
/**
* COMPONENT_DATE — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* component_date instance. Executed via common::get_json() inside the calling
* object scope ($this = component_date).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve the ontology structure context when the caller requests it
*   ($options->get_context), choosing between the full context (tools +
*   buttons) and the lightweight 'simple' variant used by list/portal views.
* - Resolve component date data for the current mode (edit/list/tm).
*   Because component_date is always stored in DEDALO_DATA_NOLAN (non-language),
*   get_data_lang() is used uniformly across all non-search modes.
* - Delegate dataframe subdatum resolution to the shared trait helper
*   (build_dataframe_subdatum), merging any produced context and data entries
*   into the controller's own arrays.
* - Attach a row counter to the data item when a dataframe is present, so the
*   client can render a provisional blank row for new entries.
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Execution context:
*   This file is not a class or function — it is an include-script evaluated
*   inside component_date::get_json() (inherited from common via component_common). The
*   variables $this (component_date), $options (request options object), and
*   SHOW_DEBUG (global constant) are injected by the caller.
*
* Data shape produced (one item in $data):
*   {
*     section_id, section_tipo, tipo, mode, lang,
*     from_component_tipo, entries: [<date objects>],
*     parent_tipo, parent_section_id,
*     counter?: int   // only when has_dataframe is true
*   }
*
* Date entries follow the date_mode (date/range/period/time/time_range/date_time)
* defined in the component's ontology properties. Each entry is a structured
* object; see component_date::data_item_to_value() for the shape per mode.
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
/** @var component_date $this */
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$properties		= $this->get_properties();
	// has_dataframe flag. When true, build_dataframe_subdatum() is called later to
	// produce the subdatum entries and attach a counter to the data item, allowing
	// the client to render additional blank rows for inline dataframe editing.
	$has_dataframe	= isset($properties->has_dataframe) ? $properties->has_dataframe : false;



// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0

		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				// 'simple' omits tools and buttons; used when the caller only needs the
				// ontology structure (e.g., list/tm views, portal wrappers).
				// The second argument ($has_dataframe) is passed as add_request_config so
				// the dataframe's own request_config is embedded in the context payload
				// when a dataframe is attached.
				$this->context = $this->get_structure_context_simple(
					$permissions,
					$has_dataframe
				);
				$context[] = $this->context;
				break;

			default:
				// Full context includes tools and buttons; used in 'edit' and 'search' views.
				// Same add_request_config logic as the 'simple' branch applies.
				$this->context = $this->get_structure_context(
					$permissions,
					$has_dataframe
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
		// component_date stores data exclusively in DEDALO_DATA_NOLAN (no per-language
		// variants), so get_data_lang() is the correct resolver for all display modes.
		// The switch is retained for structural parity with other JSON controllers and
		// to leave room for future mode-specific handling (e.g., a condensed list format).
		switch ($mode) {

			case 'list':
			case 'tm':
				$value = $this->get_data_lang();
				break;

			case 'edit':
			default:
				// Building real value
				$value = $this->get_data_lang();
				break;
		}

		// dataframe. If it exists, calculate the subdatum (shared trait helper)
		// build_dataframe_subdatum() returns null when has_dataframe is false or mode
		// is 'search'. When non-null, its context entries (dataframe component structures)
		// and data entries (resolved subdatum rows) are merged into the controller's own
		// $context/$data arrays so the client receives everything in a single payload.
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
		$item = $this->get_data_item($value);

		// counter. Used by edit views to build the provisional dataframe
		// render context (counter+1) for new blank rows
		if ($dataframe_subdatum!==null) {
			$item->counter = $dataframe_subdatum->counter;
		}

		// debug
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}

		$data[] = $item;
	}//end if $permissions>0



// JSON string
	return common::build_element_json_output($context, $data);
