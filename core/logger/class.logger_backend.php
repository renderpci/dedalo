<?php declare(strict_types=1);
/**
* CLASS LOGGER_BACKEND
* Abstract base for all pluggable logging backend implementations in Dédalo.
*
* Every concrete backend (e.g. logger_backend_activity) must extend this class
* and implement log_message(). The class enforces a uniform constructor contract
* so that logger::register() can instantiate any backend from a connection string
* without knowing its concrete type.
*
* Responsibilities:
* - Stores the parsed URL/connection data ($url_data) that the concrete backend
*   uses to locate its storage target (database table, file path, etc.).
* - Declares the log_message() abstract contract that callers (typically debug_log()
*   or logger::get_instance()->log_message()) depend on.
*
* Lifecycle:
*   1. logger::register($name, $connection_string) parses the connection string,
*      resolves the concrete backend class from the scheme, and calls new $class($url_data).
*   2. The concrete class calls parent::__construct($url_data) to store $url_data.
*   3. Callers retrieve the registered instance via logger::get_instance($name) and
*      invoke log_message() against the returned logger_backend reference.
*
* Extended by: logger_backend_activity
*
* @package Dédalo
* @subpackage Core
*/
abstract class logger_backend {



	/**
	* Connection/URL descriptor passed into this backend at registration time.
	* Produced by PHP's parse_url() from the connection string passed to logger::register().
	* Concrete backends read scheme, host, port, path, and query from this array
	* to locate their target storage (e.g. which database table to write to).
	*
	* Example shape (activity backend):
	* [
	*   "scheme" => "activity",
	*   "host"   => "auto",
	*   "port"   => 5432,
	*   "user"   => "auto",
	*   "pass"   => "auto",
	*   "path"   => "/log_data",
	*   "query"  => "table=matrix_activity"
	* ]
	*
	* Null is allowed for backends that need no external connection configuration.
	* @var ?array $url_data
	*/
	protected ?array $url_data;



	/**
	* __CONSTRUCT
	* Stores the parsed connection descriptor for use by the concrete backend.
	*
	* Called by logger::register() immediately after the concrete class is resolved
	* from the connection-string scheme. Concrete subclasses that override __construct()
	* MUST call parent::__construct($url_data) so that $this->url_data is initialised
	* before any backend-specific setup that may depend on it.
	*
	* @param ?array $url_data - Assoc array produced by parse_url() from the
	*   connection string, e.g.:
	*   [
	*     "scheme" => "activity",
	*     "host"   => "auto",
	*     "port"   => 5432,
	*     "user"   => "auto",
	*     "pass"   => "auto",
	*     "path"   => "/log_data",
	*     "query"  => "table=matrix_activity"
	*   ]
	* @return void
	*/
	public function __construct( ?array $url_data ) {
		$this->url_data = $url_data;
	}



	/**
	* LOG_MESSAGE
	* Contract that every concrete backend must satisfy: persist a single log entry.
	*
	* All parameters except $message are optional so that callers can omit context they
	* do not have (e.g. CLI commands that have no user session). Implementations MUST
	* be tolerant of null values and MUST NOT throw for ordinary missing-context cases.
	*
	* Parameter semantics (shared across all backends):
	* - $message    : Human-readable event label. For the activity backend this must
	*                 match a key in logger_backend_activity::$what (e.g. 'SAVE',
	*                 'LOG IN'). Other backends may treat it as free text.
	* - $log_level  : Numeric severity constant from class logger (DEBUG=100 … CRITICAL=5).
	*                 Backends may use this to filter noisy entries.
	* - $tipo_where : The ontology tipo (e.g. 'oh32') of the component or section that
	*                 triggered this event. Used as the WHERE field in activity logging.
	* - $operations : Free-text description of the operation(s) performed (legacy field;
	*                 currently unused by the activity backend).
	* - $log_data   : Arbitrary context payload stored alongside the log entry, e.g.:
	*                 ['msg'=>'Saved','tipo'=>'oh32','section_id'=>'1','lang'=>'lg-nolan']
	* - $user_id    : Explicit user override. When null the backend resolves the currently
	*                 logged-in user via logged_user_id().
	*
	* @param string $message - Event label (must match an activity key for activity backend)
	* @param int $log_level [= logger::INFO] - Severity constant; higher = less important
	* @param ?string $tipo_where [= null] - Ontology tipo of the acting component/section
	* @param ?string $operations [= null] - Legacy free-text operations description
	* @param ?array $log_data [= null] - Associative context payload array
	* @param ?int $user_id [= null] - User ID override; null resolves to logged-in user
	* @return void
	*/
	abstract function log_message(
		string $message,
		int $log_level=logger::INFO,
		?string $tipo_where=null,
		?string $operations=null,
		?array $log_data=null,
		?int $user_id=null
	) : void;



}//end class logger_backend
