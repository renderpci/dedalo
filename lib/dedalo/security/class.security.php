<?php
/*
* CLASS SECURITY
	
	Permissions:
	
	0 sin acceso
	1 solo lectura
	2 lectura/escritura
	3 debug
*/
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_matrix.php');


class security {	 
	
	# VARS	
	private $permissions ;
	
	private $userID_matrix ;	
	private $permissions_tipo ;							# CAMPO DE PRMISOS (TIPO DEFINIDO EN CONFIG)
	private $permissions_dato ;							# CAMPO DE PRMISOS (TIPO DEFINIDO EN CONFIG) QUE CONTIENE LOS DATOS
	
	
	private static $ar_permissions_in_matrix_for_current_user ;# AR DATO	
	private static $ar_permissions_table;	
	
	
	#  CONSTRUCT
	function __construct() {
		
		
		# USER ID
		if(empty($_SESSION['auth4']['userID_matrix']))
			throw new Exception( __METHOD__ . " <span class='error'> Error: Session userID_matrix is not defined! </span>");	
		$this->userID_matrix = $_SESSION['auth4']['userID_matrix'];
		#if(!isset($_SESSION['auth4']['userID']))								throw new Exception( __METHOD__ . " <span class='error'> Error: Session auth userID is not defined! </span>");		
		#$this->userID_matrix = $_SESSION['auth4']['userID'];
		
		# PERMISSIONS ROOT
		if(empty($_SESSION['auth4']['permissions_root']))
			throw new Exception( __METHOD__ . " <span class='error'> Error: permissions_root is not defined! </span>");		
		$this->permissions_root = $_SESSION['auth4']['permissions_root'];
		
	}
	
	
	
	# GET PERMISSIONS FROM TIPO
	public function get_security_permissions($tipo=NULL) {
		
		# Tipo verification
		if(empty($tipo) || !strlen($tipo)) {
			$msg = "Error Processing Request. Invalid tipo: $tipo ".gettype($tipo);
			if(SHOW_DEBUG) 
				dump($tipo,"GET_SECURITY_PERMISSIONS RECEIVED TIPO ($tipo)");			
			throw new Exception($msg, 1);			
		}			
		
		# PERMISSIONS_TABLE
		# Run calculate general permissions table
		if(!isset(static::$ar_permissions_table)) {			
			static::$ar_permissions_table = self::get_permissions_table();
				#dump(static::$ar_permissions_table,'static::$ar_permissions_table'); die();		
		}			
		
		# DEBUG
		if(SHOW_DEBUG===TRUE) {
			$_SESSION['debug_content'][__METHOD__] = static::$ar_permissions_table;
		}
		
		
		# PERMISSIONS FOR CURRENT ELEMENT TIPO
		if( is_array(static::$ar_permissions_table) && array_key_exists($tipo, static::$ar_permissions_table) ) {
			
			# Permision located
			return intval(static::$ar_permissions_table[$tipo]);
			
		}else{
			
			# Permission not found
			# Permissions for this tipo are not defined. Maybe is a structure new tipo.
			# Delete session permissions table and show error
			unset($_SESSION['auth4']['permissions_table']);			
			
		  	$msg = "Permissions not defined for this tipo: $tipo<br> Try reloading this page again to reset your permissions cache";
		  	if(SHOW_DEBUG===TRUE) {
		  		$name = RecordObj_ts::get_termino_by_tipo($tipo);
		  		$msg .= "<hr>Structure element $name [$tipo] not exists in permissions table. Table data is reset. Reload page to regenerate.";
		  	}
			throw new Exception( $msg, 1);					
		}
	}



	
	
