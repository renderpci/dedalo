<?php declare(strict_types=1);
/**
* CLASS MATRIX_DB_MANAGER
* The primary PostgreSQL data-access layer for Dédalo's matrix storage model.
*
* All section records in Dédalo live in a family of "matrix" tables that share a common
* structure: every row is identified by the composite key (section_tipo, section_id), and
* most payload columns store JSONB data keyed by component tipo.  This class is the single
* choke-point through which PHP code reads, writes, and deletes those rows, providing:
*
* - A closed allowlist of table and column names so no caller can inject arbitrary SQL
*   identifiers — every public method validates its $table argument against $tables and
*   rejects unknown column names from $columns.
* - Atomic section-ID allocation via PostgreSQL advisory locks combined with an
*   UPSERT on matrix_counter / matrix_counter_dd, with automatic self-healing when
*   a duplicate-key error reveals a stale counter (create).
* - Safe bulk JSON-path writes using nested jsonb_set_lax expressions so a single
*   round-trip can update multiple keys in multiple JSONB columns (update_by_key).
* - A prepared-statement pool (exec_search) that recycles plans across calls and
*   deallocates all plans when the pool grows beyond 1 000 entries.
* - Integrated slow-query logging and per-call metrics (read/write latency, call counts,
*   max latency) recorded through the metrics:: helper when SHOW_DEBUG is enabled.
*
* All methods are static.  The class is never instantiated.
* Uses: DBi (connection pool), json_handler (JSONB encoding), counter (counter repair),
* logger, metrics, and debug helpers (debug_log, debug_prepared_statement, …).
*
* Related tables (not managed here, but in sibling classes):
*   matrix_activity_db_manager  — activity-log rows
*   tm_db_manager               — time-machine snapshot rows
*   dd_ontology_db_manager      — ontology (matrix_dd / matrix_layout_dd) rows
*
* @package Dédalo
* @subpackage Core
*/
class matrix_db_manager {

	/**
	* Closed allowlist of writable matrix tables.
	* Every public method validates $table against this map before building any SQL.
	* The map value is always `true`; existence of the key is what matters.
	* Tables whose names end with '_dd' store ontology data shared across all Dédalo
	* installations (e.g. matrix_dd, matrix_layout_dd) and use a separate counter table
	* (matrix_counter_dd) managed by the master instance.
	* @var array<string,true> $tables
	*/
	public static array $tables = [
		'matrix'					=> true,
		'matrix_activities'			=> true,
		'matrix_activity_diffusion'	=> true,
		'matrix_dataframe'			=> true,
		'matrix_dd'					=> true,
		'matrix_hierarchy'			=> true,
		'matrix_hierarchy_main'		=> true,
		'matrix_indexations'		=> true,
		'matrix_langs'				=> true,
		'matrix_layout'				=> true,
		'matrix_layout_dd'			=> true,
		'matrix_list'				=> true,
		'matrix_nexus'				=> true,
		'matrix_nexus_main'			=> true,
		'matrix_notes'				=> true,
		'matrix_ontology'			=> true,
		'matrix_ontology_main'		=> true,
		'matrix_profiles'			=> true,
		'matrix_projects'			=> true,
		'matrix_stats'				=> true,
		'matrix_test'				=> true,
		'matrix_tools'				=> true,
		'matrix_users'				=> true
	];

	/**
	* Closed allowlist of writable column names for all matrix tables.
	* Used by create, update, update_by_key, and search to reject unknown column names.
	* 'section_id' and 'section_tipo' are handled separately by each method as required
	* identifiers and are intentionally absent here.
	* @var array<string,true> $columns
	*/
	public static array $columns = [
		'section_id'		=> true,
		'section_tipo'		=> true,
		'data'				=> true,
		'relation'			=> true,
		'string'			=> true,
		'date'				=> true,
		'iri'				=> true,
		'geo'				=> true,
		'number'			=> true,
		'media'				=> true,
		'misc'				=> true,
		'relation_search'	=> true,
		'meta'				=> true
	];

	/**
	* Subset of $columns whose values must be JSON-encoded before binding to PostgreSQL.
	* In create() and update(), any column listed here receives a ::jsonb cast placeholder
	* and its value is serialized via json_handler::encode() before being passed as a
	* parameter.  'section_id' and 'section_tipo' are plain scalars and are not listed.
	* @var array<string,true> $json_columns
	*/
	public static array $json_columns = [
		'data'				=> true,
		'relation'			=> true,
		'string'			=> true,
		'date'				=> true,
		'iri'				=> true,
		'geo'				=> true,
		'number'			=> true,
		'media'				=> true,
		'misc'				=> true,
		'relation_search'	=> true,
		'meta'				=> true
	];

	/**
	* Columns whose raw PostgreSQL text values must be cast to int by callers after a fetch.
	* PostgreSQL returns all column values as strings via pg_fetch_*; callers that need
	* typed integers (e.g. when constructing a locator) should check this map and cast.
	* @var array<string,true> $int_columns
	*/
	public static array $int_columns = [
		'id'				=> true,
		'section_id'		=> true
	];



