<?php declare(strict_types=1);
/**
* CLASS TM_RECORD
* Domain object representing a single row in the `matrix_time_machine` PostgreSQL table.
*
* Every time a component value is saved in Dédalo, the previous snapshot of that value is
* written to `matrix_time_machine` so that the Time Machine tool can restore any prior state.
* This class is the primary PHP representation of one such snapshot row.
*
* Responsibilities:
* - Wraps a tm_record_data instance that owns all database I/O (read / update / delete).
* - Provides a factory (create()) that validates, guards, and inserts new snapshot rows,
*   including a "save-before" repair pass for component data that was never previously
*   captured by TM (e.g. legacy import scenarios).
* - Exposes search() so callers can query the `matrix_time_machine` table with arbitrary
*   column filters, returning results via the typed db_result iterator.
* - Materialises a full section_record from a TM row via get_section_record(), mapping
*   each stored datum back into the virtual DEDALO_TIME_MACHINE_SECTION_TIPO (dd15)
*   record so the normal component rendering pipeline can display TM history without
*   any special-cased UI.
*
* Key relationships:
* - tm_record_data  — CRUD façade; one instance is held in $data_instance.
* - tm_db_manager   — static DAL that owns the prepared-statement pool for matrix_time_machine.
* - matrix_db_manager — sibling DAL supplying exec_search() used inside search().
* - section_record  — target type produced by get_section_record().
* - db_result       — typed iterator returned by search().
*
* Global kill-switch: set tm_record::$save_tm = false before a bulk operation to suppress
* all TM writes for the duration of that operation.
*
* @package Dédalo
* @subpackage Core
*/
class tm_record {



	/**
	* CLASS VARS
	*/
		/**
		 * Database ID of the time machine record (primary key).
		 * Unique identifier for this specific tm_record in the matrix_time_machine table.
		 * @var int $id
		 */
		public int $id;

		/**
		 * Section tipo (ontology identifier) of the record being tracked.
		 * Defines which section/hierarchy the time machine data belongs to.
		 * @var string $section_tipo
		 */
		public string $section_tipo;

		/**
		 * Section ID of the record being tracked by time machine.
		 * Identifies the specific record within the section.
		 * @var string|int $section_id
		 */
		public string|int $section_id;

		/**
		 * Data instance handling database operations for this tm_record.
		 * Instance of tm_record_data class managing all data persistence tasks.
		 * @var object $data_instance
		 */
		protected object $data_instance;

		/**
		 * Global flag to enable/disable time machine save operations.
		 * Set to false to disable TM globally: tm_record::$save_tm = false.
		 * @var bool $save_tm
		 */
		public static bool $save_tm = true;

		/**
		 * Section tipos excluded from time machine tracking.
		 * Components belonging to these sections will not create TM records on save.
		 * Add section_tipos here to skip TM for volatile or utility sections.
		 * @var array $excluded_section_tipos
		 */
		public static array $excluded_section_tipos = [
			DEDALO_TEMP_PRESET_SECTION_TIPO, // dd655 - temporal search presets (automatic saved search configuration)
			DEDALO_TIME_MACHINE_SECTION_TIPO, // dd15 - time machine section (internal virtual section)
			USER_ACTIVITY_SECTION_TIPO, // dd1521 - User activity (automatic sumatory of user actions by day)
		];



	/**
	* GET_INSTANCE
	* Get an instance of a tm_record object.
	* Not cached at now because the real shared data is from section_record_data.
	* @param int $id
	* @return tm_record $tm_record
	*/
	public static function get_instance( int $id ) : tm_record {

		return new tm_record($id);
	}//end get_instance



	/**
	* __CONSTRUCT
	* Private constructor; instances must be obtained via get_instance().
	* Initialises the tm_record_data instance that handles all database I/O.
	* @param int $id - Primary key of the matrix_time_machine row.
	*/
	private function __construct( int $id ) {

		// Set general vars
		$this->id = $id;

		// Initiate tm_record_data instance.
		// It's instanced once and handles all the section data database tasks.
		$this->data_instance = tm_record_data::get_instance(
			$this->id
		);
	}//end get_instance



