<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once(dirname(__FILE__) .'/updates/updates.php');



/*
* CLASS TOOL_ADMINISTRATION
*/
class tool_administration extends tool_common {
	
	protected $section_obj ;

	
	
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
	}



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
				#dump($tables, ' tables ++ '.to_string());

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

		#select matrix table
		$matrix_table 	= common::get_matrix_table_from_tipo($section_tipo);
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
				#dump($datos->components->rsc29,"rsc29 ");	continue;		
				
			$before = "";
			$after  = "";

			#if language is set, delete the language into the componet
			if(!empty($language)) {
				if (isset($datos->components->$component_tipo->dato->$language)) {

					#dump($datos->components->$component_tipo->dato,"BEFORE dato $component_tipo $section_id");
					$before = json_encode($datos->components->$component_tipo->dato);

					unset($datos->components->$component_tipo->dato->$language);

					#dump($datos->components->$component_tipo->dato,"BEFORE dato $component_tipo $section_id");
					$after = json_encode($datos->components->$component_tipo->dato);
					
					$proced = true;
				}
				//$proced = false;

			#if langage in not set, remove all component (dato, value, value_list,...)
			}else if (isset($datos->components->$component_tipo)) {

				#dump($datos->components->$component_tipo,"BEFORE dato $component_tipo $section_id");
				$before = json_encode($datos->components->$component_tipo);

				unset($datos->components->$component_tipo);

				$proced = true;

			}else{

				$proced = false;
				$msg[] = "Not found dato for delete in $section_tipo - $section_id - $component_tipo";
			}
			#dump($datos->components,"AFTER dato ($component_tipo) $section_id");
			#dump( htmlentities( $datos->components->rsc29->valor_list->$lang )," rsc29 valor_list");
			#continue;
			
			
			if($proced===true){

		 		$datos = (string)json_handler::encode($datos);		
				$datos = pg_escape_string($datos);
				#dump($datos," section_real_tipo");

				// Save section dato			
				$strQuery = "UPDATE \"$matrix_table\" SET datos = '$datos' WHERE id = $id";
					#dump($strQuery, ' strQuery');

				if(SHOW_DEBUG===true) {
					#$msg[] = "$strQuery";
				}
					
				#if check "save" proced to save the new dato into the DB row (update the row)
				if ($save===true) {
					$update_result 	= pg_query(DBi::_getConnection(), $strQuery);
					if (!$update_result) {
						# dump($strQuery,"strQuery");
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
	* @return string $current_version
	*/
	public static function get_current_version_in_db() {
		$current_version = array();

		#
		# Test table exists	and create if not
		$table_exits = self::table_exits("matrix_updates");
			#dump($table_exits, ' $table_exits ++ '.to_string()); die();
		
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
		$result   = JSON_RecordObj_matrix::search_free($strQuery);

		#loop the rows
		while ($rows = pg_fetch_assoc($result)) {

			$id 	= (int)$rows['id'];
			$datos 	= (string)$rows['datos'];

			$datos	= (object)json_handler::decode($datos);
		}

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
	* @return string $current_version
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
			#dump($updates, ' updates'.to_string());
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
		$backup_info = backup::init_backup_secuence($user_id, $username, $skip_backup_time_range=true);
		debug_log(__METHOD__."  backup_info: $backup_info ".to_string(), logger::DEBUG);

		if ($backup_info ) {
			$response->result 	= true;
			$response->msg 		= 'Backup is done: '.$backup_info;
		}

		return (object)$response;
	}//end make_backup



	/**
	* UPDATE_VERSION
	* @return 
	*/
	public static function update_version() {
		global $updates;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		$current_version 	= self::get_current_version_in_db();

		$msg = array();

		#
		# BACKUP
		# Before update version dato, we force a backup of all database
		//self::make_backup();


		#Select the correct update from file updates
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
				$msg[] = "Updated sql: ".to_string($SQL_update);
			}
		}
		# components_update
		if(isset($update->components_update)){
			foreach ($update->components_update as $modelo_name) {
				$components_update[] = self::components_update($modelo_name, $current_version, $update_version);
				$msg[] = "Updated components: ".to_string($modelo_name);
			}			
		}
		# run_scripts
		if(isset($update->run_scripts)){
			foreach ((array)$update->run_scripts as $current_script) {
				$run_scripts = self::run_scripts($current_script);
				$msg[] = "Updated run scripts: ".to_string($run_scripts);
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

			# Activity data is not updated
			if($current_section_tipo === DEDALO_ACTIVITY_SECTION_TIPO){
				continue;
			}			

			#
			# Test if target table exists (avoid errors on update components of "too much updated" structures)
			$current_table = common::get_matrix_table_from_tipo($current_section_tipo);
			if (!in_array($current_table, $tables) ) {
				debug_log(__METHOD__." Skipped section ($current_section_tipo) because table ($current_table) not exists ".to_string(), logger::WARNING);
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
				debug_log(__METHOD__." Skipped current_section_tipo '$current_section_tipo'. (Empty components) ".to_string(), logger::WARNING);
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

						$response = $modelo_name::update_dato_version($update_version, $dato_unchanged, $reference_id);
						#debug_log(__METHOD__." UPDATE_DATO_VERSION COMPONENT RESPONSE [$modelo_name][{$current_section_tipo}-{$section_id}]: result: ".to_string($response->result), logger::DEBUG);

						if($response->result === 1){
							$component->updating_dato = true;
							$component->set_dato($response->new_dato);
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
							$response 		= $modelo_name::update_dato_version($update_version, $dato_unchanged, $reference_id);
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
			time_nanosleep(0, 50000000); // 10 ms
			
		}//end foreach ($ar_section_tipo as $current_section_tipo)
		
		#return $total_update;
		return true;
	}//end components_update



	/**
	* SQL_UPDATE
	* @param string $SQL_update
	* @return bool
	*/
	public static function SQL_update($SQL_update) {

		$result = pg_query(DBi::_getConnection(), $SQL_update);		
		if(!$result) {
			echo "Error: sorry an error ocurred on SQL_update code.";
			if(SHOW_DEBUG===true) {
				trigger_error( "<span class=\"error\">Error Processing SQL_update Request </span>". pg_last_error() );
				dump($SQL_update,"SQL_update ".to_string( pg_last_error()  ));				
				#throw new Exception("Error Processing SQL_update Request ". pg_last_error(), 1);;
			}
			return false;
		}
		debug_log(__METHOD__." Executed database update: ".to_string($SQL_update), logger::DEBUG);

		return true;		
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
				#dump($table_exits, ' table_exits ++ '.to_string($strQuery));	 die();
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
			#dump($strQuery, ' $strQuery ++ '.to_string()); die();

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
			#dump($files, ' files ++ '.to_string($dir_path));

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
		
		$script_class  = $script_obj->script_class;
		$script_method = $script_obj->script_method;
		$script_vars   = isset($script_obj->script_vars) ? $script_obj->script_vars : array();		

		//$result = $script_class::$script_method( $script_obj->script_vars );
		$result = call_user_func_array($script_class.'::'.$script_method, $script_vars);		
		
		return $result;
	}//end run_scripts



	/**
	* GET_APPROXIMATE_ROW_COUNT
	* @return int $total_records
	*/
	public static function get_approximate_row_count( $matrix_table ) {
		
		$total_records= 0;		

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
				$component_portal->Save();
			}//end if (!is_null($options->source_portal_tipo))
			


			$response->result[] = $current_section_id;
		}//end foreach ($ar_section_records as $key => $current_section_id)



		if ($response->result!==false) {
			$response->msg = "Processed records: ".count($response->result);
		}

		return (object)$response;
	}//end move_component_data



}//end class
?>