<?php declare(strict_types=1);
/**
* CLASS SECTION_RECORD_DATA
* Normalized in-memory data container that mirrors one row of a Dédalo matrix table.
*
* section_record_data sits at the heart of the persistence layer. Each instance holds
* the decoded JSONB columns for a single (section_tipo, section_id) record and exposes
* a keyed read/write API used by section_record and every component that needs to touch
* stored data.
*
* Responsibilities:
* - Maintain the canonical set of column names that map to PostgreSQL JSONB columns.
* - Track which columns still hold a raw JSON string (lazy decoding) vs. a decoded object.
* - Decode raw JSON on first access (ensure_decoded) to avoid unnecessary work when only
*   a subset of columns is touched during a request.
* - Provide column-level (set_column_data / get_column_data) and key-level
*   (set_key_data / get_key_data) access, where "key" is a component ontology tipo such
*   as 'dd25' or a reserved section property name.
* - Expose $column_map so callers can resolve which DB column a given component model
*   writes into.
*
* Data shape per column (after decoding):
* - 'data'    : stdClass  — section metadata (label, created_by_user_id, etc.)
* - 'relation': stdClass  — locators keyed by component tipo: {"dd20":[locator,...], ...}
* - 'string'  : stdClass  — string values keyed by component tipo
* - 'date'    : stdClass  — date objects keyed by component tipo
* - 'iri'     : stdClass  — IRI objects keyed by component tipo
* - 'geo'     : stdClass  — geolocation data keyed by component tipo
* - 'number'  : stdClass  — numeric values keyed by component tipo
* - 'media'   : stdClass  — media descriptors keyed by component tipo
* - 'misc'    : stdClass  — miscellaneous/direct objects keyed by component tipo
* - 'relation_search': stdClass — auxiliary relation data for hierarchical search
* - 'meta'    : stdClass  — per-component counters: {"dd750":[{"count":3}], ...}
*
* Lifecycle:
* Instances are created via get_instance() (factory) and owned by the corresponding
* section_record. They are not cached independently — section_record manages their
* lifetime. __destruct attempts to remove a now-unused entry from a static $instances
* map, but that map is not declared in this class (see FLAGS).
*
* Extended by: none (standalone data container; section_record holds an instance).
*
* @package Dédalo
* @subpackage Core
*/
class section_record_data {

	/**
	* Decoded column data for this section record.
	* Every key in this object corresponds to a column name listed in $columns_name.
	* Values start as null and are populated either by set_column_data (decoded object)
	* or lazily via ensure_decoded (raw JSON string promoted to object on first access).
	* @var stdClass $data
	*/
	private stdClass $data;

	/**
	* Raw JSON strings received from the database driver, keyed by column name.
	* A column is present here only while it is awaiting lazy decode.
	* Once ensure_decoded() runs, the entry is removed and the decoded value lives in $data.
	* @var array $raw_data
	*/
	private array $raw_data = [];

	/**
	* Per-column decode flag. true means the column value in $data is authoritative
	* (either null or a decoded object). false means a raw JSON string is waiting
	* in $raw_data and must be decoded before the column can be read.
	* Initialised to true for every column because null is already "decoded".
	* @var array $decoded
	*/
	private array $decoded = [];

