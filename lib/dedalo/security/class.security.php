<?php
/*
* CLASS SECURITY
	
	Permissions:
	
	0 sin acceso
	1 solo lectura
	2 lectura/escritura
	3 debug
*/
#require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_matrix.php');


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
			if(SHOW_DEBUG) {
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
			if(SHOW_DEBUG) {
				throw new Exception( __METHOD__ . $msg);
			}
			die($msg);
		}else{
			$this->permissions_root = DEDALO_PERMISSIONS_ROOT;
		}


		# FILENAME_USER_AR_PERMISSIONS_TABLE
		# $this->filename_user_ar_permissions_table = DEDALO_LIB_BASE_PATH . '/backup/users/user_ar_permissions_table_' . $this->user_id . '.data';		
	}

	
	
	
	/**
	* GET_SECURITY_PERMISSIONS
	* @param string $tipo
	*	tipo of section / area
	* @param string $sub_tipo
	* 	tipo of element
	*/
	public static function get_security_permissions( $tipo, $sub_tipo ) {
		
		if(SHOW_DEBUG) {
			#unset($_SESSION['dedalo4']['auth']['permissions_table']);					
		
			# Tipo verification
			if(!(bool)verify_dedalo_prefix_tipos($tipo)){
				$msg = "Error Processing Request. Invalid tipo: $tipo ".gettype($tipo);
				if(SHOW_DEBUG) {
					dump($tipo,"GET_SECURITY_PERMISSIONS RECEIVED TIPO with invalid tipo ($tipo)");
					throw new Exception($msg, 1);	
				}
				die($msg);
			}
		}

		# DEBUG
		if(SHOW_DEBUG) {
			return 3;
		}

		# IS_GLOBAL_ADMIN
		/*
		$is_global_admin = (bool)component_security_administrator::is_global_admin($_SESSION['dedalo4']['auth']['user_id']);
		if ( $is_global_admin===true ) {
			return 3;
		}
		*/
	
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
			if(SHOW_DEBUG) {
				trigger_error($msg);
			}
			die("Error: Sorry, you don't have permissions to enter here [$tipo]");
			

				# Redirect to home
				#header("HTTP/1.1 301 Moved Permanently");
				#header("Location: ".DEDALO_LIB_BASE_URL."/main/?t=".MAIN_FALLBACK_SECTION);
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

		}#end if( array_key_exists($tipo, (array)security::$ar_permissions_table) )

	}#end get_security_permissions



	
	
	/**
	* PERMISSIONS TABLE
	* Calculated once and stored in cache
	* Optionalment stored in $_SESSION['dedalo4']['auth']['permissions_table']
	*
	* @return array $ar_permissions_table
	*	Array of permissions of ALL structure table elements from root 'dd1'
	*//*
	private function get_permissions_table__OLD() {
		
		static $ar_permissions_table;
		
		switch (true) {
			# STATIC CACHE (RAM)
			case (isset($ar_permissions_table)):
				#debug_log(__METHOD__." Loaded ar_permissions_table static");
				if(SHOW_DEBUG) {
					#dump($ar_permissions_table , '$ar_permissions_table  ++ '.to_string( count($ar_permissions_table) ));	die();
				}
				return $ar_permissions_table ;
				break;			
			# SESSION CACHE (HD)
			case (isset($_SESSION['dedalo4']['auth']['permissions_table'])):
				#debug_log(__METHOD__." Loaded ar_permissions_table session");
				$ar_permissions_table = $_SESSION['dedalo4']['auth']['permissions_table'];
				return $ar_permissions_table;
				break;
			# FILE DATA	
			#case (file_exists($this->filename_user_ar_permissions_table)):
			#	#trigger_error("Loaded permissions_table from file");
			#	return unserialize( file_get_contents($this->filename_user_ar_permissions_table) );
			#	break;
			# DEFAULT	
			default:
				# Continue calculating
				break;
		}
		

		# DEBUG
		if(SHOW_DEBUG) $start_time = start_time();

		$root					= DEDALO_ROOT_TIPO ;
		$ar_excluded			= array(
									DEDALO_TOOLS_TIPO, 		# Herramientas
									DEDALO_DIFFUSION_TIPO,	# Difusión
									);
		
		#
		# AR_TESAURO 
		# Get plain array list (recursive) of all dedalo terms (from root usually 'dd1')		
		$ar_tesauro				= (array)RecordObj_dd::get_ar_recursive_childrens_with_exclude($root, false, $ar_excluded);
			if(SHOW_DEBUG) {
				$n_elements = count($ar_tesauro);
				$time_ms 	= exec_time_unit($start_time);
				debug_log(__METHOD__." Calculated recursive_childrens: $n_elements elements in $time_ms ms. Ratio: " .$n_elements/$time_ms );
			}			
			#dump($ar_tesauro,"ar_tesauro");	#die();
			#echo exec_time($start_time, __METHOD__);

		#
		# AR_PERMISSIONS_IN_MATRIX_FOR_CURRENT_USER : PERMISOS DEL USUARIO ACTUAL
		# Si el usuario es 'global_admin' le asignamos permisos 2 a todos los elementos de structure (si además está 
		# activo el mode 'SHOW_DEBUG' -por ejemplo para el superuser- se asigna 3).
		# Si el usuario no es 'global_admin', los extraemos del registro de matrix donde se almacenan

			# Global admin
			$is_global_admin = (bool)component_security_administrator::is_global_admin($this->user_id);
				#dump($is_global_admin,'$is_global_admin');			

			# GET USER PERMISSIONS DATA FROM DB MATRIX
			$permissions_in_matrix_for_current_user=array();
			if(	$is_global_admin!==true ) {			
				# Calculate matrix record data permissions
				$permissions_in_matrix_for_current_user	= (object)$this->get_ar_permissions_in_matrix_for_current_user();
					#dump($permissions_in_matrix_for_current_user, 'permissions_in_matrix_for_current_user', array());
			}
			#dump($permissions_in_matrix_for_current_user,'permissions_in_matrix_for_current_user'); #die();
		
		# RECORREMOS LOS TIPOS (terminoID) GUARDADOS EN EL REGISTRO DE MATRIX CON SUS PERMISOS CORRESPONDIENTES
		# PARA DESPEJAR LA 'HERENCIA DE PERMISOS' A PADRES E HIJOS
		foreach ($permissions_in_matrix_for_current_user as $current_tipo => $value)
		foreach($value as $terminoID => $permission_value) {
			
			$ar_permissions_table[$terminoID] = $permission_value;			
						
			# PADRES
			$RecordObj_dd		= new RecordObj_dd($terminoID);				
			$ar_parents			= (array)$RecordObj_dd->get_ar_parents_of_this($ksort=false);
			$permissions_padres = false;
			
			foreach($ar_parents as $parent_terminoID ) {
			
				# SI NO ES UNO DE LOS DEFINIDOS EN LA BASE DE DATOS, Y LOS PERMISOS DEL ACTUAL ES > 0, LO ASIGNAMOS COMO 1 PARA PODER ACCEDER
				#if( !array_key_exists($parent_terminoID, $ar_permissions_in_matrix_for_current_user) && $permission_value > 0 ) {
				if( !isset($permissions_in_matrix_for_current_user->$current_tipo->$parent_terminoID) && $permission_value > 0 )	{
					$permissions_padres = true;				#echo " <br> terminoID:$terminoID - permission_value:$permission_value";
					break;	
				}
			}			
			if($permissions_padres === true) {
				foreach($ar_parents as $parent_terminoID ) {					
					$ar_permissions_table[$parent_terminoID] = 1;	#echo " - $parent_terminoID <br>";										
				}
			}
			
			# HIJOS
			#
			#$ar_childrens_permissions	= security::get_ar_childrens_permissions($terminoID, $ar_permissions_in_matrix_for_current_user, $permission_value);
			#	#dump($ar_childrens_permissions, 'ar_childrens_permissions of '.$terminoID, array());
			#$ar_permissions_table 		= array_merge($ar_permissions_table, $ar_childrens_permissions);
			#
		}
		
		
		# TABLA COMPLETA FINAL
		# COMBINA EL ARRAY COMPLETO DE HIJOS DE ROOT CON LOS VALORES ESTABLECIDOS A PARTIR DE LOS DATOS DEL REGISTRO DE MATRIX
		# reset($ar_tesauro);
		foreach($ar_tesauro as $current_terminoID) {		
			if( !array_key_exists($current_terminoID, $ar_permissions_table) ) {
				$ar_permissions_table[$current_terminoID] = 0;
				if(SHOW_DEBUG) {
					#debug_log(__METHOD__." Assigned permissions 0 to $current_terminoID");
				}
			}
		}		
		
		# ROOT PERMISSIONS
		# EL ROOT SIEMPRE TENDRÁ UN PERMISO FIJO DE 1
		$ar_permissions_table[$root] = 1;	
		

		# STORE CACHE DATA
		#security::$ar_permissions_table = $ar_permissions_table;

		# SESSION CACHED TABLE
		$_SESSION['dedalo4']['auth']['permissions_table'] = $ar_permissions_table;
		

		# DEBUG
		if(SHOW_DEBUG) {			
			#if(is_array($ar_permissions_table)) foreach($ar_permissions_table as $terminoID => $permissions) {				
			#	$termino = RecordObj_dd::get_termino_by_tipo($terminoID,null,true);
			#	$ar_permissions_table_debug[$terminoID] = "$permissions ($termino)";
			#}
			#$time = microtime(); $time = explode(" ", $time); $time = $time[1] + $time[0]; $finish = $time; $totaltime = ($finish - $start_time);			
			#array_unshift($ar_permissions_table_debug, $ar_permissions_table_debug['time_exec'] = "$totaltime secs");
			#$_SESSION['debug_content']['ar_permissions_table']	= $ar_permissions_table_debug;
			#dump($ar_permissions_table, 'ar_permissions_table', array());die();			
		}		

		#
		# FILE STORE PERMISSIONS TABLE (DEACTIVATED)
		# file_put_contents($this->filename_user_ar_permissions_table, serialize($ar_permissions_table) );

		return (array)$ar_permissions_table;

	}#end get_permissions_table
	*/
	

	
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
		if(SHOW_DEBUG) $start_time = start_time();

		static $permissions_table;
		
		switch (true) {
			# STATIC CACHE (RAM)
			case (isset($permissions_table)):
				#debug_log(__METHOD__." Loaded permissions_table static");
				if(SHOW_DEBUG) {
					#dump($permissions_table , '$permissions_table  ++ '.to_string( count($permissions_table) ));	die();
				}
				return $permissions_table ;
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

	}#end get_permissions_table

	

	/**
	* GET_AR_PERMISSIONS_IN_MATRIX_FOR_CURRENT_USER
	* Search in matrix record with this id (user_id) as parent,
	* filter by tipo - modelo name (component_security_access) and get dato if exists in db
	* @return array $ar_permissions_in_matrix_for_current_user
	*	Array of all element=>level like array([dd12] => 2,[dd93] => 2,..)
	*	Include areas and components permissions
	*/ 
	private static function get_ar_permissions_in_matrix_for_current_user() {

		$dato=array();

		$user_id = $_SESSION['dedalo4']['auth']['user_id'];

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
			if (isset($obj_mix->$tipo)) foreach ($obj_elements as $key => $value) {
				$obj_mix->$tipo->$key = $value;				
			}			
		}		
		#dump($obj_mix, ' obj_mix ++ '.to_string());
		
		return (object)$obj_mix;

	}//end get_ar_permissions_in_matrix_for_current_user


	
	
	/**
	* GET_AR_CHILDRENS_PERMISSIONS
	* Auxiliar method
	*//*
	private function get_ar_childrens_permissions__DEPRECATED($parent,$ar_permissions_in_matrix_for_current_user,$permission_value) {
		
		$ar_permissions_table	= array();
		
		$RecordObj_dd			= new RecordObj_dd($parent);
		$ar_childrens			= $RecordObj_dd->get_ar_childrens_of_this();
		
		if(is_array($ar_childrens)) foreach($ar_childrens as $children_terminoID ) {
			
			if( !array_key_exists($children_terminoID, $ar_permissions_in_matrix_for_current_user) ) {
				
				$ar_permissions_table[$children_terminoID]	= $permission_value;
					#echo " - $parent:$children_terminoID \n";	
				
				$ar_permissions_table2	= security::get_ar_childrens_permissions($children_terminoID,$ar_permissions_in_matrix_for_current_user,$permission_value);
				
				$ar_permissions_table	= array_merge($ar_permissions_table, $ar_permissions_table2);				
			}			
		}			
		
		return $ar_permissions_table;	
	}
	*/

	
	/**
	* GET LOGGED USSER ID
	*//*
	private static function get_logged_user_id__DEPRECATED() {

		# USER ID
		if(empty($_SESSION['dedalo4']['auth']['user_id'])) {
			if(SHOW_DEBUG===true) {
				dump($this);
				throw new Exception("Session user_id is not defined!", 1);
			}			
			die("Sorry. userID is not defined");				
		}		
		$this->user_id = $_SESSION['dedalo4']['auth']['user_id'];
	}
	*/




	/**
	* CALCULATE ONCE permissions tipo
	*//*
	private function calculate_permissions_tipo__DEPRECATED() {
		
		#$_SESSION['dedalo4']['config']['permissions_tipo']	= 'dd128' ;		# TIPO DEL CAMPO PERMISSIONS
		#$_SESSION['dedalo4']['config']['permissions_dato']	= 'dd148' ;		# TIPO DEL CAMPO PERMISSIONS QUE CONTIENE EL DATO
		
		# PERMISSIONS TIPO
		# SEARCH MODELO IN TESAURO		
		$RecordObj_dd	= new RecordObj_dd($root_tipo);
		$ar_childrens	= $RecordObj_dd->get_ar_childrens_of_this();
		
		if(is_array($ar_childrens)) foreach($ar_childrens as $tipo) {
			
			$RecordObj_dd	= new RecordObj_dd($tipo);
			$modeloID		= $RecordObj_dd->get_modelo();
			$modelo			= RecordObj_dd::get_termino_by_tipo($modeloID);
			
			if($modelo == 'login')	return $tipo ;			
		}
	}
	*/
	
	

}
?>