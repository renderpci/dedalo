<?php declare(strict_types=1);
/**
* ontology_node
*
*/
class ontology_node extends ontology_record {



	// fields
	public $tipo;
	protected $parent;
	protected $term;
	protected $modelo;
	protected $model;
	protected $is_model;
	protected $order_number;
	protected $tld;
	protected $is_translatable;
	protected $relations;
	protected $propiedades;
	protected $properties; // Deprecated used only for compatibility of v5 and v6


	// fields external
	protected $filtroTerminos ;

	// optional specific loads
	protected $ar_recursive_children_of_this = [];

	// default table. Can be changed on the fly base on DEDALO_RECOVERY_MODE
	public static $table = 'jer_dd';



	// array of ontology_node instances
	private static $instances = [];



	/**
	* GET_INSTANCE
	* @param ?string $tipo = null
	* @param ?string $tld = null
	* @return self
	*/
	public static function get_instance( ?string $tipo = null, ?string $tld = null ): self {

		$key = md5(serialize([$tipo, $tld]));

		if (!isset(self::$instances[$key])) {
			self::$instances[$key] = new self($tipo, $tld);
		}

		return self::$instances[$key];
	}//end get_instance



	/**
	* __CONSTRUCT
	*/
	function __construct( ?string $tipo=null, ?string $tld=null ) {

		if( !empty($tipo) ) {

			// with tipo

			$this->set_tipo($tipo);
			$this->set_tld( get_tld_from_tipo($tipo) );

		}else if(!empty($tld) && strlen($tld)>=2) {

			$tipo = null;
			$this->set_tld($tld);

		}else{

			debug_log(__METHOD__
				." 'This record dd do not exists!  " . PHP_EOL
				.' tipo: ' . to_string($tipo) . PHP_EOL
				.' tld: ' . to_string($tld) . PHP_EOL
				.' backtrace: ' . to_string(debug_backtrace())
				, logger::ERROR
			);
		}

		// new ontology_record
		parent::__construct($tipo);
	}//end __construct



	/**
	* HAS_COLUMN
	* Check if ontology_node has column X
	* Useful in transitional updates like
	* on add column 'model'
	* @return bool
	*/
	public static function has_column( string $column ) : bool {
		$ontology_node = new ontology_node(null, 'dd');
		$relation_map = $ontology_node->defineRelationMap();

		return in_array($column, $relation_map);
	}//end has_column



	/**
	* GET_PROPIEDADES
	* Return the value of property 'properties', stored as plain text in table column 'properties'
	* Values expected in 'propiedades' are always JSON. Yo can obtain raw value (default) or JSON decoded (called with argument 'true')
	* @param bool $json_decode = false
	* @return mixed $propiedades
	* 	object / string parent::$properties
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
	* @return mixed $properties_parsed
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
	* GET_RELATIONS
	* Return the value of property 'relations', stored as JSONB in table column 'relations'
	* Values expected in 'relations' are always JSON.
	* @return mixed $properties_parsed
	*/
	public function get_relations() : mixed {

		$relations = parent::get_relations();
		if (is_null($relations) || $relations===false) {
			return null;
		}

		$relations_parsed = is_string($relations)
			? json_decode($relations)
			: $relations;


		return $relations_parsed;
	}//end get_propiedades



	/**
	* GET_PROPERTIES
	* Return the value of property 'properties', stored as JSONB in table column 'properties'
	* Values expected in 'properties' are always JSON.
	* @return mixed $properties_parsed
	*/
	public function get_is_translatable() : bool {

		$is_translatable = parent::get_is_translatable();
		if (is_null($is_translatable) || $is_translatable===false) {
			return false;
		}

		$is_translatable_parsed = is_string($is_translatable)
			? ($is_translatable === 't' || $is_translatable === '1')
			: $is_translatable;


		return $is_translatable_parsed;
	}//end get_propiedades



	/**
	* UPDATE_COUNTER
	* Updates the counter for the given tld (ej. 'dd').
	* @param string $tld
	* @param int $current_value = null
	* 	Optional. If not received, it is calculated
	* @return int|false $counter_dato_updated
	*/
	public static function update_counter( string $tld, ?int $current_value=null ) : int|false {

		if ($current_value===null) {
			$current_value = self::get_counter_value($tld);
		}
		$counter_dato_updated = intval($current_value+1) ;

		$strQuery 	= "UPDATE \"main_dd\" SET counter = $1 WHERE tld = $2";
		$result 	= pg_query_params(DBi::_getConnection(), $strQuery, array( $counter_dato_updated, $tld));
		if ($result===false) {
			debug_log(__METHOD__." Error on update_counter 'ontology_node_edit'. Nothing is saved! ".to_string($strQuery), logger::ERROR);
			return false;
		}

		return $counter_dato_updated;
	}//end update_counter



