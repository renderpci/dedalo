<?php declare(strict_types=1);
/**
* CLASS JSON_RECORDOBJ_MATRIX
* Active-Record gateway for a single row in any Dédalo matrix table.
*
* Dédalo stores every section record in one of a family of PostgreSQL tables that share a
* common schema: each row is keyed by the composite (section_tipo, section_id) pair and
* carries payload in JSONB columns (primarily `datos`, plus v7 typed columns such as `data`,
* `relation`, `string`, `date`, etc.).  JSON_RecordObj_matrix binds a single PHP object to
* one such row, regardless of which concrete table it lives in.
*
* Responsibilities:
* - Resolve the target table at construction time via the $matrix_table argument (supplied
*   by the caller after ontology look-up; the class itself does not resolve types).
* - Act as a singleton-style cache keyed by (section_tipo + '_' + section_id) so that the
*   same database row is never loaded twice within a single PHP request when $cache=true.
* - Delegate all SQL load/save/delete operations upward to JSON_RecordDataBoundObject, which
*   in turn maps PHP properties to the four canonical columns: id, section_id, section_tipo,
*   datos.
* - Automatically write a time-machine snapshot to matrix_time_machine before saving the
*   canonical row (save_time_machine), unless the table is matrix_activity or
*   tm_record::$save_tm is explicitly set to false by the caller (e.g. bulk operations).
* - Enforce a lightweight pre-save guard (test_can_save) that blocks unauthenticated writes
*   for most tables while allowing specific tables (matrix_activity, matrix_counter,
*   matrix_stats) to be written without an active user session.
*
* Supported tables (the full list the class is designed to handle):
*   matrix, matrix_activities, matrix_activity, matrix_dataframe, matrix_dd,
*   matrix_hierarchy, matrix_hierarchy_main, matrix_indexations, matrix_langs,
*   matrix_layout, matrix_layout_dd, matrix_list, matrix_nexus, matrix_nexus_main,
*   matrix_notes, matrix_ontology, matrix_ontology_main, matrix_profiles,
*   matrix_projects, matrix_stats, matrix_test, matrix_tools, matrix_users
*
* Typical call path:
*   section_record -> JSON_RecordObj_matrix::get_instance($table, $section_id, $tipo)
*                  -> Load() (via parent) -> component->get_dato()
*   component->Save() -> JSON_RecordObj_matrix->Save() -> save_time_machine() + parent::Save()
*
* Extends: JSON_RecordDataBoundObject (abstract SQL load/save layer).
* Used by: section, section_record, component_common, and all concrete component classes.
*
* @package Dédalo
* @subpackage Core
*/
class JSON_RecordObj_matrix extends JSON_RecordDataBoundObject {

	/**
	* The section_id (row identifier within the section) for the bound record.
	* Integer when loaded; null before construction is complete.
	* @var ?int $section_id
	*/
	protected $section_id;

	/**
	* The ontology tipo string identifying the section this record belongs to,
	* e.g. 'oh1' for the main interview section.
	* @var ?string $section_tipo
	*/
	protected $section_tipo;

	/**
	* The raw JSONB payload from the `datos` column, decoded to a PHP object/array
	* after Load(). Contains all component dato values stored in v6 JSONB format.
	* @var mixed $datos
	*/
	protected $datos;

	/**
	* Optional reference to the object that triggered this instance's creation.
	* Used by some callers to carry additional context; never read by this class itself.
	* @var ?object $caller_obj
	*/
	protected $caller_obj; 	// optional

	/**
	* The resolved PostgreSQL table name this object is bound to (e.g. 'matrix', 'matrix_dd').
	* Set at construction and forwarded to the parent via defineTableName().
	* @var ?string $matrix_table
	*/
	protected $matrix_table ;

	/**
	* The primary key (id) of the matrix_time_machine row written during the most recent
	* save_time_machine() call.  Null when no TM snapshot has been saved in this request.
	* @var ?int $time_machine_last_id
	*/
	public $time_machine_last_id;

