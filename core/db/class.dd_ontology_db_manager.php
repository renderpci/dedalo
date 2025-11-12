<?php declare(strict_types=1);
/**
* Class DD_ONTOLOGY_DB_MANAGER
*
* Provides core operations for managing ontology records.
* This class ensures data consistency by enforcing predefined
* table and column definitions within the ontology model.
*
* Supported actions include:
* - Loading record data
* - Updating existing records
* - Inserting new records with optional initial data
*
*/
abstract class dd_ontology_db_manager {


	// Ontology table
	public static string $ontology_table = 'dd_ontology';

	// columns list
	public static array $ontology_columns = [
		'tipo'				=> true,
		'parent'			=> true,
		'term'				=> true,
		'model'				=> true,
		'order_number'		=> true,
		'relations'			=> true,
		'tld'				=> true,
		'properties'		=> true,
		'model_tipo'		=> true,
		'is_model'			=> true,
		'is_translatable'	=> true,
		'propiedades'		=> true
	];

	// JSON columns to decode
	public static array $ontology_json_columns = [
		'term'				=> true,
		'relations'			=> true,
		'properties'		=> true
	];

	// int columns to parse
	public static array $ontology_int_columns = [
		'order_number'		=> true
	];

	// bool columns to parse
	public static array $ontology_boolean_columns = [
		'is_model'			=> true,
		'is_translatable'	=> true
	];

	// load_cache
	public static array $load_cache = [];



