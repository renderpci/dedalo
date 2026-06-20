<?php declare(strict_types=1);

include_once __DIR__ . '/class.install_config_manager.php';

/**
* CLASS INSTALL_DATABASE_MANAGER
* Manages all PostgreSQL-level database operations during Dédalo installation.
*
* This class owns every shell-out and direct SQL call that manipulates whole
* databases or multiple tables as part of the install / clone / clean workflow:
*
* - Clone the running production database into a fresh install target using
*   either the fast TEMPLATE method (`clone_database`) or the lock-free
*   pg_dump | psql pipeline (`clone_database_dump`).
* - Clean data tables (matrix_*, sequences) inside the cloned install DB,
*   preserving whitelisted ontology top-level-domain (TLD) rows.
* - Run VACUUM ANALYZE optimisation against the production or install DB.
* - Install mandatory PostgreSQL extensions (`unaccent`, `pg_trgm`) plus the
*   `f_unaccent` helper function.
* - Bootstrap the install DB from a compressed default SQL dump file.
*
* All methods follow the same response contract:
*   (object){ result: bool, msg: string }
* Callers must check `$response->result === true` before continuing.
*
* Relationships:
* - Depends on `install_config_manager::get_config()` for resolved path, connection,
*   and whitelist values (never hardcodes these itself).
* - Depends on `install_config_manager::get_db_install_conn()` for a live
*   PgSql\Connection to the install (target) database.
* - Calls `DBi::_getConnection()`, `DBi::_getNewConnection()`, and
*   `DBi::invalidate_connection_cache()` from `core/db/class.DBi.php`.
* - Called by `class.install.php` and the install JSON API handler.
*
* Security note (SEC-041): every value interpolated into shell commands is
* run through `escapeshellarg()`. Constants from `config/config.php` are
* deployer-controlled (not HTTP-reachable), so quoting is defence-in-depth.
*
* @package Dédalo
* @subpackage Install
*/
final class install_database_manager {

	/**
	* Private constructor to prevent instantiation (static utility class)
	*/
	private function __construct() {}

