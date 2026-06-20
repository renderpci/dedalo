<?php declare(strict_types=1);
/**
 * CLASS TOOL_ONTOLOGY_PARSER
 * Developer-only tool for parsing, exporting, and regenerating Dédalo ontology records.
 *
 * This tool operates as the server-side controller for the ontology-management UI.  It
 * drives three distinct workflows:
 *
 * - Inspection  — get_ontologies() reads every main ontology hierarchy record and resolves
 *   the four key metadata fields (target_section_tipo, TLD, display name, typology) via
 *   runtime component instances, returning a flat list for the browser UI.
 *
 * - Export      — export_ontologies() serialises selected TLDs to JSON files on disk
 *   (via ontology_data_io) so they can be distributed to other Dédalo installations.
 *   The export sequence is strictly ordered: update_ontology_info() → export_ontology_info()
 *   → per-TLD export_to_file() → export_private_lists_to_file() → export_llm_map().
 *   Failing the metadata update aborts the whole run; per-TLD failures are collected
 *   and reported without aborting subsequent TLDs.
 *
 * - Regeneration — regenerate_ontologies() rebuilds the dd_ontology table rows for
 *   chosen TLDs (delegates entirely to ontology::regenerate_records_in_dd_ontology())
 *   and then refreshes the LLM concept map.
 *
 * All three API methods are gated by assert_developer() and are listed in API_ACTIONS
 * so dd_tools_api enforces the allowlist before dispatch.
 *
 * Data shapes:
 * - Each element returned by get_ontologies() is a stdClass with properties:
 *     target_section_tipo (string), tld (string), name (string|null),
 *     typology_id (int|null), typology_name (string|null).
 * - Ontology hierarchy constants used internally:
 *     DEDALO_HIERARCHY_TARGET_SECTION_TIPO = 'hierarchy53' — the matrix section tipo
 *     DEDALO_HIERARCHY_TLD2_TIPO           = 'hierarchy6'  — top-level domain string
 *     DEDALO_HIERARCHY_TERM_TIPO           = 'hierarchy5'  — display name (lang-aware)
 *     DEDALO_HIERARCHY_TYPOLOGY_TIPO       = 'hierarchy9'  — optional typology locator
 *
 * Relationships:
 * - Extends tool_common (tool base providing registration, context, and cache helpers).
 * - Delegates file I/O to ontology_data_io (core/ontology/class.ontology_data_io.php).
 * - Delegates table rebuilds to ontology::regenerate_records_in_dd_ontology().
 * - Resolved through dd_tools_api which enforces API_ACTIONS before calling any method.
 * - Security gate: security::is_developer() via assert_developer() on every public method.
 *
 * @package Dédalo
 * @subpackage Tools
 */
class tool_ontology_parser extends tool_common {



	/**
	 * Explicit allowlist of methods callable through dd_tools_api::tool_request.
	 * SEC-024 (§9.2): any method NOT in this list is unreachable via the API,
	 * regardless of caller-supplied action names.  All three listed methods also
	 * call assert_developer() at entry so a second layer of protection is in place.
	 * @var array<int,string> API_ACTIONS
	 */
	public const API_ACTIONS = [
		'get_ontologies',
		'export_ontologies',
		'regenerate_ontologies'
	];



	/**
	* ASSERT_DEVELOPER
	* Throws permission_exception if the currently logged-in user does not hold
	* developer privileges.
	*
	* Called at the entry of every public API method in this class.  The check
	* is intentionally strict (=== true) because security::is_developer() returns
	* bool, and a falsy non-false value should not bypass the gate.
	*
	* @return void
	* @throws permission_exception If the current user is not a developer/superuser.
	*/
	private static function assert_developer() : void {
		$user_id = logged_user_id();
		if (security::is_developer((int)$user_id) !== true) {
			throw new permission_exception(
				'tool_ontology_parser requires developer privileges',
				__CLASS__
			);
		}
	}//end assert_developer



