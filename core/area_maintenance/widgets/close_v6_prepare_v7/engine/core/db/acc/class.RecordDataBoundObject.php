<?php declare(strict_types=1);
/**
* CLASS RECORDDATABOUNDOBJECT
* Abstract base class for PostgreSQL-backed active-record objects in Dédalo.
*
* Provides the core persistence infrastructure shared by all ontology-table
* and matrix-table record objects: column mapping, lazy loading, parameterised
* UPDATE/INSERT (with RETURNING), soft-delete via PHP destructor, and a
* static in-process query cache that avoids redundant round-trips for
* read-only data (ontology terms do not change at runtime).
*
* Concrete subclasses must implement three abstract methods that declare the
* target table, primary-key column name, and the column→property mapping
* (arRelationMap). The framework reads and writes only the columns listed in
* that map; extra DB columns are silently ignored.
*
* Known subclasses:
*   - RecordObj_dd         — dd_ontology / jer_dd ontology term records
*   - RecordObj_time_machine — matrix_time_machine change-history records
*
* Related:
*   - JSON_RecordDataBoundObject — parallel abstract base for JSON/matrix tables
*   - DBi                        — centralized PostgreSQL connection manager
*   - matrix_db_manager          — helper for ad-hoc queries (used in __destruct)
*
* Database table schema managed by RecordObj_dd (dd_ontology / jer_dd):
*   dd_ontology
*     id           integer  Auto Increment [nextval('dd_ontology_id_seq')]
*     terminoID    character varying(32) NULL
*     parent       character varying(32) NULL
*     modelo       character varying(8)  NULL
*     esmodelo     sino NULL
*     esdescriptor sino NULL
*     visible      sino NULL
*     norden       numeric(4,0) NULL
*     tld          character varying(32) NULL
*     is_translatable  true|false NULL
*     relaciones   text NULL
*     propiedades  text NULL   (legacy v6 — kept for backward compatibility)
*     properties   jsonb NULL  (v7 canonical — always prefer this column)
*     term         jsonb NULL
*
*   main_dd
*     id      integer Auto Increment [nextval('main_dd_id_seq')]
*     tld     character varying(32) NULL
*     counter integer NULL
*     name    character varying(255) NULL
*
* @package Dédalo
* @subpackage Core
*/
abstract class RecordDataBoundObject {

	/**
	* Auto-increment or string surrogate primary-key value for the current row.
	* Set in the constructor when an id is supplied; updated after a successful
	* INSERT (RETURNING) so the caller immediately has the new id.
	* @var string|int|null $ID
	*/
	protected $ID;

	/**
	* Name of the PostgreSQL table this object reads and writes.
	* Populated in __construct via defineTableName(); may be temporarily
	* overridden inside search() when a matrix_table argument is passed.
	* @var string|null $strTableName
	*/
	protected $strTableName;

	/**
	* Column→property mapping declared by each concrete subclass.
	* Keys are PostgreSQL column names (double-quoted in queries); values are
	* the matching PHP property names on this object. Load() iterates this map
	* to hydrate properties from the result row; Save() uses it to build
	* SET / VALUES clauses from the arModifiedRelations dirty-flag set.
	* @var array|null $arRelationMap
	*/
	protected $arRelationMap;

	/**
	* Name of the primary-key column, e.g. 'terminoID' for ontology rows or
	* 'id' for auto-increment integer PKs. Declared by definePrimaryKeyName().
	* @var string|null $strPrimaryKeyName
	*/
	protected $strPrimaryKeyName ; # usually id

	/**
	* Soft-delete flag. When true the __destruct() method executes a
	* DELETE statement via matrix_db_manager::exec_search().
	* Set exclusively by MarkForDeletion() / Delete().
	* @var bool|null $blForDeletion
	*/
	protected $blForDeletion;

	/**
	* Whether Load() has been called and succeeded for this instance.
	* Guards lazy-load triggers in get_dato() and GetAccessor().
	* @var bool $blIsLoaded
	*/
	public $blIsLoaded;

	/**
	* Dirty-flag map for the current write cycle.
	* Keys are PHP property names; value is always 1.
	* Populated by set_dato() and SetAccessor(); consumed by Save() to build
	* the minimal SET / VALUES clause (only modified columns are written).
	* @var array $arModifiedRelations
	*/
	public $arModifiedRelations;

	/**
	* Whether the static in-process cache is enabled for this instance.
	* Default true (safe for ontology / structure-only objects that never
	* change at runtime). Set to false for mutable data — e.g.
	* RecordObj_time_machine overrides this to false.
	* @var bool $use_cache
	*/
	public $use_cache = true; // default is true (for structure only)

	/**
	* Reserved flag for a cache-manager integration layer (not yet active).
	* Kept for forward compatibility; currently has no effect.
	* @var bool $use_cache_manager
	*/
	public $use_cache_manager = false;

	/**
	* Generic data column value, typically the raw content of a 'dato'
	* PostgreSQL column. Populated by Load(); accessed via get_dato() /
	* set_dato().
	* @var mixed $dato
	*/
	public $dato;

	#protected static $db_connection;

	#protected static $ar_RecordDataObject_query;
	#protected static $ar_RecordDataObject_query_search_cache;