	/**
	* Placeholder for time-machine-specific dato payload.
	* Not written by this class; may be set by callers that inspect TM data inline.
	* @var mixed $datos_time_machine
	*/
	public $datos_time_machine;

	/**
	* Process-lifetime instance cache keyed by 'section_tipo_section_id'.
	* Populated by get_instance() when $cache=true; cleared by common::clear().
	* Capped at $max_cache_instances (1 200) entries to prevent memory overloads on large
	* batch operations; oldest entries are evicted in FIFO order when the cap is hit.
	* @var array<string,JSON_RecordObj_matrix> $ar_JSON_RecordObj_matrix_instances
	*/
	public static $ar_JSON_RecordObj_matrix_instances = [];



	/**
	* GET_INSTANCE
	* Returns a JSON_RecordObj_matrix instance for the given table + record locator,
	* optionally serving it from the process-lifetime static cache.
	*
	* The default is $cache=false — callers must explicitly opt in to caching.
	* Cache is always bypassed when $section_id is empty (not-yet-persisted records
	* have no stable identity, so caching would produce false hits).
	*
	* Cache eviction: once the cache holds more than $max_cache_instances (1 200) entries,
	* the first $cache_slice_on (400) entries are dropped in FIFO order.  This protects
	* against memory overload during large batch operations.  A single edit-mode section
	* (e.g. 'oh1') typically generates around 60 cached instances.
	*
	* Cache key is 'section_tipo_section_id' — $matrix_table is intentionally excluded
	* because a given (tipo, id) pair always maps to the same table.
	*
	* @param ?string $matrix_table = null  - Resolved PostgreSQL table name (e.g. 'matrix', 'matrix_dd')
	* @param ?int    $section_id   = null  - Row identifier within the section; null produces a new uncached instance
	* @param ?string $section_tipo = null  - Ontology tipo of the section (e.g. 'oh1')
	* @param bool    $cache        = false - When true, serve from / populate the static instance cache
	* @return JSON_RecordObj_matrix $instance
	*/
	public static function get_instance( ?string $matrix_table=null, ?int $section_id=null, ?string $section_tipo=null, bool $cache=false ) : JSON_RecordObj_matrix {

		// cache
			// $cache = false;

		// cache is false case. Also, not cache new instances (without section_id)
			if ($cache===false || empty($section_id)) {
				return new JSON_RecordObj_matrix(
					$matrix_table,
					$section_id,
					$section_tipo
				);
			}//end if ($cache===false || empty($section_id))

		// cache is true case. Get cache instance if it exists. Otherwise, create a new one
			// cache overload : If ar_JSON_RecordObj_matrix_instances > $max_cache_instances , not add current element to cache to prevent overload
			// Note: normally, a file like oh1 in edit mode, uses about 60 JSON_RecordObj_matrix items in cache
				$max_cache_instances	= 1200;
				$cache_slice_on			= 400;
				$total					= count(self::$ar_JSON_RecordObj_matrix_instances);
				if ( $total > $max_cache_instances ) {
					// self::$ar_JSON_RecordObj_matrix_instances = array_slice(self::$ar_JSON_RecordObj_matrix_instances, $cache_slice_on, null, true);
					// new array
					$new_array = [];
					$i = 1;
					foreach (self::$ar_JSON_RecordObj_matrix_instances as $inst_key => $inst_value) {
						if ($i > $cache_slice_on) {
							$new_array[$inst_key] = $inst_value;
						}else{
							$i++;
						}
					}
					// replace matrix_instances array
					self::$ar_JSON_RecordObj_matrix_instances = $new_array;

					// error_log('))))))))))))))))))))))))))))))))))))))))) Replaced JSON_RecordObj_matrix_instances cache from n '.$total.' to '.count($new_array));
					// error_log('))))))))))))))))))))))))))))))))))))))))) Replaced JSON_RecordObj_matrix_instances (1200/400) key: '.$section_tipo .'_'. $section_id);
				}

			// find current instance in cache
				// $cache_key = $matrix_table.'_'.$section_id .'_'. $section_tipo;
				// (!) $matrix_table is excluded from the cache key: for a given (tipo, id)
				//     pair, the resolved table is always the same, so the simpler key is safe.
				$cache_key = $section_tipo .'_'. $section_id;
				if ( !isset(self::$ar_JSON_RecordObj_matrix_instances[$cache_key]) ) {
					self::$ar_JSON_RecordObj_matrix_instances[$cache_key] = new JSON_RecordObj_matrix($matrix_table, $section_id, $section_tipo);
				}


		return self::$ar_JSON_RecordObj_matrix_instances[$cache_key];
	}//end get_instance



