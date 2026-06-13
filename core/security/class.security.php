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
		/**
		 * ID of the currently logged-in user.
		 * Set in constructor from session. Used to resolve user-specific permissions.
		 * @var ?int $user_id
		 */
		private ?int $user_id = null;

		/**
		 * Tipo of the section storing user permissions in config.
		 * Defines where the permission matrix is stored in the ontology.
		 * @var ?string $permissions_tipo
		 */
		private ?string $permissions_tipo = null;

		/**
		 * Component tipo within the permissions section that contains the actual permission data.
		 * Points to the specific field holding permission values.
		 * @var ?string $permissions_dato
		 */
		private ?string $permissions_dato = null;

		/**
		 * Static cache of permissions matrix for the current user.
		 * Array mapping section_tipos to permission levels (0-3) for the active user.
		 * @var ?array $ar_permissions_in_matrix_for_current_user
		 */
		private static ?array $ar_permissions_in_matrix_for_current_user = null;

		/**
		 * Static cache of the full permissions lookup table.
		 * Stores all user/section permission mappings for fast access.
		 * @var ?array $ar_permissions_table
		 */
		private static ?array $ar_permissions_table = null;

		/**
		 * Filename for caching the user's permissions table on disk.
		 * Used to persist permission lookups across requests for performance.
		 * @var ?string $filename_user_ar_permissions_table
		 */
		private ?string $filename_user_ar_permissions_table = null;

		/**
		 * Static cache for parsed permissions table data.
		 * Prevents repeated file reads or database queries for permission lookups.
		 * @var ?array $permissions_table_cache
		 */
		public static ?array $permissions_table_cache = null;

		/**
		 * Server-only flag to grant temporary read access for non-destructive operations.
		 * Used in autocomplete and label resolution where the user lacks direct access
		 * but needs to read linked data. Must ONLY be set by trusted server code
		 * and reset in a finally block. Never trust client-supplied rqo for this flag.
		 * @var bool $read_only_scope
		 */
		public static bool $read_only_scope = false;



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
				metrics::inc('security_permissions_total_calls');
			}

		// read_only case. For speed and accessibility, return fixed value 1 here
			// Some services like 'service_autocomplete' or 'search' use read only mode for speed
			// (autocompletes need access to target sections and components to resolve labels).
			// SECURITY: this flag MUST come from server-side code (security::$read_only_scope),
			// never from the user-supplied rqo. A previous version trusted
			// dd_core_api::$rqo->source->config->read_only, which let any logged user
			// gain read access to almost every section by setting that flag.
			if (self::$read_only_scope===true) {
				// exclude some sections for security
				$exclude_sections = [
					DEDALO_SECTION_USERS_TIPO,
					DEDALO_SECTION_PROFILES_TIPO
				];
				if (!in_array($parent_tipo, $exclude_sections)) {
					return 1;
				}
			}

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

		// time machine dd15 records
			if ($parent_tipo===DEDALO_TIME_MACHINE_SECTION_TIPO) {
				/**
				 * @todo working here to decide the proper permissions for time machine 'dd15' records
				 * Temporal permissions assignation !
				 */
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
				$model_name = ontology_node::get_model_by_tipo($parent_tipo, true);
				if ($model_name==='section') {
					$matrix_table = common::get_matrix_table_from_tipo($parent_tipo);
					if ($matrix_table==='matrix_list' || $matrix_table==='matrix_dd' || $matrix_table==='matrix_notes'){
						$permissions = 1;
					}
				}
			}

		// debug
			if(SHOW_DEBUG===true) {
				// metrics
				$total_time = exec_time_unit($start_time);
				metrics::add_time_ms('security_permissions_total_time', $total_time);
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

		// cache file
			$use_cache = true;
			if ($use_cache===true) {

				// static cache
				// (!) Its important to use static cache here to handle properly the login sequence,
				// where some permission resolutions are called before the file cache is created.
				if (self::$permissions_table_cache !== null) {
					return self::$permissions_table_cache;
				}

				$cache_file_name = 'cache_permissions_table.php';

				// cache file check
				$cache_data	= dd_cache::cache_from_file((object)[
					'file_name' => $cache_file_name
				]);

				// existing value case returns from cache file
				if (!empty($cache_data) && is_array($cache_data)) {

					// debug_log(__METHOD__
					// 	." Returning permissions_table from cache file: $cache_file_name : " . exec_time_unit($start_time, 'ms') . ' ms'
					// 	, logger::DEBUG
					// );

					$permissions_table = $cache_data;

					// static cache
					self::$permissions_table_cache = $permissions_table;

					// debug
					if(SHOW_DEBUG===true) {
						// metrics
						metrics::set('security_permissions_table_time', exec_time_unit($start_time));
					}

					return $permissions_table;
				}
			}

		// get reliable component (assigned profile checked)
			$user_id = logged_user_id(); // from session
			$component_security_access = security::get_user_security_access($user_id);

		// data_access. is the first value of the result array if not empty
			$data = !empty($component_security_access)
				? ($component_security_access->get_data() ?? [])
				: [];

		// transforms to assoc array (fast for check if item exists)
			$permissions_table = [];
			foreach ($data as $item) {
				$permissions_key = $item->section_tipo.'_'.$item->tipo;
				$permissions_table[$permissions_key] = $item->value;
			}

		// cache file write
			if ($use_cache===true) {
				// static cache
				self::$permissions_table_cache = $permissions_table;

				// write cache data to file
				dd_cache::cache_to_file((object)[
					'file_name'	=> $cache_file_name,
					'data'		=> $permissions_table // assoc array will be convert to JSON object
				]);
			}

		// debug
			if(SHOW_DEBUG===true) {
				// metrics
				metrics::set('security_permissions_table_time', exec_time_unit($start_time));
				metrics::set('security_permissions_table_count', count($permissions_table));
			}


		return $permissions_table;
	}//end get_permissions_table



	/**
	* GET_USER_SECURITY_ACCESS
	* Locate component_security_access of current logged user based on user profile
	* and return the component instance
	* @param int $user_id
	* @return component_security_access|null $component_security_access
	* Returns null if user profile is not found.
	*/
	public static function get_user_security_access(int $user_id) : ?component_security_access {

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
			$component_profile_model	= ontology_node::get_model_by_tipo(DEDALO_USER_PROFILE_TIPO, true);
			$component_profile			= component_common::get_instance(
				$component_profile_model, // component_select expected
				DEDALO_USER_PROFILE_TIPO,
				(int)$user_id,
				'list',
				DEDALO_DATA_NOLAN,
				DEDALO_SECTION_USERS_TIPO
			);
			$profile_data = $component_profile->get_data();
			if (empty($profile_data)) {
				return null;
			}

			// locator
			$locator = $profile_data[0] ?? null;

			// Verify it's actually an object (locator)
			if (!is_object($locator)) {
				debug_log(__METHOD__
					. " Invalid value from component profile. Expected object " . PHP_EOL
					. " locator " . to_string($locator) . PHP_EOL
					. ' type: ' . gettype($locator)
					, logger::ERROR
				);
				return null;
			}


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

		// delete on-disk cache so the next lookup regenerates from the component
		dd_cache::delete_cache_files([
			'cache_permissions_table.php'
		]);

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

		// Identify and filter items with same tipo and section_tipo such as {"tchi1_tchi1": 2}
		foreach ($full_permissions_table as $key => $value) {
			$pos = strpos($key, '_');

			// If underscore exists and is followed by the same string
			if ($pos !== false && substr_compare($key, $key, $pos + 1, $pos) === 0) {
				// Ensure the match is a full segment (followed by end of string or another _)
				$nextChar = $key[$pos + $pos + 1] ?? '';
				if ($nextChar === '' || $nextChar === '_') {
					$item = new stdClass();
					$item->tipo = substr($key, 0, $pos);
					$item->value = $value;

					$area_permissions[] = $item;
				}
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
			if ( $user_id===$logged_user_id ) {

				// get from session (set on user login)
				$is_global_admin = logged_user_is_global_admin();

			}else{

				// Resolve from component
				$security_administrator_model = ontology_node::get_model_by_tipo(DEDALO_SECURITY_ADMINISTRATOR_TIPO, true);
				if (!$security_administrator_model) {
					debug_log('Model not found for tipo: ' . DEDALO_SECURITY_ADMINISTRATOR_TIPO, logger::ERROR);
					return false;
				}
				$component_security_administrator = component_common::get_instance(
					$security_administrator_model,
					DEDALO_SECURITY_ADMINISTRATOR_TIPO,
					$user_id,
					'list',
					DEDALO_DATA_NOLAN,
					DEDALO_SECTION_USERS_TIPO
				);
				if ($component_security_administrator === null) {
					debug_log('Component not found for tipo: ' . DEDALO_SECURITY_ADMINISTRATOR_TIPO, logger::ERROR);
					return false;
				}

				$security_administrator_data = $component_security_administrator->get_data();

				// empty user data case
					if (empty($security_administrator_data) || !isset($security_administrator_data[0]->section_id)) {
						return false;
					}

				// locator data
					$data = (int)$security_administrator_data[0]->section_id;

				// is_global_admin
					$is_global_admin = ($data===1);
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

		// empty user_id
			if (empty($user_id) || $user_id<1) {
				return false;
			}

		// logged user_id (from session)
			$logged_user_id = logged_user_id();

		// cached value. If request user_id is the same as current logged user, return session value, without access to component
			if ( $user_id===$logged_user_id ) {

				// get from session value (set on user login)
				$is_developer = logged_user_is_developer();

			}else{

				// Resolve from component data
				$model = ontology_node::get_model_by_tipo(DEDALO_USER_DEVELOPER_TIPO, true);
				if(!$model) {
					debug_log('Model not found for tipo: ' . DEDALO_USER_DEVELOPER_TIPO, logger::ERROR);
					return false;
				}
				$component = component_common::get_instance(
					$model,
					DEDALO_USER_DEVELOPER_TIPO,
					$user_id,
					'list',
					DEDALO_DATA_NOLAN,
					DEDALO_SECTION_USERS_TIPO
				);
				if ($component === null) {
					debug_log('Component not found for tipo: ' . DEDALO_USER_DEVELOPER_TIPO, logger::ERROR);
					return false;
				}
				$data = $component->get_data();

				// empty user data case
					if (empty($data) || !isset($data[0]->section_id)) {
						return false;
					}

				// locator data
					$data = (int)$data[0]->section_id;

				// is_developer
					$is_developer = ($data===1);
			}


		return $is_developer;
	}//end is_developer



	/**
	* GET_SECTION_NEW_PERMISSIONS
	* Resolves button new permissions
	* @see component_filter->set_data_default()
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



	/**
	* ASSERT_SECTION_PERMISSION
	* Throws a permission_exception if the logged user has insufficient
	* permission on $section_tipo. Use as a one-line gate at the top of
	* API methods that operate on a section.
	* @param string $section_tipo
	* @param int $required_level 1=read, 2=write, 3=admin
	* @param string $context Optional caller context for logs.
	* @throws permission_exception
	* @return void
	*/
	public static function assert_section_permission(
		string $section_tipo,
		int $required_level,
		string $context = ''
	) : void {
		$perm = common::get_permissions($section_tipo, $section_tipo);
		if ($perm < $required_level) {
			throw new permission_exception(
				"Insufficient permissions on section $section_tipo (required: $required_level, have: $perm)",
				$context
			);
		}
	}//end assert_section_permission



	/**
	* ASSERT_TIPO_PERMISSION
	* Throws a permission_exception if the logged user has insufficient
	* permission on the (parent_tipo, tipo) pair. Use for component-level
	* gating where the parent section_tipo and component tipo differ.
	* @param string $parent_tipo
	* @param string $tipo
	* @param int $required_level
	* @param string $context
	* @throws permission_exception
	* @return void
	*/
	public static function assert_tipo_permission(
		string $parent_tipo,
		string $tipo,
		int $required_level,
		string $context = ''
	) : void {
		$perm = common::get_permissions($parent_tipo, $tipo);
		if ($perm < $required_level) {
			throw new permission_exception(
				"Insufficient permissions on $parent_tipo / $tipo (required: $required_level, have: $perm)",
				$context
			);
		}
	}//end assert_tipo_permission



	/**
	* ASSERT_COMPONENT_PERMISSION
	* Throws if the component's resolved permission level is below required.
	* Use when an instantiated component is already at hand.
	* @param component_common $component
	* @param int $required_level
	* @throws permission_exception
	* @return void
	*/
	public static function assert_component_permission(
		component_common $component,
		int $required_level
	) : void {
		$perm = $component->get_component_permissions();
		if ($perm < $required_level) {
			throw new permission_exception(
				"Insufficient permissions on component {$component->get_tipo()} (required: $required_level, have: $perm)"
			);
		}
	}//end assert_component_permission



	/**
	* ASSERT_SECTION_ARRAY_PERMISSION
	* Throws on the first $section_tipo in the array that fails the gate.
	* Use for SQO arrays like sqo.section_tipo[].
	* @param array $ar_section_tipo
	* @param int $required_level
	* @param string $context
	* @throws permission_exception
	* @return void
	*/
	public static function assert_section_array_permission(
		array $ar_section_tipo,
		int $required_level,
		string $context = ''
	) : void {
		foreach ($ar_section_tipo as $st) {
			if (!is_string($st)) {
				continue;
			}
			self::assert_section_permission($st, $required_level, $context);
		}
	}//end assert_section_array_permission



	/**
	* ASSERT_LOCATOR_ARRAY_PERMISSION
	* Iterates filter_by_locators and gates each unique section_tipo.
	* @param array $filter_by_locators
	* @param int $required_level
	* @param string $context
	* @throws permission_exception
	* @return void
	*/
	public static function assert_locator_array_permission(
		array $filter_by_locators,
		int $required_level,
		string $context = ''
	) : void {
		$seen = [];
		foreach ($filter_by_locators as $loc) {
			$st = is_object($loc) ? ($loc->section_tipo ?? null) : null;
			if ($st === null || isset($seen[$st])) {
				continue;
			}
			$seen[$st] = true;
			self::assert_section_permission($st, $required_level, $context);
		}
	}//end assert_locator_array_permission



	/**
	* USER_CAN_ACCESS_RECORD
	* SEC-024 (§9.4): per-record visibility gate (`filter_by_projects` layer).
	*
	* Mirrors the logic that `search::build_sql_projects_filter` applies to
	* every search query, but evaluated against a single (section_tipo,
	* section_id). Returns true when the record falls inside the caller's
	* `component_filter_master` scope (i.e. the user would see it through a
	* normal list/search). Global admins and DEDALO_SUPERUSER bypass.
	*
	* This is layer 2 of Dédalo's two-tier ACL:
	*   - layer 1 → `assert_*_permission` (schema-level, type-based)
	*   - layer 2 → this helper (per-record, project-based)
	*
	* @param string $section_tipo
	* @param int $section_id
	* @param int|null $user_id Defaults to logged_user_id().
	* @return bool
	*/
	public static function user_can_access_record(
		string $section_tipo,
		int $section_id,
		?int $user_id = null
	) : bool {

		if ($section_id < 1 || empty($section_tipo)) {
			return false;
		}

		$user_id = $user_id ?? logged_user_id();
		if (empty($user_id)) {
			return false;
		}

		// superuser bypass
			if ((int)$user_id === DEDALO_SUPERUSER) {
				return true;
			}

		// global admin bypass — same exemption used by build_sql_projects_filter
			if (self::is_global_admin((int)$user_id) === true) {
				return true;
			}

		// sections that are exempt from filter_by_projects (mirrors switch in
		// search::build_sql_projects_filter)
			if ($section_tipo === DEDALO_SECTION_PROFILES_TIPO
				|| $section_tipo === DEDALO_FILTER_SECTION_TIPO_DEFAULT
			) {
				return true;
			}

		// users section: a user can see their own user record plus users
		// whose component_filter intersects their projects. The cheap path
		// is "did the caller create this record?"; we fall through to the
		// project-relation check otherwise.
			if ($section_tipo === DEDALO_SECTION_USERS_TIPO) {
				if ((int)$section_id === (int)$user_id) {
					return true;
				}
				// fall through to default check
			}

		// default: load the section's component_filter and intersect with
		// the user's project set.
			$ar_component_filter = section::get_ar_children_tipo_by_model_name_in_section(
				$section_tipo,
				['component_filter'],
				true,  // from_cache
				true,  // resolve_virtual
				true,  // recursive
				true   // search_exact
			);
			$component_filter_tipo = $ar_component_filter[0] ?? null;
			if (empty($component_filter_tipo)) {
				// section has no component_filter → not subject to per-record
				// project gating (legacy / config sections).
				return true;
			}

		// user projects (cached by component_filter_master::get_user_projects)
			$user_projects = component_filter_master::get_user_projects((int)$user_id);
			if (empty($user_projects)) {
				return false;
			}
			$user_project_keys = [];
			foreach ($user_projects as $loc) {
				$user_project_keys[$loc->section_tipo.'_'.$loc->section_id] = true;
			}

		// load the record's component_filter data
			$model = ontology_node::get_model_by_tipo($component_filter_tipo, true);
			if (empty($model)) {
				return false;
			}
			$component = component_common::get_instance(
				$model,
				$component_filter_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			if ($component === null) {
				return false;
			}
			$record_filter_data = $component->get_data();
			if (empty($record_filter_data)) {
				// record exists but has no project assignment → not visible to
				// non-admin users (matches the behaviour of the SQL filter).
				return false;
			}

			foreach ($record_filter_data as $loc) {
				if (!is_object($loc)) {
					continue;
				}
				$key = ($loc->section_tipo ?? '') .'_'. ($loc->section_id ?? '');
				if (isset($user_project_keys[$key])) {
					return true;
				}
			}

		return false;
	}//end user_can_access_record



	/**
	* ASSERT_RECORD_IN_USER_SCOPE
	* SEC-024 (§9.4): throwing variant of `user_can_access_record`. Use this
	* next to `assert_*_permission` whenever a tool method receives a
	* caller-supplied `section_id` and is about to mutate or read it
	* outside of a sqo (which already applies the project filter).
	*
	* @param string $section_tipo
	* @param int $section_id
	* @param string $context Caller name for the exception (typically __METHOD__).
	* @throws permission_exception
	* @return void
	*/
	public static function assert_record_in_user_scope(
		string $section_tipo,
		int $section_id,
		string $context = ''
	) : void {
		if (self::user_can_access_record($section_tipo, $section_id) === true) {
			return;
		}
		throw new permission_exception(
			'Record outside user scope (filter_by_projects)',
			$context
		);
	}//end assert_record_in_user_scope



}//end class security



/**
* CLASS PERMISSION_EXCEPTION
* Thrown by security::assert_* helpers when the logged user has
* insufficient permission for the requested action.
* dd_manager catches this and converts it to a uniform error response.
* Defined in this file (rather than its own dir) so it is loaded
* together with the security class via the autoloader.
*/
final class permission_exception extends Exception {

	public string $api_context;

	public function __construct(string $message, string $context = '') {
		parent::__construct($message);
		$this->api_context = $context;
	}

}//end class permission_exception
