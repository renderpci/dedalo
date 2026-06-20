<?php declare(strict_types=1);
/**
* CLASS TOOL_TIME_MACHINE
* Server-side controller for the Time Machine tool — restores historical component
* and section snapshots from the `matrix_time_machine` audit table.
*
* Responsibilities:
* - apply_value: overwrites the live data of a single component or an entire section
*   with a historical snapshot identified by its `matrix_time_machine.id` (matrix_id).
*   Handles the dataframe side-car data independently so that dataframe frames are
*   restored before the main component is saved (ensuring a consistent TM entry is
*   created for the main component that also covers the restored frames).
* - bulk_revert_process: finds every component changed by a given bulk process
*   (identified by bulk_process_id), determines the pre-bulk state of each component
*   from the TM history, and writes a revert save for each — registering all revert
*   saves under a new bulk_process_id so the revert itself can later be undone.
* - is_available: lifecycle hook suppressing the tool button on
*   component_relation_children (which carries no TM data).
*
* Data shapes:
* - The `matrix_time_machine` table is a flat table with columns:
*   id, section_id, section_tipo, tipo, lang, timestamp, user_id, bulk_process_id, data.
*   The `data` column stores the raw component datum array (JSONB).
* - TM data for a component that has a dataframe contains both main locators and
*   frame objects in the same flat array; they are distinguished via
*   `component_common::is_dataframe_entry()` (dual-read: unified DEDALO_RELATION_TYPE_DATAFRAME
*   marker first, legacy pairing-key shape as fallback).
* - For component_iri, `data` contains objects with an `iri` property instead of locators.
*
* Security model (SEC-024):
* - API_ACTIONS enforces schema-level permission gates before dispatch.
* - apply_value and bulk_revert_process additionally assert per-record scope
*   (filter_by_projects) because tm_record::search does not filter by project.
*
* Relationships:
* - Extends tool_common (tool registration, context helpers).
* - Calls tm_record::get_instance() / tm_record::search() for TM row access.
* - Calls section_record::get_instance() for whole-section restores.
* - Calls component_common::get_instance() for per-component restores.
* - Calls component_dataframe::set_time_machine_data() for dataframe frame restores.
* - Calls section_record::restore_deleted_section_media_files() after section restores.
* - Calls security::assert_section_permission() / assert_tipo_permission() /
*   assert_record_in_user_scope() for write-access enforcement.
*
* @package Dédalo
* @subpackage Tools
*/
class tool_time_machine extends tool_common {



	/**
	* SEC-024 (§9.2): explicit allowlist of methods callable via
	* `dd_tools_api::tool_request`, in map form (§9.3): the framework
	* (dd_tools_api via tool_security) enforces these declarative permission
	* gates BEFORE dispatch. The imperative security::assert_* calls inside
	* the method bodies stay as defense in depth: they also cover the
	* CLI/background execution path, which bypasses dd_tools_api.
	* Note: for apply_value on a section restore, tipo === section_tipo, so
	* the 'tipo' gate is equivalent to the section gate.
	*/
	public const API_ACTIONS = [
		'apply_value'         => ['permission' => 'tipo',    'min_level' => 2],
		'bulk_revert_process' => ['permission' => 'section', 'min_level' => 2]
	];



	/**
	* IS_AVAILABLE
	* Availability hook called by common::get_tools() (moved here from the
	* previously hardcoded core case). component_relation_children has no
	* time-machine data, so the tool is hidden there.
	* Lifecycle hook: never list in API_ACTIONS.
	* @param object $context {caller_model, called_class, is_component, tipo, section_tipo, mode}
	* @return bool
	*/
	public static function is_available(object $context) : bool {

		return $context->called_class !== 'component_relation_children';
	}//end is_available



