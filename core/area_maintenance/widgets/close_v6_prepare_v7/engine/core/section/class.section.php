<?php declare(strict_types=1);
/**
* CLASS SECTION
* Represents a Dédalo section — the primary container for records in the data matrix.
*
* A section is the top-level structural unit: it groups a set of components (fields)
* that together describe one entity type (e.g. objects, persons, bibliography).
* Each section has a tipo (ontology identifier) and holds a collection of
* section_record instances, each uniquely identified by a section_id.
*
* Responsibilities:
* - Record lifecycle: create, add, remove section_record instances.
* - Virtual-section resolution: sections can be ontology aliases pointing to a
*   different real section_tipo for storage (section_virtual flag).
* - Relations management: reading, adding, and removing locator entries stored
*   in the section's dato.relations array (or a named alternate container).
* - Ontology traversal: resolving child component tipos by model name, resolving
*   recursive children, and exposing the section_map (thesaurus term/parent/model
*   mapping) stored in the ontology node properties.
* - Diffusion support: get/add diffusion_info metadata on the section dato.
* - Project assignment: on record creation, sets the default or inherited project
*   via component_filter; handles the special project-creation case via
*   component_filter_master.
* - Session SQO: stores and retrieves per-section Search-Query-Objects in the
*   PHP session ($_SESSION['dedalo']['config']['sqo']).
* - Cache management: three static caches (ar_section_instances, cache_ar_children_tipo,
*   section_map_cache) are cleared by clear() between persistent-worker requests.
*
* Data shape managed:
*   - The section dato is a stdClass stored as JSONB in the matrix table column
*     `data` (see $data_column_name). Key sub-keys:
*       - relations       : array of locator objects
*       - diffusion_info  : object keyed by diffusion element tipo
*       - metadata fields : created_by_user, created_date, modified_by_user, modified_date
*
* Virtual sections:
*   A virtual section shares its matrix table with a real section (get_section_real_tipo()
*   resolves this mapping). It may exclude certain components from its real section
*   via an 'exclude_elements' ontology node, and can add its own buttons.
*
* Extends: common (abstract base for all sections and components).
* Extended by: specific section subclasses (e.g. section_thesaurus, section_ontology).
* Collaborates with: section_record, section_record_data, ontology_node, component_common,
*   component_filter, component_filter_master, locator, search, diffusion.
*
* Note: Activity sections (DEDALO_ACTIVITY_SECTION_TIPO) are write-protected; their
*   permission is clamped to 1 and they cannot be created via create_record().
*
* @package Dédalo
* @subpackage Core
*/
class section extends common {



	/**
	* CLASS VARS
	*/

		/**
		 * Instantiated button element objects for this section's toolbar.
		 * Populated by get_section_buttons_tipo() → render logic; null until first render.
		 * Virtual sections merge buttons from both the real and virtual section definitions.
		 * @var ?array $ar_buttons
		 */
		public ?array $ar_buttons = null;

		/**
		 * All project languages available in the current context.
		 * Used by the UI for language-tab rendering and multilingual content switching.
		 * Set during section rendering; null before first access.
		 * @var ?array $ar_all_project_langs
		 */
		public ?array $ar_all_project_langs = null;

		/**
		 * Whether to render the inspector (metadata/debug) panel alongside this section.
		 * The inspector exposes section_id, tipo, permissions, and system timestamps.
		 * Defaults to true; may be suppressed in embedded (portal) contexts.
		 * @var bool $show_inspector
		 */
		public bool $show_inspector = true;

		/**
		 * Whether this section is a virtual section (an ontology alias of another).
		 * Virtual sections reuse a real section's database table but have independent
		 * ontology definitions (different labels, layouts, excluded components).
		 * Resolved lazily by get_section_real_tipo(); initially false.
		 * @var bool $section_virtual
		 */
		public bool $section_virtual = false;

		/**
		 * The real (storage) section tipo when this instance is virtual.
		 * Null until resolved by get_section_real_tipo(). Once resolved:
		 *   - equals $tipo          → this is not a virtual section
		 *   - differs from $tipo    → $tipo is a virtual alias; data lives under $section_real_tipo
		 * @var ?string $section_real_tipo
		 */
		public ?string $section_real_tipo = null;

		/**
		 * Whether this section record is temporary (transient, not persisted to the DB).
		 * Temporary sections use section_id strings like 'temp1' and $save_handler = 'session'.
		 * Intended for holding unsaved records in multi-step creation wizards.
		 * @var bool $is_temp
		 */
		public bool $is_temp = false;

		/**
		 * Arbitrary configuration object supplied at instantiation time.
		 * Used as an escape hatch for passing context-specific flags without
		 * extending the constructor signature.
		 * @var ?object $options
		 */
		public ?object $options = null;

		/**
		 * Where section data is persisted: 'database' (default) or 'session'.
		 * Automatically set to 'session' when section_id is a temp identifier.
		 * All normal sections use 'database'; temp sections use 'session' so
		 * that no DB write occurs until the user explicitly commits the record.
		 * @var string $save_handler
		 */
		public string $save_handler = 'database';

		/**
		 * Static singleton cache: maps cache_key → section instance.
		 * Cache key format: "{tipo}_{mode}" (extended with dataframe keys when applicable).
		 * Bounded to $max_cache_instances (1200) entries; oldest 400 are evicted on overflow.
		 * Cleared entirely by clear() between persistent-worker HTTP requests.
		 * (!) Do not rely on instance identity across requests.
		 * @var array $ar_section_instances
		 */
		public static array $ar_section_instances = [];

		/**
		 * Dirty flag indicating this section's dato has changed since the last DB write.
		 * Defaults to true so that a freshly created section is always persisted.
		 * Checked by save routines to skip unnecessary UPDATE queries.
		 * @var bool $save_modified
		 */
		public bool $save_modified = true;

		/**
		 * Raw database row object for this section record (all matrix columns).
		 * Columns typically include: id, section_tipo, section_id, data (JSONB).
		 * May be pre-injected in bulk-load paths to avoid redundant queries.
		 * Null until the record is loaded from the database.
		 * @var ?object $record
		 */
		public ?object $record = null;

		/**
		 * Name of the JSONB column in the matrix table that stores this section's data.
		 * Hardcoded to 'data' for standard sections (set in __construct via
		 * section_record_data::get_column_name()). Overridable in specialized subclasses.
		 * @var ?string $data_column_name
		 */
		public ?string $data_column_name = null;

		/**
		 * Time Machine versioning context for this section record.
		 * When set, operations use temporal data rather than the live record.
		 * Array shape follows the time_machine module conventions.
		 * @var ?array $tm_context
		 */
		public ?array $tm_context = null;

		/**
		 * Raw JSONB record wrapper from the matrix, used for direct data-source access.
		 * Holds the deserialized stdClass before component hydration.
		 * Protected: only used internally and by section_record subclasses.
		 * @var ?object $JSON_RecordObj_matrix
		 */
		protected ?object $JSON_RecordObj_matrix = null;

		/**
		 * Keyed collection of loaded section_record instances (section_id → section_record).
		 * In list mode this holds all records fetched by the current SQO.
		 * In edit mode it typically holds one record (the currently edited one).
		 * Mutated by add_section_record() and remove_section_record().
		 * @var array $section_records
		 */
		protected array $section_records = [];

		/**
		 * Static cache: section component lookups keyed by a composite uid
		 * (section_tipo | model_names | flags fingerprint).
		 * Avoids repeated ontology traversals for get_ar_children_tipo_by_model_name_in_section().
		 * Cleared by clear(); size-bounded by manage_cache_size().
		 * @var array $cache_ar_children_tipo
		 */
		public static array $cache_ar_children_tipo = [];

		/**
		 * Static cache: maps section_tipo → parsed section_map object (or null).
		 * The section_map is read from the ontology node properties of the
		 * 'section_map' child element; it defines thesaurus term/parent/model
		 * mappings consumed by the ts_term_resolver and section_map resolver.
		 * Cleared by clear(); size-bounded by manage_cache_size().
		 * @var array $section_map_cache
		 */
		public static array $section_map_cache = [];

		/**
		* CLEAR
		* Purges all section static caches to prevent memory and state bleed across
		* persistent-worker HTTP requests (see audit-2026-06-worker-state-bleed).
		*
		* Called by the global common::clear() dispatcher at the start of every request.
		* Must be kept in sync with any new static caches added to this class.
		* @return void
		*/
		public static function clear() : void {
			self::$ar_section_instances = [];
			self::$cache_ar_children_tipo = [];
			self::$section_map_cache = [];
		}


