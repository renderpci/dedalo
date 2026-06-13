<?php declare(strict_types=1);
/**
* CLASS SECTION RECORD
* It represents a database record in the PHP space.
*/
class section_record {



	/**
	* CLASS VARS
	*/
	// string section_tipo
 	public string $section_tipo;
 	// string|int section_id
 	public string|int $section_id;
	// section_record_data class instance
	protected object $data_instance;
	// Exist this record in the database?
	public bool $record_in_the_database;

	// bool is_loaded_data_columns. Defines if section data_columns is already loaded from the database
	protected bool $is_loaded_data = false;

	// int permissions
	protected int $permissions;

	// string data_handler. Default is 'matrix_db_manager'. Others: 'matrix_activity_db_manager'
	public string $data_handler = 'matrix_db_manager';

	// string table.
	// The name of the table to query.
	private readonly string $table;

	// metrics
	public static int $section_record_total = 0;
	public static int $section_record_total_calls = 0;



	/**
	 * GET_INSTANCE
	 * Get an instance of a section_record object.
	 *
	 * It returns a cached instance from section_record_instances_cache if it exists for the given
	 * combination of section_tipo, section_id and temporal state.
	 * If not cached, it creates a new instance (section_record or section_record_temp).
	 *
	 * @param string $section_tipo The ontology tipo of the section
	 * @param int|string $section_id The record ID. String is deprecated and will be cast to int.
	 * @param bool $is_temporal Whether to use a temporal record instance (section_record_temp)
	 * @return section_record The section record instance
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
	 * Initialize a new section_record instance.
	 *
	 * Sets the core identification properties, initializes the shared section_record_data instance,
	 * determines the target database table based on the ontology tipo, and selects the
	 * appropriate data handler (matrix_db_manager or matrix_activity_db_manager).
	 *
	 * @param string $section_tipo The ontology tipo of the section
	 * @param int $section_id The record ID
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
	* Destruct this instance and clear the instance from the cache
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
	* Dispatches a save event for this section record
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
				// Single orchestrator: clears in-memory statics, the shared
				// file caches (registered tools list, config lists dd1324/dd996)
				// and the per-user tool resolution caches.
				tools_register::invalidate_all_tool_caches();
				break;

			default:
				// Nothing to do here
				break;
		}


	}//end save_event



	/**
	* LOAD_DATA
	* Loads the section DB record once.
	* The data fill the '$this->data_columns' values
	* with parsed integer and JSON values.
	* To force to reload the data form DB, set the property
	* 'this->is_loaded_data_columns' to false.
	* @return bool
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
	* Returns true if the section record already exists in the database.
	* @return bool
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
	* GET_COMPONENT_DATA
	* It gets all the data from the component as the database is stored,
	* with all languages, using the proper data column.
	* @param string $tipo
	* 	Component tipo
	* @param string $column
	* 	DB column where to get the data (relation,string...)
	* @return array|null $component_data
	*/
	public function get_component_data( string $tipo, string $column ) : ?array {

		// Load the DB data once
		$this->load_data();

		$component_data = $this->data_instance->get_key_data( $column, $tipo );

		return $component_data;
	}//end get_component_data



	/**
	* SET_COMPONENT_DATA
	* Set the component data into the section record shared data.
	* @param string $tipo
	* @param string $column
	* @param array|null $data
	* @return bool $result Array of matching elements or null if none found
	*/
	public function set_component_data( string $tipo, string $column, ?array $data ) : bool {

		$result = $this->data_instance->set_key_data( $column, $tipo, $data );

		return $result;
	}//end set_component_data



	/**
	* SET_COLUMN_DATA
	* Set the column data into the section record shared data.
	* @param string $column
	* @param object|null $data
	* @return bool $result Array of matching elements or null if none found
	*/
	public function set_column_data( string $column, ?object $data ) : bool {

		$result = $this->data_instance->set_column_data( $column, $data );

		return $result;
	}//end set_column_data



	/**
	 * SAVE
	 * Update all section_record data into DB
	 * Will save every column with current data
	 * The save data will update the row as section record is.
	 * - If the column is set as null the DB will delete it.
	 * - If the column has change or delete any component, the update will set the column as is.
	 * @return bool $result Boolean indicating whether the operation was successful
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
	* Saves given value into the specify json column, it could be:
	* a section data
	* a whole components data of the same data type (relation, string, date, etc.)
	* a whole components counter data
	* @param string $column
	* 	DB column
	* @param ?object $value
	* 	Column data value
	* @return bool
	* 	Returns false if JSON save fails.
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
	* Safely saves one key data of one column in a "matrix" table row,
	* identified by a composite key of `section_id` and `section_tipo`.
	* @param array $save_path
	* Array of objects with the following structure:
	* [
	*  (object)[
	*   'column' => 'relation',
	*   'key' => 'test80'
	* ]
	* ]
	* @return bool
	* Returns `true` on success, or `false` if validation fails,
	* query preparation fails, or execution fails.
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
	* Saves given data into the component container.
	* @param array $save_path
	* 	Array of objects with the following structure:
	*   [
	* 	 {
	* 		"key": "test52",
	* 		"column": "string"
	* 	 },
	* 	 {
	* 		"key": "test52",
	* 		"column": "meta"
	* 	 }
	* 	]
	* @return bool
	* 	Returns false if JSON fragment save fails.
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
	* Remove the record from DB
	* Save all section record data deleted into Time machine
	* @param bool $delete_diffusion_records=true
	* @return bool
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
	* Empty all columns components data
	* The empty will be saved into DB and Time machine
	* @return bool
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
	* @return
	*/
	public function delete_column() {

	}//end delete_column



