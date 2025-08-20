<?php declare(strict_types=1);
/**
* CLASS SECURITY
*
*	Permissions:
*
*	0 no access
*	1 read only
*	2 read/write
*	3 debug
*/
class security {



	/**
	* CLASS VARS
	*/
		// private $permissions;

		private $user_id;
		private $permissions_tipo;			// permissions defined in config
		private $permissions_dato;			// permissions defined in config that contains data

		private static $ar_permissions_in_matrix_for_current_user; // array data
		private static $ar_permissions_table;

		private $filename_user_ar_permissions_table;

		static $permissions_table_cache;



	/**
	* __CONSTRUCT
	*/
	function __construct() {

		// user id check
			$current_logged_user_id = logged_user_id();
			if( empty($current_logged_user_id) ) {
				$msg = " Error: Session user_id is not defined! ";
				debug_log(__METHOD__
					. " $msg  "
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					throw new Exception( __METHOD__ . $msg);
				}
				die();
			}else{
				$this->user_id = $current_logged_user_id;
			}
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
	public static function get_security_permissions( string $parent_tipo, string $tipo ) : int {

		// debug
			if(SHOW_DEBUG===true) {
				$start_time=start_time();
				// metrics
				metrics::$security_permissions_total_calls++;
			}

		// read_only case. For speed and accessibility, return fixed value 1 here
			// Some services like 'service_autocomplete' or 'search' use read only mode fro speed
			// Autocomplete status inheritance
			// Used to identify if the search has been fired by autocompletes(portal searches) or not (list)
			// autocompletes need has access to target sections and components.
			// When the action is search by autocompletes, the permissions need to be at least 1 (read).
			// Note: take account that the project filter was applied in the search
			// so, here the data is the result of the search to be processed by section
			// to get the component data.
			$read_only = dd_core_api::$rqo->source->config->read_only ?? false;
			if ($read_only) {
				// exclude some sections for security
				$exclude_sections = [
					DEDALO_SECTION_USERS_TIPO,
					DEDALO_SECTION_PROFILES_TIPO
				];
				if (!in_array($parent_tipo, $exclude_sections)) {
					return 1;
				}
			}

		// cache
			// $use_cache = false;
			// if ($use_cache===true) {
			// 	$cache_uid = $parent_tipo . '_' . $tipo;
			// 	if (isset($_SESSION['dedalo']['auth']['permissions'][$cache_uid])) {
			// 		return $_SESSION['dedalo']['auth']['permissions'][$cache_uid];
			// 	}
			// }

		// logged root user id
			$user_id = logged_user_id();
			if ((int)$user_id===DEDALO_SUPERUSER) {
				// force to calculate permissions (but is not used, only for debug)
				$permissions_table = security::get_permissions_table();
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
			if ($tipo===DEDALO_SECTION_INFO_INVERSE_RELATIONS || $tipo==='all') {
				return 1;
			}

		// maintenance area is only accessible by root, global admin or developer,
			if ($tipo===DEDALO_AREA_MAINTENANCE_TIPO) {
				$is_global_admin	= security::is_global_admin($user_id);
				$is_developer		= security::is_developer($user_id);
				if ($is_global_admin===false && $is_developer===false) {
					return 0;
				}
			}

		// permissions_table, get the value of the user profile (component_security_access)
		// At this point, permissions_table is an assoc array as ["test38_test122"=> 2,"test38_test207"=> 2,..]
			$permissions_table = security::get_permissions_table();

		// permissions
			$permissions_key	= $parent_tipo.'_'.$tipo;
			$permissions		= isset($permissions_table[$permissions_key])
				? $permissions_table[$permissions_key]
				: 0;

		// access to list of values: public (matrix_list) and private (matrix_dd)
			if ($permissions===0) {
				$model_name = ontology_node::get_modelo_name_by_tipo($parent_tipo, true);
				if ($model_name==='section') {
					$matrix_table = common::get_matrix_table_from_tipo($parent_tipo);
					if ($matrix_table==='matrix_list' || $matrix_table==='matrix_dd' || $matrix_table==='matrix_notes'){
						$permissions = 1;
					}
				}
			}

		// cache
			// if ($use_cache===true) {
			// 	$_SESSION['dedalo']['auth']['permissions'][$cache_uid] = (int)$permissions;
			// }

		// debug
			if(SHOW_DEBUG===true) {
				// metrics
				$total_time = exec_time_unit($start_time);
				metrics::$security_permissions_total_time += $total_time;
			}


		return (int)$permissions;
	}//end get_security_permissions



	/**
	* PERMISSIONS TABLE
	* Calculated once and stored in cache
	* Cached as custom file for each user as 'development_1_cache_permissions_table.json'
	* containing an JSON object with key => value as
	* {
	* 	"test38_test122": 2,
	*	"test38_test207": 2,
	* 	..
	* }
	* @return array $permissions_table
	*	Array of permissions of ALL structure table elements from root 'dd1'
	*/
	private static function get_permissions_table() : array {
		$start_time=start_time();

		// static cache. Cached once by script run
			if (isset(security::$permissions_table_cache)) {
				return security::$permissions_table_cache;
			}

		// cache file
			$use_cache = true;
			if ($use_cache===true) {

				$cache_file_name = 'cache_permissions_table.json';

				// cache file check
				$cache_data	= dd_cache::cache_from_file((object)[
					'file_name' => $cache_file_name
				]);

				// existing value case returns from cache file
				if (!empty($cache_data)) {

					$permissions_table = json_decode(
						$cache_data,
						true // cast to associative array (JSON encoded as object)
					);

					// set static cache
					security::$permissions_table_cache = $permissions_table;

					debug_log(__METHOD__
						." Returning permissions_table from cache file: $cache_file_name. Time: " . exec_time_unit($start_time, 'ms') . ' ms'
						, logger::DEBUG
					);

					return $permissions_table;
				}
			}

		// get reliable component (assigned profile checked)
			$user_id = logged_user_id(); // from session
			$component_security_access = security::get_user_security_access($user_id);

		// dato_access. is the first value of the result array if not empty
			$dato = !empty($component_security_access)
				? ($component_security_access->get_dato() ?? [])
				: [];

		// transforms to assoc array (fast for check if item exists)
			$permissions_table = [];
			foreach ($dato as $item) {
				$permissions_key = $item->section_tipo.'_'.$item->tipo;
				$permissions_table[$permissions_key] = $item->value;
			}

		// set static cache
			security::$permissions_table_cache = $permissions_table;

		// cache file
			if ($use_cache===true) {
				// write cache data to file
				dd_cache::cache_to_file((object)[
					'file_name'	=> $cache_file_name,
					'data'		=> $permissions_table // assoc array will be convert to JSON object
				]);
			}

		// debug
			if(SHOW_DEBUG===true) {
				// metrics
				metrics::$security_permissions_table_time = exec_time_unit($start_time);
				metrics::$security_permissions_table_count = count($permissions_table);
			}


		return $permissions_table;
	}//end get_permissions_table



	/**
	* GET_AR_PERMISSIONS_IN_MATRIX_FOR_CURRENT_USER (REMOVED 19-03-2024 BECAUSE IT IS NOT NECESSARY)
	* Search in matrix record with this id (user_id) as parent,
	* filter by tipo - model name (component_security_access) and get dato if exists in db
	* @param int $user_id
	* @return array $dato_access
	*	Array of all elements of current Ontology with permission values
	*	Include areas and components permissions
	*/
		// private static function get_ar_permissions_in_matrix_for_current_user(int $user_id) : array {

		// 	// get reliable component (assigned profile checked)
		// 		$component_security_access = security::get_user_security_access($user_id);

		// 	// dato_access. is the first value of the result array if not empty
		// 	// $dato_access = is_object($component_security_access) ? (array)$component_security_access->get_dato() : null;
		// 		$dato_access = !empty($component_security_access)
		// 			? $component_security_access->get_dato()
		// 			: [];

		// 	return $dato_access ?? [];
		// }//end get_ar_permissions_in_matrix_for_current_user



	/**
	* GET_USER_SECURITY_ACCESS
	* Locate component_security_access of current logged user based on user profile
	* and return the component instance
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
				DEDALO_SECTION_PROFILES_TIPO,
				true // bool cache
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
			$component_profile_model	= ontology_node::get_modelo_name_by_tipo(DEDALO_USER_PROFILE_TIPO,true);
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
	* RESET_PERMISSIONS_TABLE
	* Force to recalculate global permissions
	* @return bool true
	*/
	public static function reset_permissions_table() : bool {

		// force clean cache (session and static vars)
		security::clean_cache();

		// force re-calculate values
		security::get_permissions_table();

		return true;
	}//end reset_permissions_table



	/**
	* CLEAN_CACHE
	* Removes PHP session permissions_table and
	* security static vars 'permissions_table_cache'
	* @return bool
	*/
	public static function clean_cache() {

		// unset session var
		if (isset($_SESSION['dedalo']['auth']['permissions_table'])) {
			unset($_SESSION['dedalo']['auth']['permissions_table']);
		}

		// empty static var
		security::$permissions_table_cache = null;

		return true;
	}//end clean_cache



	/**
	* GET_AR_AUTHORIZED_AREAS_FOR_USER
	* Returns the user authorized areas
	* @return array $area_permissions
	*/
	public static function get_ar_authorized_areas_for_user() : array {

		// filter area_permissions
		$area_permissions = [];

		// cached permissions_table from file xxx_cache_permissions_table.json
		$full_permissions_table = security::get_permissions_table();

		// filter items with same tipo and section_tipo such as {"tchi1_tchi1": 2}
		foreach ($full_permissions_table as $key => $value) {
			// Match pattern where first two parts separated by _ are identical
			if (preg_match('/^([^_]+)_\1(?:_|$)/', $key, $matches)) {
				$area_permissions[] = (object)[
					'tipo' => $matches[1], // as 'tchi1'
					'value' => $value // as 2
				];
			}
		}


		return $area_permissions;
	}//end get_ar_authorized_areas_for_user



	/**
	* IS_GLOBAL_ADMIN
	* Test if received user is global admin
	* @param int|null $user_id
	*	User id · int|null · can be the current logged user or not.
	* @return bool
	*/
	public static function is_global_admin(?int $user_id) : bool {

		// dedalo superuser case
			if ($user_id===DEDALO_SUPERUSER) {
				return true;
			}

		// empty user_id
			if (empty($user_id) || $user_id<1) {
				return false;
			}

		// logged user_id (from session)
			$logged_user_id = logged_user_id();

		// cached value. If request user_id is the same as current logged user, return session value, without access to component
			if ( $user_id==$logged_user_id ) {

				// get from session (set on user login)
				$is_global_admin = logged_user_is_global_admin();

			}else{

				// Resolve from component
				$security_administrator_model		= ontology_node::get_modelo_name_by_tipo(DEDALO_SECURITY_ADMINISTRATOR_TIPO,true);
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
			}


		return $is_global_admin;
	}//end is_global_admin



	/**
	* IS_DEVELOPER
	* Test if received user is developer
	* @param $user_id
	*	User id · int · can be the current logged user or not.
	* @return bool
	*/
	public static function is_developer(int $user_id) : bool {

		// dedalo superuser case
			if ($user_id===DEDALO_SUPERUSER) {
				return true;
			}

		// logged user_id (from session)
			$logged_user_id = logged_user_id();

		// cached value. If request user_id is the same as current logged user, return session value, without access to component
			if ( $user_id==$logged_user_id ) {

				// get from session value (set on user login)
				$is_developer = logged_user_is_developer();

			}else{

				// Resolve from component data
				$model		= ontology_node::get_modelo_name_by_tipo(DEDALO_USER_DEVELOPER_TIPO,true);
				$component	= component_common::get_instance(
					$model,
					DEDALO_USER_DEVELOPER_TIPO,
					$user_id,
					'list',
					DEDALO_DATA_NOLAN,
					DEDALO_SECTION_USERS_TIPO
				);
				$dato = $component->get_dato();

				// empty user data case
					if (empty($dato)) {
						return false;
					}

				// locator data
					$dato = (int)$dato[0]->section_id;

				// is_developer
					$is_developer = ($dato===1);
			}


		return $is_developer;
	}//end is_developer



	/**
	* GET_SECTION_NEW_PERMISSIONS
	* Resolves button new permissions
	* @see component_filter->set_dato_default()
	* @param string $section_tipo
	* @return int|null $permissions
	* 	null indicates that no button new is available or permissions are not set
	*/
	public static function get_section_new_permissions(string $section_tipo) : ?int {

		// locate section button new
		$ar_button_new = section::get_ar_children_tipo_by_model_name_in_section(
			$section_tipo, // section_tipo
			['button_new'], // ar_model_name_required
			true, // from_cache
			true, // resolve_virtual
			false, // recursive
			true, // search_exact
			false //ar_tipo_exclude_elements
		);
		$button_new_tipo = $ar_button_new[0] ?? null;
		if (empty($button_new_tipo)) {
			return null;
		}

		$permissions = common::get_permissions($section_tipo, $button_new_tipo);


		return $permissions;
	}//end get_section_new_permissions



}//end class security
