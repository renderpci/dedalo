<?php declare(strict_types=1);
/**
* DD_TOOLS_API
* HTTP API surface for the Dédalo tools subsystem.
*
* Handles two remote-callable actions exposed through the REST gateway:
*  - user_tools   : returns the list of tools the current user is authorised to access,
*                   optionally filtered to a requested subset (used to populate UI toolbars).
*  - tool_request : secure generic dispatcher that loads a tool class, validates the
*                   caller's authorisation and the method's signature, then invokes a
*                   single public static method, either synchronously (HTTP response)
*                   or asynchronously (detached CLI process via exec_::request_cli).
*
* Security layers applied in tool_request (in order):
*  1. sanitize_key_dir($source->model) — strip path-traversal chars from the tool name.
*  2. Global registry whitelist — the tool must be in tool_common::get_all_registered_tools().
*  3. Per-user authorisation — the logged-in user must hold the tool via their profile
*     (tool_common::get_user_tools).
*  4. Path confinement (SEC-069 / SEC-084) — realpath() of the class file must sit under
*     an approved tool root returned by tool_paths::get_roots().
*  5. API_ACTIONS allowlist (SEC-024) — the requested method must be listed in the tool
*     class's `public const API_ACTIONS` declaration, resolved by tool_security::resolve_action.
*  6. Reflection visibility check — the method must be public and static.
*  7. Signature contract (SEC-084) — the method must accept either zero parameters or a
*     single `object` / class-typed parameter; scalar or multi-param signatures are rejected.
*  8. Declarative per-action permission gate — tool_security::assert_action_permission runs
*     any map-form API_ACTIONS permission spec against the incoming options before dispatch.
*
* Called by dd_manager, which routes any request whose `dd_api` value is 'dd_tools_api'
* to the matching method here.
*
* Relationships:
*  - Dispatched by: core/api/v1/common/class.dd_manager.php
*  - Tool registry/auth: tools/tool_common/class.tool_common.php
*  - Path resolution: tools/tool_common/class.tool_paths.php
*  - Method allowlist + permission gates: tools/tool_common/class.tool_security.php
*  - Background execution: core/common/class.exec_.php (exec_::request_cli)
*
* @package Dédalo
* @subpackage Core
*/
final class dd_tools_api {



	/**
	* Explicit allowlist of methods callable as remote API actions.
	*
	* dd_manager enforces this constant (SEC-024): any action not listed here
	* is rejected before the method is ever looked up. Adding a new entry
	* here also requires the corresponding public static method to exist in
	* this class.
	*
	* @var array<string>
	*/
	public const API_ACTIONS = [
		'user_tools',
		'tool_request'
	];



	/**
	* USER_TOOLS
	* Returns the list of tools the logged-in user is authorised to access.
	*
	* Each entry in the result is a DDO (Dédalo Data Object) representing a single
	* tool in "simple context" form, containing the tool's tipo, label, icon, URL,
	* and other fields needed to render a toolbar entry on the client.
	*
	* If `options.ar_requested_tools` is provided, only tools whose `name` property
	* appears in that array are included. This lets a caller request only the subset
	* of tools relevant to a particular UI area without needing a second round-trip.
	*
	* @param object $rqo - Dédalo request object:
	* {
	*   dd_api  : 'dd_tools_api',
	*   action  : 'user_tools',
	*   source  : source,
	*   options : {
	*     ar_requested_tools : string[]  // optional — names to include; null means all
	*   }
	* }
	* @return object $response - Standard response:
	* {
	*   result : object[]  // array of DDO tool contexts (empty array if none match)
	*   msg    : string
	*   errors : array
	* }
	*/
	public static function user_tools(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// options
			$options = $rqo->options;
			// list of requested tools
			$ar_requested_tools	= $options->ar_requested_tools ?? null;

		// all user authorized tools
			$user_id	= logged_user_id();
			$user_tools	= tool_common::get_user_tools($user_id);

		$result = [];
		foreach ($user_tools as $tool_object) {

			// Filter step — skip tools the caller did not ask for.
			// When $ar_requested_tools is null or empty, all authorised tools pass through.
			if(!empty($ar_requested_tools) && !in_array($tool_object->name, $ar_requested_tools)) {
				continue;
			}

			// Creates a DDO as tool context
			$tool_simple_context = tool_common::create_tool_simple_context($tool_object);

			$result[] = $tool_simple_context;
		}

		// response
			$response->result	= $result;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning! Request done with errors';


		return $response;
	}//end user_tools



