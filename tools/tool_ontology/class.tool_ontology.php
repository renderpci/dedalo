<?php declare(strict_types=1);
/**
* CLASS TOOL_ONTOLOGY
* Privileged developer tool that syncs ontology section records into the
* dd_ontology flat-lookup table.
*
* Responsibilities:
* - Accept a trigger (single record in edit mode, or all records matching the
*   current session SQO in list mode) and delegate the actual write work to
*   ontology::set_records_in_dd_ontology().
* - Enforce developer-only access before any state is touched.
* - Invalidate the session active-elements cache after a successful write so
*   that the next thesaurus tree load reflects the updated ontology.
*
* Architecture notes:
* - Extends tool_common, which provides the registry context (affected_tipos,
*   labels, properties) and the tool_request dispatch surface.
* - Exposes exactly one remotely callable method: set_records_in_dd_ontology.
*   All other tool_common lifecycle hooks (is_available, on_register, on_remove)
*   are inherited and intentionally excluded from API_ACTIONS so the framework
*   cannot route HTTP calls to them.
* - The declarative API_ACTIONS list (array form, not map form) combined with
*   the imperative assert_developer() guard provides defence-in-depth: the
*   framework gate runs first; the inner gate fires even if the constant is
*   bypassed in a test context.
*
* Data shape managed:
* - dd_ontology table rows — one row per ontology node (tipo, term_id, parent,
*   labels, typology, TLD prefix).  Written exclusively by the ontology layer;
*   this tool is the only authorised entry point from the UI.
*
* Relationships:
* - Extends tool_common (tools/tool_common/class.tool_common.php).
* - Delegates writes to ontology::set_records_in_dd_ontology() (core/ontology/).
* - Reads session SQO from $_SESSION['dedalo']['config']['sqo'][$sqo_id], where
*   $sqo_id is built by section::build_sqo_id($section_tipo).
* - Uses security::is_developer() to verify the calling user.
* - Affected tipos declared in register.json dd1350:
*     ['ontology35', '/^(?!localontology0)[a-z]+0$/'] — main ontology section
*     and all non-local matrix ontology sections.
*
* @package Dédalo
* @subpackage Ontology
*/
class tool_ontology extends tool_common {



	/**
	* Explicit allowlist of methods callable via dd_tools_api::tool_request.
	*
	* Using the array (list) form rather than the map form means there is no
	* declarative permission spec: the framework allows dispatch for any
	* authenticated user who reaches this point, and the imperative
	* assert_developer() call inside the method provides the actual access gate.
	*
	* (!) Lifecycle hooks (is_available, on_register, on_remove) must NEVER be
	* added here — listing them would expose them to remote HTTP dispatch.
	*
	* SEC-024 (§9.2): tools without API_ACTIONS are refused at dispatch when
	* TOOLS_REQUIRE_API_ACTIONS is true (the default).
	*
	* @var array<string> API_ACTIONS
	*/
	public const API_ACTIONS = [
		'set_records_in_dd_ontology'
	];



	/**
	* ASSERT_DEVELOPER
	* Verifies that the currently logged-in user holds developer privileges and
	* throws permission_exception if they do not.
	*
	* Called as the very first statement in every public API method to ensure
	* that no privileged ontology mutation can proceed regardless of how the
	* method was reached.  tool_ontology mutates dd_ontology rows that drive the
	* entire runtime data model (tipo resolution, section availability, diffusion
	* targets), so the risk of an unprivileged write is high.
	*
	* security::is_developer() checks $_SESSION['dedalo']['auth']['is_developer']
	* first (fast path) and falls back to a database query when the session flag
	* is absent.
	*
	* @return void
	* @throws permission_exception - always thrown when the user is not a developer
	*/
	private static function assert_developer() : void {
		$user_id = logged_user_id();
		if (security::is_developer((int)$user_id) !== true) {
			throw new permission_exception(
				'tool_ontology requires developer privileges',
				__CLASS__
			);
		}
	}//end assert_developer