	/**
	* __DESTRUCT
	* Remove the data instance and destroy itself.
	*/
	public function __destruct() {

		if( isset($this->data_instance) ){
			$this->data_instance->__destruct();
		}

	}//end __destruct



	/**
	* LOAD_DATA
	* Loads the section DB record once.
	* The data fill the '$this->data_columns' values
	* with parsed integer and JSON values.
	* To force to reload the data form DB, set the property
	* 'this->is_loaded_data_columns' to false.
	* @return bool
	*/
	private function load_data() : bool {

		// If the section_record_data instance has already been loaded,
		// it returns the cached data without reconnecting to the database.
		// All section instances with the same section_tipo and section_id values
		// share the same cached instance of 'section_record_data', independent of the mode.
		$this->data_instance->read();

		return true;
	}//end load_data



	/**
	* GET_DATA
	* Retrieves all columns data of the record
	* @return object $data
	*/
	public function get_data() : object {

		// force to load all data from database
		$this->load_data();

		// get all data columns
		$data = $this->data_instance->get_data();

		return $data;
	}//end get_data



	/**
	* GET_ELEMENT_DATA
	* Retrieves the element (component, section) data of the record
	* Used to recovery the specific data point of a component or section
	* @return array|object $element_data
	*/
	public function get_element_data() : array|object {

		$tm_data = $this->get_data();

		$element_data = $tm_data->data;

		return $element_data;
	}//end get_element_data



	/**
	* SET_DATA
	* Assign data columns with its own values into the section_record_data
	* @param object $data
	* @return bool $result
	*/
	public function set_data( object $data ) : bool {

		$result = $this->data_instance->set_data( $data );


		return $result;
	}//end set_data



	/**
	* SAVE
	* Persist the current data into the database.
	* DO NOT MODIFY THE TIME MACHINE RECORDS. Use only for updates (!)
	* @return bool
	*/
	public function save() : bool {

		// do not allow to save time machine records of the section_tipo dd15
		// dd15 is used to represent the time machine records
		if($this->data_instance->section_tipo === DEDALO_TIME_MACHINE_SECTION_TIPO) {
			return false;
		}

		return $this->data_instance->save_data();
	}//end save



