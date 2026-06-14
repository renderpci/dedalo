<?php declare(strict_types=1);
/**
 * CLASS ONTOLOGY_NODE
 * Runtime wrapper around a single ontology node (identified by its `tipo`).
 *
 * Responsibilities:
 * - Read-only access to ontology node metadata stored in the `dd_ontology` PostgreSQL table
 * - Resolution helpers: labels (terms), model names, parents, children, siblings, relations
 * - Small write helpers used by ontology maintenance tools (insert / delete)
 *
 * Each instance represents exactly one row in `dd_ontology`, addressed by its `tipo` key.
 * Data is loaded lazily on first access; instances are cached by tipo in `self::$instances`
 * to avoid repeated DB round-trips within a single request.
 *
 * Architecture notes:
 * - Instantiate only via `ontology_node::get_instance($tipo)`. The constructor is private.
 * - Singleton caches (`$instances`, `$label_by_tipo_cache`, `$model_by_tipo_cache`, etc.)
 *   are static and therefore survive across calls inside a persistent PHP worker. They must
 *   be cleared explicitly (e.g. via `common::clear()`) when ontology data is mutated.
 * - Regular application code should treat ontology nodes as read-only; the `set_*` methods
 *   and `insert()` / `delete()` are only for the ontology management tooling.
 * - Structural changes to the ontology tree must go through `class.ontology.php`, which
 *   handles parent-child linkage, re-ordering, and cache invalidation.
 *
 * Data layer: all database operations are delegated to `dd_ontology_db_manager`, keeping
 * this class free of direct SQL. The `$table` property names the physical table but is
 * used by the DB manager, not referenced here directly.
 *
 * @package Dédalo
 * @subpackage Ontology
 */
class ontology_node {


	/**
	* CLASS VARS
	*/

		/**
		 * Ontology identifier (tipo) of the node.
		 * Typology of Indirect Programming Objects. Every node has a unique identifier
		 * combining TLD (Top Level Domain / ontology namespace) plus a sequential ID.
		 * Example: 'oh1' where 'oh' = Oral History namespace, '1' = unique ID within that TLD.
		 * @var string $tipo
		 */
		public string $tipo;

		/**
		 * Object containing all properties of the ontology node.
		 * Properties include: parent, term, model, order_number, relations, tld,
		 * properties, model_tipo, is_model, is_translatable, propiedades (deprecated).
		 * Each property maps to a column in the `dd_ontology` table.
		 * E.g.
		 * {
		 *      parent          : "tch188"              string | null
		*      term            : {"lg-eng" : "Object"} object | null
		*      model           : "section"             string | null
		*      order_number    : 5                     int | null
		*      relations       : [{"tipo" :"tch7"}]    array | null
		*      tld             : "tch"                 string
		*      properties      : {"color" : "#2d8894"}  object | null
		*      model_tipo      : "dd6"                 string | null
		*      is_model        : false                 boolean
		*      is_translatable : false                 boolean
		*      is_main         : false                 boolean
		*      propiedades     : "{}"                  string, data is a object as json stringify // Deprecated used only for compatibility of v5 and v6
		* }
		* @var ?object $data
		*/
		protected ?object $data = null;

		/**
		 * Whether the node data has already been loaded from the database.
		 * Prevents redundant database queries when accessing node properties multiple times.
		 * @var bool $is_loaded_data
		 */
		protected bool $is_loaded_data = false;

		/**
		 * Internal cache for expensive recursive children calculations.
		 * Stores pre-computed descendant nodes to optimize tree traversal operations.
		 * @var array $ar_recursive_children_of_this
		 */
		protected array $ar_recursive_children_of_this = [];

		/**
		 * Physical database table storing ontology nodes.
		 * Treated as read-only during normal execution. When DEDALO_RECOVERY_MODE
		 * is active, operations may target `dd_ontology_recovery` instead.
		 * @var string $table
		 */
		public static string $table = 'dd_ontology';

		/**
		 * Static cache of ontology_node instances (singleton pattern per tipo).
		 * Maps tipo strings to their instantiated ontology_node objects.
		 * @var array $instances
		 */
		public static array $instances = [];

		/**
		 * Static cache mapping tipos to their human-readable labels.
		 * Optimizes label lookups by avoiding repeated database queries.
		 * @var array $label_by_tipo_cache
		 */
		public static array $label_by_tipo_cache = [];
		/**
		 * Maximum number of entries kept in the label-by-tipo cache before trimming.
		 * When the limit is reached, the oldest half of the cache is discarded.
		 * Prevents unbounded memory growth in long-lived persistent workers.
		 */
		const MAX_LABEL_CACHE_SIZE = 5000;
		/**
		 * Maximum number of entries kept in the model-by-tipo cache before trimming.
		 * Mirrors MAX_LABEL_CACHE_SIZE; bounded at the same value (COMP-05 fix — was unbounded).
		 */
		const MAX_MODEL_CACHE_SIZE = 5000;

		/**
		 * Static cache mapping tipos to their model (component/section type) names.
		 * Avoids repeated model resolution from the ontology.
		 * @var array $model_by_tipo_cache
		 */
		public static array $model_by_tipo_cache = [];

		/**
		 * Static cache for children lookups per node.
		 * Stores arrays of child ontology_node tipos for fast hierarchical queries.
		 * @var array $ar_children_of_this_stat_data
		 */
		public static array $ar_children_of_this_stat_data = [];

		/**
		 * Static cache for parent lookups per node.
		 * Stores arrays of parent ontology_node tipos for fast ancestry queries.
		 * @var array $ar_parents_of_this_data
		 */
		public static array $ar_parents_of_this_data = [];

		/**
		 * Static cache for sibling lookups per node.
		 * Stores arrays of sibling ontology_node tipos for fast peer queries.
		 * @var array $ar_siblings_of_this_data
		 */
		public static array $ar_siblings_of_this_data = [];

		/**
		 * Static cache for tipo resolution by model name and relation.
		 * Maps model name + relation combinations to their corresponding tipos.
		 * @var array $ar_tipo_by_model_name_and_relation_data
		 */
		public static array $ar_tipo_by_model_name_and_relation_data = [];



	/**
	 * GET_INSTANCE
	 * Factory method and static instance cache for ontology nodes.
	 *
	 * Returns the cached instance for `$tipo` when one already exists, otherwise
	 * constructs a new one. The returned object's data is NOT loaded yet — loading
	 * is deferred to the first property access (lazy via `load_data()`).
	 *
	 * (!) Never call `new ontology_node()` directly — the constructor is private.
	 *     Always go through this method so the per-tipo singleton is maintained.
	 *
	 * @param string $tipo - Ontology identifier (e.g. 'dd156', 'tch7')
	 * @return self
	 */
	public static function get_instance( string $tipo ) : self {

		if (!isset(self::$instances[$tipo])) {
			self::$instances[$tipo] = new self($tipo);
		}

		return self::$instances[$tipo];
	}//end get_instance



