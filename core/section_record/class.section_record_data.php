<?php declare(strict_types=1);
/**
* Class SECTION_RECORD_DATA
*
* It is a normalized matrix data container to get centralized access
* to matrix records as CRUD.
*
* Supported actions include:
* - Loading record data
* - Updating existing records
* - Inserting new records with optional initial data
*/
class section_record_data {



	protected array $data = [
		// object|null data. Section data value from DB column 'data'
		// Section specific data like label, diffusion info, etc.
		'data' => null,
		// object|null relation. Section data value from DB column 'relation'.
		// Stores the list of locators grouped by component tipo as {"dd20":[locators],"dd35":[locators]}
		'relation' => null,
		// object|null string. Section data value from DB column 'string'
		// Stores string literals values used from component_input_text, component_text_area and others.
		'string' => null,
		// object|null date. Section data value from DB column 'date'
		// Stores date values handled by component_date
		'date' => null,
		// object|null iri. Section data value from DB column 'iri'
		// Stores IRI object values handled by component_iri as {"dd85":{"title":"My site URI","uri":"https://mysite.org"}}
		'iri' => null,
		// object|null geo. Section data value from DB column 'geo'
		// Stores geo data handled by component_geolocation.
		'geo' => null,
		// object|null number. Section data value from DB column 'number'
		// Stores numeric values handled by component_number.
		'number' => null,
		// object|null media. Section data value from DB column 'media'
		// Stores media values handled by media components (3d,av,image,pdf,svg)
		'media' => null,
		// object|null misc. Section data value from DB column 'misc'
		// Stores other components values like component_security_access, component_json, etc.
		'misc' => null,
		// object|null relation_search. Section data value from DB column 'relation_search'
		// Stores relation optional data useful for search across parents like toponymy.
		'relation_search' => null,
		// object|null counters. Section data value from DB column 'counters'
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
	* Singleton instance constructor for the class section_record_data
	* Stores cache instances based on the contraction of section_tipo and $section_id
	* as 'oh1_1'. If the section id is null, no cache is used.
	* @param string $section_tipo
	* 	Ontology identifier of the section. E.g. 'oh1'
	* @param int $section_id
	* 	Unique id of the section. E.g. 1
	* @return class section_record_data instance
	*/
	public static function get_instance( string $section_tipo, int $section_id ) : self {

		// cache
		$cache_key = $section_tipo .'_' .$section_id;
		if (isset(self::$instances[$cache_key])) {
			return self::$instances[$cache_key];
		}

		return self::$instances[$cache_key] = new self($section_tipo, $section_id);
	}//end get_section_record_data_instance



	/**
	* __CONSTRUCT
	* It's instanced once and handles all the section data database tasks.
	* @param string $section_tipo
	* @param int|null $section_id=null
	*/
	private function __construct( string $section_tipo, int $section_id ) {

		$this->section_tipo	= $section_tipo;
		$this->section_id	= $section_id;
		$this->table		= common::get_matrix_table_from_tipo($this->section_tipo);
	}//end __construct



	/**
	* __DESTRUCT
	* Remove the instance from cache and destroy itself.
	*/
	public function __destruct() {

		// Remove the instance from cache
		$cache_key = $this->section_tipo .'_' .$this->section_id;
		if (isset(self::$instances[$cache_key])) {
			unset( self::$instances[$cache_key] );
		}
	}//end __destruct



	/**
	* SET_DATA
	* Replace data as full data of the section_record
	* @param array $data
	* @return bool
	*/
	public function set_data( array $data ) : bool {

		$this->data = $data;

		return true;
	}//end set_data



	/**
	* SET_COLUMN_DATA
	* Assign the given data to the indicated column.
	* @param string $column
	* @param array|null $data
	* @return bool
	*/
	public function set_column_data( string $column, ?array $data ) : bool {

		if( !isset($this->data[$column]) ){
			debug_log(__METHOD__
				. " Abort. Invalid column " . PHP_EOL
				. "column: " . $column
				, logger::ERROR
			);
			return false;
		}
		$this->data[$column] = $data;

		return true;
	}//end set_column_data



	/**
	* SET_KEY_DATA
	* Assign the given data to the indicated key in your column
	* @param string $column
	* @param string $key as a tipo (oh25) or section properties (created_by_user)
	* @param array|null $data
	* @return bool
	*/
	public function set_key_data( string $column, string $key, ?array $data ) : bool {

		if( !isset($this->data[$column]) ){
			debug_log(__METHOD__
				. " Abort. Invalid column " . PHP_EOL
				. "column: " . $column
				, logger::ERROR
			);
			return false;
		}

		// remove the data of the key when data is set as null
		if( $data===null ){
			if ( isset($this->data[$column][$key]) ){
				unset( $this->data[$column][$key] );
			}
			return true;
		}

		// Set or change the data of the given key
		$this->data[$column][$key] = $data;

		return true;
	}//end set_key_data




	/**
	* GET_DATA
	* Returns the full data array
	* @return array $this->data
	*/
	public function get_data() : array {

		return $this->data;
	}//end get_data



	/**
	* GET_COLUMN_DATA
	* Returns the specific data of given column
	* @param string $column
	* @return array $this->data
	*/
	public function get_column_data( string $column ) : array {

		return $this->data[$column] ?? null;
	}//end get_column_data



	/**
	* GET_KEY_DATA
	* Returns the specific data of given key in indicated column
	* @param string $column
	* @param string $key as a tipo (oh25) or section properties (created_by_user)
	* @return array|null
	*/
	public function get_key_data( string $column, string $key ) : ?array {

		return $this->data[$column][$key] ?? null;
	}//end get_key_data



	/**
	* SAVE_DATA
	* Safely saves whole data one or more columns in a "matrix" table row,
	* identified by a composite key of `section_id` and `section_tipo`.
	* @return bool
	* Returns `true` on success, or `false` if validation fails,
	* query preparation fails, or execution fails.
	*/
	public function save_data() : bool {

		$table			= $this->table;
		$section_tipo	= $this->section_tipo;
		$section_id		= $this->section_id;
		$data			= $this->data;

		return matrix_db_manager::update(
			$table,
			$section_tipo,
			$section_id,
			$data
		);
	}//end save_data



	/**
	* SAVE_COLUMN_DATA
	* Safely saves specific data of a given columns in a "matrix" table row,
	* identified by a composite key of `section_id` and `section_tipo`.
	* @param array $columns
	* @return bool
	* Returns `true` on success, or `false` if validation fails,
	* query preparation fails, or execution fails.
	*/
	public function save_column_data( array $columns ) : bool {

		$table			= $this->table;
		$section_tipo	= $this->section_tipo;
		$section_id		= $this->section_id;
		$values			= [];
		foreach ($columns as $current_column) {
			$values[$current_column] = $this->data[$current_column] ?? null;
		}

		return matrix_db_manager::update(
			$table,
			$section_tipo,
			$section_id,
			$values
		);
	}//end save_column_data



	/**
	* SAVE_KEY_DATA
	* Safely saves one key data of one column in a "matrix" table row,
	* identified by a composite key of `section_id` and `section_tipo`.
	* @param string $column
	* @param string $key as a tipo (oh25) or section properties (created_by_user)
	* @return bool
	* Returns `true` on success, or `false` if validation fails,
	* query preparation fails, or execution fails.
	*/
	public function save_key_data( string $column, string $key ) : bool {

		$table			= $this->table;
		$section_tipo	= $this->section_tipo;
		$section_id		= $this->section_id;
		$value			= $this->data[$column][$key] ?? null;

		return matrix_db_manager::update_by_key(
			$table,
			$section_tipo,
			$section_id,
			$column,
			$key,
			$value
		);
	}//end save_key_data



	// static methods






	/**
	* READ
	* Retrieves a single row of data from a specified PostgreSQL table
	* based on section_id and section_tipo.
	* It's designed to provide a unified way of accessing data from
	* various "matrix" tables within the Dédalo application.
	* The function validates the table against a predefined list of allowed tables
	* to prevent SQL injection vulnerabilities.
	* @param bool $cache = true
	* On true (default), if isset $this->data, no new database call is made.
	* On false, a new database query is always forced.
	* @return array $this->data
	* Returns the processed data as an associative array with parsed JSON values.
	* If no row is found, it returns an empty array [].
	*/
	public function read( bool $cache=true ) : array {

		if ($cache && $this->is_loaded_data) {
			return $this->data;
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
		// foreach ($this->data as $column => $column_value) {
		$colum_names = array_keys($this->data);
		foreach ($colum_names as $column) {

			if (!array_key_exists($column, $row)) {
				// Ignore non existing data_columns key
				continue;
			}

			$data_value = $row[$column];

			if ($data_value!==null && isset(matrix_db_manager::$matrix_json_columns[$column])) {
				// JSON case
				$this->data[$column] = json_decode($data_value);
			} elseif (isset(matrix_db_manager::$matrix_int_columns[$column])) {
				// int case
				$this->data[$column] = (int)$data_value;
			} else {
				// default case
				$this->data[$column] = $data_value;
			}
		}

		// Updates is_loaded_data
		$this->is_loaded_data = true;


		return $this->data;
	}//end read



	/**
	* DELETE
	* Safely deletes one record in a "matrix" table,
	* identified by a composite key of `section_id` and `section_tipo`.
	* @return bool
	* Returns `true` on success, or `false` if validation fails,
	* query preparation fails, or execution fails.
	*/
	public function delete() : bool {

		$table			= $this->table;
		$section_tipo	= $this->section_tipo;
		$section_id		= $this->section_id;

		return matrix_db_manager::delete(
			$table,
			$section_tipo,
			$section_id
		);
	}//end delete



}//end class section_record_data