	/**
	* CREATE
	* Inserts a single row into a "matrix_time_machine" table.
	*
	* Guards applied before the INSERT:
	* 1. Global kill-switch: returns false immediately when tm_record::$save_tm === false.
	*    Callers such as bulk-portalize operations set this flag to skip TM entirely.
	* 2. Timestamp injection: if $values->timestamp is absent, the current UTC timestamp
	*    is added via dd_date::get_timestamp_now_for_db().
	* 3. User injection: if $values->user_id is absent, the currently-logged-in user is
	*    resolved via logged_user_id() and injected.
	* 4. Mandatory column validation: section_id, section_tipo, tipo, and lang must all be
	*    non-empty or the call is logged as ERROR and returns false.
	* 5. dd15 guard: saving a TM record whose section_tipo is DEDALO_TIME_MACHINE_SECTION_TIPO
	*    would create infinite recursion — rejected immediately.
	* 6. Excluded-section guard: section_tipos in $excluded_section_tipos (volatile utility
	*    sections such as dd655 and dd1521) are skipped silently.
	* 7. Save-before repair: when $previous_data is supplied and differs from $values->data,
	*    the method checks whether a prior TM entry exists for this component. If none is
	*    found (e.g. first-ever save of an imported record), it inserts a synthetic row
	*    timestamped one minute in the past so that the TM timeline is coherent. The
	*    bulk_process_id is cleared on the synthetic row because it belongs to a repair
	*    pass, not the triggering process.
	*
	* @param object $values
	*   Object with {column name : value} structure.
	*   Keys are column names, values are their new values.
	* @param mixed $previous_data=null
	*   Previous data to check if time machine record already exists.
	* @return tm_record|false $tm_record
	*   Returns the new tm_record instance on success, or `false` if validation fails,
	*   query preparation fails, or execution fails.
	*/
	public static function create( object $values, mixed $previous_data=null ) : tm_record|false {

		// save_tm. To disable time machine save, set: tm_record::$save_tm = false;
		// This is useful for some bulk operations like 'portalize'
		if (tm_record::$save_tm === false) {
			return false;
		}

		// timestamp. Add timestamp if not exists
		if(!isset($values->timestamp)) {
			$values->timestamp = dd_date::get_timestamp_now_for_db();
		}

		// user_id. Add user_id if not exists
		if(!isset($values->user_id)){
			$values->user_id = logged_user_id();
		}

		$mandatory = ['section_id','section_tipo','tipo','lang'];
		foreach ( $mandatory as $column ) {
			if( !isset($values->$column) || $values->$column === '' || $values->$column === null ){
				debug_log( __METHOD__
					. " Column '$column' is mandatory" . PHP_EOL
					. ' values: ' . json_encode($values, JSON_PRETTY_PRINT)
					, logger::ERROR
				);
				return false;
			}
		}

		// do not allow to save time machine records of the section_tipo dd15
		// dd15 is used to represent the time machine records
		if($values->section_tipo === DEDALO_TIME_MACHINE_SECTION_TIPO) {
			return false;
		}

		// skip TM for excluded section_tipos (volatile/utility sections)
		if (in_array($values->section_tipo, self::$excluded_section_tipos, true)) {
			return false;
		}

		// time_machine save before.
		// This allow safe time machine save data not already saved (old imports case for example)
		if ( !empty($previous_data) ) {

			// Previous data match values->data ?
			$current_data = $values->data ?? null;
			$same_data = (is_array($previous_data) && is_array($current_data))
				? normalize_array($previous_data) === normalize_array($current_data)
				: $previous_data == $current_data;

			if(!$same_data) {

				$tm_values = new stdClass();
					$tm_values->section_id 		= (int)$values->section_id; // string|int section_id (component parent)
					$tm_values->section_tipo 	= $values->section_tipo; // string section_tipo
					$tm_values->tipo 			= $values->tipo; // string $tipo (component_tipo)
					$tm_values->lang			= $values->lang; // string $lang

				// Set the limit to 1
				// When the search give 1 record, stop the search because time machine has previous data
				$limit = 1;

				$db_result = tm_record::search( $tm_values, $limit );

				// empty records or not data match, means that previous data exists in component but not in time_machine.
				// To fix this, save before the previous data and later the new data
				if ($db_result->row_count() === 0) {

					// Create a new record with the previous data
					$new_values = clone($values);
						// set a previous timestamp to save in db. This will make sure that we have not use the same timestamp of the changed data.
						$new_values->timestamp = dd_date::get_timestamp_now_for_db( ['sub' => 'PT1M'] ); // now minus 1 minute.
						// use previous data as to-save data
						$new_values->data = $previous_data;
						// unset the bulk_process_id
						// unsaved time_machine data is a fix of previous saved data, it need to be outside the process because
						// the process need to be coherent to the change, the fix time_machine is other process than not happen previously.
						// save current data as previous of the process, to prevent revert it.
						$new_values->bulk_process_id = null;

					// Create the TM record in DB
					$create_result = tm_db_manager::create( $new_values );

					if($create_result === false){
						debug_log( __METHOD__
							. " Error creating new record (previous data): " . PHP_EOL
							.' new_values:  ' . json_encode($new_values, JSON_PRETTY_PRINT)
							, logger::ERROR
						);
						return false;
					}
					debug_log(__METHOD__
						." Saved time machine NOT already saved component dato." . PHP_EOL
						.' new_values:  ' . json_encode($new_values, JSON_PRETTY_PRINT)
						, logger::WARNING
					);
				}
			}
		}//end if (!empty($previous_data))

		// Create the TM record in DB
		$id = tm_db_manager::create(
			$values
		);

		if( $id === false ){
			debug_log( __METHOD__
				. " Error creating new record: " . PHP_EOL
				.' values:  ' . json_encode($values, JSON_PRETTY_PRINT)
				, logger::ERROR
			);
			return false;
		}

		$tm_record = tm_record::get_instance( $id );


		return $tm_record;
	}//end create