	/**
	* __CONSTRUCT
	* Binds this object to a specific matrix table row identified by ($matrix_table, $section_id, $section_tipo).
	*
	* All three arguments are mandatory for a well-formed object.  $section_id may be empty
	* only when creating a new record (the id will be assigned by the DB on first Save()).
	* An empty $matrix_table or $section_tipo always causes an exception (or a CLI die()),
	* because neither can be resolved after construction.
	*
	* (!) $matrix_table MUST be set on $this before calling parent::__construct(), because the
	*     parent immediately calls defineTableName() which returns $this->matrix_table.
	*
	* @param ?string $matrix_table = null - PostgreSQL table name, e.g. 'matrix', 'matrix_dd'
	* @param ?int    $section_id   = null - Row identifier; null/0 for new (not-yet-inserted) records
	* @param ?string $section_tipo = null - Ontology tipo, e.g. 'oh1'
	* @throws Exception When $matrix_table or $section_tipo is empty and not running in CLI
	*/
	public function __construct( ?string $matrix_table=null, ?int $section_id=null, ?string $section_tipo=null ) {

		if(empty($matrix_table)) {
			if(SHOW_DEBUG===true) {
				dump($matrix_table, "section_id: $section_id - tipo: $section_tipo");
			}
			$msg = 'Error Processing Request. matrix_table is empty. Check Ontology resolution for tipo: '. $section_tipo;
			debug_log(__METHOD__
				. ' ' . $msg . PHP_EOL
				. ' section_tipo: '. $section_tipo . PHP_EOL
				. ' section_id: '. $section_id . PHP_EOL
				, logger::ERROR
			);
			// print CLI. Echo the text msg as line and flush object buffers
			// only if current environment is CLI
			if ( running_in_cli()===true ) {
				// send to output
				print_cli((object)[
					'msg'		=> $msg,
					'errors'	=> ['Unresolved matrix_table ('.$section_tipo.'-'.$section_id.')']
				]);
				die(); // do not throw here, only stop to fix this as last message
			}
			throw new Exception("Error Processing Request. matrix_table is empty. section_tipo: $section_tipo, section_id: $section_id ", 1);
		}

		if(empty($section_id)) {
			if(SHOW_DEBUG===true) {
				#dump($section_id,"section_id:$section_id is null for: matrix_table:$matrix_table, section_tipo:$section_tipo, caller:".debug_backtrace()[1]['function']);
				#dump( debug_backtrace(), 'debug_backtrace');
			}
		}

		if(empty($section_tipo)) {
			if(SHOW_DEBUG===true) {
				dump($section_tipo,"section_id:$section_id - matrix_table:$matrix_table");
			}
			$msg = 'Error Processing Request. section_tipo is empty';
			debug_log(__METHOD__
				. ' ' . $msg . PHP_EOL
				. ' matrix_table: '. $matrix_table . PHP_EOL
				. ' section_tipo: '. $section_tipo . PHP_EOL
				. ' section_id: '. $section_id . PHP_EOL
				, logger::ERROR
			);
			// print CLI. Echo the text msg as line and flush object buffers
			// only if current environment is CLI
			if ( running_in_cli()===true ) {
				// send to output
				print_cli((object)[
					'msg'		=> $msg,
					'errors'	=> ['Empty mandatory var section_tipo']
				]);
				die(); // do not throw here, only stop to fix this as last message
			}
			throw new Exception("Error Processing Request. section_tipo is empty ", 1);
		}

		# Fix mandatory vars
		# TABLE SET ALWAYS BEFORE CONSTRUCT RECORDATABOUNDOBJECT
		$this->matrix_table = $matrix_table;
		$this->section_tipo = $section_tipo;
		$this->section_id 	= $section_id;

		parent::__construct(null);
	}//end __construct



