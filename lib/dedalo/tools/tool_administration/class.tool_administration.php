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
		
			$query 	= ' CREATE TABLE IF NOT EXISTS "matrix_notifications" (
						"id" serial NOT NULL,
						"datos" jsonb NULL,
						CONSTRAINT matrix_notifications_id PRIMARY KEY(id)
					) ';

			$result = self::SQL_update($query);

			if ($result) {
				$query_insert 	= ' INSERT INTO "matrix_notifications" ("id","datos") SELECT 1, \'[]\' WHERE NOT EXISTS (SELECT id FROM "matrix_notifications" WHERE id = 1) ';
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
	public function delete_component_tipo_in_matrix_table($section_tipo ,$component_tipo, $language=false, $save=false) {

		#select matrix table
		$matrix_table 	= common::get_matrix_table_from_tipo($section_tipo);
		$proced = false;

		#Query all rows with this section_tipo into the DB
		$strQuery = 'SELECT id, section_id, section_tipo, datos 
		FROM '.$matrix_table.'
		WHERE section_tipo = \''.$section_tipo.'\' 
		ORDER BY id ASC ';
		
		echo "<br> strQuery: $strQuery <br>";
		#perform query
		$result   = JSON_RecordObj_matrix::search_free($strQuery);

		#loop the rows
		while ($rows = pg_fetch_assoc($result)) {

			$id 			= (int)$rows['id'];
			$section_id 	= $rows['section_id'];
			$section_tipo 	= $rows['section_tipo'];
			$datos 	= (string)$rows['datos'];

			$datos	= (object)json_handler::decode($datos);
				#dump($datos->components->rsc29,"rsc29 ");	continue;
			$before = "";
			$after = "";

			#if language is set, delete the language into the componet
			if($language){
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
			}
				#dump($datos->components,"AFTER dato ($component_tipo) $section_id");
				#dump( htmlentities( $datos->components->rsc29->valor_list->$lang )," rsc29 valor_list");
				#continue;
			
			if($proced){

		 		$datos = (string)json_handler::encode($datos);		
				$datos = pg_escape_string($datos);
				#dump($datos," section_real_tipo"); 	


				// Save section dato			
				$strQuery = "UPDATE \"$matrix_table\" SET datos = '$datos' WHERE id = $id";
					#dump($strQuery, ' strQuery');
					
				#if check "save" proced to save the new dato into the DB row (update the row)
				if ($save) {
					$update_result 	= pg_query(DBi::_getConnection(), $strQuery);
					if (!$update_result) {
						dump($strQuery,"strQuery");
						echo pg_last_error();
						echo "<br> Error on Update row id:$id  - pg_last_error:". pg_last_error() ." <hr> "; //substr($strQuery, 0,250)
					}else {
						echo "<br> Updated row id:$id   - section_id: $section_id 	- section_tipo: $section_tipo - component_tipo: $component_tipo"." <hr> <br> BEFORE: $before <br> AFTER: $after"; //substr($strQuery, 0,250)
					}
				}else{
					echo "<hr> (PREVIEW) Updated row id:$id   - section_id: $section_id 	- section_tipo: $section_tipo - component_tipo: $component_tipo <hr> <br> BEFORE: $before <br> AFTER: $after"; 
				}
				#dump($dato," dato");	
			}
		}//end while
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
	* @return 
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

		$current_version 	= self::get_current_version_in_db();

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


		if(isset($update->SQL_update)){
			foreach ((array)$update->SQL_update as $key => $current_query) {
				$SQL_update = self::SQL_update($current_query);
			}
		}
		if(isset($update->components_update)){
			foreach ($update->components_update as $modelo_name) {
				$components_update[]	= self::components_update($modelo_name, $current_version, $update_version);
			}
			
		}
		if(isset($update->run_scripts)){
			foreach ((array)$update->run_scripts as $current_script) {
				$run_scripts = self::run_scripts($current_script);
			}
		}
		
		# TABLE MATRIX_UPDATES DATA
		$version_to_update = self::get_update_version();
		$version_to_update = implode(".", $version_to_update);
		$new_version 	   = self::update_dedalo_data_version($version_to_update);
		

		$result = isset($components_update) ? $components_update : null;

		return $result;		
	}//end update_version



	/**
	* COMPONENTS_UPDATE
	* @param string $modelo_name
	* @param array $current_version
	* @param array $update_version
	* @return array $total_update
	*/
	public static function components_update($modelo_name, $current_version, $update_version) {

		$total_update = array();

		$ar_section_tipo = array();
		$ar_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name('section');		

		foreach ($ar_section_tipo as $current_section_tipo) {

			if($current_section_tipo == DEDALO_ACTIVITY_SECTION_TIPO){
				continue;
			}

<<<<<<< HEAD
			#$ar_component_tipo = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_section_tipo, $modelo_name, 'children_recursive', $search_exact=true);
			$ar_component_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($current_section_tipo, array($modelo_name), $from_cache=true, $resolve_virtual=true, $recursive=true);
			
=======
			#$ar_component_tipo =  (array)RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_section_tipo, $modelo_name, 'children_recursive', $search_exact=true);
			$ar_component_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($current_section_tipo, array($modelo_name), $from_cache=true, $resolve_virtual=true, $recursive=true);
>>>>>>> origin/master

			
			if (!empty($ar_component_tipo)) {
				$ar_modelo_tipo[$current_section_tipo] = $ar_component_tipo;
				
				$ar_section_id 	= section::get_ar_all_section_records_unfiltered($current_section_tipo);
				
				$i=0;
				$tm=0;
				foreach ($ar_section_id as $section_id) {					
					foreach ($ar_component_tipo as $current_component_tipo) {

						$RecordObj_dd = new RecordObj_dd($current_component_tipo);
						$translatable = $RecordObj_dd->get_traducible();
						if($translatable =='no'){
							$ar_langs = array(DEDALO_DATA_NOLAN);
						}else{
							$ar_langs = unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);
						}
						
						foreach ($ar_langs as $current_lang) {							
							
							#Update component dato
							$component = component_common::get_instance($modelo_name,
																		$current_component_tipo,
																		$section_id,
																		'update',
																		$current_lang,
																		$current_section_tipo);
							$dato_unchanged = $component->get_dato_unchanged();

							$reference_id = $current_section_tipo.'.'.$section_id.'.'.$current_component_tipo;

							$response = $modelo_name::update_dato_version($update_version, $dato_unchanged, $reference_id);
							#debug_log(__METHOD__." UPDATE_DATO_VERSION COMPONENT RESPONSE [$modelo_name][{$current_section_tipo}-{$section_id}]: result: ".to_string($response->result), logger::DEBUG);

							if($response->result == 1){
								$component->set_dato($response->new_dato);
								$component->Save();
								#debug_log(__METHOD__." UPDATED dato from component [$modelo_name][{$current_section_tipo}-{$section_id}] ".to_string(), logger::DEBUG);
								$i++;
								$total_update[$current_section_tipo][$current_component_tipo][$current_lang]['i']=$i;
								echo $response->msg;
							}else{
								echo $response->msg;
								if($response->result == 0){
									continue 4;
								}
							}
							#Update Time_machine component dato
							/**/
							$ar_time_machine_obj = tool_time_machine::update_records_in_time_machine($current_component_tipo, $section_id, $current_lang, $current_section_tipo);
							foreach ($ar_time_machine_obj  as $current_time_machine_obj) {
								$dato_unchanged = $current_time_machine_obj->get_dato();
								$response = $modelo_name::update_dato_version($update_version, $dato_unchanged, $reference_id);
								#debug_log(__METHOD__." UPDATE_DATO_VERSION TIME_MACHINE RESPONSE [$modelo_name][{$current_section_tipo}-{$section_id}]: result: ".to_string($response->result), logger::DEBUG);
								if($response->result == 1){
									$current_time_machine_obj->set_dato($response->new_dato);
									$current_time_machine_obj->Save();										
									#debug_log(__METHOD__." UPDATED TIME MACHINE dato from component [$modelo_name][{$current_section_tipo}-{$current_component_tipo}-{$current_lang}-{$section_id}] ".to_string($tm), logger::DEBUG);
									$tm++;
									$total_update[$current_section_tipo][$current_component_tipo][$current_lang]['tm'] = (int)$tm;
									echo $response->msg;
								}else{
									echo $response->msg;
									if($response->result == 0){
										continue 5;
									}
								}
							}
						}
					}
				}
			}
		}
		
		return $total_update;		
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
			if(SHOW_DEBUG) {
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

				if ($extension=='sh' || $extension=='log') {
					$file_name = pathinfo($file,PATHINFO_BASENAME);
			  		$ar_deleted_files[] = $file_name;

			  		unlink($file); // delete file
				}
			}
		}

		return $ar_deleted_files;
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





}
?>
