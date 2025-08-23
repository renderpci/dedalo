<?php declare(strict_types=1);
/**
* ontology_node
*
*/
class ontology_node {


	// data
	protected $data;

	// fields
	public $tipo; // string
	// protected $parent; // string | null
	// protected $term; // object | null
	// protected $model; // string | null
	// protected $order_number; // int | null
	// protected $relations; // array | null
	// protected $tld; // string
	// protected $properties; // object | null
	// protected $model_tipo; // string | null
	// protected $is_model; // boolean
	// protected $is_translatable;	// boolean
	// protected $propiedades;	// string, data is a object as json stringify // Deprecated used only for compatibility of v5 and v6

	// bl_loaded_data
	protected $bl_loaded_data = false;

	// fields external
	protected $filtroTerminos ;

	// optional specific loads
	protected $ar_recursive_children_of_this = [];

	// default table. Can be changed on the fly base on DEDALO_RECOVERY_MODE
	public static $table = 'dd_ontology';



	// array of ontology_node instances
	private static $instances = [];


	/**
	* GET_INSTANCE
	* @param ?string $tipo = null
	* @param ?string $tld = null
	* @return self
	*/
	public static function get_instance( ?string $tipo = null ): self {

		if (!isset(self::$instances[$tipo])) {
			self::$instances[$tipo] = new self($tipo);
		}

		return self::$instances[$tipo];
	}//end get_instance



	/**
	* __CONSTRUCT
	*/
	function __construct( ?string $tipo=null ) {

		if( !empty($tipo) ) {

			//remove any other things than tld and section_id in the tipo string
			$safe_tipo = safe_tipo($tipo);

			if( $safe_tipo !== $tipo ){
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
		}
	}//end __construct



	/**
	* LOAD_DATA
	* @return bool
	*/
	public function load_data() : bool {

		if ($this->bl_loaded_data) {
			return true;
		}

		$tipo = $this->tipo;
		$data = ontology_data::load_ontology_data($tipo);

		// Set as loaded
		$this->bl_loaded_data = true;

		$this->data = !empty($data) ? (object)$data : new stdClass();
	// dump($this->data, ' this->data ++ '.to_string());
		return true;
	}//end load_data


	public function get_data(){
		$this->load_data();
		return $this->data;
	}//end get_tipo

	public function get_tipo() : ?string{
		return $this->tipo;
	}//end get_tipo


	public function get_parent() : ?string {
		$this->load_data();
		return $this->data->parent ?? null;
	}//end get_parent



	/**
	* GET_TERM_DATA
	* Get ontology node terms (concept names) in all languages
	* @return object|null
	*/
	public function get_term_data() : ?object {
		$this->load_data();
		return $this->data->term ?? null;
	}//end get_term_data



	/**
	* GET_term
	* Get specific term in one language given
	* If the calls specify a land that not exist, the resolution fallback to DEDALO_STRUCTURE_LANG
	* @return string
	*/
	public function get_term( string $lang, $fallback=true ) : ?string {

		$term = $this->get_term_data();

		// get the lang to be used to get the labels
		// it call to get_label_lang() to process exceptions as català to valencià, that are the same language.
		// if it not set, it will return DEDALO_APPLICATION_LANG
		$lang = lang::get_label_lang( $lang );

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
			$ontology_lang = DEDALO_STRUCTURE_LANG;
			if (isset($term->{$ontology_lang})) {
				return $term->{$ontology_lang};
			}

			// fallback to anything
			foreach ($term as $lang => $value) {
				if (!empty($value)) {
					return $value;
				}
			}
		}

		return null;
	}//end get_term



	public function get_model() : ?string {
		$this->load_data();
		return $this->data->model ?? null;
	}//end get_model



	public function get_order_number() : ?int {
		$this->load_data();
		return $this->data->order_number ?? null;
	}//end get_order_number


	/**
	* GET_RELATIONS
	* Return the value of property 'relations', stored as JSONB in table column 'relations'
	* Values expected in 'relations' are always JSON.
	* @return mixed $properties_parsed
	*/
	public function get_relations() : ?array {
		$this->load_data();
		return $this->data->relations ?? null;
	}//end get_relations