	/**
	* Ordered list of column names that correspond to PostgreSQL JSONB columns in the
	* matrix table. This list is the single source of truth for which columns are valid;
	* set_column_data and set_data reject any key not present here.
	*
	* Column descriptions:
	* - 'data'            Section-level metadata (label, diffusion_info, created_by_user_id, etc.)
	* - 'relation'        Locators grouped by component tipo: {"dd20":[locators], "dd35":[locators]}
	* - 'string'          String literal values for component_input_text, component_text_area, etc.
	* - 'date'            Date values managed by component_date
	* - 'iri'             IRI objects for component_iri: {"dd85":{"title":"...", "uri":"..."}}
	* - 'geo'             Geolocation payloads for component_geolocation
	* - 'number'          Numeric values for component_number
	* - 'media'           Media descriptors for 3d, av, image, pdf, svg components
	* - 'misc'            Direct-object data for component_security_access, component_json, etc.
	* - 'relation_search' Auxiliary relation data for hierarchical/parent search (e.g. toponymy)
	* - 'meta'            Per-component id counters: {"dd750":[{"count":1}], "dd201":[{"count":1}]}
	* @var array $columns_name
	*/
	private array $columns_name = [
		// object|null data. Section data value from DB column 'data'
		// Section specific data like label, diffusion info, etc.
		'data',
		// object|null relation. Section data value from DB column 'relation'.
		// Stores the list of locators grouped by component tipo as {"dd20":[locators],"dd35":[locators]}
		'relation',
		// object|null string. Section data value from DB column 'string'
		// Stores string literals values used from component_input_text, component_text_area and others.
		'string',
		// object|null date. Section data value from DB column 'date'
		// Stores date values handled by component_date
		'date',
		// object|null iri. Section data value from DB column 'iri'
		// Stores IRI object values handled by component_iri as {"dd85":{"title":"My site URI","uri":"https://mysite.org"}}
		'iri',
		// object|null geo. Section data value from DB column 'geo'
		// Stores geo data handled by component_geolocation.
		'geo',
		// object|null number. Section data value from DB column 'number'
		// Stores numeric values handled by component_number.
		'number',
		// object|null media. Section data value from DB column 'media'
		// Stores media values handled by media components (3d,av,image,pdf,svg)
		'media',
		// object|null misc. Section data value from DB column 'misc'
		// Stores other components values like component_security_access, component_json, etc.
		'misc',
		// object|null relation_search. Section data value from DB column 'relation_search'
		// Stores relation optional data useful for search across parents like toponymy.
		'relation_search',
		// object|null meta. Section data value from DB column 'meta'
		// Stores string components meta used to get unique identifiers for the values as {"id":1,"lang":"lg-nolan","type":"dd750","value":"Hello"}
		// The format of the counter data is {"dd750":1,"dd201":1,..}
		'meta'
	];

	/**
	* Maps every known component model name to the DB column where it stores its data.
	* Used by callers (section_record, component_common) to determine the correct column
	* without hardcoding it in each component.
	*
	* Notes on 'misc' entries: components flagged "direct object" store a single stdClass
	* rather than a keyed locator array; the component itself knows how to read/write that shape.
	* 'component_section_id' uses the virtual 'section_id' key (not a JSONB column) — callers
	* must handle this case separately (it is the PostgreSQL integer primary key column).
	* 'section' itself is mapped to 'data' so section-level metadata can be routed here.
	* @var array $column_map
	*/
	public static array $column_map = [
		'component_3d'					=> 'media',
		'component_av'					=> 'media',
		'component_check_box'			=> 'relation',
		'component_autocomplete_hi'		=> 'relation',
		'component_dataframe'			=> 'relation',
		'component_date'				=> 'date',
		'component_email'				=> 'string',
		'component_external'			=> 'relation',
		'component_filter'				=> 'relation',
		'component_filter_master'		=> 'relation',
		'component_filter_records'		=> 'misc', // direct object
		'component_geolocation'			=> 'geo',
		'component_image'				=> 'media',
		'component_info'				=> 'misc', // direct object
		'component_input_text'			=> 'string',
		'component_inverse'				=> 'misc',  // direct object
		'component_iri'					=> 'iri',
		'component_json'				=> 'misc',
		'component_number'				=> 'number',
		'component_password'			=> 'string',
		'component_pdf'					=> 'media',
		'component_portal'				=> 'relation',
		'component_publication'			=> 'relation',
		'component_radio_button'		=> 'relation',
		'component_relation_children'	=> 'relation',
		'component_relation_index'		=> 'relation',
		'component_relation_model'		=> 'relation',
		'component_relation_parent'		=> 'relation',
		'component_relation_related'	=> 'relation',
		'component_section_id'			=> 'section_id',
		'component_security_access'		=> 'misc', // direct object
		'component_select'				=> 'relation',
		'component_select_lang'			=> 'relation',
		'component_svg'					=> 'media',
		'component_text_area'			=> 'string',
		'section'						=> 'data'
	];

