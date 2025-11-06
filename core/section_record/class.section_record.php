<?php declare(strict_types=1);

/**
* CLASS SECTION RECORD
*
*/
class section_record {


	/**
	* CLASS VARS
	*/
 	public $section_tipo;
 	public $section_id;

	// section_record_data class instance
	protected object $data_instance;


	/**
	* GET_INSTANCE
	* Cache section instances (singleton pattern)
	* @param string $section_tipo
	* @param string|int $section_id
	*/
	public function __construct( string $section_tipo, string|int $section_id ) {

		// Set general vars
			$this->section_tipo	= $section_tipo;
			$this->section_id	= $section_id;


		// Initiate section_record_data instance.
			// It's instanced once and handles all the section data database tasks.
			$this->data_instance = section_record_data::get_instance(
				$this->section_tipo,
				$section_id
			);

	}//end get_instance



	/**
	* __DESTRUCT
	* @return
	*/
	public function __destruct() {

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

		/* TEST
		$column = 'string';
		$tipo = 'rsc21';
		// $rsc21_data = $this->section_record_data->get_data()['string']->{$tipo} ?? null;
		// $rsc21_data = $this->get_column('string')->{$tipo} ?? null;
		$rsc21_data = $this->data_columns[$column]->{$tipo} ?? null;
			dump($rsc21_data, ' rsc21_data ++ '.to_string());
		*/

		return true;
	}//end load_data



	/**
	* GET_DATA
	* Retrieves all columns data of the record
	* @return array $data
	*/
	public function get_data() : array {

		// force to load all data from database
		$this->load_data();

		// get all data columns
		$data = $this->data_instance->get_data();

		return $data;
	}//end get_data



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
	* @return array|null $result Array of matching elements or null if none found
	*/
	public function set_component_data( string $tipo, string $column, ?array $data ) : bool {

		$result = $this->data_instance->set_key_data( $column, $tipo, $data );

		return $result;
	}//end set_component_data



	/**
	* SAVE_COLUMN
	* Saves given value into the specify json column, it could be:
	* a section data
	* a whole components data of the same data type (relation, string, date, etc.)
	* a whole components counter data
	* @param string $column
	* 	DB column
	* @param ?array $value
	* 	Column data value
	* @return bool
	* 	Returns false if JSON save fails.
	*/
	public function save_column( string $column, ?array $value ) : bool {

		// 1 - update data_instance value
		$this->data_instance->set_column_data( $column, $value );

		// 2 - save to database the column
		$result = $this->data_instance->save_column_data( [$column] );


		return $result;
	}//end save_column



	/**
	* SAVE_COMPONENT_DATA
	* Saves given value into the component container.
	* @param string $column
	* 	DB column
	* @param string $tipo
	* 	Component tipo
	* @param ?array $value
	* 	Component data value
	* @return bool
	* 	Returns false if JSON fragment save fails.
	*/
	public function save_component_data( string $column, string $tipo, ?array $value ) : bool {

		// Set the value into the whole section record data
		$this->data_instance->set_key_data(
		 	$column,
			$tipo,
			$value
		);
		// Save into DB
		$result = $this->data_instance->save_key_data(
			$column,
			$tipo
		);

		if( $result === false ){
			return false;
		}

		// section updates

		// update_modified_section_data . Resolve and add modification date and user to current section dato
		// component save is always an update record
			$this->update_modified_section_data((object)[
				'mode' => 'update_record'
			]);


		return true;
	}//end save_component_data



