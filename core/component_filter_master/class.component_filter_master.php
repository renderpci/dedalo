<?php declare(strict_types=1);
/**
* CLASS COMPONENT_FILTER_MASTER
* Specialized variant of component_filter for managing user project assignments.
*
* Used exclusively in the User section (dd128) to define which projects a user
* has access to. Unlike component_filter which filters records by project,
* this component controls the user's project permissions themselves.
*
* Key features:
* - User project assignment retrieval via component_filter_master
* - Project authorization with hierarchical information, labels, and ordering
* - Multi-level caching (static and file-based) for performance
* - Cache management and clearing when project assignments change
* - Global admin vs regular user access patterns
*
* Static methods:
* - get_user_projects(): Returns all user active projects from user section data
* - get_user_authorized_projects(): Returns enriched project data with hierarchy
* - get_user_authorized_projects_cache_key(): Generates cache keys
* - get_projects_cache_name(): Returns cache file name
* - clean_cache(): Clears all project-related caches
*
* Key differences from component_filter:
* - Only used in User section for project assignment
* - Clears filter cache on every save to ensure permission changes take effect
* - Disables filter propagation (no cascading permission changes)
*
* Extends component_filter and overrides save() to reset user cache
* and propagate_filter() to prevent unnecessary processing.
*
* @package Dédalo
* @subpackage Core
*/
class component_filter_master extends component_filter {



	/**
	* Flat per-user cache of raw project locators returned by get_user_projects().
	* Keyed by user_id (int). Populated on first call; cleared by clean_cache().
	* Disabled (bypassed) when SHOW_DEVELOPER is true so developers always see
	* fresh data without restarting the PHP process.
	* @var array $user_projects_cache
	*/
	public static array $user_projects_cache = [];

	/**
	* Per-user cache of enriched project elements returned by get_user_authorized_projects().
	* Keyed by the string produced by get_user_authorized_projects_cache_key().
	* Note: as of current code, $use_cache is hardcoded to false inside
	* get_user_authorized_projects(), so this cache is never actually populated
	* at runtime. The infrastructure remains in place for a future re-enable.
	* @var array $user_authorized_projects_cache
	*/
	public static array $user_authorized_projects_cache = [];



	/**
	* GET_USER_AUTHORIZED_PROJECTS_CACHE_KEY
	* Generates a unique cache key for user authorized projects based on user_id and component_tipo.
	*
	* Used for both static cache array keys and file cache identification.
	*
	* @param int $user_id The user ID
	* @param string $component_tipo The tipo of the component requesting authorization
	* @return string $cache_key Formatted cache key string
	*
	* Sample:
	* ```php
	* $cache_key = component_filter_master::get_user_authorized_projects_cache_key(1, 'test52');
	* // Returns: 'user_authorized_projects_1_test52'
	* ```
	*/
	public static function get_user_authorized_projects_cache_key(int $user_id, string $component_tipo) : string {

		$cache_key = 'user_authorized_projects_' . $user_id .'_'. $component_tipo;

		return $cache_key;
	}//end get_user_authorized_projects_cache_key



	/**
	* GET_PROJECTS_CACHE_NAME
	* Returns the filename used for file-based project caching.
	*
	* This file is stored in the Dédalo cache directory and contains
	* serialized authorized project data for quick retrieval.
	*
	* @return string $cache_file_name The name of the cache file
	*
	* Sample:
	* ```php
	* $file_name = component_filter_master::get_projects_cache_name();
	* // Returns: 'cache_ar_projects.php'
	* ```
	*/
	public static function get_projects_cache_name() : string {
		return 'cache_ar_projects.php';
	}//end get_projects_cache_name



	/**
	* GET_USER_PROJECTS
	* Returns all user active projects from user section data via component_filter_master.
	*
	* Uses static caching for performance (disabled when SHOW_DEVELOPER is true).
	*
	* @param int $user_id The user ID to retrieve projects for
	* @return array $user_projects Array of locators representing authorized projects
	*
	* Sample:
	* ```php
	* $user_id = 1;
	* $projects = component_filter_master::get_user_projects($user_id);
	* foreach ($projects as $locator) {
	*     echo "Project: {$locator->section_tipo}-{$locator->section_id}\n";
	* }
	* ```
	*/
	public static function get_user_projects( int $user_id ) : array {

		// check user_id
		if (empty($user_id)) {
			debug_log(__METHOD__
				. " Invalid empty user id "
				. to_string($user_id)
				, logger::ERROR
			);
			return [];
		}

		// cache
		$use_cache = (!defined('SHOW_DEVELOPER') || SHOW_DEVELOPER !== true);
		if ($use_cache===true && isset(component_filter_master::$user_projects_cache[$user_id])) {
			return component_filter_master::$user_projects_cache[$user_id];
		}

		// filter_master. Get user section data about the authorized projects
		$component_filter_master = component_common::get_instance(
			'component_filter_master',
			DEDALO_FILTER_MASTER_TIPO,
			$user_id,
			'list',
			DEDALO_DATA_NOLAN,
			DEDALO_SECTION_USERS_TIPO
		);
		$user_projects = $component_filter_master->get_data() ?? [];

		// cache
		component_filter_master::$user_projects_cache[$user_id] = $user_projects;

		return $user_projects;
	}//end get_user_projects



