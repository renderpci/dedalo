<?php declare(strict_types=1);
/**
* ontology_node
* Manages the active and functional ontology node,
* ontology node is using to interpreted data, schemas, behaviors, etc. in execution time.
* It manages every node of active ontologies.
* It uses `dd_ontology` table in DDBB.
* It's a read only object.
*
* Note: ontology nodes are not editable nodes.
* For doing changes into ontology use ../core/ontology/class.ontology.php
*/
class ontology_node {

	// tipo
	// Ontology identification of the node
	// tipo : Typology of Indirect Programing Objects
	// every node in the ontology has a unique identification.
	// It allows to define the node properties
	// tipo use the TLD and one unique id for this TLD as oh1
	// oh = TLD, top level domain, to identify the name space of the ontology, oh = Oral History
	// 1 = unique and sequential id.
	public $tipo; // string

	// data
	// An object with the all properties of the ontology node
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
	// every property has its own column in the `dd_ontology` table
	protected $data;

	// is_loaded_data
	// A boolean property to identify if the node was loaded from database
	protected $is_loaded_data = false;

	// ar_recursive_children_of_this
	// cache for expensive calculation of recursive children.
	protected $ar_recursive_children_of_this = [];

	// default table
	// Table used for storage the ontology nodes
	// This table is used as read only table.
	// It can be changed on the fly base when DEDALO_RECOVERY_MODE is active
	// in those cases, the table will be `dd_ontology_recovery` for safe running.
	public static $table = 'dd_ontology';

	// array of ontology_node instances
	private static $instances = [];



	/**
	* GET_INSTANCE
	* Create the ontology node instance with the ontology identification; tipo
	* @param ?string $tipo = null
	* 	E.g. 'dd156'
	* @return self
	*/
	public static function get_instance( ?string $tipo = null ) : self {

		if (!isset(self::$instances[$tipo])) {
			self::$instances[$tipo] = new self($tipo);
		}

		return self::$instances[$tipo];
	}//end get_instance



	/**
	* __CONSTRUCT
	* Check the ontology identification; tipo
	* to ensure that it is a valid and safe before construct the ontology node object
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

			// set data
			$this->data = new stdClass();
		}
	}//end __construct



	/**
	* LOAD_DATA
	* Get the row data of the node from table
	* @return bool
	*/
	public function load_data() : bool {

		//check if data was loaded
		if ($this->is_loaded_data) {
			return true;
		}
		// load ontology node from DDBB
		$tipo = $this->tipo;
		$data = dd_ontology_db_manager::read($tipo);

		// Set as loaded
		$this->is_loaded_data = true;

		// set it
		$this->data = !empty($data) ? (object)$data : new stdClass();

		return true;
	}//end load_data



	/**
	* GET_DATA
	* Get all node data
	* @return object|null
	*/
	public function get_data() : ?object {
		$this->load_data();

		return $this->data;
	}//end get_tipo



	/**
	* GET_TIPO
	* Get the ontology identification; tipo of the instance
	* @return string|null
	*/
	public function get_tipo() : ?string{
		return $this->tipo;
	}//end get_tipo



