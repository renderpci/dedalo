<?php declare(strict_types=1);
/**
* COMPONENT_RELATION_MODEL — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* component_relation_model instance. Executed via common::get_json() inside
* the calling object scope ($this = component_relation_model).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve the ontology structure context when requested ($options->get_context),
*   choosing between the lightweight 'simple' variant and the full context.
*   In the default (full) branch, the set of valid target sections is resolved
*   from the hierarchy or from 'free' mode target_values, then attached to the
*   context object via set_target_sections() so the client UI knows which
*   sections the relation component can link to.
* - Resolve component data according to the current render mode:
*     'list'/'tm' — get_list_value() returns human-readable label strings for
*                   the stored locators by walking the ontology list of values.
*                   No datalist is emitted (list/tm views are read-only).
*     'edit' (default) — get_data() returns the raw stored locator array;
*                   get_list_of_values() supplies the full datalist of available
*                   relation targets so the client can render a selection widget.
* - When a datalist is available it is embedded on the data item under the
*   'datalist' key. The key is absent from list/tm responses.
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Data shape produced (one item in $data):
*   {
*     section_id, section_tipo, tipo, mode, lang,
*     from_component_tipo,
*     entries: [locator, …],   // raw locators (edit) or label strings (list/tm)
*     datalist?: [             // only in edit mode
*       { value: locator, label: string, … },
*       …
*     ]
*   }
*
* Context shape (one item in $context):
*   {
*     tipo, section_tipo, properties, relations,
*     tools?, buttons?,               // present in full context only
*     target_sections: [              // present in full context only
*       { tipo: string, label: string },
*       …
*     ]
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
/** @var component_relation_model $this */
// JSON data component controller



// component configuration vars
// Snapshot of per-request config values resolved once to avoid repeated method
// calls. $section_tipo is captured here for use in relation resolution below.
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$lang			= $this->get_lang();
	$section_tipo = $this->get_section_tipo();



// context
// Accumulates dd_object entries describing the ontology structure of this
// component. Exactly one entry is added when context is requested.
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {
			case 'simple':
				// Lightweight context variant: skips tools and buttons.
				// Used by list/tm views and portal wrappers that only need the
				// ontology structure (tipo, relations, properties) without the
				// full tool/button tree.
				// Component structure context_simple (tipo, relations, properties, etc.)
				$this->context = $this->get_structure_context_simple($permissions);
				break;

			default:
				// Full context: includes tools, buttons, and target-section metadata
				// for edit and search views. add_request_config is false because
				// component_relation_model resolves its own subdatum inline and does
				// not need the request_config object in the context envelope.

				// item_context
					$this->context = $this->get_structure_context(
						$permissions,
						false // bool add_request_config
					);

				// target_sections add
				// Resolve each target section tipo into a minimal descriptor
				// {tipo, label} using the ontology interface language
				// (DEDALO_DATA_LANG). get_ar_target_section_tipo() supports two
				// resolution strategies controlled by properties->target_mode:
				//   - 'free': uses target_values from ontology properties directly.
				//   - default: queries the hierarchy section's model component and
				//     falls back to prefix+'2' when no hierarchy entry is found.
				// The label is looked up via ontology_node::get_term_by_tipo() so
				// the client can render human-readable section names without an
				// extra round-trip.
					$target_sections = array_map(function($tipo) {
						return [
							'tipo'	=> $tipo,
							'label'	=> ontology_node::get_term_by_tipo($tipo, DEDALO_DATA_LANG, true, true)
						];
					}, $this->get_ar_target_section_tipo());
					$this->context->set_target_sections($target_sections);
				break;
		}

		$context[] = $this->context;
	}//end if($options->get_context===true)



// data
// Accumulates the data item(s) for this component. Normally one entry;
// permissions=0 causes the whole block to be skipped, returning an empty array.
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
		// Resolve the stored value for the active render mode.
		// $datalist is intentionally left unset here so the isset() guard
		// below is only true when the edit branch explicitly populates it.
			switch ($mode) {

				case 'list':
				case 'tm':
					// Read-only modes: resolve label strings for selected relations.
					// get_list_value() walks the component's list_of_values and
					// returns only the labels of entries whose locator appears in
					// the stored data — raw locators are not exposed to callers
					// in these modes. No datalist is required.
					$value = $this->get_list_value();
					break;

				case 'edit':
				default:
					// Edit mode: return raw stored locators so the client can
					// present the currently linked records, plus a full datalist
					// of available link targets so the selection widget can be
					// populated. get_list_of_values() is inherited from
					// component_common; ->result extracts the item array,
					// defaulting to [] when the result is absent.
					$value		= $this->get_data();
					$datalist	= $this->get_list_of_values( DEDALO_DATA_LANG )->result ?? [];
					break;
			}

		// data item
		// Wrap value + metadata in the standard data envelope used by all
		// components. The envelope includes section_id, section_tipo, tipo,
		// mode, lang, from_component_tipo, and the entries array.
			$item = $this->get_data_item($value);

			// datalist
			// Only embed the datalist when it was populated (edit mode only).
			// In list/tm modes $datalist is never declared, so isset() is false
			// and the key is absent from the response — reducing payload size.
			if (isset($datalist)) {
				$item->datalist = $datalist;
			}

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
