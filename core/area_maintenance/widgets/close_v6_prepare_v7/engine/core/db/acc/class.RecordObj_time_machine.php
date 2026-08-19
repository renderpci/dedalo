<?php declare(strict_types=1);
/**
* CLASS RECORDOBJ_TIME_MACHINE
* Active-record accessor for the `matrix_time_machine` versioning table.
*
* Every time a component value is saved, JSON_RecordObj_matrix::save_time_machine()
* instantiates this class, populates it via the magic set_* accessors inherited from
* RecordDataBoundObject, and calls Save() to persist a snapshot row.  The row
* captures who changed what, in which language, and at what moment, so the
* time-machine tool can later restore any prior state of a record.
*
* Responsibilities:
* - Declares the column ↔ property mapping for `matrix_time_machine` via defineRelationMap().
* - Overrides get_dato() / set_dato() to transparently JSON-decode/encode the `dato`
*   column, which stores the serialised component datum as JSONB.
* - Exposes get_ar_time_machine_of_this() as a static convenience method for fetching
*   all snapshot IDs for a given component locator (section_tipo + section_id + tipo + lang),
*   ordered newest-first by timestamp.
*
* Key design decisions:
* - use_cache is forced to false because versioning rows are written at every save; a
*   cached empty result from a previous request would cause duplicate "backfill" snapshots
*   (see the $data_already_exists guard in JSON_RecordObj_matrix::save_time_machine()).
* - save_time_machine_version is a legacy static flag; the canonical gate is now
*   tm_record::$save_tm (checked in JSON_RecordObj_matrix before this class is used).
*
* Table shape (matrix_time_machine):
*   id              — serial PK, auto-assigned on insert (not in defineRelationMap)
*   bulk_process_id — optional reference to the bulk-process section_id that triggered
*                     this save (null for interactive saves)
*   section_id      — numeric record id of the section that owns the component
*   section_tipo    — ontology tipo of the owning section (e.g. 'oh1')
*   tipo            — ontology tipo of the component whose datum is snapshotted
*   lang            — active language code at save time (e.g. 'lg-spa', DEDALO_DATA_NOLAN)
*   timestamp       — server-side save time (PostgreSQL DEFAULT now())
*   userID          — section_id of the logged-in user who triggered the save
*   state           — lifecycle marker; 'created' is set when tipo === section_tipo
*   dato            — JSONB snapshot of the component datum at save time
*   section_id_key  — dataframe sub-row key; kept for legacy compatibility
*
* Related classes:
*   RecordDataBoundObject          — parent; provides Load/Save/search/magic accessors
*   JSON_RecordObj_matrix          — calls Save() on every component write
*   tm_record / tm_db_manager      — newer, preferred domain layer for reading TM rows
*   class.search_tm.php            — SQO search layer for matrix_time_machine
*
* @package Dédalo
* @subpackage Core
*/
class RecordObj_time_machine extends RecordDataBoundObject {



	// matrix columns

	/**
	* Optional reference to the bulk-process section_id that grouped this save.
	* Null for ordinary interactive saves; set by JSON_RecordObj_matrix when a
	* bulk operation (e.g. portalize) provides a time_machine_bulk_process_id.
	* @var mixed $bulk_process_id
	*/
	protected $bulk_process_id; // used for bulk processes as common id (section_id of the bulk process section)

	/**
	* Numeric record id of the section that owns the snapshotted component.
	* @var mixed $section_id
	*/
	protected $section_id;

	/**
	* Ontology tipo of the section that owns the snapshotted component (e.g. 'oh1').
	* @var mixed $section_tipo
	*/
	protected $section_tipo;

	/**
	* Ontology tipo of the component whose datum is snapshotted (e.g. 'rsc36').
	* @var mixed $tipo
	*/
	protected $tipo;

	/**
	* Language code active at save time (e.g. 'lg-spa', DEDALO_DATA_NOLAN).
	* @var mixed $lang
	*/
	protected $lang;

	/**
	* Server-side timestamp of the save, in standard PostgreSQL format.
	* Set explicitly by JSON_RecordObj_matrix from the time_machine_date option so
	* that backfill saves can use the original creation date rather than now().
	* @var mixed $timestamp
	*/
	protected $timestamp;

	/**
	* Section_id of the logged-in user who triggered the save.
	* Populated via set_userID(logged_user_id()) in JSON_RecordObj_matrix.
	* @var mixed $userID
	*/
	protected $userID;

	/**
	* Lifecycle marker for this snapshot row.
	* Set to 'created' when the snapshot records a section-creation event
	* (i.e. when tipo === section_tipo).  Empty for ordinary component updates.
	* @var mixed $state
	*/
	protected $state;

