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
	private $permissions;

	private $user_id;
	private $permissions_tipo;			# CAMPO DE PRMISOS (TIPO DEFINIDO EN CONFIG)
	private $permissions_dato;			# CAMPO DE PRMISOS (TIPO DEFINIDO EN CONFIG) QUE CONTIENE LOS DATOS

	private static $ar_permissions_in_matrix_for_current_user; # AR DATO
	private static $ar_permissions_table;

	private $filename_user_ar_permissions_table;



	/**
	* __CONSTRUCT
	*/
	function __construct() {

		// user id check
			if(empty($_SESSION['dedalo']['auth']['user_id'])) {
				$msg = " <span class='error'> Error: Session user_id is not defined! </span>";
				trigger_error($msg);
				if(SHOW_DEBUG===true) {
					throw new Exception( __METHOD__ . $msg);
				}
				die($msg);
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

		// logged user id
			$user_id = $_SESSION['dedalo']['auth']['user_id'];
			if ((int)$user_id===DEDALO_SUPERUSER) {
				return 3;
			}

		// Tools Register section 'dd1324'
			if ($parent_tipo===DEDALO_REGISTER_TOOLS_SECTION_TIPO) {
				return 1;
			}

		// permissions_table
			$permissions_table = security::get_permissions_table();

		// permissions_table find
			$found = array_find($permissions_table, function($el) use($parent_tipo, $tipo){
				return $el->section_tipo===$parent_tipo && $el->tipo===$tipo;
			});

			$permissions = $found->value ?? 0;

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

		static $permissions_table;

		// cache file
			$file_name = DEDALO_ENTITY .'_'. navigator::get_user_id() . '.cache_permissions_table.json';

		switch (true) {

			// STATIC CACHE (RAM)
			case (isset($permissions_table)):
				// Cached once by script run
				return $permissions_table;
				break;

			// DEVELOPMENT_SERVER (Non session cache is used)
				// case (defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true):
				// 	// Break and continue calculation without session cache
				// 	break;

			// SESSION CACHE (HD)
				// case (isset($_SESSION['dedalo']['auth']['permissions_table'])):
				// 	// debug_log(__METHOD__." Loaded permissions_table session");
				// 	$permissions_table = $_SESSION['dedalo']['auth']['permissions_table'];
				// 	return $permissions_table;
				// 	break;

			// DEFAULT
			default:
				// Continue calculating

				// cache file
				$cache_data = dd_cache::cache_from_file((object)[
					'file_name' => $file_name
				]);
				if ($cache_data) {

					$permissions_table = json_decode($cache_data);

					debug_log(__METHOD__." returning permissions_table from cache disk file ".to_string($file_name), logger::DEBUG);
					return $permissions_table;
				}
				break;
		}

		// calculation
			$permissions_table = security::get_ar_permissions_in_matrix_for_current_user();

		// session cached table
			// $_SESSION['dedalo']['auth']['permissions_table'] = $permissions_table;
			// cache
				dd_cache::cache_to_file((object)[
					'file_name'	=> $file_name,
					'data'		=> $permissions_table
				]);



		return $permissions_table;
	}//end get_permissions_table



	/**
	* GET_AR_PERMISSIONS_IN_MATRIX_FOR_CURRENT_USER
	* Search in matrix record with this id (user_id) as parent,
	* filter by tipo - modelo name (component_security_access) and get dato if exists in db
	* @return array $ar_permissions_in_matrix_for_current_user
	*	Array of all element=>level like array([dd12] => 2,[dd93] => 2,..)
	*	Include areas and components permissions
	*/
	private static function get_ar_permissions_in_matrix_for_current_user() : array {

		// get reliable component (assigned profile checked)
			$component_security_access = security::get_user_security_access();

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
	* @return object|null $component_security_access
	*/
	private static function get_user_security_access() : ?object {

		// Default behavior is false (use logged user to calculate permissions)
			$user_id = $_SESSION['dedalo']['auth']['user_id'];

		// user profile
			$user_profile = security::get_user_profile($user_id);
			if (empty($user_profile)) {
				return null;
			}

			// locator
			$profile_id = (int)$user_profile->section_id;

		// component_security_access
			$component_security_access = component_common::get_instance(
				'component_security_access',
				DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO,
				$profile_id,
				'edit',
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
	* GET_PERMISSIONS_TABLE_OF_SPECIFIC_USER
	* Custom user calculus
	* @param int $user_id
	* @return array $permissions_table
	*	Array of permissions of ALL structure table elements from root 'dd1'
	*/
	public static function get_permissions_table_of_specific_user(int $user_id) : array {

		$permissions_table = security::get_ar_permissions_in_matrix_for_current_user( $user_id );

		return (array)$permissions_table;
	}//end get_permissions_table_of_specific_user



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

		$user_id = (int)$user_id;

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
				'edit',
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
	* SET_SECTION_PERMISSIONS
	* Allow current user access to created default sections
	* @return bool
	*/
	private static function set_section_permissions(object $request_options) : bool {

		$options = new stdClass();
			$options->section_tipo	= null;
			$options->section_id	= null;
			$options->ar_sections	= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// user_id
			$user_id = navigator::get_user_id();
			if (SHOW_DEBUG===true || $user_id<1) {
				return true;
			}

		// Permissions
			$permissions = 2;
		
		// component_security_access
			$component_security_access		= security::get_user_security_access();
			$component_security_access_dato	= $component_security_access->get_dato();

		// Iterate sections (normally like ts1,ts2)
		// foreach ((array)$options->ar_sections as $current_section_tipo) {
			$ar_sections_length = sizeof($options->ar_sections);
			for ($i=0; $i < $ar_sections_length; $i++) {

				$current_section_tipo = $options->ar_sections[$i];

				$section_permissions = new stdClass();
					$section_permissions->tipo			= $current_section_tipo;
					// $section_permissions->parent		= $current_section_tipo;
					// $section_permissions->type		= 'area';
					$section_permissions->section_tipo	= $current_section_tipo;
					$section_permissions->value			= $permissions;

				$component_security_access_dato[] = $section_permissions;

				# Components inside section
				$real_section	= section::get_section_real_tipo_static( $current_section_tipo );
				$ar_children	= section::get_ar_children_tipo_by_modelo_name_in_section(
					$real_section, // section_tipo
					['component','button','section_group'], // ar_modelo_name_required
					true, // from_cache
					false, // resolve_virtual
					true, // recursive
					false // search_exact
				);

				foreach ($ar_children as $children_tipo) {

					$component_permissions = new stdClass();
						$component_permissions->tipo			= $children_tipo;
						// $component_permissions->parent		= $current_section_tipo;
						$component_permissions->section_tipo	= $current_section_tipo;
						$component_permissions->value			= $permissions;

					$component_security_access_dato[] = $component_permissions;
				}

			}//end foreach ($ar_sections as $current_section_tipo)

		// Save calculated data
			$component_security_access->set_dato($component_security_access_dato);
			$component_security_access->Save();

		// Regenerate permissions table
			security::reset_permissions_table();


		return true;
	}//end set_section_permissions



}//end class security
