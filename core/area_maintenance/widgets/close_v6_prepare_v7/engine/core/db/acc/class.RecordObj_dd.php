<?php declare(strict_types=1);
/**
* CLASS RECORDOBJ_DD
* Active-record wrapper for a single row in the `jer_dd` ontology table.
*
* Every term (tipo) in Dédalo's Ontology lives as one row in the PostgreSQL
* table `jer_dd`. This class maps that row to an object, exposes typed getters
* and setters for every column, and adds higher-level helpers for the most
* common ontology queries (children, parents, siblings, model resolution, etc.).
*
* Responsibilities:
* - Bind an ontology row to PHP properties via the RecordDataBoundObject ORM.
* - Resolve the component model name for any tipo (with obsolete-model aliasing
*   and hard-coded overrides for terms whose Ontology data is not yet migrated).
* - Translate the `term` JSONB column (multilingual label map) to/from PHP objects.
* - Traverse the ontology tree: direct children, recursive descendants, parents,
*   siblings, and related terms (`relaciones`).
* - Manage the per-TLD row counter used to mint new terminoIDs.
* - Support recovery mode by switching queries to `jer_dd_recovery` transparently.
* - Provide bulk helpers used by the import/export and ontology-map tools
*   (get_all_tld_records, get_row_data, get_active_tlds, tipo_to_json_item).
* - Maintain a lightweight per-request static instance cache to avoid repeated
*   DB hits for the same terminoID/prefijo pair.
*
* Key relationships:
* - Extends RecordDataBoundObject, the abstract PostgreSQL ORM base.
* - Used pervasively across core components, search, diffusion, and tools.
* - `main_dd` table stores per-TLD counters referenced by Save() / update_counter().
* - `jer_dd` (and `jer_dd_recovery`) are the ontology node tables.
*
* Column → property mapping (via defineRelationMap):
*   terminoID  | tld | parent  | modelo     | model      | esmodelo
*   esdescriptor | visible | norden | traducible | relaciones
*   propiedades  | properties | term
*
* @package Dédalo
* @subpackage Core
*/
class RecordObj_dd extends RecordDataBoundObject {



	// fields
	/**
	* Primary key: the unique ontology term identifier, e.g. 'dd73', 'rsc155'.
	* Combines tld prefix with a numeric counter (see Save() for minting logic).
	* @var string|null $terminoID
	*/
	public $terminoID;

	/**
	* The terminoID of this term's direct parent in the ontology hierarchy.
	* Root terms use 'dd0' or null as parent.
	* @var string|null $parent
	*/
	protected $parent;

	/**
	* v5/v6 legacy model field: stores the terminoID of the model term
	* (e.g. 'dd592'). Superseded by `$model` in v7; kept for fallback resolution
	* in get_modelo_name() when `$model` is absent.
	* @var string|null $modelo
	*/
	protected $modelo;

	/**
	* v7 model field: stores the model name string directly (e.g. 'component_input_text').
	* Takes precedence over `$modelo` during model resolution.
	* @var string|null $model
	*/
	protected $model;

	/**
	* 'si'|'no' flag indicating whether this term is itself a model definition.
	* Used by get_ar_all_models() and get_model_terminoID() to distinguish
	* model nodes from descriptor/section nodes.
	* @var string|null $esmodelo
	*/
	protected $esmodelo;

	/**
	* 'si'|'no' flag indicating whether this term is a descriptor
	* (i.e. a leaf data node, not a structural grouping node).
	* @var string|null $esdescriptor
	*/
	protected $esdescriptor;

	/**
	* 'si'|'no' flag controlling visibility of the term in the UI.
	* @var string|null $visible
	*/
	protected $visible;

	/**
	* Numeric sort order of this term among its siblings. Stored as text in the DB.
	* Cast to int via get_order() for comparison purposes.
	* @var string|null $norden
	*/
	protected $norden;

	/**
	* Top-level domain prefix for this term, e.g. 'dd', 'rsc', 'oh'.
	* Matches the leading alphabetic portion of terminoID.
	* @var string|null $tld
	*/
	protected $tld;

	/**
	* 'si'|'no' flag indicating whether the component value is language-sensitive.
	* When 'si', data is stored under DEDALO_DATA_LANG; when 'no', under DEDALO_DATA_NOLAN.
	* @var string|null $traducible
	*/
	protected $traducible;

	/**
	* Legacy related-terms field (text column). Stores a JSON-encoded array
	* of relation objects. Parsed by get_relaciones() / get_relations().
	* @var string|null $relaciones
	*/
	protected $relaciones;

	/**
	* Legacy properties field (text column, plain JSON). Stores arbitrary
	* term configuration. Use get_propiedades() with $json_decode=true to parse.
	* Superseded by `$properties` (JSONB column) in v7.
	* @var string|null $propiedades
	*/
	protected $propiedades;

	/**
	* v7 properties field (JSONB column). Supersedes `$propiedades`.
	* Parsed by get_properties() which returns a stdClass or null.
	* @var string|null $properties
	*/
	protected $properties;

	/**
	* Multilingual label map stored as JSONB, e.g. {"en_US":"Term","es_ES":"Término"}.
	* Accessed and mutated as an object via get_term() / set_term().
	* @var string|null $term
	*/
	protected $term;

	/**
	* TLD prefix used to construct new terminoIDs (e.g. 'dd', 'rsc').
	* Set in the constructor from the terminoID or from the $prefijo argument.
	* @var string|null $prefijo
	*/
	protected $prefijo;

	// fields external
	/**
	* External search filter on term names (not a jer_dd column).
	* Reserved for specialised search flows; not persisted.
	* @var mixed $filtroTerminos
	*/
	protected $filtroTerminos;

	// optional specific loads
	/**
	* Accumulator used by get_ar_recursive_children_of_this() to collect
	* descendant terminoIDs during the recursive walk.
	* Reset to [] on each new instance; never cache this method's result.
	* @var array $ar_recursive_children_of_this
	*/
	protected $ar_recursive_children_of_this = [];

	// default table. Can be changed on the fly base on DEDALO_RECOVERY_MODE
	/**
	* Active jer_dd table name. Normally 'jer_dd'; switches to 'jer_dd_recovery'
	* when the environment flag DEDALO_RECOVERY_MODE is true.
	* Mutated by defineTableName() on every instantiation.
	* @var string $table
	*/
	public static $table = 'jer_dd';



	/**
	* Per-request instance cache keyed by md5([$terminoID, $prefijo]).
	* Populated by get_instance(); prevents redundant DB hits within a single
	* request for the same term.
	* @var array $instances
	*/
	private static $instances = [];



	/**
	* GET_INSTANCE
	* Singleton factory: returns a cached RecordObj_dd for the given terminoID/prefijo
	* pair, creating and storing a new instance on first call.
	*
	* Use this instead of `new RecordObj_dd(...)` whenever you only need to read
	* ontology data and can tolerate a per-request cache hit.
	* @param ?string $terminoID = null - e.g. 'dd73'; null when constructing by prefijo alone
	* @param ?string $prefijo = null - e.g. 'dd'; used when terminoID is absent
	* @return self
	*/
	public static function get_instance(?string $terminoID = null, ?string $prefijo = null): self {

		$key = md5(serialize([$terminoID, $prefijo]));

		if (!isset(self::$instances[$key])) {
			self::$instances[$key] = new self($terminoID, $prefijo);
		}

		return self::$instances[$key];
	}//end get_instance



	/**
	* __CONSTRUCT
	* Initialises the object from a terminoID or a bare TLD prefix.
	*
	* Three construction paths:
	* 1. $terminoID provided: derives tld/prefijo from the tipo string,
	*    then delegates to parent::__construct($terminoID) so the ORM loads
	*    the row on first property access.
	* 2. $prefijo provided (length >= 2, no terminoID): sets prefijo/tld only;
	*    useful for counter and bulk-search operations where no specific row
	*    is needed.
	* 3. Neither provided: logs an ERROR and still calls parent::__construct(null).
	*    Callers must treat the returned object as unusable.
	* @param ?string $terminoID = null - e.g. 'dd73'
	* @param ?string $prefijo = null - e.g. 'dd'; ignored when terminoID is set
	*/
	function __construct( ?string $terminoID=null, ?string $prefijo=null ) {

		if( !empty($terminoID) ) {

			// with terminoID

			$this->set_terminoID($terminoID);
			$this->set_prefijo( get_tld_from_tipo($terminoID) );
			$this->set_tld( get_tld_from_tipo($terminoID) );

		}else if(!empty($prefijo) && strlen($prefijo)>=2) {

			$terminoID = null;
			$this->set_prefijo($prefijo);
			$this->set_tld($prefijo);

		}else{

			debug_log(__METHOD__
				." 'This record dd do not exists!  " . PHP_EOL
				.' terminoID: ' . to_string($terminoID) . PHP_EOL
				.' prefijo: ' . to_string($prefijo) . PHP_EOL
				.' backtrace: ' . to_string(debug_backtrace())
				, logger::ERROR
			);
		}

		// new RecordDataBoundObject
		parent::__construct($terminoID);
	}//end __construct



	// DEFINETABLENAME : define current table (tr for this obj)
	/**
	* DEFINETABLENAME
	* Returns the active jer_dd table name and keeps the static $table property
	* in sync. Called by RecordDataBoundObject::__construct() before any query.
	*
	* When $_ENV['DEDALO_RECOVERY_MODE'] is exactly true the table switches to
	* 'jer_dd_recovery', allowing read/write against the recovery snapshot without
	* any caller changes. Switching happens on every instantiation so a single
	* request can span both tables if the env flag changes mid-flight (rare, but
	* possible during maintenance scripts).
	* @return string - 'jer_dd' or 'jer_dd_recovery'
	*/
	protected function defineTableName() : string {

		// if in recovery mode, changes table name to jer_dd_recovery
		$DEDALO_RECOVERY_MODE = $_ENV['DEDALO_RECOVERY_MODE'] ?? false;
		if ($DEDALO_RECOVERY_MODE===true) {
			self::$table = 'jer_dd_recovery';
		}else{
			// restore table name
			self::$table = 'jer_dd';
		}

		return self::$table;
	}
	// DEFINEPRIMARYKEYNAME : define PrimaryKeyName (id)
	/**
	* DEFINEPRIMARYKEYNAME
	* Returns the name of the primary key column used by the ORM base class.
	* @return string - 'terminoID'
	*/
	protected function definePrimaryKeyName() : string {
		return 'terminoID';
	}
	// DEFINERELATIONMAP : array of pairs db field name, obj property name like fieldName => propertyName
	/**
	* DEFINERELATIONMAP
	* Declares the column-to-property mapping consumed by RecordDataBoundObject
	* for SELECT, INSERT, and UPDATE operations.
	*
	* Only columns listed here are automatically loaded and saved.
	* The legacy 'id' auto-increment column is intentionally excluded (commented out)
	* because terminoID already serves as the primary key for all ontology logic.
	* @return array - associative map ['db_column' => 'php_property', ...]
	*/
	protected function defineRelationMap() : array {
		return [
			# db field name		# property name
			//'id'			=> 'ID',
			'terminoID'		=> 'terminoID',
			'parent'		=> 'parent',
			'modelo'		=> 'modelo',
			'model'			=> 'model',
			'esmodelo'		=> 'esmodelo',
			'esdescriptor'	=> 'esdescriptor',
			'visible'		=> 'visible',
			'norden'		=> 'norden',
			'tld'			=> 'tld',
			'traducible'	=> 'traducible',
			'relaciones'	=> 'relaciones',
			'propiedades'	=> 'propiedades',
			'properties'	=> 'properties',
			'term'			=> 'term'
		];
	}//end defineRelationMap



