<?php declare(strict_types=1); // NOT IN UNIT TEST !
/**
* CLASS BACKUP
*
*/
abstract class backup {



	// Columns to save (used by copy command, etc.)
	// Do not use id column NEVER here
	public static $jer_dd_columns			= '"terminoID", parent, modelo, esmodelo, esdescriptor, visible, norden, tld, traducible, relaciones, propiedades, properties, term';
	public static $descriptors_dd_columns	= 'parent, dato, tipo, lang';
	public static $checked_download_str_dir	= false;



	/**
	* INIT_BACKUP_SEQUENCE
	* Make backup (compressed SQL dump) of current dedalo DB before login
	* @param int $user_id
	* @param string $username
	* @param bool $skip_backup_time_range = false
	* @return object $response
	*/
	public static function init_backup_sequence(object $options) : object {

		// options
			$user_id				= $options->user_id ?? logged_user_id(); // int
			$username				= $options->username ?? logged_user_username(); // string
			$skip_backup_time_range	= $options->skip_backup_time_range ?? false; // bool

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed '.__METHOD__;
				$response->errors	= [];

		// non dedalo_db_management case. Used when DDBB is in a external server or when backups are managed externally
			if (defined('DEDALO_DB_MANAGEMENT') && DEDALO_DB_MANAGEMENT===false) {

				$response->msg		= 'OK. Skipped request by db config management '.__METHOD__;
				$response->result	= true;

				debug_log(__METHOD__
					." Skipped request backup_secuence because DEDALO_DB_MANAGEMENT = false"
					, logger::WARNING
				);
				return $response;
			}

		try {

			// Backups folder exists verify
				$file_path = DEDALO_BACKUP_PATH_DB;
				if( !is_dir($file_path) ) {
					if(!mkdir($file_path, 0700, true)) {
						#throw new Exception(" Error on read or create backup directory. Permission denied");
						$response->result	= false;
						$response->msg		= 'Error on read or create backup directory. Permission denied '.__METHOD__;
						$response->error[]	= 'Error: unable to create backups folder';
						debug_log(__METHOD__
							. " $response->msg " . PHP_EOL
							. ' file_path: ' . to_string($file_path)
							, logger::ERROR
						);
						return $response;
					}
					debug_log(__METHOD__
						." CREATED DIR: $file_path  "
						, logger::WARNING
					);
				}

			// name : file name formatted as date . (one hour resolution)
				$ar_dd_data_version	= get_current_version_in_db();
				$db_name			= ($skip_backup_time_range===true)
					? date("Y-m-d_His") .'.'. DEDALO_DATABASE_CONN .'.'. DEDALO_DB_TYPE .'_'. $user_id .'_forced_dbv' . implode('-', $ar_dd_data_version)
					: date("Y-m-d_H")   .'.'. DEDALO_DATABASE_CONN .'.'. DEDALO_DB_TYPE .'_'. $user_id .'_dbv' . implode('-', $ar_dd_data_version);

			// time range check
				if($skip_backup_time_range===true) {

					// Direct backup is forced
					debug_log(__METHOD__
						." Making backup without time range prevention "
						, logger::WARNING
					);

				}else{

					// Time range for backups in hours
					if (!defined('DEDALO_BACKUP_TIME_RANGE')) {
						define('DEDALO_BACKUP_TIME_RANGE', 8); // Minimum lapse of time (in hours) for run backup script again. Default: (int) 4
					}
					$last_modification_time_secs = get_last_modification_date(
						$file_path, // string path
						['backup'], // array|null allowedExtensions
						['/acc/'] // array ar_exclude
					);
					$current_time_secs		= time();
					$difference_in_hours	= round( ($current_time_secs/3600) - round($last_modification_time_secs/3600), 0 );
					if ( $difference_in_hours < DEDALO_BACKUP_TIME_RANGE ) {
						$msg = " Skipped backup. A recent backup (about $difference_in_hours hours early) already exists. It is not necessary to build another one";
						debug_log(__METHOD__
							." $msg "
							, logger::DEBUG
						);

						$response->result	= true;
						$response->msg		= $msg . " ".__METHOD__;

						return $response; // stop here
					}
				}

			// Backup file exists (less than an hour apart)
				$mysqlExportPath = $file_path .'/'. $db_name . '.custom.backup';
				if (file_exists($mysqlExportPath)) {
					$msg = " Skipped backup. A recent backup already exists ('$mysqlExportPath'). It is not necessary to build another one";
					debug_log(__METHOD__
						. $msg  . PHP_EOL
						. ' db_name: ' . to_string($db_name)
						, logger::DEBUG
					);

					$response->result	= true;
					$response->msg		= $msg . " ".__METHOD__;

					return $response; // stop here
				}

			// command base. Export the database and output the status to the page
			$cmd = DB_BIN_PATH.'pg_dump '.DBi::get_connection_string().' -F c -b -v '.DEDALO_DATABASE_CONN.' > "'.$mysqlExportPath .'"';

			// process
				$pfile		= process::get_unique_process_file(); // like 'process_1_2024-03-31_23-47-36_3137757' usually stored in the sessions directory
				$file_path	= process::get_process_path() .'/' . $pfile; // output file with errors and stream data
				$command	= "nohup sh -c 'nice -n 19 $cmd' >$file_path 2>&1 & echo $!";

				// debug
					debug_log(__METHOD__
						." Building backup file in background ($mysqlExportPath)". PHP_EOL
						." Command: ". PHP_EOL. to_string($command)
						, logger::DEBUG
					);

				$process	= new process($command);
				$pid		= $process->getPid();

			/* OLD WAY
				if($skip_backup_time_range===true) {

					// forced backup case. Wait until finish

					$pfile		= process::get_unique_process_file();
					$file_path	= process::get_process_path() .'/' . $pfile;
					$command	= "nohup sh -c 'nice -n 19 $command' >$file_path 2>&1 & echo $!";

					debug_log(__METHOD__
						." Building direct backup file ($mysqlExportPath)". PHP_EOL
						." Command: ". PHP_EOL. to_string($command)
						, logger::DEBUG
					);

					$process	= new process($command);
					$pid		= $process->getPid();

				}else{

					// default backup case. Async dump building sh file



						$command = 'sleep 15s; nice -n 19 ' . $command;

						// build sh file with backup command if not exists
						$prgfile = DEDALO_BACKUP_PATH_TEMP.'/backup_' . DEDALO_DB_TYPE . '_' . date("Y-m-d_H") . '_' . DEDALO_DATABASE_CONN  . '.sh';	//
						if(!file_exists($prgfile)) {

							// target folder verify (exists and permissions)
								$target_folder_path = DEDALO_BACKUP_PATH_TEMP;
								if( !is_dir($target_folder_path) ) {
									if(!mkdir($target_folder_path, 0775, true)) throw new Exception(" Error on read or create backup temp directory. Permission denied");
								}

							// sh file generating
								$fp = fopen($prgfile, "w");
								fwrite($fp, "#!/bin/bash\n");
								fwrite($fp, "$command\n");
								fclose($fp);

							// sh file permissions
								if(file_exists($prgfile)) {
									chmod($prgfile, 0755);
								}else{
									$msg = "Error Processing backup. Script file do not exists or is not accessible. Please check folder '../backup/temp' permissions";
									debug_log(__METHOD__
										." $msg "
										, logger::ERROR
									);
									throw new Exception($msg, 1);
								}

							// fastcgi_finish_request
								// if (function_exists('fastcgi_finish_request')) {
								// 	fastcgi_finish_request();
								// 	debug_log(__METHOD__." fastcgi_finish_request() function was called to prevent lock this connection. ".to_string(), logger::WARNING);
								// } else {
								// 	debug_log(__METHOD__." Error: This server does not support fastcgi_finish_request() function. ".to_string(), logger::ERROR);
								// }

							// run delayed command in background
								$PID = exec_::exec_sh_file($prgfile);

								debug_log(__METHOD__
									." Building delayed backup file" . PHP_EOL
									.' mysqlExportPath: ' . $mysqlExportPath . PHP_EOL
									.' Command: '.$command .PHP_EOL
									.' PID: '.$PID
									, logger::WARNING
								);
						}

				}//end if($skip_backup_time_range===true)
				*/

		}catch (Exception $e) {

			$msg = "Error on backup_secuence. User: $username. - error: ".  $e->getMessage(). "\n";
			debug_log(__METHOD__
				. " Exception: $msg "
				, logger::ERROR
			);

			// response error
				$response->result	= false;
				$response->msg		= "Exception: $msg";
				$response->errors[] = $e->getMessage();

			return $response; // stop here
		}

		// response OK
			$response->result	= true;
			$response->pid		= $pid ?? null;
			$response->pfile	= $pfile ?? null;
			$response->msg		= 'OK. backup process running for db: ' . $db_name;


		return $response;
	}//end init_backup_sequence



