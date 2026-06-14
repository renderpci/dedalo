<?php declare(strict_types=1);
/**
* CLASS SECURITY
* Central ACL (Access Control Layer) for Dédalo v7.
*
* Resolves integer permission levels (0–3) for any (section_tipo, component_tipo)
* pair against the currently logged-in user, and exposes a family of one-line
* throwing helpers (`assert_*`) that API methods can use as a gate before
* performing any read or write operation.
*
* Permission scale:
*   0 → no access
*   1 → read only
*   2 → read / write
*   3 → debug / admin (grants every capability)
*
* Two-tier ACL design:
*   Layer 1 – schema-level, type-based: `assert_section_permission`,
*             `assert_tipo_permission`, `assert_component_permission`.
*             Decided by the permissions matrix stored in component_security_access
*             of the user's profile section (dd234).
*   Layer 2 – per-record, project-based: `user_can_access_record` /
*             `assert_record_in_user_scope`.
*             Mirrors the SQL filter injected by search::build_sql_projects_filter,
*             evaluated against a single (section_tipo, section_id).
*
* Permission matrix storage:
*   The matrix lives in component_security_access (tipo dd774) within the user's
*   profile record (section dd234). get_permissions_table() loads it once,
*   serialises it as a flat associative array
*   { "<section_tipo>_<component_tipo>": <level>, … }
*   and writes it to a per-session file cache (`cache_permissions_table.php`).
*   A static variable (`$permissions_table_cache`) provides an in-process cache
*   that avoids even the file read on repeated calls within the same request.
*
* Special bypass rules (evaluated in order inside get_security_permissions):
*   - `$read_only_scope === true` → level 1 for most sections (server code only)
*   - DEDALO_SUPERUSER (user_id === -1) → level 3 always
*   - DEDALO_REGISTER_TOOLS_SECTION_TIPO (dd1324) → level 1 always
*   - DEDALO_TEMP_PRESET_SECTION_TIPO (dd655) → level 2 always
*   - DEDALO_SECTION_INFO_INVERSE_RELATIONS (dd1596) or tipo === 'all' → level 1
*   - DEDALO_TIME_MACHINE_SECTION_TIPO (dd15) → level 1 (temporary; see @todo)
*   - DEDALO_AREA_MAINTENANCE_TIPO (dd88) → 0 unless global admin or developer
*   - matrix_list / matrix_dd / matrix_notes tables → fall back to level 1
*
* Relationships:
*   - Extended by nothing; instantiated by dd_manager and API controllers.
*   - Calls component_common::get_instance(), section::get_ar_children_tipo…(),
*     component_filter_master::get_user_projects(), dd_cache, and the session
*     helpers logged_user_id() / logged_user_is_global_admin() / logged_user_is_developer().
*   - permission_exception is defined in this file so the autoloader loads both
*     together.
*
* @package Dédalo
* @subpackage Core
*/
class security {



	/**
	* CLASS VARS
	*/
		/**
		 * ID of the currently logged-in user.
		 * Populated in the constructor from logged_user_id() (session).
		 * Used only during the constructor; all static methods re-read the session
		 * directly, so this property is not consulted after construction.
		 * @var ?int $user_id
		 */
		private ?int $user_id = null;

		/**
		 * Tipo of the section that stores user permission profiles.
		 * Retained for potential future use; currently not written after construction.
		 * @var ?string $permissions_tipo
		 */
		private ?string $permissions_tipo = null;

		/**
		 * Tipo of the component within the permissions section that holds the
		 * permission matrix data (component_security_access).
		 * Retained for potential future use; currently not written after construction.
		 * @var ?string $permissions_dato
		 */
		private ?string $permissions_dato = null;

		/**
		 * In-process static cache of the permissions matrix for the current user.
		 * Stores a flat associative array keyed as "<section_tipo>_<component_tipo>"
		 * mapping to permission level (int 0–3). Populated on the first call to
		 * get_permissions_table() and reused for the lifetime of the request.
		 * Cleared by clean_cache() and reset_permissions_table() when the matrix
		 * is invalidated (e.g. after a profile change).
		 * @var ?array $ar_permissions_in_matrix_for_current_user
		 */
		private static ?array $ar_permissions_in_matrix_for_current_user = null;

		/**
		 * In-process static cache of the full permissions lookup table.
		 * Secondary cache slot; used as a pre-static-cache fallback in earlier code.
		 * @var ?array $ar_permissions_table
		 */
		private static ?array $ar_permissions_table = null;

		/**
		 * Filename for the per-user on-disk permissions cache.
		 * When set, the file stores the serialised permissions table across requests
		 * so that the matrix does not need to be rebuilt from the component on every
		 * page load.
		 * @var ?string $filename_user_ar_permissions_table
		 */
		private ?string $filename_user_ar_permissions_table = null;

