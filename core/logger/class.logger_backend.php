<?php
require_once( DEDALO_CORE_PATH .'/logger/class.logger.php' );
/**
* LOGGER BACKEND CLASS
*
*/
abstract class logger_backend {

	protected $url_data;


	public function __construct($url_data) {
		$this->url_data = $url_data;
	}


	abstract function log_message( $message, $log_level=logger::INFO, $tipo_donde=NULL, $projects=NULL, $datos=NULL );	#$message, $log_level=logger::INFO,  $tipo_donde=NULL, $projects=NULL, $datos=NULL


}//end class logger_backend
