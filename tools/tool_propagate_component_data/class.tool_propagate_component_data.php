<?php declare(strict_types=1);
/**
* CLASS TOOL_PROPAGATE_COMPONENT_DATA
* Batch-propagates a single component's value across every record matched by an SQO.
*
* This tool implements the server-side half of the "Propagate component data" section
* toolbar button. The client selects a source value and an action (replace/delete/add),
* then calls this class via dd_tools_api::tool_request with background_running:true so
* the potentially long-running loop executes as a detached CLI child process
* (process_runner.php). Progress is streamed back to the browser via print_cli().
*
* Responsibilities:
* - Validate all required options and assert write permission on the target component.
* - Re-execute the caller's SQO (with limit=0/offset=0) to retrieve the full match set.
* - Guard against count drift: if the live row count exceeds the client-supplied total,
*   execution is aborted — the sqo may have been enlarged between page load and submit.
* - Create a dd800 bulk-process record so every touched time-machine row carries a shared
*   bulk_process_id, enabling the tool_time_machine revert-batch feature.
* - Iterate matched records and apply one of three mutations per language slot:
*     replace — overwrite the entire language value with propagate_data_value.
*     delete  — remove each value in propagate_data_value from the existing array;
*               relation components match by (section_tipo, section_id) locator key.
*     add     — append each value in propagate_data_value that is not already present;
*               blocked for mono-value component models (component_text_area etc.).
*
* Relationship to other classes:
* - Extends tool_common (tools framework base class).
* - Uses search::get_instance() for SQO execution.
* - Calls component_common::get_instance() to load/save each target component.
* - Uses component_relation_common::get_components_with_relations() to distinguish
*   locator-based arrays (relations) from scalar arrays (literals) during delete matching.
* - Uses locator::get_key_in_array_locator() with ['section_tipo','section_id'] for
*   relation value comparison (avoids full-object equality which would miss id differences).
* - Writes bulk-process label to dd800 / dd796 (DEDALO_BULK_PROCESS_SECTION_TIPO /
*   DEDALO_BULK_PROCESS_LABEL_TIPO) using DEDALO_DATA_NOLAN (language-neutral slot).
*
* @package Dédalo
* @subpackage Tools
*/
class tool_propagate_component_data extends tool_common {



	/**
	* Explicit allowlist of methods exposed through dd_tools_api::tool_request.
	* Only names present here can be dispatched by the API layer (SEC-024 §9.2).
	* Any tool_common-inherited helper is automatically excluded.
	* @var array<string> API_ACTIONS
	*/
	public const API_ACTIONS = [
		'propagate_component_data'
	];

	/**
	* Explicit allowlist of methods that process_runner.php may invoke directly
	* from CLI when the API caller passes background_running:true.
	* Without this constant, process_runner falls back to allowing every public
	* static method on the class, which would expose all tool_common helpers
	* (SEC-024 §9.1b).
	* @see core/base/process_runner.php
	* @see tools/tool_propagate_component_data/js/tool_propagate_component_data.js
	* @var array<string> BACKGROUND_RUNNABLE
	*/
	public const BACKGROUND_RUNNABLE = [
		'propagate_component_data'
	];