	/**
	* GET_INSTANCE
	* Singleton factory: returns a cached section instance or creates one on first call.
	*
	* Cache key format: "{tipo}_{mode}" for normal sections, extended with
	* "_dataframe_{section_tipo}_{id_key}_{main_component_tipo}" when a
	* caller_dataframe is supplied (so dataframe-scoped views do not share the same
	* object as the top-level section view).
	*
	* Cache bypass rules (always allocates a fresh object):
	*   - $cache === false   : callers that need isolated instances (import pipelines)
	*   - $mode === 'update' : save operations require a clean state
	*   - $mode === 'tm'     : time-machine reads must not pollute the live cache
	*
	* Cache eviction: when the instance pool exceeds 1200 entries, the oldest 400
	* are dropped (FIFO). This is a safety net, not a precision LRU.
	*
	* @param string $tipo - ontology tipo of the section (must resolve to model 'section')
	* @param string $mode = 'list' - rendering mode ('list', 'edit', 'search', 'update', 'tm', …)
	* @param bool $cache = true - false forces a fresh section object (imports, TM)
	* @param ?object $caller_dataframe = null - when set, scopes the cache key to this dataframe context
	* @return section|false - false if $tipo resolves to no model or to a non-section model
	*/
	public static function get_instance( string $tipo, string $mode='list', bool $cache=true, ?object $caller_dataframe=null ) : section|false {

		// tipo check model (only section is expected)
			$model = ontology_node::get_model_by_tipo( $tipo, true );
			if(empty($model)) {
				$msg = " Error. model is empty for tipo: '$tipo'. Unable to create a section";
				debug_log(__METHOD__
					. $msg
					, logger::ERROR
				);
				return false;
			}else
			if ($model!=='section') {
				debug_log(__METHOD__
					. ' Expected model of tipo '.$tipo.' is section, but received is ' . PHP_EOL
					. ' model: ' . to_string($model)
					, logger::ERROR
				);
				return false;
			}

		// cache
			// $cache = false;

		// cache is false case. Use always (cache=false) in imports (!). Not cache new sections (without section_id)
			if ($cache===false || $mode==='update' || $mode==='tm') {

				// instance new section
				$section = new section($tipo, $mode);
				// dataframe case
				if(isset($caller_dataframe)){
					$section->set_caller_dataframe($caller_dataframe);
				}

				return $section;
			}//end if ($cache===false || empty($section_id))

		// cache is true case. Get cache instance if it exists. Otherwise, create a new one
			// cache overload
				$max_cache_instances	= 1200;
				$cache_slice_on			= 400;
				$total					= count(self::$ar_section_instances);
				if ( $total > $max_cache_instances ) {
					// new array
					$new_array = [];
					$i = 1;
					foreach (self::$ar_section_instances as $inst_key => $inst_value) {
						if ($i > $cache_slice_on) {
							$new_array[$inst_key] = $inst_value;
						}else{
							$i++;
						}
					}
					// replace matrix_instances array
					self::$ar_section_instances = $new_array;
				}

			// find current instance in cache
				$cache_key = implode('_', [$tipo, $mode]);
				if(isset($caller_dataframe)){
					// unified pairing: key on id_key (the main item id) + host section + main tipo
					$cache_key .= '_dataframe_'.($caller_dataframe->section_tipo ?? '')
						.'_'.($caller_dataframe->id_key ?? '')
						.'_'.($caller_dataframe->main_component_tipo ?? '');

				}
				if ( !isset(self::$ar_section_instances[$cache_key]) ) {
					self::$ar_section_instances[$cache_key] = new section( $tipo, $mode );
					// dataframe case
					if(isset($caller_dataframe)) {
						self::$ar_section_instances[$cache_key]->set_caller_dataframe($caller_dataframe);
					}
					// Manage cache size to prevent memory leaks (using inherited method)
					self::manage_cache_size(self::$ar_section_instances);
				}


		return self::$ar_section_instances[$cache_key];
	}//end get_instance



	/**
	* CONSTRUCT
	* Initializes a section instance with identity, structural data, and pagination defaults.
	*
	* Private: only called by get_instance() to enforce the singleton cache contract.
	* Extends the abstract common base class which provides shared identity properties
	* (tipo, section_tipo, section_id, mode, lang, permissions, pagination, etc.).
	*
	* Side effects:
	*   - Sets $uid to a nanosecond-precision string (hrtime) for instance tracing.
	*   - Sets $lang to DEDALO_DATA_NOLAN (language-neutral, the section-level default).
	*   - Calls parent::load_structure_data() which populates $ontology_node, $label,
	*     $model, $translatable, and related ontology properties from the cache.
	*   - Sets $data_column_name via section_record_data::get_column_name() — always 'data'
	*     for standard sections.
	*   - Initialises pagination with offset=0, limit=null (unlimited).
	*
	* @param string $tipo - section's ontology identifier
	* @param string $mode - rendering mode ('list', 'edit', 'search', 'tm', …)
	*/
	private function __construct( string $tipo, string $mode ) {

		// uid
			$this->uid = to_string( hrtime(true) ); // nanoseconds

		// Set general vars
			$this->lang			= DEDALO_DATA_NOLAN;
			$this->tipo			= $tipo;
			$this->mode			= $mode;

		// Column data name
			$this->data_column_name = section_record_data::get_column_name( get_called_class() );

		// Section records instances
			$this->section_records = [];

		// load_structure_data. When tipo is set, calculate structure data
			parent::load_structure_data();

		// pagination. Set defaults
			$this->pagination = new stdClass();
				$this->pagination->offset	= 0;
				$this->pagination->limit	= null;
	}//end __construct



	/**
	* CREATE_RECORD
	* Inserts a new record into this section's matrix table and performs all required
	* post-creation bookkeeping.
	*
	* Creation pipeline (in order):
	*   1. Resolve $options (initial values object, optional forced section_id).
	*   2. Require an authenticated user (logged_user_id()); refuse anonymous creation.
	*   3. Guard: activity sections (DEDALO_ACTIVITY_SECTION_TIPO) must never be created
	*      through this path — they are managed by the logger subsystem exclusively.
	*   4. Build metadata (created_by_user, created_date) and modification_data
	*      (modified_by_user, modified_date) via section_record helpers.
	*   5. Call section_record::create() to INSERT the row into the matrix table.
	*   6. Register the new section_record in $this->section_records via add_section_record().
	*   7. Write a 'NEW' entry to the activity log.
	*   8. Invalidate known derivative caches for config-presets, tool-registry, and
	*      project-filter (section-tipo-specific switch).
	*
	* (!) Does NOT set the project filter on the new record. Callers that need
	* project assignment must call set_projects_to_new_section_record() separately
	* (portals do this automatically).
	*
	* @param ?object $options = null - optional overrides:
	*   - values     : ?object — initial data fields to write into the new record;
	*                  merged with metadata/modification_data; non-objects cause a fatal return false.
	*   - section_id : ?int   — force a specific section_id (import use only);
	*                  non-integer values cause a fatal return false.
	* @return int|false - the newly assigned section_id on success; false on any error
	*/
	public function create_record( ?object $options=null ) : int|false {
		$start_time = start_time();

		if(SHOW_DEBUG===true) {
			// metrics
				metrics::inc('section_save_total_calls');
		}

		// Options
			// values. Inject a given values into new section record
			$values = ($options && isset($options->values))
				? clone $options->values
				: new stdClass();
			if ( !is_object($values) ) {
				debug_log(__METHOD__
					. " Values must to be an object " . PHP_EOL
					. " values type: " . gettype($values)
					, logger::ERROR
				);
				return false;
			}

			// section_id. Force record creation with specific section_id (import processes)
			$section_id = ($options && isset($options->section_id)) ? $options->section_id : null;
			if($section_id !== null && !is_int($section_id)) {
				debug_log(__METHOD__
					. " section_id must to be an integer " . PHP_EOL
					. " section_id type: " . gettype($section_id)
					, logger::ERROR
				);
				return false;
			}

		// User id. Current logged user id
		$user_id = logged_user_id();
		if ($user_id === null) {
			debug_log(__METHOD__
				. " Error: no logged user found. Cannot create section record."
				, logger::ERROR
			);
			return false;
		}

		// Tipo. Current section tipo
		$tipo = $this->get_tipo();

		// These processes are for all sections except Activity section
		// Activity section is the logger section and this process is not correct.
		// All other sections has Time Machine, uses projects data and uses caches.
		if( $tipo===DEDALO_ACTIVITY_SECTION_TIPO ) {
			debug_log(__METHOD__
				. " Error to create a new section record, this section is an Activity section that can not be handle here! " . PHP_EOL
				. " section_tipo: " .$tipo
				, logger::ERROR
			);
			return false;
		}

		// 1. Fill the new record data value

			// Section record data

				// metadata. When section is created at first time, a basic data is set to write into the new section.
				$metadata = section_record::build_metadata(
					$tipo,
					$section_id,
					$user_id
				);
				foreach ($metadata as $column_name => $data_item) {
					$values->{$column_name} = $data_item;
				}

				// modification_data. Get current user and date to store the modification info
				$modified_section_data = section_record::build_modification_data(
					$tipo,
					'new_record',
					$user_id
				);
				foreach ($modified_section_data as $column_name => $data_item) {
					foreach ($data_item as $item_tipo => $item_value) {
						if ( !isset($values->{$column_name}) ) {
							$values->{$column_name} = new stdClass();
						}
						$values->{$column_name}->{$item_tipo} = $item_value;
					}
				}

		// 2. Create the new record in the DDBB
			$section_record	= section_record::create( $tipo, $section_id, $values );
			if(!$section_record) {
				debug_log(__METHOD__
					. " Error to create a new section record " . PHP_EOL
					. " section_tipo: " .$tipo . PHP_EOL
					. " values: " .json_encode($values)
					, logger::ERROR
				);
				return false;
			}
			$section_id	= (int)$section_record->section_id;

			// Store the section record instance into section section_records array
			$this->add_section_record( $section_record );

		// 3. Log the creation activity
			logger::$obj['activity']->log_message(
				'NEW', // string $message
				logger::INFO, // int $log_level
				$tipo, // string $tipo_where
				null, // string $operations
				[ // associative array
					'msg'			=> 'Created section record',
					'section_id'	=> $section_id,
					'section_tipo'	=> $tipo,
					'tipo'			=> $tipo,
					'table'			=> common::get_matrix_table_from_tipo($tipo)
				],
				$user_id // int
			);

		// 4. Reset caches
		// Certain section types feed application-wide caches that must be invalidated
		// immediately so subsequent requests see the newly created record.
			switch ($tipo) {

				case DEDALO_REQUEST_CONFIG_PRESETS_SECTION_TIPO:
					// Request-config preset cache is keyed per tipo+mode; a new preset record
					// must be visible immediately without a worker restart.
					request_config_presets::clean_cache();
					break;

				case DEDALO_REGISTER_TOOLS_SECTION_TIPO:
					// Tool registry cache must reflect newly registered tool records right away.
					tools_register::clean_cache();
					break;

				case DEDALO_SECTION_PROJECTS_TIPO:
					// A new project record changes which projects the current user is authorized
					// for. The filter_master cache (dd170) is per-user, so only the current user's
					// cache slot needs purging — the new project will be re-authorized below.
					component_filter_master::clean_cache(
						$user_id, // user id. Current logged user id
						DEDALO_FILTER_MASTER_TIPO // dd170
					);
					break;

				default:
					// no cache to delete here
					break;
			}

		// Debug
			if(SHOW_DEBUG===true) {

				$total_time_ms = exec_time_unit($start_time, 'ms');

				// metrics
					metrics::add_time_ms('section_save_total_time', $total_time_ms);

				debug_log(__METHOD__
					." Create new section finish: ($tipo - $section_id) in time: ".$total_time_ms.' ms'
					, logger::DEBUG
				);
			}


		return $section_id;
	}//end create_record



