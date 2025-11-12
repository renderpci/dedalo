<?php declare(strict_types=1);
/**
* Class MATRIX_ACTIVITY_DB_MANAGER
*
* Provides core operations for managing matrix records.
* This class ensures data consistency by enforcing predefined
* table and column definitions within the matrix model.
*/
class matrix_activity_db_manager extends matrix_db_manager {



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
	* @param object|null $values = {} (optional)
	* Object with {column name : value} structure.
	* Keys are column names, values are their new values.
	* @return int|false $section_id
	* Returns the new $section_id on success, or `false` if validation fails,
	* query preparation fails, or execution fails.
	*/
	public static function create( string $table, string $section_tipo, ?object $values=null ) : int|false {

		// Validate table
		if ($table!=='matrix_activity') {
			debug_log(__METHOD__
				. " Invalid table. This table is not allowed to load matrix data." . PHP_EOL
				. ' table: ' . $table . PHP_EOL
				. ' allowed_tables: ' . 'matrix_activity'
				, logger::ERROR
			);
			return false;
		}

		// Connection
		$conn = DBi::_getConnection();

		// Start building query
		$columns		= ['"section_tipo"']; // required columns
		$placeholders	= ['$1']; // placeholders for them
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

		// Execute the main atomic SQL block with parameters
			// $sql = "
			// 	INSERT INTO $table (" . implode(', ', $columns) . ")
			// 	VALUES (" . implode(', ', $placeholders) . ")
			// 	RETURNING section_id;
			// ";

			// // Execute query with params
			// $result = pg_query_params(
			// 	$conn,
			// 	$sql,
			// 	$params
			// );

		// Execute with prepared statements
			$stmt_name = __METHOD__ . '_' . $table;
			if (!isset(DBi::$prepared_statements[$stmt_name])) {
				$sql = "
					INSERT INTO $table (" . implode(', ', $columns) . ")
					VALUES (" . implode(', ', $placeholders) . ")
					RETURNING section_id;
				";
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
			// Log error if COMMIT fails (rare, but possible due to network or server issues)
			debug_log(__METHOD__ . " CRITICAL: COMMIT FAILED: " . pg_last_error($conn), logger::ERROR);
			return false;
		}


		// Only for compatibility returns 1
		return 1;
	}//end create



}//end class matrix_activity_db_manager