		/**
		 * Primary in-process static cache for the parsed permissions table.
		 * Public so that external diagnostic tooling can inspect or clear the cache
		 * without going through reset_permissions_table(). Use clean_cache() or
		 * reset_permissions_table() in normal application code.
		 * @var ?array $permissions_table_cache
		 */
		public static ?array $permissions_table_cache = null;

		/**
		 * Server-only flag that temporarily elevates any logged-in user to read-level
		 * access on most sections.
		 *
		 * Required by internal services (autocomplete, label resolution, search
		 * sub-queries) that must traverse sections the user has not been explicitly
		 * granted access to in order to resolve referenced labels or list values.
		 *
		 * (!) CRITICAL: this flag MUST be set exclusively by trusted server-side
		 * code (e.g. service_autocomplete, search helper methods) and MUST be reset
		 * (set back to false) in a finally block immediately after the privileged
		 * call. Never honour a client-supplied flag from the rqo/API payload for
		 * this purpose — a previous version that trusted
		 * dd_core_api::$rqo->source->config->read_only allowed any logged user to
		 * gain read access to nearly every section.
		 *
		 * Exceptions (even when true, access stays 0):
		 *   DEDALO_SECTION_USERS_TIPO and DEDALO_SECTION_PROFILES_TIPO
		 *   are never made readable via this flag.
		 * @var bool $read_only_scope
		 */
		public static bool $read_only_scope = false;



