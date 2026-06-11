<?php declare(strict_types=1);
/**
* DD_TOOLS_API
* Manage API REST data with Dédalo
*
*/
final class dd_tools_api {



	/**
	* SEC-024: explicit allowlist of methods callable as remote API actions.
	*/
	public const API_ACTIONS = [
		'user_tools',
		'tool_request'
	];



	/**
	* USER_TOOLS
	* Get user authorized tools filtered by custom list (optional)
	* @param object $rqo
	* {
	*	dd_api	: 'dd_tools_api',
	*	action	: 'user_tools',
	*	source	: source,
	*	options	: {
	*		ar_requested_tools : ar_requested_tools
	*	}
	* }
	* @return object $response
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
	* Call to tool method given and return and object with the response
	*
	* Class file of current tool must be exists in path: DEDALO_TOOLS_PATH / my_tool_name / class.my_tool_name.php
	* Method must be static and accept a only one object argument
	* Method must return an object like { result: mixed, msg: string }
	*
	* @param object $rqo
	* sample:
	* {
	* 	action: "tool_request"
	* 	dd_api: "dd_utils_api"
	* 	source: {
	* 		typo: "source",
	* 		action: "delete_tag",
	* 		model: "tool_indexation"
	* 	},
	* 	options: {
	*		indexing_component_tipo: "rsc860"
	*		main_component_lang: "lg-eng"
	*		main_component_tipo: "rsc36"
	*		section_id: "1"
	*		section_tipo: "rsc167"
	*		tag_id: "5"
	*    }
	* }
	* @return object response { result: mixed, msg: string }
	*/
	public static function tool_request(object $rqo) : object {

		// options
			$options			= $rqo->options ?? new stdClass();
			$fn_arguments		= $options;
			$background_running	= $options->background_running ?? false;

		// source
			$source			= $rqo->source;
			$tool_name		= sanitize_key_dir($source->model);
			$tool_method	= $source->action;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__METHOD__.']. ';
				$response->errors	= [];

		// check valid options
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

		// load tool class file
			$class_file = DEDALO_TOOLS_PATH . '/' . $tool_name . '/class.' . $tool_name .'.php';
			if (!file_exists($class_file)) {
				$response->msg = 'Error. tool class_file do not exists. Create a new one in format class.my_tool_name.php ';
				if(SHOW_DEBUG===true) {
					$response->msg .= '. file: '.$class_file;
				}
				return $response;
			}
			// SEC-069 / SEC-084: realpath confinement on top of the
			// `sanitize_key_dir` + tool registry whitelist above. Refuse to
			// `require` any file whose canonical path escapes
			// DEDALO_TOOLS_PATH, even if the constants or symlinks have
			// been tampered with at the filesystem level.
			$tools_root = realpath(DEDALO_TOOLS_PATH);
			$real_tool  = realpath($class_file);
			if ($tools_root === false
				|| $real_tool === false
				|| !str_starts_with($real_tool, $tools_root . DIRECTORY_SEPARATOR)
			) {
				$response->errors[] = 'Tool path confinement failed';
				debug_log(__METHOD__
					. ' SEC-084 tool path escapes tools root.' . PHP_EOL
					. ' tools_root: ' . to_string($tools_root) . PHP_EOL
					. ' real_tool: ' . to_string($real_tool)
					, logger::ERROR
				);
				return $response;
			}
			require_once $class_file;

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
					$cli_options = new stdClass();
						$cli_options->class_name	= $tool_name;
						$cli_options->method_name	= $tool_method;
						$cli_options->class_file	= $class_file;
						$cli_options->params		= $options;

					$fn_result = exec_::request_cli($cli_options);
					break;

				default:

					// direct case

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

		$response = $fn_result;

		return $response;
	}//end tool_request



}//end dd_utils_api
