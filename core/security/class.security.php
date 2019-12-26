<?php
/*
* CLASS SECURITY

	Permissions:

	0 sin acceso
	1 solo lectura
	2 lectura/escritura
	3 debug
*/
#require_once(DEDALO_CORE_PATH . '/db/class.RecordObj_matrix.php');


class security {

	# VARS
	private $permissions ;

	private $user_id ;
	private $permissions_tipo ;			# CAMPO DE PRMISOS (TIPO DEFINIDO EN CONFIG)
	private $permissions_dato ;			# CAMPO DE PRMISOS (TIPO DEFINIDO EN CONFIG) QUE CONTIENE LOS DATOS


	private static $ar_permissions_in_matrix_for_current_user ;# AR DATO
	private static $ar_permissions_table;

	private $filename_user_ar_permissions_table;



	#  CONSTRUCT
	function __construct() {

		# USER ID
		if(empty($_SESSION['dedalo4']['auth']['user_id'])) {
			$msg=" <span class='error'> Error: Session user_id is not defined! </span>";
			if(SHOW_DEBUG===true) {
				throw new Exception( __METHOD__ . $msg);
			}
			die($msg);
		}else{
			$this->user_id = $_SESSION['dedalo4']['auth']['user_id'];
		}

		# DEDALO_PERMISSIONS_ROOT CONSTANT verify
		if( !defined('DEDALO_PERMISSIONS_ROOT') ) {
			define('DEDALO_PERMISSIONS_ROOT' , 1);
			debug_log(__METHOD__." CAUTION: Please, define DEDALO_PERMISSIONS_ROOT in config !",logger::WARNING);
		}


		# PERMISSIONS ROOT
		if( !defined('DEDALO_PERMISSIONS_ROOT') ) {
			$msg=" <span class='error'> Error: permissions_root is not defined! </span>";
			if(SHOW_DEBUG===true) {
				throw new Exception( __METHOD__ . $msg);
			}
			die($msg);
		}else{
			$this->permissions_root = DEDALO_PERMISSIONS_ROOT;
		}


		# FILENAME_USER_AR_PERMISSIONS_TABLE
		# $this->filename_user_ar_permissions_table = DEDALO_CORE_PATH . '/backup/users/user_ar_permissions_table_' . $this->user_id . '.data';
	}//end __construct



	/**
	* GET_SECURITY_PERMISSIONS
	* @param string $tipo
	*	tipo of section / area
	* @param string $sub_tipo
	* 	tipo of element
	*/
	public static function get_security_permissions( $tipo, $sub_tipo ) {

		if(SHOW_DEBUG===true) {
			#unset($_SESSION['dedalo4']['auth']['permissions_table']);

			# Tipo verification
			if(!(bool)verify_dedalo_prefix_tipos($tipo)){
				$msg = "Error Processing Request. Invalid tipo: $tipo ".gettype($tipo);
				if(SHOW_DEBUG===true) {
					dump($tipo,"GET_SECURITY_PERMISSIONS RECEIVED TIPO with invalid tipo ($tipo)");
					throw new Exception($msg, 1);
				}
				die($msg);
			}
		}

		# DEBUG
		#if(SHOW_DEBUG===true) {
			#return 3;
		#}
		# IS_GLOBAL_ADMIN
		/*
		$is_global_admin = (bool)component_security_administrator::is_global_admin($_SESSION['dedalo4']['auth']['user_id']);
		if ( $is_global_admin===true ) {
			return 3;
		}
		*/
		if (isset($_SESSION['dedalo4']['auth']['is_global_admin']) && ($_SESSION['dedalo4']['auth']['is_global_admin']===true && (int)$_SESSION['dedalo4']['auth']['user_id']===-1)) {
			return 3;
		}


		# PERMISSIONS_TABLE
		$permissions_table = self::get_permissions_table();


		# PERMISSIONS FOR CURRENT ELEMENT TIPO
		if (isset($permissions_table->$tipo->$sub_tipo)) {

			return (int)$permissions_table->$tipo->$sub_tipo;

		}else{

			return 0;

			# Permission not found
			# Permissions for this tipo are not defined. Maybe is a structure new tipo.
			# Delete session permissions table and show error
			unset($_SESSION['dedalo4']['auth']['permissions_table']);

			$msg = "Permissions not defined for this tipo: $tipo<br> Try reloading this page again to reset your permissions cache";
			if(SHOW_DEBUG===true) {
				trigger_error($msg);
			}
			die("Error: Sorry, you don't have permissions to enter here [$tipo]");


				# Redirect to home
				#header("HTTP/1.1 301 Moved Permanently");
				#header("Location: ".DEDALO_CORE_URL."/main/?t=".MAIN_FALLBACK_SECTION);
				#exit();
			/*
			try {
				# Recalculate permissions
				security::$ar_permissions_table = security::get_permissions_table();

				# Try again
				#return $this->get_security_permissions($tipo);

			} catch (Exception $e) {

				$name = RecordObj_dd::get_termino_by_tipo($tipo,null,true);
			  	$msg .= "<hr> Sorry. Structure element $name [$tipo] not exists in permissions table. Table data is reset. Reload page to regenerate permissions.";
			  	if(SHOW_DEBUG===TRUE) {
			  		$msg .= "<hr>Structure element $name [$tipo] not exists in permissions table. Table data is reset. Reload page to regenerate permissions.";
			  		throw new Exception( $msg .' '. $e, 1);
			  	}
				die($msg);
			}
			*/
		}//end if( array_key_exists($tipo, (array)security::$ar_permissions_table) )

		return 0;
	}//end get_security_permissions