	/**
	* When true, Save() always executes an INSERT even if $this->ID is set.
	* Allows callers to force creation of a new row while preserving a
	* caller-supplied id value. Default false (standard UPDATE-if-exists
	* / INSERT-if-new logic).
	* @var bool $force_insert_on_save
	*/
	protected $force_insert_on_save = false;

	/**
	* DEFINETABLENAME
	* Return the PostgreSQL table name this subclass operates against.
	* Called once in __construct(); result is stored in $strTableName.
	* @return string
	*/
	abstract protected function defineTableName();

	/**
	* DEFINERELATIONMAP
	* Return the column→property mapping array for this subclass.
	* Array keys are PostgreSQL column names; values are PHP property names.
	* Called once in __construct(); result is stored in $arRelationMap.
	* @return array
	*/
	abstract protected function defineRelationMap();

	/**
	* DEFINEPRIMARYKEYNAME
	* Return the name of the primary-key column for this subclass's table.
	* Called once in __construct(); result is stored in $strPrimaryKeyName.
	* @return string
	*/
	abstract protected function definePrimaryKeyName();



	/**
	* __CONSTRUCT
	* Initialises the active-record state by delegating table name, primary-key
	* name, and column map to the concrete subclass, then optionally binds the
	* provided id so that a subsequent Load() or Save() targets the right row.
	* @param string|null $id = null - primary-key value, e.g. 'dd73'
	* @return void
	*/
	public function __construct( ?string $id=null ) {

		$this->strTableName			= $this->defineTableName();
		$this->strPrimaryKeyName	= $this->definePrimaryKeyName();
		$this->arRelationMap		= $this->defineRelationMap();

		$this->blIsLoaded			= false;
		if(isset($id)) {
			$this->ID 				= $id;
		}
		$this->arModifiedRelations	= array();
	}//end __construct



	/**
	* GET_CONNECTION
	* Obtain a live PostgreSQL connection via the shared DBi connection pool.
	* Using this private wrapper (rather than calling DBi directly at each
	* site) lets the class log a single, consistent error when the pool cannot
	* satisfy the request and makes it easy to swap connection logic in one
	* place.
	*
	* Ontology tables require a dedicated connection entry point because they
	* may target a different host/database than the section-matrix tables, and
	* centralising the discriminator here prevents callers from hard-coding
	* connection constants.
	* @return PgSql\Connection|bool - active connection, or false on failure
	*/
	private function get_connection() : PgSql\Connection|bool {

		$connection = DBi::_getConnection(
			DEDALO_HOSTNAME_CONN, // string host
			DEDALO_USERNAME_CONN, // string user
			DEDALO_PASSWORD_CONN, // string password
			DEDALO_DATABASE_CONN, // string database
			DEDALO_DB_PORT_CONN, // ?string port
			DEDALO_SOCKET_CONN // ?string socket
		);
		// check valid connection
		if ($connection===false) {
			debug_log(__METHOD__
				." Invalid DDBB connection. Unable to connect (52-1)"
				, logger::ERROR
			);
		}


		return $connection;
	}//end get_connection



	/**
	* GET_DATO
	* Lazy-load accessor for the 'dato' column value.
	* Triggers a full row Load() on the first call so callers do not have to
	* manually call Load() before reading data. Returns null when the row does
	* not exist or the column is unset.
	* @return mixed - raw 'dato' column value, or null
	*/
	public function get_dato() {

		if($this->blIsLoaded!==true) {
			$this->Load();
		}

		$dato = $this->dato ?? null;

		return $dato;
	}//end get_dato



	/**
	* SET_DATO :
	* Write a new value for the 'dato' column and mark it dirty so Save()
	* includes it in the next UPDATE or INSERT.
	* The dirty flag is set unconditionally — even if $dato equals the
	* current value — because callers may deliberately re-save an unchanged
	* value to trigger side effects (e.g. updated timestamps in triggers).
	* @param mixed $dato
	* @return void
	*/
	public function set_dato( mixed $dato ) : void {

		// Always set dato as modified
		$this->arModifiedRelations['dato'] = 1;

		$this->dato = $dato;
	}//end set_dato



