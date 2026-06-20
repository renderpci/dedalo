<?php declare(strict_types=1);
/**
* CLASS DBI
* Central database interface layer for Dédalo's PostgreSQL (and auxiliary MySQL) connections.
*
* All Dédalo server code must obtain database connections through this class rather than
* opening connections directly. Responsibilities include:
* - Maintaining a per-process singleton PgSql\Connection with time-windowed validity checks
*   to avoid redundant pg_connection_status() calls on every query.
* - Transparent support for persistent connections (pg_pconnect) including abandoned-transaction
*   recovery — critical for PHP-FPM/worker-pool environments where a pooled connection may
*   arrive with a leftover transaction block from a previous request.
* - A SAVEPOINT-based nested transaction protocol: depth-0 callers issue a real BEGIN/COMMIT;
*   nested callers transparently receive SAVEPOINTs so they can rollback independently without
*   cancelling an outer transaction.
* - Schema introspection helpers (check_table_exists, get_tables, check_column_exists,
*   add_column, remove_column, get_indexes, get_functions, get_constraint_name_from_index) used
*   during migration and bootstrap.
* - An optional PDO accessor (_getConnectionPDO) and a legacy MySQLi accessor
*   (_getConnection_mysql) for the few paths that still use those interfaces.
*
* This class is declared abstract so it cannot be instantiated; all methods are static.
* To close the cached connection explicitly call pg_close(DBi::_getConnection()).
*
* @package Dédalo
* @subpackage Core
*/
abstract class DBi {



	/**
	* CLASS VARS
	*/
		/**
		 * Cached PostgreSQL connection instance.
		 * Stores the active PgSql\Connection between calls to avoid a round-trip handshake on
		 * every query. Invalidated (set to null) whenever the connection is found dead or
		 * invalidate_connection_cache() is called.
		 * @var ?PgSql\Connection $pg_conn_cache
		 */
		private static ?PgSql\Connection $pg_conn_cache = null;

		/**
		 * Unix timestamp (seconds) until which the cached connection is assumed healthy.
		 * Avoids calling pg_connection_status() on every request by re-using the cached
		 * connection without a status check until this timestamp is exceeded. Reset to
		 * $now + $connection_check_interval on each cache hit or fresh connection.
		 * @var int $pg_conn_valid_until
		 */
		private static int $pg_conn_valid_until = 0;

		/**
		 * How many seconds between mandatory pg_connection_status() checks.
		 * A 30-second window trades minor staleness risk for significant overhead reduction in
		 * high-throughput worker processes. Lower this value if connection drops go undetected.
		 * @var int $connection_check_interval
		 */
		private static int $connection_check_interval = 30;

		/**
		 * Registry of prepared statement names already registered with PostgreSQL.
		 * Keys are the md5-derived statement names used by exec_search and similar callers.
		 * Must be cleared together with the connection cache (see invalidate_connection_cache)
		 * because PostgreSQL prepared statements are session-scoped: a new connection does not
		 * inherit statements defined on a previous one.
		 * @var array $prepared_statements
		 */
		public static array $prepared_statements = [];

		/**
		 * Current managed transaction nesting depth.
		 * 0 = no active Dédalo transaction.
		 * 1 = a real BEGIN has been issued (or a SAVEPOINT at depth 1 if the connection was
		 *     already inside an external transaction block).
		 * >1 = each additional begin_transaction() call creates a named SAVEPOINT so inner
		 *      code can roll back independently without cancelling the outer block.
		 * @var int $tx_depth
		 */
		private static int $tx_depth = 0;

		/**
		 * Whether Dédalo's depth-1 begin_transaction() issued the real BEGIN.
		 * True  → depth-1 commit/rollback must issue COMMIT/ROLLBACK.
		 * False → the connection was already inside an externally opened transaction when the
		 *         first begin_transaction() was called; depth-1 was mapped to a SAVEPOINT and
		 *         commit/rollback must not touch the outer block.
		 * @var bool $tx_owns_begin
		 */
		private static bool $tx_owns_begin = false;



