<?php declare(strict_types=1);
/**
* CLASS SECTION_RECORD
* PHP-space representation of a single row in a Dédalo "matrix" PostgreSQL table.
*
* Each Dédalo database row stores all component values for one record as JSONB columns
* (relation, string, date, iri, geo, number, media, misc, relation_search, meta, data).
* section_record is the authoritative gateway for reading and writing those rows:
* it owns the life-cycle of a record from creation through duplication and deletion,
* coordinates the per-record advisory locks used for atomic counter allocation, and
* dispatches cache-invalidation events after every persistent write.
*
* Key responsibilities:
* - Identity: holds section_tipo (ontology tipo, e.g. "oh1") + section_id (int PK).
* - Data delegation: all column-level reads/writes go through a shared
*   section_record_data instance (one per {section_tipo, section_id} pair).
* - Handler selection: chooses matrix_db_manager for normal tables or
*   matrix_activity_db_manager for the activity log table (matrix_activity).
* - Counter management: per-component item-id counters are stored in the 'meta'
*   JSONB column and allocated atomically via pg_advisory_lock to prevent id reuse
*   across concurrent requests editing the same record.
* - Audit metadata: every create/update automatically stamps the 'created_by_user'
*   (dd200), 'created_date' (dd199), 'modified_by_user' (dd197) and
*   'modified_date' (dd201) relation/date columns.
* - Delete pipeline: TM snapshot → DB row delete → inverse-reference cleanup →
*   media file removal → diffusion target unpublish.
* - Instance cache: get_instance() returns a per-request singleton keyed on
*   "{section_tipo}_{section_id}[_temp]" via section_record_instances_cache.
*
* Extended by:
* - section_record_temp — temporary / time-machine record variant.
*
* Collaborates with:
* - section_record_data — shared JSONB column container (lazy decode).
* - matrix_db_manager / matrix_activity_db_manager — DB read/write/delete.
* - tm_record — Time Machine snapshot on delete.
* - diffusion_delete — diffusion-target cleanup on delete.
* - search_related — inverse-reference discovery.
* - section — the only allowed caller of section_record::create().
*
* @package Dédalo
* @subpackage Core
*/
class section_record {



	/**
	* CLASS VARS
	*/

	/**
	* Ontology tipo of the section this record belongs to (e.g. "oh1", "dd128").
	* Set once in __construct and never mutated.
	* @var string $section_tipo
	*/
 	public string $section_tipo;

	/**
	* Primary key of this row within the section's matrix table.
	* Type is string|int for legacy compatibility; __construct always receives int.
	* get_instance() will cast string values to int and log a deprecation warning.
	* @var string|int $section_id
	*/
 	public string|int $section_id;

	/**
	* Shared data container for all JSONB columns of this row.
	* One section_record_data instance is shared by all section_record instances
	* (normal + temp) that refer to the same {section_tipo, section_id} pair,
	* so writes made through one instance are immediately visible through another.
	* @var object $data_instance
	*/
	protected object $data_instance;

	/**
	* Whether this record exists as a row in the database.
	* Set by load_data() after the first read(); remains unset until then.
	* Check via exists_in_the_database() rather than reading the property directly.
	* @var bool $record_in_the_database
	*/
	public bool $record_in_the_database;

	/**
	* Guard flag: true once load_data() has performed at least one DB read for
	* this instance.  Prevents redundant queries within the same PHP request.
	* Reset to false after delete() so subsequent access correctly sees the record
	* as gone.
	* @var bool $is_loaded_data
	*/
	protected bool $is_loaded_data = false;

	/**
	* Resolved permission level for the current user on this record.
	* Computed lazily by get_permissions() and cached here for the request.
	* Numeric level: 0 = no access, 1 = read-only, 2 = read-write.
	* @var int $permissions
	*/
	protected int $permissions;

	/**
	* Class name of the DB manager used for all CRUD operations on this record.
	* Defaults to 'matrix_db_manager'; overridden to 'matrix_activity_db_manager'
	* when the resolved table is 'matrix_activity' (activity-log section dd542).
	* @var string $data_handler
	*/
	public string $data_handler = 'matrix_db_manager';

	/**
	* PostgreSQL table name resolved from the section tipo via
	* common::get_matrix_table_from_tipo(). Immutable after construction.
	* Falls back to 'invalid_table' if the tipo has no registered table mapping,
	* which will cause any DB operation to fail with a clear error rather than
	* silently querying the wrong table.
	* @var string $table
	*/
	private readonly string $table;

	/**
	* Running total of section_record instances constructed during the current
	* PHP process lifetime.  Useful for profiling instance churn.
	* @var int $section_record_total
	*/
	public static int $section_record_total = 0;

	/**
	* Running total of get_instance() calls (cache hits + misses) during the
	* current PHP process lifetime.  Divide by $section_record_total to gauge
	* the instance-cache hit rate.
	* @var int $section_record_total_calls
	*/
	public static int $section_record_total_calls = 0;



	/**
	* GET_INSTANCE
	* Returns the per-request singleton for a given {section_tipo, section_id} pair.
	*
	* Cache key is "{section_tipo}_{section_id}" or "{section_tipo}_{section_id}_temp"
	* for temporal variants.  On a miss a new instance is constructed and stored in
	* section_record_instances_cache so subsequent callers within the same request share
	* the same in-memory data (edits are immediately visible to all holders).
	*
	* $is_temporal=true creates a section_record_temp instance instead; this variant is
	* used by the Time Machine to load snapshot data without touching the live row.
	*
	* Passing $section_id as a string is deprecated: it is silently cast to int and an
	* ERROR is logged to help callers migrate.
	*
	* @param string $section_tipo - ontology tipo of the section (e.g. "oh1")
	* @param int|string $section_id - record PK; string form is deprecated and cast to int
	* @param bool $is_temporal [= false] - true to get/create a section_record_temp instance
	* @return section_record - shared singleton; may be a section_record_temp subclass
	*/
	public static function get_instance( string $section_tipo, int|string $section_id, bool $is_temporal = false ) : section_record {

		// debug
		if(is_string($section_id)) {
			$section_id = (int)$section_id;
			debug_log(__METHOD__
			   ." WARNING! send section_id as string is DEPRECATED. Changed section_id type from string to int"
			   , logger::ERROR
			);
		}

		// metrics
		self::$section_record_total_calls++;

		$cache_key = $section_tipo .'_' .$section_id . ($is_temporal ? '_temp' : '');

		$instance = section_record_instances_cache::get($cache_key);
		if ($instance === null) {

			if ($is_temporal) {
				$instance = new section_record_temp($section_tipo, $section_id);
			} else {
				$instance = new section_record($section_tipo, $section_id);
			}
			section_record_instances_cache::set($cache_key, $instance);
		}

		return $instance;
	}//end get_instance



	/**
	* __CONSTRUCT
	* Initialises a new section_record instance for the given record identity.
	*
	* Not called directly by application code — use get_instance() or create() instead.
	* Constructor is protected so that only get_instance() and subclasses can build
	* instances, enforcing the per-request singleton contract.
	*
	* Steps performed:
	* 1. Stores section_tipo and section_id as identity properties.
	* 2. Acquires (or reuses) the shared section_record_data instance for this pair.
	* 3. Resolves the PostgreSQL table name; falls back to 'invalid_table' on failure.
	* 4. Selects the DB handler class (matrix_activity_db_manager for dd542 activity
	*    records, matrix_db_manager for everything else).
	* 5. Increments the static instance counter used for profiling.
	*
	* @param string $section_tipo - ontology tipo (e.g. "oh1")
	* @param int $section_id - record primary key
	* @return void
	*/
	protected function __construct( string $section_tipo, int $section_id ) {

		// Set general vars
			$this->section_tipo	= $section_tipo;
			$this->section_id	= $section_id;

		// Initiate section_record_data instance.
			// It's instanced once and handles all the section data database tasks.
			$this->data_instance = section_record_data::get_instance(
				$this->section_tipo,
				$section_id
			);

		// set table
			$this->table = common::get_matrix_table_from_tipo($this->section_tipo) ?? 'invalid_table';

		// set default data handler
			$this->data_handler = $this->table === 'matrix_activity'
				? 'matrix_activity_db_manager'
				: 'matrix_db_manager';

		// metrics
		self::$section_record_total++;
	}//end __construct



	/**
	* __DESTRUCT
	* Evicts this instance from the per-request singleton cache and releases the data container.
	*
	* Called automatically by PHP when the last reference to this object is dropped.
	* Removing the entry from section_record_instances_cache ensures that the next
	* get_instance() call for the same key constructs a fresh instance rather than
	* returning a destroyed one.
	*
	* (!) Note: the cache key does not include the "_temp" suffix, so a normal and a
	* temporal instance for the same record share a cache slot.  Destroying one will
	* evict the other's slot.
	*
	* @return void
	*/
	public function __destruct() {

		// Clear the instance from the cache
		$cache_key = $this->section_tipo .'_' .$this->section_id;
		section_record_instances_cache::delete($cache_key);

		// Clear the instance data
		unset($this->data_instance);
	}//end __destruct



	/**
	* SAVE_EVENT
	* Invalidates caches that depend on the content of this section after any
	* persistent write (save, save_column, save_key_data, delete, etc.).
	*
	* Each special section tipo has a dedicated invalidation path:
	* - dd1244 (request-config presets): clean_cache() resets both the on-disk
	*   cache file and the in-request static so the current request immediately
	*   sees the new list.
	* - dd1324 (registered tools), dd996 (tools configuration), dd234 (profiles):
	*   tools_register::invalidate_all_tool_caches() flushes in-memory statics,
	*   shared file caches, and per-user tool resolution caches across all sessions.
	*
	* All other section tipos are silently ignored (default: no-op).
	* Called internally at the end of every write method; callers must not call it
	* themselves.
	*
	* @return void
	*/
	protected function save_event() : void {

		// Invalidate cache files
		switch ($this->section_tipo) {
			case DEDALO_REQUEST_CONFIG_PRESETS_SECTION_TIPO : // dd1244
				// Invalidate request config presets cache.
				// Goes through clean_cache() (not a raw delete_cache_files) so the
				// in-request static is reset too — otherwise a save within the same
				// request keeps serving the stale pre-save list from memory.
				// This only affects current user cache (file is user-prefixed).
				request_config_presets::clean_cache();
				break;

			case DEDALO_REGISTER_TOOLS_SECTION_TIPO : // dd1324
			case DEDALO_TOOLS_CONFIGURATION_SECTION_TIPO : // dd996
			case DEDALO_SECTION_PROFILES_TIPO : // dd234. Profile edits change per-user tool authorization (dd1067)
				// This affects all users cache.
				// Invalidate tools config cache file. E.g. 'cache_tools_config_list_dd996.php'
				$cache_file_name = tools_register::get_config_list_cache_name(DEDALO_TOOLS_CONFIGURATION_SECTION_TIPO);
				dd_cache::delete_cache_files(
					[$cache_file_name],
					''
				);
				// Also invalidate per-user tool resolution caches (tool_config changed)
				tools_register::clean_cache();
				break;

			case DEDALO_ONTOLOGY_SECTION_TIPO : // ontology35
				// Invalidate shared diffusion data cache used by diffusion_utils.
				// Diffusion-derived data (map, virtual tree, section map) changes
				// whenever the ontology is modified
				$cache_file_name = diffusion_utils::get_diffusion_cache_file_name();
				dd_cache::delete_cache_files(
					[$cache_file_name],
					''
				);
				// Also clear in-memory static caches so the current request
				// does not continue using stale data
				diffusion_utils::clear();
				break;

			default:
				// Nothing to do here
				break;
		}


	}//end save_event