	/**
	* DELETE
	* Delete the record from the database and destroy the instance.
	* It's used to delete full section records once the section is recovered.
	* @return bool $result
	*/
	public function delete() : bool {

		$result = $this->data_instance->delete();
		unset($this->data_instance);

		$this->__destruct();

		return $result;
	}//end delete



	/**
	* SEARCH
	* Search records in the matrix_time_machine table, matching rows where each supplied
	* column equals the provided value.
	*
	* Only columns listed in tm_db_manager::$columns are honoured; any unknown column key
	* in $values is logged at ERROR level and skipped so callers never accidentally inject
	* arbitrary SQL identifiers.
	*
	* Positional parameters ($1, $2, …) are used for all value bindings; the placeholder
	* counter is incremented per accepted column so the ordering is deterministic.
	*
	* Result rows are wrapped in a db_result iterator that applies the JSON-column
	* decoding map from tm_db_manager::$json_columns, yielding fully-typed stdClass
	* objects on iteration.
	*
	* @param object $values   - Filters: each property name is a column, each value is the
	*                           exact match target.  Only string equality (`=`) is supported.
	* @param int $limit = 10  - Maximum rows to return.  Pass 0 to omit the LIMIT clause.
	* @param int $offset = 0  - Row offset for pagination.  Ignored when 0.
	* @param string|null $order_by = null - ORDER BY clause fragment (e.g. 'timestamp DESC').
	*                           Defaults to 'timestamp DESC' when null.
	* @return db_result|false - Typed iterator over matching rows, or false if the query fails.
	*/
	public static function search( object $values, int $limit=10, int $offset=0, ?string $order_by=null ) : db_result|false {

		$tm_columns = tm_db_manager::$columns;

		$sql_sentences 	= [];
		$params 		= [];
		$placeholder 	= 1;
		foreach( $values as $column => $value){
			if( isset($tm_columns[$column]) ){
				// Creates the sentence with the placeholder used by its param
				$sql_sentences[] = $column .' = $'. $placeholder;
				$placeholder++;
				$params[] = $values->$column;
			}else{
				// The column is not valid for matrix_time_machine, log error and continue to next column
				debug_log(__METHOD__
					. " Invalid column for search in matrix_time_machine, ignored! " . PHP_EOL
					. ' column: '.$column .PHP_EOL
					, logger::ERROR
				);
			}
		}

		// Default order by timestamp desc
		$order_by = ( !isset($order_by) )
			? 'timestamp DESC'
			: $order_by;

		// Build the SQL to be used by the search
		$sql = 'SELECT *';
		$sql .= PHP_EOL.'FROM "matrix_time_machine"';
		$sql .= PHP_EOL.'WHERE';
		$sql .= PHP_EOL.implode( PHP_EOL.' AND ',$sql_sentences );
		$sql .= PHP_EOL.'ORDER BY '.$order_by;
		if ($limit > 0) {
			$sql .= PHP_EOL.'LIMIT '. $limit;
		}
		if ($offset > 0) {
			$sql .= PHP_EOL.'OFFSET '. $offset;
		}

		// Perform SQL query and return result set
		$result = matrix_db_manager::exec_search($sql, $params);
		if ($result===false) {
			return false;
		}

		// get the json_columns defined for Time Machine
		$json_columns = tm_db_manager::$json_columns;

		// wrap result in db_result iterator
		$db_result = new db_result($result, $json_columns);


		return $db_result;
	}//end search