	public function get_tld() : ?string {
		$this->load_data();
		return $this->data->relations ?? null;
	}//end get_tld


	/**
	* GET_PROPERTIES
	* Return the value of property 'properties', stored as JSONB in table column 'properties'
	* Values expected in 'properties' are always JSON.
	* @return mixed $properties_parsed
	*/
	public function get_properties() : ?object {
		$this->load_data();
		return $this->data->properties ?? null;
	}//end get_properties



	public function get_model_tipo() : ?string {
		$this->load_data();
		return $this->data->model_tipo ?? null;
	}//end get_model_tipo



	/**
	* GET_IS_MODEL
	* Retrieve from DDBB the column is_model
	* Parse the column as boolean
	* @return bool
	*/
	public function get_is_model() : bool {
		$this->load_data();
		return $this->data->is_model;
	}//end get_is_model



	/**
	* GET_IS_TRANSLATABLE
	* Retrieve from DDBB the column is_translatable
	* @return bool
	*/
	public function get_is_translatable() : bool {
		$this->load_data();
		return $this->data->is_translatable;
	}//end get_is_translatable


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
	* GET_PROPIEDADES
	* Return the value of property 'properties', stored as plain text in table column 'properties'
	* Values expected in 'propiedades' are always JSON. Yo can obtain raw value (default) or JSON decoded (called with argument 'true')
	* @param bool $json_decode = false
	* @return mixed $propiedades
	* 	object / string parent::$properties
	*/
	public function get_propiedades() : array|object|null {
		$this->load_data();
		return $this->data->propiedades;
	}//end get_propiedades



	/**
	* GET_LABEL
	* Get specific term in one language given
	* If the calls specify a land that not exist, the resolution fallback to DEDALO_STRUCTURE_LANG
	* @return string
	*/
	public function set_parent( ?string $parent ) {

		$safe_parent = safe_tipo($parent);
		$this->data->parent = $safe_parent;
	}//end set_parent



	/**
	* SET_TERM_DATA
	* Set given $term value. e.g. {"lg-eng": "Activity"}
	* @param object|null $term
	*/
	public function set_term_data( ?object $term ) {

		$this->data->term = $term;
	}//end set_term_data



	/**
	* SET_MODEL
	* Set given $model value. e.g. "component_input_text"
	* @param string|null $model
	*/
	public function set_model( ?string $model ) {

		$this->data->model = $model;
	}//end set_model



	/**
	* SET_ORDER_NUMBER
	* Set given $order_number value. e.g. 5
	* @param int|null $order_number
	*/
	public function set_order_number( ?int $order_number ) {

		$this->data->order_number = $order_number;
	}//end set_order_number



	/**
	* SET_RELATIONS
	* Set 'relations' e.g. [{"tipo": "actv1"}]
	* @param array|null $ar_relations
	*/
	public function set_relations( ?array $relations) {

		$this->data->relations = $relations;
	}//end set_relations



	public function set_tld( ?string $tld ) {

		$this->data->tld = $tld;
	}//end set_tld


	/**
	* SET_PROPERTIES
	* Set the value of property 'properties'
	* Values expected in 'properties' are always JSON.
	* @param object|null $properties
	*/
	public function set_properties( ?object $properties) {

		$this->data->properties = $properties;
	}//end set_properties



	public function set_model_tipo( ?string $model_tipo ) {

		$this->data->model_tipo = $model_tipo;
	}//end set_model_tipo



	/**
	* set_IS_MODEL
	* Retrieve from DDBB the column is_model
	* Parse the column as boolean
	* @return bool
	*/
	public function set_is_model( bool $is_model) {

		$this->data->is_model = $is_model;
	}//end set_is_model



	/**
	* set_IS_TRANSLATABLE
	* Retrieve from DDBB the column is_translatable
	* @return bool
	*/
	public function set_is_translatable( bool $is_translatable ) {

		$this->data->is_translatable = $is_translatable;
	}//end set_is_translatable