	/**
	* HAS_COLUMN
	* Check if RecordObj_dd has column X
	* Useful in transitional updates like
	* on add column 'model'
	*
	* Inspects the defineRelationMap values (property names) rather than querying
	* the DB schema, so it reflects the application's expected column set, not the
	* live DDL. Use this before code that conditionally writes a column that may not
	* yet exist after a schema migration.
	* @param string $column - column/property name to look up, e.g. 'model'
	* @return bool - true when the column is present in the relation map
	*/
	public static function has_column( string $column ) : bool {
		$RecordObj_dd = new RecordObj_dd(null, 'dd');
		$relation_map = $RecordObj_dd->defineRelationMap();

		return in_array($column, $relation_map);
	}//end has_column



	/**
	* GET_PROPIEDADES
	* Return the value of property 'properties', stored as plain text in table column 'properties'
	* Values expected in 'propiedades' are always JSON. Yo can obtain raw value (default) or JSON decoded (called with argument 'true')
	*
	* This reads the legacy `propiedades` text column (via parent::get_propiedades()),
	* not the newer `properties` JSONB column — use get_properties() for the v7 column.
	* Returns null when the column is empty or not loaded.
	* @param bool $json_decode = false - when true, returns the decoded object; otherwise returns raw JSON string
	* @return mixed $propiedades - object when $json_decode is true, string when false, null when absent
	*/
	public function get_propiedades( bool $json_decode=false ) : mixed {

		$propiedades = parent::get_propiedades();
		if (is_null($propiedades)) {
			return null;
		}

		if ($json_decode===true) {
			return json_decode($propiedades);
		}

		return $propiedades;
	}//end get_properties



	/**
	* GET_PROPERTIES
	* Return the value of property 'properties', stored as JSONB in table column 'properties'
	* Values expected in 'properties' are always JSON.
	*
	* Reads the v7 `properties` JSONB column (via parent::get_properties()).
	* When the parent returns a plain string (older DB rows where JSONB is stored
	* as text), json_decode is applied automatically. Returns null on empty/false.
	* @return mixed $properties_parsed - stdClass on success, null when absent or falsy
	*/
	public function get_properties() : mixed {

		$properties = parent::get_properties();
		if (is_null($properties) || $properties===false) {
			return null;
		}

		$properties_parsed = is_string($properties)
			? json_decode($properties)
			: $properties;


		return $properties_parsed;
	}//end get_propiedades



	/**
	* UPDATE_COUNTER
	* Updates the counter for the given tld (ej. 'dd').
	*
	* Increments the `counter` column in `main_dd` for the supplied TLD.
	* Called by Save() immediately after a successful INSERT so that the next
	* call to get_counter_value() returns the correct next-available ID.
	* If $current_value is omitted, the current DB value is fetched first (one
	* extra query); callers that already hold the value should pass it to avoid
	* the round-trip.
	* @param string $tld - TLD prefix, e.g. 'dd', 'rsc'
	* @param int $current_value = null - Optional. If not received, it is calculated
	* @return int|false $counter_dato_updated - the new counter value, or false on DB error
	*/
	public static function update_counter( string $tld, ?int $current_value=null ) : int|false {

		if ($current_value===null) {
			$current_value = self::get_counter_value($tld);
		}
		$counter_dato_updated = intval($current_value+1) ;

		$strQuery 	= "UPDATE \"main_dd\" SET counter = $1 WHERE tld = $2";
		$result 	= pg_query_params(DBi::_getConnection(), $strQuery, array( $counter_dato_updated, $tld));
		if ($result===false) {
			debug_log(__METHOD__." Error on update_counter 'RecordObj_dd_edit'. Nothing is saved! ".to_string($strQuery), logger::ERROR);
			return false;
		}

		return $counter_dato_updated;
	}//end update_counter



	/**
	* GET_COUNTER_VALUE
	* Reads the current counter value from `main_dd` for the given TLD.
	*
	* The counter is the numeric suffix of the last minted terminoID for that TLD.
	* Returns 0 when the counter row does not exist yet (new TLD) or when the
	* column is empty — both legitimate states during initial installation.
	* pg_fetch_assoc() returning false can mean either a DB error OR an empty
	* result set; the distinction is logged as WARNING rather than ERROR.
	* @param string $tld - TLD prefix, e.g. 'dd'
	* @return int $counter_value - current counter (0 when absent or empty)
	*/
	public static function get_counter_value( string $tld ) : int {

		$strQuery	= "SELECT counter FROM main_dd WHERE tld = '$tld' LIMIT 1";
		$result		= JSON_RecordDataBoundObject::search_free($strQuery);
		$value		= pg_fetch_assoc($result);
		if ($value===false) {
			// false is not only error only. If the counter do not exists, false is returned too
			debug_log(__METHOD__." Warning on get counter. The counter no is available or does not exists yet. Returning zero as value. ".to_string($strQuery), logger::WARNING);
			return 0;
		}

		$counter_value = $value['counter'] ?? null;
		if (empty($counter_value)) {
			if(SHOW_DEBUG===true) {
				//debug_log(__METHOD__." Error on get_counter_value 'RecordObj_dd_edit'. counter for tld not found. ".to_string(), logger::WARNING);
			}
			return 0;
		}

		return (int)$counter_value;
	}//end get_counter_value



	/**
	* GET_TERM
	* Get jer_dd column 'term' and try to parse as JSON abject
	*
	* The `term` column is a JSONB multilingual label map, e.g.:
	*   {"en_US": "Input text", "es_ES": "Texto de entrada"}
	* Returns null when the column is empty or when json_handler::decode fails
	* (malformed JSON, migration leftover).
	* @return object|null - stdClass with lang-code keys, or null on empty/invalid JSON
	*/
	public function get_term() : ?object  {

		// JSON stringified object from column 'term'
		$term = parent::get_term();
		if (empty($term)) {
			return null;
		}

		$term_object = json_handler::decode($term);
		if (!$term_object) {
			return null;
		}

		return $term_object;
	}//end get_term



	/**
	* SET_TERM
	* Encodes given $term value as JSON stringified value and set to
	* parent term value as string
	*
	* Serialises the label map object to a JSON string before storing,
	* because the parent ORM stores all values as strings.
	* Passing null clears the term column (stores null via parent::set_term(null)).
	* @param object|null $term - multilingual label map, e.g. stdClass{"en_US":"...", "es_ES":"..."}
	* @return bool - always returns true
	*/
	public function set_term( ?object $term ) : bool  {

		$term_value = is_object($term)
			? json_encode($term)
			: null;

		// JSON stringified object from column 'term'
		parent::set_term($term_value);

		return true;
	}//end set_term



	/**
	* GET_DESCRIPTOR_DATO_BY_TIPO
	* Get 'term' value in given lang
	* Do not call this method directly, use 'get_termino_by_tipo' instead
	*
	* Private implementation backing get_termino_by_tipo(). Resolves the label string
	* for $terminoID in the requested language, with three-tier fallback when
	* $fallback===true:
	*   1. Exact $lang match in the term object.
	*   2. DEDALO_STRUCTURE_LANG (the master ontology authoring language).
	*   3. Any language present in the term object (first key wins).
	* Returns null for empty terminoID (valid during model-resolution of unassigned
	* related terms) and when the term column is absent or non-object.
	* @param string $terminoID - e.g. 'dd73'
	* @param ?string $lang = null - BCP-47 language code; falls back to DEDALO_DATA_LANG when null
	* @param bool $fallback = false - when true, attempts DEDALO_STRUCTURE_LANG then any-lang
	* @return string|null $dato - resolved label string, or null when not found
	*/
	private static function get_descriptor_dato_by_tipo( string $terminoID, ?string $lang=null, bool $fallback=false ) : ?string {

		// Verify : In cases such as, for example, when solving the model of a related term that has no model assigned to it, the terminoID will be empty.
		// This is not a mistake but we must avoid resolving it.
		if(empty($terminoID)) {
			return null;
		}

		// safe lang fallback
		$lang = $lang ?? DEDALO_DATA_LANG;

		// get the lang to be used to get the labels
		$lang = lang::get_label_lang( $lang );

		// term object
		$RecordObject_dd	= new RecordObj_dd($terminoID);
		$term				= $RecordObject_dd->get_term();

		// empty term case
		if (!is_object($term)) {
			return null;
		}

		// lang already exists case
		if (isset($term->{$lang})) {
			return $term->{$lang};
		}

		// fallback lang
		if ($fallback===true) {

			// main lang
			$descriptors_mainLang = DEDALO_STRUCTURE_LANG;
			if (isset($term->{$descriptors_mainLang})) {
				return $term->{$descriptors_mainLang};
			}

			// fallback to anything
			foreach ($term as $lang => $value) {
				return $value;
			}
		}


		return null;
	}//end get_descriptor_dato_by_tipo