	/**
	* GET_TABLES
	* Get all tables (unfiltered) from current database
	* @return array $tableList
	*/
	public static function get_tables() : array {

		$strQuery = "
		SELECT *
		FROM information_schema.tables
		WHERE table_type = 'BASE TABLE'
		 AND table_schema = 'public'
		ORDER BY table_type, table_name
		";
		$result = JSON_RecordDataBoundObject::search_free($strQuery);

		if(!$result) {
			$msg = "Failed Search. Data is not found. Please contact with your admin (1)" ;
			if(SHOW_DEBUG===true) {
				throw new Exception($msg, 1);
			}
			debug_log(__METHOD__
				." ERROR: $msg "
				, logger::ERROR
			);
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
	* @param string $table
	* @param string $path_file
	* @param string|null $tld
	* @return string $res
	*/
	public static function copy_to_file( string $table, string $path_file, ?string $tld=null ) : string {

		$res = '';

		// check tld var
			if (empty($tld) && $table!=='matrix_dd') {
				debug_log(__METHOD__
					. " Error. Empty tld " . PHP_EOL
					. ' table: ' . $table . PHP_EOL
					. ' path_file: ' . $path_file . PHP_EOL
					. ' tld: ' . to_string($tld)
					, logger::ERROR
				);
				return '';
			}

		// command
			$command_base = DB_BIN_PATH.'psql ' . DEDALO_DATABASE_CONN .' '. DBi::get_connection_string();
			switch ($table) {

				case 'jer_dd':
					$command = $command_base
						. " -c \"\copy (SELECT ".addslashes(backup::$jer_dd_columns)." FROM \"jer_dd\" WHERE tld = '{$tld}') TO '{$path_file}' \" ";
					break;

				case 'matrix_dd':
					$command = $command_base
						. " -c \"\copy (SELECT * FROM \"$table\") TO '{$path_file}' \" ";
					break;
			}

		// exec command in terminal
			$res = shell_exec($command);

		// check created file
			if (!file_exists($path_file)) {
				throw new Exception("Error Processing Request. File $path_file not created!", 1);
			}


		return (string)$res;
	}//end copy_to_file



	/**
	* COPY_FROM_FILE
	* Copy rows from PostgreSQL 'COPY' (like CVS) to table
	* Previously, existing records whit current tld are deleted
	* Delete is made as regular php query to database
	* Copy is made using psql daemon
	* @param string $table
	* @param string $path_file
	* @param string|null $tld = null
	*
	* @return string $res
	*/
	public static function copy_from_file( string $table, string $path_file, ?string $tld=null ) : string {

		$res='';

		// file exists check
			if (!file_exists($path_file)) {
				// throw new Exception("Error Processing Request. File $path_file not found", 1);
				debug_log(__METHOD__
					. " Error Processing Request. File not found " . PHP_EOL
					. ' path_file: ' . to_string($path_file)
					, logger::ERROR
				);
				return '';
			}

		// tld mandatory for some tables check
			if ($table==='jer_dd') {
				if (empty($tld)) {
					debug_log(__METHOD__
						. " Error Processing Request. tld is mandatory " . PHP_EOL
						. ' tld: ' . to_string($tld)
						, logger::ERROR
					);
					return '';
				}
			}

		$command_history = array();

		// $port_command = !empty(DEDALO_DB_PORT_CONN) ? (' -p '.DEDALO_DB_PORT_CONN) : '';
		// $command_base = DB_BIN_PATH.'psql '.DEDALO_DATABASE_CONN.' -U '.DEDALO_USERNAME_CONN .' -h '.DEDALO_HOSTNAME_CONN . $port_command;
		$command_base = DB_BIN_PATH . 'psql ' . DEDALO_DATABASE_CONN . ' ' . DBi::get_connection_string();

		switch ($table) {

			case 'jer_dd':
				# DELETE . Remove previous records
				// $command = $command_base . " -c \"DELETE FROM \"jer_dd\" WHERE ".'\"terminoID\"'." LIKE '{$tld}%'\" "; # -c "DELETE FROM \"jer_dd\" WHERE \"terminoID\" LIKE 'dd%'"
				$command = $command_base . " -c \"DELETE FROM \"jer_dd\" WHERE tld = '{$tld}' \" ";
				$res .= shell_exec($command);
				#$res .= exec( $command );
				$command_history[] = $command;

				# COPY . Load data from file
				$command = $command_base . " -c \"\copy jer_dd(".addslashes(backup::$jer_dd_columns).") from {$path_file}\" ";
				$res .= shell_exec($command);
				#$res .= exec( $command );
				$command_history[] = $command;
				break;

			case 'matrix_dd':
				# DELETE . Remove previous records
				$command = $command_base . " -c \"DELETE FROM \"$table\" \" "; # -c "DELETE FROM \"jer_dd\" WHERE \"terminoID\" LIKE 'dd%'"
				$res .= shell_exec($command);
				#$res .= exec( $command );
				$command_history[] = $command;

				# COPY . Load data from file
				$command = $command_base . " -c \"\copy matrix_dd from {$path_file}\" ";
				$res .= shell_exec($command);
				#$res .= exec( $command );
				$command_history[] = $command;
				break;
		}
		$res = str_replace("\n",' ',$res);


		return (string)$res;
	}//end copy_from_file



	/**
	* EXPORT_STRUCTURE (Ontology)
	* Exec pg_dump of selected tables and generate PostgreSQL 'copy' of tld independent files
	* By default, jer_dd (and sequences) are excluded because they are saved as independent tld files
	* When export structure is done, two versions are created: full and partial. Full contain all tld and sequences of dedalo *_dd tables
	* and partial the same except jer_dd
	* @see trigger.db_utils
	* @param string|null $db_name like 'dedalo_development_str.custom'. If null, default is used
	* @param bool $exclude_tables default true
	* @return string $res_html table of results
	*/
	public static function export_structure( ?string $db_name=null, bool $exclude_tables=true ) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__METHOD__.'] ';
				$response->errors	= [];

		// non dedalo_db_management case. Used when DDBB is in a external server or when backups are managed externally
			if (defined('DEDALO_DB_MANAGEMENT') && DEDALO_DB_MANAGEMENT===false) {
				$response->result	= true;
				$response->msg		= 'OK. Skipped request by db config management '.__METHOD__;
				debug_log(__METHOD__
					." Skipped request because DEDALO_DB_MANAGEMENT = false"
					, logger::WARNING
				);
				return $response;
			}

		// DB_SYSTEM_CONFIG_VERIFY
			$system_config_verify = self::db_system_config_verify();
			if ($system_config_verify->result===false) {
				$response->msg .= $system_config_verify->msg;
				$response->errors[] = 'Bad db_system_config_verify response';
				return $response;
			}

		// db_name
			if (empty($db_name)) {
				$db_name = 'dedalo_development_str.custom';
			}

		$file_path		 = rtrim(DEDALO_BACKUP_PATH_ONTOLOGY, '/');
		$mysqlExportPath = $file_path .'/'. $db_name . ".backup";

		# Export the database and output the status to the page
		# '-F c' Output compressed custom format (p = plain, c = custom, d = directory, t = tar)
		# '-b' include blobs
		# '-v' verbose mode
		# '-t "*_dd"' tables wildcard. dump only tables ended with '_dd'
		$command  = '';
		// $port_command = !empty(DEDALO_DB_PORT_CONN) ? (' -p '.DEDALO_DB_PORT_CONN) : '';
		// $command .= DB_BIN_PATH.'pg_dump -h '.DEDALO_HOSTNAME_CONN . $port_command . ' -U "'.DEDALO_USERNAME_CONN.'" ';
		$command .= DB_BIN_PATH . 'pg_dump ' . DBi::get_connection_string();
		$command .= ' --no-owner --no-privileges';
		if ($exclude_tables===true) {
			$command .= ' -T "jer_dd*"';	// Exclude tables (AND respective sequences) ( T UPERCASE )
		}
		$command .= ' -F c -t "*_dd" -t "*dd_id_seq"';				// Include tables ( t lowercase ) -t "*_dd" -t "*dd_id_seq"
		$command .= ' ' . DEDALO_DATABASE_CONN.' > "'.$mysqlExportPath .'"';

		// exec command
		exec($command.' 2>&1', $output, $worked_result);

		$msg_separator = '<br>';

		$ar_msg = [];
		switch($worked_result){

			case 0: // success
				$label = ($exclude_tables===true) ? 'EXPORT_BASE_STRUCTURE' : 'EXPORT_FULL_STRUCTURE';
				$ar_msg[] = 'OK. Mode: ' . $label;
				$ar_msg[] = 'Database: ' . DEDALO_DATABASE_CONN . ' successfully exported to file: ' . basename($mysqlExportPath);
				$ar_msg[] = (file_exists($mysqlExportPath))
					? 'File size: ' . format_size_units( filesize($mysqlExportPath) )
					: 'File size: 0';

				$response->result 	= true;
				$response->msg 		= implode($msg_separator, $ar_msg);
				break;

			case 1: // error 1
				$ar_msg[] = 'There was a problem during the export of ' .DEDALO_DATABASE_CONN .' to ' . $mysqlExportPath;
				$ar_msg[] = 'If you are using pgpass, check config, owner an permissions';
				if(SHOW_DEBUG===true) {
				$ar_msg[] = 'Command: ' . $command;
				}
				$response->result 	= false;
				$response->msg 		= implode($msg_separator, $ar_msg);
				$response->errors[] = 'Error 1. Unable to export database';
				if(SHOW_DEBUG===true) {
					$response->command = $command;
					debug_log(__METHOD__
						. " Error 1. Unable to export database " . PHP_EOL
						. ' command: ' . to_string($command)
						, logger::ERROR
					);
				}
				return $response; // Stop execution here

			case 2: // error 2
				$ar_msg[] = 'There was an error during export. Please check your DB config:';
				$ar_msg[] = 'DB Database Name: ' . DEDALO_DATABASE_CONN;
				$ar_msg[] = 'DB DB_BIN_PATH: ' . DB_BIN_PATH;
				$ar_msg[] = 'DB User Name: ' . DEDALO_USERNAME_CONN;
				$ar_msg[] = 'DB Host Name: ' . DEDALO_HOSTNAME_CONN;
				$ar_msg[] = 'If you are using pgpass, check config, owner an permissions';

				$response->result 	= false;
				$response->msg 		= implode($msg_separator, $ar_msg);
				$response->errors[] = 'Error 2. Unable to export database';
				if(SHOW_DEBUG===true) {
					$response->command = $command;
					debug_log(__METHOD__
						. " Error 1. Unable to export database " . PHP_EOL
						. ' command: ' . to_string($command)
						, logger::ERROR
					);
				}
				return $response; // Stop execution here

			default: // error unknown
				$ar_msg[] = $worked_result;
				$response->result 	= false;
				$response->msg 		= implode($msg_separator, $ar_msg);
				$response->errors[] = 'Error unknown. Unable to export database. ' . to_string($worked_result);
		}

		// save_dedalo_str_tables_data. Save partials str data based on tld to independent files
			if ($db_name==='dedalo_development_str.custom' && $response->result===true) {

				// save_dedalo_str_tables_data
				$res_dedalo_str_tables_data = self::save_dedalo_str_tables_data();

				$ar_msg[] = $res_dedalo_str_tables_data->msg;
				if ($res_dedalo_str_tables_data->result===false) {
					$response->result = false;
					$response->errors[] = 'Error on save_dedalo_str_tables_data. Unable to save partials';
				}else{
					$response->msg .= $msg_separator . 'TLD Saved files:';
					$response->msg .= '<pre>'. $res_dedalo_str_tables_data->msg . '</pre>';
				}
			}


		return $response;
	}//end export_structure



	/**
	* SAVE_DEDALO_STR_TABLES_DATA
	* Select unique tlds from table 'jer_dd' and iterate saving one file for tld
	* Core tlds are saved in 'backups_structure' dir
	* Extras tlds are saved in its respective dir inside 'extras' folder
	* @return object $response
	*/
	public static function save_dedalo_str_tables_data() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= '';

		if (!defined('DEDALO_EXTRAS_PATH')) {
			define('DEDALO_EXTRAS_PATH', DEDALO_CORE_PATH .'/extras');
			debug_log(__METHOD__
				." WARNING: DEDALO_EXTRAS_PATH is not defined. Using default.. "
				,logger::WARNING
			);
		}

		#
		# MAIN TLDS
		# Get all main tlds like dd,oh,ich,rsc,etc.. from table jer_dd grouped by tld
		$active_tlds = RecordObj_dd::get_active_tlds();

		$ar_msg = array();
		foreach ($active_tlds as $current_tld) {

			$msg='';
			$msg .= "<b>$current_tld</b>";

			$path = ($current_tld==='dd' || $current_tld==='rsc')
				? DEDALO_BACKUP_PATH_ONTOLOGY . '/str_data' // CORE DEDALO STR
				: DEDALO_EXTRAS_PATH .'/'. $current_tld . '/str_data'; // STR EXTRAS

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

			$ar_msg[] = $msg;
			#$msg = " -> Saved str tables partial data to $current_tld (jer_dd: <b>".trim($res1)."</b>)";
		}//end while


		#
		# MATRIX_DD (Private list of values)
		$table 		= 'matrix_dd';
		$path 		= DEDALO_BACKUP_PATH_ONTOLOGY . '/str_data';
		$path_file 	= "{$path}/{$table}.copy";
		$res3 		= backup::copy_to_file($table, $path_file, null);

		$msg='';
		$msg .= "<b>$table</b>";
		if (empty($res3)) {
			$msg .= "Error on export $table. Please try again";
			#print("<div class=\"error\">$msg</div>");
			debug_log(__METHOD__
				." $msg " .PHP_EOL
				.' res: ' . to_string($res3)
				, logger::ERROR
			);
			// $load_with_errors = true;
			#throw new Exception(" Error on read or create file. Permission denied ({$path_file})");
			$response->result 	= false;
			$response->msg 		= "Error on read or create directory. Permission denied for copy_to_file ($path_file)";
			return $response;
		}else{
			$msg .= "<br>Exported $table (<b>".trim($res3)."</b>) - fields: * ";
			$msg .= "<br> -> $path_file ";
			$ar_msg[] = $msg;
		}


		# All is OK
		$response->result	= true;
		$response->msg		= implode('<hr>', $ar_msg);


		return (object)$response;
	}//end save_dedalo_str_tables_data



