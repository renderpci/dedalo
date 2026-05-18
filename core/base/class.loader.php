<?php declare(strict_types=1);
/**
* CLASS LOADER
*
* Manages the autoloading of Dédalo PHP classes.
* This class is included from the config file and registers an autoloader
* that follows Dédalo's directory structure conventions.
*
* Key features:
* - Autoloads tools, diffusion classes, components, and areas
* - Follows Dédalo's naming convention: class.{Class_name}.php
* - Uses modern PHP 8.3+ functions for better performance
*
* @package Dedalo
* @subpackage Core
* @since 7.0
*/
// Base
include DEDALO_CORE_PATH . '/base/class.Error.php';
include DEDALO_CORE_PATH . '/base/class.dd_cache.php';
include DEDALO_CORE_PATH . '/base/class.processes.php';
include DEDALO_CORE_PATH . '/base/class.system.php';
include DEDALO_CORE_PATH . '/base/class.OpcacheObjectManager.php';
// Logger
include_once DEDALO_CORE_PATH . '/logger/class.logger.php';
include DEDALO_CORE_PATH . '/logger/class.logger_backend.php';
include DEDALO_CORE_PATH . '/logger/class.logger_backend_activity.php';
// DB
include DEDALO_CORE_PATH . '/db/class.DBi.php';
include DEDALO_CORE_PATH . '/db/class.dd_ontology_db_manager.php';
include DEDALO_CORE_PATH . '/db/class.matrix_db_manager.php';
include DEDALO_CORE_PATH . '/db/class.matrix_temp_manager.php';
include DEDALO_CORE_PATH . '/db/class.matrix_activity_db_manager.php';
include DEDALO_CORE_PATH . '/db/class.tm_db_manager.php';
include DEDALO_CORE_PATH . '/db/class.db_result.php';
include DEDALO_CORE_PATH . '/db/class.locators_result.php';
include DEDALO_CORE_PATH . '/db/class.object_cache.php';
include DEDALO_CORE_PATH . '/db/class.json_handler.php';
include DEDALO_CORE_PATH . '/db/class.db_tasks.php';
// Backup
include DEDALO_CORE_PATH . '/backup/class.backup.php';
// Common
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
include DEDALO_CORE_PATH . '/common/class.request_query_object.php'; // new 16-05-2021
include DEDALO_CORE_PATH . '/common/class.request_config_object.php'; // new 16-05-2021
include DEDALO_CORE_PATH . '/common/class.search_query_object.php'; // new 30-06-2021
include DEDALO_CORE_PATH . '/common/class.metrics.php'; // new 20-03-2024
include DEDALO_CORE_PATH . '/common/class.static_profiler.php';
// Section
include DEDALO_CORE_PATH . '/section/class.section.php';
include DEDALO_CORE_PATH . '/section_record/class.section_record_data.php';
include DEDALO_CORE_PATH . '/section_record/class.section_record.php';
include DEDALO_CORE_PATH . '/section_record/class.section_record_temp.php';
// Time machine
include DEDALO_CORE_PATH . '/tm_record/class.tm_record_data.php';
include DEDALO_CORE_PATH . '/tm_record/class.tm_record.php';
// Ontology
include DEDALO_CORE_PATH . '/ontology/class.ontology_data_io.php';
include DEDALO_CORE_PATH . '/ontology_engine/class.ontology_node.php';
include DEDALO_CORE_PATH . '/ontology_engine/class.ontology_utils.php';
// media_engine. media auxiliary classes
include DEDALO_CORE_PATH . '/media_engine/class.Ffmpeg.php';
include DEDALO_CORE_PATH . '/media_engine/class.ImageMagick.php';
// dd grid
include DEDALO_CORE_PATH . '/dd_grid/class.dd_grid_cell_object.php'; // new 27-07-2021
include DEDALO_CORE_PATH . '/dd_grid/class.indexation_grid.php'; // new 28-07-2021
// component_common
include DEDALO_CORE_PATH . '/component_common/class.component_common.php';
include DEDALO_CORE_PATH . '/component_common/class.lock_components.php';
include DEDALO_CORE_PATH . '/component_media_common/class.component_media_common.php';
include DEDALO_CORE_PATH . '/component_relation_common/class.component_relation_common.php';
// Security
include DEDALO_CORE_PATH . '/security/class.security.php';
// Search
include DEDALO_CORE_PATH . '/search/class.search.php';
include DEDALO_CORE_PATH . '/search/class.search_tm.php';
include DEDALO_CORE_PATH . '/search/class.search_related.php';
include DEDALO_CORE_PATH . '/widgets/widget_common/class.widget_common.php';
// Diffusion
include DEDALO_DIFFUSION_PATH . '/class.diffusion.php';
include DEDALO_DIFFUSION_PATH . '/class.diffusion_section_stats.php';
include DEDALO_DIFFUSION_PATH . '/class.diffusion_sql.php';
include DEDALO_DIFFUSION_PATH . '/class.diffusion_mysql.php';
include DEDALO_DIFFUSION_PATH . '/class.diffusion_object.php';
include DEDALO_DIFFUSION_PATH . '/class.diffusion_chain_processor.php';
include DEDALO_DIFFUSION_PATH . '/class.diffusion_utils.php';
include DEDALO_DIFFUSION_PATH . '/class.diffusion_data.php';
include DEDALO_DIFFUSION_PATH . '/class.diffusion_data_object.php';
include DEDALO_DIFFUSION_PATH . '/class.diffusion_datum.php';
include DEDALO_DIFFUSION_PATH . '/class.diffusion_fn.php';
// Dédalo API
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_manager.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_core_api.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_diffusion_api.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_utils_api.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_tools_api.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_ts_api.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_component_text_area_api.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_component_portal_api.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_component_av_api.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_component_info.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_component_3d_api.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_area_maintenance_api.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_ontology_api.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_mcp_api.php';
// tools
include DEDALO_TOOLS_PATH . '/tool_common/class.tool_common.php';
// Shared
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
*
* Manages the autoloading of Dédalo PHP classes.
* This class is included from the config file and registers an autoloader
* that follows Dédalo's directory structure conventions.
*
* @package Dedalo
* @subpackage Core
* @since 7.0
*/
class class_loader {



