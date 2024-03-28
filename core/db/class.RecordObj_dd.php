<?php
// declare(strict_types=1);
/**
* RecordObj_dd
*
*
*/
class RecordObj_dd extends RecordDataBoundObject {



	// fields
	public $terminoID;
	protected $parent;
	protected $modelo;
	protected $esmodelo;
	protected $esdescriptor;
	protected $visible;
	protected $norden;
	protected $tld;
	protected $traducible;
	protected $relaciones;
	protected $propiedades;
	protected $properties;
	protected $prefijo ;

	// fields external
	protected $filtroTerminos ;

	// optional specific loads
	protected $ar_recursive_childrens_of_this	= array();
	#protected $ar_parents_cache				= array();
	#protected $ar_reels_of_this				= array();



	/**
	* __CONSTRUCT
	*/
	function __construct(string $terminoID=null, string $prefijo=null) {

		if( !empty($terminoID) ) {
			# CASO GENERAL

			$this->set_terminoID($terminoID);
			$this->set_prefijo( self::get_prefix_from_tipo($terminoID) );

			#$prefix = dd::terminoID2prefix($terminoID);
			#$prefix = self::get_prefix_from_tipo($terminoID);
			#$id 	= self::get_id_from_tipo($terminoID);
			#$this->set_ID(intval($id));

		}else if(!empty($prefijo) && strlen($prefijo)>=2) {

			$terminoID = null;
			$this->set_prefijo($prefijo);

		}else{

			$msg = 'This record dd not exists! [terminoID:"'.$terminoID.'" - prefijo:"'.$prefijo.'"] ';
			if(isset($_REQUEST['terminoID'])) $msg .= ' - terminoID:'.safe_xss($_REQUEST['terminoID']);

			$bt = debug_backtrace();
			debug_log(__METHOD__." $msg - debug_backtrace:  " . PHP_EOL . to_string($bt), logger::ERROR);

			if(SHOW_DEBUG===true) {
        		throw new Exception("Error Processing Request $msg", 1);
			}
			trigger_error($msg);
		}


		parent::__construct($terminoID);
	}//end __construct



	# DEFINETABLENAME : define current table (tr for this obj)
	protected function defineTableName() : string {
		return 'jer_dd';
	}
	# DEFINEPRIMARYKEYNAME : define PrimaryKeyName (id)
	protected function definePrimaryKeyName() : string {
		return 'terminoID';
	}
	# DEFINERELATIONMAP : array of pairs db field name, obj property name like fieldName => propertyName
	protected function defineRelationMap() : array {
		return [
			# db field name		# property name
			//'id'			=> 'ID',
			'terminoID'		=> 'terminoID',
			'parent'		=> 'parent',
			'modelo'		=> 'modelo',
			'esmodelo'		=> 'esmodelo',
			'esdescriptor'	=> 'esdescriptor',
			'visible'		=> 'visible',
			'norden'		=> 'norden',
			'tld'			=> 'tld',
			'traducible'	=> 'traducible',
			'relaciones'	=> 'relaciones',
			'propiedades'	=> 'propiedades',
			'properties'	=> 'properties'
		];
	}//end defineRelationMap



	/**
	* GET_PREFIX_FROM_TIPO
	* @return string Like 'dd' or 'murapa'
	*/
	public static function get_prefix_from_tipo(string $tipo) : string {

		preg_match("/\D+/", $tipo, $output_array);
		if (empty($output_array[0])) {
			if(SHOW_DEBUG===true) {
				#throw new Exception("Error Processing Request from tipo:'$tipo' ", 1);
				#dump($tipo,"tipo received ");
				dump(debug_backtrace()[0]," debug_backtrace Invalid tipo received ". json_encode($tipo));
			}
			debug_log(__METHOD__." Error: Invalid tipo received. Impossible get_prefix_from_tipo this tipo :  ".to_string($tipo), logger::ERROR);
			return false;
		}

		return (string)$output_array[0];
	}//end get_prefix_from_tipo



	/**
	* PREFIX_COMPARE
	* Verify 2 received terms have the same prefix
	*/
	public static function prefix_compare(string $terminoID, string $terminoID2) : bool {

		$prefijo	= RecordObj_dd::get_prefix_from_tipo($terminoID);
		$prefijo2	= RecordObj_dd::get_prefix_from_tipo($terminoID2);
		if (empty($prefijo) || empty($prefijo2)) {
			trigger_error("Error: prefix_compare received empty term! I can't compare this case");
			if(SHOW_DEBUG===true) {
				throw new Exception("Error Processing Request", 1);
			}
			return false;
		}

		$result = ($prefijo===$prefijo2);

		return $result;
	}//end prefix_compare