	/**
	 * __CONSTRUCT
	 * Validates and normalizes the ontology identifier (`tipo`) before building the node.
	 *
	 * Initializes all typed properties to safe defaults so PHP 8.x does not raise
	 * "Typed property must not be accessed before initialization" errors even if
	 * the provided `$tipo` is invalid and we bail out early.
	 *
	 * (!) Constructor is private. Use `ontology_node::get_instance($tipo)` instead.
	 *
	 * @param string $tipo - Raw ontology identifier; must pass `safe_tipo()` validation
	 */
	private function __construct( string $tipo ) {

		// Always initialize properties to avoid PHP 8.x "Typed property ... must not be accessed before initialization" errors
		// This ensures that even if we bail out later, the class properties are in a stable state.
		$this->tipo = $tipo;
		$this->data = new stdClass();

		if( !empty($tipo) ) {

			// Checks and removes any characters other than TLD and section_id in the tipo string
			$safe_tipo = safe_tipo($tipo);

			if( !$safe_tipo || $safe_tipo !== $tipo ){
				debug_log(__METHOD__
					." Error creating a new ontology node, tipo is not a valid tipo: ". PHP_EOL
					.' tipo: ' . $tipo .PHP_EOL
					.' safe_tipo: ' . $safe_tipo .PHP_EOL
					, logger::ERROR
				);
				return;
			}

			// Finalize with safe version
			$this->tipo = $safe_tipo;
		}
	}//end __construct



	/**
	 * LOAD_DATA
	 * Loads the node row from the database into `$this->data`.
	 *
	 * Idempotent: returns immediately on subsequent calls once `$is_loaded_data` is true,
	 * so callers (all `get_*` methods) may call it unconditionally without overhead.
	 *
	 * On success, `$this->data` is set to an stdClass built from the `dd_ontology` row.
	 * When the tipo is not found in the database, `$this->data` is set to an empty
	 * stdClass (not null), and `$is_loaded_data` is still set to true to prevent
	 * repeated failing queries.
	 *
	 * @return bool - True when data was loaded (or was already loaded), false when `$tipo` is empty
	 */
	public function load_data() : bool {

		//check if data was loaded
		if ($this->is_loaded_data) {
			return true;
		}
		// load ontology node from DDBB
		$tipo = $this->tipo;

		// Check tipo
		if( empty($tipo) ) {
			debug_log(__METHOD__
				." Error loading ontology node data, tipo empty."
				, logger::ERROR
			);
			return false;
		}

		$data = dd_ontology_db_manager::read($tipo);

		// Set as loaded
		$this->is_loaded_data = true;

		// set it
		$this->data = !empty($data) ? (object)$data : new stdClass();

		return true;
	}//end load_data



	/**
	 * GET_DATA
	 * Returns the full ontology node payload as an stdClass.
	 *
	 * Triggers `load_data()` if not yet loaded.
	 * Returns an empty stdClass (never null) when the tipo does not exist in the database,
	 * because `load_data()` always populates `$this->data` with at least a new stdClass.
	 *
	 * @return object|null - Full node data object, or null only in the unexpected case where
	 *                       the property was never initialized
	 */
	public function get_data() : ?object {
		$this->load_data();

		return $this->data;
	}//end get_data



	/**
	 * GET_TIPO
	 * Returns the ontology identifier (`tipo`) for this instance.
	 *
	 * Returns null when the `$tipo` property was never set (e.g. after construction
	 * failure due to an invalid tipo string). In practice, `$tipo` is always a non-empty
	 * string because `get_instance()` only creates nodes from non-empty identifiers.
	 *
	 * @return string|null - Ontology tipo (e.g. 'dd156'), or null if uninitialized
	 */
	public function get_tipo() : ?string{
		return $this->tipo;
	}//end get_tipo



	/**
	 * GET_PARENT
	 * Returns the ontology identifier (`tipo`) of the parent node.
	 *
	 * @return string|null Parent tipo or null when this is a root node
	 */
	public function get_parent() : ?string {
		$this->load_data();
		return $this->data->parent ?? null;
	}//end get_parent



	/**
	 * GET_TERM_DATA
	 * Returns the raw `term` object (labels in all languages).
	 *
	 * @return object|null
	 */
	public function get_term_data() : ?object {
		$this->load_data();
		return $this->data->term ?? null;
	}//end get_term_data



	/**
	 * GET_TERM
	 * Returns the label (term) for the given language.
	 *
	 * Language resolution passes through `lang::get_label_lang()` first, which
	 * normalises equivalences (e.g. Catalan ↔ Valencian) before lookup.
	 *
	 * Fallback strategy when the requested language is absent and `$fallback` is true:
	 * 1. Try `DEDALO_STRUCTURE_LANG` (the canonical ontology authoring language).
	 * 2. Return the first non-empty value found across all available term languages.
	 *
	 * @param string $lang     - BCP-47-style language code (e.g. 'lg-eng', 'lg-spa')
	 * @param bool   $fallback = true - When true, apply the two-step fallback strategy above
	 * @return string|null     - Term string in the resolved language, or null when none available
	 */
	public function get_term( string $lang, bool $fallback=true ) : ?string {

		$term_data = $this->get_term_data();

		// get the lang to be used to get the labels
		// it call to get_label_lang() to process exceptions as català to valencià, that are used as same language.
		// if it not set, it will return DEDALO_APPLICATION_LANG
		$lang = lang::get_label_lang( $lang );

		// empty term case
		if (!is_object($term_data)) {
			return null;
		}

		// lang already exists case and is not blank ''
		if (!empty($term_data->{$lang})) {
			return $term_data->{$lang};
		}

		// fallback lang
		if ($fallback===true) {

			// main lang
			$ontology_lang = DEDALO_STRUCTURE_LANG;
			if (!empty($term_data->{$ontology_lang})) {
				return $term_data->{$ontology_lang};
			}

			// fallback to anything
			foreach ($term_data as $value) {
				if (!empty($value)) {
					return $value;
				}
			}
		}

		return null;
	}//end get_term