	/**
	* IMPORT_STRUCTURE
	* Exec pg_restore of selected backup file
	* @see trigger.db_utils
	* @param string db_name default 'dedalo_development_str.custom'
	* @param bool $check_server = true
	* @param array|null $dedalo_prefix_tipos = null
	* @return object $response
	* {
	* 	result: bool,
	* 	msg: string,
	* 	errors: array
	* }
	*/
	public static function import_structure( string $db_name='dedalo_development_str.custom', bool $check_server=true, ?array $dedalo_prefix_tipos=null ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= '';
			$response->errors	= [];

		// non dedalo_db_management case. Used when DDBB is in a external server or when backups are managed externally
			if (defined('DEDALO_DB_MANAGEMENT') && DEDALO_DB_MANAGEMENT===false) {
				$response->result	= true;
				$response->msg		= 'OK. Skipped request by db config management '.__METHOD__;
				debug_log(__METHOD__
					." Skipped request because DEDALO_DB_MANAGEMENT = false"
					, logger::WARNING
				);
				return $response;
			}

		// db_system_config_verify. Test pgpass file existence and permissions
			$system_config_verify = self::db_system_config_verify();
			if ($system_config_verify->result===false) {
				// error
				$response->result 	= false;
				$response->msg 		= $system_config_verify->msg;
				$response->errors[]	= $system_config_verify->msg;

				return $response;
			}

		// main_sql_file_path
			// files list
			$ontology_file_list = backup::get_ontology_file_list($dedalo_prefix_tipos);

			// download from remote
			if(defined('STRUCTURE_FROM_SERVER') && STRUCTURE_FROM_SERVER===true) {
				$download_response = backup::download_ontology_files($ontology_file_list);
				if ($download_response->result===false || !empty($download_response->errors)) {
					$response->errors = array_merge($response->errors, $download_response->errors);
					$response->result	= false;
					$response->msg .= ' Error on download_ontology_files';

					return $response;
				}
			}

			// find main_file_item. main_file is the shared value lists: dedalo_development_str.custom.backup
			$main_file_item = array_find($ontology_file_list, function($el){
				return $el->type==='main_file';
			});

			// compose file path as /var/www/html/dedalo/install/import/ontology/dedalo_development_str.custom.backup
			$main_sql_file_path = is_object($main_file_item)
				? $main_file_item->path .'/'. $main_file_item->name
				: null;

			// check main file is not in the ontology_file_list
			if (empty($main_sql_file_path)) {
				$response->result	= false;
				$response->msg .= ' Error getting main_file name from ontology_file_list';
				if(SHOW_DEBUG===true) {
				$response->msg .= PHP_EOL . json_encode($ontology_file_list, JSON_PRETTY_PRINT);
				}
				$response->errors[]	= "Error getting main_file name from ontology_file_list";

				return $response;
			}

			// check main file do not exists
			if (!file_exists($main_sql_file_path)) {
				$response->result 	= false;
				$response->msg 		.= "Error: source file not found : $main_sql_file_path";
				if(SHOW_DEBUG===true) {
				$response->msg .= PHP_EOL . json_encode($ontology_file_list, JSON_PRETTY_PRINT);
				}
				$response->errors[]	= "Error: source file not found : $main_sql_file_path";

				return $response;
			}

		// Import the database and output the status to the page
			$command  = DB_BIN_PATH.'pg_restore ' . DBi::get_connection_string() . ' --dbname '.DEDALO_DATABASE_CONN;
			$command .= ' --no-password --clean --no-owner --no-privileges "'.$main_sql_file_path.'"';

		// exec command
			exec($command.' 2>&1', $output, $worked_result);

		$ar_msg = [];
		switch($worked_result) {

			case 0: // success
				$ar_msg[] = 'OK. File ' . basename($main_sql_file_path) .' successfully imported to database ' . DEDALO_DATABASE_CONN;
				if(SHOW_DEBUG===true) {
				$ar_msg[] = 'Command: ' . $command;
				}
				$ar_msg[] = 'Command output: ' . json_encode($output, JSON_PRETTY_PRINT);
				break;

			case 1: // error 1
				$ar_msg[] = 'There was an error during import (using pg_restore). Errors may have occurred during pg_restore. See Command output for details';
				$ar_msg[] = 'Command result: ' . to_string($worked_result);
				$ar_msg[] = 'Command output: ' . PHP_EOL . json_encode($output, JSON_PRETTY_PRINT) . PHP_EOL;
				$ar_msg[] = 'DB Name: ' . DEDALO_DATABASE_CONN;
				$ar_msg[] = 'DB User Name: ' . DEDALO_USERNAME_CONN;
				$ar_msg[] = 'DB Host Name: ' . DEDALO_HOSTNAME_CONN;
				$ar_msg[] = 'DB Import Filename: ' . basename($main_sql_file_path);
				if(SHOW_DEBUG===true) {
				$ar_msg[] = 'Command: ' . $command;
				}
				$response->result	= false;
				$response->errors[]	= 'Error: pg_restore errors have occurred';
				break;

			default: // error unknown
				$ar_msg[] = 'Error. Command result: ' . to_string($worked_result) . ' (code expected: 0)';
				if ($worked_result==127) {
				$ar_msg[] = 'Check your DDBB path. Current config DB_BIN_PATH: '.DB_BIN_PATH;
				}
				if(SHOW_DEBUG===true) {
				$ar_msg[] = 'Command: ' . $command;
				}
				$ar_msg[] = 'Command output: ' . json_encode($output, JSON_PRETTY_PRINT);
				$response->result	= false;
				$response->errors[]	= 'Error during command execution (unknown). code: ' . to_string($worked_result);
				break;
		}

		// load data from files (tld files)
			// load_dedalo_str_tables_data_from_files
			// Load partials srt data based on tld to independent files
			$res_str_tables_data_from_files = (object)self::load_dedalo_str_tables_data_from_files();
			if ($res_str_tables_data_from_files->result===false) {

				$response->result	= false;
				$ar_msg[]			= $res_str_tables_data_from_files->msg ?? 'Unknown error on load_dedalo_str_tables_data_from_files';
				$response->errors[]	= 'Error during load_dedalo_str_tables_data_from_files: ';
				$response->errors	= array_merge($response->errors, (array)$res_str_tables_data_from_files->errors);

			}else{

				$response->result	= true;
				$ar_msg[]			= '-----------------------------------------------------------------------';
				$ar_msg[]			= $res_str_tables_data_from_files->msg;
				$ar_msg[]			= '-----------------------------------------------------------------------';
			}

		// response
			if ($response->result===false) {
				// error case
				array_unshift( $ar_msg, 'Error. Request failed '.__METHOD__);
				$response->msg		= implode(PHP_EOL, $ar_msg);
				$response->errors[]	= $response->msg;
			}else{
				// success case
				$response->result = true;
				array_unshift( $ar_msg, 'OK. Request done successfully '.__METHOD__);
				$response->msg		= implode(PHP_EOL, $ar_msg);
			}


		return $response;
	}//end import_structure



