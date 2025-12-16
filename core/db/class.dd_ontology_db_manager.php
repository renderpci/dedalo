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
	public static string $table = 'dd_ontology';

	// columns list
	public static array $columns = [
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
	public static array $json_columns = [
		'term'				=> true,
		'relations'			=> true,
		'properties'		=> true
	];

	// int columns to parse
	public static array $int_columns = [
		'order_number'		=> true
	];

	// bool columns to parse
	public static array $boolean_columns = [
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
	* 	A string identifier representing the unique type of ontology node.
	* 	Used as part of the WHERE clause in the SQL query.
	* @param object|null $values = {} (optional)
	* 	Object with {column name : value} structure.
	* 	Keys are column names, values are their new values.
	* @return int|false $id
	* 	Returns the new `id` on success, or `false` if validation fails,
	*	 query preparation fails, or execution fails.
	*/
	public static function create( string $tipo, ?object $values = null ) : int|false {

		$table = self::$table;

		// Connection
		$conn = DBi::_getConnection();

		// Start building query
		$columns		= ['"tipo"']; // required columns
		$placeholders	= ['$1']; // placeholders for them
		$params			= [$tipo]; // param values (first one for tipo)
		$param_index	= 2; // next param index ($2, $3, ...)


		// Add fixed columns (this allows use prepared statements)
		foreach (self::$columns as $col => $col_value) {
			// Prevent double columns. Already added by default (required).
			if ($col==='tipo') continue;

			$columns[] = pg_escape_identifier($conn, $col);

			$value = $values->$col ?? null;

			// Placeholders / Values
			 if ($value !== null && isset(self::$json_columns[$col])) {
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
		$stmt_name = 'dd_ontology_create_' . $table;
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

		// Invalidate cache, before return (could be an update on conflict)
		if (isset(self::$load_cache[$tipo])) {
			unset(self::$load_cache[$tipo]);
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
		$table = self::$table;

		// With prepared statement
		$stmt_name = __METHOD__ . '_' . $table;
		if (!isset(DBi::$prepared_statements[$stmt_name])) {
			$select_fields = '"' . implode('","', array_keys(self::$columns)) . '"';
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
				." Error executing READ" . PHP_EOL
				.' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
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
			if (isset(self::$json_columns[$key])) {
				$row[$key] = json_decode($value, false);
			} elseif (isset(self::$int_columns[$key])) {
				$row[$key] = (int)$value;
			} elseif (isset(self::$boolean_columns[$key])) {
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
	* 	A string identifier representing the unique type of ontology node.
	* 	Used as part of the WHERE clause in the SQL query.
	* @param object $values
	* 	Object with {column name : value} structure
	* 	Keys are column names, values are their new values.
	* @return bool
	* 	Returns `true` on success, or `false` if validation fails,
	* 	query preparation fails, or execution fails.
	*/
	public static function update( string $tipo, object $values ) : bool {

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

		$table = self::$table;

		// DB connection
		$conn = DBi::_getConnection();

		// Initialize parameters with the WHERE clause values
		$params = [
			$tipo, // $1 in SQL
		];

		$set_clauses = [];
		$param_index = 2;

		// Single-pass loop: Validate columns, prepare values, and build SQL parts simultaneously.
		$columns = ['tipo'];
		foreach ($values as $column => $value) {
			// Validate column name (Security/Guardrail)
			if (!isset(self::$columns[$column])) {
				debug_log(__METHOD__
					." Invalid column name: $column" . PHP_EOL
					.' values: ' . json_encode($values)
					, logger::ERROR
				);
				continue;
			}

			// Placeholders / Values
			 if ($value !== null && isset(self::$json_columns[$column])) {
				// Encode PHP array/object as JSON string
				$params[] = json_handler::encode($value);
				// Build the SET clause, safely quoting the column name for PostgreSQL
				$set_clauses[] = pg_escape_identifier($conn, $column) . ' = $' . $param_index++ . '::jsonb';
			}else if(isset(self::$boolean_columns[$column])) {
				// Change to normalized string for Boolean value
				$params[] = ($value === true) ? 't' : 'f';
				// Build the SET clause, safely quoting the column name for PostgreSQL
				$set_clauses[] = pg_escape_identifier($conn, $column) . ' = $' . $param_index++ ;
			}else{
				$params[] = $value;
				// Build the SET clause, safely quoting the column name for PostgreSQL
				$set_clauses[] = pg_escape_identifier($conn, $column) . ' = $' . $param_index++;
			}

			// Column add
			$columns[] = $column;
		}

		// SQL Execution
		// Construct the final query string
		$sql = 'UPDATE ' . $table
			. ' SET ' . implode(', ', $set_clauses)
			. ' WHERE tipo = $1';

		// Execute using pg_query_params for performance and security
		$result = pg_query_params($conn, $sql, $params);

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
			
			$result = pg_query_params($conn, $sql_insert, $params);
		}

		if (!$result) {
			debug_log(__METHOD__
				." Error executing UPDATE" . PHP_EOL
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

		$table = self::$table;

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

		// Execute
		$result = pg_execute(
			$conn,
			$stmt_name,
			[$tipo]
		);

		if (!$result) {
			debug_log(__METHOD__
				." Error executing DELETE" . PHP_EOL
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
	* 	Assoc array with [column name => value] structure
	* 	Keys are column names, values are their new values.
	* @param bool $order = false
	* 	If true, the results will be ordered by order_number ASC.
	* @param int $limit = null
	* 	Limit the number of results.
	* @return array|false
	* 	Returns and array with found tipos on success, or `false` if validation fails,
	* 	query preparation fails, or execution fails.
	*/
	public static function search( array $values, bool $order=false, ?int $limit=null ) : array|false {

		// check values
		if (empty($values)) {
			debug_log(__METHOD__
				." Ignored search with empty values" . PHP_EOL
				.' values: ' . json_encode($values)
				, logger::WARNING
			);
			return false;
		}

		// debug
		if(SHOW_DEBUG===true) {
			$start_time = start_time();

			// metrics
			metrics::$exec_dd_ontology_search_total_calls++;
		}

		$table = self::$table;

		$conn = DBi::_getConnection();

		$params			= []; // param values (first one for tipo)
		$param_index	= 1; // next param index ($2, $3, ...)

		$where_clauses = [];

		// Add dynamic columns
		static $allowed_ops = ['=', '!=', '<', '>', '<=', '>=', 'LIKE', 'ILIKE', '@>'];
		foreach ($values as $col => $value) {

			// Columns. Only accepts normalized columns
			if (!isset(self::$columns[$col])) {
				debug_log(__METHOD__
					." Invalid column name: $col" . PHP_EOL
					.' values: ' . json_encode($values)
					, logger::ERROR
				);
				return false;
			}

			if (is_object($value)) {

				// search with operator
				if (!in_array($value->operator, $allowed_ops)) {
					debug_log(__METHOD__
						." Invalid operator: " . $value->operator . PHP_EOL
						.' values: ' . json_encode($values)
						, logger::ERROR
					);
					return false;
				}
				$params[] = $value->value;
				$where_clauses[] = pg_escape_identifier($conn, $col) . ' '.$value->operator.' $'.$param_index;

			}else{

				$params[] = $value;
				$where_clauses[] = pg_escape_identifier($conn, $col) . ' = $'.$param_index;
			}

			// Increase param index value
			$param_index++;
		}

		// Without prepared statement (more dynamic and appropriate for changing columns scenarios)
			$sql = 'SELECT tipo FROM '.$table
				 .' WHERE '. implode(' AND ', $where_clauses)
				 . (($order===true) ? ' ORDER BY order_number ASC' : '')
				 . (!empty($limit)  ? " LIMIT $limit" : '');

			$result = pg_query_params($conn, $sql, $params);

		if (!$result) {
			debug_log(__METHOD__
				." Error executing SEARCH" . PHP_EOL
				.' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false;
		}

		// Build and array of tipos		
		$tipos = pg_fetch_all_columns($result, 0);

		// debug
		if(SHOW_DEBUG===true) {
			// time
			$total_time_ms = exec_time_unit($start_time, 'ms');			

			// metrics
			metrics::$exec_dd_ontology_search_total_time += $total_time_ms;
			
			// query additional info
			$bt = debug_backtrace();
			if (isset($bt[1]['function'])) {
				
				$sql_prepend = '-- exec_search: ' . $total_time_ms . ' ms' . PHP_EOL;

				foreach ([1,2,3,4,5,6,7,8] as $key) {
					if (isset($bt[$key]['function'])) {
						$sql_prepend .= '--  ['.$key.'] ' . $bt[$key]['function'] . "\n";
					}
				}
				$sql = $sql_prepend . trim($sql);
			}

			// debug log sql query. See PHP log file
			$sql = '-- exec_search: ' . implode('|', array_reverse(get_backtrace_sequence())) . PHP_EOL . $sql;
			$sql_debug = debug_prepared_statement($sql, $params, $conn);
			$level = $total_time_ms > 2 ? logger::ERROR : logger::DEBUG;
			// debug_log(__METHOD__
			// 	. ' sql_debug: ' . PHP_EOL
			// 	. PHP_EOL . $sql_debug . PHP_EOL
			// 	, $level
			// );
		}


		return $tipos;
	}//end search



}//end class dd_ontology_db_manager