	/**
	* OPTIMIZE_DATABASE
	* Runs VACUUM ANALYZE on the current Dédalo production database so that
	* the planner statistics are up to date and dead tuples are reclaimed.
	*
	* Uses the shared persistent connection from DBi::_getConnection(); this
	* is appropriate because VACUUM ANALYZE does not require an exclusive lock.
	*
	* @return object $response - result:true on success, result:false with msg on failure
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
	* Bootstraps the install database from the bundled compressed SQL dump.
	*
	* Steps performed (each step runs a shell command via `shell_exec` / `exec`):
	*   1. gunzip: decompress `<target>.pgsql.gz` → `<target>.pgsql` (--keep preserves the .gz).
	*   2. psql: stream the uncompressed dump into the database defined by
	*      `DEDALO_DATABASE_CONN` / `DEDALO_USERNAME_CONN` using --echo-errors
	*      so that SQL errors appear in the PHP error log.
	*   3. rm: delete the temporary uncompressed file.
	*
	* The function raises PHP's execution time limit to 10 minutes (600 s) because
	* a full database restore can take much longer than the default `max_execution_time`.
	*
	* Authentication uses the PGPASSWORD env var (from DEDALO_PASSWORD_CONN), exported only
	* around the psql exec, so the install DB may be LOCAL or REMOTE without a ~/.pgpass file.
	* If psql produces no output (`$command_res` is empty after exec), the function
	* diagnoses the probable cause — an empty/incorrect DEDALO_PASSWORD_CONN — and returns an
	* error with diagnostic detail about the PHP process owner, home directory and DB host.
	*
	* Paths are resolved from `install_config_manager::get_config()`:
	* - `$config->target_file_path_compress` — the .gz source file
	* - `$config->target_file_path`          — the uncompressed target (temporary)
	*
	* @return object $response - result:true on success, result:false with msg on failure
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
			// $exec: dev-time guard; kept always-true so future dry-run debugging
			// can be enabled by flipping a single local variable without touching
			// control-flow. The pattern is shared by all methods in this class.
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
			// `config/config.php` (deployer-controlled, not HTTP-reachable);
			// `$config->host_line`/`port_line` are pre-quoted in `get_config()`.
			$command = system::get_pg_bin_path().'psql -d '.escapeshellarg(DEDALO_DATABASE_CONN).' -U '.escapeshellarg(DEDALO_USERNAME_CONN).' '.$config->host_line.' '.$config->port_line.' -v ON_ERROR_STOP=1 --echo-errors --file '.escapeshellarg($uncompressed_file);
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
			if ($exec) {

				// DBi::pg_exec authenticates via the PGPASSWORD env var (from DEDALO_PASSWORD_CONN),
				// exported only around this exec, so the install DB may be LOCAL or REMOTE without
				// a ~/.pgpass file.
				$output = [];
				$result_code = 0;
				DBi::pg_exec($command, $output, $result_code);
				$command_res = $output;
				debug_log(__METHOD__
					." Exec response 2 (exec) " . PHP_EOL
					.' output: ' 		. to_string($output) . PHP_EOL
					.' result_code: ' 	. to_string($result_code) . PHP_EOL
					, logger::WARNING
				);

				// ON_ERROR_STOP=1 → psql exits non-zero if ANY statement fails mid-restore. A
				// non-zero code means the DB is partially populated; never report success on it
				// (the old code only checked for empty output and silently shipped a broken DB).
				if ($result_code !== 0) {
					$response->msg = 'Error. Database import failed (the SQL restore stopped on an '
						.'error). Verify the PostgreSQL credentials and check the server error log.';
					debug_log(__METHOD__
						." DB import failed: psql exit code ".to_string($result_code).PHP_EOL
						.' output: '.to_string($output)
						, logger::ERROR
					);
					return $response;
				}

				// empty output from psql usually means it could not authenticate
				// (libpq found no usable credentials), rather than a SQL error.
				// Authentication uses PGPASSWORD from DEDALO_PASSWORD_CONN; the most
				// common cause is an empty/incorrect DEDALO_PASSWORD_CONN (or, when it
				// is intentionally empty, a missing pg_hba.conf trust/peer rule).
				if (empty($command_res)) {

					$php_whoami				= trim(shell_exec('whoami'));
					$php_get_current_user	= get_current_user();
					$user_home_dir			= trim(shell_exec('echo $HOME'));
					$password_is_set		= (string)DEDALO_PASSWORD_CONN !== '';

					// Keep the OS user / home / credential-state details in the server log only
					// (below); returning them to the pre-auth install client leaks server internals.
					$response->msg = 'Error. Database import failed. Verify DEDALO_PASSWORD_CONN '
						.'(PostgreSQL credentials) and look for details in the server error log.';
					trigger_error($response->msg);

					debug_log(__METHOD__
						." -> failed command execution ".PHP_EOL
						.' command: '					. $command .PHP_EOL
						.' command output: '			. to_string($output) .PHP_EOL
						.' command result_code: '		. to_string($result_code) .PHP_EOL
						.' PHP user get_current_user: ' . $php_get_current_user . PHP_EOL
						.' PHP user whoami: '			. $php_whoami . PHP_EOL
						.' PHP $HOME dir: '				. $user_home_dir . PHP_EOL
						.' DEDALO_PASSWORD_CONN set: '	. json_encode($password_is_set) . PHP_EOL
						.' DB host: '					. DEDALO_HOSTNAME_CONN . PHP_EOL
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
	* `CREATE DATABASE … WITH TEMPLATE`.
	*
	* This method is the fast path: PostgreSQL handles the copy natively at
	* the block level, making it much quicker than a logical dump/restore for
	* large databases.  The trade-off is that PostgreSQL requires an exclusive
	* lock on the source database for the duration of the copy.  Any active
	* session on the source (web worker, background cron, psql prompt) will
	* cause PostgreSQL to report "source database is being accessed by other
	* users" and abort the CREATE DATABASE statement.
	*
	* To work around the locking problem this method:
	*   1. Terminates all non-self connections on the *target* DB (so it can
	*      be dropped), then drops it.
	*   2. Terminates all non-self connections on the *source* DB (to satisfy
	*      the TEMPLATE exclusive-lock requirement).
	*   3. Retries `CREATE DATABASE … WITH TEMPLATE` up to 3 times with a
	*      1-second delay, because pg_terminate_backend() is asynchronous and
	*      terminated sessions may still appear briefly.
	*
	* (!) The termination of source-DB connections means all live user sessions
	* are killed.  This method should only be called during a scheduled
	* maintenance window.  For a lock-free alternative that avoids killing
	* sessions entirely, use `clone_database_dump()`.
	*
	* The `$config->db_install_name` value is validated against
	* `/^[a-z_][a-z0-9_$]*$/` before use in SQL to prevent identifier
	* injection (the identifier is not parameterisable via pg_query_params).
	*
	* @param bool $skip_if_exists - when true, return success immediately if the
	*                               target database already exists rather than
	*                               dropping and re-cloning it
	* @return object $response - result:true on success, result:false with msg on failure
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

				// pg_fetch_assoc returns array ['exists' => 'f'] or ['exists' => 't']
				// reset() picks the single value regardless of the column name
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
		// (!) A fresh connection is required here: the previous connection's autocommit
		// context may be stale after the pg_terminate_backend call above returned.
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
	* `pg_dump | psql` pipeline — the lock-free alternative to `clone_database()`.
	*
	* Why this method exists:
	* `CREATE DATABASE … WITH TEMPLATE` (used by `clone_database()`) demands an
	* exclusive lock on the source database for the full duration of the copy,
	* which kills all live user sessions.  `pg_dump` reads the source using
	* PostgreSQL's MVCC snapshot isolation: it never takes an exclusive lock, so
	* regular read/write traffic can continue while the clone runs.
	*
	* Steps:
	*   1. Validate `db_install_name` against the safe-identifier regex.
	*   2. Detect whether the target database already exists (`pg_catalog.pg_database`).
	*   3. If the target exists and `$skip_if_exists` is true → return success early.
	*   4. Terminate all non-self connections on the *target* DB (needed before DROP).
	*   5. Open a maintenance connection to the `postgres` system database (required
	*      because PostgreSQL will not allow DROP DATABASE on the currently-connected DB).
	*   6. DROP the target database if it existed; CREATE it empty under the same owner.
	*   7. Close the maintenance connection; it is no longer needed.
	*   8. Run: `pg_dump --no-owner --no-privileges ... | psql -v ON_ERROR_STOP=1 ...`
	*      A non-zero exit code from psql means at least one SQL statement failed.
	*   9. Call `DBi::invalidate_connection_cache()` so the next database operation
	*      gets a fresh connection (the long pipeline may have reset idle connections).
	*
	* (!) `--no-owner` and `--no-privileges` strip ownership and GRANT statements from
	* the dump so that the restore does not fail if the install DB owner differs from
	* the production DB owner.  The `--role` flag re-applies the target owner at
	* restore time.
	*
	* @param bool $skip_if_exists - when true, return success immediately if the
	*                               target database already exists
	* @param array $exclude_data_tables - table names whose DATA is skipped during the clone
	*                               (pg_dump --exclude-table-data). Their schema/sequences are
	*                               still cloned; only their rows are omitted. Used to avoid
	*                               copying production-scale data that clean_tables() would
	*                               delete anyway. Each name is validated and shell-quoted.
	*                               Defaults to [] (full data clone) for general-purpose callers.
	* @param array $exclude_tables - table names skipped ENTIRELY (pg_dump --exclude-table):
	*                               neither schema nor data is cloned. Used to drop legacy/dev
	*                               tables (jer_dd, *_test, *_bk, temp) that are not part of the
	*                               install image, so they are never copied. Safe because the
	*                               Dédalo schema declares no foreign keys (relations are JSONB
	*                               locators). Each name is validated and shell-quoted. Defaults
	*                               to [] for general-purpose callers.
	* @return object $response - result:true on success, result:false with msg on failure
	*/
	public static function clone_database_dump(bool $skip_if_exists, array $exclude_data_tables = [], array $exclude_tables = []) : object {

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
			// Build --exclude-table-data flags: fully-emptied tables ship as schema only,
			// so their production-scale row data is never copied into the install DB (it
			// would only be deleted again by clean_tables). This turns clone cost from
			// O(production size) into ~O(install size). Each identifier is validated against
			// the safe-identifier regex and shell-quoted (SEC-041 defence-in-depth) — the
			// list comes from install_config_manager (deployer-controlled), not HTTP input.
				$exclude_data_flags = '';
				foreach ($exclude_data_tables as $t) {
					if (!is_string($t) || !preg_match('/^[a-z_][a-z0-9_$]*$/', $t)) {
						debug_log(__METHOD__.' Skipping invalid exclude-data table identifier: '.to_string($t), logger::ERROR);
						continue;
					}
					$exclude_data_flags .= ' --exclude-table-data=' . escapeshellarg('public.'.$t);
				}

			// Build --exclude-table flags: legacy/dev tables are not part of the install image,
			// so neither their schema nor data is copied. Same identifier validation + quoting.
				$exclude_table_flags = '';
				foreach ($exclude_tables as $t) {
					if (!is_string($t) || !preg_match('/^[a-z_][a-z0-9_$]*$/', $t)) {
						debug_log(__METHOD__.' Skipping invalid exclude-table identifier: '.to_string($t), logger::ERROR);
						continue;
					}
					$exclude_table_flags .= ' --exclude-table=' . escapeshellarg('public.'.$t);
				}

			$pg_dump_cmd = system::get_pg_bin_path()
				. 'pg_dump '
				. $config->host_line . ' ' . $config->port_line
				. ' -U ' . escapeshellarg(DEDALO_USERNAME_CONN)
				. ' --no-owner --no-privileges'
				. ' --role=' . escapeshellarg(DEDALO_USERNAME_CONN)
				. $exclude_data_flags
				. $exclude_table_flags
				. ' ' . escapeshellarg(DEDALO_DATABASE_CONN);

			$psql_cmd = system::get_pg_bin_path()
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
				$output			= [];
				$result_code	= 0;

				// Authenticate via PGPASSWORD (read by libpq for both pg_dump and psql) instead
				// of a ~/.pgpass file, so the source/target DB may be REMOTE. DBi::pg_exec sets
				// the secret only around this exec and clears it immediately after; it is never
				// interpolated into $command, so it reaches neither the debug log nor the process
				// argument list.
				DBi::pg_exec($command, $output, $result_code);

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
	* LOAD_FILTERED_MATRIX_ONTOLOGY
	* Loads ONLY the preserved TLD-root rows of matrix_ontology from the source database into
	* the (selectively-cloned, schema-only) install database. matrix_ontology holds one root
	* record per ontology node; the install image needs just the roots of the preserved TLDs
	* (section_tipo = '<tld>0', e.g. 'dd0','rsc0') — about 8 of ~18 000 rows. Loading only those
	* rows directly, instead of cloning the full ~130 MB table and pruning it in clean_tables(),
	* avoids copying production-scale data the build would immediately discard.
	*
	* Mechanism: a cross-database filtered COPY over a psql pipe
	*   psql <source>  -c "\copy (SELECT * FROM matrix_ontology WHERE section_tipo IN (...)) TO STDOUT"
	*     | psql <install> -c "\copy matrix_ontology FROM STDIN"
	* authenticated with PGPASSWORD (DBi::pg_exec) so source and install may be REMOTE. The
	* preserved section_tipo roots derive from install_config_manager::get_config()->to_preserve_tld
	* — the same single source of truth clean_tables() uses for its matrix_ontology pruning.
	*
	* Reliability: a shell pipe reports only the LAST stage's exit code, so a source-side failure
	* (empty stream) would not surface as non-zero. The loaded row count is therefore verified
	* against the source's filtered count; a mismatch returns an error.
	*
	* @return object $response - result:true on success, result:false with msg on failure
	*/
	public static function load_filtered_matrix_ontology() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		$config	= install_config_manager::get_config();
		$exec	= true;

		// preserved section_tipo roots ('<tld>0'). SEC: config-derived; validate each against
		// the safe-identifier regex and single-quote (escaping any quote) for the IN-list.
			$roots = [];
			foreach ($config->to_preserve_tld as $tld) {
				$st = $tld.'0';
				if (!is_string($tld) || !preg_match('/^[a-z_][a-z0-9_$]*$/', $st)) {
					debug_log(__METHOD__.' Skipping invalid section_tipo root: '.to_string($st), logger::ERROR);
					continue;
				}
				$roots[] = "'".str_replace("'", "''", $st)."'";
			}
			if (empty($roots)) {
				$response->msg = 'Error: no valid preserved section_tipo roots';
				debug_log(__METHOD__.' '.$response->msg, logger::ERROR);
				return $response;
			}
			$in_list = implode(',', $roots);

		// expected row count from source (post-load verification)
			$expected = null;
			$src_conn = DBi::_getConnection();
			$rc = pg_query($src_conn, 'SELECT count(*) AS n FROM "matrix_ontology" WHERE section_tipo IN ('.$in_list.');');
			if ($rc!==false) {
				$expected = (int)(pg_fetch_assoc($rc)['n'] ?? 0);
			}

		// cross-database filtered COPY: source → install (psql pipe, PGPASSWORD auth)
			$pg = system::get_pg_bin_path();
			$src_cmd = $pg.'psql '.$config->host_line.' '.$config->port_line
				.' -U '.escapeshellarg(DEDALO_USERNAME_CONN)
				.' -d '.escapeshellarg(DEDALO_DATABASE_CONN)
				.' -v ON_ERROR_STOP=1 -c '.escapeshellarg('\copy (SELECT * FROM "matrix_ontology" WHERE section_tipo IN ('.$in_list.')) TO STDOUT');
			$dst_cmd = $pg.'psql '.$config->host_line.' '.$config->port_line
				.' -U '.escapeshellarg(DEDALO_USERNAME_CONN)
				.' -d '.escapeshellarg($config->db_install_name)
				.' -v ON_ERROR_STOP=1 -c '.escapeshellarg('\copy "matrix_ontology" FROM STDIN');
			$command = $src_cmd.' | '.$dst_cmd;

			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL.to_string($command), logger::WARNING);
			if ($exec) {
				$output			= [];
				$result_code	= 0;
				DBi::pg_exec($command, $output, $result_code);
				if ($result_code !== 0) {
					$msg = ' Error: matrix_ontology filtered COPY failed with exit code '.$result_code;
					debug_log(__METHOD__.$msg.PHP_EOL.to_string($output), logger::ERROR);
					$response->msg = $msg;
					return $response;
				}

				// verify loaded count == source filtered count (pipe reports only last stage)
				$install_conn = install_config_manager::get_db_install_conn();
				if ($install_conn!==false && $expected!==null) {
					$vr		= pg_query($install_conn, 'SELECT count(*) AS n FROM "matrix_ontology";');
					$actual	= ($vr!==false) ? (int)(pg_fetch_assoc($vr)['n'] ?? -1) : -1;
					if ($actual !== $expected) {
						$msg = " Error: matrix_ontology load mismatch (expected $expected, got $actual)";
						debug_log(__METHOD__.$msg, logger::ERROR);
						$response->msg = $msg;
						return $response;
					}
				}
			}

		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;

