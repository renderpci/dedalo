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



	/**
	* IMPORT_from_copy_file
	* @param string $section_tipo
	* 	Like 'es1'
	* @return object $response
	*/
	public static function import_from_copy_file( object $options ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		// options
			$section_tipo	= $options->section_tipo ?? null;
			$file_path		= $options->file_path;
			$matrix_table	= $options->matrix_table;
			$delete_table	= $options->delete_table ?? false;
			$columns		= $options->columns ?? ['section_id','section_tipo','datos'];

		// uncompressed file
			$uncompressed_file = substr( $file_path, 0, -3 );

		// check if file exists
			if (!file_exists($file_path)) {
				$response->msg = 'Error. The required file do not exists: '.$file_path;
				return $response;
			}

		// terminal gunzip command
			$command = 'gunzip --keep --force -v '.$file_path.';'; // -k (keep original file) -f (force overwrite without prompt)
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);

			$command_res = shell_exec($command);
			debug_log(__METHOD__." Exec response 1 (shell_exec): ".json_encode($command_res), logger::DEBUG);


		// command base. A PostgreSQL connection. used by all DDBB connections
			$command_base = DB_BIN_PATH.'psql -d ' . DEDALO_DATABASE_CONN .' '. DBi::get_connection_string();


		// terminal command psql delete previous records
			$command = $command_base
				.' --echo-errors -c "DELETE FROM "'.$matrix_table.'"';
				if( $delete_table !== true ){
					$command .= " WHERE section_tipo = '$section_tipo'";
				}
				$command .= ';";';
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);

			$command_res = shell_exec($command);
			debug_log(__METHOD__." Exec response 2 (shell_exec): ".json_encode($command_res), logger::DEBUG);

		// terminal command psql copy data from file
			$command = $command_base
				.' --echo-errors -c "\copy '.$matrix_table.' ('.implode(',', $columns).') from '.$uncompressed_file.'";';
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);

			$command_res = shell_exec($command);
			debug_log(__METHOD__." Exec response 3 (shell_exec): ".json_encode($command_res), logger::DEBUG);

		// update sequence value
			$query = 'SELECT setval(\''.$matrix_table.'_id_seq\', (SELECT MAX(id) FROM "'.$matrix_table.'")+1)';
			$command = $command_base
				.' --echo-errors '
				.'-c "'.$query.';";';
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);

			$command_res = shell_exec($command);
			debug_log(__METHOD__." Exec response 4 (shell_exec): ".json_encode($command_res), logger::DEBUG);


		// delete uncompressed_file
			$command  = 'rm '.$uncompressed_file.';';
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);

			$command_res = shell_exec($command);
			debug_log(__METHOD__." Exec response 5 (shell_exec): ".json_encode($command_res), logger::DEBUG);



		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;


		return $response;
	}//end import_from_copy_file

}//end class backup