	/**
	* LOAD_DATA
	* Triggers a DB read the first time it is called for this instance, then becomes
	* a no-op for the lifetime of the request (guarded by $is_loaded_data).
	*
	* Delegates the actual query to read(), which populates the shared data_instance
	* with the decoded JSONB column values.  After the read, $record_in_the_database
	* is set: false when no row was found, true otherwise.
	*
	* To force a fresh DB read within the same request, set $this->is_loaded_data = false
	* before calling this method (or call read(false) directly).
	*
	* (!) The doc-block comment "set the property this->is_loaded_data_columns to false"
	* is stale — the actual property is $is_loaded_data (no "_columns" suffix).
	*
	* @return bool - always true (errors are handled inside read())
	*/
	protected function load_data() : bool {

		// If the section_record_data instance has already been loaded,
		// it returns the cached data without reconnecting to the database.
		// All section instances with the same section_tipo and section_id values
		// share the same cached instance of 'section_record_data', independent of the mode.
		$result = $this->read();

		// when load data and the record doesn't exists set the property 'exists' in the instance' to false
		// if the record exists into the database set it as true.
		$this->record_in_the_database = ( $result===null )
			? false
			: true;

		return true;
	}//end load_data



	/**
	* EXISTS_IN_THE_DATABASE
	* Returns true when a DB row for this {section_tipo, section_id} pair exists.
	*
	* Uses the cached $record_in_the_database flag when it has already been resolved
	* (i.e., after any previous load_data() or read() call).  Otherwise triggers a
	* DB read via load_data() to resolve it.
	*
	* @return bool - true if the record exists in the database, false otherwise
	*/
	public function exists_in_the_database() : bool {

		if( isset($this->record_in_the_database) ){
			return $this->record_in_the_database;
		}

		// force to load all data from database
		$this->load_data();

		return $this->record_in_the_database;
	}//end exists_in_the_database



	/**
	* GET_DATA
	* Returns the full decoded data object for this record, triggering a DB read if
	* the data has not yet been loaded.
	*
	* The returned object has one property per DB column (relation, string, date, iri,
	* geo, number, media, misc, relation_search, meta, data).  Each column property is
	* itself an object keyed by component tipo, or null when the column is empty.
	*
	* The returned object is the live data_instance reference — mutations to it
	* affect the in-memory state of this record and will be persisted on the next
	* save()/save_column()/save_key_data() call.
	*
	* @return object - full record data; never null (may have all-null columns)
	*/
	public function get_data() : object {

		// force to load all data from database
		$this->load_data();

		// get all data columns
		$data = $this->data_instance->get_data();

		return $data;
	}//end get_data



	/**
	* SET_DATA
	* Replaces the entire in-memory data object in the shared data_instance.
	*
	* $data must have the same column structure returned by get_data() (properties
	* keyed by column name).  This does NOT persist to the database; call save()
	* afterwards to flush all columns.
	*
	* Used primarily by the import pipeline and Time Machine restore, which build
	* complete data objects and push them in one call.
	*
	* @param object $data - full record data object (same shape as get_data() return)
	* @return bool - true on success
	*/
	public function set_data( object $data ) : bool {

		$result = $this->data_instance->set_data( $data );

		return $result;
	}//end set_data



	/**
	* GET_COMPONENT_DATA
	* Returns the raw data array for a single component within a specific DB column.
	*
	* Triggers a DB read on the first call (via load_data()).  Returns all language
	* values as stored in the JSONB column — no language filtering is applied here.
	*
	* Example: get_component_data('oh25', 'relation') returns the array of locators
	* stored under key 'oh25' inside the 'relation' JSONB column.
	*
	* @param string $tipo - component ontology tipo (e.g. "oh25")
	* @param string $column - DB column name (e.g. "relation", "string", "date")
	* @return array|null - component value array, or null if the key does not exist
	*/
	public function get_component_data( string $tipo, string $column ) : ?array {

		// Load the DB data once
		$this->load_data();

		$component_data = $this->data_instance->get_key_data( $column, $tipo );

		return $component_data;
	}//end get_component_data



	/**
	* SET_COMPONENT_DATA
	* Writes a component's value array into the specified JSONB column in the
	* in-memory data_instance.
	*
	* Does NOT persist to the database; call save_component_data() or save_key_data()
	* afterwards.  Passing null for $data removes the component key from the column.
	*
	* The @return doc-block description ("Array of matching elements") is stale and
	* does not match the actual return value.
	*
	* @param string $tipo - component ontology tipo (e.g. "oh25")
	* @param string $column - DB column name (e.g. "relation", "string")
	* @param array|null $data - new value array for the component, or null to clear
	* @return bool - true on success
	*/
	public function set_component_data( string $tipo, string $column, ?array $data ) : bool {

		$result = $this->data_instance->set_key_data( $column, $tipo, $data );

		return $result;
	}//end set_component_data



	/**
	* SET_COLUMN_DATA
	* Replaces the entire content of one JSONB column in the in-memory data_instance.
	*
	* Unlike set_component_data() which targets a single component key within a column,
	* this method overwrites the full column object.  Used internally by read() to
	* inject raw JSON strings into the data container (lazy decode), and by create()
	* when writing section-level metadata (the 'data' column).
	*
	* Does NOT persist to the database; call save_column() afterwards if needed.
	*
	* The @return description ("Array of matching elements") is stale and does not
	* match the actual return value.
	*
	* @param string $column - DB column name (e.g. "data", "relation")
	* @param object|null $data - full column value object, or null to clear the column
	* @return bool - true on success
	*/
	public function set_column_data( string $column, ?object $data ) : bool {

		$result = $this->data_instance->set_column_data( $column, $data );

		return $result;
	}//end set_column_data



	/**
	* SAVE
	* Persists all in-memory JSONB columns to the database in a single UPDATE statement.
	*
	* Writes every column returned by data_instance->get_data(), including nulls.
	* A null column value causes the DB to clear that column (JSON null or omitted key
	* depending on the handler implementation).  No partial-column optimisation is
	* applied here — use save_column() or save_key_data() when only a subset of columns
	* has changed.
	*
	* After the DB write, save_event() is called to invalidate dependent caches.
	*
	* (!) The commented-out line "$result = $this->data_instance->save_data();" is
	* dead code left from an earlier refactor where saving was delegated to the data
	* instance; it is now handled here via the data_handler.
	*
	* @return bool - true on success, false on DB error
	*/
	public function save() : bool {

		// $result = $this->data_instance->save_data();

		$section_tipo = $this->section_tipo;
		$section_id = $this->section_id;

		// data_instance
		$table = $this->get_table();
		$data = $this->data_instance->get_data();

		$result = $this->data_handler::update(
			$table,
			$section_tipo,
			$section_id,
			$data
		);

		// save event
		$this->save_event();

		return $result;
	}//end save



	/**
	* SAVE_COLUMN
	* Persists a single JSONB column to the database, replacing its entire contents.
	*
	* First updates the in-memory data_instance via set_column_data(), then issues
	* a targeted UPDATE that touches only the specified column.  More efficient than
	* save() when only one column has changed (avoids re-serialising unchanged columns).
	*
	* $value may be:
	* - A full column object e.g. (object)['dd25' => [...], 'dd26' => [...]] for
	*   component-keyed columns (relation, string, date, etc.).
	* - null to clear the entire column.
	* - A section-level metadata object for the 'data' column.
	*
	* After the DB write, save_event() is called to invalidate dependent caches.
	*
	* (!) The commented-out line "$result = $this->data_instance->save_column_data(…)"
	* is dead code from an earlier refactor.
	*
	* @param string $column - DB column name (e.g. "relation", "data")
	* @param ?object $value - new column value object, or null to clear
	* @return bool - true on success, false on DB error
	*/
	public function save_column( string $column, ?object $value ) : bool {

		// 1 - update data_instance value
		$this->data_instance->set_column_data( $column, $value );

		// 2 - save to database the column
		// $result = $this->data_instance->save_column_data( [$column] );

		$section_tipo = $this->section_tipo;
		$section_id	 = $this->section_id;

		// data_instance
		$table = $this->get_table();
		$values = new stdClass();
			$values->$column = $this->data_instance->get_column_data($column) ?? null;

		$result = $this->data_handler::update(
			$table,
			$section_tipo,
			$section_id,
			$values
		);

		// save event
		$this->save_event();

		return $result;
	}//end save_column



	/**
	* SAVE_KEY_DATA
	* Atomically updates one or more component keys inside their respective JSONB
	* columns using the data_handler's update_by_key() path (jsonb_set).
	*
	* This is the preferred persistence path for component saves because it writes
	* only the changed keys within each column rather than replacing the full column
	* object, reducing write amplification on large records.
	*
	* Pre-save housekeeping:
	* - For each path item, the current value is read from data_instance.
	* - If a component's value is null AND the entire column is also null, the column
	*   is added to $columns_to_delete and removed with a whole-column NULL write
	*   before the key-level update runs (keeps the DB free of empty column objects).
	* - Any key belonging to a deleted column is removed from $data_to_save to avoid
	*   a redundant write attempt.
	*
	* $save_path item shape (from data_instance, not the caller):
	* {
	*   "column": "relation",  // DB column name
	*   "key":    "oh25"       // component tipo; the value is read from data_instance
	* }
	*
	* This method does NOT call save_event() — the caller (save_component_data,
	* update_modified_section_data) is responsible for that.
	*
	* @param array $save_path - array of (object){column, key} descriptors
	* @return bool - true on success, false on any DB error
	*/
	public function save_key_data( array $save_path ) : bool {
		if(SHOW_DEBUG) $start_time = start_time();

		$section_tipo	= $this->section_tipo;
		$section_id		= $this->section_id;

		// data_instance
		$table = $this->get_table();

		// check for empty columns. If any column is empty,
		// remove it from the database for maintaining clean DB data
		$columns_to_delete = [];

		// data to save e.g. format:
		// [{
		// 	"column" 	: "relation",
		// 	"key"		: "oh25",
		// 	"value"		: [{"section_id":3,"section_tipo":"oh1"}]
		// }]
		$data_to_save = [];
		foreach ($save_path as $path_item) {

			$column	= $path_item->column;
			$key	= $path_item->key;

			$current_data_to_save = new stdClass();
				$current_data_to_save->column = $column;
				$current_data_to_save->key = $key;
				// assign the value for this column and key (as data for one component in different columns)
				$current_data_to_save->value = $this->data_instance->get_key_data($column, $key);

			// check null values
			if( $current_data_to_save->value===null ){
				// check if the column is null
				$table_data_is_null = $this->data_instance->get_column_data($column);
				// if the column is null, remove all
				if( $table_data_is_null===null ){
					$columns_to_delete[] = $column;
				}
			}
			$data_to_save[] = $current_data_to_save;
		}
		// Remove the empty columns, remove all column data
		if( !empty($columns_to_delete) ){

			// $this->save_column_data( $columns_to_delete );
			$values = new stdClass();
			foreach ($columns_to_delete as $current_column) {
				$values->$current_column = null;
			}
			$save_result = $this->data_handler::update(
				$table,
				$section_tipo,
				$section_id,
				$values
			);
			if( $save_result === false ){
				debug_log(__METHOD__
				   . ' Failed to save empty columns' . PHP_EOL
				   . ' columns_to_delete: ' . json_encode($columns_to_delete, JSON_PRETTY_PRINT)
				   , logger::ERROR
				);
			}else{
				debug_log(__METHOD__
				   . ' Saved empty columns' . PHP_EOL
				   . ' columns_to_delete: ' . json_encode($columns_to_delete, JSON_PRETTY_PRINT) . PHP_EOL
				   . ' data_to_save: ' . json_encode($data_to_save, JSON_PRETTY_PRINT)
				   , logger::WARNING
				);
				// Remove columns that will be deleted and don't need to be update
				foreach ($data_to_save as $key => $data) {
					if( in_array($data->column, $columns_to_delete) ){
						unset($data_to_save[$key]);
					}
				}
			}
		}

		// if no data to save, return true
		// this can happen if all columns are null
		if( empty($data_to_save) ){
			return true;
		}

		// remove possible index generated by unset
		$data_to_save = array_values($data_to_save);

		// debug
		if(SHOW_DEBUG) {
			debug_log(__METHOD__
				. ' Saving component data' . PHP_EOL
				. ' data_to_save: ' . json_encode($data_to_save, JSON_PRETTY_PRINT)
				, logger::WARNING
			);
		}

		$result = $this->data_handler::update_by_key(
			$table,
			$section_tipo,
			$section_id,
			$data_to_save
		);

		// debug
		if(SHOW_DEBUG) {
			// metrics (per-component JSONB persist path)
			$save_ms = exec_time_unit($start_time,'ms');
			metrics::inc('section_record_save_total_calls');
			metrics::add_time_ms('section_record_save_total_time', $save_ms);
			metrics::observe_max('section_record_save_max_time', $save_ms); // slowest single save
			debug_log(__METHOD__
				. ' Saved component data' . PHP_EOL
				. ' result: ' . json_encode($result, JSON_PRETTY_PRINT) . PHP_EOL
				. ' time: ' . $save_ms .' ms'
				, logger::WARNING
			);
		}

		return $result;
	}//end save_key_data



