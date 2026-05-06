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


	/**
	 * Version constant.
	 * Format: "Major.Minor.Patch" (e.g., "1.0.0" for Dédalo 7.x).
	 * @var string
	 */
	public static string $version = '1.0.0'; // 05-06-2019

	/**
	* SEC-008: CSRF protection.
	*
	* The server mints a per-session 32-byte random token on first contact and
	* echoes it back on every response (`$response->csrf_token`). The client
	* must echo it on every subsequent state-changing call via the
	* `X-Dedalo-Csrf-Token` HTTP header (or as `rqo->csrf_token` for clients
	* that cannot set custom headers).
	*
	* The actions in CSRF_EXEMPT_ACTIONS are read-only / bootstrap calls that may
	* run before the client has obtained a token; everything else is rejected
	* with a 403-style error if the token is missing or wrong.
	*/
	private const CSRF_EXEMPT_ACTIONS = [
		'start',
		'get_environment',
		'get_login_context',
		'get_install_context',
		'get_server_ready_status',
		'get_ontology_update_info',
		'get_code_update_info',
		'get_diffusion_info',
		'get_dedalo_files',
		'read_raw'
	];



	/**
	* ENSURE_CSRF_TOKEN
	* Returns the current per-session CSRF token. Mints a new one only if the
	* session is still in PHP_SESSION_ACTIVE state (i.e. session_write_close()
	* has not been called yet); otherwise it just returns whatever token is
	* already stored, or '' when none. The API entrypoint calls
	* {@see bootstrap_csrf_token()} BEFORE session_write_close() so that the
	* token is persisted to storage on the very first request.
	* @return string Token in hex (64 chars), or '' when none is available.
	*/
	private static function ensure_csrf_token() : string {

		if (session_status() === PHP_SESSION_ACTIVE) {
			if (!isset($_SESSION['dedalo']) || !is_array($_SESSION['dedalo'])) {
				$_SESSION['dedalo'] = [];
			}
			if (empty($_SESSION['dedalo']['csrf_token']) || !is_string($_SESSION['dedalo']['csrf_token'])) {
				try {
					$_SESSION['dedalo']['csrf_token'] = bin2hex(random_bytes(32));
				} catch (Throwable $e) {
					debug_log(__METHOD__.' Error generating CSRF token: '.$e->getMessage(), logger::ERROR);
					return '';
				}
			}
		}
		// Read directly: $_SESSION superglobal stays populated even after
		// session_write_close() has been called by the API entrypoint.
		$token = $_SESSION['dedalo']['csrf_token'] ?? '';
		return is_string($token) ? $token : '';
	}//end ensure_csrf_token



	/**
	* BOOTSTRAP_CSRF_TOKEN
	* Public entrypoint hook: ensures a CSRF token exists in $_SESSION while the
	* session is still open for writes. The API entrypoint MUST call this before
	* session_write_close() so that the token is persisted to disk and the
	* response can echo it back to the client.
	* @return string The current/newly-minted token.
	*/
	public static function bootstrap_csrf_token() : string {

		return self::ensure_csrf_token();
	}//end bootstrap_csrf_token



	/**
	* GET_CSRF_TOKEN_FROM_REQUEST
	* Pull the client-supplied token from the request, preferring the dedicated
	* header but accepting a body field for clients that cannot set headers.
	* @param object $rqo
	* @return string
	*/
	private static function get_csrf_token_from_request(object $rqo) : string {

		$header = $_SERVER['HTTP_X_DEDALO_CSRF_TOKEN'] ?? '';
		if (is_string($header) && $header !== '') {
			return $header;
		}
		if (isset($rqo->csrf_token) && is_string($rqo->csrf_token)) {
			return $rqo->csrf_token;
		}
		// SEC-008: multipart upload fallback. The JSON entrypoint maps every
		// POST field of an `action=upload` (or any FormData) request into
		// `$rqo->options->{field}` (see core/api/v1/json/index.php). XHR
		// clients that cannot reliably set custom headers (CORS, legacy
		// editors like ckeditor) may instead include the token as a regular
		// form field; honour that as the last fallback.
		if (
			isset($rqo->options)
			&& is_object($rqo->options)
			&& isset($rqo->options->csrf_token)
			&& is_string($rqo->options->csrf_token)
		) {
			return $rqo->options->csrf_token;
		}
		return '';
	}//end get_csrf_token_from_request



	/**
	* VERIFY_CSRF_TOKEN
	* Returns true when the request carries a valid CSRF token matching the
	* one stored in the user's session. Comparison is constant-time.
	* @param object $rqo
	* @return bool
	*/
	private static function verify_csrf_token(object $rqo) : bool {

		// Note: do not gate on session_status(). The API entrypoint calls
		// session_write_close() before dispatch when rqo->prevent_lock is true,
		// which puts session_status() back to PHP_SESSION_NONE; however the
		// $_SESSION superglobal is still populated in memory and remains the
		// authoritative source for the expected token.
		$expected = $_SESSION['dedalo']['csrf_token'] ?? '';
		$provided = self::get_csrf_token_from_request($rqo);
		if (!is_string($expected) || $expected === '' || !is_string($provided) || $provided === '') {
			return false;
		}
		return hash_equals($expected, $provided);
	}//end verify_csrf_token



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
			// SEC-018: require $action to be a string and use strict comparison so that
			// non-string values (e.g. arrays/ints from a hostile JSON body) cannot match
			// the no-login allowlist via PHP's loose type juggling.
			if (is_string($action) && in_array($action, $no_login_needed_actions, true)) {
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

		// SEC-008: CSRF check. Bootstrap/read-only actions in CSRF_EXEMPT_ACTIONS
		// can be invoked before the client has obtained a token. Every other
		// action must echo back the per-session token via the X-Dedalo-Csrf-Token
		// header (or rqo->csrf_token).
			if (is_string($action) && !in_array($action, self::CSRF_EXEMPT_ACTIONS, true)) {
				if (!self::verify_csrf_token($rqo)) {

					debug_log(__METHOD__." Error. Invalid or missing CSRF token [action:$action]", logger::ERROR);

					// Note: HTTP status stays at 200 so the client can read the
					// JSON body and execute its transparent-retry path. The rest
					// of this API uses the same convention for app-level errors.
					$response = new stdClass();
						$response->result	= false;
						$response->msg		= 'Error. Invalid or missing CSRF token';
						$response->errors[]	= 'csrf_failed';
						$response->action	= $action;
						// Provide a fresh token so the client can retry without a full
						// re-bootstrap. (Only meaningful when the failure was 'missing'.)
						$response->csrf_token = self::ensure_csrf_token();
					return $response;
				}
			}

		// actions
		// SEC-024: opt-in explicit allowlist. When the API class declares an
		// API_ACTIONS class constant the action MUST appear in it; otherwise we
		// fall back to the historical "any public-static method on the class is
		// callable" rule. The opt-in form is strongly preferred for new classes
		// because it makes the API surface explicit and prevents an internal
		// helper added later from accidentally becoming a remote endpoint.
			$is_valid_public_method = false;
			if (method_exists($dd_api, $rqo->action)) {
				$reflection = new ReflectionMethod($dd_api, $rqo->action);
				if ($reflection->isPublic() && $reflection->isStatic()) {
					if (defined($dd_api . '::API_ACTIONS')) {
						$api_actions = constant($dd_api . '::API_ACTIONS');
						$is_valid_public_method = is_array($api_actions)
							&& in_array($rqo->action, $api_actions, true);
					} else {
						$is_valid_public_method = true;
					}
				}
			}

			if ( !$is_valid_public_method ) {
				// error
				$response = new stdClass();
					$response->result	= false;
					$response->msg		= "Error. Undefined or unauthorized $dd_api_type method (action) : ".$rqo->action;
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
				try {
					$response			= $dd_api::{$rqo->action}( $rqo );
				} catch (permission_exception $e) {
					// SEC: a security::assert_* gate inside the API method denied the request.
					// Convert to a uniform response so callers always see the same shape.
					debug_log(__METHOD__
						. ' permission_exception: ' . $e->getMessage() . PHP_EOL
						. ' context: ' . $e->api_context . PHP_EOL
						. ' user_id: ' . to_string(logged_user_id()) . PHP_EOL
						. ' action: ' . $rqo->action . PHP_EOL
						. ' dd_api: ' . $dd_api
						, logger::ERROR
					);
					$response = new stdClass();
						$response->result	= false;
						$response->msg		= 'Error. ' . $e->getMessage();
						$response->errors	= ['permissions_denied'];
				}

				// SEC: do not attempt to decorate Generators (PHP 8.2+ forbids dynamic properties on them)
				if ($response instanceof \Generator) {
					return $response;
				}

				$response->action	= $action;
			}

		// SEC-008: attach the current CSRF token to every response so the client
		// always has a fresh one to use on the next call. ensure_csrf_token() mints
		// one on demand if the session does not yet have one (e.g. on the very
		// first `start` call).
			if (is_object($response)) {
				$response->csrf_token = self::ensure_csrf_token();
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