	/**
	* Serialised component datum at save time.
	* Stored as JSONB in the database; get_dato() decodes it to a PHP value and
	* set_dato() re-encodes it before persisting.  The public visibility matches
	* the parent's property declaration and is required by RecordDataBoundObject::Load().
	* @var mixed $dato
	*/
	public $dato;

	/**
	* Dataframe sub-row key kept for legacy compatibility.
	* A TODO comment in JSON_RecordObj_matrix notes this column may be removed once
	* the dataframe is fully saved with main data.
	* @var mixed $section_id_key
	*/
	protected $section_id_key; // used by component_dataframe

	// table matrix_table

	/**
	* Name of the PostgreSQL table this class maps to.
	* Declared as a static string so that parent::search() can resolve it via
	* defineTableName() without instantiating additional objects.
	* @var string $matrix_table
	*/
	protected static $matrix_table = 'matrix_time_machine';

	/**
	* Legacy flag that was once used to skip the time-machine save during bulk imports.
	* The canonical gate is now tm_record::$save_tm (checked in JSON_RecordObj_matrix
	* before this class is instantiated).  This property is kept for backward compat
	* but is no longer consulted by the save path.
	* @var bool $save_time_machine_version
	*/
	static $save_time_machine_version = true;

	/**
	* Whether the parent's static query cache should be used for Load()/search() calls.
	* Forced to false because time-machine rows are inserted at runtime; a cached empty
	* result from a previous request would cause JSON_RecordObj_matrix to incorrectly
	* conclude that no prior snapshot exists, leading to duplicate backfill entries.
	* @var bool $use_cache
	*/
	public $use_cache = false; // overwrite default that is true (for structure only)

	/**
	* Whether the cache manager should be engaged for this object's queries.
	* Kept false for the same reasons as $use_cache.
	* @var bool $use_cache_manager
	*/
	public $use_cache_manager = false;



	/**
	* __CONSTRUCT
	* Delegates immediately to RecordDataBoundObject::__construct(), which sets up
	* the table name, primary-key name, and relation map, then optionally pre-loads
	* the row with the given id.
	* @param ?string $id = null - Primary key of an existing row, or null when
	*   creating a new snapshot (the Insert path in RecordDataBoundObject::Save()).
	*/
	public function __construct( ?string $id=null ) {
		parent::__construct($id);
	}

	/**
	* DEFINETABLENAME
	* Returns the PostgreSQL table this object maps to.
	* Called by RecordDataBoundObject::__construct() to initialise $strTableName.
	* @return string - Always 'matrix_time_machine'.
	*/
	# define current table (tr for this obj)
	protected function defineTableName() : string {
		return self::$matrix_table;
	}
	/**
	* DEFINEPRIMARYKEYNAME
	* Returns the column used as the primary key in WHERE clauses and RETURNING.
	* Called by RecordDataBoundObject::__construct() to initialise $strPrimaryKeyName.
	* @return string - Always 'id'.
	*/
	# define PrimaryKeyName (id)
	protected function definePrimaryKeyName() : string {
		return 'id';
	}
	/**
	* DEFINERELATIONMAP
	* Returns the bidirectional column-name ↔ property-name map that drives
	* RecordDataBoundObject::Load(), Save(), and search().
	*
	* The `id` column is intentionally commented out: it is auto-assigned by
	* PostgreSQL on INSERT (RETURNING "id") and must never appear in SET lists.
	* RecordDataBoundObject::Load() skips column 'id' explicitly when assigning
	* properties, so the omission here prevents accidental SET id = $n writes.
	*
	* Column types are noted inline to aid callers that need to cast raw pg_* strings:
	* - Integer columns: bulk_process_id, section_id, userID, section_id_key.
	* - JSON column: dato (stored as JSONB; decoded/encoded by get_dato/set_dato).
	* - Timestamp column: timestamp (standard PostgreSQL timestamp format).
	* @return array<string,string> - Map of DB column name => PHP property name.
	*/
	# array of pairs db field name, obj property name like fieldName => propertyName
	protected function defineRelationMap() : array {
		return [
			# db field name		# property name
			// 'id'				=> 'ID',				// integer
			'bulk_process_id'	=> 'bulk_process_id',	// integer
			'section_id'		=> 'section_id',		// integer
			'section_tipo'		=> 'section_tipo',		// string varchar 32
			'tipo'				=> 'tipo',				// string varchar 32
			'lang'				=> 'lang',				// string 16
			'timestamp'			=> 'timestamp',			// timestamp standard db format
			'userID'			=> 'userID',			// integer
			'state'				=> 'state',				// string char 32
			'dato'				=> 'dato',				// jsonb format
			'section_id_key'	=> 'section_id_key'	// integer
		];
	}//end defineRelationMap



