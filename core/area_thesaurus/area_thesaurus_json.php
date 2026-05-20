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
			$this->from_parent = $tipo;

		// Component structure context (tipo, relations, properties, etc.)
			$current_context = $this->get_structure_context(
				$permissions,
				true // bool add_rqo
			);

		// section_tipo. Adaptation of the context with the specific ddo and sqo for used them into the filter.
		// set the section_tipo with the area_tipo, it will be used to store presets of the search (area_tipo will use as section_tipo)
			$current_context->section_tipo = $tipo;

		// thesaurus_mode
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
				if ($this->get_model() === 'area_ontology' && logged_user_is_global_admin()) {
					$hierarchy_sections[] = $hierarchy_data;
					continue;
				}

				// Skip section if target tipo lacks read permission
				if (common::get_permissions(
					$hierarchy_data->target_section_tipo,
					$hierarchy_data->target_section_tipo
				) < 1) {
					continue;
				}

				// Skip hierarchies inactive in thesaurus (not pre-filtered in get_hierarchy_sections)
				if (isset($hierarchy_data->active_in_thesaurus) && $hierarchy_data->active_in_thesaurus === false) {
					continue;
				}

				// Skip hierarchy missing children_tipo required by client for render_root_term
				if (empty($hierarchy_data->children_tipo)) {
					debug_log('area_thesaurus controller'
						. " Ignored invalid hierarchy section without children_tipo " . PHP_EOL
						. ' hierarchy_data: ' . to_string($hierarchy_data)
						, logger::ERROR
					);
					continue;
				}

				// Filter out root terms lacking read permission
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
				if (empty($safe_root_terms)) {
					debug_log('area_thesaurus controller'
						. " Ignored invalid hierarchy section without root terms " . PHP_EOL
						. ' hierarchy_data: ' . to_string($hierarchy_data)
						, logger::ERROR
					);
					continue;
				}

				// clone to avoid mutating the original object
				$cloned_data = clone $hierarchy_data;
				$cloned_data->root_terms = $safe_root_terms;
				$hierarchy_sections[] = $cloned_data;
			}//end foreach ($full_hierarchy_sections as $hierarchy_data)

		// typologies
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
			$item = new stdClass();
				$item->tipo			= $this->get_tipo();
				$item->value		= $hierarchy_sections;
				$item->typologies	= array_values($ar_typologies);

		// ts_search : hierarchy_terms (search)
			$hierarchy_terms = $properties->hierarchy_terms ?? null;
			if (!empty($hierarchy_terms)) {
				$sqo	= $this->get_hierarchy_terms_sqo($hierarchy_terms);
				$result	= $this->search_thesaurus( $sqo );
				$item->ts_search = $result;
			}

		// properties
			if (!empty($properties) && $properties->action==='search') {
				// search rows. Calling from dd_core_api:read -> get_data
				$result = $this->search_thesaurus( $properties->sqo );
				$item->ts_search = $result;
			}

		// subdata add
			$data[] = $item;
	}//end if $options->get_data===true && $permissions>0



// JSON string
	return common::build_element_json_output($context, $data);
