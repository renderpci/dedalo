<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once(dirname(__FILE__) .'/updates/updates.php');
/*
* CLASS TOOL_ADMINISTRATION - B
*/
class tool_administration extends tool_common {
	
	protected $section_obj ;

	static $ar_tables_with_relations = array(
			"matrix_users",
			"matrix_projects",
			"matrix",
			"matrix_list",
			"matrix_activities",
			"matrix_hierarchy",
			"matrix_hierarchy_main",
			"matrix_langs",
			"matrix_layout",
			"matrix_notes",
			"matrix_profiles",
			"matrix_test",
			"matrix_indexations",
			"matrix_structurations",
			"matrix_dataframe",
			"matrix_dd",
			"matrix_layout_dd",
			"matrix_activity"
			);

	
	
	/**
	* __CONSTRUCT
	*/
	public function __construct($section_obj, $modo='button') {
		
		# Fix modo
		$this->modo = $modo;

		# Fix current media component
		$this->section_obj = $section_obj;

		# Notifications test
		$this->tests_table_notifications();

		# CURRENT_VERSION_IN_DB : Force to create table and minimun data if not exists
		self::get_current_version_in_db();
	}//end __construct



	/**
	* TESTS_TABLE_NOTIFICATIONS
	* Before 4.0.11 create table 'matrix_notifications'
	* @return bool
	*/
	public function tests_table_notifications() {

		$version = self::get_current_version_in_db();
		if (empty($version)) {
			return false;
		}

		if ($version[0]==4 && $version[1]==0 && $version[2]<=10) {

			$tables = (array)backup::get_tables();

			if (in_array('matrix_notifications', $tables) ) {
				# Table already exists
				return false;
			}
		
			$query 	= ' CREATE TABLE IF NOT EXISTS "matrix_notifications" (
						"id" serial NOT NULL,
						"datos" jsonb NULL,
						CONSTRAINT matrix_notifications_id PRIMARY KEY(id)
					) ';

			$result = self::SQL_update($query);
			if ($result) {
				$query_insert = ' INSERT INTO "matrix_notifications" ("id","datos") SELECT 1, \'[]\' WHERE NOT EXISTS (SELECT id FROM "matrix_notifications" WHERE id = 1) ';
				self::SQL_update($query_insert);
			}

		}else{
			$result=false;
		}		