	/**
	 * GET_ONTOLOGIES
	 * Read every main ontology hierarchy record and resolve its four key metadata
	 * fields into a flat list for the browser UI.
	 *
	 * For each row returned by ontology::get_all_main_ontology_records() this method:
	 *   1. Hydrates a section_record instance so that downstream component calls can
	 *      resolve their data from the already-loaded row (avoids extra DB hits).
	 *   2. Instantiates four transient component objects — one per hierarchy tipo — in
	 *      'list' mode.  These are not persisted; they are used only to call get_value()
	 *      / get_data() on the pre-loaded record.
	 *   3. Skips records where target_section_tipo or tld is empty, appending a
	 *      descriptor to $response->errors so the caller can surface the gaps.
	 *   4. Logs a WARNING (not ERROR) for missing typology because typology is optional.
	 *
	 * Each successful record produces a stdClass with:
	 *   { target_section_tipo, tld, name, typology_id, typology_name }
	 *
	 * Note: DEDALO_DATA_LANG is used for 'name' (multilingual), while DEDALO_DATA_NOLAN
	 * is used for all other fields (language-independent values).
	 *
	 * @return object $response
	 *   ->result  array<int,stdClass> of ontology objects on success, false on failure.
	 *   ->msg     string status message.
	 *   ->errors  array<int,string> of per-record skip reasons (non-fatal).
	 * @throws permission_exception If the caller is not a developer.
	 */
	public static function get_ontologies() : object {

		// SEC-024 (§9.2): developer-only gate.
			self::assert_developer();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		try {
			// main_ontology_records
			// get_all_main_ontology_records() returns a lazy db_result iterator —
			// rows are fetched one at a time, avoiding loading the full table into memory.
			$ontology_records = ontology::get_all_main_ontology_records(); // return a db result iterator

			$ontologies = [];
			foreach ($ontology_records as $row) {

				// section_record
				// Hydrate a section_record with the already-fetched DB row so that
				// component_common::get_instance() can read data from memory rather
				// than issuing an additional DB query per field.
				$section_record = section_record::get_instance( $row->section_tipo, (int)$row->section_id );
				$section_record->set_data($row);

				// target_section_tipo
				// DEDALO_HIERARCHY_TARGET_SECTION_TIPO = 'hierarchy53'.
				// Stores the matrix section tipo that this ontology hierarchy governs
				// (e.g. 'dd0').  A missing value means the node is incomplete; skip it.
					$model = ontology_node::get_model_by_tipo( DEDALO_HIERARCHY_TARGET_SECTION_TIPO );
					$target_section_tipo_component = component_common::get_instance(
						$model, // string model
						DEDALO_HIERARCHY_TARGET_SECTION_TIPO, // string tipo
						$row->section_id, // string section_id
						'list', // string mode
						DEDALO_DATA_NOLAN, // string lang
						$row->section_tipo // string section_tipo
					);
					$target_section_tipo = $target_section_tipo_component->get_value();
					if (empty($target_section_tipo)) {
						debug_log(__METHOD__
							." Skipped hierarchy without target section tipo: $row->section_tipo, $row->section_id "
							, logger::ERROR
						);
						$response->errors[] = "Skipped hierarchy without target section tipo: $row->section_tipo, $row->section_id";
						continue;
					}

				// tld
				// DEDALO_HIERARCHY_TLD2_TIPO = 'hierarchy6'.
				// The top-level domain string (e.g. 'dd') that scopes this ontology's
				// exported JSON file and indexes it in the dd_ontology table.
				// A missing TLD makes export_to_file() impossible; skip the record.
					$model = ontology_node::get_model_by_tipo( DEDALO_HIERARCHY_TLD2_TIPO );
					$tld_component = component_common::get_instance(
						$model, // string model
						DEDALO_HIERARCHY_TLD2_TIPO, // string tipo
						$row->section_id, // string section_id
						'list', // string mode
						DEDALO_DATA_NOLAN, // string lang
						$row->section_tipo // string section_tipo
					);
					$tld = $tld_component->get_value();
					if (empty($tld)) {
						debug_log(__METHOD__
							." Skipped hierarchy without tld: $row->section_tipo, $row->section_id "
							, logger::ERROR
						);
						$response->errors[] = "Skipped hierarchy without tld: $row->section_tipo, $row->section_id ";
						continue;
					}

				// name
				// DEDALO_HIERARCHY_TERM_TIPO = 'hierarchy5'.
				// Human-readable label for this ontology hierarchy.  Uses DEDALO_DATA_LANG
				// (the active application language) rather than NOLAN because the name
				// is a multilingual term displayed in the UI.
					$model = ontology_node::get_model_by_tipo( DEDALO_HIERARCHY_TERM_TIPO );
					$name_component = component_common::get_instance(
						$model, // string model
						DEDALO_HIERARCHY_TERM_TIPO, // string tipo
						$row->section_id, // string section_id
						'list', // string mode
						DEDALO_DATA_LANG, // string lang
						$row->section_tipo // string section_tipo
					);
					$name = $name_component->get_value();

				// typology
				// DEDALO_HIERARCHY_TYPOLOGY_TIPO = 'hierarchy9'.
				// Optional classification type stored as a relation locator.
				// get_data()[0] yields the first linked record object; section_id on
				// that object is cast to int for typology_id.  A missing typology is
				// a WARNING, not an error — the record is still included in the output.
					$model = ontology_node::get_model_by_tipo( DEDALO_HIERARCHY_TYPOLOGY_TIPO );

					$typology_component = component_common::get_instance(
						$model, // string model
						DEDALO_HIERARCHY_TYPOLOGY_TIPO, // string tipo
						$row->section_id, // string section_id
						'list', // string mode
						DEDALO_DATA_NOLAN, // string lang
						$row->section_tipo // string section_tipo
					);

					$typology_data = $typology_component->get_data()[0] ?? null;
					if (empty($typology_data)) {
						debug_log(__METHOD__
							." Hierarchy without typology: $row->section_tipo, $row->section_id "
							, logger::WARNING
						);
					}
					$typology_id = ( !empty($typology_data) )
						? (int)$typology_data->section_id
						: null;

				// typology name
				// get_value() on the same $typology_component returns the resolved
				// label string of the linked typology record (or null when unset).
					$typology_name = $typology_component->get_value();

				// store ontology resolution
				// Build the flat descriptor object that the browser UI consumes.
					$current_ontology = new stdClass();
						$current_ontology->target_section_tipo	= $target_section_tipo;
						$current_ontology->tld					= $tld;
						$current_ontology->name					= $name;
						$current_ontology->typology_id			= $typology_id;
						$current_ontology->typology_name		= $typology_name;

					$ontologies[] = $current_ontology;
			}//end foreach ($ontology_records as $row)

			// response
				$response->result	= $ontologies;
				$response->msg		= 'OK. Request done';

		} catch (Exception $e) {
			$response->result	= false;
			$response->msg		= 'Error. ' . $e->getMessage();
			$response->errors[]	= $e->getMessage();

			debug_log(__METHOD__
				. ' Exception: ' . $e->getMessage()
				, logger::ERROR
			);
		}

		return $response;
	}//end get_ontologies