	/**
	* GET_TERMINO_BY_TIPO
	* Static version
	*
	* Public façade over get_descriptor_dato_by_tipo() that adds a static
	* per-request cache keyed by terminoID + lang + fallback flag.
	* The cache key includes $fallback so callers can safely mix
	* fallback=true and fallback=false calls for the same term.
	* Pass $from_cache=false only when you suspect a stale cache entry
	* (e.g. immediately after writing a new term label).
	* @param string $terminoID - e.g. 'dd73'
	* @param ?string $lang = null - BCP-47 language code; null defaults to DEDALO_DATA_LANG inside the implementation
	* @param bool $from_cache = true - when false, skips the static cache read (write still happens)
	* @param bool $fallback = true - when true, falls back to structure lang then any lang
	* @return string|null $result - resolved label string, or null when not found
	*/
	public static function get_termino_by_tipo( string $terminoID, ?string $lang=null, bool $from_cache=true, bool $fallback=true ) : ?string {

		// cache
			static $termino_by_tipo_cache = [];
			$cache_uid = $terminoID . '_' . $lang . '_' . (int)$fallback;
			if ($from_cache===true && isset($termino_by_tipo_cache[$cache_uid])) {
				return $termino_by_tipo_cache[$cache_uid];
			}

		// descriptor search
			$result	= self::get_descriptor_dato_by_tipo(
				$terminoID,
				$lang,
				$fallback
			);

		// cache
			$termino_by_tipo_cache[$cache_uid] = $result;


		return $result;
	}//end get_termino_by_tipo



	/**
	* GET_MODELO_NAME
	* Calculates the current term model name
	*
	* Model resolution runs in the following priority order:
	* 1. Hard-coded overrides for specific terminoIDs whose Ontology data is
	*    not yet migrated to v7 (the switch block). These take precedence over
	*    everything.
	* 2. The v7 `model` column (get_model()): a direct model name string.
	* 3. The v5/v6 `modelo` column (get_modelo()): a terminoID whose term label
	*    is the model name (resolved via get_termino_by_tipo()).
	* 4. A special fallback for DEDALO_AREA_MAINTENANCE_TIPO when neither column
	*    is set — returns 'area_maintenance' and logs an ERROR to prompt migration.
	*
	* After resolution, the result is passed through a $model_map table that
	* renames obsolete model identifiers to their current equivalents
	* (e.g. 'component_input_text_large' → 'component_text_area').
	* @return string $model - model name string, or '' when none can be resolved
	*/
	public function get_modelo_name() : string {

		if (empty($this->terminoID)) {
			return '';
		}

		// forced models in v6 (while we are using structure v5)
			switch ($this->terminoID) {
				case DEDALO_SECURITY_ADMINISTRATOR_TIPO:
					return 'component_radio_button';
				case DEDALO_USER_PROFILE_TIPO:
					return 'component_select';
				case 'dd546': // activity where
					return 'component_input_text';
				case 'dd545': // activity what
					return 'component_select';
				case 'dd544': // activity ip
					return 'component_input_text';
				case 'dd551': // activity 'dato'
					return 'component_json';
				case 'hierarchy48': // hierarchy 'order'
					return 'component_number';
				case 'dd1067': // tools component_security_tools
					return 'component_check_box';
				// temporal 6.4.5
					case 'hierarchy45': // hierarchy main: General term
					case 'hierarchy59': // hierarchy main: General term model
					// case 'hierarchy49':
					// case 'ontology14';
						return 'component_portal';

			}

		// new model resolution with fallback
		$model = $this->get_model();
		if (empty($model)) {

			// fallback to old resolution
			$modelo_tipo = $this->get_modelo();
			if (empty($modelo_tipo)) {

				// new model area_maintenance (term dd88, model dd72) not updated Ontology cases
				if (!defined('DEDALO_AREA_MAINTENANCE_TIPO')) {
					define('DEDALO_AREA_MAINTENANCE_TIPO', 'dd88');
				}
				if ($this->terminoID===DEDALO_AREA_MAINTENANCE_TIPO) {
					debug_log(__METHOD__
						. " WARNING. Model dd72 'area_maintenance' is not defined! Update your Ontology ASAP " . PHP_EOL
						. ' Fixed resolution is returned to allow all works temporally' . PHP_EOL
						.' tipo: ' . $this->terminoID . PHP_EOL
						.' model expected: (dd72) area_maintenance'
						, logger::ERROR
					);
					return 'area_maintenance'; // temporal !
				}

				return '';
			}

			$model = RecordObj_dd::get_termino_by_tipo($modelo_tipo, DEDALO_STRUCTURE_LANG, true, false);

			// error log
			debug_log(__METHOD__
				. " Falling to fallback model resolution for the term" . PHP_EOL
				. ' terminoID: ' . to_string($this->terminoID) . PHP_EOL
				. ' model: ' . to_string($model)
				, logger::ERROR
			);

			// empty case check
			if (empty($model)) {

				debug_log(__METHOD__
					. " Empty model name !" . PHP_EOL
					. ' terminoID: ' . to_string($this->terminoID)
					, logger::ERROR
				);
				return '';
			}
		}//end if (empty($model))

		// Model replacements (obsolete models)
			$model_map = [
				'component_input_text_large'	=> 'component_text_area',
				'component_html_text'			=> 'component_text_area',
				'component_autocomplete'		=> 'component_portal',
				'component_autocomplete_hi'		=> 'component_portal',
				'component_state'				=> 'component_info',
				'component_calculation'			=> 'component_info',
				'section_group_div'				=> 'section_group',
				'tab'							=> 'section_tab',
				'component_relation_struct'		=> 'box elements',
				'component_security_tools'		=> 'component_check_box',
				'dataframe'						=> 'box elements',
			];


		return $model_map[$model] ?? $model;
	}//end get_modelo_name



	/**
	* GET_MODELO_NAME_BY_TIPO
	* Static version
	*
	* Convenience static wrapper that creates a RecordObj_dd for $tipo, calls
	* get_modelo_name(), and caches the result in a static array.
	* The cache is skipped when $from_cache=false, but the resolved name is
	* still stored on the first miss so subsequent calls with from_cache=true
	* benefit. Empty model names are NOT cached to allow resolution to retry
	* once the Ontology is updated.
	* @param string $tipo - terminoID to resolve, e.g. 'dd73'
	* @param bool $from_cache = true - when false, bypasses the static cache read
	* @return string $modelo_name - model name string, or '' when unresolvable
	*/
	public static function get_modelo_name_by_tipo( string $tipo, bool $from_cache=true ) : string {

		static $model_name_by_tipo;

		// cache
		$cache_uid = $tipo;
		if ($from_cache===true && isset($model_name_by_tipo[$cache_uid])) {
			return $model_name_by_tipo[$cache_uid];
		}

		$RecordObj_dd	= new RecordObj_dd($tipo);
		$modelo_name	= $RecordObj_dd->get_modelo_name();

		// cache
		if( !empty($modelo_name) ){
			$model_name_by_tipo[$cache_uid] = $modelo_name;
		}


		return $modelo_name;
	}//end get_modelo_name_by_tipo



	/**
	* GET_LEGACY_MODEL_NAME_BY_TIPO
	* Temporal function to manage transitional models
	*
	* Static wrapper around get_legacy_model_name(). Use during v5→v7 migration
	* checks where you need to read the old `modelo` terminoID and translate it
	* to a model name string without applying the v7 `model` column or the
	* hard-coded override table.
	* @param string $tipo - terminoID to inspect
	* @return string|null $model_name - legacy model name, or null when absent
	*/
	public static function get_legacy_model_name_by_tipo( string $tipo ) : ?string {

		$RecordObj_dd	= new RecordObj_dd($tipo);
		$model_name		= $RecordObj_dd->get_legacy_model_name();

		return $model_name;
	}//end get_legacy_model_name_by_tipo



	/**
	* GET_LEGACY_MODEL_NAME
	* Temporal function to manage transitional models
	*
	* Reads the legacy `modelo` column (a terminoID) and resolves it to its
	* label string using DEDALO_STRUCTURE_LANG without language fallback.
	* This bypasses the full get_modelo_name() priority chain and is therefore
	* useful for auditing which terms still rely on the old v5/v6 modelo field.
	* @return string|null $model_name - label of the modelo terminoID, or null when modelo is absent
	*/
	public function get_legacy_model_name() : ?string {

		$model_name = RecordObj_dd::get_termino_by_tipo(
			$this->get_modelo() ?? '',
			DEDALO_STRUCTURE_LANG,
			true,
			false
		);

		return $model_name;
	}//end get_legacy_model_name



	/**
	* GET LANG BY TIPO (STATIC)
	* Get given term lang based on if is translatable or not
	*
	* Returns the correct language constant to use when reading/writing data
	* for this component type:
	* - 'si' (translatable) → DEDALO_DATA_LANG (language-specific bucket)
	* - anything else       → DEDALO_DATA_NOLAN (language-neutral bucket)
	* This mirrors the logic applied by components when choosing a dato lang key.
	* @param string $tipo - terminoID of the component, e.g. 'rsc155'
	* @return string $lang - DEDALO_DATA_LANG or DEDALO_DATA_NOLAN constant value
	*/
	public static function get_lang_by_tipo( string $tipo ) : string {

		$RecordObj_dd	= new RecordObj_dd($tipo);
		$lang			= $RecordObj_dd->get_traducible()==='si' ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;

		return $lang;
	}//end get_lang_by_tipo



	/**
	* GET_MODEL_TERMINOID
	* Resolves term id searching jer_dd models
	* Only one term exist by model (models are unique)
	*
	* Searches jer_dd for a row with esmodelo='si', tld='dd', and a `term`
	* JSONB entry matching the given model name in DEDALO_STRUCTURE_LANG.
	* Returns the terminoID of that row, or null when the model is not found.
	* Used as the first step by get_ar_terminoID_by_modelo_name() to convert
	* a model name string to the modelo terminoID needed for the search filter.
	* @param string $model - model name string, e.g. 'component_input_text'
	* @return string|null $terminoID - terminoID of the model node, or null when not found
	*/
	public static function get_model_terminoID( string $model ) : ?string {

		// `where` clause of SQL query
		$sql_code = 'esmodelo = \'si\' AND tld = \'dd\' AND term @> \'{"'.DEDALO_STRUCTURE_LANG.'":"'.$model.'"}\'';

		$RecordObj_dd	= new RecordObj_dd(null, 'dd');
		$ar_result		= $RecordObj_dd->search(
			[
				'strPrimaryKeyName'	=> 'terminoID',
				'sql_code'			=> $sql_code,
				'sql_limit'			=> 1
			],
			RecordObj_dd::$table // jer_dd | jer_dd_recovery
		);
		$terminoID = $ar_result[0] ?? null;


		return $terminoID;
	}//end get_model_terminoID