	/**
	* GET_USER_AUTHORIZED_PROJECTS
	* Returns enriched project data for the given user, split by role.
	*
	* Global admins receive all projects found in the projects section (unlimited search).
	* Regular users receive only the projects stored in their component_filter_master field
	* (dd170), obtained via get_user_projects().
	*
	* Each returned element is an associative array with:
	* - 'label'   (string)        Human-readable project name resolved in the current
	*                             language with fallback to DEDALO_DATA_LANG_DEFAULT.
	* - 'locator' (locator)       Clone of the source locator (section_tipo + section_id).
	* - 'parent'  (locator|null)  Nearest ancestor project that is also in the user's
	*                             authorized set, or null if the project is a root.
	* - 'order'   (int)           Numeric sort value from component_number dd1631.
	*
	* The method resolves labels and ordering by instantiating per-project components
	* for the projects-name tipo (dd156) and the order tipo (dd1631). Model names are
	* looked up from the ontology to remain decoupled from hard-coded class strings,
	* except for the order tipo which is currently pinned (see inline flag).
	*
	* (!) Cache note: $use_cache is unconditionally set to false in this method.
	* Both the static and file-cache branches are present but never executed.
	* Re-enable by setting $use_cache = true (and verify clean_cache() covers all paths).
	*
	* @param int    $user_id             The user ID to retrieve projects for.
	* @param string $from_component_tipo The tipo of the calling component; used only
	*                                    for cache-key scoping — has no effect while
	*                                    $use_cache is false.
	* @return array $ar_projects         Array of enriched project elements as described above;
	*                                    empty array on ontology resolution failure.
	*
	* Sample:
	* ```php
	* $ar_projects = component_filter_master::get_user_authorized_projects(1, 'test52');
	* foreach ($ar_projects as $project) {
	*     echo $project['label'] . " ({$project['locator']->section_id})\n";
	*     if ($project['parent']) {
	*         echo "  Parent: {$project['parent']->section_id}\n";
	*     }
	* }
	* ```
	*/
	public static function get_user_authorized_projects(int $user_id, string $from_component_tipo) : array {
		$start_time = start_time();

		// cache
		// (!) $use_cache is intentionally hardcoded to false: caching is disabled
		// until a reliable invalidation strategy is confirmed. The cache_key variable
		// and both the static/file cache branches below are kept as infrastructure
		// for a future re-enable. Do not remove them.
		$use_cache = false;
		if ($use_cache===true) {

			// static cache
			$cache_key = component_filter_master::get_user_authorized_projects_cache_key($user_id, $from_component_tipo);
			if (isset(component_filter_master::$user_authorized_projects_cache[$cache_key])) {
				return component_filter_master::$user_authorized_projects_cache[$cache_key];
			}

			// file cache
			$ar_projects = dd_cache::cache_from_file((object)[
				'file_name'	=> component_filter_master::get_projects_cache_name()
			]);
			if (!empty($ar_projects)) {

				// set static cache
				component_filter_master::$user_authorized_projects_cache[$cache_key] = $ar_projects;

				return $ar_projects;
			}
		}

		// projects_section_tipo
		// This is the section that owns project records (typically dd153 = DEDALO_SECTION_PROJECTS_TIPO).
		$projects_section_tipo = DEDALO_FILTER_SECTION_TIPO_DEFAULT;

		// section map (expected 'dd267')
		// Resolve the section_map child of the projects section to locate the
		// language/name component tipo. The resolved value must equal DEDALO_COMPONENT_PROJECT_LANGS_TIPO
		// (dd267); a mismatch means the ontology is misconfigured.
			$ar_section_map = ontology_node::get_ar_tipo_by_model_and_relation(
				$projects_section_tipo, // tipo
				'section_map', // model name
				'children', // relation_type
				true // search_exact
			);
			$section_map = $ar_section_map[0] ?? null; // expected 'dd267'
			if ($section_map !== DEDALO_COMPONENT_PROJECT_LANGS_TIPO) {
				debug_log(__METHOD__." Expected section_map value was 'dd267' and received value is: ".to_string($section_map), logger::ERROR);
				return [];
			}

		// projects_name_tipo. Get ts_map for locate name component (for future use)
		// The thesaurus->term property of the section_map node holds the tipo of the
		// component that stores the project's human-readable name (expected: dd156).
			$ontology_node	= ontology_node::get_instance($section_map);
			$properties		= $ontology_node->get_properties();
			if (empty($properties)) {
				debug_log(__METHOD__
					." Error Processing Request. properties for section_map: '$section_map' is EMPTY ! " . PHP_EOL
					.' properties: ' . to_string($properties)
					, logger::ERROR
				);
				return [];
			}
			if (!isset($properties->thesaurus) || !isset($properties->thesaurus->term)) {
				debug_log(__METHOD__
					." Error Processing Request. properties->thesaurus->term for section_map: '$section_map' is not set ! " . PHP_EOL
					.' properties: ' . to_string($properties)
					, logger::ERROR
				);
				return [];
			}
			$projects_name_tipo	= $properties->thesaurus->term ?? null; // dd156
			if ($projects_name_tipo !== DEDALO_PROJECTS_NAME_TIPO) {
				// Log a warning but continue; the resolved tipo may still work.
				debug_log(__METHOD__
					." Expected projects_name_tipo value was '".DEDALO_PROJECTS_NAME_TIPO."' and received value is: " . PHP_EOL
					.' projects_name_tipo: ' . to_string($projects_name_tipo)
					, logger::ERROR
				);
			}

		// data. Array of locators
		// Global admins see every project; regular users see only their assigned projects.
			$is_global_admin = security::is_global_admin($user_id);
			if ($is_global_admin===true) {

				// global admin user case

				// search all without limit
				$search_query_object = new search_query_object();
					$search_query_object->set_section_tipo([$projects_section_tipo]);
					$search_query_object->set_limit(0);

				$search = search::get_instance($search_query_object);
				$db_result = $search->search();
				$data = [];
				foreach ($db_result as $row) {

					$locator = new locator();
						$locator->set_section_tipo($row->section_tipo);
						$locator->set_section_id($row->section_id);

					$data[] = $locator;
				}
			}else{

				// regular user case

				// get current user assigned projects
				$data = component_filter_master::get_user_projects($user_id);
			}

		// resolve label and parent
			// Cache model lookups outside loop for performance
			$projects_model = ontology_node::get_model_by_tipo($projects_name_tipo);
			// (!) $order_model_tipo is hardcoded to 'dd1631' (component_number 'Order').
			// Unlike $projects_name_tipo, this is not resolved from the ontology at runtime.
			// If the ontology tipo for the order component changes, this constant must be updated manually.
			$order_model_tipo = 'dd1631'; // component_number 'Order'
			$order_model = ontology_node::get_model_by_tipo($order_model_tipo, true);

			$ar_projects = [];
			foreach ($data as $current_locator) {

				// name
				// Instantiate the name component for this project record and resolve a
				// displayable label with language fallback. Returns empty string on failure.
				$parent			= null;
				$component_term	= component_common::get_instance(
					$projects_model, // string model
					$projects_name_tipo, // string tipo
					$current_locator->section_id, // string section_id
					'list', // string mode
					DEDALO_DATA_LANG, // string lang
					$current_locator->section_tipo // string section_tipo
				);
				$term_data = $component_term->get_data();
				$label = component_string_common::get_value_with_fallback_from_data(
					$term_data,
					false,
					DEDALO_DATA_LANG_DEFAULT,
					DEDALO_DATA_LANG
				);

				// order
				$order_component	= component_common::get_instance(
					$order_model, // string model
					$order_model_tipo, // string tipo
					$current_locator->section_id, // string section_id
					'list', // string mode
					DEDALO_DATA_NOLAN, // string lang
					$current_locator->section_tipo // string section_tipo
				);
				$order_data		= $order_component->get_data();
				$order_value	= (int)($order_data[0]->value ?? 0);

				// parent resolution
				// Walk all recursive ancestors of this project and pick the nearest one
				// that also appears in the user's authorized set. This allows the UI to
				// render a tree structure limited to what the user can actually see.
				$ar_all_parents = component_relation_parent::get_parents_recursive(
					$current_locator->section_id,
					$current_locator->section_tipo
				);
				foreach ($ar_all_parents as $current_parent) {

					$found = locator::in_array_locator(
						$current_parent,
						$data,
						['section_tipo','section_id']
					);
					if ( $found ) {
						$locator = new locator();
							$locator->set_section_tipo($current_parent->section_tipo);
							$locator->set_section_id($current_parent->section_id);

						$parent = $locator;
						break;
					}
				}

				$element = [
					'label' => $label,
					'locator' => clone $current_locator, // Use clone instead of JSON encode/decode
					'parent' => $parent,
					'order' => $order_value
				];

				$ar_projects[] = $element;
			}//end foreach ($data as $current_locator)

		// cache
		if ($use_cache===true) {

			// static cache
			component_filter_master::$user_authorized_projects_cache[$cache_key] = $ar_projects;

			// file cache write
			dd_cache::cache_to_file((object)[
				'data'		=> $ar_projects,
				'file_name'	=> component_filter_master::get_projects_cache_name()
			]);
		}

		// debug
		if(SHOW_DEBUG===true) {
			debug_log(__METHOD__
				.' Total time on calculate user_authorized_projects: '
				.exec_time_unit($start_time,'ms').' ms. ---- user_id:'.(string)$user_id. PHP_EOL
				.' from_component_tipo:'.(string)$from_component_tipo
				, logger::DEBUG
			);
		}

		return $ar_projects;
	}//end get_user_authorized_projects