	/**
	 * GET_MODEL
	 * Resolves the model name for this ontology node.
	 *
	 * A model name is a unique, non-translatable string stored in the ontology that
	 * identifies which PHP class / JS module / CSS file implements the node's behaviour.
	 * Examples:
	 *   'section'          → class.section.php + section.js + section.css
	 *   'component_portal' → class.component_portal.php + component_portal.js + component_portal.css
	 *
	 * Resolution order:
	 * 1. Hard-coded `$forced_models` overrides — used for v6/v7 transitional nodes whose
	 *    ontology rows have not yet been migrated (e.g. activity-log columns, security fields).
	 * 2. Hard-coded `$temporal_models` overrides for Time Machine columns pending ontology update.
	 * 3. `data->model` column read directly from the database row (preferred path).
	 * 4. Legacy fallback: resolve via `model_tipo` → `get_term_by_tipo($model_tipo)`.
	 *    This path logs an ERROR because it means the `model` column is not populated.
	 * 5. A final legacy-name replacement map normalises removed or renamed model classes
	 *    (e.g. 'component_html_text' → 'component_text_area').
	 *
	 * (!) Both `$forced_models` and `$temporal_models` are declared `static` inside the
	 *     method; they are allocated only once per process but never cleared by cache
	 *     invalidation — add new entries with care.
	 *
	 * @return string|null - Resolved model name (e.g. 'component_input_text'), or null
	 *                       when the node has no model assignment in the ontology
	 */
	public function get_model() : ?string {

		$this->load_data();

		if (empty($this->tipo)) {
			return null;
		}

		// forced models in v6/v7 (while we are using structure v5)
		static $forced_models = [
			DEDALO_SECURITY_ADMINISTRATOR_TIPO => 'component_radio_button',
			DEDALO_USER_PROFILE_TIPO            => 'component_select',
			'dd546'                             => 'component_input_text',  // activity where
			'dd545'                             => 'component_select',      // activity what
			'dd544'                             => 'component_input_text',  // activity ip
			'dd551'                             => 'component_json',        // activity 'data'
			'hierarchy48'                       => 'component_number',      // hierarchy 'order'
			'dd1067'                            => 'component_check_box',   // tools component_security_tools
			'hierarchy45'                       => 'component_portal',      // hierarchy main: General term
			'hierarchy59'                       => 'component_portal',      // hierarchy main: General term model
		];
		if (isset($forced_models[$this->tipo])) {
			return $forced_models[$this->tipo];
		}

		// Temporal model resolution for migration
		static $temporal_models = [
			// temporal TM (Until the new ontology is updated)
			DEDALO_TIME_MACHINE_COLUMN_ID               => 'component_number',      // dd1573
			DEDALO_TIME_MACHINE_COLUMN_SECTION_ID       => 'component_number',      // dd1212
			DEDALO_TIME_MACHINE_COLUMN_SECTION_TIPO     => 'component_input_text',  // dd1772
			DEDALO_TIME_MACHINE_COLUMN_TIPO             => 'component_input_text',  // dd577
			DEDALO_TIME_MACHINE_COLUMN_TIMESTAMP        => 'component_date',        // dd559
			DEDALO_TIME_MACHINE_COLUMN_USER_ID          => 'component_portal',      // dd578
			DEDALO_TIME_MACHINE_COLUMN_BULK_PROCESS_ID  => 'component_number',      // dd1371
			DEDALO_TIME_MACHINE_COLUMN_DATA             => 'component_json',        // dd1574
		];
		if (isset($temporal_models[$this->tipo])) {
			return $temporal_models[$this->tipo];
		}

		// model resolution with fallback
		$model = $this->data->model ?? null;

		if (empty($model)) {

			// fallback to old resolution
			$model_tipo = $this->get_model_tipo();
			if (empty($model_tipo)) {

				// new model area_maintenance (term dd88, model dd72) not updated Ontology cases
				if (!defined('DEDALO_AREA_MAINTENANCE_TIPO')) {
					define('DEDALO_AREA_MAINTENANCE_TIPO', 'dd88');
				}
				if ($this->tipo === DEDALO_AREA_MAINTENANCE_TIPO) {
					debug_log(__METHOD__ . " WARNING. Model dd72 'area_maintenance' is not defined! Update your Ontology ASAP. tipo: {$this->tipo}", logger::ERROR);
					return 'area_maintenance'; // temporal !
				}

				return null;
			}

			$model = ontology_node::get_term_by_tipo($model_tipo, DEDALO_STRUCTURE_LANG, true, false);

			// error log
			debug_log(__METHOD__
				. " Falling to fallback model resolution for the term" . PHP_EOL
				. ' tipo: ' . to_string($this->tipo) . PHP_EOL
				. ' model: ' . to_string($model)
				, logger::ERROR
			);

			if (empty($model)) {

				debug_log(__METHOD__
					. " Empty model name !" . PHP_EOL
					. ' tipo: ' . to_string($this->tipo)
					, logger::ERROR
				);
				return null;
			}
		}

		// Model replacements (obsolete/legacy models)
		$model_map = [
			'component_input_text_large' => 'component_text_area',
			'component_html_text'       => 'component_text_area',
			'component_autocomplete'     => 'component_portal',
			'component_autocomplete_hi'  => 'component_portal',
			'component_state'            => 'component_info',
			'component_calculation'      => 'component_info',
			'section_group_div'          => 'section_group',
			'tab'                        => 'section_tab',
			'component_relation_struct'  => 'box elements',
			'component_security_tools'   => 'component_check_box',
			'dataframe'                  => 'box elements',
		];

		return $model_map[$model] ?? $model;
	}//end get_model



	/**
	 * GET_ORDER_NUMBER
	 * Returns the position of the ontology node with respect to its siblings.
	 *
	 * @return int|null
	 */
	public function get_order_number() : ?int {
		$this->load_data();
		return $this->data->order_number ?? null;
	}//end get_order_number



	/**
	 * GET_RELATIONS
	 * Returns raw relations for this node.
	 *
	 * - Relations are unidirectional connections between nodes.
	 * - Example: node "oh1" points to "tch7" and "numisdata8"
	 *   - "oh1" -> [{"tipo": "tch7"},{"tipo": "numisdata8"}]
	 * - Stored as JSONB in column `relations`.
	 *
	 * @return array|null Array of relation objects or null when none present
	 */
	public function get_relations() : ?array {
		$this->load_data();
		return $this->data->relations ?? null;
	}//end get_relations




	/**
	 * GET_RELATION_TIPOS
	 * Returns an array of relation tipos for this node.
	 *
	 * @return array|null Array of relation tipos or null when none present
	 */
	public function get_relation_tipos() : ?array {
		$relations = $this->get_relations();
		if (empty($relations)) {
			return null;
		}
		$relation_tipos = [];
		foreach ($relations as $relation) {
			$relation_tipos[] = $relation->tipo;
		}
		return $relation_tipos;
	}//end get_relation_tipos



	/**
	 * GET_TLD
	 * Returns the TLD (Top Level Domain) / ontology namespace.
	 * It defines a field of heritage or common parts of the ontology.
	 *
	 * Examples:
	 * - oh  = Oral History
	 * - tch = Tangible Cultural Heritage
	 * - ich = Intangible Cultural Heritage
	 * - dd  = Dédalo core (users, profiles, menu, login, etc.)
	 * - rsc = Resources (people, media, images, pdf, etc.)
	 *
	 * @return string|null
	 */
	public function get_tld() : ?string {
		$this->load_data();
		return $this->data->tld ?? null;
	}//end get_tld



	/**
	 * GET_PROPERTIES
	 * Returns the configuration object for this ontology node.
	 *
	 * Properties define:
	 * - Behavior: how the node processes its data, resolves relations and represents itself
	 * - Options : per-instance configuration options
	 * - Layout  : how the node will be rendered
	 *
	 * It is stored as JSONB in column `properties` and exposed as an object.
	 *
	 * @return object|null
	 */
	public function get_properties() : ?object {
		$this->load_data();
		$properties = $this->data->properties ?? null;
		if ($properties) {
			// Always return a deep clone to prevent accidental mutations
			// of this cached properties object across worker requests.
			return json_decode(json_encode($properties));
		}
		return null;
	}//end get_properties



	/**
	 * GET_MODEL_TIPO
	 * Returns the ontology identifier (`tipo`) of the model node.
	 *
	 * Examples:
	 * - dd6   ---> section
	 * - dd592 ---> component_portal
	 *
	 * The model itself is represented as a regular ontology node
	 * and is flagged with the property `is_model = true`.
	 *
	 * @return string|null
	 */
	public function get_model_tipo() : ?string {
		$this->load_data();
		return $this->data->model_tipo ?? null;
	}//end get_model_tipo