	/**
	* LOAD
	* Hydrate all mapped properties from the database row identified by
	* $this->ID. Uses a static per-process query cache keyed on the full SQL
	* string so that repeated loads of the same id (common during ontology
	* resolution) hit memory rather than PostgreSQL.
	*
	* The prepared-statement path reuses pg_prepare() keyed on method name +
	* table name; the statement is registered once per process in
	* DBi::$prepared_statements so duplicate pg_prepare() calls are avoided
	* across instances.
	*
	* Side effects:
	*   - Sets $this->blIsLoaded = true on success.
	*   - Increments metrics::$ontology_total_calls (and *_cached) when SHOW_DEBUG.
	*   - Logs a WARNING (not an error) when the row is not found; returns false.
	* @return bool - true on successful load; false when id is unset, DB fails,
	*                or no row matches $this->ID
	*/
	public function Load() : bool {

		// debug
			if(SHOW_DEBUG===true) {
				$start_time = start_time();

				// metrics
				metrics::$ontology_total_calls++;
			}

		// Prevent load if $this->ID is not set
			if(!isset($this->ID) || $this->ID===false) {
				return false;
			}

		// query
			$ar_query = [];

		// select
			$ar_query_select = array_map(function($el){
				return '"'.$el.'"';
			}, $this->arRelationMap);
			$select_fields	= implode(',', $ar_query_select);
			// $select_fields	= '*';
			$ar_query[]	= 'SELECT '.$select_fields;

		// from
			$ar_query[] = 'FROM "'.$this->strTableName.'"';

		// where
			$column_key		= $this->strPrimaryKeyName; // terminoID
			$column_value	= '\''. $this->ID .'\''; // e.g. 'dd15'
			$ar_query[] = 'WHERE "'.$column_key.'"='.$column_value;

		// $strQuery
			$strQuery = implode(' ', $ar_query);

		// CACHE_MANAGER
		// If a query is passed to it that has already been received, it does not connect to the db and it returns
		// the result of the identical query already calculated and stored in a static array.
		// This is reliable because the Ontology does not change at runtime.
		static $ar_RecordDataObject_load_query_cache = [];
		$use_cache = $this->use_cache;
		// if ($use_cache===true && isset($ar_RecordDataObject_load_query_cache[$strQuery])) {
		if ($use_cache===true && array_key_exists($strQuery, $ar_RecordDataObject_load_query_cache)) {

			// from cache data case

			$row = $ar_RecordDataObject_load_query_cache[$strQuery];

			if(SHOW_DEBUG===true) {
				// metrics
				metrics::$ontology_total_calls_cached++;
			}

		}else{

			// from DB request case

			// connection
				$conn = $this->get_connection();
				if ($conn===false) {
					debug_log(__METHOD__
						." Connection error. get_connection return false "
						, logger::ERROR
					);
					return false;
				}

			// exec query
				// Direct
				// $result = pg_query($conn, $strQuery);

				// With prepared statement
				// Prepared-statement name is scoped to method + table to avoid
				// collisions when multiple subclasses share the same process.
				$stmt_name = __METHOD__ . '_' . $this->strTableName;
				if (!isset(DBi::$prepared_statements[$stmt_name])) {
					pg_prepare(
						$conn,
						$stmt_name,
						'SELECT '.$select_fields.' FROM "'.$this->strTableName.'" WHERE "'.$this->strPrimaryKeyName.'" = $1'
					);
					// Set the statement as existing.
					DBi::$prepared_statements[$stmt_name] = true;
				}
				$result = pg_execute(
					$conn,
					$stmt_name,
					[$this->ID]
				);

			// check result
				if ($result===false) {
					debug_log(__METHOD__
						. " Error: DDBB query error ". PHP_EOL
						. ' error: ' .pg_last_error(DBi::_getConnection()) .PHP_EOL
						. ' strQuery: '.to_string($strQuery)
						, logger::ERROR
					);
					return false;
				}

			// rows. pg_fetch_assoc: false is returned if row exceeds the number of rows in the set, there are no more rows, or on any other error.
				$row = pg_fetch_assoc($result); // assoc array|false
					// sample row assoc array:
					// {
					//     "terminoID": "test24",
					//     "parent": "dd627",
					//     "modelo": "dd626",
					//     "esmodelo": "no",
					//     "esdescriptor": "si",
					//     "visible": "si",
					//     "norden": "18",
					//     "tld": "test",
					//     "is_translatable": false,
					//     "relaciones": null,
					//     "propiedades": "{\r\n  \"inverse_relations\": false\r\n}",
					//     "properties": "{\"inverse_relations\": false}"
					// }
				if ($row===false) {
					// if(SHOW_DEBUG===true) {
					// 	// dump($this,"WARNING: No result on Load arRow : strQuery:".$strQuery);
					// 	// throw new Exception("Error Processing Request (".DEDALO_DATABASE_CONN.") strQuery:$strQuery", 1);
					// 	dump($row, ' strQuery +++++++++++++++++++++++++++++++++++ '.DEDALO_DATABASE_CONN.PHP_EOL.to_string($strQuery)).PHP_EOL;
					// 	$bt = debug_backtrace();
					// 	dump($bt, ' Load pg_fetch_assoc bt +++++++++++++++++++++ '.to_string($this->ID));
					// }
					// // trigger_error('WARNING: No result on Load arRow. $strQuery: ' .PHP_EOL. $strQuery);
					debug_log(__METHOD__
						." 'WARNING: No result found on Load arRow" .PHP_EOL
						. ' last_error: ' .pg_last_error(DBi::_getConnection()) .PHP_EOL
						. ' strQuery: '.to_string($strQuery)
						, logger::WARNING
					);

					return false;
				}

			// cache
				if ($use_cache===true) {
					// store value
					$ar_RecordDataObject_load_query_cache[$strQuery] = $row;
				}
		}

		// arRelationMap assign values
		// Walk the fetched row and hydrate matching properties on $this.
		// The 'id' column is intentionally skipped here because $this->ID is
		// already authoritative (set in __construct). Consuming it from the
		// row would silently overwrite caller-supplied surrogate ids.
			if(isset($row) && is_array($row)) {
				foreach($row as $key => $value) {
					if ($key==='id') { continue; } // Ignore column id
					$strMember = $this->arRelationMap[$key] ?? null;
					if (!$strMember) {
						debug_log(__METHOD__
							. " WARNING: Ignored column. Property '$key' do not exists in " . get_called_class()
							, logger::WARNING
						);
						continue;
					}
					if(property_exists($this, $strMember)) {
						$this->{$strMember} = $value;
					}
				}
			}

		// Fix loaded state
			$this->blIsLoaded = true;

		// debug
			if(SHOW_DEBUG===true) {
				$total_time_ms = exec_time_unit($start_time,'ms');
				if($total_time_ms>SLOW_QUERY_MS) {
					debug_log(__METHOD__
						." 'WARNING: LOAD_SLOW_QUERY IN RECORDDATABOUNCEOBJECT !" .PHP_EOL
						. ' total_time_ms: ' .$total_time_ms . PHP_EOL
						. ' strQuery: '.to_string($strQuery)
						, logger::WARNING
					);
				}

				// metrics
				metrics::$ontology_total_time += $total_time_ms;
			}


		return true;
	}//end load