	/**
	* GET_ALL_TLD_RECORDS
	* Get all jer_dd rows of specified tlds
	*
	* Fetches complete rows (all columns) for every terminoID whose tld is
	* in the supplied array. Each tld value is sanitised with safe_tld() before
	* inclusion in the WHERE clause; invalid tlds are skipped with an ERROR log.
	* Used by ontology-import and diffusion tools to bulk-read an entire TLD
	* in one query rather than row-by-row. Returns stdClass objects.
	* @param  array $ar_tl - array of TLD strings, e.g. ['dd', 'rsc']
	* @return array $result - array of stdClass rows from jer_dd, e.g.:
	* [
	* 	{
	* 	 "id": "15461858",
	*    "terminoID": "rsc1355",
	*    "parent": "rsc1341",
	*    "modelo": "dd592",
	*    "esmodelo": "no",
	*    "esdescriptor": "si",
	*    "visible": "si",
	*    "norden": "10",
	*    "tld": "rsc",
	* 	 ..
	* 	},
	* 	{}, ..
	* ]
	*/
	public static function get_all_tld_records( array $ar_tld ) : array {

		$sentences = [];
		foreach ($ar_tld as $current_tld) {

			$safe_tld = safe_tld($current_tld);
			if ( $safe_tld !== false ) {
				$sentences[] = '"tld"= \''. $safe_tld. '\'';
			}else{
				debug_log(__METHOD__
					. " Invalid tld, ignored:" . PHP_EOL
					. ' tld: ' . to_string( $current_tld )
					, logger::ERROR
				);
			}
		}

		// no tld valid items found
		if (empty($sentences)) {
			return [];
		}

		$filter = implode(' OR ', $sentences );

		// `where` clause of SQL query
		$sql_query		= 'SELECT * FROM "jer_dd" WHERE '. $filter ;
		$jer_dd_result	= pg_query(DBi::_getConnection(), $sql_query);

		// iterate jer_dd_result row
		$ontology_records = [];
		while($row = pg_fetch_object($jer_dd_result)) {
			$ontology_records[] = $row;
		}

		return $ontology_records;
	}//end get_all_tld_records



	/**
	* GET_AR_TERMINOID_BY_MODELO_NAME
	* Resolves all terms matching the given model
	*
	* Two-step resolution:
	* 1. Converts the model name string to a modelo terminoID via get_model_terminoID().
	* 2. Searches jer_dd for all rows whose `modelo` column equals that terminoID.
	* Results are cached statically by model name for the duration of the request.
	* @param string $modelo_name - model name string, e.g. 'component_input_text'
	* @return array $ar_result - array of terminoIDs using this model, or [] when model not found
	*/
	public static function get_ar_terminoID_by_modelo_name( string $modelo_name ) : array {

		// static cache
			static $ar_terminoID_by_modelo_name;
			$cache_uid = $modelo_name;
			if(isset($ar_terminoID_by_modelo_name[$cache_uid])) {
				return $ar_terminoID_by_modelo_name[$cache_uid];
			}

		$ar_result = [];

		// model to terminoID resolution
			$model_terminoID = RecordObj_dd::get_model_terminoID($modelo_name);
			if (empty($model_terminoID)) {
				return $ar_result;
			}

		// search terms with given model
			$RecordObj_dd	= new RecordObj_dd($model_terminoID);
			$ar_result		= $RecordObj_dd->search([
				'strPrimaryKeyName'	=> 'terminoID',
				'modelo'			=> $model_terminoID
			]);

		// static cache
		$ar_terminoID_by_modelo_name[$cache_uid] = $ar_result;


		return $ar_result;
	}//end get_ar_terminoID_by_modelo_name



	/**
	* GET_AR_ALL_MODELS
	* It is used in the edit thesaurus selector to assign model
	*
	* Returns all terminoIDs in the same TLD as `$this` where esmodelo='si'.
	* The result is an array of terminoID strings like ["dd3","dd1226","dd1259",..].
	* Not cached; callers should cache if called in a hot path.
	* @return array $ar_all_modelos - Array of all models term_id as ["dd3","dd1226","dd1259",..]
	*/
	public function get_ar_all_models() : array {

		// search
		$arguments = [
			'esmodelo' => 'si'
		];
		$RecordObj_dd	= new RecordObj_dd(NULL,$this->prefijo);
		$ar_all_modelos	= $RecordObj_dd->search($arguments);

		return $ar_all_modelos;
	}//end get_ar_all_models



	/**
	* GET_AR_ALL_TERMINOID_OF_MODELO_TIPO
	* Resolves all term id of given model tipo, like
	* dd6 => ["oh1","dd917",..]
	*
	* Searches jer_dd (tld='dd') for all rows whose `modelo` column exactly matches
	* $modelo_tipo. Bypasses the model-name-to-terminoID translation used by
	* get_ar_terminoID_by_modelo_name(); callers must supply the raw terminoID
	* of the model node, not its name string.
	* @param string $modelo_tipo - terminoID of the model node, e.g. 'dd6'
	* @param bool $use_cache = true - passed to RecordDataBoundObject::search() to control the ORM cache
	* @return array $ar_all_terminoID - Array of all term_id as ["oh1","dd917",..]
	*/
	public static function get_ar_all_terminoID_of_modelo_tipo( string $modelo_tipo, bool $use_cache=true ) : array {

		// search
		$arguments = [
			'modelo' => $modelo_tipo
		];
		$RecordObj_dd				= new RecordObj_dd(NULL,'dd');
		$RecordObj_dd->use_cache	= $use_cache;
		$ar_all_terminoID			= $RecordObj_dd->search($arguments);


		return $ar_all_terminoID;
	}//end get_ar_all_terminoID_of_modelo_tipo



	/**
	* GET_AR_CHILDREN_OF_THIS
	* Get array of terms (terminoID) with parent = $this->terminoID
	* Its mean that only direct children (first level) will be returned
	*
	* Searches jer_dd for all terms where parent = $this->terminoID.
	* $esdescriptor and $esmodelo filters accept 'si'|'no'; pass null to omit
	* the filter and include both descriptors and model nodes.
	* Results are cached in a function-static array keyed by terminoID+filters+order_by.
	* Pass $use_cache=false to force a fresh DB hit (needed after writes).
	* @param string|null $esdescriptor = 'si' - filter by esdescriptor column; null to skip filter
	* @param string|null $esmodelo = null - filter by esmodelo column; null to skip filter
	* @param string|null $order_by = 'norden' - column to ORDER BY ASC; null to omit ORDER BY
	* @param bool $use_cache = true - when false, bypasses the static cache and ORM cache
	* @return array $ar_children_of_this - array of terminoID strings, in requested order
	*/
	public function get_ar_children_of_this( ?string $esdescriptor='si', ?string $esmodelo=null, $order_by='norden', bool $use_cache=true ) : array {

		// check self terminoID
		if(empty($this->terminoID))	{
			return [];
		}

		// static cache
		static $ar_children_of_this_stat_data;
		$key = $this->terminoID.'_'.$esdescriptor.'_'.$esmodelo.'_'.$order_by;
		if($use_cache===true && isset($ar_children_of_this_stat_data[$key])) {
			return $ar_children_of_this_stat_data[$key];
		}

		// search

		// arguments
			$arguments = [];

			$arguments['strPrimaryKeyName']	= 'terminoID';
			$arguments['parent']			= $this->terminoID;

			$valid_values = ['si','no'];

			if ( !empty($esdescriptor) && in_array($esdescriptor, $valid_values) ) {
				$arguments['esdescriptor'] = $esdescriptor;
			}

			if ( !empty($esmodelo) && in_array($esmodelo, $valid_values) ) {
				$arguments['esmodelo'] = $esmodelo;
			}

			if ( !empty($order_by) ) {
				$arguments['order_by_asc'] = $order_by;
			}

		$this->use_cache = $use_cache;

		$ar_children_of_this = $this->search($arguments);

		// store cache data
		$ar_children_of_this_stat_data[$key] = $ar_children_of_this;


		return $ar_children_of_this;
	}//end get_ar_children_of_this



	/**
	* GET_AR_CHILDREN
	* Resolves all terms that have given tipo as parent
	* Not discriminates descriptors or models, result includes all children
	*
	* Static convenience wrapper over get_ar_children_of_this() without the
	* esdescriptor/esmodelo filters. Returns ALL child nodes (descriptors, models,
	* structural groupings). Results are statically cached per tipo+order_by.
	* @param string $tipo - parent terminoID whose direct children are sought
	* @param string $order_by = 'norden' - column to ORDER BY ASC; empty string to skip
	* @return array $ar_children - array of terminoID strings for direct children
	*/
	public static function get_ar_children( string $tipo, string $order_by='norden' ) : array {

		// static cache
		static $get_ar_children_data;
		$key = $tipo.'_'.$order_by;
		if(isset($get_ar_children_data[$key])) {
			return $get_ar_children_data[$key];
		}

		// search
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'terminoID';
		$arguments['parent']			= $tipo;

		if (!empty($order_by)) {
			$arguments['order_by_asc'] = $order_by;
		}

		$RecordObj_dd	= new RecordObj_dd($tipo);
		$ar_children	= $RecordObj_dd->search($arguments);

		// store cache data
		$get_ar_children_data[$key] = $ar_children;


		return $ar_children;
	}//end get_ar_children



	/**
	* GET_AR_RECURSIVE_CHILDREN_OF_THIS
	* Resolves all the children of the current term recursively.
	*
	* Instance method that walks the entire subtree rooted at $terminoID,
	* accumulating every descendant terminoID into $this->ar_recursive_children_of_this.
	* The instance property is used as a mutable accumulator across recursive calls,
	* so this method MUST NOT be cached (see the comment inside the method body).
	* On each recursive call is_recursion increments by 1; currently this parameter
	* is accepted but not used to gate behaviour — it is kept for future depth-limiting.
	*
	* (!) Do NOT cache the result of this method — component_filter_master depends
	* on a fresh traversal every time (see IMPORTANTE note in body).
	* @param string $terminoID - root of the subtree to walk
	* @param int $is_recursion = 0 - depth counter; 0 on initial call
	* @return array $this->ar_recursive_children_of_this - flat list of all descendant terminoIDs
	*/
	public function get_ar_recursive_children_of_this( string $terminoID, int $is_recursion=0 ) : array {

		# IMPORTANTE: NO HACER CACHE DE ESTE MÉTODO (AFECTA A COMPONENT_FILTER_MASTER)
		# (!) Do NOT cache this method — it affects component_filter_master.

		# Create an independent RecordObj_dd instance and resolve direct children
		$RecordObj_dd			= new RecordObj_dd($terminoID);
		$ar_children_of_this	= $RecordObj_dd->get_ar_children_of_this(
			null, // esdescriptor
			null, // esmodelo
			null // order_by
		);
		$ar_children_of_this_size = sizeof($ar_children_of_this);

		// iterate children
		for ($i=0; $i < $ar_children_of_this_size; $i++) {

			$children_terminoID = $ar_children_of_this[$i];

			// Add current element
			$this->ar_recursive_children_of_this[] = $children_terminoID;

			// Recursion
			$this->get_ar_recursive_children_of_this( $children_terminoID, 1 );
		}

		if(isset($this->ar_recursive_children_of_this)) {
			return $this->ar_recursive_children_of_this;
		}

		return [];
	}//end get_ar_recursive_children_of_this



