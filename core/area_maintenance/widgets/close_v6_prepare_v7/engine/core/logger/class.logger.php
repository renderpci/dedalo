<?php declare(strict_types=1); // NOT IN UNIT TEST !
/**
* CLASS LOGGER
* Central logging facility for Dédalo with pluggable backend support.
*
* Logger acts as a static registry and factory for named logging backends.
* Each backend (e.g. 'activity') is registered once at application bootstrap
* via logger::register(), which parses a URL-style connection string to
* determine which backend class to instantiate. Callers then retrieve the
* live backend object through logger::get_instance() (or the convenience
* shortcut logger::$obj['<name>']) and invoke backend-specific methods such
* as log_message().
*
* Typical bootstrap sequence (from config/sample.config.php):
*   logger::register('activity', 'activity://auto:auto@auto:5432/log_data?table=matrix_activity');
*   logger::$obj['activity'] = logger::get_instance('activity');
*
* After that, anywhere in the codebase:
*   logger::$obj['activity']->log_message('SAVE', logger::INFO, $tipo, null, $log_data);
*
* Severity scale (higher constant value = more verbose):
*   CRITICAL(5) < ERROR(10) < WARNING(25) < NOTICE(50) < INFO(75) < DEBUG(100)
*
* The class is intentionally non-instantiable (private constructor). All
* public surface is static. Backends must extend logger_backend (abstract),
* which is auto-loaded from core/logger/class.logger_backend_<scheme>.php.
*
* Extended by: nothing — this is a final registry, not meant to be subclassed.
* Uses: logger_backend (abstract), logger_backend_activity (concrete).
*
* @package Dédalo
* @subpackage Core
*/
class logger {



	/**
	* CLASS VARS
	*/
		/**
		* Most verbose log level — used for granular development diagnostics.
		* Numeric severity: 100. Only emitted when SHOW_DEBUG is enabled.
		* The large gaps between levels (5, 10, 25, 50, 75, 100) leave room to
		* insert intermediate levels in the future without breaking existing checks.
		*/
		const DEBUG = 100;

		/**
		* General operational information level.
		* Numeric severity: 75. Default level for routine activity log entries
		* (e.g. SAVE, LOAD EDIT). Most activity log_message() calls use this level.
		*/
		const INFO = 75;

		/**
		* Normal-but-significant events that warrant attention without being warnings.
		* Numeric severity: 50.
		*/
		const NOTICE = 50;

		/**
		* Potential problems that do not prevent the current operation from completing.
		* Numeric severity: 25.
		*/
		const WARNING = 25;

		/**
		* Runtime errors that require developer attention.
		* Numeric severity: 10. This is the default minimum level emitted to the
		* server error log when SHOW_DEBUG is false (see config/sample.config.php).
		*/
		const ERROR = 10;

		/**
		* Severe errors requiring immediate action; the system may be unstable.
		* Numeric severity: 5 (lowest — always emitted regardless of the configured level).
		*/
		const CRITICAL = 5;

		/**
		* Public shortcut map of registered backend instances, keyed by log name.
		* Populated by register() and typically cached here by the bootstrap so
		* call-sites can do: logger::$obj['activity']->log_message(…)
		* without going through get_instance() every time.
		* @var array<string, logger_backend> $obj
		*/
		public static array $obj = [];



	/**
	* __CONSTRUCT
	* Private — logger is a static registry; direct instantiation is forbidden.
	*/
	private function __construct() {
	}



	/**
	* LEVEL_TO_STRING
	* Convert a numeric log-level constant to its human-readable label.
	* Used when formatting log entries or error messages so that integer
	* severity values do not appear raw in output strings.
	* @param int $log_level - one of the logger::DEBUG / INFO / NOTICE / WARNING / ERROR / CRITICAL constants
	* @return string - uppercase label ('DEBUG', 'INFO', …) or '[unknown]' for unrecognised values
	*/
	public static function level_to_string(int $log_level) : string {

		switch ($log_level) {
			case logger::DEBUG:		return 'DEBUG';
			case logger::INFO:		return 'INFO';
			case logger::NOTICE:	return 'NOTICE';
			case logger::WARNING:	return 'WARNING';
			case logger::ERROR:		return 'ERROR';
			case logger::CRITICAL:	return 'CRITICAL';
			default:				return '[unknown]';
		}
	}//end level_to_string



