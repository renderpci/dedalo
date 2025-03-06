<?php
// JSON data controller



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

		// hierarchy_sections - get the hierarchy configuration nodes to build the root terms
			// properties optional values
			$hierarchy_types_filter		= $properties->hierarchy_types ?? null;
			$hierarchy_sections_filter	= $properties->hierarchy_sections ?? null;

			// terms_are_model. This value comes from rqo->source->build_options->terms_are_model
			// sent by the client from area_thesaurus when building and self.thesaurus_view_mode==='model'
			$terms_are_model = $this->build_options->terms_are_model ?? false;

			$hierarchy_sections = $this->get_hierarchy_sections(
				$hierarchy_types_filter, // hierarchy_types_filter
				$hierarchy_sections_filter, // hierarchy_sections_filter
				$terms_are_model // terms_are_model bool
			);

		// typologies
			$ar_tipologies_section_id = [];
			$ar_typologies = [];
			foreach ($hierarchy_sections as $hierarchy_data) {

				// remove the typology of hierarchies that are not active to show it in thesaurus tree
				if( isset($hierarchy_data->active_in_thesaurus) && $hierarchy_data->active_in_thesaurus === false ){
					continue;
				}

				if (!in_array($hierarchy_data->typology_section_id, $ar_tipologies_section_id)) {
					$ar_tipologies_section_id[] = $hierarchy_data->typology_section_id;
					$typology = new stdClass();
						$typology->section_id	= $hierarchy_data->typology_section_id;
						$typology->type			= 'typology';
						$typology->label		= $this->get_typology_name($hierarchy_data->typology_section_id);
						$typology->order		= $this->get_typology_order($hierarchy_data->typology_section_id);

					$ar_typologies[] = $typology;
				}
			}

		$item = new stdClass();
			$item->tipo			= $this->get_tipo();
			$item->value		= $hierarchy_sections;
			$item->typologies	= $ar_typologies;

		// ts_search : hierarchy_terms (search)
			$hierarchy_terms = $properties->hierarchy_terms ?? null;
			if(!empty($hierarchy_terms)) {
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
