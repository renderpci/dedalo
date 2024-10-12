<?php
/**
* LOGGER BACKEND CLASS
*
*/
abstract class logger_backend {



	protected $url_data;



	/**
	* __CONSTRUCT
	* Require url_data string like: 'mysql://user:password@host/database?tabe=matrix_activity' for caompatibity
	* @param array $url_data
	*/
	public function __construct(array $url_data) {
		$this->url_data = $url_data;
	}



	/**
	* LOG_MESSAGE
	*/
	abstract function log_message(
		string $message,
		int $log_level=logger::INFO,
		?string $tipo_donde=null,
		?string $operations=null,
		?array $datos=null
	);



}//end class logger_backend
