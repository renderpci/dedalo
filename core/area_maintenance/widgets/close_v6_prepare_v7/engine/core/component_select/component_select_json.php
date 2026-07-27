<?php declare(strict_types=1);
/**
* COMPONENT_SELECT — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* component_select instance. Executed via common::get_json() inside the
* calling object scope ($this = component_select).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve the ontology structure context when the caller requests it
*   ($options->get_context). In the default branch the full structure context
*   is built with add_request_config=true (needed for subdatum dataframe
*   detection below), and a target_sections descriptor is computed for each
*   linked section tipo so the client can render section labels and enforce
*   per-section create permissions.
* - Resolve component data for the current render mode:
*     'list'/'tm' — get_value() returns a plain resolved string (e.g. the
*                   human-readable label of the single selected locator). Used
*                   by read-only list rows and time-machine views.
*     'edit' (default) — get_data_lang() returns the stored locator array for
*                   the current language; get_list_of_values() supplies the
*                   full dropdown options so the client can populate the select
*                   element with all available choices pre-selected.
* - When the request_config DDO map contains a component_dataframe entry, also
*   resolve and append subdatum context+data so the client receives the
*   dataframe rows alongside the main select value in a single response.
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Data shape produced (one primary item in $data):
*   {
*     section_id, section_tipo, tipo, mode, lang,
*     from_component_tipo,
*     entries: [locator, …],      // raw stored locators (edit) or null (list/tm)
*     datalist?: [                // only in edit mode; absent in list/tm
*       { value: locator, label: string, … },
*       …
*     ]
*   }
* When a dataframe is present, additional context+data entries from
* get_subdatum() are appended to the $context/$data arrays so the client
* receives the full nested grid in the same API call.
*
* Context shape (target_sections, default branch only):
*   [
*     {
*       tipo: string,
*       label: string,           // resolved via ontology_node::get_term_by_tipo
*       permissions: int,        // general read/write access to the section
*       permissions_new: int     // permission to create new records in the section
*     },
*     …
*   ]
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
/** @var component_select $this */
// JSON data component controller



// component configuration vars
// Snapshot of the three most-used per-request config values so they are not
// re-fetched from the object on every use below.
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$lang			= $this->get_lang();



// context
// Accumulates dd_object entries that describe the ontology structure of this
// component and, when relevant, its linked target sections. The array will
// contain exactly one entry when context is requested.
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {
			case 'simple':

				// Lightweight context variant: skips tools, buttons, and request_config.
				// Used by list/tm views and portal wrappers that only need the ontology
				// structure (tipo, relations, properties) without the full tool/button tree.
				// Component structure context_simple (tipo, relations, properties, etc.)
				$this->context = $this->get_structure_context_simple($permissions, true);
				break;

			default:
				// Full context with request_config: add_request_config=true is required
				// here because the data block below reads $this->context->request_config
				// to decide whether a component_dataframe DDO is present (subdatum check).
				// Without it, get_subdatum() would receive an empty request_config and
				// skip dataframe resolution entirely.

				// this->context
					$this->context = $this->get_structure_context(
						$permissions,
						true // bool add_request_config
					);

				// target_sections add
				// Build a descriptor for each section tipo this select can link to.
				// Only sections the current user can read (permissions>0) are included,
				// so the client never receives metadata for sections it cannot access.
				// 'permissions'     → read/write access to the section itself (edit icon)
				// 'permissions_new' → whether the user may create new records there
				//                     (controls visibility of the "new record" button)
					$target_sections		= [];
					$ar_target_section_tipo	= $this->get_ar_target_section_tipo();
					foreach ($ar_target_section_tipo as $current_section_tipo) {
						$current_section_tipo_permissions = common::get_permissions($current_section_tipo, $current_section_tipo);
						if ($current_section_tipo_permissions>0) {
							$target_sections[] = [
								'tipo'				=> $current_section_tipo,
								'label'				=> ontology_node::get_term_by_tipo($current_section_tipo, DEDALO_DATA_LANG, true, true),
								// section permissions, general access to the target section, it will be able to edit or not the section
								'permissions'		=> $current_section_tipo_permissions,
								// get permissions of the button new of the target section, it will be able to add or not new item in the target section.
								'permissions_new'	=> security::get_section_new_permissions( $current_section_tipo )
							];
						}
					}
					$this->context->target_sections = $target_sections;
				break;
		}

		$context[] = $this->context;
	}//end if($options->get_context===true)



