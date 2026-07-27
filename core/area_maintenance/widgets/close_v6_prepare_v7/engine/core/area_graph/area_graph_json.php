<?php declare(strict_types=1);
/**
* AREA_GRAPH_JSON
* JSON data controller for the area_graph element.
*
* This file is the model-specific JSON controller included by common::get_json()
* via a PHP include() call. It executes in the calling object's scope, which means:
*   - $this    => the area_graph instance that called get_json()
*   - $options => a stdClass created by common::get_json() from $request_options,
*                 with boolean flags: get_context, get_data, get_request_config.
*
* Responsibilities:
*   - Build the CONTEXT block when $options->get_context is true:
*       standard structure context + graph-specific extras (section_tipo override,
*       graph_mode property).
*   - Build the DATA block when $options->get_data is true and the caller has
*       permissions > 0:
*       1. Resolve which hierarchy sections are active and pass filter constraints.
*       2. Deduplicate typology groups from those sections.
*       3. Assemble the flat $value array: typologies first, then hierarchy items.
*       4. Optionally attach a thesaurus search result ($item->ts_search) when either
*          $properties->hierarchy_terms or $properties->action === 'search' is present.
*   - Return the standard envelope via common::build_element_json_output($context, $data).
*
* Data shape returned:
*   {
*     context: [ area_graph_context_object ],  // if get_context===true
*     data:    [ {                             // if get_data===true && permissions>0
*       tipo:      string,                     // area_graph tipo
*       value:     array<typology|hierarchy>,  // typology nodes + hierarchy section nodes
*       ts_search: object|undefined            // thesaurus search result when applicable
*     } ]
*   }
*
* $value array item shapes:
*   Typology  : { section_id, type:'typology', label:string, order:int }
*   Hierarchy : { section_id, section_tipo, target_section_tipo, target_section_name,
*                 typology_section_id, order:int, type:'hierarchy', children_tipo:string }
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
/** @var area_graph $this */
// JSON data controller



// configuration vars
	$tipo			= $this->get_tipo();
	$permissions	= common::get_permissions($tipo, $tipo);
	$mode			= $this->get_mode();
	$properties		= $this->get_properties() ?? new stdClass();


// context
	$context = [];


	if($options->get_context===true){

		// set self from_parent
		// The area_graph reports itself as its own parent so that the structure
		// context resolver can find its own ddo/sqo configuration.
			$this->from_parent = $tipo;

		// Component structure context (tipo, relations, properties, etc.)
		// add_rqo=true includes the request_config / rqo in the context, needed
		// by the client to know how to request subsequent data refreshes.
			$current_context = $this->get_structure_context(
				$permissions,
				true // bool add_rqo
			);

		// section_tipo. Adaptation of the context with the specific ddo and sqo for used them into the filter.
		// set the section_tipo with the area_tipo, it will be used to store presets of the search (area_tipo will use as section_tipo)
		// Override: area_graph uses its own tipo as section_tipo so that search
		// presets saved from this area are scoped to the area, not a shared section.
			$current_context->section_tipo = $tipo;

		// graph_mode
		// Propagates the display variant from area properties to the client context
		// so render_area_graph.js can switch between graph modes without a round-trip.
		// Falls back to 'default' when no explicit mode is configured.
			$current_context->graph_mode = $properties->graph_mode ?? 'default';


		$context[] = $current_context;

	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		// hierarchy_sections - get the hierarchy configuration nodes to build the root terms
		// $properties->hierarchy_types    : array of typology section_ids  — when set, only
		//                                   hierarchies belonging to those typologies are returned.
		// $properties->hierarchy_sections : array of target section tipos  — when set, only
		//                                   hierarchies whose target section_tipo matches are returned.
		// $terms_are_model                : when true, the hierarchy children/target constants
		//                                   resolve to the 'model' variants (context-model terms),
		//                                   not descriptor terms. Sourced from build_options set by
		//                                   the client JS (area_graph.build_options.terms_are_model).
			$hierarchy_types_filter		= $properties->hierarchy_types ?? null;
			$hierarchy_sections_filter	= $properties->hierarchy_sections ?? null;
			$terms_are_model			= $this->build_options->terms_are_model ?? false;
			$hierarchy_sections			= $this->get_hierarchy_sections(
				$hierarchy_types_filter, // hierarchy_types_filter
				$hierarchy_sections_filter, // hierarchy_sections_filter
				$terms_are_model // terms_are_model bool
			); // $this->get_data_items();

		// typologies
		// Each hierarchy section belongs to one typology (a grouping concept).
		// Multiple hierarchies can share the same typology_section_id, so we
		// deduplicate: we build one typology node per distinct typology_section_id
		// and prepend all typology nodes to $value so the client can render group headers.
			$ar_typologies_section_id	= [];
			$ar_typologies				= [];
			foreach ($hierarchy_sections as $hierarchy_data) {
				if (!in_array($hierarchy_data->typology_section_id, $ar_typologies_section_id)) {
					$ar_typologies_section_id[] = $hierarchy_data->typology_section_id;
					$typology = new stdClass();
						$typology->section_id	= $hierarchy_data->typology_section_id;
						$typology->type			= 'typology';
						$typology->label		= $this->get_typology_name($hierarchy_data->typology_section_id);
						$typology->order		= $this->get_typology_order($hierarchy_data->typology_section_id);

					$ar_typologies[] = $typology;
				}
			}

		// value. Vertical array with typologies and sections
		// The merged flat array is the canonical data payload. The client uses
		// the 'type' discriminator ('typology' vs 'hierarchy') to render group
		// headers and hierarchy nodes within those groups.
			$value = array_merge($ar_typologies, $hierarchy_sections);

		// item
		// Single data item: the area itself is the envelope (tipo), and $value
		// carries the entire graph dataset.
			$item = new stdClass();
				$item->tipo		= $this->get_tipo();
				$item->value	= $value;

			// hierarchy_terms
			// When the client has pre-selected hierarchy terms (stored in properties),
			// resolve those terms into a thesaurus search result and attach it to
			// $item->ts_search. This drives the graph's initial "focused" view.
				$hierarchy_terms = $properties->hierarchy_terms ?? null;
				if(!empty($hierarchy_terms)) {
					$sqo	= $this->get_hierarchy_terms_sqo($hierarchy_terms);
					$result	= $this->search_thesaurus( $sqo );
					// add ts_search
					$item->ts_search = $result;
				}

			// properties
			// When the client explicitly triggers a thesaurus search (action='search'),
			// the pre-built SQO from properties->sqo is used directly.
			// (!) This branch overwrites any ts_search set by the hierarchy_terms branch above
			// when both conditions are true simultaneously, because $item->ts_search is
			// re-assigned rather than merged.
				if (!empty($properties) && $properties->action==='search') {
					// search rows
					$result = $this->search_thesaurus( $properties->sqo );
					// add ts_search
					$item->ts_search = $result;
				}

		// subdata add
			$data[] = $item;
	}//end if $permissions > 0




// JSON string
// Wraps $context and $data into the standard {context, data} envelope returned
// by every Dédalo JSON controller and consumed by the client data_manager.
	return common::build_element_json_output($context, $data);
