<?php declare(strict_types=1);
/**
* CLASS TM_RECORD_DATA
* In-memory CRUD façade for a single row of the `matrix_time_machine` PostgreSQL table.
*
* Every time a component value is written to the database, a snapshot row is inserted
* into `matrix_time_machine` by tm_record::create().  tm_record_data manages the
* lifecycle of one such row: it holds a decoded in-memory copy of the nine DB columns,
* exposes a column-level read/write API, and delegates all actual SQL work to the
* static tm_db_manager helper.
*
* Responsibilities:
* - Initialise and own the $data stdClass that mirrors the database row, with one
*   property per column listed in $columns_name.
* - Decode JSONB columns and cast integer columns on the way in from the database
*   (read) and on the way in from callers (set_data), consulting the tm_db_manager
*   allowlists to know which columns need which treatment.
* - Expose column-level setters/getters (set_column_data / get_column_data) and
*   whole-object equivalents (set_data / get_data).
* - Persist changes back to the database through save_data (full row) and
*   save_column_data (named subset of columns).
* - Cache instances keyed by the integer `id` (get_instance); remove the cache entry
*   on destruction (__destruct).
*
* Data shape after read():
*   id              — auto-assigned serial primary key (int)
*   section_tipo    — ontology tipo of the section whose value changed (string)
*   section_id      — numeric record ID within that section (int)
*   tipo            — ontology tipo of the component that changed (string)
*   lang            — active language code at the time of the change (string)
*   timestamp       — server-side creation time in DB format YYY-MM-DD HH:MI:SS (string)
*   user_id         — section_id of the user who saved the change (int)
*   bulk_process_id — optional reference to a bulk-process run (int|null)
*   data            — JSONB snapshot of the component datum (array|object, decoded)
*
* Relationships:
* - Owned by tm_record, which creates and destroys the instance.
* - Delegates all SQL to tm_db_manager (CREATE/READ/UPDATE/DELETE).
* - Does not extend or implement any base class; see section_record_data for the
*   parallel pattern used in the main record system.
*
* @package Dédalo
* @subpackage Core
*/
class tm_record_data {

	/**
	* In-memory mirror of one `matrix_time_machine` database row.
	* Each property corresponds to a column name listed in $columns_name.
	* Properties are initialised to null in __construct and populated by
	* read() or set_data(). JSONB columns are decoded to PHP objects/arrays;
	* integer columns are cast to int.
	* @var stdClass $data
	*/
	private stdClass $data;

	/**
	* Ordered allowlist of column names that map to columns in `matrix_time_machine`.
	* Used in two ways:
	* - __construct iterates it to pre-seed $data with null-valued properties.
	* - read() iterates it to copy only known columns from the raw DB row,
	*   ignoring any extra columns the driver might return.
	* The order here is informational; SQL queries in tm_db_manager define their own order.
	* @var array<int,string> $columns_name
	*/
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

	/**
	* Flag that tracks whether the database row has been loaded into $data.
	* Set to true by read() after a successful SELECT; checked by read() when
	* $cache=true (the default) to skip redundant round-trips to PostgreSQL.
	* Callers that need to force a re-fetch should pass $cache=false to read().
	* @var bool $is_loaded_data
	*/
	protected bool $is_loaded_data = false;

	/**
	* Per-process cache of tm_record_data instances, keyed by the integer `id`.
	* Populated by get_instance(); cleared by __destruct().
	* When multiple callers request the same id within a single PHP request they
	* receive the same object and therefore share any in-memory mutations, which
	* is the intended behaviour (avoids conflicting in-memory states).
	* @var array<int,self> $instances
	*/
	private static array $instances = [];

	/**
	* Primary key of the `matrix_time_machine` row this instance represents.
	* Set once in __construct (readonly) and used as the WHERE value in every
	* SQL call that targets a single row (read, update, delete).
	* null is permitted by the type but should not occur in practice: the
	* constructor always receives a concrete int from the caller.
	* @var int|null $id
	*/
	protected readonly ?int $id;

