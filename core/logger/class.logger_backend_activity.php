<?php declare(strict_types=1);
/**
* LOGGER BACKEND ACTIVITY CLASS
* Concrete logger backend that writes structured audit records to the
* `matrix_activity` PostgreSQL table (section tipo dd542).
*
* Responsibilities:
* - Convert every significant user action (LOGIN, SAVE, DELETE, etc.) into a
*   typed Dédalo section record and persist it via matrix_activity_db_manager.
* - Normalise the five audit dimensions — IP, WHO, WHAT, WHERE, WHEN — plus
*   an arbitrary JSON data blob into the JSONB column layout expected by the
*   matrix_activity schema.
* - Prevent infinite loops when a log call is itself triggered by a save to one
*   of the activity section's own components (guard via $ar_elements_activity_tipo_map).
* - Defer all actual writes to PHP shutdown time (or a forced flush when the
*   queue reaches MAX_QUEUE_SIZE) so that logging never blocks the request.
* - Exclude volatile/utility section tipos (temp presets, time-machine, user-
*   activity aggregates) that must not generate activity rows.
*
* Data flow:
*   log_message()  →  queue (self::$log_queue)
*                  →  register_shutdown_function(flush_queue)  [first item only]
*   flush_queue()  →  log_message_defer()  →  matrix_activity_db_manager::create()
*
* Relationships:
* - Extends logger_backend (abstract interface).
* - Registered as logger::$obj['activity'] via logger::register().
* - Delegates the actual INSERT to matrix_activity_db_manager::create().
* - References section_record_data::get_column_name() to resolve JSONB column
*   names from component model names (cached in static $_COLUMN_* properties).
* - Constructs locator objects for relational links (WHO→users, WHAT→dd42).
* - Uses component_date::get_date_now() for the WHEN timestamp.
*
* @package Dédalo
* @subpackage Core
*/
class logger_backend_activity extends logger_backend {



