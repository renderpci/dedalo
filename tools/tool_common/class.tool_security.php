<?php declare(strict_types=1);
/**
* TOOL_SECURITY
*
* Security helpers for the tools dispatch surface (SEC-024).
*
* 1. API_ACTIONS resolution and enforcement (resolve_action):
*    Every tool class callable via dd_tools_api::tool_request MUST declare
*    `public const API_ACTIONS` listing its remotely callable methods.
*    Two forms are accepted:
*
*    List form (historical, unchanged semantics):
*        public const API_ACTIONS = ['my_action', 'other_action'];
*
*    Map form (declarative per-action permission gates, preferred):
*        public const API_ACTIONS = [
*            'my_action' => ['permission' => 'tipo',    'min_level' => 2],
*            'other'     => ['permission' => 'record',  'min_level' => 2],
*            'status'    => null  // listed, no declarative gate (gate inside the method)
*        ];
*
*    Permission types and the request option fields they read:
*      - 'section'   -> options->section_tipo
*      - 'tipo'      -> options->section_tipo + (options->tipo ?? options->component_tipo)
*      - 'record'    -> options->section_tipo + numeric options->section_id;
*                       implies section permission at min_level PLUS
*                       security::assert_record_in_user_scope()
*      - 'developer' -> logged user must be developer (min_level ignored)
*    min_level: 1 = read, 2 = write (default), 3 = admin.
*
*    Missing or ill-typed required option fields FAIL CLOSED with
*    permission_exception. A 'section'/'tipo'/'record' spec on a 0-param
*    method will therefore always refuse: use list form or null spec for
*    parameterless status hooks.
*
*    Lifecycle hooks (is_available, on_register, on_remove) must NEVER be
*    listed in API_ACTIONS: they are called by the framework, not remotely.
*
* 2. Imperative wrappers (assert_options_*) for tools that gate inside the
*    method body: one documented entry point over the core security asserts.
*
* Enforcement default: when a tool class does not declare API_ACTIONS the
* request is REFUSED unless the install defines
* `define('TOOLS_REQUIRE_API_ACTIONS', false);` (migration escape hatch,
* see config/sample.config.php). All in-repo tools declare the constant.
*/
final class tool_security {



	/**
	* RESOLVE_ACTION
	* Resolves a tool method against the tool class API_ACTIONS constant.
	* @param string $tool_class Tool class name (already whitelisted/loaded by the caller)
	* @param string $tool_method Requested method name
	* @return object { ok: bool, spec: ?array }
	* 	ok=false  -> method must be refused (unauthorized_method)
	* 	spec=null -> allowed with no declarative gate
	* 	spec=array-> allowed; caller must run assert_action_permission(spec, ...)
	*/
	public static function resolve_action(string $tool_class, string $tool_method) : object {

		// no constant: fail closed by default, legacy-allow behind the config flag
			if (!defined($tool_class . '::API_ACTIONS')) {
				$require = defined('TOOLS_REQUIRE_API_ACTIONS') ? (bool)TOOLS_REQUIRE_API_ACTIONS : true;
				if ($require === true) {
					debug_log(__METHOD__
						. " Rejected: '$tool_class' does not declare API_ACTIONS." . PHP_EOL
						. " Declare `public const API_ACTIONS = [...]` listing the remotely callable methods," . PHP_EOL
						. " or define('TOOLS_REQUIRE_API_ACTIONS', false) during migration."
						, logger::ERROR
					);
					return (object)['ok' => false, 'spec' => null];
				}
				debug_log(__METHOD__
					. " DEPRECATION: '$tool_class' has no API_ACTIONS; allowing '$tool_method' by legacy rule"
					. " because TOOLS_REQUIRE_API_ACTIONS is false."
					, logger::WARNING
				);
				return (object)['ok' => true, 'spec' => null];
			}

		$actions = constant($tool_class . '::API_ACTIONS');
		if (!is_array($actions)) {
			return (object)['ok' => false, 'spec' => null];
		}

		// list form: membership check, byte-identical to historical behavior
			if (array_is_list($actions)) {
				return (object)[
					'ok'   => in_array($tool_method, $actions, true),
					'spec' => null
				];
			}

		// map form: key presence + optional declarative spec
			if (!array_key_exists($tool_method, $actions)) {
				return (object)['ok' => false, 'spec' => null];
			}
			$spec = $actions[$tool_method];

		return (object)[
			'ok'   => true,
			'spec' => is_array($spec) ? $spec : null
		];
	}//end resolve_action



