<?php declare(strict_types=1);
/*
	FIXED CLASSES TO LOAD
*/
include DEDALO_CORE_PATH . '/base/class.Error.php';
include DEDALO_CORE_PATH . '/base/class.dd_cache.php';
include DEDALO_CORE_PATH . '/base/class.processes.php';
include DEDALO_CORE_PATH . '/base/class.system.php';
include DEDALO_CORE_PATH . '/logger/class.logger.php';
include DEDALO_CORE_PATH . '/logger/class.logger_backend.php';
include DEDALO_CORE_PATH . '/logger/class.logger_backend_activity.php';
include DEDALO_CORE_PATH . '/db/class.DBi.php';
include DEDALO_CORE_PATH . '/db/class.dd_ontology_db_manager.php';
include DEDALO_CORE_PATH . '/db/class.matrix_db_manager.php';
include DEDALO_CORE_PATH . '/db/class.RecordDataBoundObject.php';
include DEDALO_CORE_PATH . '/db/class.JSON_RecordDataBoundObject.php';
include DEDALO_CORE_PATH . '/db/class.JSON_RecordObj_matrix.php';
include DEDALO_CORE_PATH . '/db/class.RecordObj_time_machine.php';
include DEDALO_CORE_PATH . '/db/class.json_handler.php';
include DEDALO_CORE_PATH . '/db/class.db_tasks.php';
include DEDALO_CORE_PATH . '/backup/class.backup.php';
include DEDALO_CORE_PATH . '/common/class.common.php';
include DEDALO_CORE_PATH . '/common/class.lang.php';
include DEDALO_CORE_PATH . '/common/class.filter.php';
include DEDALO_CORE_PATH . '/common/class.counter.php';
include DEDALO_CORE_PATH . '/common/class.label.php';
include DEDALO_CORE_PATH . '/common/class.exec_.php';
include DEDALO_CORE_PATH . '/common/class.locator.php';
include DEDALO_CORE_PATH . '/common/class.dd_date.php';
include DEDALO_CORE_PATH . '/common/class.request_config_presets.php';
include DEDALO_CORE_PATH . '/common/class.dd_object.php'; // new 12-06-2019
include DEDALO_CORE_PATH . '/common/class.ddo_map_object.php'; // new 28-07-2019
include DEDALO_CORE_PATH . '/common/class.request_query_object.php'; // new 16-05-2021
include DEDALO_CORE_PATH . '/common/class.request_config_object.php'; // new 16-05-2021
include DEDALO_CORE_PATH . '/common/class.search_query_object.php'; // new 30-06-2021
include DEDALO_CORE_PATH . '/common/class.metrics.php'; // new 20-03-2024
include DEDALO_CORE_PATH . '/section/class.section.php';
include DEDALO_CORE_PATH . '/section_record/class.section_record_data.php';
// Ontology
include DEDALO_CORE_PATH . '/ontology/class.ontology_data_io.php';
include DEDALO_CORE_PATH . '/ontology_engine/class.ontology_node.php';
include DEDALO_CORE_PATH . '/ontology_engine/class.ontology_utils.php';
// media_engine. media auxiliary classes
include DEDALO_CORE_PATH . '/media_engine/class.Ffmpeg.php';
include DEDALO_CORE_PATH . '/media_engine/class.ImageMagick.php';
// Core
include DEDALO_CORE_PATH . '/dd_grid/class.dd_grid_cell_object.php'; // new 27-07-2021
include DEDALO_CORE_PATH . '/dd_grid/class.indexation_grid.php'; // new 28-07-2021
include DEDALO_CORE_PATH . '/component_common/class.component_common.php';
include DEDALO_CORE_PATH . '/component_common/class.lock_components.php';
include DEDALO_CORE_PATH . '/component_media_common/class.component_media_common.php';
include DEDALO_CORE_PATH . '/component_relation_common/class.component_relation_common.php';
include DEDALO_CORE_PATH . '/search/class.search.php';
include DEDALO_CORE_PATH . '/search/class.search_tm.php';
include DEDALO_CORE_PATH . '/search/class.search_related.php';
include DEDALO_CORE_PATH . '/widgets/widget_common/class.widget_common.php';
// diffusion
include DEDALO_CORE_PATH . '/diffusion/class.diffusion.php';
include DEDALO_CORE_PATH . '/diffusion/class.diffusion_section_stats.php';
include DEDALO_CORE_PATH . '/diffusion/class.diffusion_sql.php';
include DEDALO_CORE_PATH . '/diffusion/class.diffusion_mysql.php';
include DEDALO_CORE_PATH . '/diffusion/class.diffusion_object.php';
include DEDALO_CORE_PATH . '/diffusion/class.diffusion_data.php';
include DEDALO_CORE_PATH . '/diffusion/class.diffusion_data_object.php';
// API
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_manager.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_core_api.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_utils_api.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_tools_api.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_ts_api.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_component_text_area_api.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_component_portal_api.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_component_av_api.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_component_info.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_component_3d_api.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_area_maintenance_api.php';
// tools
include DEDALO_TOOLS_PATH . '/tool_common/class.tool_common.php';
// include the shared classes
include DEDALO_SHARED_PATH . '/class.TR.php';
include DEDALO_SHARED_PATH . '/class.OptimizeTC.php';
include DEDALO_SHARED_PATH . '/class.subtitles.php';



