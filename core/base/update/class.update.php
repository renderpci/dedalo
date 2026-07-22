<?php declare(strict_types=1);
/**
* UPDATE
* Orchestrates Dédalo data-version migration from one release to the next.
*
* Every Dédalo release that changes stored data formats ships a corresponding
* entry in core/base/update/updates.php. The entry describes:
*  - which installed version it upgrades FROM  (update_from_major/medium/minor)
*  - which version the database will reach AFTER the upgrade  (version_major/medium/minor)
*  - an optional list of DDL queries  (SQL_update[])
*  - an optional list of component-model names whose stored datos need reformatting (components_update[])
*  - an optional list of arbitrary class::method calls  (run_scripts[])
*  - an optional list of pre-flight scripts that must pass BEFORE the main steps (run_pre_scripts[])
*  - an optional execution_order array that controls the sequence of the three main step types
*  - a boolean update_data flag that, when false, marks the entry as code-only (no data migration needed)
*
* The current installed data version is retrieved from the `matrix_updates` PostgreSQL table
* via the global helper get_current_data_version().  On success, update_dedalo_data_version()
* inserts a new row in that same table recording the new version.
*
* Typical call sequence (initiated by the maintenance widget update_data_version):
*   1. update::get_update_version()   — determine which version to migrate to
*   2. update::pre_update_version()   — run run_pre_scripts, abort on stop_on_error
*   3. update::update_version($checks)— run SQL_update / components_update / run_scripts in order
*
* Responsibilities of this class:
*  - Loading and resolving the correct update descriptor from updates.php
*  - Driving SQL DDL execution (SQL_update)
*  - Iterating every section and calling per-component update_data_version() hooks (components_update)
*  - Dispatching arbitrary migration callbacks (run_scripts / run_pre_scripts)
*  - Writing progress information to both the debug log and a flat update.log file
*  - Advancing the `matrix_updates` version record on completion
*
* Lower-level helpers (tables_rows_iterator, convert_table_data, check_section_data)
* are also provided for bulk raw-row transformations used by upgrade scripts.
*
* @package Dédalo
* @subpackage Core
*/
class update {



	/**
	* GET_UPDATES
	* Load file updates/update.php and get var object '$updates'
	*
	* The file uses a global stdClass $updates whose properties are keyed by a
	* concatenated integer (major * 100 + medium * 10 + minor, e.g. 700 for v7.0.0).
	* Each property is itself a stdClass descriptor — see updates.php for the full shape.
	*
	* @return object $updates
	*/
	public static function get_updates() {

		include(dirname(__FILE__) .'/updates.php');

		return $updates;
	}//end get_updates



	/**
	* GET_UPDATE_VERSION
	* Returns the target version triple [major, medium, minor] that corresponds to
	* the current installed data version, or null when no matching update exists.
	*
	* The matching is done by comparing the installed version (from matrix_updates via
	* get_current_data_version()) against each update descriptor's update_from_* triplet.
	* Only the first match is returned; updates are applied one step at a time.
	*
	* Descriptors whose update_data property is explicitly false are skipped because
	* they represent code-only releases that do not require a data migration pass.
	*
	* Returns null when:
	*  - get_current_data_version() returns an empty value (fresh install or DB unavailable)
	*  - no descriptor in updates.php matches the currently installed version
	*
	* @return array|null $update_version  [major, medium, minor] or null
	*/
	public static function get_update_version() : ?array {

		$current_version = get_current_data_version();
		if (empty($current_version)) {
			#$current_version = array(4,0,9);	// Default minimum version
			#return $current_version;
			return null;
		}

		$update_version	= array();
		$updates		= update::get_updates();
		foreach ($updates as $key => $version_to_update) {
			if($current_version[0] == $version_to_update->update_from_major){
				if($current_version[1] == $version_to_update->update_from_medium){
					if($current_version[2] == $version_to_update->update_from_minor){

							// check if the update has data processes
							// if not the update is not included in the data process.
							if(isset($version_to_update->update_data) && $version_to_update->update_data===false){
								continue;
							}

							$update_version[0] = $version_to_update->version_major;
							$update_version[1] = $version_to_update->version_medium;
							$update_version[2] = $version_to_update->version_minor;

						return $update_version;
					}
				}
			}
		}

		return null;
	}//end get_update_version



	/**
	* PRE_UPDATE_VERSION
	* Runs the run_pre_scripts stage of an update descriptor before the main
	* SQL / component / run_scripts steps begin.
	*
	* Pre-scripts are intended for tasks that must complete (or partially complete)
	* before any data is migrated — for example, restructuring the ontology table
	* before new component formats are written.
	*
	* Behaviour:
	*  - Matches the currently installed version against the updates.php descriptors.
	*  - Disables the backend activity logger for the duration of the process to
	*    avoid polluting audit records with migration noise.
	*  - Iterates run_pre_scripts in declaration order, calling update::run_scripts()
	*    for each entry.
	*  - If a pre-script fails AND its stop_on_error property is true, the method
	*    returns immediately with result = false so the caller can abort the upgrade.
	*  - Other pre-script errors are recorded in $response->errors but iteration
	*    continues to the next entry.
	*
	* @return object $response
	*   stdClass with:
	*     bool   result  — true on full success, false on fatal pre-script error or
	*                      version-matching failure
	*     string|array msg     — human-readable status messages (array on return from loop)
	*     array  errors  — list of error strings collected during the run
	*/
	public static function pre_update_version() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= '';
			$response->errors	= [];

		// short vars
			$updates			= update::get_updates(); // From matrix_updates table
			$current_version	= get_current_data_version();
			$msg				= array();

		// Disable log and time machine save for all update process (from v4.9.1 24-05-2018)
			logger_backend_activity::$enable_log = false;
			#tm_record::$save_tm  = false;

		// update. Select the correct update object from the file 'updates.php'
			$update = null;
			foreach ($updates as $version_to_update) {
				if($current_version[0] == $version_to_update->update_from_major){
					if($current_version[1] == $version_to_update->update_from_medium){
						if($current_version[2] == $version_to_update->update_from_minor){

							$update_version[0] = $version_to_update->version_major;
							$update_version[1] = $version_to_update->version_medium;
							$update_version[2] = $version_to_update->version_minor;

							$update = $version_to_update;
						}
					}
				}
			}
			if (empty($update)) {

				try {
					$fisrt_update = array_key_first((array) $updates);

					// MINIMUM UPDATE FROM
					$ar_version_expected = [
						$updates->$fisrt_update->update_from_major,
						$updates->$fisrt_update->update_from_medium,
						$updates->$fisrt_update->update_from_minor
					];
				} catch (\Throwable $th) {
					$ar_version_expected = [];
				}

				$response->msg = 'Unable to get proper data update from updates file. '. PHP_EOL
					.'Current data version (from table matrix_updates): '.implode('.', $current_version) . PHP_EOL
					.'Update file (updates.php) data version expected: ' . implode('.', $ar_version_expected);
				$response->errors[] = 'Update item not found for version '.implode('.', $current_version);
				return $response;
			}

