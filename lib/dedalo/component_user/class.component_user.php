<?php
/*
* CLASS COMPONENT USER
*/
/*

	NO USADO !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

class component_user extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;


	#
	# GET VALOR
	# LIST:
	# GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	#
	public function get_valor() {
		
		$valor = self::get_dato();

		if (!empty($valor)) {

			# Convert userID to username
			$userID = intval($valor);

			if($userID<1) return NULL;

			$valor = component_user::userID_to_username($userID) ;
		}
		return $valor;
	}

	#
	# USER ID TO USERNAME
	#
	static public function userID_to_username($userID) {

		if($userID<1) return NULL;	

		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'dato';
		$arguments['parent']			= $userID;
		$arguments['tipo']				= DEDALO_USERNAME_TIPO;
		$arguments['lang']				= DEDALO_DATA_NOLAN;
		$matrix_table 					= common::get_matrix_table_from_tipo($section_tipo);
		$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
		$ar_records						= $RecordObj_matrix->search($arguments);

		if (isset($ar_records[0])) {
			return json_handler::decode($ar_records[0]);
		}

	}




}
*/
?>