	/**
	* PROPAGATE_COMPONENT_DATA
	* Apply a single data mutation (replace/delete/add) to one component across all
	* records returned by the caller's SQO.
	*
	* The method is designed to run as a long-lived CLI background process. It:
	*   1. Validates required options and throws on missing/invalid inputs.
	*   2. Asserts write permission (level >=2) on the (section_tipo, component_tipo)
	*      pair before touching any data.
	*   3. Re-executes the SQO with limit=0 / offset=0 to retrieve the full result set
	*      (the client already resets these before submitting, but we force them again
	*      server-side for safety).
	*   4. Compares the live row count against the client-supplied $options->total.
	*      If the live count is GREATER, execution stops — this guards against a situation
	*      where the user's filter widened between page load and the API call.
	*      Note: a live count SMALLER than total is allowed (records may have been
	*      deleted concurrently).
	*   5. Creates a dd800 (DEDALO_BULK_PROCESS_SECTION_TIPO) section record and saves
	*      a human-readable label into dd796 (DEDALO_BULK_PROCESS_LABEL_TIPO) using
	*      DEDALO_DATA_NOLAN (the language-neutral column). The resulting $bulk_process_id
	*      (the new section_id) is stamped onto every component save so the time-machine
	*      can later revert the entire batch atomically.
	*   6. Iterates the result set. For each row:
	*       - Instantiates the target component in 'list' mode.
	*       - Reads the current language-specific data via get_data_lang($lang).
	*       - Builds $final_data according to $action:
	*           replace: $final_data = $propagate_data_value (skip save if identical).
	*           delete:  for each value in $propagate_data_value, locate and unset it;
	*                    relation components use locator::get_key_in_array_locator() with
	*                    ['section_tipo','section_id'] to match by locator identity rather
	*                    than full object equality; re-index with array_values() afterward.
	*           add:     for each value in $propagate_data_value, append it only when
	*                    not already present via in_array() (strict type NOT used here —
	*                    note this may miss type mismatches for relation locator objects).
	*       - If $final_data differs from $current_data, stamps $bulk_process_id,
	*         calls set_data_lang() + save().
	*   7. Returns a $response summary with counters and peak memory usage.
	*
	* CLI progress: when running_in_cli() is true, a $pdata object is printed via
	* print_cli() before the loop and updated every iteration (memory sampled every
	* 1000 records to avoid overhead).
	*
	* Error handling: per-row failures (null section_id, null component instance) are
	* collected in $response->errors and the loop continues. Only fatal setup errors
	* throw exceptions. A permission_exception is re-thrown (not caught here) so that
	* dd_manager can translate it to the standard permissions_denied response.
	*
	* @param object $options {
	*   @type string      $section_tipo          Required. Ontology tipo of the target section (e.g. 'dd100').
	*   @type string      $component_tipo        Required. Ontology tipo of the component to propagate into.
	*   @type string      $action                Required. One of 'replace' | 'delete' | 'add'.
	*   @type string      $lang                  Required. Language code for data read/write (e.g. 'lg-eng').
	*                                            Use DEDALO_DATA_NOLAN for language-neutral components.
	*   @type mixed       $propagate_data_value  Optional. Value to apply. Shape depends on component model:
	*                                            scalars for literals; locator objects for relations;
	*                                            arrays of either for multi-value delete/add.
	*                                            May be null for 'replace' to clear the field.
	*   @type string|null $bulk_process_label    Optional. Human-readable name stored in dd796.
	*                                            Defaults to "Propagate {action} to {component_label}".
	*   @type object      $sqo                   Required. Search query object; limit/offset are overridden
	*                                            to 0 server-side to fetch the full matched set.
	*   @type int|string  $total                 Required. Record count as seen by the client at submit time.
	*                                            Used as a security ceiling: execution aborts if the live
	*                                            count exceeds this value.
	* }
	* @return object $response {
	*   @type bool     $result        true on success (even with warnings), false on fatal error.
	*   @type string   $msg           Human-readable status or error message.
	*   @type array    $errors        Per-row warnings and any caught exception messages.
	*   @type string   $action        The action that was executed ('replace'|'delete'|'add').
	*   @type string   $section_label Human-readable section name (resolved from DEDALO_APPLICATION_LANG).
	*   @type int      $total         The client-supplied expected record count.
	*   @type int      $counter       Number of rows iterated (including skipped rows).
	*   @type string   $memory        Peak PHP memory usage at end of run (from dd_memory_usage()).
	* }
	* @throws permission_exception Re-thrown without wrapping so the API layer returns
	*                              the standard permissions_denied response.
	* @throws Exception            On fatal setup failures (bad sqo, missing model, etc.).
	*/
	public static function propagate_component_data( object $options ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		try {
			// options with validation
				$section_tipo			= $options->section_tipo ?? null;
				$component_tipo			= $options->component_tipo ?? null;
				$action					= $options->action ?? null;
				$lang					= $options->lang ?? null;
				$propagate_data_value	= $options->propagate_data_value ?? null;
				$bulk_process_label		= $options->bulk_process_label ?? null;
				$sqo					= $options->sqo ?? null;
				$total					= $options->total ?? null;

			// validate required parameters
				$missing_params = [];
				if (empty($section_tipo)) $missing_params[] = 'section_tipo';
				if (empty($component_tipo)) $missing_params[] = 'component_tipo';
				if (empty($action)) $missing_params[] = 'action';
				if (empty($lang)) $missing_params[] = 'lang';
				if (empty($sqo)) $missing_params[] = 'sqo';
				if ($total === null) $missing_params[] = 'total';

				if (!empty($missing_params)) {
					throw new Exception('Missing required parameters: ' . implode(', ', $missing_params));
				}

			// validate action value
				if (!in_array($action, ['replace', 'delete', 'add'], true)) {
					throw new Exception("Invalid action '$action'. Must be 'replace', 'delete', or 'add'");
				}

			// SEC-024 (§9.2): permission gate. Propagation is a bulk WRITE that
			// modifies every record matched by the sqo. The caller must have
			// write (>=2) on the (section_tipo, component_tipo) pair. Without
			// this check any logged user with access to the propagate tool
			// could overwrite/delete arbitrary component data across the
			// section.
				security::assert_tipo_permission(
					$section_tipo,
					$component_tipo,
					2,
					__METHOD__
				);

			// short vars
				$model = ontology_node::get_model_by_tipo($component_tipo, true);
				if (empty($model)) {
					throw new Exception("Unable to determine model for component_tipo: $component_tipo");
				}

				// Determine whether the target component stores relation locator objects.
				// This flag drives two different behaviours:
				//   delete  — locator arrays require key-lookup by (section_tipo, section_id)
				//             rather than strict scalar equality (array_search).
				//   add     — (currently identical for both; in_array() is used in both branches).
				$with_relations = in_array($model, component_relation_common::get_components_with_relations());

			// components mono-value case. Prevent to propagate 'add'
				// Mono-value components (component_text_area, component_image, etc.) only ever
				// hold a single item — appending a second one would create an invalid data state.
				// 'replace' and 'delete' are still allowed because they reduce or swap the value.
				if ($action === 'add' && in_array($model, component_common::$components_monovalue)) {
					throw new Exception("Action 'add' is not allowed for mono-value components");
				}

			// RECORDS. Search records with given SQO
				// reset sqo limit/offset for full result set
				// The client may send a paged sqo (limit > 0); override to retrieve every
				// matching record so the propagation applies to the entire selection, not just
				// the visible page.
				$sqo->limit = 0;
				$sqo->offset = 0;

			// search
				$search = search::get_instance($sqo);
				if ($search === null) {
					throw new Exception("Failed to instantiate search object from sqo");
				}

				$db_result = $search->search();
				if ($db_result === null) {
					throw new Exception("Search query returned null result");
				}

			// short vars
				$counter = 0;
				$total_records = $db_result->row_count();
				$section_label = ontology_node::get_term_by_tipo($section_tipo, DEDALO_APPLICATION_LANG, true);
				$component_label = ontology_node::get_term_by_tipo($component_tipo, DEDALO_APPLICATION_LANG, true);

			// check match totals. If totals do not match, something wrong happens. Stop execution in that case.
			// Note that client total value is calculated from the section instance currently viewed and the sqo
			// is updated with context session sqo in every section build. This should keep the sqo synchronized between the client and the server.
				// (!) Security ceiling: if the live count exceeds the client-supplied total the sqo
				// has grown wider since the user confirmed the operation. Abort to avoid propagating
				// data to records the user never intended to target.
				// A smaller live count (records deleted since page load) is acceptable and continues.
				if ((int)$total_records > (int)$total) {
					throw new Exception(
						"Record count mismatch: expected $total records but found $total_records. "
						. "Process stopped for security. The sqo may have changed between client and server."
					);
				}

			// CLI process data
				// Emit an initial progress object before the loop so the browser progress bar
				// shows the component being worked on immediately when the background process starts.
				if (running_in_cli() === true) {
					$pdata = new stdClass();
						$pdata->msg = (label::get_label('processing') ?? 'Processing') . ' ' . $action . ': ' . $component_label;
						$pdata->counter = $counter;
						$pdata->total = $total;
						$pdata->section_label = $section_label;
					// send to output
					print_cli($pdata);
				}

			// BULK_PROCESS
				// create new process section
				// A new dd800 record acts as the audit anchor for this propagation run.
				// All component saves below will carry its section_id as bulk_process_id,
				// stamping every time-machine row with a shared identifier so
				// tool_time_machine can revert the entire batch in one operation.
				$process_section = section::get_instance(
					DEDALO_BULK_PROCESS_SECTION_TIPO // string section_tipo
				);

				if ($process_section === null) {
					throw new Exception("Failed to instantiate bulk process section");
				}

				// get the bulk_process_id as the section_id of the section process
				$bulk_process_id = $process_section->create_record();
				if (empty($bulk_process_id)) {
					throw new Exception("Failed to create bulk process record");
				}

				// Save the process label into the process section
				// dd796 (DEDALO_BULK_PROCESS_LABEL_TIPO) is the human-readable name component
				// inside dd800. Stored in DEDALO_DATA_NOLAN (language-neutral, empty string key)
				// because the label is not translatable — it is a system audit string.
				$bulk_process_label_model = ontology_node::get_model_by_tipo(DEDALO_BULK_PROCESS_LABEL_TIPO, true);
				$bulk_process_label_component = component_common::get_instance(
					$bulk_process_label_model, // expected 'component_input_text'
					DEDALO_BULK_PROCESS_LABEL_TIPO, // dd796
					$bulk_process_id, // string section_id
					'list', // string mode
					DEDALO_DATA_NOLAN, // string lang
					DEDALO_BULK_PROCESS_SECTION_TIPO // string section_tipo
				);

				if ($bulk_process_label_component === null) {
					throw new Exception("Failed to instantiate bulk process label component");
				}

				// Build a lang-wrapped data array in the shape component_input_text expects:
				// [{"lang": "lg-nolan", "value": "..."}]
				// The label falls back to a descriptive default when none was supplied by the client.
				$data_label = [(object)[
					'lang' => DEDALO_DATA_NOLAN,
					'value' => $bulk_process_label ?? ('Propagate ' . $action . ' to ' . $component_label)
				]];
				$bulk_process_label_component->set_data($data_label);
				$bulk_process_label_component->save();

			// result records iterate
				foreach ($db_result as $row) {

					$counter++;

					// section_id
					$current_section_id = $row->section_id ?? null;
					if (empty($current_section_id)) {
						$response->errors[] = "Row $counter: missing section_id";
						continue;
					}

					// CLI process data
					// Update the progress object for every record; sample memory only every
					// 1000 records to avoid the overhead of peak-memory polling in tight loops.
					if (running_in_cli() === true) {
						$pdata->counter = $counter;
						$pdata->current = (object)[
							'section_tipo' => $section_tipo,
							'section_id' => $current_section_id
						];
						// calculate memory in multiples of 1000
						if ($counter % 1000 == 0) {
							$pdata->memory = dd_memory_usage();
						}
						// send to output
						print_cli($pdata);
					}

					// current temp component
					// Instantiated in 'list' mode so that get_data_lang() returns the raw stored
					// data array without presentation wrappers. No section_record context is needed
					// because we only read and write the component's own data column.
					$current_component = component_common::get_instance(
						$model,
						$component_tipo,
						$current_section_id,
						'list',
						$lang,
						$section_tipo
					);

					if ($current_component === null) {
						$response->errors[] = "Row $counter ($section_tipo:$current_section_id): Failed to instantiate component";
						continue;
					}

					$current_data = $current_component->get_data_lang($lang);

					// final_data. Build final_data based on action type
					// Start from a copy (or empty array when the field has no data yet) so
					// the delete/add branches can mutate in place without clobbering $current_data.
					$final_data = $current_data ?? [];
					$save = true;
					switch ($action) {

						case 'replace':
							// Skip the save when the stored value is already identical to avoid
							// writing unnecessary time-machine rows for unchanged records.
							if ($current_data === $propagate_data_value) {
								$save = false;
							} else {
								$final_data = $propagate_data_value;
							}
							break;

						case 'delete':

							// Iterate each value to remove. The comparison strategy differs by
							// component family:
							//   relation components — values are locator objects; match only on
							//     (section_tipo, section_id) so that id differences or extra
							//     properties on the stored locator do not prevent matching.
							//   literal components — values are scalars; use array_search()
							//     which performs loose equality (===false check below).
							foreach ((array)$propagate_data_value as $current_value) {

								$key = ($with_relations===true)
									? locator::get_key_in_array_locator($current_value, $final_data, ['section_tipo','section_id'])
									: array_search($current_value, $final_data);
								if (false!==$key) {
									unset($final_data[$key]);
								}
							}
							// Re-index so the stored array has contiguous integer keys (0,1,2,…).
							// Without this, JSON-encoding would produce a JSON object {1:…, 3:…}
							// instead of a JSON array when intermediate keys were removed.
							$final_data = array_values($final_data);

							$save = ($final_data !== $current_data)
								? true
								: false;
							break;

						case 'add':

							// Only append values that are not already in the array.
							// (!) in_array() without strict=true is used here, which may produce
							// false positives for mixed-type values (e.g. 0 == false). Relation
							// locator objects are compared by PHP's loose object equality, which
							// may not reliably detect duplicate locators — use the delete branch
							// or locator::get_key_in_array_locator() if stricter deduplication
							// is required in future.
							foreach ((array)$propagate_data_value as $current_value) {
								if (!in_array($current_value, $final_data)) {
									$final_data[] = $current_value;
								}
							}

							$save = ($final_data !== $current_data)
								? true
								: false;
							break;
					}

					// set and save changes
					if ($save) {
						// set the bulk_process_id to save it into time_machine
						// this allow to revert the bulk import
						// Stamping bulk_process_id causes the component's save() to write the id
						// into the time-machine row's bulk_process_id column (see
						// core/db/acc/class.JSON_RecordObj_matrix.php and
						// core/db/class.tm_db_manager.php) so that all rows produced by this
						// propagation run share the same identifier and can be batch-reverted.
						$current_component->set_bulk_process_id($bulk_process_id);
						$current_component->set_data_lang($final_data, $lang);
						$current_component->save();

						debug_log(__METHOD__
							. " Updated data of $section_tipo - $current_section_id - $component_tipo "
							, logger::DEBUG
						);
					}
				}//end foreach ($db_result as $row)

			// response
				$response->result = true;
				$response->msg = empty($response->errors)
					? "OK. $action data of '$component_label' in section '$section_label' successfully."
					: "OK. $action data of '$component_label' in section '$section_label' done with warnings.";
				$response->action = $action;
				$response->section_label = $section_label;
				$response->total = $total;
				$response->counter = $counter;
				$response->memory = dd_memory_usage();

		} catch (permission_exception $e) {
			// SEC-024 (§9.2): let `dd_manager` translate this into the uniform
			// permissions_denied JSON response rather than masking it as a
			// generic error.
			throw $e;
		} catch (Exception $e) {
			$response->result = false;
			$response->msg = 'Error. ' . $e->getMessage();
			$response->errors[] = $e->getMessage();

			debug_log(__METHOD__
				. ' Exception: ' . $e->getMessage() . PHP_EOL
				. ' component_tipo: ' . (string)($options->component_tipo ?? 'unknown') . PHP_EOL
				. ' section_tipo: ' . (string)($options->section_tipo ?? 'unknown')
				, logger::ERROR
			);
		}

		return $response;
	}//end propagate_component_data

}//end class tool_propagate_component_data