	/**
	* GET_COMPONENT_COUNTER
	* Obtain the counter for given component ontology tipo
	* Components storage its id to match with any other component as dataframe
	* Data stored has the format:
	* "oh25" : [{
	* 	count: 1
	* }]
	* @param string $tipo
	* @return int $component_counter
	*/
	public function get_component_counter( string $tipo ) : int {

		$data = $this->data_instance->get_key_data( 'meta', $tipo ) ?? [] ; // default counter value is always 0, including the empty counter

		$component_counter = $data[0]->count ?? 0;

		return $component_counter;
	}//end get_component_counter



	/**
	* SET_COMPONENT_COUNTER
	* Fix the component counter with given ontology tipo and value
	* Set the counter of the component into section data schema
	* Data set has the format:
	* "oh25" : [{
	* 	count: 1
	* }]
	* @param string $tipo
	* @param int value
	* @return int $dato->counters->$tipo
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
	* Atomically allocates $count new data item ids for the given component tipo.
	* Item ids are the dataframe pairing keys (id_key): they must be unique per
	* component per section record and never reused, so allocation is serialized
	* with a PostgreSQL advisory lock and the counter is persisted immediately
	* (a plain read-increment-write of the in-memory counter races between
	* concurrent processes editing the same record).
	* The in-memory counter is synced so the subsequent record save keeps it.
	* @param string $tipo - component ontology tipo
	* @param int $count = 1 - how many ids to allocate
	* @return array - allocated ids, sequential, e.g. [8,9,10]
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
	* Atomically raises the component counter to at least $min_value
	* (no-op when the counter is already there). Used to absorb explicit
	* item ids carried by imported / migrated data without racing against
	* concurrent allocations.
	* @param string $tipo - component ontology tipo
	* @param int $min_value
	* @return int - the resulting counter value
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
	* Computes metadata save_path items and sets data_instance values.
	* Delegates data computation to build_modification_data to avoid duplication.
	* Does NOT save to DB — caller is responsible for calling save_key_data + save_event.
	* @param string $mode
	* 	'new_record' | 'update_record'
	* @return array
	* 	Array of save_path items [(object)['column'=>'relation','key'=>'dd197'], ...]
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
	* @param object $options
	* @return bool
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
	* Computes metadata save_path items and data values without side effects.
	* Pure function that returns both save_path and data_values for the caller to use.
	* Does NOT save to DB — caller is responsible for calling save_key_data + save_event.
	* @param string $section_tipo
	* 	The section tipo
	* @param string $mode
	* 	'new_record' | 'update_record'
	* @param int $user_id
	* 	The logged user ID
	* @return object
	* 	Object containing data to be set, keyed by column and tipo.
	* 	Returns empty object if section is activity section or user_id is empty.
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
	* When section is created at first time, a basic data is set to write into the new section.
	* @return object $data_values
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
	* Get calculated inverse locators for all matrix tables
	* @see search::calculate_inverse_locator
	* @return array $inverse_locators
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
	* @see section->Delete()
	* Saves the component data
	* @return array $removed_locators
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
	* "Remove" (rename and move files to deleted folder) all media file linked to current section (all quality versions)
	* @see section_record->delete()
	* @return array|null
	* 	Array of objects (removed components info)
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
	* Inserts a single row into a "matrix" table with automatic handling for JSON columns
	* and guaranteed inclusion of the `section_tipo` and `section_id` columns.
	* Before insert, creates/updates the proper counter value and uses the result as `section_id` value.
	* It is executed using prepared statement when the values are empty (default creation of empty record
	* adding `section_tipo` and `section_id` only) and with query params when is not (other
	* dynamic combinations of columns data).
	* @param string $section_tipo as oh1
	* @param int|null $section_id = null (optional)
	* @param object|null $values = null (optional)
	* Object with {column name : value} structure.
	* Keys are column names, values are their new values.
	* @return section_record|false
	* Returns the new section_record instance on success, or `false` if validation fails,
	* query preparation fails, or execution fails.
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
	* Creates a new record cloning all data from current section record
	* Force to save every component data to create a Time Machine and update its own state as component_info
	* Or create new media files according to the new section_id
	* @return int|string|null $section_id
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
	* Returns the processed data as an object with parsed JSON values.
	* If no row is found, it returns null.
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
	* Use when recover section from time machine. Get files "deleted" (renamed in 'deleted' folder) and move and rename to the original media folder
	* @return array|null $ar_restored
	* 	Array of objects (restored components info)
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
	* Returns the full table object
	* @return string $this->table
	*/
	public function get_table() : string {

		return $this->table;
	}//end get_table



	/**
	* GET_PERMISSIONS
	* @return int $this->permissions
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
	* @param string $timestamp
	*	$date is timestamp as "2016-06-15 20:01:15" or "2016-06-15"
	* This method is used mainly in importations
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
	* @param string $timestamp
	*	$date is timestamp as "2016-06-15 20:01:15" or "2016-06-15"
	* This method is used mainly in importations
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
	* @return string|null $local_value
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
	* @return string|null $local_value
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
	* Get created user id from section record data
	* @return int|null $created_by_userID
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
	* Set section dato property 'created_by_userID'
	* @return bool
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
	* Get modified user id from section record data
	* @return int|null $modified_by_userID
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
	* Set section dato property 'modified_by_userID'
	* @return bool
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
	* @param bool $full_name = false
	* @return string|null $user_name
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
	* @param bool $full_name = false
	* @return string|null $user_name
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
	* get_user_name_by_user_id
	* @param int $userID
	* @param bool $full_name = true
	* @return string $user_name
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
	* @return mixed
	*/
	public function jsonSerialize() : mixed {

		$vars = get_object_vars($this);

		// filter out null values to keep payload small (as dynamic properties behaved before)
		return array_filter($vars, function($val) {
			return $val !== null;
		});
	}



}//end section_record
