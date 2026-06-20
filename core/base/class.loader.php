<?php declare(strict_types=1);
/**
* CLASS LOADER — bootstrap module
*
* Two-phase PHP bootstrap for Dédalo:
*
* PHASE 1 — EAGER INCLUDES (file-level statements, lines 18–143)
*   Unconditionally includes every class that must be available before the
*   first request dispatch. The ordering mirrors the dependency graph:
*   Error → Cache → DB → Common → Section → Ontology → Media → Components
*   → Security → Search → Diffusion → API → Tools → Shared.
*   Classes that are referenced before any autoloader is running (e.g. logger,
*   common, section) must be here; everything else can be deferred to phase 2.
*
* PHASE 2 — LAZY AUTOLOADER (class_loader, instantiated at the bottom)
*   Registers class_loader::loader() with the SPL autoload stack so that any
*   class not already included in phase 1 is resolved on first use. The loader
*   maps Dédalo's flat naming convention (component_input_text, tool_export, …)
*   to the file-system layout:
*     DEDALO_CORE_PATH/<class_name>/class.<class_name>.php   (default)
*     DEDALO_TOOLS_PATH/<class_name>/class.<class_name>.php  (tool* prefix)
*     DEDALO_DIFFUSION_PATH/class.<class_name>.php           (diffusion_ prefix)
*   Special cases handle classes co-located in a shared directory rather than
*   their own one-class-per-dir folder (ts_node_repository, ts_term_resolver,
*   section_map, tool_common infrastructure classes).
*
* SECURITY
*   SEC-048 is enforced at two levels:
*   1. Class-name allowlist: only identifiers matching /^[A-Za-z_][A-Za-z0-9_]{0,127}$/
*      are permitted; all others are rejected with trigger_error() + return false.
*   2. Path containment: the realpath() of the resolved file must sit inside one
*      of the known DEDALO_* code roots. This prevents a compromised config from
*      redirecting a root constant to an out-of-tree location.
*
* ADDING A CLASS
*   - Standard component/area: create core/<class_name>/class.<class_name>.php;
*     the default switch branch handles it automatically.
*   - Tool: create tools/<class_name>/class.<class_name>.php; the 'tool*' branch
*     resolves it via tool_paths::get_tool_class_file() (supports multi-root).
*   - Tool-common infrastructure: add the class name to $tool_common_classes inside
*     the loader.
*   - Co-located helper: add an explicit case to the switch.
*   - Must-be-eager class: add an include at the top of this file in the correct
*     dependency order.
*
* @package Dédalo
* @subpackage Core
*/
// Base
// Core infrastructure that every other subsystem depends on; must be first.
include DEDALO_CORE_PATH . '/base/class.Error.php';
include DEDALO_CORE_PATH . '/base/class.dd_cache.php';
include DEDALO_CORE_PATH . '/base/class.processes.php';
include DEDALO_CORE_PATH . '/base/class.system.php';
include DEDALO_CORE_PATH . '/base/class.OpcacheObjectManager.php';
// Logger
// include_once (not include) because config.php already loads logger.php before
// this file to enable early logging during the bootstrap itself.
include_once DEDALO_CORE_PATH . '/logger/class.logger.php';
include DEDALO_CORE_PATH . '/logger/class.logger_backend.php';
include DEDALO_CORE_PATH . '/logger/class.logger_backend_activity.php';
// DB
// All database layer managers and result DTOs. DBi is the PostgreSQL abstraction;
// the *_db_manager classes each own one logical table family (matrix, ontology, TM…).
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
// Utility classes shared across all subsystems. Load order matters: common.php
// defines the global helper functions (debug_log, to_string, exec_time…) that
// every subsequent include may call.
include DEDALO_CORE_PATH . '/common/class.common.php';
include DEDALO_CORE_PATH . '/common/class.lang.php';
include DEDALO_CORE_PATH . '/common/class.counter.php';
include DEDALO_CORE_PATH . '/common/class.label.php';
include DEDALO_CORE_PATH . '/common/class.exec_.php';
include DEDALO_CORE_PATH . '/common/class.locator.php';
include DEDALO_CORE_PATH . '/common/class.dataframe_caller.php'; // dataframe pairing caller DTO
include DEDALO_CORE_PATH . '/common/class.dd_date.php';
include DEDALO_CORE_PATH . '/common/class.request_config_presets.php';
include DEDALO_CORE_PATH . '/common/class.dd_object.php'; // new 12-06-2019
include DEDALO_CORE_PATH . '/common/class.request_query_object.php'; // new 16-05-2021
include DEDALO_CORE_PATH . '/common/class.request_config_object.php'; // new 16-05-2021
include DEDALO_CORE_PATH . '/common/class.search_query_object.php'; // new 30-06-2021
include DEDALO_CORE_PATH . '/common/class.metrics.php'; // new 20-03-2024
include DEDALO_CORE_PATH . '/common/class.static_profiler.php';
// Section
// section and section_record are the two fundamental record types.
// section_record_data is the plain DTO; section_record extends it with
// read/write behaviour. section_record_temp supports draft (unsaved) records.
include DEDALO_CORE_PATH . '/section/class.section.php';
include DEDALO_CORE_PATH . '/section_record/class.section_record_data.php';
include DEDALO_CORE_PATH . '/section_record/class.section_record.php';
include DEDALO_CORE_PATH . '/section_record/class.section_record_temp.php';
// Time machine
// tm_record_data / tm_record mirror the section_record pair but address
// the versioned snapshot store used by the time-machine subsystem.
include DEDALO_CORE_PATH . '/tm_record/class.tm_record_data.php';
include DEDALO_CORE_PATH . '/tm_record/class.tm_record.php';
// Ontology
// ontology_data_io handles persistence of the ontology graph; ontology_node
// and ontology_utils provide the in-memory node model and traversal helpers.
include DEDALO_CORE_PATH . '/ontology/class.ontology_data_io.php';
include DEDALO_CORE_PATH . '/ontology_engine/class.ontology_node.php';
include DEDALO_CORE_PATH . '/ontology_engine/class.ontology_utils.php';
// media_engine. media auxiliary classes
// Ffmpeg and ImageMagick are thin wrappers around the respective CLI tools;
// loaded eagerly because the media pipeline is invoked from multiple entry points.
include DEDALO_CORE_PATH . '/media_engine/class.Ffmpeg.php';
include DEDALO_CORE_PATH . '/media_engine/class.ImageMagick.php';
// dd grid
// dd_grid_cell_object and indexation_grid support the spreadsheet-style
// data-grid feature introduced in mid-2021.
include DEDALO_CORE_PATH . '/dd_grid/class.dd_grid_cell_object.php'; // new 27-07-2021
include DEDALO_CORE_PATH . '/dd_grid/class.indexation_grid.php'; // new 28-07-2021
// export contract (atoms based component export value)
// These four classes define the typed atom protocol used by component::get_export_value().
// export_path_segment → export_atom → export_value → export_context form a hierarchy
// from individual path tokens up to the full export result envelope.
include DEDALO_CORE_PATH . '/dd_grid/class.export_path_segment.php';
include DEDALO_CORE_PATH . '/dd_grid/class.export_atom.php';
include DEDALO_CORE_PATH . '/dd_grid/class.export_value.php';
include DEDALO_CORE_PATH . '/dd_grid/class.export_context.php';
// component_common
// Abstract base classes for all component types. These must be loaded before
// any concrete component class — the autoloader may resolve component_input_text
// at any point after this file returns, and it will require component_common.
// component_media_common and component_relation_common extend component_common.
include DEDALO_CORE_PATH . '/component_common/class.component_common.php';
include DEDALO_CORE_PATH . '/component_common/class.lock_components.php';
include DEDALO_CORE_PATH . '/component_media_common/class.component_media_common.php';
include DEDALO_CORE_PATH . '/component_relation_common/class.component_relation_common.php';
// Security
include DEDALO_CORE_PATH . '/security/class.security.php';
// Search
// The three search classes cover matrix records (search), time-machine records
// (search_tm), and cross-section relation queries (search_related). All are
// needed early because the API dispatch layer calls them before resolving any
// particular component.
include DEDALO_CORE_PATH . '/search/class.search.php';
include DEDALO_CORE_PATH . '/search/class.search_tm.php';
include DEDALO_CORE_PATH . '/search/class.search_related.php';
include DEDALO_CORE_PATH . '/widgets/widget_common/class.widget_common.php';
// Diffusion
// DEDALO_DIFFUSION_CUSTOM: optional per-installation override file whose path
// is set in config.php. Loaded before the standard diffusion classes so that
// it can redefine constants or subclass diffusion helpers.
// (!) The legacy constant name DIFFUSION_CUSTOM is accepted as a fallback for
// installations that have not yet migrated to the DEDALO_DIFFUSION_CUSTOM name.
$diffusion_custom_file = defined('DEDALO_DIFFUSION_CUSTOM') && !empty(DEDALO_DIFFUSION_CUSTOM)
	? DEDALO_DIFFUSION_CUSTOM
	: ((defined('DIFFUSION_CUSTOM') && !empty(DIFFUSION_CUSTOM)) ? DIFFUSION_CUSTOM : null);
