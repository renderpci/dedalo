<?php
/**
* LOGGER BACKEND CLASS
*/
require_once( DEDALO_LIB_BASE_PATH .'/logger/class.logger.php' );

abstract class logger_backend {

	protected $url_data;

	public function __construct($url_data) {		
		$this->url_data = $url_data;
	}

	abstract function log_message( $message, $log_level=logger::INFO, $tipo_donde=NULL, $projects=NULL, $datos=NULL );	#$message, $log_level=logger::INFO,  $tipo_donde=NULL, $projects=NULL, $datos=NULL


}#end class logger_backend

?>