	/**
	* GET_PROPIEDADES
	* Return the value of property 'properties', stored as plain text in table column 'properties'
	* Values expected in 'propiedades' are always JSON. Yo can obtain raw value (default) or JSON decoded (called with argument 'true')
	* @param bool $json_decode
	* @return mixed $propiedades
	*  object / string parent::$properties
	*/
	public function get_propiedades(bool $json_decode=false) {

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

	* @return object|array|null $properties_parsed
	*/
	public function get_properties() {

		$properties = parent::get_properties();
		if (is_null($properties) || $properties===false) {
			return null;
		}

		$properties_parsed = json_decode($properties);

		return $properties_parsed;
	}//end get_propiedades



	/**
	* SAVE_TERM_AND_DESCRIPTOR
	* Used to save elements in class hierarchy
	* @see class.hierarchy.php
	* @param string $descriptor_dato
	* @return string $terminoID
	*/
	public function save_term_and_descriptor(string $descriptor_dato=null) : ?string {

		if (empty($this->parent)) {
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Error on save 'RecordObj_dd_edit'. Parent is empty. Nothing is saved! ".to_string(), logger::DEBUG);
			}
			return null;
		}

		$terminoID = $this->terminoID;

		#
		# INSERT
		# TERMINO ID NOT CREATED : BUILD NEW AND INSERT
		# Creamos el terminoID a partir del prefijo y el contador contador para el prefijo actual
		$counter_dato   = self::get_counter_value($this->prefijo);
		#$terminoID		= (string)$this->prefijo . (int)($counter_dato+1);
			#dump($terminoID," terminoID - prefijo:$this->prefijo");die();

		# Set defaults
		if(empty($this->norden)) $this->set_norden(1);

		$result = parent::Save();
			#dump($result, ' result ++ counter_dato:'.to_string($counter_dato)); #die();

		#
		# DESCRIPTORS
		if ($result!==false) {

			$counter_dato_updated  = self::update_counter($this->prefijo, $counter_dato);

			#
			# DESCRIPTORS : finally we create one record in descriptors with this main info
			$lang = 'lg-spa';//DEDALO_DATA_LANG;
			$RecordObj_descriptors_dd = new RecordObj_descriptors_dd(RecordObj_descriptors_dd::$descriptors_matrix_table, NULL, $terminoID, $lang);
			$RecordObj_descriptors_dd->set_tipo('termino');
			$RecordObj_descriptors_dd->set_parent($terminoID);
			$RecordObj_descriptors_dd->set_lang($lang);
			$RecordObj_descriptors_dd->set_dato($descriptor_dato);
			$created_id_descriptors	= $RecordObj_descriptors_dd->Save();
		}

		return $terminoID;
	}//end Save