	/**
	* _GETCONNECTION
	* Primary PostgreSQL connection accessor for all Dédalo server code.
	*
	* Returns the cached PgSql\Connection when the cache is warm and the connection is
	* still healthy. Performs a full pg_connect() (or pg_pconnect() when the
	* PERSISTENT_CONNECTION constant is true) only when no valid cached connection exists.
	*
	* Connection validity is checked lazily: pg_connection_status() is only called after
	* $connection_check_interval seconds have elapsed since the last successful check, which
	* avoids a syscall on every query in high-throughput paths.
	*
	* Persistent-connection safety: when pg_pconnect() returns a reused backend,
	* any lingering INTRANS or INERROR block is rolled back immediately to prevent
	* worker-pool state bleed (see audit-2026-06-worker-state-bleed).
	*
	* Socket connections: when $host is null and $socket is provided, the socket path is
	* passed as the libpq 'host' parameter (PostgreSQL's convention for Unix-socket paths).
	*
	* @param string|null $host = DEDALO_HOSTNAME_CONN - PostgreSQL host; null for socket/default
	* @param string $user = DEDALO_USERNAME_CONN - Database user
	* @param string $password = DEDALO_PASSWORD_CONN - Database password
	* @param string $database = DEDALO_DATABASE_CONN - Database name
	* @param string|int|null $port = DEDALO_DB_PORT_CONN - Port; ignored when $host is null
	* @param string|null $socket = DEDALO_SOCKET_CONN - Unix socket path used when $host is null
	* @param bool $cache = true - Return and store the cached connection; pass false to force a new one
	* @return PgSql\Connection|false - Active connection on success, false on failure
	*/
	public static function _getConnection(
		string|null		$host		= DEDALO_HOSTNAME_CONN,
		string			$user		= DEDALO_USERNAME_CONN,
		string			$password	= DEDALO_PASSWORD_CONN,
		string			$database	= DEDALO_DATABASE_CONN,
		string|int|null	$port		= DEDALO_DB_PORT_CONN,
		string|null		$socket		= DEDALO_SOCKET_CONN,
		bool			$cache		= true
		) : PgSql\Connection|false {

		if(SHOW_DEBUG===true) {
			$start_time = start_time();
			// metrics
			metrics::inc('db_connection_total_calls');
		}

		$now = time();

		// If caching is enabled and a connection is cached and recently validated
		if ($cache && self::$pg_conn_cache instanceof PgSql\Connection) {
			// Only check status if the cached validity has expired
			if ($now < self::$pg_conn_valid_until ||
				pg_connection_status(self::$pg_conn_cache) === PGSQL_CONNECTION_OK) {
				self::$pg_conn_valid_until = $now + self::$connection_check_interval;
				metrics::inc('db_connection_total_calls_cached');
				return self::$pg_conn_cache;
			}
			// Connection is dead, clear cache
			self::$pg_conn_cache = null;
			self::$pg_conn_valid_until = 0;
		}

		// Build connection string parameters
		$params = [
			"dbname=$database",
			"user=$user",
			"password=$password"
		];

		if ($host !== null) {
			$params[] = "host=$host";
		}

		// Only add port if it's a non-null and non-zero value, or if host is null (implies socket or default host)
		// If host is null and socket is also null, PostgreSQL will try to connect via default socket.
		if ($host !== null && $port !== null && (int)$port > 0) {
			$params[] = "port=" . (int)$port;
		} elseif ($host === null && $socket !== null) {
			// Use socket if host is null and socket is provided
			$params[] = "host=$socket"; // PostgreSQL uses 'host' parameter for socket path
		}

		$str_connect = implode(' ', $params);

		$pg_conn_real = (defined('PERSISTENT_CONNECTION') && PERSISTENT_CONNECTION===true)
			? pg_pconnect($str_connect) // persistent version. Use with caution, or consider using 'pg_bouncer' or a similar tool.
			: pg_connect($str_connect); // default

		if ($pg_conn_real === false) {
			// NB: pg_last_error() with no argument requires an already-open connection and THROWS
			// ("No PostgreSQL connection opened yet") when the very first connect fails — exactly the
			// fresh-install / DB-down case. Use the PHP warning emitted by pg_connect instead.
			$last_php_error = error_get_last();
			$errorMessage   = (is_array($last_php_error) && !empty($last_php_error['message']))
				? $last_php_error['message']
				: 'Unknown PostgreSQL connection error.';
			debug_log(
				__METHOD__ . ' Error. Could not connect to database (52) for ' . to_string($database) . '. Details: ' . $errorMessage,
				logger::ERROR
			);
			return false;
		}

		// When using persistent connections (pg_pconnect), we must ensure we aren't inheriting
		// an aborted transaction block from a previous request (worker instance pool overlap).
		if (defined('PERSISTENT_CONNECTION') && PERSISTENT_CONNECTION === true) {
			$txn_status = pg_transaction_status($pg_conn_real);
			if ($txn_status === PGSQL_TRANSACTION_INTRANS || $txn_status === PGSQL_TRANSACTION_INERROR) {
				debug_log(__METHOD__ . " Notice: Rolling back abandoned transaction from pooled connection.", logger::WARNING);
				pg_query($pg_conn_real, "ROLLBACK");
			}
		}

		// debug
		if (SHOW_DEBUG===true) {
			$time = exec_time_unit($start_time, 'ms');
			// metrics
			metrics::add_time_ms('db_connection_total_time', $time);
		}

		// If caching is not requested, return the fresh connection immediately
		if (!$cache) {
			return $pg_conn_real;
		}

		// cache is true case. Cache the successful connection
		self::$pg_conn_cache = $pg_conn_real;
		self::$pg_conn_valid_until = $now + self::$connection_check_interval;


		return self::$pg_conn_cache;
	}//end _getConnection



	/**
	* INVALIDATE_CONNECTION_CACHE
	* Discards the cached PostgreSQL connection and resets the validity timer,
	* forcing _getConnection() to open a fresh connection on the next call.
	*
	* Use this after any external event that may have killed the underlying backend
	* (e.g. pg_terminate_backend(), a DBA SIGKILL, or a detected network partition).
	* Also resets $prepared_statements because PostgreSQL prepared statements are
	* session-scoped: they do not survive a reconnect. Leaving the registry populated
	* after a reconnect would cause exec_search to skip re-preparing on the new session
	* and fail with "prepared statement does not exist".
	* @return void
	*/
	public static function invalidate_connection_cache() : void {
		self::$pg_conn_cache = null;
		self::$pg_conn_valid_until = 0;
		// DB-02: prepared statements are bound to the (now dead) connection. The
		// tracking map must be cleared too, otherwise exec_search sees a stale
		// md5 key, skips re-preparing on the fresh connection and then fails with
		// "prepared statement does not exist".
		self::$prepared_statements = [];
	}//end invalidate_connection_cache