	/**
	* set_PROPIEDADES
	* Return the value of property 'properties', stored as plain text in table column 'properties'
	* Values expected in 'propiedades' are always JSON. Yo can obtain raw value (default) or JSON decoded (called with argument 'true')
	* @param bool $json_decode = false
	* @return mixed $propiedades
	* 	object / string parent::$properties
	*/
	public function set_propiedades( array|object|null $propiedades ) {

		$this->data->propiedades = $propiedades;
	}//end set_propiedades



	/**
	* INSERT
	* Create a row into dd_ontology with ontology data
	* The insert will search if tipo exists previously,
	* if the tipo was found, delete it and insert as new one
	* else insert new one
	* @return string|false|null $tipo(tipo)
	*/
	public function insert() : bool {

		$tipo = $this->get_tipo();

		$result = ontology_data::delete_ontolgy_data($tipo);

		if($result===false) {
			return false;
		}

		$values = (array) $this->get_data();

		$result = ontology_data::insert_ontolgy_data( $tipo, $values );

		if($result===false) {
			return false;
		}

		return true;
	}//end insert



	/**
	* GET_TERM_BY_TIPO
	* Get label value from 'term' in given lang
	* It use a fallback to: DEDALO_APPLICATION_LANG, DEDALO_DATA_LANG, DEDALO_STRUCTURE_LANG
	* @param string $tipo
	* @param string $lang = null
	* @param bool $from_cache = true
	* @param bool $fallback = true
	* @return string|null $result
	*/
	public static function get_term_by_tipo( string $tipo, ?string $lang=null, bool $from_cache=true, bool $fallback=true ) : ?string {

		// cache
		static $label_by_tipo_cache = [];
		$cache_uid = $tipo . '_' . $lang . '_' . (int)$fallback;
		if ($from_cache===true && isset($label_by_tipo_cache[$cache_uid])) {
			return $label_by_tipo_cache[$cache_uid];
		}

		// Verify : In cases such as, for example, when solving the model of a related term that has no model assigned to it, the tipo will be empty.
		// This is not a mistake but we must avoid resolving it.
		if(empty($tipo)) {
			return null;
		}

		// safe lang fallback
		$lang = $lang ?? DEDALO_DATA_LANG;

		// term object
		$ontology_node	= new ontology_node($tipo);
		$label			= $ontology_node->get_term($lang, $fallback);

		// cache
		$label_by_tipo_cache[$cache_uid] = $label;


		return $label;
	}//end get_term_by_tipo



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

			$model = ontology_node::get_term_by_tipo($model_tipo, DEDALO_STRUCTURE_LANG, true, false);

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