	/**
	* ADD_SECTION_RECORD
	* Registers a section_record instance into this section's in-memory record pool.
	*
	* Uses section_id as the array key so that re-adding the same record (e.g. after
	* a save) silently replaces the stale reference without creating duplicates.
	* Called by create_record() after a successful INSERT, and by load paths that
	* hydrate records from the database.
	*
	* @param section_record $section_record - the record to register; its section_id must be set
	* @return void
	*/
	public function add_section_record( section_record $section_record ) : void {
		$this->section_records[$section_record->section_id] = $section_record;
	}//end add_section_record



	/**
	* REMOVE_SECTION_RECORD
	* Unregisters a section_record instance from this section's in-memory record pool.
	*
	* Matches by section_id key. If the record is not currently registered, the call
	* is a no-op (safe to call on records that may or may not exist in the pool).
	* Used by delete operations to keep the in-memory pool consistent after removal.
	*
	* @param section_record $section_record - the record to deregister; matched by section_id
	* @return void
	*/
	public function remove_section_record( section_record $section_record ) : void {
		if( isset($this->section_records[$section_record->section_id]) ){
			unset( $this->section_records[$section_record->section_id] );
		}
	}//end remove_section_record



	/**
	* SET_PROJECTS_TO_NEW_SECTION_RECORD
	* Assigns a project locator to a freshly created section record.
	*
	* Two distinct code paths based on the section tipo:
	*
	*   DEDALO_SECTION_PROJECTS_TIPO (a project record was just created):
	*     Adds the new project as an authorized project for the currently logged-in user
	*     by appending a locator to the user's component_filter_master (dd170) dato and
	*     saving it. component_filter_master::Save() automatically invalidates user
	*     project caches, so no explicit cache flush is required here.
	*
	*   All other sections:
	*     Resolves the section's component_filter tipo from the ontology. If none is
	*     found the section is considered "project-less" (e.g. controlled vocabulary lists)
	*     and the call is a no-op with a WARNING log. If a component_filter is found:
	*       - When $component_filter_data is non-empty (portal-injected locators), those
	*         locators are written directly and the component is saved in 'list' mode to
	*         avoid triggering the auto-default-project logic.
	*       - When $component_filter_data is empty, the component is loaded in 'edit' mode,
	*         which automatically saves the default project (DEDALO_DEFAULT_PROJECT)
	*         if the component's dato is currently empty.
	*
	* (!) Constructing component_filter in 'edit' mode triggers an automatic save of
	* the default project, which in turn causes another section save. This is a known
	* side effect of the component_filter design.
	*
	* @param int $section_id - the section_id of the newly created record
	* @param ?array $component_filter_data - caller-supplied project locators (from portals);
	*   null or empty triggers the default-project path
	* @return void
	*/
	private function set_projects_to_new_section_record( int $section_id, ?array $component_filter_data ) {

		// tipo. Current section tipo
			$tipo = $this->get_tipo();

		// user id. Current logged user id
			$user_id = logged_user_id();

		// Projects set defaults data (dd153)
			if ($tipo===DEDALO_SECTION_PROJECTS_TIPO) {

				// Auto authorize this project for current user
				// If this newly created section is a project, the new project is added as authorized to the user who created it.
				// User currently logged in
					$component_filter_master = component_common::get_instance(
						'component_filter_master',
						DEDALO_FILTER_MASTER_TIPO, // dd170
						$user_id,
						'edit',
						DEDALO_DATA_NOLAN,
						DEDALO_SECTION_USERS_TIPO // dd153
					);
					$data_filter_master = $component_filter_master->get_data();

					$filter_master_locator = new locator();
						$filter_master_locator->set_section_id($section_id);
						$filter_master_locator->set_section_tipo(DEDALO_FILTER_SECTION_TIPO_DEFAULT);
						$filter_master_locator->set_type(DEDALO_RELATION_TYPE_FILTER);
						$filter_master_locator->set_from_component_tipo(DEDALO_FILTER_MASTER_TIPO);
					$data_filter_master[] = $filter_master_locator; // Add locator to dato

					$component_filter_master->set_data($data_filter_master);
					$component_filter_master->Save();
					debug_log(__METHOD__
						.' Added locator from section save to component_filter_master ' . PHP_EOL
						.' User filter caches will be deleted to force refresh the data ' . PHP_EOL
						.' user_id: ' .$user_id. PHP_EOL
						.' filter_master_locator: ' . to_string($filter_master_locator)
						, logger::DEBUG
					);
					// (!) Note that component_filter_master force refresh user projects caches on save

			}else{

				// Filter defaults.
				// Note that portal already saves inherited project to new created section
				// To prevent to saves twice, only set default project when not is a portal call to create new record

				// Default project for create standard sections
				// When a section record is created, it is auto assigned the default project (defined in config DEDALO_DEFAULT_PROJECT)
				// when the section has a 'component_filter' defined
				$ar_tipo_component_filter = section::get_ar_children_tipo_by_model_name_in_section(
					$tipo,
					['component_filter'],
					true, // from_cache
					true, // resolve_virtual
					true, // recursive
					true, // search_exact
					[] // ar_tipo_exclude_elements
				);
				if (empty($ar_tipo_component_filter[0])) {

					// section without project case (list of values mainly)
					debug_log(__METHOD__
						." Ignored set project default in section without component_filter: $tipo" . PHP_EOL
						.' section_tipo: ' . $tipo . PHP_EOL
						.' section label ' . ontology_node::get_term_by_tipo($tipo, DEDALO_APPLICATION_LANG)
						, logger::WARNING
					);

				}else{

					if (!empty($component_filter_data)) {

						// custom projects dato passed
						// set the component_filter with the dato sent by the caller (portals)
						$component_filter = component_common::get_instance(
							'component_filter',
							$ar_tipo_component_filter[0],
							$section_id,
							'list', // Important 'list' to avoid auto save default value !!
							DEDALO_DATA_NOLAN,
							$tipo
						);
						$component_filter->set_data( $component_filter_data );
						$component_filter->Save();

					}else{

						// default case

						// When component_filter is called in edit mode, the component check if data is empty and if is,
						// add default user project and save it
						// (!) Note that construct component_filter in edit mode, saves default value too. Here, current section is saved again
						$component_filter = component_common::get_instance(
							'component_filter',
							$ar_tipo_component_filter[0],
							$section_id,
							'edit', // Important edit !! // Already saves default project when load in edit mode
							DEDALO_DATA_NOLAN,
							$tipo
						);
						// note that section is auto-saved here
					}
				}//end if (empty($ar_tipo_component_filter[0]))

			}//end if ($this->tipo===DEDALO_SECTION_PROJECTS_TIPO)

	}//end set_projects_to_new_section_record




