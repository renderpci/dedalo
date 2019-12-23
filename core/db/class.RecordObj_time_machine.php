<?php
include_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordDataBoundObject.php');
/**
* RECORDOBJ_TIME_MACHINE
*
*/
class RecordObj_time_machine extends RecordDataBoundObject {
	
	# MATRIX VARS
	#protected $id_matrix;
	protected $section_id;
	protected $section_tipo;
	protected $tipo;
	protected $lang;
	protected $timestamp;
	protected $userID;
	protected $state;
	protected $dato;	

	# ESPECIFIC VARS	
	protected $ar_time_machine_of_this;

	# TABLE  matrix_table
	protected static $time_machine_matrix_table = 'matrix_time_machine';

	static $save_time_machine_version = true;

	
	public function __construct($id=NULL) {		
		parent::__construct($id);		
	}
		
	# define current table (tr for this obj)
	protected function defineTableName() {
		return ( self::$time_machine_matrix_table );	
	}	
	# define PrimaryKeyName (id)
	protected function definePrimaryKeyName() {
		return ('id');	
	}	
	# array of pairs db field name, obj property name like fieldName => propertyName
	protected function defineRelationMap() {		
		return (array(
			# db fieldn ame			# property name
			"id" 					=> "ID",		# integer
			#"id_matrix" 			=> "id_matrix",	# integer
			"section_id" 			=> "section_id",# integer
			"section_tipo" 			=> "section_tipo",# string charvar 32
			"tipo" 					=> "tipo",		# string charvar 32
			"lang" 					=> "lang", 		# string 16
			"timestamp" 			=> "timestamp", # timestamp standar db format
			"userID" 				=> "userID", 	# integer
			"state" 				=> "state",		# string char 32
			"dato" 					=> "dato",		# jsonb format			
			));
	}//end defineRelationMap



	public function get_dato() {
		$dato = parent::get_dato();
		$dato = json_handler::decode($dato);
		return $dato;
	}//end get_dato



	public function set_dato($dato, $raw=false) {
		#dump($dato,"dato before");
		$dato = json_handler::encode($dato);
		#dump($dato,"dato after");
		parent::set_dato( $dato, $raw );
	}//end set_dato



	/**
	* GET_AR_TIME_MACHINE_OF_THIS		
	* AR TIME MACHINE : Array de registros de time_machine para el id_matrix recibido
	*/
	public static function get_ar_time_machine_of_this($tipo=null, $parent, $lang=null, $section_tipo, $limit=10, $offset=0) {


		/// Temporal !!!
		#$limit = 1000000;
				
		$ar_id 	= array();
		
		$arguments=array();
		if(!empty($tipo))	
		$arguments['tipo']			= $tipo;
		$arguments['section_id']	= $parent;
		$arguments['section_tipo']	= $section_tipo;
		if(!empty($lang))
		$arguments['lang']			= $lang;
		if(!empty($limit))
		$arguments['sql_limit']		= $limit;
		$arguments['offset']		= $offset;
		$arguments['order_by_desc']	= 'timestamp';
		
		$RecordObj_time_machine	= new RecordObj_time_machine(NULL);
		$ar_id					= $RecordObj_time_machine->search($arguments);
			#dump($ar_id,'ar_id '.print_r($arguments,true));
		
		#$ar_time_machine_of_this = array_values($ar_id);
		#foreach($ar_id as $id) {
		#	$ar_time_machine_of_this[] = $id;
		#}
		
		return $ar_id;
	}//end get_ar_time_machine_of_this


	
}
?>