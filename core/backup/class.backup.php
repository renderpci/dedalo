<?php
declare(strict_types=1); // NOT IN UNIT TEST !
/**
* CLASS BACKUP
*
*/
abstract class backup {



	// Columns to save (used by copy command, etc.)
	// Do not use id column NEVER here
	public static $jer_dd_columns			= '"terminoID", parent, modelo, esmodelo, esdescriptor, visible, norden, tld, traducible, relaciones, propiedades, properties';
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
	public static function copy_to_file(string $table, string $path_file, ?string $tld= null) : string {

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
			// $port_command = !empty(DEDALO_DB_PORT_CONN) ? (' -p '.DEDALO_DB_PORT_CONN) : '';
			// $command_base = DB_BIN_PATH.'psql '.DEDALO_DATABASE_CONN." -U ".DEDALO_USERNAME_CONN . $port_command . ' -h '.DEDALO_HOSTNAME_CONN;
			$command_base = DB_BIN_PATH.'psql ' . DEDALO_DATABASE_CONN .' '. DBi::get_connection_string();
			switch ($table) {

				case 'jer_dd':
					// $command = $command_base . " -c \"\copy (SELECT ".addslashes(backup::$jer_dd_columns)." FROM jer_dd WHERE ". '\"terminoID\"' ." LIKE '{$tld}%') TO '{$path_file}' \" " ;
				$command = $command_base . " -c \"\copy (SELECT ".addslashes(backup::$jer_dd_columns)." FROM jer_dd WHERE tld = '{$tld}') TO '{$path_file}' \" " ;
					break;

				case 'matrix_descriptors_dd':
					// $command = $command_base . " -c \"\copy (SELECT ".addslashes(backup::$descriptors_dd_columns)." FROM \"matrix_descriptors_dd\" WHERE parent LIKE '{$tld}%') TO '{$path_file}' \" ";
					$command = $command_base . " -c \"\copy (SELECT ".addslashes(backup::$descriptors_dd_columns)." FROM \"matrix_descriptors_dd\" WHERE parent SIMILAR TO '{$tld}[0-9]+') TO '{$path_file}' \" ";
					break;

				case 'matrix_dd':
					$command = $command_base . " -c \"\copy (SELECT * FROM \"$table\") TO '{$path_file}' \" ";
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
	* @param string $tld = null
	*
	* @return string $res
	*/
	public static function copy_from_file(string $table, string $path_file, string $tld=null) : string {

		$res='';

		if (!file_exists($path_file)) {
			// throw new Exception("Error Processing Request. File $path_file not found", 1);
			debug_log(__METHOD__
				. " Error Processing Request. File not found " . PHP_EOL
				. ' path_file: ' . to_string($path_file)
				, logger::ERROR
			);
			return '';
		}

		$command_history = array();

		// $port_command = !empty(DEDALO_DB_PORT_CONN) ? (' -p '.DEDALO_DB_PORT_CONN) : '';
		// $command_base = DB_BIN_PATH.'psql '.DEDALO_DATABASE_CONN.' -U '.DEDALO_USERNAME_CONN .' -h '.DEDALO_HOSTNAME_CONN . $port_command;
		$command_base = DB_BIN_PATH . 'psql ' . DEDALO_DATABASE_CONN . ' ' . DBi::get_connection_string();

		switch ($table) {

			case 'jer_dd':
				# DELETE . Remove previous records
				// $command = $command_base . " -c \"DELETE FROM \"jer_dd\" WHERE ".'\"terminoID\"'." LIKE '{$tld}%'\" "; # -c "DELETE FROM \"jer_dd\" WHERE \"terminoID\" LIKE 'dd%'"
				$command = $command_base . " -c \"DELETE FROM \"jer_dd\" WHERE ".'\"tld\"'." = '$tld' ;\" ";
				$res .= shell_exec($command);
				#$res .= exec( $command );
				$command_history[] = $command;

				# COPY . Load data from file
				$command = $command_base . " -c \"\copy jer_dd(".addslashes(backup::$jer_dd_columns).") from {$path_file}\" ";
				$res .= shell_exec($command);
				#$res .= exec( $command );
				$command_history[] = $command;
				break;

			case 'matrix_descriptors_dd':
				# DELETE . Remove previous records
				// $command = $command_base . " -c \"DELETE FROM \"matrix_descriptors_dd\" WHERE parent LIKE '{$tld}%'\" "; # -c "DELETE FROM \"jer_dd\" WHERE \"terminoID\" LIKE 'dd%'"
				$command = $command_base . " -c \"DELETE FROM \"matrix_descriptors_dd\" WHERE parent SIMILAR TO '{$tld}[0-9]+' ;\" ";
				$res .= shell_exec($command);
				#$res .= exec( $command );
				$command_history[] = $command;

				# COPY . Load data from file
				$command = $command_base . " -c \"\copy matrix_descriptors_dd(".addslashes(backup::$descriptors_dd_columns).") from {$path_file}\" ";
				$res .= shell_exec($command);
				#$res .= exec( $command );
				$command_history[] = $command;
				break;

			case 'matrix_dd':
				# DELETE . Remove previous records
				#$strQuery = "DELETE FROM \"matrix_descriptors_dd\" WHERE \"parent\" LIKE '{$tld}%';"; #pg_query(DBi::_getConnection(), $strQuery);
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
	* By default, jer_dd and matrix_descriptors_dd (and sequences) are excluded because they are saved as independent tld files
	* When export structure is done, two versions are created: full and partial. Full contain all tld and sequences of dedalo *_dd tables
	* and partial the same except jer_dd and matrix_descriptors_dd
	* @see trigger.db_utils
	* @param string $db_name like 'dedalo4_development_str.custom'. If null, default is used
	* @param bool $exclude_tables default true
	* @return string $res_html table of results
	*/
	public static function export_structure(string $db_name=null, bool $exclude_tables=true) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__METHOD__.']';

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
				return $response;
			}

		// db_name
			if (empty($db_name)) {
				$db_name = 'dedalo4_development_str.custom';
			}

		$file_path		 = rtrim(DEDALO_BACKUP_PATH_ONTOLOGY, '/');
		$mysqlExportPath = $file_path .'/'. $db_name . ".backup";

		# Export the database and output the status to the page
		# '-F c' Output compressed custom format (p = plain, c = custom, d = directory, t = tar)
		# '-b' include blobs
		# '-v' verbose mode
		# '-t "*_dd"' tables wildcard. dump only tables ended with '_dd'
		# -T "jer_dd*" -T "matrix_descriptors_dd*"  exclude tables
		$command  = '';
		// $port_command = !empty(DEDALO_DB_PORT_CONN) ? (' -p '.DEDALO_DB_PORT_CONN) : '';
		// $command .= DB_BIN_PATH.'pg_dump -h '.DEDALO_HOSTNAME_CONN . $port_command . ' -U "'.DEDALO_USERNAME_CONN.'" ';
		$command .= DB_BIN_PATH . 'pg_dump ' . DBi::get_connection_string();
		$command .= ' --no-owner --no-privileges';
		if ($exclude_tables===true) {
		$command .= ' -T "jer_dd*" -T "matrix_descriptors_dd*"';	// Exclude tables (AND respective sequences) ( T UPERCASE )
		}
		$command .= ' -F c -t "*_dd" -t "*dd_id_seq"';				// Include tables ( t lowercase ) -t "*_dd" -t "*dd_id_seq"
		$command .= ' ' . DEDALO_DATABASE_CONN.' > "'.$mysqlExportPath .'"';
		// -T "jer_dd" -T "matrix_descriptors_dd"

		# LOW PRIORITY ( nice , at 22:56 , etc)
		#$command = " nice ".$command ;
		#debug_log(__METHOD__." command  ".to_string($command), logger::DEBUG);

		exec($command.' 2>&1', $output, $worked_result);
			#debug_log(__METHOD__." command ".to_string($output)." - ".to_string($worked_result), logger::DEBUG);

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
		# Save partials str data based on tld to independent files
		if ($db_name==='dedalo4_development_str.custom' && $response->result===true) {
			$res_dedalo_str_tables_data = self::save_dedalo_str_tables_data();
			$response->msg .= $res_dedalo_str_tables_data->msg;
			if ($res_dedalo_str_tables_data->result===false) {
				$response->result = false;
			}
		}


		return (object)$response;
	}//end export_structure



	/**
	* SAVE_DEDALO_STR_TABLES_DATA
	* Select tlds from table 'main_dd' and iterate saving one file for tld
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
		# Get all main tlds like dd,oh,ich,rsc,et..
		$strQuery = "SELECT tld FROM \"main_dd\" ORDER BY \"tld\" ";
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);
		$ar_msg = array();
		while ($rows = pg_fetch_assoc($result)) {

			$current_tld = $rows['tld'];
			#if ($current_tld!='dd') continue;
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

			#
			# MATRIX_DESCRIPTORS_DD
				$table 		= 'matrix_descriptors_dd';
				$tld 		= $current_tld;
				$path_file 	= "{$path}/{$table}_{$tld}.copy";
				$res2 		= backup::copy_to_file($table, $path_file, $tld);

				if (empty($res2)) {
					$msg .= "Error on export $table {$tld} . Please try again";
					#print("<div class=\"error\">$msg</div>");
					debug_log(__METHOD__
						." $msg ". PHP_EOL
						.' result: ' . to_string($res2)
						, logger::ERROR
					);
					// $load_with_errors = true;
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


		# All is ok
		$response->result 	= true;
		$response->msg 		= implode('<hr>', $ar_msg);


		return (object)$response;
	}//end save_dedalo_str_tables_data



	/**
	* IMPORT_STRUCTURE
	* Exec pg_restore of selected backup file
	* @see trigger.db_utils
	* @param string db_name default 'dedalo4_development_str.custom'
	* @param bool $check_server = true
	* @param array $dedalo_prefix_tipos = null
	* @return object $response
	* {
	* 	result: bool,
	* 	msg: string,
	* 	errors: array
	* }
	*/
	public static function import_structure(string $db_name='dedalo4_development_str.custom', bool $check_server=true, array $dedalo_prefix_tipos=null) : object {

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

		// db_system_config_verify
			$system_config_verify = self::db_system_config_verify();
			if ($system_config_verify->result===false) {
				// error
				$response->msg 		.= $system_config_verify->msg;
				$response->result 	= false;
				$response->errors[]	= $system_config_verify->msg;
				return (object)$response;
			}

		// file_path
			if(defined('STRUCTURE_FROM_SERVER') && STRUCTURE_FROM_SERVER===true) {

				// Check remote server status before begins
				 // ALREADY CHECKED IN TRIGGER, AT BEGINING OF PROCESS
				// 	$remote_server_status = (int)self::check_remote_server();

				// Download once all str files from server
				$all_str_files = backup::collect_all_str_files($dedalo_prefix_tipos);
				foreach ($all_str_files as $obj) {
					if($obj->type==="main_file") {
						$file_path  = ONTOLOGY_DOWNLOAD_DIR;
						$mysqlImportFilename = $file_path .'/'. $obj->name;
						break;
					}
				}
				if (!isset($mysqlImportFilename)) {
					$response->msg .= " Error getting main_file name from all_str_files ";
					if(SHOW_DEBUG===true) {
						$response->msg .= "<pre>".print_r($all_str_files,true)."</pre>";
					}
					$response->result	= false;
					$response->errors[]	= "Error getting main_file name from all_str_files ";
					return (object)$response;
				}
			}else{
				# Default path
				$file_path = rtrim(DEDALO_BACKUP_PATH_ONTOLOGY, '/');
				$mysqlImportFilename = $file_path .'/'. $db_name . ".backup";
			}

		if (!file_exists($mysqlImportFilename)) {
			$response->msg 		.= "Error: source file not found : $mysqlImportFilename";
			$response->result 	= false;
			$response->errors[]	= "Error: source file not found : $mysqlImportFilename";
			return (object)$response;
		}

		// Import the database and output the status to the page
		// $port_command = !empty(DEDALO_DB_PORT_CONN) ? (' -p '.DEDALO_DB_PORT_CONN) : '';
		// $command  = DB_BIN_PATH.'pg_restore -h '.DEDALO_HOSTNAME_CONN . $port_command . ' -U "'.DEDALO_USERNAME_CONN.'" --dbname '.DEDALO_DATABASE_CONN.' ';
		$command  = DB_BIN_PATH.'pg_restore ' . DBi::get_connection_string() . ' --dbname '.DEDALO_DATABASE_CONN;
		$command .= ' --no-password --clean --no-owner --no-privileges -v "'.$mysqlImportFilename.'"';

		# LOW PRIORITY ( nice , at 22:56 , etc)
		#$command = "nice ".$command ;

		#exec($command,$output,$worked);
		exec($command.' 2>&1', $output, $worked_result);
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
						$response->errors[]	= 'Error during load_dedalo_str_tables_data_from_files: ';
						foreach ($res_str_tables_data_from_files->errors as $current_error) {
							$response->errors[]	= $current_error;
						}
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
				$res_html .= 'There was an error during import (pg_restore). Please make sure the import file is saved in the same folder as this script and check your values:<br/><br/>';
				$res_html .= 'worked_result: ' . to_string($worked_result) .'<hr>';
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
				$response->errors[]	= 'Error during import (pg_restore)';
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
				$response->errors[]	= 'Error during command execution. code: ' . $worked_result;
				return (object)$response;
		}

		if ($response->result===false) {
			$response->msg		= 'Error. Request failed '.__METHOD__ ." <br> ".$response->msg;
			$response->errors[]	= $response->msg;
		}


		return (object)$response;
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

				#
				# MATRIX_DESCRIPTORS_DD
					$table 		= 'matrix_descriptors_dd';
					$tld 		= $current_tld;
					$path_file 	= $path.'/'.$table .'_'.$tld.'.copy';
					$res2 		= backup::copy_from_file($table, $path_file, $tld);
					if (empty($res2)) {
						$msg .= "<br>Error on import $table {$tld} copy_from_file $path_file.";
						debug_log(__METHOD__." $msg ".to_string($res2), logger::ERROR);
						// $load_with_errors=true;
						if(SHOW_DEBUG===true) {
							$msg .= "<pre>".print_r($res2,true)."</pre>";
						}

						$response->result	= false;
						$response->msg		.= $msg;
						$response->errors[]	= "Error on import $table {$tld}";
						return $response;
					}
					if(SHOW_DEBUG===true) {
						$msg .= "<br>Imported dedalo core data";
						$msg .= " (jer_dd {$tld} [<b>".trim($res1)."</b>], matrix_descriptors_dd {$tld} [<b>".trim($res2)."</b>]) ";
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

			# SEQUENCE UPDATE (to the last table id)
				$table = 'matrix_descriptors_dd';
				$consolidate_sequence = (object)self::consolidate_sequence($table);
				if ($consolidate_sequence->result===false) {
					$response->result 	 = false;
					$response->msg 		.= $consolidate_sequence->msg;
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
	* COLLECT_ALL_STR_FILES
	* Make a HTTP request to server to retrieve the necessary files to updates structure
	* @return array $ar_files
	*	Array of objects
	*/
	public static function collect_all_str_files(array $DEDALO_PREFIX_TIPOS=null) : array {

		static $ar_files;

		if (isset($ar_files)) {
			debug_log(__METHOD__
				." Returning previous calculated values "
				, logger::DEBUG
			);
			return $ar_files;
		}

		$DEDALO_PREFIX_TIPOS = $DEDALO_PREFIX_TIPOS ?? (array)get_legacy_constant_value('DEDALO_PREFIX_TIPOS');

		$ar_files = array();

		$remote = (defined('STRUCTURE_FROM_SERVER') && STRUCTURE_FROM_SERVER===true) ? true : false;

		# basic str file. dedalo4_development_str.custom.backup
		# includes main_dd (main tld and counters), matrix_dd (private lists), matrix_counter_dd (private_ñist counters), matrix_layout_dd (private layout maps list)
		$obj = new stdClass();
			$obj->type = "main_file";
			$obj->name = "dedalo4_development_str.custom.backup";
			$obj->path = DEDALO_BACKUP_PATH_ONTOLOGY;
		$ar_files[] = $obj;

		# core str file
		$obj = new stdClass();
			$obj->type = "jer_file";
			$obj->name = "jer_dd_dd.copy";
			$obj->path = DEDALO_BACKUP_PATH_ONTOLOGY . '/str_data';
		$ar_files[] = $obj;
		$obj = new stdClass();
			$obj->type = "descriptors_file";
			$obj->name = "matrix_descriptors_dd_dd.copy";
			$obj->path = DEDALO_BACKUP_PATH_ONTOLOGY . '/str_data';
		$ar_files[] = $obj;

		# resources str file
		$obj = new stdClass();
			$obj->type = "jer_file";
			$obj->name = "jer_dd_rsc.copy";
			$obj->path = DEDALO_BACKUP_PATH_ONTOLOGY . '/str_data';
		$ar_files[] = $obj;
		$obj = new stdClass();
			$obj->type = "descriptors_file";
			$obj->name = "matrix_descriptors_dd_rsc.copy";
			$obj->path = DEDALO_BACKUP_PATH_ONTOLOGY . '/str_data';
		$ar_files[] = $obj;

		# private list of values
		$obj = new stdClass();
			$obj->type  = "matrix_dd_file";
			$obj->name  = "matrix_dd.copy";
			$obj->table = "matrix_dd";
			$obj->tld 	= "dd";
			$obj->path  = DEDALO_BACKUP_PATH_ONTOLOGY . '/str_data';
		$ar_files[] = $obj;


		# EXTRAS

		# Check extras folder coherence with config DEDALO_PREFIX_TIPOS
		foreach ($DEDALO_PREFIX_TIPOS as $current_prefix) {
			$folder_path = DEDALO_EXTRAS_PATH .'/'. $current_prefix;
			if( !is_dir($folder_path) ) {
				if(!mkdir($folder_path, 0700,true)) {
					debug_log(__METHOD__
						." Error on read or create extras folder in extras directory. Permission denied ". PHP_EOL
						.' folder_path: ' . to_string($folder_path)
						, logger::ERROR
					);
					return false;
				}
				debug_log(__METHOD__
					." CREATED DIR: $folder_path "
					, logger::DEBUG
				);
			}
		}

		# Get extras array list
		$ar_extras_folders = (array)glob(DEDALO_EXTRAS_PATH . '/*', GLOB_ONLYDIR);
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

		// Remote case
		if ($remote===true) {
			$target_dir = ONTOLOGY_DOWNLOAD_DIR;

			foreach ($ar_files as $obj) {
				// Overwrite path to new downloaded files
				$obj->path = $target_dir;

				// direct download
					backup::download_remote_structure_file($obj, $target_dir);

				// thread . Use above Thread class @see https://www.php.net/manual/en/language.fibers.php
					// Thread::register(
					// 	$obj->name, // name
					// 	'backup::download_remote_structure_file', // 'my_thread',
					// 	[$obj, $target_dir]
					// );
			}// end foreach ($ar_files as $key => $obj)
			// Thread::run();
		}

		// debug
			$ar_files_names = array_map(function($el){
				return $el->name;
			}, $ar_files);
			debug_log(__METHOD__
				." collected ar_files: ".PHP_EOL
				.' ar_files_names: ' . json_encode($ar_files_names, JSON_PRETTY_PRINT)
				, logger::DEBUG
			);


		return (array)$ar_files;
	}//end collect_all_str_files



	/**
	* DOWNLOAD_REMOTE_STRUCTURE_FILE
	* @param object $obj
	* @param string $target_dir
	* @return bool
	*/
	public static function download_remote_structure_file(object $obj, string $target_dir) : bool {
		$start_time = start_time();

		// curl request
			$data = (object)[
				'code'				=> STRUCTURE_SERVER_CODE,
				'type'				=> $obj->type,
				'name'				=> $obj->name,
				'dedalo_version'	=> DEDALO_VERSION
			];
			$data_string = "data=" . json_encode($data);
			// request
			$response = curl_request((object)[
				'url'				=> STRUCTURE_SERVER_URL .'?' .$data_string,
				'post'				=> true,
				'header'			=> false, // bool add header to result
				'ssl_verifypeer'	=> false,
				'timeout'			=> (60*10), // int seconds
				'proxy'				=> (defined('SERVER_PROXY') && !empty(SERVER_PROXY))
					? SERVER_PROXY // from Dédalo config file
					: false // default case
			]);
			$data = $response->result;

		// errors
			// sample of failed download
			// {
			// 	"result": "",
			// 	"msg": "Error. Bad Request. Server has problems connecting to file (status code: 400)",
			// 	"error": false,
			// 	"code": 400
			// }
			if ($response->code!=200) {
				// error connecting to master server
				// Do not add debug error here because it is already handled by curl_request
				return false;
			}
			if (empty($data)) {
				// received data is empty (possibly a master server problem dealing with the request)
				debug_log(__METHOD__
					. " Empty result from download ontology file request " . PHP_EOL
					. ' response: ' .to_string($response) . PHP_EOL
					. ' obj param: ' . to_string($obj)
					, logger::ERROR
				);
				return false;
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
			return false;
		}


		return true;
	}//end download_remote_structure_file



	/**
	* CHECK_REMOTE_SERVER
	* Exec a curl request wit given data to check current server status
	* @return object $response
	*/
	public static function check_remote_server() : object {

		// data
			$data = array(
				"code"				=> STRUCTURE_SERVER_CODE,
				"check_connection"	=> true
			);
			$data_string = "data=" . json_encode($data);

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

		// $command_base = DB_BIN_PATH."psql ".DEDALO_DATABASE_CONN." -U ".DEDALO_USERNAME_CONN." -p ".DEDALO_DB_PORT_CONN." -h ".DEDALO_HOSTNAME_CONN;
		// $port_command = !empty(DEDALO_DB_PORT_CONN) ? (' -p '.DEDALO_DB_PORT_CONN) : '';
		// $command_base = DB_BIN_PATH."psql ".DEDALO_DATABASE_CONN." -U ".DEDALO_USERNAME_CONN." -h ".DEDALO_HOSTNAME_CONN . $port_command;
		$command_base = DB_BIN_PATH . 'psql ' . DEDALO_DATABASE_CONN . ' ' . DBi::get_connection_string();

		// re-index
			$index_commands = [];
			foreach ($tables as $current_table) {
				$index_commands[] = 'REINDEX TABLE "'.$current_table.'"';
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
	* Creates a compatible JSON data from table 'jer_dd' and 'matrix_descriptors_dd' using the
	* given tlds
	* @param array $ar_tld
	*	array of strings like ['dd','rsc'...]
	* @return array $ar_data
	*/
	public static function structure_to_json(array $ar_tld) : array {

		$ar_data = [];
		foreach ($ar_tld as $tld) {

			$tld = trim($tld);

			// check valid tld
				if(!preg_match('/^[a-z]{2,}(_[a-z]{2,})?$/', $tld)) {
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
	public static function get_jer_dd_tld_data(string $tld) : array {

		$tld_data = [];

		// $columns	= '"terminoID", "parent", "modelo", "esmodelo", "esdescriptor", "visible", "norden", "tld", "traducible", "relaciones", "propiedades", "properties"';
		$columns	= self::$jer_dd_columns;
		$strQuery	= 'SELECT '.$columns.' FROM "jer_dd" WHERE tld = \''.$tld.'\' ORDER BY "terminoID" ASC';
		$result		= JSON_RecordObj_matrix::search_free($strQuery);
		while ($row = pg_fetch_object($result)) {

			// decode JSON properties
				if (!empty($row->properties)) {
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
	public static function get_matrix_descriptors_tld_data(string $tld) : array {

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
	public static function import_structure_json_data(array $data, array $ar_tld=[]) : object {

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
					// $fields	= '"terminoID", "parent", "modelo", "esmodelo", "esdescriptor", "visible", "norden", "tld", "traducible", "relaciones", "propiedades", "properties"';
					$fields		= self::$jer_dd_columns;
					$strQuery	= 'INSERT INTO "jer_dd" ('.$fields.') VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)';
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
						// $values = '\''.$terminoID.'\', \''. pg_escape_string($descriptor_item->value).'\', \''.$descriptor_item->type.'\', \''.$descriptor_item->lang.'\'';
						// $strQuery .= PHP_EOL . 'INSERT INTO "matrix_descriptors_dd" ('.$fields.') VALUES '. PHP_EOL. '('.$values.');'.PHP_EOL;
						$strQuery = 'INSERT INTO "matrix_descriptors_dd" ('.$fields.') VALUES ($1, $2, $3, $4)';
						if (!$result = pg_query_params($conn, $strQuery, array($parent, $dato, $tipo, $lang)) ) {
							throw new Exception("Error Processing Request. Error on import_structure_json_data (1) Invalid jer_dd query ".to_string($strQuery), 1);
						}

				}

			$updated_tipo[] = $terminoID;

			debug_log(__METHOD__." + Updated structure item '$terminoID' ".to_string(), logger::DEBUG);
		}

		$response->result	= true;
		$response->msg		= 'OK. Request done. Updated '.count($updated_tipo) .' from file data total '. count($data).' structure terms from tld: '. implode(', ',$ar_tld);


		return $response;
	}//end import_structure_json_data



	/**
	* UPDATE_ONTOLOGY
	* Called by area_development -> Update Ontology widget
	* Connect with master server, download ontology files and update local DDBB and lang files
	* @param array $dedalo_prefix_tipos
	* @return object $response
	*/
	public static function update_ontology(array $dedalo_prefix_tipos) : object {
		$start_time=start_time();

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= ''; // 'Error. Request failed ['.__FUNCTION__.']';
				$response->errors	= [];

		// Remote server check
			if(defined('STRUCTURE_FROM_SERVER') && STRUCTURE_FROM_SERVER===true) {

				debug_log(__METHOD__
					." Checking remote_server status. Expected header code 200 .... "
					, logger::DEBUG
				);

				// Check remote server status before begins
					$remote_server_response = (object)backup::check_remote_server();
					if(SHOW_DEBUG===true) {
						$check_status_exec_time = exec_time_unit($start_time,'ms').' ms';
						debug_log(__METHOD__
							." REMOTE_SERVER_STATUS ($check_status_exec_time). remote_server_response: " .PHP_EOL
							. to_string($remote_server_response)
							, logger::DEBUG
						);
					}

					if (	$remote_server_response->result!==false
						 && $remote_server_response->code===200
						 && $remote_server_response->error===false) {

						// success
						$response->msg		.= $remote_server_response->msg;

					}else{

						// error
						$response->msg		= 'Error. Request failed 1 ['.__FUNCTION__.'] ' . $remote_server_response->msg;
						$response->result	= false;
						$response->errors[]	= $response->msg;
						return $response;
					}
			}

		// simple_schema_of_sections. Get current simple schema of sections, will use to compare with the new schema
			$old_simple_schema_of_sections = hierarchy::get_simple_schema_of_sections();

		// EXPORT. Before import, EXPORT ;-)
			$db_name = 'dedalo4_development_str_'.date("Y-m-d_Hi").'.custom';
			$res_export_structure = (object)backup::export_structure($db_name, $exclude_tables=false);	// Full backup
			if ($res_export_structure->result===false) {

				// error on export current DDBB
				$response->msg		= 'Error. Request failed 2 ['.__FUNCTION__.'] ' . $res_export_structure->msg;
				$response->errors[]	= $response->msg;
				return $response;

			}else{
				// Exec time
				$prev_time = start_time();
				// Append msg
				$response->msg .= $res_export_structure->msg . ' - export time: '.exec_time_unit($start_time,'ms').' ms';
			}

		// IMPORT
			$import_structure_response = backup::import_structure(
				'dedalo4_development_str.custom', // string db_name
				true, // bool check_server
				$dedalo_prefix_tipos
			);

			if ($import_structure_response->result===false) {
				// error on import current DDBB
				$response->msg		= 'Error. Request import_structure failed 3 ['.__FUNCTION__.'] ' .$import_structure_response->msg;
				$response->errors	= array_merge($response->errors, $import_structure_response->errors);
				return $response;

			}else{
				// Append msg
				$response->msg .= $import_structure_response->msg . ' - export time: '.exec_time_unit($prev_time,'ms').' ms';
			}

		// optimize tables
			$ar_tables = ['jer_dd','matrix_descriptors_dd','matrix_dd','matrix_list'];
			backup::optimize_tables($ar_tables);

		// delete all session data except auth
			foreach ($_SESSION['dedalo'] as $key => $value) {
				if ($key==='auth') continue;
				unset($_SESSION['dedalo'][$key]);
			}

		// update JAVASCRIPT labels
			$ar_langs = DEDALO_APPLICATION_LANGS;
			foreach ($ar_langs as $lang => $label) {
				// debug_log(__METHOD__." >>> Writing file $lang => $label ", logger::DEBUG);

				// direct
					$write_file = backup::write_lang_file($lang);
					if ($write_file===false) {
						$response->errors[]	= 'Error writing write_lang_file of lang: ' . $lang;
					}

				// thread . Use above Thread class @see https://www.php.net/manual/en/language.fibers.php
					// Thread::register(
					// 	$lang, // name
					// 	'backup::write_lang_file', // 'my_thread',
					// 	[$lang]
					// );
			}
			// Thread::run();

		// logger activity : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
			logger::$obj['activity']->log_message(
				'SAVE',
				logger::INFO,
				DEDALO_ROOT_TIPO,
				NULL,
				[
					'msg'		=> 'Updated Ontology',
					'version'	=> RecordObj_dd::get_termino_by_tipo(DEDALO_ROOT_TIPO,'lg-spa')
				]
			);


		// get new simple_schema_of_sections, will use to compare with the previous schema
			$new_simple_schema_of_sections = hierarchy::get_simple_schema_of_sections();
			// build changes list
			$simple_schema_changes = hierarchy::build_simple_schema_changes(
				$old_simple_schema_of_sections,
				$new_simple_schema_of_sections
			);
			// target file path
			$simple_schema_changes_name	= 'simple_schema_changes_'.date("Y-m-d_H-i-s").'.json';
			$simple_schema_dir_path		= DEDALO_BACKUP_PATH_ONTOLOGY . '/changes/';
			// create directory if not already exists
			if( !is_dir($simple_schema_dir_path) ){
				if(!mkdir($simple_schema_dir_path, 0750, true)){
					$response->result	= false;
					$response->msg		= "Error on read or create directory. Permission denied ($simple_schema_dir_path)";
					return $response;
				}
			}
			// save changes list data to the target file
			$filepath			= $simple_schema_dir_path.$simple_schema_changes_name;
			$save_simple_schema	= file_put_contents($filepath, json_encode($simple_schema_changes));
			if($save_simple_schema===false){
				$response->result	= false;
				$response->msg		= "Error on read or create file of simple schema changes. Permission denied ($filepath)";
				return $response;
			}

		// force reset cache of hierarchy tree
			// delete previous cache files
			dd_cache::delete_cache_files();

		// response
			$response->result	= true;
			$response->msg		= 'OK. Request done ['.__FUNCTION__.'] ' .$response->msg ;


		return $response;
	}//end update_ontology



	/**
	* WRITE_LANG_FILE
	* Calculated labels for given lang and write a JS file with the result
	* @param string $lang
	* @return bool
	* 	false if write error occurred, true if all is file is written successfully
	*/
	public static function write_lang_file(string $lang) : bool {

		// all labels
		$ar_label = label::get_ar_label($lang);
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
			if ($path_info['extension']!=='sql') {
				// ignore it
				continue;
			}

			$name	= $path_info['basename'];
			$size	= filesize($current_file);

			$item = (object)[
				'name' => $name,
				'size' => format_size_units($size)
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
			if ($path_info['extension']!=='backup') {
				// ignore it
				continue;
			}

			$name	= $path_info['basename'];
			$size	= filesize($current_file);

			$item = (object)[
				'name' => $name,
				'size' => format_size_units($size)
			];


			$ar_files[] = $item;
		}


		return $ar_files;
	}//end get_backup_files



}//end class backup
