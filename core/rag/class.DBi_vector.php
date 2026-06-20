<?php declare(strict_types=1);
/**
* CLASS DBI_VECTOR
* Dedicated PostgreSQL accessor for the SEPARATE pgvector RAG instance.
*
* Mirrors the relevant parts of DBi / matrix_db_manager (persistent-connection
* handling, the md5-named prepared-statement pool with a DEALLOCATE ALL safety
* valve, and the persistent-connection abandoned-transaction guard) but keeps
* its OWN connection cache, prepared-statement registry and transaction state.
* This isolation is the whole point: a failure talking to the vector store must
* never roll back — or even touch — the matrix transaction.
*
* Two execution paths:
* - exec(): prepared-statement path for the hot read/write queries. Uses
*   constant-shape SQL (e.g. `= ANY($1)`) so the statement pool does not churn.
* - exec_autocommit(): a fresh, NON-cached, NON-transactional connection used
*   only for `CREATE INDEX CONCURRENTLY`, which cannot run inside a transaction
*   block. See rag_vector_store::build_ann_index().
*
* A connection failure (vector DB down) returns false from every method and is
* logged; it is the caller's responsibility (rag_indexer / retrieval / rag_queue)
* to treat that as a soft failure and never propagate it into a matrix save.
*
* @package Dedalo
* @subpackage Rag
*/
abstract class DBi_vector {



	/**
	* Cached PgSql\Connection for the vector instance (separate from DBi's).
	* @var ?PgSql\Connection $conn_cache
	*/
	private static ?PgSql\Connection $conn_cache = null;

	/**
	* Unix timestamp until which $conn_cache is assumed healthy (lazy status check).
	* @var int $conn_valid_until
	*/
	private static int $conn_valid_until = 0;

	/**
	* Seconds between mandatory pg_connection_status() checks.
	* @var int $connection_check_interval
	*/
	private static int $connection_check_interval = 30;

	/**
	* Registry of prepared-statement names already registered on the current
	* vector connection. Session-scoped: cleared with the connection cache.
	* @var array<string,bool> $prepared_statements
	*/
	private static array $prepared_statements = [];



	/**
	* IS_CONFIGURED
	* True when the minimum constants required to reach the vector instance are
	* defined. Lets callers (and tests) skip cleanly when RAG is not provisioned.
	* @return bool
	*/
	public static function is_configured() : bool {

		return defined('DEDALO_RAG_DB_DATABASE_CONN')
			&& defined('DEDALO_RAG_DB_USERNAME_CONN')
			&& (
				(defined('DEDALO_RAG_DB_HOSTNAME_CONN') && DEDALO_RAG_DB_HOSTNAME_CONN!==null)
				|| (defined('DEDALO_RAG_DB_SOCKET_CONN') && DEDALO_RAG_DB_SOCKET_CONN!==null)
			);
	}//end is_configured