	/**
	* SAVE_COMPONENT_DATA
	* Persists component data together with audit metadata in a single DB call.
	*
	* This is the standard entry point called by component_common::save() for normal
	* component saves.  It merges the caller-supplied $save_path (the component's own
	* column/key pairs) with the audit metadata path (modified_by_user dd197,
	* modified_date dd201) computed by get_modified_section_save_path(), then
	* delegates to save_key_data() for the actual DB write.
	*
	* By merging both paths before calling save_key_data(), all changes land in a
	* single jsonb_set UPDATE rather than two separate round-trips.
	*
	* After the DB write, save_event() is called to invalidate dependent caches.
	*
	* $save_path item shape (same as save_key_data):
	* { "key": "test52", "column": "string" }
	*
	* @param array $save_path - array of (object){column, key} component path items
	* @return bool - true on success, false on DB error
	*/
	public function save_component_data( array $save_path ) : bool {

		// Compute section metadata save_path items (sets data_instance, returns path)
		$section_metadata_path = $this->get_modified_section_save_path('update_record');

		// Merge component data + metadata into single save_path
		$merged_path = array_merge($save_path, $section_metadata_path);

		// Single DB update
		$result = $this->save_key_data($merged_path);
		if( $result === false ){
			return false;
		}

		// save event
		$this->save_event();

		return true;
	}//end save_component_data



	/**
	* DELETE
	* Permanently removes this record from the database following a strict five-step
	* pipeline designed to keep the system consistent across all subsystems.
	*
	* Pipeline:
	* 1. Time Machine snapshot — the full record data is serialized into a tm_record
	*    (matrix_time_machine row).  The saved snapshot is immediately re-read and
	*    compared byte-for-byte with the original; a mismatch aborts the delete with
	*    an error so the record is never lost without a verified backup.
	* 2. DB row delete — the matrix table row is deleted via the appropriate handler.
	* 3. Inverse reference cleanup — all components in other sections that hold a
	*    locator pointing to this record are found via search_related and the
	*    locators are removed.  Media files associated with this record are then
	*    renamed/moved to the "deleted" folder (not permanently erased).
	* 4. Diffusion unpublish — diffusion_delete::delete_record() requests removal of
	*    the corresponding published rows from SQL/RDF diffusion targets.  Failures
	*    are caught and logged as warnings; they are retried asynchronously later and
	*    must not block the work-system delete.
	* 5. Instance cleanup — the shared data_instance is released, $is_loaded_data is
	*    reset, $record_in_the_database is set to false, and the singleton cache slot
	*    is evicted so the next get_instance() call creates a fresh instance.
	*
	* Guard: section_id < 1 is rejected immediately (prevents accidental bulk deletes
	* when a missing ID silently evaluates to 0).
	*
	* $delete_diffusion_records=false skips step 4.  Used during bulk-delete sequences
	* that batch-handle diffusion cleanup separately.
	*
	* @param bool $delete_diffusion_records [= true] - false to skip diffusion cleanup
	* @return bool - true when the full pipeline completed successfully
	* @throws Exception if the Time Machine snapshot cannot be verified (step 1 failure)
	*/
	public function delete( bool $delete_diffusion_records=true ) : bool {

		// section_tipo
			$section_tipo = $this->section_tipo;

		// section_id
			$section_id = $this->section_id;

		// Check section_id
			// prevent delete <1 records
			if($section_id<1) {
				debug_log(__METHOD__
					." Invalid section_id: $section_id. Delete action is aborted "
					, logger::WARNING
				);
				return false;
			}

		// 1. Time Machine
			// create a new time machine record. Always, even when the section has recovered previously, a new time machine record is created
			// to mark every section delete point in the time. For tool list, only the last record (state 'deleted') will be used.

				// Get the section record data to be storage into Time Machine
				$data = $this->get_data();

				// time machine data.
				$tm_value = new stdClass();
					$tm_value->data				= $data;
					$tm_value->lang				= DEDALO_DATA_NOLAN;
					$tm_value->tipo				= $section_tipo;
					$tm_value->section_tipo		= $section_tipo;
					$tm_value->section_id		= $section_id;

				// Save the time machine record
				$tm_record = tm_record::create( $tm_value );
				if ($tm_record === false) {
					debug_log(__METHOD__
					   .' Error saving Time Machine data for'
					   .' tm_value: ' . to_string($tm_value)
					   , logger::ERROR
					);
					throw new Exception("Error Processing Request. id_time_machine is empty", 1);
				}
				$id = $tm_record->id ?? null;

				// destruct
				// Unload the tm record and tm record data.
				// It force to load the record saved previously from DB.
				unset($tm_record);

				// get the saved tm data and compare it with the new data. If they are equal, then save them to time machine else throw an error message;
				$test_tm_record = tm_record::get_instance((int)$id);
				$saved_tm_data = $test_tm_record->get_data();

				// JSON encode and decode to compare objects
				$a = $saved_tm_data->data;
				$b = $data;

				$a = json_decode(json_encode($a));
				$b = json_decode(json_encode($b));

				$is_equal = ($a == $b);
				if ($is_equal===false) {
					debug_log(__METHOD__
						. " ERROR: The data_time_machine and data_section were expected to be identical. (time machine record: $id [Section:Delete]." .PHP_EOL
						. ' Record is NOT deleted ! (3) ' . PHP_EOL
						. ' section_tipo: ' . $section_tipo . PHP_EOL
						. ' section_id: ' . $section_id . PHP_EOL
						. ' id: ' . $id
 						, logger::ERROR
					);
					return false;
				}

		// 2. Delete the record in DB
			$table = $this->get_table();
			$delete_result = $this->data_handler::delete(
				$table,
				$section_tipo,
				$section_id
			);
			if( $delete_result===false ){
				debug_log(__METHOD__
					." Stopping to deleted section '$section_tipo'_'$section_id', error removing data from DDBB"
					, logger::ERROR
				);
				return false;
			}

		// 3. Remove this section record in linked sections and its own media
			// inverse references. Remove all inverse references to this section
			$this->remove_all_inverse_references();

			// media. Remove media files associated to this section
			$this->remove_section_media_files();

		// 4. Publication
			// Remove published records in diffusion targets (SQL, RDF, etc.).
			// Per-target failures never block the work-system delete: they are
			// persisted as 'unpublish_pending' activity rows and retried later
			// (see diffusion_delete::retry_pending).
			if ($delete_diffusion_records===true) {
				try {
					diffusion_delete::delete_record($section_tipo, $section_id);
				} catch (Exception $e) {
					debug_log(__METHOD__
						." Error on diffusion_delete::delete_record: " .PHP_EOL
						.' Exception Catch message: '.$e->getMessage()
						, logger::WARNING
					);
				}
			}

		// 5. Remove the instance data and delete it from cache.
			unset($this->data_instance);
			// set as unloaded
			$this->is_loaded_data = false;
			// change the status of the record, now doesn't exist into DB.
			$this->record_in_the_database = false;
			// remove from cache
			$cache_key = $section_tipo .'_' .$section_id;
			section_record_instances_cache::delete($cache_key);

		// Log
			debug_log(__METHOD__
				." Deleted section '$section_tipo'_'$section_id' and its children"
				, logger::DEBUG
			);

			// LOGGER ACTIVITY : WHAT(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
			$logger_msg = "DEBUG INFO ".__METHOD__." Deleted section record and its own references. Full deleted record";
			logger::$obj['activity']->log_message(
				'DELETE',
				logger::INFO,
				$section_tipo,
				null,
				array(
					'msg'			=> $logger_msg,
					'section_id'	=> $section_id,
					'tipo'			=> $section_tipo,
					'table'			=> common::get_matrix_table_from_tipo($section_tipo),
					'delete_mode'	=> 'delete_record',
					'section_tipo'	=> $section_tipo
				),
				logged_user_id() // int
			);

		// save event
		$this->save_event();

		// Returns the delete result.
		return true;
	}//end delete



	/**
	* DELETE_DATA
	* Empties all component values within this record while keeping the DB row itself.
	*
	* Iterates every component tipo that belongs to this section's model (obtained from
	* the ontology), instantiates each component, and sets its data to null.  Each
	* component->save() call creates an individual Time Machine entry and activity log
	* row, so the full edit history is preserved.
	*
	* Exceptions:
	* - component_section_id, component_external, component_inverse are skipped — they
	*   hold system-managed or structural data that must not be erased.
	* - component_filter receives the user's default project data rather than null
	*   (ensures the section remains accessible after the clear).
	*
	* Media files belonging to cleared media components are moved to the "deleted"
	* folder (not permanently erased) via remove_component_media_files().
	*
	* After all components are cleared, the audit metadata (modified_by_user, modified_date)
	* is updated via update_modified_section_data() and save_event() is called.
	*
	* @return bool - always true; individual component errors are logged and skipped
	*/
	public function delete_data() : bool {

		// Short vars
			$section_tipo	= $this->section_tipo;
			$section_id		= $this->section_id;
			$user_id		= logged_user_id();

		// Children : Calculate all component children of current section
			$ar_component_tipo = section::get_ar_children_tipo_by_model_name_in_section(
				$section_tipo ,
				['component_'],
				true, // from_cache
				true, // resolve virtual
				true, // recursive
				false, // search exact
			);

			// don't empty some components
			$excluded_model_to_empty = [
				'component_section_id',
				'component_external',
				'component_inverse'
			];

		// Empty media component data
			$ar_models_of_media_components = component_media_common::get_media_components();

		// Empty every component
			$ar_deleted_tipos = [];
			foreach ($ar_component_tipo as $current_component_tipo) {

				$current_model_name = ontology_node::get_model_by_tipo($current_component_tipo, true);

				// don't empty some components data
				if (in_array($current_model_name, $excluded_model_to_empty)){
					continue;
				}

				// Built every component and empty its data
				$translatable = ontology_node::get_translatable($current_component_tipo);
				$lang = ($translatable === false)
					? DEDALO_DATA_NOLAN
					: DEDALO_DATA_LANG;

				$current_component = component_common::get_instance(
					$current_model_name,
					$current_component_tipo,
					$section_id,
					'list',
					$lang,
					$section_tipo,
					false
				);

				// If the component has no data, move on to the next one.
				$current_component_data = $current_component->get_data();
				if(empty($current_component_data)){
					continue;
				}

				// Empty the component data by setting it to null.
				// If the component is a component_filter, set the main user project.
				if($current_model_name==='component_filter'){
					$new_data = $current_component->get_default_data_for_user( $user_id );
				} else {
					$new_data = null;
				}

				$current_component->set_data($new_data);

				// save the component and set new Time Machine entry
				$current_component->save();

				// empty the media files, moving the media to delete directory.
				if(in_array($current_model_name, $ar_models_of_media_components)){
					$current_component->remove_component_media_files();
				}

				// Add the deleted component tipo to the array.
				$ar_deleted_tipos[] = $current_component_tipo;
			}

		// Update the modified section data.
			$this->update_modified_section_data((object)[
				'mode' => 'update_record'
			]);

		// debug
			debug_log(__METHOD__
				." Empty section record data '$section_tipo'_'$section_id' and its children"
				, logger::DEBUG
			);

		// LOGGER ACTIVITY : WHAT(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
			$logger_msg = "Empty section record and children data";
			logger::$obj['activity']->log_message(
				'DELETE',
				logger::INFO,
				$section_tipo,
				null,
				array(
					'msg'			=> $logger_msg,
					'section_id'	=> $section_id,
					'tipo'			=> $section_tipo,
					'table'			=> common::get_matrix_table_from_tipo($section_tipo),
					'delete_mode'	=> 'delete_record',
					'section_tipo'	=> $section_tipo
				),
				$user_id // int
			);

		// save event
		$this->save_event();

		// Returns the delete result.
		return true;
	}//end delete_data



