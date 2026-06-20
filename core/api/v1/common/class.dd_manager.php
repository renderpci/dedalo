<?php declare(strict_types=1);
/**
* CLASS DD_MANAGER
* Central request dispatcher for the Dédalo v7 JSON API.
*
* All HTTP clients (browser UI, CLI tools, MCP, workers) route their API calls
* through a single JSON entrypoint (core/api/v1/json/index.php) that instantiates
* this class and calls manage_request(). The class is responsible for:
*
* - Validating the incoming request object (rqo) shape.
* - Enforcing authentication via login::is_logged() for all non-exempt actions.
* - Minting and verifying per-session CSRF tokens (SEC-008).
* - Enforcing a strict allowlist of routable API class names (dd_core_api,
*   dd_area_maintenance_api, dd_utils_api, dd_ontology_api, dd_agent_api,
*   dd_diffusion_api, dd_tools_api, dd_ts_api, dd_component_portal_api,
*   dd_component_text_area_api, dd_component_av_api, dd_component_3d_api,
*   dd_mcp_api, dd_component_info).
* - Requiring target methods to be declared public static and, when the API class
*   defines an API_ACTIONS constant, listed in that constant (SEC-024).
* - Checking maintenance-area permissions before routing to dd_area_maintenance_api.
* - Catching permission_exception from security::assert_* gates and converting them
*   to uniform error responses.
* - Appending a CSRF token and, when SHOW_DEBUG or SHOW_DEVELOPER is enabled, full
*   timing/memory/cache-hit debug metadata to every response.
*
* The entrypoint also calls sanitize_client_rqo() on every untrusted HTTP request
* (before manage_request()) to strip server-only SQO fields and clamp limits.
*
* @package Dédalo
* @subpackage API
*/
final class dd_manager {


	/**
	* Semantic version of this class, following Major.Minor.Patch convention.
	* Increment when the request/response contract of manage_request() changes in a
	* way that client code may need to detect (e.g. new required rqo fields).
	* @var string $version
	*/
	public static string $version = '1.0.0'; // 05-06-2019

	/**
	* Actions that are exempt from CSRF token verification (SEC-008).
	*
	* These are read-only or bootstrap calls that may legitimately arrive before
	* the client has obtained a token (e.g. the very first 'start' call that
	* establishes a session). Every action NOT in this list must present a valid
	* X-Dedalo-Csrf-Token header (or rqo->csrf_token body field) that matches the
	* per-session token stored in $_SESSION['dedalo']['csrf_token'].
	*
	* Extend with caution: any write or data-mutating action added here bypasses
	* CSRF protection entirely.
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
	* SANITIZE_CLIENT_RQO
	* Security scrub for a request object arriving from an UNTRUSTED HTTP client.
	* Strips server-only SQO fields (sentence/params/column_sql/table aliases),
	* forces parsed=false, clamps limit/offset/total, and reduces client-sent
	* show/search ddo_maps to the whitelisted display fields.
	*
	* MUST be called at every untrusted HTTP entry point (the JSON API entrypoint
	* and the worker SSE entrypoint) BEFORE manage_request(). It MUST NOT be called
	* on internal, server-built rqo's: those legitimately set sentence/params and
	* would be corrupted by the scrub. This is why the scrub lives here as an
	* explicit entry-point gate and not inside manage_request().
	* @see search_query_object::sanitize_client_sqo
	* @see request_config_object::sanitize_client_ddo_map
	* @param object $rqo
	* @return object The same $rqo, mutated in place.
	*/
	public static function sanitize_client_rqo( object $rqo ) : object {

		// SQO security scrub
		if (isset($rqo->sqo)) {
			$rqo->sqo = search_query_object::sanitize_client_sqo($rqo->sqo);
		}
		if (isset($rqo->options->sqo)) {
			$rqo->options->sqo = search_query_object::sanitize_client_sqo($rqo->options->sqo);
		}

		// ddo_map security scrub
		if (isset($rqo->show->ddo_map) && is_array($rqo->show->ddo_map)) {
			$rqo->show->ddo_map = request_config_object::sanitize_client_ddo_map($rqo->show->ddo_map);
		}
		if (isset($rqo->search->ddo_map) && is_array($rqo->search->ddo_map)) {
			$rqo->search->ddo_map = request_config_object::sanitize_client_ddo_map($rqo->search->ddo_map);
		}

		return $rqo;
	}//end sanitize_client_rqo



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
	* No-op constructor. dd_manager has no per-instance state; all methods are
	* either public static (CSRF helpers, sanitize gate) or instance-dispatched
	* through manage_request(). The class is instantiated once by the JSON API
	* entrypoint solely to call manage_request().
	*/
	public function __construct() {

	}//end __construct



