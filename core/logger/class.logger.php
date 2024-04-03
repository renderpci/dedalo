<?php
declare(strict_types=1); // NOT IN UNIT TEST !
/**
* CLASS LOGGER
*
*/
class logger {



	private $h_log_file;
	private $log_level;

	// Logging levels. The higher the number, the less important.
	// Gaps are left in the numbering so that other levels can be added later
	const DEBUG		= 100;
	const INFO		= 75;
	const NOTICE	= 50;
	const WARNING	= 25;
	const ERROR		= 10;
	const CRITICAL	= 5;

	// global logger obj array to store instances of logger
	static $obj;



	/**
	* __CONSTRUCT
	*/
	private function __construct() {
	}



	/**
	* LEVEL_TO_STRING
	* Level to string conversion
	* @param int $log_level
	* @return string
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

		// Include back end logger
		$class_name = 'logger_backend_'.$url_data['scheme'];
		// include_once( DEDALO_CORE_PATH .'/logger/class.' . $class_name . '.php' );

		if (!class_exists($class_name)) {
			throw new Exception("No login backend available for ".$url_data['scheme'], 1);
		}

		$obj_back = new $class_name($url_data);

		// manage current backend class
		logger::manage_backends($log_name, $obj_back);


		return true;
	}//end register



	/**
	* GET INSTANCE
	* @param string $name
	* @return object|null
	*/
	public static function get_instance(string $name) : ?object {

		return logger::manage_backends($name);
	}//end get_instance



	/**
	* MANAGE BACKENDS
	* @param string $name
	* @param logger_backend $obj_back = null
	* @return object|null
	*/
	private static function manage_backends(string $name, logger_backend $obj_back=null) : ?object {

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