	/**
	* get_ar_recursive_children
	* 	Static version of get_ar_recursive_children_of_this
	* 	No hay aumento de velocidad apreciable entre la versión estática y dinámica. Sólo una reducción de unos 140 KB en el consumo de memoria
	*
	* Static recursive descent that collects all descendants of $terminoID,
	* optionally filtering out entire subtrees whose root matches a model in
	* $ar_exclude_models. On the initial call ($is_recursion=false) the root
	* itself is NOT included; each child added by recursion DOES include itself
	* because is_recursion flips to true.
	*
	* Memory note (original Spanish): no measurable speed difference vs. the
	* instance method, but saves ~140 KB of memory per call by avoiding the
	* $ar_recursive_children_of_this accumulator property.
	* @param string $terminoID - root terminoID to descend from
	* @param bool $is_recursion = false - true on recursive calls; adds $terminoID to result
	* @param array|null $ar_exclude_models = null - model names whose subtrees should be pruned
	* @param string|null $order_by = null - ORDER BY column forwarded to get_ar_children_of_this()
	* @param bool $use_cache = true - forwarded to get_ar_children_of_this() and its sub-calls
	* @return array $ar_resolved - flat list of descendant terminoIDs
	*/
	public static function get_ar_recursive_children( string $terminoID, bool $is_recursion=false, ?array $ar_exclude_models=null, ?string $order_by=null, bool $use_cache=true ) : array {

		$ar_resolved=array();

		if($is_recursion===true) {
			$ar_resolved[] = $terminoID;
		}

		$RecordObj_dd	= new RecordObj_dd($terminoID);
		$ar_children	= $RecordObj_dd->get_ar_children_of_this(
			'si', // string esdescriptor
			null, // string esmodelo
			$order_by, // string order_by
			$use_cache
		);
		$ar_children_size = sizeof($ar_children);

		// foreach($ar_children as $current_terminoID) {
		for ($i=0; $i < $ar_children_size; $i++) {

			$current_terminoID = $ar_children[$i];

			// Exclude models optional
			if (!empty($ar_exclude_models)) {
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_terminoID, true);
				if (in_array($modelo_name, $ar_exclude_models)) {
					continue; // Skip current model and children
				}
			}

			// Recursion
			$ar_resolved = array_merge(
				$ar_resolved,
				RecordObj_dd::get_ar_recursive_children($current_terminoID, true, $ar_exclude_models, $order_by, $use_cache)
			);
		}