	/**
	* GET_SECTION_REAL_TIPO
	* Resolves and caches the real (storage) section tipo for this instance.
	*
	* On first call, delegates to get_section_real_tipo_static() and memoises
	* both $section_real_tipo and $section_virtual on the instance, so subsequent
	* calls return the cached value without touching the ontology.
	*
	* Result interpretation:
	*   - returned value === $this->tipo  → not virtual; $section_virtual = false
	*   - returned value !== $this->tipo  → virtual alias; $section_virtual = true;
	*     data is stored under the returned real tipo's matrix table
	*
	* @return string - the real section_tipo (equals $this->tipo when not virtual)
	*/
	public function get_section_real_tipo() : string {

		if(isset($this->section_real_tipo)) {
			return $this->section_real_tipo;
		}

		$section_real_tipo = section::get_section_real_tipo_static( $this->tipo );
		if ($section_real_tipo!==$this->tipo) {
			// Fix section_real_tipo
			$this->section_real_tipo	= $section_real_tipo;
			$this->section_virtual		= true;
		}else{
			// Fix section_real_tipo
			$this->section_real_tipo	= $section_real_tipo;
			$this->section_virtual		= false;
		}

		return $section_real_tipo;
	} //end get_section_real_tipo



	/**
	* GET_SECTION_REAL_TIPO_STATIC
	* Resolves the real (storage) section tipo for any given section_tipo without
	* requiring a section instance.
	*
	* Looks up ontology relations of model 'section' on the given tipo via
	* common::get_ar_related_by_model(). A virtual section declares exactly one
	* 'section' relation pointing to its real counterpart. If no such relation
	* exists, the input tipo is the real tipo and it is returned unchanged.
	*
	* Used both by the instance method get_section_real_tipo() and by static
	* helpers that need virtual-section resolution without constructing an object
	* (e.g. get_ar_children_tipo_by_model_name_in_section with resolve_virtual=true).
	*
	* @param string $section_tipo - the tipo to resolve (may be virtual or real)
	* @return string - the real section_tipo; equals $section_tipo when not virtual
	*/
	public static function get_section_real_tipo_static(string $section_tipo) : string {

		$ar_related = common::get_ar_related_by_model(
			'section', // string model_name
			$section_tipo
		);

		$section_real_tipo = $ar_related[0] ?? $section_tipo;


		return $section_real_tipo;
	}//end get_section_real_tipo_static



	/**
	* GET_AR_CHILDREN_TIPO_BY_MODEL_NAME_IN_SECTION
	* Returns all child element tipos of a section that match the requested model name(s).
	*
	* This is the primary ontology-traversal entry point used throughout the codebase
	* to locate components (e.g. ['component_filter']), buttons (['button_']),
	* layout groupers (['section_group']), and structural markers (['section_map']).
	*
	* Traversal behaviour:
	*   - Components (model name contains 'component') are searched recursively by default
	*     (walks section_group, section_tab, tab children). Other models default to first level only.
	*   - When multiple model names are requested (count > 1) the traversal is always recursive.
	*   - $search_exact=true requires an exact model name match; false uses str_contains.
	*
	* Virtual-section resolution ($resolve_virtual=true):
	*   1. Resolves $section_tipo to its real counterpart via get_section_real_tipo_static().
	*   2. Reads the 'exclude_elements' node of the virtual section to find tipos that
	*      were explicitly hidden (overrides). Those tipos — and their recursive children
	*      if they are groupers — are subtracted from the real section's child list.
	*   3. Any $ar_tipo_exclude_elements=false sentinel triggers automatic ontology resolution
	*      of exclude_elements; pass an explicit array (even []) to skip that lookup.
	*
	* (!) Keep default $resolve_virtual=false. Passing true forces two ontology lookups
	* and may return different results for the same section_tipo, which is intentional
	* for virtual sections but unexpected for callers that always want the real layout.
	*
	* Caching:
	*   Results are stored in self::$cache_ar_children_tipo keyed by a composite uid
	*   that encodes all parameters. The cache is bounded by manage_cache_size() and
	*   cleared by clear() between requests.
	*
	* @param string $section_tipo - the section to introspect (virtual or real)
	* @param array $ar_model_name_required - one or more model names to match
	*   (e.g. ['component_filter'], ['button_'], ['component_'])
	* @param bool $from_cache = true - skip the cache when false (rare; mainly for tests)
	* @param bool $resolve_virtual = false - when true, resolves virtual-section overrides
	* @param bool $recursive = true - walk group/tab children recursively
	* @param bool $search_exact = false - exact match vs. str_contains on model name
	* @param array|false $ar_tipo_exclude_elements = false - tipos to exclude from results;
	*   false triggers automatic ontology resolution of the virtual section's exclude_elements
	* @param ?array $ar_exclude_models = null - additional model names to skip during
	*   get_ar_recursive_children() traversal (used in ICH and similar multi-section contexts)
	* @return array - list of matching child tipos (preserves ontology order, de-duplicated)
	*/
	public static function get_ar_children_tipo_by_model_name_in_section(
			string $section_tipo,
			array $ar_model_name_required,
			bool $from_cache=true,
			bool $resolve_virtual=false, // (!) keep default resolve_virtual=false
			bool $recursive=true,
			bool $search_exact=false,
			array|false $ar_tipo_exclude_elements=false,
			?array $ar_exclude_models=null
		) : array {


		// cache_uid. Incorporate all parameters that affect the result.
		// md5(serialize()) is used for complex parameters ($ar_tipo_exclude_elements,
		// $ar_exclude_models) that cannot be safely inlined as strings.
		$cache_uid = implode('_', [
			$section_tipo,
			implode('|', $ar_model_name_required),
			(int)$resolve_virtual,
			(int)$recursive,
			(int)$search_exact,
			md5(serialize($ar_tipo_exclude_elements)),
			md5(serialize($ar_exclude_models))
		]);
		if ($from_cache && isset(self::$cache_ar_children_tipo[$cache_uid])) {
			return self::$cache_ar_children_tipo[$cache_uid];
		}

		$ar_elements_to_be_exclude = [];

		#
		# RESOLVE_VIRTUAL : Resolve virtual section to real
		if($resolve_virtual === true) {

			# ORIGINAL TIPO : always keeps the original type (current)
			$original_tipo = $section_tipo;

			# SECTION VIRTUAL
			$section_real_tipo = section::get_section_real_tipo_static($section_tipo);

			if($section_real_tipo!==$original_tipo) {
				// Overwrite current section tipo with real section tipo
				$section_tipo = $section_real_tipo;
			}//end if($section_real_tipo!=$original_tipo) {

			# EXCLUDE ELEMENTS
			if ($ar_tipo_exclude_elements===false) {
				$ar_tipo_exclude_elements = ontology_node::get_ar_tipo_by_model_and_relation(
					$original_tipo, // string tipo
					'exclude_elements', // string model_name
					'children', // string relation_type
					true // $search_exact // bool search_exact
				);
			}

			$tipo_exclude_elements = $ar_tipo_exclude_elements[0] ?? false;
			if ($tipo_exclude_elements) {
				$ar_elements_to_be_exclude	= ontology_node::get_relation_nodes(
					$tipo_exclude_elements,
					false, // bool cache
					true // bool simple
				);
				foreach ($ar_elements_to_be_exclude as $element_tipo) {
					$additional_excludes = [];
					$model_name = ontology_node::get_model_by_tipo($element_tipo, true);
					if($model_name==='section_group' || $model_name === 'section_tab' || $model_name === 'tab') {
						$ar_recursive_children	= section::get_ar_recursive_children($element_tipo, $ar_exclude_models);
						$additional_excludes	= [...$additional_excludes, ...$ar_recursive_children];
					}
					$ar_elements_to_be_exclude = [...$ar_elements_to_be_exclude, ...$additional_excludes];
				}//end foreach ($ar_elements_to_be_exclude as $key => $element_tipo)
			}
		}//end if($resolve_virtual)

		$tipo						= $section_tipo;
		$section_ar_children_tipo	= array();


		// we obtain the child elements of this section
		// Two traversal depths:
		//   recursive   → calls get_ar_recursive_children(), which walks through
		//                  section_group / section_tab / tab groupers to reach nested components.
		//   first-level → calls ontology_node::get_ar_children_of_this(), which returns
		//                  only direct children (buttons, section_map, etc.).
		// The heuristic: if any required model contains 'component', default to recursive
		// (components live inside groups); everything else defaults to first level.
		// When multiple models are requested, we always go recursive to catch all depths.
		if (count($ar_model_name_required)>1) {

			if (true===$recursive) { // Default is recursive
				$ar_recursive_children = section::get_ar_recursive_children($tipo, $ar_exclude_models);
			}else{
				$ontology_node			= ontology_node::get_instance($tipo);
				$ar_recursive_children	= $ontology_node->get_ar_children_of_this();
			}

		}else{

			switch (true) {
				// Components are searched recursively
				case (strpos($ar_model_name_required[0], 'component')!==false && $recursive!==false):
					$ar_recursive_children = section::get_ar_recursive_children($tipo, $ar_exclude_models);
					break;
				// Others (section_xx, buttons, etc.) are in the first level
				default:
					$ontology_node			= ontology_node::get_instance($tipo);
					$ar_recursive_children	= $ontology_node->get_ar_children_of_this();
					break;
			}
		}

		if( empty($ar_recursive_children) ) {
			// throw new Exception(__METHOD__." ar_recursive_children is empty! This section don't have: '$model_name_required' ");
			// debug_log(__METHOD__." ar_recursive_children is empty! This section id=$parent don't have: '$model_name_required' ". __METHOD__ );
			return $section_ar_children_tipo; # return empty array
		}

		// unset the exclude elements of the virtual section to the original section
		if($resolve_virtual === true) {
			$ar_recursive_children = array_diff($ar_recursive_children, $ar_elements_to_be_exclude);
		}

		// Filter children by models
		$section_ar_children_tipo = self::filter_children_by_models(
			$ar_recursive_children,
			$ar_model_name_required,
			$search_exact
		);

		// cache. Store in cache for speed
			self::$cache_ar_children_tipo[$cache_uid] = $section_ar_children_tipo;
			// Manage cache size to prevent memory leaks (using inherited method)
			self::manage_cache_size(self::$cache_ar_children_tipo);


		return $section_ar_children_tipo;
	}//end get_ar_children_tipo_by_model_name_in_section