			// 1 run_pre_scripts
			if(isset($update->run_pre_scripts)){
				foreach ((array)$update->run_pre_scripts as $key => $current_script) {

					debug_log(__METHOD__ . PHP_EOL
						. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
						. " EXECUTING RUN_PRE_SCRIPTS ... " . PHP_EOL
						. " current_script: " . to_string($current_script) . PHP_EOL
						. " memory usage: " . dd_memory_usage() . PHP_EOL
						. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
						, logger::WARNING
					);

					$run_scripts_response	= update::run_scripts($current_script);
					$cmsg					= $run_scripts_response->msg;
					$msg[]					= "Updated run scripts: ".to_string($cmsg);

					if ($run_scripts_response->result===false) {

						array_push($msg, 'Error on run_pre_scripts: '.to_string($current_script));

						debug_log(__METHOD__." Error on run_pre_scripts " . PHP_EOL
							. 'Note that the `run_pre_scripts` loop continues with the next one.' . PHP_EOL
							. 'The result is false. Check your script: '  . PHP_EOL
							. 'current_script: ' . to_string($current_script) . PHP_EOL
							. 'run_scripts_response: ' . json_encode($run_scripts_response, JSON_PRETTY_PRINT)
							, logger::ERROR
						);

						// msg update
							$msg[] = 'Error updating Dédalo data';
							if (isset($run_scripts_response->msg)) {
								$msg[] = $run_scripts_response->msg;
							}

						// errors
							if (isset($run_scripts_response->errors)) {
								$response->errors = array_merge($response->errors, $run_scripts_response->errors);
							}

						// stop_on_error
							if (isset($current_script->stop_on_error) && $current_script->stop_on_error===true) {

								$response->result	= false ;
								$response->msg		= $msg;
								$response->errors[] = 'unable to run update script';
								return $response;
							}
					}
				}//end foreach ((array)$update->run_pre_scripts as $current_script)
			}

		// response
			array_push($msg, 'Updated version successfully');
			$response->result	= true ;
			$response->msg		= $msg;