	/**
	* CLEAN_CACHE
	* Resets all caches related to user projects across all cache levels.
	*
	* Clears:
	* - Static property $user_projects_cache
	* - Static property $user_authorized_projects_cache
	* - File cache via dd_cache::delete_cache_files()
	*
	* Call this method when project assignments change to ensure fresh data.
	*
	* @param int $user_id The user ID whose caches should be cleared
	* @param string $component_tipo The component tipo for cache key identification
	* @return bool true Always returns true
	*
	* Sample:
	* ```php
	* // After modifying user project assignments
	* component_filter_master::clean_cache($user_id, 'component_filter_master');
	* ```
	*/
	public static function clean_cache(int $user_id, string $component_tipo) : bool {

		// user_projects_cache
		if( isset(component_filter_master::$user_projects_cache[$user_id]) ) {
			unset(component_filter_master::$user_projects_cache[$user_id]);
		}

		// user_authorized_projects_cache
		$cache_key = component_filter_master::get_user_authorized_projects_cache_key($user_id, $component_tipo);
		// static cache
		if (isset(component_filter_master::$user_authorized_projects_cache[$cache_key])) {
			unset(component_filter_master::$user_authorized_projects_cache[$cache_key]);
		}

		// file cache
		$file_name = component_filter_master::get_projects_cache_name();
		dd_cache::delete_cache_files(
			[$file_name]
		);

		debug_log(__METHOD__
			. " Cleared filter caches " . PHP_EOL
			. ' user_id: ' . $user_id . PHP_EOL
			. ' cache_key: ' . $cache_key . PHP_EOL
			, logger::DEBUG
		);


		return true;
	}//end clean_cache



