<?php
/**
* FILTER CLASS
*
*
*/
abstract class filter {



	/**
	* GET_PROFILES_FOR_AREAS
	* @param array $ar_area_tipo
	* @return array $ar_profile_id
	*/
	public static function get_profiles_for_areas($ar_area_tipo) {

		$ar_filter = [];
		foreach ((array)$ar_area_tipo as $area_tipo) {
			$profile_sql = '';

			# old format
			#$profile_sql.= "\n datos#>'{components, ".DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO.", dato, ". DEDALO_DATA_NOLAN ."}' @>'{\"$area_tipo\":3}' ";
			#$profile_sql.= "OR datos#>'{components, ".DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO.", dato, ". DEDALO_DATA_NOLAN ."}' @>'{\"$area_tipo\":2}' ";

			// Reference:
			// {
			//	"tipo": "ich1",
			//	"type": "area",
			//	"value": 3,
			//	"parent": "ich1"
			// }

			$profile_sql.= 'datos#>\'{components,'.DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO.',dato,'.DEDALO_DATA_NOLAN.'}\'@>\'[{"tipo":"'.$area_tipo.'","value":3}]\'';
			$profile_sql.= ' OR ';
			$profile_sql.= 'datos#>\'{components,'.DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO.',dato,'.DEDALO_DATA_NOLAN.'}\'@>\'[{"tipo":"'.$area_tipo.'","value":2}]\'';

			$ar_filter[] = '('.$profile_sql.')';
		}
		$sql_filter = implode(' OR ', $ar_filter);

		#
		# SEARCH PROFILES WITH CURRENT USER AREAS
		$profile_sql = 'SELECT section_id FROM "matrix_profiles" WHERE ' . $sql_filter;
		$result = JSON_RecordObj_matrix::search_free($profile_sql);
		$ar_profile_id=array();
		while ($rows = pg_fetch_assoc($result)) {
			$section_id 	 = $rows['section_id'];
			$ar_profile_id[] = $section_id;
		}

		return (array)$ar_profile_id;
	}//end get_profiles_for_areas



	/**
	* GET_USER_PROJECTS
	* Revisada 19-08-2014
	* Como tarda poco, unos 0.008 secs, no hacemos cache del dato
	*/
	public static function get_user_projects( $user_id ) {

		static $user_projects_cache;
		if (isset($user_projects_cache[$user_id])) {
			return $user_projects_cache[$user_id];
		}

		$dato = null;
		if ( !empty($user_id) || abs($user_id)>0 ) {
			$component_filter_master 	= component_common::get_instance('component_filter_master',
																		 DEDALO_FILTER_MASTER_TIPO,
																		 $user_id,
																		 'list',
																		 DEDALO_DATA_NOLAN,
																		 DEDALO_SECTION_USERS_TIPO);
			$dato = (array)$component_filter_master->get_dato();
		}

		$user_projects_cache[$user_id] = $dato;

		return $dato;
	}//end get_user_projects



	/**
	* GET_USER_AUTHORIZED_PROJECTS
	* Get all projects filtered by user authorized projects
	* Works like ar_list_of_values but filtered by user authorized projects
	* @return array $ar_projects
	*/
	public static function get_user_authorized_projects( $user_id, $from_component_tipo ) {
		$start_time=microtime(1);

		// projects_section_tipo
			$projects_section_tipo = DEDALO_FILTER_SECTION_TIPO_DEFAULT; // Default is Projects but it can be another

		// section map
			$ar_section_map = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($projects_section_tipo, 'section_map', 'children', true);
			$section_map 	= reset($ar_section_map);

		// projects_name_tipo. Get ts_map for locate name component (for future )
			$RecordObj_dd = new RecordObj_dd($section_map);
			$properties  = $RecordObj_dd->get_properties();
			if (!$properties) {
				dump($properties, ' properties ++ '.to_string($section_map));
				throw new Exception("Error Processing Request. properties for section_map: $section_map is empty !", 1);
			}
			$projects_name_tipo = $properties->thesaurus->term;

		// typology tipo
			$typology_tipo 		= $properties->thesaurus->typology ?? 'dd157';


		// filter by filter_master
			$user_id 		 = navigator::get_user_id();
			$is_global_admin = security::is_global_admin($user_id);
			if ($is_global_admin===true) {
				// bypass filter
				$filter = '';
			}else{
				// filter_master data builds filter ooptions
				$component_filter_master = component_common::get_instance('component_filter_master',
																		  DEDALO_FILTER_MASTER_TIPO,
																		  $user_id,
																		  'list',
																		  DEDALO_DATA_NOLAN,
																		  DEDALO_SECTION_USERS_TIPO);
				$dato  = (array)$component_filter_master->get_dato();
				$ar_id = array_map(function($locator){
					return (int)$locator->section_id;
				}, $dato);

				$filter = '{
			        "q": "'.json_encode($ar_id).'",
			        "path": [
			          {
			            "section_tipo": "'.$projects_section_tipo.'",
			            "component_tipo": "section_id",
			            "modelo": "component_section_id",
			            "name": "section_id"
			          }
			        ]
			      }';
			}//end if ($is_global_admin===false)

