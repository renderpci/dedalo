<?php declare(strict_types=1);
/**
* COMPONENT_INVERSE — JSON CONTROLLER
* Included-file controller that builds the JSON context + data response for a
* component_inverse instance. Executed via common::get_json() inside the
* calling object scope ($this = component_inverse).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3, see docs/development/naming_convention_json_php.md).
* - Resolve the ontology structure context when the caller requests it
*   ($options->get_context), choosing between the full context and the
*   lightweight 'simple' variant.
* - Resolve the inverse-reference locators that describe which other records
*   point back to the current section record.
*   - 'list' / 'tm' modes: get_list_value() returns the language-filtered
*     slice of the data (delegates to get_data_lang() in component_common;
*     component_inverse has no database storage so get_data() calls
*     section_record::get_inverse_references() via search_related).
*   - 'edit' (default) mode: get_data_lang() returns the same inverse-locator
*     array for the current language (again driven by the dynamically computed
*     search_related result; no matrix table row is read).
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Execution context:
*   This file is included by common::get_json() using PHP include(), which
*   runs the file inside the calling instance scope. The variables $this,
*   $options (stdClass, built by get_json()), and the DEDALO_* constants are
*   all available here; no function/class wrapper is needed.
*
* Data shape produced (one item in $data):
*   {
*     section_id:          string   — current record identifier
*     section_tipo:        string   — ontology tipo of the current section
*     tipo:                string   — ontology tipo of this inverse component
*     mode:                string   — 'edit' | 'list' | 'tm'
*     lang:                string   — active language code
*     from_component_tipo: string   — portal/relation tipo that triggered context
*     entries: [locator, …]        — inverse-reference locator objects; each has:
*       {
*         from_section_tipo:    string  — tipo of the referencing section
*         from_section_id:      string  — record ID in the referencing section
*         from_component_tipo:  string  — tipo of the component holding the link
*       }
*   }
*
* No datalist is appended because component_inverse has no configurable list
* of values — its data is always computed dynamically from search_related.
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
/** @var component_inverse $this */
// JSON data component controller



// component configuration vars
// Snapshot the two most-used per-request values so they are not re-fetched
// from the object on every use below.
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();



// context
// Accumulates dd_object entries that describe the ontology structure of this
// component. The array will contain exactly one entry when context is requested.
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {
			case 'simple':
				// Lightweight context variant: skips tools and buttons.
				// Used by list/tm views and portal wrappers that only need
				// the ontology structure (tipo, relations, properties) without
				// the full tool/button tree.
				// Component structure context_simple (tipo, relations, properties, etc.)
				$this->context = $this->get_structure_context_simple($permissions);
				break;

			default:
				// Full context: includes tools and buttons for edit/search views.
				$this->context = $this->get_structure_context($permissions);
				break;
		}

		$context[] = $this->context;
	}//end if($options->get_context===true)



// data
// Accumulates the data item for this component. The permissions guard keeps
// the data block empty for anonymous (permissions === 0) requests, matching
// the behaviour of all other component JSON controllers.
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
		// Resolve inverse-reference locators for the active render mode.
		// Because component_inverse does not store data in the matrix tables
		// (use_db_data = false), both branches ultimately call get_data(), which
		// delegates to section_record::get_inverse_references(). That method uses
		// search_related::get_referenced_locators() to locate every component in
		// every other section that holds a locator pointing to the current record.
			switch ($mode) {

				case 'list':
				case 'tm':
					// Read-only / time-machine modes: return the language-filtered
					// slice. get_list_value() falls through to get_data_lang() in
					// component_common, which in turn calls get_data(). For this
					// component the result is identical to the edit-mode value because
					// inverse references are not language-partitioned.
					$value = $this->get_list_value();
					break;

				case 'edit':
				default:
					// Edit mode: return the raw inverse-locator array for the current
					// language via get_data_lang(). The client uses these locators to
					// build navigation links to the records that reference this one.
					$value = $this->get_data_lang();
					break;
			}

		// data item
		// Wrap value + metadata in the standard data envelope used by all
		// components. The envelope includes section_id, section_tipo, tipo,
		// mode, lang, from_component_tipo, and the entries array.
			$item = $this->get_data_item($value);

		// debug
		// Record elapsed time and increment the global data-call counter when
		// debug metrics are active. SHOW_DEBUG is a compile-time constant.
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
// Assemble the final response object {context: array, data: array} and return
// it to common::get_json(), which serialises it for the API caller.
	return common::build_element_json_output($context, $data);