	/**
	* LOAD_DEDALO_STR_TABLES_DATA_FROM_FILES
	* Load data from every tld element file. Files are saved as PostgreSQL 'copy' in various locations.
	* Core load 'dd','rsc'
	* Extras load extras folder 'str_data' dir data (filtered by config:DEDALO_PREFIX_TIPOS)
	* NOTE: Sequences and list of values are NOT loaded, only str tables without sequences
	* @return object $response
	* {
	* 	result: bool,
	* 	msg: string,
	* 	errors: array
	* }
	*/
	public static function load_dedalo_str_tables_data_from_files() : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= '';
				$response->errors	= [];

		// non dedalo_db_management case. Used when DDBB is in a external server or when backups are managed externally
			if (defined('DEDALO_DB_MANAGEMENT') && DEDALO_DB_MANAGEMENT===false) {
				$response->result	= true;
				$response->msg		= 'OK. Skipped request by db config management '.__METHOD__;
				debug_log(__METHOD__
					." Skipped request because DEDALO_DB_MANAGEMENT = false"
					, logger::WARNING
				);
				return $response;
			}

		// ar_msg
			$ar_msg=array();

		if (!defined('DEDALO_EXTRAS_PATH')) {
			define('DEDALO_EXTRAS_PATH', DEDALO_CORE_PATH .'/extras');
			debug_log(__METHOD__
				." WARNING: DEDALO_EXTRAS_PATH is not defined. Using default.. "
				, logger::WARNING
			);
			$response->msg .= 'Please, define DEDALO_EXTRAS_PATH in your config ASAP';
		}

