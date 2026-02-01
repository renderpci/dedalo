<?php declare(strict_types=1);
/**
 * CLASS TOOL_TIME_MACHINE
 * Tool for managing temporal data recovery and bulk process reversion
 *
 * Provides functionality to:
 * - Restore individual component or section data from time machine snapshots
 * - Revert bulk processes to previous state using time machine history
 * - Handle dataframe component recovery alongside main components
 * - Track recovery operations in activity logs
 * - Manage media file restoration for deleted sections
 *
 * Key features:
 * - Time machine record lookup and data extraction
 * - Component and section recovery with history traversal
 * - Dataframe-aware data restoration for complex components
 * - Relation component support (component_iri, component_relation_*) 
 * - New revert process creation for audit trail
 * - Session cache invalidation after recovery
 * - Activity logging for all recovery operations
 *
 * Dependencies:
 * - tm_record: Time machine record access and data retrieval
 * - matrix_db_manager: Database queries for time machine history
 * - logger: Activity logging for audit trail
 * - component_common: Component instantiation and data persistence
 * - section_record: Section recovery and media restoration
 *
 * @package Dedalo
 * @subpackage TimeMachine
 */
class tool_time_machine extends tool_common {

	/**
	 * APPLY_VALUE
	 * Restore individual component or section data from time machine snapshot
	 *
	 * Recovery workflow:
	 * 1. Validate input parameters (section_tipo, section_id, tipo, lang, matrix_id)
	 * 2. Retrieve time machine record snapshot by matrix_id
	 * 3. Extract temporal data (includes dataframe data if applicable)
	 * 4. Branch recovery based on model type (section vs. component)
	 * 5. For sections: inject data, save, restore deleted media files, log activity
	 * 6. For components: handle dataframes, filter relation data, save, log activity
	 * 7. Delete time machine record on successful recovery
	 * 8. Invalidate session caches and return execution metrics
	 *
	 * Media file restoration attempts to recover files deleted during the affected period.
	 * Optional dataframe components are processed before main component to ensure proper
	 * time machine entry linkage.
	 *
	 * @param object $request_options Options containing:
	 *                                 - section_tipo (required): Section type
	 *                                 - section_id (required): Section ID
	 *                                 - tipo (required): Component or section type
	 *                                 - lang (required): Language for component data
	 *                                 - matrix_id (required): Time machine record ID
	 *                                 - caller_dataframe (optional): Dataframe caller context
	 * @return object $response Response object with:
	 *                           - result: true on success, false on errors
	 *                           - msg: operation status message
	 *                           - errors: array of error messages
	 *                           - restore_deleted_section_media_files: array of restored files (section only)
	 *                           - debug: execution metrics (if SHOW_DEBUG enabled)
	 * @throws Exception If time machine record not found or component save fails
	 *
	 * @package Dedalo
	 * @subpackage TimeMachine
	 */
	public static function apply_value(object $request_options) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		try {
			// options get and validate - cast numeric fields to int
				$section_tipo		= $request_options->section_tipo ?? null;
				$section_id			= (int)($request_options->section_id ?? 0);
				$tipo				= $request_options->tipo ?? null;
				$lang				= $request_options->lang ?? null;
				$matrix_id			= (int)($request_options->matrix_id ?? 0);
				$caller_dataframe	= $request_options->caller_dataframe ?? null;

			// validate required parameters
				$missing = [];
				if (empty($section_tipo)) $missing[] = 'section_tipo';
				if ($section_id < 1) $missing[] = 'section_id';
				if (empty($tipo)) $missing[] = 'tipo';
				if (empty($lang)) $missing[] = 'lang';
				if ($matrix_id < 1) $missing[] = 'matrix_id';

				if (!empty($missing)) {
					throw new Exception('Missing required parameters: ' . implode(', ', $missing));
				}

			// short vars
				$model = ontology_node::get_model_by_tipo($tipo, true);
				if (empty($model)) {
					throw new Exception("Unable to determine model for tipo: $tipo");
				}

			// data. extract data from matrix_time_machine table
				$tm_record = tm_record::get_instance($matrix_id);
				if ($tm_record === null) {
					throw new Exception("Time machine record not found: matrix_id=$matrix_id");
				}

			// get time machine data with the matrix_id
			// if the component has a dataframe the data will has both data: main data and dataframe data.
				$data_time_machine = $tm_record->get_element_data();

			// apply time machine data to element and save
				switch (true) {

					case ($model === 'section'):
						// recovering section case
						self::recover_section(
							$tipo,
							$section_id,
							$section_tipo,
							$data_time_machine,
							$tm_record,
							$matrix_id,
							$response
						);
						break;

					case (strpos($model, 'component_') === 0):
						// recovering component case
						self::recover_component(
							$model,
							$tipo,
							$section_id,
							$section_tipo,
							$lang,
							$data_time_machine,
							$caller_dataframe,
							$response
						);
						break;

					default:
						// invalid model
						throw new Exception("Invalid model type: $model. Must be 'section' or component.*");
				}

			// response - only set success if no errors
				if (empty($response->errors)) {
					$response->result = true;
					$response->msg = 'OK. Request done successfully';
				} else {
					$response->result = true; // Partial success
					$response->msg = 'OK. Request done with warnings';
				}

		} catch (Exception $e) {
			$response->result = false;
			$response->msg = 'Error. ' . $e->getMessage();
			$response->errors[] = $e->getMessage();

			debug_log(__METHOD__
				. ' Exception: ' . $e->getMessage() . PHP_EOL
				. ' section_tipo: ' . (string)($request_options->section_tipo ?? 'unknown') . PHP_EOL
				. ' section_id: ' . (string)($request_options->section_id ?? 'unknown')
				, logger::ERROR
			);
		}