	/**
	* DEFINETABLENAME
	* Returns the PostgreSQL table name this object is bound to.
	* Called by parent::__construct() immediately; $matrix_table must be set before the parent is invoked.
	* @return string - Table name, e.g. 'matrix', 'matrix_dd', 'matrix_hierarchy'
	*/
	protected function defineTableName() : string {
		return $this->matrix_table;
	}

	/**
	* DEFINEPRIMARYKEYNAME
	* Returns the primary-key column name for all matrix tables, which is always 'id'.
	* @return string
	*/
	protected function definePrimaryKeyName() : string {
		return 'id';
	}

	/**
	* DEFINERELATIONMAP
	* Maps database column names to PHP property names for the four canonical matrix columns.
	* The 'datos' column holds the main JSONB payload; additional v7 typed columns (data,
	* relation, string, etc.) are loaded by the parent's Load() method but are not part of
	* this map because they are handled via direct property assignment there.
	* @return array<string,string>
	*/
	protected function defineRelationMap() : array {
		return [
			# db field-name	   # property name
			'id'			=> 'ID',
			'section_id'	=> 'section_id',
			'section_tipo'	=> 'section_tipo',
			'datos'			=> 'datos'
		];
	}

	/**
	* GET_ID
	* Returns the database primary-key (auto-increment `id`) of the bound row.
	* Delegates to parent::get_ID(), which returns null until the record has been loaded
	* or saved at least once.
	* @return ?int
	*/
	public function get_id() : ?int {
		return parent::get_ID();
	}



	/**
	* TEST_CAN_SAVE
	* Pre-save guard that prevents unauthenticated writes to most matrix tables.
	*
	* Certain tables (matrix_activity, matrix_counter, matrix_stats) record system-generated
	* or anonymous data and are explicitly allowed to be written without an active user
	* session.  All other tables require a valid logged-in user because they hold editorial
	* content that must be attributable to an author.
	*
	* This is a lightweight check only (session user-id presence); it does not perform
	* role-based permission checks — those happen higher up in the call stack.
	*
	* @return bool - true when the save may proceed; false to abort the save
	*/
	private function test_can_save() : bool {

		$ar_tables_can_save_without_login = array(
			'matrix_activity',
			'matrix_counter',
			'matrix_stats'
		);

		# Tables without login need
		if ( in_array($this->matrix_table, $ar_tables_can_save_without_login) ) {
			return true;
		}

		// Other tables. Test valid user (fast check only auth->user_id in session)
		$user_id = logged_user_id();
		if( empty($user_id) ) {
			$msg = "Save matrix: valid 'userID' value is mandatory. No data is saved! ";
			trigger_error($msg);
			dump($_SESSION, ' $_SESSION[dedalo][auth] ++ '.to_string());
			return false;
		}

		return true;
	}//end test_can_save



