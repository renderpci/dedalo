<?php
/**
* CLASS LOGGER
*
*/
class logger {

	private $h_log_file;
	private $log_level;

	// Niveles de registro. A mayor número, menor importancia
	// Se dejan huecos en la numeración para poder añadir posteriormente otros niveles
	const DEBUG 	= 100;
	const INFO 		= 75;
	const NOTICE 	= 50;
	const WARNING 	= 25;
	const ERROR 	= 10;
	const CRITICAL 	= 5;

	# global logger obj array to store instances of logger
	static $obj;

	# PRIVATE CONSTRUCT . Constructor privado (Patrón único)
	private function __construct() {
	}



	/**
	* LEVEL TO STRING CONVERSION
	*/
	public static function level_to_string($log_level) {
		switch ($log_level) {
			case logger::DEBUG:
				return 'DEBUG';
				break;
			case logger::INFO:
				return 'INFO';
				break;
			case logger::NOTICE:
				return 'NOTICE';
				break;
			case logger::WARNING:
				return 'WARNING';
				break;
			case logger::ERROR:
				return 'ERROR';
				break;
			case logger::CRITICAL:
				return 'CRITICAL';
				break;
			default:
				return '[unknow]';
		}
	}//end level_to_string



	/**
	* REGISTER
	*/
	public static function register( $log_name, $connection_string ) {

		$url_data = parse_url($connection_string);
			#var_dump($url_data);

		# Verify connection_string
		if (!isset($url_data['scheme'])) {
			throw new Exception("Invalid log connection string ", 1);
		}

		# Include backend loger
		$class_name = 'logger_backend_'.$url_data['scheme'];
		include_once( DEDALO_CORE_PATH .'/logger/class.' . $class_name . '.php' );

		if (!class_exists($class_name)) {
			throw new Exception("No loggin backend available for ".$url_data['scheme'], 1);
		}

		$obj_back = new $class_name($url_data);


		# manage current backend class
		logger::manage_backends($log_name, $obj_back);

		return true;
	}//end register



	/**
	* GET INSTANCE
	*/
	public static function get_instance($name) {

		return logger::manage_backends($name);
	}//end get_instance



	/**
	* MANAGE BACKENDS
	*/
	private static function manage_backends( $name, logger_backend $obj_back = NULL) {

		static $backends;

		if (!isset($backends)) {
			$backends = array();
		}

		if ($obj_back === null) {
			# We are recovering
			if (isset($backends[$name])) {
				return $backends[$name];
			}else{
				throw new Exception("The specific backend $name was not registered with logger.", 1);
			}
		}else{
			# We are adding
			$backends[$name] = $obj_back;
		}
	}//end manage_backends



}//end class logger
