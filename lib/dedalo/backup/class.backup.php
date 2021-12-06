<?php
/*
* CLASS BACKUP
*
*
*/
require_once( DEDALO_LIB_BASE_PATH . '/common/class.exec_.php');

abstract class backup {

	# Columns to save (used by copy command, etc.)
	# Not use id columns NEVER here
	public static $jer_dd_columns			= '"terminoID", parent, modelo, esmodelo, esdescriptor, visible, norden, tld, traducible, relaciones, propiedades, properties';
	public static $descriptors_dd_columns	= 'parent, dato, tipo, lang';
	public static $checked_download_str_dir	= false;



	/**
	* INIT_BACKUP_SECUENCE
	* Make backup (compresed mysql dump) of current dedalo DB before login
	* @return $db_name." ($file_bk_size)";
	*/
	public static function init_backup_secuence($user_id, $username, $skip_backup_time_range=false) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed '.__METHOD__;

		# Force liberate browser session
			session_write_close();

		if (defined('DEDALO_DB_MANAGEMENT') && DEDALO_DB_MANAGEMENT===false) {
			$response->result 	= true;
			$response->msg 		= 'Ok. Skipped request by db config managment '.__METHOD__;
			return $response;
		}

		try {
			# NAME : File name formated as date . (One hour resolution)
			$ar_dd_data_version = tool_administration::get_current_version_in_db();
			$db_name = ($skip_backup_time_range===true)
				? date("Y-m-d_His") .'.'. DEDALO_DATABASE_CONN .'.'. DEDALO_DB_TYPE .'_'. $user_id .'_forced_dbv' . implode('-', $ar_dd_data_version)
				: date("Y-m-d_H")   .'.'. DEDALO_DATABASE_CONN .'.'. DEDALO_DB_TYPE .'_'. $user_id .'_dbv' . implode('-', $ar_dd_data_version);

			$file_path = DEDALO_LIB_BASE_PATH.'/backup/backups';

			# Backups folder exists verify
			if( !is_dir($file_path) ) {
				if(!mkdir($file_path, 0700, true)) {
					#throw new Exception(" Error on read or create backup directory. Permission denied");
					$response->result 	= false;
					$response->msg 		= "Error on read or create backup directory. Permission denied ".__METHOD__;
					return $response;
				}
				debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
			}


			if($skip_backup_time_range===true) {
				#
				# Direct backup is forced
				debug_log(__METHOD__." Making backup without time range prevention ".to_string(), logger::DEBUG);

			}else{
				#
				# Time range for backups in hours
				if (!defined('DEDALO_BACKUP_TIME_RANGE')) {
					define('DEDALO_BACKUP_TIME_RANGE', 8); // Minimun lapse of time (in hours) for run backup script again. Default: (int) 4
				}
				$last_modification_time_secs = get_last_modification_date( $file_path, $allowedExtensions=array('backup'), $ar_exclude=array('/acc/'));
				$current_time_secs 			 = time();
				$difference_in_hours 		 = round( ($current_time_secs/3600) - round($last_modification_time_secs/3600), 0 );
				if ( $difference_in_hours < DEDALO_BACKUP_TIME_RANGE ) {
					$msg = " Skipped backup. A recent backup (about $difference_in_hours hours early) already exists. Is not necessary build another";
					debug_log(__METHOD__." $msg ".to_string(), logger::DEBUG);
					$response->result 	= true;
					$response->msg 		= $msg . " ".__METHOD__;
					return $response;
				}
			}


			#
			# Backup file exists (less than an hour apart)
			$mysqlExportPath = $file_path .'/'. $db_name . '.custom.backup';
			if (file_exists($mysqlExportPath)) {
				$msg = " Skipped backup. A recent backup already exists ('$mysqlExportPath'). Is not necessary build another";
				debug_log(__METHOD__." $msg ".to_string(), logger::DEBUG);
				$response->result 	= true;
				$response->msg 		= $msg . " ".__METHOD__;
				return $response;
			}

			// Export the database and output the status to the page
			$command='';	#'sleep 1 ;';
			# $command = DB_BIN_PATH.'pg_dump -h '.DEDALO_HOSTNAME_CONN.' -p '.DEDALO_DB_PORT_CONN. ' -U "'.DEDALO_USERNAME_CONN.'" -F c -b -v '.DEDALO_DATABASE_CONN.'  > "'.$mysqlExportPath .'"';
			$command = DB_BIN_PATH.'pg_dump -h '.DEDALO_HOSTNAME_CONN.' -p '.DEDALO_DB_PORT_CONN. ' -U "'.DEDALO_USERNAME_CONN.'" -F c -b '.DEDALO_DATABASE_CONN.'  > "'.$mysqlExportPath .'"';

			if($skip_backup_time_range===true) {

				$command = 'nice -n 19 '.$command;
				debug_log(__METHOD__." Building direct backup file ($mysqlExportPath). Command:\n ".to_string($command), logger::DEBUG);

				# EXEC DIRECTLY AND WAIT RESULT
				shell_exec($command);

			}else{

				$command = 'sleep 6s; nice -n 19 '.$command;

				# BUILD SH FILE WITH BACKUP COMMAND IF NOT EXISTS
				$prgfile = DEDALO_LIB_BASE_PATH.'/backup/temp/backup_' . DEDALO_DB_TYPE . '_' . date("Y-m-d_His") . '_' . DEDALO_DATABASE_CONN  . '.sh';	//
				if(!file_exists($prgfile)) {

					# TARGET FOLDER VERIFY (EXISTS AND PERMISSIONS)
					try{
						$target_folder_path = DEDALO_LIB_BASE_PATH.'/backup/temp'; ;
						# folder exists
						if( !is_dir($target_folder_path) ) {
							if(!mkdir($target_folder_path, 0775,true)) throw new Exception(" Error on read or create backup temp directory. Permission denied");
						}
					} catch (Exception $e) {
						$msg = '<span class="error">'.$e->getMessage().'</span>';
						#echo dd_error::wrap_error($msg);
						debug_log(__METHOD__." Exception: $msg ".to_string(), logger::ERROR);
					}

					# SH FILE GENERATING
					$fp = fopen($prgfile, "w");
					fwrite($fp, "#!/bin/bash\n");
					fwrite($fp, "$command\n");
					fclose($fp);
					# SH FILE PERMISSIONS
					if(file_exists($prgfile)) {
						chmod($prgfile, 0755);
					}else{
						throw new Exception("Error Processing backup. Script file not exists or is not accessible. Please check folder '../backup/temp' permissions", 1);
					}
				}
				debug_log(__METHOD__." Building delayed backup file ($mysqlExportPath). Command:\n ".to_string($command), logger::DEBUG);


				# RUN DELAYED COMMAND
				exec_::exec_sh_file($prgfile);
			}//end if($skip_backup_time_range===true)


			/*
			# EXEC : Exec command
				$worked_result exec_::exec_command($command);

				switch($worked_result){
					case 0:
						$msg = 'Database <b>' .DEDALO_DATABASE_CONN .'</b> successfully exported to <b>' .$mysqlExportPath .'</b>';
						#trigger_error($msg);
						break;
					case 1:
						$msg = "There was a error ($worked_result) during the system backup. Please contact with your administrator and report this error";
						throw new Exception($msg, 1);
						break;
					case 2:
						$msg = "There was an error ($worked_result) during backup. Please contact with your administrator and report this error";
						throw new Exception($msg, 1);
						break;
					default:
						$msg = $worked_result;
						throw new Exception($msg, 1);
				}
			*/

		} catch (Exception $e) {
			$msg = "Sorry $username. ".  $e->getMessage(). "\n";
			#trigger_error($msg);
			debug_log(__METHOD__." Exception: $msg ".to_string(), logger::ERROR);
			$response->result 	= false;
			$response->msg 		= "Exception: $msg ";
			return $response;
		}

		// BK Filesize
			$file_bk_size = (file_exists($mysqlExportPath))
				? format_size_units( filesize($mysqlExportPath) )
				: '0 MB';


		$response->result	= true;
		$response->msg		= "Ok. backup done. ".$db_name." ($file_bk_size)";