	/**
	* CREATE
	* Inserts a new row into a matrix table and returns its newly allocated section_id.
	*
	* The section_id is allocated atomically inside PostgreSQL using a combination of a
	* transaction-scoped advisory lock (pg_advisory_xact_lock on hashtext(section_tipo))
	* and an UPSERT on matrix_counter / matrix_counter_dd.  The counter is initialised
	* from the actual MAX(section_id) of the target table when no counter row exists yet,
	* which avoids collisions after bulk imports that bypassed the counter machinery.
	*
	* Counter selection:
	*   Tables ending in '_dd' (ontology tables shared across installations) use
	*   matrix_counter_dd, managed by the master Dédalo instance.
	*   All other tables use matrix_counter local to the current installation.
	*
	* Error recovery:
	*   On a duplicate-key violation (SQLSTATE 23505) the method attempts one recursive
	*   self-call after asking counter::modify_counter($section_tipo, 'fix') to
	*   resynchronise the counter.  A static $create_depth guard prevents deeper recursion.
	*
	* All columns in $values are validated against the $columns allowlist.  JSONB columns
	* are encoded via json_handler::encode() and cast with ::jsonb in the SQL.
	*
	* (!) This method must be called inside an open transaction (DBi::transaction) so that
	* the advisory lock acquired here is held until the surrounding commit or rollback.
	* Outside a transaction the lock is released immediately and offers no isolation.
	*
	* @param string $table         - Name of the target matrix table (validated against $tables).
	* @param string $section_tipo  - Ontology tipo for the new record, e.g. 'oh1', 'dd561'.
	* @param object|null $values   = null - Optional payload; object whose properties are column
	*                                names mapped to their initial values.  Unknown columns are
	*                                silently skipped with an ERROR log entry.
	* @return int|false            - The new section_id on success, or false on any failure.
	*/
	public static function create(string $table, string $section_tipo, ?object $values = null): int|false {

		// Recursion guard (static persists across recursive calls within the same request)
		// Limits the counter self-heal path to exactly one retry; prevents an infinite
		// loop if modify_counter('fix') itself cannot correct a broken counter.
		static $create_depth = 0;

		// Validate table
		if (!isset(static::$tables[$table])) {
			debug_log(
				__METHOD__
				. " Invalid table. This table is not allowed to load matrix data." . PHP_EOL
				. ' table: ' . $table . PHP_EOL
				. ' allowed_tables: ' . json_encode(array_keys(static::$tables))
				, logger::ERROR
			);
			return false;
		}

		// Connection
		$conn = DBi::_getConnection();

		// Counter table selection
		// Tables whose names end with '_dd' (e.g. matrix_dd, matrix_layout_dd) hold ontology
		// data authored in one Dédalo master installation and distributed to others.
		// They use a separate counter table so that ontology-record IDs are managed
		// independently from installation-local section IDs.
		$counter_table = substr($table, -3) === '_dd'
			? 'matrix_counter_dd' // Public counter managed by master
			: 'matrix_counter'; // Private counters from current installation

		// Build the column/placeholder/param arrays incrementally.
		// section_tipo is $1 (always first); section_id is read back from the CTE
		// (updated_counter.value), so it is never a bound parameter.
		$columns		= ['"section_tipo"', '"section_id"']; // required columns
		$placeholders	= ['$1', 'updated_counter.value']; // placeholders for them
		$params			= [$section_tipo]; // param values (first one for tipo)
		$param_index	= 2; // next param index ($2, $3, ...)

		// Add dynamic columns
		if ($values !== null) {
			foreach ($values as $col => $value) {

				// Columns. Only accepts normalized columns
				if (!isset(self::$columns[$col])) {
					debug_log(
						__METHOD__ . " Ignored invalid column name: $col" . PHP_EOL
						. ' allowed_columns: ' . json_encode(self::$columns)
						, logger::ERROR
					);
					continue;
				}
				$columns[] = pg_escape_identifier($conn, $col);

				// Placeholders / Values
				if ($value !== null && isset(self::$json_columns[$col])) {
					// Encode PHP array/object as JSON string
					$params[]		= json_handler::encode($value);
					$placeholders[]	= '$' . $param_index . '::jsonb';
				} else {
					$params[]		= $value;
					$placeholders[]	= '$' . $param_index;
				}

				// Increase param index value
				$param_index++;
			}
		}

		// Optimized single-query approach with advisory lock
		// The lock is automatically released when the transaction ends (COMMIT or ROLLBACK)

		// (dead code) Earlier simpler variant: initialised the counter from 1 instead of
		// scanning the table for the actual MAX(section_id).  Replaced by the calc_start
		// CTE below to survive bulk imports that create gaps or bypass the counter.
		// $sql = "
		// 	WITH locked AS (
		// 		SELECT pg_advisory_xact_lock(hashtext($1))
		// 	),
		// 	updated_counter AS (
		// 		INSERT INTO $counter_table (tipo, value)
		// 		VALUES ($1, 1)
		// 		ON CONFLICT (tipo) DO UPDATE
		// 		SET value = $counter_table.value + 1
		// 		RETURNING value
		// 	)
		// 	INSERT INTO $table (" . implode(', ', $columns) . ")
		// 	SELECT " . implode(', ', $placeholders) . " FROM updated_counter
		// 	RETURNING section_id;
		// ";

		// $result = pg_query_params($conn, $sql, $params);

		// If the counter record is missing, it will initialize using the next available section_id
		// from the section tipo.
		// If the counter record exists, it will increment the existing value
		$sql = "
			WITH locked AS (
			 -- Keep the lock to prevent race conditions
			 SELECT pg_advisory_xact_lock(hashtext($1))
			),
			-- Step 1: Calculate where the counter SHOULD start based on existing data
			calc_start AS (
			 SELECT COALESCE(MAX(section_id), 0) + 1 as next_start
			 FROM $table
			 WHERE section_tipo = $1
			),
			updated_counter AS (
			 INSERT INTO $counter_table (tipo, value)
			 -- Step 2: Initialize with the calculated max value (safe fallback)
			 SELECT $1, next_start FROM calc_start
			 ON CONFLICT (tipo)
			 DO UPDATE
			  -- Step 3: If the counter exists, ignore the calculation and just increment.
			  -- DB-01: reference the actual conflict-target table ($counter_table),
			  -- not a hardcoded 'matrix_counter'. For '_dd' sections the target is
			  -- 'matrix_counter_dd'; hardcoding raised 'missing FROM-clause entry for
			  -- table matrix_counter' on the second insert (DO UPDATE) of those tables.
			  SET value = $counter_table.value + 1
			  RETURNING value
			)
			INSERT INTO $table (" . implode(', ', $columns) . ")
			SELECT " . implode(', ', $placeholders) . " FROM updated_counter
			RETURNING section_id;
		";

		// exec_search manages prepared statement recycling and error logging
		$result = self::exec_search($sql, $params);

		if (!$result) {
			// Check if the error is because the counter is wrong
			$error = pg_last_error($conn);
			if (str_contains($error, 'ERROR:  duplicate key') || str_contains($error, '23505')) {
				// Duplicate entry detected
				debug_log(__METHOD__
					.' The new record could not be created. The counter is wrong. Trying to fix it.' . PHP_EOL
					.' func_get_args: ' . to_string( func_get_args() )
					, logger::ERROR
				);
				// Try to fix the counter and exec again (with recursion guard)
				if ($create_depth < 1) {
					$create_depth++;
					try {
						$modify_counter_result = counter::modify_counter($section_tipo, 'fix');
						if ($modify_counter_result === true) {
							return self::create($table, $section_tipo, $values);
						}
					} catch (\Throwable $th) {
						debug_log(__METHOD__
							.' The new record could not be created. The counter is wrong and the counter fix attempt failed.' . PHP_EOL
							.' func_get_args: ' . to_string( func_get_args() )
							, logger::ERROR
						);
					} finally {
						$create_depth--;
					}
				}
			}

			return false;
		}

		// Fetch section_id
		$section_id = pg_fetch_result($result, 0, 'section_id');
		// Check valid section_id
		if ($section_id === false) {
			debug_log(__METHOD__
				. " Error giving the new section_id" . PHP_EOL
				. ' last_error: ' . pg_last_error($conn) . PHP_EOL
				. ' sql: ' . to_string($sql)
				, logger::ERROR
			);
			return false;
		}


		// Cast to INT always (received is string by default)
		return (int)$section_id;
	}//end create



