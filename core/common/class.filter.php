<?php declare(strict_types=1);
/**
* FILTER CLASS
*
*/
abstract class filter {



	public static $user_authorized_projects_cache = [];
	public static $user_projects_cache;



	/**
	* GET_PROFILES_FOR_AREAS
	* @param array $ar_area_tipo
	* @return array $ar_profile_id
	*/
	public static function get_profiles_for_areas(array $ar_area_tipo) : array {

		// short vars
			$tipo = DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO;
			$lang = DEDALO_DATA_NOLAN;

		// sql_filter
			$ar_filter = [];
			foreach ($ar_area_tipo as $area_tipo) {

				// Reference:
				// {
				//	"tipo": "ich70",
				//	"value": 2,
				//	"section_tipo": "ich1"
				// }

				$entences_sql = [];

				// value 3 try
				// $entences_sql[] = 'datos#>\'{components,'.$tipo.',dato,'.$lang.'}\'@>\'[[{"tipo":"'.$area_tipo.'","value":3}]]\'';

				// value 2 try
				// $entences_sql[] = 'datos#>\'{components,'.$tipo.',dato,'.$lang.'}\'@>\'[[{"tipo":"'.$area_tipo.'","value":2}]]\'';

				// new v6 data format
				$entences_sql[] = 'datos#>\'{components,'.$tipo.',dato,'.$lang.'}\'@>\'[{"tipo":"'.$area_tipo.'","value":2}]\'';

				$ar_filter[] = '('. implode(' OR ', $entences_sql) .')';
			}
			$sql_filter = implode(' OR ', $ar_filter);

		// search profiles with current user areas
			$profile_sql	= 'SELECT section_id FROM "matrix_profiles" WHERE ' . $sql_filter;
			$result			= JSON_RecordObj_matrix::search_free($profile_sql);

		// ar_profile_id
			$ar_profile_id = [];
			while ($row = pg_fetch_assoc($result)) {
				$ar_profile_id[] = $row['section_id'];
			}


		return $ar_profile_id;
	}//end get_profiles_for_areas



	/**
	* GET_USER_PROJECTS
	* Return all user active projects from user section data (component_filter_master)
	* @param int $user_id
	* @return array $user_projects
	*/
	public static function get_user_projects(int $user_id) : array {

		// check user_id
			if (empty($user_id)) {
				debug_log(__METHOD__
					. " Invalid empty user id "
					. to_string($user_id)
					, logger::ERROR
				);
				// throw new Exception("Error Processing Request. Invalid user id", 1);
				return [];
			}

		$user_projects = [];
		if ( abs($user_id)>0 ) {

			// cache
				$use_cache = (SHOW_DEVELOPER!==true);
				if ($use_cache===true && isset(filter::$user_projects_cache[$user_id])) {
					return filter::$user_projects_cache[$user_id];
				}

			// filter_master
				$component_filter_master = component_common::get_instance(
					'component_filter_master',
					DEDALO_FILTER_MASTER_TIPO,
					$user_id,
					'list',
					DEDALO_DATA_NOLAN,
					DEDALO_SECTION_USERS_TIPO
				);
				$user_projects = $component_filter_master->get_dato();

			// children
				foreach ($user_projects as $current_locator) {

					$children_data = component_relation_children::get_children(
						$current_locator->section_id,
						$current_locator->section_tipo,
						DEDALO_PROJECTS_CHILDREN_TIPO,
						true, // bool recursive
						false // bool is_recursion
					);

					foreach ($children_data as $child_locator) {
						// add if not already added
						$found = locator::in_array_locator(
							$child_locator,
							$user_projects,
							['section_tipo','section_id','from_component_tipo']
						);
						if(!empty($found)) {
							$user_projects[] = $child_locator;
						}
					}
				}

			// cache
				filter::$user_projects_cache[$user_id] = $user_projects;
		}


		return $user_projects;
	}//end get_user_projects



