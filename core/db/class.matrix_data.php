<?php declare(strict_types=1);
/**
* MATRIX_DATA
* Handle matrix data basic actions:
* 	Load record data
* 	Update record data
* 	Insert record with optional data
* The definitions of tables and columns are used to
* guarantee the consistency of the matrix table model.
*/
abstract class matrix_data {


	// Allowed matrix tables
	public static $matrix_tables = [
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
	public static $matrix_columns = [
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
	public static $matrix_json_columns = [
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
	public static $matrix_int_columns = [
		'id'				=> true,
		'section_id'		=> true
	];



	/**
	* LOAD_MATRIX_DATA
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
	public static function load_matrix_data( string $table, string $section_tipo, int $section_id ) : array|false {

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
			$select_fields	= '*';
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

		// No results found
		if (!$row) {
			return [];
		}

		// Overwrite JSON parsed values and integers to return optimal data
		foreach ($row as $key => $value) {
			// parse JOSN values
			if($value !== null && isset(self::$matrix_json_columns[$key])) {
				$row[$key] = json_decode($value);
			}elseif (isset(self::$matrix_int_columns[$key])) {
				$row[$key] = (int)$value;
			}
		}


		return $row;
	}//end load_matrix_data



	/**
	* UPDATE_MATRIX_DATA
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
	* Returns `true` on success, or `false` if validation fails,
	* query preparation fails, or execution fails.
	*/
	public static function update_matrix_data( string $table, string $section_tipo, int $section_id, array $values ) : bool {

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

		// check values
		if (empty($values)) {
			debug_log(__METHOD__
				." Empty values array " . PHP_EOL
				.' values: ' . json_encode($values)
				, logger::ERROR
			);
			return false;
		}

		$conn = DBi::_getConnection();

		$columns = array_keys($values); // array keys are the column names as 'date' => [{...}]

		$safe_values = [];
		foreach ($values as $key => $value) {
			if (!isset(self::$matrix_columns[$key])) {
				throw new Exception("Invalid column name: $key");
			}
			$safe_value = ($value !== null && isset(self::$matrix_json_columns[$key]))
				? json_handler::encode($value)
				: $value;

			$safe_values[] = $safe_value;
		}

		// With prepared statement
			// $stmt_name = md5(__METHOD__ . '_' . $table .'_'. implode('', $columns));
			// if (!isset(DBi::$prepared_statements[$stmt_name])) {

			// 	// set_clauses
			// 	$counter = 3; // 1 and  2 are reserved to section_id, section_tipo
			// 	$set_clauses = [];
			// 	foreach ($values as $key => $value) {
			// 		if (!isset(self::$matrix_columns[$key])) {
			// 			throw new Exception("Invalid column name: $key");
			// 		}
			// 		$set_clauses[] = '"'.$key.'" = $' . $counter++;
			// 	}

			// 	$sql = 'UPDATE '.$table.' SET '.implode(', ', $set_clauses)
			// 		 .' WHERE section_id = $1 AND section_tipo = $2';

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
			// 	[$section_id, $section_tipo, ...$safe_values] // spread values
			// );

		// Without prepared statement (more dynamic and appropriate for changing columns scenarios)
			// set_clauses
			$counter = 3; // 1 and  2 are reserved to section_id, section_tipo
			$set_clauses = [];
			foreach ($columns as $column) {
				$set_clauses[] = pg_escape_identifier($conn, $column) . ' = $'. $counter++;
			}

			$sql = 'UPDATE '.$table.' SET '.implode(', ', $set_clauses)
				 .' WHERE section_id = $1 AND section_tipo = $2';

			$params = [$section_id, $section_tipo, ...$safe_values];

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
	}//end update_matrix_data



	/**
	* INSERT_MATRIX_DATA
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
	public static function insert_matrix_data( string $table, string $section_tipo, array $values=[] ) : int|false {

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
		$placeholders	= ['$1', 'updated_counter.dato']; // placeholders for them
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

		// SQL. Note that counter is updated (+1) and the new value is used as section_id.
		// If no counter exists for current tipo, a new one is created.
		$sql = "
			WITH updated_counter AS (
				INSERT INTO $counter_table (tipo, dato, parent, lang)
				  VALUES ($1, 1, 0, 'lg-nolan')
				ON CONFLICT (tipo) DO UPDATE
				  SET dato = $counter_table.dato + 1
				RETURNING dato
			)
			INSERT INTO $table (" . implode(', ', $columns) . ")
			SELECT " . implode(', ', $placeholders) . "
			FROM updated_counter
			RETURNING \"section_id\";
		";

		// Execute query
		if (empty($values)) {
			// Only record creation, without additional data (fixed)
			// With prepared statement
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
		}else{
			// Record creation with additional columns data (dynamic)
			$result = pg_query_params(
				$conn,
				$sql,
				$params
			);
		}
		if (!$result) {
			debug_log(__METHOD__
				." Error Processing Request Load ".to_string($sql) . PHP_EOL
				.' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false;
		}

		// Fetch section_id
		$section_id = pg_fetch_result($result, 0, 'section_id');
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
	}//end insert_matrix_data



}//end class matrix_data
