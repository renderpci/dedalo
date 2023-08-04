<?php
/**
* CLASS SECURITY

	Permissions:

	0 sin acceso
	1 solo lectura
	2 lectura/escritura
	3 debug
*/
class security {



	/**
	* CLASS VARS
	*/
		private $permissions;

		private $user_id;
		private $permissions_tipo;			// permissions defined in config
		private $permissions_dato;			// permissions defined in config that contains data

		private static $ar_permissions_in_matrix_for_current_user; // array data
		private static $ar_permissions_table;

		private $filename_user_ar_permissions_table;



	/**
	* __CONSTRUCT
	*/
	function __construct() {

		// user id check
			if(empty($_SESSION['dedalo']['auth']['user_id'])) {
				$msg = " Error: Session user_id is not defined! ";
				debug_log(__METHOD__
					. " $msg  " . PHP_EOL
					. to_string()
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					throw new Exception( __METHOD__ . $msg);
				}
				die();
			}else{
				$this->user_id = $_SESSION['dedalo']['auth']['user_id'];
			}

		// permissions root check
			// if( !defined('DEDALO_PERMISSIONS_ROOT') ) {
			// 	$msg = "<span class='error'> Error: permissions_root is not defined! </span>";
			// 	trigger_error($msg);
			// 	if(SHOW_DEBUG===true) {
			// 		throw new Exception( __METHOD__ . $msg);
			// 	}
			// 	die($msg);
			// }else{
			// 	$this->permissions_root = DEDALO_PERMISSIONS_ROOT;
			// }
	}//end __construct



	/**
	* GET_SECURITY_PERMISSIONS
	* Resolve permissions value from $parent_tipo and $tipo
	* normally section_tipo, component_tipo
	* @param string $parent_tipo
	*	tipo of section / area
	* @param string $tipo
	* 	tipo of element (usually component)
	* @return int $permissions
	*/
	public static function get_security_permissions(string $parent_tipo, string $tipo) : int {

		// logged root user id
			$user_id = get_user_id();
			if ((int)$user_id===DEDALO_SUPERUSER) {
				return 3;
			}

		// tools register section 'dd1324' allow access as read
			if ($parent_tipo===DEDALO_REGISTER_TOOLS_SECTION_TIPO) {
				return 1;
			}

		// allow logged user access to search temp section (dd655)
			if ($parent_tipo===DEDALO_TEMP_PRESET_SECTION_TIPO) {
				return 2;
			}

		// allow to read the global component_inverse of the section
			if ($tipo===DEDALO_SECTION_INFO_INVERSE_RELATIONS) {
				return 1;
			}

		// permissions_table
			$permissions_table = security::get_permissions_table();

		// permissions_table find
			$found = array_find($permissions_table, function($el) use($tipo, $parent_tipo) {
				return $el->tipo===$tipo && $el->section_tipo===$parent_tipo;
			});

		// permissions
			$permissions = $found->value ?? 0;

		// access to list of values
			if ($permissions===0) {
				$matrix_table = common::get_matrix_table_from_tipo($parent_tipo);
				if ($matrix_table==='matrix_list') {
					$permissions = 1;
				}
			}


		return (int)$permissions;
	}//end get_security_permissions



