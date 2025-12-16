<?php declare(strict_types=1);
/**
* CLASS TM_RECORD
* It represents a database record in the PHP space.
*/
class tm_record {



	/**
	* CLASS VARS
	*/
	// in id
 	public int $id;
	// string section_tipo
 	public string $section_tipo;
 	// string|int section_id
 	public string|int $section_id;
	// section_record_data class instance
	protected object $data_instance;
	// To disable time machine save GLOBAL, set: tm_record::$save_tm = false;
	public static $save_tm = true;



	/**
	* GET_INSTANCE
	* Get an instance of a section_record object.
	* Not cached at now because the real shared data is from section_record_data.
	* @param int $id
	* @return tm_record $tm_record
	*/
	public static function get_instance( int $id ) : tm_record {

		return new tm_record($id);
	}//end get_instance



	/**
	* GET_INSTANCE
	* Cache section instances (singleton pattern)
	* @param int $id
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
	* CREATE
	* Inserts a single row into a "matrix_time_machine" table.
	* @param object $values
	* Object with {column name : value} structure.
	* Keys are column names, values are their new values.
	* @return section_record|false $section_id
	* Returns the new section_record instance on success, or `false` if validation fails,
	* query preparation fails, or execution fails.
	*/
	public static function create( object $values ) : tm_record|false {

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
			if( empty( $values->$column) ){
				debug_log( __METHOD__
					. " Column '$column' is mandatory" . PHP_EOL
					. ' values: ' . json_encode($values, JSON_PRETTY_PRINT)
					, logger::ERROR
				);
				return false;			
			}
		}