// components JSON
	// $ar_components = [
	// 	'component_av',
	// 	'component_check_box',
	// 	'component_date',
	// 	'component_email',
	// 	'component_external',
	// 	'component_filter',
	// 	'component_filter_master',
	// 	'component_filter_records',
	// 	'component_geolocation',
	// 	'component_image',
	// 	'component_info',
	// 	'component_input_text',
	// 	'component_inverse',
	// 	'component_ip',
	// 	'component_iri',
	// 	'component_json',
	// 	'component_number',
	// 	'component_password',
	// 	'component_pdf',
	// 	'component_portal',
	// 	'component_publication',
	// 	'component_radio_button',
	// 	'component_relation_children',
	// 	'component_relation_index',
	// 	'component_relation_model',
	// 	'component_relation_parent',
	// 	'component_relation_related',
	// 	'component_score',
	// 	'component_section_id',
	// 	'component_security_access',
	// 	'component_select',
	// 	'component_select_lang',
	// 	'component_svg',
	// 	'component_text_area'
	// ];
	// foreach ($ar_components as $model) {
	// 	include DEDALO_CORE_PATH .'/'. $model .'/class.'. $model .'.php';
	// }



/**
* CLASS_LOADER
* manage the load of Dédalo PHP classes files
* Included from config file
*/
class class_loader {



	/**
	* __CONSTRUCT
	*/
	public function __construct() {

		spl_autoload_extensions('.php');
		spl_autoload_register(array($this, 'loader'));
	}//end __construct



	/**
	* LOADER
	* Include the file of given class resolving more common paths
	* @param string $className
	* @return bool
	*/
	private static function loader(string $className) : bool {

		switch (true) {

			// tools
			case (strpos($className, 'tool')===0):
				$directory	= ($className==='tools_register') ? 'tool_common' : $className;
				$file_path	= DEDALO_TOOLS_PATH . '/' . $directory . '/class.' . $className . '.php';
				break;

			// diffusion
				// case (strpos($className, 'diffusion_')!==false):
				// 	$file_path	= DEDALO_CORE_PATH . '/diffusion/class.' . $className . '.php';
				// 	break;

			// components, areas, etc. (first level directory inside DEDALO_CORE_PATH)
			default:
				$file_path	= DEDALO_CORE_PATH . '/' . $className . '/class.' . $className . '.php';
				break;
		}

		if ( !include($file_path) ) {
			// $bt = debug_backtrace();
			// dump($bt, ' ERROR ON LOADER INCLUDE FILE !! bt ++ '.to_string($file_path));
			$msg = "<hr> A loader call was made to class <b>$className</b><br> File do not exits at: <b>$file_path</b><br>
				Please, remember require this file in main class (like component_common) or create standard dedalo lib path folder
				like '/component_input_text/class.component_input_text.php' for loader calls. ";
			// throw new Exception(__METHOD__ . $msg);
			trigger_error(__METHOD__ . $msg);
			return false;
		}

		return true;
	}//end loader



}//end class_loader



// LOAD . Auto Init class
$autoloader	= new class_loader();
