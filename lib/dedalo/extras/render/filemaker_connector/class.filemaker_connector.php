<?php
// Include the FileMaker PHP API
require_once( DEDALO_ROOT .'/lib/FileMaker/FileMaker.php');



class filemaker_connector {


	function __construct() {

	}



	/**
	* _GETCONNECTION_FM
	* @param string $database . Filemaker table name like 'usuarios'
	* @return resource $fm
	*/
	public static function _getConnection_fm( $database ) {

		if (!defined('FILEMAKER_HOSTNAME_CONN')) {
			exit("Error. Filemaker host is not defined");
		}

		//create the FileMaker Object
	    $fm = new FileMaker();

	     //Specify the FileMaker database
	    $fm->setProperty('database', $database);
	    
	    //Specify the Host
	    $fm->setProperty('hostspec', FILEMAKER_HOSTNAME_CONN); //temporarily hosted on local server
	    
	    /**
	     * To gain access to the database, use the default administrator account,
	     * which has no password. To change the authentication settings, open the database in 
	     * FileMaker Pro and select "Manage > Accounts & Privileges" from the "File" menu. 
	    */	    
	    $fm->setProperty('username', FILEMAKER_USERNAME_CONN);
	    $fm->setProperty('password', FILEMAKER_PASSWORD_CONN);

	    return $fm;

	}#end fm_connection







	
	# GET DATO
	public function get_dato() {
		$dato = parent::get_dato();
		return (array)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (array)$dato );			
	}
	
	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {
		
		# ...	

		# A partir de aquí, salvamos de forma estándar
		return parent::Save();
	}

	/*
	* FIND
	*/

	public function Find(){

	}

	public function Find_All(){
		
	}




}#end filemaker_connector class
?>