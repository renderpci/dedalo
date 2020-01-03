<?php
/*
* CLASS SECURITY

	Permissions:

	0 sin acceso
	1 solo lectura
	2 lectura/escritura
	3 debug
*/
class security {

	# VARS
	private $permissions ;

	private $user_id ;
	private $permissions_tipo ;			# CAMPO DE PRMISOS (TIPO DEFINIDO EN CONFIG)
	private $permissions_dato ;			# CAMPO DE PRMISOS (TIPO DEFINIDO EN CONFIG) QUE CONTIENE LOS DATOS


	private static $ar_permissions_in_matrix_for_current_user ;# AR DATO
	private static $ar_permissions_table;

	private $filename_user_ar_permissions_table;



	/**
	* __CONSTRUCT
	*/
	function __construct() {

		// user id check
			if(empty($_SESSION['dedalo4']['auth']['user_id'])) {
				$msg=" <span class='error'> Error: Session user_id is not defined! </span>";
				if(SHOW_DEBUG===true) {
					throw new Exception( __METHOD__ . $msg);
				}
				die($msg);
			}else{
				$this->user_id = $_SESSION['dedalo4']['auth']['user_id'];
			}

		// permissions root check
			if( !defined('DEDALO_PERMISSIONS_ROOT') ) {
				$msg = "<span class='error'> Error: permissions_root is not defined! </span>";
				if(SHOW_DEBUG===true) {
					throw new Exception( __METHOD__ . $msg);
				}
				die($msg);
			}else{
				$this->permissions_root = DEDALO_PERMISSIONS_ROOT;
			}

		return true;
	}//end __construct



	/**
	* GET_SECURITY_PERMISSIONS
	* @param string $tipo
	*	tipo of section / area
	* @param string $sub_tipo
	* 	tipo of element
	*/
	public static function get_security_permissions( $parent_tipo, $tipo ) {

		if ((int)$_SESSION['dedalo4']['auth']['user_id']===DEDALO_SUPERUSER) {
			return 3;
		}

		# PERMISSIONS_TABLE
		$permissions_table = self::get_permissions_table();

		$permissions = array_reduce($permissions_table, function($carry, $item) use ($parent_tipo, $tipo){
			return ($item->parent===$parent_tipo && $item->tipo===$tipo) ? $item->value : $carry;
		}, 0);


		return $permissions;
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

		return (array)$permissions_table;
	}//end get_permissions_table



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

		$component_security_access = self::get_user_security_access();

		$dato_access = is_object($component_security_access) ? (array)$component_security_access->get_dato() : null;