	/**
	* FILTER_CHILDREN_BY_MODELS
	* Filters a flat list of tipos, keeping only those whose ontology model name
	* matches at least one entry in $ar_model_name_required.
	*
	* Deduplication is O(1) via $result_keys so that each tipo appears at most once
	* even when a single tipo could satisfy multiple required model names.
	*
	* @param array $ar_recursive_children - flat tipo list from get_ar_recursive_children()
	* @param array $ar_model_name_required - model names to match (e.g. ['component_filter'])
	* @param bool $search_exact - true = strict equality; false = str_contains substring match
	* @return array - filtered and de-duplicated list of tipos, preserving traversal order
	*/
	private static function filter_children_by_models(
		array $ar_recursive_children,
		array $ar_model_name_required,
		bool $search_exact
		): array {

		$result = [];
		$result_keys = []; // For O(1) lookups

		foreach($ar_recursive_children as $current_tipo) {
			if (isset($result_keys[$current_tipo])) {
				continue; // Already added
			}

			$model_name = ontology_node::get_model_by_tipo($current_tipo, true);

			foreach($ar_model_name_required as $model_name_required) {
				$matches = $search_exact
					? ($model_name === $model_name_required)
					: str_contains($model_name, $model_name_required);

				if ($matches) {
					$result[] = $current_tipo;
					$result_keys[$current_tipo] = true;
					break; // Found match, no need to check other required models
				}
			}
		}

		return $result;
	}//end filter_children_by_models



	/**
	* GET_AR_RECURSIVE_CHILDREN
	* Thin wrapper around ontology_node::get_ar_recursive_children() that injects
	* section-appropriate default model exclusions.
	*
	* Default excluded models (always suppressed from section child traversal):
	*   - 'box elements'             : layout-only containers without data meaning
	*   - 'area'                     : area elements belong to the UI shell, not the section
	*   - 'component_semantic_node'  : v5 artefact; present in legacy ontologies but unused in v6+
	*
	* Additional caller-supplied $ar_exclude_models are merged with the defaults.
	* Used by ICH and other multi-section layouts to prevent auxiliary nested sections
	* from contributing their children to the parent's component list.
	*
	* @param string $tipo - root tipo whose subtree should be traversed
	* @param ?array $ar_exclude_models = null - extra model names to exclude beyond the defaults
	* @return array - flat list of descendant tipos (depth-first, excluding excluded models' subtrees)
	*/
	public static function get_ar_recursive_children( string $tipo, ?array $ar_exclude_models=null ) : array {

		# AR_EXCLUDE_MODELS
		$default_ar_exclude_models = [
			'box elements',
			'area',
			'component_semantic_node' // used in v5 but unused in v6
		];

		# Current elements and children are not considerate part of section and must be excluded in children results
		$exclude_models = !empty($ar_exclude_models)
			? [...$default_ar_exclude_models, ...$ar_exclude_models]
			: $default_ar_exclude_models;


		$ar_recursive_children = ontology_node::get_ar_recursive_children(
			$tipo, // string tipo
			false, // bool is recursion
			$exclude_models, // array ar_exclude_models
		);

		return $ar_recursive_children;
	}//end get_ar_recursive_children



	/**
	* GET_SECTION_BUTTONS_TIPO
	* Returns the ordered list of button tipos that should appear in this section's toolbar.
	*
	* Virtual vs real section handling:
	*   Virtual section ($section_real_tipo !== $this->tipo):
	*     1. Resolves the virtual section's 'exclude_elements' node to get tipos that should
	*        not appear (inherited from the real section). Warns if no exclude_elements is found
	*        — all virtual sections should define one.
	*     2. Fetches button_ tipos from the real section, filtering out excluded tipos.
	*     3. Fetches button_ tipos specific to the virtual section itself.
	*     4. Merges both sets (real first, then virtual-specific) into a single ordered list.
	*
	*   Real section:
	*     Returns all button_ tipos found at the first ontology level of $this->tipo.
	*
	* (!) Buttons are at the first level of the section (not inside groups), so recursive=false
	* is used throughout. Changing this to recursive=true would silently include buttons
	* nested inside section_groups, which is not the intended behaviour.
	*
	* @return array - ordered list of button tipos for toolbar rendering
	*/
	public function get_section_buttons_tipo() : array {

		// section_real_tipo
			$section_real_tipo = $this->get_section_real_tipo();

		// section virtual case
		if ($section_real_tipo!==$this->tipo) {

			// ar_excluded_tipo. Exclude elements of layout edit
			// vars: $section_tipo, $ar_model_name_required, $from_cache=true, $resolve_virtual=false, $recursive=true, $search_exact=false, $ar_tipo_exclude_elements=false
				$ar_excluded_tipo			= false;
				$ar_exclude_elements_tipo	= section::get_ar_children_tipo_by_model_name_in_section(
					$this->tipo, // section_tipo
					['exclude_elements'], // ar_model_name_required
					true, // from_cache
					false, // resolve_virtual
					false, // recursive
					false, // search_exact
					false // ar_tipo_exclude_elements
				);
				if (!isset($ar_exclude_elements_tipo[0])) {
					debug_log(__METHOD__
						." Warning. exclude_elements of section $this->tipo not found (2). All virtual section must has defined exclude_elements ",
						logger::WARNING
					);
				}else{
					// locate excluded tipos (related terms) in this virtual section
					$ar_excluded_tipo = ontology_node::get_relation_nodes(
						$ar_exclude_elements_tipo[0],
						false, // bool cache
						true // bool simple
					);
				}

			// real section
				$children_real_tipos = section::get_ar_children_tipo_by_model_name_in_section(
					$section_real_tipo, // section_tipo
					['button_'], // ar_model_name_required
					true, // from_cache
					false, // resolve_virtual
					false, // recursive
					false, // search_exact
					$ar_excluded_tipo // ar_tipo_exclude_elements
				);

			// virtual section. Add the specific buttons of the virtual section, if the virtual have buttons add to the list.
				$children_virtual_tipos = section::get_ar_children_tipo_by_model_name_in_section(
					$this->tipo, // section_tipo
					['button_'], // ar_model_name_required
					true, // from_cache
					false, // resolve_virtual
					false, // recursive
					false, // search_exact
					$ar_excluded_tipo // ar_tipo_exclude_elements
				);

			$ar_buttons_tipo = [...$children_real_tipos, ...$children_virtual_tipos];

		}else{

			// if the section is a real section, add the buttons directly
			$ar_buttons_tipo = section::get_ar_children_tipo_by_model_name_in_section(
				$this->tipo, // section_tipo
				['button_'], // ar_model_name_required
				true, // from_cache
				false, // resolve_virtual
				false, // recursive
				false, // search_exact
				false //ar_tipo_exclude_elements
			);

		}//end if ($this->section_virtual==true )


		return $ar_buttons_tipo;
	}//end get_section_buttons_tipo



	/**
	* GET_SECTION_TIPO
	* Semantic alias of get_tipo() that clarifies caller intent at call sites
	* dealing with sections rather than arbitrary common elements.
	* Returns the section's ontology tipo identifier (e.g. 'oh1', 'dd153').
	* @return string - the section's tipo
	*/
	public function get_section_tipo() : string {

		return $this->get_tipo();
	}//end get_section_tipo