	/**
	* SET_SECTION_RECORD_FACTORY
	* Resolve the storage column for a given ontology tipo and write the supplied data
	* into the section_record via section_record::set_component_data().
	*
	* This is a private helper used exclusively by get_section_record() to inject each
	* TM field (who, when, where, what) into the virtual dd15 section_record without
	* duplicating the column-resolution logic for every field.
	*
	* When the ontology cannot resolve a model for $tipo (e.g. the ontology version
	* predates the TM definition), the method logs an ERROR and returns false so that
	* get_section_record() can continue building the remaining fields gracefully.
	*
	* @param string $tipo            - Ontology tipo of the component to populate (e.g. 'dd577').
	* @param array|null $data        - Datum array to inject; null clears the field.
	* @param section_record $section_record - Target section_record instance being built.
	* @return bool                   - true on success, false if the model cannot be resolved.
	*/
	private function set_section_record_factory( string $tipo, ?array $data, section_record $section_record ) : bool {

		$model 	= ontology_node::get_model_by_tipo( $tipo, true );

		if ($model === null) {
			debug_log(__METHOD__
				. " Error: Unable to resolve model for tipo" . PHP_EOL
				. ' tipo: ' . to_string($tipo) . PHP_EOL
				. ' Ensure you have an updated Ontology version with Time machine (dd15) valid definition'
				, logger::ERROR
			);
			return false;
		}

		$column = section_record_data::get_column_name( $model );
		$result = $section_record->set_component_data( $tipo, $column, $data );

		return $result;
	}//end set_section_record_factory