	/**
	* SAVE
	* Persist the current object state to PostgreSQL using either UPDATE or
	* INSERT depending on whether a row already exists.
	*
	* UPDATE path (ID is set and force_insert_on_save is false):
	*   Builds a parameterised UPDATE ... SET ... WHERE statement that touches
	*   only the columns flagged in arModifiedRelations. Arrays and objects are
	*   JSON-encoded before binding. Null bytes encoded as \u0000 are replaced
	*   with a space to prevent PostgreSQL encoding errors.
	*   If no columns are dirty the call is a no-op and $this->ID is returned.
	*
	* INSERT path (ID is null, empty, or force_insert_on_save is true):
	*   Builds a parameterised INSERT ... VALUES ... RETURNING statement.
	*   The returned PK value is stored back in $this->ID.
	*
	* @return string|int|null|false - $this->ID on success (updated or newly
	*   inserted); false if INSERT fails; null if ID was never set
	*/
	public function Save() {

		if(isset($this->ID) && strlen($this->ID)>0 && $this->force_insert_on_save!==true) {

			//
			// SAVE UPDATE. The record already exists and will be modified.
			//

			// query
			$ar_query = [];

			// update
			$ar_query[] = 'UPDATE "'.$this->strTableName.'" SET';

			// values
			// Build parallel arrays: $sentences holds the "col" = $N placeholders;
			// $values holds the bound values in matching positional order.
			$sentences = [];
			$values = [];
			$counter = 1;
			foreach($this->arRelationMap as $key => $value) {

				$actualVal = & $this->$value;

				if(array_key_exists($value, $this->arModifiedRelations)) {

					$current_val = $actualVal;#json_handler::encode($actualVal);

					if (is_object($current_val) || is_array($current_val)) {
						$current_val = json_handler::encode($current_val);
					}

					// Null-byte sanitisation
					// PostgreSQL rejects strings containing the \u0000 Unicode null codepoint
					// (both raw and JSON-escaped forms). Replace with a space to prevent
					// "invalid byte sequence" errors on UPDATE.
					$safe_value = is_string($current_val)
							? str_replace(['\\u0000','\u0000'], ' ', $current_val) // prevent null encoded errors
							: $current_val;

					$values[] = $safe_value;
					// build sentences with placeholders. E.g. "state" = $1
					$sentences[] = '"' . $key . '" = $' . $counter++;
				}
			}

			// pair sentences
			$ar_query[] = implode(',', $sentences);

			// where
			// $counter already advanced past all SET placeholders, so this uses
			// the next available positional parameter for the WHERE clause.
			$ar_query[] = 'WHERE "' . $this->strPrimaryKeyName .'" = $' . $counter++;

			// final strQuery string
			$strQuery = implode(' ', $ar_query);

			// Empty set elements values case
			if (empty($values)) {
				$msg = "Failed Save query (RDBO). Data is not saved because no vars are set to save. Elements to save: ".count( (array)$this->arRelationMap ) ;
				if(SHOW_DEBUG===true) {
					dump($strQuery, ' strQuery');
				}
				trigger_error($msg);

				// Because is not an error, only a impossible save query, notify and return normally
				return $this->ID;
			}

			// add $this->ID as last param
			$values[] = $this->ID;

			// exec query
				// $result = pg_query($this->get_connection(), $strQuery);
				$result = pg_query_params(
					$this->get_connection(),
					$strQuery,
					$values
				);
				if($result===false) {
					debug_log(__METHOD__
						. " Error: sorry an error occurred on UPDATE record ID: '$this->ID'. Data is not saved " .PHP_EOL
						. ' strQuery: ' . $strQuery . PHP_EOL
						. ' last_error: ' .pg_last_error(DBi::_getConnection())
						, logger::ERROR
					);
					if(SHOW_DEBUG===true) {
						dump($strQuery, "strQuery");
						throw new Exception("Error Processing Request", 1);
					}
				}
		}else{

			//
			// SAVE INSERT. The record does not exist and a new one will be created.
			//

			// query
			$ar_query = [];

			// insert
			$ar_query[] = 'INSERT INTO "'.$this->strTableName.'"';

			$columns = [];
			$values = [];
			foreach($this->arRelationMap as $key => $value) {

				$actualVal = & $this->$value;

				if(isset($actualVal)) {
					if(array_key_exists($value, $this->arModifiedRelations)) {

						$columns[] = $key;

						if (is_object($actualVal) || is_array($actualVal)) {
							$actualVal = json_handler::encode($actualVal);
						}

						// Null-byte sanitisation (same rule as in the UPDATE path above)
						$safe_value = is_string($actualVal)
							? str_replace(['\\u0000','\u0000'], ' ', $actualVal) // prevent null encoded errors
							: $actualVal;

						$values[] = $safe_value;
					}
				}
			}

			// columns
			$ar_query[] = '("' . implode('","', $columns) . '")';

			// values
			// placeholders as $1,$2,$3 to use pg_params
			$placeholders = array_map(function($key) {
			    return '$' . ($key + 1);
			}, array_keys($values));
			$ar_query[] = 'VALUES (' . implode(',', $placeholders) . ')';

			// returning id
			// RETURNING causes PostgreSQL to echo the newly assigned PK value
			// so we can update $this->ID without a second SELECT.
			$ar_query[] = 'RETURNING "'.$this->strPrimaryKeyName.'"';

			// final strQuery string
			$strQuery = implode(' ', $ar_query);

			// exec query
				// $result = pg_query($this->get_connection(), $strQuery);
				$result = pg_query_params(
					$this->get_connection(),
					$strQuery,
					$values
				);
				if ($result===false) {
					debug_log(__METHOD__
						." Error: DDBB query error. INSERT record. Data is not saved ". PHP_EOL
						. pg_last_error(DBi::_getConnection()) .PHP_EOL
						. to_string($strQuery)
						, logger::ERROR
					);
					if(SHOW_DEBUG===true) {
						throw new Exception("Error Processing Save Insert Request (1). error: ". pg_last_error(DBi::_getConnection()), 1);
					}
					return false;
				}

			$id = pg_fetch_result($result, 0, '"'.$this->strPrimaryKeyName.'"');
			if ($id===false) {
				debug_log(__METHOD__
					. " Error Processing Request (1-b) ". PHP_EOL
					. ' last_error: '. pg_last_error(DBi::_getConnection()) .PHP_EOL
					. ' strQuery: ' . to_string($strQuery)
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					dump($strQuery,"strQuery");
					throw new Exception("Error Processing Request (1-b): ". pg_last_error(DBi::_getConnection()), 1);
				}
			}
			// Fix new received id
			$this->ID = $id;
		}


		return $this->ID;
	}//end Save