	/**
	 * GET_IS_MODEL
	 * Returns whether this ontology node is a model node.
	 *
	 * The ontology contains two fundamental node types:
	 * - Descriptor nodes: represent real-world heritage concepts (sections, cataloguing fields,
	 *   thesaurus terms, etc.). Their `is_model` column is false.
	 * - Model nodes: identify the PHP/JS class that implements a feature (e.g. 'component_portal',
	 *   'section'). Their `is_model` column is true and their `term` in DEDALO_STRUCTURE_LANG
	 *   is the exact class name used by autoloading.
	 *
	 * Reads the `is_model` column from `dd_ontology`.
	 *
	 * @return bool - True when this node is a model node, false for descriptor nodes
	 */
	public function get_is_model() : bool {
		$this->load_data();
		return (bool)($this->data->is_model ?? false);
	}//end get_is_model



	/**
	 * GET_IS_TRANSLATABLE
	 * Returns whether the component data stored under this node can hold language-specific values.
	 *
	 * When true, string-type components (component_input_text, component_text_area, etc.) store
	 * their user data tagged with a language key so that each language has an independent value.
	 * When false, a single value is stored regardless of the active language.
	 *
	 * Reads the `is_translatable` column from `dd_ontology`.
	 *
	 * @return bool - True when the node's component data is language-sensitive
	 */
	public function get_is_translatable() : bool {
		$this->load_data();
		return (bool)($this->data->is_translatable ?? false);
	}//end get_is_translatable



	/**
	 * GET_IS_MAIN
	 * Returns whether this ontology node is a namespace-root (main) node.
	 *
	 * Main nodes sit at the top of each TLD tree. Their tipo follows the convention
	 * tld + '0' (e.g. 'dd0', 'oh0', 'tch0') and they carry `is_main = true`.
	 * They act as the anchor for all descendant nodes within their ontology namespace.
	 *
	 * Reads the `is_main` column from `dd_ontology`.
	 *
	 * @return bool - True when this node is the root of its ontology namespace
	 */
	public function get_is_main() : bool {
		$this->load_data();
		return (bool)($this->data->is_main ?? false);
	}//end get_is_main



	/**
	 * GET_TRANSLATABLE
	 * Static convenience wrapper: returns whether the given tipo is translatable.
	 *
	 * Delegates to `ontology_node::get_instance($tipo)->get_is_translatable()`.
	 * Prefer this over instantiating a node just to check translatability.
	 *
	 * @param string $tipo - Ontology identifier (e.g. 'dd345')
	 * @return bool - True when the node's component data is language-sensitive
	 */
	public static function get_translatable( string $tipo ) : bool {

		$ontology_node	= ontology_node::get_instance($tipo);
		$translatable	= $ontology_node->get_is_translatable();

		return $translatable;
	}//end get_translatable



	/**
	 * GET_PROPIEDADES
	 * Returns the legacy `propiedades` column value for this node.
	 *
	 * `propiedades` is a v5/v6 carry-over: a plain-text column holding per-node
	 * configuration as a JSON-encoded string. It was superseded in v7 by the typed
	 * `properties` JSONB column (see `get_properties()`). This accessor exists only
	 * for backward-compatibility reading of older ontology imports.
	 *
	 * By default, the raw string is returned. Pass `$json_decode = true` to get a
	 * decoded object via `json_handler::decode()`.
	 *
	 * @param bool $json_decode = false - When true, JSON-decode the raw string before returning
	 * @return mixed - Raw JSON string when $json_decode is false; decoded object/array when true;
	 *                 null when the `propiedades` column is absent or the node was not found
	 */
	public function get_propiedades( bool $json_decode = false ) : mixed {
		$this->load_data();

		if (!isset($this->data->propiedades)) {
			return null;
		}

		if (!$json_decode) {
			return $this->data->propiedades;
		}

		return json_handler::decode($this->data->propiedades);
	}//end get_propiedades



	/**
	 * SET_PARENT
	 * Sets the parent tipo for this node in the in-memory data object.
	 *
	 * The `$parent` value is sanitized through `safe_tipo()` before being stored.
	 * If `safe_tipo()` returns falsy (invalid characters, empty string), the parent
	 * is set to null rather than storing an unsafe value.
	 *
	 * (!) This only mutates the in-memory `$this->data` object. Call `insert()` to persist.
	 *
	 * @param string|null $parent - Parent ontology tipo (e.g. 'oh1'), or null for a root node
	 */
	public function set_parent( ?string $parent ) : void {

		if ($parent === null) {
			$this->data->parent = null;
			return;
		}

		$safe_parent = safe_tipo($parent);

		if (!$safe_parent) {
			$this->data->parent = null;
			return;
		}

		$this->data->parent = $safe_parent;
	}//end set_parent



	/**
	 * SET_TERM_DATA
	 * Sets the `term` object for this node in memory (e.g. {"lg-eng": "Activity"}).
	 *
	 * (!) Mutates `$this->data` only — call `insert()` to persist.
	 *
	 * @param object|null $term - Language-keyed label object, or null to clear
	 */
	public function set_term_data( ?object $term ) : void {

		$this->data->term = $term;
	}//end set_term_data



	/**
	 * SET_MODEL
	 * Sets the model name for this node in memory (e.g. "component_input_text").
	 *
	 * (!) Mutates `$this->data` only — call `insert()` to persist.
	 *
	 * @param string|null $model - Model name, or null to clear
	 */
	public function set_model( ?string $model ) : void {

		$this->data->model = $model;
	}//end set_model



	/**
	 * SET_ORDER_NUMBER
	 * Sets the display order of this node among its siblings (e.g. 5).
	 *
	 * (!) Mutates `$this->data` only — call `insert()` to persist.
	 *
	 * @param int|null $order_number - Zero-based or one-based position (convention follows parent section)
	 */
	public function set_order_number( ?int $order_number ) : void {

		$this->data->order_number = $order_number;
	}//end set_order_number



	/**
	 * SET_RELATIONS
	 * Sets the relations array for this node in memory.
	 *
	 * Each element is an object with at minimum a `tipo` key pointing to
	 * the related ontology node (e.g. [{"tipo": "actv1"}]).
	 *
	 * (!) Mutates `$this->data` only — call `insert()` to persist.
	 *
	 * @param array|null $relations - Array of relation objects, or null to clear
	 */
	public function set_relations( ?array $relations) : void {

		$this->data->relations = $relations;
	}//end set_relations



	/**
	 * SET_TLD
	 * Sets the TLD (ontology namespace) for this node in memory (e.g. 'tch').
	 *
	 * (!) Mutates `$this->data` only — call `insert()` to persist.
	 * In practice, `insert()` overwrites this with `get_tld_from_tipo($tipo)` to
	 * ensure consistency, so explicit calls to this setter are rarely needed.
	 *
	 * @param string|null $tld - Two-to-four character namespace prefix, or null to clear
	 */
	public function set_tld( ?string $tld ) : void {

		$this->data->tld = $tld;
	}//end set_tld



