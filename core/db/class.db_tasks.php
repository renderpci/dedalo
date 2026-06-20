<?php declare(strict_types=1);
/**
* CLASS DB_TASKS
* Collection of static maintenance and integrity utilities for Dédalo's PostgreSQL database.
*
* Responsibilities:
* - Sequence integrity: detects and auto-fixes sequences that have drifted below the table's
*   actual maximum id (check_sequences). Required after bulk imports or id renumbering.
* - Table optimization: runs REINDEX CONCURRENTLY + VACUUM ANALYZE per table via psql CLI
*   (optimize_tables). Shell-based because VACUUM cannot run inside a transaction.
* - Id compaction: renumbers a table's id column to close gaps (consolidate_table). Used during
*   migrations and after large deletes.
* - Schema rebuild: re-applies all indexes, constraints, functions, extensions, and maintenance
*   SQL declared in db_pg_definitions.php (rebuild_indexes, rebuild_constraints,
*   rebuild_functions, create_extensions, exec_maintenance).
* - Statistics: runs VACUUM ANALYZE on the full database and tracks the last-run time via
*   dd_cache so it is throttled to at most once per 24 hours (analyze_db / should_run_analyze).
* - Introspection: get_tables, get_table_indexes return metadata about the live schema.
*
* All methods are static; the class is never instantiated.
* SQL definitions (index, function, constraint, extension and maintenance arrays) live in
* db_pg_definitions.php, which is include'd at call time to avoid loading the large definition
* set on every request.
*
* @package Dédalo
* @subpackage Core
*/
class db_tasks {



	/**
	* CHECK_SEQUENCES
	* Audits every PostgreSQL sequence in the database and auto-repairs any that have
	* fallen behind the table's actual maximum id.
	*
	* A sequence can drift below the table's real maximum id after a bulk insert that
	* bypassed the sequence (e.g. a pg_restore with explicit ids), or after consolidate_table
	* renumbers rows. If the sequence is lower than the last inserted id, the next INSERT
	* will fail with a unique-key violation. This method detects and corrects that situation
	* using setval().
	*
	* Additionally flags sequences whose start_value != 1, which is anomalous for Dédalo
	* tables and may indicate a migration artifact.
	*
	* PostgreSQL ≥ 10 queries pg_sequences (system view); older versions fall back to
	* querying the sequence relation directly by name ({table}_id_seq).
	*
	* Tables in $ar_skip_tables (session_data, matrix_counter, relations, etc.) are excluded
	* because they either have no serial id or are managed separately.
	*
	* Side effects: when last_id > sequence last_value the sequence is advanced in place via
	* SELECT setval(). Sets $response->result = false to signal that repairs were needed.
	*
	* @return object $response - stdClass with:
	*   result (bool): true when all sequences were healthy; false when at least one needed repair
	*   msg (string): HTML-formatted diagnostic output (one line per table, warnings bold)
	*   values (array): array of stdClass {table_name, start_value, last_value, last_id}
	*   errors (array, optional): populated on connection failure or sqlmap detection
	*/
	public static function check_sequences() : object {

		$response = new stdClass();
			$response->result	= true;
			$response->msg		= '';
			$response->values	= [];

		try {

			// Detect PostgreSQL major version
			// pg_sequences (system view) only exists in PG ≥ 10. On older versions the
			// sequence must be queried by directly selecting from {table}_id_seq relation.
			$sql					= " SHOW server_version; ";
			$result_v 				= matrix_db_manager::exec_search($sql, []);
			$server_version			= pg_fetch_result($result_v, 0, 'server_version');
			$ar_parts				= explode('.', $server_version);
			$server_major_version	= (int)$ar_parts[0];

			$response->msg .= "TEST ALL SEQUENCES IN DATABASE: ".DEDALO_DATABASE_CONN;

			// skip tables
			$ar_skip_tables = [
				'session_data',
				'matrix_counter',
				'matrix_counter_dd',
				'temp',
				'relations',
				'relations_DES'
			];

			// Find and iterate all db tables
			$sql	= " SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name ASC ";
			$result	= matrix_db_manager::exec_search($sql, []);

			while ($rows = pg_fetch_assoc($result)) {

				$table_name = $rows['table_name'];

				if (in_array($table_name, $ar_skip_tables)) {
					continue; // Skip table
				}

				$table_exists = DBi::check_table_exists($table_name);
				if( $table_exists===false ) {
					$response->errors[] = "Table $table_name does not exist. Ignored check_sequences";
					continue;
				}

				// Security guard: sqlmap injection probe detection
				// sqlmap (automated SQL injection scanner) sometimes leaves artifact tables named
				// 'sqlmapfile' / 'sqlmapoutput'. Their presence is a strong indicator that the
				// database was under attack. Abort the whole audit immediately and surface an error.
				if (strpos($table_name, 'sqlmap')!==false) {
					throw new Exception("Error Processing Request. Security sql injection warning", 1);
				}

				# Find last id in table
				$conn = DBi::_getConnection();
				if (!$conn) {
					$response->errors[] = "Database connection failed for table: $table_name";
					continue;
				}
				$sql		= " SELECT id FROM " . pg_escape_identifier($conn ?: null, $table_name) . " ORDER BY id DESC LIMIT 1 ";
				$result2	= matrix_db_manager::exec_search($sql, []);

				if (!$result2) {
					continue;
				}
				if (pg_num_rows($result2) === 0) {
					continue;	// Skip empty tables
				}

				$last_id = pg_fetch_result($result2, 0, 'id');

				# Find vars in current sequence
				// PG ≥ 10: query the pg_sequences system view (avoids needing SELECT privilege
				// on the sequence relation itself).
				// PG < 10: query the sequence as a table — the old way, still valid but fragile
				// when users lack SELECT on the sequence object.
				if ($server_major_version>=10) {
					$search_table	= 'sequencename';
					$sql			= " SELECT last_value, start_value FROM pg_sequences WHERE $search_table = '".$table_name."_id_seq' ; ";
				}else{
					$search_table	= $table_name."_id_seq";
					$sql			= " SELECT last_value, start_value FROM $search_table ; ";
				}
				$result_seq = matrix_db_manager::exec_search($sql, []);
				if (pg_num_rows($result_seq) === 0) {
					debug_log(__METHOD__
						." Warning. {$table_name}_id_seq not found in $search_table "
						, logger::WARNING
					);
					continue;	// Skip empty tables
				}
				$last_value		= pg_fetch_result($result_seq, 0, 'last_value');
				$start_value	= pg_fetch_result($result_seq, 0, 'start_value');

				$response->values[] = (object)[
					'table_name'	=> $table_name,
					'start_value'	=> $start_value,
					'last_value'	=> $last_value,
					'last_id'		=> $last_id
				];

				$response->msg .= "<hr><b>$table_name</b> - start_value: $start_value - seq last_value: $last_value ";
				if ($last_value!=$last_id) {
					#$response->msg .= "<span style=\"color:#b97800\">[last id: $last_id] ALTER SEQUENCE {$table_name}_id_seq RESTART WITH $last_id;</span>";
					$response->msg .= "<span style=\"color:#b97800\">[last id: $last_id] SELECT setval('public.{$table_name}_id_seq', $last_id, true);</span>";
				}else{
					$response->msg .= "[last id: $last_id]";
				}


				// Auto-repair: sequence is behind the highest existing id
				// This is the dangerous case — the next INSERT would attempt to use an id already
				// taken, causing a unique-key violation. Repair immediately with setval().
				// The older ALTER SEQUENCE … RESTART approach is commented out because setval()
				// with the 'called' flag = true is the correct way to advance a live sequence
				// without restarting it from scratch.
				if ($last_id>$last_value) {
					$response->msg .= "<br><b>   WARNING: seq last_id > last_value [$last_id > $last_value]</b>";
					$response->msg .= "<br>FIX AUTOMATIC TO $last_id start</pre>";
					#$response->msg .= "Use: <pre>SELECT setval('public.{$table_name}_id_seq', $last_id, true);</pre>";

					$sql2 	 = "SELECT setval('public.{$table_name}_id_seq', $last_id, true);";
					$result2 = matrix_db_manager::exec_search($sql2, []);

					if (!$result2) {
						$response->msg .= "Use: <b>SELECT setval('public.{$table_name}_id_seq', $last_id, true);</b>";
					}

					$response->result = false;
				}

				if ($start_value!=1) {
					$response->msg .= "<br><b>   WARNING: seq start_value != 1</b>";
					$response->msg .= "Use: <b>ALTER SEQUENCE {$table_name}_id_seq START WITH 1 ;</b>";

					$response->result = false;
				}
			}//end while ($rows = pg_fetch_assoc($result))

		} catch (Exception $e) {
			$response->result	= false;
			$response->msg		= 'Caught exception: ' . $e->getMessage();
			return $response;
		}


		return (object)$response;
	}//end check_sequences



