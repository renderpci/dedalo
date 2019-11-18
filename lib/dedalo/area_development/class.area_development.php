<?php
/**
* AREA_DEVELOPMENT
*
*
*/
class area_development extends area {



	/**
	* GET_UPDATES
	* Load file updates/update.php and get var object '$updates'
	* @return object $updates
	*/
	public static function get_updates() {

		include(dirname(__FILE__) .'/updates/updates.php');

		return $updates;
	}//end get_updates



	/**
	* GET_AR_WIDGETS
	* @return array $data_items
	*	Array of objects
	*/
	public function get_ar_widgets() {

		$ar_widgets = [];

		// make_backup
			$item = new stdClass();
				$item->id 		= 'make_backup';
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= label::get_label('hacer_backup');
				$item->info 	= 'Click to force make a full backup now';
				$item->body 	= ' ';
				$item->trigger 	= (object)[
					'class_name' => 'backup',
					'method' 	 => 'make_backup',
					'options' 	 => null
				];
			$ar_widgets[] = $item;


		// update_structure
			$item = new stdClass();
				$item->id 		= 'update_structure';
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= label::get_label('actualizar_estructura');
				$item->info 	= 'Click to update structure from remote master server';
				$item->confirm 	= '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! WARNING !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!'.PHP_EOL;
				$item->confirm .= '!!!!!!!!!!!!!! DELETING ACTUAL DATABASE !!!!!!!!!!!!!!!!'.PHP_EOL;
				$item->confirm .= 'Are you sure to IMPORT and overwrite current structure data with LOCAL FILE: ';
				$item->confirm .= '"dedalo4_development_str.custom.backup" ?'.PHP_EOL;
				$item->body 	= (defined('STRUCTURE_FROM_SERVER') && STRUCTURE_FROM_SERVER===true && !empty(STRUCTURE_SERVER_URL)) ?
					'Current: ' . RecordObj_dd::get_termino_by_tipo(DEDALO_ROOT_TIPO,'lg-spa') .
					'<br>TLD: ' . implode(', ', unserialize(DEDALO_PREFIX_TIPOS)) :
					label::get_label('actualizar_estructura')." is a disabled for ".DEDALO_ENTITY;
				$item->trigger 	= (object)[
					'class_name' => get_class($this),
					'method' 	 => 'update_structure',
					'options' 	 => null
				];
			$ar_widgets[] = $item;


		// register_tools
			$item = new stdClass();
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= label::get_label('registrar_herramientas');
				$item->info 	= 'Click to read tools folder and update the tools register in database';
				$item->body 	= ' ';
				$item->trigger 	= (object)[
					'class_name' => 'tools_register',
					'method' 	 => 'import_tools',
					'options' 	 => null
				];
			$ar_widgets[] = $item;


		// build_structure_css
			$item = new stdClass();
				$item->id 		= 'build_structure_css';
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= label::get_label('build_structure_css');
				$item->info 	= 'Click to regenerate css from actual structure';
				$item->body 	= ' ';
				$item->trigger 	= (object)[
					'class_name' => 'css',
					'method' 	 => 'build_structure_css',
					'options' 	 => null
				];
			$ar_widgets[] = $item;


		// update data version
			$updates 		= area_development::get_updates();
			$update_version = $this->get_update_version($updates);
			if(empty($update_version)) {

				$item = new stdClass();
					$item->id 		= 'update_data_version';
					$item->typo 	= 'widget';
					$item->tipo 	= $this->tipo;
					$item->parent 	= $this->tipo;
					$item->label 	= label::get_label('actualizar').' '.label::get_label('datos');
					$item->info 	= null;
					$item->body 	= '<span style="color:green">Data format is updated: '.implode(".", get_current_version_in_db()).'</span>';
					$item->trigger 	= (object)[
					];
				$ar_widgets[] = $item;

			}else{

				$current_dedalo_version = implode(".", get_dedalo_version());
				$current_version_in_db  = implode(".", get_current_version_in_db());
				$update_version_plain 	= implode('', $update_version);

				$item = new stdClass();
					$item->id 		= 'update_data_version';
					$item->typo 	= 'widget';
					$item->tipo 	= $this->tipo;
					$item->parent 	= $this->tipo;
					$item->label 	= label::get_label('actualizar').' '.label::get_label('datos');
					$item->info 	= 'Click to update dedalo data version';
					$item->body 	= '<span style="color:red">Current data version: '.$current_version_in_db . '</span> -----> '. implode('.', $update_version);
					// Actions list
						#dump($updates->$update_version_plain, '$updates->$update_version_plain ++ '.to_string());
						if (isset($updates->$update_version_plain)) {
							foreach ($updates->$update_version_plain as $key => $value) {

								if (is_object($value) || is_array($value)) {
									$i=0;
									foreach ($value as $vkey => $vvalue) {
										if($key==='alert_update') continue;
										if($i===0) $item->body .= "<h6>$key</h6>";
										if(is_string($vvalue)) $vvalue = trim($vvalue);
										$item->body .= '<div class="command"><span class="vkey">'.($vkey+1).'</span><span class="vkey_value">'. print_r($vvalue, true) .'</span></div>';
										$i++;
									}
								}
							}
						}
					$item->trigger 	= (object)[
						'class_name' => get_class($this),
						'method' 	 => 'update_version',
						'options' 	 => null
					];
				$ar_widgets[] = $item;
			}


		// search query object test enviroment
			$item = new stdClass();
				$item->id 		= 'search_query_object_test_enviroment';
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= 'SEARCH QUERY OBJECT TEST ENVIROMENT';
				$item->info 	= null;
				$item->body 	= '<textarea id="json_editor" class="hide"></textarea>';
				$item->body    .= '<div id="json_editor_container" class="editor_json"></div>';
				$item->run[]	= (object)[
					'fn' 	  => 'init_json_editor',
					'options' => (object)['editor_id' => "json_editor"]
				];
				$item->trigger 	= (object)[
					'class_name' => get_class($this),
					'method' 	 => 'convert_search_object_to_sql_query',
					'options' 	 => null
				];
			$ar_widgets[] = $item;


		// dedalo version
			$item = new stdClass();
				$item->id 		= 'dedalo_version';
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= 'DEDALO VERSION';
				$item->info 	= null;
				$item->body 	= 'Version '.DEDALO_VERSION;
				$item->body    .= '<pre>v '.DEDALO_VERSION .' | Build: '.DEDALO_BUILD.'</pre>';
			$ar_widgets[] = $item;


		// database_info
			$info = pg_version(DBi::_getConnection());
			$info['host'] = to_string(DEDALO_HOSTNAME_CONN);
			$item = new stdClass();
				$item->id 		= 'database_info';
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= 'DATABASE INFO';
				$item->info 	= null;
				$item->body 	= 'Database '.$info['IntervalStyle']. " ". $info['server']. " ".DEDALO_HOSTNAME_CONN;
				$item->body    .= '<pre>'.json_encode($info, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES).'</pre>';
			$ar_widgets[] = $item;


		// php_user
			$info = posix_getpwuid(posix_geteuid());
			$item = new stdClass();
				$item->id 		= 'php_user';
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= 'PHP USER';
				$item->info 	= null;
				$item->body 	= 'PHP user '.$info['name'];
				$item->body    .= '<pre>'.json_encode($info, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES).'</pre>';
			$ar_widgets[] = $item;


		// sequences_state
			require(DEDALO_LIB_BASE_PATH.'/db/class.data_check.php');
			$data_check = new data_check();
			$response 	= $data_check->check_sequences();
			$item = new stdClass();
				$item->id 		= 'sequences_state';
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= 'DB SEQUENCES STATE';
				$item->info 	= null;
				$item->body     = $response->msg;
			$ar_widgets[] = $item;

		// counters_state
			$response = counter::check_counters();
			$item = new stdClass();
				$item->id 		= 'counters_state';
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= 'DEDALO COUNTERS STATE';
				$item->info 	= null;
				$item->body     = $response->msg;
			$ar_widgets[] = $item;


		// php info
			$item = new stdClass();
				$item->id 		= 'php_info';
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= 'PHP INFO';
				$item->info 	= null;
				$item->body 	= '<iframe class="php_info_iframe" src="'.DEDALO_LIB_BASE_URL.'/area_development/html/info.php" onload="this.height=this.contentWindow.document.body.scrollHeight+50+\'px\';this.parentNode.parentNode.classList.add(\'display_none\')"></iframe>';
			$ar_widgets[] = $item;


		return $ar_widgets;
	}//end get_ar_widgets



