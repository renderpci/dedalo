<?php
// declare(strict_types=1);
/**
* RecordObj_time_machine
*
*
*/
class RecordObj_time_machine extends RecordDataBoundObject {



	// matrix vars
	// protected $id_matrix;
	protected $section_id;
	protected $section_tipo;
	protected $tipo;
	protected $lang;
	protected $timestamp;
	protected $userID;
	protected $state;
	protected $section_id_key; // used by comopnent_dataframe

	public $dato;

	// specific vars
	protected $ar_time_machine_of_this;

	// table  matrix_table
	protected static $time_machine_matrix_table = 'matrix_time_machine';

	static $save_time_machine_version = true;

	public $use_cache = false; // overwrite default that is true (for structure only)
	public $use_cache_manager = false;


	public function __construct( ?string $id=null ) {
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
			# db field name		# property name
			'id'				=> 'ID',			// integer
			#'id_matrix'		=> 'id_matrix',		// integer
			'section_id'		=> 'section_id',	// integer
			'section_tipo'		=> 'section_tipo',	// string varchar 32
			'tipo'				=> 'tipo',			// string varchar 32
			'lang'				=> 'lang',			// string 16
			'timestamp'			=> 'timestamp',		// timestamp standard db format
			'userID'			=> 'userID',		// integer
			'state'				=> 'state',			// string char 32
			'dato'				=> 'dato',			// jsonb format
			'section_id_key'	=> 'section_id_key'	// integer
		));
	}//end defineRelationMap



	public function get_dato() {
		$dato = parent::get_dato();
		if(!empty($dato)){
			$dato = json_handler::decode($dato);
		}
		return $dato;
	}//end get_dato



	public function set_dato($dato, $raw=false) {
		$dato = json_handler::encode($dato);
		parent::set_dato( $dato, $raw );
	}//end set_dato



	/**
	* GET_AR_TIME_MACHINE_OF_THIS
	* AR TIME MACHINE : Array of time_machine records for the received id_matrix
	* @param string $tipo = null
	* @param int $parent=null
	* @param string $lang=null
	* @param string $section_tipo = null
	* @param int $limit = 10
	* @param int $offset = 0
	* @param int $section_id_key = 0
	* @return array $ar_id
	*/
	public static function get_ar_time_machine_of_this(string $tipo=null, int|string $parent=null, string $lang=null, string $section_tipo=null, int $limit=10, int $offset=0, int $section_id_key=null) : array {

		/// Temporal !!!
		#$limit = 1000000;

		$ar_id 	= array();

		$arguments=array();
		if(!empty($tipo))
		$arguments['tipo']			= $tipo;
		$arguments['section_id']	= (int)$parent;
		$arguments['section_tipo']	= $section_tipo;
		if(isset($section_id_key)){
			$arguments['section_id_key']	= $section_id_key;
		}
		if(!empty($lang))
		$arguments['lang']			= $lang;
		if(!empty($limit))
		$arguments['sql_limit']		= $limit;
		$arguments['offset']		= $offset;
		$arguments['order_by_desc']	= 'timestamp';

		$RecordObj_time_machine	= new RecordObj_time_machine(NULL);
		$ar_id					= $RecordObj_time_machine->search($arguments);

		#$ar_time_machine_of_this = array_values($ar_id);
		#foreach($ar_id as $id) {
		#	$ar_time_machine_of_this[] = $id;
		#}

		return $ar_id;
	}//end get_ar_time_machine_of_this



}//end classRecordObj_time_machine
