<?php declare(strict_types=1);
/**
* Class MATRIX_MANAGER
*
* Provides core operations for managing matrix records.
* This class ensures data consistency by enforcing predefined
* table and column definitions within the matrix model.
*
* Supported actions include:
* - Loading record data
* - Updating existing records
* - Inserting new records with optional initial data
*/
class matrix_manager {



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

	protected array $data_columns = [
		// object|null data. Section data value from V7 DB column 'data'
		// Section specific data like label, diffusion info, etc.
		'data' => null,
		// object|null relation. Section data value from V7 DB column 'relation'.
		// Stores the list of locators grouped by component tipo as {"dd20":[locators],"dd35":[locators]}
		'relation' => null,
		// object|null string. Section data value from V7 DB column 'string'
		// Stores string literals values used from component_input_text, component_text_area and others.
		'string' => null,
		// object|null date. Section data value from V7 DB column 'date'
		// Stores date values handled by component_date
		'date' => null,
		// object|null iri. Section data value from V7 DB column 'iri'
		// Stores IRI object values handled by component_iri as {"dd85":{"title":"My site URI","uri":"https://mysite.org"}}
		'iri' => null,
		// object|null geo. Section data value from V7 DB column 'geo'
		// Stores geo data handled by component_geolocation.
		'geo' => null,
		// object|null number. Section data value from V7 DB column 'number'
		// Stores numeric values handled by component_number.
		'number' => null,
		// object|null media. Section data value from V7 DB column 'media'
		// Stores media values handled by media components (3d,av,image,pdf,svg)
		'media' => null,
		// object|null misc. Section data value from V7 DB column 'misc'
		// Stores other components values like component_security_access, component_json, etc.
		'misc' => null,
		// object|null relation_search. Section data value from V7 DB column 'relation_search'
		// Stores relation optional data useful for search across parents like toponymy.
		'relation_search' => null,
		// object|null counters. Section data value from V7 DB column 'counters'
		// Stores string components counters used to get unique identifiers for the values as {"id":1,"lang":"lg-nolan","type":"dd750","value":"Hello"}
		// The format of the counter data is {"dd750":1,"dd201":1,..}
		'counters' => null
	];

	// bool is_loaded_data_columns. Defines if section data_columns is already loaded from the database
	protected bool $is_loaded_data = false;

	// array instances
	// Cache instances list added by the 'get_instance' calls based on section_tipo and $section_id key
	private static array $instances = [];

	// string section_tipo
	// A string identifier representing the type of section. Used as part of the WHERE clause in the SQL query.
	protected readonly string $section_tipo;

	// int|null section_id
	// A numerical identifier for the section. Used as the primary lookup key in the WHERE clauses.
	protected readonly ?int $section_id;

	// string table.
	// The name of the table to query.
	protected readonly string $table;



	/**
	* GET_INSTANCE
	* Singleton instance constructor for the class matrix_manager
	* Stores cache instances based on the contraction of section_tipo and $section_id
	* as 'oh1_1'. If the section id is null, no cache is used.
	* @param string $section_tipo
	* 	Ontology identifier of the section. E.g. 'oh1'
	* @param ?int $section_id=null
	* 	Unique id of the section. E.g. 1
	* @return class matrix_manager instance
	*/
	public static function get_instance( string $section_tipo, ?int $section_id=null ) : self {

		if ($section_id===null) {
			return new matrix_manager( $section_tipo, null );
		}

		// cache
		$cache_key = $section_tipo .'_' .$section_id;
		if (isset(self::$instances[$cache_key])) {
			return self::$instances[$cache_key];
		}

		return self::$instances[$cache_key] = new self($section_tipo, $section_id);
	}//end get_matrix_manager_instance



	/**
	* __CONSTRUCT
	* It's instanced once and handles all the section data database tasks.
	*/
	private function __construct( string $section_tipo, ?int $section_id=null ) {

		$this->section_tipo	= $section_tipo;
		$this->section_id	= $section_id;
		$this->table		= common::get_matrix_table_from_tipo($this->section_tipo);
	}//end __construct



	/**
	* LOAD
	* Retrieves a single row of data from a specified PostgreSQL table
	* based on section_id and section_tipo.
	* It's designed to provide a unified way of accessing data from
	* various "matrix" tables within the Dédalo application.
	* The function validates the table against a predefined list of allowed tables
	* to prevent SQL injection vulnerabilities.
	* @param bool $cache = true
	* On true (default), if isset $this->data_columns, no new database call is made.
	* On false, a new database query is always forced.
	* @return array|false $this->data_columns
	* Returns the processed data as an associative array with parsed JSON values.
	* If no row is found, it returns an empty array []. If a critical error occurs, it returns false.
	*/
	public function load( bool $cache=true ) : array|false {

		if ($cache && $this->is_loaded_data) {
			return $this->data_columns;
		}

		$table			= $this->table;
		$section_tipo	= $this->section_tipo;
		$section_id		= $this->section_id;

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

		// No results found
		if (!$row) {
			return [];
		}

		// assign data_columns from database results
		foreach ($this->data_columns as $column => $column_value) {

			if (!array_key_exists($column, $row)) {
				// Ignore non existing data_columns key
				continue;
			}

			$data_value = $row[$column];

			if ($data_value === null) {
				$this->data_columns[$column] = null;
			} elseif (isset(self::$matrix_json_columns[$column])) {
				$this->data_columns[$column] = json_decode($data_value);
			} elseif (isset(self::$matrix_int_columns[$column])) {
				$this->data_columns[$column] = (int)$data_value;
			} else {
				$this->data_columns[$column] = $data_value;
			}
		}

		// Updates is_loaded_data
		$this->is_loaded_data = true;

			dump($this->data_columns, ' this->data_columns ++ '.to_string());


		return $this->data_columns;
	}//end load



	/**
	* UPDATE
	* Safely updates one or more columns in a "matrix" table row,
	* identified by a composite key of `section_id` and `section_tipo`.
	* @param array $values
	* Assoc array with [column name => value] structure
	* Keys are column names, values are their new values.
	* @return bool
	* Returns `true` on success, or `false` if validation fails,
	* query preparation fails, or execution fails.
	*/
	public function update( array $values ) : bool {

		$table			= $this->table;
		$section_tipo	= $this->section_tipo;
		$section_id		= $this->section_id;

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
	}//end update



	/**
	* INSERT
	* Inserts a single row into a "matrix" table with automatic handling for JSON columns
	* and guaranteed inclusion of the `section_tipo` and `section_id` columns.
	* Before insert, creates/updates the proper counter value and uses the result as `section_id` value.
	* It is executed using prepared statement when the values are empty (default creation of empty record
	* adding `section_tipo` and `section_id` only) and with query params when is not (other
	* dynamic combinations of columns data).
	* @param array $values = [] (optional)
	* Assoc array with [column name => value] structure.
	* Keys are column names, values are their new values.
	* @return int|false $section_id
	* Returns the new $section_id on success, or `false` if validation fails,
	* query preparation fails, or execution fails.
	*/
	public function insert( array $values=[] ) : int|false {

		$table			= $this->table;
		$section_tipo	= $this->section_tipo;

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
	}//end insert



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



}//end class matrix_manager