		if(defined('STRUCTURE_FROM_SERVER') && STRUCTURE_FROM_SERVER===true) {
			$path = ONTOLOGY_DOWNLOAD_DIR;
		}else{
			$path = DEDALO_BACKUP_PATH_ONTOLOGY.'/download';
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
						$msg .= "<br>Error on import table: '$table' - tld: '$tld' - copy_from_file: '$path_file'";
						if(SHOW_DEBUG===true) {
							$msg .= "<pre>".print_r($res1,true)."</pre>";
						}
						debug_log(
							__METHOD__." $msg ".to_string($res1)
							, logger::ERROR
						);
						// $load_with_errors=true;
						$response->result	= false;
						$response->msg		.= $msg;
						$response->errors[]	= "Error on import $table {$tld}";
						return $response;
					}

				$ar_msg[]=$msg;

				// let GC do the memory job
				//time_nanosleep(0, 100000); // 50 ms
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
				// $load_with_errors=true;
				if(SHOW_DEBUG===true) {
					$msg .= "<pre>".print_r($res3,true)."</pre>";
				}

				$response->result	= false;
				$response->msg		.= $msg;
				$response->errors[]	= "Error on import $table";
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
			#$DEDALO_PREFIX_TIPOS = (array)get_legacy_constant_value('DEDALO_PREFIX_TIPOS');
			/*
				$obj->type  = "extras_jer_file";
				$obj->table = "jer_dd";
				$obj->tld 	= $folder_name;
				$obj->name  = "jer_dd_".$folder_name.".copy";
				$obj->path  = DEDALO_EXTRAS_PATH .'/'.$folder_name.'/str_data';
			*/

			#foreach ($ar_extras_folders as $current_dir) {
			$all_str_files = backup::get_ontology_file_list();
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
					*/


				// OBJ EXTRAS
					$table		= $obj->table;
					$tld		= $obj->tld;
					$path_file	= $obj->path .'/'. $obj->name;
					$res1		= backup::copy_from_file($table, $path_file, $tld);
					if (empty($res1)) {
						$msg .= "<br>Error on import $table {$tld} . copy_from_file $path_file";
						debug_log(__METHOD__
							." $msg " . PHP_EOL
							.' res: ' . to_string($res1)
							, logger::ERROR
						);
						// $load_with_errors=true;

						$response->result	= false;
						$response->msg		.= $msg;
						$response->errors[]	= "Error on import $table {$tld}";
						return $response;
					}

					$msg .= "<br>Imported dedalo extras data";
					if(SHOW_DEBUG===true) {
						$msg .= " ($table {$tld} [<b>".trim($res1)."</b>])";
						$msg .= "<br> -> $path_file ";
					}
					$ar_msg[]=$msg;