	/**
	* SAVE
	* Persists the bound matrix row, writing a time-machine snapshot first.
	*
	* Save order (important — see inline note below):
	*   1. test_can_save()            — abort if not authenticated for this table.
	*   2. save_time_machine()        — write the snapshot BEFORE the canonical row, so that
	*                                   the TM record captures the pre-save state; also allows
	*                                   recovering unsaved values for old-format imports.
	*   3. parent::Save($save_options) — write the canonical matrix row via
	*                                   JSON_RecordDataBoundObject::Save() (UPDATE or INSERT).
	*
	* Time-machine save is skipped for matrix_activity rows (activity log, not content data).
	* It can also be suppressed per-call via $save_options->save_tm = false, or globally
	* via tm_record::$save_tm = false (useful for bulk operations like portalize).
	*
	* The $save_options object controls both the TM snapshot payload and the parent Save()
	* behavior.  Key fields consumed here:
	*   - save_tm (bool)                     — override TM save for this call only
	*   - time_machine_data (mixed)          — the dato value to store in the TM row
	*   - time_machine_lang (string)         — language tag, e.g. 'lg-eng'
	*   - time_machine_tipo (string)         — component tipo being saved, e.g. 'oh16'
	*   - time_machine_section_id (int)      — section_id for the TM row
	*   - previous_component_dato (array)    — previous dato value; triggers a "before" TM snapshot
	*
	* Sample $save_options:
	* {
	*   "is_portal": false,
	*   "portal_tipo": false,
	*   "main_components_obj": false,
	*   "main_relations": false,
	*   "top_tipo": "oh1",
	*   "top_id": false,
	*   "new_record": false,
	*   "forced_create_record": false,
	*   "time_machine_data": ["Título entrevista uno b"],
	*   "time_machine_lang": "lg-eng",
	*   "time_machine_tipo": "oh16",
	*   "time_machine_section_id": 1,
	*   "previous_component_dato": [
	*     {"type":"dd151","section_id":"5","section_tipo":"dd898","from_component_tipo":"oh18"},
	*     {"type":"dd151","section_id":"10","section_tipo":"dd898","from_component_tipo":"oh18"}
	*   ]
	* }
	*
	* @param ?object $save_options = null
	* @return ?int - The `id` primary key of the saved matrix row; null on failure
	*/
	public function Save( ?object $save_options=null ) : ?int {
		// $start_time = start_time();

		// test_can_save
			if( $this->test_can_save()!==true ) {
				$msg = " Error (test_can_save). No matrix data is saved! ";
				trigger_error($msg, E_USER_ERROR);
				debug_log(__METHOD__." $msg - matrix_table: $this->matrix_table - $this->section_tipo - $this->section_id - save_options: ".to_string($save_options), logger::ERROR);
				return null;
			}

		# MATRIX SAVE (with parent RecordDataBoundObject)
		# Returned id can be false (error on save), matrix id (normal case), section_id (activity case)
		// $id = parent::Save($save_options);

		# TIME MACHINE COPY SAVE (Return assigned id on save)
		# Every record saved in matrix is saved as copy in 'matrix_time_machine' except logger and TM recover section
		# if(tm_record::$save_tm===true && $this->matrix_table!=='matrix_activity') { DEDALO_ACTIVITY_SECTION_TIPO
		if($this->matrix_table!=='matrix_activity') {

			$save_tm = isset($save_options->save_tm)
				? $save_options->save_tm
				: true;

			if($save_tm === true){
				# Exec time machine save and set returned id
				$this->time_machine_last_id = $this->save_time_machine( $save_options );
			}
		}

		// (!) MOVED AFTER TIME_MACHINE SAVE (12-11-2022) TO ALLOW SAVE UNSAVED COMPONENT VALUES (OLD IMPORTS..)
		// MATRIX SAVE (with parent RecordDataBoundObject)
		// Returned id can be false (error on save), matrix id (normal case), section_id (activity case)
		$id = parent::Save($save_options);

		// debug
			if (is_null($id) || $id===0) {
				debug_log(__METHOD__
					." Error on save record  ($this->matrix_table - $this->section_tipo - $this->section_id)" . PHP_EOL
					.' matrix_table: ' . $this->matrix_table . PHP_EOL
					.' section_tipo: ' . $this->section_tipo . PHP_EOL
					.' section_id: '   . $this->section_id
					, logger::ERROR
				);
			}else{
				// debug_log(__METHOD__
				// 	." Saved record ($this->matrix_table - $this->section_tipo - $this->section_id): ".exec_time_unit($start_time).' ms'
				// 	, logger::DEBUG
				// );
			}


		return $id;
	}//end Save