	/**
	* OPTIMIZE_TABLES
	* Runs REINDEX CONCURRENTLY and VACUUM ANALYZE on each of the specified tables via
	* the psql command-line client rather than through the PHP pg_* functions.
	*
	* VACUUM cannot be executed inside a transaction block, which is why this method
	* shells out to psql instead of using pg_query(). The command is built from
	* DB_BIN_PATH, DEDALO_DATABASE_CONN, and DBi::get_connection_string().
	*
	* Table names are validated (alphanumeric + underscore + dot only) and their existence
	* verified with DBi::check_table_exists() before any SQL is executed. The VACUUM loop
	* re-validates existence because tables could theoretically be dropped between the two
	* passes.
	*
	* Output from each psql invocation (including stderr via '2>&1') is captured in
	* $response->reindex[$table] and $response->vacuum[$table] for caller inspection.
	* A null return from shell_exec() or a string containing 'error' is treated as failure.
	*
	* @param array $tables - List of table names to optimize
	* @return object $response - stdClass with:
	*   result (bool): true when processing completed (partial failures do not set false)
	*   msg (string): success summary or 'completed with errors'
	*   errors (array): per-table error messages
	*   reindex (array): keyed by table name; raw psql output from REINDEX pass
	*   vacuum (array): keyed by table name; raw psql output from VACUUM pass
	*/
	public static function optimize_tables( array $tables ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];
			$response->reindex	= [];
			$response->vacuum	= [];

		// Validate and sanitize table names
		$valid_tables = [];
		foreach ($tables as $table) {

			if (empty($table) || !is_string($table)) {
				$response->errors[] = "Invalid table name: " . var_export($table, true);
				debug_log(__METHOD__
					. " Ignored Invalid table name " . PHP_EOL
					. ' table: ' . to_string($table)
					, logger::ERROR
				);
				continue;
			}

			// Sanitize table name - only allow alphanumeric, underscores, and dots
			if (!preg_match('/^[a-zA-Z0-9_\.]+$/', $table)) {
				$response->errors[] = "Invalid table name format: " . $table;
				debug_log(__METHOD__
					. " Ignored Invalid table name format " . PHP_EOL
					. ' table: ' . to_string($table)
					, logger::ERROR
				);
				continue;
			}

			if (!DBi::check_table_exists($table)) {
				$response->errors[] = "Table does not exist: " . $table;
				debug_log(__METHOD__
					. " Ignored non existing table " . PHP_EOL
					. ' table: ' . to_string($table)
					, logger::ERROR
				);
				continue;
			}

			$valid_tables[] = $table;
		}

		if (empty($valid_tables)) {
			$response->errors[] = "No valid tables to optimize";
			return $response;
		}

		// command_base
		// Build the base psql invocation once; individual table commands append the -c clause.
		// system::get_pg_bin_path() resolves the psql binary on any host layout,
		// DEDALO_DATABASE_CONN is the database name, and get_connection_string() supplies
		// the host/port/user flags. The password is provided via the PGPASSWORD env var
		// (DBi::pg_shell_exec, below), so the DB may be LOCAL or REMOTE without a ~/.pgpass file.
		$command_base = system::get_pg_bin_path() . 'psql ' . DEDALO_DATABASE_CONN . ' ' . DBi::get_connection_string();