	/**
	* SET_RECORDS_IN_DD_ONTOLOGY
	* Parses ontology section records and writes (inserts or updates) their
	* corresponding rows in the dd_ontology flat-lookup table.
	*
	* Two dispatch modes determined by $options->section_id:
	*
	*   Edit mode (section_id provided):
	*     Builds a SQO limited to the single record identified by section_tipo +
	*     section_id.  Used when the user saves an individual ontology record.
	*
	*   List mode (section_id absent or null):
	*     Reconstructs the SQO from the session key built by
	*     section::build_sqo_id($section_tipo).  This captures the user's current
	*     filter and pagination state, then overrides order/limit/offset so that
	*     the full matched set is processed.  Used when the user triggers a batch
	*     update from the list view.
	*
	* In both modes the actual write is delegated to ontology::set_records_in_dd_ontology().
	* On success the session active-elements cache is invalidated so that
	* subsequent thesaurus tree loads (hierarchy::get_active_elements via
	* dd_ts_api::get_children_data) fetch fresh data from the database.
	*
	* Response contract:
	*   result  (bool)     — true on full or partial success, false on failure
	*   msg     (string)   — human-readable summary including elapsed time
	*   errors  (array)    — per-record error strings; non-empty even when
	*                        result is true (partial success)
	*
	* @param object $options - Request payload:
	*   section_tipo (string, required) — tipo of the ontology section to process
	*   section_id   (int|string|null, optional) — when present, limits to one record
	* @return object - Response with result (bool), msg (string), errors (array<string>)
	* @throws permission_exception - via assert_developer() when caller is not a developer
	*/
	public static function set_records_in_dd_ontology(object $options) : object {

		// Developer-only gate
		// (!) This must remain the first statement: no side-effects before the
		// privilege check.
			self::assert_developer();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options
			$section_id		= $options->section_id ?? null;
			$section_tipo	= $options->section_tipo ?? null;

		// validate input
			if (empty($section_tipo)) {
				$response->msg		= 'Error. Missing required parameter: section_tipo';
				$response->errors[]	= 'section_tipo is required';
				return $response;
			}

		try {
			// sqo - search query object
			// Build a search_query_object appropriate for the dispatch mode.
				if (!empty($section_id)) {

					// Edit case: Single record processing
					// A locator pinpoints the exact record; limit=1 prevents the
					// underlying search from loading neighbours.
					$locator = new locator();
						$locator->set_section_tipo($section_tipo);
						$locator->set_section_id($section_id);

					$sqo = new search_query_object();
						$sqo->set_section_tipo([$section_tipo]);
						$sqo->set_limit(1);
						$sqo->set_offset(0);
						$sqo->set_filter_by_locators([$locator]);

				} else {

					// List case: Multiple records from session
					// The session SQO encodes the current filter/sort state the user
					// sees in the list view.  We clone it to avoid mutating the
					// stored session object, then clear ordering and pagination so
					// that every matching record is processed regardless of the
					// current page size.
					$sqo_id			= section::build_sqo_id($section_tipo);
					$sqo_session	= $_SESSION['dedalo']['config']['sqo'][$sqo_id] ?? null;

					if (empty($sqo_session)) {
						// error case: no session configuration found
						// This normally means the user navigated directly to the tool
						// without first opening the section list, so no SQO was stored.
						$error_msg = 'Not sqo_session found from id: ' . $sqo_id;
						$response->msg		= 'Error. ' . $error_msg;
						$response->errors[]	= $error_msg;

						debug_log(__METHOD__
							. " Error: " . $error_msg
							, logger::ERROR
						);
						return $response;
					}

					$sqo_data = clone($sqo_session);
					$sqo = new search_query_object($sqo_data);
						$sqo->set_order([]);
						$sqo->set_limit(0);
						$sqo->set_offset(0);
				}

			// Process ontology node/s and change dd_ontology rows
			// Delegates all db_ontology upsert/delete logic to the ontology layer.
				$ontology_response = ontology::set_records_in_dd_ontology($sqo);

			// Invalidate the session active-elements cache
			// The session key $_SESSION['dedalo']['config']['active_elements'] is a
			// legacy per-request memoisation consumed by callers such as
			// dd_ts_api::get_children_data() and hierarchy::get_active_elements().
			// After a dd_ontology write its contents are stale; unsetting it forces
			// the next read to rebuild from the database.
				if (isset($_SESSION['dedalo']['config']['active_elements'])) {
					unset($_SESSION['dedalo']['config']['active_elements']);
				}

			// Build consistent response
			// Propagate result/msg/errors from the lower layer unchanged so that
			// callers receive the full per-record error list and timing data.
				$response->result	= $ontology_response->result ?? false;
				$response->msg		= $ontology_response->msg ?? 'OK. Request done';
				$response->errors	= $ontology_response->errors ?? [];

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
	}//end set_records_in_dd_ontology

}//end class tool_ontology