		$model_name = ontology_node::get_term_by_tipo(
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

		$json_search = (object)[
			'operator' => '@>',
			'value' => '{"'.DEDALO_STRUCTURE_LANG.'":"'.$model.'"}'
		];

		// search terms with given model
		$result = ontology_data::search_ontology_data(
			[	'is_model'	=> true,
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
	}//end get_tipo_form_model_name



	/**
	* GET_ALL_RECORDS_BY_TLD
	* Get all dd_ontology rows of specified tlds
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
	public static function get_all_records_by_tld( array $ar_tld ) : array {

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
		$sql_query		= 'SELECT * FROM "'.ontology_node::$table.'" WHERE '. $filter ;
		$dd_ontology_result	= pg_query(DBi::_getConnection(), $sql_query);

		// iterate dd_ontology_result row
		$ontology_records = [];
		while($row = pg_fetch_object($dd_ontology_result)) {
			$ontology_records[] = $row;
		}

		return $ontology_records;
	}//end get_all_records_by_tld



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

		// search terms with given model
		$result = ontology_data::search_ontology_data([
			'model' => $model_name
		]);

		$ar_result = ( $result===false ) ? [] : $result;

		// static cache
		$ar_tipo_by_model_name[$cache_uid] = $ar_result;

		return $ar_result;
	}//end get_ar_tipo_by_model_name



	/**
	* GET_AR_ALL_MODELS
	* It is used in the edit thesaurus selector to assign model
	* @return array $all_models
	* 	Array of all models tipo as ["dd3","dd1226","dd1259",..]
	*/
	public function get_ar_all_models() : array {

		// search
		$result = ontology_data::search_ontology_data([
			'is_model' => true
		]);

		$all_models = ( $result===false ) ? [] : $result;

		return $all_models;
	}//end get_ar_all_models



	/**
	* GET_AR_ALL_TIPO_OF_MODEL_TIPO
	* Resolves all term id of given model tipo, like
	* dd6 => ["oh1","dd917",..]
	* @param string $modelo_tipo
	* @return array $ar_all_tipo
	* 	Array of all term_id as ["oh1","dd917",..]
	*/
	public static function get_ar_all_tipo_of_model_tipo( string $model_tipo ) : array {

		// search
		$result = ontology_data::search_ontology_data([
			'model_tipo' => $model_tipo
		]);

		$ar_all_tipo = ( $result===false ) ? [] : $result;

		return $ar_all_tipo;
	}//end model_tipo



	/**
	* GET_AR_CHILDREN_OF_THIS
	* Get array of terms (tipo) with parent = $this->tipo
	* Its mean that only direct children (first level) will be returned
	* @return array $ar_children_of_this
	*/
	public function get_ar_children_of_this() : array {

		// check self tipo
		if(empty($this->tipo))	{
			return [];
		}

		// static cache
		static $ar_children_of_this_stat_data;
		$key = $this->tipo;
		if( isset($ar_children_of_this_stat_data[$key]) ) {
			return $ar_children_of_this_stat_data[$key];
		}

		// search
		$result = ontology_data::search_ontology_data(
			[ 'parent' => $this->tipo ],
			true // order by order_number asc
		);

		$ar_children = ( $result===false ) ? [] : $result;

		// store cache data
		$ar_children_of_this_stat_data[$key] = $ar_children;


		return $ar_children;
	}//end get_ar_children_of_this



	/**
	* GET_AR_CHILDREN
	* Resolves all terms that have given tipo as parent
	* Not discriminates descriptors or models, result includes all children
	* @param string $tipo
	* @param string $order_by = 'order_number'
	* @return array $ar_children
	*/
	public static function get_ar_children( string $tipo ) : array {

		$ontology_node	= new ontology_node( $tipo );
		$ar_children	= $ontology_node->get_ar_children_of_this();

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

		// IMPORTANT: DO NOT CACHE THIS METHOD (AFFECTS COMPONENT_FILTER_MASTER)

		// We create an independent instance of ontology_node and resolve the direct children.
		$ontology_node			= new ontology_node( $tipo );
		$ar_children_of_this	= $ontology_node->get_ar_children_of_this();
		$ar_children_of_this_size = sizeof( $ar_children_of_this );

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
	* GET_AR_RECURSIVE_CHILDREN
	* Static version of get_ar_recursive_children_of_this
	* note: There is no noticeable increase in speed between the static and dynamic versions. Only a reduction of about 140 KB in memory consumption.
	* @param string $tipo
	* @param bool $is_recursion = false
	* @param array|null $ar_exclude_models = null
	* @param string|null $order_by = null
	* @param bool $use_cache = true
	* @return array $ar_resolved
	*/
	public static function get_ar_recursive_children( string $tipo, bool $is_recursion=false, ?array $ar_exclude_models=null ) : array {

		$ar_resolved=array();

		if( $is_recursion===true ) {
			$ar_resolved[] = $tipo;
		}

		$ontology_node	= new ontology_node( $tipo );
		$ar_children	= $ontology_node->get_ar_children_of_this();
		$ar_children_size = sizeof( $ar_children );

		// foreach($ar_children as $current_tipo) {
		for ($i=0; $i < $ar_children_size; $i++) {

			$current_tipo = $ar_children[$i];

			// Exclude models optional
			if (!empty($ar_exclude_models)) {
				$modelo_name = ontology_node::get_model_name_by_tipo( $current_tipo, true );
				if (in_array($modelo_name, $ar_exclude_models)) {
					continue; // Skip current model and children
				}
			}

			// Recursion
			$ar_resolved = array_merge(
				$ar_resolved,
				ontology_node::get_ar_recursive_children(
					$current_tipo,
					true,
					$ar_exclude_models
				)
			);
		}


		return $ar_resolved;
	}//end get_ar_recursive_children



	/**
	* GET_AR_PARENTS_OF_THIS
	* Resolves the current term's parents recursively
	* @param bool $ksort = true
	* @return array $ar_parents_of_this
	* Assoc array sample: ["4": "dd1", "3": "dd14", "2": "rsc1", "1": "rsc75", "0": "rsc76"]
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
		if( isset($this->tipo) && isset($ar_siblings_of_this_data[$this->tipo]) ) {
			return $ar_siblings_of_this_data[$this->tipo];
		}

		// search
		$result = ontology_data::search_ontology_data([
			'parent' => $this->get_parent()
		]);

		$siblings = ( $result===false ) ? [] : $result;

		// store cache data
		$ar_siblings_of_this_data[$this->tipo] = $siblings;


		return $siblings;
	}//end get_ar_siblings_of_this



	/**
	* GET_RELATION_NODES
	* @param string $tipo
	* @param bool $cache = false
	* @param bool $simple = false
	* @return array $ar_relations
	* JSON_VERSION
	* In 'simple' mode it returns only an array with 'tipo'.
	*/
	public static function get_relation_nodes( string $tipo, bool $cache=false, bool $simple=false ) : array {

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
	}//end get_relation_nodes



	/**
	* GET_AR_TIPO_BY_MODEL_NAME_AND_RELATION
	* Returns the termID of the related term (specify relation) of given model name
	* e.g. to know the related terms of model 'filter'.
	* @param string $tipo like 'dd20'
	* @param string $model_name like 'component_input_text'
	* @param string $relation_type like 'related'
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
							.' name: ' . ontology_node::get_term_by_tipo($tipo) . PHP_EOL
							.' ontology_node: ' . json_encode($ontology_node)
							, logger::ERROR
						);
						return [];
					}

					$current_model_name = ontology_node::get_term_by_tipo($model);

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
							.' name: ' . ontology_node::get_term_by_tipo($tipo)
							, logger::ERROR
						);
						return [];
					}

					$current_model_name = ontology_node::get_term_by_tipo($model_tipo);

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

			case 'related' :

				// We get the related terms
				$ontology_node	= new ontology_node($tipo);
				$relation_nodes	= $ontology_node->get_relation_nodes(
					$tipo,
					true, // bool cache
					true // bool simple
				);

				// we go through them to filter by model
				if(is_array($relation_nodes)) foreach($relation_nodes as $tipo) {

					$ontology_node	= new ontology_node($tipo);
					$model_tipo		= $ontology_node->get_model_tipo();
					if(empty($model_tipo)) {
						debug_log(__METHOD__
							." Error processing relation related. Model is empty. Please define model for $tipo" . PHP_EOL
							.' tipo: ' . $tipo . PHP_EOL
							.' relation_type: ' . $relation_type . PHP_EOL
							.' tipo: ' . $tipo . PHP_EOL
							.' name: ' . ontology_node::get_term_by_tipo($tipo)
							, logger::ERROR
						);
						return [];
					}

					$current_model_name = ontology_node::get_term_by_tipo($model_tipo);

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
							.' name: ' . ontology_node::get_term_by_tipo($tipo)
							, logger::ERROR
						);
						return [];
					}

					$current_model_name = ontology_node::get_term_by_tipo($model_tipo);		#dump($model_name);

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
	* GET_COLOR
	* Get the color defined in properties
	* if it's not defined return default gray
	* It is used to set custom styles to component_section_id in some sections
	* @param string $section_tiop
	* @return string $color
	* 	like '#b9b9b9'
	*/
	public static function get_color( string $section_tipo ) : string {

		$ontology_node	= new ontology_node( $section_tipo );
		$properties		= $ontology_node->get_properties();

		$color = isset($properties->color)
			? $properties->color
			: '#b9b9b9'; // default gray

		return $color;
	}//end get_color



	/**
	* GET_ACTIVE_TLDS
	* Get from dd_ontology table all active/installed tlds.
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

		$table	= ontology_node::$table; // dd_ontology | dd_ontology_backup
		$sql_query	= "SELECT tld FROM \"$table\" GROUP BY tld";
		$result	= pg_query(DBi::_getConnection(), $sql_query);

		$active_tlds = [];
		while($row = pg_fetch_assoc($result)) {
			$active_tlds[] = $row['tld'];
		}

		$active_tlds_cache = $active_tlds;


		return $active_tlds;
	}//end get_active_tlds



	/**
	* CHECK_ACTIVE_TLD
	* Checks if the tipo tld is available and installed in the Ontology looking for the dd_ontology
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
	* If model is empty, the tipo is not available because dd_ontology is
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

		// try to resolve model. If empty, the tipo do not exists in dd_ontology
		$model = ontology_node::get_model_name_by_tipo($tipo,true);
		if (empty($model)) {
			return false;
		}

		return true;
	}//end check_tipo_is_valid



	/**
	* DELETE_TLD_NODES
	* Removes all tld nodes (records) in dd_ontology
	* @param string $tld
	* @return bool
	*/
	public static function delete_tld_nodes( string $tld ) : bool {

		$table = ontology_node::$table; // dd_ontology | dd_ontology_backup

		// remove any other things than tld in the tld string
		$safe_tld = safe_tld($tld);
		if ($safe_tld!==$tld) {
			debug_log(__METHOD__
				. " Error deleting tld from table dd_ontology. tld is not safe" . PHP_EOL
				. ' tld: ' . to_string($tld) . PHP_EOL
				. ' safe_tld: ' . to_string($safe_tld)
				, logger::ERROR
			);
			return false;
		}

		// dd_ontology. delete terms (records)
		$sql_query = '
			DELETE FROM "'.$table.'" WHERE "tld" = \''.$safe_tld.'\';
		';
		$delete_result = pg_query(DBi::_getConnection(), $sql_query);
		if (!$delete_result) {
			debug_log(__METHOD__
				. " Error deleting tld from table dd_ontology" . PHP_EOL
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
	* Used to ensure that the dd_ontology can be restore in process as regenerate it.
	* @param array $tl
	* @return bool
	*/
	public static function create_bk_table( array $tld ) : bool {

		$where = implode('\' OR tld = \'', $tld);

		$sql_query = '
			DROP TABLE IF EXISTS "dd_ontology_bk" CASCADE;
			CREATE TABLE IF NOT EXISTS dd_ontology_bk AS
			SELECT * FROM dd_ontology WHERE tld = \''.$where.'\';
		';

		$result = pg_query(DBi::_getConnection(), $sql_query);

		if($result===false) {
			debug_log(__METHOD__
				. ' Failed consolidate_table dd_ontology' .PHP_EOL
				. 'query: ' . to_string($sql_query)
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end create_bk_table



	/**
	* DELETE_BK_TABLE
	* Remove the backup table of dd_ontology with clone rows
	* @return bool
	*/
	public static function delete_bk_table() : bool {

		$sql_query = '
			DROP TABLE IF EXISTS "dd_ontology_bk" CASCADE;
		';

		$result = pg_query(DBi::_getConnection(), $sql_query);

		if($result===false) {
			debug_log(__METHOD__
				. ' Failed delete_bk_table dd_ontology_bk' .PHP_EOL
				. 'query: ' . to_string($sql_query)
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end delete_bk_table



	/**
	* RESTORE_FROM_BK_TABLE
	* Delete the given tlds from `dd_ontology` table
	* Use `dd_ontology_bk` table to insert his rows into `dd_ontology`
	* Note: `dd_ontology_bk` is not a full backup of `dd_ontology`, it's a selection tlds
	* Do not use as full backup!
	* @param array $tl
	* @return bool
	*/
	public static function restore_from_bk_table( array $tld ) : bool {

		// delete the original nodes in dd_ontology
		foreach ($tld as $current_tld) {
			ontology_node::delete_tld_nodes( $current_tld );
		}

		// restore all tld into dd_ontology_bk
		$where = implode('\' OR tld = \'', $tld);

		$sql_query = '
			INSERT INTO dd_ontology
			SELECT * FROM "dd_ontology_bk" WHERE tld = \''.$where.'\';
		';

		$result = pg_query(DBi::_getConnection(), $sql_query);

		if($result===false) {
			debug_log(__METHOD__
				. ' Failed restore_from_bk_table dd_ontology_bk' .PHP_EOL
				. 'query: ' . to_string($sql_query)
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end restore_from_bk_table



}//end class ontology_node