	/**
	* UPDATE_COUNTER
	* @param string $tld
	* @param int $current_value=false
	*
	* @return int|false $counter_dato_updated
	* Actualiza el contador para el tld dado (ej. 'dd').
	* El 'current_value' es opcional. Si no se recibe se calcula
	*/
	// protected static function update_counter(string $tld, int $current_value=null) : int { // removed by compatibility wit v5 ontology
	protected static function update_counter(string $tld, $current_value=null) {

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
	*
	* @return int $counter_value
	*/
	protected static function get_counter_value(string $tld) : int {

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
	* GET_DESCRIPTOR_DATO_BY_TIPO
	* Get termino dato by tipo ('termino','def','obs') static version
	* @param string $terminoID
	* @param string $lang = null
	* @param string $tipo
	* @param bool $fallback = false
	* @return string|null $dato
	*/
	public static function get_descriptor_dato_by_tipo(string $terminoID, string $lang=null, string $tipo, bool $fallback=false) : ?string {

		# Verify : En casos como por ejemplo, al resolver el modelo de un término relacionado que no tiene modelo asignado, el terminoID estará vacío.
		# Esto no es un error pero debemos evitar resolverlo.
		if(empty($terminoID)) {
			return null;
		}

		// static cache
			static $descriptor_dato_by_tipo_stat_data;
			$uid = $terminoID.'-'.$lang.'-'.$tipo.'-'.intval($fallback);
			if(isset($descriptor_dato_by_tipo_stat_data[$uid])) {
				return $descriptor_dato_by_tipo_stat_data[$uid];
			}

		// table matrix_descriptors search dato
			$RecordObj_descriptors_dd = new RecordObj_descriptors_dd(
				RecordObj_descriptors_dd::$descriptors_matrix_table, // string matrix table 'matrix_descriptors'
				null, // string id
				$terminoID, // string parent
				$lang, // string lang
				$tipo, // string tipo
				$fallback // bool fallback
			);
			$dato = (string)$RecordObj_descriptors_dd->get_dato();

		// static cache
			$descriptor_dato_by_tipo_stat_data[$uid] = $dato;


		return $dato;
	}//end get_descriptor_dato_by_tipo



	/**
	* GET_TERMINO_BY_TIPO
	* Static version
	* @param string $terminoID
	* @param string $lang = null
	* @param bool $from_cache = false
	* @param bool $fallback = true
	* @return string|null $result
	*/
	public static function get_termino_by_tipo(string $terminoID, string $lang=null, bool $from_cache=false, bool $fallback=true) : ?string {

		// cache
			static $termino_by_tipo_cache = [];
			$cache_uid = $terminoID . '_' . $lang . '_' . (int)$fallback;
			// if (isset($termino_by_tipo_cache[$cache_uid])) {
			if (array_key_exists($cache_uid, $termino_by_tipo_cache)) {
				return $termino_by_tipo_cache[$cache_uid];
			}

		// descriptor search
			$result	= self::get_descriptor_dato_by_tipo(
				$terminoID,
				$lang,
				'termino', // string typology
				$fallback
			);

		// cache
			$termino_by_tipo_cache[$cache_uid] = $result;


		return $result;
	}//end get_termino_by_tipo



	/**
	* GET_DEF_BY_TIPO
	* Static version
	*/
	public static function get_def_by_tipo(string $terminoID, $lang=false) : ?string {

		return self::get_descriptor_dato_by_tipo($terminoID, $lang, 'def');
	}//end get_def_by_tipo



	/**
	* GET_OBS_BY_TIPO
	* Static version
	*/
	public static function get_obs_by_tipo(string $terminoID, $lang=false) : ?string {

		return self::get_descriptor_dato_by_tipo($terminoID, $lang, 'obs');
	}//end get_obs_by_tipo



	/**
	* GET_MODELO_NAME
	* Alias of $this->get_termino_by_tipo($modelo_tipo)
	* @return string $model
	*/
	public function get_modelo_name() : string {

		// forced models in v6 (while we are using structure v5)
			if ($this->terminoID===DEDALO_SECURITY_ADMINISTRATOR_TIPO) {
				return 'component_radio_button';
			}elseif ($this->terminoID===DEDALO_USER_PROFILE_TIPO) {
				return 'component_select';
			}elseif ($this->terminoID==='dd546') { // activity where
				return 'component_input_text';
			}elseif ($this->terminoID==='dd545') { // activity what
				return 'component_select';
			}elseif ($this->terminoID==='dd544') { // activity ip
				return 'component_input_text';
			}elseif ($this->terminoID==='dd551') { // activity 'dato'
				return 'component_json';
			}elseif ($this->terminoID==='hierarchy48') { // hierarchy 'order'
				return 'component_number';
			}elseif ($this->terminoID==='dd1067') { // tools component_security_tools
				return 'component_check_box';
			}

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

		$model = $this->get_termino_by_tipo($modelo_tipo, 'lg-spa', true, false);

		// replace obsolete models on the fly
			if ($model==='component_input_text_large' || $model==='component_html_text') {
				$model='component_text_area';
			}
			elseif ($model==='component_autocomplete' || $model==='component_autocomplete_hi') {
				$model='component_portal';
			}
			elseif ($model==='component_state' || $model==='component_calculation') {
				$model='component_info';
			}
			elseif ($model==='section_group_div') {
				$model='section_group';
			}
			elseif ($model==='tab') {
				$model='section_tab';
			}
			elseif ($model==='component_relation_struct') {
				$model='component_relation_index';
			}
			elseif ($model==='component_security_tools') {
				$model='component_check_box';
			}
			elseif ($model==='dataframe') {
				$model='box elements';
			}

		return $model;
	}//end get_modelo_name



	/**
	* GET_MODELO_NAME_BY_TIPO
	* Static version
	* @param string $tipo
	* @param bool $from_cache = true
	* @return string $modelo_name
	*/
	public static function get_modelo_name_by_tipo(string $tipo, bool $from_cache=true) : string {

		static $modelo_name_by_tipo;

		// cache
		$cache_uid = $tipo;
		if (isset($modelo_name_by_tipo[$cache_uid])) {
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
	public static function get_legacy_model_name_by_tipo(string $tipo) : ?string {

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

		$model_name = $this->get_termino_by_tipo(
			$this->get_modelo() ?? '',
			'lg-spa',
			true,
			false
		);

		return $model_name;
	}//end get_legacy_model_name



	# GET LANG BY TIPO (STATIC)
	public static function get_lang_by_tipo(string $tipo, bool $from_cache=false) : string {

		$RecordObj_dd = new RecordObj_dd($tipo);
		$lang 		  = $RecordObj_dd->get_traducible()==='si' ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;

		return $lang;
	}//end get_lang_by_tipo



	/**
	*  GET AR TERMINO ID BY MODELO NAME (STATIC)
	* @return array $ar_result
	*/
	public static function get_ar_terminoID_by_modelo_name(string $modelo_name, string $prefijo='dd') : array {

		# STATIC CACHE
			static $ar_terminoID_by_modelo_name;
			$cache_uid = $modelo_name.'-'.$prefijo;
			if(isset($ar_terminoID_by_modelo_name[$cache_uid])) {
				return $ar_terminoID_by_modelo_name[$cache_uid];
			}

		$ar_result = [];

		# 1 Despejamos el terminoID del modelo (ejemplo : 'area_root') que es el parent en matrix_descriptors
			$arguments=array();
				$arguments['strPrimaryKeyName']	= 'parent';
				$arguments['dato']				= (string)$modelo_name;
				$arguments['tipo']				= 'termino';
				$arguments['lang']				= DEDALO_STRUCTURE_LANG;
			$matrix_table					= RecordObj_descriptors_dd::$descriptors_matrix_table;			# 'matrix_descriptors_'.$prefijo;#
			// $RecordObj_descriptors_dd	= new RecordObj_descriptors_dd($matrix_table, NULL, $prefijo);	# dump($arguments,"$modelo_name -$matrix_table");
			$RecordObj_descriptors_dd		= new RecordObj_descriptors_dd($matrix_table);
			$ar_result_descriptors			= $RecordObj_descriptors_dd->search($arguments);				# dump($ar_result_descriptors,'modelo_terminoID',"terminoID_by_modelo_name de: $modelo_name");

		/**
		* ARREGLO 2-2-2013
		*/
		# Recorremos los resultados para verificar que son modelo
		# Así obtenemos exclusivamente los téminos que SI son modelo
		if (!empty($ar_result_descriptors)) {

			// filter only models (expected one)
				$ar_modelo_terminoID = array();
				foreach ($ar_result_descriptors as $terminoID) {

					$RecordObj_dd	= new RecordObj_dd($terminoID);
					$esmodelo		= $RecordObj_dd->get_esmodelo($arguments);
					# Excluimos a los propios modelos del array
					if ($esmodelo==='si') {
						# Verfificado
						$ar_modelo_terminoID[] = $terminoID;
					}
				}
				if (count($ar_modelo_terminoID)>1) {
					throw new Exception("Error Processing Request. Bad configuration. More than one moel found: " .count($ar_modelo_terminoID), 1);
				}

			if (!empty($ar_modelo_terminoID)) {

				// get structure terms with current tipo as model
					$model_tipo = $ar_modelo_terminoID[0];

					$arguments = [
						'strPrimaryKeyName'	=> 'terminoID', // return column 'terminoID'
						'modelo'			=> $model_tipo  // search equal in column 'modelo'
					];

					// $RecordObj_dd	= new RecordObj_dd(NULL,$prefijo);
					$RecordObj_dd		= new RecordObj_dd($model_tipo, null);
					$ar_result			= $RecordObj_dd->search($arguments);
			}
		}

		# STATIC CACHE
		$ar_terminoID_by_modelo_name[$cache_uid] = $ar_result;


		return $ar_result;
	}//end get_ar_terminoID_by_modelo_name



	# MODELOS ARRAY
	# Se usa en  el selector de tesauro edit para asignar modelo
	public function get_ar_all_modelos() : array {

		# STATIC CACHE
		static $ar_all_modelos_data;
		if(isset($this->terminoID) && isset($ar_all_modelos_data[$this->terminoID])) return $ar_all_modelos_data[$this->terminoID];

		$ar_all_modelos = [];

		# SEARCH
		$arguments=array();
		$arguments['esmodelo']	= 'si';
		$RecordObj_dd			= new RecordObj_dd(NULL,$this->prefijo);
		$ar_id					= (array)$RecordObj_dd->search($arguments);

		foreach($ar_id as $terminoID) {
			$ar_all_modelos[] = $terminoID ;
		}

		# STORE CACHE DATA
		$ar_all_modelos_data[$this->terminoID]	= $ar_all_modelos;

		return $ar_all_modelos ;
	}//end get_ar_all_modelos



	/**
	* GET_AR_ALL_TERMINOID_OF_MODELO_TIPO
	*/
	public static function get_ar_all_terminoID_of_modelo_tipo(string $modelo_tipo, bool $use_cache=true) : array {

		# SEARCH
		$arguments=array();
		$arguments['modelo']	= $modelo_tipo;
		$RecordObj_dd			= new RecordObj_dd(NULL,'dd');
			$RecordObj_dd->use_cache = $use_cache;
		$ar_id					= (array)$RecordObj_dd->search($arguments);

		$ar_all_terminoID=array();
		foreach($ar_id as $terminoID) {
			$ar_all_terminoID[] = $terminoID ;
		}

		return $ar_all_terminoID;
	}//end get_ar_all_terminoID_of_modelo_tipo



	/**
	* GET_AR_CHILDRENS_OF_THIS
	* Get array of terms (terminoID) with parent = $this->terminoID
	* @param string|null $esdescriptor
	* @param string|null $esmodelo
	* @param string|null $order_by

	* @return array $ar_childrens_of_this
	*/
	public function get_ar_childrens_of_this($esdescriptor='si', string $esmodelo=null, $order_by='norden', bool $use_cache=true) : array {

		# COMPROBACIÓN
		if(empty($this->terminoID))	{
			return [];
		}
		#if(empty($this->prefijo)) 	return false;

		# STATIC CACHE
		static $ar_childrens_of_this_stat_data;
		$key = $this->terminoID.'_'.$esdescriptor.'_'.$esmodelo.'_'.$order_by;
		if(isset($ar_childrens_of_this_stat_data[$key]) && $use_cache===true) {
			#error_log("Returned from cache get_ar_childrens_of_this - $key");
			return $ar_childrens_of_this_stat_data[$key];
		}

		# SEARCH
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'terminoID';
		$arguments['parent']			= $this->terminoID;

		if( !empty($esdescriptor) && ($esdescriptor==='si' || $esdescriptor==='no') )
			$arguments['esdescriptor']	= $esdescriptor;

		if( !empty($esmodelo) && ($esmodelo==='si' || $esmodelo==='no') )
			$arguments['esmodelo']		= $esmodelo;

		if (!empty($order_by)) {
			$arguments['order_by_asc']	= $order_by;
		}

		$this->use_cache = $use_cache;

		$ar_childrens_of_this = (array)$this->search($arguments);
		if(SHOW_DEBUG===true) {
			#dump($ar_childrens_of_this," arguments:".print_r($arguments,true));
		}

		# STORE CACHE DATA
		$ar_childrens_of_this_stat_data[$key] = $ar_childrens_of_this;


		return $ar_childrens_of_this;
	}//end get_ar_childrens_of_this



	/**
	* GET_AR_CHILDRENS
	*/
	public static function get_ar_childrens(string $tipo, string $order_by='norden') : array {

		# STATIC CACHE
		static $get_ar_childrens_data;
		$key = $tipo.'_'.$order_by;
		if(isset($get_ar_childrens_data[$key])) {
			if(SHOW_DEBUG===true) {
				#error_log("Returned cache value for get_ar_childrens $key");
			}
			return $get_ar_childrens_data[$key];
		}

		$ar_childrens = array();

		# SEARCH
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'terminoID';
		$arguments['parent']			= $tipo;
		if(!empty($order_by))
		$arguments['order_by_asc']		= $order_by;
		$RecordObj_dd					= new RecordObj_dd($tipo);
		$ar_childrens					= $RecordObj_dd->search($arguments);
			#dump($arguments,"get_ar_childrens $tipo");

		# STORE CACHE DATA
		$get_ar_childrens_data[$key] = $ar_childrens;

		return $ar_childrens ;
	}//end get_ar_childrens



	# CHILDRENS RECURSIVE ARRAY
	# SACA TODOS LOS HIJOS DEL TERMINO ACTUAL RECURSIVAMENTE
	public function get_ar_recursive_childrens_of_this( string $terminoID, int $is_recursion=0 ) : array {

		# IMPORTANTE: NO HACER CACHE DE ESTE MÉTODO (AFECTA A COMPONENT_FILTER_MASTER)

		# creamos una instancia independiente de RecordObj_dd y sacamos los hijos directos
		// $ar_childrens_of_this	= array();	# reset value every cycle
		$RecordObj_dd				= new RecordObj_dd($terminoID);
		$ar_childrens_of_this		= (array)$RecordObj_dd->get_ar_childrens_of_this(
			null, // esdescriptor
			null, // esmodelo
			null // order_by
		);	# $esdescriptor='si', $esmodelo=NULL, $order_by='norden'
		$ar_childrens_of_this_size	= sizeof($ar_childrens_of_this);

		// foreach($ar_childrens_of_this as $children_terminoID) {
		for ($i=0; $i < $ar_childrens_of_this_size; $i++) {

			$children_terminoID = $ar_childrens_of_this[$i];

			# Add current element
			$this->ar_recursive_childrens_of_this[] = $children_terminoID;

			# Recursion
			$this->get_ar_recursive_childrens_of_this($children_terminoID,1);
		}

		if(isset($this->ar_recursive_childrens_of_this)) {
			return $this->ar_recursive_childrens_of_this;
		}

		return [];
	}//end get_ar_recursive_childrens_of_this



	/**
	* GET_AR_RECURSIVE_CHILDRENS : Static version
	* No hay aumento de velocidad apreciable entre la versión estática y dinámica. Sólo una reducción de unos 140 KB en el consumo de memoria
	*/
	public static function get_ar_recursive_childrens(string $terminoID, bool $is_recursion=false, array $ar_exclude_models=null, string $order_by=null, bool $use_cache=true) : array {

		$ar_resolved=array();

		if($is_recursion===true) {
			#array_push($ar_resolved, $terminoID);
			$ar_resolved[] = $terminoID;
		}

		$RecordObj_dd		= new RecordObj_dd($terminoID);
		$ar_childrens		= (array)$RecordObj_dd->get_ar_childrens_of_this(
			'si', // string esdescriptor
			null, // string esmodelo
			$order_by, // string order_by
			$use_cache
		);
		$ar_childrens_size	= sizeof($ar_childrens);

		// foreach($ar_childrens as $current_terminoID) {
		for ($i=0; $i < $ar_childrens_size; $i++) {

			$current_terminoID = $ar_childrens[$i];

			# Exclude models optional
			if (!empty($ar_exclude_models)) {
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_terminoID, true);
				if (in_array($modelo_name, $ar_exclude_models)) {
					#debug_log(__METHOD__." Skiped model '$modelo_name' ".to_string($current_terminoID), logger::DEBUG);
					continue;	// Skip current modelo and children
				}
			}

			# Recursion
			$ar_resolved = array_merge(
				$ar_resolved,
				RecordObj_dd::get_ar_recursive_childrens($current_terminoID, true, $ar_exclude_models, $order_by, $use_cache)
			);
		}

		return $ar_resolved;
	}//end get_ar_recursive_childrens



	/**
	* GET_AR_RECURSIVE_CHILDRENS : Static version
	* No hay aumento de velocidad apreciable entre la versión estática y dinámica. Sólo una reducción de unos 140 KB en el consumo de memoria
	*/
	public static function get_ar_recursive_childrens_with_exclude(string $terminoID, bool $is_recursion=false, array $ar_exclude=array()) : array {

		$ar_resolved = [];
		/*
		static $ar_resolved;
		if (!isset($ar_resolved)) {
			$ar_resolved=array();
		}
		*/

		if($is_recursion===true) {
			#array_push($ar_resolved, $terminoID);
			$ar_resolved[] = $terminoID;
		}

		#$ar_childrens  = (array)RecordObj_dd::get_ar_childrens($terminoID);
		$RecordObj_dd 	= new RecordObj_dd($terminoID);
		$ar_childrens 	= (array)$RecordObj_dd->get_ar_childrens_of_this('si', null, null);

		foreach($ar_childrens as $current_terminoID) {

			if (in_array($current_terminoID, $ar_exclude)) {
				continue; # Skip this term and children
			}

			# Recursion
			$ar_resolved = array_merge( $ar_resolved, (array)RecordObj_dd::get_ar_recursive_childrens( $current_terminoID, true ) );
		}

		return $ar_resolved;
	}//end get_ar_recursive_childrens_with_exclude



	# GET PARENTS ARRAY
	public function get_ar_parents_of_this(bool $ksort=true) : array {

		# STATIC CACHE
		static $ar_parents_of_this_data;
		if(isset($this->terminoID) && isset($ar_parents_of_this_data[$this->terminoID])) {
			return $ar_parents_of_this_data[$this->terminoID];
		}

		$ar_parents_of_this = array();
		$parent				= $this->get_parent();
		if(empty($parent)) {
			return $ar_parents_of_this;
		}
		$parent_inicial		= $parent;
		$parent_zero		= 'dd0';

		do {
			if( strpos($parent, $parent_zero)===false  ) { // $parent != $parent_zero
				$ar_parents_of_this[] = $parent;
			}

			$RecordObj_dd	= new RecordObj_dd($parent);
			$parent			= $RecordObj_dd->get_parent();

		} while ( !empty($parent) && ($parent !== $parent_zero) && $parent !== $parent_inicial );


		# ordenamos a la inversa los padres
		if($ksort===true) krsort($ar_parents_of_this);

		# STORE CACHE DATA
		$ar_parents_of_this_data[$this->terminoID] = $ar_parents_of_this;

		return $ar_parents_of_this ;
	}//end get_ar_parents_of_this



	# GET SIBLINGS ARRAY [HERMANOS]
	public function get_ar_siblings_of_this() : array {

		# STATIC CACHE
		static $ar_siblings_of_this_data;
		if(isset($this->terminoID) && isset($ar_siblings_of_this_data[$this->terminoID])) {
			return $ar_siblings_of_this_data[$this->terminoID];
		}

		$ar_siblings_of_this = array();

		$arguments["parent"]		= $this->get_parent();
		$arguments["esdescriptor"]	= 'si';
		$ar_id						= $this->search($arguments);

		foreach($ar_id as $id) {
			$ar_siblings_of_this[]	= $this->get_prefijo() . $id;
		}

		# STORE CACHE DATA
		$ar_siblings_of_this_data[$this->terminoID] = $ar_siblings_of_this;

		return $ar_siblings_of_this;
	}//end get_ar_siblings_of_this



	# NUMERO DE HIJOS DESCRIPTORES
	public function get_n_hijos_descriptores() : int {

		# STATIC CACHE
		static $get_n_hijos_descriptores_data;
		if(isset($this->terminoID) && isset($get_n_hijos_descriptores_data[$this->terminoID])) {
			return $get_n_hijos_descriptores_data[$this->terminoID];
		}

		$arguments["parent"]		= $this->terminoID;
		$arguments["esdescriptor"]	= 'si';
		$ar_id						= $this->search($arguments);

		$n_hijos_descriptores		= count($ar_id);		#echo $n_hijos_descriptores ."<hr>";

		# STORE CACHE DATA
		$get_n_hijos_descriptores_data[$this->terminoID] = $n_hijos_descriptores;

		return (int)$n_hijos_descriptores;
	}

	# NUMERO DE HIJOS
	public function get_n_hijos() : int {

		# STATIC CACHE
		static $get_n_hijos_data;
		if(isset($this->terminoID) && isset($get_n_hijos_data[$this->terminoID])) return $get_n_hijos_data[$this->terminoID];

		$arguments["parent"]	= $this->terminoID;
		$ar_id					= $this->search($arguments);

		$n_hijos = count($ar_id);

		# STORE CACHE DATA
		$get_n_hijos_data[$this->terminoID] = $n_hijos;

		return (int)$n_hijos;
	}//end get_n_hijos



	# GET RELACIONES AS ARRAY (FROM JSON)
	# Devuelve array en formato:
	#	[0] => Array
	#    (
	#       [dd9] => dd296
	#   )
	public function get_relaciones($mode=false) : ?array {

		$dato = parent::get_relaciones();

		$relaciones = !empty($dato)
			? json_decode($dato, true)
			: null;

		return $relaciones;
	}//end get_relaciones



	/**
	* SET_RELACIONES
	* Set relaciones as JSON (MODELO: $ar_relaciones[$terminoID_source][] = array($modelo => $terminoID_rel))
	* @param mixed $ar_relaciones
	* 	Could array, string, null
	*/
	public function set_relaciones( ?array $ar_relaciones) {

		return parent::set_relaciones(json_encode($ar_relaciones));
	}//end set_relaciones



	/**
	* REMOVE_ELEMENT_FROM_AR_TERMINOS_RELACIONADOS
	* @param string $terminoID_to_unlink
	* @return bool
	*/
	public function remove_element_from_ar_terminos_relacionados(string $terminoID_to_unlink) : bool {

		# Recorremos los elementos en terminos relacionados para este objeto
		$ar_relaciones = $this->get_relaciones();

		# eliminamos del array el valor recibido
		$ar_final = null;
		if(is_array($ar_relaciones)) foreach($ar_relaciones as $key => $ar_values) {

			foreach($ar_values as $modeloID => $terminoID) {

				if($terminoID != $terminoID_to_unlink) {
					$ar_final[] = array($modeloID => $terminoID);
				}
			}
		}

		# guardamos el resultado
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
	* En modo 'simple' devuelve sólo un array de 'terminoID'
	*/
	public static function get_ar_terminos_relacionados(string $terminoID, bool $cache=false, bool $simple=false) : array {

		#if(SHOW_DEBUG===true) $start_time = start_time();
		# NO HACER CACHE EN ESTE MÉTODO

		# STATIC CACHE
		#static $ar_terminos_relacionados_data;

		#$uid = $terminoID .'_'. (int)$simple;
		#if (isset($ar_terminos_relacionados_data[$uid])) {
		#	#debug_log(__METHOD__." get_ar_terminos_relacionados ".to_string($terminoID), logger::DEBUG);
		#	return $ar_terminos_relacionados_data[$uid];
		#}

		$ar_terminos_relacionados 	= array();

		$RecordObj_dd				= new RecordObj_dd($terminoID);
		$ar_relaciones				= $RecordObj_dd->get_relaciones();

		# SIMPLE . SOLO DEVUELVE EL ARRAY LIMPIO CON EL LISTADO DE terminoID
		if($simple===true) {

			if(is_array($ar_relaciones)) foreach($ar_relaciones as $key => $ar_value) {

				foreach($ar_value as $modeloID => $terminoID) {
					$ar_terminos_relacionados[]	= $terminoID;
				}
			}
			$ar_relaciones = $ar_terminos_relacionados;
		}
		#$ar_terminos_relacionados_data[$uid] = $ar_relaciones;


		return (array)$ar_relaciones;
	}//end get_ar_terminos_relacionados



	/**
	* GET_AR_RECURSIVE_CHILDRENS_OF_THIS_STATIC
	*  DESACTIVA PORQUE NO SE EXPERIMENTA INCREMENTO DE VELOCIDAD...
	*/
		// public static function get_ar_recursive_childrens_of_this_static($terminoID) {

		// 	#static $ar_recursive_childrens_of_this_static;
		// 	#if(isset($ar_recursive_childrens_of_this_static[$terminoID])) return $ar_recursive_childrens_of_this_static ;

		// 	$RecordObj_dd 					= new RecordObj_dd($terminoID);
		// 	$ar_recursive_childrens_of_this = $RecordObj_dd->get_ar_recursive_childrens_of_this($terminoID);

		// 	# Store in cache
		// 	#$ar_recursive_childrens_of_this_static = $ar_recursive_childrens_of_this;

		// 	return $ar_recursive_childrens_of_this;
		// }



	/**
	* GET_AR_TERMINOID_BY_MODELO_NAME_AND_RELATION
	* Devuelve el terminoID del termino relacionado (especificar relacion) de modelo name dado
	* ej. para saber los términos relacionados de modelo 'filter'
	* @param string $tipo like 'dd20'
	* @param string $modelo_name like 'component_input_text'
	* @param string $relation_type like 'termino_relacionado'
	* @return array $result
	*/
	public static function get_ar_terminoID_by_modelo_name_and_relation(string $tipo, string $modelo_name, string $relation_type, bool $search_exact=false) : array {

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

					$current_modelo_name = $RecordObj_dd->get_termino_by_tipo($modelo);

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
				$ar_childrens	= $RecordObj_dd->get_ar_recursive_childrens_of_this($tipo);		#dump($ar_childrens);

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

					$current_modelo_name = $RecordObj_dd->get_termino_by_tipo($modelo);

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

					$current_modelo_name = $RecordObj_dd->get_termino_by_tipo($modelo);

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

					$current_modelo_name = $RecordObj_dd->get_termino_by_tipo($modelo);		#dump($modelo_name);

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
	* @param string $tipo
	* @return bool
	*/
	public static function get_translatable(string $tipo) : bool {

		$RecordObj_dd	= new RecordObj_dd($tipo);
		$translatable	= $RecordObj_dd->get_traducible();

		return ($translatable==='si');
	}//end get_translatable



	/**
	* GET_COLOR
	* get the color define in properties
	* if it's not defined return default gray
	* @param string $section_tiop
	* @return string $color #ddddd
	*/
	public static function get_color($section_tipo) {

		$RecordObj_dd	= new RecordObj_dd($section_tipo);
		$properties		= $RecordObj_dd->get_properties();

		$color = isset($properties->color)
			? $properties->color
			: '#b9b9b9'; // default gray

		return $color;
	}//end get_color



}//end class RecordObj_dd
