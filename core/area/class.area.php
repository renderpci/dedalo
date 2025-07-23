<?php declare(strict_types=1);
/**
* AREA
*
*/
class area extends area_common  {



	static $ar_ts_children_all_areas_hierarchized;

	// CHILDREN AREAS CRITERION
	static $ar_children_include_model_name	= array('area','section','section_tool');
	static $ar_children_exclude_modelo_name	= array('login','tools','section_list','filter');



	/**
	* GET_IDENTIFIER
	* Compound a chained plain flat identifier string for use as media component name, etc..
	* @return string $identifier
	*  like 'dd42_dd207_1'
	*/
	public function get_identifier() : string {

		if ( empty($this->get_tipo() ) ) {
			throw new Exception("Error Processing Request. empty tipo", 1);
		}

		$identifier = $this->tipo;

		return $identifier;
	}//end get_identifier



	/**
	* GET AREAS RECURSIVE IN JSON FORMAT OF ALL MAJOR AREAS
	* Iterate all major existing area types (area_root,area_resource,area_admin, ...)
	* and get all tipos of every one mixed in one full ontology JSON array
	* Used in menu (excluding config_areas->areas_deny) and security access (full view)
	* @see menu, component_security_access
	* @return array $areas
	*/
	public static function get_areas() : array {

		if(SHOW_DEBUG===true) {
			$start_time = start_time();
		}

		// get the config_areas file to allow and deny some specific areas defined by installation.
			$config_areas = self::get_config_areas();

		// root_areas
			$ar_root_areas		= [];
			$ar_root_areas[]	= RecordObj_dd::get_ar_terminoID_by_modelo_name('area_root')[0];
			$ar_root_areas[]	= RecordObj_dd::get_ar_terminoID_by_modelo_name('area_activity')[0];
			$ar_root_areas[]	= RecordObj_dd::get_ar_terminoID_by_modelo_name('area_resource')[0];
			$ar_root_areas[]	= RecordObj_dd::get_ar_terminoID_by_modelo_name('area_tool')[0];
			$ar_root_areas[]	= RecordObj_dd::get_ar_terminoID_by_modelo_name('area_thesaurus')[0];

			// area_graph. check (if user do not have the Ontology updated)
			$area_graph = RecordObj_dd::get_ar_terminoID_by_modelo_name('area_graph');
			if (isset($area_graph[0])) {
				$ar_root_areas[] = $area_graph[0];
			}else{
				debug_log(__METHOD__
					. " WARNING. Model 'area_graph' is not defined! Update your Ontology ASAP "
					, logger::WARNING
				);
			}
			$ar_root_areas[] = RecordObj_dd::get_ar_terminoID_by_modelo_name('area_admin')[0];

			// area_maintenance. Temporal check (if user do not have the Ontology updated, error is given here)
			$area_maintenance = RecordObj_dd::get_ar_terminoID_by_modelo_name('area_maintenance');
			if (isset($area_maintenance[0])) {
				$ar_root_areas[] = $area_maintenance[0]; // dd88
			}else{
				debug_log(__METHOD__
					. " WARNING. Model 'area_maintenance' is not defined! Update your Ontology ASAP " . PHP_EOL
					. ' Fixed resolution is returned to allow all works temporally'
					, logger::ERROR
				);
				if (!defined('DEDALO_AREA_MAINTENANCE_TIPO')) {
					define('DEDALO_AREA_MAINTENANCE_TIPO', 'dd88');
				}
				$ar_root_areas[] = DEDALO_AREA_MAINTENANCE_TIPO; // dd88
			}

			// area_development
			$ar_root_areas[] = RecordObj_dd::get_ar_terminoID_by_modelo_name('area_development')[0];

			// area_ontology. check (if user do not have the Ontology updated)
			$area_ontology = RecordObj_dd::get_ar_terminoID_by_modelo_name('area_ontology');
			if (isset($area_ontology[0])) {
				$ar_root_areas[] = $area_ontology[0];
			}else{
				debug_log(__METHOD__
					. " WARNING. Model 'area_ontology' is not defined! Update your Ontology ASAP "
					, logger::WARNING
				);
			}

			$areas = [];
			foreach ($ar_root_areas as $area_tipo) {

				// skip the areas_deny
					if(in_array($area_tipo, $config_areas->areas_deny)) continue;

				// areas. Get the JSON format of the ontology

					$areas[] = RecordObj_dd::tipo_to_json_item($area_tipo, [
						'tipo',
						'model',
						'parent',
						'properties',
						'label'
					]);

				// group_areas. get the all children areas and sections of current
					$ar_group_areas	= self::get_ar_children_areas_recursive($area_tipo);

					// get the JSON format of the ontology for all children
					foreach ($ar_group_areas as $child_area_tipo) {

						// skip the areas_deny
						if(in_array($child_area_tipo, $config_areas->areas_deny)) continue;

						$areas[] = RecordObj_dd::tipo_to_json_item($child_area_tipo, [
							'tipo',
							'model',
							'parent',
							'properties',
							'label'
						]);
					}
			}//end foreach ($ar_root_areas as $area_tipo)

		// debug
			if(SHOW_DEBUG===true) {
				$total	= round( start_time() - $start_time, 3);
				$n		= count($areas);
				debug_log(__METHOD__
					." Total ($n): ".exec_time_unit($start_time,'ms')." ms - ratio(total/n): " . ($total/$n)
					, logger::DEBUG
				);
			}


		return $areas;
	}//end get_areas



