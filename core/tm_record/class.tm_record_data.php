<?php declare(strict_types=1);
/**
* Class TM_RECORD_DATA
*
* It is a normalized matrix data container to get centralized access
* to matrix records as CRUD.
*
* Supported actions include:
* - Loading record data
* - Updating existing records
* - Inserting new records with optional initial data
*/
class tm_record_data {

	// Data
	// An object structure with the data columns defined in database
	private stdClass $data;

	// array columns_name
	private array $columns_name = [
		// int id. Matrix id value from DB column 'id'
		// Stores the time machine id
		'id',
		// int section_id. Section id value from DB column 'section_id'
		// Stores the caller section_id
		'section_id',
		// string section_tipo. Section data value from DB column 'relation'.
		// Stores 
		'section_tipo',
		// string tipo. Component/section tipo data value from DB column 'tipo'.
		// Stores the caller section_tipo
		'tipo',
		// string lang. Lang data value from DB column 'lang'
		// Stores the caller language of the data
		'lang',
		// timestamp creation time. Created at timestamp in database (YYY-MM-DD HH:MI:SS). This is the creation time of a record.
		// Stores the creation time of a record in timestamp format of creation time in DB (YYY-MM-DD HH:MI:SS). This stores timestamp when record was created on server side
		'timestamp',
		// int user_id. User section_id value from DB column 'user_id
		// Stores the section_id of the user that made the change.
		'user_id',
		// int|null bulk_process_id. Bulk process id value from DB column 'bul_process_id'. This is a reference to bulk process id. If null, then it means no related bulk processes are running for this record.
		// Stores numeric values that are references to bulk process ids, if null then no related processes exist for this tm record and it is considered not running yet (null) 
		'bulk_process_id',
		// array|null data. Section media values from DB column 'data' (array).
		// Stores the changed data.
		'data'
	];

	// bool is_loaded_data_columns. Defines if section data_columns is already loaded from the database
	protected bool $is_loaded_data = false;

	// array instances
	// Cache instances list added by the 'get_instance' calls based on section_tipo and $section_id key
	private static array $instances = [];

	// int|null id
	// A numerical identifier for the tm record. Used as the primary lookup key in the WHERE clauses.
	protected readonly ?int $id;

	// string table.
	// The name of the table to query.
	protected readonly string $table;



	/**
	* GET_INSTANCE
	* Singleton instance constructor for the class tm_record_data
	* Stores cache instances based on the contraction of section_tipo and $section_id
	* as 'oh1_1'. If the section id is null, no cache is used.
	* @param int $id
	* 	Unique id of the section. E.g. 1
	* @return class tm_record_data instance
	*/
	public static function get_instance( int $id ) : self {

		// cache
		$cache_key = $id;
		if (isset(self::$instances[$cache_key])) {
			return self::$instances[$cache_key];
		}

		return self::$instances[$cache_key] = new self( $id );
	}//end get_tm_record_data_instance



	/**
	* __CONSTRUCT
	* It's instanced once and handles all the section data database tasks.
	* @param string $section_tipo
	* @param int|null $section_id=null
	*/
	private function __construct( int $id ) {

		$this->id	= $id;
		$this->table = tm_db_manager::$table;

		// Data columns
		$this->data = new stdClass();
		// Assign the valid columns. Every column has its own homonym column in database.
		foreach ($this->columns_name as $column_name) {
			$this->data->{$column_name} = null;
		}
	}//end __construct



	/**
	* __DESTRUCT
	* Remove the instance from cache and destroy itself.
	*/
	public function __destruct() {

		// Remove the instance from cache
		$cache_key = $this->id;
		if (isset(self::$instances[$cache_key])) {
			unset( self::$instances[$cache_key] );
		}
	}//end __destruct



	/**
	* SET_DATA
	* Replace data as full data of the section_record
	* @param object $data
	* @return bool
	*/
	public function set_data( object $data ) : bool {

		foreach ($data as $column => $value ) {

			if ( !in_array($column, $this->columns_name) ) {
				continue;
			}

			if ( isset( tm_db_manager::$json_columns[$column] )) {
				if( is_string($value) ){
					$value = json_decode( $value );
					if (json_last_error() !== JSON_ERROR_NONE) {
						debug_log(__METHOD__
							. " Abort. JSON decode error for column " . PHP_EOL
							. "column: " . $column . PHP_EOL
							. "value: " . $value . PHP_EOL
							. "error: " . json_last_error_msg()
							, logger::ERROR
						);
						throwException(new Exception("JSON decode error for column " . $column . ": " . json_last_error_msg()));
					}
				}
			}
			else if (isset( tm_db_manager::$int_columns[$column] )) {
				$value = (int)$value;
			}

			$this->set_column_data( $column, $value );
		}

		return true;
	}//end set_data



	/**
	* SET_COLUMN_DATA
	* Assign the given data to the indicated column.
	* @param string $column
	* @param object|null $data
	* @return bool
	*/
	public function set_column_data( string $column, array|int|string|null $value ) : bool {

		if ( !property_exists($this->data, $column) ) {
			debug_log(__METHOD__
				. " Abort. Invalid column " . PHP_EOL
				. "column: " . $column
				, logger::ERROR
			);
			return false;
		}
		$this->data->$column = $value;

		return true;
	}//end set_column_data



	/**
	* GET_DATA
	* Returns the full data array
	* @return array $this->data
	*/
	public function get_data() : object {

		return $this->data;
	}//end get_data



	/**
	* GET_COLUMN_DATA
	* Returns the specific data of given column
	* @param string $column
	* @return object|null $this->data
	*/
	public function get_column_data( string $column ) : ?object {

		return $this->data->$column ?? null;
	}//end get_column_data



	/**
	* SAVE_DATA
	* Safely saves whole data one or more columns in a "matrix" table row,
	* identified by a composite key of `section_id` and `section_tipo`.
	* @return bool
	* Returns `true` on success, or `false` if validation fails,
	* query preparation fails, or execution fails.
	*/
	public function save_data() : bool {

		$id 	= $this->id;
		$data	= $this->data;

		return tm_db_manager::update(			
			$id,
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

		$id		= $this->id;
		$values	= new stdClass();
		foreach ($columns as $current_column) {
			$values->$current_column = $this->data->$current_column ?? null;		
		}

		return tm_db_manager::update(			
			$id,
			$values
		);
	}//end save_column_data



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
	* @return object|null $this->data
	* Returns the processed data as an associative array with parsed JSON values.
	* If no row is found, it returns an empty array [].
	*/
	public function read( bool $cache=true ) : ?object {

		if ($cache && $this->is_loaded_data) {
			return $this->data;
		}
	
		$id = $this->id;

		$row = tm_db_manager::read(
			$id
		);

		// No results found
		if (!$row) {
			return null;
		}

		$json_columns = tm_db_manager::$json_columns;

		// assign data_columns from database results
		foreach ($this->columns_name as $column) {

			if ( !isset($row->$column) ) {
				// Ignore non existing data_columns key
				continue;
			}

			if ( $row->$column!==null ) {
				// JSON case
				$this->data->$column = isset($json_columns[$column]) 
					? json_decode($row->$column)
					: $row->$column;
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

		$id = $this->id;

		return tm_db_manager::delete(
			$id
		);
	}//end delete



}//end class tm_record_data