	/**
	* MARKFORDELETION
	* Schedule this record for physical DELETE from the database.
	* The DELETE is deferred to __destruct() so callers can keep using the
	* object until the end of the current scope without an extra round-trip.
	* @return void
	*/
	# DELETE
	public function MarkForDeletion() : void {
		$this->blForDeletion = true;
	}

	/**
	* DELETE
	* Alias of MarkForDeletion(). Schedules the row for deletion on destruct.
	* @return void
	*/
	# ALIAS OF MarkForDeletion
	public function Delete() : void {
		$this->MarkForDeletion();
	}


	/**
	* GET_AR_EDITABLE_FIELDS
	* Return the list of PostgreSQL column names that may be written by
	* external callers (i.e. all columns in arRelationMap except the primary
	* key 'ID' property, which is managed internally).
	* Result is cached in a static variable — the map is defined once per
	* subclass and never changes at runtime.
	* @return array - column names from arRelationMap where the mapped property
	*   is not 'ID'; empty array when arRelationMap is not set
	*/
	# ARRAY EDITABLE FIELDS
	public function get_ar_editable_fields() : array {

		// cache
			static $ar_editable_fields;
			if(isset($ar_editable_fields)) {
				return $ar_editable_fields;
			}

		// arRelationMap values
			if(is_array($this->arRelationMap)) {

				foreach($this->arRelationMap as $field_name => $property_name) {

					if($property_name!=='ID') {
						$ar_editable_fields[] = $field_name;
					}
				}

				return $ar_editable_fields ;
			}


		return [];
	}//end get_ar_editable_fields



