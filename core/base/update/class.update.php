<?php
/**
* UPDATE
* Manage Dédalo data updates defined in updates.ph file
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

		$update_version  = array();
		$current_version = get_current_version_in_db();
		if (empty($current_version)) {
			#$current_version = array(4,0,9);	// Default minimun version
			#return $current_version;
			return null;
		}

		$updates = update::get_updates();

		foreach ($updates as $key => $version_to_update) {
			if($current_version[0] == $version_to_update->update_from_major){
				if($current_version[1] == $version_to_update->update_from_medium){
					if($current_version[2] == $version_to_update->update_from_minor){

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
	* @return object $response
	*/
	public static function update_version() : object {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		// short vars
			$updates			= update::get_updates();
			$current_version	= get_current_version_in_db();
			$msg				= array();

		// Disable log and time machine save for all update process (from v4.9.1 24-05-2018)
			logger_backend_activity::$enable_log = false;
			#RecordObj_time_machine::$save_time_machine_version  = false;

		// update. Select the correct update object from the file 'updates.php'
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

		// update log file
			$update_log_file = DEDALO_CONFIG_PATH . '/update.log';
			if(!file_exists($update_log_file)) {
				if(!file_put_contents($update_log_file, '')) {
					$response->msg = 'Error (1). It\'s not possible set update_log file, review the PHP permissions to write in this directory';
					debug_log(__METHOD__
						." ".$response->msg . PHP_EOL
						. ' update_log_file: ' . $update_log_file
						, logger::ERROR
					);
					return $response;
				}
			}

		// SQL_update
			if(isset($update->SQL_update)){
				foreach ((array)$update->SQL_update as $key => $current_query) {

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

		// components_update
			if(isset($update->components_update)){
				foreach ((array)$update->components_update as $key => $current_model) {

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

		// run_scripts
			if(isset($update->run_scripts)){
				foreach ((array)$update->run_scripts as $key => $current_script) {

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

					$run_scripts	= update::run_scripts($current_script);
					$cmsg			= $run_scripts->msg;
					$msg[]			= "Updated run scripts: ".to_string($cmsg);

					if ($run_scripts->result===false) {

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
					}

					// log line
						$log_line  = PHP_EOL . 'result: script executed: ' . to_string($run_scripts->result);
						file_put_contents($update_log_file, $log_line, FILE_APPEND | LOCK_EX);

					// let GC do the memory job
					sleep(1);
					// Forces collection of any existing garbage cycles
					gc_collect_cycles();
				}//end foreach ((array)$update->run_scripts as $current_script)
			}

		// Table matrix_updates data
			$version_to_update			= update::get_update_version();
			$version_to_update_string	= implode(".", $version_to_update);
			$new_version				= update::update_dedalo_data_version($version_to_update_string);
			$msg[]						= "Updated Dédalo data version: ".to_string($version_to_update_string);

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
		# Existing db tables
		# Gets array of all db tables
		$tables = (array)backup::get_tables();

		$ar_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name('section');
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
				$ar_section_skip = [
					/*
					#'lg1', // lenguajes
					#'on1', // omomasticos
					#'dc1', // cronologicos
					#'ts1', // tematicos
					#'hu1', // hungria
					#'cu1', // cuba
					"es1",
					"fr1",
					"dz1",
					"pt1",
					"lg1",
					"ma1",
					"mupreva2434",
					"mupreva2435",
					"mupreva2436",
					"mupreva2437",
					"mupreva2438",
					"mupreva357",
					"mupreva123",
					"mupreva21",
					"mupreva22",
					"mupreva1",
					"mupreva120",
					"mupreva1258",
					"mupreva1385",
					"mupreva156",
					"mupreva159",
					"mupreva162",
					"mupreva20",
					"mupreva2384",
					"mupreva2541",
					"mupreva268",
					"mupreva380",
					"mupreva398",
					"mupreva473",
					"mupreva500",
					"mupreva770",
					"rsc332"
					*/
				];
				if (in_array($current_section_tipo, $ar_section_skip)) {
					continue;
				}

			// current_table. Test if target table exists (avoid errors on update components of "too much updated" structures)
				$current_table = common::get_matrix_table_from_tipo($current_section_tipo);
				if (!in_array($current_table, $tables) ) {
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
				}

			// Notify to log to know script state
				$n_components = count($ar_component_tipo);
				debug_log(__METHOD__
					." Updating components of section: $current_section_tipo (records: $n_rows, component: $model_name : $n_components) Total: ". ($n_rows*$n_components) . PHP_EOL
					.' updating component: ' . $model_name
					, logger::WARNING
				);

			// Iterate database resource directly to minimize memory requirements on large arrays
				// $i=0; $tm=0;
				while ($row = pg_fetch_assoc($result)) {

					$section_id = $row['section_id'];

					foreach ($ar_component_tipo as $current_component_tipo) {

						$RecordObj_dd	= new RecordObj_dd($current_component_tipo);
						$translatable	= $RecordObj_dd->get_traducible();
						$ar_langs		= ($translatable==='no') ? [DEDALO_DATA_NOLAN] : DEDALO_PROJECTS_DEFAULT_LANGS;

						foreach ($ar_langs as $current_lang) {

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

					}//end foreach ($ar_component_tipo as $current_component_tipo)

					// wait for 30 milliseconds
					usleep(30000);
					// Forces collection of any existing garbage cycles
					gc_collect_cycles();
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
				$response->msg 		= 'Error. Request failed ['.__METHOD__.']';

		try {

			$script_class	= $script_obj->script_class;
			$script_method	= $script_obj->script_method;
			$script_vars	= isset($script_obj->script_vars) ? (array)$script_obj->script_vars : array();

			//$result = $script_class::$script_method( $script_obj->script_vars );
			$result = call_user_func_array($script_class.'::'.$script_method, $script_vars);

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




}//end update