	/**
	* GET_CONNECTION
	* Returns the cached vector connection, opening one when needed. Mirrors
	* DBi::_getConnection's lazy validity window and persistent-connection
	* abandoned-transaction guard, but against the DEDALO_RAG_DB_* constants and
	* its own cache.
	* @param bool $cache = true
	* @return PgSql\Connection|false
	*/
	public static function get_connection( bool $cache=true ) : PgSql\Connection|false {

		if (!self::is_configured()) {
			debug_log(__METHOD__ . ' Error. Vector DB is not configured (DEDALO_RAG_DB_*)', logger::WARNING);
			return false;
		}

		$now = time();

		if ($cache && self::$conn_cache instanceof PgSql\Connection) {
			if ($now < self::$conn_valid_until ||
				pg_connection_status(self::$conn_cache) === PGSQL_CONNECTION_OK) {
				self::$conn_valid_until = $now + self::$connection_check_interval;
				return self::$conn_cache;
			}
			self::$conn_cache = null;
			self::$conn_valid_until = 0;
			self::$prepared_statements = [];
		}

		$host	= defined('DEDALO_RAG_DB_HOSTNAME_CONN') ? DEDALO_RAG_DB_HOSTNAME_CONN : null;
		$socket	= defined('DEDALO_RAG_DB_SOCKET_CONN') ? DEDALO_RAG_DB_SOCKET_CONN : null;
		$port	= defined('DEDALO_RAG_DB_PORT_CONN') ? DEDALO_RAG_DB_PORT_CONN : 5433;

		$params = [
			'dbname='	. DEDALO_RAG_DB_DATABASE_CONN,
			'user='		. DEDALO_RAG_DB_USERNAME_CONN,
			'password='	. (defined('DEDALO_RAG_DB_PASSWORD_CONN') ? DEDALO_RAG_DB_PASSWORD_CONN : '')
		];
		if ($host !== null) {
			$params[] = "host=$host";
			if ($port !== null && (int)$port > 0) {
				$params[] = 'port=' . (int)$port;
			}
		} elseif ($socket !== null) {
			$params[] = "host=$socket";
		}

		$persistent	= defined('PERSISTENT_CONNECTION') && PERSISTENT_CONNECTION===true;
		$conn		= $persistent
			? @pg_pconnect(implode(' ', $params))
			: @pg_connect(implode(' ', $params));

		if ($conn === false) {
			debug_log(__METHOD__ . ' Error. Could not connect to RAG vector database. ' . (pg_last_error() ?: ''), logger::ERROR);
			return false;
		}

		// persistent-connection abandoned-transaction guard (worker pool overlap)
		if ($persistent) {
			$status = pg_transaction_status($conn);
			if ($status === PGSQL_TRANSACTION_INTRANS || $status === PGSQL_TRANSACTION_INERROR) {
				pg_query($conn, 'ROLLBACK');
			}
		}

		if (!$cache) {
			return $conn;
		}

		self::$conn_cache		= $conn;
		self::$conn_valid_until	= $now + self::$connection_check_interval;
		self::$prepared_statements = [];

		return self::$conn_cache;
	}//end get_connection



	/**
	* EXEC
	* Prepared-statement execution against the vector instance. Same md5 pool +
	* DEALLOCATE-ALL-over-1000 discipline as matrix_db_manager::exec_search, but
	* on this class's own registry.
	* @param string $sql
	* @param array $params = []
	* @return \PgSql\Result|false
	*/
	public static function exec( string $sql, array $params=[] ) : \PgSql\Result|false {

		$conn = self::get_connection();
		if ($conn === false) {
			return false;
		}

		$stmt_name = md5($sql);

		if (count(self::$prepared_statements) > 1000) {
			pg_query($conn, 'DEALLOCATE ALL');
			self::$prepared_statements = [];
		}

		if (!isset(self::$prepared_statements[$stmt_name])) {
			$prepared = @pg_prepare($conn, $stmt_name, $sql);
			if ($prepared === false) {
				debug_log(__METHOD__ . ' Error pg_prepare: ' . pg_last_error($conn) . ' sql: ' . $sql, logger::ERROR);
				return false;
			}
			self::$prepared_statements[$stmt_name] = true;
		}

		$result = @pg_execute($conn, $stmt_name, $params);
		if ($result === false) {
			debug_log(__METHOD__ . ' Error pg_execute: ' . pg_last_error($conn) . PHP_EOL . ' sql: ' . $sql, logger::ERROR);
			return false;
		}

		return $result;
	}//end exec



	/**
	* EXEC_AUTOCOMMIT
	* Runs a single statement on a FRESH, non-cached, non-transactional
	* connection. Required for CREATE INDEX CONCURRENTLY (forbidden inside a
	* transaction block). Closes the connection on return.
	* @param string $sql - a single statement (no params, no multi-statement)
	* @return bool - true on success
	*/
	public static function exec_autocommit( string $sql ) : bool {

		$conn = self::get_connection(false); // uncached, fresh
		if ($conn === false) {
			return false;
		}

		$result = @pg_query($conn, $sql);
		$ok = $result !== false;
		if (!$ok) {
			debug_log(__METHOD__ . ' Error: ' . pg_last_error($conn) . PHP_EOL . ' sql: ' . $sql, logger::ERROR);
		}

		// fresh connection: close it (don't leak per call)
		if (!(defined('PERSISTENT_CONNECTION') && PERSISTENT_CONNECTION===true)) {
			pg_close($conn);
		}

		return $ok;
	}//end exec_autocommit



