<?php declare(strict_types=1);
/**
 * CLASS ONTOLOGY_NODE
 * Runtime wrapper around a single ontology node (identified by its `tipo`).
 *
 * Responsibilities:
 * - Read-only access to ontology node metadata stored in `dd_ontology`
 * - Resolution helpers (labels, models, parents, children, relations, etc.)
 * - Small write helpers used by ontology maintenance tools (insert/delete)
 *
 * Notes:
 * - Regular application code should treat ontology nodes as read-only.
 * - Structural changes to ontology must be done via `class.ontology.php`.
 *
 * @package Dedalo
 * @subpackage Core
 */
class ontology_node {

	// tipo
	// Ontology identifier of the node.
	// 'tipo' : Typology of Indirect Programming Objects.
	// Every node in the ontology has a unique identifier.
	// It allows to define the node properties.
	// 'tipo' uses a TLD plus a unique id for this TLD, e.g. 'oh1':
	//  - 'oh' = TLD (Top Level Domain) / ontology namespace, e.g. Oral History
	//  - '1'  = unique and sequential id within that TLD
	public string $tipo;

	// data
	// An object with all properties of the ontology node:
	//	{
	//		parent			: "tch188"				string | null
	//		term			: {"lg-eng": "Object"}	object | null
	//		model			: "section"				string | null
	//		order_number	: 5						int | null
	//		relations		: [{"tipo":"tch7"}]		array | null
	//		tld				: "tch"					string
	//		properties		: {"color": "#2d8894"}	object | null
	//		model_tipo		: "dd6"					string | null
	//		is_model		: false					boolean
	//		is_translatable	: false					boolean
	//		propiedades		: "{}"					string, data is a object as json stringify // Deprecated used only for compatibility of v5 and v6
	//	}
	// Every property has its own column in the `dd_ontology` table.
	protected $data;

	// is_loaded_data
	// Marks if the node data has already been loaded from database.
	protected bool $is_loaded_data = false;

	// ar_recursive_children_of_this
	// Internal cache for expensive recursive-children calculations.
	protected array $ar_recursive_children_of_this = [];

	// default table
	// Physical table used to store ontology nodes.
	// It is treated as read-only during normal application execution.
	// When DEDALO_RECOVERY_MODE is active, operations may target `dd_ontology_recovery`.
	public static $table = 'dd_ontology';

	// static cache
	public static $instances = []; // array of ontology_node instances
	public static $label_by_tipo_cache = []; // array of ontology_node labels
	public static $model_by_tipo_cache = []; // array of ontology_node models
	public static $ar_children_of_this_stat_data = []; // array of ontology_node children
	public static $ar_parents_of_this_data = []; // array of ontology_node parents
	public static $ar_siblings_of_this_data = []; // array of ontology_node siblings
	public static $ar_tipo_by_model_name_and_relation_data = []; // array of ontology_node tipo by model name and relation



