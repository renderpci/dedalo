<?php
/**
* UPDATE
* Manage Dédalo data updates defined in file updates.php
*/
class update {



	/**
	* GET_UPDATES
	* Load file updates/update.php and get var object '$updates'
	* @return object $updates
	*/
	public static function get_updates() {

		include(dirname(__FILE__) .'/updates.php');

		return $updates;
	}//end get_updates



	/**
	* GET_UPDATE_VERSION
	* @return array|null $update_version
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
	* UPDATE_VERSION
	* Updates Dédalo data version.
	* Allow change components data format or add new tables or index
	* @param object $updates_checked
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
			logger_backend_activity::$enable_log = false;
			#RecordObj_time_machine::$save_time_machine_version  = false;

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

						// $response->result	= false ;
						// $response->msg		= $msg;
						// return $response;

						debug_log(__METHOD__." Error on update SQL_update ".PHP_EOL
							. 'The result is false. Check your query sentence: ' .PHP_EOL
							. to_string($current_query) .PHP_EOL
							. 'Note that the update SQL_update loop to be continue with the next one'
							, logger::ERROR
						);

						// log line
							$log_line  = PHP_EOL . 'ERROR [SQL_update] ' . ($key+1);
							$log_line .= PHP_EOL . 'The result is false. Check your query sentence';
							file_put_contents($update_log_file, $log_line, FILE_APPEND | LOCK_EX);
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
					$cmsg					= $run_scripts_response->msg;
					$msg[]					= "Updated run scripts: ".to_string($cmsg);

					if ($run_scripts_response->result===false) {

						array_push($msg, 'Error on run_scripts: '.to_string($current_script));

						// $response->result	= false;
						// $response->msg		= $msg;
						// return $response;

						debug_log(__METHOD__." Error on run_scripts ".PHP_EOL
							. 'The result is false. Check your script: ' .PHP_EOL
							. to_string($current_script) .PHP_EOL
							. 'Note that the run_scripts loop to be continue with the next one'
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
								$response->errors = array_merge($response->errors, $run_scripts_response->errors);
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
						$log_line  = PHP_EOL . 'result: script executed: ' . to_string($run_scripts_response->result);
						file_put_contents($update_log_file, $log_line, FILE_APPEND | LOCK_EX);

					// let GC do the memory job
					sleep(1);
					// Forces collection of any existing garbage cycles
					gc_collect_cycles();
				}//end foreach ((array)$update->run_scripts as $current_script)
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


		return (object)$response;
	}//end update_version



	/**
	* SQL_UPDATE
	* @param string $SQL_update
	* @return object $response
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
	* Iterate ALL structure sections and search components to update based on their model
	* @param string $model_name
	* @param array $update_version
	* @return bool
	*/
	public static function components_update( string $model_name, array $update_version ) : bool {

		// Existing db tables
		// Gets array of all db tables
		$tables = (array)backup::get_tables();

		$ar_section_tipo	= ontology_node::get_ar_tipo_by_model_name('section');
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

						$ar_langs = ontology_node::get_translatable( $current_component_tipo )
							? [DEDALO_DATA_NOLAN]
							: DEDALO_PROJECTS_DEFAULT_LANGS;

						foreach($ar_langs as $current_lang) {

							// component . Update component dato
							$component = component_common::get_instance(
								$model_name,
								$current_component_tipo,
								$section_id,
								'update',
								$current_lang,
								$current_section_tipo,
								false // bool cache (!) Set false always for update to prevent memory issues (is sync with section cache)
							);
							$component->get_dato();
							$dato_unchanged	= $component->get_dato_unchanged();
							$reference_id	= $current_section_tipo.'.'.$section_id.'.'.$current_component_tipo;

							$update_options = new stdClass();
								$update_options->update_version	= $update_version;
								$update_options->dato_unchanged	= $dato_unchanged;
								$update_options->reference_id	= $reference_id;
								$update_options->tipo			= $current_component_tipo;
								$update_options->section_id		= $section_id;
								$update_options->section_tipo	= $current_section_tipo;
								$update_options->context		= 'update_component_dato';

							$response = $model_name::update_dato_version($update_options);
							switch ((int)$response->result) {
								case 0:
									// skip all updates of current component because don't have update to this version
									continue 4;
									break;

								case 1:
									// component data is modified. Set and save
										$component->updating_dato = true;
										$component->set_dato($response->new_dato);
										$component->update_diffusion_info_propagate_changes = false;
										$component->set_dato_resolved($response->new_dato); // Fix as resolved

									// section set as not save_modified
										$component_section = $component->get_my_section();
										$component_section->save_modified = false; # Change temporally section param 'save_modified' before save to avoid overwrite possible modified import data

									// save component
										$component->Save();

									// section unset to free memory
										unset($component_section);
									break;

								case 2:
									// Current dato don't need update or is already managed by component itself
									break;

								default:
									// nothing to do here...
									break;
							}

							// component unset to free memory
								unset($component);

							#
							# TIME MACHINE . Update Time_machine component dato
							/*
							$ar_time_machine_obj = tool_time_machine::get_ar_component_time_machine($current_component_tipo, $section_id, $current_lang, $current_section_tipo, 0, 0);
							foreach ($ar_time_machine_obj  as $current_time_machine_obj) {
								$dato_unchanged = $current_time_machine_obj->get_dato();

								# Different options override
								$update_options->dato_unchanged = $dato_unchanged;
								$update_options->context 		= 'update_time_machine_dato';

								$response 		= $model_name::update_dato_version($update_options);
								#debug_log(__METHOD__." UPDATE_DATO_VERSION TIME_MACHINE RESPONSE [$model_name][{$current_section_tipo}-{$section_id}]: result: ".to_string($response->result), logger::DEBUG);
								if($response->result === 1){
									$current_time_machine_obj->set_dato($response->new_dato);
									$current_time_machine_obj->Save();
									#debug_log(__METHOD__." UPDATED TIME MACHINE dato from component [$model_name][{$current_section_tipo}-{$current_component_tipo}-{$current_lang}-{$section_id}] ".to_string($tm), logger::DEBUG);
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
						// wait for 15 milliseconds every 3000 records
						usleep(15000);
						// Forces collection of any existing garbage cycles
						gc_collect_cycles();

						debug_log(__METHOD__
							. " Updated section: $current_section_tipo - section_id: $section_id"
							, logger::DEBUG
						);
					}
					$i++;
					if ($i>3000) {
						$i = 0;
					}
				}//end while ($row = pg_fetch_assoc($result))


			// clean vars to free memory
			unset($result);
			unset($ar_component_tipo);

			// let GC do the memory job
			sleep(1);

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
	* Simply executes static methods based on received $script_obj properties
	* @param object $script_obj
	* @return object $response
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
	* @param string $version_to_update
	* @return bool
	*/
	public static function update_dedalo_data_version( string $version_to_update ) : bool {

		$values = new stdClass();
			$values->dedalo_version = $version_to_update;
			$values->update_date 	= date('Y-m-d H:i:s',time());

		$str_values = json_encode($values);

		$SQL_update = 'INSERT INTO "matrix_updates" ("datos") VALUES (\''.$str_values.'\');';

		self::SQL_update($SQL_update);
		debug_log(__METHOD__
			." Updated table 'matrix_updates' with values: ". PHP_EOL
			. json_encode($str_values, JSON_PRETTY_PRINT)
			, logger::DEBUG
		);

		return true;
	}//end update_dedalo_data_version



	/**
	* CONVERT_TABLE_DATA
	* Get all data from required tables and apply the action required to every row
	* @param array $ar_tables
	* @param string $action
	* @return bool
	* 	true
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
	* Get the row (with all columns) from required tables and apply the action required to every row
	* @param array $ar_tables
	* @param function $callback
	* @return bool
	* 	true
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

			// CLI process data
				if ( running_in_cli()===true ) {
					common::$pdata->msg = (label::get_label('processing') ?? 'Processing') . ': tables_rows_iterator'
						. ' | table: ' . $table;
					common::$pdata->table = $table;
					common::$pdata->memory = (common::$pdata->counter % 5000 === 0)
						? dd_memory_usage() // update memory information once every 5000 items
						: common::$pdata->memory;
					common::$pdata->counter++;
					// send to output
					print_cli(common::$pdata);
				}

			// Get last id in the table
			$strQuery	= "SELECT id FROM $table ORDER BY id DESC LIMIT 1 ";
			$result		= JSON_RecordDataBoundObject::search_free($strQuery);
			$rows		= pg_fetch_assoc($result);
			if (!$rows) {
				continue;
			}
			$max = $rows['id'];

			// Get first id in the table
			$min_strQuery	= "SELECT id FROM $table ORDER BY id LIMIT 1 ";
			$min_result		= JSON_RecordDataBoundObject::search_free($min_strQuery);
			$min_rows		= pg_fetch_assoc($min_result);
			if (!$min_rows) {
				continue;
			}
			$min = $min_rows['id'];

			//$min = 1;

			// iterate from 1 to last id
			$i_ref = 0; $start_time = start_time();
			for ($i=$min; $i<=$max; $i++) {

				$strQuery	= "SELECT * FROM $table WHERE id = $i ORDER BY id ASC";
				$result		= JSON_RecordDataBoundObject::search_free($strQuery);
				if($result===false) {
					$msg = "Failed Search id $i. Data is not found.";
					debug_log(__METHOD__
						." ERROR: $msg "
						, logger::ERROR
					);
					continue;
				}
				$n_rows = pg_num_rows($result);

				if ($n_rows<1) continue;

				while($row = pg_fetch_assoc($result)) {

					$id	= $row['id'];
					$callback( $row, $table, $max); // like 'convert_section_dato_to_data'

				}// end while

				// log info each 1000
					if ($i_ref===0) {
						debug_log(__METHOD__
							. " Partial update of section data table: $table - id: $id - total: $max - time min: ".exec_time_unit($start_time,'min')
							, logger::DEBUG
						);

						// clean vars
						// unset($result);
						// let GC do the memory job
						time_nanosleep(0, 5000); // Slept for 5000 nanoseconds
						// Forces collection of any existing garbage cycles
						gc_collect_cycles();
					}

				// reset counter
					$i_ref++;
					if ($i_ref > 3001) {
						$i_ref = 0;
					}
			}//end for ($i=$min; $i<=$max; $i++)

			// let GC do the memory job
			sleep(1);
			// Forces collection of any existing garbage cycles
			gc_collect_cycles();
		}//end foreach ($ar_tables as $key => $table)


		return true;
	}//end tables_rows_iterator



	/**
	* CHECK_SECTION_DATA
	* check the section data in JSON for missing properties
	* like section_tipo, section_id, created_date, created_by_userID
	* @param string|int id
	* @param string $table
	* @param string|int $section_id
	* @param string $section_tipo
	* @param object &$datos
	* 	Passed by reference !
	* @return bool $section_to_save
	* 	If true, an update of the database will be performed
	*/
	public static function check_section_data(string|int $id, string $table, string|int $section_id, string $section_tipo, object &$datos) : bool {

		$section_to_save = false;

		if(!isset($datos->section_id)){
			$datos->section_id = $section_id;
			$section_to_save = true;
		}

		if(!isset($datos->section_tipo)){
			$datos->section_tipo = $section_tipo;
			$section_to_save = true;
		}

		if(!isset($datos->created_date) || !isset($datos->created_by_userID)) {

			$tm_strQuery = "
				SELECT \"timestamp\", \"userID\" FROM matrix_time_machine
				WHERE section_id = '$section_id'
				AND section_tipo = '$section_tipo'
				ORDER BY \"timestamp\" ASC
				LIMIT 1
			";
			$result = JSON_RecordDataBoundObject::search_free($tm_strQuery);
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

					if(!isset($datos->created_date)) {
						$datos->created_date = $timestamp;
						$section_to_save = true;
					}

					if(!isset($datos->created_by_userID)) {
						$datos->created_by_userID = $userID;
						$section_to_save = true;
					}
				}//end if ($n_rows>0)
			}//end if($result!==false)
		}//end if(!isset($datos->created_date) || !isset($datos->created_by_userID))

		// save section if changes are made
		if($section_to_save === true) {

			$section_data_encoded = json_handler::encode($datos);

			$strQuery = "UPDATE $table SET datos = $1 WHERE id = $2 ";

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