	/**
	* UPDATE_STRUCTURE
	* @return object $response
	*/
	public static function update_structure() {
		$start_time=microtime(1);

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		# Remote server case
		if(defined('STRUCTURE_FROM_SERVER') && STRUCTURE_FROM_SERVER===true) {

			# Check remote server status before begins
			$remote_server_status = (object)backup::check_remote_server();
			if ($remote_server_status->result===true) {
				$response->msg 		.= $remote_server_status->msg;
			}else{
				$response->msg 		.= $remote_server_status->msg;
				$response->result 	= false;
				return (object)$response;
			}
		}

		# EXPORT. Before import, EXPORT ;-)
			$db_name = 'dedalo4_development_str_'.date("Y-m-d_Hi").'.custom';
			$res_export_structure = (object)backup::export_structure($db_name, $exclude_tables=false);	// Full backup
			if ($res_export_structure->result===false) {
				$response->msg = $res_export_structure->msg;
				return $response;
			}else{
				# Append msg
				$response->msg .= $res_export_structure->msg;
				# Exec time
				$export_exec_time	= exec_time_unit($start_time,'ms')." ms";
				$prev_time 			= microtime(1);
			}

		# IMPORT
			$res_import_structure = backup::import_structure();

			if ($res_import_structure->result===false) {
				$response->msg .= $res_import_structure->msg;
				return $response;
			}else{
				$response->msg .= $res_import_structure->msg;
				# Exec time
				$import_exec_time = exec_time_unit($prev_time,'ms')." ms";
			}


		# Delete session config (force to recalculate)
		#unset($_SESSION['dedalo4']['config']);

		# Delete session permissions table (force to recalculate)
		#unset($_SESSION['dedalo4']['auth']['permissions_table']);

		# Delete all session data except auth
			foreach ($_SESSION['dedalo4'] as $key => $value) {
				if ($key==='auth') continue;
				unset($_SESSION['dedalo4'][$key]);
			}


		#
		# UPDATE JAVASCRIPT LABELS
			$ar_langs 	 = (array)unserialize(DEDALO_APPLICATION_LANGS);
			foreach ($ar_langs as $lang => $label) {
				$label_path  = '/common/js/lang/' . $lang . '.js';
				$ar_label 	 = label::get_ar_label($lang); // Get all properties
					#dump($ar_label, ' ar_label');

				file_put_contents( DEDALO_LIB_BASE_PATH.$label_path, 'var get_label='.json_encode($ar_label,JSON_UNESCAPED_UNICODE).'');
				debug_log(__METHOD__." Generated js labels file for lang: $lang - $label_path ".to_string(), logger::DEBUG);
			}

		#
		# UPDATE STRUCTURE CSS
			$build_structure_css_response = (object)css::build_structure_css();
			if ($build_structure_css_response->result===false) {
				debug_log(__METHOD__." Error on build_structure_css: ".to_string($build_structure_css_response), logger::ERROR);
			}

		return $response;
	}//end update_structure



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