		// debug
			if (SHOW_DEBUG === true) {
				$debug = new stdClass();
					$debug->exec_time = exec_time_unit($start_time, 'ms') . ' ms';
				$response->debug = $debug;
			}

		return $response;
	}//end apply_value


	/**
	 * BULK_REVERT_PROCESS
	 * Revert all changes made by a bulk process to previous state
	 *
	 * Reversion workflow:
	 * 1. Validate input parameters and retrieve time machine records for bulk_process_id
	 * 2. Create new revert process record for audit trail of the reversion itself
	 * 3. Iterate through affected sections/components in time machine history
	 * 4. For each component: find previous state before bulk process change
	 * 5. Restore component to previous state (or empty if no previous version)
	 * 6. Link restoration to new revert process_id for tracking
	 * 7. Log all recovery operations to activity log
	 * 8. Return complete status with error tracking
	 *
	 * Special handling for components with only one time machine entry (bulk process
	 * creation) sets data to empty array to remove the component entirely.
	 *
	 * @param object $request_options Options containing:
	 *                                 - section_tipo (required): Section type
	 *                                 - section_id (required): Section ID
	 *                                 - tipo (required): Component type
	 *                                 - lang (required): Language for data
	 *                                 - bulk_process_id (required): Bulk process to revert
	 *                                 - bulk_revert_process_label (optional): Human-readable process name
	 * @return object $response Response object with:
	 *                           - result: true on success, false on validation errors
	 *                           - msg: operation status message
	 *                           - errors: array of error messages encountered
	 *                           - debug: execution metrics (if SHOW_DEBUG enabled)
	 * @throws Exception If database queries fail or time machine records unavailable
	 *
	 * @package Dedalo
	 * @subpackage TimeMachine
	 */
	public static function bulk_revert_process(object $request_options) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		try {
			// options get and validate - cast numeric fields to int
				$section_tipo				= $request_options->section_tipo ?? null;
				$section_id					= (int)($request_options->section_id ?? 0);
				$tipo						= $request_options->tipo ?? null;
				$lang						= $request_options->lang ?? null;
				$bulk_process_id			= (int)($request_options->bulk_process_id ?? 0);
				$bulk_revert_process_label	= $request_options->bulk_revert_process_label ?? 'Bulk Revert Process';

			// validate required parameters
				$missing = [];
				if (empty($section_tipo)) $missing[] = 'section_tipo';
				if ($section_id < 1) $missing[] = 'section_id';
				if (empty($tipo)) $missing[] = 'tipo';
				if (empty($lang)) $missing[] = 'lang';
				if ($bulk_process_id < 1) $missing[] = 'bulk_process_id';

				if (!empty($missing)) {
					throw new Exception('Missing required parameters: ' . implode(', ', $missing));
				}

			// short vars
				$model = ontology_node::get_model_by_tipo($tipo, true);
				if (empty($model)) {
					throw new Exception("Unable to determine model for tipo: $tipo");
				}

			// get all changes saved in time_machine with the same bulk_process_id
				// Use parameterized query to prevent SQL injection
				$sql = "SELECT * FROM \"matrix_time_machine\" WHERE bulk_process_id = $1 ORDER BY id DESC";
				$result = matrix_db_manager::exec_search($sql, [$bulk_process_id]);

				if ($result === false) {
					throw new Exception("Failed to query time machine records for bulk_process_id: $bulk_process_id");
				}

				$n_rows = pg_num_rows($result);
				if ($n_rows < 1) {
					$response->errors[] = 'No time machine records found for bulk_process_id: ' . $bulk_process_id;
					$response->result = true;
					$response->msg = 'OK. No records to revert';
					return $response;
				}

			// 1. create the revert process
				$process_section = section::get_instance(
					null, // string|null section_id
					DEDALO_BULK_PROCESS_SECTION_TIPO // string section_tipo
				);

				if ($process_section === null) {
					throw new Exception("Failed to instantiate bulk process section");
				}

				$process_section->save();

			// get the bulk_process_id as the section_id of the section process
				$new_bulk_process_id = $process_section->get_section_id();
				if (empty($new_bulk_process_id)) {
					throw new Exception("Failed to create new bulk process section");
				}

			// Save the process name into the process section
				$process_label_component = component_common::get_instance(
					'component_input_text', // string model
					DEDALO_BULK_PROCESS_LABEL_TIPO, // string tipo
					$new_bulk_process_id, // string section_id
					'list', // string mode
					DEDALO_DATA_NOLAN, // string lang
					DEDALO_BULK_PROCESS_SECTION_TIPO // string section_tipo
				);

				if ($process_label_component === null) {
					throw new Exception("Failed to instantiate bulk process label component");
				}

				$process_label_component->set_data([(object)[
					'lang' => DEDALO_DATA_NOLAN,
					'value' => $bulk_revert_process_label
				]]);
				$process_label_component->save();

			// 2. revert the values in time machine
				while ($row = pg_fetch_assoc($result)) {

					$current_tipo = $row['tipo'] ?? null;
					$current_section_tipo = $row['section_tipo'] ?? null;
					$current_section_id = $row['section_id'] ?? null;

					if (empty($current_tipo) || empty($current_section_tipo) || empty($current_section_id)) {
						$response->errors[] = "Invalid time machine record: " . to_string($row);
						continue;
					}

					// search all changes of the component
					$sub_sql = "
						SELECT * FROM \"matrix_time_machine\"
						WHERE 
							tipo = $1 AND
							section_tipo = $2 AND
							section_id = $3
						ORDER BY id DESC
					";
					$sub_result = matrix_db_manager::exec_search($sub_sql, [$current_tipo, $current_section_tipo, $current_section_id]);

					if ($sub_result === false) {
						$response->errors[] = "Failed to query time machine history for: $current_tipo:$current_section_tipo:$current_section_id";
						continue;
					}

					$sub_n_rows = pg_num_rows($sub_result);
					if ($sub_n_rows < 1) {
						$response->errors[] = "No history found for: $current_tipo:$current_section_tipo:$current_section_id";
						continue;
					}

					// next row is the data to be reverted.
					$reverted_next = false;
					while ($current_row = pg_fetch_assoc($sub_result)) {
						// get the bulk_process_id to be checked with the global proces_id
						$current_bulk_process_id = (int)($current_row['bulk_process_id'] ?? 0);
						$time_machine_data = $current_row['dato'] === 'null' ? null : $current_row['dato'];

						// if the time_machine doesn't has any other register than the bulk_process_id change
						if ($sub_n_rows === 1) {
							$current_bulk_process_id = null;
							$reverted_next = true;
							$time_machine_data = [];
						}

						// check if the bulk_process_id is the same than current record of the time_machine
						if ($current_bulk_process_id === $bulk_process_id) {
							$reverted_next = true;
							continue;
						}

						// if the row is previous to the bulk_process_id don't process it
						if ($reverted_next === false) {
							continue;
						}

						// process the row (after the row of the bulk_process_id)
						try {
							$element = component_common::get_instance(
								$model,
								$current_tipo,
								$current_section_id,
								'list',
								$lang,
								$current_section_tipo,
								false
							);

							if ($element === null) {
								$response->errors[] = "Failed to instantiate component: $model:$current_tipo:$current_section_id";
								break;
							}

							// set the new_bulk_process_id to save it into time_machine
							$element->set_bulk_process_id($new_bulk_process_id);

							// Set data overwrites the data of the current element
							$element->set_data($time_machine_data);

							// Save the component with a new updated data from time machine
							$saved_id = $element->save();
							if ($saved_id === false) {
								$response->errors[] = "Failed to save component: $current_tipo:$current_section_id";
							}

							// LOGGER ACTIVITY
							$matrix_table = common::get_matrix_table_from_tipo($current_section_tipo);
							logger::$obj['activity']->log_message(
								'RECOVER COMPONENT',
								logger::INFO,
								$current_section_tipo,
								null,
								[
									'msg'			=> 'Recovered component data from time machine',
									'model'			=> $model,
									'section_id'	=> $current_section_id,
									'section_tipo'	=> $current_section_tipo,
									'table'			=> $matrix_table,
									'tm_id'			=> $current_row['id'] ?? null
								],
								logged_user_id()
							);

							break;

						} catch (Exception $e) {
							$response->errors[] = "Error reverting component $current_tipo:$current_section_id - " . $e->getMessage();
							break;
						}
					}
				}

			// response OK
				$response->result = true;
				$response->msg = empty($response->errors)
					? 'OK. Bulk process reverted successfully'
					: 'OK. Bulk process revert completed with warnings';

		} catch (Exception $e) {
			$response->result = false;
			$response->msg = 'Error. ' . $e->getMessage();
			$response->errors[] = $e->getMessage();

			debug_log(__METHOD__
				. ' Exception: ' . $e->getMessage() . PHP_EOL
				. ' bulk_process_id: ' . (string)($request_options->bulk_process_id ?? 'unknown')
				, logger::ERROR
			);
		}

		// debug
			if (SHOW_DEBUG === true) {
				$debug = new stdClass();
					$debug->exec_time = exec_time_unit($start_time, 'ms') . ' ms';
				$response->debug = $debug;
			}

		return $response;
	}//end bulk_revert_process


	/**
	 * RECOVER_SECTION
	 * Helper: Recover section data from time machine snapshot
	 *
	 * @param string $tipo Section type
	 * @param int $section_id Section ID
	 * @param string $section_tipo Section type (may differ from $tipo for inherited sections)
	 * @param mixed $data_time_machine Time machine data snapshot
	 * @param object $tm_record Time machine record for deletion
	 * @param int $matrix_id Time machine record ID
	 * @param object $response Response object to populate with errors
	 * @return void
	 *
	 * @package Dedalo
	 * @subpackage TimeMachine
	 */
	private static function recover_section(
		string $tipo,
		int $section_id,
		string $section_tipo,
		mixed $data_time_machine,
		object $tm_record,
		int $matrix_id,
		object &$response
	) : void {

		try {
			// section. Inject data
			$element = section_record::get_instance($tipo, $section_id);

			if ($element === null) {
				throw new Exception("Failed to get section record instance: $tipo:$section_id");
			}

			// Set data overwrites the data of the current element
			$element->set_data($data_time_machine);

			// Save the element (section) with a new updated data from time machine
			$result = $element->save();

			// section->save returns section_id on success or null on failure
			if ($result == $section_id) {

				// reset section session sqo
				$sqo_id = section::build_sqo_id($section_tipo);
				if (isset($_SESSION['dedalo']['config']['sqo'][$sqo_id])) {
					unset($_SESSION['dedalo']['config']['sqo'][$sqo_id]);
				}

				// section recover media files. Expected array, null on failure
				$restored_result = $element->restore_deleted_section_media_files();
				if ($restored_result === null) {
					$response->errors[] = 'Failed to restore deleted media files for section: ' . $section_id;
					debug_log(__METHOD__ . " Error on restore deleted media files for section: $section_id", logger::ERROR);
				}
				// add to response
				$response->restore_deleted_section_media_files = $restored_result;

				// LOGGER ACTIVITY
				$matrix_table = common::get_matrix_table_from_tipo($section_tipo);
				logger::$obj['activity']->log_message(
					'RECOVER SECTION',
					logger::INFO,
					$section_tipo,
					null,
					[
						'msg'			=> 'Recovered section record from time machine',
						'section_id'	=> $section_id,
						'section_tipo'	=> $section_tipo,
						'top_id'		=> $section_id,
						'top_tipo'		=> $section_tipo,
						'table'			=> $matrix_table,
						'tm_id'			=> $matrix_id
					],
					logged_user_id()
				);

				// Delete time machine record
				$tm_record->delete();

			} else {
				throw new Exception("Failed to save recovered section: $tipo:$section_id");
			}

		} catch (Exception $e) {
			$response->errors[] = "Section recovery failed: " . $e->getMessage();
			debug_log(__METHOD__ . " Exception: " . $e->getMessage(), logger::ERROR);
		}
	}


	/**
	 * RECOVER_COMPONENT
	 * Helper: Recover component data from time machine snapshot
	 *
	 * @param string $model Component model
	 * @param string $tipo Component type
	 * @param int $section_id Section ID
	 * @param string $section_tipo Section type
	 * @param string $lang Language code
	 * @param mixed $data_time_machine Time machine data (may include dataframe data)
	 * @param ?object $caller_dataframe Optional dataframe caller context
	 * @param object $response Response object to populate with errors
	 * @return void
	 *
	 * @package Dedalo
	 * @subpackage TimeMachine
	 */
	private static function recover_component(
		string $model,
		string $tipo,
		int $section_id,
		string $section_tipo,
		string $lang,
		mixed $data_time_machine,
		?object $caller_dataframe,
		object &$response
	) : void {

		try {
			// component. Inject tm data to the component
			$element = component_common::get_instance(
				$model,
				$tipo,
				$section_id,
				'list',
				$lang,
				$section_tipo,
				false
			);

			if ($element === null) {
				throw new Exception("Failed to instantiate component: $model:$tipo:$section_id");
			}

			// dataframe
			// Change the dataframe first, it will not create new time machine data
			// but the main component will create the time machine with the changes
			// done by its own dataframe component.
			$dataframe_ddo = $element->get_dataframe_ddo();
			if (!empty($dataframe_ddo) && is_array($data_time_machine)) {

				foreach ($dataframe_ddo as $current_dataframe_ddo) {

					$dataframe_tipo = $current_dataframe_ddo->tipo ?? null;
					if (empty($dataframe_tipo)) continue;

					// component dataframe of the component iri
					$caller_df = new stdClass();
						$caller_df->main_component_tipo = $tipo;

					// create the dataframe component
					$dataframe_model = ontology_node::get_model_by_tipo($dataframe_tipo);
					if (empty($dataframe_model)) continue;

					$dataframe_component = component_common::get_instance(
						$dataframe_model,
						$dataframe_tipo,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo,
						false,
						$caller_df
					);

					if ($dataframe_component === null) continue;

					// get the dataframe data from data_time_machine, filtering by dataframe_tipo
					$dataframe_data = array_values(array_filter(
						$data_time_machine,
						fn($el) => isset($el->from_component_tipo) && $el->from_component_tipo === $dataframe_tipo
					));

					// set time machine data
					if (!empty($dataframe_data)) {
						$dataframe_component->set_time_machine_data($dataframe_data);
					}
				}
			}

			// Filter relation component data
			$relation_components = component_relation_common::get_components_with_relations();
			$relation_components[] = 'component_iri'; // add the component_iri, it can handle dataframes

			if (is_array($data_time_machine) && in_array($model, $relation_components)) {

				// Get only the component data. Remove possible dataframe data
				if ($model === 'component_iri') {
					// component_iri exception, it doesn't has from_componnet_tipo to select its own tm data
					$data_time_machine = array_values(array_filter(
						$data_time_machine,
						fn($el) => property_exists($el, 'iri')
					));
				} else {
					// Main component and other components without dataframe
					$data_time_machine = array_values(array_filter(
						$data_time_machine,
						fn($el) => isset($el->from_component_tipo) && $el->from_component_tipo === $tipo
					));
				}
			}

			// dataframe caller
			if (!empty($caller_dataframe)) {
				$element->set_caller_dataframe($caller_dataframe);
			}

			// Set data overwrites the data of the current element
			$element->set_data($data_time_machine);

			// Save the component with a new updated data from time machine
			$result = $element->save();

			if ($result === false) {
				throw new Exception("Failed to save component data");
			}

			// LOGGER ACTIVITY
			$matrix_table = common::get_matrix_table_from_tipo($section_tipo);
			logger::$obj['activity']->log_message(
				'RECOVER COMPONENT',
				logger::INFO,
				$section_tipo,
				null,
				[
					'msg'			=> 'Recovered component data from time machine',
					'model'			=> $model,
					'section_id'	=> $section_id,
					'section_tipo'	=> $section_tipo,
					'table'			=> $matrix_table
				],
				logged_user_id()
			);

		} catch (Exception $e) {
			$response->errors[] = "Component recovery failed: " . $e->getMessage();
			debug_log(__METHOD__ . " Exception: " . $e->getMessage(), logger::ERROR);
		}
	}

}//end class tool_time_machine