	/**
	 * EXPORT_ONTOLOGIES
	 * Serialise selected ontology TLDs to JSON distribution files.
	 *
	 * The export sequence is strictly ordered and has two hard-abort steps:
	 *   1. ontology_data_io::update_ontology_info() — stamps the current timestamp
	 *      and version into the dd1 properties record (ontology40_1).  Returns false
	 *      on DB failure; method returns early without writing any files.
	 *   2. ontology_data_io::export_ontology_info() — writes the ontology.json
	 *      metadata file that accompanies every per-TLD file.  Returns early on failure.
	 *   3. Per-TLD loop — ontology_data_io::export_to_file($tld) for each selected TLD.
	 *      Individual TLD failures are recorded in $response->errors but do not abort
	 *      the remaining TLDs.  $done counts successful exports.
	 *   4. ontology_data_io::export_private_lists_to_file() — exports the 'matrix_dd'
	 *      private list (always runs regardless of per-TLD errors).
	 *   5. ontology_data_io::export_llm_map() — regenerates the flat LLM concept map
	 *      used by agent/MCP tooling.
	 *
	 * $response->result is true only when $response->errors is empty after the full run.
	 * $response->ar_msg accumulates the human-readable status string from every sub-call
	 * so the browser can display a per-step progress log.
	 *
	 * @param object $options
	 *   ->selected_ontologies  array<int,string>  TLD strings to export (e.g. ['dd','rda']).
	 * @return object $response
	 *   ->result   bool   true if no errors, false otherwise.
	 *   ->msg      string overall status message.
	 *   ->errors   array<int,string> accumulated error descriptions.
	 *   ->ar_msg   array<int,string> per-step messages from ontology_data_io calls.
	 * @throws permission_exception If the caller is not a developer.
	 */
	public static function export_ontologies(object $options) : object {

		// SEC-024 (§9.2): developer-only gate.
			self::assert_developer();

		// options
			$selected_ontologies = $options->selected_ontologies ?? [];

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];
			$response->ar_msg	= [];