		// REINDEX each table individually
		foreach ($valid_tables as $table) {

			$escaped_table = pg_escape_identifier(DBi::_getConnection(), $table);
			$command = $command_base . ' -c ' . escapeshellarg("REINDEX TABLE CONCURRENTLY $escaped_table;");

			$res = DBi::pg_shell_exec($command . ' 2>&1');
			$response->reindex[$table] = $res;

			// Check if command failed (basic error detection)
			if ($res === null || strpos(strtolower($res), 'error') !== false) {
				$response->errors[] = "REINDEX failed for table: $table";
				debug_log(__METHOD__
					. ' REINDEX result for table "' . $table . '": ' . to_string($res) . PHP_EOL
					. ' command: ' . to_string($command)
					, logger::ERROR
				);
			}

			// debug
			debug_log(__METHOD__
				. ' REINDEX result for ' . $table . ': ' . to_string($res) . PHP_EOL
				. ' command: ' . to_string($command)
				, logger::WARNING
			);
		}

		// VACUUM each table individually
		foreach ($valid_tables as $table) {

			$table_exists = DBi::check_table_exists($table);
			if( $table_exists===false ) {
				$response->errors[] = "Table does not exist: " . $table;
				debug_log(__METHOD__
					. " Ignored non existing table " . PHP_EOL
					. ' table: ' . to_string($table)
					, logger::ERROR
				);
				continue;
			}

			$escaped_table = pg_escape_identifier(DBi::_getConnection(), $table);
			$command = $command_base . ' -c ' . escapeshellarg("VACUUM ANALYZE $escaped_table;");

			$res = DBi::pg_shell_exec($command . ' 2>&1');
			$response->vacuum[$table] = $res;

			// Check if command failed (basic error detection)
			if ($res === null || strpos(strtolower($res), 'error') !== false) {
				$response->errors[] = "VACUUM failed for table: $table";
				debug_log(__METHOD__
					. " VACUUM failed for table: '$table'"
					, logger::ERROR
				);
			}

			// debug
			debug_log(__METHOD__
				. ' VACUUM result for "' . $table . '": ' . to_string($res) . PHP_EOL
				. ' command: ' . to_string($command)
				, logger::WARNING
			);
		}

		$response->result	= true;
		$response->msg = empty($response->errors)
			? 'Successfully optimized ' . count($valid_tables) . ' table(s)'
			: 'Optimization completed with errors for some tables';