	/**
	* CREATE
	* Inserts a single row into a "ontology" table with automatic handling for JSON columns
	* and guaranteed inclusion of the `tipo` column.
	* It is executed using prepared statement when the values are empty (default creation of empty record
	* adding `tipo` only) and with query params when is not (other dynamic combinations of columns data).
	* @param string $tipo
	* A string identifier representing the unique type of ontology node.
	* Used as part of the WHERE clause in the SQL query.
	* @param array $values = [] (optional)
	* Assoc array with [column name => value] structure.
	* Keys are column names, values are their new values.
	* @return int|false $id
	* Returns the new `id` on success, or `false` if validation fails,
	* query preparation fails, or execution fails.
	*/
	public static function create( string $tipo, array $values=[] ) : int|false {

		$table = self::$ontology_table;

		// Connection
		$conn = DBi::_getConnection();

		// Start building query
		$columns		= ['"tipo"']; // required columns
		$placeholders	= ['$1']; // placeholders for them
		$params			= [$tipo]; // param values (first one for tipo)
		$param_index	= 2; // next param index ($2, $3, ...)

		// Add dynamic columns
		// foreach ($values as $col => $value) {

		// 	// Prevent double columns. Already added by default (required).
		// 	if ($col==='tipo') continue;

		// 	// Columns. Only accepts normalized columns
		// 	if (!isset(self::$ontology_columns[$col])) {
		// 		throw new Exception("Invalid column name: $col");
		// 	}
		// 	$columns[] = pg_escape_identifier($conn, $col);

		// 	// Placeholders / Values
		// 	 if ($value !== null && isset(self::$ontology_json_columns[$col])) {
		// 		// Encode PHP array/object as JSON string
		// 		$params[]		= json_handler::encode($value);
		// 		$placeholders[]	= '$' . $param_index . '::jsonb';
		// 	}else if(is_bool($value)) {
		// 		// Parse boolean values to safe save as t|f
		// 		$params[]		= $value ? 't' : 'f';
		// 		$placeholders[]	= '$' . $param_index . '::boolean';
		// 	}else{
		// 		$params[]		= $value;
		// 		$placeholders[]	= '$' . $param_index;
		// 	}

		// 	// Increase param index value
		// 	$param_index++;
		// }

		// Add fixed columns
		foreach (self::$ontology_columns as $col => $col_value) {
			// Prevent double columns. Already added by default (required).
			if ($col==='tipo') continue;

			$columns[] = pg_escape_identifier($conn, $col);

			$value = $values[$col] ?? null;

			// Placeholders / Values
			 if ($value !== null && isset(self::$ontology_json_columns[$col])) {
				// Encode PHP array/object as JSON string
				$params[]		= json_handler::encode($value);
				$placeholders[]	= '$' . $param_index . '::jsonb';
			}else if(is_bool($value)) {
				// Parse boolean values to safe save as t|f
				$params[]		= $value ? 't' : 'f';
				$placeholders[]	= '$' . $param_index . '::boolean';
			}else{
				$params[]		= $value;
				$placeholders[]	= '$' . $param_index;
			}

			// Increase param index value
			$param_index++;
		}

		// Build UPDATE SET parts using EXCLUDED
		// Used by PostgreSQL to set values on conflict.
		$conflict_column = '"tipo"';
		$update_parts = [];
		foreach ($columns as $column) {
			if ($column !== $conflict_column) { // Don't update the conflict column
				$update_parts[] = "$column = EXCLUDED.$column";
			}
		}

		// SQL. Note that counter (id) is updated auto-handled by the database.
		// If a previous record with the same value for the 'tipo' column exists:
		// Update the record using the ON CONFLICT clause.
		$sql = "
			INSERT INTO $table (" . implode(', ', $columns) . ")
			VALUES (" . implode(', ', $placeholders) . ")
			ON CONFLICT ($conflict_column)
			DO UPDATE SET " . implode(', ', $update_parts) . "
			RETURNING \"id\"
		";

		// Execute query with prepared statement
		$stmt_name = __METHOD__ . '_' . $table;
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
			debug_log(__METHOD__
				." Error Processing Request Load ".to_string($sql) . PHP_EOL
				.' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false;
		}

		// Fetch id
		$id = pg_fetch_result($result, 0, 'id');
		if ($id===false) {
			debug_log(__METHOD__
				. " Error giving the new id". PHP_EOL
				. ' last_error: '. pg_last_error($conn) .PHP_EOL
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
	* Retrieves a single row of data from the ontology table
	* based on `tipo`.
	* It's designed to provide a unified way of accessing data from
	* `ontology` table within the Dédalo application.
	* @param string $tipo
	* A string identifier representing the unique type of ontology node.
	* Used as part of the WHERE clause in the SQL query.
	* @return array|false $row
	* Returns the processed data as an associative array with parsed int and JSON values.
	* If no row is found, it returns an empty array []. If a critical error occurs, it returns false.
	*/
	public static function read( string $tipo ) : array|false {

		// debug
		if(SHOW_DEBUG===true) {
			$start_time = start_time();
			// metrics
			metrics::$ontology_total_calls++;
		}

		// cache check - only return cached successful results
		if (isset(self::$load_cache[$tipo])) {
			if(SHOW_DEBUG===true) {
				// metrics
				metrics::$ontology_total_calls_cached++;
			}
			return self::$load_cache[$tipo];
		}

		$conn = DBi::_getConnection();
		$table = self::$ontology_table;

		// With prepared statement
		$stmt_name = __METHOD__ . '_' . $table;
		if (!isset(DBi::$prepared_statements[$stmt_name])) {
			$select_fields = '"' . implode('","', array_keys(self::$ontology_columns)) . '"';
			// $select_fields = '*';
			$sql = 'SELECT '.$select_fields.' FROM "'.$table.'" WHERE tipo = $1 LIMIT 1';
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
			[$tipo]
		);

		if (!$result) {
			debug_log(__METHOD__
				." Error Processing Request Load ".to_string($sql) . PHP_EOL
				.' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			// Cache the error
			self::$load_cache[$tipo] = false;
			return false;
		}

		// Fetch all rows into a single associative array
		$row = pg_fetch_assoc($result);
		pg_free_result($result);

		// No results found - cache empty array
		if (!$row) {
			self::$load_cache[$tipo] = [];
			return [];
		}

		// Parse column values
		// Overwrite JSON parsed values, boolean and integers to return formatted data
		foreach ($row as $key => $value) {
			if ($value === null) {
				continue;
			}
			// parse values
			if (isset(self::$ontology_json_columns[$key])) {
				$row[$key] = json_decode($value, false);
			} elseif (isset(self::$ontology_int_columns[$key])) {
				$row[$key] = (int)$value;
			} elseif (isset(self::$ontology_boolean_columns[$key])) {
				$row[$key] = ($value === 't' || $value === true || $value === '1');
			}
		}

		// cache
		self::$load_cache[$tipo] = $row;

		// debug
		if(SHOW_DEBUG===true) {
			$total_time_ms = exec_time_unit($start_time,'ms');
			$slow_threshold = defined('SLOW_QUERY_MS') ? SLOW_QUERY_MS : 100;
			if($total_time_ms > $slow_threshold) {
				debug_log(__METHOD__
					. " Slow query detected" .PHP_EOL
					. ' total_time_ms: ' .$total_time_ms
					, logger::WARNING
				);
			}
			// metrics
			metrics::$ontology_total_time += $total_time_ms;
		}


		return $row;
	}//end read



	/**
	* UPDATE
	* Safely updates one or more columns in the "ontology" table row,
	* identified by a `tipo`.
	* @param string $tipo
	* A string identifier representing the unique type of ontology node.
	* Used as part of the WHERE clause in the SQL query.
	* @param array $values
	* Assoc array with [column name => value] structure
	* Keys are column names, values are their new values.
	* @return bool
	* Returns `true` on success, or `false` if validation fails,
	* query preparation fails, or execution fails.
	*/
	public static function update( string $tipo, array $values ) : bool {

		// check values
		if (empty($values)) {
			debug_log(__METHOD__
				." Empty values array " . PHP_EOL
				.' values: ' . json_encode($values)
				, logger::ERROR
			);
			return false;
		}

		$table = self::$ontology_table;

		// DB connection
		$conn = DBi::_getConnection();

		// Initialize parameters with the WHERE clause values
		$params = [
			$tipo, // $1 in SQL
		];

		$set_clauses = [];
		$param_index = 2;

		// Single-pass loop: Validate columns, prepare values, and build SQL parts simultaneously.
		foreach ($values as $column => $value) {
			// Validate column name (Security/Guardrail)
			if (!isset(self::$ontology_columns[$column])) {
				throw new Exception("Invalid column name: $column");
			}

			// Placeholders / Values
			 if ($value !== null && isset(self::$ontology_json_columns[$column])) {
				// Encode PHP array/object as JSON string
				$params[] = json_handler::encode($value);
				// Build the SET clause, safely quoting the column name for PostgreSQL
				$set_clauses[] = pg_escape_identifier($conn, $column) . ' = $' . $param_index++ . '::jsonb';
			}else if(isset(self::$ontology_boolean_columns[$column])) {
				// Change to normalized string for Boolean value
				$params[] = ($value === true) ? 't' : 'f';
				// Build the SET clause, safely quoting the column name for PostgreSQL
				$set_clauses[] = pg_escape_identifier($conn, $column) . ' = $' . $param_index++ ;
			}else{
				$params[] = $value;
				// Build the SET clause, safely quoting the column name for PostgreSQL
				$set_clauses[] = pg_escape_identifier($conn, $column) . ' = $' . $param_index++;
			}
		}

		// SQL Execution
		// Construct the final query string
		$sql = 'UPDATE ' . $table
			. ' SET ' . implode(', ', $set_clauses)
			. ' WHERE tipo = $1';

		// $columns = array_keys($values); // array keys are the column names as 'date' => [{...}]

		// $safe_values = [];
		// foreach ($values as $key => $value) {
		// 	if (!isset(self::$ontology_columns[$key])) {
		// 		throw new Exception("Invalid column name: $key");
		// 		// debug_log(__METHOD__
		// 		// 	. " Error: Invalid column name: $key " . PHP_EOL
		// 		// 	. ' values: ' . to_string($values)
		// 		// 	, logger::ERROR
		// 		// );
		// 		// return false;
		// 	}
		// 	$safe_value = ($value !== null && isset(self::$ontology_json_columns[$key]))
		// 		? json_handler::encode($value)
		// 		: $value;

		// 	$safe_values[] = $safe_value;
		// }

		// // With prepared statement
		// 	// $stmt_name = md5(__METHOD__ . '_' . $table .'_'. implode('', $columns));
		// 	// if (!isset(DBi::$prepared_statements[$stmt_name])) {

		// 	// 	// set_clauses
		// 	// 	$counter = 2; // 1 is reserved to tipo
		// 	// 	$set_clauses = [];
		// 	// 	foreach ($values as $key => $value) {
		// 	// 		if (!isset(self::$ontology_columns[$key])) {
		// 	// 			throw new Exception("Invalid column name: $key");
		// 	// 		}
		// 	// 		$set_clauses[] = '"'.$key.'" = $' . $counter++;
		// 	// 	}

		// 	// 	$sql = 'UPDATE '.$table.' SET '.implode(', ', $set_clauses)
		// 	// 		 .' WHERE tipo = $1';

		// 	// 	if (!pg_prepare(
		// 	// 		$conn,
		// 	// 		$stmt_name,
		// 	// 		$sql)
		// 	// 	) {
		// 	//         debug_log(__METHOD__ . " Prepare failed: " . pg_last_error($conn), logger::ERROR);
		// 	//         return false;
		// 	//     }
		// 	// 	// Set the statement as existing.
		// 	// 	DBi::$prepared_statements[$stmt_name] = true;
		// 	// }
		// 	// $result = pg_execute(
		// 	// 	$conn,
		// 	// 	$stmt_name,
		// 	// 	[$tipo, ...$safe_values] // spread values
		// 	// );

		// // Without prepared statement (more dynamic and appropriate for changing columns scenarios)
		// 	// set_clauses
		// 	$counter = 2; // 1 is reserved to tipo
		// 	$set_clauses = [];
		// 	foreach ($columns as $column) {
		// 		$set_clauses[] = pg_escape_identifier($conn, $column) . ' = $'. $counter++;
		// 	}

		// 	$sql = 'UPDATE '.$table.' SET '.implode(', ', $set_clauses)
		// 		 .' WHERE tipo = $1';

		// 	$params = [$tipo, ...$safe_values];

		$result = pg_query_params($conn, $sql, $params);

		if (!$result) {
			debug_log(__METHOD__
				." Error Processing Request Load ".to_string($sql) . PHP_EOL
				.' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false;
		}

		// Delete cache
		if (isset(self::$load_cache[$tipo])) {
			unset(self::$load_cache[$tipo]);
		}


		return true;
	}//end update



	/**
	* DELETE
	* Deletes a single row into a "ontology" table
	* @param string $tipo
	* A string identifier representing the unique type of ontology node.
	* Used as part of the WHERE clause in the SQL query.
	* @return bool
	* On success true, or `false` if validation fails,
	* query preparation fails, or execution fails.
	*/
	public static function delete( string $tipo ) : bool {

		$conn = DBi::_getConnection();

		$table = self::$ontology_table;

		// With prepared statement
		$stmt_name = __METHOD__ . '_' . $table;
		if (!isset(DBi::$prepared_statements[$stmt_name])) {

			$sql = 'DELETE FROM "'.$table.'" WHERE tipo = $1';
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
			[$tipo]
		);

		if (!$result) {
			debug_log(__METHOD__
				." Error Processing Request Load ".to_string($sql) . PHP_EOL
				.' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false;
		}

		// Delete cache
		if (isset(self::$load_cache[$tipo])) {
			unset(self::$load_cache[$tipo]);
		}


		return true;
	}//end delete



	/**
	* SEARCH
	* Search in one or more columns in the "ontology" table ,
	* return an array with the found `tipos`..
	* @param array $values
	* Assoc array with [column name => value] structure
	* Keys are column names, values are their new values.
	* @return array|false
	* Returns and array with found tipos on success, or `false` if validation fails,
	* query preparation fails, or execution fails.
	*/
	public static function search( array $values, bool $order=false, ?int $limit=null ) : array|false {

		// check values
		if (empty($values)) {
			debug_log(__METHOD__
				." Empty values array " . PHP_EOL
				.' values: ' . json_encode($values)
				, logger::ERROR
			);
			return false;
		}

		$table = self::$ontology_table;

		$conn = DBi::_getConnection();

		$params			= []; // param values (first one for tipo)
		$param_index	= 1; // next param index ($2, $3, ...)

		$where_clauses = [];

		// Add dynamic columns
		foreach ($values as $col => $value) {

			// Columns. Only accepts normalized columns
			if (!isset(self::$ontology_columns[$col])) {
				throw new Exception("Invalid column name: $col");
			}

			if (is_object($value)) {

				// search with operator
				$params[] = $value->value;
				$where_clauses[] = pg_escape_identifier($conn, $col) . ' '.$value->operator.' $'.$param_index;

			}else{

				$params[] = $value;
				$where_clauses[] = pg_escape_identifier($conn, $col) . ' = $'.$param_index;
			}

			// Increase param index value
			$param_index++;
		}

		// With prepared statement
			// $stmt_name = md5(__METHOD__ . '_' . $table .'_'. implode('', $columns));
			// if (!isset(DBi::$prepared_statements[$stmt_name])) {

			// 	// set_clauses
			// 	$counter = 2; // 1 is reserved to tipo
			// 	$set_clauses = [];
			// 	foreach ($values as $key => $value) {
			// 		if (!isset(self::$ontology_columns[$key])) {
			// 			throw new Exception("Invalid column name: $key");
			// 		}
			// 		$set_clauses[] = '"'.$key.'" = $' . $counter++;
			// 	}

			// 	$sql = 'UPDATE '.$table.' SET '.implode(', ', $set_clauses)
			// 		 .' WHERE tipo = $1';

			// 	if (!pg_prepare(
			// 		$conn,
			// 		$stmt_name,
			// 		$sql)
			// 	) {
			//         debug_log(__METHOD__ . " Prepare failed: " . pg_last_error($conn), logger::ERROR);
			//         return false;
			//     }
			// 	// Set the statement as existing.
			// 	DBi::$prepared_statements[$stmt_name] = true;
			// }
			// $result = pg_execute(
			// 	$conn,
			// 	$stmt_name,
			// 	[$tipo, ...$safe_values] // spread values
			// );

		// Without prepared statement (more dynamic and appropriate for changing columns scenarios)
			$sql = 'SELECT tipo FROM '.$table
				 .' WHERE '. implode(' AND ', $where_clauses)
				 . (($order===true) ? ' ORDER BY order_number ASC' : '')
				 . (!empty($limit)  ? " LIMIT $limit" : '');

			$result = pg_query_params($conn, $sql, $params);

		if (!$result) {
			debug_log(__METHOD__
				." Error Processing Request Load ".to_string($sql) . PHP_EOL
				.' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false;
		}

		// result
		$rows = pg_fetch_all($result);

		$tipos = [];
		foreach ($rows as $row) {
			$tipos[] = $row['tipo'];
		}



		return $tipos;
	}//end search



}//end class dd_ontology_db_manager
