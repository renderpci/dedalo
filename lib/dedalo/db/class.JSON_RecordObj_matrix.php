<?php
include(DEDALO_LIB_BASE_PATH . '/db/class.JSON_RecordDataBoundObject.php');
/**
* JSON_RECORDOBJ_MATRIX
*
*/
class JSON_RecordObj_matrix extends JSON_RecordDataBoundObject {

	# MATRIX VARS
	protected $section_id;
	protected $section_tipo;
	protected $datos;


	# ESPECIFIC VARS
	protected $caller_obj; 	# optional

	# TABLE  matrix_table
	protected $matrix_table ;

	# TIME MACHINE LAST ID
	public $time_machine_last_id;

	public $datos_time_machine;

	#public $dato;

	/**
	* CONSTRUCT
	*/
	public function __construct($matrix_table=NULL, $section_id=NULL, $section_tipo=NULL) {

		#dump($section_id,"__construct JSON_RecordObj_matrix , matrix_table: $matrix_table");

		if(empty($matrix_table)) {
			if(SHOW_DEBUG===true)
				dump($matrix_table,"section_id:$section_id - tipo:$section_tipo");
			throw new Exception("Error Processing Request. Matrix wrong name ", 1);
		}

		if(empty($section_id)) {
			if(SHOW_DEBUG===true) {
				#dump($section_id,"section_id:$section_id is null for: matrix_table:$matrix_table, section_tipo:$section_tipo, caller:".debug_backtrace()[1]['function']);
				#dump( debug_backtrace(), 'debug_backtrace');
			}
		}

		if(empty($section_tipo)) {
			if(SHOW_DEBUG===true)
				dump($section_tipo,"section_id:$section_id - matrix_table:$matrix_table");
			throw new Exception("Error Processing Request. section_tipo is empty ", 1);
		}

		# Fix mandatory vars
		# TABLE SET ALWAYS BEFORE CONSTRUCT RECORDATABOUNDOBJECT
		$this->matrix_table = $matrix_table;
		$this->section_tipo = $section_tipo;
		$this->section_id 	= $section_id;

		if ( !empty($section_id) ) {
			# Ignore other vars
			//parent::__construct($section_id, $section_tipo);
			parent::__construct(NULL);
		}else{
			parent::__construct(NULL);
		}
	}//end __construct



	# define current table (tr for this obj)
	protected function defineTableName() {
		return ( $this->matrix_table );
	}
	# define PrimaryKeyName (id)
	protected function definePrimaryKeyName() {
		return ('id');
	}
	# array of pairs db field name, obj property name like fieldName => propertyName
	protected function defineRelationMap() {
		return (array(
			# db fieldn ame		# property name
			"id" 				=> "ID",
			"section_id" 		=> "section_id",
			"section_tipo" 		=> "section_tipo",
			"datos" 			=> "datos",
			));
	}

	public function get_ID() {
		return parent::get_ID();
	}


	/**
	* TEST CAN SAVE
	* Test data before save to avoid write malformed matrix data
	*/
	private function test_can_save() {

		$ar_tables_can_save_without_login = array(
			'matrix_activity',
			'matrix_counter',
			'matrix_stats'
			);

		# Tables without login need
		if ( in_array($this->matrix_table, $ar_tables_can_save_without_login) ) {
			return true;
		}

		# Other tables. Test valid user (fast check only auth->user_id in session)
		if ( !isset($_SESSION['dedalo4']['auth']['user_id']) ) {
			$msg = "Save matrix: valid 'userID' value is mandatory. No data is saved! ";
			trigger_error($msg);
			return false;
		}

		return true;
	}//end test_can_save



	/**
	* SAVE
	* (json matrix)
	* Call RecordDataBounceObject->Save() and RecordObj_time_machine->Save()
	* @param object $save_options = null
	* Sample:
	* {
	*	"is_portal": false,
	*	"portal_tipo": false,
	*	"main_components_obj": false,
	*	"main_relations": false,
	*	"top_tipo": "oh1",
	*	"top_id": false,
	*	"new_record": false,
	*	"forced_create_record": false,
	*	"time_machine_data": [
	*		"Título entrevista uno b"
	*	],
	*	"time_machine_lang": "lg-eng",
	*	"time_machine_tipo": "oh16",
	*	"time_machine_section_id": 1,
	* 	"previous_component_dato": [
	*		{
	*			"type": "dd151",
	*			"section_id": "5",
	*			"section_tipo": "dd898",
	*			"from_component_tipo": "oh18"
	*		},
	*		{
	*			"type": "dd151",
	*			"section_id": "10",
	*			"section_tipo": "dd898",
	*			"from_component_tipo": "oh18"
	*		}
	*	]
	* }
	* @return int $id
	* 	Matrix id from target table record
	*/
	public function Save( $save_options=null ) {

		// test_can_save
			if( $this->test_can_save()!==true ) {
				$msg = " Error (test_can_save). No matrix data is saved! ";
				trigger_error($msg, E_USER_ERROR);
				debug_log(__METHOD__." $msg - matrix_table: $this->matrix_table - $this->section_tipo - $this->section_id - save_options: ".to_string($save_options), logger::ERROR);
				return $msg;
			}


		// # MATRIX SAVE (with parent RecordDataBoundObject)
		// # Returned id can be false (error on save), matrix id (normal case), section_id (activity case)
		// $id = parent::Save($save_options);


		# TIME MACHINE COPY SAVE (Return assigned id on save)
		# Every record saved in matrix is saved as copy in 'matrix_time_machine' except logger and TM recover section
		# if(RecordObj_time_machine::$save_time_machine_version===true && $this->matrix_table!=='matrix_activity') {
		if($this->matrix_table!=='matrix_activity' && $this->matrix_table!=='matrix_stats') {

			// check time machine options values
				// Time machine options default values
				// $options->time_machine_data			= false;
				// $options->time_machine_lang			= false;
				// $options->time_machine_tipo			= false;
				// $options->time_machine_section_id 	= (int)$this->section_id; // always

			if ( empty($save_options->time_machine_tipo) || $save_options->time_machine_data===false ) {
				// case section is saved (update) not triggered by a component.
				// For example, when updating section publication date (diffusion_info)
				// debug_log(__METHOD__." Ignored time machine save (empty time_machine_tipo or time_machine_data) - save_options: ".to_string($save_options), logger::DEBUG);
			}else{

				# Exec time machine save and set returned id
				$this->time_machine_last_id = $this->save_time_machine( $save_options );
			}
		}

		// (!) MOVED AFTER TIME_MACHINE SAVE (12-11-2022) TO ALLOW SAVE UNSAVED COMPONENT VALUES (OLD IMPORTS..)
		// MATRIX SAVE (with parent RecordDataBoundObject)
		// Returned id can be false (error on save), matrix id (normal case), section_id (activity case)
		$id = parent::Save($save_options);


		return $id;
	}//end Save