		try {
			// Validate input
			// Guard against a client sending null or a non-array value.
			// An empty array would write only the metadata file — not useful.
			if (empty($selected_ontologies) || !is_array($selected_ontologies)) {
				$response->msg		= 'Error. Invalid or empty selected_ontologies parameter';
				$response->errors[]	= 'selected_ontologies must be a non-empty array';
				return $response;
			}

			// Set the current time and version of the exported process
			// It is saved in properties component id dd1 (ontology40_1)
			// (!) Must run before export_ontology_info() which reads the value just written.
			$result = ontology_data_io::update_ontology_info();
			if (!$result) {
				$response->errors[] = 'unable to update_ontology_info';
				$response->msg = 'Unable to update ontology information in dd1 (ontology40_1)';
				return $response;
			}

			// Export the ontology information into a ontology.json file
			// This shared metadata file must exist before any per-TLD file is written.
			$ontology_info_response = ontology_data_io::export_ontology_info();
			if (!$ontology_info_response->result) {
				$response->errors[] = 'unable to export ontology info JSON file';
				$response->msg = 'Unable to export the ontology information JSON file';
				return $response;
			}

			$done = 0;
			$ar_msg = [];
			foreach ($selected_ontologies as $tld) {

				// Process ontology node/s and change dd_ontology rows
				// export_to_file() reads dd_ontology rows for $tld, serialises them
				// to a JSON file at the configured ontology export path, and returns
				// a response object.  On failure the loop continues to the next TLD.
				$ontology_response = ontology_data_io::export_to_file( $tld );

				// Save all export messages
				$ar_msg[] = $ontology_response->msg;

				// Handle errors
				if( $ontology_response->result === false ){
					$response->errors = array_merge( $response->errors, $ontology_response->errors ?? [] );
					continue;
				}

				$done++;
			}

			// Process private list of matrix_dd node/s and change dd_ontology rows
			// Private lists (internal Dédalo types) are always exported regardless
			// of which TLDs were selected; they live in a separate file.
				$private_list_response = ontology_data_io::export_private_lists_to_file();

				// Save all export messages
				$ar_msg[] = $private_list_response->msg;

				// Handle errors
				if( $private_list_response->result === false ){
					$response->errors = array_merge( $response->errors, $private_list_response->errors ?? [] );
				}

			// Export LLM map for agent/MCP use
			// The LLM concept map is derived from the freshly exported ontology content;
			// it must be regenerated here so it stays in sync with the new files.
				$llm_map_response = ontology_data_io::export_llm_map();
				$ar_msg[] = $llm_map_response->msg;
				if (!$llm_map_response->result) {
					$response->errors = array_merge($response->errors, $llm_map_response->errors ?? []);
				}

			// response
			// result is true only when the errors array is still empty — any sub-call
			// failure (per-TLD or private list) keeps result false.
				$response->result	= empty($response->errors);
				$response->msg		= $response->result
					? 'OK. Export of ontologies completed successfully. Done: '.$done
					: 'Errors found. Export Ontologies request failed.';
				$response->ar_msg = $ar_msg;

		} catch (Exception $e) {
			$response->result	= false;
			$response->msg		= 'Error. ' . $e->getMessage();
			$response->errors[]	= $e->getMessage();

			debug_log(__METHOD__
				. ' Exception: ' . $e->getMessage()
				, logger::ERROR
			);
		}

		return $response;
	}//end export_ontologies


	/**
	 * REGENERATE_ONTOLOGIES
	 * Rebuild dd_ontology table rows for selected TLDs and refresh the LLM map.
	 *
	 * Delegates the table rebuild entirely to ontology::regenerate_records_in_dd_ontology(),
	 * which re-walks the hierarchy nodes for each supplied TLD and writes fresh rows into
	 * the dd_ontology table.  This is the right action after structural ontology edits
	 * (adding nodes, changing tipos) when the JSON files do not need to be re-exported.
	 *
	 * After regeneration the LLM concept map is rebuilt via ontology_data_io::export_llm_map()
	 * because the map is derived from dd_ontology content.  Any LLM map errors are merged
	 * into the response from regenerate_records_in_dd_ontology() rather than replacing it.
	 *
	 * @param object $options
	 *   ->selected_ontologies  array<int,string>  TLD strings to regenerate (e.g. ['dd']).
	 * @return object $response
	 *   ->result  bool   true on success, false on failure.
	 *   ->msg     string status message from ontology::regenerate_records_in_dd_ontology().
	 *   ->errors  array<int,string> accumulated errors (regeneration + LLM map).
	 * @throws permission_exception If the caller is not a developer.
	 */
	public static function regenerate_ontologies(object $options) : object {

		// SEC-024 (§9.2): developer-only gate.
			self::assert_developer();

		// options
			$selected_ontologies = $options->selected_ontologies ?? [];

		// response
		// The full response object (result, msg, errors) comes from the delegate;
		// this method only appends potential LLM map errors on top.
			$response = ontology::regenerate_records_in_dd_ontology( $selected_ontologies );

		// Rebuild LLM map after ontology regeneration
		// The map reflects the current state of dd_ontology; it must be refreshed
		// whenever the table is rebuilt, even if $response->result is false (partial
		// regeneration may still yield usable rows the map can read).
			$llm_map_response = ontology_data_io::export_llm_map();
			if (!$llm_map_response->result) {
				$response->errors = array_merge($response->errors ?? [], $llm_map_response->errors ?? []);
			}

		return $response;
	}//end regenerate_ontologies

}//end class tool_ontology_parser