				// let GC do the memory job
				//time_nanosleep(0, 100000); // 50 ms
			}//end foreach

		#
		# SEQUENCES UPDATE
		# Is necessary for maintain data integrity across exports
			$msg = "<b>Update dedalo core data sequences</b>";
			# SEQUENCE UPDATE (to the last table id)
				$table 	 ='jer_dd';
				$consolidate_sequence = (object)self::consolidate_sequence($table);
				if ($consolidate_sequence->result===false) {
					$response->result	= false;
					$response->msg		.= $consolidate_sequence->msg;
					$response->errors[]	= "Error consolidating sequences ($table): " . ($consolidate_sequence->msg ?? '');
					return $response;
				}else{
					$msg .= $consolidate_sequence->msg;
				}
			$ar_msg[]=$msg;


		$response->result	= true;
		$response->msg		.= implode('<hr>', $ar_msg);


		return (object)$response;
	}//end save_dedalo_str_tables_data



	/**
	* CONSOLIDATE_SEQUENCE
	* Set sequence value as last table id row
	* @return array $ar_response
	*/
	public static function consolidate_sequence(string $table) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		$msg='';

		# SEQUENCE UPDATE (to the last table id)
		$strQuery	= 'SELECT id FROM "'.$table.'" ORDER BY "id" DESC LIMIT 1';	// get last id
		$result		= pg_query(DBi::_getConnection(), $strQuery);
		$row		= pg_fetch_row($result);
		$last_id	= (int)$row[0];
		#$strQuery = 'ALTER SEQUENCE '.$table.'_id_seq RESTART WITH '.$last_id.';';	// get last id
		$sequence_name	= $table.'_id_seq';
		$strQuery		= "SELECT setval('$sequence_name', $last_id, true);";

		$result   = pg_query(DBi::_getConnection(), $strQuery);
			if ($result) {
				$msg .= "<br>Consolidated {$sequence_name} in $table";
				if(SHOW_DEBUG===true) {
					$msg .= " with value $last_id <br> -> [$strQuery]";
				}
				$response->result	= true;
				$response->msg		= $msg;
			}else{
				$response->result	= false;
				$response->msg		= "Error on consolidate sequence: $sequence_name - table: $table";
			}

		return (object)$response;
	}//end consolidate_sequence



	/**
	* DB_SYSTEM_CONFIG_VERIFY
	* Check current database status to properly configuration
	* Test pgpass file existence and permissions
	* If pgpass if not correctly configured, die current script showing a error
	*/
		// public static function db_system_config_verify() {

		// 	$response = new stdClass();
		// 		$response->result 	= true;
		// 		$response->msg 		= 'Error. Request failed '.__METHOD__;

		// 	#
		// 	# PGPASS VERIFY
		// 	$processUser = posix_getpwuid(posix_geteuid());
		// 	$base_dir 	 = $processUser['dir'];
		// 	$file 		 = $base_dir.'/.pgpass';

		// 	# File test
		// 	if (!file_exists($file)) {
		// 		$response->msg 		= 'Error. Database system configuration not allow import (1). pgpass not found '.__METHOD__;
		// 		$response->result 	= false;
		// 	}

		// 	# File permissions
		// 	$perms = decoct(fileperms($file) & 0777);
		// 	if ($perms!='600') {
		// 		$response->msg 		= 'Error. Database system configuration not allow import (2). pgpass invalid permissions '.__METHOD__;
		// 		$response->result 	= false;
		// 	}


		// 	return (object)$response;
		// }//end db_system_config_verify



	/**
	* DB_SYSTEM_CONFIG_VERIFY
	* Check current database status to properly configuration
	* Test pgpass file existence and permissions
	* If pgpass if not correctly configured, die current script showing a error
	*/
	public static function db_system_config_verify() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// user base dir
			try {

				#$processUser	= posix_getpwuid(posix_geteuid());
				#$base_dir		= $processUser['dir'];
				$base_dir		= getenv("HOME");
				$file			= $base_dir.'/.pgpass';

			}catch(Exception $e) {
				debug_log(__METHOD__
					."  ".$e->getMessage()
					, logger::ERROR
				);
			}

		#
		# PGPASS VERIFY
		if (isset($file)) {

			$response->result 	= true;

			# File test
			if (!file_exists($file)) {
				$response->msg 		= 'Error. Database system configuration not allow import (1). pgpass not found '.__METHOD__;
				$response->result 	= false;
			}

			# File permissions
			$perms = decoct(fileperms($file) & 0777);
			if ($perms!='600') {
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
	* GET_ONTOLOGY_FILE_LIST
	* Calculate the list of files needed to update the Ontology
	* using main files and main tld plus the given $ar_tld
	* If no value if provided, the whole DEDALO_PREFIX_TIPOS will be used
	* @param array|null $ar_tld = null
	* @return array $ar_files
	*	Array of objects
	*/
	public static function get_ontology_file_list( ?array $ar_tld=null ) : array {

		// cache results
			static $ar_files;
			if (isset($ar_files)) {
				debug_log(__METHOD__
					." Returning previous calculated values "
					, logger::DEBUG
				);
				return $ar_files;
			}

		// safe ar_tld format as ['dd','rsc','hierarchy','oh','ich','test']
			if (empty($ar_tld)) {
				$ar_tld = (array)get_legacy_constant_value('DEDALO_PREFIX_TIPOS');
			}

		// files to download
			$ar_files = [];

		// BASE - Files

			// Always includes main files
			// dedalo_development_str
			$obj = new stdClass();
				$obj->type = 'main_file';
				$obj->name = 'dedalo_development_str.custom.backup';
				$obj->path = DEDALO_BACKUP_PATH_ONTOLOGY;
			$ar_files[] = $obj;

			// core str file
			// jer_dd_dd
			$obj = new stdClass();
				$obj->type = 'jer_file';
				$obj->name = 'jer_dd_dd.copy';
				$obj->path = DEDALO_BACKUP_PATH_ONTOLOGY . '/str_data';
			$ar_files[] = $obj;

			// resources str file
			// jer_dd_rsc
			$obj = new stdClass();
				$obj->type = 'jer_file';
				$obj->name = 'jer_dd_rsc.copy';
				$obj->path = DEDALO_BACKUP_PATH_ONTOLOGY . '/str_data';
			$ar_files[] = $obj;

			// private list of values
			// matrix_dd
			$obj = new stdClass();
				$obj->type  = 'matrix_dd_file';
				$obj->name  = 'matrix_dd.copy';
				$obj->table = 'matrix_dd';
				$obj->tld 	= 'dd';
				$obj->path  = DEDALO_BACKUP_PATH_ONTOLOGY . '/str_data';
			$ar_files[] = $obj;

		// EXTRAS - Files

		// Check extras folder coherence with config ar_tld
			foreach ($ar_tld as $current_tld) {
				$folder_path	= DEDALO_EXTRAS_PATH .'/'. $current_tld;
				$dir_ready		= create_directory($folder_path);
				if( !$dir_ready ) {
					return false;
				}
			}

		// Get extras folders array list filtering existing directories
			$all_extras_folders	= (array)glob(DEDALO_EXTRAS_PATH . '/*', GLOB_ONLYDIR);
			$extras_folders		= [];
			foreach ($all_extras_folders as $current_dir) {
				$base_dir = basename($current_dir);
				// ar_tld : config tipos verify. 'tipos' not defined in config, will be ignored
				if (!in_array($base_dir, $ar_tld)) {
					continue; // Filter load prefix from config 'ar_tld'
				}
				$extras_folders[] = $base_dir;
			}

		// add every TLD to ar_files list (jer_dd parts)
			foreach ($extras_folders as $folder_name) {
				// jer_dd
				$obj = new stdClass();
					$obj->type  = 'extras_jer_file';
					$obj->table = 'jer_dd';
					$obj->tld 	= $folder_name;
					$obj->name  = 'jer_dd_' . $folder_name . '.copy';
					$obj->path  = DEDALO_EXTRAS_PATH .'/'. $folder_name . '/str_data';
				$ar_files[] = $obj;
			}


		return $ar_files;
	}//end get_ontology_file_list



	/**
	* DOWNLOAD_ONTOLOGY_FILES
	* Make a HTTP request to server (local or remote) to retrieve the necessary files to updates structure
	* @param array $ontology_file_list
	* 	Array of objects as
	* 	[{
	* 		type: jer_file,
	* 		name: jer_dd_dd.copy
	* 		path: DEDALO_EXTRAS_PATH/ontology/str_data
	* 	},..]
	* @return object $response
	*/
	public static function download_ontology_files(array $ontology_file_list) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		$download_files = [];

		$target_dir = ONTOLOGY_DOWNLOAD_DIR;
		foreach ($ontology_file_list as $obj) {
			// Overwrite path to new downloaded files
			$obj->path = $target_dir;
			// direct download
			$download_remote_response = backup::download_remote_structure_file($obj, $target_dir);
			$downloaded = $download_remote_response->result;
			if ($downloaded===true) {
				$download_files[] = $obj;
			}else{
				$response->errors[] = 'Download file failed: ' . $obj->name;
				foreach ($download_remote_response->errors as $current_error) {
					$response->errors[] = $current_error;
				}
			}
		}

		$response->result	= $download_files;
		$response->msg		= count($response->errors)>0
			? 'Warning: errors found'
			: 'OK. Request done successfully';


		return $response;
	}//end download_ontology_files



	/**
	* DOWNLOAD_REMOTE_STRUCTURE_FILE
	* Call master server to get the desired file using a CURL request
	* If received code is not 200, return false as response result
	* @param object $obj
	* {
	*	 "type": "matrix_dd_file",
	*	 "name": "matrix_dd.copy",
	*	 "table": "matrix_dd",
	*	 "tld": "dd",
	*	 "path": "/local_path/dedalo/install/import/ontology"
	* }
	* @param string $target_dir
	* @return object $response
	* {
	* 	result: bool
	* 	msg: string
	* 	errors: array
	* }
	*/
	public static function download_remote_structure_file( object $obj, string $target_dir ) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// curl request
			$data = (object)[
				'code'				=> STRUCTURE_SERVER_CODE,
				'type'				=> $obj->type,
				'name'				=> $obj->name,
				'dedalo_version'	=> DEDALO_VERSION
			];
			$data_string = "data=" . json_encode($data);
			// request
			$curl_response = curl_request((object)[
				'url'				=> STRUCTURE_SERVER_URL .'?' .$data_string,
				'post'				=> true,
				'header'			=> false, // bool add header to result
				'ssl_verifypeer'	=> false,
				'timeout'			=> (60*10), // int seconds
				'proxy'				=> (defined('SERVER_PROXY') && !empty(SERVER_PROXY))
					? SERVER_PROXY // from Dédalo config file
					: false // default case
			]);
			$data = $curl_response->result;

		// errors
			// sample of failed download
			// {
			// 	"result": "",
			// 	"msg": "Error. Bad Request. Server has problems connecting to file (status code: 400)",
			// 	"error": false,
			// 	"code": 400
			// }
			if ($curl_response->code!=200) {
				// error connecting to master server
				// Do not add debug error here because it is already handled by curl_request
				$response->errors[] = 'bad server response code: ' . $curl_response->code . ' (' .$curl_response->msg.')' ;
				$response->msg .= ' Code is not as expected (200). Response code: ' . to_string($curl_response->code);
				return $response;
			}
			if (empty($data)) {
				// received data is empty (possibly a master server problem dealing with the request)
				debug_log(__METHOD__
					. " Empty result from download ontology file request " . PHP_EOL
					. ' response: ' .to_string($curl_response) . PHP_EOL
					. ' obj param: ' . to_string($obj)
					, logger::ERROR
				);
				$response->errors[] = 'empty data';
				$response->msg .= ' Empty result from download ontology file request';
				return $response;
			}

		// debug
			debug_log(__METHOD__
				. " >>> Downloaded remote data from $obj->name - "
				. 'result type: ' . gettype($data) . ' - '
				. exec_time_unit($start_time,'ms').' ms'
				, logger::DEBUG
			);

		// Create downloads folder if not exists
			if (self::$checked_download_str_dir!==true) {
				$folder_path = ONTOLOGY_DOWNLOAD_DIR;
				if( !is_dir($folder_path) ) {
					if(!mkdir($folder_path, 0700,true)) {
						debug_log(__METHOD__." Error on read or create backup ONTOLOGY_DOWNLOAD_DIR directory. Permission denied ".to_string(), logger::ERROR);
						return false;
					}
					debug_log(__METHOD__
						." CREATED DIR: $folder_path "
						, logger::DEBUG
					);
				}
				self::$checked_download_str_dir = true;
			}

		# Delete previous version file if exists
		if (file_exists($target_dir .'/'. $obj->name)) {
			unlink($target_dir .'/'. $obj->name);
		}

		// Write downloaded file to local directory
		$write = file_put_contents($target_dir .'/'. $obj->name, $data);
		if ($write===false) {
			debug_log(__METHOD__
				. " Error writing downloaded ontology file " . PHP_EOL
				. ' path: ' .to_string($target_dir .'/'. $obj->name) . PHP_EOL
				. ' obj param: ' . to_string($obj)
				, logger::ERROR
			);
			$response->errors[] = 'file writing fails';
			$response->msg .= ' Error writing downloaded ontology file '.$obj->name;
			return $response;
		}

		// response
		$response->result = true;
		$response->msg .= ' OK. Request done successfully for file ' . $obj->name;


		return $response;
	}//end download_remote_structure_file



	/**
	* CHECK_REMOTE_SERVER
	* Exec a curl request wit given data to check current server status
	* @return object $response
	*/
	public static function check_remote_server() : object {

		// data
			$data = array(
				'code'				=> STRUCTURE_SERVER_CODE,
				'check_connection'	=> true,
				'dedalo_version'	=> DEDALO_VERSION
			);
			$data_string = 'data=' . json_encode($data);

		// curl_request
			$response = curl_request((object)[
				'url'				=> STRUCTURE_SERVER_URL,
				'post'				=> true,
				'postfields'		=> $data_string,
				'returntransfer'	=> 1,
				'followlocation'	=> true,
				'header'			=> true,
				'ssl_verifypeer'	=> false,
				'timeout'			=> 5, // seconds
				'proxy'				=> (defined('SERVER_PROXY') && !empty(SERVER_PROXY))
					? SERVER_PROXY // from Dédalo config file
					: false // default case
			]);


		return $response;
	}//end check_remote_server



	/**
	* OPTIMIZE_TABLES
	* Exec VACUUM ANALYZE command on every received table
	* @param array $tables
	* @return string|bool|null $res
	*/
	public static function optimize_tables(array $tables) {

		// command_base
			$command_base = DB_BIN_PATH . 'psql ' . DEDALO_DATABASE_CONN . ' ' . DBi::get_connection_string();

		// re-index
			$index_commands = [];
			foreach ($tables as $current_table) {

				if (!DBi::check_table_exists($current_table)) {
					debug_log(__METHOD__
						. " Ignored non existing table " . PHP_EOL
						. ' table: ' . to_string($current_table)
						, logger::ERROR
					);
					continue;
				}

				$index_commands[] = 'REINDEX TABLE "'.$current_table.'"';
			}

			if (empty($index_commands)) {
				return false;
			}

			$command = $command_base . ' -c \''.implode('; ', $index_commands).';\'';
			// exec command
				$res = shell_exec($command);
			// debug
				debug_log(__METHOD__
					. ' result: ' . to_string($res) . PHP_EOL
					. ' command: ' . to_string($command)
					, logger::WARNING
				);

		// VACUUM
			// safe tables only
			$tables = array_filter($tables, 'DBi::check_table_exists');
			$command = $command_base . ' -c \'VACUUM ' . implode(', ', $tables) .';\'';
			// exec command
				$res = shell_exec($command);
			// debug
				debug_log(__METHOD__
					. ' result ' . to_string($res) . PHP_EOL
					. ' command: ' . to_string($command)
					, logger::WARNING
				);


		return $res;
	}//end optimize_tables



	/**
	* STRUCTURE_TO_JSON
	* Creates a compatible JSON data from table 'jer_dd'
	* using the given array of tld
	* @param array $ar_tld
	*	array of strings like ['dd','rsc'...]
	* @return array $ar_data
	* 	array of every row with properties and term JSON decoded
	*/
	public static function structure_to_json(array $ar_tld) : array {

		$ar_data = [];
		foreach ($ar_tld as $tld) {

			$tld = trim($tld);

			// check valid tld
				// if(!preg_match('/^[a-z]{2,}(_[a-z]{2,})?$/', $tld)) {
				if ( !safe_tld($tld) ) {
					throw new Exception("Error Processing Request. Error on structure_to_json. Invalid tld ".to_string($tld), 1);
				}

			// search in DDB every tld record
				$jer_dd_tld_data = backup::get_jer_dd_tld_data($tld);

			// add all rows to ar_data container
				foreach ($jer_dd_tld_data as $row) {
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
	public static function get_jer_dd_tld_data(string $tld) : array {

		$tld_data = [];

		// $columns	= '"terminoID", "parent", "modelo", "esmodelo", "esdescriptor", "visible", "norden", "tld", "traducible", "relaciones", "propiedades", "properties","term';
		$columns	= self::$jer_dd_columns;
		$strQuery	= 'SELECT '.$columns.' FROM "jer_dd" WHERE tld = \''.$tld.'\' ORDER BY "terminoID" ASC';
		$result		= JSON_RecordObj_matrix::search_free($strQuery);
		while ($row = pg_fetch_object($result)) {

			// decode JSON properties
				if (!empty($row->properties)) {
					$row->properties = json_decode($row->properties);
				}

			// term
				if (isset($row->term)) {
					$row->term = json_decode($row->term);
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
	* IMPORT_STRUCTURE_JSON_DATA
	* Insert data terms into tables 'jer_dd' deleting previous row if exists
	* @param array $data
	*  data is a vertical array of objects from parsed JSON file 'structure.json'
	* @return object $response
	*/
	public static function import_structure_json_data(array $data, array $ar_tld=[]) : object {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		// conn . get db connection
		$conn = DBi::_getConnection();

		$updated_tipo = [];

		// iterate all objects and replace existing data in each table (jer_dd)
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
				$term			= !empty($item->term) ? json_encode($item->term) : null; // jsonb

			// tld filter optional from $ar_tld param
				if (!empty($ar_tld) && !in_array($tld, $ar_tld)) {
					continue;
				}

			// jer_dd
				// delete previous
					$strQuery = 'DELETE FROM "jer_dd" WHERE "terminoID" = \''.$terminoID.'\' ;';
					if (!pg_query($conn, $strQuery)) {
						throw new Exception("Error Processing Request. Error on delete term ".to_string($terminoID), 1);
					}
				// insert new
					// $fields	= '"terminoID", "parent", "modelo", "esmodelo", "esdescriptor", "visible", "norden", "tld", "traducible", "relaciones", "propiedades", "properties", "term';
					$fields		= self::$jer_dd_columns;
					$strQuery	= 'INSERT INTO "jer_dd" ('.$fields.') VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)';
					if (!pg_query_params($conn, $strQuery, [$terminoID, $parent, $modelo, $esmodelo, $esdescriptor, $visible, $norden, $tld, $traducible, $relaciones, $propiedades, $properties, $term])) {
						throw new Exception("Error Processing Request. Error on import_structure_json_data (1) Invalid jer_dd query ".to_string($strQuery), 1);
					}

			// add term as updated
				$updated_tipo[] = $terminoID;

			// debug
			debug_log(__METHOD__." + Updated structure item '$terminoID' ".to_string(), logger::DEBUG);
		}

		$response->result	= true;
		$response->msg		= 'OK. Request done. Updated '.count($updated_tipo) .' from file data total '. count($data).' structure terms from tld: '. implode(', ',$ar_tld);


		return $response;
	}//end import_structure_json_data



	/**
	* WRITE_LANG_FILE
	* Calculated labels for given lang and write a JS file with the result
	* @param string $lang
	* @return bool
	* 	false if write error occurred, true if all is file is written successfully
	*/
	public static function write_lang_file(string $lang) : bool {

		// all labels
		$ar_label = label::get_ar_label($lang, false);
		if (empty($ar_label)) {
			debug_log(__METHOD__
				. " Error on get labels for lang: $lang" . PHP_EOL
				. ' The file will be created empty'
				, logger::ERROR
			);
			$ar_label = (object)[
				'label_warning' => 'You see this data because the labels are empty! '.$lang
			];
		}

		// file path
		$file_path = DEDALO_CORE_PATH . '/common/js/lang/' . $lang . '.js';

		// content
		$content = json_encode($ar_label, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

		$write = file_put_contents(
			$file_path,
			$content
		);
		if ($write===false) {
			debug_log(__METHOD__
				. ' Error on write js/lang file. Permission denied.' . PHP_EOL
				. " lang: $lang - $file_path " .PHP_EOL
				, logger::ERROR
			);

			return false;
		}

		// remove lang cache
		$cache_file_name = label::build_cache_file_name($lang);
		dd_cache::delete_cache_files([
			$cache_file_name
		]);

		debug_log(__METHOD__
			. " Generated js labels file for lang: $lang - $file_path " .PHP_EOL
			. ' File size: ' .format_size_units( filesize($file_path) )
			, logger::DEBUG
		);

		return true;
	}//end write_lang_file



	/**
	* MAKE_MYSQL_BACKUP
	* @return object $response
	* {
	* 	result: array|bool [result: true, msg: Backup done web_my_ddbb,..]
	* 	msg: string
	* }
	*/
	public static function make_mysql_backup() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= '';

		// databases
			$ar_database_name = [];
			$api_publication_code = defined('API_WEB_USER_CODE_MULTIPLE')
				? API_WEB_USER_CODE_MULTIPLE
				: [];
			foreach ($api_publication_code as $value) {
				if (!empty($value['db_name'])) {
					$ar_database_name[] = $value['db_name'];
				}
			}

			$response->result = [];
			foreach ($ar_database_name as $database_name) {

				$backup = diffusion_mysql::backup_database($database_name);

				$response->result[] = $backup;
			}
			$response->msg = 'Backup done for databases: ' . implode(', ', $ar_database_name);


		return $response;
	}//end make_mysql_backup



	/**
	* GET_MYSQL_BACKUP_FILES
	* Read MYSQL backup directory and get all SQL files name
	* @return array $ar_files
	*/
	public static function get_mysql_backup_files() : array {

		$folder_path = DEDALO_BACKUP_PATH . '/mysql';

		// bk_files read backup directory
		$ar_bk_files = (array)glob($folder_path . '/*');
		// sort by name descendant
		$ar_bk_files = array_reverse($ar_bk_files);

		$ar_files = [];
		foreach ($ar_bk_files as $current_file) {

			$path_info = pathinfo($current_file);

			// only 'sql' extension is allowed
			$extension = $path_info['extension'] ?? null;
			if ($extension!=='sql') {
				// ignore it
				continue;
			}

			$name	= $path_info['basename'];
			$size	= filesize($current_file);

			$item = (object)[
				'name'	=> $name,
				'size'	=> format_size_units($size)
			];


			$ar_files[] = $item;
		}


		return $ar_files;
	}//end get_mysql_backup_files



	/**
	* GET_BACKUP_FILES
	* Read Dédalo PostgreSQL backup directory and get all files name
	* @return array $ar_files
	*/
	public static function get_backup_files() : array {

		$folder_path = DEDALO_BACKUP_PATH . '/db';

		// bk_files read backup directory
		$ar_bk_files = (array)glob($folder_path . '/*');
		// sort by name descendant
		$ar_bk_files = array_reverse($ar_bk_files);

		$ar_files = [];
		foreach ($ar_bk_files as $current_file) {

			$path_info = pathinfo($current_file);

			// only 'backup' extension is allowed
			$extension = $path_info['extension'] ?? null;
			if ($extension!=='backup') {
				// ignore it
				continue;
			}

			$name	= $path_info['basename'];
			$size	= filesize($current_file);

			$item = (object)[
				'name'	=> $name,
				'size'	=> format_size_units($size)
			];


			$ar_files[] = $item;
		}


		return $ar_files;
	}//end get_backup_files



}//end class backup