		return $response;
	}//end load_filtered_matrix_ontology

	/**
	* CLEAN_COUNTERS
	* Resets the section-ID counter tables and selectively prunes the ontology
	* counter table (`main_dd`) in the install (target) database.
	*
	* Counter tables affected:
	* - `matrix_counter`       — section-ID counters for project data
	* - `matrix_counter_dd`    — section-ID counters for Dédalo ontology data
	* Both are TRUNCATED and their auto-increment sequences are reset to 1.
	* The counters are regenerated automatically the next time a new section is
	* saved, so re-seeding from 1 is always safe on a freshly cloned install DB.
	*
	* Ontology counter pruning (`main_dd`):
	* Rows whose `tld` column belongs to the whitelist defined in
	* `$config->to_preserve_tld` (e.g. 'dd', 'rsc', 'lg') are kept so that
	* the core Dédalo ontology retains its canonical counters.  All other rows
	* (project-specific TLDs) are deleted to avoid collision with a different
	* installation that may have different TLD counter state.
	*
	* The `main_dd` step is only executed when the table exists (guarded by
	* `DBi::check_table_exists`) to tolerate minimal install DBs that have not
	* yet run the ontology bootstrap.
	*
	* @return object $response - result:true on success, result:false with msg on failure
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
	* Strips all project-specific data from the install (target) database while
	* preserving the core Dédalo ontology and structural tables.
	*
	* Three passes are executed against the install database, in order:
	*
	*   Pass 1 — Drop non-official tables:
	*     Any table in the install DB that is NOT listed in
	*     `$config->valid_tables` is dropped with `DROP TABLE … CASCADE`.
	*     This removes temporary, test, or development tables that were present
	*     in the cloned source but should not ship in the install package.
	*
	*   Pass 2 — Clean whitelisted matrices:
	*     Each table in `$config->to_clean_tables` is processed with
	*     table-specific logic:
	*     - `matrix_ontology`: DELETE rows whose `section_tipo` does not match
	*       any preserved TLD root (TLD + '0' suffix, e.g. 'dd0').
	*     - `matrix_ontology_main`: DELETE rows that lack a `hierarchy6` entry
	*       whose 'lang' == 'lg-nolan' and 'value' is in the preserved TLD set.
	*       Rows with a missing or empty `hierarchy6` array are also deleted.
	*     - All other tables: DELETE all rows and restart the id_seq sequence at 1.
	*       `matrix_activity` additionally resets `matrix_activity_section_id_seq`.
	*
	*   Pass 3 — Optimize:
	*     `VACUUM ANALYZE` is run against every remaining table so that the
	*     install DB is compact and has up-to-date planner statistics.
	*
	* Note: the `$response->errors` property (array) accumulates non-fatal
	* error labels even when one pass fails and returns early, allowing callers
	* to surface all errors rather than only the first.
	*
	* @return object $response - result:true on success, result:false with msg and errors[] on failure
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
			// Guard: with selective cloning (--exclude-table) the non-valid tables are never
			// copied, so there may be nothing to drop. An empty string passed to pg_query()
			// is itself a "query failed" error, so only run when at least one DROP was built.
			if (!empty($sentences)) {
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
						// In matrix_ontology each TLD's root record has section_tipo = TLD + '0'
						// (e.g. 'dd0', 'rsc0').  Rows with any other section_tipo belong to
						// project-specific ontology and must be removed from the install DB.
						$ar_sections = array_map(function($tld){
							return "'{$tld}0'";
						}, $config->to_preserve_tld);
						$sql = 'DELETE FROM "' . $table . '" WHERE section_tipo NOT IN (' . implode(',', $ar_sections) . ');';
						break;

					case 'matrix_ontology_main':
						// matrix_ontology_main holds the JSONB representation of each ontology
						// node.  The hierarchy6 array inside the 'string' JSONB column encodes
						// the node's ancestry path; the entry with lang='lg-nolan' contains the
						// TLD identifier.  We keep only rows whose ancestry includes a preserved
						// TLD value ('dd', 'rsc', etc.).  Rows that have no hierarchy6 at all
						// are also deleted — they are orphaned or partially-migrated records.
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
						// For all other listed tables: delete every row and reset the primary
						// sequence to 1 so fresh installs always start IDs from a known baseline.
						$sql = 'DELETE FROM "' . $table . '"; ALTER SEQUENCE IF EXISTS ' . $table . '_id_seq RESTART WITH 1;';
						if (in_array($table, ['matrix_activity', 'matrix_activity_diffusion'], true)) {
							// These tables have a second sequence (section_id) independent of the
							// primary id sequence; both must be reset to avoid gaps.
							$sql .= 'ALTER SEQUENCE IF EXISTS ' . $table . '_section_id_seq RESTART WITH 1;';
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
	* Installs the PostgreSQL extensions and helper functions that Dédalo
	* requires for full-text search and accent-insensitive indexing.
	*
	* Objects created (idempotent — uses `CREATE … IF NOT EXISTS` /
	* `CREATE OR REPLACE`):
	*
	* - `unaccent`  — removes diacritics from text; used by full-text search
	*                 across all component types that store textual data.
	* - `pg_trgm`   — trigram similarity; backs the `%` LIKE operator used in
	*                 the SQO ILIKE / trigram search paths.
	* - `f_unaccent(text)`  — a thin IMMUTABLE SQL wrapper around
	*                 `public.unaccent('public.unaccent', $1)`.  Declaring it
	*                 IMMUTABLE allows PostgreSQL to use it inside functional
	*                 indexes (e.g. `CREATE INDEX … ON matrix USING gin
	*                 (f_unaccent(string::text) gin_trgm_ops)`).
	*
	* This method targets the *install* database connection returned by
	* `install_config_manager::get_db_install_conn()`, not the production DB.
	* It must be called after the target database has been created (either by
	* `clone_database` / `clone_database_dump` or by `install_db_from_default_file`).
	*
	* @return object $response - result:true on success, result:false with msg on failure
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
