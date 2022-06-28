<?php
/*
	FIXED CLASSES TO LOAD
*/
include(DEDALO_CORE_PATH . '/base/class.Error.php');
include(DEDALO_CORE_PATH . '/logger/class.logger.php');
include(DEDALO_CORE_PATH . '/db/class.DBi.php');
include(DEDALO_CORE_PATH . '/db/class.RecordDataBoundObject.php');
include(DEDALO_CORE_PATH . '/db/class.RecordObj_matrix.php');
include(DEDALO_CORE_PATH . '/db/class.JSON_RecordDataBoundObject.php');
include(DEDALO_CORE_PATH . '/db/class.JSON_RecordObj_matrix.php');
include(DEDALO_CORE_PATH . '/db/class.RecordObj_time_machine.php');
include(DEDALO_CORE_PATH . '/db/class.RecordObj_dd.php');
include(DEDALO_CORE_PATH . '/db/class.RecordObj_descriptors_dd.php');
include(DEDALO_CORE_PATH . '/db/class.json_handler.php');
include(DEDALO_CORE_PATH . '/common/class.common.php');
include(DEDALO_CORE_PATH . '/common/class.lang.php');
include(DEDALO_CORE_PATH . '/common/class.navigator.php');
include(DEDALO_CORE_PATH . '/common/class.filter.php');
include(DEDALO_CORE_PATH . '/common/class.counter.php');
include(DEDALO_CORE_PATH . '/common/class.tools.php');
include(DEDALO_CORE_PATH . '/common/class.label.php');
include(DEDALO_CORE_PATH . '/media_engine/class.Ffmpeg.php');
include(DEDALO_CORE_PATH . '/media_engine/class.ImageMagick.php');
#include(DEDALO_CORE_PATH . '/common/class.operator.php');
include(DEDALO_CORE_PATH . '/common/class.locator.php');
include(DEDALO_CORE_PATH . '/common/class.dd_date.php');
include(DEDALO_CORE_PATH . '/common/class.layout_map.php');# new 12-06-2019
include(DEDALO_CORE_PATH . '/common/class.dd_object.php'); # new 12-06-2019
include(DEDALO_CORE_PATH . '/common/class.ddo_map_object.php'); # new 28-07-2019
include(DEDALO_CORE_PATH . '/common/class.request_query_object.php'); # new 16-05-2021
include(DEDALO_CORE_PATH . '/common/class.request_config_object.php'); # new 16-05-2021
include(DEDALO_CORE_PATH . '/common/class.search_query_object.php'); # new 30-06-2021
include(DEDALO_CORE_PATH . '/dd_grid/class.dd_grid_cell_object.php'); # new 27-07-2021
include(DEDALO_CORE_PATH . '/dd_grid/class.indexation_grid.php'); # new 28-07-2021
#include(DEDALO_CORE_PATH . '/common/class.relation.php');
include(DEDALO_CORE_PATH . '/component_common/class.component_common.php');
include(DEDALO_CORE_PATH . '/component_media_common/class.component_media_common.php');
include(DEDALO_CORE_PATH . '/component_relation_common/class.component_relation_common.php');
include(DEDALO_CORE_PATH . '/search/class.search.php');
include(DEDALO_CORE_PATH . '/search/class.search_tm.php');
include(DEDALO_CORE_PATH . '/search/class.search_related.php');
include(DEDALO_CORE_PATH . '/api/v1/common/class.dd_core_api.php');
include(DEDALO_CORE_PATH . '/api/v1/common/class.dd_utils_api.php');
include(DEDALO_CORE_PATH . '/api/v1/common/class.dd_tools_api.php');
include(DEDALO_CORE_PATH . '/api/v1/common/class.dd_ts_api.php');
include(DEDALO_CORE_PATH . '/ontology/class.ontology.php');
include(DEDALO_CORE_PATH . '/lock_components/class.lock_components.php');
# include the shared classes
include(DEDALO_SHARED_PATH . '/class.TR.php');
include(DEDALO_SHARED_PATH . '/class.OptimizeTC.php');
include(DEDALO_SHARED_PATH . '/class.subtitles.php');

// components json
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
	// 	'component_html_file',
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
	// 	'component_semantic_node',
	// 	'component_svg',
	// 	'component_text_area'
	// ];
	// foreach ($ar_components as $model) {
	// 	include(DEDALO_CORE_PATH .'/'. $model .'/class.'. $model .'.php');
	// }



/**
* CLASS_LOADER
* manage the load of Dédalo PHP classes files
* Included from config file
*/
class class_loader {


	public function __construct() {

		# Check if PHP version is supported
		#self::test_php_version_supported();

		spl_autoload_extensions('.php');
		spl_autoload_register(array($this, 'loader'));
	}//end __construct



	/**
	* LOADER
	* Include the file of given class resolving more common paths
	* @param string $className
	*/
	private static function loader(string $className) : bool {

		switch (true) {

			// tools
			case (strpos($className, 'tool')===0):
				$directory	= ($className==='tools_register') ? 'tool_common' : $className;
				$file_path	= DEDALO_TOOLS_PATH . '/' . $directory . '/class.' . $className . '.php';
				break;

			// diffusion
			case (strpos($className, 'diffusion_')!==false):
				$file_path	= DEDALO_CORE_PATH . '/diffusion/' . $className . '/class.' . $className . '.php';
				break;

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



	/**
	* TEST_PHP_VERSION_SUPPORTED
	* Test if PHP version is supported
	* @return bool
	*/
	static private function test_php_version_supported() : bool {

		static $php_version_supported;

		if(isset($php_version_supported)) {
			return ($php_version_supported);
		}

		$current_php_version	= phpversion();
		$minimun_php_version	= '8.0.0';

		$ar_current_php_version	= explode('.',$current_php_version);
		$ar_minimun_php_version	= explode('.',$minimun_php_version);

		if ($ar_current_php_version[1]<4) {
			trigger_error("PHP version $current_php_version is not full compatible with this application. Please update ASAP to PHP 7.2");
		}

		if(	$ar_current_php_version[0] < $ar_minimun_php_version[0] ||
			($ar_current_php_version[0]===$ar_minimun_php_version[0] && $ar_current_php_version[1] < $ar_minimun_php_version[1])
		  ) {
			throw new Exception( " This PHP version (".phpversion().") is not supported ! Please update your PHP to $minimun_php_version or higher ASAP ");
		}

		$php_version_supported = true;

		return $php_version_supported;
	}//end test_php_version_supported



}//end class_loader



# LOAD . Auto Init class
$autoloader	= new class_loader();



# INIT NAVIGATOR
$navigator	= new navigator();


