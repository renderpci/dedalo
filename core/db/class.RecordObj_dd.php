<?php declare(strict_types=1);
/**
* RECORDOBJ_DD
*
*/
class RecordObj_dd extends RecordDataBoundObject {



	// fields
	public $terminoID;
	protected $parent;
	protected $modelo;
	protected $model;
	protected $esmodelo;
	protected $esdescriptor;
	protected $visible;
	protected $norden;
	protected $tld;
	protected $traducible;
	protected $relaciones;
	protected $propiedades;
	protected $properties;
	protected $term;
	protected $prefijo ;

	// fields external
	protected $filtroTerminos ;

	// optional specific loads
	protected $ar_recursive_childrens_of_this = [];

	// default table. Can be changed on the fly base on DEDALO_RECOVERY_MODE
	public static $table = 'jer_dd';



	/**
	* __CONSTRUCT
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
	protected function definePrimaryKeyName() : string {
		return 'terminoID';
	}
	// DEFINERELATIONMAP : array of pairs db field name, obj property name like fieldName => propertyName
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
	* @return bool
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
			debug_log(__METHOD__." Error on update_counter 'RecordObj_dd_edit'. Nothing is saved! ".to_string($strQuery), logger::ERROR);
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
				//debug_log(__METHOD__." Error on get_counter_value 'RecordObj_dd_edit'. counter for tld not found. ".to_string(), logger::WARNING);
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
	* @param string $terminoID
	* @param string $lang = null
	* @param bool $fallback = false
	* @return string|null $dato
	*/
	private static function get_descriptor_dato_by_tipo( string $terminoID, ?string $lang=null, bool $fallback=false ) : ?string {

		// Verify : In cases such as, for example, when solving the model of a related term that has no model assigned to it, the terminoID will be empty.
		// This is not a mistake but we must avoid resolving it.
		if(empty($terminoID)) {
			return null;
		}

		// safe lang fallback
		$lang = $lang ?? DEDALO_DATA_LANG;

		// vlca legacy exception
		if ($lang==='lg-vlca') {
			$lang = 'lg-cat';
		}

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
	* @param string $terminoID
	* @param string $lang = null
	* @param bool $from_cache = true
	* @param bool $fallback = true
	* @return string|null $result
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
	* @return string $model
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
	* @param string $tipo
	* @param bool $from_cache = true
	* @return string $modelo_name
	*/
	public static function get_modelo_name_by_tipo( string $tipo, bool $from_cache=true ) : string {

		static $modelo_name_by_tipo;

		// cache
		$cache_uid = $tipo;
		if ($from_cache===true && isset($modelo_name_by_tipo[$cache_uid])) {
			return $modelo_name_by_tipo[$cache_uid];
		}

		$RecordObj_dd	= new RecordObj_dd($tipo);
		$modelo_name	= $RecordObj_dd->get_modelo_name();

		// cache
		$modelo_name_by_tipo[$cache_uid] = $modelo_name;


		return $modelo_name;
	}//end get_modelo_name_by_tipo



	/**
	* GET_LEGACY_MODEL_NAME_BY_TIPO
	* Temporal function to manage transitional models
	* @param string $tipo
	* @return string|null $model_name
	*/
	public static function get_legacy_model_name_by_tipo( string $tipo ) : ?string {

		$RecordObj_dd	= new RecordObj_dd($tipo);
		$model_name		= $RecordObj_dd->get_legacy_model_name();

		return $model_name;
	}//end get_legacy_model_name_by_tipo



	/**
	* GET_LEGACY_MODEL_NAME
	* Temporal function to manage transitional models
	* @return string|null $model_name
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
	* @param string $tipo
	* @return string $lang
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
	* @param string $model
	* @return string|null $terminoID
	*/
	public static function get_model_terminoID( string $model ) : ?string {

		// `where` clause of SQL query
		$sql_code = 'esmodelo = \'si\' AND term @> \'{"'.DEDALO_STRUCTURE_LANG.'":"'.$model.'"}\'';

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
	* @param  array $ar_tl
	* @return array $result
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
	* @param string $modelo_name
	* @return array $ar_result
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
	* @return array $ar_all_modelos
	* 	Array of all models term_id as ["dd3","dd1226","dd1259",..]
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
	* @param string $modelo_tipo
	* @param bool $use_cache = true
	* @return array $ar_all_terminoID
	* 	Array of all term_id as ["oh1","dd917",..]
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
	* GET_AR_CHILDRENS_OF_THIS
	* Get array of terms (terminoID) with parent = $this->terminoID
	* Its mean that only direct children (first level) will be returned
	* @param string|null $esdescriptor = 'si'
	* @param string|null $esmodelo = null
	* @param string|null $order_by = 'norden'
	* @param bool $use_cache = true
	* @return array $ar_childrens_of_this
	*/
	public function get_ar_childrens_of_this( ?string $esdescriptor='si', ?string $esmodelo=null, $order_by='norden', bool $use_cache=true ) : array {

		// check self terminoID
		if(empty($this->terminoID))	{
			return [];
		}

		// static cache
		static $ar_childrens_of_this_stat_data;
		$key = $this->terminoID.'_'.$esdescriptor.'_'.$esmodelo.'_'.$order_by;
		if($use_cache===true && isset($ar_childrens_of_this_stat_data[$key])) {
			return $ar_childrens_of_this_stat_data[$key];
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

		$ar_childrens_of_this = $this->search($arguments);

		// store cache data
		$ar_childrens_of_this_stat_data[$key] = $ar_childrens_of_this;


		return $ar_childrens_of_this;
	}//end get_ar_childrens_of_this



	/**
	* GET_AR_CHILDRENS
	* Resolves all terms that have given tipo as parent
	* Not discriminates descriptors or models, result includes all children
	* @param string $tipo
	* @param string $order_by = 'norden'
	* @return array $ar_childrens
	*/
	public static function get_ar_childrens( string $tipo, string $order_by='norden' ) : array {

		// static cache
		static $get_ar_childrens_data;
		$key = $tipo.'_'.$order_by;
		if(isset($get_ar_childrens_data[$key])) {
			return $get_ar_childrens_data[$key];
		}

		// search
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'terminoID';
		$arguments['parent']			= $tipo;

		if (!empty($order_by)) {
			$arguments['order_by_asc'] = $order_by;
		}

		$RecordObj_dd	= new RecordObj_dd($tipo);
		$ar_childrens	= $RecordObj_dd->search($arguments);

		// store cache data
		$get_ar_childrens_data[$key] = $ar_childrens;


		return $ar_childrens;
	}//end get_ar_childrens



	/**
	* GET_AR_RECURSIVE_CHILDRENS_OF_THIS
	* Resolves all the children of the current term recursively.
	* @param string $terminoID
	* @param int $is_recursion = 0
	* @return array $this->ar_recursive_childrens_of_this
	*/
	public function get_ar_recursive_childrens_of_this( string $terminoID, int $is_recursion=0 ) : array {

		# IMPORTANTE: NO HACER CACHE DE ESTE MÉTODO (AFECTA A COMPONENT_FILTER_MASTER)

		# Creamos una instancia independiente de RecordObj_dd y resolvemos los hijos directos
		$RecordObj_dd			= new RecordObj_dd($terminoID);
		$ar_childrens_of_this	= $RecordObj_dd->get_ar_childrens_of_this(
			null, // esdescriptor
			null, // esmodelo
			null // order_by
		);
		$ar_childrens_of_this_size = sizeof($ar_childrens_of_this);

		// iterate children
		for ($i=0; $i < $ar_childrens_of_this_size; $i++) {

			$children_terminoID = $ar_childrens_of_this[$i];

			// Add current element
			$this->ar_recursive_childrens_of_this[] = $children_terminoID;

			// Recursion
			$this->get_ar_recursive_childrens_of_this( $children_terminoID, 1 );
		}

		if(isset($this->ar_recursive_childrens_of_this)) {
			return $this->ar_recursive_childrens_of_this;
		}

		return [];
	}//end get_ar_recursive_childrens_of_this



	/**
	* GET_AR_RECURSIVE_CHILDRENS
	*  	Static version of get_ar_recursive_childrens_of_this
	* 	No hay aumento de velocidad apreciable entre la versión estática y dinámica. Sólo una reducción de unos 140 KB en el consumo de memoria
	* @param string $terminoID
	* @param bool $is_recursion = false
	* @param array|null $ar_exclude_models = null
	* @param string|null $order_by = null
	* @param bool $use_cache = true
	* @return array $ar_resolved
	*/
	public static function get_ar_recursive_childrens( string $terminoID, bool $is_recursion=false, ?array $ar_exclude_models=null, ?string $order_by=null, bool $use_cache=true ) : array {

		$ar_resolved=array();

		if($is_recursion===true) {
			$ar_resolved[] = $terminoID;
		}

		$RecordObj_dd	= new RecordObj_dd($terminoID);
		$ar_childrens	= $RecordObj_dd->get_ar_childrens_of_this(
			'si', // string esdescriptor
			null, // string esmodelo
			$order_by, // string order_by
			$use_cache
		);
		$ar_childrens_size = sizeof($ar_childrens);

		// foreach($ar_childrens as $current_terminoID) {
		for ($i=0; $i < $ar_childrens_size; $i++) {

			$current_terminoID = $ar_childrens[$i];

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
				RecordObj_dd::get_ar_recursive_childrens($current_terminoID, true, $ar_exclude_models, $order_by, $use_cache)
			);
		}


		return $ar_resolved;
	}//end get_ar_recursive_childrens



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
	* @return array $ar_siblings_of_this
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
	* @return array|null $relaciones
	* 	Assoc array sample: [{"tipo": "rsc170"},{"tipo": "rsc174"},{"tipo": "rsc23"}]
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
	* @see RecordObj_dd::tipo_to_json_item()
	* @return array|null $relations
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
	* @param array|null $ar_relaciones
	* 	Could be array, string, null
	* @return bool
	*/
	public function set_relaciones( ?array $ar_relaciones) : bool {

		return parent::set_relaciones( json_encode($ar_relaciones) );
	}//end set_relaciones



	/**
	* REMOVE_ELEMENT_FROM_AR_TERMINOS_RELACIONADOS
	* @param string $terminoID_to_unlink
	* @return bool
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
	* @param string $tipo like 'dd20'
	* @param string $modelo_name like 'component_input_text'
	* @param string $relation_type like 'termino_relacionado'
	* @param bool $search_exact = false
	* @return array $result
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
				$ar_childrens	= $RecordObj_dd->get_ar_childrens_of_this();

				// we go through them to filter by model
				if(is_array($ar_childrens)) foreach($ar_childrens as $terminoID) {

					$RecordObj_dd	= new RecordObj_dd($terminoID);
					$modelo			= $RecordObj_dd->get_modelo();
					if(empty($modelo)) {
						debug_log(__METHOD__
							." Error processing relation children. Model is empty. Please define model for $terminoID" . PHP_EOL
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

			case 'children_recursive' :

				// We get the children recursively
				$RecordObj_dd	= new RecordObj_dd($tipo);
				$ar_childrens	= $RecordObj_dd->get_ar_recursive_childrens_of_this($tipo);

				// we go through them to filter by model
				if(is_array($ar_childrens)) foreach($ar_childrens as $terminoID) {

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
	* @param string $tipo
	* @return bool
	*/
	public static function get_translatable( string $tipo ) : bool {

		$RecordObj_dd	= new RecordObj_dd($tipo);
		$translatable	= $RecordObj_dd->get_traducible();

		return ($translatable==='si');
	}//end get_translatable



	/**
	* IS_MODEL
	* Alias of get_esmodelo but responses boolean for convenience
	* @return bool
	*/
	public function is_model() : bool {

		$esmodelo = $this->get_esmodelo();

		return ($esmodelo==='si');
	}//end is_model



	/**
	* GET_ORDER
	* Alias of get_norden
	* @return bool
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
	* @param string $section_tiop
	* @return string $color
	* 	like '#b9b9b9'
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
	* @return array $active_tlds
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
	* @param string $tipo (terminoID)
	* @return object|null $row
	*/
	public static function get_row_data( string $tipo ) : ?object {

		//remove any other things than tld and section_id in the tipo string
		$safe_tipo = safe_tipo($tipo);

		$table		= RecordObj_dd::$table; // jer_dd | jer_dd_backup
		$strQuery	= "SELECT * FROM \"$table\" WHERE \"terminoID\"='$safe_tipo' LIMIT 1";
		$result		= pg_query(DBi::_getConnection(), $strQuery);

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

		$active_tlds = RecordObj_dd::get_active_tlds();
		$current_tld = get_tld_from_tipo($tipo);

		return in_array($current_tld, $active_tlds);
	}//end check_active_tld



	/**
	* SAVE
	* PASADA A RecordObj_dd (Pública. Esta carpeta es privada de momento 28-08-2016)
	* @return string|false $terminoID
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
		# Creamos el terminoID a partir del prefijo y el contador contador para el prefijo actual
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
	* @return string|false|null $tipo(terminoID)
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
	* @param string $tld
	* @return bool
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
					$label = $term->{DEDALO_APPLICATION_LANG} ?? $term->{DEDALO_STRUCTURE_LANG} ?? null;
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
