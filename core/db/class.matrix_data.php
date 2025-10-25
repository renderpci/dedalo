<?php declare(strict_types=1);
/**
* Class MATRIX_DATA
*
* It is a normalized matrix data container to get centralized access
* to matrix records as CRUD.
*
* Supported actions include:
* - Loading record data
* - Updating existing records
* - Inserting new records with optional initial data
*/
class matrix_data {



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
	* Singleton instance constructor for the class matrix_data
	* Stores cache instances based on the contraction of section_tipo and $section_id
	* as 'oh1_1'. If the section id is null, no cache is used.
	* @param string $section_tipo
	* 	Ontology identifier of the section. E.g. 'oh1'
	* @param ?int $section_id=null
	* 	Unique id of the section. E.g. 1
	* @return class matrix_data instance
	*/
	public static function get_instance( string $section_tipo, ?int $section_id=null ) : self {

		if ($section_id===null) {
			return new matrix_data( $section_tipo, null );
		}

		// cache
		$cache_key = $section_tipo .'_' .$section_id;
		if (isset(self::$instances[$cache_key])) {
			return self::$instances[$cache_key];
		}

		return self::$instances[$cache_key] = new self($section_tipo, $section_id);
	}//end get_matrix_data_instance



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
	* GET_DATA_COLUMNS
	* @return array $this->data_columns
	*/
	public function get_data_columns() : array {

		return $this->data_columns;
	}//end get_data_columns



	/**
	* CREATE
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
	public function create( array $values=[] ) : int|false {

		$table			= $this->table;
		$section_tipo	= $this->section_tipo;

		return matrix_db_manager::create(
			$table,
			$section_tipo,
			$values
		);
	}//end create



	/**
	* READ
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
	public function read( bool $cache=true ) : array|false {

		if ($cache && $this->is_loaded_data) {
			return $this->data_columns;
		}

		$table			= $this->table;
		$section_tipo	= $this->section_tipo;
		$section_id		= $this->section_id;

		$row = matrix_db_manager::read(
			$table,
			$section_tipo,
			$section_id
		);

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


		return $this->data_columns;
	}//end read



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

		// check values
		if (empty($values)) {
			debug_log(__METHOD__
				." Empty values array " . PHP_EOL
				.' values: ' . json_encode($values)
				, logger::ERROR
			);
			return false;
		}

		return matrix_db_manager::update(
			$table,
			$section_tipo,
			$section_id,
			$values
		);
	}//end update



	/**
	* DELETE
	* Safely deletes one record in a "matrix" table,
	* identified by a composite key of `section_id` and `section_tipo`.
	* @param array $values
	* Assoc array with [column name => value] structure
	* Keys are column names, values are their new values.
	* @return bool
	* Returns `true` on success, or `false` if validation fails,
	* query preparation fails, or execution fails.
	*/
	public function delete( array $values ) : bool {

		$table			= $this->table;
		$section_tipo	= $this->section_tipo;
		$section_id		= $this->section_id;

		// check values
		if (empty($values)) {
			debug_log(__METHOD__
				." Empty values array " . PHP_EOL
				.' values: ' . json_encode($values)
				, logger::ERROR
			);
			return false;
		}

		return matrix_db_manager::delete(
			$table,
			$section_tipo,
			$section_id
		);
	}//end delete



}//end class matrix_data