	/**
	* DELETE_COLUMN
	* Stub — not yet implemented.
	*
	* Intended to remove an entire JSONB column's data for this record.
	* Currently a no-op body; callers should use save_column($column, null) instead
	* until this method is implemented.
	*
	* (!) Return type annotation "@return" is missing — the body is empty so the
	* implicit return type is void.
	*
	* @return void
	*/
	public function delete_column() {

	}//end delete_column



	/**
	* GET_COMPONENT_COUNTER
	* Returns the current dataframe item-id counter for the given component tipo.
	*
	* Each component that uses item ids (e.g. component_dataframe) maintains a
	* monotonically increasing counter stored in the 'meta' JSONB column under the
	* component's tipo key.  The counter value is the highest item id ever assigned;
	* the next allocation will start from counter+1.
	*
	* Storage format in the 'meta' column:
	* { "oh25": [{ "count": 5 }], "oh26": [{ "count": 1 }] }
	*
	* Returns 0 (the safe default) when the key does not exist or the column is empty,
	* so callers can always treat the return as a valid base for range allocation.
	*
	* @param string $tipo - component ontology tipo (e.g. "oh25")
	* @return int - current counter value, or 0 if not yet initialised
	*/
	public function get_component_counter( string $tipo ) : int {

		$data = $this->data_instance->get_key_data( 'meta', $tipo ) ?? [] ; // default counter value is always 0, including the empty counter

		$component_counter = $data[0]->count ?? 0;

		return $component_counter;
	}//end get_component_counter



	/**
	* SET_COMPONENT_COUNTER
	* Writes a new dataframe item-id counter value for the given component tipo into
	* the in-memory data_instance ('meta' column).
	*
	* If no counter entry exists yet for $tipo, a fresh one is initialised with
	* count=null before setting the new value.  This in-memory write is not
	* persisted until the next save()/save_column()/save_key_data() call.
	*
	* For atomic, race-safe allocation across concurrent processes use
	* allocate_component_ids() or raise_component_counter() instead.
	*
	* Storage format written to the 'meta' column:
	* { "oh25": [{ "count": $value }] }
	*
	* @param string $tipo - component ontology tipo (e.g. "oh25")
	* @param int $value - new counter value to store
	* @return int - the counter value as confirmed by get_component_counter() after the write
	*/
	public function set_component_counter( string $tipo, int $value ) : int {

		$data = $this->data_instance->get_key_data( 'meta', $tipo );

		if( empty($data) ){
			$data = [ (object)['count' => null] ];
		}
		$data[0]->count = $value;

		$this->data_instance->set_key_data( 'meta', $tipo, $data ); // Set the counter into the counters column data

		return $this->get_component_counter( $tipo );
	}//end set_component_counter



	/**
	* ALLOCATE_COMPONENT_IDS
	* Atomically allocates $count new dataframe item ids for the given component tipo,
	* returning a sequential range that is guaranteed not to collide with any other
	* concurrent allocation on the same {table, section_tipo, section_id, tipo} tuple.
	*
	* Why this method exists:
	* Item ids (id_key values) are the pairing keys used by component_dataframe to
	* link a value row to its label row.  They must be unique per component per record
	* and must never be reused after deletion.  A simple in-memory read-increment-write
	* would race when two PHP workers edit the same record simultaneously, so a
	* PostgreSQL session-level advisory lock (pg_advisory_lock on a hashed key) is
	* acquired before any read or write of the counter.
	*
	* Algorithm:
	* 1. Acquire advisory lock on (table_section_tipo_section_id_tipo) hash.
	* 2. Re-read the PERSISTED counter from the DB (may be ahead of in-memory if
	*    another process has already allocated since this record was loaded).
	* 3. Take the maximum of the persisted counter and the in-memory counter
	*    (handles unsaved in-request allocations in the same process).
	* 4. Persist the new counter immediately via jsonb_set so other processes see it.
	* 5. Sync the in-memory counter to keep in-memory and DB consistent.
	* 6. Return range(base+1, new_counter).
	*
	* Fallback: if no DB connection is available, falls back to the non-atomic
	* in-memory path and logs an ERROR.
	*
	* @param string $tipo - component ontology tipo (e.g. "oh25")
	* @param int $count [= 1] - how many consecutive ids to allocate
	* @return array - allocated id integers, e.g. [8, 9, 10]
	*/
	public function allocate_component_ids( string $tipo, int $count=1 ) : array {

		if ($count < 1) {
			return [];
		}

		$section_tipo	= $this->section_tipo;
		$section_id		= $this->section_id;
		$table			= $this->get_table();

		$conn = DBi::_getConnection();
		if ($conn===false) {
			// connection unavailable: fall back to the in-memory counter
			// (previous behavior, non-atomic)
			debug_log(__METHOD__
				. ' DB connection unavailable: falling back to non-atomic counter allocation' . PHP_EOL
				. ' tipo: ' . $tipo . ' section: ' . $section_tipo . '_' . $section_id
				, logger::ERROR
			);
			$base = $this->get_component_counter($tipo);
			$this->set_component_counter($tipo, $base + $count);
			return range($base+1, $base+$count);
		}

		// advisory lock key from the (table, record, component) triple
		$lock_key = $table.'_'.$section_tipo.'_'.$section_id.'_'.$tipo;

		// session-level advisory lock (no surrounding transaction required)
		pg_query_params($conn, 'SELECT pg_advisory_lock( hashtextextended($1, 0) )', [$lock_key]);

		try {

			// re-read the PERSISTED counter: another process may have
			// allocated ids since this record was loaded in memory
			$persisted	= 0;
			$row_exists	= false;
			$result = @pg_query_params($conn,
				'SELECT (meta->$1->0->>\'count\')::int AS count FROM "'.$table.'" WHERE section_tipo=$2 AND section_id=$3',
				[$tipo, $section_tipo, $section_id]
			);
			if ($result!==false) {
				$row = pg_fetch_assoc($result);
				if ($row!==false && $row!==null) {
					$row_exists	= true;
					$persisted	= (int)($row['count'] ?? 0);
				}
			}

			// the in-memory counter may be ahead of the persisted one
			// (unsaved allocations within this same request)
			$in_memory	= $this->get_component_counter($tipo);
			$base		= max($persisted, $in_memory);

			$new_counter = $base + $count;

			// persist immediately so concurrent processes see the allocation
			// before this record is saved
			if ($row_exists) {
				$meta_value = json_encode([ (object)['count' => $new_counter] ]);
				$update_result = @pg_query_params($conn,
					'UPDATE "'.$table.'" SET meta = jsonb_set( COALESCE(meta, \'{}\'::jsonb), ARRAY[$1], $2::jsonb, true ) WHERE section_tipo=$3 AND section_id=$4',
					[$tipo, $meta_value, $section_tipo, $section_id]
				);
				if ($update_result===false) {
					debug_log(__METHOD__
						. ' Unable to persist allocated counter (allocation continues in-memory)' . PHP_EOL
						. ' tipo: ' . $tipo . ' section: ' . $section_tipo . '_' . $section_id
						, logger::WARNING
					);
				}
			}

			// sync the in-memory counter so the record save keeps it
			$this->set_component_counter($tipo, $new_counter);

			return range($base+1, $new_counter);

		} finally {
			pg_query_params($conn, 'SELECT pg_advisory_unlock( hashtextextended($1, 0) )', [$lock_key]);
		}
	}//end allocate_component_ids



	/**
	* RAISE_COMPONENT_COUNTER
	* Atomically ensures the component item-id counter is at least $min_value,
	* without allocating specific ids (no-op when the counter is already at or above
	* the requested minimum).
	*
	* Used during import / migration to absorb explicit item ids that arrive with
	* source data.  After calling this method, subsequent allocate_component_ids()
	* calls are guaranteed to produce ids strictly greater than $min_value, so
	* imported data retains its original ids without colliding with new allocations.
	*
	* Internally takes the maximum of the persisted counter, the in-memory counter,
	* and $min_value under the same advisory lock used by allocate_component_ids(),
	* then persists the result immediately.
	*
	* Returns $current immediately (short-circuit) when the in-memory counter is
	* already >= $min_value, avoiding an unnecessary lock acquisition.
	*
	* @param string $tipo - component ontology tipo (e.g. "oh25")
	* @param int $min_value - the minimum counter value that must be guaranteed
	* @return int - resulting counter value after the potential raise
	*/
	public function raise_component_counter( string $tipo, int $min_value ) : int {

		$current = $this->get_component_counter($tipo);
		if ($current >= $min_value) {
			return $current;
		}

		// allocate the gap under the lock: this re-reads the persisted
		// counter and persists the raise atomically
		$conn = DBi::_getConnection();
		if ($conn===false) {
			$this->set_component_counter($tipo, $min_value);
			return $min_value;
		}

		$table		= $this->get_table();
		$lock_key	= $table.'_'.$this->section_tipo.'_'.$this->section_id.'_'.$tipo;

		pg_query_params($conn, 'SELECT pg_advisory_lock( hashtextextended($1, 0) )', [$lock_key]);
		try {

			$persisted = 0;
			$row_exists = false;
			$result = @pg_query_params($conn,
				'SELECT (meta->$1->0->>\'count\')::int AS count FROM "'.$table.'" WHERE section_tipo=$2 AND section_id=$3',
				[$tipo, $this->section_tipo, $this->section_id]
			);
			if ($result!==false) {
				$row = pg_fetch_assoc($result);
				if ($row!==false && $row!==null) {
					$row_exists	= true;
					$persisted	= (int)($row['count'] ?? 0);
				}
			}

			$new_counter = max($persisted, $this->get_component_counter($tipo), $min_value);

			if ($row_exists && $new_counter > $persisted) {
				$meta_value = json_encode([ (object)['count' => $new_counter] ]);
				@pg_query_params($conn,
					'UPDATE "'.$table.'" SET meta = jsonb_set( COALESCE(meta, \'{}\'::jsonb), ARRAY[$1], $2::jsonb, true ) WHERE section_tipo=$3 AND section_id=$4',
					[$tipo, $meta_value, $this->section_tipo, $this->section_id]
				);
			}

			$this->set_component_counter($tipo, $new_counter);

			return $new_counter;

		} finally {
			pg_query_params($conn, 'SELECT pg_advisory_unlock( hashtextextended($1, 0) )', [$lock_key]);
		}
	}//end raise_component_counter