		$updates = area_development::get_updates();

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

		$updates 		 = area_development::get_updates();
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
					$SQL_update = area_development::SQL_update($current_query);
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
					$components_update[] = area_development::components_update($modelo_name, $current_version, $update_version);
					$msg[] = "Updated component: ".to_string($modelo_name);
					debug_log(__METHOD__." Updated component ".to_string($modelo_name), logger::DEBUG);
				}
			}

		// run_scripts
			if(isset($update->run_scripts)){
				foreach ((array)$update->run_scripts as $current_script) {
					$run_scripts = area_development::run_scripts($current_script);
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
			$version_to_update = area_development::get_update_version();
			$version_to_update = implode(".", $version_to_update);
			$new_version 	   = area_development::update_dedalo_data_version($version_to_update);
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
						/**/
						$ar_time_machine_obj = tool_time_machine::update_records_in_time_machine($current_component_tipo, $section_id, $current_lang, $current_section_tipo);
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



	/**
	* CONVERT_SEARCH_OBJECT_TO_SQL_QUERY
	* @return object $response
	*/
	public static function convert_search_object_to_sql_query($json_string) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		set_time_limit ( 259200 );  // 3 dias

		if($search_query_object = json_decode($json_string)) {

			$search = new search($search_query_object);

			#$sql_query = $search->parse_search_query_object();
			#$sql_query = addslashes($sql_query);
			#$sql_query = "<pre style=\"font-size:12px\">".$sql_query."</pre>";

			// search exec
				$rows = $search->search();

			// sql string query
				$sql_query = $rows->strQuery;

				$ar_lines = explode(PHP_EOL, $sql_query);
				$ar_final = array_map(function($line){
					$line = trim($line);
					if (strpos($line, '--')===0) {
						$line = '<span class="notes">'.$line.'</span>';
					}
					return $line;
				}, $ar_lines);
				$sql_query = implode(PHP_EOL, $ar_final);
				$sql_query = "<pre style=\"font-size:12px\">".$sql_query."</pre>";

			$response->result 	= true;
			$response->msg 		= $sql_query;
			$response->rows 	= $rows;
		}


		return (object)$response;
	}//end convert_search_object_to_sql_query




}//end area_development