	/**
	 * SET_PROPERTIES
	 * Sets the `properties` configuration object for this node in memory.
	 *
	 * The properties object can hold rendering hints (CSS, layout), behavioural
	 * flags, and per-instance options. Example:
	 * {"css": {".wrapper_component": {"grid-column": "span 2"}}}
	 *
	 * (!) Mutates `$this->data` only — call `insert()` to persist.
	 *
	 * @param object|null $properties - Configuration object, or null to clear
	 */
	public function set_properties( ?object $properties) : void {

		$this->data->properties = $properties;
	}//end set_properties



	/**
	 * SET_MODEL_TIPO
	 * Sets the `model_tipo` reference for this node in memory (e.g. 'dd6' for 'section').
	 *
	 * `model_tipo` points to the ontology node whose `term[DEDALO_STRUCTURE_LANG]` is the
	 * model name. This is the legacy resolution path; prefer populating the `model` column
	 * directly so `get_model()` uses the faster primary path.
	 *
	 * (!) Mutates `$this->data` only — call `insert()` to persist.
	 *
	 * @param string|null $model_tipo - Ontology tipo of the model node, or null to clear
	 */
	public function set_model_tipo( ?string $model_tipo ) : void {

		$this->data->model_tipo = $model_tipo;
	}//end set_model_tipo



	/**
	 * SET_IS_MODEL
	 * Sets the `is_model` flag for this node in memory.
	 *
	 * (!) Mutates `$this->data` only — call `insert()` to persist.
	 *
	 * @param bool $is_model - True to mark this node as a model node
	 */
	public function set_is_model( bool $is_model) : void {

		$this->data->is_model = $is_model;
	}//end set_is_model



	/**
	 * SET_IS_TRANSLATABLE
	 * Sets the `is_translatable` flag for this node in memory.
	 *
	 * (!) Mutates `$this->data` only — call `insert()` to persist.
	 *
	 * @param bool $is_translatable - True when the node's component stores language-keyed data
	 */
	public function set_is_translatable( bool $is_translatable ) : void {

		$this->data->is_translatable = $is_translatable;
	}//end set_is_translatable



	/**
	 * SET_IS_MAIN
	 * Sets the `is_main` flag for this node in memory.
	 *
	 * Conventionally, only nodes whose tipo matches tld + '0' (e.g. 'dd0', 'oh0') should
	 * have `is_main = true`. There is normally only one main node per TLD namespace.
	 *
	 * (!) Mutates `$this->data` only — call `insert()` to persist.
	 *
	 * @param bool $is_main - True to mark this node as the root of its TLD namespace
	 */
	public function set_is_main( bool $is_main ) : void {

		$this->data->is_main = $is_main;
	}//end set_is_main



	/**
	 * SET_PROPIEDADES
	 * Sets the legacy `propiedades` column value for this node in memory.
	 *
	 * `propiedades` is a v5/v6 carry-over (JSON string, not a typed JSONB object).
	 * New code should use `set_properties()` with the `properties` JSONB column instead.
	 * This setter exists only to support ontology import/migration paths that still
	 * produce the legacy column.
	 *
	 * Example value:
	 * {"css":{".wrap_component":{"mixin":[".vertical",".line_top"],"style":{"width":"25%"}}}}
	 *
	 * (!) Mutates `$this->data` only — call `insert()` to persist.
	 *
	 * @param ?string $propiedades - JSON-encoded configuration string, or null to clear
	 */
	public function set_propiedades( ?string $propiedades ) : void {

		$this->data->propiedades = $propiedades;
	}//end set_propiedades



	/**
	 * INSERT
	 * Persists the current in-memory node data to the `dd_ontology` table.
	 *
	 * Creates a new row (or replaces an existing one — behaviour depends on the DB manager's
	 * upsert strategy). The TLD is derived automatically from `$tipo` via `get_tld_from_tipo()`
	 * and always overwrites whatever was set via `set_tld()`.
	 *
	 * Returns false without writing if `$tipo` is empty or if the TLD cannot be resolved
	 * from the tipo string (malformed tipo).
	 *
	 * (!) This is a low-level writer intended for ontology tooling only. Higher-level callers
	 *     (e.g. ontology tree operations) should use `ontology::create_dd_ontology_ontology_section_node`
	 *     which handles parent-child linkage and cache invalidation.
	 *
	 * @return bool - True on success, false when tipo is empty, TLD resolution fails, or DB write fails
	 *
	 * @see ontology::create_dd_ontology_ontology_section_node
	 */
	public function insert() : bool {

		$tipo = $this->get_tipo();

		if (empty($tipo)) {
			return false;
		}

		$values = $this->data;

		// Safe add TLD
		$values->tld = get_tld_from_tipo($tipo);
		if (empty($values->tld)) {
			return false;
		}

		// Create new record
		$result = dd_ontology_db_manager::create( $tipo, $values );
		if($result===false) {
			return false;
		}


		return true;
	}//end insert



	/**
	 * DELETE
	 * Deletes the row for `$this->tipo` from the `dd_ontology` table.
	 *
	 * (!) Deletion does NOT cascade: child nodes whose `parent` points to this tipo will
	 *     become orphaned unless the caller takes care of the tree structure first.
	 *     Higher-level deletion should be handled via the ontology management tools.
	 *
	 * @return bool - True on success, false when tipo is empty or the DB operation fails
	 */
	public function delete() : bool {

		$tipo = $this->get_tipo();

		if (empty($tipo)) {
			return false;
		}

		$result = dd_ontology_db_manager::delete($tipo);

		if($result===false) {
			return false;
		}

		return true;
	}//end delete



	/**
	 * GET_TERM_BY_TIPO
	 * Static convenience method: returns the label (term) for a given tipo and language.
	 *
	 * Uses a bounded in-memory cache keyed on `tipo + '_' + lang + '_' + (int)fallback`
	 * to avoid repeated DB queries. The cache is trimmed when it exceeds MAX_LABEL_CACHE_SIZE
	 * to prevent unbounded growth in long-lived workers.
	 *
	 * When the node has no term in the requested language and `$fallback` is true, the
	 * resolution falls back to DEDALO_STRUCTURE_LANG and then to any non-empty language.
	 *
	 * @param string  $tipo       - Ontology identifier (e.g. 'dd156')
	 * @param ?string $lang       = null - Language code; defaults to DEDALO_DATA_LANG when null
	 * @param bool    $from_cache = true - Use in-memory cache when true
	 * @param bool    $fallback   = true - Apply language fallback when the exact language is absent
	 * @return string|null - Resolved label string, or null when none available or tipo is empty
	 */
	public static function get_term_by_tipo( string $tipo, ?string $lang=null, bool $from_cache=true, bool $fallback=true ) : ?string {

		// Verify : In cases such as, for example, when solving the model of a related term that has no model assigned to it, the tipo will be empty.
		// This is not a mistake but we must avoid resolving it.
		if(empty($tipo)) {
			return null;
		}

		// safe lang fallback
		$lang = $lang ?? DEDALO_DATA_LANG;

		// cache
		$cache_uid = $tipo . '_' . $lang . '_' . (int)$fallback;
		if ($from_cache===true && array_key_exists($cache_uid, self::$label_by_tipo_cache)) {
			return self::$label_by_tipo_cache[$cache_uid];
		}

		// Safe control: prevent big array memory and performance problems
		if (count(self::$label_by_tipo_cache) > self::MAX_LABEL_CACHE_SIZE) {
			// Keep only the most recent entries
			self::$label_by_tipo_cache = array_slice(self::$label_by_tipo_cache, -self::MAX_LABEL_CACHE_SIZE, null, true);
		}

		// term object
		$ontology_node	= ontology_node::get_instance($tipo);
		$label			= $ontology_node->get_term($lang, $fallback);

		// cache
		self::$label_by_tipo_cache[$cache_uid] = $label;


		return $label;
	}//end get_term_by_tipo