	/**
	* TOOL_REQUEST
	* Secure generic dispatcher: loads a tool class, validates the caller's authorisation
	* and the requested method, then invokes it — either synchronously or as a detached
	* background CLI process.
	*
	* Successful invocation requires passing eight sequential security gates (see class-level
	* doc for the ordered list). Any gate failure returns an error response immediately without
	* proceeding to subsequent checks.
	*
	* The `options` object from the RQO is forwarded verbatim as the sole argument to the
	* tool method. The tool method must conform to the Dédalo single-object-argument contract:
	*   public static function my_action(object $options) : object { ... }
	*
	* Background mode (`options.background_running === true`) delegates to exec_::request_cli,
	* which spawns a detached PHP process via process_runner.php and returns immediately.
	* The permission gate (assert_action_permission) runs BEFORE the fork to ensure the
	* HTTP caller cannot bypass it via the asynchronous path.
	*
	* @param object $rqo - Dédalo request object:
	* {
	*   action  : "tool_request",
	*   dd_api  : "dd_tools_api",
	*   source  : {
	*     typo   : "source",
	*     action : string,  // method name to call on the tool class
	*     model  : string   // tool name, e.g. "tool_indexation"
	*   },
	*   options : {
	*     background_running : bool     // optional; true → async CLI fork
	*     // ... tool-specific parameters forwarded as-is to the method
	*   }
	* }
	* @return object $response - Shape mirrors the tool method's return value on success:
	* {
	*   result : mixed
	*   msg    : string
	*   errors : array  // only present on API-layer failures; tool may add its own
	* }
	* @throws permission_exception - Thrown by assert_action_permission when a declarative
	*   permission spec is violated; caught by dd_manager and converted to a 'permissions_denied'
	*   client response.
	*/
	public static function tool_request(object $rqo) : object {

		// options
			$options			= $rqo->options ?? new stdClass();
			$fn_arguments		= $options;
			$background_running	= $options->background_running ?? false;

		// source
			$source			= $rqo->source;
			// sanitize_key_dir strips path-traversal characters (../ etc.) from the name.
			$tool_name		= sanitize_key_dir($source->model);
			$tool_method	= $source->action;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__METHOD__.']. ';
				$response->errors	= [];

		// check valid options
			// Guard: $options was derived from $rqo->options which may have been overridden
			// by a client supplying a non-object value. Reject early to prevent type errors
			// in subsequent gates that call object-property access on $options.
			if (!is_object($options)) {
				$response->msg = 'Error. invalid options ';
				$response->errors[] = 'Invalid options type';
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' options: ' .to_string($options)
					, logger::ERROR
				);
				return $response;
			}

		// whitelist validation - get valid tool names from registered tools
			// Gate 2: the tool must be in the global registry before any file I/O
			// or per-user check. This prevents probing for arbitrary class names.
			$registered_tools	= tool_common::get_all_registered_tools();
			$valid_tool_names	= array_map(fn($tool) => $tool->name, $registered_tools);
			if (!in_array($tool_name, $valid_tool_names)) {
				$response->errors[] = 'Invalid tool name: ' . $tool_name;
				debug_log(__METHOD__ . ' Error: Tool not in whitelist: ' . $tool_name, logger::ERROR);
				return $response;
			}

		// per-user authorization check
			// SECURITY: a tool name in the global registry is not enough. The logged user
			// must also be authorized for the tool through their profile. A previous
			// version of this method only checked the global whitelist, letting any logged
			// user invoke any method on any registered tool (e.g. tool_user_admin).
			$logged_user_id		= logged_user_id();
			$user_tools			= tool_common::get_user_tools($logged_user_id);
			$user_tool_names	= array_map(fn($tool) => $tool->name, $user_tools);
			if (!in_array($tool_name, $user_tool_names, true)) {
				$response->errors[] = 'Tool not authorized for current user: ' . $tool_name;
				debug_log(__METHOD__
					. ' Error: Tool not authorized for current user.' . PHP_EOL
					. ' tool_name: ' . $tool_name . PHP_EOL
					. ' user_id: ' . to_string($logged_user_id)
					, logger::ERROR
				);
				return $response;
			}