	/**
	* Whether the column data has already been loaded from the database during this request.
	* Mirrors the same flag in section_record to allow section_record to check the data
	* container's load state independently of the parent record.
	* @var bool $is_loaded_data
	*/
	protected bool $is_loaded_data = false;

	/**
	* Ontology tipo of the section this container belongs to (e.g. 'oh1', 'dd128').
	* Set once in the constructor and used to build cache keys.
	* Declared readonly so it cannot be changed after construction.
	* @var string $section_tipo
	*/
	protected readonly string $section_tipo;

	/**
	* Numeric identifier of the section record this container belongs to.
	* Used together with $section_tipo as the composite primary key for the matrix table row.
	* Declared readonly so it cannot be changed after construction.
	* @var int $section_id
	*/
	protected readonly int $section_id;

	/**
	* Cumulative count of get_instance() calls across the entire request.
	* Useful for profiling how many data containers are instantiated per request.
	* @var int $section_record_data_total_calls
	*/
	public static int $section_record_data_total_calls = 0;



	/**
	* GET_INSTANCE
	* Factory method: allocates a new section_record_data for the given (section_tipo, section_id)
	* pair and increments the request-level call counter.
	*
	* Unlike section_record itself, section_record_data does not maintain its own instance cache
	* here — the owning section_record is responsible for reuse. Each call therefore returns a
	* fresh, empty container that section_record::__construct will populate by calling read().
	* @param string $section_tipo - ontology tipo of the section, e.g. 'oh1'
	* @param int $section_id - numeric record identifier, e.g. 1
	* @return self - new section_record_data instance
	*/
	public static function get_instance( string $section_tipo, int $section_id ) : self {

		// metrics
		self::$section_record_data_total_calls++;


		return new self($section_tipo, $section_id);
	}//end get_instance



	/**
	* __CONSTRUCT
	* Initializes the data container for a specific section record.
	*
	* Pre-populates $data with a null property for every known column and marks each
	* as decoded (null does not need JSON decoding), so that ensure_decoded() can safely
	* check the $decoded flag without array_key_exists guards.
	*
	* Private — callers must use get_instance().
	* @param string $section_tipo - ontology tipo of the section
	* @param int $section_id - numeric record identifier
	*/
	private function __construct( string $section_tipo, int $section_id ) {

		$this->section_tipo	= $section_tipo;
		$this->section_id	= $section_id;

		// Data columns
		$this->data = new stdClass();
		// Assign the valid columns. Every column has its own homonym column in database.
		foreach ($this->columns_name as $column_name) {
			$this->data->{$column_name} = null;
			$this->decoded[$column_name] = true; // null values are already "decoded"
		}
	}//end __construct



	/**
	* __DESTRUCT
	* Attempts to remove this instance from the static instance cache before garbage collection.
	*
	* (!) FLAG: self::$instances is referenced here but is not declared anywhere in this class.
	* The isset() guard prevents a fatal error at runtime, but the cache cleanup is silently a
	* no-op. If a shared instance cache is needed, $instances must be declared as a static
	* property of this class or the reference must be redirected to the appropriate registry.
	*/
	public function __destruct() {

		// Remove the instance from cache
		$cache_key = $this->section_tipo .'_' .$this->section_id;
		if (isset(self::$instances[$cache_key])) {
			unset( self::$instances[$cache_key] );
		}
	}//end __destruct



	/**
	* GET_COLUMNS_NAME
	* Returns the ordered list of valid DB column names for a matrix table row.
	* Used by section_record::read() to iterate only the columns it recognizes when
	* mapping raw DB row properties onto the data container.
	* @return array - ordered list of column name strings
	*/
	public function get_columns_name() : array {

		return $this->columns_name;
	}//end get_columns_name