		// search_query_object
			$search_query_object = json_decode('
				{
				  "id": "get_ar_projects_for_current_section",
				  "section_tipo": "'.$projects_section_tipo.'",
				  "limit":0,
				  "filter": {
				    "$and": [
				      '.$filter.'
				    ]
				  },
				  "select": [
				    {
				      "path": [
				        {
				          "section_tipo": "'.$projects_section_tipo.'",
				          "component_tipo": "'.$projects_name_tipo.'",
				          "modelo": "'.RecordObj_dd::get_modelo_name_by_tipo($projects_name_tipo,true).'",
				          "name": "Project name",
				          "lang": "all"
				        }
				      ]
				    },
				     {
				      "path": [
				        {
				          "section_tipo": "'.$projects_section_tipo.'",
				          "component_tipo": "'.$typology_tipo.'",
				          "modelo": "'.RecordObj_dd::get_modelo_name_by_tipo($typology_tipo,true).'",
				          "name": "Project typology",
				          "lang": "all"
				        }
				      ]
				    }
				  ]
				}
			');
			#dump( json_encode($search_query_object), ' search_query_object ++ '.to_string());

		$search = search::get_instance($search_query_object);
		$result = $search->search();

		$ar_projects = [];
		foreach ($result->ar_records as $key => $row) {
			#dump($row->{$projects_name_tipo}, ' row ++ '.to_string());

			$label = !empty($row->{$projects_name_tipo})
						? component_common::get_value_with_fallback_from_dato_full( $row->{$projects_name_tipo}, true)
						: '';

			$locator = new locator();
				$locator->set_section_tipo($row->section_tipo);
				$locator->set_section_id($row->section_id);
				$locator->set_from_component_tipo($from_component_tipo);
				$locator->set_type(DEDALO_RELATION_TYPE_FILTER);

			$typology = $row->{$typology_tipo} ?? null;

			$element = new stdClass();
				$element->label 	= $label;
				$element->locator 	= $locator;
				$element->typology 	= $typology;

			$ar_projects[] = $element;
		}

		if(SHOW_DEBUG===true) {
			debug_log(__METHOD__." Total time: ".exec_time_unit($start_time,'ms')." ms", logger::DEBUG);
		}


		return $ar_projects;
	}//end get_user_authorized_projects



	/**
	* GET_FILTER_USER_RECORDS_BY_ID
	* Filter user access to section records by section_id
	* In process.... (need specific component for manage)
	* @return string $sql_filtro
	*/
	public static function get_filter_user_records_by_id( $user_id ) {

		$filter_user_records_by_id = array();

		if (defined('DEDALO_FILTER_USER_RECORDS_BY_ID') && DEDALO_FILTER_USER_RECORDS_BY_ID===true) {

			$modelo_name 	= 'component_filter_records';
			$tipo 			= DEDALO_USER_COMPONENT_FILTER_RECORDS_TIPO;
			$component 		= component_common::get_instance($modelo_name,
															 $tipo,
															 $user_id,
															 'list',
															 DEDALO_DATA_NOLAN,
															 DEDALO_SECTION_USERS_TIPO);
			$filter_user_records_by_id = $component->get_dato();
		}

		return (array)$filter_user_records_by_id;
	}//end get_filter_user_records_by_id




}
?>
