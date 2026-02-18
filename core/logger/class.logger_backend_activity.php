<?php declare(strict_types=1);
/**
* LOGGER BACKEND ACTIVITY CLASS
* Manages activity records write to matrix_activity table
*
* This class handles logging of user activities within the Dédalo system.
* It captures comprehensive audit trails including user actions, timestamps,
* IP addresses, and contextual data for security and analytics purposes.
*
* Key features:
* - Automatic user activity tracking
* - IP address logging with localhost normalization
* - Structured activity categorization (LOGIN, SAVE, DELETE, etc.)
* - Deferred logging using shutdown functions to prevent interference
* - Infinite loop prevention for self-logging scenarios
*
* @package Dedalo
* @subpackage Logger
*/
class logger_backend_activity extends logger_backend {



	/**
	* Activity type mappings
	* Maps human-readable activity names to numeric IDs for storage
	* @see diffusion_section_stats::build_what() for statistics usage
	* @var array<int, int>
	*/
	static $what = [
		'LOG IN'			=>	1,	// dd696 login module
		'LOG OUT'			=>	2,	// dd697 login module
		'NEW'				=>	3,	// dd695 section
		'DELETE'			=>	4,	// dd729 delete section
		'SAVE'				=>	5,	// dd700 component
		'LOAD EDIT'			=>	6,	// dd694 page
		'LOAD LIST'			=>	7,	// dd693 page
		'SEARCH'			=>	8,	// dd699 component
		'UPLOAD'			=>	9,	// dd1090 upload file by tool upload
		'DOWNLOAD'			=>	10,	// dd1080 download file by tool av / image / pdf
		'UPLOAD COMPLETE'	=>	11,	// dd1094 upload file by tool upload
		'DELETE FILE'		=>	12,	// dd1095 delete file by tool
		'RECOVER SECTION'	=>	13,	// dd1092 recover section
		'RECOVER COMPONENT'	=>	14,	// dd1091 recover component
		'STATS'				=>	15,	// dd1098 statistics
		'NEW VERSION'		=>	16	// dd1081 new version file
	];

	// tipos
	static $_SECTION_TIPO = [
		'tipo'			=>'dd542',
		'model_name'	=>'section'
	];
	static $_COMPONENT_IP = [
		'tipo'			=>'dd544',	// (v5 former component_ip)
		'model_name'	=>'component_input_text'
	];
	static $_COMPONENT_WHO = [
		'tipo'			=>'dd543',
		'model_name'	=>'component_portal'	//component_autocomplete
	];
	static $_COMPONENT_WHAT = [
		'tipo'			=> 'dd545',
		'model_name'	=> 'component_select'	// (v5 former component_input_text)
	];
	static $_COMPONENT_WHERE = [
		'tipo'			=>'dd546',	// (v5 former component_autocomplete_ts)
		'model_name'	=>'component_input_text'
	];
	static $_COMPONENT_WHEN	= [
		'tipo'			=>'dd547',
		'model_name'	=>'component_date'
	];
	static $_COMPONENT_PROJECTS	= [
		'tipo'			=>'dd550',
		'model_name'	=>'component_filter'
	];
	static $_COMPONENT_DATA = [
		'tipo'			=>'dd551',
		'model_name'	=>'component_json'	// (v5 former component_input_text)
		// in Ontology appears as component_input_text from v5 compatibility, but mapped to component_json in 'get_model()'
	];

	// ar_elements_activity_tipo
	static $ar_elements_activity_tipo;

	// enable_log static
	public static $enable_log = true;

	// Cached column names for performance (pre-computed in constructor)
	static $_COLUMN_IP;
	static $_COLUMN_WHO;
	static $_COLUMN_WHAT;
	static $_COLUMN_WHERE;
	static $_COLUMN_WHEN;
	static $_COLUMN_DATA;

	// O(1) lookup map for infinite loop prevention
	static $ar_elements_activity_tipo_map;

	// Log queue for batching (prevents 1000s of shutdown functions)
	private static $log_queue = [];

	// Maximum queue size before forced flush (prevents memory bloat)
	private const MAX_QUEUE_SIZE = 100;



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

		// Set ar_elements_activity_tipo
		self::$ar_elements_activity_tipo = [
			self::$_SECTION_TIPO['tipo'],
			self::$_COMPONENT_IP['tipo'],
			self::$_COMPONENT_WHO['tipo'],
			self::$_COMPONENT_WHAT['tipo'],
			self::$_COMPONENT_WHERE['tipo'],
			self::$_COMPONENT_WHEN['tipo'],
			self::$_COMPONENT_DATA['tipo']
		];

		// Build O(1) lookup map for infinite loop prevention
		self::$ar_elements_activity_tipo_map = array_flip(self::$ar_elements_activity_tipo);