		return $response;
	}//end optimize_tables



	/**
	* CONSOLIDATE_TABLE
	* Renumbers the id column of the given table so that ids are a contiguous sequence
	* starting at 1, and then resets the sequence to match the new maximum id.
	*
	* The need for consolidation is determined by comparing the first (lowest) id with the
	* total row count. If first_id ≤ count_rows, the sequence is already dense enough and
	* the method returns true immediately without modifying any data.
	*
	* Ordering strategy for the new ids:
	*  - dd_ontology: ORDER BY tld, id  (preserves ontology tree topology)
	*  - all other tables: ORDER BY section_tipo, section_id  (preserves record grouping)
	*
	* The renumbering UPDATE uses a window-function subquery to assign new_id values and
	* then sets them in a single pass. The inline comment in the SQL notes that intermediate
	* unique violations are suppressed by PostgreSQL's deferred constraint evaluation within
	* the same statement.
	*
	* (!) This method modifies id values in place. Callers must ensure no foreign-key
	* references from other tables point to the affected rows, and that no other process
	* is writing to the table concurrently. Run check_sequences() afterwards to align the
	* sequence.
	*
	* (!) The table name is validated against a strict alphanumeric + underscore pattern
	* (no dots, no hyphens) before interpolation into raw SQL. Reject anything that does
	* not match — see DB-06 note in the implementation.
	*
	* @param string $table - Bare table name (no schema prefix, no special characters)
	* @return bool - true on success or when consolidation is not needed; false on any error
	*/
	public static function consolidate_table( string $table ) : bool {
		// DB-06: $table is interpolated into several raw queries below (column/table
		// names cannot be bound), so require a bare identifier — reject anything that
		// could carry SQL.
		if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $table)) {
			debug_log(__METHOD__ . ' Rejected invalid table identifier: ' . to_string($table), logger::ERROR);
			return false;
		}
		// Get first id
		$first_id_query = '
			SELECT id
			FROM "' . $table . '"
			ORDER BY "id" ASC
			LIMIT 1;
		';
		$first_id_result = pg_query(DBi::_getConnection(), $first_id_query);
		if($first_id_result === false) {
			debug_log(__METHOD__
				. ' Failed consolidate_table: ' . $table . PHP_EOL
				. 'strQuery: ' . to_string($first_id_query)
				, logger::ERROR
			);
			return false;
		}

		$first_id = null;
		$row = pg_fetch_assoc($first_id_result);
		if ($row !== false) {
			$first_id = $row['id'];
		}

		// Get the total rows
		$count_rows_query = '
			SELECT COUNT(*) as count
			FROM "' . $table . '";
		';
		$count_rows_result = pg_query(DBi::_getConnection(), $count_rows_query);
		if($count_rows_result === false) {
			debug_log(__METHOD__
				. ' Failed consolidate_table: ' . $table . PHP_EOL
				. 'strQuery: ' . to_string($count_rows_query)
				, logger::ERROR
			);
			return false;
		}

		$count_rows = null;
		$row = pg_fetch_assoc($count_rows_result);
		if ($row !== false) {
			$count_rows = $row['count'];
		}

		// Check the result
		if( $first_id === null || $count_rows === null ){
			debug_log(__METHOD__
				. ' Failed consolidate_table, impossible to know the id and total rows: ' . $table . PHP_EOL
				, logger::ERROR
			);
			return false;
		}

		// Test if the table needs to be consolidated
		// Only tables with first id > total rows need renumbering.
		if( (int)$first_id <= (int)$count_rows ){
			debug_log(__METHOD__
				. ' Database does not need consolidation ' . $table . PHP_EOL
				, logger::WARNING
			);
			return true;
		}

		// Set a logical order of the data
		// It depends on the table.
		// dd_ontology has a special topology where tld (top-level domain / ontology root)
		// must remain the primary sort key so that parent nodes always receive lower ids
		// than their children, preserving tree traversal order.
		// All other Dédalo matrix tables use (section_tipo, section_id) as the natural
		// record identity, so ids are reassigned within each section group in record order.
		$order = ($table === 'dd_ontology')
			? 'tld, id'
			: 'section_tipo, section_id';

		// Renumber the table.
		// Create a new_id column and set it in id
		// Update the sequence to the last id.
		$strQuery = '
			UPDATE "' . $table . '" t  -- intermediate unique violations are ignored now
			SET id = t1.new_id
			FROM (SELECT id, row_number() OVER (ORDER BY ' . $order . ') AS new_id FROM "' . $table . '") t1
			WHERE t.id = t1.id;
			SELECT setval(\'' . $table . '_id_seq\', max(id)) FROM "' . $table . '";  -- reset sequence
		';

		// Apply to database
		$result = pg_query(DBi::_getConnection(), $strQuery);
		if($result === false) {
			debug_log(__METHOD__
				. ' Failed consolidate_table: ' . $table . PHP_EOL
				. 'strQuery: ' . to_string($strQuery)
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end consolidate_table



	/**
	* EXEC_MAINTENANCE
	* Executes the full set of maintenance SQL statements defined in the
	* 'ar_maintenance' array of db_pg_definitions.php.
	*
	* Maintenance statements typically include CLUSTER, REINDEX, VACUUM, and similar
	* administrative commands that do not fit into the index / constraint / function
	* rebuild categories. The exact set is determined by the definitions file.
	*
	* db_pg_definitions.php is loaded via include() at call time (not require_once) so
	* that every call returns the current file content. The method delegates each SQL
	* statement to exec_sql_query() and accumulates errors without aborting the loop.
	*
	* @return object $response - stdClass with:
	*   result (bool): true when all statements were dispatched (individual errors collected)
	*   msg (string): 'OK. Request done successfully' or 'Warning. Request done with errors'
	*   errors (array): per-statement error messages
	*   success (int): count of statements that executed without error
	*   n_queries (int): total number of maintenance statements attempted
	*   n_errors (int): total number of failed statements
	*/
	public static function exec_maintenance() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ';
			$response->errors	= [];
			$response->success	= 0;

		$ar_maintenance = [];

		// import file with all definitions of indexes
		// require_once dirname(__FILE__) . '/db_pg_definitions.php';
		$config = include dirname(__FILE__) . '/db_pg_definitions.php';
		$ar_maintenance = $config['ar_maintenance'];

		// Validation for db_pg_definitions vars.
		if (!isset($ar_maintenance) || !is_array($ar_maintenance) || empty($ar_maintenance)) {
			$response->errors[] = "No SQL queries found for maintenance in db_pg_definitions.php";
			return $response;
		}

		// exec
		foreach ($ar_maintenance as $sql_query) {

			$query_response	= db_tasks::exec_sql_query($sql_query);

			if( $query_response->result===false ) {
				$response->errors[] = $query_response->errors;
				continue;
			}

			$response->success++;
		}

		// debug
			debug_log(__METHOD__
				. " Exec exec_maintenance " . PHP_EOL
				. ' sql_query: ' . implode(PHP_EOL . PHP_EOL, $ar_maintenance) . PHP_EOL
				, logger::DEBUG
			);

		// response OK
		$response->result	= true;
		$response->msg		= count($response->errors)>0
			? 'Warning. Request done with errors'
			: 'OK. Request done successfully';
		$response->n_queries = count($ar_maintenance);
		$response->n_errors = count($response->errors);


		return $response;
	}//end exec_maintenance



	/**
	* CREATE_EXTENSIONS
	* Installs (or re-installs) the PostgreSQL extensions required by Dédalo, as declared
	* in the 'ar_extensions' array of db_pg_definitions.php.
	*
	* Current Dédalo extensions include pg_trgm (trigram similarity for full-text search)
	* and unaccent (accent-insensitive search). Statements use CREATE EXTENSION IF NOT EXISTS
	* so re-running is idempotent.
	*
	* Note: the doc-block inherited from an earlier version incorrectly described this method
	* as rebuilding indexes and functions. It only handles extensions.
	*
	* db_pg_definitions.php is loaded via include() (not require_once) so the current
	* definition set is always used. Each extension SQL is dispatched through exec_sql_query().
	*
	* @return object $response - stdClass with:
	*   result (bool): true when processing completed
	*   msg (string): 'OK. Request done successfully' or 'Warning. Request done with errors'
	*   errors (array): per-statement error messages
	*   success (int): count of statements that executed without error
	*   n_queries (int): total number of extension statements attempted
	*   n_errors (int): total number of failed statements
	*/
	public static function create_extensions() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ';
			$response->errors	= [];
			$response->success	= 0;

		// import file with all definitions of indexes
		// require_once dirname(__FILE__) . '/db_pg_definitions.php';
		$config = include dirname(__FILE__) . '/db_pg_definitions.php';
		$ar_extensions = $config['ar_extensions'];

		// Validation for db_pg_definitions vars.
		if (!isset($ar_extensions) || !is_array($ar_extensions) || empty($ar_extensions)) {
			$response->errors[] = "No SQL queries for extensions are found in db_pg_definitions.php";
			return $response;
		}

		// exec
		foreach ($ar_extensions as $sql_query) {

			$query_response	= db_tasks::exec_sql_query($sql_query);

			if( $query_response->result===false ) {
				$response->errors[] = $query_response->errors;
				continue;
			}

			$response->success++;
		}

		// debug
			debug_log(__METHOD__
				. " Exec create_extensions " . PHP_EOL
				. ' sql_query: ' .PHP_EOL. implode(PHP_EOL . PHP_EOL, $ar_extensions)
				, logger::DEBUG
			);

		// response OK
		$response->result	= true;
		$response->msg		= count($response->errors)>0
			? 'Warning. Request done with errors'
			: 'OK. Request done successfully';
		$response->n_queries = count($ar_extensions);
		$response->n_errors = count($response->errors);


		return $response;
	}//end create_extensions



	/**
	* REBUILD_FUNCTIONS
	* Drops and recreates all PostgreSQL stored functions defined in the 'ar_function'
	* array of db_pg_definitions.php.
	*
	* Each entry in ar_function is an object with the properties:
	*   name (string): human-readable identifier for logging
	*   info (string): description of what the function does
	*   drop (string): DROP FUNCTION … SQL, executed first
	*   add (string): CREATE OR REPLACE FUNCTION … SQL, executed after the drop
	*
	* The drop-then-add pattern is used rather than CREATE OR REPLACE alone because
	* changing a function's signature requires dropping the old overload first.
	*
	* Either the drop or the add SQL may be empty (empty string), in which case that
	* step is skipped. A failure in the drop step causes the whole entry to be skipped
	* (the add step is not attempted) to avoid operating on a partially rebuilt function.
	*
	* @return object $response - stdClass with:
	*   result (bool): true when processing completed
	*   msg (string): 'OK. Request done successfully' or 'Warning. Request done with errors'
	*   errors (array): per-function error messages
	*   success (int): count of functions rebuilt without error
	*   n_queries (int): total number of function entries attempted
	*   n_errors (int): total number of failed entries
	*/
	public static function rebuild_functions() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ';
			$response->errors	= [];
			$response->success	= 0;

		// import file with all definitions of indexes
		// require_once dirname(__FILE__) . '/db_pg_definitions.php';
		$config = include dirname(__FILE__) . '/db_pg_definitions.php';
		$ar_function = $config['ar_function'];

		// Validation for db_pg_definitions vars.
		if (!isset($ar_function) || !is_array($ar_function) || empty($ar_function)) {
			$response->errors[] = "No SQL function queries found in db_pg_definitions.php";
			return $response;
		}

		// exec
		foreach ($ar_function as $function) {

			// debug info
			debug_log(__METHOD__
				. " Executing rebuild_functions SQL sentence " . PHP_EOL
				. ' name: ' . trim($function->name)
				. ' info: ' . trim($function->info)
				, logger::WARNING
			);

			// 1 Drop
				// exec drop query
				$sql_query		= db_tasks::clean_sql_sentence($function->drop);
				if (!empty($sql_query)) {
					$query_response	= db_tasks::exec_sql_query($sql_query);

					if( $query_response->result===false ) {
						$response->errors[] = $query_response->errors;
						continue;
					}
				}

			// 2 Add
				// exec add query
				$sql_query		= db_tasks::clean_sql_sentence($function->add);
				if (!empty($sql_query)) {
					$query_response	= db_tasks::exec_sql_query($sql_query);

					if( $query_response->result===false ) {
						$response->errors[] = $query_response->errors;
						continue;
					}
				}

				$response->success++;
		}

		// debug
			debug_log(__METHOD__
				. " Exec rebuild_functions " . PHP_EOL
				. ' sql_query: ' .PHP_EOL. json_encode( $ar_function ) . PHP_EOL
				, logger::DEBUG
			);

		// response OK
		$response->result	= true;
		$response->msg		= count($response->errors)>0
			? 'Warning. Request done with errors'
			: 'OK. Request done successfully';
		$response->n_queries = count($ar_function);
		$response->n_errors = count($response->errors);


		return $response;
	}//end rebuild_functions



	/**
	* REBUILD_INDEXES
	* Drops and recreates all PostgreSQL indexes defined in the 'ar_index' array of
	* db_pg_definitions.php, optionally scoped to a subset of tables.
	*
	* Each entry in ar_index is an object with:
	*   name (string): identifier for logging
	*   info (string): description
	*   tables (array): list of table names this index definition applies to
	*   drop (string): SQL template with {$table} placeholder, e.g. DROP INDEX IF EXISTS {$table}_idx
	*   add (string): SQL template with {$table} placeholder, e.g. CREATE INDEX … ON {$table} …
	*
	* The {$table} placeholder is resolved per-table via parse_sql_sentence(), then whitespace
	* is normalised by clean_sql_sentence() before the query is dispatched.
	*
	* When $selected_tables is non-empty, only the matching table entries within each index
	* definition are processed; the outer loop still iterates over all index definitions.
	*
	* Table existence is checked before each drop/add pair; missing tables are recorded as
	* errors and skipped. This prevents failures when a new index definition targets a table
	* that has not yet been created in the current environment.
	*
	* PHP execution time is raised to 18 000 seconds (5 hours) because rebuilding all indexes
	* on large Dédalo databases can take very long — the caller must not rely on a short timeout.
	*
	* @param array $selected_tables = [] - If non-empty, restrict processing to these table names
	* @return object $response - stdClass with:
	*   result (bool): true when processing completed
	*   msg (string): 'OK. Request done successfully' or 'Warning. Request done with errors'
	*   errors (array): per-table/index error messages
	*   success (int): count of index definitions processed without error
	*   n_queries (int): total number of individual SQL statements executed
	*   n_errors (int): total number of failed entries
	*/
	public static function rebuild_indexes( array $selected_tables=[] ) : object {

		// Increase PHP time out. This action can take a long time (minutes or hours)
		set_time_limit(18000); // 5 hours

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ';
			$response->errors	= [];
			$response->success	= 0;

		// import file with all definitions of indexes
		// require_once dirname(__FILE__) . '/db_pg_definitions.php';
		$config		= include dirname(__FILE__) . '/db_pg_definitions.php';
		$ar_index	= $config['ar_index'];

		// Validation for db_pg_definitions vars.
		if (!isset($ar_index) || !is_array($ar_index) || empty($ar_index)) {
			$response->errors[] = "No SQL function queries found in db_pg_definitions.php";
			return $response;
		}

		// exec
		$executed = [];
		try {
			foreach ($ar_index as $index) {

				// debug info
				debug_log(__METHOD__
					. " Executing rebuild_indexes SQL sentence " . PHP_EOL
					. ' name: ' . trim($index->name)
					. ' info: ' . trim($index->info)
					, logger::WARNING
				);

				$tables = $index->tables;

				foreach ($tables as $table) {

					// Skip if table is not in the selected tables list (if provided)
					if (!empty($selected_tables) && !in_array($table, $selected_tables)) {
						continue;
					}

					// 0 Prevent errors if table not exists
						$table_exists = DBi::check_table_exists($table);
						if( $table_exists===false ) {
							$response->errors[] = "Table $table does not exist. Ignored index $index->name";
							continue;
						}

					// 1 Drop
						// exec drop query
						$sql_query		= db_tasks::parse_sql_sentence($index->drop, $table);
						$sql_query		= db_tasks::clean_sql_sentence($sql_query);
						if (!empty($sql_query)) {
							$query_response	= db_tasks::exec_sql_query($sql_query);

							if( $query_response->result===false ) {
								$response->errors[] = $query_response->errors;
								continue;
							}
						}

					// 2 Add
						// exec add query
						$sql_query		= db_tasks::parse_sql_sentence($index->add, $table);
						$sql_query		= db_tasks::clean_sql_sentence($sql_query);
						if (!empty($sql_query)) {
							$query_response	= db_tasks::exec_sql_query($sql_query);

							if( $query_response->result===false ) {
								$response->errors[] = $query_response->errors;
								continue;
							}
						}

					$executed[] = $sql_query;
				}

				$response->success++;
			}
		} catch (Exception $e) {
			$response->errors[] = 'Exception in rebuild_indexes: ' . $e->getMessage();
			debug_log(__METHOD__
				. " Exception caught: " . $e->getMessage()
				. ' Trace: ' . $e->getTraceAsString()
				, logger::ERROR
			);
		}

		// debug
			debug_log(__METHOD__
				. " Exec rebuild_indexes " . PHP_EOL
				. ' sql_query: ' .PHP_EOL. json_encode( $executed, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) . PHP_EOL
				, logger::DEBUG
			);

		// response OK
		$response->result	= true;
		$response->msg		= count($response->errors)>0
			? 'Warning. Request done with errors'
			: 'OK. Request done successfully';
		$response->n_queries = count($executed);
		$response->n_errors = count($response->errors);


		return $response;
	}//end rebuild_indexes



	/**
	* REBUILD_CONSTRAINTS
	* Drops and recreates all PostgreSQL constraints defined in the 'ar_constraint' array
	* of db_pg_definitions.php.
	*
	* Each entry in ar_constraint has the same shape as ar_index entries (name, info,
	* tables, drop, add) with {$table} placeholders resolved by parse_sql_sentence().
	* Unlike rebuild_indexes, this method has no $selected_tables filter — all constraints
	* are rebuilt unconditionally.
	*
	* Constraint existence is verified with DBi::check_table_exists() before each drop/add
	* pair. The drop step uses DROP … IF EXISTS variants in the SQL definitions so that
	* re-running against a fresh database does not fail.
	*
	* $response->success is incremented per constraint entry (outer loop), not per table,
	* so it counts definition entries, not individual ALTER TABLE statements.
	*
	* @return object $response - stdClass with:
	*   result (bool): true when processing completed
	*   msg (string): 'OK. Request done successfully' or 'Warning. Request done with errors'
	*   errors (array): per-table/constraint error messages
	*   success (int): count of constraint entries fully processed
	*   n_queries (int): total number of constraint entries attempted
	*   n_errors (int): total number of failed entries
	*/
	public static function rebuild_constraints() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ';
			$response->errors	= [];
			$response->success	= 0;

		// import file with all definitions of indexes
		// require_once dirname(__FILE__) . '/db_pg_definitions.php';
		$config			= include dirname(__FILE__) . '/db_pg_definitions.php';
		$ar_constraint	= $config['ar_constraint'];

		// Validation for db_pg_definitions vars.
		if (!isset($ar_constraint) || !is_array($ar_constraint) || empty($ar_constraint)) {
			$response->errors[] = "No SQL function queries found in db_pg_definitions.php";
			return $response;
		}

		// exec
		foreach ($ar_constraint as $constraint) {

			// debug info
			debug_log(__METHOD__
				. " Executing rebuild_constraints SQL sentence " . PHP_EOL
				. ' name: ' . trim($constraint->name)
				. ' info: ' . trim($constraint->info)
				, logger::WARNING
			);

			$tables = $constraint->tables;

			foreach ($tables as $table) {

				// 0 Prevent errors if table not exists
					$table_exists = DBi::check_table_exists($table);
					if( $table_exists===false ) {
						$response->errors[] = "Table $table does not exist. Ignored constraint $constraint->name";
						continue;
					}

				// 1 Drop
					// exec drop query
					$sql_query		= db_tasks::parse_sql_sentence($constraint->drop, $table);
					$sql_query		= db_tasks::clean_sql_sentence($sql_query);
					if (!empty($sql_query)) {
						$query_response	= db_tasks::exec_sql_query($sql_query);

						if( $query_response->result===false ) {
							$response->errors[] = $query_response->errors;
							continue;
						}
					}

				// 2 Add
					// exec add query
					$sql_query		= db_tasks::parse_sql_sentence($constraint->add, $table);
					$sql_query		= db_tasks::clean_sql_sentence($sql_query);
					if (!empty($sql_query)) {
						$query_response	= db_tasks::exec_sql_query($sql_query);

						if( $query_response->result===false ) {
							$response->errors[] = $query_response->errors;
							continue;
						}
					}
			}

			$response->success++;
		}

		// debug
			debug_log(__METHOD__
				. " Exec rebuild_constraints " . PHP_EOL
				. ' sql_query: ' .PHP_EOL. json_encode( $ar_constraint ) . PHP_EOL
				, logger::DEBUG
			);

		// response OK
		$response->result	= true;
		$response->msg		= count($response->errors)>0
			? 'Warning. Request done with errors'
			: 'OK. Request done successfully';
		$response->n_queries = count($ar_constraint);
		$response->n_errors = count($response->errors);


		return $response;
	}//end rebuild_constraints



	/**
	* GET_TABLES
	* Returns the names of all tables in the 'public' schema of the Dédalo database.
	*
	* Queries pg_tables (a PostgreSQL system catalog view) filtered by schemaname = 'public'.
	* This excludes system catalogs (pg_catalog), information_schema tables, and any tables
	* in custom schemas.
	*
	* The result resource is freed before returning to avoid leaking pg result handles.
	*
	* @return array - flat list of table name strings
	* @throws Exception - if the database connection cannot be obtained or the query fails
	*/
	public static function get_tables() : array {

		// connection
		$conn = DBi::_getConnection();
		if (!$conn) {
			throw new Exception('Database connection failed');
		}

		$sql = "
			SELECT tablename
			FROM pg_tables
			WHERE schemaname = 'public';
		";
		$result = pg_query($conn, $sql);

		// Error handling for the query
		if (!$result) {
			throw new Exception('Database query failed: ' . pg_last_error($conn));
		}

		$tables = [];
		while ($row = pg_fetch_assoc($result)) {
			$tables[] = $row['tablename'];
		}

		// Free the result resource
		pg_free_result($result);

		return $tables;
	}//end get_tables



	/**
	* GET_TABLE_INDEXES
	* Retrieves index information for a given table from the pg_indexes system catalog,
	* sorted by disk size descending (largest index first).
	*
	* The table name is escaped with pg_escape_string() before interpolation into the
	* query string. Note that pg_escape_string() escapes string literal content (for use
	* inside single quotes), which is appropriate here since $table is compared with '=' in
	* a WHERE clause — it is NOT used as a table/column identifier.
	*
	* Returns an empty array (and logs the error) on query failure rather than throwing,
	* unlike get_tables() which throws. This asymmetry exists because get_table_indexes()
	* is typically called for display/diagnostics where a degraded result is acceptable.
	*
	* Each element of the returned array is an associative array with keys:
	*   schemaname (string): always 'public' for standard Dédalo tables
	*   tablename  (string): echoes back the queried table name
	*   indexname  (string): PostgreSQL index name
	*   index_size (string): human-readable size string from pg_size_pretty()
	*   indexdef   (string): the full CREATE INDEX statement for the index
	*
	* @param string $table - Table name to query indexes for
	* @return array - Array of associative arrays; empty array on query failure
	* @throws Exception - If the database connection cannot be obtained
	*/
	public static function get_table_indexes( string $table ) : array {

		// connection
		$conn = DBi::_getConnection();
		if (!$conn) {
			throw new Exception('Database connection failed');
		}

		// Sanitize table name to prevent SQL injection
		$table = pg_escape_string($conn, $table);

		$sql = "
			SELECT
				schemaname,
				tablename,
				indexname,
				pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size,
				indexdef
			FROM pg_indexes
			WHERE tablename = '{$table}'
			ORDER BY pg_relation_size(indexname::regclass) DESC;
		";
		$result = pg_query($conn, $sql);

		// Error handling for the query
		if (!$result) {
			debug_log(__METHOD__
				. " Database query failed " . PHP_EOL
				. ' Error: '. pg_last_error($conn)
				, logger::ERROR
			);
			return [];
		}

		$indexes = [];
		while ($row = pg_fetch_assoc($result)) {
			$indexes[] = [
				'schemaname' => $row['schemaname'],
				'tablename' => $row['tablename'],
				'indexname' => $row['indexname'],
				'index_size' => $row['index_size'],
				'indexdef' => $row['indexdef']
			];
		}

		// Free the result resource
		pg_free_result($result);

		return $indexes;
	}//end get_table_indexes



	/**
	* PARSE_SQL_SENTENCE
	* Substitutes the '{$table}' placeholder in an SQL template string with the given
	* table name.
	*
	* All index, constraint, and function SQL definitions in db_pg_definitions.php use
	* '{$table}' (literal brace-dollar-brace) as the per-table placeholder so that a
	* single definition can be applied to multiple tables (e.g. all matrix_* tables).
	* This method performs the literal string replacement — no quoting or escaping is
	* applied here; callers are responsible for validating the table name before calling.
	*
	* @param string $template - SQL string containing '{$table}' placeholder(s)
	* @param string $table - Validated table name to substitute in
	* @return string - SQL with all '{$table}' occurrences replaced by $table
	*/
	private static function parse_sql_sentence( string $template, string $table) : string {
		return str_replace('{$table}', $table, $template);
	}//end parse_sql_sentence



	/**
	* CLEAN_SQL_SENTENCE
	* Normalises an SQL string by trimming leading/trailing whitespace and replacing all
	* tab characters with spaces, producing a single-line-friendly statement.
	*
	* SQL templates in db_pg_definitions.php are indented with tabs for readability.
	* Before execution the tabs must be collapsed to spaces to prevent psql / pg_query()
	* from misinterpreting whitespace in certain contexts (e.g. heredoc-style strings).
	* Newlines are intentionally preserved; only tabs are replaced.
	*
	* @param string $sql_query - Raw SQL string, possibly with leading/trailing whitespace and tabs
	* @return string - Trimmed SQL with tabs converted to spaces
	*/
	private static function clean_sql_sentence( string $sql_query ) : string {
		return trim(str_replace(["\t"], [' '], $sql_query));
	}//end clean_sql_sentence



	/**
	* EXEC_SQL_QUERY
	* Executes a single SQL statement against the Dédalo PostgreSQL connection and
	* returns a normalised response object. Used internally by all rebuild/maintenance
	* methods as a unified execution and error-collection point.
	*
	* On success, $response->result holds the PgSql\Result resource (truthy), which is
	* immediately freed before returning. On failure, result is false and the PostgreSQL
	* error string from pg_last_error() is appended to $response->errors.
	*
	* (!) $response->result is set to the pg_query() return value — which is a
	* PgSql\Result on success and false on failure. After pg_free_result() is called the
	* resource is freed, but $response->result still holds the (now freed) reference. Callers
	* must test $response->result===false to detect failure; do not attempt to use the
	* resource after this method returns.
	*
	* @param string $sql_query - SQL statement to execute (not parameterised; must be pre-sanitized)
	* @return object $response - stdClass with:
	*   result (mixed): PgSql\Result (freed) on success, false on failure
	*   errors (array): empty on success; one error string entry on failure
	*/
	private static function exec_sql_query( string $sql_query ) : object {

		$response = new stdClass();
			$response->result = false;
			$response->errors = [];

		// debug info
		debug_log(__METHOD__
			. " Executing sql_query SQL sentence " . PHP_EOL
			. ' sql_query: ' . trim($sql_query)
			, logger::DEBUG
		);

		// connection
		$conn = DBi::_getConnection();
		if (!$conn) {
			$response->errors[] = " Error: Invalid database connection";
			return $response;
		}

		// exec the SQL query
		$result = pg_query($conn, $sql_query);
		if($result===false) {
			// error case
			debug_log(__METHOD__
				." Error Processing sql query Request ". PHP_EOL
				. pg_last_error($conn) .PHP_EOL
				. 'sql query: '.to_string($sql_query)
				, logger::ERROR
			);
			// the PostgreSQL error to show into the response
			$response->errors[] = " Error Processing sql query Request: ". pg_last_error($conn);
		}
		// set the result
		$response->result = $result;

		// Free the result resource if successful
		if ($result && $result !== false) {
			pg_free_result($result);
		}


		return $response;
	}//end exec_sql_query



	/**
	* ANALYZE_DB
	* Runs VACUUM ANALYZE on the entire database to refresh the PostgreSQL query planner's
	* statistics and reclaim space from dead tuples.
	*
	* VACUUM ANALYZE is heavier than a plain ANALYZE: it first reclaims storage from rows
	* deleted or updated since the last vacuum, then collects fresh column statistics
	* (value distribution, most-common values, histogram bounds). The combined operation
	* is preferred here over ANALYZE alone because large Dédalo imports and diffusion runs
	* produce significant dead-tuple churn.
	*
	* VACUUM cannot run inside a transaction block, so this method uses pg_query() directly
	* (not DBi's transaction wrappers). If autocommit is disabled externally this call
	* will fail with a PostgreSQL error.
	*
	* Execution time is captured (microtime) and exposed as $response->execution_time for
	* caller logging. The operation is throttled to at most once per 24 hours by
	* should_run_analyze() / the dd_cache timestamp mechanism.
	*
	* @return object $response - stdClass with:
	*   result (mixed): PgSql\Result (freed) on success, false on failure
	*   errors (array): populated with a pg_last_error() string on failure
	*   msg (string): 'OK. Request done successfully' or 'Warning. Request done with errors'
	*   execution_time (float): elapsed seconds from start to end of this method
	*/
	public static function analyze_db() : object {
		$start_time = microtime(true);

		$response = new stdClass();
			$response->result = false;
			$response->errors = [];

		// Get and validate database connection
		$conn = DBi::_getConnection();
		if (!$conn) {
			$response->errors[] = " Error: Invalid database connection";
			return $response;
		}

		$sql = "VACUUM ANALYZE;";
		$result = pg_query($conn, $sql);

		// Error handling for the query
		if (!$result) {
			$response->errors[] = " Error Processing sql query Request: ". pg_last_error($conn);
		} else {
			// Set successful result
			$response->result = $result;
		}

		// Free the result resource only if it's valid
		if ($result) {
			pg_free_result($result);
		}

		$response->msg = count($response->errors)>0
			? 'Warning. Request done with errors'
			: 'OK. Request done successfully';

		$end_time = microtime(true);
		$response->execution_time = $end_time - $start_time;

		return $response;
	}//end analyze_db



	/**
	* GET_ANALYZE_CACHE_FILE_NAME
	* Returns the dd_cache file name used to persist the last-run timestamp of analyze_db().
	*
	* The name is prefixed with DEDALO_ENTITY so that multi-tenant installations (each with
	* its own entity constant) maintain separate throttle records. The file is managed by
	* dd_cache::cache_from_file() / dd_cache::cache_to_file() and is not user-accessible.
	*
	* @return string - Cache file name (not a full path; dd_cache resolves the directory)
	*/
	public static function get_analyze_cache_file_name() : string {
		return DEDALO_ENTITY . '_cache_db_analyze_last_run.php';
	}//end get_analyze_cache_file_name



	/**
	* SHOULD_RUN_ANALYZE
	* Determines whether analyze_db() should be called based on the elapsed time since the
	* last successful run, using a dd_cache file as the persistent timestamp store.
	*
	* Returns true (run is needed) in three cases:
	*  1. The cache file does not exist (no prior run recorded).
	*  2. The cache file exists but contains invalid or missing 'timestamp' data.
	*  3. More than 86 400 seconds (24 hours) have elapsed since the stored timestamp.
	*
	* Returns false (throttle active) when a valid timestamp is found and fewer than 24 hours
	* have passed. The caller is responsible for writing the new timestamp to the cache file
	* after a successful analyze_db() run (this method is read-only).
	*
	* @return bool - true when analyze_db() should be invoked; false when it should be skipped
	*/
	public static function should_run_analyze() : bool {

		$cache_file_name = self::get_analyze_cache_file_name();

		// check if cache file exists
		$file_exists = dd_cache::cache_file_exists((object)[
			'file_name'	=> $cache_file_name,
			'prefix'	=> ''
		]);

		// no previous execution, should run
		if ($file_exists===false) {
			return true;
		}

		// read cache data
		$cache_data = dd_cache::cache_from_file((object)[
			'file_name'	=> $cache_file_name,
			'prefix'	=> ''
		]);

		// invalid cache data, should run
		if (empty($cache_data) || !isset($cache_data->timestamp)) {
			return true;
		}

		// check time difference (24 hours = 86400 seconds)
		$current_time = time();
		$last_run_time = $cache_data->timestamp;
		$time_difference = $current_time - $last_run_time;

		// run if more than 24 hours have passed
		if ($time_difference >= 86400) {
			return true;
		}

		// recently executed, skip
		return false;
	}//end should_run_analyze



}//end db_tasks
