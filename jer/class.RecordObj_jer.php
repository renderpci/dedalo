<?php
require_once(DEDALO_ROOT . '/jer/class.Jerarquia.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordDataBoundObject.php');

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
		#var_dump($terminoID);		
		if(strlen($terminoID)<2) return(NULL);		
				
		$alpha2 = Tesauro::terminoID2prefix($terminoID);		
		$alpha2	= strtoupper($alpha2);
				
		$arguments=array();
		$arguments['alpha2']	= $alpha2;
		
		$RecordObj_jer			= new RecordObj_jer(NULL);	
		$ar_id					= $RecordObj_jer->search($arguments);
		
		if(empty($ar_id[0]))	return(NULL);
		
		
		$RecordObj_jer			= new RecordObj_jer($ar_id[0]);
		$mainLang				= $RecordObj_jer->get_mainLang();
		
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

		$sql 		= "SELECT id, nombre FROM jerarquia_tipos ORDER BY nombre ASC " ;
		$result 	= DBi::_getConnection()->query($sql);

		if(($result->num_rows)>0) while ($rows = $result->fetch_array(MYSQLI_ASSOC) ) {	
			$ar_final[$rows['id']] = $rows['nombre'];
		}; #$result->close();

		return $ar_final;
	}


	/**
	* GET_TESAURO_BY_JER_TIPO
	*/
	public static function get_ar_tesauro_by_jer_tipo($tipo, $activa=true) {

		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'alpha2';
		$arguments['tipo']				= $tipo;
		if($activa)
			$arguments['activa']		= 'si';

		$RecordObj_jer					= new RecordObj_jer(NULL);
		$ar_records						= $RecordObj_jer->search($arguments);

		
		return $ar_records;
	}
	
}
?>