	/**
	* GET_COLUMN_NAME
	* Resolves the PostgreSQL JSONB column name for the given component model.
	*
	* Consults the static $column_map registry. Returns null when the model is not
	* registered (e.g. an unknown or experimental component type). Callers must guard
	* against null before issuing a DB query.
	* @param string $model - component model class name, e.g. 'component_input_text'
	* @return string|null - DB column name such as 'string', 'relation', 'media', or null if unrecognized
	*/
	public static function get_column_name( string $model ) : ?string {

		return section_record_data::$column_map[$model] ?? null;
	}//end get_column_name



	/**
	* ENSURE_DECODED
	* Lazily decodes a raw JSON string stored for the given column and promotes it to
	* a fully-decoded object in $data. If the column is already decoded (flag is true,
	* including the initial null state), this is a no-op — the early return keeps the
	* hot path as cheap as a single array lookup.
	*
	* After decoding, the raw string is freed from $raw_data to release memory.
	* Called by every read accessor (get_column_data, get_key_data, get_data) and by
	* set_key_data before mutating a column that may still be in raw form.
	* @param string $column - a valid column name from $columns_name
	* @return void
	* @throws Exception - when json_decode fails (corrupted or non-JSON DB value)
	*/
	private function ensure_decoded( string $column ) : void {

		if ( ($this->decoded[$column] ?? true) === true ) {
			return;
		}

		$raw = $this->raw_data[$column];
		$value = json_decode( $raw );
		if ( json_last_error() !== JSON_ERROR_NONE ) {
			debug_log(__METHOD__
				. " Abort. JSON decode error for column " . PHP_EOL
				. "column: " . $column . PHP_EOL
				. "error: " . json_last_error_msg()
				, logger::ERROR
			);
			throw new Exception(
				"JSON decode error for column " . $column . ": " . json_last_error_msg()
			);
		}

		$this->data->$column	= $value;
		$this->decoded[$column]	= true;
		unset( $this->raw_data[$column] );
	}//end ensure_decoded



	/**
	* SET_DATA
	* Bulk-assigns column values from a full section row object, typically the result of
	* section_record::read() or an import operation.
	*
	* Only columns whose names appear in $columns_name are accepted; unexpected keys are
	* silently ignored so that callers can pass the raw DB row without filtering it first.
	* Each valid column is forwarded to set_column_data, which applies the lazy-decode
	* strategy: raw JSON strings are stored in $raw_data, while decoded objects and null
	* values are stored directly in $data.
	* @param object $data - object whose properties are column name → value pairs
	* @return bool - always true (unknown columns are skipped, not reported as errors)
	*/
	public function set_data( object $data ) : bool {

		foreach ($data as $column => $value ) {

			if ( !in_array($column, $this->columns_name) ) {
				continue;
			}

			// Delegate to set_column_data which handles raw strings (lazy)
			// and already-decoded objects transparently.
			$this->set_column_data( $column, $value );
		}

		return true;
	}//end set_data



	/**
	* SET_COLUMN_DATA
	* Assigns a value to one named column, applying the lazy-decode strategy.
	*
	* Two input shapes are accepted:
	* - string  : assumed to be a raw JSON string from the DB driver. It is parked in
	*             $raw_data and decode is deferred until the first read access. A null
	*             placeholder is placed in $data so that isset() checks remain consistent.
	* - object|null : already decoded by the caller (or intentionally null to clear the
	*             column). Stored directly in $data; any pending raw entry is discarded.
	*
	* Returns false and logs an error when $column is not in the known column set,
	* protecting against accidental writes to non-existent DB columns.
	* @param string $column - target column name, must exist in $columns_name
	* @param string|object|null $value - raw JSON string, decoded object, or null to clear
	* @return bool - false if the column name is unrecognized
	*/
	public function set_column_data( string $column, string|object|null $value ) : bool {

		if ( !property_exists($this->data, $column) ) {
			debug_log(__METHOD__
				. " Abort. Invalid column " . PHP_EOL
				. "column: " . $column
				, logger::ERROR
			);
			return false;
		}

		if ( is_string($value) ) {
			// Store raw JSON string for lazy decode
			$this->raw_data[$column]	= $value;
			$this->decoded[$column]		= false;
			$this->data->$column		= null; // placeholder until decoded
		}else{
			// Object or null: store directly as decoded
			$this->data->$column		= $value;
			$this->decoded[$column]		= true;
			unset( $this->raw_data[$column] );
		}

		return true;
	}//end set_column_data



