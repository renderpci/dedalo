<?php
/*
* CLASS BACKUP
*/
require_once( DEDALO_LIB_BASE_PATH . '/common/class.exec_.php');

abstract class backup {

	# Columns to save (used by copy command, etc.)
	# Not use id columns NEVER here
	public static $jer_dd_columns 		  = '"terminoID", parent, modelo, esmodelo, esdescriptor, visible, norden, tld, traducible, relaciones, propiedades';
	public static $descriptors_dd_columns = 'parent, dato, tipo, lang';
	

	/**
	* INIT_BACKUP_SECUENCE
	* Make backup (compresed mysql dump) of current dedalo DB before login
	* @return $db_name." ($file_bk_size)";
	*/
	public static function init_backup_secuence($user_id_matrix, $username, $skip_backup_time_range=false) {
		
		try {
			# NAME : File name formated as date . (One hour resolution)
			$user_id 		= isset($_SESSION['dedalo4']['auth']['user_id']) ? $_SESSION['dedalo4']['auth']['user_id'] : '';			
			if($skip_backup_time_range===true) {
				$db_name 		= date("Y-m-d_His") .'.'. DEDALO_DATABASE_CONN .'.'. DEDALO_DB_TYPE .'_'. $user_id .'_forced';
			}else{
				$db_name 		= date("Y-m-d_H") .'.'. DEDALO_DATABASE_CONN .'.'. DEDALO_DB_TYPE .'_'. $user_id ;
			}	

			$file_path		= DEDALO_LIB_BASE_PATH.'/backup/backups';

			# Backups folder exists verify
			if( !is_dir($file_path) ) {		
				if(!mkdir($file_path, 0700, true)) {
					throw new Exception(" Error on read or create backup directory. Permission denied");
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
					define('DEDALO_BACKUP_TIME_RANGE', 4); // Minimun lapse of time (in hours) for run backup script again. Default: (int) 4
				}			
				$last_modification_time_secs = get_last_modification_date( $file_path, $allowedExtensions=array('backup'), $ar_exclude=array('/acc/'));
				$current_time_secs 			 = time();
				$difference_in_hours 		 = round( ($current_time_secs/3600) - round($last_modification_time_secs/3600), 0 );
					#dump($difference_in_hours, ' difference_in_hours ++ '.to_string( ($current_time_secs/3600).' - '.($last_modification_time_secs/3600) ));
				if ( $difference_in_hours < DEDALO_BACKUP_TIME_RANGE ) {
					$msg = " Skipped backup. A recent backup (about $difference_in_hours hours early) already exists. Is not necessary build another";
					if(SHOW_DEBUG===true) {
						debug_log(__METHOD__." $msg ".to_string(), logger::DEBUG);
					}
					return $msg;
				}
			}
			
			
			#
			# Backup file exists (less than an hour apart)
			$mysqlExportPath = $file_path .'/'. $db_name . '.custom.backup';
			if (file_exists($mysqlExportPath)) {
				$msg = " Skipped backup. A recent backup already exists ('$mysqlExportPath'). Is not necessary build another";
				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__." $msg ".to_string(), logger::DEBUG);
				}
				return $msg;
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
						echo dd_error::wrap_error($msg);
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
						throw new Exception("Error Processing backup. Script file not exists or is not accessible.Please check folder '../backup/temp' permissions", 1);
					}
				}
				
				debug_log(__METHOD__." Building delayed backup file ($mysqlExportPath). Command:\n ".to_string($command), logger::DEBUG);							
				
				# RUN DELAYED COMMAND
				$res = exec_::exec_sh_file($prgfile);

				#debug_log(__METHOD__." return:  ".to_string($res), logger::DEBUG);
				#return $res;

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
			trigger_error($msg);
			debug_log(__METHOD__." $msg ".to_string(), logger::DEBUG);
			die($msg);
		}

		# BK Filesize
		$file_bk_size = "0 MB";
		if(file_exists($mysqlExportPath)) {
			$file_bk_size = filesize($mysqlExportPath)/1024/1024;
			$file_bk_size = number_format((float)$file_bk_size, 3, '.', '').' MB';
		}

		return $db_name." ($file_bk_size)";
	}#end init_backup_secuence



	/**
	* GET_TABLES
	* Get all tables (unfiltered) from current database
	* @return array $tableList
	*/
	public static function get_tables() {
		
		$strQuery 	= "
		SELECT * 
		FROM information_schema.tables 
		WHERE table_type = 'BASE TABLE' 
		 AND table_schema = 'public' 
		ORDER BY table_type, table_name
		";
		$result		= JSON_RecordDataBoundObject::search_free($strQuery);

		if(!$result) {			
			$msg = "Failed Search. Data is not found. Please contact with your admin (1)" ;	
			if(SHOW_DEBUG===true) {
				throw new Exception($msg, 1);			}
			trigger_error($msg);
			die($msg);
		}
		$tableList = array();		
		while($rows = pg_fetch_assoc($result)) {		
			$tableList[] = $rows['table_name'];
		}
		#dump($tableList, ' $tableList ++ '.to_string($strQuery));

		return (array)$tableList;
	}//end get_tables



	/**
	* SAVE_DEDALO_STR_TABLES_DATA
	* Select tlds from table 'main_dd' and iterate saving one file for tld
	* Core tlds are saved in 'backups_structure' dir
	* Extras tlds are saved in its respective dir inside 'extras' folder
	* @return array $ar_response with array of generated messages on run method
	*/
	public static function save_dedalo_str_tables_data() {
		$ar_response=array();

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
					throw new Exception(" Error on read or create directory. Permission denied ($path)");
				}
			}

			#
			# JER_DD
				$table 		= 'jer_dd';
				$tld 		= $current_tld;
				$path_file1 = "{$path}/{$table}_{$tld}.copy";
				$res1 = backup::copy_to_file($table, $path_file1, $tld);

				if (empty($res1)) {
					$msg .= "Error on export $table {$tld} . Please try again";
					print("<div class=\"error\">$msg</div>");
					$load_with_errors=true;
					throw new Exception(" Error on read or create file. Permission denied ({$path_file1})");
				}else{
					$msg .= "<br>Exported [$tld] $table (<b>".trim($res1)."</b>) - fields: ". str_replace(' ', '', backup::$jer_dd_columns);
					$msg .= "<br> -> $path_file1 ";
					#$ar_response[] = $msg;
				}
					
			#
			# MATRIX_DESCRIPTORS_DD				
				$table 		= 'matrix_descriptors_dd';
				$tld 		= $current_tld;
				$path_file 	= "{$path}/{$table}_{$tld}.copy";
				$res2 		= backup::copy_to_file($table, $path_file, $tld);

				if (empty($res2)) {
					$msg .= "Error on export $table {$tld} . Please try again";
					print("<div class=\"error\">$msg</div>");
					$load_with_errors=true;
					throw new Exception(" Error on read or create file. Permission denied ({$path_file})");
				}else{
					$msg .= "<br>Exported [$tld] $table (<b>".trim($res2)."</b>) - fields: ". str_replace(' ', '', backup::$descriptors_dd_columns);
					$msg .= "<br> -> $path_file ";
					#$ar_response[] = $msg;					
				}


			$ar_response[] = $msg;	
			#$msg = " -> Saved str tables partial data to $current_tld (jer_dd: <b>".trim($res1)."</b> - matrix_descriptors_dd: <b>".trim($res2)."</b>)";
			
		}#end while

		return (array)$ar_response;
	}#end save_dedalo_str_tables_data



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
		}		
		#dump($res, ' res ++ '.to_string($path_file));

		if (!file_exists($path_file)) {
			throw new Exception("Error Processing Request. File $path_file not created!", 1);			
		}

		return (string)$res;
	}//end copy_to_file



	/**
	* LOAD_DEDALO_STR_TABLES_DATA_FROM_FILES
	* Load data from every tld element file. Files are saved as postgres 'copy' in various locations.
	* Core load 'dd','rsc'
	* Extras load extras folder 'str_data' dir data (filtered by config:DEDALO_PREFIX_TIPOS)
	* @return array $ar_response with array of generated messages on run method
	* NOTE: Sequences and list of values are NOT loaded, only str tables without sequences
	*/
	public static function load_dedalo_str_tables_data_from_files() {
		$ar_response=array();
	
		if (!defined('DEDALO_EXTRAS_PATH')) {
			define('DEDALO_EXTRAS_PATH'		, DEDALO_LIB_BASE_PATH .'/extras');
			debug_log(__METHOD__." WARNING: DEDALO_EXTRAS_PATH is not defined. Using default.. ", logger::WARNING);
		}

		#
		# DB_SYSTEM_CONFIG_VERIFY
		self::db_system_config_verify();

		#
		# CORE : Load core dedalo str
		# Iterate 'dd' and 'rsc' tlds
		#
			$path=DEDALO_LIB_BASE_PATH.'/backup/backups_structure/str_data';
			$ar_core_tlds = array('dd','rsc');
			foreach ($ar_core_tlds as $current_tld) {

				$msg='';
				$msg .= "<b>$current_tld</b>";

				#
				# JER_DD
					$table 		= 'jer_dd';
					$tld 		= $current_tld;
					$path_file 	= $path.'/'.$table .'_'.$tld.'.copy';
					$res1 		= backup::copy_from_file($table, $path_file, $tld);
					
					if (empty($res1)) {
						$msg .= "<br>Error on import $table {$tld} . Please try again";
						if(SHOW_DEBUG===true) {
							dump($command, '$res1 ++ '.to_string($res1));
							#throw new Exception("Error Processing Request: $msg", 1);
						}
						print("<div class=\"error\">$msg</div>");
						$load_with_errors=true;
					}

				#
				# MATRIX_DESCRIPTORS_DD	
					$table 		= 'matrix_descriptors_dd';
					$tld 		= $current_tld;
					$path_file 	= $path.'/'.$table .'_'.$tld.'.copy';					
					$res2 		= backup::copy_from_file($table, $path_file, $tld);
					
					if (empty($res2)) {
						$msg .= "<br>Error on import $table {$tld} . Please try again";
						if(SHOW_DEBUG===true) {
							dump($command, '$res2 ++ '.to_string($res2));
							#throw new Exception("Error Processing Request: $msg", 1);
						}
						print("<div class=\"error\">$msg</div>");
						$load_with_errors=true;
					}
					
					if(SHOW_DEBUG===true) {
						$msg .= "<br>Imported dedalo core data";
						$msg .= " (jer_dd {$tld} [<b>".trim($res1)."</b>], matrix_descriptors_dd {$tld} [<b>".trim($res2)."</b>]) ";
					}				

				$ar_response[]=$msg;

				// let GC do the memory job
				time_nanosleep(0, 10000000); // 50 ms
			}#end foreach			

		#
		# LIST OF VALUES PRIVATE
		#
			/* WORKING HERE..
			$db_name 			 ='dedalo4_development_str.custom';
			$file_path		 	 = DEDALO_LIB_BASE_PATH .'/backup/backups_structure/';
			$mysqlImportFilename = $file_path . $db_name . ".backup";	
			if (file_exists($mysqlImportFilename)) {

				$command  = DB_BIN_PATH.'pg_restore -h '.DEDALO_HOSTNAME_CONN.' -p '.DEDALO_DB_PORT_CONN. ' -U "'.DEDALO_USERNAME_CONN.'" --dbname '.DEDALO_DATABASE_CONN;
				$command .=' -t "matrix_dd" -t "matrix_layout_dd" -t "matrix_counter_dd" -t "*dd_id_seq" --no-password --clean --no-owner "'.$mysqlImportFilename.'"' ;	
			
			}else{
				$msg = "Error: source str file not found ";
				if(SHOW_DEBUG===true) {
					 $msg .= $mysqlImportFilename.;
				}
				$ar_response[]=$msg;
			}
			*/						


		#
		# EXTRAS : Load extras str
		# Iterate tlds from 'extras' folder
		#
			$ar_extras_folders = (array)glob(DEDALO_EXTRAS_PATH . '/*', GLOB_ONLYDIR);
			$DEDALO_PREFIX_TIPOS = (array)unserialize(DEDALO_PREFIX_TIPOS);
			foreach ($ar_extras_folders as $current_dir) {
				
				$current_dir = basename($current_dir);
				$path 		 = DEDALO_EXTRAS_PATH .'/'.$current_dir.'/str_data';
				$msg  ='';
				$msg .= "<b>$current_dir</b>";

				if ($current_dir!='test') {
					#continue;
				}
				$res1=$res2=0;
				
				# DEDALO_PREFIX_TIPOS : config tipos verify. 'tipos' not defined in config, will be ignored
				if (!in_array($current_dir, $DEDALO_PREFIX_TIPOS)) {
					continue; # Filter load prefix from config 'DEDALO_PREFIX_TIPOS'
				}				
				
				#
				# JER_DD EXTRAS
					$table 		= 'jer_dd';
					$tld 		= $current_dir;
					$path_file1 	= $path.'/'.$table .'_'.$tld.'.copy';
					$res1 		= backup::copy_from_file($table, $path_file1, $tld);

					if (empty($res1)) {
						$msg .= "<br>Error on import $table {$tld} . Please try again";
						if(SHOW_DEBUG===true) {
							dump($command, '$res1 ++ '.to_string($res1));
							#throw new Exception("Error Processing Request: $msg", 1);
						}
						print("<div class=\"error\">$msg</div>");
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
							dump($command, '$res2 ++ '.to_string($res2));
							#throw new Exception("Error Processing Request: $msg", 1);
						}
						print("<div class=\"error\">$msg</div>");
						$load_with_errors=true;
					}
				
				$msg .= "<br>Imported dedalo extras data";
				if(SHOW_DEBUG===true) {
					$msg .= " (jer_dd {$tld} [<b>".trim($res1)."</b>], matrix_descriptors_dd {$tld} [<b>".trim($res2)."</b>])";
					$msg .= "<br> -> $path_file1 ";
					$msg .= "<br> -> $path_file ";
				}
				$ar_response[]=$msg;				

				// let GC do the memory job
				time_nanosleep(0, 10000000); // 50 ms
			}#end foreach

		#
		# SEQUENCES UPDATE
		# Is necessary for maintain data integrity across exports
			$msg = "Updated dedalo core data sequences";
			# SEQUENCE UPDATE (to the last table id)
				$table 	 ='jer_dd';
				$msg 	.= self::consolide_sequence($table);
				
			# SEQUENCE UPDATE (to the last table id)
				$table 	 ='matrix_descriptors_dd';
				$msg 	.= self::consolide_sequence($table);
			$ar_response[]=$msg;


		return (array)$ar_response;
	}#end save_dedalo_str_tables_data



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

		$command_base = DB_BIN_PATH."psql ".DEDALO_DATABASE_CONN." -U ".DEDALO_USERNAME_CONN." -p ".DEDALO_DB_PORT_CONN." -h ".DEDALO_HOSTNAME_CONN;
		switch ($table) {

			case 'jer_dd':
				# DELETE . Remove previous records
				#$strQuery  = "DELETE FROM \"jer_dd\" WHERE \"terminoID\" LIKE '{$tld}%'; "; #pg_query(DBi::_getConnection(), $strQuery);				
				$command = $command_base . " -c \"DELETE FROM \"jer_dd\" WHERE ".'\"terminoID\"'." LIKE '{$tld}%'\" "; # -c "DELETE FROM \"jer_dd\" WHERE \"terminoID\" LIKE 'dd%'"
				$res .= shell_exec($command);

				# COPY . Load data from file
				$command = $command_base . " -c \"\copy jer_dd(".addslashes(backup::$jer_dd_columns).") from {$path_file}\" ";
				$res .= shell_exec($command);
				break;

			case 'matrix_descriptors_dd':
				# DELETE . Remove previous records
				#$strQuery = "DELETE FROM \"matrix_descriptors_dd\" WHERE \"parent\" LIKE '{$tld}%';"; #pg_query(DBi::_getConnection(), $strQuery);
				$command = $command_base . " -c \"DELETE FROM \"matrix_descriptors_dd\" WHERE parent LIKE '{$tld}%'\" "; # -c "DELETE FROM \"jer_dd\" WHERE \"terminoID\" LIKE 'dd%'"
				$res .= shell_exec($command);

				# COPY . Load data from file
				$command = $command_base . " -c \"\copy matrix_descriptors_dd(".addslashes(backup::$descriptors_dd_columns).") from {$path_file}\" ";
				$res .= shell_exec($command);
				break;			
		}
		#dump($res, ' res ++ '.to_string($path_file));
		$res = str_replace("\n",' ',$res);

		return (string)$res;
	}//end copy_from_file



	/**
	* CONSOLIDE_SEQUENCE
	* Set sequence value as last table id row
	* @return array $ar_response
	*/
	public static function consolide_sequence($table) {
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
		if(SHOW_DEBUG===true) {
			$msg .= "<br> {$sequence_name} with value $last_id [$strQuery]";
		}
		
		return (string)$msg;
	}//end consolide_sequence



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

		$result = new stdClass();
			$result->msg  = '';
			$result->code = false;

		#
		# DB_SYSTEM_CONFIG_VERIFY
		self::db_system_config_verify();


		if (empty($db_name)) {
			$db_name = 'dedalo4_development_str.custom';
		}	

		$file_path		 = DEDALO_LIB_BASE_PATH .'/backup/backups_structure/';
		$mysqlExportPath = $file_path . $db_name . ".backup";
	
		# Export the database and output the status to the page
		# '-F c' Output compressed custom format
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
			#dump($command, 'command', array());#die();

		exec($command.' 2>&1', $output, $worked_result);	
		#passthru($command,$worked_result);
		#dump($output, ' worked_result ++ '.to_string($worked_result));
		$res_html='';
		if(SHOW_DEBUG===true) {
			#$res_html .= "<div>command otuput: ".var_export($worked_result,true)."</div>";
			#$res_html .= "<div style=\"font-family:courier;font-size:11px;word-wrap:break-word;padding:3px;\">$command</div>";
		}
		switch($worked_result){
			case 0:
				$res_html .= '<div style="color:white;background-color:green;padding:10px;font-family:arial;font-size:13px;word-wrap:break-word;border-radius:5px;margin:5px;width:100%">
				EXPORT to file: <br>Database <br> <b>' .DEDALO_DATABASE_CONN .'</b><br> successfully exported to file<br> <b>' .$mysqlExportPath .'</b></div>';
				break;
			case 1:
				$res_html .= '<div style="color:white;background-color:red;padding:10px;font-family:arial;font-size:13px;word-wrap:break-word;border-radius:5px;margin:5px;width:100%">
				There was a problem during the export of <b>' .DEDALO_DATABASE_CONN .'</b> to <b>' .$mysqlExportPath .'</b></div>';
				if(SHOW_DEBUG===true) {
					#dump($output, 'output - worked_result: '.to_string($worked_result));
					$res_html .= "<span class=\"warning\">If you are using pgpass, check config, owner an permissions</span>";
				}
				break;
			case 2:
				$res_html .= '<div style="color:white;background-color:red;padding:10px;font-family:arial;font-size:13px;word-wrap:break-word;border-radius:5px;margin:5px;width:100%">
				There was an error during export. Please check your values:<br/><br/>
				<table>
				<tr><td>DB Database Name:</td><td><b>' .DEDALO_DATABASE_CONN .'</b></td></tr>
				<tr><td>DB User Name:</td><td><b>' .DEDALO_USERNAME_CONN .'</b></td></tr>
				<tr><td>DB Password:</td><td><b>NOTSHOWN</b></td></tr>
				<tr><td>DB Host Name:</td><td><b>' .$mysqlHostName .'</b></td>
				</tr>
				</table>
				</div>';
				if(SHOW_DEBUG===true) {
					dump($output, ' worked_result: '.to_string($worked_result));
				}
				break;
			default:
				$res_html .= $worked_result;
		}
		
	
		#$res_html .= "<pre>";
		#$res_html .= print_r($ar_dedalo_private_tables,true);
		#$res_html .= "</pre>";

		#
		# SAVE_DEDALO_STR_TABLES_DATA
		# Save partials srt data based on tld to independent files
		if ($db_name==='dedalo4_development_str.custom') {
			$ar_response 		= self::save_dedalo_str_tables_data();	
			$ar_response_html 	= implode('<hr>', (array)$ar_response);
			$res_html .= wrap_pre($ar_response_html);
		}		

		$result->msg 	= $res_html;
		$result->code 	= $worked_result;

		return $result;
	}#end export_structure
	


	/**
	* IMPORT_STRUCTURE
	* Exec pg_restore of selected backup file
	* @see trigger.db_utils
	* @param string db_name default 'dedalo4_development_str.custom'
	* @return string $res_html table of results
	*/
	public static function import_structure($db_name='dedalo4_development_str.custom') {

		#
		# DB_SYSTEM_CONFIG_VERIFY
		self::db_system_config_verify();

				
		$file_path		 	 = DEDALO_LIB_BASE_PATH .'/backup/backups_structure/';
		$mysqlImportFilename = $file_path . $db_name . ".backup";
	
		if (!file_exists($mysqlImportFilename)) {
			return $res_html .= "<div class=\"error\">Error: source file not found : $mysqlImportFilename</div>";
		}
		
		// Import the database and output the status to the page
		$command  = DB_BIN_PATH.'pg_restore -h '.DEDALO_HOSTNAME_CONN.' -p '.DEDALO_DB_PORT_CONN. ' -U "'.DEDALO_USERNAME_CONN.'" --dbname '.DEDALO_DATABASE_CONN.' ';
		$command .= '--no-password --clean --no-owner "'.$mysqlImportFilename.'"' ;
		#$command = DB_BIN_PATH.'pg_restore --host '.DEDALO_HOSTNAME_CONN.' --port '.DEDALO_DB_PORT_CONN. ' --username '.DEDALO_USERNAME_CONN.' --dbname '.DEDALO_DATABASE_CONN.' --no-password --clean --verbose '.$mysqlImportFilename ;

		# LOW PRIORITY ( nice , at 22:56 , etc)
		#$command = "nice ".$command ;
			#dump($command, ' command');

		#exec($command,$output,$worked);
		exec($command.' 2>&1', $output, $worked_result);
		$res_html='';
		if(SHOW_DEBUG===true) {
			#dump($worked_result," console response code for:\n $command ");
			#dump($output," console output for:\n $command");
			#$res_html .= "<div style=\"font-family:courier;font-size:11px;word-wrap:break-word;padding:3px;\">$command</div>";
		}
		switch($worked_result){
			
			# OK (0)
			case 0:
				$res_html .= '<div style="color:white;background-color:green;padding:10px;font-family:arial;font-size:13px;word-wrap:break-word;border-radius:5px;margin:5px;width:100%">';
				$res_html .= 'IMPORT file:<br> File <br><b>' .$mysqlImportFilename .'</b><br> successfully imported to database<br> <b>' . DEDALO_DATABASE_CONN .'</b>';
				$res_html .= '</div>';

				#
				# LOAD_DEDALO_STR_TABLES_DATA_from_files
				# Load partials srt data based on tld to independent files
				#if ($db_name=='dedalo4_development_str.custom') {
					#sleep(2);
					$ar_response 		= self::load_dedalo_str_tables_data_from_files();	
					$ar_response_html 	= implode('<hr>', (array)$ar_response);
					$res_html .= wrap_pre($ar_response_html, false);
				#}

				#
				# DELETE DEVELOPMENT ELEMENTS FROM FINAL STRUCTURE
				/* DESACTIVADO : YA NO SE NECESITA !
				if (DEDALO_DATABASE_CONN!='dedalo4_development') {
					
					$ar_parents 			= array('dd1111','dd1189');
					$ar_recursive_childrens = $ar_parents;
					foreach ($ar_parents as $current_terminoID) {
						$ar_delete 				= RecordObj_dd::get_ar_recursive_childrens($current_terminoID);
						$ar_recursive_childrens = array_merge($ar_recursive_childrens,$ar_delete);
					}			

					foreach ($ar_recursive_childrens as $key => $terminoID) {

						$RecordObj_dd = new RecordObj_dd($terminoID);				
						$RecordObj_dd->Delete();
						
						$arguments=array();
						$arguments['parent']	= $terminoID;	
						$RecordObj_matrix		= new RecordObj_matrix('matrix_descriptors_dd',NULL);
						$ar_result				= (array)$RecordObj_matrix->search($arguments);
						foreach ($ar_result as $current_id) {
							$RecordObj_matrix	= new RecordObj_matrix('matrix_descriptors_dd',$current_id);
							$RecordObj_matrix->Delete();
						}
						#echo "Deleted $terminoID<br>";

					}//end foreach ($ar_recursive_childrens as $key => $terminoID)

					$res_html .= wrap_pre( "Removed development elements: ".count($ar_recursive_childrens)." from parents: ".implode(',', $ar_parents) , false);

				}//end if (DEDALO_DATABASE_CONN!='dedalo4_development')
				*/
				break;

			# ERROR (1)
			case 1:
				$res_html .= '<div style="color:white;background-color:red;padding:10px;font-family:arial;font-size:13px;word-wrap:break-word;border-radius:5px;margin:5px;width:100%">
				There was an error during import. Please make sure the import file is saved in the same folder as this script and check your values:<br/>
				<br/>
				<table>
				<tr><td>DB Name:</td><td><b>' .DEDALO_DATABASE_CONN.'</b></td></tr>
				<tr><td>DB User Name:</td><td><b>' .DEDALO_USERNAME_CONN.'</b></td></tr>
				<tr><td>DB Password:</td><td><b>NOTSHOWN</b></td></tr>
				<tr><td>DB Host Name:</td><td><b>' .DEDALO_HOSTNAME_CONN.'</b></td></tr>
				<tr><td>DB Import Filename:</td><td><b>' .$mysqlImportFilename .'</b></td></tr>
				</table>
				</div>';
				if(SHOW_DEBUG===true) {
					$res_html .= "<br>DEBUG INFO:<hr>$command";
				}
				break;
			default:			
				$res_html .= "Command response: ".$worked_result ."<br> for command: $command";
				if ($worked_result==127) {
					$res_html .= "Review your mysql path please: <br>DB_BIN_PATH: ".DB_BIN_PATH."<br>PHP_BIN_PATH: ".PHP_BIN_PATH ;
				}
		}
		
		#$res_html .= "<pre>";
		#$res_html .= print_r($ar_dedalo_private_tables,true);
		#$res_html .= "</pre>";

		return $res_html;

	}#end import_structure



	/**
	* DB_SYSTEM_CONFIG_VERIFY
	* Check current database status to properly configuration 
	* Test pgpass file existence and permissions
	* If pgpass if not correctly configurated, die current script showing a error
	*/
	public static function db_system_config_verify() {
		
		#
		# PGPASS VERIFY
		$processUser = posix_getpwuid(posix_geteuid());
		$base_dir 	 = $processUser['dir'];
		$file 		 = $base_dir.'/.pgpass';		

		# File test
		if (!file_exists($file)) {
			die( wrap_pre("Error. Database system configuration not allow import (1). pgpass not found") );
		}

		# File permissions
		$perms = decoct(fileperms($file) & 0777);
			#dump($perms, ' perms ++ '.to_string());
		if ($perms!='600') {
			die( wrap_pre("Error. Database system configuration not allow import (2). pgpass invalid permissions") );
		}
	}#end db_system_config_verify




}#end class
?>