	/**
	* SEARCH
	* Generic, multi-predicate search over the object's table. Returns an
	* array of primary-key values (not full record objects) matching the
	* supplied criteria. Uses a static in-process cache keyed on the final SQL
	* string; only positive (non-empty) result sets are cached to prevent
	* stale empty-results from masking newly inserted rows in the same request.
	*
	* $ar_arguments is an associative array where each key encodes both a
	* column name and an optional operator suffix, and each value supplies the
	* operand. The supported key formats are:
	*
	*   'strPrimaryKeyName'        — override the PK column used in SELECT
	*   'sql_code'                 — raw SQL fragment appended verbatim (use with caution)
	*   'column:%like%'            — ILIKE '%value%'
	*   'column:not_like'          — NOT LIKE 'value'
	*   'column:!='                — != 'value'
	*   'column:not_null'          — IS NOT NULL
	*   'column:or'                — value is array; joined with OR = 'v1' OR = 'v2'
	*   'column:unaccent_begins_or'— unaccent() ILIKE 'v%' OR ... (requires pg_unaccent extension)
	*   'column:begins_or'         — ILIKE 'v1%' OR ILIKE 'v2%'
	*   'sql_limit'                — LIMIT N (integer cast)
	*   'offset'                   — OFFSET N (integer cast)
	*   'group_by'                 — GROUP BY value
	*   'order_by_asc'             — ORDER BY value ASC
	*   'order_by_desc'            — ORDER BY value DESC
	*   'column:begins'            — ILIKE 'value%'
	*   'column:json_exact'        — = 'value' (exact JSON text match)
	*   'column:json_or'           — value is array; ILIKE '%v1%' OR ILIKE '%v2%'
	*   'column:json_begins'       — ILIKE 'value%'
	*   'column:json_element'      — LIKE '%value%' (positional JSON array element)
	*   'column:json'              — ILIKE '%value%'
	*   'column:key-json'          — LIKE '%key:value%' (key:value pair inside JSON text)
	*   default                    — = 'value' (or = value for non-dato integers)
	*
	* (!) Note: 'sql_code' values are interpolated directly into the query
	* string without parameterisation. Callers are responsible for ensuring
	* safe input; this is an internal API only.
	*
	* @param array $ar_arguments - search predicates using the key-format conventions above
	* @param string|null $matrix_table = null - when set, temporarily overrides strTableName
	* @return array $ar_records - ordered list of matching primary-key values
	*/
	public function search( array $ar_arguments, ?string $matrix_table=null ) : array {
		if(SHOW_DEBUG===true) $start_time = start_time();

		// default value
			$ar_records = [];

		// matrix_table. Optionally change table temporally for search
			if (!empty($matrix_table)) {
				$this->strTableName = $matrix_table;
			}else{
				// forces to recalculate the table name
				// Note that in recovery_mode changes on the fly
				$this->strTableName = $this->defineTableName();
			}

		$strPrimaryKeyName	= $this->strPrimaryKeyName;
		$strQuery			= '';
		$strQuery_limit		= '';
		$strQuery_offset	= '';
		$SQL_CACHE			= false;

		if(is_array($ar_arguments)) foreach($ar_arguments as $key => $value) {

			switch(true) {	#"AND dato LIKE  '%\"{$area_tipo}\"%' ";

				# If $key is 'strPrimaryKeyName', use its value as the PK column for this search
				case ($key==='strPrimaryKeyName'):
					$strPrimaryKeyName = $value;
					break;

				# If $key is 'sql_code', the value is treated as a literal SQL fragment
				case ($key==='sql_code'):
					$strQuery .= $value.' ';
					break;

				# LIKE_%
				case (strpos($key,':%like%')!==false):
					$campo = substr($key, 0, strpos($key,':%like%'));
					$strQuery .= 'AND "'.$campo.'" ILIKE \'%'.$value.'%\' ';
					break;
				# NOT_LIKE
				case (strpos($key,':not_like')!==false):
					$campo = substr($key, 0, strpos($key,':not_like'));
					$strQuery .= 'AND "'.$campo.'" NOT LIKE \''.$value.'\' ';
					break;

				# NOT
				case (strpos($key,':!=')!==false):
					$campo = substr($key, 0, strpos($key,':!='));
					$strQuery .= 'AND "'.$campo.'" != \''.$value.'\' ';
					break;

				# IS NOT NULL
				case (strpos($key,':not_null')!==false):
					$campo = substr($key, 0, strpos($key,':not_null'));
					$strQuery .= 'AND "'.$campo.'" IS NOT NULL ';
					break;

				# OR (format lan:or= array('DEDALO_DATA_LANG',DEDALO_DATA_NOLAN))
				case (strpos($key,':or')!==false):
					$campo = substr($key, 0, strpos($key,':or'));
					$strQuery_temp ='';
					foreach ($value as $value_string) {
						$strQuery_temp .= '"'.$campo.'" = \''.$value_string.'\' OR ';
					}
					$strQuery .= 'AND ('. substr($strQuery_temp, 0,-4) .') ';
					break;

				case (strpos($key,':unaccent_begins_or')!==false):
					$campo = substr($key, 0, strpos($key,':unaccent_begins_or'));
					$strQuery_temp ='';
					if(is_array($value)) foreach ($value as $value_string) {
						$strQuery_temp .= 'unaccent("'.$campo.'") ILIKE unaccent(\''.$value_string.'%\') OR ';
					}
					$strQuery .= 'AND ('. substr($strQuery_temp, 0,-4) .') ';
					break;

				# begins_or (format begins_or:or= array('DEDALO_DATA_LANG',DEDALO_DATA_NOLAN))
				case (strpos($key,':begins_or')!==false):
					$campo = substr($key, 0, strpos($key,':begins_or'));
					$strQuery_temp ='';
					if(is_array($value)) foreach ($value as $value_string) {
						$strQuery_temp .= '"'.$campo.'" ILIKE \''.$value_string.'%\' OR ';
					}
					$strQuery .= 'AND ('. substr($strQuery_temp, 0,-4) .') ';
					break;
				# LIMIT
				case ($key==='sql_limit'):
					$strQuery_limit = ' LIMIT '.(int)$value.' ';
					break;
				# OFFSET
				case ($key==='offset'):
					$strQuery_offset = ' OFFSET '.(int)$value.' ';
					break;

				# If $key is 'group_by', the value is used as: GROUP BY $value
				case ($key==='group_by'):
					$strQuery .= 'GROUP BY '.$value.' ';
					break;

				# If $key is 'order_by_asc', the value is used as: ORDER BY $value ASC
				case ($key==='order_by_asc'):
					$strQuery .= 'ORDER BY '.$value.' ASC ';
					break;

				# If $key is 'order_by_desc', the value is used as: ORDER BY $value DESC
				case ($key==='order_by_desc'):
					$strQuery .= 'ORDER BY '.$value.' DESC ';
					break;

				# BEGINS
				case (strpos($key,':begins')!==false):
					$campo = substr($key, 0, strpos($key,':begins'));
					$strQuery .= 'AND "'.$campo.'" ILIKE \''.$value.'%\' ';
					break;

				# JSON BEGINS
				case (strpos($key,':json_exact')!==false):
					$campo = substr($key, 0, strpos($key,':json_exact'));
					$strQuery .= 'AND "'.$campo.'" = \''.$value.'\' ';
					break;

				# JSON OR (format lan:or= array('DEDALO_DATA_LANG',DEDALO_DATA_NOLAN))
				case (strpos($key,':json_or')!==false):
					$campo = substr($key, 0, strpos($key,':json_or'));
					$strQuery_temp ='';
					foreach ($value as $value_string) {
						$strQuery_temp .= '"'.$campo.'" ILIKE \'%'.$value_string.'%\' OR ';
					}
					$strQuery .= 'AND ('. substr($strQuery_temp, 0,-4) .') ';
					#dump ($strQuery,'strQuery');
					break;

				# JSON BEGINS
				case (strpos($key,':json_begins')!==false):
					$campo = substr($key, 0, strpos($key,':json_begins'));
					$strQuery .= 'AND "'.$campo.'" ILIKE \''.$value.'%\' ';
					break;

				# JSON_ELEMENT
				# Example: locator inside array like '{"section_top_tipo":"oh1","section_top_id_matrix":"47","section_id_matrix":"63","component_tipo":"rsc36","tag_id":"2"}'
				case (strpos($key,':json_element')!==false):
					$campo = substr($key, 0, strpos($key,':json_element'));
					$strQuery .= 'AND "'.$campo.'" LIKE \'%'.$value.'%\' ';
					#$strQuery .= "AND match($campo) against('%\"{$value}\"%' IN BOOLEAN MODE) ";
					break;
				# JSON
				case (strpos($key,':json')!==false):
					$campo = substr($key, 0, strpos($key,':json'));
					$strQuery .= 'AND "'.$campo.'" ILIKE \'%'.$value.'%\' ';
					#$strQuery .= "AND match($campo) against('%\"{$value}\"%' IN BOOLEAN MODE) ";
					#dump($strQuery,'$strQuery');
					break;

				# SQL_CACHE
					// case ($key=='sql_cache'):
					// 	if(!$SQL_CACHE && $value) $SQL_CACHE = 'SQL_CACHE ';
					// 	break;

				# KEY-JSON ( format like "created_by_userID":"114" )
				case (strpos($key,':key-json')!==false):
					$campo = substr($key, 0, strpos($key,':key-json'));
					if (strpos($value, ':')!==false) {
						$ar = explode(':', $value);
						if(isset($ar[0]) && isset($ar[1])) {
							$ar_key		= $ar[0];
							$ar_value	= $ar[1];
							#if (is_int($ar_value)) {
							#	$strQuery  .= "AND $campo LIKE '%\"{$ar_key}\":{$ar_value}%' ";
							#}else{
								$strQuery  .= 'AND "'.$campo.'" LIKE \'%'.$ar_key.':'.$ar_value.'%\' ';
							#}
						}
					}
					break;

				# DEFAULT. General case: use the key as the column and the value as an equality operand.
				# Integer values on non-dato columns are bound without quotes; all others use string quoting.
				default :
					$strQuery .= (is_int($value) && strpos($key, 'dato')===false)
						? 'AND "'.$key.'"='.$value.' '
						: 'AND "'.$key.'"=\''.$value.'\' ';
					break;

			}#end switch(true)
		}#end foreach($ar_arguments as $key => $value)

		# Security comment (original kept for audit trail)
		#if(strpos(strtolower($strQuery), 'update')!=='false' || strpos(strtolower($strQuery), 'delete')!=='false') die("SQL Security Error ". strtolower($strQuery) );

		// Verify query format
		// When all predicates are AND-clauses the built fragment starts with
		// 'AND'; strip the leading operator before embedding in SELECT ... WHERE.
			if(strpos($strQuery, 'AND')===0) {
				$strQuery = substr($strQuery, 4);
			}else if(strpos($strQuery, ' AND')===0) {
				$strQuery = substr($strQuery, 5);
			}

		// strQuery
		$strQuery = trim('SELECT '. $SQL_CACHE .'"'.$strPrimaryKeyName. '" FROM "'.$this->strTableName.'" WHERE '. $strQuery . $strQuery_limit . $strQuery_offset);
		// error_log('------ strQuery >>>> '.$strQuery);

		// CACHE : Static var
		// If the same query string has already been executed in this process,
		// return the cached result set without a DB round-trip.
		static $ar_RecordDataObject_query_search_cache;

		# CACHE
		$use_cache = $this->use_cache;
		if($use_cache===true && isset($ar_RecordDataObject_query_search_cache[$strQuery])) {

			# DATA IS IN CACHE . Return value form memory

			$ar_records	= $ar_RecordDataObject_query_search_cache[$strQuery];
			// error_log('CACHE-search-'.$strQuery);

		}else{

			# DATA IS NOT IN CACHE . Searching real data in DB

			$connection = $this->get_connection();
			if ($connection===false) {
				debug_log(__METHOD__." Connection error. Return empty array ".to_string(), logger::ERROR);
				return [];
			}
			$result = pg_query($this->get_connection(), $strQuery);
			if ($result===false) {
				debug_log(__METHOD__
					. " Error on DB query " . PHP_EOL
					. ' last_error: ' . pg_last_error(DBi::_getConnection()) . PHP_EOL
					. ' strQuery: ' . $strQuery
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					// throw new Exception("Error Processing Request . ".pg_last_error(DBi::_getConnection()), 1);
					// }else{
					// trigger_error("Error on DB query");
				}
				return [];
			}
			while ($rows = pg_fetch_assoc($result)) {
				$ar_records[] = $rows[$strPrimaryKeyName];
			}

			// (!) Only cache non-empty result sets.
			// Caching empty results is dangerous: if search() is called before
			// a row is inserted and again immediately after, the second call
			// would return the stale empty array.
			// Example: component_common::get_id_by_tipo_parent() creates a
			// matrix relation record and then re-checks; caching [] there
			// causes duplicate row creation.
			$n_records = is_countable($ar_records) ? sizeof($ar_records) : 0;
			if($use_cache===true && $n_records>0) {
				// store value
				$ar_RecordDataObject_query_search_cache[$strQuery] = $ar_records;
			}

			// debug
				if(SHOW_DEBUG===true) {
					$total_time_ms = exec_time_unit($start_time,'ms');
					if($total_time_ms>SLOW_QUERY_MS) {
						debug_log(__METHOD__
							." 'WARNING: LOAD_SLOW_QUERY IN RECORDDATABOUNCEOBJECT !" .PHP_EOL
							. ' total_time_ms: ' .$total_time_ms . PHP_EOL
							. ' strQuery: ' . $strQuery
							, logger::WARNING
						);
					}
				}
		}


		return $ar_records;
	}//end search



