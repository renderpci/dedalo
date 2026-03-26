<?php declare(strict_types=1); // NOT IN UNIT TEST !
/**
* CLASS LOGGER
*
* Central logging system for Dédalo with pluggable backend support.
* Provides factory pattern for different logging mechanisms (activity, file, etc.).
*
* Key features:
* - Singleton-like backend management
* - Multiple log levels with numeric severity
* - Pluggable backend architecture
* - Type-safe backend registration and retrieval
*
* @package Dedalo
* @subpackage Logger
*/
class logger {



	// Static backend storage - replaces unused instance properties
	// Removed: $h_log_file, $log_level (unused)

	// Logging levels. The higher the number, the less important.
	// Gaps are left in the numbering so that other levels can be added later
	const DEBUG		= 100;
	const INFO		= 75;
	const NOTICE	= 50;
	const WARNING	= 25;
	const ERROR		= 10;
	const CRITICAL	= 5;

	// global logger obj array to store instances of logger
	public static $obj;



	/**
	* __CONSTRUCT
	*/
	private function __construct() {
	}



	/**
	* LEVEL_TO_STRING
	* Convert numeric log level to human-readable string
	* @param int $log_level Numeric log level constant (logger::DEBUG, logger::INFO, etc.)
	* @return string Human-readable log level name or '[unknown]' for invalid levels
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
	* @param string $log_name
	* 	Sample: 'activity'
	* @param string $connection_string
	* 	Sample: 'activity://auto:auto@auto:5432/log_data?table=matrix_activity'
	* @return bool
	* 	true
	*/
	public static function register(string $log_name, string $connection_string) : bool {

		$url_data = parse_url($connection_string);

		// Verify connection_string
		if (!isset($url_data['scheme'])) {
			throw new Exception("Invalid log connection string ", 1);
		}

		// Build backend class name from scheme
		$class_name = 'logger_backend_'.$url_data['scheme'];

		// Auto-load backend class if not already loaded
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
		if (!is_subclass_of($class_name, 'logger_backend')) {
			throw new Exception("Class $class_name does not extend logger_backend", 1);
		}

		$obj_back = new $class_name($url_data);

		// manage current backend class
		logger::manage_backends($log_name, $obj_back);


		return true;
	}//end register



	/**
	* GET INSTANCE
	* Retrieve registered logger backend instance
	* @param string $name Backend identifier name
	* @return logger_backend|null Backend instance or null if not found
	* @throws Exception When backend is not registered
	*/
	public static function get_instance(string $name) : ?logger_backend {

		return logger::manage_backends($name);
	}//end get_instance



	/**
	* MANAGE BACKENDS
	* Static storage and retrieval of logger backend instances
	* @param string $name Backend identifier name
	* @param logger_backend|null $obj_back Backend instance to store, or null to retrieve
	* @return logger_backend|null Stored backend instance or null when storing
	* @throws Exception When retrieving non-existent backend
	*/
	private static function manage_backends( string $name, ?logger_backend $obj_back=null ) : ?logger_backend {

		static $backends;

		if (!isset($backends)) {
			$backends = array();
		}

		if ($obj_back === null) {
			// We are recovering
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