	/**
	* ACQUIRE_NODE_LOCK
	* Acquires a transaction-scoped PostgreSQL advisory lock for a single section node.
	*
	* Used to serialise concurrent tree mutations (child ordering, node moves, child inserts)
	* that target the same parent node.  The lock key is built from section_tipo + '_' +
	* section_id, matching the hashtext pattern used for the counter lock in create().
	* Because pg_advisory_xact_lock is transaction-scoped, the lock is released
	* automatically when the surrounding transaction commits or rolls back.
	*
	* (!) Callers MUST be inside an open transaction (via DBi::begin_transaction / the
	* DBi::transaction wrapper) before calling this method.  Outside a transaction the lock
	* is released instantly by PostgreSQL and provides no mutual exclusion.
	*
	* The method pre-checks pg_transaction_status() and logs an ERROR (returning false)
	* when called from idle-connection context so that missing transactions are surfaced
	* during development rather than silently allowing races.
	*
	* @param string $section_tipo  - Ontology tipo identifying the node's section type.
	* @param int|string $section_id - Numeric ID of the node to lock.
	* @return bool - true when the lock was successfully acquired; false on connection
	*                error, idle-connection guard triggered, or pg_query_params failure.
	*/
	public static function acquire_node_lock( string $section_tipo, int|string $section_id ) : bool {

		$conn = DBi::_getConnection();
		if ($conn === false) {
			debug_log(__METHOD__ . ' Error. No DB connection available', logger::ERROR);
			return false;
		}

		if (pg_transaction_status($conn) === PGSQL_TRANSACTION_IDLE) {
			debug_log(__METHOD__
				. ' Error. acquire_node_lock called outside a transaction; lock would be ineffective' . PHP_EOL
				. ' section_tipo: ' . $section_tipo . PHP_EOL
				. ' section_id: ' . $section_id
				, logger::ERROR
			);
			return false;
		}

		$result = pg_query_params(
			$conn,
			'SELECT pg_advisory_xact_lock(hashtext($1))',
			[$section_tipo . '_' . $section_id]
		);

		if ($result === false) {
			debug_log(__METHOD__
				. ' Error. Unable to acquire node advisory lock' . PHP_EOL
				. ' section_tipo: ' . $section_tipo . PHP_EOL
				. ' section_id: ' . $section_id . PHP_EOL
				. ' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end acquire_node_lock



	/**
	* READ
	* Fetches a single row from a matrix table by composite key (section_tipo, section_id).
	*
	* The query uses SELECT * because fetching the full row is faster than projecting a
	* fixed column list when row width is similar to block size (a PostgreSQL-level
	* optimisation observed in query plans for this table family).
	*
	* JSONB columns are stored as raw JSON strings by the PostgreSQL driver; callers that
	* need decoded PHP structures must call json_decode() on the relevant properties.
	* The class provides $json_columns to identify which properties require decoding.
	*
	* Returns false both when the row does not exist and when the query itself fails —
	* callers must check pg_last_error() or rely on the error already being logged if they
	* need to distinguish between the two cases.
	*
	* @param string $table        - Target matrix table name (validated against $tables).
	* @param string $section_tipo - Ontology tipo filter, e.g. 'oh1'.
	* @param int    $section_id   - Numeric record identifier.
	* @return object|false        - stdClass row object on success; false when not found
	*                              or on query failure.
	*/
	public static function read(string $table, string $section_tipo, int $section_id): object|false	{

		// check matrix table
		if (!isset(static::$tables[$table])) {
			debug_log(__METHOD__
				. " Invalid table. This table is not allowed to load matrix data." . PHP_EOL
				. ' table: ' . $table . PHP_EOL
				. ' allowed_tables: ' . json_encode(array_keys(static::$tables))
				, logger::ERROR
			);
			return false;
		}

		$select_fields	= '*'; // Select all because is faster than the list of the columns
		$sql = 'SELECT ' . $select_fields . ' FROM "' . $table . '" WHERE section_id = $1 AND section_tipo = $2::text LIMIT 1';

		// exec_search manages prepared statement recycling and error logging
		$result = self::exec_search($sql, [$section_id, $section_tipo]);

		if (!$result) {
			return false;
		}

		// Fetch result into a object row
		$row = pg_fetch_object($result);
		pg_free_result($result);


		// Return the result or false if not found
		return $row ?: false;
	}//end read



	/**
	* UPDATE
	* Updates one or more columns in a matrix table row identified by (section_tipo, section_id).
	*
	* All column names in $values are validated against the $columns allowlist before any SQL
	* is built.  JSONB columns are serialised via json_handler::encode() and cast with ::jsonb.
	*
	* Upsert fallback: if the UPDATE affects zero rows (the record does not yet exist), the
	* method constructs and executes an INSERT using the same parameter array that was already
	* built for the UPDATE.  The INSERT column list is ['section_id', 'section_tipo'] prepended
	* to the valid columns from $values, and positional placeholders ($1, $2, …) are reused
	* directly because the WHERE parameters ($1, $2) happen to hold the right values.
	*
	* (!) The upsert INSERT does not acquire an advisory lock or update the matrix_counter
	* table.  It should therefore be used only in contexts where the caller knows the
	* section_id is already allocated (e.g. a migration pass, not a normal record creation).
	* Use create() for the authoritative new-record path.
	*
	* @param string $table        - Target matrix table name (validated against $tables).
	* @param string $section_tipo - Ontology tipo identifying the row.
	* @param int    $section_id   - Numeric record identifier.
	* @param object $values       - Payload: object whose properties are column names mapped
	*                               to new values.  Unknown column names are skipped with an
	*                               ERROR log entry.
	* @return bool                - true on success; false when validation fails, all columns
	*                               are rejected, the query cannot be prepared, or execution fails.
	*/
	public static function update(string $table, string $section_tipo, int $section_id, object $values): bool {

		// Validate table name against allowed list (Security/Guardrail)
		if (!isset(static::$tables[$table])) {
			debug_log(
				__METHOD__
					. " Invalid table. This table is not allowed to load matrix data." . PHP_EOL
					. ' table: ' . $table . PHP_EOL
					. ' allowed_tables: ' . json_encode(array_keys(static::$tables)),
				logger::ERROR
			);
			return false;
		}

		// Check for empty update payload. Cast to array to avoid empty() false positives
		if (empty((array)$values)) {
			debug_log(
				__METHOD__
					. " Ignored update with empty values " . PHP_EOL
					. ' values: ' . json_encode($values),
				logger::WARNING
			);
			return false;
		}

		// DB connection
		$conn = DBi::_getConnection();

		// Initialize parameters with the WHERE clause values
		$params = [
			$section_id,     // $1 in SQL
			$section_tipo    // $2 in SQL
		];

		$set_clauses = [];
		$param_index = 3;

		// Single-pass loop: Validate columns, prepare values, and build SQL parts simultaneously.
		$columns = ['section_id', 'section_tipo'];
		foreach ($values as $column => $value) {
			// Validate column name (Security/Guardrail)
			if (!isset(static::$columns[$column])) {
				debug_log(
					__METHOD__
						. " Ignored invalid column name: $column" . PHP_EOL
						. ' allowed_columns: ' . json_encode(static::$columns),
					logger::ERROR
				);
				continue;
			}

			// Prepare value: JSON encode if it's a designated JSON column and not null
			$safe_value = ($value !== null && isset(static::$json_columns[$column]))
				? json_handler::encode($value)
				: $value;

			// Build the SET clause, safely quoting the column name for PostgreSQL
			$set_clauses[] = pg_escape_identifier($conn, $column) . ' = $' . $param_index++;

			// Add the prepared value directly to the parameter array
			$params[] = $safe_value;

			// Column add
			$columns[] = $column;
		}

		// SQL Execution
		// Construct the final query string
		$sql = 'UPDATE ' . $table
			. ' SET ' . implode(', ', $set_clauses)
			. ' WHERE section_id = $1 AND section_tipo = $2';

		// exec_search manages recycling statements
		$result = self::exec_search($sql, $params);

		// No record existing case.
		// When the record doesn't exist in DB, perform a INSERT
		if ($result && pg_affected_rows($result) == 0) {

			$placeholders = [];
			foreach($columns as $key => $column){
				$placeholders[] = '$'. ($key+1);
			}

			$sql_insert = 'INSERT INTO ' . $table . ' ('
				. implode(', ', $columns) . ')
				VALUES ('
				. implode(', ', $placeholders) . ')';

			// exec_search manages recycling statements
			$result = self::exec_search($sql_insert, $params);
		}

		if (!$result) {
			debug_log(__METHOD__
				. " Error execution UPDATE/INSERT on table: $table " . PHP_EOL
				. ' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end update



	// (dead code) UPDATE_BY_KEY single-item variant (MONO).
	// Superseded by the multi-item batch version below which handles multiple
	// {column, key, value} updates in one round-trip.  Kept for reference.
	// /**
	// * UPDATE_BY_KEY (MONO)
	// * Saves given value into the specified JSON key, it could be:
	// * a component container
	// * a section property data as created_date
	// * a component counter data
	// * Creates the path from the given key as componente_tipo {dd197} or property {created_date}.
	// * If the given value is empty, the path will be removed for clean database.
	// * @param string $table
	// * 	DB table name. E.g. 'matrix'
	// * @param string $section_tipo
	// * 	Section tipo. E.g. 'oh1'
	// * @param int $section_id
	// * 	Section id. E.g. '1582'
	// * @param string $data_column_name
	// * 	Name of the column in current table. E.g. 'string'
	// * @param string $key
	// * 	Key of the value in the column JSON object. E.g. 'oh25'
	// * @param ?array $value
	// * 	Element value. E.g. [{"id": 1, "lang": "lg-nolan", "value": "code 95"}]
	// * @return bool
	// * 	Returns false if JSON fragment save fails.
	// */
	// public static function update_by_key(
	// 	string $table,
	// 	string $section_tipo,
	// 	int $section_id,
	// 	string $data_column_name,
	// 	string $key,
	// 	?array $value
	// 	) : bool {

	// 	// sample SQL
	// 		// UPDATE matrix
	// 		// SET data = jsonb_set(
	// 		//     COALESCE(data, '{}'::jsonb), -- Use an empty object if data is NULL
	// 		//     '{numisdataXX}', -- path to the element
	// 		//     '{"key":1,"lang":"lg-spa","type":"dd750","value":"CODE1"}'::jsonb, -- new value (must be valid JSON)
	// 		//     true  -- create if missing (true/false)
	// 		// )
	// 		// WHERE section_tipo = 'numisdata224' AND section_id = 1;

	// 	// check matrix table
	// 	if (!isset(static::$tables[$table])) {
	// 		debug_log(__METHOD__
	// 			. " Invalid table. This table is not allowed to load matrix data." . PHP_EOL
	// 			. ' table: ' . $table . PHP_EOL
	// 			. ' allowed_tables: ' . json_encode(array_keys(static::$tables))
	// 			, logger::ERROR
	// 		);
	// 		return false;
	// 	}

	// 	$conn = DBi::_getConnection();
	// 	// Path is generated once, for top-level key
	// 	$path = '{'.$key.'}'; // JSON path for top-level key
	// 	// statement base name with prepared statement
	// 	$stmt_name = __METHOD__;

	// 	if (empty($value)) {

	// 		// DELETE operation
	// 		$full_stmt_name = $stmt_name . '_delete_' . $table . '_' . $data_column_name;

	// 		if (!isset(DBi::$prepared_statements[$full_stmt_name])) {
	// 			// Optimized SQL for deletion: deletes key, then checks if the result is '{}'. If so, sets column to NULL.
	// 			$sql = "
	// 				UPDATE $table
	// 				SET $data_column_name = CASE
	// 					WHEN ($data_column_name #- $1::text[]) = '{}'::jsonb THEN
	// 						NULL
	// 					ELSE
	// 						$data_column_name #- $1::text[]
	// 				END
	// 				WHERE section_id = $3 AND section_tipo = $2
	// 				RETURNING id
	// 			";
	// 			pg_prepare($conn, $full_stmt_name, $sql);
	// 			DBi::$prepared_statements[$full_stmt_name] = true;
	// 		}

	// 		// Parameters: $1=path, $2=tipo, $3=section_id
	// 		$params = [ $path, $section_tipo, $section_id ];

	// 	} else {

	// 		// UPDATE/SET operation
	// 		$full_stmt_name = $stmt_name . '_update_' . $table . '_' . $data_column_name;
	// 		$json_value	= json_encode($value, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE); // JSONB value

	// 		if (!isset(DBi::$prepared_statements[$full_stmt_name])) {
	// 			// Efficient SQL for setting/updating a key (uses COALESCE for NULL safety)
	// 			$sql = "
	// 				UPDATE $table
	// 				SET $data_column_name = jsonb_set(
	// 					COALESCE($data_column_name, '{}'::jsonb),
	// 					$1::text[],
	// 					$2::jsonb,
	// 					true
	// 				)
	// 				WHERE section_tipo = $3
	// 				  AND section_id = $4
	// 				RETURNING id
	// 			";
	// 			pg_prepare($conn, $full_stmt_name, $sql);
	// 			DBi::$prepared_statements[$full_stmt_name] = true;
	// 		}

	// 		// Parameters: $1=path, $2=json_value, $3=tipo, $4=section_id
	// 		$params = [ $path, $json_value, $section_tipo, $section_id ];
	// 	}

	// 	// 2. Execute Statement
	// 	$result = pg_execute(
	// 		$conn,
	// 		$full_stmt_name,
	// 		$params
	// 	);

	// 	// 3. Handle Result
	// 	if ($result) {
	// 		$rows_affected = pg_num_rows($result);
	// 		if ($rows_affected > 0) {

	// 			// Success. JSON path was successfully saved

	// 			// $saved_id = pg_fetch_result($result, 0, 0);
	// 			// debug_log(__METHOD__
	// 			// 	. " Successfully saved JSON path '$path'. Affected record ID: $table $saved_id"
	// 			// 	, logger::WARNING
	// 			// );

	// 			return true;

	// 		}else{

	// 			// No rows were updated (JSON path didn't exist or conditions didn't match)
	// 			debug_log(__METHOD__
	// 				. " Partial JSON data was NOT saved. Maybe path '$path' or section_id '$section_id' does not exist." . PHP_EOL
	// 				. ' table: ' . to_string($table) . PHP_EOL
	// 				. ' column: ' . to_string($data_column_name) . PHP_EOL
	// 				. ' path: ' . $path . PHP_EOL
	// 				. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
	// 				. ' section_id: ' . to_string($section_id) . PHP_EOL
	// 				. ' value: ' . json_encode($value)
	// 				, logger::ERROR
	// 			);
	// 		}

	// 	}else{

	// 		// Query failed
	// 		debug_log(__METHOD__
	// 			. " Delete operation failed:  " . PHP_EOL
	// 			. ' Error: ' . pg_last_error($conn) . PHP_EOL
	// 			. ' table: ' . to_string($table) . PHP_EOL
	// 			. ' column: ' . to_string($data_column_name) . PHP_EOL
	// 			. ' path: ' . to_string($path) . PHP_EOL
	// 			. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
	// 			. ' section_id: ' . to_string($section_id) . PHP_EOL
	// 			. ' value: ' . json_encode($value)
	// 			, logger::ERROR
	// 		);
	// 	}

	// 	return false;
	// }//end update_by_key




	/**
	* UPDATE_BY_KEY
	* Atomically writes one or more JSON-path values into JSONB columns of a matrix row,
	* grouping multiple writes to the same column into a single nested jsonb_set_lax chain.
	*
	* Each element of $data_to_save describes one key-write operation:
	*   { column: string, key: string, value: mixed|null }
	* where:
	*   - column — the JSONB column to modify (e.g. 'data', 'relation', 'string').
	*   - key    — the top-level key within that column (a component tipo or a section
	*              property name such as 'created_date').  Treated as a text[] path
	*              parameter, so it is data — not interpolated into SQL.
	*   - value  — the new value encoded as JSONB.  When null, jsonb_set_lax with the
	*              'delete_key' nullif_action removes the key from the object instead of
	*              writing JSON null, which keeps the database clean.
	*
	* Multiple items for the same column are merged into a single SET clause by nesting
	* jsonb_set_lax calls: each call wraps the result of the previous, so all writes for
	* that column are applied in one PostgreSQL expression (left-to-right order).
	*
	* Security: column names are interpolated directly into SQL (pg_query parameters cannot
	* bind column identifiers) so they are validated against a strict identifier pattern
	* (^[a-zA-Z_][a-zA-Z0-9_]*$) in addition to the $columns allowlist check.  The key
	* values are always bound as text[] parameters and are therefore safe.
	*
	* Returns false if the row does not exist (pg_num_rows returns 0) — the method does
	* NOT perform an upsert fallback.  Use update() for upsert behaviour.
	*
	* @param string $table        - Target matrix table (validated against $tables).
	* @param string $section_tipo - Ontology tipo identifying the row.
	* @param int    $section_id   - Numeric record identifier.
	* @param array  $data_to_save - Array of objects [{column, key, value}, …].  Must be
	*                               non-empty; each element must be an object.
	* @return bool                - true when at least one row was affected; false on
	*                               validation failure, invalid data shape, JSON encode
	*                               error, or if the target row is not found.
	*/
	public static function update_by_key(
		string $table,
		string $section_tipo,
		int $section_id,
		array $data_to_save
		): bool {

		// check matrix table
		if (!isset(static::$tables[$table])) {
			debug_log(
				__METHOD__
					. " Invalid table. This table is not allowed to load matrix data." . PHP_EOL
					. ' table: ' . $table . PHP_EOL
					. ' allowed_tables: ' . json_encode(array_keys(static::$tables)),
				logger::ERROR
			);
			return false;
		}

		// check data_to_save
		if (empty($data_to_save)) {
			debug_log(
				__METHOD__
					. " Wrong data_to_save. Expected non empty array:  " . PHP_EOL
					. ' type: ' . gettype($data_to_save) . PHP_EOL
					. ' table: ' . to_string($table) . PHP_EOL
					. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
					. ' section_id: ' . to_string($section_id) . PHP_EOL
					. ' data_to_save: ' . json_encode($data_to_save, JSON_PRETTY_PRINT),
				logger::ERROR
			);
			return false;
		}



		// Parameters: $1=section_tipo, $2=section_id, $3=path, $4=value, $5=path2, $6=value2, etc.
		$params = [$section_id, $section_tipo];

		// Group data by column to handle multiple updates to the same column
		$columns_data = [];
		foreach ($data_to_save as $data) {

			// Check valid data
			if (!is_object($data)) {
				// Query failed
				debug_log(
					__METHOD__
						. " Wrong data_to_save => data. Expected object:  " . PHP_EOL
						. ' type: ' . gettype($data) . PHP_EOL
						. ' table: ' . to_string($table) . PHP_EOL
						. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
						. ' section_id: ' . to_string($section_id) . PHP_EOL
						. ' data_to_save: ' . json_encode($data_to_save, JSON_PRETTY_PRINT),
					logger::ERROR
				);
				return false;
			}

			$column		= $data->column;
			$key		= $data->key;
			$value		= $data->value;

			// DB-05: $column is interpolated directly into the UPDATE SET clause
			// (SQL column names cannot be bound as parameters), so it MUST be a bare
			// identifier — reject anything that could carry SQL. ($key below is bound
			// as a text[] path parameter, so it is data, not SQL.)
			if (!is_string($column) || !preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $column)) {
				debug_log(__METHOD__ . ' Rejected invalid column identifier: ' . to_string($column), logger::ERROR);
				return false;
			}

			// Group by column
			if (!isset($columns_data[$column])) {
				$columns_data[$column] = [];
			}

			$columns_data[$column][] = [
				'key' => $key,
				'value' => $value
			];
		}

		// Build SET clauses - one per column, with nested jsonb_set_lax for multiple keys
		$sentences = [];
		foreach ($columns_data as $column => $updates) {

			// Build nested jsonb_set_lax calls for this column
			$column_expression = "COALESCE($column, '{}'::jsonb)";

			foreach ($updates as $update) {
				$key = $update['key'];
				$value = $update['value'];

				// Path is generated for top-level key
				$path = '{' . $key . '}';

				// Convert value to valid JSON data
				if ($value !== null) {
					$json_value	= json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
					if ($json_value === false) {
						debug_log(__METHOD__ . " Invalid JSON value for key: $key", logger::ERROR);
						return false;
					}

				} else {
					$json_value = null;

				}

				// Add parameters
				// path is pushed first, then value.  After pushing both, count($params)
				// gives the 1-based index of the last element (value), and count - 1 gives
				// the path.  These become the $N placeholders in the SQL expression below.
				$params[] = $path;
				$params[] = $json_value;

				$path_index = count($params) - 1;
				$value_index = count($params);

				// Nest the jsonb_set_lax call
				$column_expression = "jsonb_set_lax(
					$column_expression,
					$$path_index::text[],
					$$value_index::jsonb,
					true,
					'delete_key'
				)";
			}

			// Add the complete SET clause for this column
			$sentences[] = "$column = $column_expression";


		}

		// Efficient SQL for setting/updating a key (uses COALESCE for NULL safety)
		$sql = '
			UPDATE ' . $table . '
			SET ' . implode(', ' . PHP_EOL, $sentences) . '
			WHERE section_id = $1 AND section_tipo = $2
			RETURNING id
		';

		// exec_search manages prepared statement recycling and error logging
		$result = self::exec_search($sql, $params);

		if ($result === false) {
			return false;
		}

		$rows_affected = pg_num_rows($result);
		return $rows_affected > 0;
	}//end update_by_key



	/**
	* DELETE
	* Deletes a single row from a matrix table identified by (section_tipo, section_id).
	*
	* Note: this method does NOT decrement or otherwise adjust the matrix_counter value for
	* the tipo — section IDs are never reused after deletion.  Callers that need cascading
	* cleanup (e.g. removing linked rows in matrix_hierarchy, matrix_nexus, etc.) must
	* handle those deletions separately before or after calling this method.
	*
	* The generated SQL naturally leverages the composite index
	* matrix_section_tipo_section_id_desc_idx (see inline comment in the method body).
	*
	* @param string $table        - Target matrix table (validated against $tables).
	* @param string $section_tipo - Ontology tipo identifying the row.
	* @param int    $section_id   - Numeric record identifier.
	* @return bool                - true on successful deletion (including when 0 rows matched);
	*                               false when validation fails or the query cannot be executed.
	*/
	public static function delete( string $table, string $section_tipo, int $section_id ) : bool {

		// check matrix table
		if (!isset(static::$tables[$table])) {
			debug_log(__METHOD__
				. " Invalid table. This table is not allowed to load matrix data." . PHP_EOL
				. ' table: ' . $table . PHP_EOL
				. ' allowed_tables: ' . json_encode(array_keys(static::$tables))
				, logger::ERROR
			);
			return false;
		}

		// Index use sample:
		// Index Scan using matrix_section_tipo_section_id_desc_idx on matrix
		$sql = 'DELETE FROM "' . $table . '"'
			. ' WHERE section_id = $1 AND section_tipo = $2';

		// exec_search manages prepared statement recycling and error logging
		$result = self::exec_search($sql, [$section_id, $section_tipo]);

		if (!$result) {
			return false;
		}

		return true;
	}//end delete



	/**
	* SEARCH
	* Returns an array of integer section_id values from a matrix table that match the
	* given filter conditions.
	*
	* Each element of $filter is an associative array with:
	*   - 'column'   (string)        — column to filter on (validated against $columns).
	*   - 'value'    (mixed)         — value to compare against.
	*   - 'operator' (string, opt.)  — comparison operator; defaults to '='.
	*                                  Allowed: =, !=, <, >, <=, >=, LIKE, ILIKE, @>.
	*
	* Unlike exec_search, this method does NOT use prepared statements — the column list
	* changes dynamically, which would require a separate prepared plan per unique column
	* combination.  pg_query_params is used instead, which still prevents SQL injection
	* for parameter values while allowing the column identifier to be interpolated safely
	* after allowlist validation.
	*
	* @DEPRECATED — this method is marked for removal.  Prefer the higher-level search
	* class (SQO-based) for all new query construction.
	*
	* @param string      $table  - Target matrix table (validated against $tables).
	* @param array       $filter - One or more filter objects [{column, value, operator?}, …].
	*                              Must be non-empty.
	* @param string|null $order  = null - Optional sort expression in the form "column DIR"
	*                              (e.g. "section_id DESC").  Both parts are validated before
	*                              being embedded in SQL.
	* @param int|null    $limit  = null - Optional row cap; cast to int before embedding.
	* @return array|false        - Array of int section_id values (may be empty) on success;
	*                              false on validation failure or query execution error.
	*/
	public static function search(string $table, array $filter, ?string $order = null, ?int $limit = null): array|false	{

		// Validate table
		if (!isset(static::$tables[$table])) {
			debug_log(
				__METHOD__
					. " Invalid table. This table is not allowed to load matrix data." . PHP_EOL
					. ' table: ' . $table . PHP_EOL
					. ' allowed_tables: ' . json_encode(array_keys(static::$tables)),
				logger::ERROR
			);
			return false;
		}

		// check values
		if (empty($filter)) {
			debug_log(
				__METHOD__
					. " Empty filter array " . PHP_EOL
					. ' filter: ' . json_encode($filter),
				logger::ERROR
			);
			return false;
		}

		$conn = DBi::_getConnection();

		// sample
		// $table,
		// DEDALO_SECTION_USERS_TIPO,
		// [
		// 	'column'	=> 'section_tipo',
		// 	'value'		=> DEDALO_SECTION_USERS_TIPO
		// ],
		// [
		// 	'column'	=> 'string',
		// 	'operator'	=> '@>',
		// 	'value'		=> '{"dd132": [{"lang": "lg-nolan", "value": "pepe"}]}'
		// ]
		// 1,
		// null

		// Add dynamic clauses
		$where_clauses	= [];
		$params			= []; // param values
		$param_index	= 1; // next param index ($2, $3, ...)
		static $allowed_ops = ['=', '!=', '<', '>', '<=', '>=', 'LIKE', 'ILIKE', '@>'];
		foreach ($filter as $item) {

			$column = $item['column'];
			if (!isset(static::$columns[$column])) {
				debug_log(__METHOD__
					. " Invalid column. This column is not allowed to load matrix data." . PHP_EOL
					. ' column: ' . $column . PHP_EOL
					. ' allowed_columns: ' . json_encode(static::$columns)
					, logger::ERROR
				);
				return false;
			}

			$operator = $item['operator'] ?? '=';
			if (!in_array($operator, $allowed_ops, true)) {
				debug_log(__METHOD__ . " Invalid operator: $operator", logger::ERROR);
				return false;
			}

			$value = $item['value'];

			// search with operator
			$params[] = $value;

			$where_clauses[] = pg_escape_identifier($conn, $column) . ' ' . $operator . ' $' . $param_index;

			// Increase param index value
			$param_index++;
		}

		// ORDER BY clause
		$order_clause = '';
		if ($order !== null) {
			[$col, $dir] = explode(' ', $order, 2) + [null, null];
			$col = trim($col);
			$dir = strtoupper(trim($dir ?? 'ASC'));
			if (isset(static::$columns[$col]) && in_array($dir, ['ASC', 'DESC'], true)) {
				$order_clause = ' ORDER BY ' . pg_escape_identifier($conn, $col) . ' ' . $dir;
			}
		}

		// LIMIT clause
		$limit_clause = '';
		if ($limit !== null) {
			$limit_clause = ' LIMIT ' . (int)$limit;
		}

		// Without prepared statement (more dynamic and appropriate for changing columns scenarios)
		$sql = 'SELECT section_id FROM ' . pg_escape_identifier($conn, $table)
			. ' WHERE ' . implode(' AND ', $where_clauses)
			. $order_clause
			. $limit_clause;

		$result = pg_query_params($conn, $sql, $params);
		if (!$result) {
			debug_log(
				__METHOD__
					. " Error Processing Request Load " . to_string($sql) . PHP_EOL
					. ' error: ' . pg_last_error($conn),
				logger::ERROR
			);
			return false;
		}

		// Build and array of section_id values
		// $ar_section_id = [];
		// while ($row = pg_fetch_assoc($result)) {
		// 	$ar_section_id[] = (int)$row['section_id'];
		// }
		$ar_section_id = pg_fetch_all_columns($result, 0);


		return $ar_section_id ? array_map('intval', $ar_section_id) : [];
	}//end search



	/**
	* SQL_METRIC_BASE
	* Classify a SQL statement by its leading verb so metrics can track writes
	* (INSERT/UPDATE/DELETE) separately from reads (SELECT/WITH/…).
	*
	* Without this helper, every mutation would be bucketed as 'exec_search' and a
	* slow write would be indistinguishable from a slow read in the metrics dashboard.
	* Only the first 6 characters (after leading whitespace) are inspected, so CTE-based
	* INSERT/UPDATE/DELETE queries (which begin with "WITH …") are classified as reads.
	*
	* @param string $sql_query - The raw SQL string to classify.
	* @return string           - 'exec_write' for INSERT/UPDATE/DELETE; 'exec_search' otherwise.
	*/
	private static function sql_metric_base( string $sql_query ) : string {

		$verb = strtoupper(substr(ltrim($sql_query), 0, 6));
		if ($verb==='INSERT' || $verb==='UPDATE' || $verb==='DELETE') {
			return 'exec_write';
		}

		return 'exec_search';
	}//end sql_metric_base



	/**
	* EXEC_SEARCH
	* Executes a parameterised SQL query through a managed prepared-statement pool.
	*
	* Prepared-statement caching:
	*   The statement name is the MD5 hash of the SQL string.  On the first call for a
	*   given SQL string the statement is registered with pg_prepare(); subsequent calls
	*   reuse the cached plan via pg_execute().  When the pool grows beyond 1 000 entries,
	*   DEALLOCATE ALL is issued and the registry is cleared to prevent unbounded memory
	*   growth in long-running worker processes.  Note that DEALLOCATE ALL drops all
	*   session-level prepared statements, including any registered outside this class.
	*
	* Observability (active only when SHOW_DEBUG is true):
	*   - Classifies the query as a read or write via sql_metric_base() and increments the
	*     appropriate metrics::inc() counter.
	*   - Records total and maximum latency per class via metrics::add_time_ms() and
	*     metrics::observe_max().
	*   - Logs a WARNING with the interpolated SQL when execution time exceeds SLOW_QUERY_MS
	*     (configured in config_db.php, typically 6 000 ms).
	*   - When $verbose is true, adds a full call-stack trace to the debug log entry.
	*   - Skips slow-query and verbose logging during unit-test runs (IS_UNIT_TEST=true) and
	*     during database update passes (DEDALO_UPDATING env var).
	*
	* (!) This method is the central execution path for all matrix read and write queries.
	* Avoid calling pg_query / pg_query_params directly from other methods in this class.
	*
	* @param string $sql_query - Parameterised SQL with PostgreSQL $N placeholders.
	* @param array  $params    = [] - Values bound to the $1, $2, … placeholders.
	* @param bool   $verbose   = false - When true, emits a full backtrace in the debug log.
	* @return \PgSql\Result|false - Query result resource on success; false on connection
	*                               failure, pg_prepare failure, or pg_execute failure.
	*/
	public static function exec_search( string $sql_query, array $params=[], bool $verbose=false ) : \PgSql\Result|false {

		// debug
		if(SHOW_DEBUG===true) {
			$start_time = start_time();

			// metrics: classify reads vs writes (INSERT/UPDATE/DELETE)
			$metric_base = self::sql_metric_base($sql_query);
			metrics::inc($metric_base . '_total_calls');
		}

		// connection to DDBB
		$conn = DBi::_getConnection() ?? false;
		if ($conn===false) {
			debug_log(__METHOD__
				." Error. DDBB connection failed "
				, logger::ERROR
			);
			return false;
		}

		// exec With prepared statement
		$stmt_name = md5($sql_query);

		// Cache control: prevent big array memory and performance problems
		if (count(DBi::$prepared_statements) > 1000) {
			pg_query($conn, 'DEALLOCATE ALL');
			DBi::$prepared_statements = [];
			// debug_log(__METHOD__ . " DEALLOCATE ALL prepared statements (limit 1000 reached)", logger::INFO);
		}

		if (!isset(DBi::$prepared_statements[$stmt_name])) {
			$statement = pg_prepare($conn, $stmt_name, $sql_query);
			if ($statement===false) {
				debug_log(__METHOD__
					. " Error when pg_prepare statement for sql_query: "
					. to_string($sql_query) . PHP_EOL
					. pg_last_error($conn)
					, logger::ERROR
				);
				return false;
			}
			// Set the statement as existing.
			DBi::$prepared_statements[$stmt_name] = true;
		}else{
			// debug
			$prepend_sql = '-- RECYCLING PREPARED statement: ' . $stmt_name . '  - params: ' . count($params) . ' - total prepared: ' . count(DBi::$prepared_statements) . PHP_EOL;
		}

		// default sync case
		$result = pg_execute($conn, $stmt_name, $params);

		// check result
		if($result===false) {
			debug_log(__METHOD__
				." Error Processing exec_search Request. :". PHP_EOL
				.' pg_last_error: ' . pg_last_error($conn) . PHP_EOL
				.' sql_query: ' . $sql_query . PHP_EOL
				.' params: ' . json_encode($params) . PHP_EOL
				, logger::ERROR
			);
			return false;
		}

		// debug
		$skip_log = (defined('IS_UNIT_TEST') && IS_UNIT_TEST===true) || ($_ENV['DEDALO_UPDATING'] ?? false);
		if(SHOW_DEBUG===true && $skip_log===false) {
			// time
			$total_time_ms = exec_time_unit($start_time, 'ms');
			if($total_time_ms>SLOW_QUERY_MS) {
				$sql_query_debug = debug_prepared_statement($sql_query, $params, $conn);
				debug_log(__METHOD__
					. " SEARCH_SLOW_QUERY [$total_time_ms ms]: ". PHP_EOL
					. $sql_query_debug
					, logger::WARNING
				);
			}

			// metrics
			metrics::add_time_ms($metric_base . '_total_time', $total_time_ms);
			metrics::observe_max($metric_base . '_max_time', $total_time_ms); // tail latency
			if ($total_time_ms > SLOW_QUERY_MS) {
				metrics::inc($metric_base . '_slow_calls');
			}

			if($verbose===true) {
				// query additional info
				$bt = debug_backtrace();
				if (isset($bt[1]['function'])) {

					$color = $total_time_ms > 15 ? ANSI_BOLD_RED : ANSI_BOLD_GREEN;

					$sql_prepend = '-- exec_search: ' . $color . $total_time_ms . ANSI_RESET . ' ms' . PHP_EOL;

					foreach ([1,2,3,4,5,6,7] as $key) {
						if (isset($bt[$key]['function'])) {
							$sql_prepend .= '--  ['.$key.'] ' . $bt[$key]['function'] . "\n";
						}
					}
					$sql_query = $sql_prepend . trim($sql_query);
				}

				// debug log sql query. See PHP log file
				$sql_query = '-- exec_search ' . count($params) . ' params [' .$stmt_name. '] : ' . implode('|', array_reverse(get_backtrace_sequence())) . PHP_EOL . $sql_query;
				$sql_query_debug = debug_prepared_statement($sql_query, $params, $conn);
				if(isset($prepend_sql)) {
					$sql_query_debug = $prepend_sql . $sql_query_debug;
				}
				$level = $total_time_ms > 20 ? logger::WARNING : logger::DEBUG;
				debug_log(__METHOD__
					. ' sql_query_debug: ' . PHP_EOL
					. PHP_EOL . $sql_query_debug . PHP_EOL
					// . PHP_EOL . $sql_query . PHP_EOL
					// .' params: ' . json_encode($params) . PHP_EOL
					, $level
				);
			}else{
				$color = $total_time_ms > 15 ? ANSI_BOLD_RED : ANSI_BOLD_GREEN;
				$subquery = debug_prepared_statement($sql_query, $params, $conn);
				$sql_query_debug = '-- exec_search: ' . $color . $total_time_ms . ANSI_RESET . ' ms - ' . count($params) . ' params [' .$stmt_name. '] ' . $subquery;
				if(isset($prepend_sql)) {
					$sql_query_debug = $prepend_sql . $sql_query_debug;
				}
				debug_log(__METHOD__
					. ' sql_query_debug: ' . PHP_EOL
					. $sql_query_debug
					, logger::DEBUG
				);
			}
		}


		return $result; // \PgSql\Result or false
	}//end exec_search



	/**
	* EXEC_SQL
	* Executes a raw (non-parameterised) SQL string via pg_query.
	*
	* Intended for administrative operations that cannot use pg_query_params: DDL statements
	* (CREATE TABLE, ALTER TABLE, CREATE INDEX), compound command strings (multiple
	* semicolon-separated statements), or DEALLOCATE / VACUUM / ANALYZE calls.
	*
	* Unlike exec_search, this method does NOT use a prepared-statement pool because pg_query
	* cannot bind parameters, so callers are responsible for ensuring that any data values
	* embedded in $sql_query are properly escaped via pg_escape_literal() / pg_escape_string()
	* or — better — routed through exec_search instead.
	*
	* The same observability instrumentation as exec_search is applied when SHOW_DEBUG is
	* enabled (metrics classification, slow-query threshold, optional verbose backtrace).
	* Note that CTE-based writes (INSERT/UPDATE/DELETE starting with WITH) will be classified
	* as 'exec_search' by sql_metric_base() due to the 6-character prefix check.
	*
	* (!) Do not use this method for queries that bind user-supplied data — use exec_search
	* with parameterised placeholders instead.
	*
	* @param string $sql_query - Raw SQL string to execute.
	* @param bool   $verbose   = false - When true, emits a full backtrace in the debug log.
	* @return \PgSql\Result|false - Query result resource on success; false on connection
	*                               failure or pg_query failure.
	*/
	public static function exec_sql( string $sql_query, bool $verbose=false ) : \PgSql\Result|false {

		// debug
		if(SHOW_DEBUG===true) {
			$start_time = start_time();

			// metrics: classify reads vs writes (INSERT/UPDATE/DELETE)
			$metric_base = self::sql_metric_base($sql_query);
			metrics::inc($metric_base . '_total_calls');
		}

		// connection to DDBB
		$conn = DBi::_getConnection() ?? false;
		if ($conn===false) {
			debug_log(__METHOD__
				." Error. DDBB connection failed "
				, logger::ERROR
			);
			return false;
		}

		// exec Without prepared statement
		$result = pg_query($conn, $sql_query);

		// check result
		if($result===false) {
			debug_log(__METHOD__
				." Error Processing exec_SQL Request. :". PHP_EOL
				.' pg_last_error: ' . pg_last_error($conn) . PHP_EOL
				." sql_query: " . to_string($sql_query)
				, logger::ERROR
			);
			return false;
		}

		// debug
		if(SHOW_DEBUG===true) {
			// time
			$total_time_ms = exec_time_unit($start_time, 'ms');
			if($total_time_ms>SLOW_QUERY_MS) {
				debug_log(__METHOD__
					. " SQL_SLOW_QUERY [$total_time_ms ms]: ". PHP_EOL
					. $sql_query
					, logger::WARNING
				);
			}

			// metrics
			metrics::add_time_ms($metric_base . '_total_time', $total_time_ms);
			metrics::observe_max($metric_base . '_max_time', $total_time_ms); // tail latency
			if ($total_time_ms > SLOW_QUERY_MS) {
				metrics::inc($metric_base . '_slow_calls');
			}

			if($verbose===true) {
				// query additional info
				$bt = debug_backtrace();
				if (isset($bt[1]['function'])) {

					$color = $total_time_ms > 15 ? ANSI_BOLD_RED : ANSI_BOLD_GREEN;

					$sql_prepend = '-- exec_sql: ' . $color . $total_time_ms . ANSI_RESET . ' ms' . PHP_EOL;

					foreach ([1,2,3,4,5,6,7] as $key) {
						if (isset($bt[$key]['function'])) {
							$sql_prepend .= '--  ['.$key.'] ' . $bt[$key]['function'] . "\n";
						}
					}
					$sql_query = $sql_prepend . trim($sql_query);
				}

				// debug log sql query. See PHP log file
				$sql_query = '-- exec_sql: ' . implode('|', array_reverse(get_backtrace_sequence())) . PHP_EOL . $sql_query;

				$level = $total_time_ms > 20 ? logger::WARNING : logger::DEBUG;
				debug_log(__METHOD__
					. ' sql_query_debug: ' . PHP_EOL
					. PHP_EOL . $sql_query . PHP_EOL
					, $level
				);
			}else{
				$sql_query_debug = '-- exec_sql ' . $total_time_ms . ' ms';
				// (!) $prepend_sql is never assigned in the non-verbose path of exec_sql
				// (unlike exec_search, where it is set when a prepared statement is recycled).
				// The isset() guard makes this a no-op in practice, but the variable is
				// vestigial here — copied from exec_search without adaptation.
				if(isset($prepend_sql)) {
					$sql_query_debug = $prepend_sql . $sql_query_debug;
				}
				debug_log(__METHOD__
					. ' sql_query_debug: ' . PHP_EOL
					. $sql_query_debug
					, logger::DEBUG
				);
			}
		}

		return $result;
	}//end exec_sql



	/**
	* GET_COLUMNS_NAME
	* Returns the list of writable column names defined in the $columns allowlist.
	*
	* Callers that need to iterate over or validate column names without hardcoding the
	* list should use this method rather than accessing $columns directly, so that future
	* additions to the allowlist are picked up automatically.
	*
	* @return array<int,string> - Indexed array of column name strings.
	*/
	public static function get_columns_name() : array {
		return array_keys(static::$columns);
	}//end get_columns_name



}//end class matrix_db_manager