	/**
	* DELETE_RECORD
	* Remove the record from DDBB
	* Save all section record data deleted into Time machine
	* @param bool $delete_diffusion_records=true
	* @return bool
	*/
	public function delete_record( bool $delete_diffusion_records=true ) : bool {

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

		// user id
			$user_id = logged_user_id();

		// 1. Time Machine
			// create a new time machine record. Always, even when the section has recovered previously, a new time machine record is created
			// to mark every section delete point in the time. For tool list, only the last record (state 'deleted') will be used.

				// Get the section record data to be storage into Time Machine
				$data = $this->get_data();

				// Create the Time Machine for this section
				$RecordObj_time_machine_new = new RecordObj_time_machine(null);
					$RecordObj_time_machine_new->set_section_id( $section_id );
					$RecordObj_time_machine_new->set_section_tipo( $section_tipo );
					$RecordObj_time_machine_new->set_tipo( $section_tipo );
					$RecordObj_time_machine_new->set_lang( DEDALO_DATA_NOLAN );
					$RecordObj_time_machine_new->set_timestamp( dd_date::get_timestamp_now_for_db() ); // Format 2012-11-05 19:50:44
					$RecordObj_time_machine_new->set_userID( $user_id );
					$RecordObj_time_machine_new->set_dato( $data );
					$RecordObj_time_machine_new->set_state('deleted');
				$id_time_machine = (int)$RecordObj_time_machine_new->Save();
				// check save resulting id
				if ($id_time_machine<1) {
					debug_log(__METHOD__
						." Error Processing Request. id_time_machine is empty "
						, logger::ERROR
					);
					throw new Exception("Error Processing Request. id_time_machine is empty", 1);
				}

				// check time machine dato
				$RecordObj_time_machine_new->blIsLoaded = false; // force to load the Time Machine data from DDBB
				$dato_time_machine	= $RecordObj_time_machine_new->get_dato();

				// JSON encode and decode each of them to unify types before compare
				$a			= json_handler::decode(json_handler::encode( $dato_time_machine ));
				$b			= json_handler::decode(json_handler::encode( $data ));
				$is_equal	= (bool)($a == $b);
				if ($is_equal===false) {
					debug_log(__METHOD__
						. " ERROR: The data_time_machine and data_section were expected to be identical. (time machine record: $id_time_machine [Section:Delete]." .PHP_EOL
						. ' Record is NOT deleted ! (3) ' . PHP_EOL
						. ' section_tipo: ' . $section_tipo . PHP_EOL
						. ' section_id: ' . $section_id
						, logger::ERROR
					);
					// debug
					dump($dato_time_machine, 'SHOW_DEBUG COMPARE ERROR dato_time_machine');
					dump($data,		 'SHOW_DEBUG COMPARE ERROR data');

					return false;
				}

			// clean old time machine records status (only the last record must be 'deleted' to allow tool_time_machine list easily)
				// get all time machine records for this section
				$ar_id_time_machine = RecordObj_time_machine::get_ar_time_machine_of_this(
					$section_tipo,
					$section_id,
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				// iterate all and remove 'deleted' state if is set (except for the last new created)
				foreach ($ar_id_time_machine as $current_id_time_machine) {
					if ($current_id_time_machine==$id_time_machine) {
						continue; // already set
					}
					$RecordObj_time_machine = new RecordObj_time_machine( (string)$current_id_time_machine );
					if ( $RecordObj_time_machine->get_state()==='deleted' ) {
						$RecordObj_time_machine->set_state(null);
						$RecordObj_time_machine->Save();
					}
				}

		// 2. Delete the record in DDBB
			$delete_result = $this->data_instance->delete();

			if( $delete_result===false ){
				debug_log(__METHOD__
					." Stopping to deleted section '$section_tipo'_'$section_id', error removing data from DDBB"
					, logger::ERROR
				);
				return false;
			}
			// Remove the instance and delete it from cache.
			$this->data_instance->__destruct();

		// 3. Remove this section record in linked sections and its own media
			// inverse references. Remove all inverse references to this section
				$this->remove_all_inverse_references();

			// media. Remove media files associated to this section
				$this->remove_section_media_files();

		// 4. Publication
			// Remove published records in MYSQL, etc.
			if ($delete_diffusion_records===true) {
				try {
					diffusion::delete_record($section_tipo, $section_id);
				} catch (Exception $e) {
					debug_log(__METHOD__
						." Error on diffusion::delete_record: " .PHP_EOL
						.' Exception Catch message: '.$e->getMessage()
						, logger::WARNING
					);
				}
			}

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
					'is_portal'		=> intval( (TOP_TIPO!==$section_tipo) ),
					'table'			=> common::get_matrix_table_from_tipo($section_tipo),
					'delete_mode'	=> 'delete_record',
					'section_tipo'	=> $section_tipo
				),
				$user_id // int
			);