	/**
	* GET_AR_ALL_SECTION_RECORDS_UNFILTERED
	* Returns an array of all section_id values for a given section_tipo,
	* without applying any project or search filter.
	*
	* (!) Memory hazard: loads all section_ids into a PHP array. A WARNING is logged
	* when the result set exceeds 1000 rows. For large sections, prefer the streaming
	* variant get_resource_all_section_records_unfiltered() which returns a PgSql
	* resource handle for row-by-row iteration without buffering.
	*
	* @see diffusion::build_table_data_recursive — primary caller in the diffusion pipeline
	* @param string $section_tipo - the section to scan
	* @return array - ordered list of section_id strings (ASC), empty on error
	*/
	public static function get_ar_all_section_records_unfiltered( string $section_tipo ) : array {

		$result = section::get_resource_all_section_records_unfiltered(
			$section_tipo
		);

		if(SHOW_DEBUG===true) {
			$n_rows = pg_num_rows($result);
			if ($n_rows>1000) {
				debug_log(__METHOD__
					." WARNING: TOO MANY RESULTS IN THE QUERY. TO OPTIMIZE MEMORY, DO NOT STORE RESULTS IN ARRAY IN THIS SEARCH. BEST USE 'get_resource_all_section_records_unfiltered' "
					, logger::ERROR
				);
			}
		}
		$ar_records = [];
		while ($rows = pg_fetch_assoc($result)) {
			$ar_records[] = $rows['section_id'];
		}

		return $ar_records;
	}//end get_ar_all_section_records_unfiltered



	/**
	* GET_RESOURCE_ALL_SECTION_RECORDS_UNFILTERED
	* Returns a raw PostgreSQL result resource for streaming all records of a section.
	*
	* Unlike get_ar_all_section_records_unfiltered(), this method does NOT buffer
	* records into a PHP array, making it suitable for very large datasets.
	*
	* Typical iteration pattern:
	* <code>
	*   $result = section::get_resource_all_section_records_unfiltered($section_tipo);
	*   while ($rows = pg_fetch_assoc($result)) {
	*       $current_id = $rows['section_id'];
	*   }
	* </code>
	*
	* The SQL query annotates itself with the calling method name (-- __METHOD__)
	* for PostgreSQL log traceability.
	*
	* @param string $section_tipo - the section to scan
	* @param string $select = 'section_id' - SQL SELECT columns (default: section_id only)
	* @return \PgSql\Result|bool - PgSql result handle on success; false when the matrix table
	*   is unknown or the query fails
	*/
	public static function get_resource_all_section_records_unfiltered( string $section_tipo, string $select='section_id' ) {

		$matrix_table	= common::get_matrix_table_from_tipo($section_tipo);
		// Ignore invalid empty matrix tables
		if (empty($matrix_table)) {
			debug_log(__METHOD__
				. " ERROR: invalid empty matrix table " . PHP_EOL
				. ' section_tipo: ' . $section_tipo
				, logger::ERROR
			);
			return false;
		}
		$sql   = "-- ".__METHOD__." \nSELECT $select FROM \"$matrix_table\" WHERE section_tipo = $1 ORDER BY section_id ASC ";
		$result	= matrix_db_manager::exec_search($sql, [$section_tipo]);

		return $result;
	}//end get_resource_all_section_records_unfiltered




	### /DIFFUSION INFO #####################################################################################



	/**
	* GET_DIFFUSION_INFO
	* Returns the diffusion_info object stored inside this section's dato, if present.
	*
	* The diffusion_info key is a stdClass keyed by diffusion element tipo, where each
	* sub-key holds a record of the last publish event for that diffusion element:
	* <code>
	*   {
	*     "dd_some_diffusion_tipo": {
	*       "date":    "2025-03-01 14:22:00",
	*       "user_id": 42
	*     },
	*     ...
	*   }
	* </code>
	*
	* Returns null when no diffusion_info has been written to this record yet.
	* Used by the diffusion pipeline to decide whether a record needs republishing.
	*
	* @return ?object - parsed diffusion_info stdClass, or null when absent
	*/
	public function get_diffusion_info() : ?object {

		$dato			= $this->get_dato();
		$diffusion_info	= $dato->diffusion_info ?? null;


		return $diffusion_info;
	}//end get_diffusion_info



	### RELATIONS #####################################################################################



	/**
	* GET_RELATIONS
	* Returns the array of locator objects stored under a named relations container
	* within this section's dato.
	*
	* Relations are the primary mechanism Dédalo uses to represent inter-record links.
	* Each locator object has at minimum: section_id, section_tipo, type properties.
	*
	* The default container 'relations' holds the section's primary link set.
	* Alternate containers (e.g. 'related_relations') are used for secondary link types.
	*
	* Returns an empty array (never null) when:
	*   - section_id is not yet set (record not yet created), or
	*   - the relations container key does not exist in the dato.
	*
	* @param string $relations_container = 'relations' - dato sub-key to read
	* @return array - array of locator stdClass objects; empty when none exist
	*/
	public function get_relations( string $relations_container='relations' ) : array {

		if (empty($this->section_id)) {
			// Section do not exists yet. Return empty array
			return [];
		}

		$dato = $this->get_dato(); // Force load data

		$relations = $dato->{$relations_container} ?? [];


		return $relations;
	}//end get_relations



	/**
	* ADD_RELATION
	* Appends a locator to the named relations container in this section's dato.
	*
	* Validation guards (all return false on failure):
	*   - $locator must be a non-empty object.
	*   - $locator->type must be set (identifies the relation type, e.g. DEDALO_RELATION_TYPE_FILTER).
	*   - Stripping is applied: if $locator->paginated_key exists it is removed (transient UI property).
	*   - Existing locators are validated for well-formedness; malformed entries are logged.
	*   - Duplicate detection via locator::in_array_locator() prevents double-adding the same link.
	*
	* Side effect: mutates $this->dato directly (does NOT call save). The caller must
	* explicitly call Save() or the parent record's save routine to persist the change.
	*
	* @param object $locator - the locator to add; must have section_id, section_tipo, type
	* @param string $relations_container = 'relations' - target container key in dato
	* @return bool - true when the locator was added; false when rejected (invalid or duplicate)
	*/
	public function add_relation( object $locator, string $relations_container='relations' ) : bool {

		// check locator is valid
			if(empty($locator)) {
				debug_log(__METHOD__
					." Invalid empty locator is received to add (empty)." . PHP_EOL
					." Locator was ignored (type:".gettype($locator).") " . PHP_EOL
					.' locator: '.to_string($locator)
					, logger::ERROR
				);
				return false;
			}
			if (!is_object($locator)) {
				debug_log(__METHOD__
					." Invalid locator is received to add. (non object)" . PHP_EOL
					." Locator was ignored (type:".gettype($locator).") " . PHP_EOL
					.' locator: ' . to_string($locator)
					, logger::ERROR
				);
				return false;
			}
			if (!isset($locator->type)) {
				debug_log(__METHOD__
					." Invalid locator is received to add. (type is not set)" . PHP_EOL
					." Locator was ignored (type:".gettype($locator).") " . PHP_EOL
					.' locator: ' . to_string($locator)
					, logger::ERROR
				);
				return false;
			}

		// paginated_key. Remove possible property paginated_key if it exists
			if (isset($locator->paginated_key)) {
				debug_log(__METHOD__
					. " Removing temporal property 'paginated_key' from locator " . PHP_EOL
					. ' locator: ' . to_string($locator)
					, logger::ERROR
				);
				unset($locator->paginated_key);
			}

		// relations. section relations data. Could be empty
			$relations = $this->get_relations( $relations_container );
			if (!empty($relations)) {
				// data integrity check: Clean possible bad formed locators (old and beta errors)
				foreach ($relations as $current_relation) {
					if (!is_object($current_relation) ||
						!isset($current_relation->section_id) ||
						!isset($current_relation->section_tipo) ||
						!isset($current_relation->type)
						) {

						debug_log(__METHOD__
							." Invalid relations locator found. " . PHP_EOL
							.' !! FOUNDED BAD FORMAT RELATION LOCATOR IN SECTION_RELATION DATA:' . PHP_EOL
							.' The execution will stop until this erroneous data is corrected!' . PHP_EOL
							.' locator: '. json_encode($current_relation) . PHP_EOL
							.' relations: '. json_encode($relations)
							, logger::ERROR
						);
						// throw new Exception("Error Processing Request. !! FOUNDED BAD FORMAT RELATION LOCATOR IN SECTION_RELATION DATA: (type:".gettype($current_relation).") ".to_string($current_relation), 1);
					}
				}
			}

		// safe array index to prevent accidental assoc array
			$relations = array_values($relations);

		// Add if not already exists
			$locator_exists = locator::in_array_locator( $locator, $relations );
			if ($locator_exists===true) {

				debug_log(__METHOD__
					.' Ignored add locator action: locator already exists: ' . PHP_EOL
					.' locator: '. to_string($locator)
					, logger::WARNING
				);

				return false;
			}
			array_push($relations, $locator);

		// Force load 'dato' if not exists / loaded
		// (!) This guard is kept for safety even though get_relations() already triggers
		// get_dato() internally. The double-check ensures $this->dato is a writable object
		// before we mutate it directly below (handles edge cases where dato was nulled out).
			if ( empty($this->dato) && $this->section_id>0 ) {
				$this->get_dato();
			}
			if ( empty($this->dato) || !is_object($this->dato) ) {
				$this->dato = new stdClass();
			}

		// Update whole container
		// Replace the entire container key so the change is visible to any subsequent
		// get_relations() call on this same object without requiring a DB reload.
			$this->dato->{$relations_container} = $relations;


		return true;
	}//end add_relation