	/**
	* APPLY_VALUE
	* Restores a single historical snapshot — identified by its `matrix_time_machine.id`
	* (`matrix_id`) — back into the live record. The operation branches on the model:
	*
	* - section model: a full section_record is overwritten and any media files that
	*   were deleted between the snapshot and now are re-linked via
	*   restore_deleted_section_media_files(). The stale SQO cache entry is cleared so
	*   the next search reflects the restored state. The TM row itself is deleted after a
	*   successful save (restoring to a section snapshot is a destructive act; keeping the
	*   snapshot would create a confusing circular history).
	* - component_* model: the component's live data is overwritten. If the component
	*   carries a dataframe (get_dataframe_ddo returns non-empty), each dataframe tipo is
	*   restored first via component_dataframe::set_time_machine_data() BEFORE the main
	*   component save. This ordering is deliberate: the main component's save will
	*   create a new TM entry that implicitly covers the updated frames, giving a single
	*   coherent snapshot for any future revert.
	*
	* Data extraction:
	* - `tm_record::get_element_data()` returns the raw `data` column value from the TM
	*   row, which may be a mixed array containing both main-component locators/values
	*   and dataframe frame objects.
	* - For relation and IRI components, main data is separated from frame data before
	*   the save: `is_dataframe_entry()` strips frames from the main array; for
	*   component_iri, objects carrying an `iri` property are kept (frames lack it).
	*
	* Security:
	* - Requires write permission (>=2) on the schema (tipo or section) gate (SEC-024 §9.2).
	* - Requires the target record to fall within the caller's filter_by_projects scope
	*   (SEC-024 §9.4), since this gate is NOT applied by tm_record::get_instance().
	*
	* @param object $request_options - shape: {section_tipo, section_id, tipo, lang,
	*                                   matrix_id (int), caller_dataframe?}
	* @return object $response       - shape: {result:bool, msg:string, errors:array,
	*                                   restore_deleted_section_media_files?:?array, debug?:object}
	*/
	public static function apply_value(object $request_options) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// options get and set
			$options = new stdClass();
				$options->section_tipo		= $request_options->section_tipo ?? null;
				$options->section_id		= $request_options->section_id ?? null;
				$options->tipo				= $request_options->tipo ?? null;
				$options->lang				= $request_options->lang ?? null;
				$options->matrix_id			= $request_options->matrix_id ?? null;
				$options->caller_dataframe	= $request_options->caller_dataframe ?? null;

		// short vars
			$section_tipo		= $options->section_tipo;
			$section_id			= $options->section_id;
			$tipo				= $options->tipo;
			$lang				= $options->lang;
			$matrix_id			= $options->matrix_id;
			$model				= ontology_node::get_model_by_tipo($tipo,true);
			$caller_dataframe	= $options->caller_dataframe;

		// SEC-024 (§9.2): permission gate. Time-machine apply_value is a WRITE
		// operation that overwrites the live row from a historical snapshot.
		// The user must have write (>=2) on the target. For section-restore the
		// gate is on the section_tipo; for component-restore it is on the
		// (section_tipo, tipo) pair. Without this check any logged user with
		// access to the time_machine tool could overwrite arbitrary records.
			if (empty($section_tipo) || empty($tipo) || $matrix_id===null) {
				$response->msg		= 'Error. Missing required parameters: section_tipo, tipo, matrix_id';
				$response->errors[]	= 'invalid_request';
				return $response;
			}
			if ($model === 'section') {
				security::assert_section_permission($section_tipo, 2, __METHOD__);
			} else {
				security::assert_tipo_permission($section_tipo, $tipo, 2, __METHOD__);
			}
		// SEC-024 (§9.4): per-record gate. apply_value targets a specific
		// section_id supplied by the caller; the schema gate above does not
		// stop a user from restoring a historical snapshot into a record
		// that lies outside their `filter_by_projects` scope.
			if (!empty($section_id)) {
				security::assert_record_in_user_scope(
					$section_tipo,
					(int)$section_id,
					__METHOD__
				);
			}