		// Returns the delete result.
		return true;
	}//end delete_record




	/**
	* DELETE_DATA
	* Empty all components data
	* The empty will be save into DDBB and Time machine
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
			$ar_components_model_no_delete_dato = [
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

				// don't empty some components check
					if (in_array($current_model_name, $ar_components_model_no_delete_dato)){
						continue;
					}
				// Built every component and empty its data
				$translatable	= ontology_node::get_translatable($current_component_tipo);
				$lang		= ($translatable === false)
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
				// check if the component has data
				// if the components has not data continue to next one
				$current_component_data = $current_component->get_data();
				if(empty($current_component_data)){
					continue;
				}
				// Set the component data to null to empty
				// if the component is a component_filter set the main user project
				$empty_data = ($current_model_name==='component_filter')
					? $current_component->get_default_data_for_user( $user_id )
					: null;

				$current_component->set_data($empty_data);

				// save the component and set new Time Machine entry
				$current_component->save();

				// empty the media files, moving the media to delete directory.
				if(in_array($current_model_name, $ar_models_of_media_components)){
					$current_component->remove_component_media_files();
				}

				$ar_deleted_tipos[] = $current_component_tipo;
			}

		// remove component inside section data in DDBB
			$this->update_modified_section_data((object)[
				'mode' => 'update_data'
			]);

		// Log
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
					'is_portal'		=> intval( (TOP_TIPO!==$section_tipo) ),
					'table'			=> common::get_matrix_table_from_tipo($section_tipo),
					'delete_mode'	=> 'delete_record',
					'section_tipo'	=> $section_tipo
				),
				$user_id // int
			);


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
	* UPDATE_MODIFIED_SECTION_DATA
	* @param object $options
	* @return object $this->dato
	*/
	public function update_modified_section_data(object $options) : bool {

		if ($this->section_tipo===DEDALO_ACTIVITY_SECTION_TIPO) {
			return false;
		}

		// options
			$mode = $options->mode;

		// Fixed private tipos
			$modified_section_tipos = section::get_modified_section_tipos();
				$created_by_user	= array_find($modified_section_tipos, function($el){ return $el['name']==='created_by_user'; }); 	// array('tipo'=>'dd200', 'model'=>'component_select');
				$created_date		= array_find($modified_section_tipos, function($el){ return $el['name']==='created_date'; }); 		// array('tipo'=>'dd199', 'model'=>'component_date');
				$modified_by_user	= array_find($modified_section_tipos, function($el){ return $el['name']==='modified_by_user'; }); 	// array('tipo'=>'dd197', 'model'=>'component_select');
				$modified_date		= array_find($modified_section_tipos, function($el){ return $el['name']==='modified_date'; }); 		// array('tipo'=>'dd201', 'model'=>'component_date');

		// Current user locator
			$user_id		= logged_user_id();
			$user_locator	= new locator();
				$user_locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO); // dd128
				$user_locator->set_section_id($user_id); // logged user
				$user_locator->set_type(DEDALO_RELATION_TYPE_LINK);

		// Current date
			$dd_date	= component_date::get_date_now();
			$date_now 	= new stdClass();
				$date_now->start	= $dd_date;
				$date_now->id		= 1;
				$date_now->lang		= DEDALO_DATA_NOLAN;

		switch ($mode) {

			case 'new_record': // new record

				// Created by user
					$user_locator->set_from_component_tipo($created_by_user['tipo']);
					$this->data_instance->set_key_data(
						'relation',
						$created_by_user['tipo'],
						[$user_locator]
					);

				// Creation date
					$this->data_instance->set_key_data(
						'date',
						$created_date['tipo'],
						[$date_now]
					);

				// Save
					$this->data_instance->save_key_data(
						'relation',
						$created_by_user['tipo']
					);
					$this->data_instance->save_key_data(
						'date',
						$created_date['tipo']
					);

				break;

			case 'update_record': // update_record (record already exists)

				// Modified by user
					$user_locator->set_from_component_tipo($modified_by_user['tipo']);
					$this->data_instance->set_key_data(
						'relation',
						$modified_by_user['tipo'],
						[$user_locator]
					);

				// Modification date
					$this->data_instance->set_key_data(
						'date',
						$modified_date['tipo'],
						[$date_now]
					);

				// Save
					$this->data_instance->save_key_data(
						'relation',
						$modified_by_user['tipo']
					);
					$this->data_instance->save_key_data(
						'date',
						$modified_date['tipo']
					);

				break;
		}


		return true;
	}//end update_modified_section_data



	### INVERSE LOCATORS / REFERENCES #####################################################################################



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
			if($model_name==='component_dataframe'){
				$caller_dataframe = new stdClass();
					$caller_dataframe->section_id_key		= $current_locator->section_id_key;
					$caller_dataframe->section_tipo_key		= $current_locator->section_tipo_key;
					$caller_dataframe->main_component_tipo	= $current_locator->main_component_tipo;
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
					dump($component->get_dato(), ' remove_all_inverse_references component->get_dato() ++ '.to_string());
				}
			}
		}//end foreach ($inverse_locators as $current_locator)


		return $removed_locators;
	}//end remove_all_inverse_references



	/**
	* REMOVE_SECTION_MEDIA_FILES
	* "Remove" (rename and move files to deleted folder) all media file linked to current section (all quality versions)
	* @see section record->delete_record()
	* @return array|null
	* 	Array of objects (removed components info)
	*/
	protected function remove_section_media_files() : ?array {

		$ar_removed = [];

		// short vars
			$section_tipo	= $this->section_tipo;
			$section_id		= $this->section_id;
			$data			= $this->get_data();

			$media_data = $data['media'];

			if( empty($media_data) ){
				debug_log(__METHOD__." Nothing to remove ".to_string(), logger::DEBUG);
				return $ar_removed;
			}

			$media_component_models = component_media_common::get_media_components();

		// components into section dato
			$media_tipos = array_keys($media_data);
			foreach( $media_tipos as $component_tipo ) {

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

				$ar_restored[] = (object)[
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



	// static methods


	/**
	* CREATE
	* Inserts a single row into a "matrix" table with automatic handling for JSON columns
	* and guaranteed inclusion of the `section_tipo` and `section_id` columns.
	* Before insert, creates/updates the proper counter value and uses the result as `section_id` value.
	* It is executed using prepared statement when the values are empty (default creation of empty record
	* adding `section_tipo` and `section_id` only) and with query params when is not (other
	* dynamic combinations of columns data).
	* @param string $section_tipo as oh1
	* @param array $values = [] (optional)
	* Assoc array with [column name => value] structure.
	* Keys are column names, values are their new values.
	* @return section_record|false $section_id
	* Returns the new section_record instance on success, or `false` if validation fails,
	* query preparation fails, or execution fails.
	*/
	public static function create( string $section_tipo, array $values=[] ) : section_record|false {

		$table = common::get_matrix_table_from_tipo($section_tipo);

		$section_id = matrix_db_manager::create(
			$table,
			$section_tipo,
			$values
		);

		if( $section_id === false ){
			return false;
		}

		$section_record = new section_record( $section_tipo, $section_id );


		return $section_record;
	}//end create


}