	/**
	* WHAT
	* Maps human-readable activity event names to their numeric IDs in the
	* 'Activity events' section (dd42).  The numeric ID is used as section_id
	* when building the WHAT locator so that the display label is resolved from
	* the ontology at read time rather than stored as a plain string.
	*
	* Keys correspond exactly to the $message argument accepted by log_message().
	* Entries must be kept in sync with the dd42 section records in the ontology.
	* @var array<string,int> $what
	*/
	static array $what = [
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
	/**
	* Activity log section descriptor.
	* Points to dd542, the section type that holds all activity records.
	* @var array{tipo:string,model_name:string} $_SECTION_TIPO
	*/
	static array $_SECTION_TIPO = [
		'tipo'			=>'dd542',
		'model_name'	=>'section'
	];
	/**
	* Component descriptor for the IP address field (dd544, component_input_text).
	* Stores the raw IP string of the originating HTTP request.
	* @var array{tipo:string,model_name:string} $_COMPONENT_IP
	*/
	static array $_COMPONENT_IP = [
		'tipo'			=>'dd544',	// (v5 former component_ip)
		'model_name'	=>'component_input_text'
	];
	/**
	* Component descriptor for the WHO field (dd543, component_portal).
	* Stores a locator link to the user section (DEDALO_SECTION_USERS_TIPO) so
	* that the display name is resolved at read time from the users section.
	* @var array{tipo:string,model_name:string} $_COMPONENT_WHO
	*/
	static array $_COMPONENT_WHO = [
		'tipo'			=>'dd543',
		'model_name'	=>'component_portal'	//component_autocomplete
	];
	/**
	* Component descriptor for the WHAT field (dd545, component_select).
	* Stores a locator link into the 'Activity events' section (dd42) whose
	* section_id corresponds to an entry in self::$what.
	* @var array{tipo:string,model_name:string} $_COMPONENT_WHAT
	*/
	static array $_COMPONENT_WHAT = [
		'tipo'			=> 'dd545',
		'model_name'	=> 'component_select'	// (v5 former component_input_text)
	];
	/**
	* Component descriptor for the WHERE field (dd546, component_input_text).
	* Stores the Dédalo tipo (ontology identifier) of the component or section
	* that triggered the activity, e.g. 'oh32'.
	* @var array{tipo:string,model_name:string} $_COMPONENT_WHERE
	*/
	static array $_COMPONENT_WHERE = [
		'tipo'			=>'dd546',	// (v5 former component_autocomplete_ts)
		'model_name'	=>'component_input_text'
	];
	/**
	* Component descriptor for the WHEN field (dd547, component_date).
	* Stores a dd_date object with a 'start' timestamp (ISO-8601) produced by
	* component_date::get_date_now() at the moment log_message() is called.
	* @var array{tipo:string,model_name:string} $_COMPONENT_WHEN
	*/
	static array $_COMPONENT_WHEN	= [
		'tipo'			=>'dd547',
		'model_name'	=>'component_date'
	];
	/**
	* Component descriptor for the PROJECTS field (dd550, component_filter).
	* Reserved for future project-scoping of activity records; populated by
	* callers that pass a projects filter in $log_data.
	* @var array{tipo:string,model_name:string} $_COMPONENT_PROJECTS
	*/
	static array $_COMPONENT_PROJECTS	= [
		'tipo'			=>'dd550',
		'model_name'	=>'component_filter'
	];
	/**
	* Component descriptor for the DATA field (dd551, component_json).
	* Stores the caller-supplied $log_data array as a JSONB value.  The
	* ontology registers this component as component_input_text (v5 legacy)
	* but get_model() maps it to component_json at runtime.
	* @var array{tipo:string,model_name:string} $_COMPONENT_DATA
	*/
	static array $_COMPONENT_DATA = [
		'tipo'			=>'dd551',
		'model_name'	=>'component_json'	// (v5 former component_input_text)
		// in Ontology appears as component_input_text from v5 compatibility, but mapped to component_json in 'get_model()'
	];

	// ar_elements_activity_tipo
	/**
	* Ordered list of all component/section tipos that belong to the activity
	* log section itself.  Built once in __construct() from the $_COMPONENT_* /
	* $_SECTION_TIPO descriptors.  Used to populate the O(1) lookup map.
	* @var array<int,string> $ar_elements_activity_tipo
	*/
	static array $ar_elements_activity_tipo;

	// enable_log static
	/**
	* Master switch for activity logging.  Set to false (e.g. during bulk
	* import or test runs) to skip all log_message() calls with no overhead.
	* @var bool $enable_log
	*/
	public static bool $enable_log = true;

	// Cached column names for performance (pre-computed in constructor)
	/**
	* JSONB column name for the IP component, cached from
	* section_record_data::get_column_name() at construction time.
	* @var string $_COLUMN_IP
	*/
	static string $_COLUMN_IP;
	/**
	* JSONB column name for the WHO component, cached from
	* section_record_data::get_column_name() at construction time.
	* @var string $_COLUMN_WHO
	*/
	static string $_COLUMN_WHO;
	/**
	* JSONB column name for the WHAT component, cached from
	* section_record_data::get_column_name() at construction time.
	* @var string $_COLUMN_WHAT
	*/
	static string $_COLUMN_WHAT;
	/**
	* JSONB column name for the WHERE component, cached from
	* section_record_data::get_column_name() at construction time.
	* @var string $_COLUMN_WHERE
	*/
	static string $_COLUMN_WHERE;
	/**
	* JSONB column name for the WHEN component, cached from
	* section_record_data::get_column_name() at construction time.
	* @var string $_COLUMN_WHEN
	*/
	static string $_COLUMN_WHEN;
	/**
	* JSONB column name for the DATA component, cached from
	* section_record_data::get_column_name() at construction time.
	* @var string $_COLUMN_DATA
	*/
	static string $_COLUMN_DATA;

	// O(1) lookup map for infinite loop prevention
	/**
	* Flipped version of $ar_elements_activity_tipo: maps each activity-section
	* tipo string to its array index.  Used by log_message_defer() to detect in
	* O(1) whether $tipo_where belongs to the activity section itself, which
	* would cause infinite recursion if logged.
	* @var array<string,int> $ar_elements_activity_tipo_map
	*/
	static array $ar_elements_activity_tipo_map;

	// Log queue for batching (prevents 1000s of shutdown functions)
	/**
	* Pending log entries awaiting deferred write.  Items are stdClass objects
	* with keys: message, log_level, tipo_where, operations, log_data, user_id.
	* A single PHP shutdown function is registered on the first push to drain
	* this queue; subsequent pushes reuse that registration.  If the queue
	* reaches MAX_QUEUE_SIZE the flush is triggered immediately to cap memory.
	* @var array<int,object> $log_queue
	*/
	private static array $log_queue = [];

	// Maximum queue size before forced flush (prevents memory bloat)
	/**
	* Hard cap on self::$log_queue length.  When the queue reaches this size
	* flush_queue() is called synchronously rather than waiting for shutdown,
	* preventing unbounded memory growth during bulk operations.
	* @var int MAX_QUEUE_SIZE
	*/
	private const int MAX_QUEUE_SIZE = 100;

	/**
	* EXCLUDED_SECTION_TIPOS
	* Section tipos that must never generate activity log records.
	*
	* These sections are either written automatically by the system (search
	* presets, user-activity aggregates) or are internal virtual constructs
	* (time-machine). Logging them would produce noise, infinite recursion
	* (user-activity writing to itself), or misleading audit trails.
	*
	* - DEDALO_TEMP_PRESET_SECTION_TIPO (dd655): ephemeral search-preset records
	*   created automatically when a user runs a search with saved filters.
	* - DEDALO_TIME_MACHINE_SECTION_TIPO (dd15): virtual section used by the
	*   time-machine feature to expose historical states; not real user data.
	* - USER_ACTIVITY_SECTION_TIPO (dd1521): daily aggregated user-action counter
	*   updated automatically; logging saves to it would recurse.
	* @var array<int,string> $excluded_section_tipos
	*/
	public static array $excluded_section_tipos = [
		DEDALO_TEMP_PRESET_SECTION_TIPO, // dd655 - temporal search presets (automatic saved search configuration)
		DEDALO_TIME_MACHINE_SECTION_TIPO, // dd15 - time machine section (internal virtual section)
		USER_ACTIVITY_SECTION_TIPO, // dd1521 - User activity (automatic sumatory of user actions by day)
	];



	/**
	* __CONSTRUCT
	* Initialises static column-name caches and the infinite-loop prevention
	* map, then delegates connection setup to the parent.
	*
	* All heavy work (column-name resolution, tipo list building) is done once
	* here rather than on every log_message() call, which can fire thousands of
	* times per request during bulk operations.
	*
	* @param array|null $url_data [= null] - Connection descriptor parsed from
	*   the connection string passed to logger::register().  Expected keys:
	*   scheme, host, port, user, pass, path, query.  Example:
	*   [
	*     "scheme" => "activity",
	*     "host" => "auto",
	*     "port" => 5432,
	*     "user" => "auto",
	*     "pass" => "auto",
	*     "path" => "/log_data",
	*     "query" => "table=matrix_activity"
	*   ]
	* @return void
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
			self::$_COMPONENT_PROJECTS['tipo'],
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
	* Builds the full section-record data object and persists it to the
	* `matrix_activity` table via matrix_activity_db_manager::create().
	*
	* This method is always called from flush_queue() (either at PHP shutdown
	* or on a forced mid-request flush) — never directly from application code.
	* It must never be called while handling a save to the activity section's
	* own components, which the infinite-loop guard at the top enforces.
	*
	* Data structure written (each key is a JSONB column in matrix_activity):
	*
	*   $_COLUMN_IP    → [{ value: '<ip>', lang: '' }]
	*   $_COLUMN_WHO   → [locator → DEDALO_SECTION_USERS_TIPO / $user_id]
	*   $_COLUMN_WHAT  → [locator → dd42 / self::$what[$message]]
	*   $_COLUMN_WHERE → [{ value: '<tipo_where>', lang: '' }]
	*   $_COLUMN_WHEN  → [{ start: <dd_date> }]
	*   $_COLUMN_DATA  → [{ value: [<log_data items>], lang: '' }]
	*
	* The $data->relation / $data->string / $data->date / $data->misc sub-objects
	* are initialised but may remain empty; matrix_activity_db_manager uses them
	* to match the expected section_record_data column layout.
	*
	* Side effects:
	* - Executes an INSERT into matrix_activity (via matrix_activity_db_manager).
	* - May write an error to the debug log if $message cannot be resolved in
	*   self::$what, but the record is still inserted without the WHAT locator.
	* - Calls dump() when SHOW_DEBUG is true and $message is unresolvable.
	*
	* @param object $options - Bag of named parameters (produced by log_message()):
	*   - string  $options->message     Activity event key, e.g. 'SAVE' or 'LOG IN'.
	*   - int     $options->log_level   Numeric severity (logger::INFO, etc.).
	*   - string  $options->tipo_where  Dédalo tipo of the acted-upon element.
	*   - string|null $options->operations  Legacy field; not currently consumed.
	*   - array|null  $options->log_data   Caller context array stored as JSON.
	*   - int|null    $options->user_id    Override for the logged-in user ID.
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
		// (!) The '-666' fallback is a string assigned to $user_id which is declared ?int
		// in log_message(); this works at runtime due to PHP's loose typing but is a
		// type mismatch that may produce unexpected behaviour when $user_id is later
		// passed to set_section_id().  Do not change — document and flag only.
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
				dump($bt, ' bt ++ ' . to_string($message));
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
	}//end log_message_defer



	/**
	* LOG_MESSAGE
	* Public entry point for recording a user activity event.
	* Enqueues the event for deferred write; the actual INSERT is deferred to
	* flush_queue(), which runs at PHP shutdown (or earlier if the queue fills).
	*
	* Only the first call per request registers a shutdown function; subsequent
	* calls just push to the queue, keeping overhead minimal during bulk saves.
	*
	* Skipped silently when:
	* - self::$enable_log is false (e.g. during import/test runs).
	* - $tipo_where is in self::$excluded_section_tipos (temp presets, time-
	*   machine, user-activity aggregates).
	*
	* Data structure stored per record:
	*   IP_ADDRESS  WHO  WHAT  WHERE  WHEN  log_data
	*
	* @param string $message - Activity event key; must be a key of self::$what
	*   (e.g. 'SAVE', 'LOAD EDIT').  Whitespace is normalised before lookup.
	* @param int $log_level [= logger::INFO] - Numeric severity passed through
	*   to the options bag; not currently used for filtering but available for
	*   future log-level-gated backends.
	* @param string|null $tipo_where [= null] - Dédalo tipo (ontology ID) of the
	*   component or section being acted upon (e.g. 'oh32').  Required; returns
	*   early with an error if empty.
	* @param string|null $operations [= null] - Legacy field; reserved for future
	*   use; not currently consumed by log_message_defer().
	* @param array|null $log_data [= null] - Caller context stored as JSON in the
	*   DATA column.  Typical shape:
	*   [
	*     "msg"            => "Saved component data",
	*     "tipo"           => "oh32",
	*     "section_id"     => "1",
	*     "lang"           => "lg-nolan",
	*     "top_id"         => "1",
	*     "top_tipo"       => "oh1",
	*     "component_name" => "component_publication",
	*     "table"          => "matrix",
	*     "section_tipo"   => "oh1"
	*   ]
	* @param int|null $user_id [= null] - Override the acting user ID; defaults
	*   to logged_user_id() when null.
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

		// skip Activity for excluded section_tipos (volatile/utility sections)
		if (in_array($tipo_where, self::$excluded_section_tipos, true)) {
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
	* FLUSH_QUEUE
	* Drains self::$log_queue by calling log_message_defer() for each entry.
	* Called either automatically at PHP shutdown (registered on the first
	* log_message() call) or synchronously when the queue fills to MAX_QUEUE_SIZE.
	*
	* The queue is atomically swapped to an empty array before iteration so that
	* any log events triggered inside log_message_defer() (e.g. from debug_log)
	* go onto a fresh queue rather than being lost or causing a double-write.
	*
	* (!) log_message_defer() is accessed via logger::$obj['activity'], which is
	* the same instance as $this in normal operation.  This self-reference is
	* intentional: it allows the backend to be swapped or mocked by replacing
	* logger::$obj['activity'] without changing flush_queue.
	*
	* @return void
	*/
	private static function flush_queue() : void {
		if (empty(self::$log_queue)) {
			return;
		}

		// Atomic queue capture to prevent race conditions
		$batch = self::$log_queue;
		self::$log_queue = [];

		// Process all queued logs with error handling
		foreach ($batch as $options) {
			try {
				logger::$obj['activity']->log_message_defer($options);
			} catch (Exception $e) {
				debug_log(__METHOD__ . " Error processing queued log: " . $e->getMessage(), logger::ERROR);
			}
		}
	}//end flush_queue



}//end class logger_backend_activity