	/**
	* SAVE
	* Overrides component_filter::save() to invalidate all project caches on every write.
	*
	* Because this component stores user-project permission assignments, any change must
	* immediately invalidate the authorization caches so that subsequent requests reflect
	* the new state. Cache invalidation is performed for the currently logged-in user
	* before delegating to the parent save routine.
	*
	* (!) Cache clearing uses logged_user_id() (the session user), not the section_id of
	* the user record being saved. In multi-user admin scenarios where one admin edits
	* another user's projects, the cache for the edited user is NOT cleared here — only
	* the admin's own cache is cleared. This is a known limitation.
	*
	* @return bool true on successful save, false on failure (mirrors parent::save()).
	*/
	public function save() : bool {

		// Reset cache on every save action. IMPORTANT !
		self::clean_cache(
			logged_user_id(),  // user id. Current logged user id
			$this->tipo // DEDALO_FILTER_MASTER_TIPO dd170
		);

		return parent::save();
	}//end save



	/**
	* PROPAGATE_FILTER
	* Overrides component_filter::propagate_filter() as a deliberate no-op.
	*
	* component_filter uses propagate_filter() to cascade project assignments down to
	* child portal components. For component_filter_master — which manages user-level
	* project permissions rather than record-level project membership — propagation
	* is not applicable and must be suppressed to avoid expensive unnecessary processing.
	*
	* The parent class body is commented-out there and was never ported to v7; this
	* override exists to capture any future call and return immediately.
	*
	* @return bool Always returns true.
	*/
	public function propagate_filter() : bool {

		return true;
	}//end propagate_filter



}//end class component_filter_master
