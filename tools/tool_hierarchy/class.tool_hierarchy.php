<?php declare(strict_types=1);
/**
 * CLASS TOOL_HIERARCHY
 * Manages custom ontology and hierarchy generation for Dédalo
 *
 * This tool helps generate new custom ontologies by creating virtual sections
 * from existing sections. It handles the creation of hierarchy structures,
 * thesaurus terms, and ontology elements needed for hierarchical data organization.
 *
 * Key features:
 * - Virtual section generation from real sections
 * - Automatic hierarchy element creation (ontology, dd_ontology)
 * - Thesaurus general term creation
 * - Cache management for menu updates
 * - Optional force recreation of existing hierarchies
 *
 * @package Dedalo
 * @subpackage Tools
 */
class tool_hierarchy extends tool_common {



	/**
	 * GENERATE_VIRTUAL_SECTION
	 * Generates a new virtual section from a real section with hierarchy support
	 *
	 * This method:
	 * 1. Validates required parameters (section_id, section_tipo)
	 * 2. Optionally deletes existing hierarchy if force_to_create is true
	 * 3. Generates virtual section with hierarchy elements
	 * 4. Creates thesaurus general terms (hierarchy45, hierarchy59)
	 * 5. Clears cache to update menu
	 *
	 * The virtual section includes all necessary ontology elements to support
	 * hierarchical data organization and thesaurus functionality.
	 *
	 * @param object $options Configuration object with:
	 *   - section_id: int Section ID to generate hierarchy from - REQUIRED
	 *   - section_tipo: string Section tipo identifier - REQUIRED
	 *   - force_to_create: bool Whether to delete existing hierarchy first (default: false)
	 *
	 * @return object Response object with:
	 *   - result: bool Success status
	 *   - msg: string Status message
	 *   - errors: array Error messages if any
	 *   - created_general_term: mixed Result of general term creation (hierarchy45)
	 *   - created_general_term_model: mixed Result of general term model creation (hierarchy59)
	 *
	 * @throws Exception If hierarchy generation or term creation fails
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
				debug_log(__METHOD__
					. " Missing required parameters" . PHP_EOL
					. " section_id: " . to_string($section_id) . PHP_EOL
					. " section_tipo: " . to_string($section_tipo)
					, logger::ERROR
				);
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

		// create a new virtual section from real. This build the new hierarchy elements needed to run (ontology, dd_ontology, etc.)
			$hierarchy_response = hierarchy::generate_virtual_section((object)[
				'section_id'	=> $section_id,
				'section_tipo'	=> $section_tipo
			]);
			if (!empty($hierarchy_response->errors)) {
				$response->errors = array_merge($response->errors, $hierarchy_response->errors);
			}

		// Create the target section if not already exists.
		// If is not created, the thesaurus view do not display nothing (no hierarchy root nodes are visualized now)
		// 'hierarchy45' is the tipo for "General term" - the root node for thesaurus hierarchies
			$created_general_term = hierarchy::create_thesaurus_general_term( $section_tipo, $section_id, 'hierarchy45' );

		// Same for model
		// 'hierarchy59' is the tipo for "General term model" - defines the model structure for thesaurus terms
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