	/**
	* Name of the PostgreSQL table managed by this instance.
	* Copied from tm_db_manager::$table in __construct so that callers never
	* need to reference the DB-manager class directly for simple table-name look-ups.
	* Declared readonly to prevent accidental reassignment after construction.
	* @var string $table
	*/
	protected readonly string $table;



	/**
	* GET_INSTANCE
	* Returns a cached tm_record_data object for the given primary key, creating
	* one on first call.
	*
	* The instance cache ($instances) is keyed by the integer id, so all code
	* paths within a single PHP request that ask for the same TM row receive the
	* same object and share any in-memory mutations. If id is not yet cached a
	* new instance is constructed via __construct and stored before being returned.
	*
	* There is no null-id cache path here: the signature accepts only int, so
	* the caller is responsible for ensuring the id is known before calling.
	*
	* @param int $id - Primary key of the `matrix_time_machine` row.
	* @return self - Shared (cached) tm_record_data instance for this id.
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
	* Initialises the in-memory state for a single `matrix_time_machine` row.
	* Sets $this->id, copies the table name from tm_db_manager, and seeds every
	* column in $columns_name to null inside the $data stdClass.
	* @param int $id - Primary key of the `matrix_time_machine` row to manage.
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
	* Merges a caller-supplied object into the in-memory $data store, applying the
	* same type coercions that read() uses when loading from the database.
	*
	* For each property of $data:
	* - Unknown column names (not in $columns_name) are silently skipped.
	* - JSONB columns (listed in tm_db_manager::$json_columns): if the incoming value
	*   is a raw JSON string it is decoded here; a JSON parse error triggers a logged
	*   exception and returns false.
	* - Integer columns (listed in tm_db_manager::$int_columns): the value is cast to
	*   int, coercing null and empty strings to 0.
	* - All other columns are stored as-is.
	*
	* This method is used by tm_record::set_data() to push data loaded from an
	* external source (e.g. a tool restoring a previous snapshot) into the instance
	* before calling save_data().
	*
	* @param object $data - Object keyed by column name; unknown keys are ignored.
	* @return bool - Always returns true unless a JSON decode error is encountered.
	* @throws Exception - Via throwException() if json_decode fails on a JSON column.
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
	* Assigns a value to a single column in the in-memory $data object.
	*
	* Guards against writing to an undeclared property by checking that the
	* column was initialised by __construct (i.e. it exists in $columns_name).
	* If the property does not exist, the error is logged and false is returned
	* without modifying $data — the in-memory state remains consistent.
	*
	* (!) No type coercion is applied here. Callers must ensure the value is
	* already in the correct PHP type (JSON decoded, int cast, etc.) before
	* calling this method. set_data() and read() apply those coercions upstream.
	*
	* @param string $column - Name of the column to set; must be in $columns_name.
	* @param array|int|string|object|null $value - The decoded value to store.
	* @return bool - true on success; false if the column is not a known property.
	*/
	public function set_column_data( string $column, array|int|string|object|null $value ) : bool {

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
	* Returns the full in-memory data object (the stdClass mirroring the DB row).
	* @return object $this->data
	*/
	public function get_data() : object {

		return $this->data;
	}//end get_data



	/**
	* GET_COLUMN_DATA
	* Returns the stored value for a single named column, or null if the column
	* was never set or the property does not exist on $data.
	* @param string $column - Name of the column to retrieve; must be in $columns_name.
	* @return object|null - Value stored in $this->data->$column, or null.
	*/
	public function get_column_data( string $column ) : ?object {

		return $this->data->$column ?? null;
	}//end get_column_data



	/**
	* SAVE_DATA
	* Persists the entire in-memory $data object to the `matrix_time_machine` row
	* identified by $this->id.
	*
	* Delegates to tm_db_manager::update(), which validates every column name
	* against its own allowlist and serialises JSONB columns automatically.
	* All nine columns in $data are included in the UPDATE SET list; callers that
	* only need to persist a subset should use save_column_data() instead.
	*
	* (!) The method does not re-fetch the row after saving. The in-memory $data
	* remains as-is, so subsequent get_data() calls return the last set values
	* rather than a fresh copy from the database.
	*
	* @return bool - true on success, or false if the id is missing, if
	*   tm_db_manager::update() rejects the payload, or if the SQL query fails.
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
	* Persists a named subset of in-memory columns to the `matrix_time_machine` row
	* identified by $this->id.
	*
	* Builds a minimal stdClass from the requested column names, reading each value
	* from $this->data (defaulting to null if a column was never set), then delegates
	* to tm_db_manager::update(). This is more efficient than save_data() when only
	* one or two columns change, since the UPDATE SET list is kept short.
	*
	* (!) Column names in the $columns array are not validated here; tm_db_manager::update()
	* performs the allowlist check and returns false for any unknown name.
	*
	* @param array<int,string> $columns - Column names to persist. Values are read from
	*   the current in-memory $data.
	* @return bool - true on success; false if tm_db_manager::update() rejects the payload
	*   or the SQL query fails.
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
	* Loads the `matrix_time_machine` row for $this->id from PostgreSQL into the
	* in-memory $data object, applying JSON decoding and integer casting as needed.
	*
	* Column processing rules (mirrors set_data logic):
	* - Columns absent from the DB row are silently skipped; $data retains its null.
	* - Null column values from the DB are also skipped; $data retains null rather
	*   than overwriting a previously set value with null.
	* - JSONB columns (tm_db_manager::$json_columns): value is decoded with json_decode().
	* - Integer columns (tm_db_manager::$int_columns): value is cast with (int).
	* - All other columns are stored as-is (plain string from pg_fetch_object).
	*
	* Cache behaviour:
	* - When $cache=true (default), the method returns immediately if $is_loaded_data
	*   is already set — no database round-trip occurs.
	* - When $cache=false, the SELECT always runs regardless of the flag state.
	*
	* (!) The method does NOT reset $data to null before reading. If read() is called
	* a second time with $cache=false, previously decoded values for columns that are
	* absent from the new DB row will persist unchanged in $data.
	*
	* @param bool $cache = true - When true, return in-memory $data if already loaded.
	*   Pass false to force a fresh query against the database.
	* @return object|null - The populated $data stdClass on success; null if the row
	*   does not exist in the database.
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
		$int_columns = tm_db_manager::$int_columns;

		// assign data_columns from database results
		foreach ($this->columns_name as $column) {

			if ( !isset($row->$column) ) {
				// Ignore non existing data_columns key
				continue;
			}

			if ( $row->$column!==null ) {
				if( isset($json_columns[$column]) ) {
					// JSON case
					$this->data->$column = json_decode($row->$column);
				} else if( isset($int_columns[$column]) ) {
					// int case
					$this->data->$column = (int)$row->$column;
				} else {
					$this->data->$column = $row->$column;
				}
			}
		}

		// Updates is_loaded_data
		$this->is_loaded_data = true;


		return $this->data;
	}//end read



	/**
	* DELETE
	* Removes the `matrix_time_machine` row identified by $this->id from PostgreSQL.
	*
	* Delegates to tm_db_manager::delete(), which executes a prepared DELETE WHERE id=$1.
	* The in-memory $data is not cleared after deletion; callers must discard (or destruct)
	* the instance themselves to avoid using a stale object.
	*
	* (!) Deletion is irreversible. There is no soft-delete or recycle-bin for
	* time-machine rows. The owning tm_record::delete() calls __destruct() after this
	* method to remove the instance from the static cache.
	*
	* @return bool - true on success; false if the SQL query preparation or execution fails.
	*/
	public function delete() : bool {

		$id = $this->id;

		return tm_db_manager::delete(
			$id
		);
	}//end delete



}//end class tm_record_data