		return (object)$response;
	}//end pre_update_version



	/**
	* UPDATE_VERSION
	* Updates Dédalo data version.
	* Allow change components data format or add new tables or index
	*
	* This is the main migration driver. It locates the correct update descriptor for
	* the currently installed data version and then executes the enabled steps in the
	* order defined by $update->execution_order (defaults to
	* ['SQL_update', 'components_update', 'run_scripts']).
	*
	* The $updates_checked parameter carries a checkbox map produced by the maintenance
	* UI. Only items whose corresponding key is explicitly set to true are executed;
	* unchecked items are silently skipped. Key format: '<step_type>_<0-based-index>',
	* e.g. 'SQL_update_0', 'components_update_2', 'run_scripts_1'.
	*
	* Step semantics:
	*   SQL_update        — raw DDL/DML strings executed directly against PostgreSQL via
	*                       update::SQL_update(). A false result aborts the entire update.
	*   components_update — iterates every section's records and calls the component class's
	*                       static update_data_version() hook (result codes: 0=skip, 1=save,
	*                       2=no change). See update::components_update().
	*   run_scripts       — arbitrary class::method calls dispatched by update::run_scripts().
	*                       A false result with stop_on_error=true aborts the update.
	*
	* Side effects:
	*  - Backend activity logging is disabled for the entire method and always restored
	*    in the finally block.
	*  - $_ENV['DEDALO_UPDATING'] is set to true to suppress verbose sub-system logs.
	*  - Progress is written to both the Dédalo debug log and the update.log file whose
	*    path is taken from the UPDATE_LOG_FILE constant (falls back to
	*    DEDALO_CONFIG_PATH . '/update.log').
	*  - On full success, update::update_dedalo_data_version() inserts the new version
	*    into matrix_updates.
	*  - sleep(1) + gc_collect_cycles() are called after each individual step to help
	*    PHP's GC reclaim memory between heavy migration passes.
	*
	* @param object $updates_checked  Map of step keys to booleans, e.g.:
	* {
	*	"SQL_update_1": true,
	*	"components_update_1": true,
	*	"components_update_2": true,
	*	"components_update_3": true,
	*	"components_update_4": true,
	*	"run_scripts_1": true,
	*	"run_scripts_2": true
	* }
	* @return object $response
	*   stdClass with:
	*     bool         result  — true on full success, false on any hard error
	*     string|array msg     — status/error messages collected during the run
	*     array        errors  — list of error strings
	* @throws Exception  Caught internally; sets result=false and populates errors[]
	*/
	public static function update_version(object $updates_checked) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= '';
			$response->errors	= [];

		// short vars
			$updates			= update::get_updates();
			$current_version	= get_current_data_version();
			$msg				= array();

		// Disable log and time machine save for all update process (from v4.9.1 24-05-2018)
		$original_log_state = logger_backend_activity::$enable_log;
		logger_backend_activity::$enable_log = false;
		#tm_record::$save_tm  = false;

		// $_ENV['DEDALO_UPDATING'] avoid verbose logs during update
		$_ENV['DEDALO_UPDATING'] = true;

		try {
			// update. Select the correct update object from the file 'updates.php'
				$update = null;
				foreach ($updates as $version_to_update) {
					if($current_version[0] == $version_to_update->update_from_major){
						if($current_version[1] == $version_to_update->update_from_medium){
							if($current_version[2] == $version_to_update->update_from_minor){

								$update_version[0] = $version_to_update->version_major;
								$update_version[1] = $version_to_update->version_medium;
								$update_version[2] = $version_to_update->version_minor;

								$update = $version_to_update;
							}
						}
					}
				}
				if (empty($update)) {
					$response->msg		= 'Unable to get proper update. Check current version: '.to_string($current_version);
					$response->errors[]	= 'Update item not found for version '.to_string($current_version);
					return $response;
				}

			// CLI process data
				if ( running_in_cli()===true ) {
					if (!isset(common::$pdata)) {
						common::$pdata = new stdClass();
					}
					common::$pdata->memory = '';
					common::$pdata->counter = 0;
				}

			// update log file
				$update_log_file = defined('UPDATE_LOG_FILE')
					? UPDATE_LOG_FILE
					: DEDALO_CONFIG_PATH . '/update.log';
				if(!file_exists($update_log_file)) {
					if(!file_put_contents($update_log_file, ' '.PHP_EOL)) {
						$response->msg = 'Error (1). It\'s not possible set update_log file, review the PHP permissions to write in this directory';
						$response->errors[] = 'update_log file is not available';
						debug_log(__METHOD__
							." ".$response->msg . PHP_EOL
							. ' update_log_file: ' . $update_log_file
							, logger::ERROR
						);
						return $response;
					}
				}

			// Execution order
				$execution_order = $update->execution_order ?? ['SQL_update', 'components_update', 'run_scripts'];

			foreach ($execution_order as $exec_name) {

				switch ($exec_name) {
					case 'SQL_update':
						// 1 SQL_update
						if(isset($update->SQL_update)){
							$counter = count($update->SQL_update);
							foreach ((array)$update->SQL_update as $key => $current_query) {

								// updates_checked. checked test
									$updates_checked_key = 'SQL_update_' . $key;
									if (!isset($updates_checked->{$updates_checked_key}) || $updates_checked->{$updates_checked_key}!==true) {
										// skip checked false item
										debug_log(__METHOD__
											. " Skipped updates item " . PHP_EOL
											. ' updates_checked_key : ' . $updates_checked_key . PHP_EOL
											. ' current_query : ' . to_string($current_query)
											, logger::WARNING
										);
										continue;
									}

								// CLI process data
									if ( running_in_cli()===true ) {
										common::$pdata->msg	= 'Updating SQL_update ' . $key+1 . ' of ' . $counter;
										common::$pdata->data = $current_query;
										common::$pdata->memory = dd_memory_usage();
										// send to output
										print_cli(common::$pdata);
									}

								debug_log(__METHOD__ . PHP_EOL
									. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
									. " EXECUTING SQL_UPDATE ... " . PHP_EOL
									. " current_query: " . to_string($current_query) . PHP_EOL
									. " memory usage: " . dd_memory_usage() . PHP_EOL
									. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
									, logger::WARNING
								);

								// log line
									$log_line  = PHP_EOL . date('c') . ' Updating [SQL_update] '. ($key+1) .' )))))))))))))))))))))))))))))))))))))))';
									$log_line .= PHP_EOL . 'query: ' . to_string($current_query);
									file_put_contents($update_log_file, $log_line, FILE_APPEND | LOCK_EX);

								$SQL_update	= update::SQL_update($current_query);
								$cmsg		= $SQL_update->msg;
								$msg[]		= "Updated sql: ".to_string($cmsg);

								if ($SQL_update->result===false) {

									array_push($msg, "Error on SQL_update: ".to_string($current_query));

									$response->result	= false ;
									$response->msg		= $msg;

									debug_log(__METHOD__." Error on update SQL_update ".PHP_EOL
										. 'The result is false. Check your query sentence: ' .PHP_EOL
										. to_string($current_query) .PHP_EOL
										. 'The update process is aborted to prevent data corruption.'
										, logger::ERROR
									);

									// log line
										$log_line  = PHP_EOL . 'ERROR [SQL_update] ' . ($key+1);
										$log_line .= PHP_EOL . 'The result is false. Check your query sentence. The update process aborted.';
										file_put_contents($update_log_file, $log_line, FILE_APPEND | LOCK_EX);

									return $response;
								}

								// log line
									$log_line  = PHP_EOL . 'result: ' . to_string($SQL_update->result);
									file_put_contents($update_log_file, $log_line, FILE_APPEND | LOCK_EX);

								// let GC do the memory job
								sleep(1);
								// Forces collection of any existing garbage cycles
								gc_collect_cycles();
							}//end foreach ((array)$update->SQL_update as $current_query)
						}
						break;

					case 'components_update':
						// 2 components_update
						if(isset($update->components_update)){
							$counter = count($update->components_update);
							foreach ((array)$update->components_update as $key => $current_model) {

								// updates_checked. checked test
									$updates_checked_key = 'components_update_' . $key;
									if (!isset($updates_checked->{$updates_checked_key}) || $updates_checked->{$updates_checked_key}!==true) {
										// skip checked false item
										debug_log(__METHOD__
											. " Skipped updates item " . PHP_EOL
											. ' updates_checked_key : ' . $updates_checked_key . PHP_EOL
											. ' current_model : ' . to_string($current_model)
											, logger::WARNING
										);
										continue;
									}

								// CLI process data
									if ( running_in_cli()===true ) {
										common::$pdata->msg	= 'Updating components_update ' . $key+1 . ' of ' . $counter . ' | ' . $current_model;
										common::$pdata->data = $current_model;
										common::$pdata->memory = dd_memory_usage();
										// send to output
										print_cli(common::$pdata);
									}

								debug_log(__METHOD__ . PHP_EOL
									. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
									. " EXECUTING COMPONENTS_UPDATE ... " . PHP_EOL
									. " current_model: $current_model " . PHP_EOL
									. " memory usage: " . dd_memory_usage() . PHP_EOL
									. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
									, logger::WARNING
								);

								// log line
									$log_line  = PHP_EOL . date('c') . ' Updating [components_update] '. ($key+1) .' )))))))))))))))))))))))))))))))))))))))';
									$log_line .= PHP_EOL . 'model: ' . $current_model;
									file_put_contents($update_log_file, $log_line, FILE_APPEND | LOCK_EX);

								$components_update[] = update::components_update(
									$current_model,
									$update_version
								);
								$msg[] = "Updated component: ".to_string($current_model);

								debug_log(__METHOD__
									." Updated component " . $current_model
									, logger::DEBUG
								);

								// log line
									$log_line  = PHP_EOL . 'result: Updated component: ' . $current_model;
									file_put_contents($update_log_file, $log_line, FILE_APPEND | LOCK_EX);

								// let GC do the memory job
								sleep(1);
								// Forces collection of any existing garbage cycles
								gc_collect_cycles();
							}//end foreach ((array)$update->components_update as $current_model)
						}
						break;

					case 'run_scripts':
						// 3 run_scripts
						if(isset($update->run_scripts)){
							$counter = count($update->run_scripts);
							foreach ((array)$update->run_scripts as $key => $current_script) {

								// updates_checked. checked test
									$updates_checked_key = 'run_scripts_' . $key;
									if (!isset($updates_checked->{$updates_checked_key}) || $updates_checked->{$updates_checked_key}!==true) {
										// skip checked false item
										debug_log(__METHOD__
											. " Skipped updates item " . PHP_EOL
											. ' updates_checked_key : ' . $updates_checked_key . PHP_EOL
											. ' current_script : ' . to_string($current_script)
											, logger::WARNING
										);
										continue;
									}

								// CLI process data
									if ( running_in_cli()===true ) {
										common::$pdata->msg	= 'Updating run_scripts ' . $key+1 . ' of ' . $counter;
										common::$pdata->data = $current_script;
										common::$pdata->memory = dd_memory_usage();
										// send to output
										print_cli(common::$pdata);
									}

								debug_log(__METHOD__ . PHP_EOL
									. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
									. " EXECUTING RUN_SCRIPTS ... " . PHP_EOL
									. " current_script: " . to_string($current_script) . PHP_EOL
									. " memory usage: " . dd_memory_usage() . PHP_EOL
									. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
									, logger::WARNING
								);

								// log line
									$log_line  = PHP_EOL . date('c') . ' Updating [run_scripts] '. ($key+1) .' )))))))))))))))))))))))))))))))))))))))';
									$log_line .= PHP_EOL . 'current_script: ' . to_string($current_script);
									file_put_contents($update_log_file, $log_line, FILE_APPEND | LOCK_EX);

								$run_scripts_response	= update::run_scripts($current_script);
								$cmsg			= $run_scripts_response->msg;
								$msg[]			= "Updated run scripts: ".to_string($cmsg);

								if ($run_scripts_response->result===false) {

									array_push($msg, 'Error on run_scripts: '.to_string($current_script));

									debug_log(__METHOD__." Error on run_scripts ".PHP_EOL
										. 'The result is false. Check your script: ' .PHP_EOL
										. 'current_script: ' .to_string($current_script) .PHP_EOL
										. 'run_scripts_response: ' .json_encode($run_scripts_response, JSON_PRETTY_PRINT) .PHP_EOL
										. 'Note that the run_scripts loop will continue with the next script.'
										, logger::ERROR
									);

									// log line
										$log_line  = PHP_EOL . 'ERROR [run_scripts] ' . ($key+1);
										$log_line .= PHP_EOL . 'The result is false. Check your script';
										file_put_contents($update_log_file, $log_line, FILE_APPEND | LOCK_EX);

									// msg update
										$msg[] = 'Error updating Dédalo data';
										if (isset($run_scripts_response->msg)) {
											$msg[] = $run_scripts_response->msg;
										}

									// errors
										if (isset($run_scripts_response->errors)) {
											$response->errors = [...$response->errors, ...$run_scripts_response->errors];
										}

									// stop_on_error
										if (isset($current_script->stop_on_error) && $current_script->stop_on_error===true) {

											// CLI process data
												if ( running_in_cli()===true ) {
													common::$pdata->msg	= '****Updating run_scripts ' . $key+1 . ' of ' . $counter;
													common::$pdata->data = $current_script;
													common::$pdata->memory = dd_memory_usage();
													common::$pdata->response = $run_scripts_response;
													// send to output
													print_cli(common::$pdata);
												}

											$response->result	= false ;
											$response->msg		= $msg;
											$response->errors[] = 'unable to run update script';
											return $response;
										}
								}

								// log line
									$log_line = PHP_EOL . 'result: script executed: ' . to_string($run_scripts_response->result);
									file_put_contents($update_log_file, $log_line, FILE_APPEND | LOCK_EX);

								// let GC do the memory job
								sleep(1);
								// Forces collection of any existing garbage cycles
								gc_collect_cycles();
							}//end foreach ((array)$update->run_scripts as $current_script)
						}
						break;
				}
			}

			// Table matrix_updates data
				$version_to_update			= update::get_update_version();
				$version_to_update_string	= implode('.', $version_to_update);
				$new_version				= update::update_dedalo_data_version($version_to_update_string);
				$msg[]						= 'Updated Dédalo data version: '.to_string($version_to_update_string);

			// response
			array_push($msg, 'Updated version successfully');
			$response->result	= true ;
			$response->msg		= $msg;

		} catch (Exception $e) {
			$response->result = false;
			$response->msg[] = 'Update failed: ' . $e->getMessage();
			$response->errors[] = $e->getMessage();
			debug_log(__METHOD__ . " Update failed with exception: " . $e->getMessage(), logger::ERROR);
		} finally {
			// Always restore the original log state
			logger_backend_activity::$enable_log = $original_log_state;
		}

		return $response;
	}//end update_version



	/**
	* SQL_UPDATE
	* Executes a single raw SQL statement against the PostgreSQL connection.
	*
	* Used by update_version() to run DDL/DML migration queries (CREATE TABLE,
	* ALTER COLUMN, UPDATE datos ... etc.) defined in the update descriptor's
	* SQL_update array. Each call is atomic at the pg_query level; transactions
	* within the query string itself are the caller's responsibility.
	*
	* On failure the PostgreSQL error is captured via pg_last_error() and included
	* in the response message. The update_version() caller treats a false result
	* as a hard abort to prevent data corruption.
	*
	* @param string $SQL_update  Raw SQL string to execute (may include multiple
	*                            statements wrapped in DO $$ … $$ or plain DDL)
	* @return object $response
	*   stdClass with:
	*     bool   result — true on success, false on pg_query failure
	*     string msg    — human-readable status or pg_last_error() on failure
	*/
	public static function SQL_update( string $SQL_update ) : object {

		// response default
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';

		// exec query
			$result = pg_query(DBi::_getConnection(), $SQL_update);
			if($result===false) {
				// error case
				debug_log(__METHOD__
					." Error Processing SQL_update Request ". PHP_EOL
					. pg_last_error(DBi::_getConnection()) .PHP_EOL
					. 'SQL_update: '.to_string($SQL_update)
					, logger::ERROR
				);
				$response->msg .= " Error Processing SQL_update Request: ". pg_last_error(DBi::_getConnection());
				return $response;
			}

		// debug info
			debug_log(__METHOD__
				." Executed database update: ".to_string($SQL_update) .PHP_EOL
				." memory usage: " . dd_memory_usage() . PHP_EOL
				, logger::DEBUG
			);

		// response OK
			$response->result	= true;
			$response->msg		= 'Executed database update: '.to_string($SQL_update);


		return (object)$response;
	}//end SQL_update



	/**
	* COMPONENTS_UPDATE
	* Iterates ALL ontology sections and calls each matching component's
	* static update_data_version() hook for every stored record.
	*
	* The method:
	*  1. Resolves all section tipos from the ontology via ontology_utils::get_ar_tipo_by_model('section').
	*  2. Skips section tipos whose underlying PostgreSQL table does not exist yet
	*     (guards against partially migrated schemas).
	*  3. Skips sections that have no records (pg_num_rows < 1).
	*  4. Finds the component tipos of $model_name that exist in each section using
	*     section::get_ar_children_tipo_by_model_name_in_section() with recursive/virtual resolution.
	*  5. Fetches every row in the section using section::get_resource_all_section_records_unfiltered()
	*     and streams the pg result set row-by-row to keep peak memory low.
	*  6. For each (row × component_tipo × lang) triple, instantiates the component with
	*     cache=false (critical: prevents the component cache from accumulating across
	*     thousands of records and exhausting memory), calls get_data(), and dispatches
	*     update_data_version($update_options).
	*  7. Interprets the result code returned by update_data_version():
	*       0 — component class has no migration for this version; skip remaining
	*           (row × component × lang) iterations via continue 4
	*       1 — data changed; set_data() + Save() with save_modified=false so that
	*           the section's modification timestamp is not clobbered by the migration
	*       2 — data required no transformation; do nothing
	*  8. Calls usleep(10000) + gc_collect_cycles() every 5 001 rows and after each
	*     section to give the GC a chance to reclaim memory during long runs.
	*
	* Special cases:
	*  - DEDALO_ACTIVITY_SECTION_TIPO is normally skipped unless $model_name is one of
	*    component_filter, component_autocomplete, or component_ip, which need updating
	*    within the activity section too.
	*  - The time-machine update block is currently commented out (preserved for reference).
	*  - A large commented-out $ar_section_skip list is preserved for historical reference.
	*
	* @param string $model_name     PHP class name of the component to update
	*                               (e.g. 'component_date', 'component_input_text')
	* @param array  $update_version Target version triple [major, medium, minor] passed
	*                               through to update_data_version() as update_options->update_version
	* @return bool  Always true; individual per-component errors are logged but do not
	*               halt the iteration
	*/
	public static function components_update( string $model_name, array $update_version ) : bool {

		// Existing db tables
		// Gets array of all db tables
		$tables = (array)backup::get_tables();

		$ar_section_tipo	= ontology_utils::get_ar_tipo_by_model('section');
		$n_sections			= count($ar_section_tipo);
		foreach ($ar_section_tipo as $current_section_tipo) {

			debug_log(__METHOD__ . PHP_EOL
				. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
				. " UPDATING COMPONENT ... " . PHP_EOL
				. " components_update model_name: $model_name " . PHP_EOL
				. " components_update current_section_tipo: $current_section_tipo " . PHP_EOL
				. " components_update update_version: ".to_string($update_version) . PHP_EOL
				. " components_update memory usage: " . dd_memory_usage() . PHP_EOL
				. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
				, logger::WARNING
			);

			$start_time = start_time();
			$before = memory_get_usage();

			$current_section_label = ontology_node::get_term_by_tipo($current_section_tipo, DEDALO_APPLICATION_LANG, true);


			// Activity data is not updated [REMOVED 29-08-2018 TO ALLOW FILTER AND FILTER MASTER UPDATES]
				if($current_section_tipo===DEDALO_ACTIVITY_SECTION_TIPO) {
					# component_ip, component_autocomplete, component_autocomplete_ts, component_date, component_input_text, component_filter
					if ($model_name==='component_filter' || $model_name==='component_autocomplete' || $model_name==='component_ip') {
						# Do the update
					}else{
						# Skip update
						continue;
					}
				}

			// Skip sections
				// $ar_section_skip = [

				// 	'lg1', // lenguajes
				// 	'on1', // omomasticos
				// 	'dc1', // cronologicos
				// 	'ts1', // tematicos
				// 	#'hu1', // hungria
				// 	#'cu1', // cuba
				// 	"es1",
				// 	"fr1",
				// 	"dz1",
				// 	"pt1",
				// 	"lg1",
				// 	"ma1",
				// 	"mupreva2434",
				// 	"mupreva2435",
				// 	"mupreva2436",
				// 	"mupreva2437",
				// 	"mupreva2438",
				// 	"mupreva357",
				// 	"mupreva123",
				// 	"mupreva21",
				// 	"mupreva22",
				// 	"mupreva1",
				// 	"mupreva120",
				// 	"mupreva1258",
				// 	"mupreva1385",
				// 	"mupreva156",
				// 	"mupreva159",
				// 	"mupreva162",
				// 	"mupreva20",
				// 	"mupreva2384",
				// 	"mupreva2541",
				// 	"mupreva268",
				// 	"mupreva380",
				// 	"mupreva398",
				// 	"mupreva473",
				// 	"mupreva500",
				// 	"mupreva770",
				// 	"dd1500",
				// 	"material1",
				// 	"numisdata4",
				// 	"hierarchy1",
				// 	"technique1",
				// 	"rsc332",
				// 	"rsc170",
				// 	"rsc205",
				// 	"mdcat1957",
				// 	"nexus1",
				// 	"mdcat2605",
				// 	"mdcat1957",
				// 	"dd1266",
				// 	"dd1324",
				// 	"dd1000",
				// 	"tchi1",
				// 	"mdcat2608"
				// 	/**/
				// ];
				// if (in_array($current_section_tipo, $ar_section_skip)) {
				// 	continue;
				// }

			// current_table. Test if target table exists (avoid errors on update components of "too much updated" structures)
				$current_table = common::get_matrix_table_from_tipo($current_section_tipo);
				if (empty($current_table) || !in_array($current_table, $tables) ) {
					debug_log(__METHOD__
						." Skipped section ($current_section_tipo) because table ($current_table) do not exists " .PHP_EOL
						.' updating component: ' . $model_name
						, logger::ERROR
					);
					continue;
				}

			// Search all records of current section
				$result = section::get_resource_all_section_records_unfiltered($current_section_tipo);
				$n_rows = pg_num_rows($result);
				if ($n_rows<1) {
					// Skip empty sections
					debug_log(__METHOD__
						." Skipped current_section_tipo '$current_section_tipo'. (Empty records) " .PHP_EOL
						.' updating component: ' . $model_name
						, logger::WARNING
					);
					continue;
				}

			// section components
				$ar_component_tipo = section::get_ar_children_tipo_by_model_name_in_section(
					$current_section_tipo,
					[$model_name], // array ar_model_name_required
					true, // bool from_cache
					true, // bool resolve_virtual
					true, // bool recursive
					true // bool search_exact
				);
				if (empty($ar_component_tipo)) {
					// Skip empty components sections
					debug_log(__METHOD__
						." Skipped current_section_tipo '$current_section_tipo'. (Empty components of type $model_name)" .PHP_EOL
						.' updating component: ' . $model_name
						, logger::WARNING
					);
					continue;
				}else{
					debug_log(__METHOD__
						.' Updating section_tipo: ' . $current_section_tipo .PHP_EOL
						.' updating component: ' . $model_name .PHP_EOL
						.' n components: ' . count($ar_component_tipo) .PHP_EOL
						.' n langs: ' . count(DEDALO_PROJECTS_DEFAULT_LANGS)
						, logger::WARNING
					);
				}

			// Notify to log to know script state
				$n_components = count($ar_component_tipo);
				debug_log(__METHOD__
					." Updating components of section: $current_section_tipo (records: $n_rows, component: $model_name : $n_components) Total: ". ($n_rows*$n_components) . PHP_EOL
					.' updating component: ' . $model_name
					, logger::WARNING
				);

			// CLI process data
				if ( running_in_cli()===true ) {
					if (!isset(common::$pdata)) {
						common::$pdata = new stdClass();
					}
					common::$pdata->table = $current_table;
					common::$pdata->memory = '';
					common::$pdata->counter = 0;
					common::$pdata->section_tipo = $current_section_tipo;
					common::$pdata->section_n_rows = $n_rows;
					common::$pdata->n_sections = $n_sections;
					common::$pdata->section_counter = isset(common::$pdata->section_counter)
						? common::$pdata->section_counter++
						: 0;
					common::$pdata->n_components = $n_components;
				}

			// Iterate database resource directly to minimize memory requirements on large arrays
				$i=0; // $tm=0;
				while ($row = pg_fetch_assoc($result)) {

					$section_id = $row['section_id'];

					// CLI process data
					if ( running_in_cli()===true ) {
						common::$pdata->msg = (label::get_label('processing') ?? 'Processing') . ': components_update'
							. ' | '. $model_name
							. ' | section: ' 	.$current_section_label. ' ('. $current_section_tipo.')'
							. ' | section_id: '	. $section_id;
						common::$pdata->memory = (common::$pdata->counter % 5000 === 0)
							? dd_memory_usage() // update memory information once every 5000 items
							: common::$pdata->memory;
						common::$pdata->counter++;
						// send to output
						print_cli(common::$pdata);
					}

					foreach($ar_component_tipo as $current_component_tipo) {

						// (!) Translatable components use DEDALO_DATA_NOLAN; non-translatable iterate all project langs.
						$ar_langs = ontology_node::get_translatable( $current_component_tipo )
							? [DEDALO_DATA_NOLAN]
							: DEDALO_PROJECTS_DEFAULT_LANGS;

						foreach($ar_langs as $current_lang) {

							// component . Update component data
							$component = component_common::get_instance(
								$model_name,
								$current_component_tipo,
								$section_id,
								'update',
								$current_lang,
								$current_section_tipo,
								false // bool cache (!) Set false always for update to prevent memory issues (is sync with section cache)
							);
							$component->get_data();
							$data_unchanged	= $component->get_data_unchanged();
							$reference_id	= $current_section_tipo.'.'.$section_id.'.'.$current_component_tipo;

							$update_options = new stdClass();
								$update_options->update_version	= $update_version;
								$update_options->data_unchanged	= $data_unchanged;
								$update_options->reference_id	= $reference_id;
								$update_options->tipo			= $current_component_tipo;
								$update_options->section_id		= $section_id;
								$update_options->section_tipo	= $current_section_tipo;
								$update_options->context		= 'update_component_data';

							$response = $model_name::update_data_version($update_options);
							switch ((int)$response->result) {
								case 0:
									// skip all updates of current component because don't have update to this version
									continue 4;

								case 1:
									// component data is modified. Set and save
										$component->updating_data = true;
										$component->set_data($response->new_data);
										$component->update_diffusion_info_propagate_changes = false;
										$component->set_data_resolved($response->new_data); // Fix as resolved

									// section set as not save_modified
										$component_section = $component->get_my_section();
										$component_section->save_modified = false; # Change temporally section param 'save_modified' before save to avoid overwrite possible modified import data

									// save component
										$component->Save();

									// section unset to free memory
										unset($component_section);
									break;

								case 2:
									// Current data don't need update or is already managed by component itself
									break;

								default:
									// nothing to do here...
									break;
							}

							// component unset to free memory
								unset($component);

							#
							# TIME MACHINE . Update Time_machine component data
							/*
							$ar_time_machine_obj = tool_time_machine::get_ar_component_time_machine($current_component_tipo, $section_id, $current_lang, $current_section_tipo, 0, 0);
							foreach ($ar_time_machine_obj  as $current_time_machine_obj) {
								$data_unchanged = $current_time_machine_obj->get_data();

								# Different options override
								$update_options->data_unchanged = $data_unchanged;
								$update_options->context 		= 'update_time_machine_dato';

								$response 		= $model_name::update_data_version($update_options);
								#debug_log(__METHOD__." UPDATE_DATA_VERSION TIME_MACHINE RESPONSE [$model_name][{$current_section_tipo}-{$section_id}]: result: ".to_string($response->result), logger::DEBUG);
								if($response->result === 1){
									$current_time_machine_obj->set_data($response->new_data);
									$current_time_machine_obj->Save();
									#debug_log(__METHOD__." UPDATED TIME MACHINE data from component [$model_name][{$current_section_tipo}-{$current_component_tipo}-{$current_lang}-{$section_id}] ".to_string($tm), logger::DEBUG);
									$tm++;
									#$total_update[$current_section_tipo][$current_component_tipo][$current_lang]['tm'] = (int)$tm;
									#echo $response->msg;
								}else{
									#echo $response->msg;
									if($response->result === 0){
										continue 5;
									}
								}
							}//end foreach ($ar_time_machine_obj  as $current_time_machine_obj)
							*/
						}//end foreach ($ar_langs as $current_lang)

					}//end foreach($ar_component_tipo as $current_component_tipo)

					if ($i===0) {
						// wait for 10 milliseconds every 5000 records
						usleep(10000);
						// Forces collection of any existing garbage cycles
						gc_collect_cycles();

						debug_log(__METHOD__
							. " Updated section: $current_section_tipo - section_id: $section_id"
							, logger::DEBUG
						);
					}
					$i++;
					if ($i>5001) {
						$i = 0;
					}
				}//end while ($row = pg_fetch_assoc($result))


			// clean vars to free memory
			unset($result);
			unset($ar_component_tipo);

			// let GC do the memory job
			usleep(10000);

			// Forces collection of any existing garbage cycles
			gc_collect_cycles();

			// section_tipo summary
				$after			= memory_get_usage();
				$allocatedSize	= ($after - $before);
				$total_time		= exec_time_unit($start_time, 'sec').' sec';
				debug_log(__METHOD__
					. " Finished section: $current_section_tipo " . PHP_EOL
					. ' allocatedSize: ' . to_string($allocatedSize) . PHP_EOL
					. ' section time secs: ' .$total_time
					, logger::DEBUG
				);

		}//end foreach ($ar_section_tipo as $current_section_tipo)


		return true;
	}//end components_update



	/**
	* RUN_SCRIPTS
	* Dispatches a single script descriptor by calling the specified static method
	* via call_user_func_array().
	*
	* The script descriptor object ($script_obj) must carry:
	*   string script_class   — PHP class name (must be autoloaded or pre-included)
	*   string script_method  — public static method name on that class
	*   mixed  script_vars    — arguments forwarded to the method:
	*                           null / omitted → no arguments
	*                           array → spread as positional args
	*                           any other value → wrapped in a single-element array
	*
	* Return-value normalisation:
	*   - If the called method returns an object, that object replaces $response entirely
	*     (callers expect result/msg/errors properties on the returned object).
	*   - If the called method returns false, result is set to false.
	*   - Any other truthy return value is converted to string for $response->msg and
	*     result is set to true.
	*
	* Exceptions are caught (but NOT re-thrown); result is left false.
	*
	* @param object $script_obj  Script descriptor; must have script_class and script_method;
	*                            optionally script_vars (null|array|mixed)
	* @return object $response
	*   stdClass with:
	*     bool   result  — true on success, false on failure or caught exception
	*     array  errors  — list of error strings (may be empty)
	*     string msg     — status or error description
	*/
	public static function run_scripts( object $script_obj ) : object {

		// response default
			$response = new stdClass();
				$response->result 	= false;
				$response->errors 	= [];
				$response->msg 		= 'Error. Request failed ['.__METHOD__.']';

		try {

			$script_class	= $script_obj->script_class;
			$script_method	= $script_obj->script_method;
			$script_args	= isset($script_obj->script_vars) && !is_array($script_obj->script_vars)
				? [$script_obj->script_vars] // object|string case
				: $script_obj->script_vars; // array|null case

			// exec function
			$result = call_user_func_array(
				$script_class.'::'.$script_method,
				$script_args ?? []
			);

			if (is_object($result)) {
				$response = $result;
			}else if ($result===false) {
				$response->result	= false;
				$response->msg		.= ' False result is received for: '.$script_class.'::'.$script_method;
			}else{
				$response->result	= true;
				$response->msg		= ' '.to_string($result);
			}

			debug_log(__METHOD__
				. " Executed update script  " . PHP_EOL
				. ' script_method: ' . $script_method .PHP_EOL
				. ' memory usage: ' . dd_memory_usage() . PHP_EOL
				, logger::DEBUG
			);

			// clean vars
			unset($result);

		} catch (Exception $e) {

			debug_log(__METHOD__
				." Caught exception on run_scripts ($script_method): ". PHP_EOL
				. $e->getMessage() .PHP_EOL
				.' memory usage: ' . dd_memory_usage() . PHP_EOL
				, logger::ERROR
			);
		}


		return $response;
	}//end run_scripts



	/**
	* UPDATE_DEDALO_DATA_VERSION
	* Records the newly reached data version in the matrix_updates table.
	*
	* Inserts a JSONB row with the following shape:
	*   { "dedalo_version": "<major>.<medium>.<minor>", "update_date": "YYYY-MM-DD HH:MM:SS" }
	*
	* This table is the authoritative source for get_current_data_version(); the most
	* recent row (ordered by semantic version DESC, i.e. string_to_array(data->>'dedalo_version','.')::int[]
	* so that 6.8.10 ranks above 6.8.9) determines which update step will be offered on
	* the next maintenance screen load.
	*
	* A parameterised query ($1) is used instead of string concatenation because
	* json_encode() does not escape single quotes, making direct interpolation unsafe
	* if a caller ever passes a version string with special characters.
	*
	* @param string $version_to_update  Dot-separated version string, e.g. "7.0.0"
	* @return bool  Always true (failures are logged but not surfaced as a false return)
	*/
	public static function update_dedalo_data_version( string $version_to_update ) : bool {

		$values = new stdClass();
			$values->dedalo_version = $version_to_update;
			$values->update_date 	= date('Y-m-d H:i:s',time());

		$str_values = json_encode($values);

		// Use parameter binding (security: json_encode does not escape single quotes,
		// so concatenation into a SQL literal would be vulnerable if any callable
		// passes a $version_to_update containing a single quote).
		matrix_db_manager::exec_search(
			'INSERT INTO "matrix_updates" ("data") VALUES ($1)',
			[$str_values]
		);
		debug_log(__METHOD__
			." Updated table 'matrix_updates' with values: ". PHP_EOL
			. json_encode($str_values, JSON_PRETTY_PRINT)
			, logger::DEBUG
		);

		return true;
	}//end update_dedalo_data_version



	/**
	* CONVERT_TABLE_DATA
	* Applies a data-transformation callback to every row of a list of raw PostgreSQL
	* matrix tables, updating the 'datos' column in place.
	*
	* This is a higher-level helper used by upgrade scripts (e.g. v6_to_v7) to
	* bulk-rewrite section datos JSON without going through the component layer.
	* It delegates row iteration to tables_rows_iterator() and additionally:
	*  - decodes the raw 'datos' JSON column for each row
	*  - runs check_section_data() to backfill any missing metadata fields
	*  - calls the transformation method ($action) on the class ($called_class)
	*  - re-encodes and writes the result back via a prepared UPDATE statement
	*
	* The $action string may optionally include a class prefix using '::' notation
	* (e.g. 'v6_to_v7::convert_section_dato_to_data'). When provided, the class
	* part overrides $called_class so that upgrade scripts in subclasses can delegate
	* to a specific converter class.
	*
	* Null return values from the $action method are treated as a skip signal —
	* the row is not updated. All other return values are JSON-encoded and saved.
	*
	* Uses DBi::$prepared_statements to cache per-table prepared UPDATE statements
	* across rows, avoiding repeated pg_prepare() calls for the same table.
	*
	* @param array  $ar_tables  List of PostgreSQL table names to process
	* @param string $action     Static method name (optionally 'ClassName::method')
	*                           called as $called_class::{$action}($datos)
	* @return bool  Always true; row-level errors are logged but do not halt iteration
	*/
	public static function convert_table_data(array $ar_tables, string $action) : bool {

		// called_class extends current class
			$called_class = get_called_class();
			if (strpos($action, '::')!==false) {
				$parts			= explode('::', $action);
				$called_class	= $parts[0];
				$action			= $parts[1];
			}

		debug_log(__METHOD__ . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			. " CONVERTING ... " . PHP_EOL
			. " convert_table_data - action: $action " . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			, logger::WARNING
		);

		// CLI process data
			if ( running_in_cli()===true ) {
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
				common::$pdata->table = '';
				common::$pdata->memory = '';
				common::$pdata->counter = 0;
			}

		update::tables_rows_iterator($ar_tables, function($row, $table) use($called_class, $action, $ar_tables) {

			$id				= $row['id'];
			$section_id		= $row['section_id'];
			$section_tipo	= $row['section_tipo'];
			$datos			= json_handler::decode($row['datos']);

			// CLI process data
				if ( running_in_cli()===true ) {
					common::$pdata->msg	= (label::get_label('processing') ?? 'Processing') . ': convert_table_data'
						. ' | table: ' 			. $table
						. ' | id: ' 			. $id
						. ' | section_tipo: ' 	. $section_tipo
						. ' | section_id: '  	. ($section_id);
					common::$pdata->memory = (common::$pdata->counter % 5000 === 0)
						? dd_memory_usage() // update memory information once every 5000 items
						: common::$pdata->memory;
					common::$pdata->table = $table;
					common::$pdata->section_tipo = $section_tipo;
					common::$pdata->counter++;
					common::$pdata->ar_tables = $ar_tables;
					// send to output
					print_cli(common::$pdata);
				}

			if (!empty($datos)) {

				update::check_section_data($id, $table, $section_id, $section_tipo, $datos);

				$section_data = $called_class::{$action}( $datos ); // like 'convert_section_dato_to_data'
				if($section_data===null){
					return;
				}
				$section_data_encoded = json_encode($section_data);

				$strQuery	= "UPDATE $table SET datos = $1 WHERE id = $2 ";

				// Direct
				// $result = pg_query_params(DBi::_getConnection(), $strQuery, array( $section_data_encoded, $id ));

				// With prepared statement
				$stmt_name = __METHOD__ . '_' . $table;
				if (!isset(DBi::$prepared_statements[$stmt_name])) {
					pg_prepare(
						DBi::_getConnection(),
						$stmt_name,
						$strQuery
					);
					// Set the statement as existing.
					DBi::$prepared_statements[$stmt_name] = true;
				}
				$result = pg_execute(
					DBi::_getConnection(),
					$stmt_name,
					[$section_data_encoded, $id]
				);

				if($result===false) {
					$msg = "Failed Update section_data $id";
					debug_log(__METHOD__
						." ERROR: $msg "
						, logger::ERROR
					);
					return;
				}
			}else{
				debug_log(__METHOD__
					." ERROR: Empty datos from: $table - $id "
					, logger::ERROR
				);
			}
		});

		return true;
	}//end convert_table_data



	/**
	* TABLES_ROWS_ITERATOR
	* Low-level row streaming helper: iterates every row in each supplied table
	* and invokes a callback for each, then frees PostgreSQL result resources.
	*
	* Memory strategy:
	*  - Fetches the minimum and maximum primary-key values first (two fast index scans).
	*  - Iterates from $min to $max with keyset pagination (WHERE id > $last_id ORDER BY id
	*    LIMIT $batch_size), so that the PostgreSQL client never holds the entire result set
	*    in memory at once. Rows deleted since the min/max scan are silently skipped without
	*    producing empty result sets.
	*  - pg_free_result() is called after every batch to release the PHP resource handle.
	*  - time_nanosleep(0, 5000) + gc_collect_cycles() run every 10 000 rows to keep
	*    PHP memory usage stable across multi-million-row tables.
	*  - set_time_limit(0) prevents the PHP execution timeout from aborting long runs.
	*
	* The callback signature expected is: function(array $row, string $table, int $max): void
	*   $row   — associative array of all columns for the current row
	*   $table — name of the current table
	*   $max   — highest id in the table (available for progress reporting)
	*
	* @param array    $ar_tables  List of PostgreSQL table names to iterate
	* @param callable $callback   Called once per row; return value is ignored
	* @return bool  Always true
	*/
	public static function tables_rows_iterator(array $ar_tables, $callback) : bool {

		// Maximum execution time
		set_time_limit(0);

		// CLI process data
			if ( running_in_cli()===true ) {
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
				common::$pdata->table = '';
				common::$pdata->memory = '';
				common::$pdata->counter = 0;
			}

		foreach ($ar_tables as $table) {

			debug_log(__METHOD__ . PHP_EOL
				. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
				. " CONVERTING ... " . PHP_EOL
				. " tables_rows_iterator - table: $table " . PHP_EOL
				. " tables_rows_iterator memory usage: " . dd_memory_usage() . PHP_EOL
				. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
				, logger::WARNING
			);

			// CLI process data (table started)
				if ( running_in_cli()===true ) {
					common::$pdata->msg = (label::get_label('processing') ?? 'Processing') . ': tables_rows_iterator started'
						. ' | table: ' . $table;
					common::$pdata->table = $table;
					// send to output
					print_cli(common::$pdata);
				}

			// Get last id in the table
			$strQuery 	= "SELECT id FROM $table ORDER BY id DESC LIMIT 1 ";
			$result 	= matrix_db_manager::exec_search($strQuery, []);
			if(!$result) {
				debug_log(__METHOD__
				   .' ERROR: No result from query: ' . $strQuery
				   , logger::ERROR
				);
				continue;
			}
			$rows 		= pg_fetch_assoc($result);
			pg_free_result($result);
			if (!$rows) {
				continue;
			}
			$max = (int)$rows['id'];

			// Get first id in the table
			$min_strQuery	= "SELECT id FROM $table ORDER BY id LIMIT 1 ";
			$min_result		= matrix_db_manager::exec_search($min_strQuery, []);
			if(!$min_result) {
				debug_log(__METHOD__
				   .' ERROR: No result from query: ' . $min_strQuery
				   , logger::ERROR
				);
				continue;
			}
			$min_rows = pg_fetch_assoc($min_result);
			pg_free_result($min_result);
			if (!$min_rows) {
				continue;
			}
			$min = (int)$min_rows['id'];

			//$min = 1;

			// iterate in batches to avoid one-SELECT-per-ID overhead
			// Uses keyset pagination (WHERE id > $last_id ORDER BY id LIMIT $batch_size)
			// which only issues as many queries as needed (ceil(row_count / batch_size)),
			// skipping gaps from deleted rows without useless empty result sets.
			$batch_size = 1000;
			$i_ref = 0; $start_time = start_time();
			$last_id = $min - 1;
			while ($last_id < $max) {

				$strQuery = "SELECT * FROM $table WHERE id > $1 ORDER BY id LIMIT $2";
				$result	  = matrix_db_manager::exec_search($strQuery, [
					$last_id,
					$batch_size
				]);
				if($result===false) {
					$msg = "Failed Search batch after id $last_id. Data is not found.";
					debug_log(__METHOD__
						." ERROR: $msg "
						, logger::ERROR
					);
					break;
				}
				$n_rows = pg_num_rows($result);

				if ($n_rows<1) {
					pg_free_result($result);
					break;
				}

				while($row = pg_fetch_assoc($result)) {

					$id	= $row['id'];
					$callback( $row, $table, $max); // like 'convert_section_dato_to_data'

				}// end while

				// release result to prevent memory leak
				pg_free_result($result);

				// advance last_id for next batch
				$last_id = $id;

				// log info each 10000 rows
					if ($i_ref===0 && isset($id)) {
						debug_log(__METHOD__
							. " Partial update of section data table: $table - id: $id - total: $max - time min: ".exec_time_unit($start_time,'min')
							, logger::DEBUG
						);

						if ( running_in_cli()===true ) {
							common::$pdata->msg = (label::get_label('processing') ?? 'Processing') . ': tables_rows_iterator'
								. ' | table: ' . $table . ' (' . $id . '/' . $max . ')';
							common::$pdata->memory = dd_memory_usage();
							print_cli(common::$pdata);
						}

						// let GC do the memory job
						time_nanosleep(0, 5000); // Slept for 5000 nanoseconds
						// Forces collection of any existing garbage cycles
						gc_collect_cycles();
					}

				// update and reset counter
					if ( running_in_cli()===true ) {
						common::$pdata->counter += $n_rows;
					}

					$i_ref += $n_rows;
					if ($i_ref >= 10000) {
						$i_ref = 0;
					}
			}//end while ($last_id < $max)

			// let GC do the memory job
			sleep(1);
			// Forces collection of any existing garbage cycles
			gc_collect_cycles();
		}//end foreach ($ar_tables as $key => $table)


		return true;
	}//end tables_rows_iterator



	/**
	* CHECK_SECTION_DATA
	* Validates and backfills required metadata fields on a section's decoded datos object.
	*
	* During migration, older section rows may lack fields that were introduced in later
	* versions. This method repairs the following missing fields in place (by reference):
	*   section_id      — copied from the $section_id column value
	*   section_tipo    — copied from the $section_tipo column value
	*   created_date    — looked up from the earliest matrix_time_machine row for this
	*                     section (using $section_id + $section_tipo as the key)
	*   created_by_userID — likewise taken from the earliest time-machine row
	*
	* If any field was absent and is now set, the repaired datos JSON is immediately
	* written back to the database using a prepared UPDATE on the 'data' column
	* (not 'datos' — note the column name differs from the v6 convention).
	*
	* Prepared statements are cached in DBi::$prepared_statements keyed by
	* __METHOD__ . '_' . $table so that repeated calls for the same table reuse the
	* same server-side plan.
	*
	* @param string|int $id           Primary-key value of the row being checked
	* @param string     $table        PostgreSQL table name ('matrix_*')
	* @param string|int $section_id   Section record identifier (row content)
	* @param string     $section_tipo Ontology tipo string identifying the section type
	* @param object     &$data        Decoded datos object, passed by reference so that
	*                                 the caller's copy reflects any backfilled fields
	* @return bool $section_to_save   true if any field was backfilled and saved; false otherwise
	*/
	public static function check_section_data(string|int $id, string $table, string|int $section_id, string $section_tipo, object &$data) : bool {

		$section_to_save = false;

		if(!isset($data->section_id)){
			$data->section_id = $section_id;
			$section_to_save = true;
		}

		if(!isset($data->section_tipo)){
			$data->section_tipo = $section_tipo;
			$section_to_save = true;
		}

		if(!isset($data->created_date) || !isset($data->created_by_userID)) {

			$tm_strQuery = '
				SELECT "timestamp", "userID" FROM matrix_time_machine
				WHERE section_id = $1
				AND section_tipo = $2
				ORDER BY "timestamp" ASC
				LIMIT 1
			';
			$result = matrix_db_manager::exec_search($tm_strQuery, [$section_id, $section_tipo]);
			// query error case
			if($result!==false) {

				// num_rows. Empty case
				$n_rows = pg_num_rows($result);
				if ($n_rows>0) {

					// get columns
					while($rows = pg_fetch_assoc($result)) {
						$timestamp	= $rows['timestamp'];
						$userID		= $rows['userID'];
					}

					debug_log(__METHOD__
						. " Getting row from time_machine DB " . PHP_EOL
						. ' timestamp: ' . to_string($timestamp) . PHP_EOL
						. ' userID: ' . to_string($userID)
						, logger::WARNING
					);

					if(!isset($data->created_date)) {
						$data->created_date = $timestamp;
						$section_to_save = true;
					}

					if(!isset($data->created_by_userID)) {
						$data->created_by_userID = $userID;
						$section_to_save = true;
					}
				}//end if ($n_rows>0)
			}//end if($result!==false)
		}//end if(!isset($data->created_date) || !isset($data->created_by_userID))

		// save section if changes are made
		if($section_to_save === true) {

			$section_data_encoded = json_handler::encode($data);

			$strQuery = "UPDATE $table SET data = $1 WHERE id = $2 ";

			// Direct
			// $result = pg_query_params(DBi::_getConnection(), $strQuery, array( $section_data_encoded, $id ));

			// With prepared statement
			$stmt_name = __METHOD__ . '_' . $table;
			if (!isset(DBi::$prepared_statements[$stmt_name])) {
				pg_prepare(
					DBi::_getConnection(),
					$stmt_name,
					$strQuery
				);
				// Set the statement as existing.
				DBi::$prepared_statements[$stmt_name] = true;
			}
			$result = pg_execute(
				DBi::_getConnection(),
				$stmt_name,
				[$section_data_encoded, $id]
			);


			if($result===false) {
				$msg = "Failed Update section_data section_id: $section_id of $section_tipo in table: $table ";
				debug_log(__METHOD__
					." ERROR: $msg "
					, logger::ERROR
				);
			}

			$msg = "Changed section_data section_id: $section_id of $section_tipo in table: $table to add some missing values";
			debug_log(__METHOD__
				." ERROR: $msg "
				, logger::WARNING
			);
		}

		return $section_to_save;
	}//end check_section_data



}//end update class
