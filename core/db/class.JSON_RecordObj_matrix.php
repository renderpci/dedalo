<?php
// declare(strict_types=1);
/**
* JSON_RECORDOBJ_MATRIX
*
*/
class JSON_RecordObj_matrix extends JSON_RecordDataBoundObject {

	# matrix vars
	protected $section_id;
	protected $section_tipo;
	protected $datos;


	// specific vars
	protected $caller_obj; 	// optional

	// table matrix_table
	protected $matrix_table ;

	// time machine last id
	public $time_machine_last_id;

	public $datos_time_machine;

	// static cache for RecordObj_matrix instances
	public static $ar_JSON_RecordObj_matrix_instances = [];



	/**
	* GET_INSTANCE
	* Cache JSON_RecordObj_matrix instances (singleton pattern)
	* @param string $matrix_table = null
	* @param string|int|null $section_id = null
	* @param string $tipo = null
	* @param bool $cache = true
	*
	* @return JSON_RecordObj_matrix $instance
	*/
	public static function get_instance(string $matrix_table=null, int $section_id=null, string $section_tipo=null, bool $cache=false) : JSON_RecordObj_matrix {

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
				$cache_key = $section_tipo .'_'. $section_id;
				if ( !isset(self::$ar_JSON_RecordObj_matrix_instances[$cache_key]) ) {
					self::$ar_JSON_RecordObj_matrix_instances[$cache_key] = new JSON_RecordObj_matrix($matrix_table, $section_id, $section_tipo);
				}


		return self::$ar_JSON_RecordObj_matrix_instances[$cache_key];
	}//end get_instance



	/**
	* CONSTRUCT
	*/
	public function __construct(string $matrix_table=null, int $section_id=null, string $section_tipo=null) {

		#dump($section_id,"__construct JSON_RecordObj_matrix , matrix_table: $matrix_table");

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

		if ( !empty($section_id) ) {
			# Ignore other vars
			//parent::__construct($section_id, $section_tipo);
			parent::__construct(null);
		}else{
			parent::__construct(null);
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
	protected function defineRelationMap() : array {
		return (array(
			# db field-name	   # property name
			"id"			=> "ID",
			"section_id"	=> "section_id",
			"section_tipo"	=> "section_tipo",
			"datos"			=> "datos"
		));
	}
	# get_ID
	public function get_id() : ?int {
		return parent::get_ID();
	}



	/**
	* TEST CAN SAVE
	* Test data before save to avoid write malformed matrix data
	* @return bool
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
	* @return int|null $id
	* 	Matrix id from target table record
	*/
	public function Save( object $save_options=null ) : ?int {
		$start_time = start_time();

		// test_can_save
			if( $this->test_can_save()!==true ) {
				$msg = " Error (test_can_save). No matrix data is saved! ";
				trigger_error($msg, E_USER_ERROR);
				debug_log(__METHOD__." $msg - matrix_table: $this->matrix_table - $this->section_tipo - $this->section_id - save_options: ".to_string($save_options), logger::ERROR);
				return false;
			}

		# MATRIX SAVE (with parent RecordDataBoundObject)
		# Returned id can be false (error on save), matrix id (normal case), section_id (activity case)
		// $id = parent::Save($save_options);

		# TIME MACHINE COPY SAVE (Return assigned id on save)
		# Every record saved in matrix is saved as copy in 'matrix_time_machine' except logger and TM recover section
		# if(RecordObj_time_machine::$save_time_machine_version===true && $this->matrix_table!=='matrix_activity') { DEDALO_ACTIVITY_SECTION_TIPO
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
				debug_log(__METHOD__
					." Saved record ($this->matrix_table - $this->section_tipo - $this->section_id): ".exec_time_unit($start_time).' ms'
					, logger::DEBUG
				);
			}


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
	public function save_time_machine( object $save_options ) : int {

		// options
			$tipo						= $save_options->time_machine_tipo ?? null;
			$section_id					= $save_options->time_machine_section_id ?? null;
			$section_id_key				= $save_options->time_machine_section_id_key ?? null;
			$lang						= $save_options->time_machine_lang ?? null;
			$time_machine_data			= $save_options->time_machine_data ?? null;
			// saving from component cases
			$previous_component_dato	= $save_options->previous_component_dato ?? null;
			$time_machine_date			= $save_options->time_machine_date ?? dd_date::get_timestamp_now_for_db();

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
				// "section_id_key"	=> "section_id_key" // integer

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
					0, // int offset
					$section_id_key
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
						if (isset($this->datos) && isset($this->datos->created_date)) {
							$created_date = $this->datos->created_date;
							$new_options->time_machine_date = $created_date;
						}
					$this->save_time_machine( $new_options );
					debug_log(__METHOD__
						." Saved time machine NOT already saved component dato. tipo: $tipo, section_tipo: $section_tipo, section_id: $section_id" . PHP_EOL
						.' previous_component_dato: '. to_string($previous_component_dato)
						, logger::WARNING
					);
				}
			}//end if (!empty($previous_component_dato))

		// configure time machine object

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
			// dato
				if (isset($section_id_key)) {
					$RecordObj_time_machine->set_section_id_key( $section_id_key );
				}

		// Save obj
			$RecordObj_time_machine->Save();

		// time_machine_id. get from saved record
			$time_machine_id = (int)$RecordObj_time_machine->get_ID();


		return $time_machine_id;
	}//end save_time_machine



}//end JSON_RecordObj_matrix
