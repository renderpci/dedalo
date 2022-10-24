<?php
/**
* FILTER CLASS
*
*
*/
abstract class filter {



	public static $user_authorized_projects_cache;
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
	* @return array|null $dato
	*/
	public static function get_user_projects(int $user_id) : ?array {

		// cache
			if (isset(filter::$user_projects_cache[$user_id])) {
				return filter::$user_projects_cache[$user_id];
			}

		$final_data = null;
		if ( !empty($user_id) || abs($user_id)>0 ) {
			$component_filter_master = component_common::get_instance(
				'component_filter_master',
				DEDALO_FILTER_MASTER_TIPO,
				$user_id,
				'list',
				DEDALO_DATA_NOLAN,
				DEDALO_SECTION_USERS_TIPO
			);
			$final_data = (array)$component_filter_master->get_dato();

			foreach ($final_data as $current_locator) {

				$children_data = component_relation_children::get_children(
					$current_locator->section_id,
					$current_locator->section_tipo,
					DEDALO_PROJECTS_CHILDREN_TIPO,
					$recursive=true,
					$is_recursion=false
				);

				foreach ($children_data as $child_locator) {
					$found = locator::in_array_locator($child_locator, $final_data, ['section_tipo','section_id']);

					if(!$found){
						$final_data[] = $child_locator;
					}
				}

			}
		}
		// cache
			filter::$user_projects_cache[$user_id] = $final_data;


		return $final_data;
	}//end get_user_projects



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
			$cache_key = $user_id .'_'. $from_component_tipo;
			if (isset(filter::$user_authorized_projects_cache[$cache_key])) {
				// debug_log(__METHOD__." Total time: ".exec_time_unit($start_time,'ms')." ms ---- CACHED", logger::DEBUG);
				return filter::$user_authorized_projects_cache[$cache_key];
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

		// projects_name_tipo. Get ts_map for locate name component (for future )
			$RecordObj_dd	= new RecordObj_dd($section_map);
			$properties		= $RecordObj_dd->get_properties();
			if (empty($properties)) {
				dump($properties, ' properties ++ '.to_string($section_map));
				throw new Exception("Error Processing Request. properties for section_map: $section_map is empty !", 1);
				// trigger_error("Error Processing Request. properties for section_map: $section_map is empty !");
			}
			$projects_name_tipo		= $properties->thesaurus->term; // dd156
			$projects_children_tipo	= $properties->thesaurus->children; // dd1594

		// filter by filter_master
			$is_global_admin = security::is_global_admin($user_id);
			$dato = [];
			if ($is_global_admin===true) {
				// bypass filter
				$filter = '';

				$search_query_object = json_decode('
					{
						"id": "get_ar_projects_for_current_section",
						"section_tipo": "'.$projects_section_tipo.'",
						"limit":0,
						"filter": {
							"$and": [
								'.$filter.'
							]
						}
					}
				');

				$search = search::get_instance($search_query_object);
				$result = $search->search();
				foreach ($result->ar_records as $row) {

					$locator = new locator();
						$locator->set_section_tipo($row->section_tipo);
						$locator->set_section_id($row->section_id);

					$dato[] = $locator;
				}

			}else{
				$dato	= filter::get_user_projects($user_id);
			}//end if ($is_global_admin===false)

		$ar_projects = [];
		$parent = null;
		foreach ($dato as $current_locator) {
			$model = RecordObj_dd::get_modelo_name_by_tipo($projects_name_tipo);
			$component_term = component_common::get_instance(
				$model, // string model
				$projects_name_tipo, // string tipo
				$current_locator->section_id, // string section_id
				'list', // string modo
				DEDALO_DATA_LANG, // string lang
				$current_locator->section_tipo // string section_tipo
			);

			$label = component_common::extract_component_dato_fallback(
				$component_term,
				DEDALO_DATA_LANG, // lang
				DEDALO_DATA_LANG_DEFAULT
			); // main_lang

			$ar_all_parents = component_relation_parent::get_parents_recursive($current_locator->section_id, $current_locator->section_tipo, $skip_root=true);

			foreach ($ar_all_parents as $current_parent) {

				$found = locator::in_array_locator($current_parent, $dato, ['section_tipo','section_id']);
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
				$element->locator	= $current_locator;
				$element->parent	= $parent;

			$ar_projects[] = $element;
		}

		// cache
			filter::$user_authorized_projects_cache[$cache_key] = $ar_projects;

		// debug
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Total time: ".exec_time_unit($start_time,'ms')." ms. ---- user_id: $user_id - from_component_tipo: $from_component_tipo", logger::DEBUG);
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

		$filter_user_records_by_id = array();

		if (defined('DEDALO_FILTER_USER_RECORDS_BY_ID') && DEDALO_FILTER_USER_RECORDS_BY_ID===true) {

			$modelo_name	= 'component_filter_records';
			$tipo			= DEDALO_USER_COMPONENT_FILTER_RECORDS_TIPO;
			$component		= component_common::get_instance(
				$modelo_name,
				$tipo,
				$user_id,
				'list',
				DEDALO_DATA_NOLAN,
				DEDALO_SECTION_USERS_TIPO
			);
			$filter_user_records_by_id = $component->get_dato();
		}

		return $filter_user_records_by_id;
	}//end get_filter_user_records_by_id



}//end class filter