	/**
	* PERMISSIONS TABLE
	* Calculated once and stored in cache
	* Optionalment stored in $_SESSION['dedalo4']['auth']['permissions_table']
	*
	* @return array $permissions_table
	*	Array of permissions of ALL structure table elements from root 'dd1'
	*/
	private static function get_permissions_table() {

		# DEBUG
		#if(SHOW_DEBUG===true) $start_time = start_time();

		static $permissions_table;

		switch (true) {
			# STATIC CACHE (RAM)
			case (isset($permissions_table)):
				# Cached once by script run
				return $permissions_table;
				break;

			# DEVELOPMENT_SERVER (Non session cache is used)
			case (defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true):
				# Break and continue calculation without session cache
				break;

			# SESSION CACHE (HD)
			case (isset($_SESSION['dedalo4']['auth']['permissions_table'])):
				#debug_log(__METHOD__." Loaded permissions_table session");
				$permissions_table = $_SESSION['dedalo4']['auth']['permissions_table'];
				return $permissions_table;
				break;
			# FILE DATA
			#case (file_exists($this->filename_user_permissions_table)):
			#	#trigger_error("Loaded permissions_table from file");
			#	return unserialize( file_get_contents($this->filename_user_permissions_table) );
			#	break;
			# DEFAULT
			default:
				# Continue calculating
				break;
		}

		$permissions_table = self::get_ar_permissions_in_matrix_for_current_user();

		# SESSION CACHED TABLE
		$_SESSION['dedalo4']['auth']['permissions_table'] = $permissions_table;

		return (object)$permissions_table;
	}//end get_permissions_table



	/**
	* GET_AR_PERMISSIONS_IN_MATRIX_FOR_CURRENT_USER
	* Search in matrix record with this id (user_id) as parent,
	* filter by tipo - modelo name (component_security_access) and get dato if exists in db
	* @return array $ar_permissions_in_matrix_for_current_user
	*	Array of all element=>level like array([dd12] => 2,[dd93] => 2,..)
	*	Include areas and components permissions
	*/
	private static function get_ar_permissions_in_matrix_for_current_user($user_id=false) {

		$dato=array();

		if ($user_id===false) {
			# Default behaviour is false (use logged user to calculate permissions)
			$user_id = $_SESSION['dedalo4']['auth']['user_id'];
		}


		#
		# USER PROFILE
		$component_profile 			= component_common::get_instance('component_profile',
																  	DEDALO_USER_PROFILE_TIPO,
																  	$user_id,
																  	'edit',
																  	DEDALO_DATA_NOLAN,
																  	DEDALO_SECTION_USERS_TIPO);
		$profile_id = (int)$component_profile->get_dato();
		if (empty($profile_id)) {
			return $dato;
		}

		$obj_mix = new stdClass;

		# COMPONENT_SECURITY_AREAS
		$component_security_areas 	= component_common::get_instance('component_security_areas',
																	DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO,
																	$profile_id,
																	'edit',
																	DEDALO_DATA_NOLAN,
																	DEDALO_SECTION_PROFILES_TIPO);
		$dato_area = (object)$component_security_areas->get_dato();

		# Format dato to compatibilize with access format
		foreach ($dato_area as $tipo => $permissions) {
			$value = new stdClass();
				$value->$tipo = $permissions;
			$obj_mix->$tipo = $value;
		}


		# COMPONENT_SECURITY_ACCESS
		$component_security_access 	= component_common::get_instance('component_security_access',
																	DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO,
																	$profile_id,
																	'edit',
																	DEDALO_DATA_NOLAN,
																	DEDALO_SECTION_PROFILES_TIPO
																	);
		$dato_access = (object)$component_security_access->get_dato();


		# FINAL OBJECT OF PERMISSIONS (MIXED DATA AREAS / ACCESS)
		foreach ($dato_access as $tipo => $obj_elements) {
			if (isset($obj_mix->$tipo)) foreach ((array)$obj_elements as $key => $value) {
				$obj_mix->$tipo->$key = $value;
			}
		}
		#dump($obj_mix, ' obj_mix ++ '.to_string());

		return (object)$obj_mix;
	}//end get_ar_permissions_in_matrix_for_current_user



	/**
	* GET_PERMISSIONS_TABLE_OF_SPECIFIC_USER
	* Custom user calcul
	*
	* @return array $permissions_table
	*	Array of permissions of ALL structure table elements from root 'dd1'
	*/
	public static function get_permissions_table_of_specific_user( $user_id ) {

		$permissions_table = self::get_ar_permissions_in_matrix_for_current_user( $user_id );
			#dump($permissions_table, ' permissions_table ++ '.to_string($user_id));

		return (object)$permissions_table;
	}//end get_permissions_table_of_specific_user



	/**
	* RESET_PERMISSIONS_TABLE
	* Force to recalculate global permissions
	* @return bool
	*/
	public static function reset_permissions_table() {
		unset($permissions_table);
		unset($_SESSION['dedalo4']['auth']['permissions_table']);
		security::get_permissions_table();

		return true;
	}//end reset_permissions_table



}//end class
?>