	/**
	* GET_USER_AUTHORIZED_PROJECTS_CACHE_KEY
	* @param int $user_id
	* @param string $component_tipo
	* @return string $cache_key
	*/
	public static function get_user_authorized_projects_cache_key(int $user_id, string $component_tipo) : string {

		$cache_key = 'user_authorized_projects_' . $user_id .'_'. $component_tipo;

		return $cache_key;
	}//end get_user_authorized_projects_cache_key



	/**
	* CLEAN_CACHE
	* @param int $user_id
	* @param string $component_tipo
	* @return bool
	*/
	public static function clean_cache(int $user_id, string $component_tipo) : bool {

		// user_projects_cache
		if( isset(filter::$user_projects_cache[$user_id]) ) {
			unset(filter::$user_projects_cache[$user_id]);
		}

		// user_authorized_projects_cache
			$cache_key = filter::get_user_authorized_projects_cache_key($user_id, $component_tipo);
		// static cache
			if (isset(filter::$user_authorized_projects_cache[$cache_key])) {
				unset(filter::$user_authorized_projects_cache[$cache_key]);
			}
		// session cache
			// if (isset($_SESSION['dedalo']['config'][$cache_key])) {
			// 	unset($_SESSION['dedalo']['config'][$cache_key]);
			// }
		// file cache
			$file_name = 'cache_ar_projects.json';
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
	* GET_USER_AUTHORIZED_PROJECTS
	* Get all projects filtered by user authorized projects
	* Works like ar_list_of_values but filtered by user authorized projects
	* @param int $user_id
	* @param string $from_component_tipo
	* @return array $ar_projects
	*/
	public static function get_user_authorized_projects(int $user_id, string $from_component_tipo) : array {
		$start_time = start_time();

		// cache
			$use_cache = true; // (SHOW_DEVELOPER!==true);
			if ($use_cache===true) {

				// $cache_key = 'user_authorized_projects_' . $user_id .'_'. $from_component_tipo;
					$cache_key = filter::get_user_authorized_projects_cache_key($user_id, $from_component_tipo);
				// static cache
					if (isset(filter::$user_authorized_projects_cache[$cache_key])) {
						return filter::$user_authorized_projects_cache[$cache_key];
					}
				// session cache
					// if (isset($_SESSION['dedalo']['config'][$cache_key])) {
					// 	// set value
					// 	filter::$user_authorized_projects_cache[$cache_key] = $_SESSION['dedalo']['config'][$cache_key];
					// 	return $_SESSION['dedalo']['config'][$cache_key];
					// }
				// file cache
					$file_cache = dd_cache::cache_from_file((object)[
						'file_name'	=> 'cache_ar_projects.json'
					]);
					if (!empty($file_cache)) {
						$ar_projects = json_handler::decode($file_cache);
						// set value
						filter::$user_authorized_projects_cache[$cache_key] = $ar_projects;
						return $ar_projects;
					}
			}

		// projects_section_tipo
			$projects_section_tipo = DEDALO_FILTER_SECTION_TIPO_DEFAULT; // Default is Projects but it can be another

		// section map
			$ar_section_map = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
				$projects_section_tipo, // tipo
				'section_map', // model name
				'children', // relation_type
				true // search_exact
			);
			$section_map = reset($ar_section_map); // expected 'dd267'
			if ($section_map!=='dd267') {
				debug_log(__METHOD__." Expected section_map value was 'dd267' and received value is: ".to_string($section_map), logger::ERROR);
			}

		// projects_name_tipo. Get ts_map for locate name component (for future )
			$RecordObj_dd	= new RecordObj_dd($section_map);
			$properties		= $RecordObj_dd->get_properties();
			if (empty($properties)) {
				dump($properties, ' properties ++ '.to_string($section_map));
				// throw new Exception("Error Processing Request. properties for section_map: $section_map is empty !", 1);
				debug_log(__METHOD__." Error Processing Request. properties for section_map: $section_map is EMPTY ! ".to_string($properties), logger::ERROR);
				return [];
			}
			$projects_name_tipo	= $properties->thesaurus->term; // dd156
			if ($projects_name_tipo!=='dd156') {
				debug_log(__METHOD__." Expected projects_name_tipo value was 'dd156' and received value is: ".to_string($projects_name_tipo), logger::ERROR);
			}

		// dato. Array of locators
			$is_global_admin = security::is_global_admin($user_id);
			if ($is_global_admin===true) {

				// global admin user case

				// search all without limit
				$search_query_object = json_decode('
					{
						"section_tipo": "'.$projects_section_tipo.'",
						"limit": 0,
						"filter": ""
					}
				');

				$search = search::get_instance($search_query_object);
				$result = $search->search();
				$dato = [];
				foreach ($result->ar_records as $row) {

					$locator = new locator();
						$locator->set_section_tipo($row->section_tipo);
						$locator->set_section_id($row->section_id);

					$dato[] = $locator;
				}
			}else{

				// regular user case

				// get current user assigned projects
				$dato = filter::get_user_projects($user_id);
			}//end if ($is_global_admin===false)

		// resolve label and parent
			$ar_projects = [];
			foreach ($dato as $current_locator) {

				$parent			= null;
				$model			= RecordObj_dd::get_modelo_name_by_tipo($projects_name_tipo);
				$component_term	= component_common::get_instance(
					$model, // string model
					$projects_name_tipo, // string tipo
					$current_locator->section_id, // string section_id
					'list', // string mode
					DEDALO_DATA_LANG, // string lang
					$current_locator->section_tipo // string section_tipo
				);

				$label = component_common::extract_component_dato_fallback(
					$component_term,
					DEDALO_DATA_LANG, // lang
					DEDALO_DATA_LANG_DEFAULT
				); // main_lang

				$ar_all_parents = component_relation_parent::get_parents_recursive(
					$current_locator->section_id,
					$current_locator->section_tipo,
					(object)[
						'skip_root' => true
					]
				);
				foreach ($ar_all_parents as $current_parent) {

					$found = locator::in_array_locator(
						$current_parent,
						$dato,
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

				$element = new stdClass();
					$element->label		= reset($label);
					$element->locator	= json_decode( json_encode($current_locator) ); // converted to std class to allow session cache
					$element->parent	= $parent;

				$ar_projects[] = $element;
			}//end foreach ($dato as $current_locator)

		// cache
			if ($use_cache===true) {
				// static cache
					filter::$user_authorized_projects_cache[$cache_key] = $ar_projects;
				// session cache
					// $_SESSION['dedalo']['config'][$cache_key] = $ar_projects;
				// file cache
					dd_cache::cache_to_file((object)[
						'data'		=> $ar_projects,
						'file_name'	=> 'cache_ar_projects.json'
					]);
			}

		// debug
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__
					." Total time on calculate user_authorized_projects: "
					.exec_time_unit($start_time,'ms')." ms. ---- user_id: $user_id " . PHP_EOL
					." from_component_tipo: $from_component_tipo"
					, logger::DEBUG
				);
			}


		return $ar_projects;
	}//end get_user_authorized_projects



	/**
	* GET_FILTER_USER_RECORDS_BY_ID
	* Filter user access to section records by section_id
	* In process.... (need specific component for manage)
	* @param int $user_id
	* @return array $filter_user_records_by_id
	*/
	public static function get_filter_user_records_by_id(int $user_id) : array {

		$filter_user_records_by_id = [];

		if (defined('DEDALO_FILTER_USER_RECORDS_BY_ID') && DEDALO_FILTER_USER_RECORDS_BY_ID===true) {

			$model_name	= 'component_filter_records';
			$tipo		= DEDALO_USER_COMPONENT_FILTER_RECORDS_TIPO;
			$component	= component_common::get_instance(
				$model_name,
				$tipo,
				$user_id,
				'list',
				DEDALO_DATA_NOLAN,
				DEDALO_SECTION_USERS_TIPO
			);
			$filter_user_records_by_id = $component->get_dato() ?? [];

		}

		return $filter_user_records_by_id;
	}//end get_filter_user_records_by_id



}//end class filter