		// load tool class file (multi-root aware, see tool_paths)
			// tool_paths::get_tool_class_file searches DEDALO_TOOLS_PATH and any
			// DEDALO_ADDITIONAL_TOOLS roots in declaration order.
			$class_file = tool_paths::get_tool_class_file($tool_name);
			if ($class_file===null || !file_exists($class_file)) {
				$response->msg = 'Error. tool class_file do not exists. Create a new one in format class.my_tool_name.php ';
				if(SHOW_DEBUG===true) {
					$response->msg .= '. file: '.to_string($class_file);
				}
				return $response;
			}
			// SEC-069 / SEC-084: realpath confinement on top of the
			// `sanitize_key_dir` + tool registry whitelist above. Refuse to
			// `require` any file whose canonical path escapes the set of
			// allowed tool roots (primary DEDALO_TOOLS_PATH plus any
			// DEDALO_ADDITIONAL_TOOLS roots — already canonicalized and
			// policy-checked by tool_paths::get_roots), even if constants
			// or symlinks have been tampered with at the filesystem level.
			$real_tool = realpath($class_file);
			$confined  = false;
			if ($real_tool !== false) {
				foreach (tool_paths::get_roots() as $tools_root) {
					if ($tools_root->path !== false
						&& str_starts_with($real_tool, $tools_root->path . DIRECTORY_SEPARATOR)) {
						$confined = true;
						break;
					}
				}
			}
			if (!$confined) {
				$response->errors[] = 'Tool path confinement failed';
				debug_log(__METHOD__
					. ' SEC-084 tool path escapes the allowed tool roots.' . PHP_EOL
					. ' real_tool: ' . to_string($real_tool)
					, logger::ERROR
				);
				return $response;
			}
			// include the canonical path that was actually validated (avoids a
			// symlink-swap TOCTOU between realpath() and the include)
			require_once $real_tool;

		// SEC-024: per-tool method allowlist (API_ACTIONS), enforced by default.
			// Fail-fast on the allowlist before any reflection on the method.
			// Tools must declare `public const API_ACTIONS` (list form or map form
			// with declarative permission specs — see tool_security class docs).
			// Installs migrating third-party tools may temporarily set
			// `define('TOOLS_REQUIRE_API_ACTIONS', false);` to restore the historical
			// "any public-static method" rule (logged as deprecated).
			$action = tool_security::resolve_action($tool_name, $tool_method);
			if ($action->ok !== true) {
				debug_log(__METHOD__
					. ' Error: tool method not in API_ACTIONS allowlist.' . PHP_EOL
					. ' tool_name: ' . $tool_name . PHP_EOL
					. ' tool_method: ' . $tool_method
					, logger::ERROR
				);
				$response->msg = 'Error. tool method not allowed: ' . $tool_method;
				$response->errors[] = 'unauthorized_method';
				return $response;
			}

		// method (static) + signature validation
			// Gate 6: ensure the method actually exists, is public, and is static.
			// Lifecycle/framework hooks intentionally excluded from API_ACTIONS would
			// already have been caught above; this is a final defence against
			// accidental resolution to a non-dispatchable method.
			$is_valid       = false;
			$reflection     = null;
			$signature_ok   = false;
			if (method_exists($tool_name, $tool_method)) {
				try {
					$reflection = new ReflectionMethod($tool_name, $tool_method);
					if ($reflection->isPublic() && $reflection->isStatic()) {
						$is_valid = true;
					}
				} catch (Exception $e) {
					// Ignore exception and leave is_valid false
				}
			}
			if (!$is_valid) {
				$response->msg = 'Error. tool method not accessible: '.$tool_method;
				$response->errors[] = 'unauthorized_method';
				return $response;
			}