		return (object)$response;
	}//end init_backup_secuence



	/**
	* GET_TABLES
	* Get all tables name (unfiltered) from current database
	* @return array $tableList
	*/
	public static function get_tables() {

		$strQuery = "
			SELECT *
			FROM information_schema.tables
			WHERE table_type = 'BASE TABLE'
			 AND table_schema = 'public'
			ORDER BY table_type, table_name
		";
		$result	= JSON_RecordDataBoundObject::search_free($strQuery);

		if(!$result) {
			$msg = "Failed Search. Data is not found. Please contact with your admin (1)" ;
			if(SHOW_DEBUG===true) {
				throw new Exception($msg, 1);
			}
			debug_log(__METHOD__." ERROR: $msg ".to_string(), logger::ERROR);
			return false;
		}
		$tableList = array();
		while($rows = pg_fetch_assoc($result)) {
			$tableList[] = $rows['table_name'];
		}

		return (array)$tableList;
	}//end get_tables



	/**
	* COPY_TO_FILE
	* Copy rows from DB to file filtered by tld
	* Copy is made using psql daemon
	* @return string $res
	*/
	public static function copy_to_file($table, $path_file, $tld) {
		$res='';

		$command_base = DB_BIN_PATH."psql ".DEDALO_DATABASE_CONN." -U ".DEDALO_USERNAME_CONN." -p ".DEDALO_DB_PORT_CONN." -h ".DEDALO_HOSTNAME_CONN;
		switch ($table) {
			case 'jer_dd':
				$command = $command_base . " -c \"\copy (SELECT ".addslashes(backup::$jer_dd_columns)." FROM jer_dd WHERE ". '\"terminoID\"' ." LIKE '{$tld}%') TO '{$path_file}' \" " ;
				$res .= shell_exec($command);
				break;

			case 'matrix_descriptors_dd':
				$command = $command_base . " -c \"\copy (SELECT ".addslashes(backup::$descriptors_dd_columns)." FROM \"matrix_descriptors_dd\" WHERE parent LIKE '{$tld}%') TO '{$path_file}' \" ";
				$res .= shell_exec($command);
				break;

			case 'matrix_dd':
				$command = $command_base . " -c \"\copy (SELECT * FROM \"$table\") TO '{$path_file}' \" ";
				$res .= shell_exec($command);
				#debug_log(__METHOD__." matrix_dd copy command ".to_string($command), logger::ERROR);
				break;
		}

		if (!file_exists($path_file)) {
			throw new Exception("Error Processing Request. File $path_file not created!", 1);
		}

		return (string)$res;
	}//end copy_to_file



	/**
	* COPY_FROM_FILE
	* Copy rows from postgres 'COPY' (like csv) to table
	* Previously, existing records whit current tld are deleted
	* Delete is made as regular php query to database
	* Copy is made using psql daemon
	* @return string $res
	*/
	public static function copy_from_file($table, $path_file, $tld) {
		$res='';

		if (!file_exists($path_file)) {
			throw new Exception("Error Processing Request. File $path_file not found", 1);
		}		

		$command_history = array();

		$command_base = DB_BIN_PATH."psql ".DEDALO_DATABASE_CONN." -U ".DEDALO_USERNAME_CONN." -p ".DEDALO_DB_PORT_CONN." -h ".DEDALO_HOSTNAME_CONN;
      	#$command_base = DB_BIN_PATH.'psql -h '.DEDALO_HOSTNAME_CONN.' -p '.DEDALO_DB_PORT_CONN. ' -U '.DEDALO_USERNAME_CONN.' '.DEDALO_DATABASE_CONN;
		switch ($table) {

			case 'jer_dd':
				// verify target table columns
					$check_column_name	= 'properties';
					$strQuery			= "SELECT column_name FROM information_schema.columns WHERE table_name='jer_dd' and column_name='$check_column_name'";
					$result				= JSON_RecordDataBoundObject::search_free($strQuery);
					if(!$result) {
						$msg = "Failed Search column_name '$check_column_name'. Error on exec sql query. Please contact with your admin (3)";
						if(SHOW_DEBUG===true) {
							throw new Exception($msg, 1);
						}
						debug_log(__METHOD__." ERROR: $msg ".to_string(), logger::ERROR);
						return false;
					}
					while($rows = pg_fetch_assoc($result)) {
						$found_column_name = $rows['column_name'];
					}
					if (empty($found_column_name)) {
						$msg = "Column '$check_column_name' not found. Please update your Dédalo version or manually add column '$check_column_name' to table 'jer_dd'";
						if(SHOW_DEBUG===true) {
							// throw new Exception($msg, 1);
						}
						debug_log(__METHOD__." ERROR: $msg ".to_string(), logger::ERROR);
						return false;
					}

				# DELETE . Remove previous records
				#$strQuery  = "DELETE FROM \"jer_dd\" WHERE \"terminoID\" LIKE '{$tld}%'; "; #pg_query(DBi::_getConnection(), $strQuery);
				$command = $command_base . " -c \"DELETE FROM \"jer_dd\" WHERE ".'\"terminoID\"'." LIKE '{$tld}%'\" "; # -c "DELETE FROM \"jer_dd\" WHERE \"terminoID\" LIKE 'dd%'"
				$res .= shell_exec($command);
				$command_history[] = $command;

				# COPY . Load data from file
				$command = $command_base . " -c \"\copy jer_dd(".addslashes(backup::$jer_dd_columns).") from {$path_file}\" ";
				$res .= shell_exec($command);
				$command_history[] = $command;
				break;

			case 'matrix_descriptors_dd':
				# DELETE . Remove previous records
				#$strQuery = "DELETE FROM \"matrix_descriptors_dd\" WHERE \"parent\" LIKE '{$tld}%';"; #pg_query(DBi::_getConnection(), $strQuery);
				$command = $command_base . " -c \"DELETE FROM \"matrix_descriptors_dd\" WHERE parent LIKE '{$tld}%'\" "; # -c "DELETE FROM \"jer_dd\" WHERE \"terminoID\" LIKE 'dd%'"
				$res .= shell_exec($command);
				$command_history[] = $command;

				# COPY . Load data from file
				$command = $command_base . " -c \"\copy matrix_descriptors_dd(".addslashes(backup::$descriptors_dd_columns).") from {$path_file}\" ";
				$res .= shell_exec($command);
				$command_history[] = $command;
				break;

			case 'matrix_dd':
				# DELETE . Remove previous records
				#$strQuery = "DELETE FROM \"matrix_descriptors_dd\" WHERE \"parent\" LIKE '{$tld}%';"; #pg_query(DBi::_getConnection(), $strQuery);
				$command = $command_base . " -c \"DELETE FROM \"$table\" \" "; # -c "DELETE FROM \"jer_dd\" WHERE \"terminoID\" LIKE 'dd%'"
				$res .= shell_exec($command);
				$command_history[] = $command;

				# COPY . Load data from file
				$command = $command_base . " -c \"\copy matrix_dd from {$path_file}\" ";
				$res .= shell_exec($command);
				$command_history[] = $command;
				break;
		}
		$res = str_replace("\n",' ',$res);

		#debug_log(__METHOD__." res:$res - command: ".implode('; ',$command_history), logger::DEBUG);

		return (string)$res;
	}//end copy_from_file



	/**
	* EXPORT_STRUCTURE
	* Exec pg_dump of selected tables and generate postgres 'copy' of tld indepedent files
	* By default, jer_dd and matrix_descriptors_dd (and sequences) are excluded because they are saved as independent tld files
	* When export structure is done, two versions are created: full and partial. Full contain all tlds and sequences of dedalo *_dd tables
	* and partial the same except jer_dd and matrix_descriptors_dd
	* @see trigger.db_utils
	* @param string $db_name like 'dedalo4_development_str.custom'. If null, default is used
	* @param bool $exclude_tables default true
	* @return string $res_html table of results
	*/
	public static function export_structure($db_name=null, $exclude_tables=true) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__METHOD__.']';


		if (defined('DEDALO_DB_MANAGEMENT') && DEDALO_DB_MANAGEMENT===false) {
			$response->result 	= true;
			$response->msg 		= 'Ok. Skipped request by db config managment '.__METHOD__;
			return $response;
		}

		#
		# DB_SYSTEM_CONFIG_VERIFY
		$system_config_verify = self::db_system_config_verify();
		if ($system_config_verify->result===false) {
			$response->msg 		.= $system_config_verify->msg;
			return $response;
		}


		if (empty($db_name)) {
			$db_name = 'dedalo4_development_str.custom';
		}

		$file_path		 = DEDALO_LIB_BASE_PATH .'/backup/backups_structure/';
		$mysqlExportPath = $file_path . $db_name . ".backup";

		# Export the database and output the status to the page
		# '-F c' Output compressed custom format (p = plain, c = custom, d = directory, t = tar)
		# '-b' inclulde blobs
		# '-v' verbose mode
		# '-t "*_dd"' tables wildcard. dump only tables ended with '_dd'
		# -T "jer_dd*" -T "matrix_descriptors_dd*"  exclude tables
		$command  = '';
		$command .= DB_BIN_PATH.'pg_dump -h '.DEDALO_HOSTNAME_CONN.' -p '.DEDALO_DB_PORT_CONN. ' -U "'.DEDALO_USERNAME_CONN.'" ';
		if ($exclude_tables===true) {
		$command .= '-T "jer_dd*" -T "matrix_descriptors_dd*" ';	// Exclude tables (AND respective sequences) ( T UPERCASE )
		}
		$command .= '-F c -t "*_dd" -t "*dd_id_seq" ';				// Include tables ( t lowercase ) -t "*_dd" -t "*dd_id_seq"
		$command .= DEDALO_DATABASE_CONN.' > "'.$mysqlExportPath .'"';
		// -T "jer_dd" -T "matrix_descriptors_dd"

		# LOW PRIORITY ( nice , at 22:56 , etc)
		#$command = "nice ".$command ;
		#debug_log(__METHOD__." command  ".to_string($command), logger::DEBUG);

		// exec command in terminal
			// exec($command.' 2>&1', $output, $worked_result);
			$output			= null;
			$worked_result	= null;
			exec($command, $output, $worked_result);
			debug_log(__METHOD__." Execute import_structure command with output: ".to_string($output)." and worked_result: ".to_string($worked_result), logger::WARNING);

		$res_html='';
		switch($worked_result){
			case 0:
				$label = ($exclude_tables===true) ? 'EXPORT_BASE_STRUCTURE' : 'EXPORT_FULL_STRUCTURE';
				#$res_html .= '<div style="color:white;background-color:green;padding:10px;font-family:arial;font-size:13px;word-wrap:break-word;border-radius:5px;margin:5px;width:100%">';
				$res_html .= '<div class="ok text-left">';
				$res_html .= $label.': <br>Database : <b>' .DEDALO_DATABASE_CONN .'</b><br> successfully exported to file<br>' .$mysqlExportPath;
				if(SHOW_DEBUG===true) {
					#$res_html .= "<pre>$command</pre>";
					$file_size = "0";
					if(file_exists($mysqlExportPath)) {
						$file_size = format_size_units( filesize($mysqlExportPath) );
					}
					$res_html .= "<br>File size: $file_size";
				}
				$res_html .= '</div>';
				$response->result 	= true;
				$response->msg 		= $res_html;
				break;
			case 1:
				#$res_html .= '<div style="color:white;background-color:red;padding:10px;font-family:arial;font-size:13px;word-wrap:break-word;border-radius:5px;margin:5px;width:100%">';
				$res_html .= '<div class="error text-left">';
				$res_html .= 'There was a problem during the export of <b>' .DEDALO_DATABASE_CONN .'</b> to ' .$mysqlExportPath .'';
				if(SHOW_DEBUG===true) {
					$res_html .= "<span class=\"warning\">If you are using pgpass, check config, owner an permissions</span>";
					$res_html .= "<pre>$command</pre>";
				}
				$res_html .= '</div>';
				$response->result 	= false;
				$response->msg 		= $res_html;
				return $response; // Stop execution here
				break;
			case 2:
				#$res_html .= '<div style="color:white;background-color:red;padding:10px;font-family:arial;font-size:13px;word-wrap:break-word;border-radius:5px;margin:5px;width:100%">';
				$res_html .= '<div class="error text-left">';
				$res_html .= 'There was an error during export. Please check your values:<br/><br/>';
				$res_html .= '<table>';
				$res_html .= '<tr><td>DB Database Name: </td><td> ' .DEDALO_DATABASE_CONN .'</td></tr>';
				$res_html .= '<tr><td>DB DB_BIN_PATH: </td><td> ' .DB_BIN_PATH .'</td></tr>';
				$res_html .= '<tr><td>DB User Name: </td><td> ' .DEDALO_USERNAME_CONN .'</td></tr>';
				$res_html .= '<tr><td>DB Password: </td><td> NOTSHOWN</td></tr>';
				$res_html .= '<tr><td>DB Host Name: </td><td> ' .DEDALO_HOSTNAME_CONN.'</td>';
				$res_html .= '</tr>';
				$res_html .= '</table>';
				if(SHOW_DEBUG===true) {
					$res_html .= "<span class=\"warning\">If you are using pgpass, check config, owner an permissions</span>";
					$res_html .= "<pre>$command</pre>";
				}
				$res_html .= '</div>';
				$response->result 	= false;
				$response->msg 		= $res_html;
				return $response; // Stop execution here
				break;
			default:
				$res_html .= $worked_result;
				$response->result 	= false;
				$response->msg 		= $res_html;
		}

		#
		# SAVE_DEDALO_STR_TABLES_DATA
		# Save partials srt data based on tld to independent files
		if ($db_name==='dedalo4_development_str.custom' && $response->result===true) {
			$res_dedalo_str_tables_data = self::save_dedalo_str_tables_data();
			if ($res_dedalo_str_tables_data->result===false) {
				$response->result 	 = false;
				$response->msg 		.= $res_dedalo_str_tables_data->msg;
			}else{
				#$res_html .= wrap_pre($ar_response_html);
				$response->msg 		.= $res_dedalo_str_tables_data->msg;
			}
		}


		return (object)$response;
	}//end export_structure



	/**
	* GET_ALL_TLD
	* @return array $all_tld
	*/
	public static function get_all_tld() {

		$all_tld = [];

		$strQuery = "SELECT tld FROM \"main_dd\" ORDER BY \"tld\" ";
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);		
		while ($row = pg_fetch_assoc($result)) {
			$all_tld[] = $row['tld'];
		}

		return $all_tld;
	}//end get_all_tld



	/**
	* SAVE_DEDALO_STR_TABLES_DATA
	* Select tlds from table 'main_dd' and iterate saving one file for tld
	* Core tlds are saved in 'backups_structure' dir
	* Extras tlds are saved in its respective dir inside 'extras' folder
	* @return object $response
	*/
	public static function save_dedalo_str_tables_data() {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		if (!defined('DEDALO_EXTRAS_PATH')) {
			define('DEDALO_EXTRAS_PATH'		, DEDALO_LIB_BASE_PATH .'/extras');
			debug_log(__METHOD__." WARNING: DEDALO_EXTRAS_PATH is not defined. Using default.. ",logger::WARNING);
		}

		#
		# MAIN TLDS
		# Get all main tlds like dd,oh,ich,rsc,et..
		$strQuery = "SELECT tld FROM \"main_dd\" ORDER BY \"tld\" ";
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);
		$ar_tld=array();
		$ar_msg=array();
		while ($rows = pg_fetch_assoc($result)) {

			$current_tld = $rows['tld'];
			#if ($current_tld!='dd') continue;
			$msg='';
			$msg .= "<b>$current_tld</b>";

			if ($current_tld==='dd' || $current_tld==='rsc') {
				# CORE DEDALO STR
				$path=DEDALO_LIB_BASE_PATH.'/backup/backups_structure/str_data';
			}else{
				# STR EXTRAS
				$path=DEDALO_EXTRAS_PATH.'/'.$current_tld.'/str_data';
			}

			# Check destination dir for proper permissions
			if( !is_dir($path) ) {
				if(!mkdir($path, 0777,true)) {
					#throw new Exception(" Error on read or create directory. Permission denied ($path)");
					$response->result 	= false;
					$response->msg 		= "Error on read or create directory. Permission denied ($path)";
					return $response;
				}
			}

			#
			# JER_DD
				$table 		= 'jer_dd';
				$tld 		= $current_tld;
				$path_file  = "{$path}/{$table}_{$tld}.copy";
				$res1 		= backup::copy_to_file($table, $path_file, $tld);

				if (empty($res1)) {
					$msg .= "Error on export $table {$tld} . Please try again";
					#print("<div class=\"error\">$msg</div>");
					debug_log(__METHOD__." $msg ".to_string($res1), logger::ERROR);
					$load_with_errors=true;
					#throw new Exception(" Error on read or create file. Permission denied ({$path_file})");
					$response->result 	= false;
					$response->msg 		= "Error on read or create directory. Permission denied for copy_to_file ($path_file)";
					return $response;
				}else{
					$msg .= "<br>Exported [$tld] $table (<b>".trim($res1)."</b>) - fields: ". str_replace(' ', '', backup::$jer_dd_columns);
					$msg .= "<br> -> $path_file ";
				}

			#
			# MATRIX_DESCRIPTORS_DD
				$table 		= 'matrix_descriptors_dd';
				$tld 		= $current_tld;
				$path_file 	= "{$path}/{$table}_{$tld}.copy";
				$res2 		= backup::copy_to_file($table, $path_file, $tld);

				if (empty($res2)) {
					$msg .= "Error on export $table {$tld} . Please try again";
					#print("<div class=\"error\">$msg</div>");
					debug_log(__METHOD__." $msg ".to_string($res2), logger::ERROR);
					$load_with_errors=true;
					#throw new Exception(" Error on read or create file. Permission denied ({$path_file})");
					$response->result 	= false;
					$response->msg 		= "Error on read or create directory. Permission denied for copy_to_file ($path_file)";
					return $response;
				}else{
					$msg .= "<br>Exported [$tld] $table (<b>".trim($res2)."</b>) - fields: ". str_replace(' ', '', backup::$descriptors_dd_columns);
					$msg .= "<br> -> $path_file ";
				}

			$ar_msg[] = $msg;
			#$msg = " -> Saved str tables partial data to $current_tld (jer_dd: <b>".trim($res1)."</b> - matrix_descriptors_dd: <b>".trim($res2)."</b>)";
		}//end while


		#
		# MATRIX_DD (Private list of values)
		$table 		= 'matrix_dd';
		$path 		= DEDALO_LIB_BASE_PATH.'/backup/backups_structure/str_data';
		$path_file 	= "{$path}/{$table}.copy";
		$res3 		= backup::copy_to_file($table, $path_file, null);

		$msg='';
		$msg .= "<b>$table</b>";
		if (empty($res3)) {
			$msg .= "Error on export $table. Please try again";
			#print("<div class=\"error\">$msg</div>");
			debug_log(__METHOD__." $msg ".to_string($res3), logger::ERROR);
			$load_with_errors=true;
			#throw new Exception(" Error on read or create file. Permission denied ({$path_file})");
			$response->result 	= false;
			$response->msg 		= "Error on read or create directory. Permission denied for copy_to_file ($path_file)";
			return $response;
		}else{
			$msg .= "<br>Exported $table (<b>".trim($res3)."</b>) - fields: * ";
			$msg .= "<br> -> $path_file ";
			$ar_msg[] = $msg;
		}


		# All is ok
		$response->result 	= true;
		$response->msg 		= wrap_pre( implode("<hr>", $ar_msg) );


		return (object)$response;
	}//end save_dedalo_str_tables_data



	/**
	* IMPORT_STRUCTURE
	* Exec pg_restore of selected backup file
	* @see trigger.db_utils
	* @param string db_name default 'dedalo4_development_str.custom'
	* @return string $res_html table of results
	*/
	public static function import_structure($db_name='dedalo4_development_str.custom', $check_server=true) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		if (defined('DEDALO_DB_MANAGEMENT') && DEDALO_DB_MANAGEMENT===false) {
			$response->result 	= true;
			$response->msg 		= 'Ok. Skipped request by db config managment '.__METHOD__;
			return $response;
		}

		#
		# DB_SYSTEM_CONFIG_VERIFY
		$system_config_verify = self::db_system_config_verify();
		if ($system_config_verify->result===false) {
			$response->msg 		.= $system_config_verify->msg;
			$response->result 	= false;
			return (object)$response;
		}


		# FILE_PATH
		if(defined('STRUCTURE_FROM_SERVER') && STRUCTURE_FROM_SERVER===true) {

			# Check remote server status before begins
			/* ALREADY CHECKED IN TRIGGER, AT BEGINING OF PROCESS
				$remote_server_status = (int)self::check_remote_server();
			*/

			# Download once all str files from server
			$all_str_files = backup::collect_all_str_files();
			foreach ($all_str_files as $key => $obj) {
				if($obj->type==="main_file") {
					$file_path  = STRUCTURE_DOWNLOAD_DIR;
					$mysqlImportFilename = $file_path .'/'. $obj->name;
					break;
				}
			}
			if (!isset($mysqlImportFilename)) {
				$response->msg 		.= " Error on get main_file name from all_str_files ";
				if(SHOW_DEBUG===true) {
					$response->msg 		.= "<pre>".print_r($all_str_files,true)."</pre>";
				}
				$response->result 	= false;
				return (object)$response;
			}
		}else{
			# Default path
			$file_path = DEDALO_LIB_BASE_PATH .'/backup/backups_structure/';
			$mysqlImportFilename = $file_path . $db_name . ".backup";
		}


		if (!file_exists($mysqlImportFilename)) {
			$response->msg 		.= "<div class=\"error\">Error: source file not found : $mysqlImportFilename</div>";
			$response->result 	= false;
			return (object)$response;
		}

		// Import the database and output the status to the page
		$command  = DB_BIN_PATH.'pg_restore -h '.DEDALO_HOSTNAME_CONN.' -p '.DEDALO_DB_PORT_CONN. ' -U "'.DEDALO_USERNAME_CONN.'" --dbname '.DEDALO_DATABASE_CONN.' ';
		$command .= '--no-password --clean --no-owner "'.$mysqlImportFilename.'"' ;

		# LOW PRIORITY ( nice , at 22:56 , etc)
		#$command = "nice ".$command ;

		// exec command in terminal
			// exec($command.' 2>&1', $output, $worked_result);
			$output			= null;
			$worked_result	= null;
			exec($command, $output, $worked_result);
			debug_log(__METHOD__." Execute import_structure command with output: ".to_string($output)." and worked_result: ".to_string($worked_result), logger::WARNING);

		$res_html='';
		switch($worked_result){

			# OK (0)
			case 0:
				#$res_html .= '<div style="color:white;background-color:green;padding:10px;font-family:arial;font-size:13px;word-wrap:break-word;border-radius:5px;margin:5px;width:100%">';
				$res_html .= '<div class="ok text-left">';
				$res_html .= 'IMPORT file:<br> File <br>' .$mysqlImportFilename .'<br> successfully imported to database<br>' . DEDALO_DATABASE_CONN .'';
				if(SHOW_DEBUG===true) {
					$res_html .= "<pre>$command</pre>";
				}
				$res_html .= '</div>';
				$response->result 	 = true;
				$response->msg 		.= $res_html;

				#
				# LOAD_DEDALO_STR_TABLES_DATA_from_files
				# Load partials srt data based on tld to independent files
				#if ($db_name=='dedalo4_development_str.custom') {
					$res_str_tables_data_from_files = (object)self::load_dedalo_str_tables_data_from_files();
					if ($res_str_tables_data_from_files->result===false) {
						$response->result 	 = false;
						$response->msg 		.= $res_str_tables_data_from_files->msg;
						return (object)$response;
					}else{
						$response->msg 		.= $res_str_tables_data_from_files->msg;
					}
				#}
				break;

			# ERROR (1)
			case 1:
				#$res_html .= '<div style="color:white;background-color:red;padding:10px;font-family:arial;font-size:13px;word-wrap:break-word;border-radius:5px;margin:5px;width:100%">';
				$res_html .= '<div class="error text-left">';
				$res_html .= 'There was an error during import. Please make sure the import file is saved in the same folder as this script and check your values:<br/><br/>';
				$res_html .= '<table>';
				$res_html .= '<tr><td>DB Name:</td><td><b>' .DEDALO_DATABASE_CONN.'</b></td></tr>';
				$res_html .= '<tr><td>DB User Name:</td><td><b>' .DEDALO_USERNAME_CONN.'</b></td></tr>';
				$res_html .= '<tr><td>DB Password:</td><td><b>NOTSHOWN</b></td></tr>';
				$res_html .= '<tr><td>DB Host Name:</td><td><b>' .DEDALO_HOSTNAME_CONN.'</b></td></tr>';
				$res_html .= '<tr><td>DB Import Filename:</td><td><b>' .$mysqlImportFilename .'</b></td></tr>';
				$res_html .= '</table>';
				if(SHOW_DEBUG===true) {
					$res_html .= "<pre>$command</pre>";
				}
				$res_html .= '</div>';
				$response->result 	 = false;
				$response->msg 		.= $res_html;
				return (object)$response;
				break;

			default:
				$res_html .= '<div class="error text-left">';
				$res_html .= "Command response error: ".$worked_result. " (code expected: 0)";
				if ($worked_result==127) {
					$res_html .= "<br>Check your DDBB path: DB_BIN_PATH: ".DB_BIN_PATH;
				}
				if(SHOW_DEBUG===true) {
					$res_html .= "<pre>$command</pre>";
				}
				$res_html .= '</div>';
				$response->result 	 = false;
				$response->msg 		.= $res_html;
				return (object)$response;
		}

		if ($response->result===false) {
			$response->msg = 'Error. Request failed '.__METHOD__ ." <br> ".$response->msg;
		}else{

			// optimize main tables
			backup::optimize_tables(['jer_dd','matrix_descriptors_dd','matrix_dd','matrix_list']);
		}


		return (object)$response;
	}//end import_structure



	/**
	* LOAD_DEDALO_STR_TABLES_DATA_FROM_FILES
	* Load data from every tld element file. Files are saved as postgres 'copy' in various locations.
	* Core load 'dd','rsc'
	* Extras load extras folder 'str_data' dir data (filtered by config:DEDALO_PREFIX_TIPOS)
	* @return array $ar_response with array of generated messages on run method
	* NOTE: Sequences and list of values are NOT loaded, only str tables without sequences
	*/
	public static function load_dedalo_str_tables_data_from_files() {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';


		if (defined('DEDALO_DB_MANAGEMENT') && DEDALO_DB_MANAGEMENT===false) {
			$response->result 	= true;
			$response->msg 		= 'Ok. Skipped request by db config managment '.__METHOD__;
			return $response;
		}

		$ar_msg=array();


		if (!defined('DEDALO_EXTRAS_PATH')) {
			define('DEDALO_EXTRAS_PATH'		, DEDALO_LIB_BASE_PATH .'/extras');
			debug_log(__METHOD__." WARNING: DEDALO_EXTRAS_PATH is not defined. Using default.. ", logger::WARNING);
			$response->msg .= '<div class="warning">Please, define DEDALO_EXTRAS_PATH in your config ASAP</div>';
		}

		if(defined('STRUCTURE_FROM_SERVER') && STRUCTURE_FROM_SERVER===true) {
			$path = STRUCTURE_DOWNLOAD_DIR;
		}else{
			$path = DEDALO_LIB_BASE_PATH.'/backup/backups_structure/str_data';
		}


		#
		# CORE : Load core dedalo str
		# Iterate 'dd' and 'rsc' tlds
		#
			$ar_core_tlds = array('dd','rsc');
			foreach ($ar_core_tlds as $current_tld) {

				$msg='';
				$msg .= "<b>$current_tld</b>";

				#
				# JER_DD
					$table 		= 'jer_dd';
					$tld 		= $current_tld;
					$file_name	= $table .'_'.$tld.'.copy';
					$path_file 	= $path.'/'.$file_name;
					$res1 		= backup::copy_from_file($table, $path_file, $tld);

					if (empty($res1)) {
						$msg .= "<br>Error on import $table {$tld} copy_from_file $path_file.";
						debug_log(__METHOD__." $msg ".to_string($res1), logger::ERROR);
						$load_with_errors=true;
						if(SHOW_DEBUG===true) {
							$msg .= "<pre>".print_r($res1,true)."</pre>";
						}

						$response->result 	 = false;
						$response->msg 		.= $msg;
						return $response;
					}

				#
				# MATRIX_DESCRIPTORS_DD
					$table 		= 'matrix_descriptors_dd';
					$tld 		= $current_tld;
					$path_file 	= $path.'/'.$table .'_'.$tld.'.copy';
					$res2 		= backup::copy_from_file($table, $path_file, $tld);

					if (empty($res2)) {
						$msg .= "<br>Error on import $table {$tld} copy_from_file $path_file.";
						debug_log(__METHOD__." $msg ".to_string($res2), logger::ERROR);
						$load_with_errors=true;
						if(SHOW_DEBUG===true) {
							$msg .= "<pre>".print_r($res2,true)."</pre>";
						}

						$response->result 	 = false;
						$response->msg 		.= $msg;
						return $response;
					}
					if(SHOW_DEBUG===true) {
						$msg .= "<br>Imported dedalo core data";
						$msg .= " (jer_dd {$tld} [<b>".trim($res1)."</b>], matrix_descriptors_dd {$tld} [<b>".trim($res2)."</b>]) ";
					}

				$ar_msg[]=$msg;

				// let GC do the memory job
				time_nanosleep(0, 100000); // 50 ms
			}//end foreach ($ar_core_tlds as $current_tld)

		#
		# LIST OF VALUES PRIVATE
		#
			$table 		= 'matrix_dd';
			$path_file 	= $path.'/'.$table .'.copy';
			$res3 		= backup::copy_from_file($table, $path_file, null);
			$msg='';
			$msg .= "<b>$table</b>";
			if (empty($res3)) {
				$msg .= "<br>Error on import $table. copy_from_file $path_file.";
				debug_log(__METHOD__." $msg ".to_string($res3), logger::ERROR);
				$load_with_errors=true;
				if(SHOW_DEBUG===true) {
					$msg .= "<pre>".print_r($res3,true)."</pre>";
				}

				$response->result 	 = false;
				$response->msg 		.= $msg;
				return $response;
			}
			if(SHOW_DEBUG===true) {
				$msg .= "<br>Imported dedalo core data";
				$msg .= ' ('.$table.' [<b>'.trim( to_string($res3) ).'</b>] '.$path_file.') ';
			}

			$ar_msg[]=$msg;


		#
		# EXTRAS : Load extras str
		# Iterate tlds from 'extras' folder
		#
			#$ar_extras_folders = (array)glob(DEDALO_EXTRAS_PATH . '/*', GLOB_ONLYDIR);
			#$DEDALO_PREFIX_TIPOS = (array)unserialize(DEDALO_PREFIX_TIPOS);
			/*
				$obj->type  = "extras_jer_file";
				$obj->table = "jer_dd";
				$obj->tld 	= $folder_name;
				$obj->name  = "jer_dd_".$folder_name.".copy";
				$obj->path  = DEDALO_EXTRAS_PATH .'/'.$folder_name.'/str_data';
			*/

			#foreach ($ar_extras_folders as $current_dir) {
			$all_str_files = backup::collect_all_str_files();
			foreach ($all_str_files as $obj) {

				if(strpos($obj->type, "extras")===false) {
					continue; // Skip no extras elements
				}

				#$current_dir = basename($current_dir);
				#$path 		 = DEDALO_EXTRAS_PATH .'/'.$current_dir.'/str_data';
				$path = $obj->path;
				$msg  ='';
				$msg .= "<b>$obj->name</b>";

				/*
				$res1=$res2=0;

				# DEDALO_PREFIX_TIPOS : config tipos verify. 'tipos' not defined in config, will be ignored
				if (!in_array($current_dir, $DEDALO_PREFIX_TIPOS)) {
					continue; # Filter load prefix from config 'DEDALO_PREFIX_TIPOS'
				}

				#
				# JER_DD EXTRAS
					$table 		= 'jer_dd';
					$tld 		= $current_dir;
					$path_file1 = $path.'/'.$table .'_'.$tld.'.copy';
					$path_file1 =
					$res1 		= backup::copy_from_file($table, $path_file1, $tld);

					if (empty($res1)) {
						$msg .= "<br>Error on import $table {$tld} . Please try again";
						if(SHOW_DEBUG===true) {
							#throw new Exception("Error Processing Request: $msg", 1);
						}
						#print("<div class=\"error\">$msg</div>");
						debug_log(__METHOD__." $msg ".to_string($res1), logger::ERROR);
						$load_with_errors=true;
					}

				#
				# MATRIX_DESCRIPTORS_DD EXTRAS
					$table 		= 'matrix_descriptors_dd';
					$tld 		= $current_dir;
					$path_file 	= $path.'/'.$table .'_'.$tld.'.copy';
					$res2 		= backup::copy_from_file($table, $path_file, $tld);

					if (empty($res2)) {
						$msg .= "<br>Error on import $table {$tld} . Please try again";
						if(SHOW_DEBUG===true) {
							#throw new Exception("Error Processing Request: $msg", 1);
						}
						#print("<div class=\"error\">$msg</div>");
						debug_log(__METHOD__." $msg ".to_string($res1), logger::ERROR);
						$load_with_errors=true;
					}
				*/

				#
				# OBJ EXTRAS
					$table 		= $obj->table;
					$tld 		= $obj->tld;
					$path_file 	= $obj->path .'/'. $obj->name;
					$res1 		= backup::copy_from_file($table, $path_file, $tld);

					if (empty($res1)) {
						$msg .= "<br>Error on import $table {$tld} . copy_from_file $path_file";
						debug_log(__METHOD__." $msg ".to_string($res1), logger::ERROR);
						$load_with_errors=true;

						$response->result 	 = false;
						$response->msg 		.= $msg;
						return $response;
					}

					$msg .= "<br>Imported dedalo extras data";
					if(SHOW_DEBUG===true) {
						$msg .= " ($table {$tld} [<b>".trim($res1)."</b>])";
						$msg .= "<br> -> $path_file ";
					}
					$ar_msg[]=$msg;

				// let GC do the memory job
				time_nanosleep(0, 100000); // 50 ms
			}//end foreach

		#
		# SEQUENCES UPDATE
		# Is necessary for maintain data integrity across exports
			$msg = "<b>Update dedalo core data sequences</b>";
			# SEQUENCE UPDATE (to the last table id)
				$table 	 ='jer_dd';
				$consolide_sequence = (object)self::consolide_sequence($table);
				if ($consolide_sequence->result===false) {
					$response->result 	 = false;
					$response->msg 		.= $consolide_sequence->msg;
					return $response;
				}else{
					$msg .= $consolide_sequence->msg;
				}

			# SEQUENCE UPDATE (to the last table id)
				$table 	 ='matrix_descriptors_dd';
				$consolide_sequence = (object)self::consolide_sequence($table);
				if ($consolide_sequence->result===false) {
					$response->result 	 = false;
					$response->msg 		.= $consolide_sequence->msg;
					return $response;
				}else{
					$msg .= $consolide_sequence->msg;
				}

			$ar_msg[]=$msg;



		$response->result 	 = true;
		$response->msg 		.= wrap_pre( implode("<hr>", $ar_msg) );

		return (object)$response;
	}//end save_dedalo_str_tables_data



	/**
	* CONSOLIDE_SEQUENCE
	* Set sequence value as last table id row
	* @return array $ar_response
	*/
	public static function consolide_sequence($table) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed '.__METHOD__;

		$msg='';

		# SEQUENCE UPDATE (to the last table id)
		$strQuery = 'SELECT id FROM "'.$table.'" ORDER BY "id" DESC LIMIT 1';	// get last id
		$result   = pg_query(DBi::_getConnection(), $strQuery);
		$row 	  = pg_fetch_row($result);
		$last_id  = (int)$row[0];
		#$strQuery = 'ALTER SEQUENCE '.$table.'_id_seq RESTART WITH '.$last_id.';';	// get last id
		$sequence_name = $table.'_id_seq';
		$strQuery = "SELECT setval('$sequence_name', $last_id, true);";

		$result   = pg_query(DBi::_getConnection(), $strQuery);
			if ($result) {
				$msg .= "<br>Consolidated {$sequence_name} in $table";
				if(SHOW_DEBUG===true) {
					$msg .= " with value $last_id <br> -> [$strQuery]";
				}
				$response->result 	= true;
				$response->msg 		= $msg;
			}else{
				$response->result 	= false;
				$response->msg 		= "Error on consolidate sequence: $sequence_name - table: $table";
			}

		return (object)$response;
	}//end consolide_sequence



	/**
	* DB_SYSTEM_CONFIG_VERIFY
	* Check current database status to properly configuration
	* Test pgpass file existence and permissions
	* If pgpass if not correctly configurated, die current script showing a error
	*/
	public static function db_system_config_verify() {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed '.__METHOD__;

		// user bse dir
			try {

				#$processUser = posix_getpwuid(posix_geteuid());
				#$base_dir 	 = $processUser['dir'];
				$base_dir 	 = getenv("HOME");
				$file 		 = $base_dir.'/.pgpass';

			}catch(Exception $e) {
				debug_log(__METHOD__."  ".$e->getMessage(), logger::ERROR);
			}

		#
		# PGPASS VERIFY
		if (isset($file)) {

			$response->result 	= true;

			# File test
			if (!file_exists($file)) {
				#die( wrap_pre("Error. Database system configuration not allow import (1). pgpass not found") );
				$response->msg 		= 'Error. Database system configuration not allow import (1). pgpass not found '.__METHOD__;
				$response->result 	= false;
			}

			# File permissions
			$perms = decoct(fileperms($file) & 0777);
			if ($perms!='600') {
				#die( wrap_pre("Error. Database system configuration not allow import (2). pgpass invalid permissions") );
				$response->msg 		= 'Error. Database system configuration not allow import (2). pgpass invalid permissions '.__METHOD__;
				$response->result 	= false;
			}

		}else{

			$response->result 	= false;
			$response->msg 		= 'Error. PHP function posix_getpwuid not exists '.__METHOD__;
		}

		return (object)$response;
	}//end db_system_config_verify



	/**
	* COLLECT_ALL_STR_FILES
	* Make a http request to server to retrieve the necessary files to updates structure
	* @return array $ar_files
	*	Array of objects
	*/
	public static function collect_all_str_files() {

		static $ar_files;

		if (isset($ar_files)) {
			debug_log(__METHOD__." Returning previous calculated values ".to_string(), logger::DEBUG);
			return $ar_files;
		}

		$ar_files = array();

		$remote = (defined('STRUCTURE_FROM_SERVER') && STRUCTURE_FROM_SERVER===true) ? true : false;

		# basic str file. dedalo4_development_str.custom.backup
		# includes main_dd (main tld and counters), matrix_dd (private lists), matrix_counter_dd (private_ñist counters), matrix_layout_dd (private layout maps list)
		$obj = new stdClass();
			$obj->type = "main_file";
			$obj->name = "dedalo4_development_str.custom.backup";
			$obj->path = DEDALO_LIB_BASE_PATH.'/backup/backups_structure';
		$ar_files[] = $obj;

		# core str file
		$obj = new stdClass();
			$obj->type = "jer_file";
			$obj->name = "jer_dd_dd.copy";
			$obj->path = DEDALO_LIB_BASE_PATH.'/backup/backups_structure/str_data';
		$ar_files[] = $obj;
		$obj = new stdClass();
			$obj->type = "descriptors_file";
			$obj->name = "matrix_descriptors_dd_dd.copy";
			$obj->path = DEDALO_LIB_BASE_PATH.'/backup/backups_structure/str_data';
		$ar_files[] = $obj;

		# resources str file
		$obj = new stdClass();
			$obj->type = "jer_file";
			$obj->name = "jer_dd_rsc.copy";
			$obj->path = DEDALO_LIB_BASE_PATH.'/backup/backups_structure/str_data';
		$ar_files[] = $obj;
		$obj = new stdClass();
			$obj->type = "descriptors_file";
			$obj->name = "matrix_descriptors_dd_rsc.copy";
			$obj->path = DEDALO_LIB_BASE_PATH.'/backup/backups_structure/str_data';
		$ar_files[] = $obj;

		# private list of values
		$obj = new stdClass();
			$obj->type  = "matrix_dd_file";
			$obj->name  = "matrix_dd.copy";
			$obj->table = "matrix_dd";
			$obj->tld 	= "dd";
			$obj->path  = DEDALO_LIB_BASE_PATH.'/backup/backups_structure/str_data';
		$ar_files[] = $obj;



		# EXTRAS
		$DEDALO_PREFIX_TIPOS = (array)unserialize(DEDALO_PREFIX_TIPOS);
		# Check extras folder coherence with config DEDALO_PREFIX_TIPOS
		foreach ($DEDALO_PREFIX_TIPOS as $current_prefix) {
			$folder_path = DEDALO_EXTRAS_PATH .'/'. $current_prefix;
			if( !is_dir($folder_path) ) {
				if(!mkdir($folder_path, 0700,true)) {
					debug_log(__METHOD__." Error on read or create extras folder in extras directory. Permission denied ".to_string($folder_path), logger::ERROR);
					return false;
				}
				debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
			}
		}

		# Get extras array list
		$ar_extras_folders 	 = (array)glob(DEDALO_EXTRAS_PATH . '/*', GLOB_ONLYDIR);

		$ar_extras = array();
		foreach ($ar_extras_folders as $current_dir) {
			$base_dir = basename($current_dir);
			# DEDALO_PREFIX_TIPOS : config tipos verify. 'tipos' not defined in config, will be ignored
			if (!in_array($base_dir, $DEDALO_PREFIX_TIPOS)) {
				continue; # Filter load prefix from config 'DEDALO_PREFIX_TIPOS'
			}
			$ar_extras[] = $base_dir;
		}


		foreach ($ar_extras as $folder_name) {
			$obj = new stdClass();
				$obj->type  = "extras_jer_file";
				$obj->table = "jer_dd";
				$obj->tld 	= $folder_name;
				$obj->name  = "jer_dd_".$folder_name.".copy";
				$obj->path  = DEDALO_EXTRAS_PATH .'/'.$folder_name.'/str_data';
			$ar_files[] = $obj;
			$obj = new stdClass();
				$obj->type  = "extras_descriptors_file";
				$obj->table = "matrix_descriptors_dd";
				$obj->tld 	= $folder_name;
				$obj->name  = "matrix_descriptors_dd_".$folder_name.".copy";
				$obj->path  = DEDALO_EXTRAS_PATH .'/'.$folder_name.'/str_data';
			$ar_files[] = $obj;
		}

		# Remote case
		if ($remote===true) {
			$target_dir = STRUCTURE_DOWNLOAD_DIR;
			foreach ($ar_files as $key => $obj) {
				# Download remofe file to local
				backup::download_remote_structure_file($obj, $target_dir);
				// Overwrite path to new downloaded files
				$obj->path = $target_dir;
			}
		}
		#debug_log(__METHOD__." ar_files ".to_string($remote)." - ".to_string($ar_files), logger::DEBUG);


		return (array)$ar_files;
	}//end collect_all_str_files



	/**
	* GET_REMOTE_DATA
	* @return object $response
	*/
	public static function get_remote_data($data) {

		// data
			$data_string = "data=" . json_encode($data);

		// curl request options
			$options = (object)[
				'url'				=> STRUCTURE_SERVER_URL,
				'post'				=> true,
				'postfields'		=> $data_string,
				'returntransfer'	=> 1,
				'followlocation'	=> true,
				'header'			=> false,
				'ssl_verifypeer'	=> false,
				'timeout'			=> 300, // seconds
				'proxy' 			=> (defined('SERVER_PROXY') && !empty(SERVER_PROXY))
					? SERVER_PROXY // from Dédalo config file
					: false // default case
			];

		// curl_request
			$response = backup::curl_request($options);


		return $response;
	}//end get_remote_data



	/**
	* DOWNLOAD_REMOTE_STRUCTURE_FILE
	* @return bool
	*/
	public static function download_remote_structure_file($obj, $target_dir) {
		$start_time=microtime(1);

		$data = array(
			"code"	=> STRUCTURE_SERVER_CODE,
			"type"	=> $obj->type,
			"name"	=> $obj->name
		);

		$response	= (object)backup::get_remote_data($data);
		$result		= $response->result;
		#if(SHOW_DEBUG===true) {
		#	$fist_line = strtok($result, "\n\r");
		#	debug_log(__METHOD__." download type:$obj->type - name:$obj->name result fist_line: \n".to_string($fist_line), logger::DEBUG);
		#}

		# Create downloads folder if not exists
		if (backup::$checked_download_str_dir!==true) {
			$folder_path = STRUCTURE_DOWNLOAD_DIR;
			if( !is_dir($folder_path) ) {
				if(!mkdir($folder_path, 0700,true)) {
					debug_log(__METHOD__." Error on read or create backup STRUCTURE_DOWNLOAD_DIR directory. Permission denied ".to_string(), logger::ERROR);
					return false;
				}
				debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
			}
			backup::$checked_download_str_dir = true;
		}

		# Delete previous version file if exists
		if (file_exists($target_dir .'/'. $obj->name)) {
			unlink($target_dir .'/'. $obj->name);
		}

		# Write downloaded file to local directory
		file_put_contents( $target_dir .'/'. $obj->name, $result);

		if(SHOW_DEBUG===true) {
			$fist_line = strtok($result, "\n\r");
			$total=round(microtime(1)-$start_time,3);
			debug_log(__METHOD__." Get remote and write str data type:$obj->type - name:$obj->name in secs. $total \n".$fist_line, logger::DEBUG);
			// Clean memory footprint
			unset($fist_line); strtok('', '');
		}


		return true;
	}//end download_remote_structure_file



	/**
	* CHECK_REMOTE_SERVER
	* @return object $response
	*/
	public static function check_remote_server() {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// data
			$data = array(
				"code"				=> STRUCTURE_SERVER_CODE,
				"check_connection"	=> true
			);
			$data_string = "data=" . json_encode($data);

		// curl_request options
			$options = (object)[
				'url'				=> STRUCTURE_SERVER_URL,
				'post'				=> true,
				'postfields'		=> $data_string,
				'returntransfer'	=> 1,
				'followlocation'	=> true,
				'header'			=> true,
				'ssl_verifypeer'	=> false,
				'timeout'			=> 5, // seconds
				'proxy' 			=> (defined('SERVER_PROXY') && !empty(SERVER_PROXY))
					? SERVER_PROXY // from Dédalo config file
					: false // default case
			];

		// curl_request
			$response = backup::curl_request($options);

		// decorate message
			if ($response->code==200) {
				$response->msg = "<div class=\"ok\">".$response->msg."</div>";
			}else{
				$response->msg = "<div class=\"error\">".$response->msg."</div>";
			}


		return $response;
	}//end check_remote_server



	/**
	* CURL_REQUEST
	* @return object $response
	* 	msg: string info about execution
	* 	code: int httpcode response from server
	* 	error: mixed error info from CURL if exists. Else false
	* 	result: mixed data received from server
	*/
	public static function curl_request($options) {

		// options
			$url			= $options->url; // mandatory
			$post			= isset($options->post) ? $options->post : true;
			$postfields		= $options->postfields; // mandatory
			$returntransfer	= $options->returntransfer ?? 1;
			$followlocation	= isset($options->followlocation) ? $options->followlocation : true;
			$header			= isset($options->header) ? $options->header : true;
			$ssl_verifypeer	= isset($options->ssl_verifypeer) ? $options->ssl_verifypeer : false;
			$timeout		= isset($options->timeout) ? (int)$options->timeout : 5; // seconds
			$proxy			= $options->proxy ?? false;

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// open connection
		$ch = curl_init();

		// set the url, number of POST vars, POST data
		curl_setopt($ch, CURLOPT_URL, $url); // Like 'http://domain.com/get-post.php'
		curl_setopt($ch, CURLOPT_POST, $post); // bool default true
		curl_setopt($ch, CURLOPT_POSTFIELDS, $postfields); // data_string
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, $returntransfer); // int default 1
		curl_setopt($ch, CURLOPT_FOLLOWLOCATION, $followlocation); // bool default true
		curl_setopt($ch, CURLOPT_HEADER, $header); // we want headers. default true

		// proxy. Use connection proxy on demand
		if ($proxy!==false) {
			curl_setopt($ch, CURLOPT_PROXY, $proxy); // like '127.0.0.1:8888'
		}

		# SSL. Avoid verify SSL certificates (very slow)
		curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, $ssl_verifypeer); // bool default false

		// A given cURL operation should only take XXX seconds max.
		curl_setopt($ch, CURLOPT_TIMEOUT, $timeout); // int default 5

		// execute post
		$result = curl_exec($ch);

		// status code. Info about result
		$httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
		// debug_log(__METHOD__." ".$url." status code: ".to_string($httpcode), logger::WARNING);

		// message. Generate a human readable info
			$msg = '';
			switch ($httpcode) {
				case 200:
					$msg .= "OK. check_remote_server passed successfully (status code: $httpcode)";
					break;
				case 401:
					$msg .= "Error. Unauthorized code (status code: $httpcode)";
					break;
				case 400:
					$msg .= "Error. Server has problems collect structure files (status code: $httpcode)";
					break;
				default:
					$msg .= "Error. check_remote_server problem found (status code: $httpcode)";
					break;
			}
			debug_log(__METHOD__.' '.$url.' msg: '.$msg, logger::WARNING);

		// curl_errno check. Verify if any error has occurred on CURL execution
			$error_info = false;
			try {
				// Check if any error occurred
				if(curl_errno($ch)) {
					$error_info	 = curl_error($ch);
					$msg		.= '. curl_request Curl error:' . $error_info;
					debug_log(__METHOD__.' '.$url.' error_info: '.$error_info, logger::ERROR);
				}
			} catch (Exception $e) {
				$msg .= '. curl_request Caught exception:' . $e->getMessage();
				debug_log(__METHOD__.' curl_request Caught exception:' . $e->getMessage(), logger::ERROR);
			}

		// close connection
		curl_close($ch);

		// response
			$response->msg		= $msg;
			$response->error	= $error_info;
			$response->code		= $httpcode;
			$response->result	= $result;


		return $response;
	}//end curl_request



	/**
	* STRUCTURE_TO_JSON
	* Creates a compatible JSON data from table 'jer_dd' and 'matrix_descriptors_dd' using the 
	* given tlds
	* @param array $ar_tld
	*	array of strings like ['dd','rsc'...]
	* @return object $response
	*/
	public static function structure_to_json($ar_tld) {
		
		$ar_data = [];
		foreach ($ar_tld as $tld) {

			$tld = trim($tld);

			// check valid tld
				if(!preg_match('/^[a-z]{2,}$/', $tld)) {
					throw new Exception("Error Processing Request. Error on structure_to_json. Invalid tld ".to_string($tld), 1);
				}
			
			$jer_dd_tld_data				= backup::get_jer_dd_tld_data($tld);
			$matrix_descriptors_tld_data	= backup::get_matrix_descriptors_tld_data($tld);

			foreach ($jer_dd_tld_data as $row) {
				
				// add descriptors data (from 'matrix_descriptors') to jer_dd row object
				$descriptors = array_filter($matrix_descriptors_tld_data, function($item) use($row) {
					return $item->parent===$row->terminoID;
				});
				foreach ($descriptors as $descriptor_item) {

					$item = new stdClass();
						$item->type		= $descriptor_item->tipo;
						$item->lang		= $descriptor_item->lang;
						$item->value	= $descriptor_item->dato;

					$row->descriptors[] = $item;
				}

				// store complete object
				$ar_data[] = $row;
			}//end foreach ($jer_dd_tld_data as $row)
		}


		return $ar_data;
	}//end structure_to_json



	/**
	* GET_JER_DD_TLD_DATA
	* Get all database table 'jer_dd' rows from given tld
	* @param string $tld
	*	like 'ts'
	* @return array $tld_data
	*	array of objects
	*/
	public static function get_jer_dd_tld_data($tld) {

		$tld_data = [];
		
		$columns	= '"terminoID", "parent", "modelo", "esmodelo", "esdescriptor", "visible", "norden", "tld", "traducible", "relaciones", "propiedades", "properties"';
		$strQuery	= 'SELECT '.$columns.' FROM "jer_dd" WHERE tld = \''.$tld.'\' ORDER BY "terminoID" ASC';
		$result		= JSON_RecordObj_matrix::search_free($strQuery);		
		while ($row = pg_fetch_object($result)) {
			
			// decode jsonb properties
			if (!is_null($row->properties)) {
				$row->properties = json_decode($row->properties);
			}

			$tld_data[] = $row;
		}

		// sort terminoID in natural way (dd1, dd2.. instead dd1, dd10)
			uasort($tld_data, function($a, $b){
				return strnatcmp($a->terminoID, $b->terminoID);
			});

		return $tld_data;
	}//end get_jer_dd_tld_data



	/**
	* GET_MATRIX_DESCRIPTORS_TLD_DATA
	* Get all database table 'matrix_descriptors_dd' rows from given tld
	* @param string $tld
	*	like 'ts'
	* @return array $tld_data
	*	array of objects
	*/
	public static function get_matrix_descriptors_tld_data($tld) {

		$tld_data = [];
		
		$columns	= '"parent", "dato", "tipo", "lang"';
		$strQuery	= 'SELECT '.$columns.' FROM "matrix_descriptors_dd" WHERE parent ~ \'^'.$tld.'[0-9]\' ORDER BY "parent" ASC';
		$result		= JSON_RecordObj_matrix::search_free($strQuery);
		while ($row = pg_fetch_object($result)) {
			$tld_data[] = $row;
		}

		return $tld_data;
	}//end get_matrix_descriptors_tld_data



	/**
	* IMPORT_STRUCTURE_JSON_DATA
	* Insert data terms into tables 'jer_dd' and 'matrix_descriptors_dd' deleting previous row if exists
	* @param array $data
	*  data is a vertical array of objects from parsed JSON file 'structure.json'
	* @return object $response
	*/
	public static function import_structure_json_data($data, $ar_tld=[]) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		// conn . get db connection
		$conn = DBi::_getConnection();

		$updated_tipo = [];

		// iterate all objects and replace existing data in each table (jer_dd, matrix_descriptors_dd)
		foreach ($data as $item) {
			
			// short vars
				$terminoID		= $item->terminoID;
				$parent			= empty($item->parent) ? null : $item->parent;
				$modelo			= empty($item->modelo) ? null : $item->modelo;
				$esmodelo		= empty($item->esmodelo) ? null : $item->esmodelo;
				$esdescriptor	= empty($item->esdescriptor) ? null : $item->esdescriptor;
				$visible		= empty($item->visible) ? null : $item->visible;
				$norden			= (empty($item->norden) && $item->norden!='0') ? null : (int)$item->norden;
				$tld			= $item->tld;
				$traducible		= empty($item->traducible) ? null : $item->traducible;
				$relaciones		= empty($item->relaciones) ? null : $item->relaciones;
				$propiedades	= empty($item->propiedades) ? null : $item->propiedades; // pg_escape_string($item->propiedades); // string
				$properties		= json_encode($item->properties); // jsonb
				$descriptors	= $item->descriptors ?? [];

			// tld filter optional from $ar_tld param
				if (!empty($ar_tld) && !in_array($tld, $ar_tld)) {
					continue;
				}

			// jer_dd
				// delete previous
					$strQuery  = PHP_EOL . 'DELETE FROM "jer_dd" WHERE "terminoID" = \''.$terminoID.'\' ;';
					if (!$result = pg_query($conn, $strQuery)) {
						throw new Exception("Error Processing Request. Error on delete term ".to_string($terminoID), 1);
					}
				// insert new 
					$fields = '"terminoID", "parent", "modelo", "esmodelo", "esdescriptor", "visible", "norden", "tld", "traducible", "relaciones", "propiedades", "properties"';
					// $values = '\''.$terminoID.'\', \''.$parent.'\', \''.$modelo.'\', \''.$esmodelo.'\', \''.$esdescriptor.'\', \''.$visible.'\', '.$norden.', \''.$tld.'\', \''.$traducible.'\', \''.$relaciones.'\', \''.$propiedades.'\', \''.$properties.'\'';
					// $strQuery .= PHP_EOL . 'INSERT INTO "jer_dd" ('.$fields.') VALUES '. PHP_EOL. '('.$values.');'.PHP_EOL;
					$strQuery = 'INSERT INTO "jer_dd" ('.$fields.') VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)';
					if (!$result = pg_query_params($conn, $strQuery, array($terminoID, $parent, $modelo, $esmodelo, $esdescriptor, $visible, $norden, $tld, $traducible, $relaciones, $propiedades, $properties)) ) {
						throw new Exception("Error Processing Request. Error on import_structure_json_data (1) Invalid jer_dd query ".to_string($strQuery), 1);
					}					
				

			// matrix_descriptors_dd
				foreach ($descriptors as $descriptor_item) {

					$parent	= $terminoID;
					$dato	= empty($descriptor_item->value) ? null : $descriptor_item->value;
					$tipo	= empty($descriptor_item->type) ? null : $descriptor_item->type;
					$lang	= empty($descriptor_item->lang) ? null : $descriptor_item->lang;
					
					// delete previous
						$strQuery  = PHP_EOL . 'DELETE FROM "matrix_descriptors_dd" WHERE "parent" = \''.$terminoID.'\' AND tipo = \''.$descriptor_item->type.'\' AND lang = \''.$descriptor_item->lang.'\' ;';
						if (!$result = pg_query($conn, $strQuery)) {
							throw new Exception("Error Processing Request. Error on import_structure_json_data (2) Invalid descriptor query ".to_string($strQuery), 1);				
						}
					// insert
						$fields = '"parent", "dato", "tipo", "lang"';
						// $values = '\''.$terminoID.'\', \''. pg_escape_string(DBi::_getConnection(), $descriptor_item->value).'\', \''.$descriptor_item->type.'\', \''.$descriptor_item->lang.'\'';
						// $strQuery .= PHP_EOL . 'INSERT INTO "matrix_descriptors_dd" ('.$fields.') VALUES '. PHP_EOL. '('.$values.');'.PHP_EOL;
						$strQuery = 'INSERT INTO "matrix_descriptors_dd" ('.$fields.') VALUES ($1, $2, $3, $4)';
						if (!$result = pg_query_params($conn, $strQuery, array($parent, $dato, $tipo, $lang)) ) {
							throw new Exception("Error Processing Request. Error on import_structure_json_data (1) Invalid jer_dd query ".to_string($strQuery), 1);
						}
					
				}

			$updated_tipo[] = $terminoID;

			debug_log(__METHOD__." + Updated structure item '$terminoID' ".to_string(), logger::DEBUG);
		}

		$response->result 	= true;
		$response->msg 		= 'Ok. Request done. Updated '.count($updated_tipo) .' from file data total '. count($data).' structure terms from tld: '. implode(', ',$ar_tld);
		

		return $response;
	}//end import_structure_json_data



	/**
	* OPTIMIZE_TABLES
	* Exec VACUUM ANALYZE command on every received table
	* @param array $tables
	* @return string $res
	*/
	public static function optimize_tables($tables) {

 		$tables = is_array($tables) ? $tables : [$tables];

		// $command_base = DB_BIN_PATH."psql ".DEDALO_DATABASE_CONN." -U ".DEDALO_USERNAME_CONN." -p ".DEDALO_DB_PORT_CONN." -h ".DEDALO_HOSTNAME_CONN;
		$port_command = !empty(DEDALO_DB_PORT_CONN) ? (' -p '.DEDALO_DB_PORT_CONN) : '';
		$command_base = DB_BIN_PATH."psql ".DEDALO_DATABASE_CONN." -U ".DEDALO_USERNAME_CONN." -h ".DEDALO_HOSTNAME_CONN . $port_command;

		// re-index
			$index_commands = [];
			foreach ($tables as $current_table) {
				$index_commands[] = 'REINDEX TABLE "'.$current_table.'"';
			}
			$command = $command_base . ' -c \''.implode('; ', $index_commands).';\'';
			// exec command
				$res = shell_exec($command);
			// debug
				debug_log(__METHOD__." result: ".json_encode($res) .PHP_EOL. ' -> COMMAND: ' . to_string($command) .PHP_EOL, logger::WARNING);

		// VACUUM
			$command = $command_base . ' -c \'VACUUM ' . implode(', ', $tables) .';\'';
			// exec command
				$res = shell_exec($command);
			// debug
				debug_log(__METHOD__." result: ".json_encode($res) .PHP_EOL. ' -> COMMAND: ' . to_string($command) .PHP_EOL, logger::WARNING);


		return (string)$res;
	}//end optimize_tables



}//end class backup


