<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var area_thesaurus $this */
// JSON data controller


/**
 * AREA_THESAURUS JSON CONTROLLER
 * JSON data controller for area_thesaurus (and, by delegation, area_ontology).
 *
 * Execution context:
 *   Included by common::get_json() via include($path) inside the scope of the
 *   calling area_thesaurus (or area_ontology) instance. $this therefore refers
 *   to that instance throughout this file. common::get_json() injects two
 *   variables before the include:
 *     - $options        — stdClass with boolean flags get_context and get_data.
 *     - $request_options — the raw options object received by get_json() from
 *                          the API layer (rarely used directly here).
 *
 * Shared controller:
 *   area_ontology_json.php does nothing but forward execution to this file via
 *   `return include …/area_thesaurus_json.php`. Both areas produce identical
 *   JSON output; the only runtime difference is that when $this->get_model()
 *   returns 'area_ontology' the permission filter is bypassed for global
 *   administrators (see the $hierarchy_sections loop below).
 *
 * Data shape returned (via common::build_element_json_output):
 *   {
 *     context : [ {                        // present when $options->get_context
 *       tipo,
 *       section_tipo,                      // set to $tipo (area tipo acts as section_tipo for SQO preset storage)
 *       thesaurus_mode,                    // 'default' | custom value from properties
 *       … (full structure-context fields from get_structure_context)
 *     } ],
 *     data : [ {                           // present when $options->get_data and permissions > 0
 *       tipo,
 *       value       : hierarchy_section[], // authorised hierarchy objects (see below)
 *       typologies  : typology[],          // deduplicated typology objects, ordered
 *       ts_search?  : search_result        // present when hierarchy_terms or action==='search'
 *     } ]
 *   }
 *
 * hierarchy_section object shape (each element of item->value):
 *   {
 *     section_id, section_tipo, target_section_tipo, target_section_name,
 *     children_tipo, typology_section_id, order, type:'hierarchy',
 *     active_in_thesaurus, root_terms: root_term[]
 *   }
 *
 * typology object shape (each element of item->typologies):
 *   { section_id, type:'typology', label:string, order:int }
 *
 * @see area_ontology_json.php          — thin delegation wrapper.
 * @see class.area_thesaurus.php        — provides all helper methods called here.
 * @see common::get_json()              — includes this file inside $this scope.
 * @see common::build_element_json_output — assembles the final JSON object.
 *
 * @package Dédalo
 * @subpackage Core
 */


/**
 * Note that this controller is shared with area_ontology via 'area_ontology_json.php' file
 */



// configuration vars
	$tipo			= $this->get_tipo();
	$permissions	= common::get_permissions($tipo, $tipo);
	$mode			= $this->get_mode();
	$properties 	= $this->get_properties() ?? new stdClass();