	/**
	* GET_DATO
	* Retrieves the `dato` column value and JSON-decodes it before returning.
	*
	* Delegates to parent::get_dato() which triggers Load() if the row has not
	* been fetched yet, then decodes the raw JSONB string with json_handler::decode().
	* An empty raw value (null or empty string) is returned as-is without decoding
	* to avoid json_handler errors on absent snapshots.
	*
	* Callers receiving null back should treat the absence of a snapshot as a
	* legitimate "no prior version" state rather than an error.
	* @return mixed - Decoded PHP value (array/object/scalar) on success; null or
	*   empty string when the column is absent.
	*/
	public function get_dato() {
		$dato = parent::get_dato();
		if(!empty($dato)){
			$dato = json_handler::decode($dato);
		}
		return $dato;
	}//end get_dato



	/**
	* SET_DATO :
	* Set dato unified method (JSON)
	* JSON-encodes the given value before handing it to the parent setter, which
	* marks the property as modified so Save() will include it in the UPDATE/INSERT.
	*
	* (!) Always pass the raw PHP component datum here (array/object/scalar).
	* Do not pre-encode: calling this method twice with an already-encoded string
	* would double-encode and corrupt the stored snapshot.
	* @param mixed $dato - Raw PHP value to snapshot (component datum, not pre-encoded).
	*/
	public function set_dato( mixed $dato ) : void {
		$dato = json_handler::encode($dato);

		parent::set_dato( $dato );
	}//end set_dato



	/**
	* GET_AR_TIME_MACHINE_OF_THIS
	* Returns the list of `matrix_time_machine` row IDs that match the given
	* component locator, ordered newest-first by timestamp.
	*
	* Used in two contexts:
	* 1. JSON_RecordObj_matrix::save_time_machine() calls this (with limit=0) to
	*    detect whether any prior snapshot already exists for the component before
	*    deciding whether to backfill a snapshot for the previous datum.
	* 2. The time-machine UI tool queries the paginated form (limit + offset) to
	*    display a component's version history to the user.
	*
	* All parameters are optional; omitting a filter simply drops it from the WHERE
	* clause.  Passing limit=0 disables the LIMIT clause so all matching rows are
	* returned, which is the case used by the duplicate-detection guard.
	*
	* The method delegates to RecordDataBoundObject::search(), which builds and
	* executes the SELECT query, bypassing the static query cache because this
	* class forces use_cache = false.
	*
	* @param ?string $tipo = null             - Component ontology tipo to filter on.
	* @param int|string|null $parent = null   - Section_id of the owning section record.
	* @param ?string $lang = null             - Language code to filter on.
	* @param ?string $section_tipo = null     - Section ontology tipo to filter on.
	* @param int $limit = 10                  - Maximum rows to return; 0 means no LIMIT.
	* @param int $offset = 0                  - Row offset for pagination.
	* @param ?int $section_id_key = null      - Dataframe sub-row key (omit when not needed).
	* @param ?int $bulk_process_id = null     - Bulk-process id filter (omit when not needed).
	* @return array - Ordered list of `matrix_time_machine` primary-key values (strings
	*   from pg_fetch_assoc); empty array when no matching snapshots exist.
	*/
	public static function get_ar_time_machine_of_this( ?string $tipo=null, int|string|null $parent=null, ?string $lang=null, ?string $section_tipo=null, int $limit=10, int $offset=0, ?int $section_id_key=null, ?int $bulk_process_id=null ) : array {

		$arguments=array();
		if(!empty($tipo))
		$arguments['tipo']			= $tipo;
		$arguments['section_id']	= (int)$parent;
		$arguments['section_tipo']	= $section_tipo;
		if(isset($section_id_key)){
			$arguments['section_id_key']	= $section_id_key;
		}
		if(isset($bulk_process_id)){
			$arguments['bulk_process_id']	= $bulk_process_id;
		}
		if(!empty($lang))
		$arguments['lang']			= $lang;
		if(!empty($limit))
		$arguments['sql_limit']		= $limit;
		$arguments['offset']		= $offset;
		$arguments['order_by_desc']	= 'timestamp';

		$RecordObj_time_machine	= new RecordObj_time_machine(NULL);
		$ar_id					= $RecordObj_time_machine->search($arguments);

		#$ar_time_machine_of_this = array_values($ar_id);
		#foreach($ar_id as $id) {
		#	$ar_time_machine_of_this[] = $id;
		#}

		return $ar_id;
	}//end get_ar_time_machine_of_this



}//end classRecordObj_time_machine