	/**
	* SAVE_TIME_MACHINE
	* Writes a snapshot of the component dato to matrix_time_machine before the canonical row
	* is written.  Every editorial save generates at least one time-machine entry, creating a
	* full audit trail of changes attributable to a specific user and timestamp.
	*
	* When $save_options->previous_component_dato is provided, this method first checks whether
	* a time-machine record already exists for that (tipo, section_id, lang, section_tipo)
	* combination.  If none exists the previous dato is backfilled as a separate TM entry
	* (dated at the record's created_date) before the new snapshot is written.  This handles
	* the case where data was imported without going through the normal save pipeline and
	* therefore lacks a time-machine history.
	*
	* Key fields consumed from $save_options:
	*   - time_machine_tipo (string)          — component tipo to record (e.g. 'oh16')
	*   - time_machine_section_id (int)       — section_id of the component's parent section
	*   - time_machine_lang (string)          — language tag of the dato, e.g. 'lg-eng'
	*   - time_machine_data (mixed)           — the dato value to snapshot
	*   - time_machine_date (string)          — override timestamp; defaults to now
	*   - time_machine_bulk_process_id (int)  — links snapshots to a specific bulk operation
	*   - previous_component_dato (mixed)     — pre-existing dato; triggers a backfill TM entry
	*
	* State rule: when the saved component tipo equals the section tipo (i.e. the section
	* record itself is being saved, not a component within it), the TM state is set to 'created'.
	*
	* Global kill-switch: if tm_record::$save_tm is false this method returns null immediately.
	* Per-call override: set $save_options->save_tm = false in Save() to avoid this method
	* entirely (checked in Save() before calling here).
	*
	* matrix_time_machine columns written:
	*   id, section_id, section_tipo, tipo, lang, timestamp, userID, state, dato, bulk_process_id
	*
	* @param object $save_options
	* @return ?int $time_machine_id - Primary key of the new matrix_time_machine row; null on skip
	*/
	public function save_time_machine( object $save_options ) : ?int {

		// options
			$tipo						= $save_options->time_machine_tipo ?? null;
			$section_id					= $save_options->time_machine_section_id ?? null;
			$lang						= $save_options->time_machine_lang ?? null;
			$time_machine_data			= $save_options->time_machine_data ?? null;
			// saving from component cases
			$previous_component_dato	= $save_options->previous_component_dato ?? null;
			$time_machine_date			= $save_options->time_machine_date ?? dd_date::get_timestamp_now_for_db();
			$bulk_process_id			= $save_options->time_machine_bulk_process_id ?? null;

		// save_time_machine_version. To disable time machine save, set: tm_record::$save_tm = false;
		// This is useful for some bulk operations like 'portalize'
			if (tm_record::$save_tm===false) {
				return null;
			}

		// short vars
			// $section_tipo = $this->get_section_tipo();
			$section_tipo = $this->section_tipo;

		// RecordObj_time_machine instance
			$RecordObj_time_machine = new RecordObj_time_machine(null);
			// time_machine table fields sample
				// db field name	   # property name
				// "id"				=> "ID",			// integer
				// "id_matrix"		=> "id_matrix",		// integer
				// "section_id"		=> "section_id",	// integer
				// "section_tipo"	=> "section_tipo",	// string varchar 32
				// "tipo"			=> "tipo",			// string varchar 32
				// "lang"			=> "lang", 			// string 16
				// "timestamp"		=> "timestamp", 	// timestamp standard db format
				// "userID"			=> "userID", 		// integer
				// "state"			=> "state",			// string char 32
				// "dato"			=> "dato",			// jsonb format
				// "section_id_key"	=> "section_id_key" // integer TODO; to delete now the dataframe is saved with main data

		// time_machine save before.
		// This allow safe time machine save data not already saved (old imports case for example)
			if (!empty($previous_component_dato)) {

				// already exists check
				$data_already_exists = false;
				// get_ar_time_machine_of_this return an array of found matrix_time_machine id values
				$tm_records = RecordObj_time_machine::get_ar_time_machine_of_this(
					$tipo, // string $tipo (component_tipo)
					$section_id, // string|int section_id (component parent)
					$lang, // string $lang
					$section_tipo, // string section_tipo
					0, // int limit
					0 // int offset
				);
				if (!empty($tm_records)) {

					// check if data match to current
						// foreach ($tm_records as $tm_id) {
						// 	$current_RecordObj_time_machine	= new RecordObj_time_machine($tm_id);
						// 	$current_dato					= $current_RecordObj_time_machine->get_dato();
						// 	if ($current_dato===$previous_component_dato) {
						// 		$data_already_exists = true;
						// 		break;
						// 	}
						// }

					// (!) We understand here that data does already exists
					// Per-value diffing was commented out; any existing TM record for this
					// (tipo, section_id, lang, section_tipo) is treated as proof that the
					// previous state is already captured — no duplicate backfill needed.
						$data_already_exists = true;
				}
				// empty records or not data match, mints that previous data exists in component but not in time_machine.
				// To fix this, save before the previous data and later the new data
				if ($data_already_exists===false) {
					$new_options = clone $save_options;
						// use previous data as to-save data
						$new_options->time_machine_data = $previous_component_dato;
						// clean previous component dato to prevent infinite loop
						$new_options->previous_component_dato = null;
						// date
						// Use the record's own created_date as the backfill timestamp so the
						// reconstructed history reflects when the data was originally created.
						if (isset($this->datos) && isset($this->datos->created_date)) {
							$created_date = $this->datos->created_date;
							$new_options->time_machine_date = $created_date;
						}
						// unset the bulk_process_id
						// unsaved time_machine data is a fix of previous saved data, it need to be outside the process because
						// the process need to be coherent to the change, the fix time_machine is other process than not happen previously.
						//save current data as previous of the process, to prevent revert it.
						$new_options->time_machine_bulk_process_id = null;
					$this->save_time_machine( $new_options );
					debug_log(__METHOD__
						." Saved time machine NOT already saved component dato. tipo: $tipo, section_tipo: $section_tipo, section_id: $section_id" . PHP_EOL
						.' previous_component_dato: '. to_string($previous_component_dato)
						, logger::WARNING
					);
				}
			}//end if (!empty($previous_component_dato))

		// configure time machine object
		// The section_id and section_tipo stored on the TM row come from $this (the canonical
		// matrix record), not from the save_options overrides, so the snapshot always references
		// the correct parent row even when a portal save passes different time_machine_section_id.

			// section_id
				// $RecordObj_time_machine->set_section_id( $this->get_section_id() );	// $save_options->time_machine_section_id
			$RecordObj_time_machine->set_section_id( $this->section_id );
			// section_tipo
				// $RecordObj_time_machine->set_section_tipo( $this->get_section_tipo() );
				$RecordObj_time_machine->set_section_tipo( $this->section_tipo );
			// tipo
				if (!empty($tipo)) {
					$RecordObj_time_machine->set_tipo( $tipo );
				}
			// lang
				if (!empty($lang)) {
					$RecordObj_time_machine->set_lang( $lang );
				}
			// timestamp
				$RecordObj_time_machine->set_timestamp( $time_machine_date );
			// userID
				$RecordObj_time_machine->set_userID( logged_user_id() );
			// dato
				if (!empty($time_machine_data)) {
					$RecordObj_time_machine->set_dato( $time_machine_data );
				}
			// bulk_process_id
				if (isset($bulk_process_id)) {
					$RecordObj_time_machine->set_bulk_process_id( $bulk_process_id );
				}
			// state. Set as 'created' for sections
			// When the component tipo is the same as the section tipo, the row being
			// saved is the section record itself (not a sub-component), so the TM
			// state is marked 'created' to distinguish creation events from edits.
				if ($tipo===$section_tipo) {
					$RecordObj_time_machine->set_state('created');
				}

		// Save obj
			$RecordObj_time_machine->Save();

		// time_machine_id. get from saved record
			$time_machine_id = (int)$RecordObj_time_machine->get_ID();


		return $time_machine_id;
	}//end save_time_machine



}//end JSON_RecordObj_matrix