	/**
	* __DESTRUCT
	* PHP object destructor. When $this->blForDeletion is true (set via
	* MarkForDeletion() / Delete()), issues a parameterised DELETE against
	* the table using matrix_db_manager::exec_search() and throws a runtime
	* Exception on failure so callers are not silently left with a dangling
	* reference.
	*
	* The commented-out connection-close / commit calls are intentionally left
	* in place; connection lifecycle is managed by DBi and must not be closed
	* here.
	* @throws Exception when the DELETE query fails
	*/
	# DESTRUCT
	public function __destruct() {

		if( isset($this->ID) ) {

			if($this->blForDeletion===true) {

				$sql = "DELETE FROM \"$this->strTableName\" WHERE \"$this->strPrimaryKeyName\" = $1";

				$result	= matrix_db_manager::exec_search($sql, [$this->ID]);
				if($result===false) {
					if(SHOW_DEBUG===true) {
						$msg = __METHOD__." Failed Delete record (RDBO) from {$this->strPrimaryKeyName}: $this->ID";
					}else{
						$msg = "Failed Delete record (RDBO). Record $this->ID is not deleted. Please contact with your admin" ;
					}
					trigger_error($msg);
					debug_log(__METHOD__
						. ' ' . $msg .PHP_EOL
						. ' sql: ' . to_string($sql)
						, logger::ERROR
					);
					throw new Exception($msg, 1);
				}
			}
		}
		# close connection
		#$this->get_connection()->close();
		#$this->get_connection()->commit();
	}//end __destruct