		return $ar_resolved;
	}//end get_ar_recursive_children



	/**
	* GET_AR_PARENTS_OF_THIS
	* Resolves the current term's parents recursively
	*
	* Walks up the hierarchy from $this->parent until reaching a term whose
	* parent is null, empty, or 'dd0' (the conceptual ontology root). The
	* loop also breaks if the parent equals the initial parent ($parent_inicial)
	* to prevent infinite loops from circular references in corrupted data.
	*
	* The 'dd0' prefix check uses strpos rather than strict equality so that any
	* terminoID containing 'dd0' (e.g. 'dd0123') is also excluded — this is a
	* guard against very old Ontology data where 'dd0' may appear with a suffix.
	*
	* When $ksort=true the result array is reverse-sorted by index (krsort),
	* producing ancestor order from outermost to innermost:
	*   ["4": "dd1", "3": "dd14", "2": "rsc1", "1": "rsc75", "0": "rsc76"]
	* @param bool $ksort = true - when true, sorts parents from root to immediate parent
	* @return array $ar_parents_of_this - assoc array sample: ["4": "dd1", "3": "dd14", "2": "rsc1", "1": "rsc75", "0": "rsc76"]
	*/
	public function get_ar_parents_of_this( bool $ksort=true ) : array {

		// static cache
		static $ar_parents_of_this_data;
		if(isset($this->terminoID) && isset($ar_parents_of_this_data[$this->terminoID])) {
			return $ar_parents_of_this_data[$this->terminoID];
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

			$RecordObj_dd	= new RecordObj_dd($parent);
			$parent			= $RecordObj_dd->get_parent();

		} while ( !empty($parent) && ($parent !== $parent_zero) && $parent !== $parent_inicial );

		// we reverse order the parents
		if($ksort===true) {
			krsort($ar_parents_of_this);
		}

		// store cache data
		$ar_parents_of_this_data[$this->terminoID] = $ar_parents_of_this;


		return $ar_parents_of_this;
	}//end get_ar_parents_of_this



	/**
	* GET_AR_SIBLINGS_OF_THIS
	* Resolves all siblings descriptors of current term
	* searching same parent that term parent
	*
	* Returns all descriptor terms (esdescriptor='si') that share the same
	* parent as $this. The current term is included in the result.
	* Statically cached per terminoID for the request lifetime.
	* @return array $ar_siblings_of_this - array of terminoID strings for sibling descriptors
	*/
	public function get_ar_siblings_of_this() : array {

		// static cache
		static $ar_siblings_of_this_data;
		if(isset($this->terminoID) && isset($ar_siblings_of_this_data[$this->terminoID])) {
			return $ar_siblings_of_this_data[$this->terminoID];
		}

		$arguments['strPrimaryKeyName']	= 'terminoID';
		$arguments['parent']			= $this->get_parent();
		$arguments['esdescriptor']		= 'si';
		$ar_siblings_of_this			= $this->search($arguments);

		// store cache data
		$ar_siblings_of_this_data[$this->terminoID] = $ar_siblings_of_this;


		return $ar_siblings_of_this;
	}//end get_ar_siblings_of_this



	/**
	* GET_RELACIONES
	* Get and parse stringified JSON from column `relaciones` as assoc array
	*
	* The `relaciones` column stores a JSON-encoded array of relation objects,
	* where each object has at least a `tipo` key pointing to a related terminoID.
	* Returns null when the column is empty. The assoc-array decode (second
	* argument true to json_handler::decode) preserves legacy formats where
	* relations were stored as keyed arrays rather than objects.
	* @return array|null $relaciones - assoc array sample: [{"tipo": "rsc170"},{"tipo": "rsc174"},{"tipo": "rsc23"}]
	*/
	public function get_relaciones() : ?array {

		$value = parent::get_relaciones();

		$relaciones = !empty($value)
			? json_handler::decode($value, true)
			: null;

		return $relaciones;
	}//end get_relaciones



	/**
	* GET_RELATIONS
	* Get 'relaciones' column value and parse it as flat array
	* for easy normalized access
	*
	* Normalises the raw get_relaciones() result to a flat array of stdClass
	* objects each guaranteed to have a `tipo` property. This handles two legacy
	* storage formats:
	* - Objects with an explicit `tipo` key: {"tipo": "rsc170"}
	* - Arrays/objects without `tipo`: the first value is used as the tipo.
	* Returns null when relaciones is empty or absent.
	* @see RecordObj_dd::tipo_to_json_item()
	* @return array|null $relations - flat array of stdClass objects with `tipo` property, or null
	*/
	public function get_relations() : ?array {

		$current_relations = $this->get_relaciones();
		if (!empty($current_relations)) {

			$relations = array_map(function($element){
				$element		= is_array($element) ? (object)$element : $element;
				$element_array	= get_object_vars($element);
				$current_obj = new stdClass();
					$current_obj->tipo = property_exists($element, 'tipo')
						? $element->tipo
						: reset($element_array);
				return $current_obj;
			}, $current_relations);
		}else{
			$relations = null;
		}

		return $relations;
	}//end get_relations



	/**
	* SET_RELACIONES
	* Set 'relaciones' as JSON (MODELO: $ar_relaciones[$terminoID_source][] = array($modelo => $terminoID_rel))
	* Set value s string JSON encoded array or null
	*
	* JSON-encodes $ar_relaciones before passing it to the parent ORM setter,
	* because the `relaciones` column is a plain text field. Pass null to clear
	* the relations column.
	* @param array|null $ar_relaciones - array of relation entries, or null to clear
	* @return bool - result from parent::set_relaciones()
	*/
	public function set_relaciones( ?array $ar_relaciones) : bool {

		return parent::set_relaciones( json_encode($ar_relaciones) );
	}//end set_relaciones



	/**
	* REMOVE_ELEMENT_FROM_AR_TERMINOS_RELACIONADOS
	* Removes a specific related term from the `relaciones` column of this term.
	*
	* Loads the current relaciones, filters out every entry whose value equals
	* $terminoID_to_unlink, then persists the reduced array. Note that the
	* iteration assumes the legacy nested array format produced by get_relaciones()
	* (an array of sub-arrays keyed by modeloID → terminoID), which may differ
	* from the normalized format returned by get_relations().
	* @param string $terminoID_to_unlink - the terminoID to remove from related terms
	* @return bool - always true (save errors are not surfaced here)
	*/
	public function remove_element_from_ar_terminos_relacionados( string $terminoID_to_unlink ) : bool {

		// We go through the elements in terms related to this object
		$ar_relaciones = $this->get_relaciones();

		// remove the received value from the array
		$ar_final = null;
		if(is_array($ar_relaciones)) foreach($ar_relaciones as $ar_values) {

			$ar_final = [];
			foreach($ar_values as $modeloID => $terminoID) {

				if($terminoID != $terminoID_to_unlink) {
					$ar_final[] = array($modeloID => $terminoID);
				}
			}
		}

		// we save the result
		$this->set_relaciones($ar_final);


		return true;
	}//end remove_element_from_ar_terminos_relacionados



	/**
	* GET_AR_TERMINOS_RELACIONADOS
	* @param string $terminoID
	* @param bool $cache = false
	* @param bool $simple = false
	* @return array $ar_relaciones
	* JSON_VERSION
	* In 'simple' mode it returns only an array of 'terminoID'.
	*
	* Fetches the raw relaciones for the given terminoID (no per-method cache;
	* caching is the caller's responsibility, as noted in the method body).
	* When $simple=true, flattens the nested array to a plain list of terminoID strings
	* by iterating the inner arrays and collecting each value, regardless of the key.
	* When $simple=false, returns the full raw array from get_relaciones().
	* @param string $terminoID - term whose relations should be fetched
	* @param bool $cache = false - parameter is accepted but currently unused (no caching in this method)
	* @param bool $simple = false - when true returns a flat array of terminoID strings only
	* @return array $ar_relaciones - relation entries or flat terminoID list, empty array when none
	*/
	public static function get_ar_terminos_relacionados( string $terminoID, bool $cache=false, bool $simple=false ) : array {

		// do not cache in this method !

		$RecordObj_dd	= new RecordObj_dd($terminoID);
		$ar_relaciones	= $RecordObj_dd->get_relaciones() ?? [];

		// simple. Only returns the clean array with the 'terminoID' listing
		if($simple===true) {

			$ar_terminos_relacionados = [];
			if(is_array($ar_relaciones)) foreach($ar_relaciones as $ar_value) {
				foreach($ar_value as $terminoID) {
					$ar_terminos_relacionados[]	= $terminoID;
				}
			}

			// overwrite
			$ar_relaciones = $ar_terminos_relacionados;
		}


		return $ar_relaciones;
	}//end get_ar_terminos_relacionados



	/**
	* GET_AR_TERMINOID_BY_MODELO_NAME_AND_RELATION
	* Returns the termID of the related term (specify relation) of given model name
	* e.g. to know the related terms of model 'filter'.
	*
	* Traverses the ontology graph in one of four ways depending on $relation_type:
	* - 'children':            direct children of $tipo, filtered by model name.
	* - 'children_recursive':  all descendants of $tipo (via get_ar_recursive_children_of_this),
	*                          filtered by model name.
	* - 'termino_relacionado': terms in the `relaciones` column of $tipo,
	*                          filtered by model name.
	* - 'parent':              all ancestor terms, filtered by model name.
	*
	* In each case, model matching is done by resolving the child/related term's
	* `modelo` terminoID to a model name string and comparing against $modelo_name.
	* $search_exact=true uses === equality; false uses strpos substring matching
	* (except the 'parent' case, which always uses === regardless of the flag —
	* this appears to be a bug in the original code, flagged below).
	*
	* Results are cached statically keyed by tipo+modelo_name+relation_type+search_exact.
	* @param string $tipo - root terminoID to traverse from, e.g. 'dd20'
	* @param string $modelo_name - model name to filter children/relatives by, e.g. 'component_input_text'
	* @param string $relation_type - traversal strategy: 'children'|'children_recursive'|'termino_relacionado'|'parent'
	* @param bool $search_exact = false - when true uses exact match; when false uses substring match (except 'parent' branch)
	* @return array $result - array of matching terminoID strings
	*/
	public static function get_ar_terminoID_by_modelo_name_and_relation( string $tipo, string $modelo_name, string $relation_type, bool $search_exact=false ) : array {

		$result	= array();

		// empty case
			if(empty($tipo)) {
				return $result;
			}

		// static cache
			static $ar_terminoID_by_modelo_name_and_relation_data;
			$uid = $tipo.'_'.$modelo_name.'_'.$relation_type.'_'.(int)$search_exact;
			if(isset($ar_terminoID_by_modelo_name_and_relation_data[$uid])) {
				return $ar_terminoID_by_modelo_name_and_relation_data[$uid];
			}

		switch($relation_type) {

			case 'children' :

				// we get the children
				$RecordObj_dd	= new RecordObj_dd($tipo);
				$ar_children	= $RecordObj_dd->get_ar_children_of_this();

				// we go through them to filter by model
				if(is_array($ar_children)) foreach($ar_children as $terminoID) {

					$RecordObj_dd	= new RecordObj_dd($terminoID);
					$modelo			= $RecordObj_dd->get_modelo();
					if(empty($modelo)) {
						debug_log(__METHOD__
							." Error processing relation children. Model is empty. Please define model for $terminoID" . PHP_EOL
							.' tipo: ' . $tipo . PHP_EOL
							.' terminoID: ' . $terminoID . PHP_EOL
							.' relation_type: ' . $relation_type . PHP_EOL
							.' terminoID: ' . $terminoID . PHP_EOL
							.' name: ' . RecordObj_dd::get_termino_by_tipo($terminoID) . PHP_EOL
							.' RecordObj_dd: ' . json_encode($RecordObj_dd)
							, logger::ERROR
						);
						return [];
					}

					$current_modelo_name = RecordObj_dd::get_termino_by_tipo($modelo);

					if($search_exact===true) {
						if ($current_modelo_name===$modelo_name) {
							$result[] = $terminoID;
						}
					}else{
						if(strpos($current_modelo_name, $modelo_name)!==false) {
							$result[] = $terminoID;
						}
					}
				}
				break;

			case 'children_recursive' :

				// We get the children recursively
				$RecordObj_dd	= new RecordObj_dd($tipo);
				$ar_children	= $RecordObj_dd->get_ar_recursive_children_of_this($tipo);

				// we go through them to filter by model
				if(is_array($ar_children)) foreach($ar_children as $terminoID) {

					$RecordObj_dd	= new RecordObj_dd($terminoID);
					$modelo			= $RecordObj_dd->get_modelo();
					if(empty($modelo)) {
						debug_log(__METHOD__
							." Error processing relation children_recursive. Model is empty. Please define model for $terminoID" . PHP_EOL
							.' tipo: ' . $tipo . PHP_EOL
							.' relation_type: ' . $relation_type . PHP_EOL
							.' terminoID: ' . $terminoID . PHP_EOL
							.' name: ' . RecordObj_dd::get_termino_by_tipo($terminoID)
							, logger::ERROR
						);
						return [];
					}

					$current_modelo_name = RecordObj_dd::get_termino_by_tipo($modelo);

					if($search_exact===true) {
						if ($current_modelo_name===$modelo_name) {
							$result[] = $terminoID;
						}
					}else{
						if(strpos($current_modelo_name, $modelo_name)!==false) {
							 $result[] = $terminoID;
						}
					}
				}
				break;

			case 'termino_relacionado' :

				// We get the related terms
				$RecordObj_dd				= new RecordObj_dd($tipo);
				$ar_terminos_relacionados	= $RecordObj_dd->get_ar_terminos_relacionados(
					$tipo,
					true, // bool cache
					true // bool simple
				);

				// we go through them to filter by model
				if(is_array($ar_terminos_relacionados)) foreach($ar_terminos_relacionados as $terminoID) {

					$RecordObj_dd	= new RecordObj_dd($terminoID);
					$modelo			= $RecordObj_dd->get_modelo();
					if(empty($modelo)) {
						debug_log(__METHOD__
							." Error processing relation termino_relacionado. Model is empty. Please define model for $terminoID" . PHP_EOL
							.' tipo: ' . $tipo . PHP_EOL
							.' relation_type: ' . $relation_type . PHP_EOL
							.' terminoID: ' . $terminoID . PHP_EOL
							.' name: ' . RecordObj_dd::get_termino_by_tipo($terminoID)
							, logger::ERROR
						);
						return [];
					}

					$current_modelo_name = RecordObj_dd::get_termino_by_tipo($modelo);

					if($search_exact===true) {
						if ($current_modelo_name===$modelo_name) {
							$result[] = $terminoID;
						}
					}else{
						if(strpos($current_modelo_name, $modelo_name)!==false) {
							 $result[] = $terminoID;
						}
					}
				}
				break;

			case 'parent' :

				// we get the parents
				$RecordObj_dd	= new RecordObj_dd($tipo);
				$ar_parents		= $RecordObj_dd->get_ar_parents_of_this();

				// we go through them to filter by model
				if(is_array($ar_parents)) foreach($ar_parents as $terminoID) {

					$RecordObj_dd	= new RecordObj_dd($terminoID);
					$modelo			= $RecordObj_dd->get_modelo();
					if(empty($modelo)) {
						debug_log(__METHOD__
							." Error processing relation parent. Model is empty. Please define model for $terminoID" . PHP_EOL
							.' tipo: ' . $tipo . PHP_EOL
							.' relation_type: ' . $relation_type . PHP_EOL
							.' terminoID: ' . $terminoID . PHP_EOL
							.' name: ' . RecordObj_dd::get_termino_by_tipo($terminoID)
							, logger::ERROR
						);
						return [];
					}

					$current_modelo_name = RecordObj_dd::get_termino_by_tipo($modelo);		#dump($modelo_name);

					if($search_exact===true) {
						if ($current_modelo_name===$modelo_name) {
							$result[] = $terminoID;
						}
					}else{
						if($current_modelo_name===$modelo_name) {
							 $result[] = $terminoID;
						}
					}
				}
				break;

			default :
				debug_log(__METHOD__
					." ERROR: relation_type [$relation_type] not defined! "
					.' tipo: ' . $tipo
					, logger::ERROR
				);
				return [];
				break;
		}

		// store cache data
			$ar_terminoID_by_modelo_name_and_relation_data[$uid] = $result;


		return $result;
	}//end get_ar_terminoID_by_modelo_name_and_relation



	/**
	* GET_TRANSLATABLE
	* Get current term translatable as boolean value
	* based on column 'traducible' value
	*
	* Converts the raw 'si'/'no' string from the `traducible` column to a PHP bool.
	* @param string $tipo - terminoID of the term to check
	* @return bool - true when the term's component is language-sensitive ('si')
	*/
	public static function get_translatable( string $tipo ) : bool {

		$RecordObj_dd	= new RecordObj_dd($tipo);
		$translatable	= $RecordObj_dd->get_traducible();

		return ($translatable==='si');
	}//end get_translatable



	/**
	* IS_MODEL
	* Alias of get_esmodelo but responses boolean for convenience
	*
	* Returns true when the `esmodelo` column is 'si', indicating that this
	* term is itself a component/model definition node rather than a data descriptor.
	* @return bool - true when this term is a model definition
	*/
	public function is_model() : bool {

		$esmodelo = $this->get_esmodelo();

		return ($esmodelo==='si');
	}//end is_model



	/**
	* GET_ORDER
	* Alias of get_norden
	*
	* Casts the `norden` string column to int for numeric comparison.
	* Note: the @return annotation in the original code says bool — the actual
	* return type is int (flagged below).
	* @return int - the norden value as an integer, or 0 when empty
	*/
	public function get_order() : int {

		$order = (int)$this->get_norden();

		return $order;
	}//end get_order



	/**
	* GET_COLOR
	* Get the color defined in properties
	* if it's not defined return default gray
	* It is used to set custom styles to component_section_id in some sections
	*
	* Reads the `color` key from the `properties` JSONB column. When absent,
	* returns '#b9b9b9' as the default fallback color. Used by UI rendering to
	* apply per-section-type accent colors to component_section_id headers.
	* @param string $section_tipo - terminoID of the section type, e.g. 'oh1'
	* @return string $color - hex color string like '#b9b9b9'
	*/
	public static function get_color( string $section_tipo ) : string {

		$RecordObj_dd	= new RecordObj_dd($section_tipo);
		$properties		= $RecordObj_dd->get_properties();

		$color = isset($properties->color)
			? $properties->color
			: '#b9b9b9'; // default gray

		return $color;
	}//end get_color



	/**
	* GET_ACTIVE_TLDS
	* Get from jer_dd table all active/installed tlds.
	* Used to check if the tipo has a valid definition in the ontology.
	* If the tipo is not installed is not possible to resolve it
	* The callers will decide if is necessary remove the tipo from definition, as remove from sqo, show error, or ...
	*
	* Groups jer_dd by tld and returns the distinct tld strings.
	* Cached in a static variable for the duration of the request; result persists
	* for the lifetime of the PHP worker when running under persistent-worker modes
	* such as RoadRunner or FrankenPHP.
	* @return array $active_tlds - flat array of tld strings, e.g. ['dd','rsc','oh']
	*/
	public static function get_active_tlds() : array {

		// Cache
		static $active_tlds_cache;
		if(isset($active_tlds_cache)){
			return $active_tlds_cache;
		}

		$table		= RecordObj_dd::$table; // jer_dd | jer_dd_backup
		$strQuery	= "SELECT tld FROM \"$table\" GROUP BY tld";
		$result		= pg_query(DBi::_getConnection(), $strQuery);

		$active_tlds = [];
		while($row = pg_fetch_assoc($result)) {
			$active_tlds[] = $row['tld'];
		}

		$active_tlds_cache = $active_tlds;


		return $active_tlds;
	}//end get_active_tlds



	/**
	* GET_ROW_DATA
	* Find the given tipo in jer_dd and return the row if exists.
	*
	* Uses a prepared statement (keyed by __METHOD__) to avoid re-planning
	* the query on repeated calls within the same connection. The statement is
	* registered in DBi::$prepared_statements on first use. Input is sanitised
	* with safe_tipo() before binding.
	* Returns null when no row is found (not an error — callers use null to mean
	* "tipo does not exist in the ontology").
	* @param string $tipo - terminoID to look up (e.g. 'dd73')
	* @return object|null $row - stdClass with all jer_dd columns, or null when not found
	*/
	public static function get_row_data( string $tipo ) : ?object {

		//remove any other things than tld and section_id in the tipo string
		$safe_tipo = safe_tipo($tipo);

		$table		= RecordObj_dd::$table; // jer_dd | jer_dd_backup
		$strQuery	= "SELECT * FROM \"$table\" WHERE \"terminoID\" = $1 LIMIT 1";

		// Direct
		// $result = pg_query_params(DBi::_getConnection(), $strQuery, [$safe_tipo]);

		// With prepared statement
		$stmt_name = __METHOD__;
		if (!isset(DBi::$prepared_statements[$stmt_name])) {
			pg_prepare(
				DBi::_getConnection(),
				$stmt_name,
				$strQuery
			);
			// Set the statement as existing.
			DBi::$prepared_statements[$stmt_name] = true;
		}
		$result = pg_execute(
			DBi::_getConnection(),
			$stmt_name,
			[$safe_tipo]
		);

		$row_data = null;
		while($row = pg_fetch_object($result)) {
			$row_data = $row;
		}

		return $row_data;
	}//end get_row_data



	/**
	* CHECK_ACTIVE_TLD
	* Checks if the tipo tld is available and installed in the Ontology looking for the jer_dd
	*
	* Extracts the tld prefix from $tipo via get_tld_from_tipo() and checks whether
	* it appears in the get_active_tlds() result. The special value 'section_id'
	* bypasses the check and always returns true — it is used as a virtual field
	* in SQO filters and has no corresponding jer_dd row.
	* @param string $tipo - terminoID to check, e.g. 'rsc155'
	* @return bool - true when the tipo's TLD is installed in jer_dd
	*/
	public static function check_active_tld( string $tipo ) : bool {

		// allow 'section_id' as valid tipo for SQO uses
		if ($tipo==='section_id') {
			return true;
		}

		$active_tlds = RecordObj_dd::get_active_tlds();
		$current_tld = get_tld_from_tipo($tipo);

		return in_array($current_tld, $active_tlds);
	}//end check_active_tld



	/**
	* CHECK_TIPO_IS_VALID
	* Checks if given tipo is usable trying to resolve model from tipo
	* If model is empty, the tipo is not available because jer_dd is
	* damaged or the TLD is not installed.
	* It is also used to validate old data pointing to a non active TLD.
	*
	* Two-gate validation:
	* 1. safe_tipo() rejects malformed tipo strings (SQL-injection guard, format check).
	* 2. get_modelo_name_by_tipo() rejects tipos with no corresponding jer_dd row
	*    or whose model cannot be resolved (empty model = orphaned or uninstalled term).
	* Returns false for either gate failure; true only when both pass.
	* @param string $tipo - component or section tipo to validate, e.g. 'rsc155'
	* @return bool - true when tipo is well-formed and resolvable in the ontology
	*/
	public static function check_tipo_is_valid( string $tipo ) : bool {

		// check tipo is safe. Exclude bad formed tipos
		if (!safe_tipo($tipo)) {
			return false;
		}

		// try to resolve model. If empty, the tipo do not exists in jer_dd
		$model = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		if (empty($model)) {
			return false;
		}

		return true;
	}//end check_tipo_is_valid



	/**
	* SAVE
	* PASADA A RecordObj_dd (Pública. Esta carpeta es privada de momento 28-08-2016)
	* (Moved to RecordObj_dd. Public. This folder was private as of 2016-08-28.)
	*
	* Handles both INSERT (new term) and UPDATE (existing term):
	* - UPDATE path: when $this->terminoID is set and prefijo is valid, delegates
	*   directly to parent::Save().
	* - INSERT path: when terminoID is absent, mints a new terminoID from
	*   prefijo + (counter + 1), calls parent::Save() to write the row, then
	*   increments the counter in `main_dd` via update_counter().
	*
	* (!) Counter increment happens AFTER the successful INSERT. If the INSERT
	* succeeds but update_counter() fails, the counter will be out of sync and
	* the next Save() will attempt to reuse the same terminoID. Monitor for
	* ERROR log entries from update_counter().
	* @return string|false $terminoID - the terminoID string on success, false on validation or DB error
	*/
	public function Save() : string|false {

		if(!verify_dedalo_prefix_tipos($this->prefijo)) {
			if(SHOW_DEBUG===true) {
				trigger_error("Error on save 'RecordObj_dd'. Prefijo is empty or wrong. Nothing is saved!");
			}
			return false;
		}

		#
		# EDIT
		# TERMINO ID EXISTS : UPDATE RECORD
		if (!empty($this->terminoID) && verify_dedalo_prefix_tipos($this->prefijo)) {
			if(SHOW_DEBUG===true) {
				// debug_log(__METHOD__." Saving with parent save ".$this->terminoID, logger::DEBUG);
			}
			return parent::Save();
		}

		#
		# INSERT
		# TERMINO ID NOT CREATED : BUILD NEW AND INSERT
		# Build terminoID from prefix and current counter value
		$counter_dato   = self::get_counter_value($this->prefijo);
		$terminoID		= (string)$this->prefijo . (int)($counter_dato+1);
			#dump($terminoID," terminoID - prefijo:$this->prefijo");die();

		# Fix terminoID : Important!
		$this->set_terminoID($terminoID);

		# Set defaults
		$this->set_tld( (string)$this->prefijo );
		if(empty($this->norden)) $this->set_norden( (int)1 );


		if (!empty($this->terminoID)) {

			$result = parent::Save();

			if ($result) {
				$counter_dato_updated  = self::update_counter($this->prefijo, $counter_dato);
			}
		}

		return (string)$terminoID;
	}//end Save



	/**
	* INSERT
	* Create a row into jer_dd with ontology data
	* The insert will search if tipo exists previously,
	* if the tipo was found, delete it and insert as new one
	* else insert new one
	*
	* Used by the ontology import tool to replace an existing term row atomically:
	* DELETE + INSERT rather than UPDATE, so all columns are replaced cleanly.
	* The DELETE step uses a raw pg_query for safety; if it fails, a trigger_error
	* is raised and the method returns false without proceeding to the INSERT.
	* After deletion (or when no existing row is found), force_insert_on_save=true
	* bypasses the UPDATE branch in RecordDataBoundObject::Save() so the parent
	* always performs an INSERT.
	* @return string|false|null $tipo - terminoID on success, false on DELETE failure, null when parent::Save() returns null
	*/
	public function insert() : string|false|null {

		$row_data = self::get_row_data($this->terminoID);

		//remove any other things than tld and section_id in the tipo string
		$safe_tipo = safe_tipo($this->terminoID);

		if( !empty($row_data) ){

			$table		= RecordObj_dd::$table; // jer_dd | jer_dd_backup
			$strQuery	= "DELETE FROM \"$table\" WHERE \"terminoID\" = '$safe_tipo'";
			$result		= pg_query(DBi::_getConnection(), $strQuery);

			if($result===false) {
				if(SHOW_DEBUG===true) {
					$msg = __METHOD__." Failed Delete record (RDBO) from terminoID: $safe_tipo";
				}else{
					$msg = "Failed Delete record (RDBO). Record $safe_tipo is not deleted. Please contact with your admin" ;
				}
				trigger_error($msg);
				debug_log(__METHOD__
					. ' ' . $msg .PHP_EOL
					. 'strQuery: ' . to_string($strQuery)
					, logger::ERROR
				);

				return false;
			}
		}

		// force to insert in the Save process of his parent.
		$this->force_insert_on_save = true;

		$this->set_terminoID( $this->terminoID );

		// insert, the Save return the tipo (terminoID)
		$new_terminoID = parent::Save();

		return $new_terminoID;
	}//end insert



	/**
	* UPDATE
	* Thin wrapper over parent::Save() for the explicit update case.
	*
	* Exists to provide a semantic complement to insert() with a clear name.
	* Only call when $this->terminoID is already set; the parent's Save() will
	* branch to UPDATE because terminoID is set and force_insert_on_save is false.
	* @return string|false - terminoID string on success, false on DB error
	*/
	public function update() : string|false {

		return parent::Save();
	}//end update



	/**
	* GET_LAST_SECTION_ID_FROM_TLD
	* Find the tipo(terminioID) in jer_dd and choose the last id
	*
	* Scans all terminoIDs for the current tld, extracts the numeric section_id
	* portion from each via get_section_id_from_tipo(), and returns the maximum
	* value found. Returns 0 when the TLD has no rows or when the result set is
	* empty (new installation). Used to determine the next available section_id
	* when the counter in `main_dd` has not been initialised.
	* @return int - the highest numeric section_id found, or 0 when the TLD has no rows
	*/
	public function get_last_section_id_from_tld() : int {

		//remove any other things than tld in the tld string
		$safe_tld	= safe_tld($this->tld);

		// Find last id of current section
			$table	= RecordObj_dd::$table; // jer_dd | jer_dd_backup
			$sql	= 'SELECT "terminoID" FROM "'.$table.'" WHERE tld = \''.$safe_tld.'\'';
			$result	= JSON_RecordObj_matrix::search_free($sql);
			$value	= ($result === false)
				? null // Skip empty tables
				: ((pg_num_rows($result)===0)
					? null // Skip empty tables
					: true );

			// pg_fetch_result($result, 0, 'terminoID'))
			$max_section_id = 0;
			if( $value === true ){

				$ar_section_id = [];
				while($row = pg_fetch_assoc($result)) {
					$string_id = get_section_id_from_tipo( $row['terminoID'] );

					$ar_section_id[] = $string_id === false
						? 0
						: (int)$string_id;
				}
				$max_section_id = max( $ar_section_id );
			}

		return $max_section_id;
	}//end get_last_section_id_from_tld



	/**
	* DELETE_TLD_NODES
	* Removes all tld nodes (records) in jer_dd
	*
	* Deletes every row in jer_dd (or jer_dd_recovery) whose `tld` matches the
	* supplied value. The tld is sanitised with safe_tld() and an exact-match check
	* is performed before executing the DELETE to prevent accidental wildcard deletions.
	* Called during ontology regeneration and TLD uninstall workflows.
	* @param string $tld - TLD prefix to delete, e.g. 'rsc'
	* @return bool - true on success, false when the tld fails safe_tld() validation or the DELETE fails
	*/
	public static function delete_tld_nodes( string $tld ) : bool {

		$table = RecordObj_dd::$table; // jer_dd | jer_dd_backup

		// remove any other things than tld in the tld string
		$safe_tld = safe_tld($tld);
		if ($safe_tld!==$tld) {
			debug_log(__METHOD__
				. " Error deleting tld from table jer_dd. tld is not safe" . PHP_EOL
				. ' tld: ' . to_string($tld) . PHP_EOL
				. ' safe_tld: ' . to_string($safe_tld)
				, logger::ERROR
			);
			return false;
		}

		// jer_dd. delete terms (records)
		$sql_query = '
			DELETE FROM "'.$table.'" WHERE "tld" = \''.$safe_tld.'\';
		';
		$delete_result = pg_query(DBi::_getConnection(), $sql_query);
		if (!$delete_result) {
			debug_log(__METHOD__
				. " Error deleting tld from table jer_dd" . PHP_EOL
				. ' tld: ' . to_string($tld)
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end delete_tld_nodes



	/**
	* CREATE_BK_TABLE
	* Backup table is a copy of the given tlds
	* Used to ensure that the jer_dd can be restore in process as regenerate it.
	*
	* Drops `jer_dd_bk` (if it exists) and re-creates it as a SELECT copy of
	* the rows in `jer_dd` matching the supplied TLDs. This is a partial snapshot
	* of jer_dd — only the requested TLDs are captured, not the full table.
	* Used before an ontology regeneration so that restore_from_bk_table() can
	* roll back if regeneration fails.
	*
	* (!) This is NOT a full backup of jer_dd. Calling delete_bk_table() or a
	* second create_bk_table() will overwrite any previous snapshot.
	* @param array $tld - array of TLD strings to snapshot, e.g. ['dd', 'rsc']
	* @return bool - true on success, false when the CREATE TABLE query fails
	*/
	public static function create_bk_table( array $tld ) : bool {

		$where = implode('\' OR tld = \'', $tld);

		$strQuery = '
			DROP TABLE IF EXISTS "jer_dd_bk" CASCADE;
			CREATE TABLE IF NOT EXISTS jer_dd_bk AS
			SELECT * FROM jer_dd WHERE tld = \''.$where.'\';
		';

		$result = pg_query(DBi::_getConnection(), $strQuery);

		if($result===false) {
			debug_log(__METHOD__
				. ' Failed consolidate_table jer_dd' .PHP_EOL
				. 'strQuery: ' . to_string($strQuery)
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end create_bk_table



	/**
	* DELETE_BK_TABLE
	* Remove the backup table of jer_dd with clone rows
	*
	* Drops the `jer_dd_bk` table entirely (CASCADE). Called after a successful
	* ontology regeneration to clean up the temporary snapshot, or explicitly
	* during housekeeping. Safe to call when the table does not exist.
	* @return bool - true on success, false when the DROP TABLE query fails
	*/
	public static function delete_bk_table() : bool {

		$strQuery = '
			DROP TABLE IF EXISTS "jer_dd_bk" CASCADE;
		';

		$result = pg_query(DBi::_getConnection(), $strQuery);

		if($result===false) {
			debug_log(__METHOD__
				. ' Failed delete_bk_table jer_dd_bk' .PHP_EOL
				. 'strQuery: ' . to_string($strQuery)
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end delete_bk_table



	/**
	* RESTORE_FROM_BK_TABLE
	* Delete the given tlds from `jer_dd` table
	* Use `jer_dd_bk` table to insert his rows into `jer_dd`
	* Note: `jer_dd_bk` is not a full backup of `jer_dd`, it's a selection tlds
	* Do not use as full backup!
	*
	* Rolls back a failed ontology regeneration by:
	* 1. Deleting the current jer_dd rows for each TLD via delete_tld_nodes().
	* 2. Re-inserting the matching rows from `jer_dd_bk` in a single INSERT … SELECT.
	* The WHERE clause mirrors the one used in create_bk_table() so only the
	* originally snapshotted TLDs are restored.
	*
	* (!) Do NOT use this as a general restore mechanism — jer_dd_bk only contains
	* the TLDs captured by create_bk_table(); all other TLDs remain untouched.
	* @param array $tld - array of TLD strings to restore, e.g. ['dd', 'rsc']
	* @return bool - true on success, false when the INSERT query fails
	*/
	public static function restore_from_bk_table( array $tld ) : bool {

		// delete the original nodes in jer_dd
		foreach ($tld as $current_tld) {
			RecordObj_dd::delete_tld_nodes( $current_tld );
		}

		// restore all tld into jer_dd_bk
		$where = implode('\' OR tld = \'', $tld);

		$strQuery = '
			INSERT INTO jer_dd
			SELECT * FROM "jer_dd_bk" WHERE tld = \''.$where.'\';
		';

		$result = pg_query(DBi::_getConnection(), $strQuery);

		if($result===false) {
			debug_log(__METHOD__
				. ' Failed restore_from_bk_table jer_dd_bk' .PHP_EOL
				. 'strQuery: ' . to_string($strQuery)
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end restore_from_bk_table



	/**
	* TIPO_TO_JSON_ITEM
	* This is a normalized Ontology JSON item.
	* Basically, is a jerd_dd record, but with parsed JSON values and translated property names.
	* Fills requested ontology item data resolving tipo
	*
	* Builds a stdClass with only the requested $options properties, avoiding
	* the column-name inconsistencies of the raw jer_dd row (e.g. 'traducible' → 'translatable',
	* 'modelo' → 'model', etc.). This is the standard serialisation format used by
	* the Ontology JSON API and the section_map resolver.
	*
	* The instance is created with use_cache=false and get_dato() is called explicitly
	* to ensure the ORM loads a fresh row even if a cached instance exists — this is
	* critical for ontology-import workflows that write and then immediately read the
	* same terminoID.
	*
	* The 'label' property resolves the current application UI language with fallback
	* to DEDALO_STRUCTURE_LANG and then to any available lang. The 'model' property
	* calls get_modelo_name() (full resolution with aliases) rather than reading the
	* raw column.
	*
	* Unknown $options values fall through to a dynamic `get_{property}()` call on
	* the RecordObj_dd instance, so any mapped column can be requested by its
	* getter name.
	*
	* Default options (when $options is empty):
	*   tipo, tld, is_model, model, model_tipo, parent, order, translatable,
	*   propiedades, properties, relations, term
	* @param string $tipo - terminoID to describe, e.g. 'dd73'
	* @param array $options = [] - list of property names to include in the output object
	* @return object $item - stdClass with requested properties populated from the jer_dd row
	*/
	public static function tipo_to_json_item( string $tipo, array $options=[] ) : object {

		// default options fallback
		if (empty($options)) {
			$options = [
				'tipo',
				'tld',
				'is_model',
				'model',
				'model_tipo',
				'parent',
				'order',
				'translatable',
				'propiedades',
				'properties',
				'relations',
				'term',
				// 'label'
			];
		}

		$RecordObj_dd = new RecordObj_dd($tipo);
		$RecordObj_dd->use_cache = false; // (!) prevents using previous db results
		$RecordObj_dd->get_dato();

		$item = new stdClass();

		foreach ($options as $property) {
			switch ($property) {
				case 'tipo':
					$item->{$property} = $tipo;
					break;
				case 'model':
					// $item->{$property} = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
					$item->{$property} = $RecordObj_dd->get_modelo_name();
					break;
				case 'model_tipo':
					$item->{$property} = $RecordObj_dd->get_modelo();
					break;
				case 'translatable':
					$item->{$property} = $RecordObj_dd->get_traducible()==='si';
					break;
				case 'propiedades':
					$item->{$property} = $RecordObj_dd->get_propiedades(true);
					break;
				case 'label':
					$term = $RecordObj_dd->get_term() ?? new stdClass();

					// get the lang to be used to get the labels
					$lang = lang::get_label_lang( DEDALO_APPLICATION_LANG );

					$label = $term->{$lang} ?? $term->{DEDALO_STRUCTURE_LANG} ?? null;
					if (is_null($label)) {
						// fallback to anything
						foreach ($term as $value) {
							$label = $value;
							break;
						}
					}
					$item->{$property} = $label;
					break;
				default:
					$item->{$property} = $RecordObj_dd->{'get_'.$property}();
			}
		}


		return $item;
	}//end tipo_to_json_item



}//end class RecordObj_dd