		// SEC-084: reflect-validate the method signature. `tool_request` is a
			// generic dispatch surface — without an explicit signature contract,
			// passing `$options` (an arbitrary user-shaped object) to a method
			// that expects something else can either trigger a TypeError that
			// leaks the parameter list in the response, or — worse — match a
			// method that takes a flexible / variadic / no-typehint argument
			// and run with attacker-shaped state. The Dédalo tool convention
			// is that any public static API method takes either a single
			// `object $rqo` or no parameter at all. We refuse anything else.
			try {
				$params = $reflection->getParameters();
				$param_count = count($params);
				if ($param_count > 1) {
					$signature_ok = false;
				} else if ($param_count === 0) {
					// no-arg methods are allowed (e.g. status / info hooks)
					$signature_ok = true;
				} else {
					$param = $params[0];
					$param_type = $param->getType();
					if ($param_type instanceof ReflectionNamedType) {
						$type_name = $param_type->getName();
						// Accept `object` (Dédalo standard) or any class name —
						// PHP's stdClass is ubiquitous across the codebase. We
						// reject scalar (string/int/array) param types because
						// $fn_arguments is always an object.
						$signature_ok = ($type_name === 'object' || $type_name === 'stdClass'
							|| (class_exists($type_name) && (new ReflectionClass($type_name))->isInstance($fn_arguments)));
					} else if ($param_type === null) {
						// Untyped parameter — historical Dédalo tools. Allowed
						// for back-compat; logged so we can rotate the tool
						// surface to typed signatures over time.
						debug_log(__METHOD__
							. ' SEC-084 tool method has untyped parameter (back-compat allowed).' . PHP_EOL
							. ' tool_name: ' . $tool_name . PHP_EOL
							. ' tool_method: ' . $tool_method
							, logger::WARNING
						);
						$signature_ok = true;
					}
				}
			} catch (Throwable $e) {
				$signature_ok = false;
			}
			if (!$signature_ok) {
				$response->msg = 'Error. tool method signature mismatch: '.$tool_method;
				$response->errors[] = 'signature_mismatch';
				debug_log(__METHOD__
					. ' SEC-084 tool method signature does not match (object $rqo) contract.' . PHP_EOL
					. ' tool_name: ' . $tool_name . PHP_EOL
					. ' tool_method: ' . $tool_method
					, logger::ERROR
				);
				return $response;
			}

		// SEC-024 (§9.3): declarative per-action permission gate (map-form API_ACTIONS).
			// MUST run here, BEFORE the background fork below: exec_::request_cli
			// detaches a CLI process and reports success immediately, so any gate
			// placed after it (or only inside the tool method body) would be
			// unobservable by the HTTP caller. A thrown permission_exception
			// propagates to dd_manager::request, which converts it to the
			// standard 'permissions_denied' client response.
			tool_security::assert_action_permission(
				$action->spec,
				$options,
				__METHOD__ . ' ' . $tool_name . '::' . $tool_method
			);

		// background_running / direct cases
			switch (true) {
				case ($background_running===true):

					// running in CLI
					// Build the descriptor object expected by exec_::request_cli.
					// The method is invoked inside a detached process_runner.php child;
					// the HTTP response returns the PID / status immediately.
					$cli_options = new stdClass();
						$cli_options->class_name	= $tool_name;
						$cli_options->method_name	= $tool_method;
						$cli_options->class_file	= $class_file;
						$cli_options->params		= $options;

					$fn_result = exec_::request_cli($cli_options);
					break;

				default:

					// direct case
					// Synchronous invocation: call the tool method in-process and
					// return its result as the HTTP response body.
					try {

						$fn_result = call_user_func(array($tool_name, $tool_method), $fn_arguments);

					} catch (Exception $e) { // For PHP 5

						debug_log(__METHOD__
							." Exception caught [tool_request] : ". $e->getMessage() . PHP_EOL
							. ' tool_name: ' . $tool_name . PHP_EOL
							. ' tool_method: ' . $tool_method . PHP_EOL
							. ' fn_arguments: ' . to_string($fn_arguments)
							, logger::ERROR
						);
						trigger_error($e->getMessage());

						$fn_result = new stdClass();
							$fn_result->result	= false;
							$fn_result->msg		= 'Error. Request failed on call_user_func tool_method: '.$tool_method;
					}
					break;
			}

		// The tool's own response object entirely replaces $response; the API-layer
		// error fields ($response->errors etc.) are not merged in. Callers must
		// inspect $fn_result->result and $fn_result->msg directly.
		$response = $fn_result;

		return $response;
	}//end tool_request



}//end dd_tools_api