if ($diffusion_custom_file!==null) {
	if (!include_once $diffusion_custom_file) {
		debug_log(__METHOD__
			. " Diffusion custom file not found" . PHP_EOL
			. ' file: ' . to_string($diffusion_custom_file)
			, logger::ERROR
		);
	}
}
// $diffusion_custom_file is unset immediately so it does not pollute the global
// scope for any code that runs after this bootstrap file returns.
unset($diffusion_custom_file);
include DEDALO_DIFFUSION_PATH . '/class.diffusion_section_stats.php';
include DEDALO_DIFFUSION_PATH . '/class.diffusion_activity_logger.php';
include DEDALO_DIFFUSION_PATH . '/class.diffusion_api_client.php';
include DEDALO_DIFFUSION_PATH . '/class.diffusion_delete.php';
include DEDALO_DIFFUSION_PATH . '/class.diffusion_chain_processor.php';
include DEDALO_DIFFUSION_PATH . '/class.diffusion_utils.php';
include DEDALO_DIFFUSION_PATH . '/class.diffusion_data_object.php';
include DEDALO_DIFFUSION_PATH . '/class.diffusion_datum.php';
include DEDALO_DIFFUSION_PATH . '/class.diffusion_fn.php';
// Dédalo API
// dd_manager is the central request router. All other dd_*_api classes are
// sub-handlers it delegates to; they must therefore be present before the
// first API call is dispatched.
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
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_agent_api.php';
include DEDALO_CORE_PATH . '/api/v1/common/class.dd_rag_api.php';
// tools
// tool_common provides the abstract base class for all tools.
include DEDALO_TOOLS_PATH . '/tool_common/class.tool_common.php';
// (!) tool_paths is included unconditionally (not autoloaded) because the
// autoloader itself consults tool_paths::get_tool_class_file() and
// tool_paths::get_roots() for multi-root tool resolution. Allowing it to be
// autoloaded would cause infinite recursion.
include DEDALO_TOOLS_PATH . '/tool_common/class.tool_paths.php';
// Shared
// Shared code lives outside core/ and is used by both the server-side PHP
// layer and (in some cases) by the front-end build pipeline.
include DEDALO_SHARED_PATH . '/class.TR.php';
include DEDALO_SHARED_PATH . '/class.OptimizeTC.php';
include DEDALO_SHARED_PATH . '/class.subtitles.php';
include DEDALO_SHARED_PATH . '/agent/class.agent_view_builder.php';