		return $result;
	}//end tests_table_notifications

	

	/**
	* SHOW_INFO
	* @return string $html
	*/
	public function show_info($name, $value, $body) {

		$html='';
		$html .= "<li class=\"list-group-item\">";
		$html .= "<span class=\"glyphicon glyphicon-info-sign\" aria-hidden=\"true\"></span> ";
		$html .= "$name: <b>$value</b>";
		$html .= "<pre>";
		$html .= print_r($body,true);
		$html .= "</pre>";
		$html .= "</li>";
		#$html .= "<br>";

		return $html;		
	}//end show_info
	


	/**
	* DELETE_COMPONENT_TIPO_IN_MATRIX_TABLE
	*/
	public static function delete_component_tipo_in_matrix_table($section_tipo, $component_tipo, $language=false, $save=false, $filter=null) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		$msg = array();

		# Safe vars
		$section_tipo 	= safe_tipo($section_tipo);
		if ($component_tipo==='inverse_locators') {
			# Nothing to do
		}else{
			$component_tipo = safe_tipo($component_tipo);
		}		

		#select matrix table
		$matrix_table 	= safe_table(common::get_matrix_table_from_tipo($section_tipo));

		$proced = false;


		#Query all rows with this section_tipo into the DB
		$strQuery = 'SELECT id, section_id, section_tipo, datos 
		FROM '.$matrix_table.'
		WHERE section_tipo = \''.$section_tipo.'\' 
		'.$filter.' 
		ORDER BY id ASC ';
		debug_log(__METHOD__." strQuery [component_tipo: $component_tipo] ".to_string($strQuery), logger::DEBUG);

		# perform query
		$result = JSON_RecordObj_matrix::search_free($strQuery);

		if(SHOW_DEBUG===true) {
			#$msg[] = "$strQuery";
		}

		#loop the rows
		while ($rows = pg_fetch_assoc($result)) {

			$id 			= (int)$rows['id'];
			$section_id 	= $rows['section_id'];
			$section_tipo 	= $rows['section_tipo'];
			$datos 			= (string)$rows['datos'];

			$datos	= (object)json_handler::decode($datos);
				
			$before = "";
			$after  = "";
		
			debug_log(__METHOD__." component_tipo: $component_tipo ".json_encode($datos), logger::DEBUG);

			switch (true) {
				case ($component_tipo==='inverse_locators' && property_exists($datos, $component_tipo)):
					$before = json_encode($datos);

					unset($datos->inverse_locators);
					
					$after = json_encode($datos);

					$proced = true;
					break;

				# If language is set, delete the language into the componet
				case (!empty($language) && property_exists($datos->components, $component_tipo) && isset($datos->components->{$component_tipo}->dato->{$language})):
					$before = json_encode($datos->components->$component_tipo->dato);

					unset($datos->components->{$component_tipo}->dato->{$language});

					$after = json_encode($datos->components->$component_tipo->dato);
					
					$proced = true;
					break;

				# If langage in not set, remove all component (dato, value, value_list,...)
				case (empty($language) && property_exists($datos->components, $component_tipo)):
					$before = json_encode($datos->components->$component_tipo);

					unset($datos->components->$component_tipo);

					$proced = true;
					break;

				default:
					$proced = false;
					$msg[] = "Not found dato for delete in $section_tipo - $section_id - $component_tipo";
					break;
			}			
			#continue;			
			
			if($proced===true){

				$datos = (string)json_handler::encode($datos);		
				$datos = pg_escape_string($datos);

				// Save section dato			
				$strQuery = "UPDATE \"$matrix_table\" SET datos = '$datos' WHERE id = $id";
					#debug_log(__METHOD__." strQuery ".to_string($strQuery), logger::DEBUG);
					
				#if check "save" proced to save the new dato into the DB row (update the row)
				if ($save===true) {
					$update_result 	= pg_query(DBi::_getConnection(), $strQuery);
					if (!$update_result) {
						$msg[] = pg_last_error();
						$msg[] = "Error on Update row id:$id - pg_last_error:". pg_last_error(); //substr($strQuery, 0,250)
					}else {
						$msg[] = "Deleted dato in $section_tipo - $section_id - $component_tipo";	//." <hr> <br> BEFORE: $before <br> AFTER: $after"; //substr($strQuery, 0,250)
					}
				}else{
					$msg[] = "(PREVIEW) Updated row $section_tipo - $section_id - $component_tipo <br> &ensp; - BEFORE: $before <br> &ensp; - AFTER: $after";
				}

				$response->result = true;
			}
		}//end while


		$response->msg = implode('<br>', $msg);

		return (object)$response;
	}//end delete_component_tipo_in_matrix_table
	


	/**
	* GET_CURRENT_VERION
	* Get the version of the data into the DB
	* The data version need to be compatible with the program files, but, 
	* when Dédalo program change (for update), the data and the program is un-sync before admin run the update
	* @return array $current_version
	*/
	public static function get_current_version_in_db() {
		
		static $current_version;

		if (isset($current_version)) {
			return $current_version;
		}

		#
		# Test table exists	and create if not
		$table_exits = self::table_exits("matrix_updates");
		
		if (!$table_exits) {
			self::create_table(
					$table_name = "matrix_updates", 
					$ar_columns = array("id" 	=> "serial NOT NULL",
										"datos" => "jsonb NULL")
					);
			# Set to default minimal db version	(4.0.9)
			self::update_dedalo_data_version('4.0.9');
		}	

		#Query the last row of matrix_updates, it is the last update, and the current version.
		$strQuery = 'SELECT id, datos
					FROM "matrix_updates"
					ORDER BY id DESC 
					LIMIT 1';

		#echo "<br> strQuery: $strQuery <br>";
		#perform query
		$result = JSON_RecordObj_matrix::search_free($strQuery);

		#loop the rows
		while ($rows = pg_fetch_assoc($result)) {

			$id 	= (int)$rows['id'];
			$datos 	= (string)$rows['datos'];

			$datos	= (object)json_handler::decode($datos);
		}

		$current_version = array();

		if (isset($datos)) {

			$ar_version = explode(".", $datos->dedalo_version);
			
			$current_version[0] = (int)$ar_version[0];
			$current_version[1] = (int)$ar_version[1];
			$current_version[2] = (int)$ar_version[2];
		}

		return $current_version;	
	}//end get_current_version_in_db



	/**
	* GET_DEDALO_VERSION
	* Get the program files version, the files need change for update the data.
	* Download the Dédalo files and run the update procedure.
	* @return array $current_version
	*/
	public static function get_dedalo_version() {

		$current_version = array();
		
		$ar_version = explode(".", DEDALO_VERSION);

		$current_version[0] = (int)$ar_version[0];
		$current_version[1] = (int)$ar_version[1];
		$current_version[2] = (int)$ar_version[2];
		
		return $current_version;		
	}//end get_dedalo_version



	/**
	* GET_UPDATE_VERSION
	* @return array $update_version
	*/
	public static function get_update_version() {
		global $updates;

		$update_version = array();
		$current_version = self::get_current_version_in_db();
		if (empty($current_version)) {
			#$current_version = array(4,0,9);	// Default minimun version
			#return $current_version;
			return false;
		}

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
	* MAKE_BACKUP
	* @return object $response
	*/
	public static function make_backup() {
		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';
		
		require(DEDALO_LIB_BASE_PATH.'/backup/class.backup.php');
		$user_id  = $_SESSION['dedalo4']['auth']['user_id'];
		$username = $_SESSION['dedalo4']['auth']['username'];
		
		$response = (object)backup::init_backup_secuence($user_id, $username, $skip_backup_time_range=true);
		#debug_log(__METHOD__."  backup_info: $response->msg ".to_string(), logger::DEBUG);		

		return (object)$response;
	}//end make_backup



	/**
	* UPDATE_VERSION
	* @return object $response
	*/
	public static function update_version() {
		global $updates;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		$current_version = self::get_current_version_in_db();

		$msg = array();

		#
		# BACKUP
		# Before update version dato, we force a backup of all database
		//self::make_backup();

		#
		# DISABLE LOGIN AND TIME MACHINE SAVE FOR ALL UPDATE PROCESS (From v4.9.1 24-05-2018)
		logger_backend_activity::$enable_log 				= false;
		#RecordObj_time_machine::$save_time_machine_version  = false;


		# Select the correct update from file updates
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

		# SQL_update
		if(isset($update->SQL_update)){
			foreach ((array)$update->SQL_update as $key => $current_query) {
				$SQL_update = self::SQL_update($current_query);
				$cmsg  = $SQL_update->msg;
				$msg[] = "Updated sql: ".to_string($cmsg);

				if ($SQL_update->result===false) {
					$response->result = false ;
					$response->msg 	  = "Error on SQL_update. <br>".implode('<br>', $msg);
					return $response;
				}
			}
		}
		# components_update
		if(isset($update->components_update)){
			foreach ($update->components_update as $modelo_name) {
				$components_update[] = self::components_update($modelo_name, $current_version, $update_version);
				$msg[] = "Updated component: ".to_string($modelo_name);
				debug_log(__METHOD__." Updated component ".to_string($modelo_name), logger::DEBUG);
			}			
		}
		# run_scripts
		if(isset($update->run_scripts)){
			foreach ((array)$update->run_scripts as $current_script) {
				$run_scripts = self::run_scripts($current_script);
				$cmsg  = $run_scripts->msg;
				$msg[] = "Updated run scripts: ".to_string($cmsg);

				if ($run_scripts->result===false) {
					$response->result = false ;
					$response->msg 	  = "Error on run_scripts. <br>".implode('<br>', $msg);
					return $response;
				}
			}
		}
		
		# TABLE MATRIX_UPDATES DATA
		$version_to_update = self::get_update_version();
		$version_to_update = implode(".", $version_to_update);
		$new_version 	   = self::update_dedalo_data_version($version_to_update);
		$msg[] = "Updated Dédalo data version: ".to_string($version_to_update);

		$result = isset($components_update) ? $components_update : null;


		$response->result = true ;
		$response->msg 	  = "Update version is done. <br>".implode('<br>', $msg);

		return (object)$response;		
	}//end update_version



	/**
	* COMPONENTS_UPDATE
	* Iterate ALL structure sections and search components to update based on their model
	* @param string $modelo_name
	* @param array $current_version
	* @param array $update_version
	* @return array $total_update
	*/
	public static function components_update($modelo_name, $current_version, $update_version) {

		#$total_update = array();		

		# Force custom sections
		# $ar_section_tipo = array('mupreva22', 'mupreva710', 'mupreva162', 'mupreva163', 'mupreva20');

		# Existing db tables
		# Gets array of all db tables
		$tables 		 = (array)backup::get_tables();

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
	* SQL_UPDATE
	* @param string $SQL_update
	* @return bool
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
	* TABLE_EXITS
	* @return bool $table_exits
	*/
	public static function table_exits($table_name) {

		$table_exits = false;

		$strQuery = "SELECT 1 AS total FROM pg_class WHERE relname = '$table_name' ";
		$result   = pg_query(DBi::_getConnection(), $strQuery);
		
		if ($result) {
			$rows = pg_num_rows($result);
			$table_exits = $rows>0 ? true : false;
			#$table_exits = (bool)pg_fetch_result($result, 0, 0);
		}		

		return (bool)$table_exits;
	}//end table_exits



	/**
	* CREATE_TABLE
	* @return bool true
	*/
	public static function create_table($table_name, $ar_columns) {
		
		$strQuery  ='';
		$strQuery .= "\nCREATE TABLE IF NOT EXISTS \"$table_name\" (";

		$key = key($ar_columns);
		foreach ($ar_columns as $column => $column_info) {
			$strQuery .= "\n  \"$column\" $column_info,";	// serial NOT NULL			
		}
		$strQuery .= "\n  CONSTRAINT {$table_name}_{$key} PRIMARY KEY($key)";
		$strQuery .= "\n);";

		if(!pg_query(DBi::_getConnection(), $strQuery)) {				
			throw new Exception("Error Processing SQL_update Request ". pg_last_error(), 1);
		}
		debug_log(__METHOD__." Created unexisting table $table_name ".to_string(), logger::DEBUG);
	
		return true;
	}//end create_table



	/**
	* SKIP_PUBLICATION_STATE_CHECK
	* Changes session value for 'skip_publication_state_check' until session is expired
	*/
	public static function skip_publication_state_check( bool $value) {
		if ($value) {
			$_SESSION['dedalo4']['config']['skip_publication_state_check'] = 1;
		}else{
			$_SESSION['dedalo4']['config']['skip_publication_state_check'] = 0;
		}
	}//end skip_publication_state_check



	/**
	* REMOVE_AV_TEMPORALS
	* @return array $ar_deleted_files
	*/
	public static function remove_av_temporals() {

		$ar_deleted_files=array();
		
		$dir_path = DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER . '/tmp';

		$files = glob( $dir_path . '/*' ); // get all file names

		foreach($files as $file){ // iterate files
			if(is_file($file)) {

				$extension = pathinfo($file,PATHINFO_EXTENSION);

				if ($extension==='sh' || $extension==='log') {
					$file_name = pathinfo($file,PATHINFO_BASENAME);
					$ar_deleted_files[] = $file_name;

					unlink($file); // delete file
				}
			}
		}

		return (array)$ar_deleted_files;
	}//end remove_av_temporals



	/**
	* RUN_SCRIPTS
	* Simply executes static methods based on received $script_obj properties
	* @param object $script_obj
	* @return mixed $result
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
	* GET_APPROXIMATE_ROW_COUNT
	* @return int $total_records
	*/
	public static function get_approximate_row_count( $matrix_table ) {
		
		$total_records= 0;

		$matrix_table = safe_table($matrix_table);

		$strQuery = "SELECT reltuples AS approximate_row_count FROM pg_class WHERE relname = '$matrix_table';";
		$result   = pg_query(DBi::_getConnection(), $strQuery);
		while ($rows = pg_fetch_assoc($result)) {
			$total_records  = $rows['approximate_row_count'];
		}		
		
		return (int)$total_records;
	}//end get_approximate_row_count



	/**
	* MOVE_COMPONENT_DATA
	* @return object $response
	*/
	public static function move_component_data( $request_options ) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';
		
		$options = new stdClass();
			# Source options
			$options->source_section_tipo 	= null;
			$options->source_section_id 	= null; // array or null for all records
			$options->source_delete 		= false; // bool
			$options->source_portal_tipo 	= null;	// portal tipo where hook the target section
			# Target options
			$options->target_section_tipo 	= null;
			$options->target_section_id 	= null; // array or null for all records			
			# Others
			$options->map_components 		= array(); // key is source component tipo. value is target component tipo

			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		# Get records of source section
			if (!empty($options->source_section_id)) {
				$ar_section_records = (array)$options->source_section_id;
			}else{
				$ar_section_records = section::get_ar_all_section_records_unfiltered( $options->source_section_tipo );
			}

		# Iterate records
		$ar_langs = common::get_ar_all_langs();	debug_log(__METHOD__." ar_langs ".to_string($ar_langs), logger::DEBUG);
		foreach ($ar_section_records as $key => $current_section_id) {

			# target_parent
			if (empty($options->target_section_id)) {
				# Create a new section and gei section_id
				$section_target = section::get_instance(null, $options->target_section_tipo);

				// section set as not save_modified
					$section_target->save_modified = false; # Change temporally section param 'save_modified' before save to avoid overwrite possible modified import data

				$section_target->Save();
				$target_parent  = $section_target->get_section_id();

			}else{
				$ar_target_id = (array)$options->target_section_id;
				$target_parent 	  = $ar_target_id[$key];
			}

			# source_section
			$source_section = section::get_instance($current_section_id, $options->source_section_tipo, false);
			
			# component iterate
			foreach ((array)$options->map_components as $source_component_tipo => $target_component_tipo) {

				$RecordObj_dd 	  = new RecordObj_dd($target_component_tipo);
				$current_ar_langs = $RecordObj_dd->get_traducible()==='si' ? $ar_langs : array(DEDALO_DATA_NOLAN);					

				# langs iterate
				foreach($current_ar_langs as $current_lang) {
				
					# SOURCE
					/*
					$source_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($source_component_tipo,true);				
					$source_component 	= component_common::get_instance( $source_modelo_name,
																		  $source_component_tipo,
																		  $current_section_id,
																		  $modo='edit',
																		  $current_lang,
																		  $options->source_section_tipo,
																		  false);
					$dato = $source_component->get_dato();
					*/					
					$dato = $source_section->get_component_dato($source_component_tipo, $current_lang, $lang_fallback=false);
					debug_log(__METHOD__." Set dato for $source_component_tipo - $current_lang - $current_section_id - $options->source_section_tipo : ".to_string($dato), logger::DEBUG);

					# TARGET
					$target_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($target_component_tipo,true);
										#if($source_modelo_name!==$target_modelo_name) {
										#	debug_log(__METHOD__." Skipped mismatch component $source_component_tipo -> $target_component_tipo [$source_modelo_name -> $target_modelo_name] ".to_string(), logger::WARNING);
										#	continue 2;
										#}					
					$target_component 	= component_common::get_instance( $target_modelo_name,
																		  $target_component_tipo,
																		  $target_parent,
																		  $modo='edit',
																		  $current_lang,
																		  $options->target_section_tipo,
																		  false);
					$target_component->set_dato( $dato );
					$target_component->update_diffusion_info_propagate_changes = false;

					// section set as not save_modified
						$component_section = $target_component->get_my_section();
						$component_section->save_modified = false; # Change temporally section param 'save_modified' before save to avoid overwrite possible modified import data

					$save_result = $target_component->Save();
				}//end foreach langs

				# Delete original dato (only once by lang)
				if($options->source_delete===true && $save_result!==false) {
					self::delete_component_tipo_in_matrix_table($options->source_section_tipo, $source_component_tipo, $_language=false, $_save=true, $filter="AND section_id = $current_section_id");
				}//end if($options->source_delete===true)			

			}//end foreach ((array)$options->source_components_tipo as $current_component_tipo)


			# Portal link (only once by lang)
			if (!empty($options->source_portal_tipo)) {						

				$component_portal 	= component_common::get_instance( $modelo_name='component_portal',
																	  $options->source_portal_tipo,
																	  $current_section_id,
																	  $modo='edit',
																	  DEDALO_DATA_NOLAN,
																	  $options->source_section_tipo,
																	  false);

				$locator = new locator();
					$locator->set_section_tipo( $options->target_section_tipo );
					$locator->set_section_id( $target_parent );
				
				$component_portal->add_locator( $locator );
				$component_portal->update_diffusion_info_propagate_changes = false;

				// section set as not save_modified
					$component_section = $component_portal->get_my_section();
					$component_section->save_modified = false; # Change temporally section param 'save_modified' before save to avoid overwrite possible modified import data
			
				$component_portal->Save();
			}//end if (!is_null($options->source_portal_tipo))
			


			$response->result[] = $current_section_id;
		}//end foreach ($ar_section_records as $key => $current_section_id)



		if ($response->result!==false) {
			$response->msg = "Processed records: ".count($response->result);
		}

		return (object)$response;
	}//end move_component_data



	/**
	* RENUMERATE_SECTIONS
	* @return 
	*/
	public static function renumerate_sections( $request_options ) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		$options = new stdClass();			
			$options->section_tipo 		= null;
			$options->section_id_start 	= null;
			$options->section_id_end	= null;
			$options->counter_start 	= null;
			$options->save 				= false;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		# Safe section_tipo and section id
		$options->section_tipo 		= safe_tipo($options->section_tipo);
		$options->section_id_start 	= safe_section_id($options->section_id_start);
		$options->section_id_end 	= safe_section_id($options->section_id_end);


		$table 	 = common::get_matrix_table_from_tipo($options->section_tipo);
		$table 	 = safe_table($table);
		$counter = (int)$options->counter_start;
		$msg 	 = [];

		$strQuery = "SELECT section_id, datos FROM \"$table\" WHERE section_tipo = '".$options->section_tipo."' AND (section_id >= ".$options->section_id_start." AND section_id <= ".$options->section_id_end.") ORDER BY section_id ASC ;";
		$result   = pg_query(DBi::_getConnection(), $strQuery);
		if (!$result) {
			$response->msg .= " Error on select db records on table $table . ".pg_last_error();
			return $response;
		}
		# Iterate found records
		while ($rows = pg_fetch_assoc($result)) {

			$section_id  = (int)$rows['section_id'];			

			# Search for existing record with same section_id
			$strQuery2 = "SELECT section_id FROM \"$table\" WHERE section_tipo = '".$options->section_tipo."' AND section_id = ".$counter." ;";
			$result2   = pg_query(DBi::_getConnection(), $strQuery2);
			$n_rows    = pg_num_rows($result2);
			if ($n_rows>0) {
				# Skip empty sections
				$msg[] = "Skiped record of section_id $counter. Record already exists";
				$counter++;
				continue;
			}

			$datos  	 		= json_decode($rows['datos']);
			$datos->section_id 	= $counter;
			$datos_json			= json_encode($datos);

			$strQuery3 = "UPDATE \"$table\" SET section_id = $1, datos = $2 WHERE section_tipo = $3 AND section_id = $4";
			if ($options->save===true) {
				$result3   = pg_query_params(DBi::_getConnection(), $strQuery3, array( $counter, $datos_json, $options->section_tipo, $section_id ));
				if (!$result3) {
					$response->msg .= " Error on UPDATE db record on table $table . ".pg_last_error();
					return $response;
				}
				$msg[] = " + Updated record of section_id $section_id to $counter ";
			}else{
				$msg[] = " = [PREVIEW] Updated record of section_id $section_id to $counter ";
			}
			
			debug_log(__METHOD__." $strQuery3 ".to_string(), logger::DEBUG);			

			$counter++;
		}//end while ($rows = pg_fetch_assoc($result))

		if (empty($msg)) {
			$msg[] = "No records are found to change";
		}
		
		$response->result 	= true;
		$response->msg 		= implode('<br>',$msg);

		return $response;
	}//end renumerate_sections



	/**
	* ADD_GEONAMES_CODE
	* @return object $response
	*/
	public static function add_geonames_code( $request_options ) {
		
		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		$options = new stdClass();
			$options->section_tipo  	= null;
			$options->lang  			= null;
			$options->base_value  		= false; // Like "France"
			$options->save 				= false;
			$options->set_english_name	= false;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$term_tipo 			= DEDALO_THESAURUS_TERM_TIPO;
		$geonames_id_tipo 	= DEDALO_THESAURUS_GEONAMES_ID_TIPO;
		$parent_tipo 		= DEDALO_THESAURUS_RELATION_PARENT_TIPO;
		$geolocation_tipo 	= DEDALO_THESAURUS_GEOLOCATION_TIPO;
		
		$term_modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($term_tipo, true);
		$geonames_id_modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($geonames_id_tipo, true);
		$parent_modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($parent_tipo, true);
		$geolocation_modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($geolocation_tipo, true);

		require_once(DEDALO_EXTRAS_PATH .'/geonames/class.geonames.php');

		$result = section::get_resource_all_section_records_unfiltered($options->section_tipo);
		$i=0;while ($rows = pg_fetch_assoc($result)) {

			$section_id = $rows['section_id'];

			#if ($section_id==1) {
			#	continue;
			#}

			$ar_value = [];

			# term
				$component = component_common::get_instance($term_modelo_name,
															 $term_tipo,
															 $section_id,
															 'list',
															 $options->lang,
															 $options->section_tipo);
				$ar_value[] = $component->get_valor($options->lang);					

			# parent
				$component_parent   = component_common::get_instance($parent_modelo_name,
																	 $parent_tipo,
																	 $section_id,
																	 'list',
																	 DEDALO_DATA_NOLAN,
																	 $options->section_tipo);
				$dato = $component_parent->get_dato();
				if (isset($dato[0])) {
					$component2 = component_common::get_instance($term_modelo_name,
																 $term_tipo,
																 $dato[0]->section_id,
																 'list',
																 $options->lang,
																 $options->section_tipo);
					$ar_value[] = $component2->get_valor($options->lang);
				}

			# final_value
				if ($options->base_value!==false) {
					$ar_value[] = $options->base_value;
				}				
				$final_value = implode(' ', $ar_value);

				$username = geonames::get_geonames_account_username();
				$url 	  = 'http://api.geonames.org/searchJSON?q='.urlencode($final_value).'&maxRows=1&username='.$username;
				
				$msg = "- CALLING GEONAMES URL API WITH USERNAME: $username - Q: $final_value - URL: $url";
				debug_log(__METHOD__." $msg", logger::DEBUG);
				
				# Call to geonames web service API
				$data 	= file_get_contents($url);
				if (!$data 	= json_decode($data)) {
					$i++;
					debug_log(__METHOD__." ERROR ON GET DATA FROM GEONAMES ".to_string($url), logger::DEBUG);
					continue;
				}
				$data_geonames = isset($data->geonames[0]) ? $data->geonames[0] : null;
					#debug_log(__METHOD__." data ".to_string($data->geonames[0]), logger::DEBUG);
				
				
				if ( isset($data_geonames->geonameId)) {
					$geonames_id  = $data_geonames->geonameId;
					$lon 		  = $data_geonames->lng;
					$lat 		  = $data_geonames->lat;
					$english_name = $data_geonames->name;

					# Geonames ID
						$component_geonames_code = component_common::get_instance($geonames_id_modelo_name,
																				  $geonames_id_tipo,
																				  $section_id,
																				  'edit',
																				  DEDALO_DATA_NOLAN,
																				  $options->section_tipo);
						$component_geonames_code->set_dato( array($geonames_id) );
						$component_geonames_code->Save();

					# Geolocation coordinates
						$component_geolocation 	 = component_common::get_instance($geolocation_modelo_name,
																				  $geolocation_tipo,
																				  $section_id,
																				  'edit',
																				  DEDALO_DATA_NOLAN,
																				  $options->section_tipo);
						$geolocation_dato = new stdClass();
							$geolocation_dato->lat = $lat;
							$geolocation_dato->lon = $lon;
						$component_geolocation->set_dato( $geolocation_dato );
						$component_geolocation->Save();

					# name
						if ($options->set_english_name===true && $options->lang!=='lg-eng') {
							$component_term  = component_common::get_instance($term_modelo_name,
																			  $term_tipo,
																			  $section_id,
																			  'list',
																			  'lg-eng',
																			  $options->section_tipo);
							$component_term->set_dato( array($english_name) );
							$component_term->Save();
						}

					debug_log(__METHOD__."- Updated section $options->section_tipo - $section_id ".to_string($geonames_id), logger::DEBUG);

				}//end if (isset($data->geonameId))
				
			#if ($i>=3) {
			#	break;
			#}
		$i++;}


		$response->result 	= true;
		$response->msg 		= 'Ok section $options->section_tipo done ['.$i.']';


		return $response;
	}//end add_geonames_code



	/**
	* GENERATE_RELATIONS_TABLE_DATA
	* @return 
	*/
	public static function generate_relations_table_data( $tables='*' ) {
		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= array('Error. Request failed '.__METHOD__);

		$ar_msg = array();

		if ($tables!=='*') {
			$ar_tables = [];
			$tables = explode(',', $tables);
			foreach ($tables as $key => $table) {
				$ar_tables[] = trim($table);
			}
		}		
		
		if (empty($ar_tables)) {
			$ar_tables = tool_administration::$ar_tables_with_relations;
		}

		if ($tables==='*') {
			# truncate current table data
			$strQuery 	= "TRUNCATE \"relations\";";
			$result 	= JSON_RecordDataBoundObject::search_free($strQuery);

			$strQuery 	= "ALTER SEQUENCE relations_id_seq RESTART WITH 1;";
			$result 	= JSON_RecordDataBoundObject::search_free($strQuery);
		}
		

		foreach ($ar_tables as $key => $table) {

			$counter = 1;
			
			// Get last id in the table
			$strQuery 	= "SELECT id FROM $table ORDER BY id DESC LIMIT 1 ";
			$result 	= JSON_RecordDataBoundObject::search_free($strQuery);
			$rows 		= pg_fetch_assoc($result);
			if (!$rows) {
				continue;
			}
			$max 		= $rows['id'];

			$min = 1;
			if ($table==='matrix_users') {
				$min = -1;
			}
		
			// iterate from 1 to last id
			for ($i=$min; $i<=$max; $i++) {
				
				$strQuery 	= "SELECT section_id, section_tipo, datos FROM $table WHERE id = $i";
				$result 	= JSON_RecordDataBoundObject::search_free($strQuery);
				if(!$result) {			
					$msg = "Failed Search id $i. Data is not found.";
					debug_log(__METHOD__." ERROR: $msg ".to_string(), logger::ERROR);
					continue;
				}
				$n_rows = pg_num_rows($result);

				if ($n_rows<1) continue;

				while($rows = pg_fetch_assoc($result)) {

					$section_id 	= $rows['section_id'];
					$section_tipo 	= $rows['section_tipo'];
					$datos 			= json_decode($rows['datos']);

					if (!empty($datos) && isset($datos->relations)) {

						$component_dato = [];
						foreach ($datos->relations as $key => $current_locator) {
							$component_dato[$current_locator->from_component_tipo][] = $current_locator;
						}
					
						foreach ($component_dato as $from_component_tipo => $ar_locators) {
							$propagate_options = new stdClass();
								$propagate_options->ar_locators  		= $ar_locators;
								$propagate_options->section_id 	 		= $section_id;
								$propagate_options->section_tipo 		= $section_tipo;
								$propagate_options->from_component_tipo = $from_component_tipo;
							$propagate_response = search_development2::propagate_component_dato_to_relations_table( $propagate_options );
						}

					}else{
						debug_log(__METHOD__." ERROR: Empty datos from: $table $section_tipo $section_id ".to_string(), logger::ERROR);
					}
				}
				if(SHOW_DEBUG===true) {
					# Show log msg every 100 id
					if ($counter===1) {
						debug_log(__METHOD__." Updated section data table $table $i".to_string(), logger::DEBUG);
					}
					$counter++;	
					if ($counter>300) {
						$counter = 1;
					}			
				}				
				
				#break;
			}//end for ($i=$min; $i<=$max; $i++)
			$response->msg[] = " Updated table data table $table ";
			debug_log(__METHOD__." Updated table data table $table  ", logger::WARNING);
			#break; // stop now

		}//end foreach ($ar_tables as $key => $table)

		# Realocate updated files

		$response->result = true;
		$response->msg[0] = "Ok. All data is propagated successfully"; // Override first message
		$response->msg    = "<br>".implode('<br>', $response->msg);
		
		return $response;
	}//end generate_relations_table_data



	/**
	* EXPORT_HIERARCHY
	* For MASTER toponomy export
	* @return 
	*/
	public static function export_hierarchy($section_tipo) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed '.__METHOD__;

		if (!defined('EXPORT_HIERARCHY_PATH')) {
			return $response;
		}
		
		if ($section_tipo==='*') {

			# Search all active
			$strQuery = '
			SELECT a.id, a.section_id, a.section_tipo,
			 a.datos#>>\'{components, hierarchy5, valor_list, lg-eng}\' AS hierarchy5,
			 a.datos#>>\'{components, hierarchy62, valor_list, lg-nolan}\' AS hierarchy62,
			 a.datos#>>\'{components, hierarchy6, valor_list, lg-nolan}\' AS hierarchy6,
			 a.datos#>>\'{components, hierarchy7, valor_list, lg-nolan}\' AS hierarchy7,
			 a.datos#>>\'{components, hierarchy53, valor_list, lg-nolan}\' AS hierarchy53,
			 a.datos#>>\'{components, hierarchy45, valor_list, lg-nolan}\' AS hierarchy45 
			FROM "matrix_hierarchy_main" a 
			WHERE a.id IN (SELECT a.id FROM "matrix_hierarchy_main" a WHERE  a.section_id IS NOT NULL 
			 -- filter_by_section_tipo -- 
			AND (a.section_tipo = \'hierarchy1\') AND (			
			 -- filter_by_search hierarchy4 component_radio_button 
			 a.datos#>\'{relations}\' @> \'[{"section_id":"1","section_tipo":"dd64","from_component_tipo":"hierarchy4"}]\'::jsonb 
			) 
			ORDER BY a.datos#>>\'{components, hierarchy6, valor, lg-nolan}\' ASC, a.section_id ASC)  
			ORDER BY a.datos#>>\'{components, hierarchy6, valor, lg-nolan}\' ASC, a.section_id ASC
			';
			# perform query
			$result = JSON_RecordObj_matrix::search_free($strQuery);

			# loop the rows
			$ar_section_tipo = [];
			while ($rows = pg_fetch_assoc($result)) {				
				$ar_section_tipo[] = $rows['hierarchy53']; // target section tipo (General term)
			}

			
		}elseif($section_tipo==='all'){
			
			$ar_section_tipo = ['all'];
		
		}else{
			
			$ar_section_tipo = explode(',', $section_tipo);
			foreach ($ar_section_tipo as $key => $current_section_tipo) {
				$ar_section_tipo[$key] = trim($current_section_tipo);
			}
		}

		$msg = [];
		foreach ($ar_section_tipo as $key => $current_section_tipo) {
			
			$command  = '';			
			$command .= 'cd "'.EXPORT_HIERARCHY_PATH.'" ; ';
			#$command .= 'psql dedalo4_'.DEDALO_ENTITY.' -h localhost  ';
			$command  .= DB_BIN_PATH."psql ".DEDALO_DATABASE_CONN." -U ".DEDALO_USERNAME_CONN." -p ".DEDALO_DB_PORT_CONN." -h ".DEDALO_HOSTNAME_CONN;
			$command .= ' -c "\copy (SELECT section_id, section_tipo, datos FROM matrix_hierarchy WHERE ';
			if ($current_section_tipo==='all') {
				$command .= 'section_tipo IS NOT NULL ORDER BY section_tipo, section_id ASC) ';
				$date = date("Y-m-d_His");
				$command .= 'TO '.$current_section_tipo.'_'.$date.'.copy " ; ';
				$command .= 'gzip -f '.$current_section_tipo.'_'.$date.'.copy';
				
			}else{
				$command .= 'section_tipo = \''.safe_tipo($current_section_tipo).'\' ORDER BY section_id ASC) ';
				$command .= 'TO '.safe_tipo($current_section_tipo).'.copy " ; ';
				$command .= 'gzip -f '.safe_tipo($current_section_tipo).'.copy';
			}
			debug_log(__METHOD__." Exec command ".to_string($command), logger::DEBUG);
			
			$command_res = shell_exec($command);

			debug_log(__METHOD__." Exec response (shell_exec) ".to_string($command_res), logger::DEBUG);

			$msg[] = trim("section_tipo: ".$current_section_tipo." = ".to_string($command_res));
		}//end foreach ($ar_section_tipo as $key => $current_section_tipo)


		$response->result   = true;
		$response->msg 		= "Ok. All data is exported successfully"; // Override first message
		$response->msg     .= "<br>".implode('<br>', $msg);
		
		return $response;
	}//end export_hierarchy



	/**
	* PROPAGATE_SECTION_INFO_TO_DATO
	* (!) Note that current script NOT create relations records (expensive and not useful for direct search purposes)
	* @return object $response
	*/
	public static function propagate_section_info_to_dato($target_tables=null) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed [propagate_section_info_to_dato]';

		$n = 0;
		
		if (empty($target_tables)) $target_tables = array(
			'matrix_dd',
			'matrix',
			'matrix_activities',
			'matrix_dataframe',
			'matrix_hierarchy',
			'matrix_hierarchy_main',
			'matrix_indexations',
			'matrix_layout',
			'matrix_layout_dd',
			'matrix_list',
			'matrix_notes',
			'matrix_profiles',
			'matrix_projects',
			'matrix_structurations',
			'matrix_users'
		);

		foreach ($target_tables as $table) {

			debug_log(__METHOD__." Iterating table $table ".to_string(), logger::DEBUG);
			
			$strQuery = "SELECT id, section_id, section_tipo, datos FROM \"$table\" ORDER BY section_tipo ASC, section_id ASC ;";
			$result   = pg_query(DBi::_getConnection(), $strQuery);
			if (!$result) {
				$response->msg .= " Error on select db records on table $table . ".pg_last_error();
				return $response;
			}			

			# Iterate found records
			$section_tipo_old = '';
			while ($row = pg_fetch_assoc($result)) {

				$id 			= $row['id'];
				$section_id 	= $row['section_id'];
				$section_tipo 	= $row['section_tipo'];
				$datos 			= $row['datos'];

				if ($section_tipo!==$section_tipo_old) {
					debug_log(__METHOD__." Iterating table $table - section_tipo $section_tipo ".to_string(), logger::DEBUG);
					$section_tipo_old = $section_tipo;
				}

				// Convert section dato
					$section_dato 	   	= json_decode($datos);
					$new_section_dato 	= self::convert_section_dato_info($section_dato);
					$new_section_dato 	= json_encode($new_section_dato);

				// Save new dato
					$strQuery_update = "UPDATE \"$table\" SET datos = $1 WHERE id = $2";					
					$result_update   = pg_query_params(DBi::_getConnection(), $strQuery_update, array( $new_section_dato, $id ));
					if (!$result_update) {
						$response->msg .= " Error on UPDATE db record on table $table, id: $id. ".pg_last_error();
						return $response;
					}					
				$n++;
			}//end while ($row = pg_fetch_assoc($result))
		}//end foreach ($target_tables as $table)

		$response->result 	= true;
		$response->msg 		= 'Ok. Request done successfully ('.$n.' records in '.count($target_tables).' tables)';

		return $response;
	}//end propagate_section_info_to_dato



	/**
	* CONVERT_SECTION_DATO_INFO
	* @return 
	*/
	public static function convert_section_dato_info($section_dato) {

		$section_tipo = $section_dato->section_tipo;
		$section_id   = $section_dato->section_id;

		if (!isset($section_dato->components)) {
			$section_dato->components = new stdClass();
		}
		if (!isset($section_dato->relations)) {
			$section_dato->relations = [];
		}

		// Clean inverse_locators also
			if (isset($section_dato->inverse_locators)) {
				unset($section_dato->inverse_locators);
			}
		
		$value_created_by_userID 	= isset($section_dato->created_by_userID) ? $section_dato->created_by_userID : null;
		$value_created_date 		= isset($section_dato->created_date) ? $section_dato->created_date : null;
		$value_modified_by_userID 	= isset($section_dato->modified_by_userID) ? $section_dato->modified_by_userID : null;
		$value_modified_date 		= isset($section_dato->modified_date) ? $section_dato->modified_date : null;

		$modified_section_tipos = section::get_modified_section_tipos();
		# Items
		$created_by_user 		= array_filter($modified_section_tipos, function($item){ return $item['name']==='created_by_user'; });
		$created_date 			= array_filter($modified_section_tipos, function($item){ return $item['name']==='created_date'; });
		$modified_by_user 		= array_filter($modified_section_tipos, function($item){ return $item['name']==='modified_by_user'; });
		$modified_date 			= array_filter($modified_section_tipos, function($item){ return $item['name']==='modified_date'; });

		// created_by_user
			if (!empty($value_created_by_userID)) {
				
				$current_tipo = reset($created_by_user)['tipo'];
				$locator = new locator();
					$locator->set_type(DEDALO_RELATION_TYPE_LINK);
					$locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
					$locator->set_section_id($value_created_by_userID);
					$locator->set_from_component_tipo($current_tipo);				
				
				// Update section dato
				$section_dato->relations[] = $locator;
			}

		// created_date
			if (!empty($value_created_date)) {
				$component_data = self::create_component_date_from_value($value_created_date, 'Created date');
				if (!empty($component_data)) {
					// Update section dato
					$current_tipo = reset($created_date)['tipo'];
					$section_dato->components->$current_tipo = $component_data;
				}
			}

		// modified_by_user
			if (!empty($value_modified_by_userID)) {
				
				$current_tipo = reset($modified_by_user)['tipo'];
				$locator = new locator();
					$locator->set_type(DEDALO_RELATION_TYPE_LINK);
					$locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
					$locator->set_section_id($value_modified_by_userID);
					$locator->set_from_component_tipo($current_tipo);				
				
				// Update section dato
				$section_dato->relations[] = $locator;
			}

		// modified_date
			if (!empty($value_modified_date)) {
				$component_data = self::create_component_date_from_value($value_modified_date, 'Modified date');
				if (!empty($component_data)) {
					// Update section dato
					$current_tipo = reset($modified_date)['tipo'];
					$section_dato->components->$current_tipo = $component_data;
				}
			}
		#dump(json_encode($section_dato, JSON_PRETTY_PRINT), ' section_dato ++ '.to_string());

		return $section_dato;
	}//end convert_section_dato_info



	/**
	* CREATE_COMPONENT_DATE_FROM_VALUE
	* @param string $value like '2018-12-28 10:33:15'
	* @return object $current_dato (component full data)
	*/
	public static function create_component_date_from_value($value, $label='') {

		$dd_date = new dd_date();
		$dd_date->get_date_from_timestamp( $value );
		$time 	 = dd_date::convert_date_to_seconds( $dd_date );
		
		$current_dato = '
		{
		  "dato": {
			"lg-nolan": [
			  {
				"start": {
				  "day": '.$dd_date->day.',
				  "hour": '.$dd_date->hour.',
				  "time": '.$time.',
				  "year": '.$dd_date->year.',
				  "month": '.$dd_date->month.',
				  "minute": '.$dd_date->minute.',
				  "second": '.$dd_date->second.'
				}
			  }
			]
		  },
		  "info": {
			"label": "'.$label.'",
			"modelo": "component_date"
		  },
		  "valor": {
			"lg-nolan": [
			  {
				"start": {
				  "day": '.$dd_date->day.',
				  "hour": '.$dd_date->hour.',
				  "time": '.$time.',
				  "year": '.$dd_date->year.',
				  "month": '.$dd_date->month.',
				  "minute": '.$dd_date->minute.',
				  "second": '.$dd_date->second.'
				}
			  }
			]
		  },
		  "valor_list": {
			"lg-nolan": "'.$value.'"
		  }
		}
		';

		return json_decode($current_dato);
	}//end create_component_date_from_value



	/**
	* GET_LAST_BACKUP_INFO
	* @return string $last_modified_file
	*/
	public function get_last_backup_info() {
		
		// read dir
			$path 				= DEDALO_LIB_BASE_PATH.'/backup/backups';
			$allowed_extensions = ['backup'];

		// call to core function
			$last_modified_file = get_last_modified_file($path, $allowed_extensions);


		#$info = new SplFileInfo($last_modified_file);		


		return $last_modified_file;
	}//end get_last_backup_info



}//end class
?>