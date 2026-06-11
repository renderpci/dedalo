<?php declare(strict_types=1);

include_once __DIR__ . '/class.install_config_manager.php';

/**
 * CLASS INSTALL_DATABASE_MANAGER
 * Encapsulates database cloning, optimization, table cleaning,
 * extension creation, and default file import operations.
 *
 * @package Dedalo
 * @subpackage Install
 */
final class install_database_manager {

	/**
	* Private constructor to prevent instantiation (static utility class)
	*/
	private function __construct() {}

	/**
	* OPTIMIZE_DATABASE
	* @return object $response
	*/
	public static function optimize_database() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		$conn = DBi::_getConnection();

		$sql = 'VACUUM ANALYZE';
		debug_log(__METHOD__
			." Executing DB query " . PHP_EOL
			. $sql
			, logger::WARNING
		);
		$result	= pg_query($conn, $sql);
		if (!$result) {
			$msg = " Error on db execution (optimize database 0): ".pg_last_error($conn);
			debug_log(__METHOD__
				. $msg . PHP_EOL
				. $sql
				, logger::ERROR
			);
			$response->msg = $msg;

			return $response; // return error here !
		}

		// response
			$response->result	= true;
			$response->msg		= 'OK. Request done';

		return $response;
	}//end optimize_database

	/**
	* INSTALL_DB_FROM_DEFAULT_FILE
	* Unzip the psql default install file and import it to the current blank database
	* @return object $response
	*/
	public static function install_db_from_default_file() : object {

		// set timeout in seconds
		set_time_limit(600); // 10 minutes (10*60)

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config						= install_config_manager::get_config();
			$target_file_path_compress	= $config->target_file_path_compress;
			$uncompressed_file			= $config->target_file_path;
			$exec						= true;

		// check if file exists
			if (!file_exists($target_file_path_compress)) {
				$response->msg = 'Error. The required file do not exists: '.$target_file_path_compress;
				return $response;
			}

		// terminal gunzip command. From 'dedalo4_install.pgsql.gz' to 'dedalo4_install.pgsql'
			// SEC-041 defence-in-depth: $target_file_path_compress is server-built
			// from DEDALO_ROOT_PATH + a fixed name; quoted anyway in case a future
			// caller passes a path with whitespace.
			$command = 'gunzip --keep --force -v '.escapeshellarg($target_file_path_compress).';'; // -k (keep original file) -f (force overwrite without prompt)
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
			if ($exec) {
				$command_res = shell_exec($command);
				debug_log(__METHOD__
					." Exec response 1 (shell_exec): ".json_encode($command_res)
					, logger::DEBUG
				);
			}

		// terminal command psql copy data from file 'dedalo4_install.pgsql'
			// SEC-041: shell-quote all interpolated values. Constants come from
			// `config/bootstrap.php` (deployer-controlled, not HTTP-reachable);
			// `$config->host_line`/`port_line` are pre-quoted in `get_config()`.
			$command = DB_BIN_PATH.'psql -d '.escapeshellarg(DEDALO_DATABASE_CONN).' -U '.escapeshellarg(DEDALO_USERNAME_CONN).' '.$config->host_line.' '.$config->port_line.' --echo-errors --file '.escapeshellarg($uncompressed_file);
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
			if ($exec) {

				$output = null;
				$result_code = null;
				exec($command, $output, $result_code);
				$command_res = $output;
				debug_log(__METHOD__
					." Exec response 2 (exec) " . PHP_EOL
					.' output: ' 		. to_string($output) . PHP_EOL
					.' result_code: ' 	. to_string($result_code) . PHP_EOL
					, logger::WARNING
				);

				if (empty($command_res)) {

					$php_whoami					= trim(shell_exec('whoami'));
					$php_get_current_user		= get_current_user();
					$user_home_dir				= trim(shell_exec('echo $HOME'));
					$pgpass_file_path			= $user_home_dir.'/.pgpass';
					$pgpass_file_exists			= file_exists($pgpass_file_path);
					$pgpass_file_permissions	= $pgpass_file_exists
						? substr(sprintf('%o', fileperms($pgpass_file_path)), -4)
						: 'file not found!';

					$response->msg = 'Error. Database import failed! Verify your .pgpass file and look for errors in php error file. '
						.' - PHP get_current_user: '		. $php_get_current_user
						.' - PHP whoami: '					. $php_whoami
						.' - PHP home: '					. $user_home_dir
						.' - .pgpass file permissions: '	. $pgpass_file_permissions;
					trigger_error($response->msg);

					debug_log(__METHOD__
						." -> failed command execution ".PHP_EOL
						.' command: '					. $command .PHP_EOL
						.' command output: '			. to_string($output) .PHP_EOL
						.' command result_code: '		. to_string($result_code) .PHP_EOL
						.' PHP user get_current_user: ' . $php_get_current_user . PHP_EOL
						.' PHP user whoami: '			. $php_whoami . PHP_EOL
						.' PHP $HOME dir: '				. $user_home_dir . PHP_EOL
						.' .pgpass file path: '			. $pgpass_file_path . PHP_EOL
						.' .pgpass file exists: '		. json_encode($pgpass_file_exists) . PHP_EOL
						.' .pgpass file permissions: '	. $pgpass_file_permissions . PHP_EOL
						, logger::ERROR
					);

					return $response;
				}
			}

		// delete uncompressed_file ('dedalo4_install.pgsql')
			// SEC-041 defence-in-depth.
			$command  = 'rm '.escapeshellarg($uncompressed_file).';';
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
			if ($exec) {
				$command_res = shell_exec($command);
				debug_log(__METHOD__." Exec response 4 (shell_exec): ".json_encode($command_res), logger::DEBUG);
			}

		// response
			$response->result	= true;
			$response->msg		= 'OK. Request done';

		return $response;
	}//end install_db_from_default_file

	/**
	* CLONE_DATABASE
	* Clones the current Dédalo database into the install database using
	* CREATE DATABASE WITH TEMPLATE.  This approach requires an exclusive
	* lock on the source database; any active session (web worker, cron,
	* psql) blocks the clone with "source database is being accessed by
	* other users".  For a lock-free alternative see `clone_database_dump()`.
	*
	* @param bool $skip_if_exists
	* @return object $response
	*/
	public static function clone_database(bool $skip_if_exists) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config	= install_config_manager::get_config();
			$exec	= true;

		// new db connection
			$db_conn = DBi::_getNewConnection();

		// SEC: validate db_install_name — PostgreSQL identifiers are [a-z_][a-z0-9_$]*
		// Prevents SQL injection via the public static property.
			if (!preg_match('/^[a-z_][a-z0-9_$]*$/', $config->db_install_name)) {
				$response->msg = 'Invalid database name: '.$config->db_install_name;
				debug_log(__METHOD__.' '.$response->msg, logger::ERROR);
				return $response;
			}

		// check if already exists the install database. If yes, ignore clone order and return ok
			$db_exists = false;
			$sql = '
				-- returns string f for false or t for true
				SELECT EXISTS(
					SELECT datname FROM pg_catalog.pg_database WHERE datname = \''.$config->db_install_name.'\'
				);
			';
			debug_log(__METHOD__
				." Executing DB query " . PHP_EOL
				. to_string($sql)
				, logger::WARNING
			);
			if ($exec) {
				$result	= pg_query($db_conn, $sql);
				if (!$result) {
					$msg = " Error on db execution (clone database 0): ".pg_last_error($db_conn);
					debug_log(__METHOD__
						. $msg . PHP_EOL
						. to_string($sql)
						, logger::ERROR
					);
					$response->msg = $msg;

					return $response; // return error here !
				}
				$rows	= (array)pg_fetch_assoc($result); // returns 'f' for false, 't' for true
				$value	= reset($rows);

				$db_exists = ($value==='t');
				if ($db_exists===true && $skip_if_exists===true) {

					$response->result	= true;
					$response->msg		= 'OK. Request done. DDBB already exists. Ignored clone!';
					debug_log(__METHOD__
						. $response->msg
						, logger::WARNING
					);

					return $response; // return success here !
				}
			}

		// terminate the active connections on target database
			if ($db_exists===true) {
				$sql = '
					SELECT
						pg_terminate_backend (pg_stat_activity.pid)
					FROM
						pg_stat_activity
					WHERE
						pg_stat_activity.datname = \''.$config->db_install_name.'\';
				';
				debug_log(__METHOD__
					. " Executing DB query " . PHP_EOL
					. to_string($sql)
					, logger::WARNING
				);
				if ($exec) {
					$result = pg_query($db_conn, $sql);
					if (!$result) {
						$msg = " Error on db execution (clone database 1): ".pg_last_error($db_conn);
						debug_log(__METHOD__
							. $msg .PHP_EOL
							. to_string($sql)
							, logger::ERROR
						);
						$response->msg = $msg;

						return $response; // return error here !
					}
				}
			}

		// new db connection
			$db_conn = DBi::_getNewConnection();

		// drop target database
			$sql = '
				DROP DATABASE IF EXISTS "'.$config->db_install_name.'";
			';
			debug_log(__METHOD__
				. " Executing DB query " . PHP_EOL
				. to_string($sql)
				, logger::WARNING
			);
			if ($exec) {
				$result   = pg_query($db_conn, $sql);
				if (!$result) {
					$msg = " Error on db execution (clone database 2): ".pg_last_error($db_conn);
					debug_log(__METHOD__
						. $msg .PHP_EOL
						. to_string($sql)
						, logger::ERROR
					);
					$response->msg = $msg;

					return $response; // return error here !
				}
			}

		// terminate the active connections on source database (template)
		// WARNING: this disconnects ALL sessions on the source (production) DB.
		// Log the count first so the admin can see the impact.
			if ($exec) {
				$count_sql = '
					SELECT COUNT(*) AS cnt
					FROM pg_stat_activity
					WHERE pg_stat_activity.datname = \''.DEDALO_DATABASE_CONN.'\'
						AND pg_stat_activity.pid <> pg_backend_pid();
				';
				$count_result = pg_query($db_conn, $count_sql);
				if ($count_result) {
					$count_row = pg_fetch_assoc($count_result);
					debug_log(__METHOD__
						. ' Terminating '.($count_row['cnt'] ?? 0).' active sessions on source database "'.DEDALO_DATABASE_CONN.'"'
						, logger::WARNING
					);
				}
			}
			$sql = '
				SELECT
					pg_terminate_backend (pg_stat_activity.pid)
				FROM
					pg_stat_activity
				WHERE
					pg_stat_activity.datname = \''.DEDALO_DATABASE_CONN.'\'
					AND pg_stat_activity.pid <> pg_backend_pid();
			';
			debug_log(__METHOD__
				. " Executing DB query " . PHP_EOL
				. to_string($sql)
				, logger::WARNING
			);
			if ($exec) {
				$result = pg_query($db_conn, $sql);
				if (!$result) {
					$msg = " Error on db execution (clone database 2.5): ".pg_last_error($db_conn);
					debug_log(__METHOD__
						. $msg .PHP_EOL
						. to_string($sql)
						, logger::ERROR
					);
					$response->msg = $msg;

					return $response; // return error here !
				}
			}

		// create a new install database with cloned schema and data
		// Use double-quoted identifiers (equivalent to quote_ident) for defence-in-depth
			$sql = '
				CREATE DATABASE "'.$config->db_install_name.'" WITH TEMPLATE "'.DEDALO_DATABASE_CONN.'" OWNER "'.DEDALO_USERNAME_CONN.'";
			';
			if ($exec) {
				debug_log(__METHOD__
					. " Executing DB query " . PHP_EOL
					. to_string($sql)
					, logger::WARNING
				);

				// Retry loop: pg_terminate_backend may not take effect immediately,
				// so PostgreSQL can still report the source DB as "in use".
				$max_retries = 3;
				$retry_delay = 1; // seconds
				$last_error = '';
				for ($attempt = 1; $attempt <= $max_retries; $attempt++) {
					$result = pg_query($db_conn, $sql);
					if ($result) {
						break;
					}
					$last_error = pg_last_error($db_conn);
					debug_log(__METHOD__
						. " Attempt $attempt/$max_retries failed: $last_error"
						, logger::WARNING
					);
					if ($attempt < $max_retries) {
						sleep($retry_delay);
					}
				}
				if (!$result) {
					$msg = " Error on db execution (clone database 3, $max_retries attempts): ".$last_error;
					debug_log(__METHOD__
						. $msg .PHP_EOL
						. to_string($sql)
						, logger::ERROR
					);
					$response->msg = $msg;

					return $response; // return error here !
				}
			}

		// response
			$response->result	= true;
			$response->msg		= 'OK. Request done';

		return $response;
	}//end clone_database

	/**
	* CLONE_DATABASE_DUMP
	* Clones the current Dédalo database into the install database using a
	* pg_dump | psql pipeline instead of CREATE DATABASE WITH TEMPLATE.
	*
	* The TEMPLATE approach (see `clone_database()`) requires an exclusive
	* lock on the source database; any stray connection (web worker, cron,
	* psql session) blocks the clone with "source database is being accessed
	* by other users".  This function avoids that problem entirely:
	* pg_dump reads the source with a consistent MVCC snapshot (no exclusive
	* lock) and streams the output into a freshly-created target database.
	*
	* @param bool $skip_if_exists  If true and the target DB already exists, return success immediately.
	* @return object $response
	*/
	public static function clone_database_dump(bool $skip_if_exists) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config	 = install_config_manager::get_config();
			$exec	 = true;
			$db_conn = DBi::_getConnection();

		// SEC: validate db_install_name — PostgreSQL identifiers are [a-z_][a-z0-9_$]*
		// Prevents SQL injection via the public static property.
			if (!preg_match('/^[a-z_][a-z0-9_$]*$/', $config->db_install_name)) {
				$response->msg = 'Invalid database name: '.$config->db_install_name;
				debug_log(__METHOD__.' '.$response->msg, logger::ERROR);
				return $response;
			}

		// check if the install database already exists
		// If yes and skip_if_exists, return success immediately
			$db_exists = false;
			$sql = '
				SELECT EXISTS(
					SELECT datname FROM pg_catalog.pg_database WHERE datname = \''.$config->db_install_name.'\'
				);
			';
			debug_log(__METHOD__
				." Executing DB query " . PHP_EOL
				. to_string($sql)
				, logger::WARNING
			);
			if ($exec) {
				$result	= pg_query($db_conn, $sql);
				if (!$result) {
					$msg = " Error on db execution (clone database dump 0): ".pg_last_error($db_conn);
					debug_log(__METHOD__
						. $msg . PHP_EOL
						. to_string($sql)
						, logger::ERROR
					);
					$response->msg = $msg;
					return $response;
				}
				$rows	= (array)pg_fetch_assoc($result); // 'f' for false, 't' for true
				$value	= reset($rows);
				$db_exists = ($value==='t');

				if ($db_exists===true && $skip_if_exists===true) {
					$response->result	= true;
					$response->msg		= 'OK. Request done. DDBB already exists. Ignored clone!';
					debug_log(__METHOD__.' '.$response->msg, logger::WARNING);
					return $response;
				}
			}

		// ── Step 1: terminate connections on the TARGET database (if it exists) ──
		// Needed before we can DROP it. Only the target, NOT the source.
			if ($db_exists===true) {
				$sql = '
					SELECT pg_terminate_backend(pg_stat_activity.pid)
					FROM pg_stat_activity
					WHERE pg_stat_activity.datname = \''.$config->db_install_name.'\'
						AND pg_stat_activity.pid <> pg_backend_pid();
				';
				debug_log(__METHOD__
					." Executing DB query " . PHP_EOL
					. to_string($sql)
					, logger::WARNING
				);
				if ($exec) {
					$result = pg_query($db_conn, $sql);
					if (!$result) {
						$msg = " Error on db execution (clone database dump 1): ".pg_last_error($db_conn);
						debug_log(__METHOD__.$msg.PHP_EOL.to_string($sql), logger::ERROR);
						$response->msg = $msg;
						return $response;
					}
				}
			}

		// ── Step 2: drop the target database (if it exists) ──
		// Connect to 'postgres' maintenance DB — cannot DROP a database
		// while connected to it.
			$maint_conn = DBi::_getNewConnection(
				DEDALO_HOSTNAME_CONN,
				DEDALO_USERNAME_CONN,
				DEDALO_PASSWORD_CONN,
				'postgres',
				DEDALO_DB_PORT_CONN,
				DEDALO_SOCKET_CONN
			);
			if ($maint_conn === false) {
				$response->msg = 'Error: cannot connect to postgres maintenance database for clone';
				debug_log(__METHOD__.' '.$response->msg, logger::ERROR);
				return $response;
			}

			if ($db_exists===true) {
				$sql = 'DROP DATABASE IF EXISTS "'.$config->db_install_name.'";';
				debug_log(__METHOD__
					." Executing DB query " . PHP_EOL
					. to_string($sql)
					, logger::WARNING
				);
				if ($exec) {
					$result = pg_query($maint_conn, $sql);
					if (!$result) {
						$msg = " Error on db execution (clone database dump 2): ".pg_last_error($maint_conn);
						debug_log(__METHOD__.$msg.PHP_EOL.to_string($sql), logger::ERROR);
						$response->msg = $msg;
						return $response;
					}
				}
			}

		// ── Step 3: create the empty target database ──
			$sql = 'CREATE DATABASE "'.$config->db_install_name.'" OWNER "'.DEDALO_USERNAME_CONN.'";';
			debug_log(__METHOD__
				." Executing DB query " . PHP_EOL
				. to_string($sql)
				, logger::WARNING
			);
			if ($exec) {
				$result = pg_query($maint_conn, $sql);
				if (!$result) {
					$msg = " Error on db execution (clone database dump 3): ".pg_last_error($maint_conn);
					debug_log(__METHOD__.$msg.PHP_EOL.to_string($sql), logger::ERROR);
					$response->msg = $msg;
					return $response;
				}
			}

		// close the maintenance connection — no longer needed
			if ($maint_conn instanceof PgSql\Connection
				&& pg_connection_status($maint_conn) === PGSQL_CONNECTION_OK) {
				pg_close($maint_conn);
			}

		// ── Step 4: pg_dump | psql pipeline — clone data without exclusive lock ──
		// pg_dump reads the source with a consistent MVCC snapshot; no need to
		// terminate other sessions on the source database.  The output is piped
		// directly into psql connected to the newly-created target database.
		// SEC-041 defence-in-depth: shell-quote every interpolated value.
			$pg_dump_cmd = DB_BIN_PATH
				. 'pg_dump '
				. $config->host_line . ' ' . $config->port_line
				. ' -U ' . escapeshellarg(DEDALO_USERNAME_CONN)
				. ' --no-owner --no-privileges'
				. ' --role=' . escapeshellarg(DEDALO_USERNAME_CONN)
				. ' ' . escapeshellarg(DEDALO_DATABASE_CONN);

			$psql_cmd = DB_BIN_PATH
				. 'psql '
				. $config->host_line . ' ' . $config->port_line
				. ' -U ' . escapeshellarg(DEDALO_USERNAME_CONN)
				. ' -d ' . escapeshellarg($config->db_install_name)
				. ' --echo-errors'
				. ' -v ON_ERROR_STOP=1';

			$command = $pg_dump_cmd . ' | ' . $psql_cmd;

			debug_log(__METHOD__
				." Executing terminal DB command " . PHP_EOL
				. to_string($command)
				, logger::WARNING
			);
			if ($exec) {
				$output			= null;
				$result_code	= null;
				exec($command, $output, $result_code);

				debug_log(__METHOD__
					." Exec response (clone pipeline)" . PHP_EOL
					.' result_code: '	. to_string($result_code) . PHP_EOL
					.' output: '		. to_string($output)
					, logger::WARNING
				);

				if ($result_code !== 0) {
					// psql with ON_ERROR_STOP returns non-zero on any SQL error
					$msg = " Error on db execution (clone database dump 4): pg_dump|psql pipeline failed with exit code $result_code";
					debug_log(__METHOD__.$msg.PHP_EOL.to_string($output), logger::ERROR);
					$response->msg = $msg;
					return $response;
				}
			}

		// invalidate cached connection — the source DB connection may have been
		// affected by the long-running pipeline; force a fresh one on next use
			DBi::invalidate_connection_cache();

		// response
			$response->result	= true;
			$response->msg		= 'OK. Request done';

		return $response;
	}//end clone_database_dump

	/**
	* CLEAN_COUNTERS
	* @return object $response
	*/
	public static function clean_counters() : object {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config				= install_config_manager::get_config();
			$db_install_conn	= install_config_manager::get_db_install_conn();
			$to_preserve_tld	= $config->to_preserve_tld;
			$exec				= true;

		// truncate all. They will be re-created from higher value when needed
			$sql = '
				TRUNCATE "matrix_counter";
				ALTER SEQUENCE "matrix_counter_id_seq" RESTART WITH 1;
				TRUNCATE "matrix_counter_dd";
				ALTER SEQUENCE "matrix_counter_dd_id_seq" RESTART WITH 1;
			';
			debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
			if ($exec) {
				$result   = pg_query($db_install_conn, $sql);
				if (!$result) {
					$msg = " Error on db execution (matrix_counter): ".pg_last_error($db_install_conn);
					debug_log(__METHOD__.$msg, logger::ERROR);
					$response->msg = $msg;
					return $response;
				}
			}

		// clean main_dd (Ontology counters)
			if (DBi::check_table_exists('main_dd')) {
				$items = array_map(function($el){
					return '\''.$el.'\'';
				}, $to_preserve_tld);
				$line	= implode(',', $items);
				$sql = '
					DELETE
					FROM "main_dd"
					WHERE
					tld NOT IN('.$line.');
				';
				debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
				if ($exec) {
					$result   = pg_query($db_install_conn, $sql);
					if (!$result) {
						$msg = " Error on db execution (main_dd): ".pg_last_error($db_install_conn);
						debug_log(__METHOD__.$msg, logger::ERROR);
						$response->msg = $msg;
						return $response;
					}
				}
			}

		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;

		return $response;
	}//end clean_counters

	/**
	* CLEAN_TABLES
	* @return object $response
	*/
	public static function clean_tables() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		// short vars
			$config				= install_config_manager::get_config();
			$to_clean_tables	= $config->to_clean_tables;
			$valid_tables		= $config->valid_tables;
			$exec				= true;

		// validate $valid_tables value
			if (empty($valid_tables)) {
				$msg = 'Error: Failed to get valid_tables. Value is empty';
				debug_log(__METHOD__.$msg, logger::ERROR);
				$response->msg = $msg;
				$response->error[] = 'empty valid_tables property';
				return $response;
			}

		// validate connection
			$db_install_conn = install_config_manager::get_db_install_conn();
			if ($db_install_conn === false) {
				$msg = 'Error: Failed to get install database connection';
				debug_log(__METHOD__.$msg, logger::ERROR);
				$response->msg = $msg;
				$response->error[] = 'invalid DB install connection';
				return $response;
			}

		// Remove non valid tables (temporal, test, dev, etc.)
			$sentences = [];
			$current_tables = DBi::get_tables($db_install_conn);
			foreach ($current_tables as $current_table) {
				// Delete non official valid tables
				if ( !in_array($current_table, $valid_tables) ) {
					// Delete this table
					$sentences[] = "DROP TABLE IF EXISTS \"$current_table\" CASCADE;";
				}
			}
			$sql = implode(PHP_EOL, $sentences);
			debug_log(__METHOD__." Executing DB query: ". PHP_EOL .to_string($sql), logger::WARNING);
			if ($exec) {
				$result = pg_query($db_install_conn, $sql);
				if (!$result) {
					$msg = " Error on db execution (clean tables - remove): ".pg_last_error($db_install_conn);
					debug_log(__METHOD__.$msg, logger::ERROR);
					$response->msg = $msg;
					$response->error[] = 'query execution failed from drop non valid tables';
					return $response;
				}
			}

		// clean matrix and accessory tables
			$sentences = [];
			foreach ($to_clean_tables as $table) {

				// CLI msg
				if ( running_in_cli()===true ) {
					print_cli((object)[
						'msg' => 'Cleaning table: ' . $table
					]);
				}

				switch ($table) {
					case 'matrix_ontology':
						$ar_sections = array_map(function($tld){
							return "'{$tld}0'";
						}, $config->to_preserve_tld);
						$sql = 'DELETE FROM "' . $table . '" WHERE section_tipo NOT IN (' . implode(',', $ar_sections) . ');';
						break;

					case 'matrix_ontology_main':
						$to_preserve_tld = array_map(function($tld){
							return "'{$tld}'";
						}, $config->to_preserve_tld);
						$sql = "DELETE FROM matrix_ontology_main
						WHERE NOT EXISTS (
							SELECT 1
							FROM jsonb_array_elements(string->'hierarchy6') AS item
							WHERE item->>'lang' = 'lg-nolan'
							AND item->>'value' IN (" . implode(',', $to_preserve_tld) . ")
						)
						OR string->'hierarchy6' IS NULL
						OR jsonb_array_length(string->'hierarchy6') = 0;";
						break;

					default:
						$sql = 'DELETE FROM "' . $table . '"; ALTER SEQUENCE IF EXISTS ' . $table . '_id_seq RESTART WITH 1;';
						if ($table==='matrix_activity') {
							// add special sequence matrix_activity_section_id_seq
							$sql .= 'ALTER SEQUENCE IF EXISTS matrix_activity_section_id_seq RESTART WITH 1;';
						}
						break;
				}

				$sentences[] = $sql;
			}
			$sql = implode(PHP_EOL, $sentences);
			debug_log(__METHOD__." Executing DB query " . PHP_EOL . to_string($sql), logger::WARNING);
			if ($exec) {
				$result = pg_query($db_install_conn, $sql);
				if (!$result) {
					$msg = " Error on db execution (clean tables): ".pg_last_error($db_install_conn);
					debug_log(__METHOD__.$msg, logger::ERROR);
					$response->msg = $msg;
					$response->error[] = 'query execution failed from clean tables';
					return $response;
				}
			}

		// optimize tables
			$sentences = [];
			$current_tables = DBi::get_tables($db_install_conn);
			foreach ($current_tables as $current_table) {
				// Optimize this table
				$sql = "VACUUM ANALYZE \"$current_table\";";
				debug_log(__METHOD__." Executing DB query " . PHP_EOL . to_string($sql), logger::WARNING);
				$result = pg_query($db_install_conn, $sql);
				if (!$result) {
					$msg = " Error on db execution (clean tables - optimize): ".pg_last_error($db_install_conn);
					debug_log(__METHOD__.$msg, logger::ERROR);
					$response->msg = $msg;
					$response->error[] = 'query execution failed from optimize tables - table: ' .$current_table;
					return $response;
				}
			}

		// response
			$response->result	= true;
			$response->msg		= 'OK. Request done '.__METHOD__;

		return $response;
	}//end clean_tables

	/**
	* CREATE_EXTENSIONS
	* Add Dédalo mandatory PostgreSQL extensions and functions
	* to current install database
	* @return object $response
	*/
	public static function create_extensions() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$db_install_conn	= install_config_manager::get_db_install_conn();

		$sql = '
			CREATE EXTENSION IF NOT EXISTS unaccent;
			CREATE EXTENSION IF NOT EXISTS pg_trgm;

			CREATE OR REPLACE FUNCTION f_unaccent(text)
			RETURNS text AS
			$func$
			SELECT public.unaccent(\'public.unaccent\', $1)
			$func$  LANGUAGE sql IMMUTABLE;
		';
		debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
		$result   = pg_query($db_install_conn, $sql);
		if ($result===false) {
			$msg = " Error on db execution (create_extensions): ".pg_last_error($db_install_conn);
			debug_log(__METHOD__.$msg, logger::ERROR);
			$response->msg = $msg;
			return $response;
		}

		// response
			$response->result	= true;
			$response->msg		= 'OK. Request done '.__METHOD__;

		return $response;
	}//end create_extensions

}//end class install_database_manager
