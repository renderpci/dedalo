<?php
require_once(DEDALO_ROOT . '/jer/class.Jerarquia.php');
#require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordDataBoundObject.php');

# ts_lang RecordObj

class RecordObj_jer extends RecordDataBoundObject {
	
	# FIELDS
	protected $id;
	protected $alpha3;
	protected $alpha2;
	protected $nombre;
	protected $tipo;
	protected $activa;
	protected $mainLang;
	
	# FIELDS EXTERNAL
	
	# OPTIONAL ESPECIFIC LOADS	
	
	
	function __construct($id=NULL) {
		
		/*
		if($id<1) die("Error RecordObj_jer: id value is not valid (id:$id)");
		
		# as id is not autoincrement (is a manual value), before use this obj, verify the id
		$idExists = $this->idExists($id);
		
		# if not exists, we create one record with this id and continue normally
		if(!$idExists) {
			$this->createRecord($id);				
		}
		*/
		
		# call to parent construct with id verifyed (RecordDataBoundObject)
		parent::__construct($id);
	}
	
	
	# define current table (tr for this obj)
	protected function defineTableName() {
		return ('jerarquia');	
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
			"alpha3"							=> "alpha3",
			"alpha2" 							=> "alpha2",
			"nombre" 							=> "nombre",
			"tipo" 								=> "tipo",
			"activa" 							=> "activa",
			"mainLang" 							=> "mainLang",			
			));
	}
	
	
	
	# nombre functions
	public function get_nombre() {
		$string = parent::get_nombre();
		if($string) stripslashes($string);
		return $string;	
	}


	public function set_nombre($string) {
		$string = stripslashes($string); 
		$string = addslashes($string);
		parent::set_nombre($string);
	}


	
	protected function idExists($id) {
		$sql = " 
			SELECT id
			FROM {$this->defineTableName()} as t
			WHERE 
			t.id = '$id'
			";
			$res = mysql_query($sql, DB::_getConnection());
			if(!$res) die(__METHOD__."<br>Failed from id: $id ");
			
			$nRows = mysql_num_rows($res);
			
			# exists !
			if($nRows>0) return(true);
			
			return false;	
	}


	
	protected function createRecord($id) {
		$sql = " 
			INSERT INTO {$this->defineTableName()} (id) VALUES ('$id')
			";
			$res = mysql_query($sql, DB::_getConnection());
			if(!$res) die(__METHOD__."<br>Failed from id: $id ");
			
			return true;	
	}
	
	
	
	
	# resolve main lang
	public static function get_mainLang_static($terminoID) {

		static $ar_mainLang;
		if(isset($ar_mainLang[$terminoID])) {
			#error_log("Returned from static : $terminoID");
			#dump('XXXX',"Returned from static : $terminoID");
			return($ar_mainLang[$terminoID]);
		}

		#dump($terminoID); die();
		if(strlen($terminoID)<2) return(NULL);		
				
		$alpha2 = Tesauro::terminoID2prefix($terminoID);		
		$alpha2	= strtoupper($alpha2);
				
		$arguments=array();
		$arguments['alpha2']	= $alpha2;
		$RecordObj_jer			= new RecordObj_jer(NULL);	
		$ar_id					= $RecordObj_jer->search($arguments);
			#dump($ar_id, 'ar_id', $arguments);
		
		if(empty($ar_id[0]))	return(NULL);
		
		
		$RecordObj_jer			= new RecordObj_jer($ar_id[0]);
		$mainLang				= $RecordObj_jer->get_mainLang();

		$ar_mainLang[$terminoID] = $mainLang;
		
		return $mainLang;				
	}
	
	
	# resolve main lang
	public static function get_nombre_by_id($id) {		
		$RecordObj_jer = new RecordObj_jer($id);
		return $RecordObj_jer->get_nombre()	;
	}

	

	# GET_ALL_TIPOS
	public static function get_ar_all_tipos() {
		
		$ar_final 	= array();	

		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'id';
		$arguments['sql_code']			= 'id > 0';
		$arguments['order_by_asc']		= 'nombre';
		$RecordObj_jer					= new RecordObj_jer(NULL);	
		$ar_records						= $RecordObj_jer->search($arguments,'jerarquia_tipos');
			#dump($ar_records,'$ar_records');

		foreach ($ar_records as $current_id) {
			$arguments=array();
			$arguments['strPrimaryKeyName']	= 'nombre';
			$arguments['id']				= $current_id;
			$RecordObj_jer					= new RecordObj_jer(NULL);	
			$ar_records						= $RecordObj_jer->search($arguments,'jerarquia_tipos');

			$ar_final[$current_id] = $ar_records[0];
		}

		return $ar_final;
	}



	/**
	* GET_TESAURO_BY_JER_TIPO
	* @see component_autocomplete_ts->get_ar_referenced_tipo
	*/
	public static function get_ar_tesauro_by_jer_tipo($tipo, $activa=true) {

		#if(SHOW_DEBUG) $start_time = start_time();

		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'alpha2';
		$arguments['tipo']				= $tipo;
		if($activa)
			$arguments['activa']		= 'si';

		$RecordObj_jer					= new RecordObj_jer(NULL);
		$ar_records						= $RecordObj_jer->search($arguments);

		#if(SHOW_DEBUG) {
			#$total=round(microtime(1)-$start_time,4);
			#debug_log(__METHOD__." Total: ".$total, logger::DEBUG);			
		#}
		
		return $ar_records;

	}//end get_ar_tesauro_by_jer_tipo


	
}
?>