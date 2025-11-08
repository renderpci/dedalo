<?php declare(strict_types=1);
/**
* Class MATRIX_DB_MANAGER
*
* Provides core operations for managing matrix records.
* This class ensures data consistency by enforcing predefined
* table and column definitions within the matrix model.
*
* Supported actions include:
* - Loading record data (read)
* - Updating existing records (update)
* - Inserting new records with optional initial data (create)
* - Deleting existing records (delete)
*
* Additionally, simple searches using filters are available.
*/
class matrix_db_manager {



	// Allowed matrix tables
	public static array $matrix_tables = [
		'matrix'				=> true,
		'matrix_activities'		=> true,
		'matrix_activity'		=> true,
		'matrix_dataframe'		=> true,
		'matrix_dd'				=> true,
		'matrix_hierarchy'		=> true,
		'matrix_hierarchy_main'	=> true,
		'matrix_indexations'	=> true,
		'matrix_langs'			=> true,
		'matrix_layout'			=> true,
		'matrix_layout_dd'		=> true,
		'matrix_list'			=> true,
		'matrix_nexus'			=> true,
		'matrix_nexus_main'		=> true,
		'matrix_notes'			=> true,
		'matrix_ontology'		=> true,
		'matrix_ontology_main'	=> true,
		'matrix_profiles'		=> true,
		'matrix_projects'		=> true,
		'matrix_stats'			=> true,
		'matrix_test'			=> true,
		'matrix_tools'			=> true,
		'matrix_users'			=> true
	];

	// matrix_columns list
	public static array $matrix_columns = [
		'section_id'		=> true,
		'section_tipo'		=> true,
		'datos'				=> true,
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
		'counters'			=> true
	];

	// JSON columns to decode
	public static array $matrix_json_columns = [
		'datos'				=> true,
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
		'counters'			=> true
	];

	// int columns to parse
	public static array $matrix_int_columns = [
		'id'				=> true,
		'section_id'		=> true
	];