		return $dato_access;
	}//end get_ar_permissions_in_matrix_for_current_user



	/**
	* GET_USER_SECURITY_ACCESS
	* @return component
	*/
	private static function get_user_security_access() {

		// Default behaviour is false (use logged user to calculate permissions)
			$user_id = $_SESSION['dedalo4']['auth']['user_id'];

		// user profile
			$component_profile_model 	= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_USER_PROFILE_TIPO,true);
			$component_profile 		 	= component_common::get_instance($component_profile_model,
																	  	 DEDALO_USER_PROFILE_TIPO,
																	  	 (int)$user_id,
																	  	 'list',
																	  	 DEDALO_DATA_NOLAN,
																	  	 DEDALO_SECTION_USERS_TIPO);
			$profile_dato = $component_profile->get_dato();
			if (empty($profile_dato)) {
				return false;
			}

			$profile_id = (int)$profile_dato[0]->section_id;


		// component_security_access
			$component_security_access = component_common::get_instance('component_security_access',
																		DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO,
																		$profile_id,
																		'edit',
																		DEDALO_DATA_NOLAN,
																		DEDALO_SECTION_PROFILES_TIPO);

		return $component_security_access;
	}//end get_user_security_access



	/**
	* GET_PERMISSIONS_TABLE_OF_SPECIFIC_USER
	* Custom user calcul
	*
	* @return array $permissions_table
	*	Array of permissions of ALL structure table elements from root 'dd1'
	*/
	public static function get_permissions_table_of_specific_user( $user_id ) {

		$permissions_table = self::get_ar_permissions_in_matrix_for_current_user( $user_id );

		return (array)$permissions_table;
	}//end get_permissions_table_of_specific_user



	/**
	* RESET_PERMISSIONS_TABLE
	* Force to recalculate global permissions
	* @return bool true
	*/
	public static function reset_permissions_table() {

		// unset static var
		unset($permissions_table);
		// unset session var
		unset($_SESSION['dedalo4']['auth']['permissions_table']);
		// force re-calculate values
		security::get_permissions_table();

		return true;
	}//end reset_permissions_table



	/**
	* GET_AR_AUTHORIZED_AREAS_FOR_USER
	* get the authorizes areas of the user
	* @return array $permissions | null
	*/
	public static function get_ar_authorized_areas_for_user() {

		// cached permissions_table
		$permissions_table = self::get_permissions_table();

		$area_permissions = array_filter($permissions_table, function($item) {
			return (isset($item->type) && $item->type==='area') ? $item : null;
		});

		return $area_permissions;
	}//end get_ar_authorized_areas_for_user



	/**
	* IS_GLOBAL_ADMIN
	* Test if received user is global admin
	* @param $user_id
	*	User id · int · can be the login user or not.
	* @return bool
	*/
	public static function is_global_admin($user_id) {

		$user_id = (int)$user_id;

		// dedalo superuser case
			if ($user_id===DEDALO_SUPERUSER) {
				return true;
			}

		// empty user_id
			if ($user_id<1) {
				return false;
			}

		// cached value. If request user_id is the same as current logged user, return session value, without acces to component
			if ( isset($_SESSION['dedalo4']['auth']['user_id']) && $user_id==$_SESSION['dedalo4']['auth']['user_id'] ) {
				return isset($_SESSION['dedalo4']['auth']['is_global_admin']) ? $_SESSION['dedalo4']['auth']['is_global_admin'] : false;
			}

		// Resolve from component
			$security_administrator_model = RecordObj_dd::get_modelo_name_by_tipo(DEDALO_SECURITY_ADMINISTRATOR_TIPO,true);
			$component_security_administrator = component_common::get_instance($security_administrator_model,
																			   DEDALO_SECURITY_ADMINISTRATOR_TIPO,
																			   $user_id,
																			   'edit',
																			   DEDALO_DATA_NOLAN,
																			   DEDALO_SECTION_USERS_TIPO);
			$security_administrator_dato = $component_security_administrator->get_dato();

			// empty user data case
				if (empty($security_administrator_dato)) {
					return false;
				}

			// locator data
				$dato = (int)$security_administrator_dato[0]->section_id;

				if ($dato===1) {
					$is_global_admin = true;
				}else{
					$is_global_admin = false;
				}

		return $is_global_admin;
	}//end is_global_admin



	/**
	* SET_SECTION_PERMISSIONS
	* Allow current user access to created default sections
	* @return bool
	*/
	private static function set_section_permissions( $request_options ) {

		$options = new stdClass();
			$options->section_tipo 	= null;
			$options->section_id 	= null;
			$options->ar_sections 	= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		# user_id
		$user_id = navigator::get_user_id();
		if (SHOW_DEBUG===true || $user_id<1) {
			return true;
		}

		# Permissions
		$permissions = 2;

		$component_security_access 		= self::get_user_security_access();
		$component_security_access_dato = $component_security_access->get_dato();

		# Iterate sections (normally like ts1,ts2)
		foreach ((array)$options->ar_sections as $current_section_tipo) {

			$section_permisions = new stdClass();
				$section_permisions->tipo = $current_section_tipo;
				$section_permisions->parent = $current_section_tipo;
				$section_permisions->type = 'area';
				$section_permisions->value = $permissions;

			$component_security_access_dato[] = $section_permisions;

			# Components inside section
			$real_section = section::get_section_real_tipo_static( $current_section_tipo );
			$ar_children  = section::get_ar_children_tipo_by_modelo_name_in_section($real_section,
																					$ar_modelo_name_required=array('component','button','section_group'),
																					$from_cache=true,
																					$resolve_virtual=false,
																					$recursive=true,
																					$search_exact=false);

			foreach ($ar_children as $children_tipo) {

				$component_permisions = new stdClass();
					$component_permisions->tipo = $children_tipo;
					$component_permisions->parent = $current_section_tipo;
					$component_permisions->value = $permissions;

				$component_security_access_dato[] = $component_permisions;
			}

		}//end foreach ($ar_sections as $current_section_tipo)

		# Save calculated data
		$component_security_access->set_dato($component_security_access_dato);
		$component_security_access->Save();

		# Regenerate permissions table
		security::reset_permissions_table();

		return true;
	}//end set_section_permissions



}//end class