	/**
	 * GET_INSTANCE
	 * Factory + static cache for ontology nodes.
	 *
	 * @param string $tipo Ontology identifier (e.g. 'dd156')
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
	 * @param string $tipo Raw ontology identifier
	 */
	private function __construct( string $tipo ) {

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

			// Set tipo
				$this->tipo = $safe_tipo;

			// set data
			$this->data = new stdClass();
		}
	}//end __construct



	/**
	 * LOAD_DATA
	 * Loads the node row from database into `$this->data`.
	 *
	 * @return bool True on success, false when tipo is empty or a low-level error occurred.
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
	 * @return object|null Node data or null when not present in database
	 */
	public function get_data() : ?object {
		$this->load_data();

		return $this->data;
	}//end get_data



	/**
	 * GET_TIPO
	 * Returns the ontology identifier (`tipo`) for this instance.
	 *
	 * @return string|null
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
	 * If the requested language does not exist and `$fallback` is true:
	 * - First tries DEDALO_STRUCTURE_LANG
	 * - Then falls back to the first non-empty available term
	 *
	 * @param string $lang     Requested language code
	 * @param bool   $fallback Enable label fallback strategy
	 * @return string|null     Term in the resolved language, or null when none available
	 */
	public function get_term( string $lang, $fallback=true ) : ?string {

		$term_data = $this->get_term_data();

		// get the lang to be used to get the labels
		// it call to get_label_lang() to process exceptions as català to valencià, that are the same language.
		// if it not set, it will return DEDALO_APPLICATION_LANG
		$lang = lang::get_label_lang( $lang );

		// empty term case
		if (!is_object($term_data)) {
			return null;
		}

		// lang already exists case
		if (isset($term_data->{$lang})) {
			return $term_data->{$lang};
		}

		// fallback lang
		if ($fallback===true) {

			// main lang
			$ontology_lang = DEDALO_STRUCTURE_LANG;
			if (isset($term_data->{$ontology_lang})) {
				return $term_data->{$ontology_lang};
			}

			// fallback to anything
			foreach ($term_data as $lang => $value) {
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
	 * Model is an ontology node typology term, it uses a unique term in ontology lang.
	 * Models are not translatable, they are used to create instances of sections, components, etc.
	 * Therefore, models are unique names that point to specific code scripts in Dédalo.
	 * - E.g.
	 *   - section          ---> class.section.php / section.js / section.css
	 *   - component_portal ---> class.component_portal.php / component_portal.js / component_portal.css
	 *
	 * Resolution strategy:
	 * - Directly from column `model` when present
	 * - Fallback via `model_tipo` + `get_term_by_tipo` when missing
	 * - Applies legacy model name replacements at the end
	 *
	 * @return string|null The model name or null if it cannot be resolved
	 */
	public function get_model() : ?string {

		$this->load_data();

		if (empty($this->tipo)) {
			return null;
		}

		// forced models in v6/v7 (while we are using structure v5)
		$forced_models = [
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
		return $this->data->properties ?? null;
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
	 * Identify if the ontology node is a model or not
	 * The ontology has to main types of nodes, descriptors and models
	 * both are defined in the same way. Both has an ontology node identification; tipo
	 * both has relations, parent, properties, etc.
	 * and models are identify with the property is_model with true
	 * the other ones are identify with the property is_mode as false.
	 * Retrieve from DDBB the column is_model
	 * @return bool
	 */
	public function get_is_model() : bool {
		$this->load_data();
		return (bool)($this->data->is_model ?? false);
	}//end get_is_model



	/**
	 * GET_IS_TRANSLATABLE
	 * Returns whether the node data is translatable.
	 * Identify if the ontology node data is translatable.
	 * Used by strings components to store its data with specific language.
	 * Retrieves from DDBB the column is_translatable
	 * @return bool
	 */
	public function get_is_translatable() : bool {
		$this->load_data();
		return $this->data->is_translatable ?? false;
	}//end get_is_translatable



	/**
	 * GET_TRANSLATABLE
	 * Helper that answers if a given tipo is translatable.
	 *
	 * @param string $tipo Ontology identifier
	 * @return bool
	 */
	public static function get_translatable( string $tipo ) : bool {

		$ontology_node	= ontology_node::get_instance($tipo);
		$translatable	= $ontology_node->get_is_translatable();

		return $translatable;
	}//end get_translatable



	/**
	 * GET_PROPIEDADES
	 * Returns the value of property 'properties', stored as plain text in table column 'properties'
	 * Values expected in 'propiedades' are always JSON. You can obtain raw value (default) or JSON decoded (called with argument 'true')
	 * @param bool $json_decode = false
	 * @return mixed $propiedades
	 * 	object / string parent::$properties
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
	 * Sets the parent tipo for this node, e.g. 'oh1'.
	 *
	 * @param string|null $parent Parent tipo or null for root
	 */
	public function set_parent( ?string $parent ) {

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
	 * Sets the `term` object for this node, e.g. {"lg-eng": "Activity"}.
	 *
	 * @param object|null $term
	 */
	public function set_term_data( ?object $term ) {

		$this->data->term = $term;
	}//end set_term_data



	/**
	 * SET_MODEL
	 * Sets the model name, e.g. "component_input_text".
	 *
	 * @param string|null $model
	 */
	public function set_model( ?string $model ) {

		$this->data->model = $model;
	}//end set_model



	/**
	 * SET_ORDER_NUMBER
	 * Sets the `order_number` value, e.g. 5.
	 *
	 * @param int|null $order_number
	 */
	public function set_order_number( ?int $order_number ) {

		$this->data->order_number = $order_number;
	}//end set_order_number



	/**
	 * SET_RELATIONS
	 * Sets the `relations` array, e.g. [{"tipo": "actv1"}].
	 *
	 * @param array|null $relations
	 */
	public function set_relations( ?array $relations) {

		$this->data->relations = $relations;
	}//end set_relations



	/**
	 * SET_TLD
	 * Sets the TLD value, e.g. 'tch'.
	 *
	 * @param string|null $tld
	 */
	public function set_tld( ?string $tld ) {

		$this->data->tld = $tld;
	}//end set_tld



	/**
	 * SET_PROPERTIES
	 * Sets the `properties` object, e.g. {"css": {".wrapper_component": {"grid-column": "span 2"}}}.
	 *
	 * @param object|null $properties
	 */
	public function set_properties( ?object $properties) {

		$this->data->properties = $properties;
	}//end set_properties



	/**
	 * SET_MODEL_TIPO
	 * Sets the `model_tipo` value, e.g. 'dd6'.
	 *
	 * @param string|null $model_tipo
	 */
	public function set_model_tipo( ?string $model_tipo ) {

		$this->data->model_tipo = $model_tipo;
	}//end set_model_tipo



	/**
	 * SET_IS_MODEL
	 * Sets the `is_model` flag, e.g. true.
	 *
	 * @param bool $is_model
	 */
	public function set_is_model( bool $is_model) {

		$this->data->is_model = $is_model;
	}//end set_is_model



	/**
	 * SET_IS_TRANSLATABLE
	 * Sets the `is_translatable` flag, e.g. true.
	 *
	 * @param bool $is_translatable
	 */
	public function set_is_translatable( bool $is_translatable ) {

		$this->data->is_translatable = $is_translatable;
	}//end set_is_translatable



	/**
	 * SET_PROPIEDADES
	 * Sets the legacy `propiedades` column value.
	 *
	 * Example:
	 * {"css":{".wrap_component":{"mixin":[".vertical",".line_top"],"style":{"width":"25%"}}}}
	 *
	 * @param ?string $propiedades JSON-encoded string
	 */
	public function set_propiedades( ?string $propiedades ) {

		$this->data->propiedades = $propiedades;
	}//end set_propiedades



	/**
	 * INSERT
	 *
	 * Persists the current ontology node data to the 'dd_ontology' table.
	 *
	 * This method creates or updates the record in the database.
	 * If 'tipo' is empty or TLD cannot be resolved, the operation returns false.
	 *
	 * @return bool True if the record was successfully created or updated, false otherwise.
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
	 *
	 * Deletes the record associated with the current 'tipo' from the 'dd_ontology' table.
	 *
	 * @return bool True if the record was successfully deleted, false otherwise.
	 */
	public function delete() : bool {

		$tipo = $this->get_tipo();

		$result = dd_ontology_db_manager::delete($tipo);

		if($result===false) {
			return false;
		}

		return true;
	}//end delete



	/**
	 * GET_TERM_BY_TIPO
	 * Get label value from 'term' in given lang
	 * It use a fallback to: DEDALO_APPLICATION_LANG, DEDALO_DATA_LANG, DEDALO_STRUCTURE_LANG
	 * @param string $tipo
	 * @param string $lang = null
	 * @param bool $from_cache = true
	 * @param bool $fallback = true
	 * @return string|null $label
	 */
	public static function get_term_by_tipo( string $tipo, ?string $lang=null, bool $from_cache=true, bool $fallback=true ) : ?string {

		// cache
		$cache_uid = $tipo . '_' . $lang . '_' . (int)$fallback;
		if ($from_cache===true && isset(self::$label_by_tipo_cache[$cache_uid])) {
			return self::$label_by_tipo_cache[$cache_uid];
		}

		// Safe control: prevent big array memory and performance problems
		if (count(self::$label_by_tipo_cache) > 2000) {
			self::$label_by_tipo_cache = [];
		}

		// Verify : In cases such as, for example, when solving the model of a related term that has no model assigned to it, the tipo will be empty.
		// This is not a mistake but we must avoid resolving it.
		if(empty($tipo)) {
			return null;
		}

		// safe lang fallback
		$lang = $lang ?? DEDALO_DATA_LANG;

		// term object
		$ontology_node	= ontology_node::get_instance($tipo);
		$label			= $ontology_node->get_term($lang, $fallback);

		// cache
		self::$label_by_tipo_cache[$cache_uid] = $label;


		return $label;
	}//end get_term_by_tipo



	/**
	 * GET_MODEL_BY_TIPO
	 * Returns the model name of the given tipo (ontology node).
	 *
	 * @param string $tipo       Ontology identifier
	 * @param bool   $from_cache Use in-memory cache when true
	 * @return string|null       Model name or null when not found
	 */
	public static function get_model_by_tipo( string $tipo, bool $from_cache=true ) : ?string {

		// cache
		$cache_uid = $tipo;
		if ($from_cache===true && isset(self::$model_by_tipo_cache[$cache_uid])) {
			return self::$model_by_tipo_cache[$cache_uid];
		}

		$ontology_node	= ontology_node::get_instance($tipo);
		$model	= $ontology_node->get_model();

		// cache
		self::$model_by_tipo_cache[$cache_uid] = $model;


		return $model;
	}//end get_model_by_tipo



	/**
	 * GET_LEGACY_MODEL_BY_TIPO
	 * Temporal helper to manage transitional models.
	 *
	 * Returns the model name for the given tipo without applying v6/v7 replacements.
	 *
	 * @param string $tipo
	 * @return string|null $model_name
	 */
	public static function get_legacy_model_by_tipo( string $tipo ) : ?string {

		$ontology_node	= ontology_node::get_instance( $tipo );
		$model_name		= $ontology_node->get_legacy_model();

		return $model_name;
	}//end get_legacy_model_by_tipo



	/**
	 * GET_LEGACY_MODEL
	 * Temporal helper to manage transitional models.
	 *
	 * Returns the model name without applying v6/v7 replacements.
	 *
	 * @return string|null $model_name
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
	 * - Model names are unique within TLD 'dd'.
	 * - Searches on model terms (is_model = true).
	 *
	 * @param string $model Model name (e.g. 'section')
	 * @return string|null  Resolved tipo or null when not found
	 */
	public static function get_tipo_from_model( string $model ) : ?string {

		$json_search = (object)[
			'operator' => '@>',
			'value' => '{"'.DEDALO_STRUCTURE_LANG.'":"'.$model.'"}'
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
	 * Returns direct children tipos for this node (first level only).
	 *
	 * @return array Array of child tipos
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
	 * Resolves all terms (tipos) that have the given tipo as parent.
	 *
	 * Does not distinguish between descriptors and models.
	 *
	 * @param string $tipo
	 * @return array $ar_children
	 */
	public static function get_ar_children( string $tipo ) : array {

		$ontology_node	= ontology_node::get_instance( $tipo );
		$ar_children	= $ontology_node->get_ar_children_of_this();

		return $ar_children;
	}//end get_ar_children



	/**
	 * GET_AR_RECURSIVE_CHILDREN_OF_THIS
	 * Resolves all the children of the current term recursively.
	 * WARNING: This method statefully populates $this->ar_recursive_children_of_this.
	 *
	 * @param string $tipo The starting tipo
	 * @param int $is_recursion INTERNAL use for recursion level
	 * @return array The complete list of recursive children
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
	 * Static version of `get_ar_recursive_children_of_this`.
	 *
	 * - Optimized by using a collector array passed by reference.
	 * - Supports model-based exclusion (skips nodes whose model is in `$ar_exclude_models`).
	 *
	 * @param string     $tipo             Starting tipo
	 * @param bool       $is_recursion     INTERNAL flag
	 * @param array|null $ar_exclude_models Models to skip (and their children)
	 * @param array|null &$ar_resolved     INTERNAL collector array for recursion
	 * @return array                       Complete list of recursive children tipos
	 */
	public static function get_ar_recursive_children( string $tipo, bool $is_recursion=false, ?array $ar_exclude_models=null, ?array &$ar_resolved=null ) : array {

		if ($ar_resolved === null) {
			$ar_resolved = [];
		}

		if ($is_recursion === true) {
			$ar_resolved[] = $tipo;
		}

		$ontology_node = ontology_node::get_instance($tipo);
		$ar_children   = $ontology_node->get_ar_children_of_this();

		foreach ($ar_children as $current_tipo) {
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
	 * Resolves the current term's parents recursively.
	 *
	 * Example result (Associative array):
	 * ["4": "dd1", "3": "dd14", "2": "rsc1", "1": "rsc75", "0": "rsc76"]
	 *
	 * @param bool $ksort When true, reverses keys order
	 * @return array $ar_parents_of_this
	 */
	public function get_ar_parents_of_this( bool $ksort=true ) : array {

		// static cache
		if(isset($this->tipo) && isset(self::$ar_parents_of_this_data[$this->tipo])) {
			return self::$ar_parents_of_this_data[$this->tipo];
		}

		$ar_parents_of_this = [];

		$parent = $this->get_parent();
		if(empty($parent)) {
			return $ar_parents_of_this;
		}

		$parent_inicial	= $parent;
		$parent_zero	= 'dd0';
		do {
			if( strpos($parent, $parent_zero)===false  ) { // $parent != $parent_zero
				$ar_parents_of_this[] = $parent;
			}

			$ontology_node	= ontology_node::get_instance($parent);
			$parent			= $ontology_node->get_parent();

		} while ( !empty($parent) && ($parent !== $parent_zero) && $parent !== $parent_inicial );

		// we reverse order the parents
		if($ksort===true) {
			krsort($ar_parents_of_this);
		}

		// store cache data
		self::$ar_parents_of_this_data[$this->tipo] = $ar_parents_of_this;


		return $ar_parents_of_this;
	}//end get_ar_parents_of_this



	/**
	 * GET_AR_SIBLINGS_OF_THIS
	 * Resolves all sibling descriptors of the current term.
	 *
	 * Siblings are nodes that share the same parent.
	 *
	 * @return array $ar_siblings_of_this
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
	 * Returns relation nodes for a given tipo.
	 *
	 * @param string $tipo   Source ontology identifier
	 * @param bool   $cache  (Unused, kept for BC)
	 * @param bool   $simple When true, returns only an array of relation tipos
	 * @return array         Array of relation objects or tipos (simple mode)
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
	 * Returns tipos of related terms filtered by model name and relation type.
	 *
	 * Examples:
	 * - Find children with a given model
	 * - Find recursively related terms with a given model
	 *
	 * @param string $tipo           Base tipo (e.g. 'dd20')
	 * @param string $model_name     Model name to match (e.g. 'component_input_text')
	 * @param string $relation_type  One of: 'children', 'children_recursive', 'related', 'parent'
	 * @param bool   $search_exact   When true, require exact model name match (no substring)
	 * @return array                 Array of resolved tipos
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
				$ontology_node = ontology_node::get_instance($tipo);
				$ar_targets    = $ontology_node->get_relation_nodes($tipo, true, true);
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
	 * Returns the color defined in node properties or a default gray.
	 * It is used to set custom styles to component_section_id in some sections
	 *
	 * @param string $section_tipo
	 * @return string Color string like '#b9b9b9'
	 */
	public static function get_color( string $section_tipo ) : string {

		$ontology_node	= ontology_node::get_instance( $section_tipo );
		$properties		= $ontology_node->get_properties();

		$color = isset($properties->color)
			? $properties->color
			: '#b9b9b9'; // default gray

		return $color;
	}//end get_color



}//end class ontology_node