	/**
	* SET_KEY_DATA
	* Writes (or removes) the data array for a single component within one column object.
	*
	* "Key" is a component ontology tipo such as 'oh25' or a reserved property name like
	* 'created_by_user'. The call forces a lazy decode of the target column before mutating
	* it, ensuring the raw JSON is not silently overwritten.
	*
	* Passing null for $data removes the key from the column object entirely — this is how
	* a component's data is cleared without nulling the entire column, which would erase
	* sibling components' data stored in the same JSONB object.
	*
	* If the column object does not yet exist (first write to an empty column), a new
	* stdClass is created automatically before the key is set.
	* @param string $column - target column name, e.g. 'relation', 'string', 'meta'
	* @param string $key - component tipo or reserved property, e.g. 'oh25', 'dd199'
	* @param array|null $data - data to store, or null to delete the key
	* @return bool - false if the column name is unrecognized
	*/
	public function set_key_data( string $column, string $key, ?array $data ) : bool {

		if ( !property_exists($this->data, $column) ) {
			debug_log(__METHOD__
				. " Abort. Invalid column " . PHP_EOL
				. "column: " . $column
				, logger::ERROR
			);
			return false;
		}

		// Force decode before mutation
		$this->ensure_decoded( $column );

		// remove the data of the key when data is set as null
		if( $data===null ){
			if ( isset($this->data->$column->$key) ){
				unset( $this->data->$column->$key );
			}
			return true;
		}

		// if the data column is empty, create a new object
		if (!$this->data->$column) {
			$this->data->$column = new stdClass();
		}

		// Set or change the data of the given key
		$this->data->$column->$key = $data;


		return true;
	}//end set_key_data



	/**
	* GET_DATA
	* Returns the complete, fully-decoded data object for this section record.
	*
	* Iterates all columns and forces lazy decode of any that are still stored as raw
	* JSON strings. This is the "materialize everything" path, used when the full row
	* is needed — e.g. before serializing for a Time Machine snapshot or a full save.
	* For accessing a single column, prefer get_column_data() to avoid unnecessary decoding.
	* @return object - stdClass with one property per valid column name; unknown columns are absent
	*/
	public function get_data() : object {

		// Materialize all pending lazy columns
		foreach ($this->columns_name as $column) {
			$this->ensure_decoded( $column );
		}

		return $this->data;
	}//end get_data



	/**
	* GET_COLUMN_DATA
	* Returns the decoded object for a single column, triggering lazy decode if needed.
	*
	* Preferred over get_data() when only one column is needed, because it avoids
	* decoding all other columns. Returns null when the column has no data (both the
	* "column exists but is null" case and the "column property absent" case collapse
	* to null via the null-coalescing operator).
	* @param string $column - column name, e.g. 'relation', 'string'
	* @return object|null - decoded column object, or null if the column is empty
	*/
	public function get_column_data( string $column ) : ?object {

		$this->ensure_decoded( $column );

		return $this->data->$column ?? null;
	}//end get_column_data



	/**
	* GET_KEY_DATA
	* Returns the data array stored for a specific component tipo (key) within a column.
	*
	* This is the primary read path used by section_record::get_component_data() and by
	* section_record::get_component_counter(). Triggers lazy decode of the column if the
	* raw JSON string has not yet been processed.
	*
	* Returns null both when the column is empty and when the key does not exist inside
	* the column object, so callers must treat null as "no data" rather than "error".
	* @param string $column - column name, e.g. 'relation', 'meta'
	* @param string $key - component tipo or reserved property name, e.g. 'oh25', 'dd199'
	* @return array|null - the array of data items for that component, or null if absent
	*/
	public function get_key_data( string $column, string $key ) : ?array {

		$this->ensure_decoded( $column );

		return $this->data->$column->$key ?? null;
	}//end get_key_data



}//end class section_record_data