	/**
	* __CONSTRUCT
	* Initialises the security instance and validates that a user session exists.
	* Throws (in debug mode) or logs an error if no user_id is found in the session.
	* @throws Exception When SHOW_DEBUG is true and the session has no user_id.
	* @return void
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
	* Resolves the effective permission level (0–3) for a (parent_tipo, tipo) pair
	* against the currently logged-in user.
	*
	* Evaluation order (first matching rule wins):
	*   1. $read_only_scope flag — returns 1 for most sections (see property doc).
	*   2. DEDALO_SUPERUSER — returns 3 unconditionally.
	*   3. Hard-coded section bypasses (tools register, temp preset, inverse relations,
	*      time machine, maintenance area).
	*   4. User permissions matrix (get_permissions_table()).
	*   5. matrix_list / matrix_dd / matrix_notes fallback — returns 1 when the
	*      section stores publicly readable list values and the matrix gave 0.
	*
	* When SHOW_DEBUG is true, the method increments 'security_permissions_total_calls'
	* and accumulates timing in 'security_permissions_total_time' via the metrics
	* subsystem.
	*
	* @param string $parent_tipo - Tipo of the owning section or area (e.g. 'dd128').
	* @param string $tipo - Tipo of the element being checked, usually a component tipo.
	*                       Pass 'all' to check section-level visibility.
	* @return int - Permission level: 0 = none, 1 = read, 2 = read/write, 3 = admin.
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
	* GET_PERMISSIONS_TABLE
	* Builds and returns the full permissions lookup table for the currently
	* logged-in user. The table is a flat associative array:
	*
	*   [ "<section_tipo>_<component_tipo>" => <int level>, … ]
	*
	* Example:
	*   { "test38_test122": 2, "test38_test207": 2, … }
	*
	* Caching strategy (fastest first):
	*   1. In-process static cache ($permissions_table_cache) — avoids any I/O
	*      during a single PHP request and is essential for the login sequence,
	*      where permission lookups happen before the file cache exists.
	*   2. On-disk file cache (`cache_permissions_table.php`, written via dd_cache)
	*      — shared across requests for the same session user.
	*   3. Fresh computation from component_security_access (dd774) of the user's
	*      profile record — triggers a component build and database read.
	*
	* Call clean_cache() or reset_permissions_table() after a profile change to
	* invalidate both layers.
	*
	* @return array - Flat associative permissions map. Returns an empty array
	*                 when the user has no profile or no permission entries.
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
			// Each $item is an object with properties: section_tipo, tipo, value.
			// Keying on "<section_tipo>_<tipo>" mirrors the key built in get_security_permissions.
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
	* Locates and returns the component_security_access instance (tipo dd774)
	* belonging to the profile record assigned to the given user.
	*
	* Resolution path:
	*   user (dd128) → profile locator (dd1725) → profile record (dd234)
	*     → component_security_access (dd774)
	*
	* The component's get_data() returns an array of objects, each describing one
	* (section_tipo, tipo, value) permission entry. This data feeds
	* get_permissions_table().
	*
	* @param int $user_id - Dédalo user section_id (from the users section dd128).
	* @return component_security_access|null - null when the user has no profile.
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
	* Resolves the profile locator object for the given user.
	*
	* Reads the user's profile-select component (tipo DEDALO_USER_PROFILE_TIPO,
	* typically dd1725) in section dd128 and returns the first locator object,
	* which carries `section_tipo` (dd234) and `section_id` identifying the
	* user's profile record. Returns null when no profile is assigned or the
	* data is malformed.
	*
	* @param int $user_id - Dédalo user section_id (in the users section dd128).
	* @return object|null - Locator object { section_tipo, section_id } or null
	*                       if the user has no assigned profile.
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
	* Invalidates all caches for the current user's permission matrix and
	* immediately triggers a fresh computation from the database/component layer.
	*
	* Use after modifying a user's profile assignment or after saving changes
	* to the profile's component_security_access data, so that the new matrix
	* takes effect without requiring a new session.
	*
	* @return bool - Always true.
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
	* Wipes all permission-table cache layers for the current request:
	*   1. The legacy PHP session key `$_SESSION['dedalo']['auth']['permissions_table']`
	*      (kept for backward compatibility with any caller that still reads it).
	*   2. The static in-process cache ($permissions_table_cache).
	*   3. The on-disk file cache (`cache_permissions_table.php`) via dd_cache,
	*      so the next request rebuilds the table from the component.
	*
	* Called by reset_permissions_table(); also useful in tests and after login
	* to guarantee a clean slate.
	*
	* @return bool - Always true.
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
	* Returns the list of area tipos the currently logged-in user has any
	* explicit permission on.
	*
	* An "area" entry in the permissions table is identified by the pattern where
	* both the section_tipo and component_tipo parts of the compound key are the
	* same string (e.g. the key "tchi1_tchi1" represents area tipo "tchi1").
	* This method scans the full flat permissions table and collects those entries.
	*
	* Each element of the returned array is a stdClass with:
	*   - tipo  (string) — the area tipo
	*   - value (int)    — the permission level (0–3)
	*
	* @return array - Array of stdClass{ tipo, value } for each authorized area.
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
	* Tests whether the given user has the global-administrator flag set.
	*
	* Global admins bypass per-record project filters in search queries and have
	* access to administrative UI areas such as the maintenance area (dd88) and
	* the user/profile management sections. They do NOT automatically receive
	* write permission on every component — that still depends on the profile
	* matrix — but many security gates treat them as unrestricted readers.
	*
	* Resolution:
	*   - DEDALO_SUPERUSER (–1) always returns true.
	*   - If $user_id matches the session user, the pre-computed session flag
	*     `$_SESSION['dedalo']['auth']['is_global_admin']` is returned immediately
	*     (set during login).
	*   - Otherwise, the value is read live from component DEDALO_SECURITY_ADMINISTRATOR_TIPO
	*     (dd244) inside section DEDALO_SECTION_USERS_TIPO (dd128). A section_id of 1
	*     in that component's data means the user is a global admin.
	*
	* @param int|null $user_id - The user section_id to test. Pass null or 0 to get
	*                            false immediately (no user → no admin).
	* @return bool - true if the user is a global admin, false otherwise.
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
					// Convention: the component stores a relation to a yes/no list record;
					// section_id === 1 means "yes" (admin), any other value means "no".
					$is_global_admin = ($data===1);
			}


		return $is_global_admin;
	}//end is_global_admin



	/**
	* IS_DEVELOPER
	* Tests whether the given user has the developer flag set.
	*
	* Developer status grants access to the maintenance area (dd88) alongside
	* global admins. It is used by diagnostic and debug features that are unsafe
	* to expose to regular editors. A developer is NOT automatically a global
	* admin and vice versa.
	*
	* Resolution:
	*   - DEDALO_SUPERUSER (–1) always returns true.
	*   - If $user_id matches the session user, the pre-computed session flag
	*     `$_SESSION['dedalo']['auth']['is_developer']` is returned immediately
	*     (set during login).
	*   - Otherwise, the value is read live from component DEDALO_USER_DEVELOPER_TIPO
	*     (dd515) inside section DEDALO_SECTION_USERS_TIPO (dd128). A section_id of 1
	*     in that component's data means the user is a developer.
	*
	* @param int $user_id - The user section_id to test. Pass 0 to get false immediately.
	* @return bool - true if the user is a developer, false otherwise.
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
					// Convention: section_id === 1 means "yes" (developer).
					$is_developer = ($data===1);
			}


		return $is_developer;
	}//end is_developer



	/**
	* GET_SECTION_NEW_PERMISSIONS
	* Resolves the permission level that controls whether the current user may
	* create new records in $section_tipo (the "button_new" gate).
	*
	* Locates the first button_new child tipo within the section's ontology
	* structure, then delegates to common::get_permissions() for the actual
	* level lookup. Returns null when the section has no button_new defined
	* (creation is not supported for that section) or when permissions are
	* not set.
	*
	* @see component_filter::set_data_default()
	* @param string $section_tipo - Tipo of the section to check.
	* @return int|null - Permission level 0–3, or null if no button_new is found.
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
	* Throws a permission_exception if the logged user's level on $section_tipo
	* is below $required_level. Use as a one-line gate at the top of API methods
	* that operate on a section.
	*
	* The check is done against the (section_tipo, section_tipo) self-key, which
	* is the convention for section-level access in the permissions matrix.
	*
	* @param string $section_tipo - Tipo of the section to gate.
	* @param int $required_level - Minimum level required: 1=read, 2=write, 3=admin.
	* @param string $context = '' - Optional caller identifier for the exception message.
	* @throws permission_exception - When the user's level is below $required_level.
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
	* Throws a permission_exception if the logged user has insufficient permission
	* on the ($parent_tipo, $tipo) pair. Use for component-level gating when the
	* parent section_tipo and component tipo differ (the normal case).
	*
	* @param string $parent_tipo - Tipo of the owning section.
	* @param string $tipo - Tipo of the component or sub-element.
	* @param int $required_level - Minimum level required: 1=read, 2=write, 3=admin.
	* @param string $context = '' - Optional caller identifier for the exception message.
	* @throws permission_exception - When the user's level is below $required_level.
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
	* Throws a permission_exception if the already-instantiated component's
	* resolved permission level is below $required_level.
	*
	* Use this variant when the component object is already at hand (avoids a
	* second type/matrix lookup). The level is read from
	* component_common::get_component_permissions(), which calls
	* common::get_permissions() with the component's own section_tipo and tipo.
	*
	* @param component_common $component - The instantiated component to test.
	* @param int $required_level - Minimum level: 1=read, 2=write, 3=admin.
	* @throws permission_exception - When the component's level is below $required_level.
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
	* Iterates an array of section tipos and throws on the first entry that fails
	* the schema-level gate. Use for SQO payloads that carry multiple target
	* sections (e.g. sqo.section_tipo[]).
	*
	* Non-string entries are skipped silently to tolerate mixed arrays.
	*
	* @param array $ar_section_tipo - Flat array of section tipo strings.
	* @param int $required_level - Minimum level: 1=read, 2=write, 3=admin.
	* @param string $context = '' - Optional caller identifier for the exception.
	* @throws permission_exception - On the first section with insufficient access.
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
	* Iterates an array of locator objects (each expected to have a `section_tipo`
	* property) and gates each unique section_tipo it encounters. Already-seen
	* section tipos are skipped to avoid redundant checks.
	*
	* Designed for payloads that carry filter_by_locators arrays (e.g. relational
	* search inputs) where the caller needs to verify the user may read each
	* referenced section.
	*
	* @param array $filter_by_locators - Array of locator objects, each with a
	*                                    `section_tipo` string property.
	* @param int $required_level - Minimum level: 1=read, 2=write, 3=admin.
	* @param string $context = '' - Optional caller identifier for the exception.
	* @throws permission_exception - On the first section with insufficient access.
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
	* Section exemptions (always returns true regardless of project assignment):
	*   - DEDALO_SECTION_PROFILES_TIPO (dd234) — profile records are shared.
	*   - DEDALO_FILTER_SECTION_TIPO_DEFAULT — the default project/filter section.
	*   - Sections that have no component_filter child in their ontology.
	*
	* @param string $section_tipo - Tipo of the section owning the record.
	* @param int $section_id - Primary key of the record to check.
	* @param int|null $user_id = null - User to check; defaults to logged_user_id().
	* @return bool - true when the user may access the record, false otherwise.
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
	* @param string $section_tipo - Tipo of the section owning the record.
	* @param int $section_id - Primary key of the record to check.
	* @param string $context = '' - Caller name for the exception (typically __METHOD__).
	* @throws permission_exception - When user_can_access_record returns false.
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

	/**
	 * Caller context string set by the assert_* helper that threw this exception.
	 * Typically the fully-qualified method name (__METHOD__) of the API handler
	 * that performed the permission check. An empty string when the caller omitted it.
	 * @var string $api_context
	 */
	public string $api_context;

	/**
	 * @param string $message - Human-readable description of the permission failure.
	 * @param string $context - Optional caller identifier (typically __METHOD__).
	 */
	public function __construct(string $message, string $context = '') {
		parent::__construct($message);
		$this->api_context = $context;
	}

}//end class permission_exception