	/**
	* GET_MODIFIED_SECTION_SAVE_PATH
	* Computes the audit metadata save_path items for the current user and writes the
	* corresponding values into the in-memory data_instance as a side effect.
	*
	* Delegates the pure data computation to the static build_modification_data() and
	* then applies the results: sets each {column, tipo} data value into data_instance
	* so that the caller's subsequent save_key_data() call persists them together with
	* the rest of the component save_path.
	*
	* Returns an empty array (and does NOT set data_instance values) for:
	* - The activity section (dd542) — it has no audit metadata components.
	* - Requests without a logged-in user (user_id = 0 / empty).
	*
	* $mode controls which audit pair is updated:
	* - 'new_record'    → created_by_user (dd200) + created_date (dd199)
	* - 'update_record' → modified_by_user (dd197) + modified_date (dd201)
	*
	* Does NOT persist to the database.
	*
	* @param string $mode - 'new_record' or 'update_record'
	* @return array - array of (object){column, key} items, or [] when skipped
	*/
	private function get_modified_section_save_path( string $mode ) : array {

		$user_id = logged_user_id();

		// Pure function returns data_values keyed by column and tipo
		$data_values = self::build_modification_data(
			$this->section_tipo,
			$mode,
			$user_id
		);

		// Empty (activity section or no user)
		if( empty((array)$data_values) ){
			return [];
		}

		// Side effect: set data_instance values from build_modification_data output
		foreach ($data_values as $column => $column_data) {
			foreach ($column_data as $tipo => $data) {
				$this->data_instance->set_key_data($column, $tipo, $data);
			}
		}

		// Build save_path items from data_values structure
		$save_path = [];
		foreach ($data_values as $column => $column_data) {
			foreach ($column_data as $tipo => $data) {
				$save_path[] = (object)[
					'column' => $column,
					'key'    => $tipo
				];
			}
		}

		return $save_path;
	}//end get_modified_section_save_path



	/**
	* UPDATE_MODIFIED_SECTION_DATA
	* Persists audit metadata (modified_by_user / modified_date or created_by_user /
	* created_date) for this record as a standalone DB write, independent of any
	* component save.
	*
	* Computes and sets data_instance values via get_modified_section_save_path(),
	* then calls save_key_data() to flush only those metadata keys to the DB, followed
	* by save_event() to invalidate dependent caches.
	*
	* Returns false (no-op) when the section is the activity section (dd542) or when
	* there is no logged-in user — matching the skip rules of build_modification_data().
	*
	* $options must have:
	*   $options->mode — 'new_record' or 'update_record'
	*
	* Called after delete_data() to stamp the modification without a full component
	* save cycle.
	*
	* @param object $options - options object with 'mode' property
	* @return bool - true on success, false when metadata was skipped or DB write failed
	*/
	public function update_modified_section_data(object $options) : bool {

		// Compute metadata and set data_instance values
		$metadata_path = $this->get_modified_section_save_path($options->mode);

		// Nothing to save (activity section or no user)
		if( empty($metadata_path) ){
			return false;
		}

		// Save metadata to DB
		$result = $this->save_key_data($metadata_path);

		// save event
		$this->save_event();

		return $result;
	}//end update_modified_section_data



	/**
	* BUILD_MODIFICATION_DATA
	* Pure function that computes the audit metadata data values for a given save
	* mode, without touching any instance state or the database.
	*
	* Returns an object keyed by column name, where each column value is itself keyed
	* by component tipo:
	* (object){
	*   relation: (object){ dd200: [locator] },  // 'new_record': created_by_user
	*   date:     (object){ dd199: [date_obj] }   // 'new_record': created_date
	* }
	* or for 'update_record':
	* (object){
	*   relation: (object){ dd197: [locator] },
	*   date:     (object){ dd201: [date_obj] }
	* }
	*
	* Returns an empty object (no side effects) when:
	* - $section_tipo === DEDALO_ACTIVITY_SECTION_TIPO (dd542) — no metadata components.
	* - $user_id is empty / 0 — cannot attribute a locator without an author.
	*
	* The user locator always uses id=1 (fixed, not the logged user's PK), as item ids
	* for relation components are record-local sequential integers; section_id carries
	* the actual user identifier.
	*
	* @param string $section_tipo - ontology tipo of the section being written
	* @param string $mode - 'new_record' or 'update_record'
	* @param int $user_id - logged user section_id (from logged_user_id())
	* @return object - data-values object keyed {column: {tipo: value}}, or empty object
	*/
	public static function build_modification_data( string $section_tipo, string $mode, int $user_id ) : object {

		// Skip for activity sections
		if ($section_tipo===DEDALO_ACTIVITY_SECTION_TIPO) {
			return (object)[];
		}

		// Check user logged
		if( empty($user_id) ) {
			debug_log(__METHOD__
				. " ERROR: user_id is empty. Cannot set created/modified user locator."
				, logger::ERROR
			);
			return (object)[];
		}

		// Fixed private tipos
			$metadata_definition = section::get_metadata_definition();
				$created_by_user	= $metadata_definition->created_by_user; 	// 'tipo'=>'dd200', 'model'=>'component_select'
				$created_date		= $metadata_definition->created_date; 		// 'tipo'=>'dd199', 'model'=>'component_date'
				$modified_by_user	= $metadata_definition->modified_by_user; 	// 'tipo'=>'dd197', 'model'=>'component_select'
				$modified_date		= $metadata_definition->modified_date; 		// 'tipo'=>'dd201', 'model'=>'component_date'

		// Current user locator
			$user_locator = new locator();
				$user_locator->set_id(1); // fixed id
				$user_locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO); // dd128
				$user_locator->set_section_id($user_id); // logged user
				$user_locator->set_type(DEDALO_RELATION_TYPE_LINK);

		// Current date
			$dd_date	= component_date::get_date_now();
			$date_now 	= new stdClass();
				$date_now->start	= $dd_date;
				$date_now->id		= 1; // fixed id
				$date_now->lang		= DEDALO_DATA_NOLAN;

		$data_values = new stdClass();

		switch ($mode) {

			case 'new_record': // new record

				// Created by user
					$user_locator->set_from_component_tipo( $created_by_user->tipo );
					$data_values->relation = (object)[
						$created_by_user->tipo => [$user_locator]
					];

				// Creation date
					$data_values->date = (object)[
						$created_date->tipo => [$date_now]
					];
				break;

			case 'update_record': // update_record (record already exists)

				// Modified by user
					$user_locator->set_from_component_tipo($modified_by_user->tipo);
					$data_values->relation = (object)[
						$modified_by_user->tipo => [$user_locator]
					];

				// Modification date
					$data_values->date = (object)[
						$modified_date->tipo => [$date_now]
					];
				break;
		}