	/**
	* REGISTER
	* Parse a URL-style connection string, auto-load and instantiate the matching
	* backend class, validate it, and store it under $log_name for later retrieval.
	*
	* Connection-string anatomy:
	*   <scheme>://<user>:<pass>@<host>:<port>/<dbname>?<query>
	*   e.g. 'activity://auto:auto@auto:5432/log_data?table=matrix_activity'
	*
	* The URL scheme maps directly to the backend class:
	*   scheme 'activity'  →  class logger_backend_activity
	*   (loaded from DEDALO_CORE_PATH/logger/class.logger_backend_activity.php)
	*
	* The parsed $url_data array (result of parse_url()) is forwarded to the
	* backend constructor so it can extract host, port, table name, etc.
	*
	* (!) Throws on missing scheme, unknown backend class, or inheritance violation.
	* Register each backend only once at application bootstrap to avoid duplicate
	* shutdown handlers registered by the activity backend.
	*
	* @param string $log_name - logical name used to retrieve the backend later (e.g. 'activity')
	* @param string $connection_string - URL-format descriptor for the backend (e.g. 'activity://auto:…')
	* @return bool - always true on success; failure raises an Exception
	* @throws Exception when the connection string has no scheme, the backend file is absent, or the class does not extend logger_backend
	*/
	public static function register(string $log_name, string $connection_string) : bool {

		$url_data = parse_url($connection_string);

		// Verify connection_string
		// parse_url() returns false or an array without 'scheme' for malformed strings
		if (!isset($url_data['scheme'])) {
			throw new Exception("Invalid log connection string ", 1);
		}

		// Build backend class name from scheme
		// Convention: scheme 'activity' → class 'logger_backend_activity'
		$class_name = 'logger_backend_'.$url_data['scheme'];

		// Auto-load backend class if not already loaded
		// Backend files live alongside this file under core/logger/
		if (!class_exists($class_name)) {
			$class_file = DEDALO_CORE_PATH .'/logger/class.' . $class_name . '.php';
			if (file_exists($class_file)) {
				include_once $class_file;
			}
		}

		if (!class_exists($class_name)) {
			throw new Exception("No log backend available for ".$url_data['scheme'], 1);
		}

		// Validate that class extends logger_backend
		// Ensures the instantiated object satisfies the log_message() contract
		if (!is_subclass_of($class_name, 'logger_backend')) {
			throw new Exception("Class $class_name does not extend logger_backend", 1);
		}

		$obj_back = new $class_name($url_data);

		// manage current backend class
		// Hands off to the static storage method; $obj_back != null means "store"
		logger::manage_backends($log_name, $obj_back);


		return true;
	}//end register



	/**
	* GET_INSTANCE
	* Retrieve a previously registered logger backend by its logical name.
	* This is a thin public wrapper around manage_backends() that enforces
	* the retrieval-only path (no $obj_back argument).
	*
	* The return value is typically cached in logger::$obj[$name] by the bootstrap
	* so that call-sites can skip this method after the first lookup.
	*
	* @param string $name - logical backend name used in register() (e.g. 'activity')
	* @return ?logger_backend - the registered backend instance, or null is never returned in practice
	* @throws Exception when $name was not registered with register() first
	*/
	public static function get_instance(string $name) : ?logger_backend {

		return logger::manage_backends($name);
	}//end get_instance



	/**
	* MANAGE_BACKENDS
	* Internal dual-mode static store for backend instances, implementing a
	* simple key→object registry backed by a function-static variable.
	*
	* The function-static $backends array persists for the lifetime of the PHP
	* process (or request, in standard FPM). In persistent-worker environments
	* (Swoole, RoadRunner) this static survives across requests — backends must
	* therefore be registered once at worker boot, not per request.
	*
	* Mode A — store ($obj_back !== null):
	*   Assigns $obj_back under $name and returns null.
	*
	* Mode B — retrieve ($obj_back === null):
	*   Returns the stored backend or throws if $name is absent.
	*
	* @param string $name - logical backend name (e.g. 'activity')
	* @param ?logger_backend $obj_back = null - backend to store; null triggers retrieval
	* @return ?logger_backend - the stored backend in retrieval mode; null in store mode
	* @throws Exception in retrieval mode when $name has not been registered
	*/
	private static function manage_backends( string $name, ?logger_backend $obj_back=null ) : ?logger_backend {

		static $backends;

		if (!isset($backends)) {
			$backends = array();
		}

		if ($obj_back === null) {
			// We are recovering
			// Return stored instance or throw — null is never silently returned for an unknown name
			if (isset($backends[$name])) {
				return $backends[$name];
			}else{
				throw new Exception("The specific backend $name was not registered with logger.", 1);
			}
		}else{
			// We are adding
			$backends[$name] = $obj_back;
		}

		return null;
	}//end manage_backends



}//end class logger