		// TM record lookup
		// matrix_id is the PK of matrix_time_machine (NOT section_id of the source record).
		// tm_record::get_instance() loads the flat-row by its own `id` column.
			$tm_record	= tm_record::get_instance( (int)$matrix_id );

		// get time machine data with the matrix_id
		// if the component has a dataframe the data will has both data: main data and dataframe data.
			$data_time_machine = $tm_record->get_element_data();

		// apply time machine data to element and save
			switch (true) {

				case ($model==='section'):
					// recovering section case

					// section. Inject data
						$element = section_record::get_instance(
							$tipo,
							(int)$section_id
						);

					// Set data overwrites the data of the current element
						$element->set_data($data_time_machine);

					// Save the element (section) with a new updated data from time machine
						$result = $element->save();

					// section->Save returns int $section_id on success or null on failure.
					// Loose == comparison: $result may be a string-typed int from the DB
					// while $section_id is a string supplied by the caller; strict ===
					// would fail for the common case where both are numeric strings.
						if ($result==$section_id) {

							// reset section session sqo
							// After overwriting a section's data the cached SQO (search query
							// object) stored in the session may reference stale pager/filter
							// state. Clearing it forces a fresh SQO the next time the user
							// opens that section's search UI.
								$sqo_id	= section::build_sqo_id($section_tipo);
								if (isset($_SESSION['dedalo']['config']['sqo'][$sqo_id])) {
									unset($_SESSION['dedalo']['config']['sqo'][$sqo_id]);
								}

							// section recover media files. Expected array, null on failure
								$restored_result = $element->restore_deleted_section_media_files();
								if (is_null($restored_result)) {
									$response->errors[] = 'failed time machine restore deleted media files';
									debug_log(__METHOD__." Error on restore deleted media files", logger::ERROR);
								}
								// add to response
								$response->restore_deleted_section_media_files = $restored_result;

							// LOGGER ACTIVITY : WHAT(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATA(array of related info)
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
									logged_user_id() // int
								);

							// Delete time machine record
						// (!) Section restores are intentionally destructive: the TM snapshot
						// is consumed by the restore and removed to prevent misleading
						// "earlier than restored" entries appearing in the section's TM list.
						// Component restores do NOT delete the TM row — the new save
						// immediately creates a fresh TM entry for the component.
							$tm_record->delete();
						}
					break;

				case (strpos($model, 'component_')===0):
					// recovering component case

					// component. Inject tm data to the component
					// (!) Mode 'list' is required here. Using 'edit' would trigger
					// set_data_default() on instantiation, which would overwrite the
					// component's current live data before the TM data can be set.
						$element = component_common::get_instance(
							$model,
							$tipo,
							$section_id,
							'list', // the component always in list because the edit could fire a save with the data_default
							$lang,
							$section_tipo,
							false
						);