	/**
	* GET_AR_CHILDREN_AREAS_RECURSIVE
	* Get all children areas (and sections) of current area (example: area_root)
	* Look structure thesaurus for find children with valid model name
	* @see get_ar_ts_children_areas
	*
	* @param $terminoID
	*	tipo (First tipo is null in recursion)
	* @return array $ar_ts_children_areas
	*	array recursive of thesaurus structure children filtered by accepted model name
	*/
	protected static function get_ar_children_areas_recursive( string $terminoID ) : array {

		// default value
		$ar_children_areas_recursive = [];

		// short vars
		$RecordObj_dd			= new RecordObj_dd($terminoID);
		$ar_ts_children			= $RecordObj_dd->get_ar_children_of_this();
		$ar_ts_children_size	= sizeof($ar_ts_children);

		if ($ar_ts_children_size>0) {

			// foreach ($ar_ts_children as $children_terminoID) {
			for ($i=0; $i < $ar_ts_children_size; $i++) {

				$children_terminoID = $ar_ts_children[$i];

				$RecordObj_dd	= new RecordObj_dd($children_terminoID);
				$model			= RecordObj_dd::get_modelo_name_by_tipo($children_terminoID,true);

				// Test if model is accepted or not (more restrictive)
				if( 	in_array($model, area::$ar_children_include_model_name)
					&& !in_array($model, area::$ar_children_exclude_modelo_name)
				) {

					// add current
					$ar_children_areas_recursive[] = $children_terminoID;

					// calculate recursive
					$ar_temp = self::get_ar_children_areas_recursive($children_terminoID);
					$ar_children_areas_recursive = array_merge($ar_children_areas_recursive, $ar_temp);
				}
			}//end for ($i=0; $i < $ar_ts_children_size; $i++)
		}


		return $ar_children_areas_recursive;
	}//end get_ar_children_areas_recursive



	/**
	* GET_CONFIG_AREAS
	* Read file 'config_areas.php' from config and set
	* areas_deny and areas_allow array values
	* @return object $config_areas
	*/
	public static function get_config_areas() : object {

		// non existing config_areas.php file case
			if( !include DEDALO_CONFIG_PATH . '/config_areas.php' ) {

				debug_log(__METHOD__
					." ERROR ON LOAD FILE config4_areas . Using empty values as default "
					, logger::ERROR
				);

				if(SHOW_DEBUG===true) {
					throw new Exception("Error Processing Request. config4_areas file not found", 1);
				}

				$areas_deny		= [];
				$areas_allow	= [];
			}

		// config_areas object
			$config_areas = new stdClass();
				$config_areas->areas_deny	= $areas_deny;
				$config_areas->areas_allow	= $areas_allow;


		return $config_areas;
	}//end get_config_areas



}//end area class