	/**
	* GET_SECTION_RECORD
	* Materialise a full section_record from a single time-machine row.
	*
	* The `matrix_time_machine` row stores a flat snapshot (who, when, which component,
	* which language, the JSONB datum). This method reconstructs a virtual section_record
	* keyed under DEDALO_TIME_MACHINE_SECTION_TIPO (dd15) so that the standard component
	* rendering pipeline can display TM history without any special-cased UI code.
	*
	* Field-by-field mapping (all injected via set_section_record_factory):
	*
	*   section_id       → dd1212 (component_number)   — numeric id of the source record
	*   timestamp        → dd559  (component_date)      — when the change was recorded
	*   tipo             → dd577  (component_input_text) — human-readable label of the
	*                       changed component tipo; includes the raw tipo in SHOW_DEBUG mode
	*   section_tipo     → dd1772 (component_input_text) — human-readable label of the
	*                       owning section tipo; includes raw tipo in SHOW_DEBUG mode
	*   user_id          → dd578  (component_autocomplete) — locator pointing to the user
	*                       record in DEDALO_SECTION_USERS_TIPO (dd128); also written to
	*                       dd200 for component_text_area compatibility
	*   annotation       → rsc329 (component_text_area) — optional user note attached to
	*                       the TM row; fetched from rsc832 (TM notes section) by
	*                       searching rsc835 (Code component) for the TM row id; the first
	*                       item of $note_value receives parent_section_id so the client
	*                       can navigate to the note record
	*   bulk_process_id  → dd1371 (component_number)   — id of the enclosing bulk operation
	*                       (null when the change was not part of a bulk process)
	*   data             → branching on the source model:
	*       section model: iterates $data columns and injects each component's datum under
	*                       its own tipo directly into the section_record; 'data' and 'id'
	*                       columns are skipped as they are structural, not component data.
	*       other models:  coerces the datum to an array and injects it under both
	*                       dd1574 (generic debug column) and the component's own $tipo so
	*                       that component::get_data() finds it via the normal path.
	*
	* (!) $ddo is referenced in the annotation block but is not declared in this method's
	*     scope. This is a pre-existing issue; the fallback to DEDALO_DATA_LANG is used
	*     when $ddo is undefined (PHP will emit a notice in strict mode). Do not fix here.
	*
	* @return section_record - Populated virtual dd15 section_record ready for JSON output.
	*/
	public function get_section_record() : section_record {

		$tm_data = $this->get_data();

		$id					= $tm_data->id;
		$section_id 		= $tm_data->section_id;
		$section_tipo 		= $tm_data->section_tipo;
		$tipo				= $tm_data->tipo;
		$lang				= $tm_data->lang;
		$timestamp			= $tm_data->timestamp;
		$user_id			= $tm_data->user_id;
		$bulk_process_id	= $tm_data->bulk_process_id;
		$data				= $tm_data->data;

		$section_record = section_record::get_instance(
			DEDALO_TIME_MACHINE_SECTION_TIPO, // dd15
			(int)$id
		);

		// section_id
			// the section_id that store the time machine data
			// dd1212 - component_number
			$id_data = new stdClass();
				$id_data->id 	= 1;
				$id_data->value = (int)$section_id;

			$this->set_section_record_factory(
				DEDALO_TIME_MACHINE_COLUMN_SECTION_ID, // 'dd1212'
				[$id_data],
				$section_record
			);

		// When. (timestamp)
			// The time of the record was created in Time Machine.
			// dd559 - component_date
			$date = dd_date::get_dd_date_from_timestamp( $timestamp );
			$date_value = new stdClass();
				$date_value->id 	= 1;
				$date_value->start 	= $date;

			$this->set_section_record_factory(
				DEDALO_TIME_MACHINE_COLUMN_TIMESTAMP, // 'dd559'
				[$date_value],
				$section_record
			);

		// Where. (tipo)
			// The tipo of the component/section where the change was done.
			// Resolve the term of the tipo and use it as data of the component
			// dd577 - component_input_text
			$component_value = ontology_node::get_term_by_tipo(
				$tipo, // string tipo
				DEDALO_DATA_LANG, // string lang
				true, // bool from_cache
				true // bool fallback
			);

			if(SHOW_DEBUG) {
				$component_value = "$component_value [$tipo]";
			}

			$where_value = new stdClass();
				$where_value->id = 1;
				$where_value->lang = DEDALO_DATA_NOLAN;
				$where_value->value = $component_value;

			$this->set_section_record_factory(
				DEDALO_TIME_MACHINE_COLUMN_TIPO, // 'dd577'
				[$where_value],
				$section_record
			);

		// Section tipo. (section_tipo)
			// The tipo of the component/section where the change was done.
			// Resolve the term of the tipo and use it as data of the component
			// dd577 - component_input_text
			$component_value = ontology_node::get_term_by_tipo(
				$section_tipo, // string tipo
				DEDALO_DATA_LANG, // string lang
				true, // bool from_cache
				true // bool fallback
			);

			if(SHOW_DEBUG) {
				$component_value = "$component_value [$section_tipo] ";
			}

			$where_value = new stdClass();
				$where_value->id = 1;
				$where_value->lang = DEDALO_DATA_NOLAN;
				$where_value->value = $component_value;

			$this->set_section_record_factory(
				DEDALO_TIME_MACHINE_COLUMN_SECTION_TIPO, // 'dd1772'
				[$where_value],
				$section_record
			);

		// Who. (user_id)
			// User. The user who made the change.
			// dd578 - component_autocomplete
			$user_locator = new locator();
				$user_locator->set_id(1);
				$user_locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
				$user_locator->set_section_id($user_id);
				$user_locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$user_locator->set_from_component_tipo(DEDALO_TIME_MACHINE_COLUMN_USER_ID); // 'dd578'

			$this->set_section_record_factory(
				DEDALO_TIME_MACHINE_COLUMN_USER_ID, // 'dd578'
				[$user_locator],
				$section_record
			);
			// Include the dd200 node also to be compatible with other section records
			// It will be used for component_text_area to know the user who created the section record
			$this->set_section_record_factory(
				DEDALO_SECTION_INFO_CREATED_BY_USER,
				[$user_locator],
				$section_record
			);

		// Annotation
			// Remark about the change made. This is used to provide context for the change and can be useful in auditing purposes. It's not mandatory.
			// Resolve the the annotation as string and inject into the component.
			// dd732 -  component_text_area

			// 1. search notes with current matrix_id
				$sqo = new search_query_object();
					$sqo->select		= [];
					$sqo->section_tipo	= [DEDALO_TIME_MACHINE_NOTES_SECTION_TIPO]; // rsc832
					$sqo->filter = (object)[
						'$and' => [
							(object)[
								'q'				=> (string)$id,
								'q_operator'	=> null,
								'path'			=> [
									(object)[
										'section_tipo'		=> DEDALO_TIME_MACHINE_NOTES_SECTION_TIPO,
										'component_tipo'	=> 'rsc835',
										'model'				=> 'component_number',
										'name'				=> 'Code'
									]
								]
							]
						]
					];
				$search = search::get_instance($sqo);
				$db_result = $search->search();

				$note_section_id = $db_result
					? ($db_result->fetch_one()->section_id ?? null)
					: null;

			// 2. Create the component and get its data
			// the data will used as (injected into) the component data of the time_machine annotation component.

			// Empty data as default
			// this data is needed because the note text_area will use to get the text_area data and
			// parent_section_id and parent_section_tipo to build the target section.
			// @see: component_text_area_json.php
			$note_value = [
				(object)[]
			];
			if($note_section_id) {
				$note_model			= ontology_node::get_model_by_tipo( 'rsc329', true );
				$current_component	= component_common::get_instance(
					$note_model,
					DEDALO_NOTES_TEXT_TIPO, // 'rsc329'
					$note_section_id,
					'tm', // use tm mode to preserve service_time_machine coherence
					$ddo->lang ?? DEDALO_DATA_LANG,
					DEDALO_TIME_MACHINE_NOTES_SECTION_TIPO
				);
				// if get_data returns null, use empty data as default
				$note_value = $current_component->get_data() ?? $note_value;
			}

			// inject parent_section_id and parent_section_tipo
			// it will use to build the target section in client side
			// @see: component_text_area_json.php
			$note_value[0]->parent_section_id = $note_section_id;

			$this->set_section_record_factory(
				DEDALO_NOTES_TEXT_TIPO, // 'rsc329'
				$note_value,
				$section_record
			);

		// Bulk process id
			// Process id for the bulk process. This is used to track and manage multiple changes together. It is used to identify the changes in a bulk operation.
			// dd1371 - component_number
			$bulk_process_id_value = new stdClass();
				$bulk_process_id_value->id = 1;
				$bulk_process_id_value->value = $bulk_process_id;

			$this->set_section_record_factory(
				DEDALO_TIME_MACHINE_COLUMN_BULK_PROCESS_ID, // 'dd1371'
				[$bulk_process_id_value],
				$section_record
			);

		// Data
			$source_model = ontology_node::get_model_by_tipo($tipo,true);
			if($source_model==='section'){

				foreach ($data as $column => $components) {
					if($column === 'data' || $column === 'id' || empty($components)){
						continue;
					}
					// Ensure components is an array or object before iterating
					if(!is_array($components) && !is_object($components)) {
						debug_log(__METHOD__ . " Ignored invalid components: $components"
							. 'data: ' . json_encode($data, JSON_PRETTY_PRINT)
							, logger::ERROR
						);
						continue;
					}
					foreach ($components as $component_tipo => $component_data) {
						$safe_tipo = safe_tipo($component_tipo);
						if($safe_tipo === false){
							debug_log(__METHOD__ . " Ignored invalid tipo: $component_tipo", logger::ERROR);
							continue;
						}
						// Ensure component data is an array as expected by set_component_data
						$component_data_array = (is_array($component_data) || $component_data === null)
							? $component_data
							: [$component_data];
						$section_record->set_component_data( $safe_tipo, $column, $component_data_array );
					}
				}

			}else{

				$data_parsed = is_array($data) ? $data : [$data];

				// inject data into dd1574 (debug/generic data column)
				$this->set_section_record_factory(
					DEDALO_TIME_MACHINE_COLUMN_DATA, // 'dd1574'
					$data_parsed,
					$section_record
				);

				// inject data under the component's own tipo (e.g. 'oh21')
				// so the normal component get_data() path finds it in the section_record
				$this->set_section_record_factory(
					$tipo,
					$data_parsed,
					$section_record
				);
			}

		return $section_record;
	}//end get_section_record



	/**
	* JSON_SERIALIZE
	* Serialise the instance to a JSON-compatible value.
	*
	* Filters out null properties to keep the payload compact and to match the behaviour
	* of dynamic-property objects (which do not emit null keys in json_encode output).
	* Called automatically by json_encode() when this object is part of a larger payload.
	*
	* @return mixed - Associative array of non-null instance properties.
	*/
	public function jsonSerialize() : mixed {

		$vars = get_object_vars($this);

		// filter out null values to keep payload small (as dynamic properties behaved before)
		return array_filter($vars, function($val) {
			return $val !== null;
		});
	}



}//end tm_record