	/**
	* __CALL
	* Magic method that implements a generic dynamic accessor interface.
	* Any call to $obj->set_<property>($value) delegates to SetAccessor();
	* any call to $obj->get_<property>() delegates to GetAccessor().
	* This keeps the concrete subclass property declarations minimal while
	* still exposing a conventional get/set API to external callers.
	*
	* Only the 'set_' and 'get_' prefixes (exactly four characters each) are
	* handled; any other dynamic call returns false.
	* @param string $strFunction - method name called by the client
	* @param array $arArguments - arguments passed to the dynamic call
	* @return mixed - result of SetAccessor / GetAccessor, or false
	*/
	# ACCESSORS CALL
	final public function __call(string $strFunction, array $arArguments) {

		$strMethodType 		= substr($strFunction, 0, 4); # like set or get_
		$strMethodMember 	= substr($strFunction, 4);
		switch($strMethodType) {
			case 'set_' : return($this->SetAccessor($strMethodMember, $arArguments[0]));	break;
			case 'get_' : return($this->GetAccessor($strMethodMember));						break;
		}
		return false;
	}

	/**
	* SETACCESSOR
	* Write a named property and add it to the dirty-flag map so Save()
	* includes it in the next UPDATE or INSERT.
	* Returns true when the property exists on this instance; false otherwise.
	* @param string $strMember - PHP property name (no prefix)
	* @param mixed $strNewValue - new value to assign
	* @return bool
	*/
	# ACCESSORS SET
	private function SetAccessor(string $strMember, $strNewValue) {

		if(property_exists($this, $strMember)) {

			// fix property value
			$this->$strMember = $strNewValue;

			$this->arModifiedRelations[$strMember] = 1;

			return true;
		}else{
			return false;
		}
	}

	/**
	* GETACCESSOR
	* Lazy-load accessor for an arbitrary named property. Triggers Load()
	* if the object has not yet been hydrated from the database.
	* Returns the property value when it exists; false when the property is
	* not declared on this instance.
	* @param string $strMember - PHP property name (no prefix)
	* @return mixed|false - property value or false when property does not exist
	*/
	# ACCESSORS GET
	private function GetAccessor(string $strMember) {

		if($this->blIsLoaded != true) {
			$this->Load();
		}

		return property_exists($this, $strMember)
			? $this->$strMember
			: false;
	}//end GetAccessor



}//end RecordDataBoundObject class
