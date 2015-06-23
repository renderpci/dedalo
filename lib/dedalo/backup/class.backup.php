<?php
/*
* CLASS BACKUP
*/
require_once( DEDALO_LIB_BASE_PATH . '/common/class.exec_.php');


abstract class backup {



	/**
	* INIT_BACKUP_SECUENCE
	* Make backup (compresed mysql dump) of current dedalo DB before login
	* @return $db_name." ($file_bk_size)";
	*/
	public static function init_backup_secuence($user_id_matrix, $username) {
		
		try {
			# NAME : File name formated as date . (One hour resolution)
			$user_id 		= isset($_SESSION['dedalo4']['auth']['user_id']) ? $_SESSION['dedalo4']['auth']['user_id'] : '';
			$db_name 		= date("Y-m-d_H") .'.'. DEDALO_DATABASE_CONN .'.'. DEDALO_DB_TYPE.'_'.$user_id ;
			

			$file_path			= DEDALO_LIB_BASE_PATH.'/backup/backups/';

			# backups folder exists verify
			if( !is_dir($file_path) ) {
			$create_dir 	= mkdir($file_path, 0700, true);
			if(!$create_dir) throw new Exception(" Error on read or create backup directory. Permission denied");
			}

			$mysqlExportPath 	= $file_path . $db_name . '.custom.backup';

			# Backup file exists (less than an hour apart)
			if (file_exists($mysqlExportPath)) {
				return "Skipped backup. A recent backup already exists ('$mysqlExportPath'). Is not necessary to make another";
			}

			// Export the database and output the status to the page
			$command='';	#'sleep 1 ;';	
			$command = DB_BIN_PATH.'pg_dump -h '.DEDALO_HOSTNAME_CONN.' -p '.DEDALO_DB_PORT_CONN. ' -U "'.DEDALO_USERNAME_CONN.'" -F c -b -v '.DEDALO_DATABASE_CONN.'  > "'.$mysqlExportPath .'"';
			$command = 'sleep 10s; nice -n 19 '.$command ;

			if(SHOW_DEBUG) {
				error_log($command);
			}
	

			# BUILD SH FILE WITH BACKUP COMMAND IF NOT EXISTS
			$prgfile = DEDALO_LIB_BASE_PATH.'/backup/temp/backup_' . DEDALO_DB_TYPE . '_' . date("Y-m-d_H") . '_' . DEDALO_DATABASE_CONN  . '.sh';	//
			if(!file_exists($prgfile)) {

				# TARGET FOLDER VERIFY (EXISTS AND PERMISSIONS)
				try{
					$target_folder_path = DEDALO_LIB_BASE_PATH.'/backup/temp'; ;
					# folder exists
					if( !is_dir($target_folder_path) ) {
					$create_dir 	= mkdir($target_folder_path, 0775,true);
					if(!$create_dir) throw new Exception(" Error on read or create backup temp directory. Permission denied");
					}
				} catch (Exception $e) {
					$msg = '<span class="error">'.$e->getMessage().'</span>';
					echo Error::wrap_error($msg);
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
					throw new Exception("Error Processing backup. Script file not exists or is not accessible", 1);			
				}
			}
			
			# RUN COMMAND
			return exec_::exec_sh_file($prgfile);


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




	# DEDALO PRIVATE TABLES
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
			if(SHOW_DEBUG) {
				throw new Exception($msg, 1);			}
			trigger_error($msg);
			die($msg);
		}
		$tableList = array();		
		while($rows = pg_fetch_assoc($result)) {		
			$tableList[] = $rows['table_name'];
		}
		return $tableList;
	}



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
			error_log("WARNING: DEDALO_EXTRAS_PATH is not defined. Using default.. ");
		}

		#
		# MAIN TLDS
		# Get all main tlds like dd,oh,ich,rsc,et..
		$strQuery = "SELECT tld FROM \"main_dd\" ORDER BY \"tld\" ";
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);
		$ar_tld=array();
		while ($rows = pg_fetch_assoc($result)) {
			
			$current_tld = $rows['tld'];
		
			if ($current_tld=='dd' || $current_tld=='rsc') {
				# CORE DEDALO STR
				$path=DEDALO_LIB_BASE_PATH.'/backup/backups_structure/str_data';
			}else{
				# STR EXTRAS				
				$path=DEDALO_EXTRAS_PATH.'/'.$current_tld.'/str_data';
			}

			if( !is_dir($path) ) {
				if(!mkdir($path, 0777,true)) {
					throw new Exception(" Error on read or create directory. Permission denied ($path)");
				}
			}

			# JER_DD
			$strQuery = "COPY (SELECT * FROM \"jer_dd\" WHERE \"terminoID\" LIKE '{$current_tld}%') TO '{$path}/jer_dd_{$current_tld}.copy';";
			$result2  = JSON_RecordObj_matrix::search_free($strQuery);
			if (!$result2) {
				throw new Exception(" Error on read or create file. Permission denied ({$path}/jer_dd_{$current_tld}.copy)");
			}

			# MATRIX_DESCRIPTORS_DD
			$strQuery = "COPY (SELECT * FROM \"matrix_descriptors_dd\" WHERE \"parent\" LIKE '{$current_tld}%') TO '{$path}/matrix_descriptors_dd_{$current_tld}.copy';";
			$result3  = JSON_RecordObj_matrix::search_free($strQuery);
			if (!$result3) {
				throw new Exception(" Error on read or create file. Permission denied ({$path}/matrix_descriptors_dd_{$current_tld}.copy)");
			}

			$msg = "Saved str tables partial data to $current_tld ";
			if(SHOW_DEBUG) {
				#error_log($msg);
			}

			$ar_response[]=$msg;

		}#end while

		return (array)$ar_response;

	}#end save_dedalo_str_tables_data


	/**
	* LOAD_DEDALO_STR_TABLES_DATA
	* Load data from every tld element file. Files are saved as postgres 'copy' in various locations.
	* Core load 'dd','rsc'
	* Extras load extras folder 'str_data' dir data (filtered by config:DEDALO_PREFIX_TIPOS)
	* @return array $ar_response with array of generated messages on run method
	* NOTE: Sequences and list of values are NOT loaded, only str tables without sequences
	*/
	public static function load_dedalo_str_tables_data() {
		$ar_response=array();

		if (!defined('DEDALO_EXTRAS_PATH')) {
			define('DEDALO_EXTRAS_PATH'		, DEDALO_LIB_BASE_PATH .'/extras');
			error_log("WARNING: DEDALO_EXTRAS_PATH is not defined. Using default.. ");
		}

		#
		# CORE : Load core dedalo str
		#
			$path=DEDALO_LIB_BASE_PATH.'/backup/backups_structure/str_data';
			$ar_core_tlds = array('dd','rsc');
			foreach ($ar_core_tlds as $current_tld) {				

				# JER_DD
				if (file_exists($path.'/jer_dd_'.$current_tld.'.copy')) {
					$strQuery = "DELETE FROM \"jer_dd\" WHERE \"terminoID\" LIKE '{$current_tld}%'; ";	// COPY \"jer_dd\" FROM '{$path}/jer_dd_dd.copy';
					pg_query(DBi::_getConnection(), $strQuery);

					$command = DB_BIN_PATH."psql ".DEDALO_DATABASE_CONN." -U ".DEDALO_USERNAME_CONN." -p ".DEDALO_DB_PORT_CONN." -h ".DEDALO_HOSTNAME_CONN." -c \"\copy jer_dd from {$path}/jer_dd_{$current_tld}.copy\" ";
					$res1 = exec($command);
				}else{
					throw new Exception("Error Processing Request. File not found: $path/jer_dd_dd.copy", 1);
				}

				# MATRIX_DESCRIPTORS_DD
				if (file_exists($path.'/matrix_descriptors_dd_'.$current_tld.'.copy')) {
					$strQuery = "DELETE FROM \"matrix_descriptors_dd\" WHERE \"parent\" LIKE '{$current_tld}%'; ";	//COPY \"matrix_descriptors_dd\" FROM '{$path}/matrix_descriptors_dd_dd.copy';
					pg_query(DBi::_getConnection(), $strQuery);

					$command = DB_BIN_PATH."psql ".DEDALO_DATABASE_CONN." -U ".DEDALO_USERNAME_CONN." -p ".DEDALO_DB_PORT_CONN." -h ".DEDALO_HOSTNAME_CONN." -c \"\copy matrix_descriptors_dd from {$path}/matrix_descriptors_dd_{$current_tld}.copy\" ";
					$res2 = exec($command);
				}else{
					throw new Exception("Error Processing Request. File not found: $path/matrix_descriptors_dd_dd.copy", 1);			
				}
				
				if(SHOW_DEBUG) {
					$msg = "Importing dedalo core data";
					$msg .= " (jer_dd_{$current_tld} [$res1],matrix_descriptors_dd_{$current_tld} [$res2]) ";
				}				

				$ar_response[]=$msg;

			}#end foreach

			#
			# SEQUENCES UPDATE
			# Is necessary for maintain data integrity across exports
			$msg = "Updated dedalo core data sequences";
			# SEQUENCE UPDATE (to the last table id)
				$table 	  ='jer_dd';
				$strQuery = 'SELECT id FROM "'.$table.'" ORDER BY "id" DESC LIMIT 1';	// get last id
				$result   = pg_query(DBi::_getConnection(), $strQuery);
				$row 	  = pg_fetch_row($result);
				$last_id  = (int)$row[0];
				#$strQuery = 'ALTER SEQUENCE '.$table.'_id_seq RESTART WITH '.$last_id.';';	// get last id 
				$sequence_name = $table.'_id_seq';
				$strQuery = "SELECT setval('$sequence_name', $last_id, true);";

				$result   = pg_query(DBi::_getConnection(), $strQuery);
				if(SHOW_DEBUG) {
					$msg .= "<br> {$sequence_name} with value $last_id [$strQuery]";
				}
			# SEQUENCE UPDATE (to the last table id)
				$table 	  ='matrix_descriptors_dd';
				$strQuery = 'SELECT id FROM "'.$table.'" ORDER BY "id" DESC LIMIT 1';	// get last id
				$result   = pg_query(DBi::_getConnection(), $strQuery);
				$row 	  = pg_fetch_row($result);
				$last_id  = (int)$row[0];
				#$strQuery = 'ALTER SEQUENCE '.$table.'_id_seq RESTART WITH '.$last_id.';';	// get last id
				$sequence_name = $table.'_id_seq';
				$strQuery = "SELECT setval('$sequence_name', $last_id, true);";
				$result   = pg_query(DBi::_getConnection(), $strQuery);
				if(SHOW_DEBUG) {
					$msg .= "<br> {$sequence_name} with value $last_id [$strQuery]";
				}
				$ar_response[]=$msg;


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
				if(SHOW_DEBUG) {
					 $msg .= $mysqlImportFilename.;
				}
				$ar_response[]=$msg;
			}
			*/
						

		#
		# EXTRAS : Load extras str
		#
			$ar_extras_folders = (array)glob(DEDALO_EXTRAS_PATH . '/*', GLOB_ONLYDIR);
				#dump($ar_extras_folders," ar_extras_folders");return;
			$DEDALO_PREFIX_TIPOS = (array)unserialize(DEDALO_PREFIX_TIPOS);
			foreach ($ar_extras_folders as $current_dir) {
				
				$current_dir = basename($current_dir);

				if ($current_dir!='test') {
					#continue;
				}
				$res1=$res2=0;
				
				# DEDALO_PREFIX_TIPOS : config tipos verify. 'tipos' not defined in config, will be ignored
				if (!in_array($current_dir, $DEDALO_PREFIX_TIPOS)) {
					continue; # Filter load prefix from config 'DEDALO_PREFIX_TIPOS'
				}

				$path = DEDALO_EXTRAS_PATH .'/'.$current_dir.'/str_data';
				# JER_DD
				if (file_exists($path.'/jer_dd_'.$current_dir.'.copy')) {
					$strQuery  = "DELETE FROM \"jer_dd\" WHERE \"terminoID\" LIKE '{$current_dir}%'; ";	// COPY \"jer_dd\" FROM '{$path}/jer_dd_{$current_dir}.copy'";
					pg_query(DBi::_getConnection(), $strQuery);

					$command = DB_BIN_PATH."psql ".DEDALO_DATABASE_CONN." -U ".DEDALO_USERNAME_CONN." -p ".DEDALO_DB_PORT_CONN." -h ".DEDALO_HOSTNAME_CONN." -c \"\copy jer_dd from {$path}/jer_dd_{$current_dir}.copy\" ";
					$res1 = exec($command);
				}else{
					#throw new Exception("Error Processing Request. File not found: ".$path.'/jer_dd_'.$current_dir.'.copy', 1);
				}				# MATRIX_DESCRIPTORS_DD
				if (file_exists($path.'/matrix_descriptors_dd_'.$current_dir.'.copy')) {
					$strQuery = "DELETE FROM \"matrix_descriptors_dd\" WHERE \"parent\" LIKE '{$current_dir}%';"; // COPY \"matrix_descriptors_dd\" FROM '{$path}/matrix_descriptors_dd_{$current_dir}.copy';"
					pg_query(DBi::_getConnection(), $strQuery);
					
					$command = DB_BIN_PATH."psql ".DEDALO_DATABASE_CONN." -U ".DEDALO_USERNAME_CONN." -p ".DEDALO_DB_PORT_CONN." -h ".DEDALO_HOSTNAME_CONN." -c \"\copy matrix_descriptors_dd from {$path}/matrix_descriptors_dd_{$current_dir}.copy\" ";
					$res2 = exec($command);
				}else{
					#throw new Exception("Error Processing Request. File not found: ".$path.'/matrix_descriptors_dd_'.$current_dir.'.copy', 1);			
				}
				
				$msg = "Imported dedalo extras data";
				if(SHOW_DEBUG) {
					$msg .= " (jer_dd_{$current_dir} [$res1],matrix_descriptors_dd_{$current_dir} [$res2])";
				}
				$ar_response[]=$msg;				

			}#end foreach

		return $ar_response;

	}#end save_dedalo_str_tables_data



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

		exec($command,$output,$worked_result);
		$res_html='';	
		switch($worked_result){
			case 0:
				$res_html .= '<div style="color:white;background-color:green;padding:10px;font-family:arial;font-size:14px;word-wrap:break-word;border-radius:5px;">
				EXPORT to file: <br>Database <br> <b>' .DEDALO_DATABASE_CONN .'</b><br> successfully exported to file<br> <b>' .$mysqlExportPath .'</b></div>';
				break;
			case 1:
				$res_html .= '<div style="color:white;background-color:orange;padding:10px;font-family:arial;font-size:14px;word-wrap:break-word;border-radius:5px;">
				There was a warning during the export of <b>' .DEDALO_DATABASE_CONN .'</b> to <b>' .$mysqlExportPath .'</b></div>';
				break;
			case 2:
				$res_html .= '<div style="color:white;background-color:red;padding:10px;font-family:arial;font-size:14px;word-wrap:break-word;border-radius: 5px;">
				There was an error during export. Please check your values:<br/><br/>
				<table>
				<tr><td>DB Database Name:</td><td><b>' .DEDALO_DATABASE_CONN .'</b></td></tr>
				<tr><td>DB User Name:</td><td><b>' .DEDALO_USERNAME_CONN .'</b></td></tr>
				<tr><td>DB Password:</td><td><b>NOTSHOWN</b></td></tr>
				<tr><td>DB Host Name:</td><td><b>' .$mysqlHostName .'</b></td>
				</tr>
				</table>
				</div>';
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
		if ($db_name=='dedalo4_development_str.custom') {
			$ar_response 		= self::save_dedalo_str_tables_data();	
			$ar_response_html 	= implode('<hr>', (array)$ar_response);
			$res_html .= wrap_pre($ar_response_html);
		}		

		return $res_html;

	}#end export_structure


	/**
	* IMPORT_STRUCTURE
	* Exec pg_restore of selected backup file
	* @see trigger.db_utils
	* @param string db_name default 'dedalo4_development_str.custom'
	* @return string $res_html table of results
	*/
	public static function import_structure($db_name='dedalo4_development_str.custom') {

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

		exec($command,$output,$worked);
		$res_html='';
		switch($worked){
			# OK (0)
			case 0:
				$res_html .= '<div style="color:white;background-color:green;padding:10px;font-family:arial;font-size:14px;word-wrap:break-word;border-radius:5px;">';
				$res_html .= 'IMPORT file:<br> File <br><b>' .$mysqlImportFilename .'</b><br> successfully imported to database<br> <b>' . DEDALO_DATABASE_CONN .'</b>';
				$res_html .= '</div>';
				break;
			# ERROR (1)
			case 1:
				$res_html .= '<div style="color:white;background-color:red;padding:10px;font-family:arial;font-size:14px;word-wrap:break-word;border-radius: 5px;">
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
				if(SHOW_DEBUG) {
					$res_html .= "<br>DEBUG INFO:<hr>$command";
				}
				break;
			default:			
				$res_html .= "Command response: ".$worked ."<br> for command: $command";
				if ($worked==127) {
					$res_html .= "Review your mysql path please: <br>DB_BIN_PATH: ".DB_BIN_PATH."<br>PHP_BIN_PATH: ".PHP_BIN_PATH ;
				}
		}
		if(SHOW_DEBUG) {
			#dump($worked," console response code for:\n $command ");
			#dump($output," console output for:\n $command");
		}
		#$res_html .= "<pre>";
		#$res_html .= print_r($ar_dedalo_private_tables,true);
		#$res_html .= "</pre>";


		#
		# LOAD_DEDALO_STR_TABLES_DATA
		# Load partials srt data based on tld to independent files
		#if ($db_name=='dedalo4_development_str.custom') {
			sleep(3);
			$ar_response 		= self::load_dedalo_str_tables_data();	
			$ar_response_html 	= implode('<hr>', (array)$ar_response);
			$res_html .= wrap_pre($ar_response_html);
		#}

		return $res_html;

	}#end import_structure




}#end class
?>