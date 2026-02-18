<?php declare(strict_types=1);
/**
* LOGGER BACKEND CLASS
*
* Abstract base class for logger backend implementations.
* Provides common interface for different logging mechanisms.
*
* @package Dedalo
* @subpackage Logger
*/
abstract class logger_backend {



	/**
	* URL_DATA
	* @var array|null
	*/
	protected ?array $url_data;



	/**
	* __CONSTRUCT
	* Requires url_data connector.
	* @param array|null $url_data
	* Assoc array with url data
	* E.g.
	* [
	*	"scheme" => "activity",
	*	"host" => "auto",
	*	"port" => 5432,
	*	"user" => "auto",
	*	"pass" => "auto",
	*	"path" => "/log_data",
	*	"query" => "table=matrix_activity"
	* ]
	*/
	public function __construct( ?array $url_data ) {
		$this->url_data = $url_data;
	}



	/**
	* LOG_MESSAGE
	* Abstract method for logging messages with context data
	*/
	abstract function log_message(
		string $message,
		int $log_level=logger::INFO,
		?string $tipo_where=null,
		?string $operations=null,
		?array $log_data=null
	) : void;



}//end class logger_backend
