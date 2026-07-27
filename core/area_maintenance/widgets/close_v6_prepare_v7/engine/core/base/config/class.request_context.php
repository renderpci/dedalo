<?php declare(strict_types=1);

/**
* REQUEST_CONTEXT
* Worker-safe accessor for the request/user-scoped values the legacy boot froze as process
* constants (DEDALO_APPLICATION_LANG / DEDALO_DATA_LANG / SHOW_DEBUG / SHOW_DEVELOPER /
* LOGGER_LEVEL). Every accessor computes LIVE from $_REQUEST/$_SESSION on each call — never
* cached into a static or a process constant — so a long-lived worker cannot leak one
* request's (or user's) state into the next. The pure resolvers take explicit request/
* session arrays (decoupled from legacy core_functions, hermetically testable); the live
* accessors are thin wrappers over the superglobals with graceful constant fallbacks.
*
* Read-only: unlike v6 fix_cascade_config_var, it does NOT persist a request value back to
* the session. During the incremental read-site migration the request-state boot phase
* keeps define()-ing the constants (with the v6 persistence) for back-compat.
*/
final class request_context {

	// --- pure resolvers (no superglobals) ---

	/** v6 cascade: request value (sanitized) > session['dedalo']['config'][var] > default. */
	public static function resolve_cascade(string $var_name, mixed $default, array $request, array $session) : mixed {
		if (!empty($request[$var_name]) && !is_array($request[$var_name])) {
			return trim(strip_tags((string) $request[$var_name])); // mirrors v6 trim(safe_xss(...))
		}
		$sess = $session['dedalo']['config'][$var_name] ?? null;
		if (!empty($sess)) {
			return $sess;
		}
		return $default;
	}//end resolve_cascade

	public static function user_id(array $session) : ?int {
		$id = $session['dedalo']['auth']['user_id'] ?? null;
		return $id === null ? null : (int) $id;
	}//end user_id

	public static function developer_flag(array $session) : bool {
		return (($session['dedalo']['auth']['is_developer'] ?? false) === true);
	}//end developer_flag

	public static function is_superuser(?int $user_id, int $superuser_id) : bool {
		return $user_id !== null && $user_id === $superuser_id;
	}//end is_superuser

	public static function level_for(bool $verbose, int $debug_level, int $error_level) : int {
		return $verbose ? $debug_level : $error_level;
	}//end level_for

	// --- live accessors (worker-safe: computed per call) ---

	public static function application_lang() : string {
		$default = defined('DEDALO_APPLICATION_LANGS_DEFAULT') ? (string) DEDALO_APPLICATION_LANGS_DEFAULT : '';
		return (string) self::resolve_cascade('dedalo_application_lang', $default, $_REQUEST, $_SESSION ?? []);
	}//end application_lang

	public static function data_lang() : string {
		$default = defined('DEDALO_DATA_LANG_DEFAULT') ? (string) DEDALO_DATA_LANG_DEFAULT : '';
		return (string) self::resolve_cascade('dedalo_data_lang', $default, $_REQUEST, $_SESSION ?? []);
	}//end data_lang

	public static function show_debug() : bool {
		$superuser = defined('DEDALO_SUPERUSER') ? (int) DEDALO_SUPERUSER : -1;
		return self::is_superuser(self::user_id($_SESSION ?? []), $superuser);
	}//end show_debug

	public static function show_developer() : bool {
		return self::developer_flag($_SESSION ?? []);
	}//end show_developer

	/** Thin live wrapper; logger::DEBUG/ERROR exist once the logger is loaded at boot. */
	public static function logger_level() : int {
		return self::level_for(self::show_debug() || self::show_developer(), logger::DEBUG, logger::ERROR);
	}//end logger_level
}