	/**
	* PERMISSIONS TABLE
	* Calculated once and stored in cache
	* Optionalment stored in $_SESSION['auth4']['permissions_table']
	*
	* @return $ar_permissions_table
	*	Array of permissions of ALL structure table elements from root 'dd1'
	*/
	private function get_permissions_table() {		
		
		# STATIC CACHE (RAM)
		if(isset(static::$ar_permissions_table)) {
			#error_log("Loaded ar_permissions_table static");
			return static::$ar_permissions_table ;
		}

		
		# SESSION CACHE (HD)
		if(isset($_SESSION['auth4']['permissions_table'])) {
			#error_log("Loaded ar_permissions_table session");
			static::$ar_permissions_table = $_SESSION['auth4']['permissions_table'];			
			return static::$ar_permissions_table;			
		}
		

		# DEBUG
		if(SHOW_DEBUG===true) {
			# LOAD TIME INIT
			$time = microtime(); $time = explode(" ", $time); $time = $time[1] + $time[0]; $start = $time;				
		}
		if(SHOW_DEBUG) $start_time = start_time();


		$root					= DEDALO_ROOT_TIPO ;	#navigator::get_selected('root');		print_r($root);die();
		$ar_modelos_to_exclude	= array();		
		$ar_permissions_table	= array();	
		
		#print_r(debug_backtrace()); die($root);
		# GET PLAIN ARRAY LIST OF ALL DEDALO TERMS (FROM ROOT USUALLY 'dd1') 
		$RecordObj_ts			= new RecordObj_ts($root);	
		$ar_tesauro				= $RecordObj_ts->get_ar_recursive_childrens_of_this($root);						#echo count($ar_tesauro);#print_r($ar_tesauro); die();
		
		
		#
		# PERMISOS DEL USUARIO ACTUAL
		# Si el usuario es 'global_admin' le asignamos permisos 2 a todos los elementos de structure (si además está 
		# activo el mode 'SHOW_DEBUG' -por ejemplo para el superuser- se asigna 3).
		# Si el usuario no es 'global_admin', los extraemos del registro de matrix donde se almacenan
		#
			# Global admin
			$userID_matrix 			= $this->userID_matrix;
			$is_global_admin 		= component_security_administrator::is_global_admin($userID_matrix);
				#dump($is_global_admin,'$is_global_admin');		
			
			# GET USER PERMISSIONS DATA FROM DB MATRIX
			if(	$is_global_admin===TRUE ) {
				# If current user is global admin, set all elements as accesible
				$n=2;
				#if(SHOW_DEBUG===TRUE) $n=3;
				foreach($ar_tesauro as $current_tipo) {
					$ar_permissions_in_matrix_for_current_user[$current_tipo] = $n;
				}			
			}else{
				# matrix record data permissions
				$ar_permissions_in_matrix_for_current_user	= self::get_ar_permissions_in_matrix_for_current_user();					
			}
			#dump($ar_permissions_in_matrix_for_current_user,'ar_permissions_in_matrix_for_current_user');

		#
		# PERMISOS FIJOS PARA LOS COMPONENTES TOOLS	
		# INCORPORA EL PERMISO DE LOS TOOLS (MAX_SEARCH, RESET, ETC..) COMO SI EXISTIERAN EN EL REGISTRO DE LA BASE DE DATOS 
		# Sacamos los hijos del root y uno de ellos de modelo 'tools' se asigna como permisos 2. Sus hijos heredarán este permiso en el cálculo posterior		
		$ar_childrens		= $RecordObj_ts->get_ar_childrens_of_this();			#print_r($ar_childrens);#die();		
		if(is_array($ar_childrens)) foreach($ar_childrens as $modeloID_children) {
			
			$RecordObj_ts	= new RecordObj_ts($modeloID_children);
			$modeloID		= $RecordObj_ts->get_modelo();
			$modelo			= RecordObj_ts::get_termino_by_tipo($modeloID);	
			
			if($modelo == 'tools') {				
				$ar_permissions_in_matrix_for_current_user[$modeloID_children] = 2 ;					
			}
		}		
		#dump($ar_permissions_in_matrix_for_current_user);
		
		# RECORREMOS LOS TIPOS (terminoID) GUARDADOS EN EL REGISTRO DE MATRIX CON SUS PERMISOS CORRESPONDIENTES
		# PARA DESPEJAR LA 'HERENCIA DE PERMISOS' A PADRES E HIJOS
		$ar_permissions_table = array();
		if(is_array($ar_permissions_in_matrix_for_current_user) && count($ar_permissions_in_matrix_for_current_user)>0) foreach($ar_permissions_in_matrix_for_current_user as $terminoID => $permission_value) {
			
			$ar_permissions_table[$terminoID] = $permission_value;			
						
			# PADRES
			$RecordObj_ts		= new RecordObj_ts($terminoID);				
			$ar_parents			= $RecordObj_ts->get_ar_parents_of_this(false);			#echo "$terminoID: "; print_r($ar_parents); echo "<hr>"; #die();
			$permissions_padres = false;
			
			if(is_array($ar_parents)) foreach($ar_parents as $parent_terminoID ) {
			
				# SI NO ES UNO DE LOS DEFINIDOS EN LA BASE DE DATOS, Y LOS PERMISOS DEL ACTUAL ES > 0, LO ASIGNAMOS COMO 1 PARA PODER ACCEDER
				if( !array_key_exists($parent_terminoID, $ar_permissions_in_matrix_for_current_user) && $permission_value > 0 ) {					
					$permissions_padres = true;				#echo " <br> terminoID:$terminoID - permission_value:$permission_value";
					break;	
				}
			}			
			if($permissions_padres === true){
				if( is_array($ar_parents)) foreach($ar_parents as $parent_terminoID ) {
					$ar_permissions_table[$parent_terminoID] = 1;	#echo " - $parent_terminoID: ";
				}
			}			
			
			# HIJOS
			$ar_childrens_permissions	= self::get_ar_childrens_permissions($terminoID, $ar_permissions_in_matrix_for_current_user, $permission_value);				
			$ar_permissions_table 		= array_merge($ar_permissions_table, $ar_childrens_permissions);	
			
			#print_r($ar_permissions_table); #die();						
		}
		
		
		# TABLA COMPLETA FINAL
		# COMBINA EL ARRAY COMPLETO DE HIJOS DE ROOT CON LOS VALORES ESTABLECIDOS A PARTIR DE LOS DATOS DEL REGISTRO DE MATRIX
		if(is_array($ar_tesauro)) foreach($ar_tesauro as $terminoID) {			
			
			if( !array_key_exists($terminoID, $ar_permissions_table) ) {
				
				#echo " $terminoID <br>\n";				
				$ar_permissions_table[$terminoID]	= 0 ;	
			}
		}		
		
		# ROOT PERMISSIONS
		# EL ROOT SIEMPRE TENDRÁ UN PERMISO FIJO DE 1
		$ar_permissions_table[$root] = 1;	
		

		# STORE CACHE DATA
		static::$ar_permissions_table = $ar_permissions_table;


		# SESSION CACHED TABLE
		$_SESSION['auth4']['permissions_table'] = $ar_permissions_table;	#echo "<pre>";print_r($ar_permissions_table);echo "</pre>";
		

		# DEBUG
		if(SHOW_DEBUG===true) {
			if(is_array($ar_permissions_table)) foreach($ar_permissions_table as $terminoID => $permissions) {
				$termino = RecordObj_ts::get_termino_by_tipo($terminoID);
				$ar_permissions_table_debug[$terminoID] = "$permissions ($termino)";
			}
			$time = microtime(); $time = explode(" ", $time); $time = $time[1] + $time[0]; $finish = $time; $totaltime = ($finish - $start);			
			array_unshift($ar_permissions_table_debug, $ar_permissions_table_debug['time_exec'] = "$totaltime secs");
			$_SESSION['debug_content']['ar_permissions_table']	= $ar_permissions_table_debug;
		}

		if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $ar_permissions_table);