					// dataframe
					// Change the dataframe first, it will not create new time machine data
					// but the main component will create the time machine with the changes
					// done by its own dataframe component.
						// check if the main component has a dataframe to save his data too
						$dataframe_ddo = $element->get_dataframe_ddo();
						if( !empty($dataframe_ddo) ){

							foreach ( $dataframe_ddo as $current_dataframe_ddo ) {

								$dataframe_tipo = $current_dataframe_ddo->tipo;

								// component dataframe of the component iri
								// here only use the main_component_tipo
								// the dataframe will save all time machine data independent of section_id_key or section_tipo_key
								// and it don't save the revert in Time Machine, as main component does.
								// (!) $caller_dataframe is intentionally re-assigned here, shadowing the
								// outer variable (from $options->caller_dataframe). The dataframe component
								// needs a caller_dataframe that names the main component tipo (not the
								// original request's caller context). The outer $caller_dataframe, if any,
								// is applied to the main $element after the dataframe loop (see below).
								$caller_dataframe = new stdClass();
									$caller_dataframe->main_component_tipo	= $tipo;

								// delete all data of the dataframe
								// it will delete all section_id_key
								// create the dataframe component
									$dataframe_model = ontology_node::get_model_by_tipo($dataframe_tipo);
									$dataframe_component = component_common::get_instance(
										$dataframe_model,
										$dataframe_tipo,
										$section_id,
										'list',
										DEDALO_DATA_NOLAN,
										$section_tipo,
										false,
										$caller_dataframe
									);

								// get the dataframe data from data_time_machine, filtering by dataframe_tipo
								if ( is_array($data_time_machine) ){

									$dataframe_data = array_values( array_filter( $data_time_machine, function($el) use($dataframe_tipo, $tipo) {
										// keep only frame entries (dual-read: unified type marker OR legacy
										// pairing-key shape). Unified frames carry from_component_tipo (the slot);
										// pre-migration frames that lack it are claimed by main_component_tipo so
										// they are not silently dropped on restore.
										if (!component_common::is_dataframe_entry($el)) {
											return false;
										}
										return (($el->from_component_tipo ?? null)===$dataframe_tipo)
											|| (!isset($el->from_component_tipo) && ($el->main_component_tipo ?? null)===$tipo);
									}));

									// set time machine data, it save the data
									// but the process doesn't create new time machine
									// the change will be set by the main component
										$dataframe_component->set_time_machine_data( $dataframe_data );
								}
							}
						}// end if($has_dataframe === true)

					$relation_components = component_relation_common::get_components_with_relations();
					$relation_components[] = 'component_iri';// add the component_iri, it can handle dataframes
					if ( is_array($data_time_machine) && in_array( $model, $relation_components) ){

						// Get only the component data. Remove possible dataframe data
						// component_iri exception, it doesn't has from_componnet_tipo to select its own tm data
						if($model==='component_iri'){
							$data_time_machine = array_values( array_filter( $data_time_machine, function($el) {
								// return only the objects with iri property
								// IRI entries have an 'iri' property; dataframe frames do not,
								// so this test cleanly separates main data from frame data without
								// relying on is_dataframe_entry (frames don't carry 'iri').
								return property_exists($el, 'iri');; // (!) double semicolon — harmless but a typo
							}));
						}else{
							// Main component: keep its own locators, exclude dataframe frames.
							// Using is_dataframe_entry (dual-read) instead of a from_component_tipo
							// match preserves legacy main locators that lack from_component_tipo and
							// still strips every frame shape (unified or legacy) from the main data.
							$data_time_machine = array_values( array_filter( $data_time_machine, function($el) {
								return !component_common::is_dataframe_entry($el);
							}));
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
								'table'			=> $matrix_table,
								'tm_id'			=> $matrix_id
							],
							logged_user_id() // int
						);
					break;

				default:
					// invalid model

					// error response
					$msg = ' Error on set time machine data. Model is not valid: '.to_string($model);
					debug_log(__METHOD__. $msg, logger::ERROR);

					$response->msg		= $msg;
					$response->errors[]	= 'invalid model';

