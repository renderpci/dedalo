<?php
require_once( DEDALO_CORE_PATH .'/logger/class.logger.php' );
/**
* LOGGER BACKEND CLASS
*
*/
abstract class logger_backend {



	protected $url_data;



	public function __construct(array $url_data) {
		$this->url_data = $url_data;
	}



	abstract function log_message(
		string $message,
		int $log_level=logger::INFO,
		string $tipo_donde=null,
		string $operations=null,
		array $datos=null
	);



}//end class logger_backend