// data
// Accumulates the data item(s) for this component. Normally one primary item
// plus optional subdatum entries when a dataframe DDO is present.
// permissions=0 skips the block entirely, returning an empty data array.
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
		// Resolve the stored value for the active render mode.
		// $datalist is intentionally left unset here so the isset() guard below
		// is only true when the edit branch explicitly populates it.
			switch($mode) {

				case 'list':
				case 'tm':
					// Read-only modes: wrap the single resolved label string in an array.
					// get_value() calls get_export_value()->to_flat_string(), which walks
					// the component's stored locators and returns the human-readable label
					// for the selected entry. Raw locators are never exposed in these modes.
					// The array wrapper keeps the shape consistent with the edit-mode value.
					$value = [ $this->get_value() ];
					break;

				case 'edit':
				default:
					// Edit mode: return raw stored locators plus the full dropdown list.
					// get_data_lang() returns all locators stored under DEDALO_DATA_LANG,
					// or null when no data has been saved yet.
					// get_list_of_values() performs a live search against the target section
					// using the component's request_config/SQO. include_negative=true
					// broadens the search to include section_id=-1 (root/special) records
					// that are normally excluded by the projects filter.
					$value = $this->get_data_lang();
					$datalist = $this->get_list_of_values(DEDALO_DATA_LANG, true)->result ?? [];
					break;
			}

		// data item
		// Wrap value + metadata in the standard data envelope used by all
		// components. The envelope includes section_id, section_tipo, tipo,
		// mode, lang, from_component_tipo, and the entries array.
			$item = $this->get_data_item($value);

			// datalist add if exits
			// Only embed the datalist when it was populated (edit mode). In list/tm
			// modes $datalist is not declared, so isset() is false and the key is
			// absent from the response — reducing payload size.
			if (isset($datalist)) {
				$item->datalist = $datalist;
			}

		// add item to data
			$data[] = $item;

		// subdatum
		// subdatum is necessary only for components that has dataframe
		// component_select can have an associated component_dataframe DDO in its
		// request_config ddo_map. When present the client expects the dataframe
		// context+data rows to be included in the same response so it can render
		// the inline dataframe grid without a second API call. The check is done
		// against request_config[0]->show->ddo_map because the default context
		// branch above always populates $this->context->request_config when
		// add_request_config=true. If $this->context is not yet set (e.g. context
		// was not requested), $this->context->request_config will be empty and the
		// guard short-circuits safely.
			if ( !empty($value) && !empty($this->context->request_config) ) {
				$request_config = $this->context->request_config;
				$has_dataframe = array_find($request_config[0]->show->ddo_map, function( $item ){
					return $item->model === 'component_dataframe';
				});

				if(!empty($has_dataframe)){

					// subdatum
					// get_subdatum() iterates $value (the stored locators), resolves each
					// linked section/component according to the ddo_map, and returns a
					// combined {context: [], data: []} object. The returned context items
					// are appended directly (no merge_unique_context call here, so
					// duplicates are possible if the same tipo appears more than once
					// across locators — this mirrors the original implementation).
					$subdatum = $this->get_subdatum($this->tipo, $value);

					$ar_subcontext = $subdatum->context;
					foreach ($ar_subcontext as $current_context) {
						$context[] = $current_context;
					}

					$ar_subdata = $subdatum->data;
					foreach ($ar_subdata as $sub_value) {
						$data[] = $sub_value;
					}
				}
			}

		// debug
		// Record elapsed time and increment the global data-call counter when
		// debug metrics are active. SHOW_DEBUG is a compile-time constant.
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}
	}//end if($options->get_data===true && $permissions>0)



// JSON string
// Assemble the final response object {context: array, data: array} and return
// it to common::get_json(), which serialises it for the API caller.
	return common::build_element_json_output($context, $data);
