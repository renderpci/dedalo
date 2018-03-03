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
		
		# Other tables. Test valid user
		if ( empty($_SESSION['dedalo4']['auth']['user_id']) ) {
			$msg = "Save matrix: valid 'userID' value is mandatory. No data is saved! ";
			trigger_error($msg);
			return false;	
		}
		
		return true;
	}//end test_can_save



	/**
	* SAVE JSON MATRIX
	* Call RecordDataBounceObject->Save() and RecordObj_time_machine->Save()
	*/
	public function Save( $save_options=null ) {

		if( $this->test_can_save()!==true ) {
			$msg = " Error (test_can_save). No matrix data is saved! ";
			trigger_error($msg, E_USER_ERROR);
			debug_log(__METHOD__." $msg - matrix_table: $this->matrix_table - $this->section_tipo - $this->section_id - save_options: ".to_string($save_options), logger::ERROR);
			
			return $msg;
		}
		
		# MATRIX SAVE (with parent RecordDataBoundObject)
		$id = parent::Save($save_options);
		

		# TIME MACHINE COPY SAVE (Return assigned id on save)
		# Every record saved in matrix is saved as copy in 'matrix_time_machine' except logger and TM recover section
		if(RecordObj_time_machine::$save_time_machine_version===true && $this->matrix_table!=='matrix_activity')	{
			# Exec time machine save and set returned id
			$this->time_machine_last_id = $this->save_time_machine( $save_options );
		}


		return $id;
	}//end Save



	/**
	* SAVE TIME MACHINE
	* @param object $save_options
	*/
	protected function save_time_machine( $save_options ) {

		/*
		if (empty($save_options->time_machine_data)) {
			#dump($save_options,"save_time_machine save_options");
			#trigger_error("Warning: Nothing to save in  time machine: time_machine_data is empty");
			if(SHOW_DEBUG===true) {
				#error_log("DEBUG INFO: ".__METHOD__ . " Empty save_options->time_machine_data. No time machine saved data. section_tipo:$this->section_tipo, section_id:$this->section_id");
				#dump($save_options->time_machine_data, ' save_options->time_machine_data ++ '.to_string());
				debug_log(__METHOD__." Empty save_options->time_machine_data. nothing is saved in TM  ".to_string(), logger::DEBUG);
			}
			return false;
		}
		*/
			
		$RecordObj_time_machine = new RecordObj_time_machine(null);
		/* Fields sample
		# db fieldn ame			# property name
		"id" 					=> "ID",		# integer
		"id_matrix" 			=> "id_matrix",	# integer
		"section_id" 			=> "section_id",# integer
		"section_tipo" 			=> "section_tipo",# string charvar 32
		"tipo" 					=> "tipo",		# string charvar 32
		"lang" 					=> "lang", 		# string 16
		"timestamp" 			=> "timestamp", # timestamp standar db format
		"userID" 				=> "userID", 	# integer
		"state" 				=> "state",		# string char 32
		"dato" 					=> "dato",		# jsonb format	
		*/
	
		
		# id_matrix
		#$RecordObj_time_machine->set_id_matrix( $this->get_ID() );
		# section_id
		$RecordObj_time_machine->set_section_id( $this->get_section_id() );	// $save_options->time_machine_section_id
		# section_tipo
		$RecordObj_time_machine->set_section_tipo( $this->get_section_tipo() );
		# tipo
		if(isset($save_options->time_machine_tipo))
		$RecordObj_time_machine->set_tipo( $save_options->time_machine_tipo );
		# lang
		if(isset($save_options->time_machine_lang))
		$RecordObj_time_machine->set_lang( $save_options->time_machine_lang );
		# timestamp
		$RecordObj_time_machine->set_timestamp( component_date::get_timestamp_now_for_db() );
		# userID
		$RecordObj_time_machine->set_userID( navigator::get_user_id() );
		# dato
		if(isset($save_options->time_machine_data))
		$RecordObj_time_machine->set_dato( $save_options->time_machine_data );			
		
		
		#dump($save_options,'$save_options->time_machine_data');
		#dump($RecordObj_time_machine,'$RecordObj_time_machine');
		#die();

		# Save obj	
		$RecordObj_time_machine->Save( $save_options );

		
		return $RecordObj_time_machine->get_ID();
	}//end save_time_machine
	
	
}
?>