	/**
	* GET_PARENT
	* Get the ontology identification for parent (as parent tipo) of the instance
	* @return string|null
	*/
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
	* Model is an ontology node typology term, it uses an unique term in ontology lang.
	* Model are not translatable, is used to create instances of sections, components, etc.
	* Therefore, models are unique name that point to specific code scripts in Dédalo.
	* section 			---> class.section.php / section.js / section.css
	* component_portal 	---> class.componnet_portal.php / componnet_portal.js / componnet_portal.css
	* @return string
	*/
	public function get_model() : string {

		$this->load_data();

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
		$model = $this->data->model ?? null;
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
	* GET_ORDER_NUMBER
	* The position of the ontology node with respect to its siblings.
	* @return int|null
	*/
	public function get_order_number() : ?int {
		$this->load_data();
		return $this->data->order_number ?? null;
	}//end get_order_number



	/**
	* GET_RELATIONS
	* Ontology node relations are the connection between nodes in unidirectional way.
	* node1 point to node4 and node5;
	* "oh1" -> [{"tipo": "tch7"},{"tipo": "numisdata8"}]
	* relations are stored as JSONB in table column 'relations'
	* @return array|null
	*/
	public function get_relations() : ?array {
		$this->load_data();
		return $this->data->relations ?? null;
	}//end get_relations



	/**
	* GET_TLD
	* TLD, Top Level Domain. Ontology name space.
	* It defines a field of heritage or common parts of the ontology.
	* oh = Oral History
	* tch = Tangible Cultural Heritage
	* ich = Intangible Cultural Heritage
	* dd = Dédalo core, defines users, profiles, menu, login, etc.
	* rsc = Resources as People, Media (av, image, pdf), etc.
	* @return string|null
	*/
	public function get_tld() : ?string {
		$this->load_data();
		return $this->data->tld ?? null;
	}//end get_tld



	/**
	* GET_PROPERTIES
	* Properties are the configuration of the ontology node
	* Properties defines:
	* 	Behavior : how the node will process its data, how resolve relations (how is connected to other nodes) and represent itself
	* 	Options  : properties that can be specifically set in the instances of the nodes.
	* 	Layout 	 : How the node will be render
	* Return the value of property 'properties', stored as JSONB in table column 'properties'
	* Properties value is an object.
	* @return object|null
	*/
	public function get_properties() : ?object {
		$this->load_data();
		return $this->data->properties ?? null;
	}//end get_properties



	/**
	* GET_MODEL_TIPO
	* Model tipo is the ontology node identification for the model (the node typology).
	* dd6 	---> section
	* dd592 ---> component_portal
	* The ontology node has a model to identify its own typology, and the model is defined as an ontology node by itself
	* Model nodes are identify in ontology with the property: is_model as true
	* @return string|null
	*/
	public function get_model_tipo() : ?string {
		$this->load_data();
		return $this->data->model_tipo ?? null;
	}//end get_model_tipo



	/**
	* GET_IS_MODEL
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
		return $this->data->is_model;
	}//end get_is_model



	/**
	* GET_IS_TRANSLATABLE
	* Identify in the ontology node data is translatable
	* Used by strings components to store its data with specific language.
	* Retrieve from DDBB the column is_translatable
	* @return bool
	*/
	public function get_is_translatable() : bool {
		$this->load_data();
		return $this->data->is_translatable;
	}//end get_is_translatable



	/**
	* GET_TRANSLATABLE
	* Get current if given tipo is translatable as boolean value
	* based on column 'translatable' value
	* @param string $tipo
	* @return bool
	*/
	public static function get_translatable( string $tipo ) : bool {

		$ontology_node	= ontology_node::get_instance($tipo);
		$translatable	= $ontology_node->get_is_translatable();

		return $translatable;
	}//end get_translatable



	/**
	* GET_PROPIEDADES
	* Return the value of property 'properties', stored as plain text in table column 'properties'
	* Values expected in 'propiedades' are always JSON. Yo can obtain raw value (default) or JSON decoded (called with argument 'true')
	* @param bool $json_decode = false
	* @return mixed|null $propiedades
	* 	object / string parent::$properties
	*/
	public function get_propiedades( bool $json_decode = false ) : array|object|null {
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
	* set_parent
	* Set given $parent value. e.g. 'oh1'
	* @param string|null $parent
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



	/**
	* SET_TLD
	* Set given $tld value. e.g. 'tch'
	* @param string|null $tld
	*/
	public function set_tld( ?string $tld ) {

		$this->data->tld = $tld;
	}//end set_tld



	/**
	* SET_PROPERTIES
	* Set the value of property 'properties' e.g. {"css": {".wrapper_component": {"grid-column": "span 2"}}}
	* @param object|null $properties
	*/
	public function set_properties( ?object $properties) {

		$this->data->properties = $properties;
	}//end set_properties



	/**
	* SET_MODEL_TIPO
	* Set given $model_tipo value. e.g. 'dd6'
	* @param string|null $tld
	*/
	public function set_model_tipo( ?string $model_tipo ) {

		$this->data->model_tipo = $model_tipo;
	}//end set_model_tipo



	/**
	* SET_IS_MODEL
	* Set given $is_model value e.g. true
	* @param bool $is_model
	*/
	public function set_is_model( bool $is_model) {

		$this->data->is_model = $is_model;
	}//end set_is_model



	/**
	* SET_IS_TRANSLATABLE
	* Set given $is_translatable value e.g. true
	* @param bool $is_model
	*/
	public function set_is_translatable( bool $is_translatable ) {

		$this->data->is_translatable = $is_translatable;
	}//end set_is_translatable



	/**
	* SET_PROPIEDADES
	* Set given $is_translatable value e.g. {"css":{".wrap_component":{"mixin":[".vertical",".line_top"],"style":{"width":"25%"}}}}
	* @param ?string $propiedades
	*/
	public function set_propiedades( ?string $propiedades ) {

		$this->data->propiedades = $propiedades;
	}//end set_propiedades



	/**
	* INSERT
	* Create a row into dd_ontology table with ontology data
	* The insert will search if tipo exists previously,
	* if the tipo was found, delete it and insert as new one
	* else insert new one
	* @return string|false|null $tipo(tipo)
	*/
	public function insert() : bool {

		$tipo = $this->get_tipo();

		if (empty($tipo)) {
			return false;
		}

		$values = (array)$this->get_data() ?? [];

		// Safe add TLD
		$values['tld'] = get_tld_from_tipo($tipo);
		if (empty($values['tld'])) {
			return false;
		}

		// Attempt delete - don't fail if record doesn't exist
		// $delete_result = dd_ontology_db_manager::delete($tipo);
		// if($delete_result===false) {
		// 	error_log("Warning: Failed to delete existing ontology record for tipo: $tipo");
		// 	return false;
		// }

		// Create new record
		$result = dd_ontology_db_manager::create( $tipo, $values );
		if($result===false) {
			return false;
		}


		return true;
	}//end insert



	/**
	* DELETE
	* Deletes a row from 'dd_ontology' table based on current tipo.
	* @return string|false|null $tipo(tipo)
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
		$ontology_node	= ontology_node::get_instance($tipo);
		$label			= $ontology_node->get_term($lang, $fallback);

		// cache
		$label_by_tipo_cache[$cache_uid] = $label;


		return $label;
	}//end get_term_by_tipo



	/**
	* GET_MODEL_BY_TIPO
	* Get model of the given tipo (ontology node)
	* @param string $tipo
	* @param bool $from_cache = true
	* @return string $modelo
	*/
	public static function get_model_by_tipo( string $tipo, bool $from_cache=true ) : string {

		static $model_by_tipo;

		// cache
		$cache_uid = $tipo;
		if ($from_cache===true && isset($model_by_tipo[$cache_uid])) {
			return $model_by_tipo[$cache_uid];
		}

		$ontology_node	= ontology_node::get_instance($tipo);
		$modelo	= $ontology_node->get_model();

		// cache
		if( !empty($modelo) ){
			$model_by_tipo[$cache_uid] = $modelo;
		}


		return $modelo;
	}//end get_model_by_tipo



	/**
	* GET_LEGACY_MODEL_BY_TIPO
	* Temporal function to manage transitional models
	* Get the model for given tipo (ontology node) without match/change it to v6 valid models.
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
	* Temporal function to manage transitional models
	* Get the model without match/change it to v6 valid models.
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
	* Resolves tipo searching node model names
	* Only one node exist by model name (models are unique)
	* @param string $model
	* @return string|null $tipo
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
		$result = dd_ontology_db_manager::search(
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

		$ontology_node	= ontology_node::get_instance( $tipo );
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
		$ontology_node			= ontology_node::get_instance( $tipo );
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

		$ontology_node	= ontology_node::get_instance( $tipo );
		$ar_children	= $ontology_node->get_ar_children_of_this();
		$ar_children_size = sizeof( $ar_children );

		// foreach($ar_children as $current_tipo) {
		for ($i=0; $i < $ar_children_size; $i++) {

			$current_tipo = $ar_children[$i];

			// Exclude models optional
			if (!empty($ar_exclude_models)) {
				$modelo_name = ontology_node::get_model_by_tipo( $current_tipo, true );
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

			$ontology_node	= ontology_node::get_instance($parent);
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
		$result = dd_ontology_db_manager::search([
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
	* Returns the termID of the related term (specify relation) of given model name
	* e.g. to know the related terms of model 'filter'.
	* @param string $tipo like 'dd20'
	* @param string $model_name like 'component_input_text'
	* @param string $relation_type like 'related'
	* @param bool $search_exact = false
	* @return array $result
	*/
	public static function get_ar_tipo_by_model_and_relation( string $tipo, string $model_name, string $relation_type, bool $search_exact=false ) : array {

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
				$ontology_node	= ontology_node::get_instance($tipo);
				$ar_children	= $ontology_node->get_ar_children_of_this();

				// we go through them to filter by model
				if(is_array($ar_children)) foreach($ar_children as $tipo) {

					$ontology_node	= ontology_node::get_instance($tipo);
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
				$ontology_node	= ontology_node::get_instance($tipo);
				$ar_children	= $ontology_node->get_ar_recursive_children_of_this($tipo);

				// we go through them to filter by model
				if(is_array($ar_children)) foreach($ar_children as $tipo) {

					$ontology_node	= ontology_node::get_instance($tipo);
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
				$ontology_node	= ontology_node::get_instance($tipo);
				$relation_nodes	= $ontology_node->get_relation_nodes(
					$tipo,
					true, // bool cache
					true // bool simple
				);

				// we go through them to filter by model
				foreach($relation_nodes as $tipo) {

					$ontology_node	= ontology_node::get_instance($tipo);
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
				$ontology_node	= ontology_node::get_instance($tipo);
				$ar_parents		= $ontology_node->get_ar_parents_of_this();

				// we go through them to filter by model
				if(is_array($ar_parents)) foreach($ar_parents as $tipo) {

					$ontology_node	= ontology_node::get_instance($tipo);
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
	}//end get_ar_tipo_by_model_and_relation



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

		$ontology_node	= ontology_node::get_instance( $section_tipo );
		$properties		= $ontology_node->get_properties();

		$color = isset($properties->color)
			? $properties->color
			: '#b9b9b9'; // default gray

		return $color;
	}//end get_color



}//end class ontology_node