	/**
	* __CONSTRUCT
	*
	* Registers the autoloader function with SPL.
	* Sets the file extension for autoloaded files to .php
	*/
	public function __construct() {

		spl_autoload_extensions('.php');
		spl_autoload_register([self::class, 'loader']);
	}//end __construct



	/**
	* LOADER
	*
	* Autoloads PHP classes following Dédalo's directory structure conventions.
	* Resolves class names to file paths and includes the appropriate file.
	*
	* Supported patterns:
	* - tool* -> Loads from DEDALO_TOOLS_PATH (with special handling for tools_register)
	* - *diffusion_* -> Loads from DEDALO_DIFFUSION_PATH
	* - * -> Loads from DEDALO_CORE_PATH/class_name/class.class_name.php
	*
	* @param string $class_name The name of the class to autoload
	* @return bool True if the file was successfully included
	* @throws Exception If the class file cannot be found or included
	*/
	public static function loader(string $class_name) : bool {

		// SEC-048: defence-in-depth class-name allowlist. Every call site that
		// hands user input to the autoloader (dd_manager, dd_core_api,
		// dd_area_maintenance_api, dd_tools_api) already validates its class
		// names through `sanitize_key_dir()` or explicit allowlists. This
		// second gate makes sure that *any* future accidental path which
		// reaches `class_exists`/`new $var` with attacker input cannot
		// require an out-of-tree file: the class name must match Dédalo's
		// naming conventions and carry only safe characters.
		if (preg_match('/^[A-Za-z_][A-Za-z0-9_]{0,127}$/', $class_name) !== 1) {
			trigger_error(__METHOD__ . ' SEC-048 refused unsafe class name: ' . $class_name);
			return false;
		}

		switch (true) {

			// tools
			case (str_starts_with($class_name, 'tool')):
				$directory	= ($class_name==='tools_register') ? 'tool_common' : $class_name;
				$file_path	= DEDALO_TOOLS_PATH . '/' . $directory . '/class.' . $class_name . '.php';
				break;

			// diffusion
			case (str_starts_with($class_name, 'diffusion_')):
				$file_path	= DEDALO_DIFFUSION_PATH . '/class.' . $class_name . '.php';
				break;

			// components, areas, etc. (first level directory inside DEDALO_CORE_PATH)
			default:
				$file_path	= DEDALO_CORE_PATH . '/' . $class_name . '/class.' . $class_name . '.php';
				break;
		}

		// SEC-048: second rail — confirm the resolved path is still inside
		// one of the known Dédalo code roots. This prevents a loader call
		// for a name that happens to include `..` (already blocked by the
		// regex above) from reaching outside the tree via DEDALO_* constants
		// that a compromised config could point elsewhere.
		$real_path = realpath($file_path);
		$ok_roots  = array_filter([
			defined('DEDALO_CORE_PATH')      ? realpath(DEDALO_CORE_PATH)      : false,
			defined('DEDALO_TOOLS_PATH')     ? realpath(DEDALO_TOOLS_PATH)     : false,
			defined('DEDALO_DIFFUSION_PATH') ? realpath(DEDALO_DIFFUSION_PATH) : false,
			defined('DEDALO_SHARED_PATH')    ? realpath(DEDALO_SHARED_PATH)    : false,
		]);
		if ($real_path === false || empty($ok_roots)) {
			// Fall through — `include` below will error out loudly. We do not
			// hard-fail here because some unit-test bootstraps use virtual
			// fixture paths that don't pass realpath.
		} else {
			$inside = false;
			foreach ($ok_roots as $root) {
				if (str_starts_with($real_path, $root . DIRECTORY_SEPARATOR) || $real_path === $root) {
					$inside = true;
					break;
				}
			}
			if (!$inside) {
				trigger_error(__METHOD__ . ' SEC-048 refused out-of-tree autoload path: ' . $file_path);
				return false;
			}
		}

		if ( !include($file_path) ) {
			$msg = "<hr> A loader call was made to class <b>$class_name</b><br> File do not exits at: <b>$file_path</b><br>
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