	/**
	* PERMISSIONS TABLE
	* Calculated once and stored in cache
	* Optional stored in $_SESSION['dedalo']['auth']['permissions_table']
	*
	* @return array $permissions_table
	*	Array of permissions of ALL structure table elements from root 'dd1'
	*/
	private static function get_permissions_table() : array {

		// cache. Cached once by script run
			static $permissions_table_cache;
			if (isset($permissions_table_cache)) {
				return $permissions_table_cache;
			}

		// short vars
			$cache_file_name = 'cache_permissions_table.json';

		// cache cascade
			$use_cache = false;
			if ($use_cache===true) {
				switch (true) {

					// static cache (ram)
						// case (isset($permissions_table_cache)):
						// 	// Cached once by script run
						// 	return $permissions_table_cache;
						// 	break;

					// development_server (non session cache is used)
						// case (defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true):
						// 	// Break and continue calculation without session cache
						// 	break;

					// session cache (hd)
						// case (isset($_SESSION['dedalo']['auth']['permissions_table'])):
						// 	// debug_log(__METHOD__." Loaded permissions_table session");
						// 	$permissions_table = $_SESSION['dedalo']['auth']['permissions_table'];
						// 	return $permissions_table;
						// 	break;

					// cache file
					default:
						// cache file
						$cache_data	= dd_cache::cache_from_file((object)[
							'file_name' => $cache_file_name
						]);
						if (!empty($cache_data)) {

							$permissions_table = json_decode($cache_data);

							// set cache
							// $permissions_table_cache = $permissions_table;

							debug_log(__METHOD__
								." Returning permissions_table from cache disk file"
								, logger::DEBUG
							);

							return $permissions_table;
						}
						break;
				}
			}

		// permissions_table calculation once
			$permissions_table = security::get_ar_permissions_in_matrix_for_current_user(
				get_user_id()
			);

		// set cache
			$permissions_table_cache = $permissions_table;

		// session cached table
			if ($use_cache===true) {
				switch (true) {
					// session
						// $_SESSION['dedalo']['auth']['permissions_table'] = $permissions_table;
					// cache to file
					default:
						dd_cache::cache_to_file((object)[
							'file_name'	=> $cache_file_name,
							'data'		=> $permissions_table
						]);
				}
			}


		return $permissions_table;
	}//end get_permissions_table



	/**
	* GET_AR_PERMISSIONS_IN_MATRIX_FOR_CURRENT_USER
	* Search in matrix record with this id (user_id) as parent,
	* filter by tipo - model name (component_security_access) and get dato if exists in db
	* @param int $user_id
	* @return array $ar_permissions_in_matrix_for_current_user
	*	Array of all elements of current Ontology with permission values
	*	Include areas and components permissions
	*/
	private static function get_ar_permissions_in_matrix_for_current_user(int $user_id) : array {

		// get reliable component (assigned profile checked)
			$component_security_access = security::get_user_security_access($user_id);

		// dato_access. is the first value of the result array if not empty
		// $dato_access = is_object($component_security_access) ? (array)$component_security_access->get_dato() : null;
			$dato_access = !empty($component_security_access)
				? $component_security_access->get_dato()
				: [];


		return $dato_access;
	}//end get_ar_permissions_in_matrix_for_current_user



	/**
	* GET_USER_SECURITY_ACCESS
	* Locate component_security_access of current logged user based on user profile
	* @param int $user_id
	* @return object|null $component_security_access
	*/
	public static function get_user_security_access(int $user_id) : ?object {

		// user profile
			$user_profile = security::get_user_profile($user_id);
			if (empty($user_profile)) {
				return null;
			}

			// section_id
			$profile_id = (int)$user_profile->section_id;

		// component_security_access
			$component_security_access = component_common::get_instance(
				'component_security_access',
				DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO,
				$profile_id,
				'list',
				DEDALO_DATA_NOLAN,
				DEDALO_SECTION_PROFILES_TIPO
			);


		return $component_security_access;
	}//end get_user_security_access



	/**
	* GET_USER_PROFILE
	* Resolve user profile id by user_id
	* @param int $user_id
	* @return object|null $locator
	*/
	public static function get_user_profile(int $user_id) : ?object {

		// user profile
			$component_profile_model	= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_USER_PROFILE_TIPO,true);
			$component_profile			= component_common::get_instance(
				$component_profile_model,
				DEDALO_USER_PROFILE_TIPO,
				(int)$user_id,
				'list',
				DEDALO_DATA_NOLAN,
				DEDALO_SECTION_USERS_TIPO
			);
			$profile_dato = $component_profile->get_dato();
			if (empty($profile_dato)) {
				return null;
			}

			// locator
			$locator = $profile_dato[0];