	/**
	* REMOVE_RELATION
	* Removes a locator from the named relations container in this section's dato.
	*
	* Comparison strategy: always matches on the core triple (section_id, section_tipo, type).
	* Additional optional properties are added to the comparison set when they are present
	* on the supplied $locator, enabling precise removal of a single entry within a multi-link
	* set that shares the same core triple:
	*   - from_component_tipo : narrows match to a specific source component
	*   - tag_id              : narrows match to a specific media tag
	*   - component_tipo      : narrows match to a specific component binding
	*   - section_top_tipo    : narrows match to a portal/relation top-section scope
	*   - section_top_id      : narrows match to a portal/relation top-record scope
	*
	* Side effect: when at least one locator is removed, mutates $this->dato directly.
	* The caller must explicitly call Save() to persist the change.
	*
	* @param object $locator - the locator to remove; core triple (section_id, section_tipo, type) required
	* @param string $relations_container = 'relations' - container key in dato
	* @return bool - true when at least one locator was removed; false when no match was found
	*/
	public function remove_relation( object $locator, string $relations_container='relations' ) : bool {

		// ar_properties. Used to compare existing locators with given
		// Start with the mandatory core triple, then extend with any optional discriminators
		// that are present on the supplied locator to avoid over-broad removal.
			$ar_properties=array('section_id','section_tipo','type');
			// optional properties, based on given locator
			if (isset($locator->from_component_tipo))	$ar_properties[] = 'from_component_tipo';
			if (isset($locator->tag_id))				$ar_properties[] = 'tag_id';
			if (isset($locator->component_tipo))		$ar_properties[] = 'component_tipo';
			if (isset($locator->section_top_tipo))		$ar_properties[] = 'section_top_tipo';
			if (isset($locator->section_top_id))		$ar_properties[] = 'section_top_id';

		// add locators to new_relations array excluding given locator
			$removed		= false;
			$new_relations	= [];
			$relations		= $this->get_relations( $relations_container );
			foreach ($relations as $current_locator_obj) {

				// Test if already exists
				$equal = locator::compare_locators( $current_locator_obj, $locator, $ar_properties );
				if ( $equal===false ) {

					// add
					$new_relations[] = $current_locator_obj;

				}else{

					// no add
					$removed = true;
				}
			}

		// Updates current dato relations with clean array of locators
			if ($removed===true) {
				$this->dato->{$relations_container} = $new_relations;
			}


		return $removed;
	}//end remove_relation



	/**
	* REMOVE_RELATIONS_FROM_COMPONENT_TIPO
	* Bulk-removes all locators that were written by a specific component from the
	* named relations container, returning the deleted entries for the caller's use.
	*
	* (!) This method mutates $this->dato but does NOT save. The caller must call
	* Save() separately to persist the removal.
	*
	* Two match predicates, selected by $options->model:
	*
	*   model === 'component_dataframe' AND $caller_dataframe is set:
	*     Uses component_common::dataframe_entry_matches() to apply the unified
	*     id_key pairing contract (see memory: IRI id dataframe pairing).
	*     This handles the case where a dataframe component built without a caller_dataframe
	*     (e.g. import pipelines) stores whole-dato locators that must still be cleaned up
	*     when the dataframe entry is deleted.
	*
	*   all other models:
	*     Matches on locator->from_component_tipo === $options->component_tipo.
	*     Removes all locators that were created by the given source component.
	*
	* @param object $options - removal configuration:
	*   - component_tipo      : string — the source component whose locators to remove
	*   - relations_container : string = 'relations' — target container key in dato
	*   - model               : ?string = null — component model name (drives predicate selection)
	*   - caller_dataframe    : ?object = null — dataframe context (required for component_dataframe path)
	*     {
	*       section_tipo        : string — e.g. "numisdata4"
	*       section_id          : string — e.g. "1"
	*       id_key              : int — the main item id (e.g. 1)
	*       main_component_tipo : string — e.g. "numisdata161"
	*     }
	* @return array - the locators that were removed (empty when nothing matched)
	*/
	public function remove_relations_from_component_tipo( object $options ) : array {

		// options
			$component_tipo			= $options->component_tipo;
			$relations_container	= $options->relations_container ?? 'relations';
			$model					= $options->model ?? null;
			$caller_dataframe		= $options->caller_dataframe ?? null;

		$removed				= false;
		$ar_deleted_locators	= [];
		$new_relations			= [];
		$relations				= $this->get_relations( $relations_container );
		foreach ($relations as $current_locator) {

			// dataframe case
			// by default, component_dataframe is built with caller_dataframe except when import data.
			// When import data from CSV files, the component is built without dataframe
			// because is not possible to create different instances for every dataframe data.
			// In those cases the component_dataframe manage its data as other components with whole data.
			if($model === 'component_dataframe' && isset($caller_dataframe) ) {

				// central match predicate (unified contract: id_key)
				if ( component_common::dataframe_entry_matches($current_locator, $caller_dataframe, $component_tipo) ){
						$ar_deleted_locators[] = $current_locator;

						debug_log(__METHOD__
							. " Removed COMPONENT_DATAFRAME locator from section relations" . PHP_EOL
							. ' current_locator: ' . to_string($current_locator)
							, logger::WARNING
						);

						$removed = true;
				}else{
					// Add normally
					$new_relations[] = $current_locator;
				}

			}else{

				// Test if from_component_tipo
				if (isset($current_locator->from_component_tipo) && $current_locator->from_component_tipo===$component_tipo) {

					$ar_deleted_locators[] = $current_locator;

					// debug
						// debug_log(__METHOD__
						// 	. " Removed $model locator from section relations" . PHP_EOL
						// 	. ' current_locator: ' . to_string($current_locator)
						// 	, logger::WARNING
						// );

					$removed = true;

				}else{
					// Add normally
					$new_relations[] = $current_locator;
				}
			}
		}//end foreach ($relations as $current_locator)

		if ($removed===true) {
			// Update section dato relations on finish
			$this->dato->{$relations_container} = $new_relations;
		}


		return $ar_deleted_locators;
	}//end remove_relations_from_component_tipo




	### /RELATIONS #####################################################################################



	/**
	* GET_SECTION_MAP
	* Returns the section_map configuration object for a given section tipo.
	*
	* The section_map is an ontology-defined mapping stored in the 'properties' field
	* of a special child node of model 'section_map' at the first level of the section.
	* It tells the ts_term_resolver (and similar consumers) which component tipos carry
	* thesaurus concepts such as the term label, parent, model, and descriptor flag.
	*
	* Lookup strategy (virtual-section aware):
	*   1. Try the section_tipo as-is (works for both real and virtual sections that
	*      define their own section_map node).
	*   2. If no section_map is found, retry with resolve_virtual=true to inherit
	*      the real section's section_map.
	*   Returns null when neither lookup finds a section_map node.
	*
	* Output shape example:
	* <code>
	*   {
	*     "thesaurus": {
	*       "term":          "test52",
	*       "model":         "test169",
	*       "parent":        "test71",
	*       "is_descriptor": "test88"
	*     }
	*   }
	* </code>
	*
	* Results are cached per section_tipo in $section_map_cache (cleared each request).
	*
	* @param string $section_tipo - the section whose map to retrieve (virtual or real)
	* @return ?object - the properties stdClass of the section_map node, or null when absent
	*/
	public static function get_section_map( string $section_tipo ) : ?object {

		// cache
			if( isset(self::$section_map_cache[$section_tipo]) ) {
				return self::$section_map_cache[$section_tipo];
			}

		$ar_model_name_required	= ['section_map'];

		// Locate section_map element in current section (virtual or not)
			$ar_children = section::get_ar_children_tipo_by_model_name_in_section(
				$section_tipo,
				$ar_model_name_required,
				true, // bool from_cache
				false, // bool resolve_virtual
				false, // bool recursive
				true // bool search_exact
			);

		// If not found children, try resolving real section (resolve_virtual=true)
			if (empty($ar_children)) {
				$ar_children = section::get_ar_children_tipo_by_model_name_in_section(
					$section_tipo,
					$ar_model_name_required,
					true, // bool from_cache
					true, // // bool resolve_virtual
					false, // bool recursive
					true // bool search_exact
				);
			}

		// section_map
			$section_map = null;
			if( isset($ar_children[0]) ) {

				$tipo			= $ar_children[0];
				$ontology_node	= ontology_node::get_instance($tipo);
				$section_map	= $ontology_node->get_properties() ?? null;
			}

		// cache. Store in cache for speed
			self::$section_map_cache[$section_tipo] = $section_map;
			// Manage cache size to prevent memory leaks (using inherited method)
			self::manage_cache_size(self::$section_map_cache);


		return $section_map;
	}//end get_section_map