// components JSON
// Historical bulk-include block: once used to load all component classes eagerly.
// Replaced by the SPL autoloader registered below; kept for reference in case
// the autoloader approach needs to be reverted or compared against.
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
* SPL autoloader for Dédalo's PHP class namespace.
*
* Instantiated once at the bottom of this file (see $autoloader = new class_loader()).
* The constructor registers loader() with the SPL autoload stack so that any class
* not already included in the eager-include block above is resolved on first use.
*
* Naming convention handled by loader():
*   component_input_text  →  DEDALO_CORE_PATH/component_input_text/class.component_input_text.php
*   tool_export           →  DEDALO_TOOLS_PATH/tool_export/class.tool_export.php  (multi-root aware)
*   diffusion_fn          →  DEDALO_DIFFUSION_PATH/class.diffusion_fn.php
*
* All Dédalo classes follow the flat snake_case convention (no PSR-4 namespacing).
* Namespaced identifiers (containing '\') are passed through to the next handler in
* the SPL chain (typically the Composer autoloader) without logging.
*
* Security: implements SEC-048 (class-name allowlist + path-containment check).
* See loader() for full details.
*
* @package Dédalo
* @subpackage Core
*/
class class_loader {



	/**
	* __CONSTRUCT
	* Registers the SPL autoloader callback and declares the .php extension.
	*
	* spl_autoload_extensions() is called here rather than once globally so that
	* the extension is guaranteed to be set before the first spl_autoload() fallback
	* invocation, regardless of the order in which PHP's autoload stack is built.
	*/
	public function __construct() {

		spl_autoload_extensions('.php');
		spl_autoload_register([self::class, 'loader']);
	}//end __construct



	/**
	* LOADER
	* SPL autoload callback — resolves a Dédalo class name to a file path and
	* includes it.
	*
	* Resolution rules (evaluated in switch order):
	*   1. Namespaced names (contains '\') → return false; let Composer handle them.
	*   2. SEC-048 name filter: class name must match /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.
	*   3. 'tool*' prefix
	*      a. Infrastructure classes (tools_register, tool_ontology_map, tool_security,
	*         tool_paths) → DEDALO_TOOLS_PATH/tool_common/class.<name>.php
	*      b. All other tools → tool_paths::get_tool_class_file() (multi-root; consults
	*         DEDALO_ADDITIONAL_TOOLS roots first), with a fallback to the primary root.
	*   4. 'diffusion_' prefix → DEDALO_DIFFUSION_PATH/class.<name>.php
	*   5. Co-located thesaurus helpers (ts_node_repository, ts_term_resolver) →
	*      DEDALO_CORE_PATH/ts_object/class.<name>.php
	*      These share the ts_object/ directory rather than having their own directories.
	*   6. Co-located section helper (section_map) →
	*      DEDALO_CORE_PATH/section/class.section_map.php
	*   7. Default → DEDALO_CORE_PATH/<name>/class.<name>.php
	*
	* After resolving $file_path the method applies the SEC-048 second rail: it
	* calls realpath() on the resolved path and verifies it is within one of the
	* known DEDALO_* code roots. If the check fails the method emits trigger_error()
	* and returns false without including the file.
	*
	* Failure modes:
	*   - class name contains '\' → return false (pass to next SPL handler)
	*   - class name fails allowlist regex → trigger_error + return false
	*   - resolved path outside known roots → trigger_error + return false
	*   - file does not exist / include returns false → trigger_error + return false
	*
	* @param string $class_name - Name of the class PHP needs to resolve.
	* @return bool - true when the file was successfully included; false otherwise.
	*/
	public static function loader(string $class_name) : bool {

		// Namespaced classes (e.g. EasyRdf\Graph) are PSR-4 vendor classes handled
		// by Composer's autoloader. Pass them through silently so the SPL chain
		// continues without logging a false SEC-048 alarm.
		if (str_contains($class_name, '\\')) {
			return false;
		}

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
				// classes that live inside tool_common (subsystem infrastructure)
				$tool_common_classes = ['tools_register','tool_ontology_map','tool_security','tool_paths'];
				if (in_array($class_name, $tool_common_classes, true)) {
					$file_path = DEDALO_TOOLS_PATH . '/tool_common/class.' . $class_name . '.php';
					break;
				}
				// multi-root resolution (DEDALO_ADDITIONAL_TOOLS); falls back to
				// the primary root path when the tool exists in no root so the
				// historical "file not found" error stays unchanged
				$file_path = tool_paths::get_tool_class_file($class_name)
					?? DEDALO_TOOLS_PATH . '/' . $class_name . '/class.' . $class_name . '.php';
				break;

			// diffusion
			case (str_starts_with($class_name, 'diffusion_')):
				$file_path	= DEDALO_DIFFUSION_PATH . '/class.' . $class_name . '.php';
				break;

			// ts_object co-located helpers. These hot-path tree classes live
			// inside core/ts_object/ (alongside class.ts_object.php) instead of
			// in their own one-class-per-dir directories, so the default rule
			// below would resolve them to a non-existent path. ts_object.php
			// require_once's them, but direct consumers (e.g. area_thesaurus
			// calling ts_node_repository::fetch_node_info before instantiating
			// a ts_object) must still be able to autoload them on demand.
			case (in_array($class_name, ['ts_node_repository','ts_term_resolver'], true)):
				$file_path	= DEDALO_CORE_PATH . '/ts_object/class.' . $class_name . '.php';
				break;

			// section co-located helper. section_map is part of section resolution
			// and lives inside core/section/ (alongside class.section.php) rather
			// than in its own one-class-per-dir directory, so the default rule
			// below would resolve it to a non-existent path.
			case ($class_name==='section_map'):
				$file_path	= DEDALO_CORE_PATH . '/section/class.section_map.php';
				break;

			// RAG subsystem co-located classes. The whole RAG module lives flat
			// inside core/rag/ (class.<name>.php) rather than one-class-per-dir,
			// so the default rule would resolve them to a non-existent path.
			// dd_rag_api is eager-included above (like the other dd_*_api classes).
			case (in_array($class_name, [
					'DBi_vector', 'rag_vector_store', 'rag_config', 'rag_text_extractor',
					'rag_chunker', 'rag_fusion', 'rag_lexical', 'rag_indexer', 'rag_queue',
					'retrieval', 'rag_security', 'rag_llm_provider', 'rag_reranker',
					'embedding_provider', 'embedding_provider_factory',
					'embedding_provider_local_http', 'embedding_provider_openai',
					'embedding_provider_multimodal', 'rag_media_extractor', 'rag_characterizer'
				], true)):
				$file_path	= DEDALO_CORE_PATH . '/rag/class.' . $class_name . '.php';
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
		// additional tools roots (DEDALO_ADDITIONAL_TOOLS), already
		// realpath-canonicalized and policy-checked by tool_paths
		if (class_exists('tool_paths', false)) {
			foreach (array_slice(tool_paths::get_roots(), 1) as $additional_root) {
				$ok_roots[] = $additional_root->path;
			}
		}
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

		// (!) "do not exits" is a known typo in the error string (should be "does not exist");
		// do not correct it here as it may appear in log-monitoring patterns downstream.
		// The commented-out throw is kept to document the original intent (hard-fail vs
		// soft-fail): a trigger_error was chosen because some call sites probe existence
		// with class_exists() and must receive false rather than an uncaught exception.
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
// Instantiate the autoloader — this registers loader() with SPL and completes
// the bootstrap. All subsequent class_exists() / new $name calls will resolve
// through loader() before falling back to any other registered autoloader.
$autoloader	= new class_loader();