					return $response;
			}

		// response
			$response->result	= true;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning! Request done with errors';

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms').' ms';
				$response->debug = $debug;
			}


		return $response;
	}//end apply_value



	/**
	* BULK_REVERT_PROCESS
	* Reverts every component change that was made by a previous bulk operation,
	* identified by `bulk_process_id`. The algorithm:
	*
	* 1. Create a new process record in the bulk-process section (DEDALO_BULK_PROCESS_SECTION_TIPO,
	*    dd800). Its auto-assigned section_id becomes the `new_bulk_process_id` that tags
	*    each revert save, making this revert itself reversible.
	* 2. Fetch all TM rows that share the given `bulk_process_id` (ordered `id DESC`).
	* 3. For each such row, fetch the full TM history of the same (section_tipo, section_id,
	*    tipo) triplet (again `id DESC`, so the most recent change comes first).
	* 4. Walk that per-component history until the row whose `bulk_process_id` matches
	*    the one being reverted; the *next* (older) row is the pre-bulk state to restore.
	*    Edge case: if the component has only one TM row (the bulk change was its first ever
	*    change), `$time_machine_data` is set to `[]` (empty array), effectively blanking
	*    the component's data back to its default.
	* 5. Instantiate the component, assign the new bulk_process_id (so the revert save is
	*    itself tracked), set the data, and save.
	*
	* Per-row security:
	* - Each (section_tipo, tipo) pair is checked for write (>=2) permission (SEC-024 §9.2).
	* - Each record is checked against the caller's filter_by_projects scope (SEC-024 §9.4).
	*   Rows that fail either check are skipped with an error appended to `$response->errors`
	*   rather than aborting the whole operation.
	*
	* Note: only component-level reverts are supported here; section-level restores are
	* covered by apply_value (model==='section' branch).
	*
	* @param object $request_options - shape: {section_tipo, section_id, tipo, lang,
	*                                   bulk_process_id (int), bulk_revert_process_label (string)}
	* @return object $response       - shape: {result:bool, msg:string, errors:array, debug?:object}
	*/
	public static function bulk_revert_process(object $request_options) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// options get and set
			$options = new stdClass();
				$options->section_tipo				= $request_options->section_tipo ?? null;
				$options->section_id				= $request_options->section_id ?? null;
				$options->tipo						= $request_options->tipo ?? null;
				$options->lang						= $request_options->lang ?? null;
				$options->bulk_process_id			= $request_options->bulk_process_id ?? null;
				$options->bulk_revert_process_label	= $request_options->bulk_revert_process_label ?? null;

		// short vars
			$section_tipo				= $options->section_tipo;
			$section_id					= $options->section_id;
			$tipo						= $options->tipo;
			$lang						= $options->lang;
			$bulk_process_id			= $options->bulk_process_id;
			$bulk_revert_process_label	= $options->bulk_revert_process_label;
			// (!) $tipo, $section_tipo and $section_id are all overwritten inside the
			// $db_result foreach loop with the values from each TM row, so $model is
			// resolved per row from each row's $tipo (see the loop below). This keeps
			// $model correct even for bulk processes that span multiple component models.

		// get all changes saved in time_machine with the same bulk_process_id
			$search_values = (object)['bulk_process_id' => $bulk_process_id];
			$db_result = tm_record::search($search_values, 0, 0, 'id DESC');
			if($db_result===false) {
				$response->msg = "Failed Search bulk_process_id $bulk_process_id. Data is not found.";
				debug_log(__METHOD__
					." ERROR: $response->msg "
					, logger::ERROR
				);
				return $response ;
			}

			if ($db_result->row_count() < 1) {
				$response->errors[] = 'empty result from matrix_time_machine search';
				return $response;
			}
		// for every found record in time_machine get all component changes saved.
		// 1. create the revert process

			// PROCESS
			// create new process section
				$process_section = section::get_instance(
					DEDALO_BULK_PROCESS_SECTION_TIPO // string section_tipo
				);

			// get the bulk_process_id as the section_id of the section record
				$new_bulk_process_id = $process_section->create_record();

			// Save the process name into the process section
				$process_label_component = component_common::get_instance(
					'component_input_text', // string model
					DEDALO_BULK_PROCESS_LABEL_TIPO, // string tipo
					$new_bulk_process_id, // string section_id
					'list', // string mode
					DEDALO_DATA_NOLAN, // string lang
					DEDALO_BULK_PROCESS_SECTION_TIPO // string section_tipo
				);
				$data_to_save = (object)['value' => $bulk_revert_process_label, 'lang' => DEDALO_DATA_NOLAN];
				$process_label_component->set_data([$data_to_save]);
				$process_label_component->save();

		// 2. revert the values in time machine

			foreach($db_result as $row) {

				$tipo			= $row->tipo;
				$section_tipo	= $row->section_tipo;
				$section_id		= $row->section_id;

				// resolve the model from this row's tipo so heterogeneous bulk
				// processes (rows affecting several component models) are reverted
				// with the correct model for each component.
				$model			= ontology_node::get_model_by_tipo($tipo, true);

				// SEC-024 (§9.2): permission gate per row. The bulk process may
				// span sections the caller has no write access on (e.g. it was
				// originally executed by another user). Without this check any
				// user with access to the time_machine tool could revert any
				// historical bulk_process_id.
				try {
					security::assert_tipo_permission($section_tipo, $tipo, 2, __METHOD__);
					// SEC-024 (§9.4): per-record gate. tm_record::search does
					// NOT apply filter_by_projects, so the bulk-process row
					// set may include records outside the caller's project
					// scope.
					security::assert_record_in_user_scope(
						$section_tipo,
						(int)$section_id,
						__METHOD__
					);
				} catch (permission_exception $e) {
					$response->errors[] = 'permissions_denied:'
						. $section_tipo . '/' . $tipo . '#' . $section_id;
					continue;
				}

				// search all changes of the component
				$sub_values = (object)[
					'tipo'			=> $tipo,
					'section_tipo'	=> $section_tipo,
					'section_id'	=> $section_id
				];
				$sub_db_result = tm_record::search($sub_values, 0, 0, 'id DESC');

				// get the total changes,
				// if the component has only 1 change, it will be the bulk change
				// in those cases the data to save into the component will be a empty array
				$sub_n_rows = $sub_db_result->row_count();

				// next row is the data to be reverted.
				$reverted_next = false;
				foreach($sub_db_result as $current_row) {

					// get the bulk_process_id to be checked with the global proces_id
					// loop the component data saved in tm one of this has the bulk_process_id to revert
					$current_bulk_process_id	= (int)$current_row->bulk_process_id;
					$time_machine_data			= $current_row->data;

					// if the time_machine doesn't has any other register than the bulk_process_id change
					// the change is a null data because the component has only 1 change and previous change is empty value.
					// set current_bulk_process_id to null, to bypass the next if
					// Set reverted_next as true, because this loop cycle is the last one.
					// set the data as empty array to remove the component data.
					if ($sub_n_rows===1){
						$current_bulk_process_id	= null;
						$reverted_next				= true;
						$time_machine_data			= [];
					}
					// check if the bulk_process_id is the same than current record of the time_machine
					// if the row is the bulk_process_id row, the next record will be the row to be recovery.
					if( $current_bulk_process_id === $bulk_process_id ){
						$reverted_next = true;
						continue;
					}
					// if the row is previous to the bulk_process_id don't process it
					if( $reverted_next === false ){
						continue;
					}
					// process the row (after the row of the bulk_process_id)
					// component. Inject tm data to the component
					// Mode 'list' prevents set_data_default() from firing and overwriting
					// the component data before the TM snapshot is applied (same rationale
					// as in apply_value's component branch above).
						$element = component_common::get_instance(
							$model,
							$tipo,
							$section_id,
							'list', // the component always in list because the edit could fire a save with the data_default
							$lang,
							$section_tipo,
							false
						);

					// set the new_bulk_process_id to save it into time_machine
					// this allow to revert the bulk import
						$element->set_bulk_process_id($new_bulk_process_id);

					// Set data overwrites the data of the current element
						$element->set_data($time_machine_data);

					// Save the component with a new updated data from time machine
						$saved_id = $element->save();
						if ($saved_id===false) {
							$response->errors[] = 'failed element save';
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
								'table'			=> $matrix_table,
								'tm_id'			=> $current_row->id
							],
							logged_user_id() // int
						);

					// Stop after restoring the single pre-bulk snapshot. The outer foreach
					// will move on to the next bulk-process TM row (next component).
					break;
				}
			}// end foreach

		// response OK
			$response->result	= true;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning! Request done with errors';

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms').' ms';
				$response->debug = $debug;
			}


		return $response;
	}//end bulk_revert_process



}//end class tool_time_machine
