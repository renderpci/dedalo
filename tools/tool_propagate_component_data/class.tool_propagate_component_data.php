<?php declare(strict_types=1);
/**
 * CLASS TOOL_PROPAGATE_COMPONENT_DATA
 * Tool for batch propagation of component data across multiple section records
 *
 * Processes bulk updates to component data using search query objects (sqo) to identify
 * target records and apply consistent data changes. Supports three propagation actions:
 * - Replace: overwrite existing data with new value
 * - Delete: remove specific values from multi-value components
 * - Add: append new values to multi-value components
 *
 * Key features:
 * - Search-based record filtering with sqo integration
 * - Bulk process tracking for audit trail and rollback capability
 * - Relation component support with locator-based matching
 * - Mono-value component validation (prevents add action)
 * - CLI progress reporting for long-running operations
 * - Memory usage monitoring and security total validation
 * - Time machine integration for process reversion
 *
 * Dependencies:
 * - search class: Query execution and record retrieval
 * - component classes: Component instantiation and data manipulation
 * - bulk_process system: Change tracking and audit logging
 *
 * @package Dedalo
 * @subpackage Tools
 */
class tool_propagate_component_data extends tool_common {

	/**
	 * PROPAGATE_COMPONENT_DATA
	 * Propagate component data changes across multiple section records
	 *
	 * Execution workflow:
	 * 1. Validate required parameters (section_tipo, component_tipo, action, sqo)
	 * 2. Verify action compatibility with component type (no 'add' for mono-value)
	 * 3. Execute search using sqo to identify target records
	 * 4. Validate record count matches client total (security check)
	 * 5. Create bulk process record for change tracking
	 * 6. Iterate records and apply data transformation per action type:
	 *    - Replace: overwrite with propagate_data_value
	 *    - Delete: remove matching values from array
	 *    - Add: append values if not already present
	 * 7. Link component changes to bulk_process_id for audit trail
	 * 8. Report results with memory usage and change count
	 *
	 * @param object $options Options containing:
	 *                         - section_tipo (required): Target section type
	 *                         - component_tipo (required): Target component type
	 *                         - action (required): Propagation action ('replace'|'delete'|'add')
	 *                         - lang (required): Language for data manipulation
	 *                         - propagate_data_value (optional): Data to propagate (type-dependent)
	 *                         - bulk_process_label (optional): Human-readable process name
	 *                         - sqo (required): Search query object defining record selection
	 *                         - total (required): Expected record count (security validation)
	 * @return object $response Response object with:
	 *                           - result: true on success, false on validation errors
	 *                           - msg: operation status message
	 *                           - errors: array of error/warning messages
	 *                           - action: executed action type
	 *                           - section_label: human-readable section name
	 *                           - total: expected record count
	 *                           - counter: actual records processed
	 *                           - memory: peak memory usage (string)
	 * @throws Exception If database query fails or component instantiation fails
	 *
	 * @package Dedalo
	 * @subpackage Tools
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

			// short vars
				$model = ontology_node::get_model_by_tipo($component_tipo, true);
				if (empty($model)) {
					throw new Exception("Unable to determine model for component_tipo: $component_tipo");
				}

				$with_relations = in_array($model, component_relation_common::get_components_with_relations());

			// components mono-value case. Prevent to propagate 'add'
				if ($action === 'add' && in_array($model, component_common::$components_monovalue)) {
					throw new Exception("Action 'add' is not allowed for mono-value components");
				}

			// RECORDS. Search records with given SQO
				// reset sqo limit/offset for full result set
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
				if ((int)$total_records > (int)$total) {
					throw new Exception(
						"Record count mismatch: expected $total records but found $total_records. "
						. "Process stopped for security. The sqo may have changed between client and server."
					);
				}

			// CLI process data
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

				// Save the process name into the process section
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

				$data_label = [(object)[
					'lang' => DEDALO_DATA_NOLAN,
					'value' => $bulk_process_label ?? 'Propagate ' . $action . ' to ' . $component_label
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
					$final_data = $current_data ?? [];
					$save = true;
					switch ($action) {

						case 'replace':
							if ($current_data === $propagate_data_value) {
								$save = false;
							} else {
								$final_data = $propagate_data_value;
							}
							break;

						case 'delete':

							foreach ((array)$propagate_data_value as $current_value) {

								$key = ($with_relations===true)
									? locator::get_key_in_array_locator($current_value, $final_data, ['section_tipo','section_id'])
									: array_search($current_value, $final_data);
								if (false!==$key) {
									unset($final_data[$key]);
								}
							}
							$final_data = array_values($final_data);

							$save = ($final_data !== $current_data)
								? true
								: false;
							break;

						case 'add':

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
