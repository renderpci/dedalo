<?php declare(strict_types=1);
/**
* Class ONTOLOGY_DATA
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
abstract class ontology_data {


	// Ontology table
	public static $ontology_table = 'dd_ontology';

	// columns list
	public static $ontology_columns = [
		'id'				=> true,
		'tipo'				=> true,
		'parent'			=> true,
		'term'				=> true,
		'model'				=> true,
		'relations'			=> true,
		'tld'				=> true,
		'properties'		=> true,
		'model_tipo'		=> true,
		'is_model'			=> true,
		'is_translatable'	=> true,
		'propiedades'		=> true
	];

	// JSON columns to decode
	public static $ontology_json_columns = [
		'term'				=> true,
		'relations'			=> true,
		'properties'		=> true
	];

	// int columns to parse
	public static $ontology_int_columns = [
		'id'				=> true,
		'order_number'		=> true
	];

	// bool columns to parse
	public static $ontolgy_boolean = [
		'is_model'			=> true,
		'is_translatable'	=> true
	];




	/**
	* LOAD_ONTOLOGY_DATA
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
	public static function load_ontology_data( string $tipo ) : array|false {

		$conn = DBi::_getConnection();

		$table = self::$ontology_table;

		// With prepared statement
		$stmt_name = __METHOD__ . '_' . $table;
		if (!isset(DBi::$prepared_statements[$stmt_name])) {
			$select_fields	= '*';
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
			if ($value === null) {
				continue;
			}
			// parse values
			switch (true) {

				case isset(self::$ontology_json_columns[$key]):
					$row[$key] = json_decode($value);
					break;

				case isset(self::$ontology_int_columns[$key]):
					$row[$key] = (int)$value;
					break;

				case isset(self::$ontolgy_boolean[$key]):
					$row[$key] = ($value==='t');
					break;
			}
		}


		return $row;
	}//end load_ontology_data



	/**
	* UPDATE_ONTOLOGY_DATA
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
	public static function update_ontology_data( string $tipo, array $values ) : bool {

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

		$columns = array_keys($values); // array keys are the column names as 'date' => [{...}]

		$safe_values = [];
		foreach ($values as $key => $value) {
			if (!isset(self::$ontology_columns[$key])) {
				throw new Exception("Invalid column name: $key");
			}
			$safe_value = ($value !== null && isset(self::$ontology_json_columns[$key]))
				? json_handler::encode($value)
				: $value;

			$safe_values[] = $safe_value;
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
			// set_clauses
			$counter = 2; // 1 is reserved to tipo
			$set_clauses = [];
			foreach ($columns as $column) {
				$set_clauses[] = pg_escape_identifier($conn, $column) . ' = $'. $counter++;
			}

			$sql = 'UPDATE '.$table.' SET '.implode(', ', $set_clauses)
				 .' WHERE tipo = $1';

			$params = [$tipo, ...$safe_values];

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
	}//end update_ontology_data



	/**
	* INSERT_ONTOLGY_DATA
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
	public static function insert_ontolgy_data( string $tipo, array $values=[] ) : int|false {

		$table = self::$ontology_table;

		// Connection
		$conn = DBi::_getConnection();

		// Start building query
		$columns		= ['"tipo"']; // required columns
		$placeholders	= ['$1']; // placeholders for them
		$params			= [$tipo]; // param values (first one for tipo)
		$param_index	= 1; // next param index ($2, $3, ...)

		// Add dynamic columns
		foreach ($values as $col => $value) {

			// Columns. Only accepts normalized columns
			if (!isset(self::$ontology_columns[$col])) {
				throw new Exception("Invalid column name: $col");
			}
			$columns[] = pg_escape_identifier($conn, $col);

			// Placeholders / Values
			 if ($value !== null && isset(self::$ontology_json_columns[$col])) {
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

		// SQL. Note that counter is updated auto-handled by the database.
		$sql = "
			INSERT INTO $table (" . implode(', ', $columns) . ")
			SELECT " . implode(', ', $placeholders) . "
			RETURNING \"id\";
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
	}//end insert_ontolgy_data



}//end class ontology_data