	/**
	 * GET_MODEL_BY_TIPO
	 * Static convenience wrapper: returns the fully-resolved model name for the given tipo.
	 *
	 * Applies the same resolution order as `get_model()` (forced overrides, temporal overrides,
	 * database column, legacy fallback, and name-replacement map). Results are cached in
	 * `self::$model_by_tipo_cache` (bounded at MAX_MODEL_CACHE_SIZE per COMP-05).
	 *
	 * Pass `$from_cache = false` only when a fresh resolution is required (e.g. immediately
	 * after an ontology import that may have changed the model column).
	 *
	 * @param string $tipo       - Ontology identifier (e.g. 'dd345')
	 * @param bool   $from_cache = true - Use in-memory cache when true
	 * @return string|null       - Resolved model name, or null when not found
	 */
	public static function get_model_by_tipo( string $tipo, bool $from_cache=true ) : ?string {

		// cache
		$cache_uid = $tipo;
		if ($from_cache===true && array_key_exists($cache_uid, self::$model_by_tipo_cache)) {
			return self::$model_by_tipo_cache[$cache_uid];
		}

		$ontology_node = ontology_node::get_instance($tipo);
		$model = $ontology_node->get_model();

		// cache
		// COMP-05: bound the cache like label_by_tipo_cache so a long-lived worker
		// process resolving many distinct tipos cannot grow it without limit.
		if (count(self::$model_by_tipo_cache) >= self::MAX_MODEL_CACHE_SIZE) {
			self::$model_by_tipo_cache = array_slice(self::$model_by_tipo_cache, -self::MAX_MODEL_CACHE_SIZE, null, true);
		}
		self::$model_by_tipo_cache[$cache_uid] = $model;


		return $model;
	}//end get_model_by_tipo



	/**
	 * GET_LEGACY_MODEL_BY_TIPO
	 * Static convenience wrapper for `get_legacy_model()`.
	 *
	 * Returns the raw model name for the given tipo via the legacy `model_tipo` →
	 * `get_term_by_tipo()` path, without applying v6/v7 name-replacement maps.
	 * Used during ontology migration tooling to compare old and new model names.
	 *
	 * @param string $tipo - Ontology identifier
	 * @return string|null - Legacy model name, or null when not resolvable
	 */
	public static function get_legacy_model_by_tipo( string $tipo ) : ?string {

		$ontology_node	= ontology_node::get_instance( $tipo );
		$model_name		= $ontology_node->get_legacy_model();

		return $model_name;
	}//end get_legacy_model_by_tipo



	/**
	 * GET_LEGACY_MODEL
	 * Returns the raw model name for this node via the legacy resolution path,
	 * without applying the v6/v7 name-replacement map from `get_model()`.
	 *
	 * Resolves by reading `model_tipo` and then fetching its term in DEDALO_STRUCTURE_LANG
	 * with no fallback (`$fallback = false`). Callers that need the current (post-replacement)
	 * model name should use `get_model()` instead.
	 *
	 * @return string|null - Legacy model name, or null when `model_tipo` is absent or unresolvable
	 */
	public function get_legacy_model() : ?string {

		$model_name = ontology_node::get_term_by_tipo(
			$this->get_model_tipo() ?? '',
			DEDALO_STRUCTURE_LANG,
			true,
			false
		);

		return $model_name;
	}//end get_legacy_model



	/**
	 * GET_TIPO_FROM_MODEL
	 * Resolves a model name back to its ontology tipo.
	 *
	 * All model nodes live under the 'dd' TLD and have `is_model = true`.
	 * The model name is the term in DEDALO_STRUCTURE_LANG (e.g. 'section', 'component_portal').
	 * The search uses the PostgreSQL JSONB containment operator `@>` to match the
	 * `term` column: `{"<DEDALO_STRUCTURE_LANG>": "<model>"}`.
	 *
	 * Returns the tipo of the first match, or null when no matching model node exists.
	 *
	 * @param string $model - Model name (e.g. 'section', 'component_input_text')
	 * @return string|null  - Resolved tipo (e.g. 'dd6'), or null when not found
	 */
	public static function get_tipo_from_model( string $model ) : ?string {

		// JSONB containment search: find the model node whose term in structure lang equals $model.
		// '@>' is the PostgreSQL "contains" operator for JSONB columns.
		$json_search = (object)[
			'operator' => '@>',
			'value' => json_encode([DEDALO_STRUCTURE_LANG => $model])
		];

		// search terms with given model
		$result = dd_ontology_db_manager::search(
			[
				'is_model'	=> true,
				'tld'		=> 'dd',
				'term'		=> $json_search
			],
			false, // order
			1 // limit
		);

		$tipo = ( $result===false )
			? null
			: ( $result[0] ?? null );

		return $tipo;
	}//end get_tipo_from_model



	/**
	 * GET_AR_CHILDREN_OF_THIS
	 * Returns direct (first-level only) child tipos for this node.
	 *
	 * Results are ordered by `order_number ASC` and cached in `self::$ar_children_of_this_stat_data`
	 * for the lifetime of the request. Returns an empty array when there are no children or
	 * when `$this->tipo` is empty.
	 *
	 * For a recursive descent, use `get_ar_recursive_children_of_this()` or the static
	 * `get_ar_recursive_children()`.
	 *
	 * @return array - Array of child tipo strings, ordered by `order_number`
	 */
	public function get_ar_children_of_this() : array {

		// check self tipo
		if(empty($this->tipo))	{
			return [];
		}

		// static cache
		$key = $this->tipo;
		if( isset(self::$ar_children_of_this_stat_data[$key]) ) {
			return self::$ar_children_of_this_stat_data[$key];
		}

		// search
		$result = dd_ontology_db_manager::search(
			[ 'parent' => $this->tipo ],
			true // order by order_number asc
		);

		$ar_children = ( $result===false ) ? [] : $result;

		// store cache data
		self::$ar_children_of_this_stat_data[$key] = $ar_children;


		return $ar_children;
	}//end get_ar_children_of_this



	/**
	 * GET_AR_CHILDREN
	 * Static convenience wrapper: returns all direct child tipos for the given tipo.
	 *
	 * Does not distinguish between descriptor nodes and model nodes — all direct children
	 * are returned. For model-filtered results use `get_ar_tipo_by_model_and_relation()`.
	 *
	 * @param string $tipo - Ontology identifier of the parent node
	 * @return array - Array of direct child tipo strings
	 */
	public static function get_ar_children( string $tipo ) : array {

		$ontology_node	= ontology_node::get_instance( $tipo );
		$ar_children	= $ontology_node->get_ar_children_of_this();

		return $ar_children;
	}//end get_ar_children



