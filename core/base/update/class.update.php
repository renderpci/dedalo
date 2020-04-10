<?php
/**
* UPDATE
* Manage API RESP data with Dédalo
*
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
	* @return array $update_version
	*/
	public static function get_update_version() {

		$update_version  = array();
		$current_version = get_current_version_in_db();
		if (empty($current_version)) {
			#$current_version = array(4,0,9);	// Default minimun version
			#return $current_version;
			return false;
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
	}//end get_update_version



	/**
	* UPDATE_VERSION
	* @return object $response
	*/
	public static function update_version() {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		$updates 		 = update::get_updates();
		$current_version = get_current_version_in_db();

		$msg = array();

		// Disable log and time machine save for all update process (from v4.9.1 24-05-2018)
			logger_backend_activity::$enable_log = false;
			#RecordObj_time_machine::$save_time_machine_version  = false;


		// Select the correct update from file updates
			foreach ($updates as $key => $version_to_update) {
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

		// SQL_update
			if(isset($update->SQL_update)){
				foreach ((array)$update->SQL_update as $key => $current_query) {
					$SQL_update = update::SQL_update($current_query);
					$cmsg  = $SQL_update->msg;
					$msg[] = "Updated sql: ".to_string($cmsg);

					if ($SQL_update->result===false) {
						$response->result = false ;
						$response->msg 	  = "Error on SQL_update. <br>".implode('<br>', $msg);
						return $response;
					}
				}
			}

		// components_update
			if(isset($update->components_update)){
				foreach ($update->components_update as $modelo_name) {
					$components_update[] = update::components_update($modelo_name, $current_version, $update_version);
					$msg[] = "Updated component: ".to_string($modelo_name);
					debug_log(__METHOD__." Updated component ".to_string($modelo_name), logger::DEBUG);
				}
			}

		// run_scripts
			if(isset($update->run_scripts)){
				foreach ((array)$update->run_scripts as $current_script) {
					$run_scripts = update::run_scripts($current_script);
					$cmsg  = $run_scripts->msg;
					$msg[] = "Updated run scripts: ".to_string($cmsg);

					if ($run_scripts->result===false) {
						$response->result = false ;
						$response->msg 	  = "Error on run_scripts. <br>".implode('<br>', $msg);
						return $response;
					}
				}
			}

		// Table matrix_updates data
			$version_to_update = update::get_update_version();
			$version_to_update = implode(".", $version_to_update);
			$new_version 	   = update::update_dedalo_data_version($version_to_update);
			$msg[] = "Updated Dédalo data version: ".to_string($version_to_update);


		$result = isset($components_update) ? $components_update : null;


		$response->result = true ;
		$response->msg 	  = "Update version is done. <br>".implode('<br>', $msg);

		return (object)$response;
	}//end update_version



	/**
	* SQL_UPDATE
	* @param string $SQL_update
	* @return object $response
	*/
	public static function SQL_update($SQL_update) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		$result = pg_query(DBi::_getConnection(), $SQL_update);
		if(!$result) {
			echo "Error: sorry an error ocurred on SQL_update code.";
			if(SHOW_DEBUG===true) {
				trigger_error( "<span class=\"error\">Error Processing SQL_update Request </span>". pg_last_error() );
				dump(null,"SQL_update ".to_string($SQL_update));
				#throw new Exception("Error Processing SQL_update Request ". pg_last_error(), 1);;
			}
			$response->msg .= " Error Processing SQL_update Request: ". pg_last_error();
			return $response;
		}
		debug_log(__METHOD__." Executed database update: ".to_string($SQL_update), logger::DEBUG);

		$response->result 	= true;
		$response->msg 		= "Executed database update: ".to_string($SQL_update);

		return (object)$response;
	}//end SQL_update



	/**
	* COMPONENTS_UPDATE
	* Iterate ALL structure sections and search components to update based on their model
	* @param string $modelo_name
	* @param array $current_version
	* @param array $update_version
	* @return array $total_update
	*/
	public static function components_update($modelo_name, $current_version, $update_version) {

		# Existing db tables
		# Gets array of all db tables
		$tables = (array)backup::get_tables();

		$ar_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name('section');
		$ar_section_tipo = ['test65'];
		foreach ($ar_section_tipo as $current_section_tipo) {

			# Activity data is not updated [REMOVED 29-08-2018 TO ALLOW FILTER AND FILTER MASTER UPDATES]
			if($current_section_tipo===DEDALO_ACTIVITY_SECTION_TIPO) {
				# component_ip, component_autocomplete, component_autocomplete_ts, component_date, component_input_text, component_filter
				if ($modelo_name==='component_filter' || $modelo_name==='component_autocomplete' || $modelo_name==='component_ip') {
					# Do the update
				}else{
					# Skip update
					continue;
				}
			}

			# Skip sections
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

			#
			# Test if target table exists (avoid errors on update components of "too much updated" structures)
			$current_table = common::get_matrix_table_from_tipo($current_section_tipo);
			if (!in_array($current_table, $tables) ) {
				debug_log(__METHOD__." Skipped section ($current_section_tipo) because table ($current_table) not exists ".to_string(), logger::ERROR);
				continue;
			}

			// Search all records of current section
			# $ar_section_id = section::get_ar_all_section_records_unfiltered($current_section_tipo);
			# debug_log(__METHOD__." ar_section_id for $current_section_tipo : ".count($ar_section_id), logger::DEBUG);
			$result = section::get_resource_all_section_records_unfiltered($current_section_tipo);
			$n_rows = pg_num_rows($result);
			if ($n_rows<1) {
				# Skip empty sections
				debug_log(__METHOD__." Skipped current_section_tipo '$current_section_tipo'. (Empty records) ".to_string(), logger::WARNING);
				continue;
			}

			#
			# SECTION COMPONENTS
			#$ar_component_tipo = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_section_tipo, $modelo_name, 'children_recursive', $search_exact=true);
			$ar_component_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($current_section_tipo, array($modelo_name), $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true);
			if (empty($ar_component_tipo)) {
				# Skip empty components sections
				debug_log(__METHOD__." Skipped current_section_tipo '$current_section_tipo'. (Empty components of type $modelo_name) ".to_string(), logger::WARNING);
				continue;
			}

			# Notify to log to know script state
			$n_components = count($ar_component_tipo);
			debug_log(__METHOD__." Updating components of section: $current_section_tipo (records: $n_rows, components $modelo_name: $n_components) Total: ". ($n_rows*$n_components), logger::WARNING);

			$i=0; $tm=0;
			// Iterate database resource directly to minimize memory requeriments on large arrays
			while ($rows = pg_fetch_assoc($result)) {

				$section_id = $rows['section_id'];

				foreach ($ar_component_tipo as $current_component_tipo) {

					$RecordObj_dd = new RecordObj_dd($current_component_tipo);
					$translatable = $RecordObj_dd->get_traducible();
					$ar_langs 	  = ($translatable==='no') ? array(DEDALO_DATA_NOLAN) : unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);

					foreach ($ar_langs as $current_lang) {

						#
						# COMPONENT . Update component dato
						$component = component_common::get_instance($modelo_name,
																	$current_component_tipo,
																	$section_id,
																	'update',
																	$current_lang,
																	$current_section_tipo,
																	false);
						$component->get_dato();
						$dato_unchanged = $component->get_dato_unchanged();
						$reference_id 	= $current_section_tipo.'.'.$section_id.'.'.$current_component_tipo;

						$update_options = new stdClass();
							$update_options->update_version = $update_version;
							$update_options->dato_unchanged = $dato_unchanged;
							$update_options->reference_id 	= $reference_id;
							$update_options->tipo 			= $current_component_tipo;
							$update_options->section_id 	= $section_id;
							$update_options->section_tipo 	= $current_section_tipo;
							$update_options->context 		= 'update_component_dato';

						$response = $modelo_name::update_dato_version($update_options);
						#debug_log(__METHOD__." UPDATE_DATO_VERSION COMPONENT RESPONSE [$modelo_name][{$current_section_tipo}-{$section_id}]: result: ".to_string($response->result), logger::DEBUG);

						if($response->result===1) {
							$component->updating_dato = true;
							$component->set_dato($response->new_dato);
							$component->update_diffusion_info_propagate_changes = false;
							$component->set_dato_resolved($response->new_dato); // Fix as resolved

							// section set as not save_modified
								$component_section = $component->get_my_section();
								$component_section->save_modified = false; # Change temporally section param 'save_modified' before save to avoid overwrite possible modified import data

							// save component
								$component->Save();
							#debug_log(__METHOD__." UPDATED dato from component [$modelo_name][{$current_section_tipo}-{$section_id}] ".to_string(), logger::DEBUG);
							$i++;
							#$total_update[$current_section_tipo][$current_component_tipo][$current_lang]['i']=$i;
							#echo $response->msg;
						}else{
							#echo $response->msg;
							if($response->result === 0){
								continue 4;
							}
						}

						#
						# TIME MACHINE . Update Time_machine component dato
						/*
						$ar_time_machine_obj = tool_time_machine::get_ar_component_time_machine($current_component_tipo, $section_id, $current_lang, $current_section_tipo, 0, 0);
						foreach ($ar_time_machine_obj  as $current_time_machine_obj) {
							$dato_unchanged = $current_time_machine_obj->get_dato();

							# Different options override
							$update_options->dato_unchanged = $dato_unchanged;
							$update_options->context 		= 'update_time_machine_dato';

							$response 		= $modelo_name::update_dato_version($update_options);
							#debug_log(__METHOD__." UPDATE_DATO_VERSION TIME_MACHINE RESPONSE [$modelo_name][{$current_section_tipo}-{$section_id}]: result: ".to_string($response->result), logger::DEBUG);
							if($response->result === 1){
								$current_time_machine_obj->set_dato($response->new_dato);
								$current_time_machine_obj->Save();
								#debug_log(__METHOD__." UPDATED TIME MACHINE dato from component [$modelo_name][{$current_section_tipo}-{$current_component_tipo}-{$current_lang}-{$section_id}] ".to_string($tm), logger::DEBUG);
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
					}//end foreach ($ar_langs as $current_lang) {
				}//end foreach ($ar_component_tipo as $current_component_tipo) {

			}//end while ($rows = pg_fetch_assoc($result)) {

			// let GC do the memory job
			#time_nanosleep(0, 50000000); // 10 ms

			# Forces collection of any existing garbage cycles
			gc_collect_cycles();

		}//end foreach ($ar_section_tipo as $current_section_tipo)


		return true;
	}//end components_update



	/**
	* RUN_SCRIPTS
	* Simply executes static methods based on received $script_obj properties
	* @param object $script_obj
	* @return object $response
	*/
	public static function run_scripts( $script_obj ) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__METHOD__.']';

		$script_class  = $script_obj->script_class;
		$script_method = $script_obj->script_method;
		$script_vars   = isset($script_obj->script_vars) ? (array)$script_obj->script_vars : array();

		//$result = $script_class::$script_method( $script_obj->script_vars );
		$result = call_user_func_array($script_class.'::'.$script_method, $script_vars);

		if (is_object($result)) {
			$response = $result;
		}else if ($result===false) {
			$response->msg .= ' False result is received for: '.$script_class.'::'.$script_method;
		}else{
			$response->result  = true;
			$response->msg 	   = ' '.to_string($result);
		}

		return $response;
	}//end run_scripts



	/**
	* UPDATE_DEDALO_DATA_VERSION
	* @return bool true
	*/
	public static function update_dedalo_data_version($version_to_update) {

		$values = new stdClass();
			$values->dedalo_version = $version_to_update;
			$values->update_date 	= date('Y-m-d H:i:s',time());

		$str_values = json_encode($values);

		$SQL_update = 'INSERT INTO "matrix_updates" ("datos") VALUES (\''.$str_values.'\');';

		self::SQL_update($SQL_update);
		debug_log(__METHOD__." Updated table 'matrix_updates' with values: ".to_string($str_values), logger::DEBUG);

		return true;
	}//end update_dedalo_data_version




}//end update