	/**
	* SAVE TIME MACHINE
	* @param object $save_options
	* Sample:
	* {
	*	"is_portal": false,
	*	"portal_tipo": false,
	*	"main_components_obj": false,
	*	"main_relations": false,
	*	"top_tipo": "oh1",
	*	"top_id": false,
	*	"new_record": false,
	*	"forced_create_record": false,
	*	"time_machine_data": [
	*		"Título entrevista uno b"
	*	],
	*	"time_machine_lang": "lg-eng",
	*	"time_machine_tipo": "oh16",
	*	"time_machine_section_id": 1,
	* 	"previous_component_dato": [
	*		{
	*			"type": "dd151",
	*			"section_id": "5",
	*			"section_tipo": "dd898",
	*			"from_component_tipo": "oh18"
	*		},
	*		{
	*			"type": "dd151",
	*			"section_id": "10",
	*			"section_tipo": "dd898",
	*			"from_component_tipo": "oh18"
	*		}
	*	]
	* }
	* @return int $time_machine_id
	*/
	protected function save_time_machine( $save_options ) {

		// options
			$tipo						= $save_options->time_machine_tipo;
			$section_id					= $save_options->time_machine_section_id ?? null;
			// saving from component cases
			$previous_component_dato	= $save_options->previous_component_dato ?? null;
			$component_lang				= $save_options->time_machine_lang ?? null;
			$time_machine_date 			= $save_options->time_machine_date ?? component_date::get_timestamp_now_for_db();

		// short vars
			$section_tipo = $this->get_section_tipo();


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


		// time_machine save before.
		// This allow safe time machine save data not already saved (old imports case for example)
			if (!empty($previous_component_dato)) {

				// already exists check
				$data_already_exists = false;
				// get_ar_time_machine_of_this return an array of found matrix_time_machine id values
				$tm_records = RecordObj_time_machine::get_ar_time_machine_of_this(
					$tipo, // string $tipo (component_tipo)
					$section_id, // string|int section_id (component parent)
					$component_lang, // string $component_lang
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
						$created_date = $this->datos->created_date;
						$new_options->time_machine_date = $created_date;
					$this->save_time_machine( $new_options );
					debug_log(
						__METHOD__." Saved time machine NOT already saved component dato. tipo: $tipo, section_tipo: $section_tipo, section_id: $section_id".PHP_EOL.to_string($previous_component_dato),
						logger::WARNING
					);
				}
			}//end if (!empty($previous_component_dato))

		// configure $RecordObj_time_machine object
			// section_id
				$RecordObj_time_machine->set_section_id( $this->get_section_id() );	// $save_options->time_machine_section_id

			// section_tipo
				$RecordObj_time_machine->set_section_tipo( $this->get_section_tipo() );

			// tipo
				if(isset($save_options->time_machine_tipo)) {
					$RecordObj_time_machine->set_tipo( $save_options->time_machine_tipo );
				}

			// lang
				if(isset($save_options->time_machine_lang)) {
					$RecordObj_time_machine->set_lang( $save_options->time_machine_lang );
				}

			// timestamp
				$RecordObj_time_machine->set_timestamp( $time_machine_date );

			// userID
				$RecordObj_time_machine->set_userID( navigator::get_user_id() );

			// dato
				if(isset($save_options->time_machine_data)) {
					$RecordObj_time_machine->set_dato( $save_options->time_machine_data );
				}


		// Save obj
			$RecordObj_time_machine->Save();

		// time_machine_id. get from saved record
			$time_machine_id = $RecordObj_time_machine->get_ID();


		return $time_machine_id;
	}//end save_time_machine



}//end JSON_RecordObj_matrix