	/**
	 * GET_AR_RECURSIVE_CHILDREN_OF_THIS
	 * Resolves all descendant tipos for the given `$tipo`, depth-first.
	 *
	 * Accumulates results in the instance property `$ar_recursive_children_of_this`,
	 * which is cleared at the start of the top-level call (`$is_recursion === 0`) to
	 * prevent stale data from a previous call on the same instance.
	 *
	 * (!) This method is stateful via the instance property. It must NOT be cached
	 *     at the call-site across invocations with different starting tipos on the same
	 *     instance — doing so affects component_filter_master behaviour.
	 *
	 * (!) `$is_recursion` is INTERNAL — always pass 0 (or omit) at the call-site.
	 *     The method sets it to 1 on recursive self-calls to suppress the reset.
	 *
	 * For a stateless alternative, see the static `get_ar_recursive_children()`.
	 *
	 * @param string $tipo         - Starting ontology tipo for the descent
	 * @param int    $is_recursion = 0 - INTERNAL: 0 on first call, 1 on recursive calls
	 * @return array - Flat list of all descendant tipo strings (breadth within depth-first order)
	 */
	public function get_ar_recursive_children_of_this( string $tipo, int $is_recursion=0 ) : array {

		// IMPORTANT: DO NOT CACHE THIS METHOD COMPLETELY AS IS (AFFECTS COMPONENT_FILTER_MASTER)
		// But ensure we clear the state on initial call
		if ($is_recursion === 0) {
			$this->ar_recursive_children_of_this = [];
		}

		$ontology_node        = ontology_node::get_instance($tipo);
		$ar_children_of_this = $ontology_node->get_ar_children_of_this();

		foreach ($ar_children_of_this as $children_tipo) {
			$this->ar_recursive_children_of_this[] = $children_tipo;

			// Recursion
			$this->get_ar_recursive_children_of_this( $children_tipo, 1 );
		}

		return $this->ar_recursive_children_of_this ?? [];
	}//end get_ar_recursive_children_of_this



	/**
	 * GET_AR_RECURSIVE_CHILDREN
	 * Static, stateless recursive descent: returns all descendant tipos for `$tipo`.
	 *
	 * Prefers this over the instance method `get_ar_recursive_children_of_this()` when
	 * the caller does not own a node instance or needs model-based filtering. The result
	 * collector `$ar_resolved` is passed by reference to avoid copying large arrays on
	 * each recursive frame.
	 *
	 * Note: `$tipo` itself is NOT included in the result on the initial call — only its
	 * descendants are added. Descending children are added before their own sub-children
	 * (depth-first pre-order).
	 *
	 * (!) `$is_recursion` and `$ar_resolved` are INTERNAL recursion-control parameters.
	 *     Always call with only `$tipo` (and optionally `$ar_exclude_models`) at the call-site.
	 *
	 * @param string     $tipo              - Starting ontology tipo
	 * @param bool       $is_recursion      = false - INTERNAL: true on recursive self-calls
	 * @param array|null $ar_exclude_models = null  - Model names whose subtrees should be skipped entirely
	 * @param array|null &$ar_resolved      = null  - INTERNAL: accumulator array (pass null at call-site)
	 * @return array - Flat list of all descendant tipo strings, excluding excluded-model subtrees
	 */
	public static function get_ar_recursive_children( string $tipo, bool $is_recursion=false, ?array $ar_exclude_models=null, ?array &$ar_resolved=null ) : array {

		if ($ar_resolved === null) {
			$ar_resolved = [];
		}

		// Add the current tipo to the result only on recursive calls (not on the initial top-level
		// call), so the starting node itself is excluded from its own descendants list.
		if ($is_recursion === true) {
			$ar_resolved[] = $tipo;
		}

		$ontology_node = ontology_node::get_instance($tipo);
		$ar_children   = $ontology_node->get_ar_children_of_this();

		foreach ($ar_children as $current_tipo) {
			// Model exclusion: when a child's model is in the exclusion list, skip that
			// child AND its entire subtree (the recursive call is not made for it).
			if (!empty($ar_exclude_models)) {
				$model_name = ontology_node::get_model_by_tipo($current_tipo, true);
				if (in_array($model_name, $ar_exclude_models)) {
					continue;
				}
			}

			self::get_ar_recursive_children($current_tipo, true, $ar_exclude_models, $ar_resolved);
		}

		return $ar_resolved;
	}//end get_ar_recursive_children



	/**
	 * GET_AR_PARENTS_OF_THIS
	 * Resolves all ancestor tipos for the current node, walking up via `get_parent()`
	 * until the root node 'dd0' or a node with no parent is reached.
	 *
	 * The walk stops early if the parent equals the initial node (`$parent_inicial`) to
	 * guard against circular references in malformed ontology data, and it always
	 * excludes 'dd0' (the universal root node) from the result.
	 *
	 * Results are indexed 0..N in bottom-up traversal order (closest parent first).
	 * When `$ksort` is true, `krsort()` is applied so the highest-level ancestor has
	 * the largest index (i.e. farthest ancestor → key N, nearest ancestor → key 0):
	 *
	 * Example (with $ksort = true):
	 *   [4 => "dd1", 3 => "dd14", 2 => "rsc1", 1 => "rsc75", 0 => "rsc76"]
	 *   where "rsc76" is the immediate parent, "dd1" is near the top of the tree.
	 *
	 * Results are cached per tipo+ksort combination in `self::$ar_parents_of_this_data`.
	 *
	 * @param bool $ksort = true - When true, apply krsort() to put the root end first
	 * @return array - Associative array of ancestor tipo strings (may be empty for root nodes)
	 */
	public function get_ar_parents_of_this( bool $ksort=true ) : array {

		// static cache
		$cache_key = $this->tipo . '_' . (int)$ksort;
		if(isset($this->tipo) && array_key_exists($cache_key, self::$ar_parents_of_this_data)) {
			return self::$ar_parents_of_this_data[$cache_key];
		}

		$ar_parents_of_this = [];

		$parent = $this->get_parent();
		if(empty($parent)) {
			return $ar_parents_of_this;
		}

		$parent_inicial	= $parent;
		// 'dd0' is the universal root; it is intentionally excluded from the result.
		$parent_zero	= 'dd0';
		do {
			if( $parent !== $parent_zero ) {
				$ar_parents_of_this[] = $parent;
			}

			$ontology_node	= ontology_node::get_instance($parent);
			$parent			= $ontology_node->get_parent();

			// Loop guard: $parent_inicial prevents infinite loops caused by a circular
			// parent reference (a child that somehow points back to itself).
		} while ( !empty($parent) && ($parent !== $parent_zero) && $parent !== $parent_inicial );

		// Reverse keys so that the farthest ancestor has the highest numeric index.
		// Callers who iterate from most-general to most-specific rely on descending key order.
		if($ksort===true) {
			krsort($ar_parents_of_this);
		}

		// store cache data
		self::$ar_parents_of_this_data[$cache_key] = $ar_parents_of_this;


		return $ar_parents_of_this;
	}//end get_ar_parents_of_this