	/**
	* @var int $tx_depth  managed transaction nesting depth on the vector connection
	*/
	private static int $tx_depth = 0;



	/**
	* BEGIN
	* Start (or nest, via SAVEPOINT) a transaction on the vector connection. This
	* is independent of the matrix DBi transaction state — a vector write failure
	* never affects a matrix transaction. Returns false if no connection.
	* @return bool
	*/
	public static function begin() : bool {

		$conn = self::get_connection();
		if ($conn === false) {
			return false;
		}
		$sql = (self::$tx_depth === 0) ? 'BEGIN' : ('SAVEPOINT dv_' . self::$tx_depth);
		if (@pg_query($conn, $sql) === false) {
			debug_log(__METHOD__ . ' Error: ' . pg_last_error($conn), logger::ERROR);
			return false;
		}
		self::$tx_depth++;
		return true;
	}//end begin



	/**
	* COMMIT
	* @return bool
	*/
	public static function commit() : bool {

		if (self::$tx_depth < 1) {
			return false;
		}
		$conn = self::get_connection();
		if ($conn === false) {
			return false;
		}
		$sql = (self::$tx_depth === 1) ? 'COMMIT' : ('RELEASE SAVEPOINT dv_' . (self::$tx_depth - 1));
		$ok = @pg_query($conn, $sql) !== false;
		self::$tx_depth--;
		return $ok;
	}//end commit



	/**
	* ROLLBACK
	* @return bool
	*/
	public static function rollback() : bool {

		if (self::$tx_depth < 1) {
			return false;
		}
		$conn = self::get_connection();
		if ($conn === false) {
			self::$tx_depth = 0;
			return false;
		}
		$sql = (self::$tx_depth === 1)
			? 'ROLLBACK'
			: ('ROLLBACK TO SAVEPOINT dv_' . (self::$tx_depth - 1) . '; RELEASE SAVEPOINT dv_' . (self::$tx_depth - 1));
		@pg_query($conn, $sql);
		self::$tx_depth--;
		return true;
	}//end rollback



	/**
	* SET_SESSION_EF_SEARCH
	* Applies the HNSW ef_search recall/latency knob for subsequent queries on
	* the cached connection. Best-effort; failure is non-fatal.
	* @param int $ef_search
	* @return void
	*/
	public static function set_session_ef_search( int $ef_search ) : void {

		$conn = self::get_connection();
		if ($conn === false) {
			return;
		}
		@pg_query($conn, 'SET hnsw.ef_search = ' . max(1, $ef_search));
	}//end set_session_ef_search



	/**
	* RESET
	* Discards the cached connection and prepared-statement registry. Used by
	* tests and by error-recovery paths.
	* @return void
	*/
	public static function reset() : void {

		self::$conn_cache		= null;
		self::$conn_valid_until	= 0;
		self::$prepared_statements = [];
		self::$tx_depth			= 0;
	}//end reset



	/**
	* VECTOR_TO_SQL
	* Serialises a PHP float array into the pgvector text literal form
	* '[0.1,0.2,...]' for binding as a statement parameter. The value is bound,
	* never interpolated into SQL.
	* @param array<int,float> $vector
	* @return string
	*/
	public static function vector_to_sql( array $vector ) : string {

		$parts = [];
		foreach ($vector as $v) {
			$parts[] = (string)(float)$v;
		}
		return '[' . implode(',', $parts) . ']';
	}//end vector_to_sql



}//end class DBi_vector
