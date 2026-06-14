<?php declare(strict_types=1);
/**
* COMPONENT_RELATION_INDEX_JSON
* JSON API controller for component_relation_index — the "inverse relations" component.
*
* Purpose
* -------
* Assembles the context + data response that common::get_json() returns for this
* component model.  Unlike most components whose dato is owned by the record itself,
* component_relation_index stores INCOMING references: "which other records cite ME?"
* Every locator in the data array therefore points FROM a foreign record TO the current
* one (relation type DEDALO_RELATION_TYPE_INDEX_TIPO / dd96).
*
* How it is executed
* ------------------
* common::get_json() resolves the calling model's class name to the path
*   core/<model>/<model>_json.php
* and includes the file inside the object scope so that $this refers to the live
* component_relation_index instance.  The file MUST end with a `return` statement
* whose value is forwarded to the caller.
*
* Pagination
* ----------
* Because a popular thesaurus term may be cited by thousands of records,
* data is always fetched via get_data_paginated() rather than the unbounded
* get_data().  The pagination triplet (total / limit / offset) is written into
* the $item->pagination property on the data item so the client can drive the
* next-page request.  The related-section context (which needs one sample record
* per calling section_tipo) is only calculated on the FIRST page ($offset === 0)
* to avoid redundant work on subsequent pages.
*
* Subdatum resolution — two paths
* --------------------------------
* 1. request_config path  (properties->source->request_config is set):
*    The component has an explicit ontology request_config; the standard
*    get_subdatum() pipeline resolves sub-components the same way portals do.
*
* 2. Direct per-locator path  (no request_config, the common case):
*    For each locator in $value, get_section_datum_from_locator() instantiates the
*    referenced section, retrieves its context + data, and merges both into the
*    running $context / $data arrays.  The 'parent' property of every sub-data item
*    is pinned to $tipo so the client JS can match items to the index component.
*    A follow-up pass re-parents the ddo_map entries in the component's own
*    request_config from the section tipo to the component tipo, enabling the
*    client to resolve the computed ddo tree correctly.
*
* Response shape
* --------------
* The returned object has the standard {context: array, data: array} envelope
* produced by common::build_element_json_output().
*
* context[0]  — the component's own dd_object context (tipo, label, permissions,
*               request_config, …), built by get_structure_context() with
*               add_request_config=true so the client receives the full ddo_map.
* context[1…] — one context item per calling section_tipo collected by
*               get_related_section_context() (first page only), plus sub-context
*               entries for each resolved locator.
*
* data[0]     — a data item wrapping the paginated locator array:
*   {
*     "entries":            [ { type, section_tipo, section_id, from_component_top_tipo, … }, … ],
*     "parent_tipo":        "<component tipo>",
*     "parent_section_id":  "<component parent section id or null>",
*     "pagination":         { "total": <int>, "limit": <int>, "offset": <int> }
*   }
* data[1…]    — zero or more sub-data items for each resolved related section record,
*               each carrying "parent": $tipo so the client can route them.
*
* @see component_relation_index::get_data_paginated()
* @see component_relation_index::get_related_section_context()
* @see component_relation_index::get_section_datum_from_locator()
* @see common::get_json()
* @see common::build_element_json_output()
*/

// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var component_relation_index $this */
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$section_tipo	= $this->get_section_tipo();
	$lang			= $this->get_lang();
	$tipo			= $this->get_tipo();
	$properties		= $this->get_properties() ?? new stdClass();


