<?php declare(strict_types=1);
/**
* CLASS TOOL_SECURITY
* Security helpers for the tools dispatch surface (SEC-024).
*
* This final class has no state of its own; all methods are static. It provides
* two complementary mechanisms:
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
*    These wrappers normalize the raw request options object into the typed
*    arguments expected by class security, and throw permission_exception on
*    any missing or malformed field — so the tool method never needs to
*    handle option validation itself.
*
* Enforcement default: when a tool class does not declare API_ACTIONS the
* request is REFUSED unless the install defines
* `define('TOOLS_REQUIRE_API_ACTIONS', false);` (migration escape hatch,
* see config/sample.config.php). All in-repo tools declare the constant.
*
* Relationships:
*  - Called by: core/api/v1/common/class.dd_tools_api.php (tool_request)
*  - Delegates to: core/security/class.security.php (assert_* methods)
*  - permission_exception: defined in core/security/class.security.php
*  - Tool authors declare API_ACTIONS in their own tool class; this class reads it.
*
* @package Dédalo
* @subpackage Tools
*/
final class tool_security {



	/**
	* RESOLVE_ACTION
	* Resolves a tool method against the tool class API_ACTIONS constant.
	*
	* This is the authorisation chokepoint for the entire tools dispatch surface.
	* dd_tools_api::tool_request calls this before any reflection or execution.
	* The returned object tells the caller whether to proceed and, if so, whether
	* a declarative permission gate must be run via assert_action_permission().
	*
	* Return shape:
	*   { ok: false, spec: null }  — method is not in the allowlist; refuse the request.
	*   { ok: true,  spec: null }  — method is listed with no declarative gate (list form,
	*                                 or map-form value of null); allowed as-is or gated
	*                                 imperatively inside the method body.
	*   { ok: true,  spec: array } — method is listed with a declarative gate; caller MUST
	*                                 pass spec to assert_action_permission() before dispatch.
	*
	* @param string $tool_class  Tool class name (already whitelisted/loaded by the caller)
	* @param string $tool_method Requested method name
	* @return object { ok: bool, spec: ?array }
	*/
	public static function resolve_action(string $tool_class, string $tool_method) : object {

		// no constant: fail closed by default, legacy-allow behind the config flag
		// The constant check uses defined() with the :: notation rather than reflection
		// so it works on any class (no autoloading side-effects) and handles the
		// absence gracefully without triggering a PHP warning.
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
			// (!) Malformed constant — not an array; treat as if the method is absent.
			// This should never happen in well-formed tool classes.
			return (object)['ok' => false, 'spec' => null];
		}

		// list form: membership check, byte-identical to historical behavior
		// array_is_list() returns true when the array has consecutive integer keys
		// starting at 0, which distinguishes ['action1','action2'] (list form) from
		// ['action1' => [...]] (map form). PHP 8.1+.
			if (array_is_list($actions)) {
				return (object)[
					'ok'   => in_array($tool_method, $actions, true),
					'spec' => null
				];
			}

