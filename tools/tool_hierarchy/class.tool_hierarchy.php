<?php
/**
* CLASS TOOL_HIERARCHY
* Help to generate new custom Ontologies
*
*/
class tool_hierarchy extends tool_common {



	/**
	* GENERATE_VIRTUAL_SECTION
	* Exec a custom action called from client
	* @param object $options
	* @return object $response
	*/
	public static function generate_virtual_section(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options
			$section_id			= $options->section_id ?? null;
			$section_tipo		= $options->section_tipo ?? null;
			$force_to_create	= $options->force_to_create ?? false;

		// validate vars
			if (empty($section_id) || empty($section_tipo)) {
				$response->errors[] = 'Missing section_id or section_tipo.';
				return $response;
			}

		// check if is necessary to delete the previous ontology terms before added new ones
			if($force_to_create===true){
				$delete_response = hierarchy::delete_main((object)[
					'section_id'	=> $section_id,
					'section_tipo'	=> $section_tipo
				]);
				if (!empty($delete_response->errors)) {
					$response->errors = array_merge($response->errors, $delete_response->errors);
				}
			}

		// create a new virtual section from real. This build the new hierarchy elements needed to run (ontology, jer_dd, etc.)
			$hierarchy_response = hierarchy::generate_virtual_section((object)[
				'section_id'	=> $section_id,
				'section_tipo'	=> $section_tipo
			]);
			if (!empty($hierarchy_response->errors)) {
				$response->errors = array_merge($response->errors, $hierarchy_response->errors);
			}

		// Create the target section if not already exists.
		// If is not created, the thesaurus view do not display nothing (no hierarchy root nodes are visualized now)
		// 'hierarchy45' for General term
			$created_general_term = hierarchy::create_thesaurus_general_term( $section_tipo, $section_id, 'hierarchy45' );

		// Same for model
		// 'hierarchy59' for General term model
			$created_general_term_model = hierarchy::create_thesaurus_general_term( $section_tipo, $section_id, 'hierarchy59' );

		// delete previous cache files (forces update menu)
			dd_cache::delete_cache_files();

		// response
			$response->result						= $hierarchy_response->result;
			$response->created_general_term			= $created_general_term;
			$response->created_general_term_model	= $created_general_term_model;
			$response->msg							= $hierarchy_response->msg ;


		return $response;
	}//end generate_virtual_section



}//end class tool_hierarchy
