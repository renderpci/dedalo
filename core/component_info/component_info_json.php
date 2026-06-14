<?php declare(strict_types=1);
/**
* COMPONENT_INFO — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* component_info instance. Executed via common::get_json() inside the calling
* object scope ($this = component_info).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve the ontology structure context when the caller requests it
*   ($options->get_context), choosing between the full context and the
*   lightweight 'simple' variant used by list/portal views.
* - Resolve widget data for the current render mode:
*     'list' / 'tm' — get_list_value() (delegates to get_data() internally)
*                     returns a compact widget aggregate for read-only table
*                     cells and Time Machine diff views.
*     'edit' (default) — get_data() (or get_db_data() when use_db_data is true)
*                     returns the full computed widget aggregate plus, in edit
*                     mode only, a datalist aggregated from all widget
*                     get_data_list() results (used by the client to populate
*                     inline suggestion lists per widget).
* - Attach the aggregated datalist to the data item in edit mode when non-empty.
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Execution context:
*   This file is NOT a class or function — it is an include-script evaluated
*   inside component_info::get_json() (inherited from component_common via
*   common). The variables $this (component_info), $options (stdClass with
*   boolean flags), and SHOW_DEBUG (compile-time constant) are injected by the
*   caller; no explicit argument passing is needed.
*
*   $options shape (populated by common::get_json() before the include):
*     - get_context    bool   whether to build the ontology structure context
*     - context_type   string 'simple' | 'default'
*     - get_data       bool   whether to resolve and return data entries
*
* The use_db_data flag:
*   By default component_info computes its data from widget instances
*   (use_db_data = false). When section rendering sets use_db_data = true on
*   the component instance, get_db_data() is called instead, which first tries
*   the parent class's raw DB read and falls back to get_data() when the
*   database row is empty. This allows observer-calculated results that were
*   previously persisted to the matrix to be served directly, avoiding
*   recomputation.
*
* Data shape produced (one item in $data):
*   {
*     section_id          : string,
*     section_tipo        : string,
*     tipo                : string,
*     mode                : string,
*     lang                : string,
*     from_component_tipo : string,
*     entries             : array|null,  // flat widget output: [{widget, key, id, value}, …]
*     datalist?           : array        // only in edit mode when widgets supply datalist items
*   }
*
* The entries array is the merged output of all configured widget instances.
* Each element carries at minimum a 'widget' name key and an 'id'/'value' pair
* whose semantics are defined by the individual widget. The datalist, when
* present, is also widget-keyed (each item includes a 'widget' property) so
* the client can split it per widget name.
*
* Called by:
*   common::get_json()  →  includes this file  →  returns result
*
* @see class.component_info.php
* @see class.common.php  common::get_json(), common::build_element_json_output()
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
/** @var component_info $this */
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();



// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$this->context = $this->get_structure_context_simple($permissions);
				break;

			default:
				$this->context = $this->get_structure_context($permissions);
				break;
		}

		$context[] = $this->context;
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
		// Determine the value source based on the active render mode.
		// In list/tm modes no datalist is needed, so $data_list is intentionally
		// left unset. In edit mode (default) $data_list is populated from all
		// widget instances via get_data_list() so the client can render inline
		// suggestion lists. The use_db_data flag switches from computed (widget
		// instances) to DB-read data; see class doc for the full rationale.
			switch ($mode) {

				case 'list':
				case 'tm':
					$value = (isset($this->use_db_data) && $this->use_db_data===true)
						? $this->get_db_data()
						: $this->get_list_value();
					break;

				case 'edit':
				default:
					$value = (isset($this->use_db_data) && $this->use_db_data===true)
						? $this->get_db_data()
						: $this->get_data();
					$data_list = $this->get_data_list();
					break;
			}

		// data item
			$item = $this->get_data_item($value);

			// data_list
			// Attach the merged widget datalist only when it is non-empty.
			// The client uses self.data.datalist to supply per-widget suggestion
			// lists, filtering by the 'widget' property on each datalist item.
			if (isset($data_list) && !empty($data_list)) {
				$item->datalist = $data_list;
			}

		// debug
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