		// Cache column names (5× faster than calling get_column_name() each time)
		self::$_COLUMN_IP	 = section_record_data::get_column_name(self::$_COMPONENT_IP['model_name']);
		self::$_COLUMN_WHO	 = section_record_data::get_column_name(self::$_COMPONENT_WHO['model_name']);
		self::$_COLUMN_WHAT	 = section_record_data::get_column_name(self::$_COMPONENT_WHAT['model_name']);
		self::$_COLUMN_WHERE = section_record_data::get_column_name(self::$_COMPONENT_WHERE['model_name']);
		self::$_COLUMN_WHEN	 = section_record_data::get_column_name(self::$_COMPONENT_WHEN['model_name']);
		self::$_COLUMN_DATA	 = section_record_data::get_column_name(self::$_COMPONENT_DATA['model_name']);

		// Call parent constructor
		parent::__construct($url_data);
	}//end __construct



	/**
	* LOG_MESSAGE_DEFER
	* Creates a new record in database.
	* Table: matrix_activity
	* Section tipo: DEDALO_ACTIVITY_SECTION_TIPO
	* @param object $options
	* @return void
	*/
	public function log_message_defer( object $options ) : void {

		// options - validate required properties
		$message	= $options->message ?? null;
		$tipo_where	= $options->tipo_where ?? null;
		$log_data	= $options->log_data ?? null;
		$user_id	= $options->user_id ?? null;

		// check values

		// if the type of activity is not sent, it is not possible to generate log
		if (empty($tipo_where)) {
			debug_log(__METHOD__
				. " Error on log_message (var 'tipo_where' is empty) " . PHP_EOL
				. ' options: ' . to_string($options)
				, logger::ERROR
			);
			return;
		}

		// validate message
		if (empty($message)) {
			debug_log(__METHOD__
				. " Error on log_message (var 'message' is empty) " . PHP_EOL
				. ' options: ' . to_string($options)
				, logger::ERROR
			);
			return;
		}

		// auto-log stop. Prevent infinite loop saving self (O(1) lookup)
		if (isset(self::$ar_elements_activity_tipo_map[$tipo_where])) {
			debug_log(__METHOD__
				." Error on log_message (infinite loop stopped) "
				, logger::ERROR
			);
			return;
		}

		// section record data. Create the data columns directly.
		$data = new stdClass();
		$data->relation	= new stdClass();
		$data->string	= new stdClass();
		$data->date		= new stdClass();
		$data->misc		= new stdClass();

		// IP ADDRESS (user source IP) ##############################################################
		$component_tipo	= self::$_COMPONENT_IP['tipo'];	// dd544 component_input_text
		$column_name	= self::$_COLUMN_IP;

		// value
		$ip_address = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
		// normalize localhost
		if($ip_address==='::1') {
			$ip_address = 'localhost';
		}
		// add data
		$value = (object)[
			'value' => $ip_address,
			'lang' => DEDALO_DATA_NOLAN
		];
		$data->$column_name->$component_tipo = [ $value ];

		// WHO (store user section id_matrix and calculate name on view) ############################
		$component_tipo = self::$_COMPONENT_WHO['tipo'];	// dd543 component_autocomplete
		$column_name	= self::$_COLUMN_WHO;

		// value
		$user_id = $user_id ?? logged_user_id() ?? '-666';
		$locator_user_id = new locator();
		$locator_user_id->set_section_id($user_id);
		$locator_user_id->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
		$locator_user_id->set_type(DEDALO_RELATION_TYPE_LINK);
		$locator_user_id->set_from_component_tipo($component_tipo);
		// add data
		$data->$column_name->$component_tipo = [ $locator_user_id ];

		// WHAT (msg) # Message #####################################################################
		$component_tipo = self::$_COMPONENT_WHAT['tipo'];	// dd545 component_select
		$column_name	= self::$_COLUMN_WHAT;

		// value. Expected as 'LOG IN' => 1, 'LOG OUT' => 2, etc. The message is like 'LOG IN' and is mapped to 1
		// Only normalize if not found directly (avoids string ops for valid messages)
		if (!isset(self::$what[$message])) {
			$message = trim( str_replace(["\t", "\n"], ' ', $message) );
		}
		if (isset(self::$what[$message])) {
			$what_section_id = self::$what[$message];
			$locator_what = new locator();
			$locator_what->set_section_id($what_section_id);
			$locator_what->set_section_tipo('dd42'); // Section 'Activity events'
			$locator_what->set_type(DEDALO_RELATION_TYPE_LINK);
			$locator_what->set_from_component_tipo($component_tipo);
			// add data
			$data->$column_name->$component_tipo = [ $locator_what ];
		}else{
			// Trigger log error
			debug_log(__METHOD__.
				PHP_EOL.'ACTIVITY LOG ERROR'.
				" Unable to resolve locator_what from log message. what_section_id is empty. What info will NOT be saved!".
				PHP_EOL.'message: '.to_string($message),
				logger::ERROR
			);
			if(SHOW_DEBUG===true) {
				$bt = debug_backtrace();
				dump($bt, ' bt ++ '.to_string());
			}
		}

		// WHERE (tipo) #############################################################################
		$component_tipo = self::$_COMPONENT_WHERE['tipo'];	// dd546 component_input_text
		$column_name	= self::$_COLUMN_WHERE;

		// add data
		$value = (object)[
			'value' => $tipo_where,
			'lang' => DEDALO_DATA_NOLAN
		];
		$data->$column_name->$component_tipo = [ $value ];

		// WHEN (Time. timestamp formatted) #########################################################
		$component_tipo = self::$_COMPONENT_WHEN['tipo'];	// dd547 component_date
		$column_name	= self::$_COLUMN_WHEN;

		// value
		$time_value = new stdClass();
		$time_value->start = component_date::get_date_now(); // Returns a 'dd_date' object
		// add data
		$data->$column_name->$component_tipo = [ $time_value ];

		// DATA (param 'log_data' + URL's ...) #########################################################
		$component_tipo = self::$_COMPONENT_DATA['tipo'];	// dd551 component_json
		$column_name	= self::$_COLUMN_DATA;

		// value. Expected assoc array as ['msg'=> 'Upload file complete','data'=>'{string data...}']
		$data_array = !is_array($log_data)
			? [$log_data]
			: $log_data;

		// add data
		$value = (object)[
			'value' => $data_array,
			'lang' => DEDALO_DATA_NOLAN
		];
		$data->$column_name->$component_tipo = [ $value ];

		// SECTION RECORD ##############################################################################
		matrix_activity_db_manager::create(
			'matrix_activity',
			DEDALO_ACTIVITY_SECTION_TIPO,
			$data
		);
	}//end log_message



	/**
	* LOG MESSAGES
	* Logs activity messages with user context and metadata.
	*
	* Data structure stored:
	* IP_ADDRESS	WHO		WHAT	WHERE	WHEN	log_data
	*
	* @param string $message
	*	Activity message (e.g., 'SAVE', 'LOAD EDIT')
	* @param int $log_level = logger::INFO
	*	Log level severity. E.g 75
	* @param string|null $tipo_where = null
	*	Component/section tipo being acted upon. E.g. 'oh32'
	* @param string|null $operations = null
	*	Additional operations info (legacy)
	* @param array|null $log_data = null
	*	Associative array with context data:
	*	[
	*		"msg"			=> "Saved component data",
	*		"tipo"			=> "oh32",
	*		"section_id"	=> "1",
	*		"lang"			=> "lg-nolan",
	*		"top_id"		=> "1",
	*		"top_tipo"		=> "oh1",
	*		"component_name"=> "component_publication",
	*		"table"			=> "matrix",
	*		"section_tipo"	=> "oh1"
	*	]
	* @param int|null $user_id
	*	User ID override (defaults to logged user)
	* @return void
	*/
	public function log_message(
		string $message,
		int $log_level=logger::INFO,
		?string $tipo_where=null,
		?string $operations=null,
		?array $log_data=null,
		?int $user_id=null
	) : void {

		// disable log
		if(logger_backend_activity::$enable_log===false) {
			return;
		}

		$options = (object)[
			'message'		=> $message,
			'log_level'		=> $log_level,
			'tipo_where'	=> $tipo_where,
			'operations'	=> $operations,
			'log_data'		=> $log_data,
			'user_id'		=> $user_id
		];

		// Add to queue
		self::$log_queue[] = $options;

		// Flush immediately if queue full (prevents memory issues)
		if (count(self::$log_queue) >= self::MAX_QUEUE_SIZE) {
			self::flush_queue();
		} else {
			// Register single shutdown handler on first log only
			if (count(self::$log_queue) === 1) {
				register_shutdown_function([self::class, 'flush_queue']);
			}
		}
	}//end log_message



	/**
	* FLUSH QUEUE
	* Processes all queued logs in batch.
	* Called automatically on shutdown or when queue reaches MAX_QUEUE_SIZE.
	* @return void
	*/
	private static function flush_queue() : void {
		if (empty(self::$log_queue)) {
			return;
		}

		// Capture and clear queue before processing
		$batch = self::$log_queue;
		self::$log_queue = [];

		// Process all queued logs
		foreach ($batch as $options) {
			logger::$obj['activity']->log_message_defer($options);
		}
	}//end flush_queue



}//end class logger_backend_activity