		// map form: key presence + optional declarative spec
		// A missing key means the method was not listed at all — refuse.
		// A null value means listed but no declarative gate (tool gates imperatively).
		// An array value is the permission spec forwarded to assert_action_permission().
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
	*
	* (!) MUST be called before any execution path, including the background
	* (CLI fork) path: exec_::request_cli detaches and reports success to the
	* HTTP caller immediately, so a gate placed after the fork is unobservable
	* and the privilege check would never fire for the actual work.
	*
	* When $spec is null (list-form action or map-form null value), this method
	* returns immediately; the tool method is then responsible for its own gate
	* via the assert_options_* helpers below.
	*
	* 'min_level' in the spec defaults to 2 (write) when omitted.
	* 'developer' ignores min_level entirely.
	*
	* An unrecognised 'permission' key value is treated as a misconfiguration and
	* throws permission_exception (fail-closed), not a silent allow.
	*
	* @param ?array $spec    Map-form action spec (keys: 'permission', 'min_level') or null
	* @param object $options Request options object forwarded from the HTTP request
	* @param string $context Caller label embedded in the permission_exception message
	* @return void
	* @throws permission_exception On insufficient permissions or invalid spec (fail closed)
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
				// 'developer' does not use min_level; is_developer() is a boolean check.
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
	* Section-level permission gate derived from request options.
	*
	* Reads options->section_tipo (the ontology tipo of the target section, e.g. "dd100")
	* and delegates to security::assert_section_permission(), which compares the logged
	* user's permission level on that section against $min_level. The method throws when
	* section_tipo is absent, empty, or not a string, rather than silently passing.
	*
	* Use this wrapper when the tool operates on an entire section rather than a single
	* component or record. For finer-grained gates use assert_options_tipo or
	* assert_options_record.
	*
	* @param object $options   Request options; must carry a non-empty string section_tipo
	* @param int    $min_level Required permission level: 1=read, 2=write, 3=admin
	* @param string $context   Caller label embedded in the permission_exception message
	* @return void
	* @throws permission_exception When section_tipo is missing/invalid or the user's level is insufficient
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
	* Component/element-level permission gate derived from request options.
	*
	* Reads options->section_tipo and the component tipo from options->tipo, with a
	* fallback to options->component_tipo for callers that use the older field name.
	* Both fields must be non-empty strings or the method throws immediately.
	*
	* Delegates to security::assert_tipo_permission(), which checks the logged user's
	* permission on the (section_tipo, tipo) pair against $min_level.
	*
	* Use this wrapper when the tool operates on a specific component within a section.
	* For section-wide gates use assert_options_section; for per-record scope gates use
	* assert_options_record.
	*
	* @param object $options   Request options; must carry non-empty section_tipo and
	*                          tipo (or component_tipo as fallback)
	* @param int    $min_level Required permission level: 1=read, 2=write, 3=admin
	* @param string $context   Caller label embedded in the permission_exception message
	* @return void
	* @throws permission_exception When required options are missing/invalid or the user's level is insufficient
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
	* Per-record permission gate derived from request options.
	*
	* Applies a two-step check:
	*   1. Section-level: the logged user must hold at least $min_level on section_tipo
	*      (delegated to security::assert_section_permission).
	*   2. Project-scope: the specific record (section_tipo + section_id) must fall within
	*      the user's allowed project scope (delegated to
	*      security::assert_record_in_user_scope). This mirrors the SQL project filter
	*      used in search queries so that a user cannot bypass project boundaries by
	*      directly requesting a record by ID.
	*
	* section_id may arrive as a numeric string from the HTTP request; is_numeric() is
	* used intentionally to accept both int and numeric string before casting to int.
	*
	* @param object $options   Request options; must carry non-empty section_tipo and
	*                          a numeric section_id
	* @param int    $min_level Required section permission level: 1=read, 2=write, 3=admin
	* @param string $context   Caller label embedded in the permission_exception message
	* @return void
	* @throws permission_exception When required options are missing/invalid, the user's
	*                              section level is insufficient, or the record is outside
	*                              the user's project scope
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
	* Gate that requires the currently logged-in user to hold developer privileges.
	*
	* Reads the user identity from the session via logged_user_id() and checks the
	* developer flag via security::is_developer(), which consults the session cache
	* (logged_user_is_developer()) first and falls back to the permission matrix in
	* the user's profile record (dd234). The strict boolean comparison (!== true)
	* treats any non-true result (false, null) as a denial.
	*
	* There is no min_level concept here: developer access is binary.
	* Use this gate for administrative or diagnostic actions that must never be
	* exposed to regular or project-level users regardless of their write access.
	*
	* @param string $context Caller label embedded in the permission_exception message
	* @return void
	* @throws permission_exception When the logged user does not have developer privileges
	*/
	public static function assert_developer(string $context) : void {

		if (security::is_developer(logged_user_id()) !== true) {
			throw new permission_exception('Developer privileges required', $context);
		}
	}//end assert_developer



}//end class tool_security