		// time_machine save before.
		// This allow safe time machine save data not already saved (old imports case for example)
		$previous_data = $values->previous_data ?? null;
		if ( !empty($previous_data) ) {

			$tm_values = new stdClass();
				$tm_values->section_id 		= $values->section_id; // string|int section_id (component parent)
				$tm_values->section_tipo 	= $values->section_tipo; // string section_tipo
				$tm_values->tipo 			= $values->tipo; // string $tipo (component_tipo)
				$tm_values->lang			= $values->lang; // string $lang			
				
			// Set the limit to 1
			// When the search give 1 record stop the search because time machine has previous data
			$limit = 1;

			$db_result = tm_record::search( $tm_values, $limit ); 
		 
			// empty records or not data match, mints that previous data exists in component but not in time_machine.
			// To fix this, save before the previous data and later the new data
			if ($db_result->row_count() < 1) {

				// Create a new record with the previous data
				$new_values = clone($values);
					// set a previous timestamp to save in db. This will make sure that we have not use the same timestamp of the changed data. 
					$new_values->timestamp = dd_date::get_timestamp_now_for_db( ['sub' => 'PT1M'] ); // now minus 1 minute.
					// use previous data as to-save data
					$new_values->data = $previous_data;
					 // clean previous component dato to prevent infinite loop
					$new_values->previous_data = null;
					// unset the bulk_process_id
					// unsaved time_machine data is a fix of previous saved data, it need to be outside the process because
					// the process need to be coherent to the change, the fix time_machine is other process than not happen previously.
					//save current data as previous of the process, to prevent revert it.
					$new_values->bulk_process_id = null;

				$new_tm_record = tm_record::create( $new_values );

				if(!$new_tm_record){
					debug_log( __METHOD__
						. " Error creating new record: "
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
		}//end if (!empty($previous_data))
		

		$id = tm_db_manager::create(
			$values
		);

		if( $id === false ){
			return false;
		}

		$tm_record = tm_record::get_instance( $id );


		return $tm_record;
	}//end create



	/**
	 * SEARCH
	 * Search records in the matrix table
	 * Compares columns with given search values and returns matching records
	 * @param object $values
	 * @param int $limit = 10
	 * @param int $offset = 0
	 * @param string|null $order_by = null
	 * @return db_result|false
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
		$sql .= PHP_EOL.'LIMIT '. $limit;
		$sql .= PHP_EOL.'OFFSET '. $offset;

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
	 * Set every component data of the Time machine into the section_record instance
	 * @param string $tipo - The type of component to set in time-machine
	 * @param array|null $data - The component's data
	 * @param section_record $section_record - The instance of Section Record
	 * @return bool - If operation was successful or not, true if success and false otherwise
	 */
	private function set_section_record_factory( string $tipo, ?array $data, section_record $section_record ) : bool {

		$model 	= ontology_node::get_model_by_tipo( $tipo, true );
		$column = section_record_data::get_column_name( $model );
		$result = $section_record->set_component_data( $tipo, $column, $data );

		return $result;
	}//end set_section_record_factory



	/**
	 * GET_SECTION_RECORD
	 * Get a section record from tm_record.
	 * transform the Time machine data into a section record object.
	 * Create the data for the Time machine components.
	 * Build the section_record with this data.
	 * @return section_record $section_record
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

		$section_record = section_record::get_instance( 'dd15', $id);

		// section_id 
			// the section_id that store the time machine data
			// dd1212 - component_number
			$id_data = new stdClass();
				$id_data->id 	= 1;
				$id_data->value = (int)$section_id;

			$this->set_section_record_factory(
				'dd1212',
				[$id_data], 
				$section_record 
			);		

		// When.
			// The time of the record was created in Time Machine. 
			// dd559 - component_date
			$date = dd_date::get_dd_date_from_timestamp( $timestamp );
			$date_value = new stdClass();
				$date_value->id 	= 1;
				$date_value->start 	= $date;

			$this->set_section_record_factory(
				'dd559',
				[$date_value], 
				$section_record 
			);

		// Where
			// The tipo of the component/section where the change was done.
			// Resolve the term of the tipo and use it as data of the component
			// dd577 - component_input_text
			$component_value = ontology_node::get_term_by_tipo(
				$tipo, // string tipo
				DEDALO_DATA_LANG, // string lang
				true, // bool from_cache
				true // bool fallback
			);

			$where_value = new stdClass();
				$where_value->id = 1;
				$where_value->lang = DEDALO_DATA_NOLAN;
				$where_value->value = $component_value;

			$this->set_section_record_factory(
				'dd577',
				[$where_value], 
				$section_record 
			);


		// Who
			// User. The user who made the change.
			// dd578 - component_autocomplete
			$user_locator = new locator();
				$user_locator->set_id(1);
				$user_locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
				$user_locator->set_section_id($user_id);
				$user_locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$user_locator->set_from_component_tipo('dd578');

			$this->set_section_record_factory(
				'dd578',
				[$user_locator], 
				$section_record 
			);

		// Annotation
			// Remark about the change made. This is used to provide context for the change and can be useful in auditing purposes. It's not mandatory.
			// Resolve the the annotation as string and inject into the component.
			// dd732 -  component_text_area
			
			// 1. search notes with current matrix_id
				$sqo = new search_query_object();
					$sqo->section_tipo	= DEDALO_TIME_MACHINE_NOTES_SECTION_TIPO; // rsc832
					$sqo->filter		= json_decode('{
						"$and": [
							{
								"q": "'.$id.'",
								"q_operator": null,
								"path": [
									{
										"section_tipo": "'.DEDALO_TIME_MACHINE_NOTES_SECTION_TIPO.'",
										"component_tipo": "rsc835",
										"model": "component_number",
										"name": "Code"
									}
								]
							}
						]
					}');
				$search = search::get_instance($sqo);
				$db_result = $search->search();

				$note_section_id = $db_result->fetch_one()->section_id ?? null;
			// 2. Create the component and get its data
			// the data will used as (injected into) the component data of the time_machine annotation component.
				$note_model			= ontology_node::get_model_by_tipo( 'rsc329', true );
				$current_component	= component_common::get_instance(
					$note_model,
					'rsc329',
					$note_section_id,
					'tm', // use tm mode to preserve service_time_machine coherence
					$ddo->lang ?? DEDALO_DATA_LANG,
					$sqo->section_tipo
				);

				$note_value = $current_component->get_data();				

				$this->set_section_record_factory(
					'dd732',
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
				'dd1371',
				[$bulk_process_id_value], 
				$section_record 
			);

		
		// Data
			$source_model = ontology_node::get_model_by_tipo($tipo,true);
			if($source_model==='section'){				
				
			}else{
				
				$this->set_section_record_factory(
					$tipo,
					$data, 
					$section_record 
				);

			}

		return $section_record;
	}//end get_section_record

}//end tm_record
