<?php declare(strict_types=1);
/**
* Class TM_DB_MANAGER
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
*/
class tm_db_manager {

	// Allowed tm table
	public static string $table = 'matrix_time_machine';

	// columns list
	public static array $columns = [		
		'section_id'		=> true,
		'section_tipo'		=> true,
		'tipo'				=> true,
		'lang'				=> true,
		'timestamp'			=> true,
		'user_id'			=> true,
		'bulk_process_id'	=> true,
		'data'				=> true
	];

	// JSON columns to decode
	public static array $json_columns = [
		'data'				=> true		
	];

	// int columns to parse
	public static array $int_columns = [
		'id'				=> true,		
		'section_id'		=> true,
		'user_id'			=> true,
		'bulk_process_id'	=> true
	];

	// timestamp columns to parse
	public static array $timestamp_columns = [
		'timestamp'			=> true
	];



	/**
	* CREATE
	* Inserts a single row into a "matrix_time_machine" table with automatic handling for JSON columns.
	* It is executed using prepared statement when the values are empty and with query params when is not (other
	* dynamic combinations of columns data).
	* @param object|null $values = null (optional)
	* 	Object with {column name : value} structure.
	* 	Keys are column names, values are their new values.
	* @return int|false $id
	* 	Returns the new $id on success, or `false` if validation fails,
	* 	query preparation fails, or execution fails.
	*/
	public static function create( ?object $values = null): int|false {

		$table = self::$table;

		// Connection
		$conn = DBi::_getConnection();

		// Start building query
		$columns		= []; // required columns
		$placeholders	= []; // placeholders for them
		$params			= []; // param values
		$param_index	= 1; // next param index ($2, $3, ...)

		// Add fixed columns (this allows use prepared statements)
		foreach (self::$columns as $col => $col_value) {
			// Prevent double columns. Already added by default (required).
			if ($col==='id') continue;

			$columns[] = pg_escape_identifier($conn, $col);

			$value = $values->$col ?? null;

			// Placeholders / Values
			 if ($value !== null && isset(self::$json_columns[$col])) {
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

		// SQL query for insert
		$sql = "
			INSERT INTO $table (" . implode(', ', $columns) . ")
			VALUES (" . implode(', ', $placeholders) . ")
			RETURNING \"id\"
		";

		// Execute query with prepared statement
		$stmt_name = 'tm_db_create_' . $table;
		if (!isset(DBi::$prepared_statements[$stmt_name])) {
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
			$params
		);

		if (!$result) {
			debug_log(__METHOD__ . " Query failed: " . pg_last_error($conn), logger::ERROR);
			return false;
		}

		// Fetch id
		$id = pg_fetch_result($result, 0, 'id');
		// Check valid id
		if ($id === false) {
			debug_log(__METHOD__
				. " Error giving the new id" . PHP_EOL
				. ' last_error: ' . pg_last_error($conn) . PHP_EOL
				. ' sql: ' . to_string($sql)
				, logger::ERROR
			);
			return false;
		}


		// Cast to INT always (received is string by default)
		return (int)$id;
	}//end create



	/**
	* READ
	* Retrieves a single row of data from a matrix_time_machine PostgreSQL table.
	* @param int $id
	* 	A numerical identifier for the section. Used as the primary lookup key in the WHERE clause.
	* @return object|false $row
	* 	Returns the processed data as an object with parsed JSON values.
	* 	If no row is found, or if a critical error occurs, it returns false.
	*/
	public static function read(int $id): object|false	{

		$table = self::$table;

		$conn = DBi::_getConnection();

		// With prepared statement
		$stmt_name = 'tm_db_read_' . $table;
		if (!isset(DBi::$prepared_statements[$stmt_name])) {
			$select_fields	= '*'; // Select all because is faster than the list of the columns
			$sql = 'SELECT ' . $select_fields . ' FROM "' . $table . '" WHERE id = $1 LIMIT 1';
			if (!pg_prepare(
				$conn,
				$stmt_name,
				$sql
			)) {
				debug_log(__METHOD__ . " Prepare failed: " . pg_last_error($conn), logger::ERROR);
				return false;
			}
			// Set the statement as existing.
			DBi::$prepared_statements[$stmt_name] = true;
		}
		$result = pg_execute(
			$conn,
			$stmt_name,
			[$id]
		);

		if (!$result) {
			debug_log(__METHOD__
				. " Error executing READ query on table: $table" . PHP_EOL
				. ' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false;
		}

		// Fetch all row into a single associative array
		$row = pg_fetch_object($result);
		pg_free_result($result);


		// Return the result or false if not found
		return $row ?: false;
	}//end read



	/**
	* UPDATE
	* Safely updates one or more columns in a "matrix_time_machine" table row,
	* identified by a `id`.
	* @param int $id
	* 	A numerical identifier for the section. Used as the primary lookup key in the WHERE clause.
	* @param object $values
	* 	Object with {column name : value} structure
	* 	Keys are column names, values are their new values.
	* @return bool
	* 	Returns `true` on success, or `false` on failure.
	*/
	public static function update(int $id, object $values): bool {

		$table = self::$table;

		// Check for empty update payload. Cast to array to avoid empty() false positives
		if (empty((array)$values)) {
			debug_log(
				__METHOD__
					. " Ignored update with empty values" . PHP_EOL
					. ' values: ' . json_encode($values),
				logger::WARNING
			);
			return false;
		}

		// DB connection
		$conn = DBi::_getConnection();

		// Initialize parameters with the WHERE clause values
		$params = [
			$id // $1 in SQL
		];

		$set_clauses = [];
		$param_index = 2;

		// Single-pass loop: Validate columns, prepare values, and build SQL parts simultaneously.
		foreach ($values as $column => $value) {
			// Validate column name (Security/Guardrail)
			if (!isset(self::$columns[$column])) {
				debug_log(
					__METHOD__
						. " Ignored update with invalid column name: $column" . PHP_EOL
						. ' values: ' . json_encode($values),
					logger::WARNING
				);
				return false;
			}

			// Prepare value: JSON encode if it's a designated JSON column and not null
			$safe_value = ($value !== null && isset(self::$json_columns[$column]))
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
			. ' WHERE id = $1';

		// Execute using pg_query_params for performance and security (using the binary protocol)
		$result = pg_query_params($conn, $sql, $params);

		if (!$result) {
			debug_log(__METHOD__
				. " Error updating record" . PHP_EOL
				. ' sql: ' . $sql . PHP_EOL
				. ' error: ' . pg_last_error($conn)
				,logger::ERROR
			);
			return false;
		}

		return true;
	}//end update



	/**
	* DELETE
	* Safely deletes one record in a "matrix_time_machine" table row,
	* identified by `id`.
	* @param int $id
	* 	A numerical identifier for the record. Used as the primary lookup key in the WHERE clause.
	* @return bool
	* 	Returns `true` on success, or `false` if validation fails,
	* 	query preparation fails, or execution fails.
	*/
	public static function delete( int $id ) : bool {

		$table = self::$table;

		$conn = DBi::_getConnection();

		// With prepared statement
		$stmt_name = 'tm_db_delete_' . $table;
		if (!isset(DBi::$prepared_statements[$stmt_name])) {

			// Index use sample:
			// Index Scan using matrix_section_tipo_section_id_desc_idx on matrix

			$sql = 'DELETE FROM "' . $table . '"'
				. ' WHERE id = $1';

			if (!pg_prepare(
				$conn,
				$stmt_name,
				$sql
			)) {
				debug_log(__METHOD__ . " Prepare failed: " . pg_last_error($conn), logger::ERROR);
				return false;
			}
			// Set the statement as existing.
			DBi::$prepared_statements[$stmt_name] = true;
		}

		// Execute
		$result = pg_execute(
			$conn,
			$stmt_name,
			[$id]
		);

		if (!$result) {
			debug_log(__METHOD__
				. ' Error executing DELETE on table: ' . $table . PHP_EOL
				. ' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end delete



}//end class tm_db_manager