<?php declare(strict_types=1);
/**
* DD_MANAGER
* Central API manager for handling Dédalo web requests.
*
* Key features:
* - Entry point for all API requests to the system
* - Request validation and authentication enforcement
* - Dynamic routing to appropriate API handlers
* - Performance metrics and debug information collection
* - Special handling for maintenance area access control
*
* Architecture:
* - Receives request objects (rqo) from client via JSON API
* - Validates structure and authenticates user sessions
* - Routes to specific API classes (dd_core_api, dd_area_maintenance_api, etc.)
* - Returns standardized response objects with debug info when enabled
*
* @package Dédalo
* @subpackage API
* @version 1.0.0
* @date 05-06-2019
*/
final class dd_manager {



	public static $version = '1.0.0'; // 05-06-2019



	/**
	* __CONSTRUCT
	*/
	public function __construct() {

	}//end __construct



	/**
	* MANAGE_REQUEST
	* Central API request handler that validates, authenticates, and routes
	* incoming requests to the appropriate API class methods.
	*
	* Key features:
	* - Validates request object (rqo) structure
	* - Authentication check with whitelist for public actions
	* - Dynamic routing to API classes based on `dd_api` property
	* - Special permission handling for maintenance area
	* - Debug and performance metrics collection
	*
	* Flow:
	* 1. Logs request details when SHOW_DEBUG is enabled
	* 2. Validates that rqo has required `action` property
	* 3. Checks user authentication (skips for whitelisted actions)
	* 4. Routes to appropriate API class (`dd_core_api` by default)
	* 5. Validates target method exists and executes
	* 6. Enforces maintenance area permissions if applicable
	* 7. Attaches debug info and performance metrics to response
	*
	* @param object $rqo Request object containing:
	*                    - action (string) Required. API method to invoke
	*                    - dd_api (string) Optional. API class name, defaults to 'dd_core_api'
	*                    - id (string) Optional. Request identifier
	*                    - source (object) Optional. May contain tipo property
	* @return object $response Standard response object with:
	*                    - result (bool) Success/failure status
	*                    - msg (string) Response message
	*                    - errors (array) Error codes if any
	*                    - action (string) The action that was processed
	*                    - debug (object) Optional. Debug info when enabled
	*
	* @throws Exception If authentication or permission checks fail
	*                   (returned as error response, not thrown)
	*/
	final public function manage_request( object $rqo ) : object {
		$api_manager_start_time = start_time();

		// debug
			if(SHOW_DEBUG===true) {
				$action			= $rqo->action ?? 'undefined';
				$text			= 'API REQUEST ' . $action;
				$text_length	= strlen($text) +1;
				$nchars			= 200;
				$line			= $text .' '. str_repeat(">", (int)$nchars - (int)$text_length).PHP_EOL.json_encode($rqo, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES).PHP_EOL.str_repeat("<", (int)$nchars).PHP_EOL;
				debug_log(__METHOD__ . PHP_EOL . $line, logger::DEBUG);

				// enable cache analytics
				section_record_instances_cache::setAnalytics(false);
			}

		// rqo check
			if (!property_exists($rqo,'action')) {

				$response = new stdClass();
					$response->result	= false;
					$response->msg		= "Invalid action var (not found in rqo)";
					$response->errors[]	= 'Undefined method';

				debug_log(__METHOD__." $response->msg ".to_string(), logger::ERROR);

				return $response;
			}

		// dd_api class whitelist check
			$allowed_api_classes = [
				'dd_core_api',
				'dd_area_maintenance_api',
				'dd_utils_api',
				'dd_diffusion_api',
				'dd_tools_api',
				'dd_ts_api',
				'dd_component_portal_api',
				'dd_component_text_area_api',
				'dd_component_av_api',
				'dd_component_3d_api'
			];
			$dd_api_type	= $rqo->dd_api ?? 'dd_core_api';
			if (!in_array($dd_api_type, $allowed_api_classes, true)) {

				debug_log(__METHOD__." Error. Invalid API class: $dd_api_type", logger::ERROR);

				$response = new stdClass();
					$response->result	= false;
					$response->msg		= 'Error. Invalid API class: '.$dd_api_type;
					$response->errors[]	= 'invalid_api_class';
				return $response;
			}
			$dd_api			= $dd_api_type; // new $dd_api_type(); // class selected

		// logged check
			$no_login_needed_actions = [
				'start',
				'change_lang',
				'login',
				'get_login_context',
				'install',
				'get_install_context',
				'get_environment',
				'get_ontology_update_info',
				'get_code_update_info',
				'get_server_ready_status'
			];
			$action = $rqo->action ?? null;
			if (true===in_array($action, $no_login_needed_actions)) {
				// do not check login here
			}else{
				if (login::is_logged()!==true) {

					debug_log(__METHOD__." Error. user is not logged !! [action:$action]", logger::ERROR);

					$response = new stdClass();
						$response->result	= false;
						$response->msg		= 'Error. user is not logged !! [action:'.$action.']';
						$response->errors[]	= 'not_logged';
					return $response;
				}
			}

		// actions
			if ( !method_exists($dd_api, $rqo->action) ) {
				// error
				$response = new stdClass();
					$response->result	= false;
					$response->msg		= "Error. Undefined $dd_api_type method (action) : ".$rqo->action;
					$response->errors[]	= 'Undefined method';
					$response->action	= $action;
				return $response;
			}else{
				// success
				if($dd_api==='dd_area_maintenance_api'){
					// check access to maintenance area
					$permissions = common::get_permissions(DEDALO_AREA_MAINTENANCE_TIPO, DEDALO_AREA_MAINTENANCE_TIPO);
					if ($permissions<2) {
						$response = new stdClass();
							$response->result	= false;
							$response->msg		= 'Error. user has not permissions ! [action:'.$rqo->action.']';
							$response->errors[]	= 'permissions error';
							$response->action	= $action;
						return $response;
					}
				}
				$response			= $dd_api::{$rqo->action}( $rqo );
				$response->action	= $action;
			}

		// debug
			if(SHOW_DEBUG===true || SHOW_DEVELOPER===true) {
				$total_time_api_exec = exec_time_unit($api_manager_start_time,'ms').' ms';
				$api_debug = new stdClass();
					$api_debug->api_exec_time	= $total_time_api_exec;
					$api_debug->memory_usage	= dd_memory_usage();
					$api_debug->rqo				= $rqo;
					$api_debug->rqo_string		= is_object($rqo)
						? json_encode($rqo, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
						: $rqo;

				if (isset($response->debug)) {
					// add to existing debug properties
					foreach ($api_debug as $key => $value) {
						$response->debug->{$key} = $value;
					}
				}else{
					// create new debug property
					$response->debug = $api_debug;
				}

				// metrics
					$metrics = [];

					// permissions stats
						if(metrics::$security_permissions_total_calls > 0) {
							$metrics[] = 'Permissions';
							$metrics[] = '--> calculated permissions for user ' . logged_user_id();
							$metrics[] = '--> calculated permissions_table ' . metrics::$security_permissions_table_time.' ms';
							$metrics[] = '--> calculated security_permissions_table_count ' . metrics::$security_permissions_table_count;
							$metrics[] = '--> security_permissions_total_time: ' . metrics::$security_permissions_total_time.' ms';
							$metrics[] = '--> security_permissions_total_calls: '. metrics::$security_permissions_total_calls;
						}

					// get_tools stats
						if(metrics::$get_tools_total_calls > 0) {
							$metrics[] = 'Tools';
							$metrics[] = '--> get_tools_total_time: ' . metrics::$get_tools_total_time.' ms';
							$metrics[] = '--> get_tools_total_calls: '. metrics::$get_tools_total_calls;
							$metrics[] = '--> get_tools_total_calls_cached: '. metrics::$get_tools_total_calls_cached;
							$metrics[] = '--> get_tool_config_total_time: ' . metrics::$get_tool_config_total_time.' ms';
							$metrics[] = '--> get_tool_config_total_calls: '. metrics::$get_tool_config_total_calls;
						}

					// presets
						if(metrics::$presets_total_calls > 0) {
							$metrics[] = 'Presets (request config)';
							$metrics[] = '--> presets_total_time: '  . metrics::$presets_total_time.' ms';
							$metrics[] = '--> presets_total_calls: ' . metrics::$presets_total_calls;
						}

					// search stats
						if(metrics::$search_total_calls > 0) {
							$metrics[] = 'Search';
							$metrics[] = '--> search_total_time: ' . metrics::$search_total_time.' ms';
							$metrics[] = '--> search_total_calls: '. metrics::$search_total_calls;
						}

					// ontology stats
						if(metrics::$ontology_total_calls > 0) {
							$metrics[] = 'Ontology load';
							$metrics[] = '--> ontology_total_time: ' . metrics::$ontology_total_time.' ms';
							$metrics[] = '--> ontology_total_calls: '. metrics::$ontology_total_calls;
							$metrics[] = '--> ontology_total_calls_cached: '. metrics::$ontology_total_calls_cached;
							$metrics[] = '--> ontology_total_calls_different: '. (metrics::$ontology_total_calls - metrics::$ontology_total_calls_cached);
						}

					// matrix stats
						if(metrics::$matrix_total_calls > 0) {
							$metrics[] = 'matrix load';
							$metrics[] = '--> matrix_total_time: ' . metrics::$matrix_total_time.' ms';
							$metrics[] = '--> matrix_total_calls: '. metrics::$matrix_total_calls;
						}

					// exec_search stats (matrix_db_manager)
						if(metrics::$exec_search_total_calls > 0) {
							$metrics[] = 'Search exec_search (matrix_db_manager)';
							$metrics[] = '--> exec_search_total_time: ' . metrics::$exec_search_total_time.' ms';
							$metrics[] = '--> exec_search_total_calls: '. metrics::$exec_search_total_calls;
						}

					// exec_search stats (dd_ontology_db_manager)
						if(metrics::$exec_dd_ontology_search_total_calls > 0) {
							$metrics[] = 'Search exec_search (dd_ontology_db_manager)';
							$metrics[] = '--> exec_dd_ontology_search_total_time: ' . metrics::$exec_dd_ontology_search_total_time.' ms';
							$metrics[] = '--> exec_dd_ontology_search_total_calls: '. metrics::$exec_dd_ontology_search_total_calls;
						}

					// Context
						if(metrics::$structure_context_total_calls > 0) {
							$metrics[] = 'Context (all)';
							$metrics[] = '--> structure_context_total_time: '  . metrics::$structure_context_total_time.' ms';
							$metrics[] = '--> structure_context_total_calls: ' . metrics::$structure_context_total_calls;
						}

					// data
						if(metrics::$data_total_calls > 0) {
							$metrics[] = 'Data (components)';
							$metrics[] = '--> data_total_time: '  . metrics::$data_total_time.' ms';
							$metrics[] = '--> data_total_calls: ' . metrics::$data_total_calls;
						}

					// Section record cache
						if(section_record::$section_record_total_calls > 0) {
							$metrics[] = 'Section record cache';
							$metrics[] = '--> section_record_total: ' . section_record::$section_record_total;
							$metrics[] = '--> section_record_total_calls: ' . section_record::$section_record_total_calls;
							$metrics[] = '--> section_record_data_total_calls: ' . section_record_data::$section_record_data_total_calls;
						}

					// section_save stats
						if(metrics::$section_save_total_calls > 0) {
							$metrics[] = 'section_save';
							$metrics[] = '--> section_save_total_time: ' . metrics::$section_save_total_time.' ms';
							$metrics[] = '--> section_save_total_calls: '. metrics::$section_save_total_calls;
						}

					// db connection
						if(metrics::$db_connection_total_calls > 0) {
							$metrics[] = 'DB connection (' . DEDALO_HOSTNAME_CONN . ')';
							$metrics[] = '--> db_connection_total_time: ' . metrics::$db_connection_total_time.' ms';
							$metrics[] = '--> db_connection_total_calls: '. metrics::$db_connection_total_calls;
							$metrics[] = '--> db_connection_total_calls_cached: '. metrics::$db_connection_total_calls_cached;
						}

					// summary add always
						$metrics[] = 'Summary';
						$metrics[] = 'time: ' . (
							metrics::$security_permissions_total_time +
							metrics::$exec_search_total_time +
							metrics::$exec_dd_ontology_search_total_time +
							metrics::$ontology_total_time +
							metrics::$matrix_total_time +
							metrics::$get_tools_total_time +
							metrics::$section_save_total_time +
							metrics::$db_connection_total_time +
							metrics::$structure_context_total_time +
							metrics::$presets_total_time
						);

					debug_log(__METHOD__ . PHP_EOL
						. implode(PHP_EOL, $metrics)
						, logger::WARNING
					);
					if(section_record_instances_cache::getAnalyticsStatus()===true) {
						error_log('--> section_record_cache_hit_stats ' . json_encode(section_record_instances_cache::getStats()));
						error_log('--> component_instances_cache_hit_stats ' . json_encode(component_instances_cache::getStats()));
						error_log(section_record_instances_cache::exportAnalytics('json'));
					}

				// end line info
					$id			= $rqo->id ?? $rqo->source?->tipo ?? '';
					$text			= 'API REQUEST (dd_manager) ' . $rqo->action . ' (' . $id . ') END IN ' . $total_time_api_exec .' - ' .exec_time_unit($api_manager_start_time,'ms') . ' - ' . dd_memory_usage();
					$line			= $text .' '. PHP_EOL;
					debug_log(__METHOD__ . PHP_EOL . $line, logger::DEBUG);
			}


		return $response;
	}//end manage_request



}//end class dd_manager