	/**
	* BEGIN_TRANSACTION
	* Starts or nests a managed transaction on the cached connection.
	*
	* Nesting protocol:
	* - Depth 0 AND connection is IDLE → issues a real BEGIN. $tx_owns_begin = true.
	* - Depth 0 AND connection is already IN TRANSACTION (external block) → creates
	*   SAVEPOINT dd_tx_1. $tx_owns_begin = false, so commit/rollback will not issue
	*   COMMIT/ROLLBACK against the outer block.
	* - Depth ≥ 1 → creates SAVEPOINT dd_tx_{depth+1}. The inner block can roll back
	*   independently; the outer block continues.
	*
	* Callers can use this pattern safely without knowing whether they are nested:
	*   DBi::begin_transaction();
	*   // ... do work ...
	*   DBi::commit_transaction();  // or rollback_transaction() on error
	*
	* @return bool - false when no connection is available or the BEGIN/SAVEPOINT fails
	*/
	public static function begin_transaction() : bool {

		$conn = self::_getConnection();
		if ($conn === false) {
			debug_log(__METHOD__ . ' Error. No DB connection available', logger::ERROR);
			return false;
		}

		if (self::$tx_depth === 0 && pg_transaction_status($conn) === PGSQL_TRANSACTION_IDLE) {
			$result = pg_query($conn, 'BEGIN');
			$owns_begin = true;
		} else {
			$savepoint	= 'dd_tx_' . (self::$tx_depth + 1);
			$result		= pg_query($conn, 'SAVEPOINT ' . $savepoint);
			$owns_begin = (self::$tx_depth === 0) ? false : self::$tx_owns_begin;
		}

		if ($result === false) {
			debug_log(__METHOD__
				. ' Error. Unable to begin transaction (depth: '. self::$tx_depth .')' . PHP_EOL
				. ' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false;
		}

		if (self::$tx_depth === 0) {
			self::$tx_owns_begin = $owns_begin;
		}
		self::$tx_depth++;

		return true;
	}//end begin_transaction



	/**
	* COMMIT_TRANSACTION
	* Commits or releases the current managed transaction level.
	*
	* - Depth 1 + $tx_owns_begin true → issues a real COMMIT. Refuses to commit when
	*   the PostgreSQL transaction status is INERROR (aborted block); rolls back instead
	*   and returns false to prevent a silent data loss.
	* - Depth 1 + $tx_owns_begin false → releases SAVEPOINT dd_tx_1 (the outer block
	*   owned the BEGIN and must not be committed here).
	* - Depth >1 → releases SAVEPOINT dd_tx_{depth}.
	*
	* Callers should treat a false return as an unrecoverable failure for the current
	* operation and propagate the error upward.
	* @return bool - false when no active transaction exists, no connection is available,
	*                the transaction is in aborted state, or the SQL command fails
	*/
	public static function commit_transaction() : bool {

		if (self::$tx_depth < 1) {
			debug_log(__METHOD__ . ' Error. commit_transaction called without active transaction', logger::ERROR);
			return false;
		}

		$conn = self::_getConnection();
		if ($conn === false) {
			debug_log(__METHOD__ . ' Error. No DB connection available', logger::ERROR);
			return false;
		}

		// Never commit an aborted transaction block
		if (pg_transaction_status($conn) === PGSQL_TRANSACTION_INERROR) {
			debug_log(__METHOD__ . ' Error. Transaction is in aborted state; rolling back instead of commit', logger::ERROR);
			self::rollback_transaction();
			return false;
		}

		if (self::$tx_depth === 1 && self::$tx_owns_begin === true) {
			$result = pg_query($conn, 'COMMIT');
		} else {
			$savepoint	= 'dd_tx_' . self::$tx_depth;
			$result		= pg_query($conn, 'RELEASE SAVEPOINT ' . $savepoint);
		}

		if ($result === false) {
			debug_log(__METHOD__
				. ' Error. Unable to commit transaction (depth: '. self::$tx_depth .')' . PHP_EOL
				. ' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false;
		}

		self::$tx_depth--;

		return true;
	}//end commit_transaction



	/**
	* ROLLBACK_TRANSACTION
	* Rolls back or unwinds the current managed transaction level.
	*
	* - Depth 1 + $tx_owns_begin true → issues a real ROLLBACK, undoing all work since BEGIN.
	* - Depth 1 + $tx_owns_begin false → rolls back to SAVEPOINT dd_tx_1 then releases it
	*   (the outer transaction block is left intact and continues to be usable).
	* - Depth >1 → rolls back to SAVEPOINT dd_tx_{depth} then releases it; only the inner
	*   block's changes are undone.
	*
	* On pg_query failure the depth counter is decremented anyway so the nesting stack does
	* not get stuck. The _getConnection() persistent-connection guard will handle any lingering
	* aborted block on the next request.
	* @return bool - false when no active transaction exists, no connection is available,
	*                or the SQL command fails (depth is still decremented in that case)
	*/
	public static function rollback_transaction() : bool {

		if (self::$tx_depth < 1) {
			debug_log(__METHOD__ . ' Error. rollback_transaction called without active transaction', logger::ERROR);
			return false;
		}

		$conn = self::_getConnection();
		if ($conn === false) {
			debug_log(__METHOD__ . ' Error. No DB connection available', logger::ERROR);
			return false;
		}

		if (self::$tx_depth === 1 && self::$tx_owns_begin === true) {
			$result = pg_query($conn, 'ROLLBACK');
		} else {
			$savepoint	= 'dd_tx_' . self::$tx_depth;
			$result		= pg_query($conn, 'ROLLBACK TO SAVEPOINT ' . $savepoint . '; RELEASE SAVEPOINT ' . $savepoint);
		}

		if ($result === false) {
			debug_log(__METHOD__
				. ' Error. Unable to rollback transaction (depth: '. self::$tx_depth .')' . PHP_EOL
				. ' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			// Decrement anyway; the connection level guard in _getConnection
			// will recover abandoned transaction blocks on pooled connections.
			self::$tx_depth--;
			return false;
		}

		self::$tx_depth--;

		return true;
	}//end rollback_transaction



	/**
	* TRANSACTION
	* Convenience wrapper: runs a callable inside a managed transaction and returns its result.
	*
	* Begins a transaction (or SAVEPOINT when nested), executes $fn(), then commits.
	* If $fn() throws any Throwable the transaction is rolled back before the exception is
	* rethrown, ensuring no partial writes leak to the outer scope.
	*
	* Nested usage is safe: inner DBi::transaction() calls receive a SAVEPOINT, so an inner
	* failure only rolls back the inner block (see begin_transaction for the full protocol).
	*
	* Example:
	*   $result = DBi::transaction(function() use ($data) {
	*       // ... perform inserts/updates ...
	*       return $data->id;
	*   });
	*
	* @param callable $fn - The work unit to execute; its return value is forwarded to the caller
	* @return mixed - Whatever $fn() returns
	* @throws RuntimeException When begin_transaction() or commit_transaction() fails
	* @throws Throwable Re-throws any exception thrown by $fn() after rolling back
	*/
	public static function transaction( callable $fn ) : mixed {

		if (self::begin_transaction() === false) {
			throw new RuntimeException(__METHOD__ . ' Unable to begin database transaction');
		}

		try {
			$result = $fn();
		} catch (Throwable $e) {
			self::rollback_transaction();
			throw $e;
		}

		if (self::commit_transaction() === false) {
			throw new RuntimeException(__METHOD__ . ' Unable to commit database transaction');
		}

		return $result;
	}//end transaction



	/**
	* IN_TRANSACTION
	* Reports whether Dédalo's managed transaction stack is active.
	*
	* Returns true at any nesting depth ≥ 1. Does not inspect the underlying
	* PostgreSQL transaction status; only tracks the depth counter maintained
	* by begin/commit/rollback_transaction(). Use pg_transaction_status() directly
	* if you need to detect externally opened or aborted PostgreSQL blocks.
	* @return bool - true when $tx_depth > 0 (a managed transaction is open)
	*/
	public static function in_transaction() : bool {

		return self::$tx_depth > 0;
	}//end in_transaction



	/**
	* BUILD_CONN_FLAGS
	* Pure builder for the -h/-p/-U flag fragment used by every server-side psql /
	* pg_dump invocation. Kept free of Dédalo constants so it is unit-testable and
	* so the install path and the runtime path share one escaping rule (they used to
	* diverge — only the install path escaped its values).
	*
	* Rules:
	* - Every value is passed through escapeshellarg() — defence-in-depth against a
	*   deployer-supplied host/user that carries whitespace or shell metacharacters.
	* - When $host is empty but $socket is set, the socket directory is emitted as the
	*   -h argument (libpq / psql accept a directory path there). This makes socket-only
	*   installs work for the CLI tools, matching the PHP pg_connect() socket path.
	* - Empty values emit NO flag, so a fresh / unconfigured install never produces a
	*   broken "-h " fragment; libpq then falls back to its own default resolution.
	*
	* @param string|null $host   DEDALO_HOSTNAME_CONN value (TCP host) or null/empty.
	* @param int|string|null $port DEDALO_DB_PORT_CONN value or null/empty.
	* @param string|null $user   DEDALO_USERNAME_CONN value or null/empty.
	* @param string|null $socket DEDALO_SOCKET_CONN value (socket dir) or null/empty.
	* @return string - Space-separated, shell-escaped connection flags.
	*/
	public static function build_conn_flags( ?string $host, int|string|null $port, ?string $user, ?string $socket=null ) : string {

		$ar_sentence = [];

		// host (real TCP host) takes precedence; otherwise fall back to the socket
		// directory so socket-only installs are not broken for CLI tools.
		if (!empty($host)) {
			$ar_sentence[] = '-h ' . escapeshellarg($host);
		} elseif (!empty($socket)) {
			$ar_sentence[] = '-h ' . escapeshellarg($socket);
		}

		// port
		if (!empty($port)) {
			$ar_sentence[] = '-p ' . escapeshellarg((string)$port);
		}

		// user
		if (!empty($user)) {
			$ar_sentence[] = '-U ' . escapeshellarg($user);
		}

		return implode(' ', $ar_sentence);
	}//end build_conn_flags



	/**
	* GET_CONNECTION_STRING
	* Builds a libpq / psql-compatible connection string fragment from the Dédalo constants.
	*
	* The returned string contains -h (host, or the socket directory when no TCP host is
	* configured) and optionally -p (port) and -U (user) flags suitable for shell invocation
	* of psql, pg_dump, etc. It does NOT include a password or the database name (callers
	* append the database as an escaped positional / -d argument). All values are shell-escaped
	* (see build_conn_flags). Only used by server-side tools that shell out to PostgreSQL utilities.
	* @return string - Space-separated connection flags, e.g. "-h 'localhost' -p '5432' -U 'dedalo'"
	*/
	public static function get_connection_string() : string {

		return self::build_conn_flags(
			defined('DEDALO_HOSTNAME_CONN') ? DEDALO_HOSTNAME_CONN : null,
			defined('DEDALO_DB_PORT_CONN') ? DEDALO_DB_PORT_CONN : null,
			defined('DEDALO_USERNAME_CONN') ? DEDALO_USERNAME_CONN : null,
			defined('DEDALO_SOCKET_CONN') ? DEDALO_SOCKET_CONN : null
		);
	}//end get_connection_string



	/**
	* PG_ENV_SET
	* Export the PostgreSQL password into the process environment so libpq-based
	* command-line tools (psql, pg_dump, pg_restore) can authenticate against a
	* LOCAL or REMOTE server without relying on a ~/.pgpass file.
	*
	* The secret is taken from DEDALO_PASSWORD_CONN and is NEVER interpolated into
	* a command string, so it reaches neither the process argument list (visible to
	* `ps`) nor any debug log of the command. Always pair with pg_env_clear() right
	* after the child process has been spawned. When the password is empty (peer /
	* trust auth, or an existing ~/.pgpass), nothing is exported and libpq falls back
	* to its own resolution.
	* @return void
	*/
	public static function pg_env_set() : void {

		$pg_password = (string)DEDALO_PASSWORD_CONN;
		if ($pg_password!=='') {
			putenv('PGPASSWORD='.$pg_password);
		}
	}//end pg_env_set



	/**
	* PG_ENV_CLEAR
	* Remove PGPASSWORD from the process environment. Call immediately after the
	* PostgreSQL child process has been spawned (the child already inherited the
	* value at fork time), so the secret does not linger for the rest of the request.
	* @return void
	*/
	public static function pg_env_clear() : void {

		putenv('PGPASSWORD');
	}//end pg_env_clear



	/**
	* PG_SHELL_EXEC
	* Run a PostgreSQL client shell command (psql / pg_dump / pipelines) with libpq
	* authentication via the PGPASSWORD environment variable (see pg_env_set), so the
	* target database may be LOCAL or REMOTE without a ~/.pgpass file. PGPASSWORD is
	* exported only for the duration of the child process and cleared immediately after.
	*
	* Binary-path resolution is the caller's responsibility — build commands with
	* system::get_pg_bin_path() so binaries are found on any host layout.
	*
	* @param string $command full shell command (binaries, -h/-p, -U, plus redirects/pipes)
	* @return string|null     shell_exec() return value (stdout, or null when there is none)
	*/
	public static function pg_shell_exec(string $command) : ?string {

		self::pg_env_set();
		$result = shell_exec($command);
		self::pg_env_clear();

		return $result;
	}//end pg_shell_exec



	/**
	* PG_EXEC
	* Like pg_shell_exec but uses exec() so the caller can capture the output lines
	* and the shell return code. PGPASSWORD is exported only around the call.
	*
	* @param string $command full shell command
	* @param array $output captured stdout lines (by reference)
	* @param int $result_code shell exit code (by reference)
	* @return string|false last line of output, or false on failure (exec() contract)
	*/
	public static function pg_exec(string $command, array &$output, int &$result_code) : string|false {

		self::pg_env_set();
		$last_line = exec($command, $output, $result_code);
		self::pg_env_clear();

		return $last_line;
	}//end pg_exec



	/**
	* _GETNEWCONNECTION
	* Opens a fresh PostgreSQL connection, bypassing the internal connection cache.
	*
	* Delegates to _getConnection() with $cache = false. Use this only when a
	* dedicated independent session is required (e.g. advisory-lock helpers, long-running
	* CLI tasks that must not share the per-request connection). Most callers should use
	* _getConnection() instead.
	*
	* Note: the return type declaration includes bool to match the legacy alias contract,
	* but in practice the method returns PgSql\Connection on success or false on failure.
	* PHP ≥ 8.1 returns a PgSql\Connection object; older versions returned a resource.
	*
	* @param string|null $host = DEDALO_HOSTNAME_CONN
	* @param string $user = DEDALO_USERNAME_CONN
	* @param string $password = DEDALO_PASSWORD_CONN
	* @param string $database = DEDALO_DATABASE_CONN
	* @param string|int|null $port = DEDALO_DB_PORT_CONN
	* @param string|null $socket = DEDALO_SOCKET_CONN
	* @return PgSql\Connection|bool - Active connection on success, false on failure
	*/
	public static function _getNewConnection(
		string|null		$host		= DEDALO_HOSTNAME_CONN,
		string			$user		= DEDALO_USERNAME_CONN,
		string			$password	= DEDALO_PASSWORD_CONN,
		string			$database	= DEDALO_DATABASE_CONN,
		string|int|null	$port		= DEDALO_DB_PORT_CONN,
		string|null		$socket		= DEDALO_SOCKET_CONN
		) : PgSql\Connection|bool {

		$pg_conn = DBi::_getConnection(
			$host,
			$user,
			$password,
			$database,
			$port,
			$socket,
			false // bool use cache (!
		);

		return $pg_conn;
	}//end _getNewConnection



	/**
	* _GETCONNECTIONPDO
	* Returns a PDO connection to the PostgreSQL database, caching the instance within
	* the function-static $pdo_conn variable for the lifetime of the PHP process.
	*
	* Use this accessor only for code paths that specifically require PDO (e.g. statement
	* parameter binding via PDOStatement). All other code should prefer _getConnection()
	* which uses the native pgsql extension and benefits from the class-level cache and
	* the persistent-connection safety guard.
	*
	* The $socket parameter is accepted for signature parity with _getConnection() but is
	* not currently wired into the PDO DSN. PDOExceptions are re-thrown unchanged so
	* callers can catch them normally.
	*
	* @param string|null $host = DEDALO_HOSTNAME_CONN
	* @param string $user = DEDALO_USERNAME_CONN
	* @param string $password = DEDALO_PASSWORD_CONN
	* @param string $database = DEDALO_DATABASE_CONN
	* @param string|int|null $port = DEDALO_DB_PORT_CONN - Included in DSN when non-empty
	* @param string|null $socket = DEDALO_SOCKET_CONN - Accepted but not used in DSN
	* @param bool $cache = true - Return the cached PDO instance when true
	* @return PDO|bool - PDO instance on success; false is theoretically unreachable
	*                    since PDOException is thrown on connection failure
	* @throws \PDOException On connection failure
	*/
	public static function _getConnectionPDO(
		string|null		$host		= DEDALO_HOSTNAME_CONN,
		string			$user		= DEDALO_USERNAME_CONN,
		string			$password	= DEDALO_PASSWORD_CONN,
		string			$database	= DEDALO_DATABASE_CONN,
		string|int|null	$port		= DEDALO_DB_PORT_CONN,
		string|null		$socket		= DEDALO_SOCKET_CONN,
		bool			$cache		= true
		) : PDO|bool {

		static $pdo_conn;
		if($cache===true && isset($pdo_conn)) {
			return($pdo_conn);
		}

		// PDO
			// DB-07: include the port in the DSN (it was accepted as a param but
			// dropped), so this helper connects consistently with _getConnection on
			// non-default ports.
			$dsn = 'pgsql:host=' . $host
				. (!empty($port) ? ';port=' . $port : '')
				. ';dbname=' . $database . ';';
			try {
				$pdo_conn = new PDO(
					$dsn, $user, $password, array(
						PDO::ATTR_ERRMODE =>  PDO::ERRMODE_EXCEPTION,
					)
				);
			} catch (\PDOException $e) {
				throw new \PDOException($e->getMessage(), (int)$e->getCode());
			}

		return $pdo_conn;
	}//end _getConnectionPDO



	/**
	* _GETCONNECTION_MYSQL
	* Returns a MySQLi connection to the auxiliary MySQL/MariaDB database.
	*
	* Used only by legacy import/export paths and the diffusion subsystem that still
	* target a MariaDB instance (distinct from Dédalo's primary PostgreSQL store).
	* All new code should target PostgreSQL via _getConnection(). Caches the mysqli
	* instance in a function-static variable for the process lifetime.
	*
	* Connection setup order: enable strict error reporting → init → set connect timeout
	* (10 s) → set autocommit (required for InnoDB row-level saves) → real_connect() →
	* set charset to utf8mb4.
	*
	* @param string|null $host = MYSQL_DEDALO_HOSTNAME_CONN
	* @param string $user = MYSQL_DEDALO_USERNAME_CONN
	* @param string $password = MYSQL_DEDALO_PASSWORD_CONN
	* @param string $database = MYSQL_DEDALO_DATABASE_CONN
	* @param int|null $port = MYSQL_DEDALO_DB_PORT_CONN
	* @param string|null $socket = MYSQL_DEDALO_SOCKET_CONN
	* @param bool $cache = true - Return the cached mysqli instance when true
	* @return mysqli|false - Connected mysqli instance, or false on any connection failure
	*/
	public static function _getConnection_mysql(
		string|null		$host		= MYSQL_DEDALO_HOSTNAME_CONN,
		string			$user		= MYSQL_DEDALO_USERNAME_CONN,
		string			$password	= MYSQL_DEDALO_PASSWORD_CONN,
		string			$database	= MYSQL_DEDALO_DATABASE_CONN,
		int|string|null	$port		= MYSQL_DEDALO_DB_PORT_CONN,
		string|null		$socket		= MYSQL_DEDALO_SOCKET_CONN,
		bool			$cache		= true
		) : mysqli|false {

		// cache
			static $mysqli;
			if($cache === true && isset($mysqli)) {
				return($mysqli);
			}

		// You should enable error reporting for mysqli before attempting to make a connection
		// @see https://www.php.net/manual/en/mysqli-driver.report-mode.php
			mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

		// init
			$mysqli = mysqli_init();
			if (!$mysqli) {
				debug_log(__METHOD__ . " Error: mysqli_init failed", logger::DEBUG);
				return false;
			}

		// options : set connect_timeout
			if (!$mysqli->options(MYSQLI_OPT_CONNECT_TIMEOUT, 10)) {
				debug_log(__METHOD__
					. " Error setting MYSQLI_OPT_CONNECT_TIMEOUT". PHP_EOL
					, logger::DEBUG
				);
			}

		// options : set autocommit (needed for INNODB save)
			if (!$mysqli->options(MYSQLI_INIT_COMMAND, 'SET AUTOCOMMIT = 1')) {
				debug_log(__METHOD__
					. " Error setting MYSQLI_INIT_COMMAND". PHP_EOL
					, logger::DEBUG
				);
			}

		// connect
			try {
				if ($port !== null && empty($port)) {
					$port = null;
				}
				if (!$mysqli->real_connect($host, $user, $password, $database, $port, $socket)) {
					debug_log(__METHOD__
						. " Error on connect to MYSQL database ". PHP_EOL
						. ' mysqli_connect_errno: ' .mysqli_connect_errno() . PHP_EOL
						. ' mysqli_connect_error: ' .mysqli_connect_error()
						, logger::DEBUG
					);
					return false;
				}
			} catch (mysqli_sql_exception $e) {
				debug_log(__METHOD__
					. " Error on connect to MYSQL database (Exception). ". PHP_EOL
					. ' Message: ' . $e->getMessage() . PHP_EOL
					. ' Code: ' . $e->getCode()
					, logger::DEBUG
				);
				return false;
			}

		// UTF8 : Change character set to utf8mb4
			if (!$mysqli->set_charset('utf8mb4')) {
				debug_log(__METHOD__
					." Error loading character set utf8mb4: ". PHP_EOL
					. 'mysqli->error: ' . $mysqli->error
					, logger::DEBUG
				);
			}


		return $mysqli;
	}//end _getConnection_mysql



	/**
	* CHECK_TABLE_EXISTS
	* Tests whether a table with the given name exists in the current database.
	*
	* Queries information_schema.tables (all schemas, not just 'public') using a
	* pg_escape_literal()-quoted parameter to prevent SQL injection. Returns false
	* both when the table does not exist and when the query itself fails; callers
	* must not treat false as "definitely does not exist" after a log error.
	* @param string $table - Table name to check (unquoted, raw)
	* @return bool - true when the table exists, false when it does not or on query failure
	*/
	public static function check_table_exists( string $table ) : bool {

		$conn = DBi::_getConnection();

		// No database connection (e.g. a fresh install before the DB is configured): the table
		// cannot exist, and pg_escape_literal()/pg_query() would fatal on a false connection.
		// Degrade gracefully — return false, consistent with the documented "does not exist".
		if ($conn === false) {
			return false;
		}

		$safe_table = pg_escape_literal($conn, $table);

		$sql = "
			SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $safe_table) AS table_exists;
		";

		$result = pg_query($conn, $sql);

		if ($result === false) {
			debug_log(
				__METHOD__
					. " Error. PostgreSQL query failed" . PHP_EOL
					. 'error: ' . pg_last_error($conn),
				logger::ERROR
			);
			return false;
		}

		$row = pg_fetch_object($result);

		// Used the explicit alias 'table_exists'
		$exists = ($row->table_exists === 't');


		return $exists;
	}//end check_table_exists



	/**
	* GET_TABLES
	* Returns the names of all user-defined base tables in the 'public' schema,
	* sorted alphabetically.
	*
	* Excludes views and system schemas. Used by migration scripts and bootstrap
	* routines to discover the current schema state before applying DDL changes.
	* An optional $conn parameter allows callers to pass a dedicated connection
	* (e.g. from _getNewConnection()) when they must not share the cached connection.
	* @param PgSql\Connection|null $conn = null - Connection to use; defaults to cached connection
	* @return array<string>|false - Sorted list of table name strings, or false on query failure
	*/
	public static function get_tables( ?PgSql\Connection $conn= null ) : array|false {

		$conn = $conn ?? DBi::_getConnection();

		$sql = "
			SELECT table_name
			FROM information_schema.tables
			WHERE table_schema = 'public'
			AND table_type = 'BASE TABLE'
			ORDER BY table_name;
		";

		$result = pg_query($conn, $sql);

		if ($result === false) {
			debug_log(
				__METHOD__
					. " Error. PostgreSQL query failed" . PHP_EOL
					. 'error: ' . pg_last_error($conn),
				logger::ERROR
			);
			return false;
		}

		$tables = [];
		while ($row = pg_fetch_object($result)) {
			$tables[] = $row->table_name;
		}


		return $tables;
	}//end get_tables



	/**
	* CHECK_COLUMN_EXISTS
	* Tests whether a specific column exists in the given table.
	*
	* Both $table and $column are safely escaped with pg_escape_literal() before being
	* embedded in the SQL, which adds the required single-quote delimiters for
	* information_schema comparisons. The query checks across all schemas (not only
	* 'public') — a deliberate choice that mirrors check_table_exists.
	* @param string $table - Table name (unquoted)
	* @param string $column - Column name (unquoted)
	* @return bool - true when the column exists, false when absent or on query failure
	*/
	public static function check_column_exists( string $table, string $column ) : bool {

		$conn = DBi::_getConnection();

		// Use pg_escape_literal to safely quote and escape the table and column names.
		// This function adds the necessary single quotes for the SQL string.
		$safe_table = pg_escape_literal($conn, $table);
		$safe_column = pg_escape_literal($conn, $column);

		$sql = "
			SELECT EXISTS (SELECT 1
			FROM information_schema.columns
			WHERE table_name = $safe_table AND column_name = $safe_column) AS column_exists;
		";

		$result = pg_query($conn, $sql);

		// Check if the query failed before attempting to fetch results.
		if ($result === false) {
			debug_log(
				__METHOD__
					. " Error. PostgreSQL query failed" . PHP_EOL
					. 'error: ' . pg_last_error($conn),
				logger::ERROR
			);
			return false;
		}

		$row = pg_fetch_object($result);

		// Use the alias 'column_exists' and check for the PostgreSQL 't' (true) value
		$exists = ($row->column_exists === 't');


		return $exists;
	}//end check_column_exists



	/**
	* ADD_COLUMN
	* Adds a column to an existing table if it does not already exist.
	*
	* Performs an idempotent check via check_column_exists() before issuing the ALTER TABLE.
	* If the column already exists the method returns true immediately without touching the
	* schema, making it safe to call during repeated migration runs.
	*
	* Table and column names are escaped with pg_escape_identifier() (double-quoted) to
	* handle reserved words and mixed-case identifiers. The $type parameter is interpolated
	* directly into the SQL without escaping — callers must supply a safe, validated type
	* string (e.g. 'jsonb NULL', 'text NOT NULL DEFAULT \'\'').
	*
	* When $comment is non-empty a second COMMENT ON COLUMN statement is issued.
	* A failure on the comment step is logged but does not roll back the column addition.
	*
	* (!) $type is NOT escaped. Never pass user-supplied input as $type.
	*
	* @param string $table - Target table name (unquoted)
	* @param string $column - Column name to add (unquoted)
	* @param mixed $type = 'jsonb NULL' - PostgreSQL column definition, e.g. 'text NOT NULL'
	* @param mixed $comment = '' - Optional column comment; empty string skips the COMMENT step
	* @return bool - true on success or when column already exists, false on ALTER failure
	*/
	public static function add_column( string $table, string $column, $type='jsonb NULL', $comment='' ) : bool {

		$conn = DBi::_getConnection();

		// check if column already exists before
		if (true===DBi::check_column_exists($table, $column)) {
			return true;
		}

		$safe_table = pg_escape_identifier($conn, $table);
		$safe_column = pg_escape_identifier($conn, $column);

		$sql_alter = "
			ALTER TABLE $safe_table
			ADD $safe_column $type;
		";

		$result_alter = pg_query($conn, $sql_alter);

		if ($result_alter === false) {
			debug_log(
				__METHOD__
					. " Error. PostgreSQL query failed" . PHP_EOL
					. 'error: ' . pg_last_error($conn),
				logger::ERROR
			);
			return false;
		}

		$added = true;

		// --- Statement 2: COMMENT ON COLUMN (Only if a comment is provided) ---
		if (!empty($comment)) {

			// We use pg_escape_literal for the actual comment string
			$safe_comment = pg_escape_literal($conn, $comment);

			$sql_comment = "
				COMMENT ON COLUMN $safe_table.$safe_column IS $safe_comment;
			";

			$result_comment = pg_query($conn, $sql_comment);

			if ($result_comment === false) {
				// The column was added, but the comment failed.
				error_log("PostgreSQL COMMENT ON COLUMN failed on $table.$column: " . pg_last_error($conn));
			}
		}

		return $added;
	}//end add_column



	/**
	* GET_INDEXES
	* Returns all user-defined indexes in the database (excluding pg_catalog and
	* information_schema), as a flat list of plain objects.
	*
	* Each object in the returned array has four properties:
	*   - schemaname  (string) e.g. 'public'
	*   - tablename   (string) e.g. 'matrix'
	*   - indexname   (string) e.g. 'matrix_section_tipo_section_id'
	*   - indexdef    (string) the full CREATE INDEX statement as stored in pg_indexes
	*
	* Used by migration and health-check tools to verify that expected GIN/BTREE indexes
	* are present and have the correct definition.
	* @return array|false - List of index descriptor objects sorted by schema then table, or false on error
	*/
	public static function get_indexes() : array|false {

		$conn = DBi::_getConnection();

		$sql = "
			SELECT
				schemaname,
				tablename,
				indexname,
				indexdef
			FROM
				pg_indexes
			WHERE
				schemaname NOT IN ('pg_catalog', 'information_schema')
			ORDER BY
				schemaname,
				tablename;
		";

		$result	= pg_query($conn, $sql);
		if ($result === false) {
			debug_log(
				__METHOD__
					. " Error. PostgreSQL query failed" . PHP_EOL
					. 'error: ' . pg_last_error($conn),
				logger::ERROR
			);
			return false;
		}

		$list = [];
		while($row = pg_fetch_assoc($result)) {

			$schemaname	= $row['schemaname'];
			$tablename	= $row['tablename'];
			$indexname	= $row['indexname'];
			$indexdef	= $row['indexdef'];

			$list[] = (object)[
				'schemaname'	=> $schemaname,
				'tablename'		=> $tablename,
				'indexname'		=> $indexname,
				'indexdef'		=> $indexdef
			];
		}

		return $list;
	}//end get_indexes




	/**
	* GET_FUNCTIONS
	* Returns all user-defined PostgreSQL functions, excluding built-ins and
	* extension-owned functions (e.g. unaccent from the unaccent extension).
	*
	* The extension exclusion is achieved by joining pg_depend and checking that no
	* matching pg_extension row exists (e ON d.refobjid = e.oid WHERE e.oid IS NULL).
	* This prevents false positives from functions installed by pg_trgm, unaccent, etc.
	*
	* Each object in the returned array has:
	*   - schemaname   (string) e.g. 'public'
	*   - functionname (string) e.g. 'f_unaccent'
	*   - arguments    (string) argument signature as returned by pg_get_function_identity_arguments
	*
	* Used by migration tools to check whether Dédalo's own stored functions (like
	* f_unaccent) are installed before attempting to create or replace them.
	* @return array|false - List of function descriptor objects sorted by schema then name, or false on error
	*/
	public static function get_functions() : array|false {

		$conn = DBi::_getConnection();

		$sql = "
			SELECT
				n.nspname as schemaname,
				p.proname as functionname,
				pg_get_function_identity_arguments(p.oid) as arguments
			FROM
				pg_proc p
				LEFT JOIN pg_namespace n ON p.pronamespace = n.oid
				LEFT JOIN pg_depend d ON p.oid = d.objid AND d.deptype = 'e'
				LEFT JOIN pg_extension e ON d.refobjid = e.oid
			WHERE
				n.nspname NOT IN ('pg_catalog', 'information_schema')
				AND e.oid IS NULL  -- This excludes functions that belong to extensions
			ORDER BY
				n.nspname,
				p.proname;
		";

		$result	= pg_query($conn, $sql);
		if ($result === false) {
			debug_log(
				__METHOD__
					. " Error. PostgreSQL query failed" . PHP_EOL
					. 'error: ' . pg_last_error($conn),
				logger::ERROR
			);
			return false;
		}

		$list = [];
		while($row = pg_fetch_assoc($result)) {

			$schemaname		= $row['schemaname'];
			$functionname	= $row['functionname'];

			$list[] = (object)[
				'schemaname'	=> $schemaname,
				'functionname'	=> $functionname,
				'arguments'		=> $row['arguments']
			];
		}

		return $list;
	}//end get_functions



	/**
	* GET_CONSTRAINT_NAME_FROM_INDEX
	* Returns the constraint(s) backed by the given index name.
	*
	* PostgreSQL primary-key and unique constraints are implemented as indexes. This method
	* resolves the mapping by joining information_schema.table_constraints → pg_constraint →
	* pg_class (by index OID). Useful when a migration needs to DROP CONSTRAINT by name but
	* only knows the index name shown in pg_indexes.
	*
	* Each object in the returned array has:
	*   - constraint_name (string) e.g. 'matrix_pkey'
	*   - table_name      (string) e.g. 'matrix'
	*
	* Returns an empty array when no constraint is backed by that index (i.e. the index
	* is a plain CREATE INDEX, not a constraint index).
	*
	* @param string $index_name - The pg_indexes.indexname value to look up
	* @return array|false - List of constraint descriptor objects, or false on query failure
	*/
	public static function get_constraint_name_from_index( string $index_name ) : array|false {

		$conn = DBi::_getConnection();

		$safe_index_name = pg_escape_literal($conn, $index_name);

		$sql = "
			SELECT
				tc.constraint_name,
				tc.constraint_type,
				tc.table_name
			FROM
				information_schema.table_constraints tc
				JOIN pg_constraint pc ON tc.constraint_name = pc.conname
			WHERE
				pc.conindid = (
					SELECT
						oid
					FROM
						pg_class
					WHERE
						relname = {$safe_index_name}
				);
		";

		$result	= pg_query($conn, $sql);
		if ($result === false) {
			debug_log(
				__METHOD__
					. " Error. PostgreSQL query failed" . PHP_EOL
					. 'error: ' . pg_last_error($conn),
				logger::ERROR
			);
			return false;
		}

		$list = [];
		while($row = pg_fetch_assoc($result)) {

			$constraint_name	= $row['constraint_name'];
			$table_name			= $row['table_name'];

			$list[] = (object)[
				'constraint_name'	=> $constraint_name,
				'table_name'		=> $table_name
			];
		}

		return $list;
	}//end get_constraint_name_from_index



	/**
	* REMOVE_COLUMN
	* Drops a column from the given table if it exists.
	*
	* Performs an idempotent existence check via check_column_exists() first.
	* If the column is not present the method returns true immediately, making it safe
	* to call from migration scripts on any schema version.
	*
	* Table and column names are escaped with pg_escape_identifier() (double-quoted) to
	* handle reserved words. The DROP COLUMN is issued without CASCADE; if dependent
	* objects exist (e.g. views, indexes on that column) PostgreSQL will return an error.
	*
	* @param string $table - Target table name (unquoted)
	* @param string $column - Column to remove (unquoted)
	* @return bool - true on success or when column does not exist, false on DROP failure
	*/
	public static function remove_column( string $table, string $column ): bool {

		// Check if the column exists. If it does NOT exist, the goal is achieved, return true.
		if (false === DBi::check_column_exists($table, $column)) {
			return true;
		}

		$conn = DBi::_getConnection();

		$safe_table = pg_escape_identifier($conn, $table);
		$safe_column = pg_escape_identifier($conn, $column);

		// Construct the DROP COLUMN SQL query
		$sql = "
            ALTER TABLE $safe_table
            DROP COLUMN $safe_column;
        ";

		$result = pg_query($conn, $sql);

		if ($result === false) {
			debug_log(
				__METHOD__
					. " Error. PostgreSQL query failed" . PHP_EOL
					. " PostgreSQL DROP COLUMN failed on $table.$column: " . pg_last_error($conn),
				logger::ERROR
			);
			return false;
		}

		// Column dropped successfully
		return true;
	}//end remove_column



}//end class DBi