	/**
	* CREATE
	* Inserts a single row into a "matrix" table with automatic handling for JSON columns
	* and guaranteed inclusion of the `section_tipo` and `section_id` columns.
	* Before insert, creates/updates the proper counter value and uses the result as `section_id` value.
	* It is executed using prepared statement when the values are empty (default creation of empty record
	* adding `section_tipo` and `section_id` only) and with query params when is not (other
	* dynamic combinations of columns data).
	* @param string $table
	* The name of the table to query. The function validates this against
	* a predefined list of allowed tables to prevent SQL injection vulnerabilities.
	* @param string $section_tipo
	* A string identifier representing the type of section. Used as part of the WHERE clause in the SQL query.
	* @param array $values = [] (optional)
	* Assoc array with [column name => value] structure.
	* Keys are column names, values are their new values.
	* @return int|false $section_id
	* Returns the new $section_id on success, or `false` if validation fails,
	* query preparation fails, or execution fails.
	*/
	public static function create( string $table, string $section_tipo, array $values=[] ) : int|false {

		// Validate table
		if (!isset(self::$matrix_tables[$table])) {
			debug_log(__METHOD__
				. " Invalid table. This table is not allowed to load matrix data." . PHP_EOL
				. ' table: ' . $table . PHP_EOL
				. ' allowed_tables: ' . json_encode(self::$matrix_tables)
				, logger::ERROR
			);
			return false;
		}

		// Connection
		$conn = DBi::_getConnection();

		// counter table
		$counter_table = substr($table, -3)==='_dd'
			? 'matrix_counter_dd' // Public counter managed by master
			: 'matrix_counter'; // Private counters from current installation

		// Start building query
		$columns		= ['"section_tipo"', '"section_id"']; // required columns
		$placeholders	= ['$1', 'updated_counter.value']; // placeholders for them
		$params			= [$section_tipo]; // param values (first one for tipo)
		$param_index	= 2; // next param index ($2, $3, ...)

		// Add dynamic columns
		foreach ($values as $col => $value) {

			// Columns. Only accepts normalized columns
			if (!isset(self::$matrix_columns[$col])) {
				throw new Exception("Invalid column name: $col");
			}
			$columns[] = pg_escape_identifier($conn, $col);

			// Placeholders / Values
			 if ($value !== null && isset(self::$matrix_json_columns[$col])) {
				// Encode PHP array/object as JSON string
				$params[]		= json_handler::encode($value);
				$placeholders[]	= '$' . $param_index . '::jsonb';
			}else{
				$params[]		= $value;
				$placeholders[]	= '$' . $param_index;
			}

			// Increase param index value
			$param_index++;
		}

		// (!) Note that value returned by Save action, in case of activity, is the section_id
		// auto created by table sequence 'matrix_activity_section_id_seq', not by counter

		// 1. Start the transaction and set the isolation level
		// Ensure the entire operation runs under the SERIALIZABLE transaction isolation level.
		// Guarantees that the counter update and the subsequent INSERT will reflect a consistent,
		// serial order of execution, preventing the "lost update" problem often associated with counters under high load.
		$begin_sql = "BEGIN ISOLATION LEVEL SERIALIZABLE;";
		$result = pg_query($conn, $begin_sql);
		if (!$result) {
			debug_log(__METHOD__
				." Error Processing Request. ISOLATION LEVEL SERIALIZABLE fails." . PHP_EOL
				.' begin_sql: ' . to_string($begin_sql) . PHP_EOL
				.' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false; // Return false immediately since the transaction couldn't start.
		}

		// 2. Execute the main atomic SQL block with parameters
		// SQL. Note that counter is updated (+1) and the new value is used as section_id.
		// If no counter exists for current tipo, a new one is created using CONFLICT fallback.
		$sql = "
			WITH updated_counter AS (
				INSERT INTO $counter_table (tipo, value)
				VALUES ($1, 1)
				ON CONFLICT (tipo) DO UPDATE
				SET value = $counter_table.value + 1
				RETURNING value
			)
			INSERT INTO $table (" . implode(', ', $columns) . ")
			SELECT " . implode(', ', $placeholders) . "	FROM updated_counter
			RETURNING section_id;
		";
		// Execute query with params
		$result = pg_query_params(
			$conn,
			$sql,
			$params
		);

		if (!$result) {
			// 3a. CRITICAL: Handle error and MUST rollback the open transaction
			pg_query($conn, "ROLLBACK;");

			debug_log(__METHOD__
				." Error Processing Request (after rollback) ".to_string($sql) . PHP_EOL
				.' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false;
		}

		// 3b. Commit the transaction if the main query succeeded
		$commit_result = pg_query($conn, "COMMIT;");

		if (!$commit_result) {
			// Log error if COMMIT fails (rare, but possible due to network or server issues)
			debug_log(__METHOD__ . " CRITICAL: COMMIT FAILED: " . pg_last_error($conn), logger::ERROR);
			return false;
		}

		// Fetch section_id
		$section_id = pg_fetch_result($result, 0, 'section_id');
		// Check valid section_id
		if ($section_id===false) {
			debug_log(__METHOD__
				. " Error giving the new section_id". PHP_EOL
				. ' last_error: '. pg_last_error($conn) .PHP_EOL
				. ' sql: ' . to_string($sql)
				, logger::ERROR
			);
			return false;
		}


		// Cast to INT always (received is string by default)
		return (int)$section_id;
	}//end create



	/**
	* READ
	* Retrieves a single row of data from a specified PostgreSQL table
	* based on section_id and section_tipo.
	* It's designed to provide a unified way of accessing data from
	* various "matrix" tables within the Dédalo application.
	* @param string $table
	* The name of the table to query. The function validates this against
	* a predefined list of allowed tables to prevent SQL injection vulnerabilities.
	* @param string $section_tipo
	* A string identifier representing the type of section. Used as part of the WHERE clause in the SQL query.
	* @param int $section_id
	* A numerical identifier for the section. Used as the primary lookup key in the WHERE clause.
	* @return array|false $row
	* Returns the processed data as an associative array with parsed JSON values.
	* If no row is found, it returns an empty array []. If a critical error occurs, it returns false.
	*/
	public static function read( string $table, string $section_tipo, int $section_id ) : array|false {

		// check matrix table
		if (!isset(self::$matrix_tables[$table])) {
			debug_log(__METHOD__
				. " Invalid table. This table is not allowed to load matrix data." . PHP_EOL
				. ' table: ' . $table . PHP_EOL
				. ' allowed_tables: ' . json_encode(self::$matrix_tables)
				, logger::ERROR
			);
			return false;
		}

		$conn = DBi::_getConnection();

		// With prepared statement
		$stmt_name = __METHOD__ . '_' . $table;
		if (!isset(DBi::$prepared_statements[$stmt_name])) {
			$select_fields	= '*'; // Select all because is faster than the list of the columns
			$sql = 'SELECT '.$select_fields.' FROM "'.$table.'" WHERE section_id = $1 AND section_tipo = $2 LIMIT 1';
			if (!pg_prepare(
				$conn,
				$stmt_name,
				$sql)
			) {
				debug_log(__METHOD__ . " Prepare failed: " . pg_last_error($conn), logger::ERROR);
				return false;
			}
			// Set the statement as existing.
			DBi::$prepared_statements[$stmt_name] = true;
		}
		$result = pg_execute(
			$conn,
			$stmt_name,
			[$section_id, $section_tipo]
		);

		if (!$result) {
			debug_log(__METHOD__
				." Error Processing Request Load ".to_string($sql) . PHP_EOL
				.' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false;
		}

		// Fetch all rows into a single associative array
		$row = pg_fetch_assoc($result);
		pg_free_result($result);


		// Return the result or an empty array if not found
		return $row ?: [];
	}//end read



	/**
	* UPDATE
	* Safely updates one or more columns in a "matrix" table row,
	* identified by a composite key of `section_id` and `section_tipo`.
	* @param string $table
	* The name of the table to query. The function validates this against
	* a predefined list of allowed tables to prevent SQL injection vulnerabilities.
	* @param string $section_tipo
	* A string identifier representing the type of section. Used as part of the WHERE clause in the SQL query.
	* @param int $section_id
	* A numerical identifier for the section. Used as the primary lookup key in the WHERE clause.
	* @param array $values
	* Assoc array with [column name => value] structure
	* Keys are column names, values are their new values.
	* @return bool
	* Returns `true` on success, or `false` on failure.
	*/
	public static function update( string $table, string $section_tipo, int $section_id, array $values ) : bool {

		// Validate table name against allowed list (Security/Guardrail)
		if (!isset(self::$matrix_tables[$table])) {
			debug_log(__METHOD__
				. " Invalid table. This table is not allowed to load matrix data." . PHP_EOL
				. ' table: ' . $table . PHP_EOL
				. ' allowed_tables: ' . json_encode(self::$matrix_tables)
				, logger::ERROR
			);
			return false;
		}

		// Check for empty update payload
		if (empty($values)) {
			debug_log(__METHOD__
				." Empty values array " . PHP_EOL
				.' values: ' . json_encode($values)
				, logger::ERROR
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
		foreach ($values as $column => $value) {
			// Validate column name (Security/Guardrail)
			if (!isset(self::$matrix_columns[$column])) {
				throw new Exception("Invalid column name: $column");
			}

			// Prepare value: JSON encode if it's a designated JSON column and not null
			$safe_value = ($value !== null && isset(self::$matrix_json_columns[$column]))
				? json_handler::encode($value)
				: $value;

			// Build the SET clause, safely quoting the column name for PostgreSQL
			$set_clauses[] = pg_escape_identifier($conn, $column) . ' = $' . $param_index++;

			// Add the prepared value directly to the parameter array
			$params[] = $safe_value;
		}

		// SQL Execution
		// Construct the final query string
		$sql = 'UPDATE ' . $table
			. ' SET ' . implode(', ', $set_clauses)
			. ' WHERE section_id = $1 AND section_tipo = $2';

		// Execute using pg_query_params for performance and security (using the binary protocol)
		$result = pg_query_params($conn, $sql, $params);

		if (!$result) {
			debug_log(__METHOD__
				." Error Processing Request Load ".to_string($sql) . PHP_EOL
				.' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end update



	/**
	* UPDATE_BY_KEY
	* Saves given value into the specified JSON key, it could be:
	* a component container
	* a section property data as created_date
	* a component counter data
	* Creates the path from the given key as componente_tipo {dd197} or property {created_date}.
	* If the given value is empty, the path will be removed for clean database.
	* @param string $table
	* 	DB table name. E.g. 'matrix'
	* @param string $section_tipo
	* 	Section tipo. E.g. 'oh1'
	* @param int $section_id
	* 	Section id. E.g. '1582'
	* @param string $data_column_name
	* 	Name of the column in current table. E.g. 'string'
	* @param string $key
	* 	Key of the value in the column JSON object. E.g. 'oh25'
	* @param ?array $value
	* 	Element value. E.g. [{"id": 1, "lang": "lg-nolan", "value": "code 95"}]
	* @return bool
	* 	Returns false if JSON fragment save fails.
	*/
	public static function update_by_key(
		string $table,
		string $section_tipo,
		int $section_id,
		string $data_column_name,
		string $key,
		?array $value
		) : bool {

		// sample SQL
			// UPDATE matrix
			// SET data = jsonb_set(
			//     COALESCE(data, '{}'::jsonb), -- Use an empty object if data is NULL
			//     '{numisdataXX}', -- path to the element
			//     '{"key":1,"lang":"lg-spa","type":"dd750","value":"CODE1"}'::jsonb, -- new value (must be valid JSON)
			//     true  -- create if missing (true/false)
			// )
			// WHERE section_tipo = 'numisdata224' AND section_id = 1;

		// check matrix table
		if (!isset(self::$matrix_tables[$table])) {
			debug_log(__METHOD__
				. " Invalid table. This table is not allowed to load matrix data." . PHP_EOL
				. ' table: ' . $table . PHP_EOL
				. ' allowed_tables: ' . json_encode(self::$matrix_tables)
				, logger::ERROR
			);
			return false;
		}

		$conn = DBi::_getConnection();
		// Path is generated once, for top-level key
		$path = '{'.$key.'}'; // JSON path for top-level key
		// statement base name with prepared statement
		$stmt_name = __METHOD__;

		if (empty($value)) {

			// DELETE operation
			$full_stmt_name = $stmt_name . '_delete_' . $table . '_' . $data_column_name;

			if (!isset(DBi::$prepared_statements[$full_stmt_name])) {
				// Optimized SQL for deletion: deletes key, then checks if the result is '{}'. If so, sets column to NULL.
				$sql = "
					UPDATE $table
					SET $data_column_name = CASE
						WHEN ($data_column_name #- $1::text[]) = '{}'::jsonb THEN
							NULL
						ELSE
							$data_column_name #- $1::text[]
					END
					WHERE section_id = $3 AND section_tipo = $2
					RETURNING id
				";
				pg_prepare($conn, $full_stmt_name, $sql);
				DBi::$prepared_statements[$full_stmt_name] = true;
			}

			// Parameters: $1=path, $2=tipo, $3=section_id
			$params = [ $path, $section_tipo, $section_id ];

		} else {

			// UPDATE/SET operation
			$full_stmt_name = $stmt_name . '_update_' . $table . '_' . $data_column_name;
			$json_value	= json_encode($value, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE); // JSONB value

			if (!isset(DBi::$prepared_statements[$full_stmt_name])) {
				// Efficient SQL for setting/updating a key (uses COALESCE for NULL safety)
				$sql = "
					UPDATE $table
					SET $data_column_name = jsonb_set(
						COALESCE($data_column_name, '{}'::jsonb),
						$1::text[],
						$2::jsonb,
						true
					)
					WHERE section_tipo = $3
					  AND section_id = $4
					RETURNING id
				";
				pg_prepare($conn, $full_stmt_name, $sql);
				DBi::$prepared_statements[$full_stmt_name] = true;
			}

			// Parameters: $1=path, $2=json_value, $3=tipo, $4=section_id
			$params = [ $path, $json_value, $section_tipo, $section_id ];
		}

		// 2. Execute Statement
		$result = pg_execute(
			$conn,
			$full_stmt_name,
			$params
		);

		// 3. Handle Result
		if ($result) {
			$rows_affected = pg_num_rows($result);
			if ($rows_affected > 0) {

				// Success. JSON path was successfully saved

				// $saved_id = pg_fetch_result($result, 0, 0);
				// debug_log(__METHOD__
				// 	. " Successfully saved JSON path '$path'. Affected record ID: $table $saved_id"
				// 	, logger::WARNING
				// );

				return true;

			}else{

				// No rows were updated (JSON path didn't exist or conditions didn't match)
				debug_log(__METHOD__
					. " Partial JSON data was NOT saved. Maybe path '$path' or section_id '$section_id' does not exist." . PHP_EOL
					. ' table: ' . to_string($table) . PHP_EOL
					. ' column: ' . to_string($data_column_name) . PHP_EOL
					. ' path: ' . $path . PHP_EOL
					. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
					. ' section_id: ' . to_string($section_id) . PHP_EOL
					. ' value: ' . json_encode($value)
					, logger::ERROR
				);
			}

		}else{

			// Query failed
			debug_log(__METHOD__
				. " Delete operation failed:  " . PHP_EOL
				. ' Error: ' . pg_last_error($conn) . PHP_EOL
				. ' table: ' . to_string($table) . PHP_EOL
				. ' column: ' . to_string($data_column_name) . PHP_EOL
				. ' path: ' . to_string($path) . PHP_EOL
				. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
				. ' section_id: ' . to_string($section_id) . PHP_EOL
				. ' value: ' . json_encode($value)
				, logger::ERROR
			);
		}


		return false;
	}//end update_by_key




	/**
	* DELETE
	* Safely deletes one record in a "matrix" table row,
	* identified by a composite key of `section_id` and `section_tipo`.
	* @param string $table
	* The name of the table to query. The function validates this against
	* a predefined list of allowed tables to prevent SQL injection vulnerabilities.
	* @param string $section_tipo
	* A string identifier representing the type of section. Used as part of the WHERE clause in the SQL query.
	* @param int $section_id
	* A numerical identifier for the section. Used as the primary lookup key in the WHERE clause.
	* @return bool
	* Returns `true` on success, or `false` if validation fails,
	* query preparation fails, or execution fails.
	*/
	public static function delete( string $table, string $section_tipo, int $section_id ) : bool {

		// check matrix table
		if (!isset(self::$matrix_tables[$table])) {
			debug_log(__METHOD__
				. " Invalid table. This table is not allowed to load matrix data." . PHP_EOL
				. ' table: ' . $table . PHP_EOL
				. ' allowed_tables: ' . json_encode(self::$matrix_tables)
				, logger::ERROR
			);
			return false;
		}

		$conn = DBi::_getConnection();

		// With prepared statement
		$stmt_name = __METHOD__ . '_' . $table;
		if (!isset(DBi::$prepared_statements[$stmt_name])) {

			$sql = 'DELETE FROM "' .$table. '"'
				 .' WHERE section_id = $1 AND section_tipo = $2';

			if (!pg_prepare(
				$conn,
				$stmt_name,
				$sql)
			) {
				debug_log(__METHOD__ . " Prepare failed: " . pg_last_error($conn), logger::ERROR);
				return false;
			}
			// Set the statement as existing.
			DBi::$prepared_statements[$stmt_name] = true;
		}

		$result = pg_execute(
			$conn,
			$stmt_name,
			[$section_id, $section_tipo] // spread values
		);

		if (!$result) {
			debug_log(__METHOD__
				.' Error executing DELETE on table: ' . $table . PHP_EOL
				.' sql ' . to_string($sql) . PHP_EOL
				.' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end update



	/**
	* SEARCH
	*
	* Performs a filtered search on a specified PostgreSQL table and returns
	* a list of matching `section_id` records.
	*
	* This function provides a simple, safe way to query access matrix data.
	* The table name is validated against a predefined whitelist to prevent
	* SQL injection vulnerabilities.
	*
	* @param string     $table  The name of the table to query. Must be in the
	*                           predefined list of allowed tables.
	* @param array      $filter Associative array of filter conditions in the
	*                           form [column => value].
	* @param string|null $order Optional ORDER BY clause (e.g., "section_id DESC").
	* @param int|null    $limit Optional LIMIT value for the query.
	*
	* @return array|false Returns an array of matching `section_id` values on success,
	*                     or `false` if validation, query preparation, or execution fails.
	*/
	public static function search( string $table, array $filter, ?string $order=null, ?int $limit=null ) : array|false {

		// Validate table
		if (!isset(self::$matrix_tables[$table])) {
			debug_log(__METHOD__
				. " Invalid table. This table is not allowed to load matrix data." . PHP_EOL
				. ' table: ' . $table . PHP_EOL
				. ' allowed_tables: ' . json_encode(self::$matrix_tables)
				, logger::ERROR
			);
			return false;
		}

		// check values
		if (empty($filter)) {
			debug_log(__METHOD__
				." Empty filter array " . PHP_EOL
				.' filter: ' . json_encode($filter)
				, logger::ERROR
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
			if (!isset(self::$matrix_columns[$column])) {
				debug_log(__METHOD__
					. " Invalid column. This column is not allowed to load matrix data." . PHP_EOL
					. ' column: ' . $column . PHP_EOL
					. ' allowed_columns: ' . json_encode(self::$matrix_columns)
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

			$where_clauses[] = pg_escape_identifier($conn, $column) .' '. $operator .' $'. $param_index;

			// Increase param index value
			$param_index++;
		}

		// ORDER BY clause
		$order_clause = '';
		if ($order !== null) {
			[$col, $dir] = explode(' ', $order, 2) + [null, null];
			$col = trim($col);
			$dir = strtoupper(trim($dir ?? 'ASC'));
			if (isset(self::$matrix_columns[$col]) && in_array($dir, ['ASC','DESC'], true)) {
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
			 .' WHERE '. implode(' AND ', $where_clauses)
			 . $order_clause
			 . $limit_clause;

		$result = pg_query_params($conn, $sql, $params);
		if (!$result) {
			debug_log(__METHOD__
				." Error Processing Request Load ".to_string($sql) . PHP_EOL
				.' error: ' . pg_last_error($conn)
				, logger::ERROR
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



}//end class matrix_db_manager
