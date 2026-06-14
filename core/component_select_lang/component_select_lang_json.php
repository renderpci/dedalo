<?php declare(strict_types=1);
/**
* COMPONENT_SELECT_LANG — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* component_select_lang instance. Executed via common::get_json() inside the
* calling object scope ($this = component_select_lang).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve the ontology structure context when the caller requests it
*   ($options->get_context), choosing between the lightweight 'simple' variant
*   (context_type='simple') and the full context (default). The full branch
*   additionally resolves a target_sections descriptor for each section tipo
*   this component can link to, forwarding it to the context object via
*   set_target_sections() so the client knows the human-readable name of each
*   linkable language section.
* - Resolve component data for the current render mode:
*     'list' / 'tm' — get_list_value() returns the human-readable label(s) of
*                     the stored language locator(s); used by read-only list rows
*                     and Time Machine diff views.
*     'edit' (default) — get_data_lang() returns the stored locator array for
*                     the active language; get_list_of_values() supplies the
*                     full set of project-configured languages so the client can
*                     populate the select element with all available choices.
*                     A get_missing_lang() guard also ensures that any previously
*                     saved language code which has since been removed from the
*                     project's configured language list is still surfaced in the
*                     dropdown (labelled with ' *') so the stored value is never
*                     silently hidden.
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Execution context:
*   This file is not a class or function — it is an include-script evaluated
*   inside component_select_lang::get_json() (inherited from component_common).
*   The variables $this (component_select_lang), $options (request options
*   object), and SHOW_DEBUG (global constant) are injected by the caller.
*   No dataframe subdatum resolution is performed by this controller; unlike
*   component_select_json.php, add_request_config is always false.
*
* Data shape produced (one item in $data):
*   {
*     section_id, section_tipo, tipo, mode, lang,
*     from_component_tipo,
*     entries: [locator, …],  // stored language locators (edit) or null (list/tm)
*     datalist?: [            // only in edit mode; absent in list/tm
*       {
*         value: { section_tipo: string, section_id: string },
*         label: string,      // display name of the language, e.g. 'English'
*         section_id: string  // short code, e.g. 'lg-eng'
*       },
*       …
*     ]
*   }
*
* Context shape (target_sections, default branch only):
*   [
*     { tipo: string, label: string },
*     …
*   ]
*   Entries correspond to the section tipos returned by get_ar_target_section_tipo().
*   Labels are resolved against DEDALO_DATA_LANG via ontology_node::get_term_by_tipo().
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
/** @var component_select_lang $this */
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$lang			= $this->get_lang();



// context
// Accumulates dd_object entries that describe the ontology structure of this
// component and its target language sections. Normally contains exactly one
// entry when $options->get_context is true; empty otherwise.
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$item_context = $this->get_structure_context_simple($permissions);
				break;

			default:
				// item_context
				// add_request_config=false: component_select_lang never embeds a
				// dataframe DDO, so the request_config overhead is not needed.
					$item_context = $this->get_structure_context(
						$permissions,
						false // bool add_request_config
					);
				// target_sections add
				// Resolve the human-readable label for each section tipo that this
				// component can link to (typically only DEDALO_LANGS_SECTION_TIPO).
				// The resulting array lets the client display the name of the target
				// section in tooltips and the section navigation link.
					$target_sections = array_map(function($tipo) {
						return [
							'tipo'	=> $tipo,
							'label'	=> ontology_node::get_term_by_tipo($tipo, DEDALO_DATA_LANG, true, true)
						];
					}, $this->get_ar_target_section_tipo());
					$item_context->set_target_sections($target_sections);
				break;
		}

		$context[] = $item_context;
	}//end if($options->get_context===true)



// data
// Accumulates the data item for this component. Normally one entry; empty when
// permissions=0 (read-denied) or when $options->get_data is false.
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
		// Resolve the stored language value for the active render mode.
			switch($mode) {

				case 'list':
				case 'tm':
					// Read-only modes: get_list_value() resolves stored locators to
					// their human-readable language labels. Returns null when no
					// language has been stored yet.
					$value				= $this->get_list_value();
					break;

				case 'edit':
				default:
					// Edit mode: get_data_lang() returns the stored locator array.
					// get_list_of_values() provides the full set of project-configured
					// languages so the client can populate the dropdown.
					$value			= $this->get_data_lang();
					$list_of_values	= $this->get_list_of_values();

					// check value is contained into list of values
					// Guard: if a language was previously stored but has since been
					// removed from DEDALO_PROJECTS_DEFAULT_LANGS, it will not appear
					// in get_list_of_values(). get_missing_lang() detects this and
					// appends the orphaned entry (marked with ' *') so the stored
					// value is always visible in the dropdown rather than silently lost.
					if (!empty($value) && !empty($list_of_values->result)) {

						$missing_lang = component_select_lang::get_missing_lang(
							$value[0], // object locator
							$list_of_values->result // array list_of_values
						);
						if (!empty($missing_lang)) {
							// add missing lang to list (case France (fr) in MURAPA Hierarchy for example)
							$list_of_values->result[] = $missing_lang;
						}
					}

					$datalist = $list_of_values->result;
					break;
			}

		// data item
		// Wrap the resolved value in the standard data envelope (section_id,
		// section_tipo, tipo, mode, lang, from_component_tipo, entries).
			$item = $this->get_data_item($value);

			// datalist
			// Attach the full language options list to the data item in edit mode.
			// $datalist is only set inside the 'edit'/default branch above; it is
			// intentionally absent in list/tm mode to keep the payload compact.
			if (isset($datalist)) {
				$item->datalist = $datalist;
			}

		// debug
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