		return $locator;
	}//end get_user_profile



	/**
	* GET_PERMISSIONS_TABLE_OF_SPECIFIC_USER (NOT USED)
	* Custom user calculus
	* @param int $user_id
	* @return array $permissions_table
	*	Array of permissions of ALL structure table elements from root 'dd1'
	*/
		// public static function get_permissions_table_of_specific_user(int $user_id) : array {

		// 	$permissions_table = security::get_ar_permissions_in_matrix_for_current_user( $user_id );

		// 	return (array)$permissions_table;
		// }//end get_permissions_table_of_specific_user



	/**
	* RESET_PERMISSIONS_TABLE
	* Force to recalculate global permissions
	* @return bool true
	*/
	public static function reset_permissions_table() : bool {

		// unset static var
		unset($permissions_table);
		// unset session var
		unset($_SESSION['dedalo']['auth']['permissions_table']);
		// force re-calculate values
		security::get_permissions_table();

		return true;
	}//end reset_permissions_table



	/**
	* GET_AR_AUTHORIZED_AREAS_FOR_USER
	* Returns the user authorized areas
	* @return array $area_permissions
	*/
	public static function get_ar_authorized_areas_for_user() : array {

		// cached permissions_table
			$full_permissions_table = security::get_permissions_table();

		// $area_permissions = array_filter($permissions_table, function($item) {
		// 	// return (isset($item->type) && $item->type==='area') ? $item : null;
		// 	return ($item->tipo===$item->section_tipo) ? $item : null;
		// });

		// filter area_permissions
			$area_permissions = [];
			$total = sizeof($full_permissions_table);
			for ($i=0; $i < $total; $i++) {
				$item = $full_permissions_table[$i];
				if ($item->tipo===$item->section_tipo) {
					$area_permissions[] = $item;
				}
			}


		return $area_permissions;
	}//end get_ar_authorized_areas_for_user



	/**
	* IS_GLOBAL_ADMIN
	* Test if received user is global admin
	* @param $user_id
	*	User id · int · can be the current logged user or not.
	* @return bool
	*/
	public static function is_global_admin(int $user_id) : bool {

		// dedalo superuser case
			if ($user_id===DEDALO_SUPERUSER) {
				return true;
			}

		// empty user_id
			if ($user_id<1) {
				return false;
			}

		// cached value. If request user_id is the same as current logged user, return session value, without access to component
			if ( isset($_SESSION['dedalo']['auth']['user_id']) && $user_id==$_SESSION['dedalo']['auth']['user_id'] ) {

				return isset($_SESSION['dedalo']['auth']['is_global_admin'])
					? (bool)$_SESSION['dedalo']['auth']['is_global_admin']
					: false;
			}

		// Resolve from component
			$security_administrator_model		= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_SECURITY_ADMINISTRATOR_TIPO,true);
			$component_security_administrator	= component_common::get_instance(
				$security_administrator_model,
				DEDALO_SECURITY_ADMINISTRATOR_TIPO,
				$user_id,
				'list',
				DEDALO_DATA_NOLAN,
				DEDALO_SECTION_USERS_TIPO
			);

			$security_administrator_dato = $component_security_administrator->get_dato();

			// empty user data case
				if (empty($security_administrator_dato)) {
					return false;
				}

			// locator data
				$dato = (int)$security_administrator_dato[0]->section_id;

		// is_global_admin
			$is_global_admin = ($dato===1);


		return $is_global_admin;
	}//end is_global_admin



	/**
	* IS_DEVELOPER
	* Test if received user is developer
	* @see login::is_developer()
	* @param $user_id
	*	User id · int · can be the current logged user or not.
	* @return bool
	*/
	public static function is_developer(int $user_id) : bool {

		// dedalo superuser case
			if ($user_id===DEDALO_SUPERUSER) {
				return true;
			}

		// cached value. If request user_id is the same as current logged user, return session value, without access to component
			if ( isset($_SESSION['dedalo']['auth']['user_id']) && $user_id==$_SESSION['dedalo']['auth']['user_id'] ) {

				return isset($_SESSION['dedalo']['auth']['is_developer'])
					? (bool)$_SESSION['dedalo']['auth']['is_developer']
					: false;
			}

		// is_developer. Calculated from the component
			$is_developer = login::is_developer($user_id);


		return $is_developer;
	}//end is_developer



}//end class security