	/**
	* GET_COUNTER_VALUE
	* @param string $tld
	* @return int $counter_value
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
				//debug_log(__METHOD__." Error on get_counter_value 'ontology_node_edit'. counter for tld not found. ".to_string(), logger::WARNING);
			}
			return 0;
		}

		return (int)$counter_value;
	}//end get_counter_value



	/**
	* GET_TERM
	* Get jer_dd column 'term' and try to parse as JSON abject
	* @return object|null
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
	* @param object|null $term
	* @return object|null
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
	* @param string $tipo
	* @param string $lang = null
	* @param bool $fallback = false
	* @return string|null $dato
	*/
	private static function get_descriptor_dato_by_tipo( string $tipo, ?string $lang=null, bool $fallback=false ) : ?string {

		// Verify : In cases such as, for example, when solving the model of a related term that has no model assigned to it, the tipo will be empty.
		// This is not a mistake but we must avoid resolving it.
		if(empty($tipo)) {
			return null;
		}

		// safe lang fallback
		$lang = $lang ?? DEDALO_DATA_LANG;

		// get the lang to be used to get the labels
		$lang = lang::get_label_lang( $lang );

		// term object
		$ontology_node	= new ontology_node($tipo);
		$term			= $ontology_node->get_term();

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
	* @param string $tipo
	* @param string $lang = null
	* @param bool $from_cache = true
	* @param bool $fallback = true
	* @return string|null $result
	*/
	public static function get_termino_by_tipo( string $tipo, ?string $lang=null, bool $from_cache=true, bool $fallback=true ) : ?string {

		// cache
			static $termino_by_tipo_cache = [];
			$cache_uid = $tipo . '_' . $lang . '_' . (int)$fallback;
			if ($from_cache===true && isset($termino_by_tipo_cache[$cache_uid])) {
				return $termino_by_tipo_cache[$cache_uid];
			}

		// descriptor search
			$result	= self::get_descriptor_dato_by_tipo(
				$tipo,
				$lang,
				$fallback
			);

		// cache
			$termino_by_tipo_cache[$cache_uid] = $result;


		return $result;
	}//end get_termino_by_tipo



	/**
	* GET_MODEL_NAME
	* Calculates the current term model name
	* @return string $model
	*/
	public function get_model_name() : string {

		if (empty($this->tipo)) {
			return '';
		}

		// forced models in v6 (while we are using structure v5)
			switch ($this->tipo) {
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
			$model_tipo = $this->get_model_tipo();
			if (empty($model_tipo)) {

				// new model area_maintenance (term dd88, model dd72) not updated Ontology cases
				if (!defined('DEDALO_AREA_MAINTENANCE_TIPO')) {
					define('DEDALO_AREA_MAINTENANCE_TIPO', 'dd88');
				}
				if ($this->tipo===DEDALO_AREA_MAINTENANCE_TIPO) {
					debug_log(__METHOD__
						. " WARNING. Model dd72 'area_maintenance' is not defined! Update your Ontology ASAP " . PHP_EOL
						. ' Fixed resolution is returned to allow all works temporally' . PHP_EOL
						.' tipo: ' . $this->tipo . PHP_EOL
						.' model expected: (dd72) area_maintenance'
						, logger::ERROR
					);
					return 'area_maintenance'; // temporal !
				}

				return '';
			}

			$model = ontology_node::get_termino_by_tipo($model_tipo, DEDALO_STRUCTURE_LANG, true, false);

			// error log
			debug_log(__METHOD__
				. " Falling to fallback model resolution for the term" . PHP_EOL
				. ' tipo: ' . to_string($this->tipo) . PHP_EOL
				. ' model: ' . to_string($model)
				, logger::ERROR
			);

			// empty case check
			if (empty($model)) {

				debug_log(__METHOD__
					. " Empty model name !" . PHP_EOL
					. ' tipo: ' . to_string($this->tipo)
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
	}//end get_model_name



	/**
	* GET_MODEL_NAME_BY_TIPO
	* Static version
	* @param string $tipo
	* @param bool $from_cache = true
	* @return string $modelo_name
	*/
	public static function get_model_name_by_tipo( string $tipo, bool $from_cache=true ) : string {

		static $modelo_name_by_tipo;

		// cache
		$cache_uid = $tipo;
		if ($from_cache===true && isset($modelo_name_by_tipo[$cache_uid])) {
			return $modelo_name_by_tipo[$cache_uid];
		}

		$ontology_node	= new ontology_node($tipo);
		$modelo_name	= $ontology_node->get_model_name();

		// cache
		if( !empty($modelo_name) ){
			$modelo_name_by_tipo[$cache_uid] = $modelo_name;
		}


		return $modelo_name;
	}//end get_model_name_by_tipo



	/**
	* GET_LEGACY_MODEL_NAME_BY_TIPO
	* Temporal function to manage transitional models
	* @param string $tipo
	* @return string|null $model_name
	*/
	public static function get_legacy_model_name_by_tipo( string $tipo ) : ?string {

		$ontology_node	= new ontology_node( $tipo );
		$model_name		= $ontology_node->get_legacy_model_name();

		return $model_name;
	}//end get_legacy_model_name_by_tipo



	/**
	* GET_LEGACY_MODEL_NAME
	* Temporal function to manage transitional models
	* @return string|null $model_name
	*/
	public function get_legacy_model_name() : ?string {

		$model_name = ontology_node::get_termino_by_tipo(
			$this->get_model_tipo() ?? '',
			DEDALO_STRUCTURE_LANG,
			true,
			false
		);

		return $model_name;
	}//end get_legacy_model_name



	/**
	* GET LANG BY TIPO (STATIC)
	* Get given term lang based on if is translatable or not
	* @param string $tipo
	* @return string $lang
	*/
	public static function get_lang_by_tipo( string $tipo ) : string {

		$ontology_node	= new ontology_node($tipo);
		$lang			= $ontology_node->get_is_translatable()===true ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;

		return $lang;
	}//end get_lang_by_tipo



	/**
	* GET_TIPO_FORM_MODEL_NAME
	* Resolves tipo searching node model names
	* Only one node exist by model name (models are unique)
	* @param string $model
	* @return string|null $tipo
	*/
	public static function get_tipo_form_model_name( string $model ) : ?string {

		// `where` clause of SQL query
		$sql_code = 'is_model = true AND tld = \'dd\' AND term @> \'{"'.DEDALO_STRUCTURE_LANG.'":"'.$model.'"}\'';

		$ontology_node	= new ontology_node(null, 'dd');
		$ar_result		= $ontology_node->search(
			[
				'strPrimaryKeyName'	=> 'tipo',
				'sql_code'			=> $sql_code,
				'sql_limit'			=> 1
			],
			ontology_node::$table // jer_dd | jer_dd_recovery
		);
		$tipo = $ar_result[0] ?? null;


		return $tipo;
	}//end get_tipo_form_model_name



	/**
	* GET_ALL_TLD_RECORDS
	* Get all jer_dd rows of specified tlds
	* @param  array $ar_tl
	* @return array $result
	* [
	* 	{
	* 	 "id": "15461858",
	*    "tipo": "rsc1355",
	*    "parent": "rsc1341",
	*    "modelo": "dd592",
	*    "is_model": false,
	*    "order_number": "10",
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
	* GET_AR_TIPO_BY_MODEL_NAME
	* Resolves all terms matching the given model
	* @param string $model_name
	* @return array $ar_result
	*/
	public static function get_ar_tipo_by_model_name( string $model_name ) : array {

		// static cache
			static $ar_tipo_by_model_name;
			$cache_uid = $model_name;
			if(isset($ar_tipo_by_model_name[$cache_uid])) {
				return $ar_tipo_by_model_name[$cache_uid];
			}

		$ar_result = [];

		// model to tipo resolution
			$model_tipo = ontology_node::get_tipo_form_model_name($model_name);
			if (empty($model_tipo)) {
				return $ar_result;
			}

		// search terms with given model
			$ontology_node	= new ontology_node($model_tipo);
			$ar_result		= $ontology_node->search([
				'strPrimaryKeyName'	=> 'tipo',
				'model_tipo'		=> $model_tipo
			]);

		// static cache
		$ar_tipo_by_model_name[$cache_uid] = $ar_result;


		return $ar_result;
	}//end get_ar_tipo_by_model_name



	/**
	* GET_AR_ALL_MODELS
	* It is used in the edit thesaurus selector to assign model
	* @return array $all_models
	* 	Array of all models term_id as ["dd3","dd1226","dd1259",..]
	*/
	public function get_ar_all_models() : array {

		// search
		$arguments = [
			'is_model' => true
		];
		$ontology_node	= new ontology_node(NULL,$this->tld);
		$all_models	= $ontology_node->search($arguments);

		return $all_models;
	}//end get_ar_all_models



	/**
	* GET_AR_ALL_tipo_OF_MODELO_TIPO
	* Resolves all term id of given model tipo, like
	* dd6 => ["oh1","dd917",..]
	* @param string $modelo_tipo
	* @param bool $use_cache = true
	* @return array $ar_all_tipo
	* 	Array of all term_id as ["oh1","dd917",..]
	*/
	public static function get_ar_all_tipo_of_modelo_tipo( string $model_tipo, bool $use_cache=true ) : array {

		// search
		$arguments = [
			'model_tipo' => $model_tipo
		];
		$ontology_node				= new ontology_node(NULL,'dd');
		$ontology_node->use_cache	= $use_cache;
		$ar_all_tipo			= $ontology_node->search($arguments);


		return $ar_all_tipo;
	}//end model_tipo



	/**
	* GET_AR_CHILDREN_OF_THIS
	* Get array of terms (tipo) with parent = $this->tipo
	* Its mean that only direct children (first level) will be returned
	* @param string|null $is_model = null
	* @param string|null $order_by = 'order_number'
	* @param bool $use_cache = true
	* @return array $ar_children_of_this
	*/
	public function get_ar_children_of_this( ?string $is_model=null, $order_by='order_number', bool $use_cache=true ) : array {

		// check self tipo
		if(empty($this->tipo))	{
			return [];
		}

		// static cache
		static $ar_children_of_this_stat_data;
		$key = $this->tipo.'_'.$is_model.'_'.$order_by;
		if($use_cache===true && isset($ar_children_of_this_stat_data[$key])) {
			return $ar_children_of_this_stat_data[$key];
		}

		// search

		// arguments
			$arguments = [];

			$arguments['strPrimaryKeyName']	= 'tipo';
			$arguments['parent']			= $this->tipo;

			$valid_values = [true,false];

			if ( !empty($is_model) && in_array($is_model, $valid_values) ) {
				$arguments['is_model'] = $is_model;
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
	* @param string $tipo
	* @param string $order_by = 'order_number'
	* @return array $ar_children
	*/
	public static function get_ar_children( string $tipo, string $order_by='order_number' ) : array {

		// static cache
		static $get_ar_children_data;
		$key = $tipo.'_'.$order_by;
		if(isset($get_ar_children_data[$key])) {
			return $get_ar_children_data[$key];
		}

		// search
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'tipo';
		$arguments['parent']			= $tipo;

		if (!empty($order_by)) {
			$arguments['order_by_asc'] = $order_by;
		}

		$ontology_node	= new ontology_node($tipo);
		$ar_children	= $ontology_node->search($arguments);

		// store cache data
		$get_ar_children_data[$key] = $ar_children;


		return $ar_children;
	}//end get_ar_children



	/**
	* GET_AR_RECURSIVE_CHILDREN_OF_THIS
	* Resolves all the children of the current term recursively.
	* @param string $tipo
	* @param int $is_recursion = 0
	* @return array $this->ar_recursive_children_of_this
	*/
	public function get_ar_recursive_children_of_this( string $tipo, int $is_recursion=0 ) : array {

		# IMPORTANTE: NO HACER CACHE DE ESTE MÉTODO (AFECTA A COMPONENT_FILTER_MASTER)

		# Creamos una instancia independiente de ontology_node y resolvemos los hijos directos
		$ontology_node			= new ontology_node($tipo);
		$ar_children_of_this	= $ontology_node->get_ar_children_of_this(
			null, // is_model
			null // order_by
		);
		$ar_children_of_this_size = sizeof($ar_children_of_this);

		// iterate children
		for ($i=0; $i < $ar_children_of_this_size; $i++) {

			$children_tipo = $ar_children_of_this[$i];

			// Add current element
			$this->ar_recursive_children_of_this[] = $children_tipo;

			// Recursion
			$this->get_ar_recursive_children_of_this( $children_tipo, 1 );
		}

		if(isset($this->ar_recursive_children_of_this)) {
			return $this->ar_recursive_children_of_this;
		}

		return [];
	}//end get_ar_recursive_children_of_this



	/**
	* get_ar_recursive_children
	*  	Static version of get_ar_recursive_children_of_this
	* 	No hay aumento de velocidad apreciable entre la versión estática y dinámica. Sólo una reducción de unos 140 KB en el consumo de memoria
	* @param string $tipo
	* @param bool $is_recursion = false
	* @param array|null $ar_exclude_models = null
	* @param string|null $order_by = null
	* @param bool $use_cache = true
	* @return array $ar_resolved
	*/
	public static function get_ar_recursive_children( string $tipo, bool $is_recursion=false, ?array $ar_exclude_models=null, ?string $order_by=null, bool $use_cache=true ) : array {

		$ar_resolved=array();

		if($is_recursion===true) {
			$ar_resolved[] = $tipo;
		}

		$ontology_node	= new ontology_node($tipo);
		$ar_children	= $ontology_node->get_ar_children_of_this(
			null, // bool is_model
			$order_by, // string order_by
			$use_cache
		);
		$ar_children_size = sizeof($ar_children);

		// foreach($ar_children as $current_tipo) {
		for ($i=0; $i < $ar_children_size; $i++) {

			$current_tipo = $ar_children[$i];

			// Exclude models optional
			if (!empty($ar_exclude_models)) {
				$modelo_name = ontology_node::get_model_name_by_tipo($current_tipo, true);
				if (in_array($modelo_name, $ar_exclude_models)) {
					continue; // Skip current model and children
				}
			}

			// Recursion
			$ar_resolved = array_merge(
				$ar_resolved,
				ontology_node::get_ar_recursive_children($current_tipo, true, $ar_exclude_models, $order_by, $use_cache)
			);
		}


		return $ar_resolved;
	}//end get_ar_recursive_children



	/**
	* GET_AR_PARENTS_OF_THIS
	* Resolves the current term's parents recursively
	* @param bool $ksort = true
	* @return array $ar_parents_of_this
	* 	Assoc array sample: ["4": "dd1", "3": "dd14", "2": "rsc1", "1": "rsc75", "0": "rsc76"]
	*/
	public function get_ar_parents_of_this( bool $ksort=true ) : array {

		// static cache
		static $ar_parents_of_this_data;
		if(isset($this->tipo) && isset($ar_parents_of_this_data[$this->tipo])) {
			return $ar_parents_of_this_data[$this->tipo];
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

			$ontology_node	= new ontology_node($parent);
			$parent			= $ontology_node->get_parent();

		} while ( !empty($parent) && ($parent !== $parent_zero) && $parent !== $parent_inicial );

		// we reverse order the parents
		if($ksort===true) {
			krsort($ar_parents_of_this);
		}

		// store cache data
		$ar_parents_of_this_data[$this->tipo] = $ar_parents_of_this;


		return $ar_parents_of_this;
	}//end get_ar_parents_of_this



	/**
	* GET_AR_SIBLINGS_OF_THIS
	* Resolves all siblings descriptors of current term
	* searching same parent that term parent
	* @return array $ar_siblings_of_this
	*/
	public function get_ar_siblings_of_this() : array {

		// static cache
		static $ar_siblings_of_this_data;
		if(isset($this->tipo) && isset($ar_siblings_of_this_data[$this->tipo])) {
			return $ar_siblings_of_this_data[$this->tipo];
		}

		$arguments['strPrimaryKeyName']	= 'tipo';
		$arguments['parent']			= $this->get_parent();
		$ar_siblings_of_this			= $this->search($arguments);

		// store cache data
		$ar_siblings_of_this_data[$this->tipo] = $ar_siblings_of_this;


		return $ar_siblings_of_this;
	}//end get_ar_siblings_of_this



	/**
	* SET_RELAtions
	* Set 'relations' as JSON (MODELO: $ar_relations[$tipo_source][] = array($modelo => $tipo_rel))
	* Set value s string JSON encoded array or null
	* @param array|null $ar_relations
	* 	Could be array, string, null
	* @return bool
	*/
	public function set_relations( ?array $ar_relations) : bool {

		return parent::set_relations( json_encode($ar_relations) );
	}//end set_relations



	/**
	* REMOVE_ELEMENT_FROM_AR_TERMINOS_RELACIONADOS
	* @param string $tipo_to_unlink
	* @return bool
	*/
	public function remove_element_from_ar_terminos_relacionados( string $tipo_to_unlink ) : bool {

		// We go through the elements in terms related to this object
		$ar_relations = $this->get_relations();

		// remove the received value from the array
		$ar_final = null;
		if(is_array($ar_relations)) foreach($ar_relations as $ar_values) {

			$ar_final = [];
			foreach($ar_values as $modeloID => $tipo) {

				if($tipo != $tipo_to_unlink) {
					$ar_final[] = array($modeloID => $tipo);
				}
			}
		}

		// we save the result
		$this->set_relations($ar_final);


		return true;
	}//end remove_element_from_ar_terminos_relacionados



	/**
	* GET_AR_TERMINOS_RELACIONADOS
	* @param string $tipo
	* @param bool $cache = false
	* @param bool $simple = false
	* @return array $ar_relations
	* JSON_VERSION
	* In 'simple' mode it returns only an array of 'tipo'.
	*/
	public static function get_ar_terminos_relacionados( string $tipo, bool $cache=false, bool $simple=false ) : array {

		// do not cache in this method !

		$ontology_node	= new ontology_node($tipo);
		$ar_relations	= $ontology_node->get_relations() ?? [];

		// simple. Only returns the clean array with the 'tipo' listing
		if($simple===true) {

			$ar_terminos_relacionados = [];
			if(is_array($ar_relations)) foreach($ar_relations as $ar_value) {
				foreach($ar_value as $tipo) {
					$ar_terminos_relacionados[]	= $tipo;
				}
			}

			// overwrite
			$ar_relations = $ar_terminos_relacionados;
		}


		return $ar_relations;
	}//end get_ar_terminos_relacionados



	/**
	* GET_AR_TIPO_BY_MODEL_NAME_AND_RELATION
	* Returns the termID of the related term (specify relation) of given model name
	* e.g. to know the related terms of model 'filter'.
	* @param string $tipo like 'dd20'
	* @param string $model_name like 'component_input_text'
	* @param string $relation_type like 'termino_relacionado'
	* @param bool $search_exact = false
	* @return array $result
	*/
	public static function get_ar_tipo_by_model_name_and_relation( string $tipo, string $model_name, string $relation_type, bool $search_exact=false ) : array {

		$result	= array();

		// empty case
			if(empty($tipo)) {
				return $result;
			}

		// static cache
			static $ar_tipo_by_model_name_and_relation_data;
			$uid = $tipo.'_'.$model_name.'_'.$relation_type.'_'.(int)$search_exact;
			if(isset($ar_tipo_by_model_name_and_relation_data[$uid])) {
				return $ar_tipo_by_model_name_and_relation_data[$uid];
			}

		switch($relation_type) {

			case 'children' :

				// we get the children
				$ontology_node	= new ontology_node($tipo);
				$ar_children	= $ontology_node->get_ar_children_of_this();

				// we go through them to filter by model
				if(is_array($ar_children)) foreach($ar_children as $tipo) {

					$ontology_node	= new ontology_node($tipo);
					$model			= $ontology_node->get_model_tipo();
					if(empty($model)) {
						debug_log(__METHOD__
							." Error processing relation children. Model is empty. Please define model for $tipo" . PHP_EOL
							.' tipo: ' . $tipo . PHP_EOL
							.' tipo: ' . $tipo . PHP_EOL
							.' relation_type: ' . $relation_type . PHP_EOL
							.' tipo: ' . $tipo . PHP_EOL
							.' name: ' . ontology_node::get_termino_by_tipo($tipo) . PHP_EOL
							.' ontology_node: ' . json_encode($ontology_node)
							, logger::ERROR
						);
						return [];
					}

					$current_model_name = ontology_node::get_termino_by_tipo($model);

					if($search_exact===true) {
						if ($current_model_name===$model_name) {
							$result[] = $tipo;
						}
					}else{
						if(strpos($current_model_name, $model_name)!==false) {
							$result[] = $tipo;
						}
					}
				}
				break;

			case 'children_recursive' :

				// We get the children recursively
				$ontology_node	= new ontology_node($tipo);
				$ar_children	= $ontology_node->get_ar_recursive_children_of_this($tipo);

				// we go through them to filter by model
				if(is_array($ar_children)) foreach($ar_children as $tipo) {

					$ontology_node	= new ontology_node($tipo);
					$model_tipo		= $ontology_node->get_model_tipo();
					if(empty($model_tipo)) {
						debug_log(__METHOD__
							." Error processing relation children_recursive. Model is empty. Please define model for $tipo" . PHP_EOL
							.' tipo: ' . $tipo . PHP_EOL
							.' relation_type: ' . $relation_type . PHP_EOL
							.' tipo: ' . $tipo . PHP_EOL
							.' name: ' . ontology_node::get_termino_by_tipo($tipo)
							, logger::ERROR
						);
						return [];
					}

					$current_model_name = ontology_node::get_termino_by_tipo($model_tipo);

					if($search_exact===true) {
						if ($current_model_name===$model_name) {
							$result[] = $tipo;
						}
					}else{
						if(strpos($current_model_name, $model_name)!==false) {
							 $result[] = $tipo;
						}
					}
				}
				break;

			case 'termino_relacionado' :

				// We get the related terms
				$ontology_node				= new ontology_node($tipo);
				$ar_terminos_relacionados	= $ontology_node->get_ar_terminos_relacionados(
					$tipo,
					true, // bool cache
					true // bool simple
				);

				// we go through them to filter by model
				if(is_array($ar_terminos_relacionados)) foreach($ar_terminos_relacionados as $tipo) {

					$ontology_node	= new ontology_node($tipo);
					$model_tipo		= $ontology_node->get_model_tipo();
					if(empty($model_tipo)) {
						debug_log(__METHOD__
							." Error processing relation termino_relacionado. Model is empty. Please define model for $tipo" . PHP_EOL
							.' tipo: ' . $tipo . PHP_EOL
							.' relation_type: ' . $relation_type . PHP_EOL
							.' tipo: ' . $tipo . PHP_EOL
							.' name: ' . ontology_node::get_termino_by_tipo($tipo)
							, logger::ERROR
						);
						return [];
					}

					$current_model_name = ontology_node::get_termino_by_tipo($model_tipo);

					if($search_exact===true) {
						if ($current_model_name===$model_name) {
							$result[] = $tipo;
						}
					}else{
						if(strpos($current_model_name, $model_name)!==false) {
							 $result[] = $tipo;
						}
					}
				}
				break;

			case 'parent' :

				// we get the parents
				$ontology_node	= new ontology_node($tipo);
				$ar_parents		= $ontology_node->get_ar_parents_of_this();

				// we go through them to filter by model
				if(is_array($ar_parents)) foreach($ar_parents as $tipo) {

					$ontology_node	= new ontology_node($tipo);
					$model_tipo		= $ontology_node->get_model_tipo();
					if(empty($model_tipo)) {
						debug_log(__METHOD__
							." Error processing relation parent. Model is empty. Please define model for $tipo" . PHP_EOL
							.' tipo: ' . $tipo . PHP_EOL
							.' relation_type: ' . $relation_type . PHP_EOL
							.' tipo: ' . $tipo . PHP_EOL
							.' name: ' . ontology_node::get_termino_by_tipo($tipo)
							, logger::ERROR
						);
						return [];
					}

					$current_model_name = ontology_node::get_termino_by_tipo($model_tipo);		#dump($model_name);

					if($search_exact===true) {
						if ($current_model_name===$model_name) {
							$result[] = $tipo;
						}
					}else{
						if($current_model_name===$model_name) {
							 $result[] = $tipo;
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
			$ar_tipo_by_modelo_name_and_relation_data[$uid] = $result;


		return $result;
	}//end get_ar_tipo_by_model_name_and_relation



	/**
	* GET_TRANSLATABLE
	* Get current term translatable as boolean value
	* based on column 'translatable' value
	* @param string $tipo
	* @return bool
	*/
	public static function get_translatable( string $tipo ) : bool {

		$ontology_node	= new ontology_node($tipo);
		$translatable	= $ontology_node->get_is_translatable();

		return $translatable;
	}//end get_translatable



	/**
	* IS_MODEL
	* Alias of get_is_model but responses boolean for convenience
	* @return bool
	*/
	public function is_model() : bool {

		$is_model = $this->get_is_model();

		return $is_model;
	}//end is_model



	/**
	* GET_ORDER
	* Alias of get_order_number
	* @return bool
	*/
	public function get_order() : int {

		$order = (int)$this->get_order_number();

		return $order;
	}//end get_order



	/**
	* GET_COLOR
	* Get the color defined in properties
	* if it's not defined return default gray
	* It is used to set custom styles to component_section_id in some sections
	* @param string $section_tiop
	* @return string $color
	* 	like '#b9b9b9'
	*/
	public static function get_color( string $section_tipo ) : string {

		$ontology_node	= new ontology_node($section_tipo);
		$properties		= $ontology_node->get_properties();

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
	* @return array $active_tlds
	*/
	public static function get_active_tlds() : array {

		// Cache
		static $active_tlds_cache;
		if(isset($active_tlds_cache)){
			return $active_tlds_cache;
		}

		$table		= ontology_node::$table; // jer_dd | jer_dd_backup
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
	* @param string $tipo (tipo)
	* @return object|null $row
	*/
	public static function get_row_data( string $tipo ) : ?object {

		//remove any other things than tld and section_id in the tipo string
		$safe_tipo = safe_tipo($tipo);

		$table		= ontology_node::$table; // jer_dd | jer_dd_backup
		$strQuery	= "SELECT * FROM \"$table\" WHERE \"tipo\" = $1 LIMIT 1";

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
	* @param string $tipo
	* @return bool
	*/
	public static function check_active_tld( string $tipo ) : bool {

		// allow 'section_id' as valid tipo for SQO uses
		if ($tipo==='section_id') {
			return true;
		}

		$active_tlds = ontology_node::get_active_tlds();
		$current_tld = get_tld_from_tipo($tipo);

		return in_array($current_tld, $active_tlds);
	}//end check_active_tld



	/**
	* CHECK_TIPO_IS_VALID
	* Checks if given tipo is usable trying to resolve model from tipo
	* If model is empty, the tipo is not available because jer_dd is
	* damaged or the TLD is not installed.
	* It is also used to validate old data pointing to a non active TLD.
	* @param string $tipo
	* 	Could be a component tipo or a section / area tipo.
	* @return bool
	*/
	public static function check_tipo_is_valid( string $tipo ) : bool {

		// check tipo is safe. Exclude bad formed tipos
		if (!safe_tipo($tipo)) {
			return false;
		}

		// try to resolve model. If empty, the tipo do not exists in jer_dd
		$model = ontology_node::get_model_name_by_tipo($tipo,true);
		if (empty($model)) {
			return false;
		}

		return true;
	}//end check_tipo_is_valid



	/**
	* SAVE
	* PASADA A ontology_node (Pública. Esta carpeta es privada de momento 28-08-2016)
	* @return string|false $tipo
	*/
	public function Save() : string|false {

		if(!verify_dedalo_prefix_tipos($this->tld)) {
			if(SHOW_DEBUG===true) {
				trigger_error("Error on save 'ontology_node'. tld is empty or wrong. Nothing is saved!");
			}
			return false;
		}

		#
		# EDIT
		# TERMINO ID EXISTS : UPDATE RECORD
		if (!empty($this->tipo) && verify_dedalo_prefix_tipos($this->tld)) {
			if(SHOW_DEBUG===true) {
				// debug_log(__METHOD__." Saving with parent save ".$this->tipo, logger::DEBUG);
			}
			return parent::Save();
		}

		#
		# INSERT
		# TERMINO ID NOT CREATED : BUILD NEW AND INSERT
		# Creamos el tipo a partir del tld y el contador contador para el tld actual
		$counter_dato   = self::get_counter_value($this->tld);
		$tipo		= (string)$this->tld . (int)($counter_dato+1);
			#dump($tipo," tipo - tld:$this->tld");die();

		# Fix tipo : Important!
		$this->set_tipo($tipo);

		# Set defaults
		$this->set_tld( (string)$this->tld );
		if(empty($this->order_number)) $this->set_order_number( (int)1 );


		if (!empty($this->tipo)) {

			$result = parent::Save();

			if ($result) {
				$counter_dato_updated  = self::update_counter($this->tld, $counter_dato);
			}
		}

		return (string)$tipo;
	}//end Save



	/**
	* INSERT
	* Create a row into jer_dd with ontology data
	* The insert will search if tipo exists previously,
	* if the tipo was found, delete it and insert as new one
	* else insert new one
	* @return string|false|null $tipo(tipo)
	*/
	public function insert() : string|false|null {

		$row_data = self::get_row_data($this->tipo);

		//remove any other things than tld and section_id in the tipo string
		$safe_tipo = safe_tipo($this->tipo);

		if( !empty($row_data) ){

			$table		= ontology_node::$table; // jer_dd | jer_dd_backup
			$strQuery	= "DELETE FROM \"$table\" WHERE \"tipo\" = '$safe_tipo'";
			$result		= pg_query(DBi::_getConnection(), $strQuery);

			if($result===false) {
				if(SHOW_DEBUG===true) {
					$msg = __METHOD__." Failed Delete record (RDBO) from tipo: $safe_tipo";
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

		$this->set_tipo( $this->tipo );

		// insert, the Save return the tipo (tipo)
		$new_tipo = parent::Save();

		return $new_tipo;
	}//end insert



	/**
	* UPDATE
	* @return string|false
	*/
	public function update() : string|false {

		return parent::Save();
	}//end update



	/**
	* GET_LAST_SECTION_ID_FROM_TLD
	* Find the tipo(terminioID) in jer_dd and choose the last id
	* @return
	*/
	public function get_last_section_id_from_tld() : int {

		//remove any other things than tld in the tld string
		$safe_tld	= safe_tld($this->tld);

		// Find last id of current section
			$table	= ontology_node::$table; // jer_dd | jer_dd_backup
			$sql	= 'SELECT "tipo" FROM "'.$table.'" WHERE tld = \''.$safe_tld.'\'';
			$result	= JSON_RecordObj_matrix::search_free($sql);
			$value	= ($result === false)
				? null // Skip empty tables
				: ((pg_num_rows($result)===0)
					? null // Skip empty tables
					: true );

			// pg_fetch_result($result, 0, 'tipo'))
			$max_section_id = 0;
			if( $value === true ){

				$ar_section_id = [];
				while($row = pg_fetch_assoc($result)) {
					$string_id = get_section_id_from_tipo( $row['tipo'] );

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
	* @param string $tld
	* @return bool
	*/
	public static function delete_tld_nodes( string $tld ) : bool {

		$table = ontology_node::$table; // jer_dd | jer_dd_backup

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
	* @param array $tl
	* @return bool
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
	* @return bool
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
	* @param array $tl
	* @return bool
	*/
	public static function restore_from_bk_table( array $tld ) : bool {

		// delete the original nodes in jer_dd
		foreach ($tld as $current_tld) {
			ontology_node::delete_tld_nodes( $current_tld );
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
	* @param string $tipo
	* @param array $options = []
	* @return object $item
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
				'is_translatable',
				'propiedades',
				'properties',
				'relations',
				'term',
				// 'label'
			];
		}

		$ontology_node = new ontology_node($tipo);
		$ontology_node->use_cache = false; // (!) prevents using previous db results
		$ontology_node->get_dato();

		$item = new stdClass();

		foreach ($options as $property) {
			switch ($property) {
				case 'tipo':
					$item->{$property} = $tipo;
					break;
				case 'model':
					// $item->{$property} = ontology_node::get_model_name_by_tipo($tipo,true);
					$item->{$property} = $ontology_node->get_model();
					break;
				case 'model_tipo':
					$item->{$property} = $ontology_node->get_model_tipo();
					break;
				case 'is_translatable':
					$item->{$property} = $ontology_node->get_is_translatable();
					break;
				case 'propiedades':
					$item->{$property} = $ontology_node->get_propiedades(true);
					break;
				case 'label':
					$term = $ontology_node->get_term() ?? new stdClass();

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
					$item->{$property} = $ontology_node->{'get_'.$property}();
			}
		}


		return $item;
	}//end tipo_to_json_item



}//end class ontology_node