		return $data_values;
	}//end build_modification_data



	/**
	* BUILD_METADATA
	* Constructs the initial 'data' column object written when a new section record is
	* created for the first time.
	*
	* The 'data' column holds section-level administrative metadata that is stored as a
	* single flat object (not component-keyed like other columns).  Fields:
	* - label          : human-readable section name from the ontology term.
	* - created_date   : DB-formatted timestamp (e.g. "2024-11-05 19:50:44").
	* - section_id     : int PK of the new row (may be null before DB insert resolves it).
	* - section_tipo   : ontology tipo of the section.
	* - diffusion_info : always null at creation; populated later by the diffusion layer.
	* - created_by_user_id : int user PK of the creating user.
	*
	* Returns:
	* (object){ data: (object){ label, created_date, section_id, section_tipo,
	*                            diffusion_info, created_by_user_id } }
	*
	* @param string $tipo - section ontology tipo
	* @param int|null $section_id - new record PK, or null when not yet assigned
	* @param int $user_id - creating user's section_id
	* @return object - wrapper object with a 'data' property
	*/
	public static function build_metadata( string $tipo, ?int $section_id, int $user_id ) : object {

		// section_data
		$section_data = (object)[
			'label'					=> (string)ontology_node::get_term_by_tipo($tipo,null,true),
			'created_date'			=> dd_date::get_timestamp_now_for_db(), // Format 2012-11-05 19:50:44
			'section_id'			=> $section_id,
			'section_tipo'			=> $tipo,
			'diffusion_info'		=> null, // null by default
			'created_by_user_id'	=> $user_id,
		];

		$data_values = (object)[
			'data' => $section_data
		];

		return $data_values;
	}//end build_metadata



	/**
	* GET_INVERSE_REFERENCES
	* Searches all matrix tables for locators that point to this section record and
	* returns the corresponding inverse locator descriptors.
	*
	* Uses search_related::get_referenced_locators() with a minimal locator constructed
	* from {section_tipo, section_id}.  Each returned locator descriptor identifies the
	* component (from_component_tipo), section (from_section_tipo, from_section_id),
	* and pairing key (id_key / section_id_key) that holds a reference to this record.
	*
	* Returns an empty array when section_id is 0 or empty (record not yet created).
	*
	* @see search_related::get_referenced_locators()
	* @return array - array of inverse locator objects; empty if none found or not yet created
	*/
	public function get_inverse_references() : array {

		if (empty($this->section_id)) {
			// The section does not exist yet. Return empty array
			return [];
		}

		// Create a minimal locator based on current section
		$filter_locator = new locator();
			$filter_locator->set_section_tipo($this->section_tipo);
			$filter_locator->set_section_id($this->section_id);

		// Get calculated inverse locators for all matrix tables
		$ar_inverse_locators = search_related::get_referenced_locators(
			[$filter_locator]
		);


		return $ar_inverse_locators;
	}//end get_inverse_references



	/**
	* REMOVE_ALL_INVERSE_REFERENCES
	* Removes every locator that points to this record from all components across all
	* sections, then saves those components.
	*
	* Called as step 3 of delete() to maintain referential integrity: when a section
	* record is deleted, any portal / autocomplete / dataframe component in another
	* section that holds a locator to it must have that locator removed so that stale
	* references do not appear in the UI.
	*
	* Only components with parent class 'component_relation_common' or the
	* 'component_dataframe' model are supported.  Other model types are skipped with
	* a WARNING log.
	*
	* For component_dataframe, both the unified 'id_key' and legacy 'section_id_key'
	* fields are read from the inverse locator and forwarded as caller_dataframe so
	* the correct row can be targeted within the dataframe's data array.
	*
	* Returns the list of successfully removed {removed_from, locator_to_remove} pairs
	* for diagnostic logging.
	*
	* @see delete()
	* @return array - removed locator descriptor objects; empty if nothing was removed
	*/
	public function remove_all_inverse_references() : array {

		$removed_locators = [];
		$inverse_locators = $this->get_inverse_references();
		foreach ($inverse_locators as $current_locator) {

			$current_component_tipo	= $current_locator->from_component_tipo;
			$current_section_tipo	= $current_locator->from_section_tipo;
			$current_section_id		= $current_locator->from_section_id;

			$model_name = ontology_node::get_model_by_tipo( $current_component_tipo, true );
			#if ($model_name!=='component_portal' && $model_name!=='component_autocomplete' && $model_name!=='component_relation_children') {
			if ('component_relation_common' !== get_parent_class($model_name) && $model_name !== 'component_dataframe') {
				debug_log(__METHOD__
					. " ERROR (remove_all_inverse_references): Only portals are supported!! Ignored received: $model_name " . PHP_EOL
					, logger::WARNING
				);
				continue;
			}

			// component dataframe
			// pairing keys are dual-read: id_key (unified contract) or section_id_key (legacy)
			if($model_name==='component_dataframe'){
				$caller_dataframe = new stdClass();
					$caller_dataframe->id_key				= $current_locator->id_key ?? $current_locator->section_id_key ?? null;
					$caller_dataframe->section_id_key		= $current_locator->id_key ?? $current_locator->section_id_key ?? null;
					$caller_dataframe->section_tipo_key		= $current_locator->section_tipo_key ?? null;
					$caller_dataframe->main_component_tipo	= $current_locator->main_component_tipo ?? null;
			}

			$component = component_common::get_instance(
				$model_name,
				$current_component_tipo,
				$current_section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$current_section_tipo,
				true,
				$caller_dataframe ?? null
			);

			// locator_to_remove
			$locator_to_remove = new locator();
				$locator_to_remove->set_type( $component->get_relation_type() );
				$locator_to_remove->set_section_id( $this->section_id );
				$locator_to_remove->set_section_tipo( $this->section_tipo );
				$locator_to_remove->set_from_component_tipo( $current_component_tipo );

			if (true === $component->remove_locator_from_data( $locator_to_remove )) {

				// removed case

				// Save component dato
				$component->Save();

				$removed_locators[] = (object)[
					'removed_from'		=> $current_locator,
					'locator_to_remove'	=> $locator_to_remove
				];

				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__
						." !!!! Removed inverse reference to tipo:$this->section_tipo, section_id:$this->section_id in $model_name: tipo:$current_locator->from_component_tipo, section_id:$current_locator->from_section_id, section_tipo:$current_locator->from_section_tipo "
						, logger::DEBUG
					);
				}
			}else{

				// not removed case

				debug_log(__METHOD__
					." Error on remove reference to current_locator. locator_to_remove was not removed from inverse_locators! ". PHP_EOL
					.' current_locator: ' . to_string($current_locator) . PHP_EOL
					.' locator_to_remove: ' . to_string($locator_to_remove) . PHP_EOL
					.' component: ' . $model_name . PHP_EOL
					.' tipo: ' . $current_component_tipo . PHP_EOL
					.' section_tipo: ' . $current_section_tipo . PHP_EOL
					.' section_id: ' . $current_section_id
					, logger::WARNING
				);
				if(SHOW_DEBUG===true) {
					// dump($inverse_locators, ' remove_all_inverse_references inverse_locators ++ save: '.to_string($save));
					dump($component->get_data(), ' remove_all_inverse_references component->get_data() ++ '.to_string());
				}
			}
		}//end foreach ($inverse_locators as $current_locator)


		return $removed_locators;
	}//end remove_all_inverse_references



	/**
	* REMOVE_SECTION_MEDIA_FILES
	* Moves all media files linked to this section to the "deleted" folder by
	* iterating the 'media' JSONB column and calling remove_component_media_files()
	* on each media component found.
	*
	* "Remove" here means rename/move, not permanent erasure — files are recoverable
	* via restore_deleted_section_media_files() until the deleted folder is purged.
	*
	* Only component tipos whose model is registered in
	* component_media_common::get_media_components() (3d, av, image, pdf, svg) are
	* processed.  Unknown model types logged as ERROR and skipped.
	*
	* Returns an empty array (not null) when the 'media' column is absent or empty.
	*
	* @see delete()
	* @see restore_deleted_section_media_files()
	* @return array|null - array of {tipo, model} objects for processed components; empty array if nothing to remove
	*/
	protected function remove_section_media_files() : ?array {

		$ar_removed = [];

		// short vars
			$section_tipo	= $this->section_tipo;
			$section_id		= $this->section_id;
			$data			= $this->get_data();
			$column 		= 'media';

			$media_data = $data->$column;

			if( empty($media_data) ){
				debug_log(__METHOD__." Nothing to remove ".to_string(), logger::DEBUG);
				return $ar_removed;
			}

			$media_component_models = component_media_common::get_media_components();

		// components into section dato
			foreach( $media_data as $component_tipo => $component_data) {

				$model = ontology_node::get_model_by_tipo( $component_tipo, true );
				if (!in_array($model, $media_component_models)) {
					debug_log(__METHOD__." Inconsistent data in media column "
						. "model: ".$model.PHP_EOL
						. "tipo: ".$component_tipo.PHP_EOL
						. "section_tipo: ". $section_tipo.PHP_EOL
						. "section_id: ". $section_id
						,logger::ERROR
					);
					continue;
				}

				$lang		= common::get_element_lang($component_tipo, DEDALO_DATA_LANG);
				$component	= component_common::get_instance(
					$model,
					$component_tipo,
					$section_id,
					'edit',
					$lang,
					$section_tipo
				);
				if ( false===$component->remove_component_media_files() ) {
					debug_log(__METHOD__
						." Error on remove_section_media_files: model:$model, tipo:$component_tipo, section_id:$section_id, section_tipo:$section_tipo"
						, logger::ERROR
					);
					continue;
				}

				$ar_removed[] = (object)[
					'tipo'	=> $component_tipo,
					'model'	=> $model
				];

				debug_log(__METHOD__
					." removed media files from  model:$model, tipo:$component_tipo, section_id:$section_id, section_tipo:$section_tipo"
					, logger::WARNING
				);
			}//end foreach


		return $ar_removed;
	}//end remove_section_media_files



	/**
	* CREATE
	* Creates or updates a section record, returning the section_record instance.
	*
	* This is a dual-mode method:
	*
	* INSERT mode ($section_id === null):
	*   Delegates to data_handler::create() which inserts a new row and returns the
	*   auto-assigned section_id (PostgreSQL SERIAL / nextval).  The new instance is
	*   retrieved via get_instance(), $record_in_the_database is set to true, and the
	*   row data is force-loaded via get_data().  save_event() is called afterwards.
	*
	* UPDATE mode ($section_id !== null):
	*   Retrieves the existing instance via get_instance(), merges the supplied $values
	*   with the computed audit metadata (modified_by_user, modified_date), sets all
	*   column data into the data_instance, then calls save() in a single DB trip.
	*   No separate save_event() call is needed here because save() does it internally.
	*
	* (!) In DEBUG mode, a backtrace check enforces that the immediate caller is the
	* 'section' class.  Calls from any other class throw an Exception.  This guard
	* is active only when SHOW_DEBUG is true.
	*
	* $values format (optional, for INSERT path):
	* {
	*   "relation": { "oh25": [locator, ...] },
	*   "string":   { "oh26": ["Hello"] },
	*   "data":     { ... section metadata object ... }
	* }
	*
	* @param string $section_tipo - ontology tipo (e.g. "oh1")
	* @param int|null $section_id [= null] - null for INSERT, existing PK for UPDATE
	* @param object|null $values [= null] - optional initial/updated column values
	* @return section_record|false - new or updated instance on success, false on failure
	*/
	public static function create( string $section_tipo, ?int $section_id=null, ?object $values=null ) : section_record|false {

		// debug temporal to check caller class
		if(SHOW_DEBUG===true) {
			$trace = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 2);
			$callerClass = $trace[1]['class'] ?? 'Global';
			if($callerClass !== 'section'){
				debug_log(__METHOD__
					." ONLY CALLS FROM SECTION ARE ALLOWED ". PHP_EOL
					. ' callerClass: ' . $callerClass
					, logger::ERROR
				);
				throw new Exception(" ONLY CALLS FROM SECTION ARE ALLOWED ");
			}
		}
		// Get the table name from the section tipo
		$table = common::get_matrix_table_from_tipo($section_tipo);

		// If section_id is provided, update the record
		// Merge modification metadata (modified_by_user, modified_date) into values
		// to save a DB connection and execute all section changes in one transaction.
		// If the section_id is not provided, it is a new record.
		if( $section_id !== null ) {
			// set section_record instance
			$section_record = section_record::get_instance($section_tipo, (int)$section_id);

				// build modification data and merge into values
				$modification_data = section_record::build_modification_data(
					$section_tipo,
					'update_record',
					(int)logged_user_id()
				);
				if( $values === null ) {
					$values = $modification_data;
				} else {
					foreach ($modification_data as $column => $column_data) {
						foreach ($column_data as $tipo => $data) {
							if( !isset($values->{$column}) ) {
								$values->{$column} = new stdClass();
							}
							$values->{$column}->{$tipo} = $data;
						}
					}
				}

				// set all component data (including modification metadata)
				if( $values !== null ) {
					foreach ($values as $column => $column_data) {
						if ($column === 'data') {
							// section metadata
							$section_record->set_column_data($column, $column_data);
						}else{
							// components data
							foreach ($column_data as $tipo => $data) {
								if ($data!==null && !is_array($data)) {
									debug_log(__METHOD__
										.' Invalid data. Ignored column data (non array|null) ' . PHP_EOL
										.' column '. $column . PHP_EOL
										.' tipo '. $tipo . PHP_EOL
										.' data '. json_encode($data, JSON_PRETTY_PRINT) . PHP_EOL
										.' data type '. gettype($data) . PHP_EOL
										.' values: ' . json_encode($values, JSON_PRETTY_PRINT)
										, logger::ERROR
									);
									continue;
								}
								$section_record->set_component_data($tipo, $column, $data);
							}
						}
					}
				}

				// save the section record
				// single DB transaction with all changes
				$section_record->save();

				return $section_record;
		}

		// insert a new record in the database
		$data_handler = $table === 'matrix_activity'
			? 'matrix_activity_db_manager'
			: 'matrix_db_manager';
		$section_id = $data_handler::create(
			$table,
			$section_tipo,
			$values
		);

		if( $section_id === false ){
			return false;
		}

		$section_record = section_record::get_instance( $section_tipo, (int)$section_id );
		$section_record->record_in_the_database = true;

		// update values
		// $section_record->set_data($values);
		$section_record->get_data(); // force to update values

		// save event
		$section_record->save_event();

		return $section_record;
	}//end create



	/**
	* DUPLICATE
	* Creates a new record in the same section type by cloning all component data from
	* this record, producing independent Time Machine and activity log entries for the
	* new record.
	*
	* Steps:
	* 1. Clones get_data() to obtain a deep snapshot of the source record.
	* 2. Creates a new blank row via section::create_record(), passing the clone as
	*    initial values (handles the INSERT + audit metadata stamp).
	* 3. Iterates every column of source_data and re-saves each component into the new
	*    section_id, skipping:
	*    - 'data', 'meta', 'relation_search' columns (system-managed, auto-rebuilt).
	*    - Tipos in $ar_section_info_tipos (audit components dd196 group, e.g. created
	*      date, modified user — rebuilt by the create/save audit path).
	*    - Media components (handled separately below).
	* 4. For media components, calls duplicate_component_media_files() on the source
	*    component to copy the physical files to the new section_id folder, then
	*    regenerate_component() on the target component to build the DB entry from
	*    the copied files.
	* 5. Saves the new section_record once more to flush the 'meta' counter column and
	*    any 'relation_search' column that was written during the component saves.
	*
	* Returns false when:
	* - The source record has no data (all properties empty).
	* - section::create_record() fails to return a valid new section_id.
	*
	* @return int|false - section_id of the new duplicate record, or false on failure
	*/
	public function duplicate() : int|false {

		$section_tipo = $this->section_tipo;

		// copy data
			$source_data = clone $this->get_data();
			if (are_all_properties_empty($source_data)) {
				debug_log(__METHOD__
					. " Empty data from section record. All properties are empty." . PHP_EOL
					. ' section_tipo: ' . to_string($this->section_tipo) . PHP_EOL
					. ' section_id: ' . to_string($this->section_id) . PHP_EOL
					. ' source_data: ' . json_encode($source_data)
					, logger::ERROR
				);
				return false;
			}

		// create a new blank section record with same the section_tipo that current
			$section = section::get_instance( $section_tipo );
			// set the source_data as new value data of the new section
			// Create a new section_record
			$new_section_id	= $section->create_record( (object)[
				'values' => $source_data
			]);

			if (empty($new_section_id) || (int)$new_section_id<1) {
				return false;
			}

		// new section_record
		$new_section_record = section_record::get_instance($section_tipo, (int)$new_section_id);

		// ar_section_info_tipos.
		// Section info tipos can get they from ontology children of DEDALO_SECTION_INFO_SECTION_GROUP
		$ar_section_info_tipos = ontology_node::get_ar_children(DEDALO_SECTION_INFO_SECTION_GROUP);

		// tipos to skip on copy
		$skip_tipos = $ar_section_info_tipos;
		// columns to skip
		$skip_columns = ['data','meta','relation_search'];

		// Get media components in section
		$ar_media_components = component_media_common::get_media_components();

		foreach ($source_data as $column => $column_data) {

			// check if the column has data and exclude some columns
			if( $column_data===null || in_array($column, $skip_columns) ){
				continue;
			}

			// give the component data of the column
			foreach ($column_data as $component_tipo => $component_data) {

				// tipo filter
				if (in_array($component_tipo, $skip_tipos)) {
					continue;
				}

				// model
				$current_model = ontology_node::get_model_by_tipo($component_tipo,true);

				// Create all new components in the duplicated section
				$component = component_common::get_instance(
					$current_model,
					$component_tipo,
					$new_section_id,
					'list',
					DEDALO_DATA_LANG,
					$section_tipo
				);

				if( $current_model==='component_dataframe' ){
					// check if the data has main_component_tipo
					// if data has not ask to the component to give its main_component_tipo.
					// pairing keys are dual-read: id_key (unified contract) or section_id_key (legacy)
					$main_component_tipo = $component_data[0]->main_component_tipo ?? $component->get_main_component_tipo();
					$caller_dataframe = new stdClass();
						$caller_dataframe->main_component_tipo	= $main_component_tipo;
						$caller_dataframe->id_key				= $component_data[0]->id_key ?? $component_data[0]->section_id_key ?? null;
						$caller_dataframe->section_id_key		= $component_data[0]->id_key ?? $component_data[0]->section_id_key ?? null;
						$caller_dataframe->section_tipo_key		= $component_data[0]->section_tipo_key ?? $section_tipo;
					$component->set_caller_dataframe( $caller_dataframe );
				}

				// Media components
				// It needs to create a source component to access the existing files and duplicate they
				if( in_array($current_model, $ar_media_components) ){
					// Media components duplicates its own media files from the original component
					$source_media_component = component_common::get_instance(
						$current_model,
						$component_tipo,
						$this->section_id,
						'list',
						DEDALO_DATA_LANG,
						$section_tipo
					);
					// Duplicates its own files
					$source_media_component->duplicate_component_media_files( $new_section_id );

					// Media target component regenerate only.
					// consolidate media files and save it
					$component->regenerate_component( (object)[
						'delete_normalized_files' => false
					]);

				}else{

					// save in a common way
					$component->set_data( $component_data );
					$component->save(); // save each lang to force to create a time machine and activity records
				}
			}
		}

		// Save added columns ('counters','relation_search') once
		$new_section_record->save();

		return $new_section_id;
	}//end duplicate



	/**
	* READ
	* Fetches and decodes the database row for this {section_tipo, section_id} pair,
	* populating the shared data_instance with the JSONB column values.
	*
	* Cache behaviour:
	* - When $cache=true (default) and $is_loaded_data is already set, the method
	*   returns the cached value without hitting the database.  If $record_in_the_database
	*   is false from a prior miss, null is returned immediately.
	* - Set $cache=false to force a fresh DB query (bypasses $is_loaded_data guard).
	*
	* Special case: the 'matrix_time_machine' table is never queried here because
	* tm_record injects its data directly into the data_instance.  The method marks
	* $is_loaded_data=true and returns the existing data_instance content unchanged.
	*
	* On a DB hit, each column that exists in $row is passed raw (as a JSON string)
	* to data_instance->set_column_data() for lazy decoding on first access.  Columns
	* absent from the row are left at their initialised (null) values.
	*
	* On a DB miss, $is_loaded_data and $record_in_the_database are set to false-values
	* and null is returned; subsequent calls with $cache=true skip the DB gracefully.
	*
	* @param bool $cache [= true] - false to force a fresh DB read
	* @return object|null - decoded data object, or null if the row does not exist
	*/
	public function read( bool $cache=true ) : ?object {

		if ($cache && $this->is_loaded_data) {
			// Fast path for caching: If we already know the record does not exist
			// in the database from a previous read attempt, return null without querying again.
			if (isset($this->record_in_the_database) && $this->record_in_the_database === false) {
				return null;
			}
			return $this->data_instance->get_data();
		}

		$table = $this->get_table();

		// Special case for time machine table
		// The data is injected by tm_record, so we don't need to read from DB (and matrix_db_manager doesn't support it)
		if ($table === 'matrix_time_machine') {
			$this->is_loaded_data = true;
			return $this->data_instance->get_data();
		}

		$section_tipo = $this->section_tipo;
		$section_id	= $this->section_id;

		$row = $this->data_handler::read(
			$table,
			$section_tipo,
			$section_id
		);

		// No results found
		if (!$row) {
			// Cache the database miss to prevent identical redundant queries
			// from executing if this record is accessed multiple times during the request.
			$this->is_loaded_data = true;
			$this->record_in_the_database = false;
			return null;
		}

		// assign data_columns from database results
		// Raw JSON strings are passed to set_column_data for lazy decoding on first access.
		$columns_name = $this->data_instance->get_columns_name();
		foreach ($columns_name as $column) {

			if ( !isset($row->$column) ) {
				// Ignore non existing data_columns key
				continue;
			}

			if ( $row->$column!==null ) {
				// Pass raw JSON string; decoded lazily on first access
				$this->data_instance->set_column_data($column, $row->$column);
			}
		}

		// Updates is_loaded_data
		$this->is_loaded_data = true;
		// Mark the record as successfully found in the database.
		$this->record_in_the_database = true;


		return $this->data_instance->get_data();
	}//end read



	/**
	* RESTORE_DELETED_SECTION_MEDIA_FILES
	* Restores media files that were previously moved to the "deleted" folder back to
	* their original media folder, reversing the effect of remove_section_media_files().
	*
	* Called by the Time Machine restore path when a deleted section record is recovered.
	* Iterates every entry in the 'media' JSONB column of the in-memory data_instance
	* (not a fresh DB read) and calls restore_component_media_files() on each media
	* component instance.  Only tipos whose model is registered in
	* component_media_common::get_media_components() are processed; others are skipped.
	*
	* Returns an empty array (not null) when the 'media' column is absent or empty.
	*
	* @see remove_section_media_files()
	* @return array|null - array of {tipo, model} objects for restored components; empty array if nothing to restore
	*/
	public function restore_deleted_section_media_files() : ?array {

		$ar_restored = [];

		// short vars
			$section_tipo		= $this->section_tipo;
			$section_id			= $this->section_id;
			$section_data		= $this->data_instance->get_data();
			$ar_media_elements	= component_media_common::get_media_components();

		// section components property empty case
			if (!isset($section_data->media) || empty($section_data->media)) {
				debug_log(__METHOD__
					." Nothing to restore "
					, logger::DEBUG
				);
				return $ar_restored;
			}

		// components into section dato
			foreach ($section_data->media as $component_tipo => $component_value) {

				$model = ontology_node::get_model_by_tipo($component_tipo,true);
				if (!in_array($model, $ar_media_elements)) continue; # Skip

				$lang		= common::get_element_lang($component_tipo, DEDALO_DATA_LANG);
				$component	= component_common::get_instance(
					$model,
					$component_tipo,
					$section_id,
					'edit',
					$lang,
					$section_tipo
				);
				if ( false===$component->restore_component_media_files() ) {
					debug_log(__METHOD__
						." Error on restore_deleted_section_media_files: ". PHP_EOL
						. " model:$model, tipo:$component_tipo, section_id:$section_id, section_tipo:$section_tipo"
						, logger::ERROR
					);
					continue;
				}

				$ar_restored[] = (object)[
					'tipo'	=> $component_tipo,
					'model'	=> $model
				];

				debug_log(__METHOD__
					." restored media files from  model:$model, tipo:$component_tipo, section_id:$section_id, section_tipo:$section_tipo"
					, logger::WARNING
				);
			}//end foreach


		return $ar_restored;
	}//end restore_deleted_section_media_files



	/**
	* GET_TABLE
	* Returns the resolved PostgreSQL table name for this section record.
	*
	* The table name is resolved once during __construct() from
	* common::get_matrix_table_from_tipo() and stored as a readonly property.
	* Common values: 'matrix', 'matrix_activity', 'matrix_time_machine'.
	*
	* (!) The existing doc-block description "Returns the full table object" is stale —
	* the return value is a string, not an object.
	*
	* @return string - PostgreSQL table name (e.g. "matrix", "matrix_activity")
	*/
	public function get_table() : string {

		return $this->table;
	}//end get_table



	/**
	* GET_PERMISSIONS
	* Returns the resolved permission level for the current user on this section record.
	*
	* Permissions are computed once per request and cached in $this->permissions.
	* The base level is computed by common::get_permissions() using the section tipo.
	*
	* Special overrides:
	* - Users section (dd128): if the record being accessed IS the currently logged-in
	*   user's own record ($section_id == logged_user_id()), the level is forced to 1
	*   (read-only) to allow tool_user_admin to access it regardless of the general
	*   user-management permission level.
	* - Time Machine notes (rsc832): level is set to 2 (read-write) only for the record's
	*   creator or for global admins; all other users receive level 1 (read-only).
	*
	* Numeric permission levels: 0 = no access, 1 = read-only, 2 = read-write.
	*
	* @return int - resolved permission level (0, 1, or 2)
	*/
	public function get_permissions() : int {

		// check if the permissions are set previously, then return it.
			if(isset($this->permissions)){
				return $this->permissions;
			}

		// common cases permissions calculation
			$this->permissions = common::get_permissions($this->section_tipo, $this->section_tipo);

		// special cases
			if ($this->section_tipo===DEDALO_SECTION_USERS_TIPO && $this->section_id==logged_user_id()){
				$this->permissions = 1; // set to 1 to allow tool_user_admin access
			} else if ($this->section_tipo===DEDALO_TIME_MACHINE_NOTES_SECTION_TIPO) {
				// time machine notes case (rsc832)
				// his own section
				$this->permissions = (logged_user_id()===$this->get_created_by_user_id())
					? 2
					: 1;
				// open access for super admins to the section list of Time Machine notes
				if ( security::is_global_admin(logged_user_id()) ) {
					$this->permissions = 2;
				}
			}


		return $this->permissions;
	}//end get_permissions



	/**
	* SET_CREATED_DATE
	* Writes the created_date (dd199) value into the in-memory data_instance ('date' column).
	*
	* Converts a plain timestamp string to the internal dd_date format via
	* dd_date::get_dd_date_from_timestamp(), then stores it as a single-element array
	* matching the date datum shape: {start: <dd_date>, id: 1, lang: 'lg-nolan'}.
	*
	* Does NOT persist to the database; call save() or save_column('date', …) afterwards.
	* Primarily used by the import pipeline to preserve the original creation date of
	* imported records rather than generating a new timestamp.
	*
	* @param string $timestamp - timestamp string in "YYYY-MM-DD HH:II:SS" or "YYYY-MM-DD" format
	* @return void
	*/
	public function set_created_date(string $timestamp) : void {

		$dd_date	= dd_date::get_dd_date_from_timestamp($timestamp);
		$date_data	= new stdClass();
			$date_data->start	= $dd_date;
			$date_data->id		= 1;
			$date_data->lang	= DEDALO_DATA_NOLAN;

		$this->data_instance->set_key_data(
			'date',
			DEDALO_SECTION_INFO_CREATED_DATE, // dd199
			[$date_data]
		);
	}//end set_created_date



	/**
	* SET_MODIFIED_DATE
	* Writes the modified_date (dd201) value into the in-memory data_instance ('date' column).
	*
	* Same conversion and storage logic as set_created_date(), but targets the
	* DEDALO_SECTION_INFO_MODIFIED_DATE (dd201) tipo key.
	*
	* Does NOT persist to the database; call save() or save_column('date', …) afterwards.
	* Used by the import pipeline to override the modification timestamp of imported records.
	*
	* @param string $timestamp - timestamp string in "YYYY-MM-DD HH:II:SS" or "YYYY-MM-DD" format
	* @return void
	*/
	public function set_modified_date(string $timestamp) : void {

		$dd_date	= dd_date::get_dd_date_from_timestamp($timestamp);
		$date_data	= new stdClass();
			$date_data->start	= $dd_date;
			$date_data->id		= 1;
			$date_data->lang	= DEDALO_DATA_NOLAN;

		$this->data_instance->set_key_data(
			'date',
			DEDALO_SECTION_INFO_MODIFIED_DATE, // dd201
			[$date_data]
		);
	}//end set_modified_date



	/**
	* GET_CREATED_DATE
	* Returns the created_date (dd199) of this record as a formatted local timestamp
	* string, or null if the date has not been set.
	*
	* Reads the first element of the date array stored under DEDALO_SECTION_INFO_CREATED_DATE
	* (dd199) in the 'date' column, converts the dd_date format value using
	* dd_date::get_dd_timestamp(), and returns it formatted as "d-m-Y H:i:s".
	*
	* @return string|null - formatted creation date (e.g. "15-06-2024 10:30:00"), or null
	*/
	public function get_created_date() : ?string {

		$data = $this->data_instance->get_key_data('date', DEDALO_SECTION_INFO_CREATED_DATE);
		if( empty($data) || !isset($data[0]->start) ) {
			return null;
		}

		$dd_date		= new dd_date($data[0]->start);
		$local_value	= $dd_date->get_dd_timestamp('d-m-Y H:i:s', true);

		return $local_value;
	}//end get_created_date



	/**
	* GET_MODIFIED_DATE
	* Returns the modified_date (dd201) of this record as a formatted local timestamp
	* string, or null if the date has not been set.
	*
	* Same format and resolution logic as get_created_date(), but reads from
	* DEDALO_SECTION_INFO_MODIFIED_DATE (dd201) in the 'date' column.
	*
	* @return string|null - formatted modification date (e.g. "15-06-2024 10:30:00"), or null
	*/
	public function get_modified_date() : ?string {

		$data = $this->data_instance->get_key_data('date', DEDALO_SECTION_INFO_MODIFIED_DATE);
		if( empty($data) || !isset($data[0]->start) ) {
			return null;
		}

		$dd_date		= new dd_date($data[0]->start);
		$local_value	= $dd_date->get_dd_timestamp('d-m-Y H:i:s', true);

		return $local_value;
	}//end get_modified_date



	/**
	* GET_CREATED_BY_USER_ID
	* Returns the section_id (user PK) of the user who created this record, as stored
	* in the relation locator under DEDALO_SECTION_INFO_CREATED_BY_USER (dd200).
	*
	* Calls get_data() which may trigger a DB read on first access.
	* Reads the section_id of the first locator element ([0]) within the dd200 relation
	* array.  Returns null when the created_by_user component has not been set.
	*
	* @return int|null - user section_id, or null if not available
	*/
	public function get_created_by_user_id() : ?int {

		$data = $this->get_data();
		if( isset($data->relation->{DEDALO_SECTION_INFO_CREATED_BY_USER}) )  {

			return (int)$data->relation->{DEDALO_SECTION_INFO_CREATED_BY_USER}[0]->section_id;
		}



		return null;
	}//end get_created_by_user_id



	/**
	* SET_CREATED_BY_USER_ID
	* Writes the created_by_user (dd200) relation locator into the in-memory
	* data_instance ('relation' column).
	*
	* Constructs a locator pointing to the user record in DEDALO_SECTION_USERS_TIPO (dd128)
	* with the supplied $value as section_id.  The locator uses a fixed item id=1
	* (component-local sequential id, not the user's PK) and type DEDALO_RELATION_TYPE_LINK.
	*
	* Does NOT persist to the database; call save() or save_column('relation', …) afterwards.
	* Used primarily by the import pipeline to set the original record author.
	*
	* @param int $value - user section_id (PK in the users section dd128)
	* @return bool - always true
	*/
	public function set_created_by_user_id(int $value) : bool {

		$user_locator = new locator();
			$user_locator->set_id(1);
			$user_locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
			$user_locator->set_section_id($value);
			$user_locator->set_type(DEDALO_RELATION_TYPE_LINK);
			$user_locator->set_from_component_tipo(DEDALO_SECTION_INFO_CREATED_BY_USER);

		$this->data_instance->set_key_data(
			'relation',
			DEDALO_SECTION_INFO_CREATED_BY_USER,
			[$user_locator]
		);
		return true;
	}//end set_created_by_user_id



	/**
	* GET_MODIFIED_BY_USER_ID
	* Returns the section_id (user PK) of the user who last modified this record,
	* as stored in the relation locator under DEDALO_SECTION_INFO_MODIFIED_BY_USER (dd197).
	*
	* Reads directly from the data_instance 'relation' column without triggering a
	* full get_data() call.  Returns null when the modified_by_user component is absent
	* or the locator has no section_id.
	*
	* @return int|null - user section_id, or null if not available
	*/
	public function get_modified_by_user_id() : ?int {

		$data = $this->data_instance->get_key_data('relation', DEDALO_SECTION_INFO_MODIFIED_BY_USER);
		if( empty($data) || !isset($data[0]->section_id) ) {
			return null;
		}

		return (int)$data[0]->section_id;
	}//end get_modified_by_user_id



	/**
	* SET_MODIFIED_BY_USER_ID
	* Writes the modified_by_user (dd197) relation locator into the in-memory
	* data_instance ('relation' column).
	*
	* Same locator construction logic as set_created_by_user_id(), but targets
	* DEDALO_SECTION_INFO_MODIFIED_BY_USER (dd197).
	*
	* Does NOT persist to the database; call save() or save_column('relation', …) afterwards.
	* Used primarily by the import pipeline to set the original last-modifier.
	*
	* @param int $value - user section_id (PK in the users section dd128)
	* @return bool - always true
	*/
	public function set_modified_by_user_id(int $value) : bool {

		$user_locator = new locator();
			$user_locator->set_id(1);
			$user_locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
			$user_locator->set_section_id($value);
			$user_locator->set_type(DEDALO_RELATION_TYPE_LINK);
			$user_locator->set_from_component_tipo(DEDALO_SECTION_INFO_MODIFIED_BY_USER);

		$this->data_instance->set_key_data(
			'relation',
			DEDALO_SECTION_INFO_MODIFIED_BY_USER,
			[$user_locator]
		);
		return true;
	}//end set_modified_by_user_id



	/**
	* GET_CREATED_BY_USER_NAME
	* Returns the display name of the user who created this record.
	*
	* Resolves the user id via get_created_by_user_id() and then delegates to the
	* static get_user_name_by_user_id() helper.  Returns null when the created_by_user
	* component has not been set or the user id is empty.
	*
	* @param bool $full_name [= false] - true to return the full name, false for short username
	* @return string|null - user name string, or null if not available
	*/
	public function get_created_by_user_name(bool $full_name=false) : ?string {

		$user_id = $this->get_created_by_user_id();
		if( empty($user_id) ) {
			return null;
		}

		$user_name = section_record::get_user_name_by_user_id(
			$user_id,
			$full_name // bool full_name
		);

		return $user_name;
	}//end get_created_by_user_name



	/**
	* GET_MODIFIED_BY_USER_NAME
	* Returns the display name of the user who last modified this record.
	*
	* Resolves the user id via get_modified_by_user_id() and then delegates to the
	* static get_user_name_by_user_id() helper.  Returns null when the modified_by_user
	* component has not been set or the user id is empty.
	*
	* @param bool $full_name [= false] - true to return the full name, false for short username
	* @return string|null - user name string, or null if not available
	*/
	public function get_modified_by_user_name(bool $full_name=false) : ?string {

		$user_id = $this->get_modified_by_user_id();
		if( empty($user_id) ) {
			return null;
		}

		$user_name = self::get_user_name_by_user_id(
			$user_id,
			$full_name // bool full_name
		);

		return $user_name;
	}//end get_modified_by_user_name



	/**
	* GET_USER_NAME_BY_USER_ID
	* Static helper that resolves a user section_id to a display name string.
	*
	* The special sentinel DEDALO_SUPERUSER (-1) bypasses the component lookup and
	* returns a hardcoded label ('root' or 'Admin debugger') for safety.  For all
	* other user ids, the appropriate component tipo is selected:
	* - $full_name=false → DEDALO_USER_NAME_TIPO (short username, e.g. "jdoe")
	* - $full_name=true  → DEDALO_FULL_USER_NAME_TIPO (full display name, e.g. "John Doe")
	*
	* Instantiates the component using DEDALO_DATA_NOLAN (language-neutral), reads its
	* data, and returns the first string element [0].  Returns null when the component
	* has no data (user record not found or component empty).
	*
	* (!) The @return type annotation "@return string $user_name" is imprecise — the
	* actual return is string|null (nullable) as declared in the signature.
	*
	* @param int $userID - user section_id to resolve
	* @param bool $full_name [= true] - true for full name, false for short username
	* @return string|null - resolved name, or null if not found
	*/
	public static function get_user_name_by_user_id(int $userID, bool $full_name=true) : ?string {

		if($userID==DEDALO_SUPERUSER){
			$user_name = $full_name===false
				? 'root'
				: 'Admin debugger';
		}else{
			$tipo = $full_name===false
				? DEDALO_USER_NAME_TIPO
				: DEDALO_FULL_USER_NAME_TIPO;

			$full_username_model	= ontology_node::get_model_by_tipo($tipo,true);
			$component				= component_common::get_instance(
				$full_username_model, // 'component_input_text',
				$tipo,
				$userID,
				'list',
				DEDALO_DATA_NOLAN,
				DEDALO_SECTION_USERS_TIPO
			);
			$data		= $component->get_data();
			$user_name	= $data[0] ?? null;
		}

		return $user_name;
	}//end get_user_name_by_user_id



	/**
	* JSON_SERIALIZE
	* Returns the object's public properties as an associative array suitable for
	* json_encode(), omitting null values to keep API payloads compact.
	*
	* The null filter replicates the behaviour of PHP dynamic properties (pre-8.2)
	* where unset dynamic properties were naturally absent from serialisation.
	* Null values excluded here include unset optional state flags such as
	* $permissions (not set until get_permissions() is called).
	*
	* @return mixed - associative array of non-null public properties
	*/
	public function jsonSerialize() : mixed {

		$vars = get_object_vars($this);

		// filter out null values to keep payload small (as dynamic properties behaved before)
		return array_filter($vars, function($val) {
			return $val !== null;
		});
	}



}//end section_record
