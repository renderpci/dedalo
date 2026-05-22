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



	public static array $user_projects_cache = [];
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
	* Returns enriched project data filtered by user authorized projects.
	*
	* Similar to ar_list_of_values but includes hierarchical information, labels,
	* and ordering. Returns different data sets for global admins (all projects)
	* vs regular users (assigned projects only).
	*
	* Each returned element contains:
	* - label: Project name in current language
	* - locator: stdClass with section_tipo and section_id
	* - parent: Parent project locator or null
	* - order: Numeric sort value
	*
	* @param int $user_id The user ID to retrieve projects for
	* @param string $from_component_tipo The tipo of component requesting (for cache key)
	* @return array $ar_projects Array of project elements with metadata
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
		$projects_section_tipo = DEDALO_FILTER_SECTION_TIPO_DEFAULT;

		// section map (expected 'dd267')
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
				debug_log(__METHOD__
					." Expected projects_name_tipo value was '".DEDALO_PROJECTS_NAME_TIPO."' and received value is: " . PHP_EOL
					.' projects_name_tipo: ' . to_string($projects_name_tipo)
					, logger::ERROR
				);
			}

		// data. Array of locators
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
			$order_model_tipo = 'dd1631'; // component_number 'Order'
			$order_model = ontology_node::get_model_by_tipo($order_model_tipo, true);

			$ar_projects = [];
			foreach ($data as $current_locator) {

				// name
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
	* Overwrite component_filter method.
	* @return bool
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
	* Overwrite only to catch calls to parent method.
	* @return bool
	*/
	public function propagate_filter() : bool {

		return true;
	}//end propagate_filter



}//end class component_filter_master