		return $ar_permissions_table;
	}
	
	
	
	private function get_ar_childrens_permissions($parent,$ar_permissions_in_matrix_for_current_user,$permission_value) {
		
		$ar_permissions_table	= array();
		
		$RecordObj_ts			= new RecordObj_ts($parent);
		$ar_childrens			= $RecordObj_ts->get_ar_childrens_of_this();
		
		if(is_array($ar_childrens)) foreach($ar_childrens as $children_terminoID ) {
			
			if( !array_key_exists($children_terminoID, $ar_permissions_in_matrix_for_current_user) ) {
				
				$ar_permissions_table[$children_terminoID]	= $permission_value;				#echo " - $parent:$children_terminoID \n";	
				
				$ar_permissions_table2	= self::get_ar_childrens_permissions($children_terminoID,$ar_permissions_in_matrix_for_current_user,$permission_value);
				
				$ar_permissions_table	= array_merge($ar_permissions_table, $ar_permissions_table2);		
				
			}			
		}		
		
		return $ar_permissions_table;	
	}


	
	
	/**
	*
	* GET_PERMISSIONS_IN_MATRIX
	* Search in matrix records with this id (userID_matrix) as parent,
	* filter by tipo - modelo name (component_security_access) and get dato if exists in db
	*
	* @return $ar_permissions_in_matrix_for_current_user
	*	Array of all element=>level like array([dd12] => 2,[dd93] => 2,..)
	*	Include areas and components permissions
	*/ 
	private function get_ar_permissions_in_matrix_for_current_user() {

		#error_log("get_ar_permissions_in_matrix_for_current_user: $this->userID_matrix");
		if(SHOW_DEBUG) $start_time = start_time();

		$userID_matrix 			= $this->userID_matrix;
			#dump($userID_matrix,'$userID_matrix');

		# Section
		$current_tipo 			= common::get_tipo_by_id($userID_matrix, $table='matrix');

		# STRUCTURE
		# Buscamos recusivamente el elemento
		# OBTENEMOS LOS ELEMENTOS HIJOS DE ESTA SECCIÓN
		$RecordObj_ts			= new RecordObj_ts($current_tipo);	
		$ar_recursive_childrens = $RecordObj_ts->get_ar_recursive_childrens_of_this($current_tipo);

		foreach ($ar_recursive_childrens as $terminoID) {
			$RecordObj_ts		= new RecordObj_ts($terminoID);				 
			$modeloID			= $RecordObj_ts->get_modelo();	
			$modelo_name		= $RecordObj_ts->get_modelo_name();		#dump($modelo_name,'modelo_name');

			if ($modelo_name=='component_security_access') {
				# Component matched
				$component_security_access_tipo = $terminoID;			
				break;
			}
		}
		if (empty($component_security_access_tipo)) {
			$msg = "Warning security. This user ($userID_matrix) don't have security_access permissions (component_security_access)";
			if(SHOW_DEBUG===true) {
				dump($this);
				$ms .= "<hr> component_security_access not found in structure";
			}
			throw new Exception($msg, 1);
			die();
		}

		# Create object
		$component_security_access = new component_security_access(NULL,$component_security_access_tipo,'edit',$userID_matrix,DEDALO_DATA_NOLAN);	
			#$dato = $component_security_access->get_dato();
			#dump($dato,"dato from $modelo_name_required ");
			#dump($component_security_access,"component_security_access dato:".$component_security_access->get_dato() );

		# Dato in matrix
		$ar_permissions_in_matrix_for_current_user = $component_security_access->get_dato();
			#dump($ar_permissions_in_matrix_for_current_user,'ar_permissions_in_matrix_for_current_user');

		if(empty($ar_permissions_in_matrix_for_current_user)) {
			$msg = "Warning security. This user ($userID_matrix) don't have permissions data";
			if(SHOW_DEBUG===true) {
				dump($this);
				$msg .= "<hr> Not found any record with permissions data in matrix for user $userID_matrix";
			}
			throw new Exception($msg, 1);
			die();
		}		

		# Store class static var 
		static::$ar_permissions_in_matrix_for_current_user = $ar_permissions_in_matrix_for_current_user;

			#dump($ar_permissions_in_matrix_for_current_user,'$ar_permissions_in_matrix_for_current_user');
		if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $ar_permissions_in_matrix_for_current_user);
		
		return $ar_permissions_in_matrix_for_current_user;
	}
	
	
	
	
	/**
	* GET LOGGED USSER ID
	*/
	private static function get_logged_userID_matrix() {

		# USER ID
		if(empty($_SESSION['auth4']['userID_matrix'])) {
			if(SHOW_DEBUG===true) {
				dump($this);
			}
			throw new Exception("Session userID_matrix is not defined!", 1);
			die();				
		}		
		$this->userID_matrix = $_SESSION['auth4']['userID_matrix'];
	}
	





	/*
	# CALCULATE ONCE permissions tipo
	private function calculate_permissions_tipo() {
		
		#$_SESSION['config4']['permissions_tipo']	= 'dd128' ;		# TIPO DEL CAMPO PERMISSIONS
		#$_SESSION['config4']['permissions_dato']	= 'dd148' ;		# TIPO DEL CAMPO PERMISSIONS QUE CONTIENE EL DATO
		
		# PERMISSIONS TIPO
		# SEARCH MODELO IN TESAURO		
		$RecordObj_ts	= new RecordObj_ts($root_tipo);
		$ar_childrens	= $RecordObj_ts->get_ar_childrens_of_this();
		
		if(is_array($ar_childrens)) foreach($ar_childrens as $tipo) {
			
			$RecordObj_ts	= new RecordObj_ts($tipo);
			$modeloID		= $RecordObj_ts->get_modelo();
			$modelo			= RecordObj_ts::get_termino_by_tipo($modeloID);
			
			if($modelo == 'login')	return $tipo ;			
		}
	}
	*/
	
	

}
?>