	/**
	* MANAGE_REQUEST
	* Primary dispatcher: validates, authenticates, and routes an incoming API
	* request to the correct handler method on the target API class.
	*
	* Execution order:
	* 1. Start timing and (when SHOW_DEBUG) emit a request log entry.
	* 2. Reject the rqo immediately if it has no 'action' property.
	* 3. Reject 'dd_api' values that are not in the hard-coded allowlist.
	* 4. Enforce authentication for all actions not in $no_login_needed_actions.
	* 5. Enforce CSRF token verification for all actions not in CSRF_EXEMPT_ACTIONS.
	* 6. Confirm the target method exists, is public+static, and (when the API
	*    class declares API_ACTIONS) is listed in that constant (SEC-024).
	* 7. For dd_area_maintenance_api, verify the logged user has permission >= 2
	*    on DEDALO_AREA_MAINTENANCE_TIPO before dispatching.
	* 8. Call the method via $dd_api::{$rqo->action}($rqo); convert any
	*    permission_exception to a uniform error response.
	* 9. Skip response decoration for Generator return values (streaming SSE).
	* 10. Append csrf_token and, when SHOW_DEBUG/SHOW_DEVELOPER, a debug
	*     sub-object containing timing, memory, rqo snapshot, and per-subsystem
	*     cache metrics.
	*
	* All error paths return an stdClass with result=false, msg, and errors[].
	* permission_exception is caught internally and never propagates to the caller.
	*
	* @param object $rqo - Request object. Expected properties:
	*   - action    (string) Required. Name of the public static method to invoke.
	*   - dd_api    (string) Optional. Target API class name; defaults to 'dd_core_api'.
	*   - id        (string) Optional. Request identifier echoed in debug end-line.
	*   - source    (object) Optional. May carry a 'tipo' used in the debug end-line.
	*   - csrf_token (string) Optional. CSRF token for clients that cannot set headers.
	*   - options    (object) Optional. Action-specific payload; may carry csrf_token as fallback.
	* @return object - Response object. Always has:
	*   - result     (bool)   true on success, false on any error.
	*   - msg        (string) Human-readable outcome description.
	*   - action     (string) Echo of the requested action (set on most paths).
	*   - errors     (array)  Error code strings on failure.
	*   - csrf_token (string) Current session CSRF token (appended before return).
	*   - debug      (object) Present when SHOW_DEBUG or SHOW_DEVELOPER is true.
	*/
	final public function manage_request( object $rqo ) : object {
		$api_manager_start_time = start_time();

		// debug request header
		// Emits the full rqo as a bordered block in the PHP error log so that
		// developers can trace the exact payload that reached the dispatcher.
		// setAnalytics(false) arms the per-request hit/miss tracker; it is read
		// back at the end of the method if analytics mode was activated.
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
		// Accepting any class name from the client would allow arbitrary method calls
		// on any loaded PHP class. The allowlist is the primary guard that limits the
		// routable API surface to known, intentional handler classes.
			$allowed_api_classes = [
				'dd_core_api',
				'dd_area_maintenance_api',
				'dd_utils_api',
				'dd_ontology_api',
				'dd_agent_api',
				'dd_diffusion_api',
				'dd_tools_api',
				'dd_ts_api',
				'dd_component_portal_api',
				'dd_component_text_area_api',
				'dd_component_av_api',
				'dd_component_3d_api',
				'dd_mcp_api',
				'dd_component_info',
				'dd_rag_api'
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
			// (!) $dd_api is used as a class name string for static dispatch ($dd_api::{$action}).
			// The commented-out 'new $dd_api_type()' form was the original instantiation pattern;
			// all API handler methods are now static so no instantiation is needed.
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
				// Method not found, not public+static, or not listed in API_ACTIONS.
				// Unified error shape: the client always receives 'Undefined method' regardless
				// of whether the method exists but is private vs. truly missing — intentional
				// information hiding (avoid leaking internal class structure).
				$response = new stdClass();
					$response->result	= false;
					$response->msg		= "Error. Undefined or unauthorized $dd_api_type method (action) : ".$rqo->action;
					$response->errors[]	= 'Undefined method';
					$response->action	= $action;
				return $response;
			}else{
				// Method is valid — proceed with secondary checks and dispatch.
				if($dd_api==='dd_area_maintenance_api'){
					// check access to maintenance area
					// Permissions level 2 = write access; level 1 = read-only; 0 = no access.
					// Maintenance operations always require write level, regardless of the
					// specific action requested, to avoid per-action permission gaps.
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
					$response = $dd_api::{$rqo->action}( $rqo );
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

				// SEC: do not attempt to decorate Generators (PHP 8.2+ forbids dynamic properties on them).
				// Streaming SSE actions (e.g. workers) return a Generator that yields chunks
				// directly to the output buffer. Attaching ->action or ->csrf_token would throw
				// an Error on PHP 8.2+ readonly-object enforcement.
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
				// Single source of truth: metrics::get_summary() builds the grouped per-subsystem
				// breakdown (permissions, search, ontology, matrix, db, tools, presets,
				// request_config, …) and the aggregate server time. @see metrics::get_summary()
					$metrics	= [];
					$summary	= metrics::get_summary();

					// permissions context line (user id)
						if (isset($summary['groups']['Permissions'])) {
							$metrics[] = '--> calculated permissions for user ' . logged_user_id();
						}

					// per-group breakdown
						foreach ($summary['groups'] as $label => $group_metrics) {
							// db hostname context in the group label
							if ($label === 'DB connection') {
								$label .= ' (' . DEDALO_HOSTNAME_CONN . ')';
							}
							$metrics[] = $label;
							foreach ($group_metrics as $name => $value) {
								$unit = str_ends_with($name, '_time') ? ' ms' : '';
								$metrics[] = '--> ' . $name . ': ' . $value . $unit;
							}
						}

					// Section record cache (statics live on other classes, appended here)
						if(section_record::$section_record_total_calls > 0) {
							$metrics[] = 'Section record cache';
							$metrics[] = '--> section_record_total: ' . section_record::$section_record_total;
							$metrics[] = '--> section_record_total_calls: ' . section_record::$section_record_total_calls;
							$metrics[] = '--> section_record_data_total_calls: ' . section_record_data::$section_record_data_total_calls;
						}

					// Instance caches hit/miss (object_cache; lightweight counters, no serialize cost)
						$src_counters = section_record_instances_cache::getCounters();
						$cmp_counters = component_instances_cache::getCounters();
						if (($src_counters['hits'] + $src_counters['misses']) > 0 || ($cmp_counters['hits'] + $cmp_counters['misses']) > 0) {
							$metrics[] = 'Instance caches (hit/miss)';
							$metrics[] = '--> section_record_instances: ' . $src_counters['hits'] . ' hits / ' . $src_counters['misses'] . ' misses (' . $src_counters['hit_rate'] . ', size ' . $src_counters['size'] . ')';
							$metrics[] = '--> component_instances: ' . $cmp_counters['hits'] . ' hits / ' . $cmp_counters['misses'] . ' misses (' . $cmp_counters['hit_rate'] . ', size ' . $cmp_counters['size'] . ')';
						}

					// summary add always
						$metrics[] = 'Summary';
						$metrics[] = 'time: ' . $summary['summary']['time_ms'] . ' ms';

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