// context
	$context = [];

	if($options->get_context===true){

		// set self from_parent
		// from_parent must match $tipo so that get_structure_context resolves the
		// correct DDO entry for this area (areas are self-referencing parents).
			$this->from_parent = $tipo;

		// Component structure context (tipo, relations, properties, etc.)
			$current_context = $this->get_structure_context(
				$permissions,
				true // bool add_rqo
			);

		// section_tipo. Adaptation of the context with the specific ddo and sqo for used them into the filter.
		// set the section_tipo with the area_tipo, it will be used to store presets of the search (area_tipo will use as section_tipo)
		// (!) Overwriting section_tipo here is intentional: the client stores
		// per-area search presets keyed by section_tipo, so the area tipo must
		// act as the section_tipo to give each area its own preset namespace.
			$current_context->section_tipo = $tipo;

		// thesaurus_mode
		// Propagated to the client so the JS renderer picks the correct display
		// mode ('default' for standard hierarchical browsing; other values select
		// specialised views such as 'model' for ontology modelling workflows).
			$current_context->thesaurus_mode = $properties->thesaurus_mode ?? 'default';


		$context[] = $current_context;

	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		// Resolve hierarchy sections for building root terms
			// Optional filter values from properties
			$hierarchy_types_filter		= $properties->hierarchy_types ?? null;
			$hierarchy_sections_filter	= $properties->hierarchy_sections ?? null;

			// terms_are_model. This value comes from rqo->source->build_options->terms_are_model
			// sent by the client from area_thesaurus when building and self.thesaurus_view_mode==='model'
			// When true, get_hierarchy_sections returns model/template terms instead of
			// regular descriptors, enabling the ontology-modelling view mode.
			$terms_are_model = $this->build_options->terms_are_model ?? false;

			// get hierarchy sections
			$full_hierarchy_sections = $this->get_hierarchy_sections(
				$hierarchy_types_filter, // hierarchy_types_filter
				$hierarchy_sections_filter, // hierarchy_sections_filter
				$terms_are_model // terms_are_model bool
			);
			$hierarchy_sections = [];
			foreach ($full_hierarchy_sections as $hierarchy_data) {

				// area_ontology special case. Full access to global admins. Needed to the full list of search types (dd, rsc, lg, ..)
				// area_ontology runs under the same controller; global admins bypass
				// per-section read permissions so they can browse every ontology branch
				// including internal namespaces (dd, rsc, lg, …).
				if ($this->get_model() === 'area_ontology' && logged_user_is_global_admin()) {
					$hierarchy_sections[] = $hierarchy_data;
					continue;
				}

				// Skip section if target tipo lacks read permission
				// A user may have rights to the area itself (permissions>0 above) but
				// not to every hierarchy section it aggregates; filter those out here.
				if (common::get_permissions(
					$hierarchy_data->target_section_tipo,
					$hierarchy_data->target_section_tipo
				) < 1) {
					continue;
				}

				// Skip hierarchies inactive in thesaurus (not pre-filtered in get_hierarchy_sections)
				// active_in_thesaurus is stored as a property on the hierarchy record.
				// get_hierarchy_sections already skips inactive items for the thesaurus
				// class, but ontology re-uses the same method and may return inactive
				// entries; guard here to be safe.
				if (isset($hierarchy_data->active_in_thesaurus) && $hierarchy_data->active_in_thesaurus === false) {
					continue;
				}

				// Skip hierarchy missing children_tipo required by client for render_root_term
				// children_tipo is looked up by get_hierarchy_sections via
				// section::get_ar_children_tipo_by_model_name_in_section. If the
				// ontology definition is incomplete the lookup returns null, making the
				// hierarchy unusable by the client tree renderer.
				if (empty($hierarchy_data->children_tipo)) {
					debug_log('area_thesaurus controller'
						. " Ignored invalid hierarchy section without children_tipo " . PHP_EOL
						. ' hierarchy_data: ' . to_string($hierarchy_data)
						, logger::ERROR
					);
					continue;
				}

				// Filter out root terms lacking read permission
				// root_terms is an array of locator-like objects with section_tipo and
				// section_id. Each root_term's section_tipo is the term's own section,
				// and access is checked independently from the parent hierarchy section.
				$safe_root_terms = array_values(array_filter(
					$hierarchy_data->root_terms ?? [],
					static function (object $root_data): bool {
						// permissions
						if ( common::get_permissions($root_data->section_tipo, $root_data->section_tipo) < 1 ) {
							return false;
						}
						return true;
					}
				));

				// Skip hierarchy section if no authorized root terms remain
				// A hierarchy with no accessible root terms would render as an empty
				// tree node — misleading to the user — so drop it entirely.
				if (empty($safe_root_terms)) {
					debug_log('area_thesaurus controller'
						. " Ignored invalid hierarchy section without root terms " . PHP_EOL
						. ' hierarchy_data: ' . to_string($hierarchy_data)
						, logger::ERROR
					);
					continue;
				}

				// clone to avoid mutating the original object
				// $hierarchy_data is a reference into the array returned by
				// get_hierarchy_sections; mutating root_terms directly would corrupt
				// any later iteration over the same array.
				$cloned_data = clone $hierarchy_data;
				$cloned_data->root_terms = $safe_root_terms;
				$hierarchy_sections[] = $cloned_data;
			}//end foreach ($full_hierarchy_sections as $hierarchy_data)

		// typologies
		// Build a deduplicated list of typology objects by keying on typology_section_id.
		// Multiple hierarchy sections can share the same typology (e.g. all geographic
		// hierarchies belong to typology 'Geography'); only one typology entry must
		// appear in item->typologies so the client groups them correctly.
			$ar_typologies = [];
			foreach ($hierarchy_sections as $hierarchy_data) {

				if (!isset($ar_typologies[$hierarchy_data->typology_section_id])) {
					// add unique typology to the list
					$typology = new stdClass();
						$typology->section_id	= $hierarchy_data->typology_section_id;
						$typology->type			= 'typology';
						$typology->label		= $this->get_typology_name($hierarchy_data->typology_section_id);
						$typology->order		= $this->get_typology_order($hierarchy_data->typology_section_id);

					$ar_typologies[$hierarchy_data->typology_section_id] = $typology;
				}
			}

		// data item
		// The single data element carries the full hierarchy tree seed (value) and
		// the flat typology index. The client renders typologies as top-level groups
		// then nests the matching hierarchy sections beneath each group.
			$item = new stdClass();
				$item->tipo			= $this->get_tipo();
				$item->value		= $hierarchy_sections;
				$item->typologies	= array_values($ar_typologies);

		// ts_search : hierarchy_terms (search)
		// When properties->hierarchy_terms is set (an array of locator-like objects
		// each with a ->value array of {section_tipo, section_id}), the controller
		// pre-executes a thesaurus search anchored to those specific terms and embeds
		// the result as ts_search. This is used by widgets that initialise with a
		// pre-filtered view (e.g. a relation portal constrained to one branch).
			$hierarchy_terms = $properties->hierarchy_terms ?? null;
			if (!empty($hierarchy_terms)) {
				$sqo	= $this->get_hierarchy_terms_sqo($hierarchy_terms);
				$result	= $this->search_thesaurus( $sqo );
				$item->ts_search = $result;
			}

		// properties
		// When properties->action === 'search' the request comes from
		// dd_core_api:read via get_data (not a normal page render). The client has
		// sent a fully-formed SQO in properties->sqo; execute it and return the
		// tree of matching terms as ts_search.
			if (!empty($properties) && $properties->action==='search') {
				// search rows. Calling from dd_core_api:read -> get_data
				$result = $this->search_thesaurus( $properties->sqo );
				$item->ts_search = $result;
			}

		// subdata add
			$data[] = $item;
	}//end if $options->get_data===true && $permissions>0



// JSON string
// Assembles the standard Dédalo JSON envelope {context:[…], data:[…]} and
// returns it to common::get_json(), which serialises it for the HTTP response.
	return common::build_element_json_output($context, $data);