	/**
	 * GET_AR_SIBLINGS_OF_THIS
	 * Returns all sibling tipos (nodes sharing the same parent) for this node.
	 *
	 * Note: the result includes this node itself (not filtered out), because the query
	 * retrieves all children of the parent without excluding the current tipo.
	 *
	 * Results are cached per tipo in `self::$ar_siblings_of_this_data`. When the parent
	 * is null (root node), the DB search uses null and may return unexpected results —
	 * callers should be aware that root-level nodes share the same null-parent.
	 *
	 * @return array - Array of sibling tipo strings (including this node's own tipo)
	 */
	public function get_ar_siblings_of_this() : array {

		// static cache
		if( isset($this->tipo) && isset(self::$ar_siblings_of_this_data[$this->tipo]) ) {
			return self::$ar_siblings_of_this_data[$this->tipo];
		}

		// search
		$result = dd_ontology_db_manager::search([
			'parent' => $this->get_parent()
		]);

		$siblings = ( $result===false ) ? [] : $result;

		// store cache data
		self::$ar_siblings_of_this_data[$this->tipo] = $siblings;


		return $siblings;
	}//end get_ar_siblings_of_this



	/**
	 * GET_RELATION_NODES
	 * Returns the relations for the given tipo.
	 *
	 * In normal mode, returns an array of relation objects as stored in `dd_ontology.relations`
	 * (each element has at minimum a `tipo` key).
	 * In simple mode (`$simple = true`), returns a flat array of just the related tipos.
	 *
	 * Invalid relation entries (missing or empty `tipo` key) are skipped and logged in
	 * simple mode. They are passed through unchanged in normal mode.
	 *
	 * (!) The `$cache` parameter is accepted for backward compatibility but is not used —
	 *     the comment "do not use cache in this method !" in the implementation is intentional.
	 *
	 * @param string $tipo   - Source ontology identifier
	 * @param bool   $cache  = false - Accepted but unused; kept for call-site compatibility
	 * @param bool   $simple = false - When true, return a flat array of relation tipo strings only
	 * @return array - Array of relation objects (normal mode) or tipo strings (simple mode)
	 */
	public static function get_relation_nodes( string $tipo, bool $cache=false, bool $simple=false ) : array {

		// do not use cache in this method !

		$ontology_node	= ontology_node::get_instance($tipo);
		$ar_relations	= $ontology_node->get_relations() ?? [];
		// E.g. [{"tipo": "hierarchy20"}]

		// simple. Only returns the clean array with the 'tipo' listing
		if($simple===true) {

			$ar_relation_tipos = [];
			foreach($ar_relations as $relation) {

				$current_tipo = $relation->tipo ?? null;

				if (!$current_tipo) {
					debug_log(__METHOD__
						. " Skip invalid relation " . PHP_EOL
						. ' tipo; ' . $tipo . PHP_EOL
						. ' ar_relations: ' . to_string($ar_relations)
						, logger::ERROR
					);
					continue;
				}

				// Add current_tipo
				$ar_relation_tipos[] = $current_tipo;
			}

			// overwrite
			$ar_relations = $ar_relation_tipos;
		}


		return $ar_relations;
	}//end get_relation_nodes



	/**
	 * GET_AR_TIPO_BY_MODEL_AND_RELATION
	 * Returns tipos reachable from `$tipo` via a given relation type, filtered by model name.
	 *
	 * Supported relation types:
	 * - 'children'           First-level children of `$tipo`.
	 * - 'children_recursive' All descendants of `$tipo` (full subtree).
	 * - 'related'            Nodes listed in the `relations` column of `$tipo`.
	 * - 'parent'             Ancestor chain of `$tipo` up to the root.
	 *
	 * After collecting the candidate set, each candidate's model name is resolved via
	 * `get_model_by_tipo()`. When `$search_exact` is false, `str_contains()` is used
	 * so that e.g. 'component_input_text' also matches 'component_input_text_large'.
	 *
	 * Results are cached in `self::$ar_tipo_by_model_name_and_relation_data` per
	 * (tipo, model_name, relation_type, search_exact) combination.
	 *
	 * @param string $tipo           - Base ontology tipo (e.g. 'dd20')
	 * @param string $model_name     - Model name to match (e.g. 'component_input_text')
	 * @param string $relation_type  - Traversal strategy: 'children' | 'children_recursive' | 'related' | 'parent'
	 * @param bool   $search_exact   = false - True for exact match; false for substring match
	 * @return array - Flat list of matching tipo strings
	 */
	public static function get_ar_tipo_by_model_and_relation( string $tipo, string $model_name, string $relation_type, bool $search_exact=false ) : array {

		if (empty($tipo)) {
			return [];
		}

		// static cache
		$uid = $tipo . '_' . $model_name . '_' . $relation_type . '_' . (int)$search_exact;
		if (isset(self::$ar_tipo_by_model_name_and_relation_data[$uid])) {
			return self::$ar_tipo_by_model_name_and_relation_data[$uid];
		}

		$ar_resolved = [];
		$ar_targets  = [];

		switch($relation_type) {
			case 'children' :
				$ontology_node = ontology_node::get_instance($tipo);
				$ar_targets    = $ontology_node->get_ar_children_of_this();
				break;

			case 'children_recursive' :
				$ontology_node = ontology_node::get_instance($tipo);
				$ar_targets    = $ontology_node->get_ar_recursive_children_of_this($tipo);
				break;

			case 'related' :
				$ar_targets = ontology_node::get_relation_nodes($tipo, true, true);
				break;

			case 'parent' :
				$ontology_node = ontology_node::get_instance($tipo);
				$ar_targets    = $ontology_node->get_ar_parents_of_this();
				break;

			default :
				debug_log(__METHOD__ . " ERROR: relation_type [{$relation_type}] not defined! tipo: {$tipo}", logger::ERROR);
				return [];
		}

		// Filter targets by model
		if (is_array($ar_targets)) foreach($ar_targets as $current_tipo) {

			$current_model_name = ontology_node::get_model_by_tipo($current_tipo, true);
			if (empty($current_model_name)) {
				debug_log(__METHOD__ . " Error processing relation {$relation_type}. Model is empty for {$current_tipo}", logger::ERROR);
				continue;
			}

			if ($search_exact) {
				if ($current_model_name === $model_name) {
					$ar_resolved[] = $current_tipo;
				}
			} else {
				if (str_contains($current_model_name, $model_name)) {
					$ar_resolved[] = $current_tipo;
				}
			}
		}

		// store cache data
		self::$ar_tipo_by_model_name_and_relation_data[$uid] = $ar_resolved;

		return $ar_resolved;
	}//end get_ar_tipo_by_model_and_relation



	/**
	 * GET_COLOR
	 * Returns the color hex string defined in the node's `properties` object,
	 * or the default gray '#b9b9b9' when no color is configured.
	 *
	 * Used by `component_section_id` to apply a namespace-level color accent to
	 * section identifier fields, allowing visual differentiation between ontology domains.
	 *
	 * @param string $section_tipo - Ontology tipo of the section node
	 * @return string - CSS hex color string (e.g. '#2d8894'), guaranteed non-null
	 */
	public static function get_color( string $section_tipo ) : string {

		$ontology_node	= ontology_node::get_instance( $section_tipo );
		$properties		= $ontology_node->get_properties();

		$color = $properties->color ?? '#b9b9b9'; // default gray

		return $color;
	}//end get_color



}//end class ontology_node