	/**
	* GET_SEARCH_QUERY
	* Adapts a raw SQO query_object into the SQL builder format expected by the
	* section-level search path.
	*
	* Sections can be searched by their section_tipo column (not by a JSONB component
	* dato path). This method hard-wires component_path to ['section_tipo'] and
	* sets a default lang of 'all', then delegates to resolve_query_object_sql()
	* for the actual SQL fragment construction.
	*
	* Operator group handling: when the query_object is a search operator ($and/$or),
	* each nested element is resolved individually. Otherwise the whole object is
	* resolved as a single clause.
	*
	* Used primarily in thesaurus search contexts where a filter must narrow results
	* by section_tipo rather than by component dato content.
	*
	* @param object $query_object - incoming SQO; mutated in-place (component_path, lang)
	* @return array - array of resolved query_object(s) ready for the SQL WHERE builder
	*/
	public static function get_search_query(object $query_object) : array {

		// component path default
			$query_object->component_path = ['section_tipo'];

		// component class name calling here
			$called_class = get_called_class();

		// component lang
			if (!isset($query_object->lang)) {
				// default apply
				$query_object->lang = 'all';
			}

		// current_query_object default
			$current_query_object = $query_object;

		// conform each object
			if (search::is_search_operator($current_query_object)===true) {
				foreach ($current_query_object as $operator => $ar_elements) {
					foreach ($ar_elements as $c_query_object) {
						// Inject all resolved query objects
						$c_query_object = $called_class::resolve_query_object_sql($c_query_object);
					}
				}
			}else{
				$current_query_object = $called_class::resolve_query_object_sql($current_query_object);
			}

		// convert to array always
			$ar_query_object = is_array($current_query_object)
				? $current_query_object
				: [$current_query_object];


		return $ar_query_object;
	}//end get_search_query



	/**
	* GET_METADATA_DEFINITION
	* Returns a canonical descriptor object that maps metadata field names to their
	* hardcoded tipos and model names.
	*
	* These are the four system-managed fields that exist on every section record:
	*   - created_by_user  : dd200 (component_select)  — user who created the record
	*   - created_date     : dd199 (component_date)    — creation timestamp
	*   - modified_by_user : dd197 (component_select)  — last user to modify the record
	*   - modified_date    : dd201 (component_date)    — last modification timestamp
	*
	* Used by section_record::build_metadata() and get_metadata_definition_tipos() to
	* discover and write these fields without hardcoding tipos in multiple places.
	*
	* @return stdClass - keyed by field name; each value is an object with .tipo and .model
	*/
	public static function get_metadata_definition() : stdClass {

		$item = new stdClass();

		$item->created_by_user = new stdClass();
		$item->created_by_user->tipo = 'dd200';
		$item->created_by_user->model = 'component_select';

		$item->created_date = new stdClass();
		$item->created_date->tipo = 'dd199';
		$item->created_date->model = 'component_date';

		$item->modified_by_user = new stdClass();
		$item->modified_by_user->tipo = DEDALO_SECTION_INFO_MODIFIED_BY_USER; // dd197
		$item->modified_by_user->model = 'component_select';

		$item->modified_date = new stdClass();
		$item->modified_date->tipo = DEDALO_SECTION_INFO_MODIFIED_DATE; // dd201
		$item->modified_date->model = 'component_date';


		return $item;
	} //end get_metadata_definition



	/**
	* GET_METADATA_DEFINITION_TIPOS
	* Returns a flat array of the hardcoded metadata component tipos (dd197, dd199, dd200, dd201).
	*
	* Convenience wrapper over get_metadata_definition() for callers that only need the
	* tipo strings (e.g. to exclude metadata fields from export column lists or
	* to identify system-managed components in ontology traversal).
	*
	* @return array - list of tipo strings for all system metadata components
	*/
	public static function get_metadata_definition_tipos() : array {

		$ar_tipos = [];
		foreach( section::get_metadata_definition() as $key => $value ) {
			$ar_tipos[] = $value->tipo;
		}

		return $ar_tipos;
	}//end get_metadata_definition_tipos



	/**
	* GET_AR_GROUPER_MODELS
	* Returns the canonical list of ontology model names that act as layout groupers
	* within a section — nodes that contain child components but hold no data themselves.
	*
	* Grouper models: section_group, section_group_div, section_tab, tab.
	*
	* Used during virtual-section exclude_elements resolution to expand an excluded
	* grouper into all its recursive children, ensuring that hiding a group hides all
	* contained components as well.
	*
	* @return array - list of grouper model name strings
	*/
	public static function get_ar_grouper_models() : array {

		$ar_groupers_models = ['section_group','section_group_div','section_tab','tab'];

		return $ar_groupers_models;
	}//end get_ar_grouper_models




	/**
	* GET_SECTION_PERMISSIONS
	* Returns the integer permission level for this section in the current user context.
	*
	* Permission levels (inherited from common::get_permissions()):
	*   0 = no access, 1 = read-only, 2 = read+write, 3 = full (including delete)
	*
	* Memoised: the calculated permission is cached on $this->permissions and returned
	* directly on subsequent calls without re-querying.
	*
	* Special case — DEDALO_ACTIVITY_SECTION_TIPO:
	*   The activity log section is intentionally capped at permission level 1 (read-only)
	*   regardless of the user's role. This prevents any UI or API path from writing
	*   directly to the activity log outside the logger subsystem.
	*
	* @return int - permission level [0–3]; DEDALO_ACTIVITY_SECTION_TIPO is always <= 1
	*/
	public function get_section_permissions() : int {

		// check if the permissions are set previously, then return it.
			if(isset($this->permissions)){
				return $this->permissions;
			}

		// common cases permissions calculation
			$this->permissions = common::get_permissions($this->tipo, $this->tipo);

		// maintains dedalo_activity_section_tipo < 2 to prevent edition
		if ($this->tipo===DEDALO_ACTIVITY_SECTION_TIPO && $this->permissions>1){
			$this->permissions = 1;
		}


		return $this->permissions;
	}//end get_permissions



	/**
	* BUILD_SQO_ID
	* Returns the session key under which this section's active navigation SQO is stored.
	*
	* Currently a trivial identity function (returns $tipo unchanged), but centralised here
	* so that if the key format ever needs to change (e.g. namespaced by user or area),
	* all callers only need to go through this single method.
	*
	* The returned value is used as:
	*   $_SESSION['dedalo']['config']['sqo'][$sqo_id]
	*
	* @param string $tipo - section tipo (e.g. 'oh1')
	* @return string - the session key for this section's SQO (currently equals $tipo)
	*/
	public static function build_sqo_id(string $tipo) {

		$sqo_id = $tipo;

		return $sqo_id;
	}//end build_sqo_id



	/**
	* GET_SESSION_SQO
	* Reads the persisted navigation SQO for a section from the PHP session.
	*
	* The SQO encodes the active search/filter state (filters, sort, pagination) that
	* survives page reloads and is re-applied when the user returns to the section.
	*
	* Always use this accessor instead of reading $_SESSION['dedalo']['config']['sqo']
	* directly — it validates the returned value is an object and returns null for
	* missing or corrupted entries.
	*
	* @param string $sqo_id - key built by section::build_sqo_id()
	* @return ?object - the stored SQO object, or null when absent or not an object
	*/
	public static function get_session_sqo(string $sqo_id) : ?object {

		$session_sqo = $_SESSION['dedalo']['config']['sqo'][$sqo_id] ?? null;

		return is_object($session_sqo)
			? $session_sqo
			: null;
	}//end get_session_sqo



	/**
	* SET_SESSION_SQO
	* Writes (or deletes) the section navigation SQO in the PHP session.
	*
	* Passing $sqo = null removes the entry (clears the stored search state),
	* which happens when the user resets a section or navigates away.
	* Passing a valid SQO object stores it under the given key, overwriting any
	* previous value.
	*
	* Always use this mutator instead of writing $_SESSION directly.
	*
	* @param string $sqo_id - key built by section::build_sqo_id()
	* @param ?object $sqo - the SQO to store, or null to remove the entry
	* @return void
	*/
	public static function set_session_sqo(string $sqo_id, ?object $sqo) : void {

		if ($sqo===null) {
			unset($_SESSION['dedalo']['config']['sqo'][$sqo_id]);
			return;
		}

		$_SESSION['dedalo']['config']['sqo'][$sqo_id] = $sqo;
	}//end set_session_sqo





}//end class section