// data
	$context	= [];
	$data		= [];


	// context
	// Always built regardless of permissions; the context carries the component
	// schema (model, label, permissions, request_config) that the client needs
	// even when the user has read-only or no access to the data itself.
	// add_request_config=true ensures the ddo_map is included so the client
	// can compute the sub-component tree for the related list grid.
		$this->context = $this->get_structure_context(
			$permissions,
			true // add_request_config
		);
		$context[] = $this->context;

	if($permissions>0) {

		$start_time=start_time();

		// relation index use his own data_paginated
		// data of get_data is a full data as others portals
		// and it can't be get all references of all calling sections
		// sometimes it could be thousands records and is better paginated it.
		$data_paginated = $this->get_data_paginated();

		if (!empty($data_paginated)) {

			$value		= $data_paginated;
			// get_parent() returns the ontology parent of this component (the section tipo
			// whose records own this component), used to annotate the data item so the
			// client knows which section context the pagination belongs to.
			$section_id	= $this->get_parent();
			$limit		= $this->pagination->limit;
			$offset		= $this->pagination->offset;
			$total 		= $this->pagination->total ?? null;

			// get all section context at first call of the component
			// it get all section_tipo and the first record to get the context and subcontext
			// of every section, when the component is paginated ($offset > 0) do not calculate again
			// Skipping on subsequent pages avoids repeated expensive schema lookups; the
			// client already has the section context from the first response.
			if($offset === 0){
				$related_section_context = $this->get_related_section_context();
				$context = array_merge($context, $related_section_context);
			}

			// data item
			// get_data_item() wraps $value in the standard Dédalo data envelope
			// (entries, row_section_id, changed_data, …).  The extra properties
			// appended below (parent_tipo, parent_section_id, pagination) are specific
			// to component_relation_index and tell the client how to page through results.
				$item = $this->get_data_item($value);
					$item->parent_tipo			= $tipo;
					$item->parent_section_id	= $section_id;
					// fix pagination vars
					// Build the pagination object to send to the client.
					// 'total' may already be cached from a previous count_data() call stored
					// in $this->pagination->total; fall back to a fresh count only when needed
					// to avoid the extra search query on subsequent pages.
						$pagination = new stdClass();
						// if total is set, use it, else calculate
							$pagination->total	= isset($total)
								? $total
								: $this->count_data();
							$pagination->limit	= $limit;
							$pagination->offset	= $offset;
					$item->pagination = $pagination;

				$data[] = $item;

			// subdatum
			// Two resolution strategies depending on whether the component has an
			// explicit request_config in ontology properties.

				if(isset($properties->source->request_config)){

					// request_config path: delegate to the standard portal-style subdatum
					// pipeline which follows the ddo_map defined in ontology to instantiate
					// sub-components for the located records.
					$subdatum = $this->get_subdatum($tipo, $value);

					$ar_subcontext = $subdatum->context;
					foreach ($ar_subcontext as $current_context) {
						$context[] = $current_context;
					}

					$ar_subdata = $subdatum->data;
					foreach ($ar_subdata as $sub_value) {
						$data[] = $sub_value;
					}

				}else{

					// Direct per-locator path: iterate each inverse locator and call
					// get_section_datum_from_locator() to instantiate the foreign section,
					// collect its context and data, then merge both into the running arrays.
					// Each sub-data item's 'parent' is overwritten to $tipo so the client
					// JS instance for this component can identify its owned data rows.
					foreach ($value as $locator) {

						$datum = $this->get_section_datum_from_locator($locator);

						// context become calculated and merged with previous
						$context = array_merge($context, $datum->context);

						$ar_subdata	= $datum->data;
						foreach ($ar_subdata as $sub_value) {
							$sub_value->parent = $tipo;
							$data[] = $sub_value;
						}
					}//end foreach ($value as $locator)

					// update parents (only when parent is into the sqo sections list).
					// To allow client JS to get calculated subdatum, it is necessary to change
					// the parent of each ddo within the request config
					// Background: get_section_datum_from_locator() builds the component's
					// request_config->sqo->section_tipo and ddo_map dynamically from the
					// encountered section types.  The ddo_map entries inherit their 'parent'
					// from the section tipo, but the client needs them parented to the
					// component tipo ($tipo) so the ddo tree is rooted correctly.
					// Only ddo items whose 'parent' is in the section_tipo list are re-parented;
					// deeply nested ddo items that already have a non-section parent are left
					// untouched to preserve sub-tree integrity.
						$found = array_find($context, function($el){
							return $el->tipo===$this->tipo;
						});
						if (is_object($found)) {
							$found_request_config = array_find($found->request_config ?? [], function($el){
								return $el->api_engine==='dedalo';
							});
							if (is_object($found_request_config)) {

								$ar_section_tipo = array_map(function($el){
									return $el->tipo;
								}, $found_request_config->sqo->section_tipo);

								foreach ($found_request_config->show->ddo_map as $current_ddo) {
									// change the ddo parent of the section to the component, only if the parent is the section_tipo
									// is necessary don't change the ddo with deep dependence
									if (in_array($current_ddo->parent, $ar_section_tipo)) {
										$current_ddo->parent = $tipo;
									}
								}
							}
						}
				}
		}//end if (!empty($data_paginated))

		// debug
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}
	}//end if $options->get_data===true && $permissions>0



// JSON string
// Wraps $context and $data in the standard {context, data} envelope and returns
// the object to common::get_json() which forwards it as the API response.
	return common::build_element_json_output($context, $data);