	/**
	* ASSERT_ACTION_PERMISSION
	* Runs the declarative permission gate of a map-form API_ACTIONS entry.
	* MUST be called before any execution path, including the background
	* (CLI fork) path: exec_::request_cli detaches and reports success
	* immediately, so a gate placed after the fork is unobservable.
	* @param ?array $spec Map-form action spec or null (no gate)
	* @param object $options Request options
	* @param string $context Context string for the permission_exception
	* @return void
	* @throws permission_exception (fail closed)
	*/
	public static function assert_action_permission(?array $spec, object $options, string $context) : void {

		if ($spec === null) {
			return;
		}

		$permission	= $spec['permission'] ?? null;
		$min_level	= (int)($spec['min_level'] ?? 2);

		switch ($permission) {
			case 'section':
				self::assert_options_section($options, $min_level, $context);
				break;
			case 'tipo':
				self::assert_options_tipo($options, $min_level, $context);
				break;
			case 'record':
				self::assert_options_record($options, $min_level, $context);
				break;
			case 'developer':
				self::assert_developer($context);
				break;
			default:
				debug_log(__METHOD__
					. " Invalid API_ACTIONS permission spec: " . to_string($permission) . PHP_EOL
					. ' context: ' . $context
					, logger::ERROR
				);
				throw new permission_exception('Invalid API_ACTIONS permission spec', $context);
		}
	}//end assert_action_permission



	/**
	* ASSERT_OPTIONS_SECTION
	* Section-level permission from request options (options->section_tipo).
	* @param object $options
	* @param int $min_level 1=read, 2=write, 3=admin
	* @param string $context
	* @return void
	* @throws permission_exception
	*/
	public static function assert_options_section(object $options, int $min_level, string $context) : void {

		$section_tipo = $options->section_tipo ?? null;
		if (!is_string($section_tipo) || $section_tipo==='') {
			throw new permission_exception('Missing required option: section_tipo', $context);
		}

		security::assert_section_permission($section_tipo, $min_level, $context);
	}//end assert_options_section



	/**
	* ASSERT_OPTIONS_TIPO
	* Component/element permission from request options
	* (options->section_tipo + options->tipo|component_tipo).
	* @param object $options
	* @param int $min_level 1=read, 2=write, 3=admin
	* @param string $context
	* @return void
	* @throws permission_exception
	*/
	public static function assert_options_tipo(object $options, int $min_level, string $context) : void {

		$section_tipo	= $options->section_tipo ?? null;
		$tipo			= $options->tipo ?? $options->component_tipo ?? null;
		if (!is_string($section_tipo) || $section_tipo==='' || !is_string($tipo) || $tipo==='') {
			throw new permission_exception('Missing required option: section_tipo / tipo', $context);
		}

		security::assert_tipo_permission($section_tipo, $tipo, $min_level, $context);
	}//end assert_options_tipo



	/**
	* ASSERT_OPTIONS_RECORD
	* Per-record gate from request options (options->section_tipo + options->section_id).
	* Implies section permission at $min_level plus project-scope check on the record.
	* @param object $options
	* @param int $min_level 1=read, 2=write, 3=admin
	* @param string $context
	* @return void
	* @throws permission_exception
	*/
	public static function assert_options_record(object $options, int $min_level, string $context) : void {

		$section_tipo	= $options->section_tipo ?? null;
		$section_id		= $options->section_id ?? null;
		if (!is_string($section_tipo) || $section_tipo==='' || !is_numeric($section_id)) {
			throw new permission_exception('Missing required option: section_tipo / section_id', $context);
		}

		security::assert_section_permission($section_tipo, $min_level, $context);
		security::assert_record_in_user_scope($section_tipo, (int)$section_id, $context);
	}//end assert_options_record



	/**
	* ASSERT_DEVELOPER
	* Logged user must have developer privileges.
	* @param string $context
	* @return void
	* @throws permission_exception
	*/
	public static function assert_developer(string $context) : void {

		if (security::is_developer(logged_user_id()) !== true) {
			throw new permission_exception('Developer privileges required', $context);
		}
	}//end assert_developer



}//end class tool_security
