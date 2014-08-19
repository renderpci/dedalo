<?php
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordDataBoundObject.php');


class RecordObj_time_machine extends RecordDataBoundObject {
	
	# MATRIX VARS
	protected $parent;
	protected $dato;
	protected $tipo;
	protected $lang;

	# ESPECIFIC VARS
	protected $id_matrix;
	protected $timestamp;
	protected $userID;	
	protected $ar_time_machine_of_this;

	# TABLE  matrix_table
	protected static $time_machine_matrix_table = 'matrix_time_machine';	

	
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
			# db fieldn ame						# property name
			"id" 								=> "ID",
			"id_matrix" 						=> "id_matrix",
			"parent" 							=> "parent",			
			"dato" 								=> "dato",
			"tipo" 								=> "tipo",
			"lang" 								=> "lang",
			"timestamp" 						=> "timestamp",
			"userID" 							=> "userID",
			));
	}
	
	
	/* PASADO AL PARENT (RecordDataBounceObject) +++
	# GET DATO 
	# Verifica si está codificado JSON. Si lo está, lo devuelve decodificado
	function get_dato() {
			
		$dato = parent::get_dato();
		
		if(json_decode($dato) == NULL) {
			return $dato;
		}else{
			return json_decode($dato);
		}	
	}
	*/
	
	
	# AR TIME MACHINE : Array de registros de time_machine para el id_matrix recibido
	public static function get_ar_time_machine_of_this($id_matrix, $lang=NULL) {
				
		$ar_time_machine_of_this 	= array();
		
		$arguments=array();			
		$arguments['id_matrix']		= $id_matrix ;
		if(!empty($lang))
		$arguments['lang']			= $lang ;
		$arguments['order_by_desc']	= 'timestamp';
		
		$RecordObj_time_machine		= new RecordObj_time_machine(NULL);
		$ar_id						= $RecordObj_time_machine->search($arguments);
			#dump($ar_id,'ar_id');
		
		foreach($ar_id as $id) {
			$ar_time_machine_of_this[] = $id;			
		}
		
		return $ar_time_machine_of_this ;
	}
	
	
	
	# GET USER NAME
	function get_user_name() {
		
		$userID			= $this->get_userID();
		
		# ¿ALGUNA OTRA FORMA DE SABER EL TIPO DEL CAMPO USUARIO ???????
		$user_name_tipo	= DEDALO_USER_NAME;#$_SESSION['config4']['user_name_tipo'];
		
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'dato' ;			
		$arguments['parent']			= intval($userID) ;
		$arguments['tipo']				= $user_name_tipo ;		
		
		$matrix_table 					= 'matrix';#common::get_matrix_table_from_tipo($user_name_tipo);
		$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
		$ar_id							= $RecordObj_matrix->search($arguments);		#dump($arguments);dump($ar_id);
		
		if(!empty($ar_id[0])) return $ar_id[0];
		
		return NULL;
	}
	
	
	# GET USER NAME
	function get_mod_date() {
		
		$timestamp	= $this->get_timestamp();
		
		switch(DEDALO_APPLICATION_LANG) {
			
			case 'lg-eng' :	$date = date('D, d M Y H:i:s', strtotime ($timestamp) ); break;			
			default :		$date = date('D, d M Y H:i:s', strtotime ($timestamp) ); break;
		}
		 
		return $date;		
	}

	
}
?>