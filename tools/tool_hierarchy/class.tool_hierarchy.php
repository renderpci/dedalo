<?php declare(strict_types=1);
/**
* CLASS TOOL_HIERARCHY
* Section-toolbar tool that provisions a new thesaurus hierarchy from an existing
* hierarchy1 configuration record.
*
* A "hierarchy" in Dédalo is a named controlled vocabulary (e.g. a thematic
* thesaurus, a toponymy list) whose master record lives in 'matrix_hierarchy_main'
* (section_tipo = 'hierarchy1'). Before a hierarchy can be used for descriptor
* entry, two virtual sections must exist in the ontology:
*
*   <tld>1  — descriptor section (actual terms: "Valencia", "Amphora", …)
*   <tld>2  — model/typology section (disambiguating values: "City", "Type", …)
*
* This tool exposes a single API action — generate_virtual_section — which:
*   1. Delegates the heavy ontology work to hierarchy::generate_virtual_section()
*      (which reads the TLD from hierarchy6, the real source section from hierarchy109,
*      and writes the virtual-section nodes into the dd_ontology table).
*   2. Seeds the two portal root nodes ('hierarchy45' General Term and 'hierarchy59'
*      General Term Model) so the thesaurus tree view shows the hierarchy root
*      immediately after generation.
*   3. Purges the global menu cache so the new hierarchy appears in the UI without
*      a manual reload.
*
* Relationships:
*   - Extends tool_common (inherits registration, context, cache helpers).
*   - Delegates ontology/virtual-section work to hierarchy (core/hierarchy/class.hierarchy.php).
*   - Delegates the pre-existence teardown to ontology::delete_main() (inherited by hierarchy).
*   - Delegates cache invalidation to dd_cache::delete_cache_files().
*   - Security gate: security::assert_section_permission() (write level ≥ 2 required).
*
* @package Dédalo
* @subpackage Tools
*/
class tool_hierarchy extends tool_common {



	/**
	* SEC-024 (§9.2): explicit allowlist of methods callable via
	* `dd_tools_api::tool_request`.
	*
	* Only methods listed here can be dispatched from the browser. The tool
	* framework enforces this in tool_security before any method is invoked,
	* so omitting a method name is a sufficient access-control barrier.
	*
	* 'generate_virtual_section' is the single write action exposed by this tool;
	* read-only queries (e.g. status checks) do not need to be listed because they
	* are handled client-side or by core API endpoints.
	*/
	public const API_ACTIONS = [
		'generate_virtual_section'
	];



	/**
	* GENERATE_VIRTUAL_SECTION
	* Provisions a complete hierarchy structure for the given hierarchy1 record,
	* creating virtual ontology sections, seeding the thesaurus portal root nodes,
	* and clearing the menu cache.
	*
	* Execution flow:
	*   1. Validate that section_id and section_tipo are present.
	*   2. Assert write permission (≥ 2) on section_tipo via the security gate.
	*   3. If force_to_create is true, tear down any pre-existing virtual sections
	*      (ontology::delete_main) so they can be rebuilt cleanly. Errors from the
	*      delete step are collected but do not abort execution.
	*   4. Call hierarchy::generate_virtual_section() to write the dd_ontology rows
	*      for the <tld>1 (term) and <tld>2 (model) virtual sections.
	*   5. Create the 'hierarchy45' General Term portal root node on the new
	*      descriptor section via hierarchy::create_thesaurus_general_term().
	*      Returns false (silently) if the root already exists; the result is
	*      forwarded in the response for the caller's information.
	*   6. Create the 'hierarchy59' General Term Model portal root node in the
	*      same way for the typology/model section.
	*   7. Delete all global cache files so the navigation menu reflects the new
	*      hierarchy without requiring a server restart.
	*
	* The response result and msg come from step 4 (hierarchy::generate_virtual_section).
	* Errors from any step are accumulated in response->errors, but only a failure
	* in the validation or security gate causes an early return.
	*
	* @param object $options {
	*   @type int    $section_id      Row ID of the hierarchy1 master record. REQUIRED.
	*   @type string $section_tipo    Section tipo of the master record, expected 'hierarchy1'. REQUIRED.
	*   @type bool   $force_to_create When true, deletes any pre-existing virtual sections
	*                                 before generating. Defaults to false.
	* }
	* @return object {
	*   @type bool   $result                     True on successful generation; false on validation failure
	*                                            or if hierarchy::generate_virtual_section() fails.
	*   @type string $msg                        Human-readable outcome message forwarded from
	*                                            hierarchy::generate_virtual_section().
	*   @type array  $errors                     Accumulated error strings from all steps.
	*   @type bool   $created_general_term       Return value of create_thesaurus_general_term()
	*                                            for 'hierarchy45'. True = created, false = already
	*                                            existed or an error occurred.
	*   @type bool   $created_general_term_model Return value of create_thesaurus_general_term()
	*                                            for 'hierarchy59'.
	* }
	* @throws permission_exception If the caller lacks write (≥ 2) permission on $options->section_tipo.
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

		// SEC-024 (§9.2): WRITE gate. generate_virtual_section creates a new
		// virtual section + thesaurus general terms. This is a structural
		// privilege; require write (>=2) on the source section_tipo.
			security::assert_section_permission($section_tipo, 2, __METHOD__);

		// Teardown existing virtual sections before rebuild
		// When force_to_create is set, delete the prior virtual sections (ontology rows
		// keyed by the hierarchy's TLD) so generate_virtual_section() starts from a
		// clean slate. Errors are accumulated but do not block the generation step —
		// a partially-deleted state is recoverable by re-running.
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
